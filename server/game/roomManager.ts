import { WebSocket } from 'ws';
import { 
  ClientRoomState, 
  GamePhase, 
  NightActions, 
  Player, 
  PublicRoomSummary, 
  RoomSettings, 
  RoomState, 
  ChatMessage,
  Team,
  RoleId,
  Spectator
} from '../../src/types/mafia';
import { MafiaEngine } from './engine';
import { userDb } from '../db/users';
import { getDatabase } from '../db/database';
import { eventsDb } from '../db/events';

const BOT_NAMES = [
  'Виктор "Шрам"',
  'Дмитрий "Нож"',
  'Елена "Лиса"',
  'Михаил "Адвокат"',
  'Анна "Вдова"',
  'Сергей "Следователь"',
  'Ольга "Баронесса"',
  'Николай "Медведь"',
  'Ксения "Птица"',
  'Роман "Туз"'
];

const BOT_DAY_PHRASES = [
  'Мне кажется, мы слишком быстро кого-то обвиняем.',
  'Я честный гражданин! Давайте внимательно послушаем аргументы.',
  'Что-то мне не нравится поведение предыдущего оратора.',
  'Если мы сейчас ошибемся, мафия получит перевес!',
  'Обратите внимание на то, кто голосовал в прошлый раз.',
  'Я мирный житель и готов голосовать за реальные улики.',
  'Давайте проверим того, кто больше всех молчит.',
  'Не поддавайтесь провокациям, думайте логически!'
];

export class Room {
  public state: RoomState;
  public sockets: Map<string, WebSocket> = new Map(); // playerId / spectatorId -> WebSocket
  public spectators: Map<string, Spectator> = new Map(); // spectatorId -> Spectator
  private timerInterval: NodeJS.Timeout | null = null;
  private nightActions: NightActions = { mafiaVotes: {} };
  private botActionTimeouts: NodeJS.Timeout[] = [];
  public messages: ChatMessage[] = [];

  // Speech and flow queues
  private speechSpeakerQueue: string[] = [];
  private defenseSpeakerQueue: string[] = [];
  private lastWordsQueue: string[] = [];

  // In-session player Experience (XP) tracking
  public playerSessionXp: Map<string, { totalXp: number; awards: Array<{ reason: string; xp: number; timestamp: number }> }> = new Map();
  public gameOverRewards: Map<string, { xpEarned: number; totalXp: number; oldLevel: number; newLevel: number; leveledUp: boolean; awards: Array<{ reason: string; xp: number }> }> = new Map();

  public awardPlayerXp(playerId: string, xp: number, reason: string) {
    if (!playerId) return;
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || player.isBot) return;

    let session = this.playerSessionXp.get(playerId);
    if (!session) {
      session = { totalXp: 0, awards: [] };
      this.playerSessionXp.set(playerId, session);
    }

    session.totalXp += xp;
    session.awards.push({
      reason,
      xp,
      timestamp: Date.now()
    });

    // Notify the player immediately via WebSocket
    const ws = this.sockets.get(playerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'XP_EARNED',
        payload: {
          xp,
          reason,
          sessionTotal: session.totalXp
        }
      }));
    }
  }

  constructor(roomCode: string, roomName: string, hostId: string, hostName: string, settings?: Partial<RoomSettings>) {
    const defaultSettings: RoomSettings = {
      gameMode: 'classic',
      maxPlayers: 10,
      generalDiscussionDuration: 60, // 0 to 120s step 15
      individualSpeechDuration: 45,  // 15, 30, 45, 60s
      nightDurationSeconds: 30,      // 15, 30, 45, 60s
      votingDurationSeconds: 30,
      firstDayVoting: true,          // Toggle for voting on first day
      enabledRoles: {
        don: true,
        sheriff: true,
        doctor: true,
        courtesan: true,
        maniac: false,
        bodyguard: false
      },
      allowSelfHealOnce: true,
      anonymousVoting: false,
      isPublic: true
    };

    this.state = {
      roomCode,
      roomName: roomName || `Комната #${roomCode}`,
      hostId,
      phase: 'LOBBY',
      phaseTimeRemaining: 0,
      dayNumber: 0,
      players: [
        {
          id: hostId,
          name: hostName,
          avatarSeed: hostName,
          isHost: true,
          isBot: false,
          isAlive: true,
          connected: true,
          ready: true,
          warningsCount: 0
        }
      ],
      spectators: [],
      spectatorCount: 0,
      settings: { ...defaultSettings, ...settings },
      nominatedPlayerIds: [],
      currentSpeakerId: null,
      defenseCandidates: [],
      tieVotersExcluded: [],
      phaseSkipVotedIds: [],
      lastWordsQueue: [],
      playerOnDefenseId: null,
      lastNightResult: undefined,
      lastEliminatedPlayer: null,
      votesCastCount: 0,
      totalEligibleVoters: 0,
      currentSpeakerHasNominated: false,
      nightActionsCompleted: [],
      gameLogs: [`Комната ${roomCode} создана ведущим ${hostName}.`]
    };

    this.startHeartbeatTimer();
  }

  private startHeartbeatTimer() {
    this.timerInterval = setInterval(() => {
      this.tick();
    }, 1000);
  }

  public destroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.botActionTimeouts.forEach(t => clearTimeout(t));
    this.botActionTimeouts = [];
  }

  private tick() {
    if (this.state.phase === 'LOBBY' || this.state.phase === 'GAME_OVER') {
      return;
    }

    if (this.state.phaseTimeRemaining > 0) {
      this.state.phaseTimeRemaining--;
      this.broadcastState();
      return;
    }

    // Time is up, advance phase
    this.advancePhase();
  }

  public advancePhase() {
    this.botActionTimeouts.forEach(t => clearTimeout(t));
    this.botActionTimeouts = [];

    switch (this.state.phase) {
      case 'ROLE_REVEAL':
        if (this.state.settings.gameMode === 'sport') {
          // Zero minute (Знакомство мафии - 60 секунд)
          this.state.phase = 'MAFIA_MEETING';
          this.state.phaseTimeRemaining = 60;
          this.addLog('🌙 Ночная нулевая минута (Знакомство мафии). Преступный синдикат вырабатывает стратегию.');
          this.addChatMessage('system', '🌙 Ночная нулевая минута: город спит, мафия знакомится в секретном чате.', 'system');
        } else {
          this.startDay(1);
        }
        break;

      case 'MAFIA_MEETING':
        this.startDay(1);
        break;

      case 'DAY_DISCUSSION':
        // General discussion concluded -> transition to individual speeches
        this.startIndividualSpeeches();
        break;

      case 'INDIVIDUAL_SPEECHES':
        // Current speaker's time expired -> move to next speaker or voting
        this.nextIndividualSpeech();
        break;

      case 'VOTING':
        this.resolveDayVoting();
        break;

      case 'DEFENSE_SPEECH':
        this.nextDefenseSpeech();
        break;

      case 'REVOTE':
        this.resolveRevote();
        break;

      case 'LAST_WORDS_ARREST':
        this.resolveLastWordsArrest();
        break;

      case 'NIGHT':
        this.resolveNightPhase();
        break;

      case 'MORNING_REPORT':
        this.resolveMorningReport();
        break;

      case 'LAST_WORDS_KILLED':
        this.nextLastWordsKilled();
        break;
    }

    this.broadcastState();
  }

  // DAY PHASES LOGIC
  private startDay(dayNum: number) {
    this.state.dayNumber = dayNum;
    this.state.nominatedPlayerIds = [];
    this.state.phaseSkipVotedIds = [];
    this.state.defenseCandidates = [];
    this.state.tieVotersExcluded = [];
    this.state.currentSpeakerId = null;
    this.state.currentSpeakerHasNominated = false;
    this.state.votesCastCount = 0;
    this.state.totalEligibleVoters = 0;
    this.state.nightActionsCompleted = [];
    this.state.players.forEach(p => {
      p.votedFor = null;
      p.nominatedBy = null;
    });

    // Award daily survival XP to all currently alive human players
    if (dayNum > 1) {
      this.state.players.forEach(p => {
        if (!p.isBot && p.isAlive) {
          this.awardPlayerXp(p.id, 15, `Пережили день ${dayNum - 1}`);
        }
      });
    }

    if (this.state.settings.generalDiscussionDuration > 0) {
      this.state.phase = 'DAY_DISCUSSION';
      this.state.phaseTimeRemaining = this.state.settings.generalDiscussionDuration;
      this.addLog(`☀️ День ${dayNum}. Общее собрание горожан (${this.state.settings.generalDiscussionDuration}с).`);
      this.triggerBotChat();
    } else {
      // General discussion disabled (0s) -> proceed directly to individual speeches
      this.startIndividualSpeeches();
    }
  }

  private startIndividualSpeeches() {
    const alivePlayers = this.state.players.filter(p => p.isAlive);
    if (alivePlayers.length === 0) {
      this.startNightPhase();
      return;
    }

    // Sort alive players by their original slot index in room
    const sortedAlive = [...alivePlayers].sort((a, b) => {
      return this.state.players.indexOf(a) - this.state.players.indexOf(b);
    });

    // In Mafia, on Day 1 start with player 1, on subsequent days rotate starting speaker
    const startIndex = (this.state.dayNumber - 1) % sortedAlive.length;
    const rotated = [
      ...sortedAlive.slice(startIndex),
      ...sortedAlive.slice(0, startIndex)
    ];

    this.speechSpeakerQueue = rotated.map(p => p.id);
    this.nextIndividualSpeech();
  }

  private nextIndividualSpeech() {
    if (this.speechSpeakerQueue.length === 0) {
      // All individual speeches finished
      this.state.currentSpeakerId = null;

      // Check if candidates were nominated
      if (this.state.nominatedPlayerIds.length === 0) {
        this.addLog('⚖️ За раунд никто не был выставлен на голосование. Город засыпает без суда.');
        this.startNightPhase();
      } else {
        this.startVotingPhase();
      }
      return;
    }

    const nextSpeakerId = this.speechSpeakerQueue.shift()!;
    this.state.currentSpeakerId = nextSpeakerId;
    this.state.currentSpeakerHasNominated = false;
    this.state.phase = 'INDIVIDUAL_SPEECHES';
    this.state.phaseTimeRemaining = this.state.settings.individualSpeechDuration || 45;

    const speaker = this.state.players.find(p => p.id === nextSpeakerId);
    const slotNum = this.state.players.findIndex(p => p.id === nextSpeakerId) + 1;
    this.addLog(`🎙️ Слово предоставляется игроку ${speaker?.name || 'Горожанин'} (Слот #${slotNum}).`);

    if (speaker?.isBot) {
      this.triggerBotSpeech(nextSpeakerId);
    }
  }

  private startVotingPhase() {
    this.state.phase = 'VOTING';
    this.state.phaseTimeRemaining = this.state.settings.votingDurationSeconds || 30;
    this.state.currentSpeakerId = null;
    this.state.phaseSkipVotedIds = [];
    this.state.players.forEach(p => p.votedFor = null);
    this.state.votesCastCount = 0;
    this.state.totalEligibleVoters = this.state.players.filter(p => p.isAlive).length;

    this.addLog(`🗳️ Голосование среди кандидатов: ${this.getNominatedNames().join(', ')}.`);
    this.triggerBotVoting();
  }

  private resolveDayVoting() {
    // Tally votes for nominated players
    const voteCounts: Record<string, number> = {};
    const alivePlayers = this.state.players.filter(p => p.isAlive);

    alivePlayers.forEach(p => {
      if (p.votedFor && p.votedFor !== 'skip' && this.state.nominatedPlayerIds.includes(p.votedFor)) {
        voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
      }
    });

    let maxVotes = 0;
    for (const count of Object.values(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
      }
    }

    if (maxVotes === 0) {
      this.addLog('⚖️ Ни один из кандидатов не получил голосов против. Никто не арестован.');
      this.startNightPhase();
      return;
    }

    const candidatesWithMax = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);

    if (candidatesWithMax.length === 1) {
      // Clear winner of vote -> arrest
      this.startLastWordsArrest(candidatesWithMax[0]);
    } else {
      // Tie! (Ничья)
      this.state.defenseCandidates = [...candidatesWithMax];
      this.defenseSpeakerQueue = [...candidatesWithMax];
      const names = candidatesWithMax.map(id => this.getPlayerName(id)).join(', ');
      this.addLog(`⚖️ Ничья между кандидатами (${names}) по ${maxVotes} голосов! Предоставляются оправдательные речи.`);
      this.nextDefenseSpeech();
    }
  }

  private nextDefenseSpeech() {
    if (this.defenseSpeakerQueue.length === 0) {
      // All defense speeches finished -> revote!
      this.startRevotePhase();
      return;
    }

    const speakerId = this.defenseSpeakerQueue.shift()!;
    this.state.currentSpeakerId = speakerId;
    this.state.phase = 'DEFENSE_SPEECH';
    this.state.phaseTimeRemaining = this.state.settings.individualSpeechDuration || 45;

    const speaker = this.state.players.find(p => p.id === speakerId);
    this.addLog(`🛡️ Оправдательная речь кандидата ${speaker?.name || 'Горожанин'}.`);

    if (speaker?.isBot) {
      this.triggerBotDefenseSpeech(speakerId);
    }
  }

  private startRevotePhase() {
    this.state.phase = 'REVOTE';
    this.state.phaseTimeRemaining = this.state.settings.votingDurationSeconds || 30;
    this.state.currentSpeakerId = null;
    this.state.players.forEach(p => p.votedFor = null);
    this.state.votesCastCount = 0;

    // Tie voting rule:
    // "Если ничья была ровно между двумя игроками, они не имеют права голосовать на переголосовании. Если между тремя и более — они имеют право голосовать."
    if (this.state.defenseCandidates && this.state.defenseCandidates.length === 2) {
      this.state.tieVotersExcluded = [...this.state.defenseCandidates];
      const excludedNames = this.state.tieVotersExcluded.map(id => this.getPlayerName(id)).join(' и ');
      this.addLog(`⚖️ Повторное голосование. Кандидаты ${excludedNames} лишены права голоса.`);
    } else {
      this.state.tieVotersExcluded = [];
      this.addLog(`⚖️ Повторное голосование между кандидатами: ${(this.state.defenseCandidates || []).map(id => this.getPlayerName(id)).join(', ')}.`);
    }

    this.state.totalEligibleVoters = this.state.players.filter(p => p.isAlive && !(this.state.tieVotersExcluded || []).includes(p.id)).length;

    this.triggerBotRevoting();
  }

  private resolveRevote() {
    const voteCounts: Record<string, number> = {};
    const eligibleVoters = this.state.players.filter(p => p.isAlive && !(this.state.tieVotersExcluded || []).includes(p.id));

    eligibleVoters.forEach(p => {
      if (p.votedFor && p.votedFor !== 'skip' && (this.state.defenseCandidates || []).includes(p.votedFor)) {
        voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
      }
    });

    let maxVotes = 0;
    for (const count of Object.values(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
      }
    }

    if (maxVotes === 0) {
      this.addLog('⚖️ На повторном голосовании голосов не подано. Город засыпает.');
      this.startNightPhase();
      return;
    }

    const candidatesWithMax = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);

    if (candidatesWithMax.length === 1) {
      this.startLastWordsArrest(candidatesWithMax[0]);
    } else {
      // Still a tie! Nobody is eliminated
      this.addLog('⚖️ На повторном голосовании снова ничья! Город не смог прийти к согласию — никто не казнён.');
      // Award XP for successful defense at trial
      (this.state.defenseCandidates || []).forEach(candidateId => {
        this.awardPlayerXp(candidateId, 25, 'Оправдание на суде');
      });
      this.startNightPhase();
    }
  }

  private startLastWordsArrest(candidateId: string) {
    this.state.phase = 'LAST_WORDS_ARREST';
    this.state.currentSpeakerId = candidateId;
    this.state.phaseTimeRemaining = this.state.settings.individualSpeechDuration || 45;

    const player = this.state.players.find(p => p.id === candidateId);
    this.addLog(`🚨 Суд признал виновным игрока ${player?.name || 'Горожанин'}. Последнее слово арестованного.`);

    if (player?.isBot) {
      this.triggerBotLastWords(candidateId);
    }
  }

  private resolveLastWordsArrest() {
    const eliminatedId = this.state.currentSpeakerId;
    this.state.currentSpeakerId = null;

    if (eliminatedId) {
      const eliminated = this.state.players.find(p => p.id === eliminatedId);
      if (eliminated) {
        eliminated.isAlive = false;
        this.state.lastEliminatedPlayer = {
          player: { ...eliminated },
          reason: 'vote'
        };
        this.addLog(`🚔 Игрок ${eliminated.name} отправлен в тюрьму и выбывает из игры.`);

        // XP Reward for voting out evil roles
        const isMafia = eliminated.role === 'mafia' || eliminated.role === 'don';
        const isManiac = eliminated.role === 'maniac';
        if (isMafia || isManiac) {
          const evilLabel = isManiac ? 'маньяка' : 'мафии';
          // Award XP to all players who voted for this criminal
          this.state.players.forEach(p => {
            if (p.isAlive && p.votedFor === eliminated.id && p.id !== eliminated.id) {
              const pIsMafia = p.role === 'mafia' || p.role === 'don';
              if (!pIsMafia || isManiac) {
                this.awardPlayerXp(p.id, 30, `Точный голос против ${evilLabel}`);
              }
            }
          });

          // Award XP to player who nominated them
          if (eliminated.nominatedBy) {
            const nominator = this.state.players.find(p => p.id === eliminated.nominatedBy);
            if (nominator && nominator.isAlive && nominator.id !== eliminated.id) {
              const nomIsMafia = nominator.role === 'mafia' || nominator.role === 'don';
              if (!nomIsMafia || isManiac) {
                this.awardPlayerXp(nominator.id, 20, `Успешное обвинение ${evilLabel}`);
              }
            }
          }
        }
      }
    }

    const winner = MafiaEngine.checkWinner(this.state.players);
    if (winner) {
      this.endGame(winner);
      return;
    }

    this.startNightPhase();
  }

  // NIGHT PHASES LOGIC
  private startNightPhase() {
    this.state.phase = 'NIGHT';
    this.state.phaseTimeRemaining = this.state.settings.nightDurationSeconds || 30;
    this.nightActions = { mafiaVotes: {} };
    this.state.nominatedPlayerIds = [];
    this.state.currentSpeakerId = null;
    this.state.defenseCandidates = [];
    this.state.tieVotersExcluded = [];
    this.state.phaseSkipVotedIds = [];
    this.state.players.forEach(p => {
      p.votedFor = null;
      p.nominatedBy = null;
    });

    this.addLog('🌙 Город засыпает. Наступает ночь... Просыпается мафия.');
    this.triggerBotNightActions();
  }

  private resolveNightPhase() {
    const { nextState, result } = MafiaEngine.resolveNight(this.state, this.nightActions);
    Object.assign(this.state, nextState);
    this.state.phase = 'MORNING_REPORT';
    this.state.phaseTimeRemaining = 7;

    result.narrativeText.forEach(line => this.addLog(line));

    // Award XP for night role actions
    // 1. Sheriff Investigation
    if (this.nightActions.sheriffCheck) {
      const sheriff = this.state.players.find(p => p.role === 'sheriff');
      if (sheriff && result.sheriffInvestigation) {
        if (result.sheriffInvestigation.isMafia) {
          this.awardPlayerXp(sheriff.id, 45, 'Шериф: поимка мафии');
        } else {
          this.awardPlayerXp(sheriff.id, 15, 'Шериф: проверка жителя');
        }
      }
    }

    // 2. Don Investigation
    if (this.nightActions.donCheck) {
      const don = this.state.players.find(p => p.role === 'don');
      if (don && result.donInvestigation) {
        if (result.donInvestigation.isSheriff) {
          this.awardPlayerXp(don.id, 45, 'Дон: вычисление шерифа');
        } else {
          this.awardPlayerXp(don.id, 15, 'Дон: ночной поиск');
        }
      }
    }

    // 3. Doctor Heal
    if (this.nightActions.doctorHeal) {
      const doctor = this.state.players.find(p => p.role === 'doctor');
      if (doctor) {
        const healedId = this.nightActions.doctorHeal;
        const wasAttacked = Object.values(this.nightActions.mafiaVotes).includes(healedId) || this.nightActions.maniacKill === healedId;
        if (wasAttacked) {
          this.awardPlayerXp(doctor.id, 60, 'Доктор: спасение жизни');
        } else {
          this.awardPlayerXp(doctor.id, 10, 'Доктор: ночное дежурство');
        }
      }
    }

    // 4. Courtesan Block
    if (this.nightActions.courtesanBlock) {
      const courtesan = this.state.players.find(p => p.role === 'courtesan');
      const target = this.state.players.find(p => p.id === this.nightActions.courtesanBlock);
      if (courtesan && target) {
        const hasKeyRole = ['sheriff', 'don', 'doctor', 'bodyguard', 'maniac', 'mafia'].includes(target.role || '');
        if (hasKeyRole) {
          this.awardPlayerXp(courtesan.id, 35, 'Красотка: блокировка ключевой роли');
        } else {
          this.awardPlayerXp(courtesan.id, 15, 'Красотка: ночной визит');
        }
      }
    }

    // 5. Bodyguard Protection
    if (this.nightActions.bodyguardProtect) {
      const bodyguard = this.state.players.find(p => p.role === 'bodyguard');
      if (bodyguard) {
        const protId = this.nightActions.bodyguardProtect;
        const wasAttacked = Object.values(this.nightActions.mafiaVotes).includes(protId) || this.nightActions.maniacKill === protId;
        if (wasAttacked) {
          this.awardPlayerXp(bodyguard.id, 60, 'Телохранитель: защита цели');
        } else {
          this.awardPlayerXp(bodyguard.id, 15, 'Телохранитель: ночная охрана');
        }
      }
    }

    // 6. Mafia & Maniac Kills
    if (result.killedPlayerIds.length > 0) {
      this.state.players.filter(p => p.isAlive && (p.role === 'mafia' || p.role === 'don')).forEach(maf => {
        const vote = this.nightActions.mafiaVotes[maf.id];
        if (vote && result.killedPlayerIds.includes(vote)) {
          this.awardPlayerXp(maf.id, 25, 'Мафия: ночной отстрел');
        }
      });

      const maniac = this.state.players.find(p => p.isAlive && p.role === 'maniac');
      if (maniac && this.nightActions.maniacKill && result.killedPlayerIds.includes(this.nightActions.maniacKill)) {
        this.awardPlayerXp(maniac.id, 30, 'Маньяк: успешная охота');
      }
    }
  }

  private resolveMorningReport() {
    const winner = MafiaEngine.checkWinner(this.state.players);
    if (winner) {
      this.endGame(winner);
      return;
    }

    // Check if anyone was killed during the night
    const killedIds = this.state.lastNightResult?.killedPlayerIds || [];
    if (killedIds.length > 0) {
      this.lastWordsQueue = [...killedIds];
      this.nextLastWordsKilled();
    } else {
      // No deaths -> proceed to next day
      this.startDay(this.state.dayNumber + 1);
    }
  }

  private nextLastWordsKilled() {
    if (this.lastWordsQueue.length === 0) {
      // Check winner again
      const winner = MafiaEngine.checkWinner(this.state.players);
      if (winner) {
        this.endGame(winner);
        return;
      }
      // Start next day
      this.startDay(this.state.dayNumber + 1);
      return;
    }

    const speakerId = this.lastWordsQueue.shift()!;
    this.state.currentSpeakerId = speakerId;
    this.state.phase = 'LAST_WORDS_KILLED';
    this.state.phaseTimeRemaining = this.state.settings.individualSpeechDuration || 45;

    const speaker = this.state.players.find(p => p.id === speakerId);
    this.addLog(`🕯️ Последнее слово (Завещание) погибшего игрока ${speaker?.name || 'Горожанин'}.`);

    if (speaker?.isBot) {
      this.triggerBotLastWords(speakerId);
    }
  }

  private endGame(winner: Team) {
    this.state.phase = 'GAME_OVER';
    this.state.winner = winner;
    this.state.phaseTimeRemaining = 0;
    this.state.currentSpeakerId = null;

    const teamNames: Record<Team, string> = {
      civilians: 'Мирные жители',
      mafia: 'Мафия',
      maniac: 'Маньяк'
    };
    this.addLog(`🏆 Игра окончена! Победу одержали ${teamNames[winner]}!`);

    // Record game statistics and credit XP to real human players in user database
    try {
      this.state.players.forEach(p => {
        if (p.isBot) return;
        const isMafia = p.role === 'mafia' || p.role === 'don';
        const isManiac = p.role === 'maniac';
        const playerTeam: Team = isMafia ? 'mafia' : isManiac ? 'maniac' : 'civilians';
        const won = playerTeam === winner;
        const rounds = Math.max(1, this.state.dayNumber || 1);
        const survivalTime = p.isAlive ? rounds * 120 : Math.max(60, (rounds - 1) * 120 + 45);

        const sessionXp = this.playerSessionXp.get(p.id);
        const customAwards = sessionXp ? {
          totalXp: sessionXp.totalXp,
          reasons: sessionXp.awards.map(a => ({ reason: a.reason, xp: a.xp }))
        } : undefined;

        const res = userDb.recordGameResult(
          p.id,
          won,
          playerTeam,
          p.role,
          p.isAlive,
          survivalTime,
          rounds,
          customAwards
        );

        if (res) {
          const rewardPayload = {
            xpEarned: res.xpEarned,
            totalXp: res.totalXp,
            oldLevel: res.oldLevel,
            newLevel: res.newLevel,
            leveledUp: res.leveledUp,
            role: p.role,
            won,
            survived: p.isAlive,
            awards: [
              { reason: 'Участие в партии', xp: 50 },
              ...(won ? [{ reason: 'Победа в матче', xp: 120 }] : []),
              ...(p.isAlive ? [{ reason: 'Выживание до конца', xp: 40 }] : []),
              ...(sessionXp ? sessionXp.awards.map(a => ({ reason: a.reason, xp: a.xp })) : [])
            ]
          };
          this.gameOverRewards.set(p.id, rewardPayload);

          const ws = this.sockets.get(p.id);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'GAME_OVER_REWARDS',
              payload: rewardPayload
            }));
          }
        }

        // Track quests & events progress
        try {
          const userObj = userDb.getUserById(p.id);
          const hasClanMate = Boolean(
            userObj?.clanId &&
            this.state.players.some(other => other.id !== p.id && !other.isBot && userDb.getUserById(other.id)?.clanId === userObj.clanId)
          );

          eventsDb.trackAction(p.id, 'play_matches', 1);
          if (won) eventsDb.trackAction(p.id, 'win_matches', 1);
          if (p.role) eventsDb.trackAction(p.id, 'play_role', 1, { role: p.role });
          if (rounds > 0) eventsDb.trackAction(p.id, 'survive_rounds', rounds);
          if (hasClanMate) eventsDb.trackAction(p.id, 'play_with_clan_member', 1, { hasClanMate: true });
        } catch (err) {
          console.error('Error tracking task progress for player:', err);
        }
      });
    } catch (e) {
      console.error('Error saving game stats to userDb:', e);
    }

    this.broadcastState();
  }

  private addLog(text: string) {
    this.state.gameLogs.push(text);
    this.messages.push({
      id: Math.random().toString(36).substring(2, 9),
      senderId: 'system',
      senderName: 'Ведущий',
      channel: 'system',
      text,
      timestamp: Date.now(),
      isSystem: true
    });
  }

  private getPlayerName(id: string): string {
    const p = this.state.players.find(x => x.id === id);
    return p ? p.name : id;
  }

  private getNominatedNames(): string[] {
    return this.state.nominatedPlayerIds.map(id => this.getPlayerName(id));
  }

  // BOT BEHAVIORS
  private triggerBotChat() {
    const aliveBots = this.state.players.filter(p => p.isBot && p.isAlive);
    if (aliveBots.length === 0) return;

    // 1-2 bots say something in chat during day
    const randomBots = aliveBots.sort(() => Math.random() - 0.5).slice(0, 2);
    randomBots.forEach((bot, index) => {
      const delay = 3000 + index * 4000 + Math.random() * 2000;
      const timeout = setTimeout(() => {
        if (this.state.phase !== 'DAY_DISCUSSION') return;
        const phrase = BOT_DAY_PHRASES[Math.floor(Math.random() * BOT_DAY_PHRASES.length)];
        this.addChatMessage(bot.id, phrase, 'all');
      }, delay);
      this.botActionTimeouts.push(timeout);
    });
  }

  private triggerBotSpeech(botId: string) {
    const bot = this.state.players.find(p => p.id === botId);
    if (!bot) return;

    const speechTimeout = setTimeout(() => {
      if (this.state.phase !== 'INDIVIDUAL_SPEECHES' || this.state.currentSpeakerId !== botId) return;

      const phrase = BOT_DAY_PHRASES[Math.floor(Math.random() * BOT_DAY_PHRASES.length)];
      this.addChatMessage(botId, phrase, 'all');

      // Bot nomination logic: if not day 1 without nominations, 40% chance to nominate an unnominated alive player
      const canNominate = !(this.state.dayNumber === 1 && !this.state.settings.firstDayVoting);
      if (canNominate && Math.random() < 0.4) {
        const availableTargets = this.state.players.filter(p => p.isAlive && p.id !== botId && !this.state.nominatedPlayerIds.includes(p.id));
        if (availableTargets.length > 0) {
          const target = availableTargets[Math.floor(Math.random() * availableTargets.length)];
          this.nominatePlayer(target.id, botId);
        }
      }

      // Finish speech after 4 seconds
      const finishTimeout = setTimeout(() => {
        if (this.state.phase === 'INDIVIDUAL_SPEECHES' && this.state.currentSpeakerId === botId) {
          this.advancePhase();
        }
      }, 4000);
      this.botActionTimeouts.push(finishTimeout);

    }, 1500);
    this.botActionTimeouts.push(speechTimeout);
  }

  private triggerBotDefenseSpeech(botId: string) {
    const timeout = setTimeout(() => {
      if (this.state.phase !== 'DEFENSE_SPEECH' || this.state.currentSpeakerId !== botId) return;
      this.addChatMessage(botId, 'Я честный гражданин города! Прошу вас, не совершайте фатальную ошибку.', 'all');

      const finishTimeout = setTimeout(() => {
        if (this.state.phase === 'DEFENSE_SPEECH' && this.state.currentSpeakerId === botId) {
          this.advancePhase();
        }
      }, 3500);
      this.botActionTimeouts.push(finishTimeout);
    }, 1500);
    this.botActionTimeouts.push(timeout);
  }

  private triggerBotLastWords(botId: string) {
    const timeout = setTimeout(() => {
      if ((this.state.phase !== 'LAST_WORDS_ARREST' && this.state.phase !== 'LAST_WORDS_KILLED') || this.state.currentSpeakerId !== botId) return;
      this.addChatMessage(botId, 'Моя совесть чиста. Город обязательно избавится от мафии!', 'all');

      const finishTimeout = setTimeout(() => {
        if ((this.state.phase === 'LAST_WORDS_ARREST' || this.state.phase === 'LAST_WORDS_KILLED') && this.state.currentSpeakerId === botId) {
          this.advancePhase();
        }
      }, 3500);
      this.botActionTimeouts.push(finishTimeout);
    }, 1500);
    this.botActionTimeouts.push(timeout);
  }

  private triggerBotVoting() {
    const aliveBots = this.state.players.filter(p => p.isBot && p.isAlive);
    const candidates = this.state.nominatedPlayerIds;
    if (candidates.length === 0) return;

    aliveBots.forEach(bot => {
      const delay = 1500 + Math.random() * 5000;
      const timeout = setTimeout(() => {
        if (this.state.phase !== 'VOTING') return;
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        this.castVote(bot.id, target);
      }, delay);
      this.botActionTimeouts.push(timeout);
    });
  }

  private triggerBotRevoting() {
    const candidates = this.state.defenseCandidates || [];
    if (candidates.length === 0) return;

    const eligibleBots = this.state.players.filter(p => 
      p.isBot && p.isAlive && !(this.state.tieVotersExcluded || []).includes(p.id)
    );

    eligibleBots.forEach(bot => {
      const delay = 1500 + Math.random() * 4000;
      const timeout = setTimeout(() => {
        if (this.state.phase !== 'REVOTE') return;
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        this.castVote(bot.id, target);
      }, delay);
      this.botActionTimeouts.push(timeout);
    });
  }

  private triggerBotNightActions() {
    const aliveBots = this.state.players.filter(p => p.isBot && p.isAlive);
    const alivePlayers = this.state.players.filter(p => p.isAlive);

    aliveBots.forEach(bot => {
      const delay = 1500 + Math.random() * 4000;
      const timeout = setTimeout(() => {
        if (this.state.phase !== 'NIGHT') return;

        if (bot.role === 'mafia' || bot.role === 'don') {
          const nonMafia = alivePlayers.filter(p => p.role !== 'mafia' && p.role !== 'don');
          if (nonMafia.length > 0) {
            const target = nonMafia[Math.floor(Math.random() * nonMafia.length)];
            this.nightActions.mafiaVotes[bot.id] = target.id;
          }
          if (bot.role === 'don') {
            const potentialSheriffs = alivePlayers.filter(p => p.id !== bot.id);
            if (potentialSheriffs.length > 0) {
              const target = potentialSheriffs[Math.floor(Math.random() * potentialSheriffs.length)];
              this.nightActions.donCheck = target.id;
            }
          }
        } else if (bot.role === 'sheriff') {
          const others = alivePlayers.filter(p => p.id !== bot.id);
          if (others.length > 0) {
            const target = others[Math.floor(Math.random() * others.length)];
            this.nightActions.sheriffCheck = target.id;
          }
        } else if (bot.role === 'doctor') {
          if (alivePlayers.length > 0) {
            const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
            this.nightActions.doctorHeal = target.id;
          }
        } else if (bot.role === 'maniac') {
          const others = alivePlayers.filter(p => p.id !== bot.id);
          if (others.length > 0) {
            const target = others[Math.floor(Math.random() * others.length)];
            this.nightActions.maniacKill = target.id;
          }
        } else if (bot.role === 'courtesan') {
          const others = alivePlayers.filter(p => p.id !== bot.id);
          if (others.length > 0) {
            const target = others[Math.floor(Math.random() * others.length)];
            this.nightActions.courtesanBlock = target.id;
          }
        } else if (bot.role === 'bodyguard') {
          const others = alivePlayers.filter(p => p.id !== bot.id);
          if (others.length > 0) {
            const target = others[Math.floor(Math.random() * others.length)];
            this.nightActions.bodyguardProtect = target.id;
          }
        }

        if (!this.state.nightActionsCompleted) this.state.nightActionsCompleted = [];
        if (!this.state.nightActionsCompleted.includes(bot.id)) {
          this.state.nightActionsCompleted.push(bot.id);
        }

        // Bot is ready and votes to skip night after taking action
        if (!this.state.phaseSkipVotedIds) this.state.phaseSkipVotedIds = [];
        if (!this.state.phaseSkipVotedIds.includes(bot.id)) {
          this.state.phaseSkipVotedIds.push(bot.id);
        }

        this.checkNightSkipComplete();
        this.broadcastState();
      }, delay);
      this.botActionTimeouts.push(timeout);
    });
  }

  private triggerBotsSupportSkip() {
    const aliveBots = this.state.players.filter(p => p.isBot && p.isAlive && !(this.state.phaseSkipVotedIds || []).includes(p.id));
    if (aliveBots.length === 0) return;

    aliveBots.slice(0, 2).forEach((bot, idx) => {
      const delay = 1200 + idx * 1500;
      const timeout = setTimeout(() => {
        if (this.state.phase !== 'DAY_DISCUSSION') return;
        if (!this.state.phaseSkipVotedIds) this.state.phaseSkipVotedIds = [];
        if (!this.state.phaseSkipVotedIds.includes(bot.id)) {
          this.state.phaseSkipVotedIds.push(bot.id);
        }
        const aliveCount = this.state.players.filter(p => p.isAlive).length;
        if (aliveCount > 0 && (this.state.phaseSkipVotedIds.length / aliveCount) >= 0.70) {
          this.addLog(`⏩ Более 70% жителей (${this.state.phaseSkipVotedIds.length}/${aliveCount}) проголосовали за завершение общего собрания.`);
          this.advancePhase();
        } else {
          this.broadcastState();
        }
      }, delay);
      this.botActionTimeouts.push(timeout);
    });
  }

  private getActiveNightRolePlayerIds(): string[] {
    const activeRoles: RoleId[] = ['mafia', 'don', 'sheriff', 'doctor', 'courtesan', 'maniac', 'bodyguard'];
    return this.state.players
      .filter(p => p.isAlive && p.role && activeRoles.includes(p.role))
      .map(p => p.id);
  }

  private checkNightSkipComplete() {
    if (this.state.phase !== 'NIGHT') return;
    const activeIds = this.getActiveNightRolePlayerIds();
    if (activeIds.length === 0) return;

    const skipVoted = this.state.phaseSkipVotedIds || [];
    const allDone = activeIds.every(id => skipVoted.includes(id));
    if (allDone) {
      this.advancePhase();
    }
  }

  // PUBLIC MUTATIONS
  public addBot(): boolean {
    if (this.state.phase !== 'LOBBY') return false;
    if (this.state.players.length >= this.state.settings.maxPlayers) return false;

    const usedNames = new Set(this.state.players.map(p => p.name));
    const availableNames = BOT_NAMES.filter(n => !usedNames.has(n));
    const botName = availableNames[0] || `Бот #${this.state.players.length + 1}`;

    const bot: Player = {
      id: `bot_${Math.random().toString(36).substring(2, 9)}`,
      name: botName,
      avatarSeed: botName,
      isHost: false,
      isBot: true,
      isAlive: true,
      connected: true,
      ready: true,
      warningsCount: 0
    };

    this.state.players.push(bot);
    this.addLog(`Игрок ${botName} (Бот) присоединился к комнате.`);
    this.broadcastState();
    return true;
  }

  public removePlayer(playerId: string) {
    const idx = this.state.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      const player = this.state.players[idx];
      this.state.players.splice(idx, 1);
      this.addLog(`Игрок ${player.name} покинул комнату.`);

      // If host left, pass to next real player
      if (player.isHost && this.state.players.length > 0) {
        const nextHost = this.state.players.find(p => !p.isBot) || this.state.players[0];
        nextHost.isHost = true;
        this.state.hostId = nextHost.id;
        this.addLog(`${nextHost.name} теперь является ведущим комнаты.`);
      }

      this.broadcastState();
    }
  }

  public addSpectator(spectator: Spectator) {
    this.spectators.set(spectator.id, spectator);
    this.state.spectators = Array.from(this.spectators.values());
    this.state.spectatorCount = this.spectators.size;
    this.addLog(`👁️ ${spectator.name} присоединился к столу в качестве зрителя.`);
    this.addChatMessage('system', `👁️ ${spectator.name} подключился к наблюдению за партией.`, 'system');
    this.broadcastState();
  }

  public removeSpectator(spectatorId: string) {
    const spec = this.spectators.get(spectatorId);
    if (spec) {
      this.spectators.delete(spectatorId);
      this.state.spectators = Array.from(this.spectators.values());
      this.state.spectatorCount = this.spectators.size;
      this.addLog(`👁️ Зритель ${spec.name} покинул стол.`);
      this.broadcastState();
    }
  }

  public isSpectator(id: string): boolean {
    return this.spectators.has(id);
  }

  public becomePlayerFromSpectator(spectatorId: string, name: string): boolean {
    if (this.state.phase !== 'LOBBY') return false;
    if (this.state.players.length >= this.state.settings.maxPlayers) return false;
    if (this.state.players.some(p => p.id === spectatorId)) return true;

    const spec = this.spectators.get(spectatorId);
    const userRec = userDb.getUserById(spectatorId);

    this.spectators.delete(spectatorId);
    this.state.spectators = Array.from(this.spectators.values());
    this.state.spectatorCount = this.spectators.size;

    this.state.players.push({
      id: spectatorId,
      name: name || spec?.name || 'Игрок',
      avatarSeed: name || spec?.name || 'Игрок',
      isHost: false,
      isBot: false,
      isAlive: true,
      connected: true,
      ready: true,
      warningsCount: 0,
      clanTag: userRec?.clanTag || spec?.clanTag || null,
      clanName: userRec?.clanName || spec?.clanName || null
    });

    this.addLog(`Игрок ${name || spec?.name} занял место за столом.`);
    this.addChatMessage('system', `Игрок ${name || spec?.name} перешёл из зрителей за игровой стол.`, 'system');
    this.broadcastState();
    return true;
  }

  public becomeSpectatorFromPlayer(playerId: string): boolean {
    if (this.state.phase !== 'LOBBY') return false;
    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return false;

    const player = this.state.players[playerIndex];
    if (player.isHost) {
      const otherPlayers = this.state.players.filter(p => p.id !== playerId);
      if (otherPlayers.length > 0) {
        const nextHost = otherPlayers.find(p => !p.isBot) || otherPlayers[0];
        nextHost.isHost = true;
        this.state.hostId = nextHost.id;
        this.addLog(`${nextHost.name} теперь является ведущим комнаты.`);
      }
    }

    this.state.players.splice(playerIndex, 1);
    this.spectators.set(playerId, {
      id: player.id,
      name: player.name,
      avatarSeed: player.avatarSeed || player.name,
      clanTag: player.clanTag,
      clanName: player.clanName,
      joinedAt: Date.now()
    });
    this.state.spectators = Array.from(this.spectators.values());
    this.state.spectatorCount = this.spectators.size;

    this.addLog(`👁️ ${player.name} перешёл в режим зрителя.`);
    this.addChatMessage('system', `👁️ ${player.name} освободил место за столом и перешёл в зрители.`, 'system');
    this.broadcastState();
    return true;
  }

  public selectPreferredRole(playerId: string, roleId: RoleId, token?: string): { success: boolean; message: string; user?: any } {
    if (this.state.phase !== 'LOBBY') {
      return { success: false, message: 'Выбор роли доступен только в лобби до начала игры.' };
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, message: 'Игрок не найден в комнате.' };
    }

    const availableRoles = MafiaEngine.getAvailableRolesForRoom(this.state.settings, this.state.players.length);
    if (!availableRoles.includes(roleId)) {
      return { success: false, message: 'Выбранная роль недоступна в текущих настройках комнаты.' };
    }

    let updatedUser = undefined;
    if (!player.hasUsedRoleCard) {
      if (token) {
        const user = userDb.getUserByToken(token);
        if (!user) {
          return { success: false, message: 'Требуется авторизация для использования предметов из инвентаря.' };
        }
        try {
          const res = userDb.useRoleCardInRoom(user.id);
          updatedUser = res.user;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Не удалось использовать Карточку выбора роли.';
          return { success: false, message: msg };
        }
      }
      player.hasUsedRoleCard = true;
    }

    player.preferredRole = roleId;
    this.addLog(`🎴 Игрок ${player.name} применил «Карточку выбора роли».`);
    this.broadcastState();
    return { 
      success: true, 
      message: `Роль успешно выбрана! При отсутствии конкурентов вы гарантированно получите её в партии.`,
      user: updatedUser 
    };
  }

  public startGame(requesterId: string): boolean {
    if (this.state.hostId !== requesterId) return false;
    if (this.state.players.length < 4) return false;

    // Distribute roles taking Role Card preferences into account
    this.state.players = MafiaEngine.distributeRoles(this.state.players, this.state.settings);
    // Reset preferences for future matches
    this.state.players.forEach(p => {
      p.preferredRole = null;
      p.hasUsedRoleCard = false;
    });

    this.state.phase = 'ROLE_REVEAL';
    this.state.phaseTimeRemaining = 7;
    this.state.dayNumber = 0;
    this.state.winner = null;
    this.state.nominatedPlayerIds = [];
    this.state.currentSpeakerId = null;
    this.state.defenseCandidates = [];
    this.state.tieVotersExcluded = [];
    this.state.phaseSkipVotedIds = [];
    this.state.lastWordsQueue = [];
    this.state.votesCastCount = 0;
    this.state.totalEligibleVoters = 0;
    this.state.currentSpeakerHasNominated = false;
    this.state.nightActionsCompleted = [];
    this.speechSpeakerQueue = [];
    this.defenseSpeakerQueue = [];

    // Clear previous match XP session
    this.playerSessionXp.clear();
    this.gameOverRewards.clear();

    this.addLog(`🎭 Игра началась! Карты розданы. Ознакомьтесь со своей ролью.`);
    this.broadcastState();
    return true;
  }

  public restartGame(requesterId: string): boolean {
    if (this.state.hostId !== requesterId) return false;

    this.botActionTimeouts.forEach(t => clearTimeout(t));
    this.botActionTimeouts = [];
    this.nightActions = { mafiaVotes: {} };
    this.speechSpeakerQueue = [];
    this.defenseSpeakerQueue = [];
    this.lastWordsQueue = [];

    this.state.phase = 'LOBBY';
    this.state.phaseTimeRemaining = 0;
    this.state.dayNumber = 0;
    this.state.winner = null;
    this.state.nominatedPlayerIds = [];
    this.state.currentSpeakerId = null;
    this.state.defenseCandidates = [];
    this.state.tieVotersExcluded = [];
    this.state.phaseSkipVotedIds = [];
    this.state.votesCastCount = 0;
    this.state.totalEligibleVoters = 0;
    this.state.currentSpeakerHasNominated = false;
    this.state.nightActionsCompleted = [];
    this.state.lastNightResult = undefined;
    this.state.lastEliminatedPlayer = null;
    this.state.players.forEach(p => {
      p.isAlive = true;
      p.role = undefined;
      p.preferredRole = null;
      p.hasUsedRoleCard = false;
      p.votedFor = null;
      p.nominatedBy = null;
    });

    this.playerSessionXp.clear();
    this.gameOverRewards.clear();

    this.addLog(`🛑 Ведущий досрочно остановил партию. Возврат в лобби.`);
    this.addChatMessage('system', `🛑 Ведущий досрочно остановил партию. Стол возвращён в режим сбора игроков.`, 'system');
    this.broadcastState();
    return true;
  }

  public skipPhase(requesterId: string): boolean {
    const player = this.state.players.find(p => p.id === requesterId);
    if (!player || !player.isAlive) return false;

    switch (this.state.phase) {
      case 'DAY_DISCUSSION': {
        // "Если более 70% живых игроков нажали её, фаза досрочно завершается"
        if (!this.state.phaseSkipVotedIds) this.state.phaseSkipVotedIds = [];
        if (!this.state.phaseSkipVotedIds.includes(requesterId)) {
          this.state.phaseSkipVotedIds.push(requesterId);
        }

        const aliveCount = this.state.players.filter(p => p.isAlive).length;
        if (aliveCount > 0 && (this.state.phaseSkipVotedIds.length / aliveCount) >= 0.70) {
          this.addLog(`⏩ Более 70% жителей (${this.state.phaseSkipVotedIds.length}/${aliveCount}) проголосовали за завершение общего собрания.`);
          this.advancePhase();
        } else {
          this.triggerBotsSupportSkip();
          this.broadcastState();
        }
        return true;
      }

      case 'INDIVIDUAL_SPEECHES':
      case 'DEFENSE_SPEECH':
      case 'LAST_WORDS_ARREST':
      case 'LAST_WORDS_KILLED': {
        // Speaker finishes their speech early
        if (this.state.currentSpeakerId === requesterId) {
          this.addLog(`⏩ ${player.name} завершил своё выступление досрочно.`);
          this.advancePhase();
          return true;
        }
        return false;
      }

      case 'VOTING':
      case 'REVOTE': {
        if (this.state.phase === 'REVOTE' && (this.state.tieVotersExcluded || []).includes(requesterId)) {
          return false;
        }

        // If player has not chosen anyone yet, mark 'skip' (abstain)
        // If player already made a choice, this confirms their vote/readiness
        if (!player.votedFor) {
          player.votedFor = 'skip';
        }

        const eligible = this.state.phase === 'REVOTE'
          ? this.state.players.filter(p => p.isAlive && !(this.state.tieVotersExcluded || []).includes(p.id))
          : this.state.players.filter(p => p.isAlive);

        this.state.votesCastCount = eligible.filter(p => p.votedFor !== undefined && p.votedFor !== null).length;
        this.state.totalEligibleVoters = eligible.length;

        this.broadcastState();

        if (eligible.every(p => p.votedFor !== undefined && p.votedFor !== null)) {
          this.state.phaseTimeRemaining = 1; // fast-forward to finish immediately
        }
        return true;
      }

      case 'NIGHT': {
        // Active role player explicitly clicks skip / finish night
        const actor = this.state.players.find(p => p.id === requesterId);
        if (!actor || !actor.isAlive) return false;

        if (!this.state.phaseSkipVotedIds) this.state.phaseSkipVotedIds = [];
        if (!this.state.phaseSkipVotedIds.includes(requesterId)) {
          this.state.phaseSkipVotedIds.push(requesterId);
        }

        this.checkNightSkipComplete();
        this.broadcastState();
        return true;
      }

      default:
        return false;
    }
  }

  public nominatePlayer(nomineeId: string, nominatorId: string): boolean {
    // Only current speaker can nominate during INDIVIDUAL_SPEECHES
    if (this.state.phase !== 'INDIVIDUAL_SPEECHES' || this.state.currentSpeakerId !== nominatorId) {
      return false;
    }

    // In first day, if firstDayVoting is disabled -> no nominations
    if (this.state.dayNumber === 1 && !this.state.settings.firstDayVoting) {
      return false;
    }

    // A speaker can only nominate ONE candidate during their speech
    if (this.state.currentSpeakerHasNominated) {
      return false;
    }

    // Cannot nominate self
    if (nomineeId === nominatorId) return false;

    const nominator = this.state.players.find(p => p.id === nominatorId);
    const nominee = this.state.players.find(p => p.id === nomineeId);

    if (!nominator || !nominator.isAlive || !nominee || !nominee.isAlive) return false;
    if (this.state.nominatedPlayerIds.includes(nomineeId)) return false;

    this.state.nominatedPlayerIds.push(nomineeId);
    this.state.currentSpeakerHasNominated = true;
    nominee.nominatedBy = nominator.name;
    this.addLog(`📢 ${nominator.name} выставил на голосование игрока ${nominee.name}.`);
    this.broadcastState();
    return true;
  }

  public castVote(voterId: string, targetId: string | 'skip'): boolean {
    if (this.state.phase !== 'VOTING' && this.state.phase !== 'REVOTE') return false;

    // Tie voting exclusion
    if (this.state.phase === 'REVOTE' && (this.state.tieVotersExcluded || []).includes(voterId)) {
      return false;
    }

    const voter = this.state.players.find(p => p.id === voterId);
    if (!voter || !voter.isAlive) return false;

    voter.votedFor = targetId;

    // Check if all eligible players voted
    const eligible = this.state.phase === 'REVOTE'
      ? this.state.players.filter(p => p.isAlive && !(this.state.tieVotersExcluded || []).includes(p.id))
      : this.state.players.filter(p => p.isAlive);

    this.state.votesCastCount = eligible.filter(p => p.votedFor !== undefined && p.votedFor !== null).length;
    this.state.totalEligibleVoters = eligible.length;

    const allVoted = eligible.every(p => p.votedFor !== undefined && p.votedFor !== null);
    if (allVoted) {
      this.state.phaseTimeRemaining = 1; // fast-forward
    }

    this.broadcastState();
    return true;
  }

  public submitNightAction(actorId: string, actionType: string, targetId: string): boolean {
    if (this.state.phase !== 'NIGHT') return false;
    const actor = this.state.players.find(p => p.id === actorId);
    if (!actor || !actor.isAlive) return false;

    switch (actionType) {
      case 'mafia_kill':
        if (actor.role === 'mafia' || actor.role === 'don') {
          this.nightActions.mafiaVotes[actorId] = targetId;
        }
        break;
      case 'don_check':
        if (actor.role === 'don') {
          this.nightActions.donCheck = targetId;
        }
        break;
      case 'sheriff_check':
        if (actor.role === 'sheriff') {
          this.nightActions.sheriffCheck = targetId;
        }
        break;
      case 'doctor_heal':
        if (actor.role === 'doctor') {
          this.nightActions.doctorHeal = targetId;
        }
        break;
      case 'courtesan_block':
        if (actor.role === 'courtesan') {
          this.nightActions.courtesanBlock = targetId;
        }
        break;
      case 'maniac_kill':
        if (actor.role === 'maniac') {
          this.nightActions.maniacKill = targetId;
        }
        break;
      case 'bodyguard_protect':
        if (actor.role === 'bodyguard') {
          this.nightActions.bodyguardProtect = targetId;
        }
        break;
    }

    if (!this.state.nightActionsCompleted) this.state.nightActionsCompleted = [];
    if (!this.state.nightActionsCompleted.includes(actorId)) {
      this.state.nightActionsCompleted.push(actorId);
    }

    this.broadcastState();
    return true;
  }

  public addChatMessage(senderId: string, text: string, channel: ChatMessage['channel']) {
    const sender = this.state.players.find(p => p.id === senderId);
    const specSender = this.spectators.get(senderId);
    if (!sender && !specSender && senderId !== 'system') return;

    const isSpectator = !!specSender && !sender;

    // Spectators can only post in 'all' channel
    if (isSpectator && channel !== 'all') {
      channel = 'all';
    }

    // Check channel permissions for players
    if (channel === 'mafia') {
      const isMafia = sender && (sender.role === 'mafia' || sender.role === 'don');
      const isGameOver = this.state.phase === 'GAME_OVER';
      if (!isMafia && !isGameOver) return;
    }

    if (channel === 'dead') {
      const isDead = sender && !sender.isAlive;
      const isGameOver = this.state.phase === 'GAME_OVER';
      if (!isDead && !isGameOver) return;
    }

    // Individual speeches chat restriction (only restricts players; spectators can comment without interrupting)
    if (channel === 'all' && this.state.phase === 'INDIVIDUAL_SPEECHES' && senderId !== 'system' && !isSpectator) {
      if (this.state.currentSpeakerId !== senderId) {
        // Not their turn to speak in all chat!
        return;
      }
    }

    const senderDisplayName = sender ? sender.name : (specSender ? specSender.name : 'Система');
    const senderClanTag = sender ? sender.clanTag : (specSender ? specSender.clanTag : undefined);

    const msg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      senderId,
      senderName: senderDisplayName,
      channel,
      text: text.trim(),
      timestamp: Date.now(),
      isSpectator,
      clanTag: senderClanTag || undefined
    };

    this.messages.push(msg);
    if (senderId && senderId !== 'system' && !sender?.isBot) {
      try {
        eventsDb.trackAction(senderId, 'send_chat', 1);
      } catch {}
    }
    this.broadcastChat();
  }

  // SERIALIZE STATE FOR SPECIFIC CLIENT
  public getClientState(playerId: string): ClientRoomState {
    const me = this.state.players.find(p => p.id === playerId);
    const isSpectator = this.spectators.has(playerId) || (!me && this.state.phase !== 'LOBBY');
    const isGameOver = this.state.phase === 'GAME_OVER';
    const amIMafia = me && (me.role === 'mafia' || me.role === 'don');

    // Mafia teammates list
    const myTeammates = amIMafia
      ? this.state.players
          .filter(p => p.role === 'mafia' || p.role === 'don')
          .map(p => ({ id: p.id, name: p.name, role: p.role! }))
      : undefined;

    // Sheriff current investigation result during active Night
    let sheriffCurrentCheckResult = null;
    if (me?.role === 'sheriff' && this.nightActions.sheriffCheck) {
      const target = this.state.players.find(p => p.id === this.nightActions.sheriffCheck);
      if (target) {
        sheriffCurrentCheckResult = {
          targetId: target.id,
          isMafia: target.role === 'mafia' || target.role === 'don'
        };
      }
    }

    // Don current investigation result during active Night
    let donCurrentCheckResult = null;
    if (me?.role === 'don' && this.nightActions.donCheck) {
      const target = this.state.players.find(p => p.id === this.nightActions.donCheck);
      if (target) {
        donCurrentCheckResult = {
          targetId: target.id,
          isSheriff: target.role === 'sheriff'
        };
      }
    }

    // Sheriff check result from last completed night
    let sheriffLastCheckResult = null;
    if (me?.role === 'sheriff' && this.state.lastNightResult?.sheriffInvestigation) {
      sheriffLastCheckResult = this.state.lastNightResult.sheriffInvestigation;
    }

    // Don check result from last completed night
    let donLastCheckResult = null;
    if (me?.role === 'don' && this.state.lastNightResult?.donInvestigation) {
      donLastCheckResult = this.state.lastNightResult.donInvestigation;
    }

    const activeNightPlayerIds = this.getActiveNightRolePlayerIds();
    const totalNightActiveRoles = activeNightPlayerIds.length;
    const nightSkipVotesCount = activeNightPlayerIds.filter(id => (this.state.phaseSkipVotedIds || []).includes(id)).length;

    // Players list with masked roles
    const maskedPlayers = this.state.players.map(p => {
      let visibleRole = undefined;

      if (isGameOver) {
        visibleRole = p.role;
      } else if (p.id === playerId) {
        visibleRole = p.role;
      } else if (amIMafia && (p.role === 'mafia' || p.role === 'don')) {
        visibleRole = p.role;
      }

      return {
        id: p.id,
        name: p.name,
        avatarSeed: p.avatarSeed,
        isHost: p.isHost,
        isBot: p.isBot,
        isAlive: p.isAlive,
        connected: p.connected,
        ready: p.ready,
        warningsCount: p.warningsCount,
        votedFor: this.state.settings.anonymousVoting && (this.state.phase === 'VOTING' || this.state.phase === 'REVOTE') ? undefined : p.votedFor,
        nominatedBy: p.nominatedBy,
        role: visibleRole,
        hasUsedRoleCard: p.hasUsedRoleCard,
        preferredRole: (p.id === playerId || this.state.phase === 'GAME_OVER') ? p.preferredRole : undefined,
        clanTag: p.clanTag,
        clanName: p.clanName
      };
    });

    return {
      roomCode: this.state.roomCode,
      roomName: this.state.roomName,
      hostId: this.state.hostId,
      phase: this.state.phase,
      phaseTimeRemaining: this.state.phaseTimeRemaining,
      dayNumber: this.state.dayNumber,
      players: maskedPlayers,
      spectators: this.state.spectators || [],
      spectatorCount: this.spectators.size,
      isSpectator,
      settings: this.state.settings,
      winner: this.state.winner,
      nominatedPlayerIds: this.state.nominatedPlayerIds,
      currentSpeakerId: this.state.currentSpeakerId,
      defenseCandidates: this.state.defenseCandidates,
      tieVotersExcluded: this.state.tieVotersExcluded,
      phaseSkipVotedIds: this.state.phaseSkipVotedIds,
      lastWordsQueue: this.state.lastWordsQueue,
      playerOnDefenseId: this.state.playerOnDefenseId,
      lastNightResult: this.state.lastNightResult,
      lastEliminatedPlayer: this.state.lastEliminatedPlayer,
      gameLogs: this.state.gameLogs,
      myRole: isSpectator ? undefined : me?.role,
      myTeammates,
      sheriffLastCheckResult,
      donLastCheckResult,
      sheriffCurrentCheckResult,
      donCurrentCheckResult,
      totalNightActiveRoles,
      nightSkipVotesCount,
      votesCastCount: this.state.votesCastCount,
      totalEligibleVoters: this.state.totalEligibleVoters,
      currentSpeakerHasNominated: this.state.currentSpeakerHasNominated,
      nightActionsCompleted: this.state.nightActionsCompleted,
      sessionXp: this.playerSessionXp.get(playerId)?.totalXp || 0,
      sessionXpAwards: this.playerSessionXp.get(playerId)?.awards || [],
      gameOverReward: this.gameOverRewards.get(playerId) || null
    };
  }

  public broadcastState() {
    this.sockets.forEach((ws, playerId) => {
      if (ws.readyState === WebSocket.OPEN) {
        const clientState = this.getClientState(playerId);
        ws.send(JSON.stringify({
          type: 'ROOM_STATE',
          payload: clientState
        }));
      }
    });

    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO game_rooms (
          room_code, room_name, host_id, host_name, phase, player_count, max_players, in_game, winner, day_number, settings, spectators, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          COALESCE((SELECT created_at FROM game_rooms WHERE room_code = ?), ?),
          ?
        )
      `).run(
        this.state.roomCode,
        this.state.roomName,
        this.state.hostId,
        this.getPlayerName(this.state.hostId),
        this.state.phase,
        this.state.players.length,
        this.state.settings.maxPlayers,
        this.state.phase !== 'LOBBY' ? 1 : 0,
        this.state.winner || null,
        this.state.dayNumber || 0,
        JSON.stringify(this.state.settings || {}),
        JSON.stringify(this.state.spectators || []),
        this.state.roomCode,
        now,
        now
      );
    } catch (e) {
      // Non-fatal logging
    }
  }

  public broadcastChat() {
    this.sockets.forEach((ws, playerId) => {
      if (ws.readyState === WebSocket.OPEN) {
        const me = this.state.players.find(p => p.id === playerId);
        const isSpectator = this.spectators.has(playerId);
        const amIMafia = me && (me.role === 'mafia' || me.role === 'don');
        const amIDead = me && !me.isAlive;
        const isGameOver = this.state.phase === 'GAME_OVER';

        // Filter messages allowed for this client
        const allowedMessages = this.messages.filter(m => {
          if (m.channel === 'all' || m.channel === 'system') return true;
          if (isSpectator) return isGameOver;
          if (m.channel === 'mafia') return amIMafia || isGameOver;
          if (m.channel === 'dead') return amIDead || isGameOver;
          return false;
        });

        ws.send(JSON.stringify({
          type: 'CHAT_HISTORY',
          payload: allowedMessages
        }));
      }
    });
  }
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  public createRoom(roomName: string, hostId: string, hostName: string, settings?: Partial<RoomSettings>): Room {
    const code = this.generateRoomCode();
    const finalName = roomName?.trim() || `Комната #${code}`;
    const room = new Room(code, finalName, hostId, hostName, settings);
    this.rooms.set(code, room);

    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO game_rooms (
          room_code, room_name, host_id, host_name, phase, player_count, max_players, in_game, winner, day_number, settings, spectators, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        code,
        finalName,
        hostId,
        hostName,
        'LOBBY',
        1,
        settings?.maxPlayers || 10,
        0,
        null,
        0,
        JSON.stringify(room.state.settings || {}),
        '[]',
        now,
        now
      );
    } catch {}

    return room;
  }

  public getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  public removeRoom(roomCode: string) {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (room) {
      room.destroy();
      this.rooms.delete(code);
      try {
        const db = getDatabase();
        db.prepare('DELETE FROM game_rooms WHERE room_code = ?').run(code);
      } catch {}
    }
  }

  public getPublicRooms(): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = [];
    this.rooms.forEach(room => {
      if (room.state.settings.isPublic) {
        const host = room.state.players.find(p => p.id === room.state.hostId);
        list.push({
          roomCode: room.state.roomCode,
          roomName: room.state.roomName,
          playerCount: room.state.players.length,
          maxPlayers: room.state.settings.maxPlayers,
          inGame: room.state.phase !== 'LOBBY',
          hostName: host ? host.name : 'Ведущий'
        });
      }
    });
    return list;
  }

  public getAllRoomsDetailed(): any[] {
    const list: any[] = [];
    this.rooms.forEach(room => {
      const host = room.state.players.find(p => p.id === room.state.hostId);
      list.push({
        roomCode: room.state.roomCode,
        roomName: room.state.roomName,
        phase: room.state.phase,
        dayNumber: room.state.dayNumber,
        playerCount: room.state.players.length,
        maxPlayers: room.state.settings.maxPlayers,
        gameMode: room.state.settings.gameMode,
        isPublic: room.state.settings.isPublic,
        hostId: room.state.hostId,
        hostName: host ? host.name : 'Ведущий',
        players: room.state.players.map(p => ({
          id: p.id,
          name: p.name,
          role: p.role,
          isAlive: p.isAlive,
          isBot: p.isBot
        }))
      });
    });
    return list;
  }

  public broadcastSystemMessage(text: string): number {
    let sentCount = 0;
    const msg: ChatMessage = {
      id: 'sys_' + Math.random().toString(36).substring(2, 9),
      senderId: 'SYSTEM',
      senderName: 'Оповещение Администрации',
      channel: 'all',
      text,
      timestamp: Date.now(),
      isSystem: true
    };

    this.rooms.forEach(room => {
      room.messages.push(msg);
      room.broadcastChat();
      sentCount++;
    });

    return sentCount;
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }
}

export const roomManager = new RoomManager();
