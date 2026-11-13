import { WebSocket } from 'ws';
import { 
  ClientRoomState, 
  GamePhase, 
  GameWinner,
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
import { experienceDb } from '../db/experience';
import { accountDeletionDb, AccountDeletionRequestRecord } from '../db/accountDeletion';

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
  public static readonly DEFAULT_HOST_DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  public static readonly DEFAULT_POST_MATCH_CLOSE_DELAY_MS = 10 * 1000; // 10 seconds

  public state: RoomState;
  public sockets: Map<string, WebSocket> = new Map(); // playerId / spectatorId -> WebSocket
  public spectators: Map<string, Spectator> = new Map(); // spectatorId -> Spectator
  public hostDisconnectTimeoutMs: number = Room.DEFAULT_HOST_DISCONNECT_TIMEOUT_MS;
  public postMatchCloseDelayMs: number = Room.DEFAULT_POST_MATCH_CLOSE_DELAY_MS;
  public isClosed: boolean = false;
  public onCloseCallback?: (roomCode: string) => void;
  public onDeletionTransitionsCallback?: (
    records: AccountDeletionRequestRecord[],
    roomCode: string,
    endType: 'game_over' | 'stopped' | 'closed'
  ) => Promise<void> | void;

  private timerInterval: NodeJS.Timeout | null = null;
  private hostDisconnectTimeout: NodeJS.Timeout | null = null;
  private hostDisconnectTimerGeneration: number = 0;
  private postMatchCloseTimeout: NodeJS.Timeout | null = null;
  private matchResultsSaved: boolean = false;
  private pendingDeletionTransitionDone: boolean = false;
  private activeEndGameStatsPromise: Promise<void> | null = null;
  private nightActions: NightActions = { mafiaVotes: {} };
  private botActionTimeouts: NodeJS.Timeout[] = [];
  public messages: ChatMessage[] = [];

  // Speech and flow queues
  private speechSpeakerQueue: string[] = [];
  private defenseSpeakerQueue: string[] = [];
  private lastWordsQueue: string[] = [];
  private kickingPlayerIds: Set<string> = new Set();

  // In-session player Experience (XP) tracking
  public playerSessionXp: Map<string, { totalXp: number; awards: Array<{ reason: string; xp: number; timestamp: number }> }> = new Map();
  public gameOverRewards: Map<string, { xpEarned: number; totalXp: number; oldLevel: number; newLevel: number; leveledUp: boolean; awards: Array<{ reason: string; xp: number }> }> = new Map();

  public awardPlayerXp(playerId: string, defaultXp: number, reason: string, actionId?: string) {
    if (!playerId) return;
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || player.isBot) return;

    const actualXp = actionId ? experienceDb.getActionXp(actionId, defaultXp) : Math.round(defaultXp * (experienceDb['cachedConfig']?.globalMultiplier || 1.0));

    let session = this.playerSessionXp.get(playerId);
    if (!session) {
      session = { totalXp: 0, awards: [] };
      this.playerSessionXp.set(playerId, session);
    }

    session.totalXp += actualXp;
    session.awards.push({
      reason,
      xp: actualXp,
      timestamp: Date.now()
    });

    // Notify the player immediately via WebSocket
    const ws = this.sockets.get(playerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'XP_EARNED',
        payload: {
          xp: actualXp,
          reason,
          sessionTotal: session.totalXp
        }
      }));
    }
  }

  constructor(roomCode: string, roomName: string, hostId: string, hostName: string, settings?: Partial<RoomSettings>, hostIsRegistered: boolean = false) {
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
      doctorSavesFromCourtesanDeath: false,
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
          isRegistered: Boolean(hostIsRegistered),
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
      courtesanBlockedPlayerId: null,
      doctorLastHealedPlayerId: null,
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
      closingAfterMatch: false,
      closingCountdownSeconds: null,
      gameLogs: [`Комната ${roomCode} создана ведущим ${hostName}.`]
    };

    this.startHeartbeatTimer();
  }

  private startHeartbeatTimer() {
    this.timerInterval = setInterval(() => {
      this.tick();
    }, 1000);
  }

  public clearHostDisconnectTimer() {
    this.hostDisconnectTimerGeneration++;
    if (this.hostDisconnectTimeout) {
      clearTimeout(this.hostDisconnectTimeout);
      this.hostDisconnectTimeout = null;
    }
  }

  private startHostDisconnectTimer(disconnectedHostId: string) {
    if (this.isClosed) return;
    if (this.hostDisconnectTimeout) {
      clearTimeout(this.hostDisconnectTimeout);
      this.hostDisconnectTimeout = null;
    }
    const generation = ++this.hostDisconnectTimerGeneration;
    this.hostDisconnectTimeout = setTimeout(() => {
      this.hostDisconnectTimeout = null;
      if (this.isClosed || this.hostDisconnectTimerGeneration !== generation) {
        return;
      }
      const currentHost = this.state.players.find(p => p.id === this.state.hostId);
      const anyConnectedHuman = this.state.players.some(p => !p.isBot && p.connected);
      if (
        (this.state.hostId === disconnectedHostId && (!currentHost || !currentHost.connected)) ||
        (!this.state.hostId && !anyConnectedHuman)
      ) {
        this.closeRoom('Время ожидания переподключения ведущего (5 минут) истекло. Стол закрыт.');
      }
    }, this.hostDisconnectTimeoutMs);
  }

  public clearPostMatchCloseTimer() {
    if (this.postMatchCloseTimeout) {
      clearTimeout(this.postMatchCloseTimeout);
      this.postMatchCloseTimeout = null;
    }
  }

  private schedulePostMatchClose() {
    if (this.isClosed) return;
    if (this.postMatchCloseTimeout) return;
    this.state.closingCountdownSeconds = Math.ceil(this.postMatchCloseDelayMs / 1000);
    this.postMatchCloseTimeout = setTimeout(() => {
      this.postMatchCloseTimeout = null;
      if (this.isClosed) return;
      this.closeRoom('Партия завершена. Комната автоматически закрыта после выхода ведущего.');
    }, this.postMatchCloseDelayMs);
  }

  private collectHumanParticipantIds(playersList?: Player[]): string[] {
    const src = playersList || this.state.players;
    const ids = new Set<string>();
    for (const p of src) {
      if (p && !p.isBot && p.id && !p.id.startsWith('bot_') && !p.id.startsWith('guest_')) {
        ids.add(p.id);
      }
    }
    if (this.state.hostId && !this.state.hostId.startsWith('bot_') && !this.state.hostId.startsWith('guest_')) {
      ids.add(this.state.hostId);
    }
    return Array.from(ids);
  }

  private async runMatchEndDeletionTransition(
    participantIds: string[],
    endType: 'game_over' | 'stopped' | 'closed'
  ): Promise<void> {
    if (this.pendingDeletionTransitionDone) return;
    this.pendingDeletionTransitionDone = true;
    if (participantIds.length === 0) return;

    try {
      const transitioned = await accountDeletionDb.transitionRoomParticipantsAfterGameEnd(participantIds);
      if (transitioned.length > 0 && this.onDeletionTransitionsCallback) {
        await this.onDeletionTransitionsCallback(transitioned, this.state.roomCode, endType);
      }
    } catch (err) {
      console.error(`[Room ${this.state.roomCode}] Error transitioning pending_game_end requests:`, err);
    }
  }

  public closeRoom(reason: string = 'Комната закрыта.') {
    if (this.isClosed) return;
    const prevPhase = this.state.phase;
    const humanIdsBeforeClose = this.collectHumanParticipantIds();
    this.isClosed = true;
    this.destroy();

    const closeMsg = JSON.stringify({
      type: 'ROOM_CLOSED',
      payload: {
        roomCode: this.state.roomCode,
        reason
      }
    });

    this.sockets.forEach((ws) => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(closeMsg);
        }
      } catch {}
    });

    this.sockets.clear();
    this.spectators.clear();
    this.state.spectators = [];
    this.state.spectatorCount = 0;
    this.state.players = [];
    this.speechSpeakerQueue = [];
    this.defenseSpeakerQueue = [];
    this.lastWordsQueue = [];

    if (prevPhase !== 'LOBBY' && !this.pendingDeletionTransitionDone) {
      const statsPromise = this.activeEndGameStatsPromise;
      if (statsPromise) {
        void statsPromise.finally(() => {
          void this.runMatchEndDeletionTransition(humanIdsBeforeClose, 'closed');
        });
      } else {
        void this.runMatchEndDeletionTransition(humanIdsBeforeClose, 'closed');
      }
    }

    if (this.onCloseCallback) {
      const cb = this.onCloseCallback;
      this.onCloseCallback = undefined;
      cb(this.state.roomCode);
    }
  }

  public destroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.clearHostDisconnectTimer();
    this.clearPostMatchCloseTimer();
    this.botActionTimeouts.forEach(t => clearTimeout(t));
    this.botActionTimeouts = [];
  }

  private tick() {
    if (this.isClosed) return;
    if (this.state.phase === 'LOBBY') {
      return;
    }
    if (this.state.phase === 'GAME_OVER') {
      if (
        this.state.closingAfterMatch &&
        typeof this.state.closingCountdownSeconds === 'number' &&
        this.state.closingCountdownSeconds > 0
      ) {
        this.state.closingCountdownSeconds--;
        this.broadcastState();
      }
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
          this.addChatMessage('system', '🌙 Ночная нулевая минута: город спит, мафия знакомится и вырабатывает тактику.', 'system');
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
          this.awardPlayerXp(p.id, 15, `Пережили день ${dayNum - 1}`, 'day_survived');
        }
      });
    }

    if (this.state.settings.generalDiscussionDuration > 0) {
      this.state.phase = 'DAY_DISCUSSION';
      this.state.phaseTimeRemaining = this.state.settings.generalDiscussionDuration;
      this.addLog(`☀️ День ${dayNum}. Общее собрание горожан (${this.state.settings.generalDiscussionDuration}с).`);
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
    // Skip any player who received daytime block from courtesan
    while (this.speechSpeakerQueue.length > 0 && this.speechSpeakerQueue[0] === this.state.courtesanBlockedPlayerId) {
      const skippedId = this.speechSpeakerQueue.shift()!;
      const skippedPlayer = this.state.players.find(p => p.id === skippedId);
      const slotNum = this.state.players.findIndex(p => p.id === skippedId) + 1;
      this.addLog(`🤐 Игрок ${skippedPlayer?.name || 'Горожанин'} (Слот #${slotNum}) лишён права речи после визита Путаны и пропускает выступление.`);
    }

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
    this.state.totalEligibleVoters = this.state.players.filter(p => p.isAlive && p.id !== this.state.courtesanBlockedPlayerId).length;

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

    this.state.totalEligibleVoters = this.state.players.filter(p => p.isAlive && !(this.state.tieVotersExcluded || []).includes(p.id) && p.id !== this.state.courtesanBlockedPlayerId).length;

    this.triggerBotRevoting();
  }

  private resolveRevote() {
    const voteCounts: Record<string, number> = {};
    const eligibleVoters = this.state.players.filter(p => p.isAlive && !(this.state.tieVotersExcluded || []).includes(p.id) && p.id !== this.state.courtesanBlockedPlayerId);

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
        this.awardPlayerXp(candidateId, 25, 'Оправдание на суде', 'defense_survived');
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
                this.awardPlayerXp(p.id, 30, `Точный голос против ${evilLabel}`, 'accurate_vote_mafia');
              }
            }
          });

          // Award XP to player who nominated them
          if (eliminated.nominatedBy) {
            const nominator = this.state.players.find(p => p.id === eliminated.nominatedBy);
            if (nominator && nominator.isAlive && nominator.id !== eliminated.id) {
              const nomIsMafia = nominator.role === 'mafia' || nominator.role === 'don';
              if (!nomIsMafia || isManiac) {
                this.awardPlayerXp(nominator.id, 20, `Успешное обвинение ${evilLabel}`, 'successful_nomination');
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
    this.state.courtesanBlockedPlayerId = null; // Reset daytime block when night begins
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

    if (this.state.courtesanBlockedPlayerId) {
      const blocked = this.state.players.find(p => p.id === this.state.courtesanBlockedPlayerId);
      this.addLog(`💋 Путана провела ночь с игроком ${blocked?.name || 'Горожанин'}. Игрок лишён права голоса, слова, чата и медиа на весь день.`);
    }

    // Award XP for night role actions
    // 1. Sheriff Investigation
    if (this.nightActions.sheriffCheck) {
      const sheriff = this.state.players.find(p => p.role === 'sheriff');
      if (sheriff && result.sheriffInvestigation) {
        if (result.sheriffInvestigation.isMafia) {
          this.awardPlayerXp(sheriff.id, 45, 'Шериф: поимка мафии', 'sheriff_found_mafia');
        } else {
          this.awardPlayerXp(sheriff.id, 15, 'Шериф: проверка жителя', 'sheriff_found_mafia');
        }
      }
    }

    // 2. Don Investigation
    if (this.nightActions.donCheck) {
      const don = this.state.players.find(p => p.role === 'don');
      if (don && result.donInvestigation) {
        if (result.donInvestigation.isSheriff) {
          this.awardPlayerXp(don.id, 45, 'Дон: вычисление шерифа', 'don_found_sheriff');
        } else {
          this.awardPlayerXp(don.id, 15, 'Дон: ночной поиск', 'don_found_sheriff');
        }
      }
    }

    const resolvedMafiaTargetId = MafiaEngine.resolveMafiaKillTarget(this.state, this.nightActions);

    // 3. Doctor Heal
    const healedId = result.healedPlayerIds[0];
    if (healedId) {
      const doctor = this.state.players.find(p => p.role === 'doctor');
      if (doctor) {
        const wasAttacked = resolvedMafiaTargetId === healedId || this.nightActions.maniacKill === healedId;
        if (wasAttacked) {
          this.awardPlayerXp(doctor.id, 60, 'Доктор: спасение жизни', 'doctor_heal_saved');
        } else {
          this.awardPlayerXp(doctor.id, 10, 'Доктор: ночное дежурство', 'doctor_heal_saved');
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
          this.awardPlayerXp(courtesan.id, 35, 'Путана: выбор ключевой роли', 'courtesan_blocked');
        } else {
          this.awardPlayerXp(courtesan.id, 15, 'Путана: ночной визит', 'courtesan_blocked');
        }
      }
    }

    // 5. Bodyguard Protection
    if (this.nightActions.bodyguardProtect) {
      const bodyguard = this.state.players.find(p => p.role === 'bodyguard');
      if (bodyguard) {
        const protId = this.nightActions.bodyguardProtect;
        const wasAttacked = resolvedMafiaTargetId === protId || this.nightActions.maniacKill === protId;
        if (wasAttacked) {
          this.awardPlayerXp(bodyguard.id, 60, 'Телохранитель: защита цели', 'bodyguard_protected');
        } else {
          this.awardPlayerXp(bodyguard.id, 15, 'Телохранитель: ночная охрана', 'bodyguard_protected');
        }
      }
    }

    // 6. Mafia & Maniac Kills
    if (result.killedPlayerIds.length > 0) {
      this.state.players.filter(p => p.isAlive && (p.role === 'mafia' || p.role === 'don')).forEach(maf => {
        const vote = this.nightActions.mafiaVotes[maf.id];
        if (vote && result.killedPlayerIds.includes(vote)) {
          this.awardPlayerXp(maf.id, 25, 'Мафия: ночной отстрел', 'mafia_kill_success');
        }
      });

      const maniac = this.state.players.find(p => p.isAlive && p.role === 'maniac');
      if (maniac && this.nightActions.maniacKill && result.killedPlayerIds.includes(this.nightActions.maniacKill)) {
        this.awardPlayerXp(maniac.id, 30, 'Маньяк: успешная охота', 'mafia_kill_success');
      }
    }

    // If no alive players remain after resolving night actions -> immediate Draw
    if (this.state.players.filter(p => p.isAlive).length === 0) {
      this.endGame('draw');
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
      // Sort multiple killed players in ascending order of their table slot (index in players array)
      const sortedKilledIds = [...killedIds].sort((a, b) => {
        const indexA = this.state.players.findIndex(p => p.id === a);
        const indexB = this.state.players.findIndex(p => p.id === b);
        return indexA - indexB;
      });
      this.lastWordsQueue = sortedKilledIds;
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

  private endGame(winner: GameWinner) {
    if (this.isClosed || this.state.phase === 'GAME_OVER' || this.matchResultsSaved) {
      return;
    }
    this.matchResultsSaved = true;
    this.state.phase = 'GAME_OVER';
    this.state.winner = winner;
    this.state.phaseTimeRemaining = 0;
    this.state.currentSpeakerId = null;

    if (winner === 'draw') {
      this.addLog('⚖️ Игра окончена! В городе не осталось живых игроков — объявлена ничья!');
    } else {
      const teamNames: Record<Team, string> = {
        civilians: 'Мирные жители',
        mafia: 'Мафия',
        maniac: 'Маньяк'
      };
      this.addLog(`🏆 Игра окончена! Победу одержали ${teamNames[winner]}!`);
    }

    if (this.state.closingAfterMatch) {
      this.addLog('⏳ Ведущий ранее покинул стол. Комната автоматически закроется через 10 секунд.');
      this.schedulePostMatchClose();
    }

    // Snapshot match state before async DB work so fast restart cannot corrupt or duplicate rewards
    const playersSnapshot = this.state.players.map(p => ({ ...p }));
    const humanParticipantIdsSnapshot = this.collectHumanParticipantIds(playersSnapshot);
    const roundsSnapshot = Math.max(1, this.state.dayNumber || 1);
    const sessionXpSnapshot = new Map(this.playerSessionXp);
    const isDraw = winner === 'draw';

    // Record game statistics and credit XP to real human players in user database
    const statsTask = (async () => {
      try {
        for (const p of playersSnapshot) {
          if (p.isBot) continue;
          const isMafia = p.role === 'mafia' || p.role === 'don';
          const isManiac = p.role === 'maniac';
          const playerTeam: Team = isMafia ? 'mafia' : isManiac ? 'maniac' : 'civilians';
          const won = !isDraw && playerTeam === winner;
          const rounds = roundsSnapshot;
          const survivalTime = p.isAlive ? rounds * 120 : Math.max(60, (rounds - 1) * 120 + 45);

          const sessionXp = sessionXpSnapshot.get(p.id);
          const customAwards = sessionXp ? {
            totalXp: sessionXp.totalXp,
            reasons: sessionXp.awards.map(a => ({ reason: a.reason, xp: a.xp }))
          } : undefined;

          const res = await userDb.recordGameResult(
            p.id,
            won,
            playerTeam,
            p.role,
            p.isAlive,
            survivalTime,
            rounds,
            customAwards,
            isDraw
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
              isDraw,
              survived: p.isAlive,
              awards: [
                { reason: 'Участие в партии', xp: experienceDb.getActionXp('participation', 50) },
                ...(won ? [{ reason: 'Победа в матче', xp: experienceDb.getActionXp('win', 120) }] : []),
                ...(isDraw ? [{ reason: 'Ничья в матче', xp: 0 }] : []),
                ...(p.isAlive ? [{ reason: 'Выживание до конца', xp: experienceDb.getActionXp('survival', 40) }] : []),
                ...(sessionXp ? sessionXp.awards.map(a => ({ reason: a.reason, xp: a.xp })) : [])
              ]
            };
            if (this.state.phase === 'GAME_OVER') {
              this.gameOverRewards.set(p.id, rewardPayload);
            }

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
            const userObj = await userDb.getUserById(p.id);
            const otherUsers = await Promise.all(
              playersSnapshot
                .filter(other => other.id !== p.id && !other.isBot)
                .map(other => userDb.getUserById(other.id))
            );
            const hasClanMate = Boolean(
              userObj?.clanId &&
              otherUsers.some(u => u?.clanId === userObj.clanId)
            );

            await eventsDb.trackAction(p.id, 'play_matches', 1);
            if (won) await eventsDb.trackAction(p.id, 'win_matches', 1);
            if (p.role) await eventsDb.trackAction(p.id, 'play_role', 1, { role: p.role });
            if (rounds > 0) await eventsDb.trackAction(p.id, 'survive_rounds', rounds);
            if (hasClanMate) await eventsDb.trackAction(p.id, 'play_with_clan_member', 1, { hasClanMate: true });
          } catch (err) {
            console.error('Error tracking task progress for player:', err);
          }
        }
      } catch (e) {
        console.error('Error saving game stats to userDb:', e);
      } finally {
        this.activeEndGameStatsPromise = null;
        await this.runMatchEndDeletionTransition(humanParticipantIdsSnapshot, 'game_over');
      }
    })();
    this.activeEndGameStatsPromise = statsTask;

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
    // Text chat is disabled during active match
  }

  private triggerBotSpeech(botId: string) {
    const bot = this.state.players.find(p => p.id === botId);
    if (!bot) return;

    const speechTimeout = setTimeout(() => {
      if (this.state.phase !== 'INDIVIDUAL_SPEECHES' || this.state.currentSpeakerId !== botId) return;

      const phrase = BOT_DAY_PHRASES[Math.floor(Math.random() * BOT_DAY_PHRASES.length)];
      this.addLog(`🎙️ ${bot.name}: «${phrase}»`);

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
      const bot = this.state.players.find(p => p.id === botId);
      this.addLog(`🎙️ ${bot?.name || 'Горожанин'}: «Я честный гражданин города! Прошу вас, не совершайте фатальную ошибку.»`);

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
      const bot = this.state.players.find(p => p.id === botId);
      this.addLog(`🎙️ ${bot?.name || 'Горожанин'}: «Моя совесть чиста. Город обязательно избавится от мафии!»`);

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
            const aliveDon = alivePlayers.find(p => p.role === 'don');
            const donVoteId = aliveDon ? this.nightActions.mafiaVotes[aliveDon.id] : undefined;
            const existingTeamVoteId =
              (donVoteId && nonMafia.some(p => p.id === donVoteId) ? donVoteId : undefined) ||
              Object.entries(this.nightActions.mafiaVotes)
                .map(([voterId, targetId]) => {
                  const voter = alivePlayers.find(p => p.id === voterId && (p.role === 'mafia' || p.role === 'don'));
                  return voter && nonMafia.some(p => p.id === targetId) ? targetId : undefined;
                })
                .find((id): id is string => Boolean(id));

            const targetId = existingTeamVoteId || nonMafia[Math.floor(Math.random() * nonMafia.length)].id;
            this.nightActions.mafiaVotes[bot.id] = targetId;
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
          const healablePlayers = alivePlayers.filter(p => p.id !== this.state.doctorLastHealedPlayerId);
          if (healablePlayers.length > 0) {
            const target = healablePlayers[Math.floor(Math.random() * healablePlayers.length)];
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
      isRegistered: false,
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

  public removeBot(requesterId: string, botId: string): boolean {
    if (this.isClosed || this.state.closingAfterMatch) return false;
    if (this.state.phase !== 'LOBBY') return false;
    if (!requesterId || !botId || typeof botId !== 'string') return false;

    const requester = this.state.players.find(p => p.id === requesterId);
    const isRequesterHost = this.state.hostId === requesterId && Boolean(requester?.isHost);
    if (!isRequesterHost) return false;

    const targetPlayer = this.state.players.find(p => p.id === botId);
    if (!targetPlayer || targetPlayer.isBot !== true) return false;

    this.removePlayer(botId);
    return true;
  }

  public transferHost(currentHostId: string, targetPlayerId: string): { success: boolean; message: string } {
    if (this.isClosed) {
      return { success: false, message: 'Комната закрыта.' };
    }
    if (this.state.closingAfterMatch) {
      return { success: false, message: 'Ведущий уже покинул комнату, передача прав недоступна.' };
    }
    if (!currentHostId || !targetPlayerId) {
      return { success: false, message: 'Не указан получатель прав ведущего.' };
    }
    if (currentHostId === targetPlayerId) {
      return { success: false, message: 'Нельзя передать права ведущего самому себе.' };
    }

    const currentHost = this.state.players.find(p => p.id === currentHostId);
    const isRequesterHost = this.state.hostId === currentHostId && Boolean(currentHost?.isHost);
    if (!isRequesterHost || !currentHost) {
      return { success: false, message: 'Только текущий ведущий может передать права управления комнатой.' };
    }

    if (this.spectators.has(targetPlayerId)) {
      return { success: false, message: 'Нельзя передать права ведущего зрителю.' };
    }

    const targetPlayer = this.state.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) {
      return { success: false, message: 'Получатель должен быть игроком комнаты.' };
    }
    if (targetPlayer.isBot) {
      return { success: false, message: 'Нельзя передать права ведущего боту.' };
    }
    if (!targetPlayer.connected) {
      return { success: false, message: 'Получатель прав ведущего должен иметь активное соединение.' };
    }

    this.state.players.forEach(p => {
      p.isHost = false;
    });
    targetPlayer.isHost = true;
    this.state.hostId = targetPlayer.id;
    this.clearHostDisconnectTimer();

    this.addLog(`👑 Ведущий ${currentHost.name} передал права управления комнатой игроку ${targetPlayer.name}.`);
    this.broadcastState();
    return {
      success: true,
      message: `Права ведущего переданы игроку ${targetPlayer.name}.`
    };
  }

  public handlePlayerDisconnect(playerId: string) {
    if (this.isClosed) return;
    this.sockets.delete(playerId);

    if (this.isSpectator(playerId)) {
      this.removeSpectator(playerId);
      return;
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    player.connected = false;

    const isHostPlayer = this.state.hostId === playerId || Boolean(player.isHost);
    const anyConnectedHuman = this.state.players.some(p => !p.isBot && p.connected);

    if (isHostPlayer) {
      this.startHostDisconnectTimer(playerId);
    } else if (!this.state.hostId && !anyConnectedHuman && !this.postMatchCloseTimeout) {
      this.startHostDisconnectTimer('');
    }

    this.broadcastState();
  }

  public handlePlayerReconnect(
    playerId: string,
    playerName?: string,
    userRec?: { clanTag?: string | null; clanName?: string | null } | null
  ): boolean {
    if (this.isClosed) return false;
    const existingPlayer = this.state.players.find(p => p.id === playerId);
    if (!existingPlayer) return false;

    existingPlayer.connected = true;
    if (playerName) {
      existingPlayer.name = playerName;
    }
    if (userRec !== undefined) {
      existingPlayer.isRegistered = Boolean(userRec);
      if (userRec) {
        existingPlayer.clanTag = userRec.clanTag || null;
        existingPlayer.clanName = userRec.clanName || null;
      }
    }

    if (this.state.hostId === playerId || existingPlayer.isHost) {
      this.clearHostDisconnectTimer();
    }

    return true;
  }

  public removePlayer(playerId: string) {
    if (this.isClosed) return;
    if (this.kickingPlayerIds.has(playerId)) return;
    const idx = this.state.players.findIndex(p => p.id === playerId);
    if (idx === -1) return;

    const player = this.state.players[idx];
    const wasHost = this.state.hostId === playerId || Boolean(player.isHost);

    // Voluntary host exit in LOBBY without prior host transfer closes the room immediately
    if (wasHost && this.state.phase === 'LOBBY') {
      this.addLog(`Ведущий ${player.name} покинул комнату. Стол закрыт.`);
      this.closeRoom('Ведущий покинул комнату. Стол закрыт.');
      return;
    }

    this.state.players.splice(idx, 1);
    this.sockets.delete(playerId);
    this.addLog(`Игрок ${player.name} покинул комнату.`);

    this.speechSpeakerQueue = this.speechSpeakerQueue.filter(id => id !== playerId);
    this.defenseSpeakerQueue = this.defenseSpeakerQueue.filter(id => id !== playerId);
    this.lastWordsQueue = this.lastWordsQueue.filter(id => id !== playerId);
    this.state.nominatedPlayerIds = (this.state.nominatedPlayerIds || []).filter(id => id !== playerId);
    this.state.defenseCandidates = (this.state.defenseCandidates || []).filter(id => id !== playerId);
    this.state.tieVotersExcluded = (this.state.tieVotersExcluded || []).filter(id => id !== playerId);
    this.state.phaseSkipVotedIds = (this.state.phaseSkipVotedIds || []).filter(id => id !== playerId);
    this.state.nightActionsCompleted = (this.state.nightActionsCompleted || []).filter(id => id !== playerId);
    if (this.nightActions?.mafiaVotes) {
      delete this.nightActions.mafiaVotes[playerId];
    }

    // Voluntary host exit during an active match:
    // Never auto-assign a new host; mark room for closure 10 seconds after match completion.
    if (wasHost) {
      this.clearHostDisconnectTimer();
      this.state.hostId = '';
      this.state.players.forEach(p => {
        p.isHost = false;
      });
      this.state.closingAfterMatch = true;

      if (this.state.phase === 'GAME_OVER') {
        this.addLog(`⚠️ Ведущий ${player.name} покинул стол. Комната автоматически закроется через 10 секунд.`);
        this.schedulePostMatchClose();
      } else {
        this.addLog(`⚠️ Ведущий ${player.name} покинул стол. Партия продолжится до завершения, после чего комната закроется через 10 секунд.`);
      }
    }

    this.broadcastState();
  }

  public async kickPlayer(
    requesterId: string,
    targetPlayerId: string
  ): Promise<{
    success: boolean;
    message: string;
    kickedPlayer?: Player;
    kickedSocket?: WebSocket;
    refundedRoleCard?: boolean;
    updatedUser?: any;
  }> {
    if (this.isClosed || this.state.closingAfterMatch) {
      return { success: false, message: 'Комната закрыта.' };
    }
    if (this.state.phase !== 'LOBBY') {
      return { success: false, message: 'Исключение игрока доступно только в комнате ожидания до начала партии.' };
    }
    if (!requesterId || !targetPlayerId || typeof targetPlayerId !== 'string') {
      return { success: false, message: 'Не указан исключаемый игрок.' };
    }

    const requester = this.state.players.find(p => p.id === requesterId);
    const isRequesterHost = this.state.hostId === requesterId && Boolean(requester?.isHost);
    if (!isRequesterHost || !requester) {
      return { success: false, message: 'Только ведущий комнаты может исключать игроков.' };
    }

    if (requesterId === targetPlayerId) {
      return { success: false, message: 'Ведущий не может исключить самого себя.' };
    }

    const targetPlayer = this.state.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) {
      return { success: false, message: 'Игрок не найден за столом комнаты ожидания.' };
    }

    if (targetPlayer.isHost || this.state.hostId === targetPlayer.id) {
      return { success: false, message: 'Нельзя исключить ведущего комнаты.' };
    }

    if (targetPlayer.isBot) {
      return { success: false, message: 'Для удаления бота используйте действие удаления бота.' };
    }

    if (this.kickingPlayerIds.has(targetPlayerId)) {
      return { success: false, message: 'Исключение этого игрока уже выполняется.' };
    }

    this.kickingPlayerIds.add(targetPlayerId);
    try {
      let refundedRoleCard = false;
      let updatedUser: any = undefined;

      if (targetPlayer.hasUsedRoleCard) {
        if (!targetPlayer.roleCardUsageKey) {
          targetPlayer.roleCardUsageKey = `rcu_${this.state.roomCode}_${targetPlayer.id}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        }
        try {
          const refundRes = await userDb.refundRoleCardFromRoom(
            targetPlayer.id,
            targetPlayer.roleCardUsageKey,
            this.state.roomCode
          );
          refundedRoleCard = refundRes.refunded;
          updatedUser = refundRes.user;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Ошибка возврата карточки выбора роли.';
          return {
            success: false,
            message: `Не удалось вернуть карточку выбора роли исключаемому игроку (${errMsg}). Исключение отменено.`
          };
        }
      }

      if (this.isClosed || this.state.closingAfterMatch || this.state.phase !== 'LOBBY') {
        return {
          success: false,
          message: 'Состояние комнаты изменилось до завершения исключения.',
          refundedRoleCard,
          updatedUser
        };
      }

      const idx = this.state.players.findIndex(p => p.id === targetPlayerId);
      if (idx === -1) {
        return {
          success: false,
          message: 'Игрок уже покинул комнату.',
          refundedRoleCard,
          updatedUser
        };
      }

      const playerToRemove = this.state.players[idx];
      playerToRemove.hasUsedRoleCard = false;
      playerToRemove.preferredRole = null;
      playerToRemove.roleCardUsageKey = null;

      const kickedSocket = this.sockets.get(targetPlayerId);
      this.state.players.splice(idx, 1);
      this.sockets.delete(targetPlayerId);

      this.speechSpeakerQueue = this.speechSpeakerQueue.filter(id => id !== targetPlayerId);
      this.defenseSpeakerQueue = this.defenseSpeakerQueue.filter(id => id !== targetPlayerId);
      this.lastWordsQueue = this.lastWordsQueue.filter(id => id !== targetPlayerId);
      this.state.nominatedPlayerIds = (this.state.nominatedPlayerIds || []).filter(id => id !== targetPlayerId);
      this.state.defenseCandidates = (this.state.defenseCandidates || []).filter(id => id !== targetPlayerId);
      this.state.tieVotersExcluded = (this.state.tieVotersExcluded || []).filter(id => id !== targetPlayerId);
      this.state.phaseSkipVotedIds = (this.state.phaseSkipVotedIds || []).filter(id => id !== targetPlayerId);
      this.state.nightActionsCompleted = (this.state.nightActionsCompleted || []).filter(id => id !== targetPlayerId);
      if (this.nightActions?.mafiaVotes) {
        delete this.nightActions.mafiaVotes[targetPlayerId];
      }

      this.addLog(`🚪 Ведущий ${requester.name} исключил игрока ${playerToRemove.name} из комнаты.`);
      this.addChatMessage('system', `🚪 Ведущий исключил игрока ${playerToRemove.name} из комнаты.`, 'system');
      this.broadcastChat();
      this.broadcastState();

      return {
        success: true,
        message: `Игрок ${playerToRemove.name} исключён из комнаты.`,
        kickedPlayer: playerToRemove,
        kickedSocket,
        refundedRoleCard,
        updatedUser
      };
    } finally {
      this.kickingPlayerIds.delete(targetPlayerId);
    }
  }

  public addSpectator(spectator: Spectator) {
    if (this.isClosed) return;
    this.spectators.set(spectator.id, spectator);
    this.state.spectators = Array.from(this.spectators.values());
    this.state.spectatorCount = this.spectators.size;
    this.addLog(`👁️ ${spectator.name} присоединился к столу в качестве зрителя.`);
    this.addChatMessage('system', `👁️ ${spectator.name} подключился к наблюдению за партией.`, 'system');
    this.broadcastState();
  }

  public removeSpectator(spectatorId: string) {
    if (this.isClosed) return;
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

  public async becomePlayerFromSpectator(spectatorId: string, name: string): Promise<boolean> {
    if (this.isClosed || this.state.closingAfterMatch) return false;
    if (this.state.phase !== 'LOBBY') return false;
    if (this.state.players.length >= this.state.settings.maxPlayers) return false;
    if (this.state.players.some(p => p.id === spectatorId)) return true;

    const actionCheck = await accountDeletionDb.checkUserActionAllowed(spectatorId, 'room_join');
    if (!actionCheck.allowed) {
      return false;
    }

    const spec = this.spectators.get(spectatorId);
    const userRec = await userDb.getUserById(spectatorId);

    this.spectators.delete(spectatorId);
    this.state.spectators = Array.from(this.spectators.values());
    this.state.spectatorCount = this.spectators.size;

    this.state.players.push({
      id: spectatorId,
      name: name || spec?.name || 'Игрок',
      avatarSeed: name || spec?.name || 'Игрок',
      isHost: false,
      isBot: false,
      isRegistered: Boolean(userRec || spec?.isRegistered),
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
    if (this.isClosed || this.state.closingAfterMatch) return false;
    if (this.state.phase !== 'LOBBY') return false;
    if (this.kickingPlayerIds.has(playerId)) return false;
    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return false;

    const player = this.state.players[playerIndex];
    // Host cannot switch to spectator without first transferring host rights to another player
    if (player.isHost || this.state.hostId === playerId) {
      return false;
    }

    this.state.players.splice(playerIndex, 1);
    this.spectators.set(playerId, {
      id: player.id,
      name: player.name,
      avatarSeed: player.avatarSeed || player.name,
      isRegistered: Boolean(player.isRegistered),
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

  public async selectPreferredRole(playerId: string, roleId: RoleId, token?: string): Promise<{ success: boolean; message: string; user?: any }> {
    if (this.state.phase !== 'LOBBY') {
      return { success: false, message: 'Выбор роли доступен только в лобби до начала игры.' };
    }
    if (this.kickingPlayerIds.has(playerId)) {
      return { success: false, message: 'Действие недоступно: выполняется исключение из комнаты.' };
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, message: 'Игрок не найден в комнате.' };
    }

    const roleCheck = await accountDeletionDb.checkUserActionAllowed(playerId, 'item_use');
    if (!roleCheck.allowed) {
      return { success: false, message: roleCheck.message || 'Действие недоступно: аккаунт ожидает удаления.' };
    }

    const availableRoles = MafiaEngine.getAvailableRolesForRoom(this.state.settings, this.state.players.length);
    if (!availableRoles.includes(roleId)) {
      return { success: false, message: 'Выбранная роль недоступна в текущих настройках комнаты.' };
    }

    let updatedUser = undefined;
    if (!player.hasUsedRoleCard) {
      if (token) {
        const user = await userDb.getUserByToken(token);
        if (!user) {
          return { success: false, message: 'Требуется авторизация для использования предметов из инвентаря.' };
        }
        try {
          const res = await userDb.useRoleCardInRoom(user.id);
          updatedUser = res.user;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Не удалось использовать Карточку выбора роли.';
          return { success: false, message: msg };
        }
      }
      player.hasUsedRoleCard = true;
      player.roleCardUsageKey = `rcu_${this.state.roomCode}_${player.id}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
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
    if (this.isClosed || this.state.closingAfterMatch) return false;
    if (this.kickingPlayerIds.size > 0) return false;
    const requester = this.state.players.find(p => p.id === requesterId);
    const isRequesterHost = this.state.hostId === requesterId && Boolean(requester?.isHost);
    if (!isRequesterHost) return false;
    if (this.state.phase !== 'LOBBY') return false;
    if (this.state.players.length < 4) return false;

    this.matchResultsSaved = false;
    this.pendingDeletionTransitionDone = false;
    this.clearPostMatchCloseTimer();
    this.state.closingAfterMatch = false;
    this.state.closingCountdownSeconds = null;

    // Distribute roles taking Role Card preferences into account
    this.state.players = MafiaEngine.distributeRoles(this.state.players, this.state.settings);
    // Reset preferences for future matches
    this.state.players.forEach(p => {
      p.preferredRole = null;
      p.hasUsedRoleCard = false;
      p.roleCardUsageKey = null;
    });

    this.state.phase = 'ROLE_REVEAL';
    this.state.phaseTimeRemaining = 15;
    this.state.dayNumber = 0;
    this.state.winner = null;
    this.state.nominatedPlayerIds = [];
    this.state.currentSpeakerId = null;
    this.state.courtesanBlockedPlayerId = null;
    this.state.doctorLastHealedPlayerId = null;
    this.state.lastNightResult = undefined;
    this.state.lastEliminatedPlayer = null;
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

  public restartGame(requesterId: string, isPlayAgain: boolean = false): boolean {
    if (this.isClosed || this.state.closingAfterMatch) return false;
    const requester = this.state.players.find(p => p.id === requesterId);
    const isRequesterHost = this.state.hostId === requesterId && Boolean(requester?.isHost);
    if (!isRequesterHost) return false;

    const prevPhase = this.state.phase;
    const wasGameOver = prevPhase === 'GAME_OVER' || isPlayAgain;
    const humanIdsSnapshot = this.collectHumanParticipantIds();

    this.matchResultsSaved = false;
    this.clearPostMatchCloseTimer();
    this.state.closingAfterMatch = false;
    this.state.closingCountdownSeconds = null;

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
    this.state.courtesanBlockedPlayerId = null;
    this.state.doctorLastHealedPlayerId = null;
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
      p.roleCardUsageKey = null;
      p.votedFor = null;
      p.nominatedBy = null;
    });

    this.playerSessionXp.clear();
    this.gameOverRewards.clear();

    if (wasGameOver) {
      this.addLog(`🔄 Ведущий запустил подготовку к новой партии. Стол возвращён в лобби.`);
      this.addChatMessage('system', `🔄 Партия завершена. Ведущий вернул стол в режим сбора для новой игры.`, 'system');
    } else {
      this.addLog(`🛑 Ведущий досрочно остановил партию. Возврат в лобби.`);
      this.addChatMessage('system', `🛑 Ведущий досрочно остановил партию. Стол возвращён в режим сбора игроков.`, 'system');
    }
    this.broadcastState();

    if (prevPhase !== 'LOBBY' && !this.pendingDeletionTransitionDone) {
      const statsPromise = this.activeEndGameStatsPromise;
      if (statsPromise) {
        void statsPromise.finally(() => {
          void this.runMatchEndDeletionTransition(humanIdsSnapshot, 'stopped');
        });
      } else {
        void this.runMatchEndDeletionTransition(humanIdsSnapshot, 'stopped');
      }
    }

    return true;
  }

  public skipPhase(requesterId: string): boolean {
    const player = this.state.players.find(p => p.id === requesterId);
    if (!player || !player.isAlive) return false;

    switch (this.state.phase) {
      case 'ROLE_REVEAL': {
        if (player.isHost) {
          this.advancePhase();
          return true;
        }
        if (!this.state.phaseSkipVotedIds) this.state.phaseSkipVotedIds = [];
        if (!this.state.phaseSkipVotedIds.includes(requesterId)) {
          this.state.phaseSkipVotedIds.push(requesterId);
        }
        const humanAliveCount = this.state.players.filter(p => !p.isBot && p.isAlive).length;
        if (this.state.phaseSkipVotedIds.length >= humanAliveCount) {
          this.advancePhase();
        } else {
          this.broadcastState();
        }
        return true;
      }

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

        if (this.state.courtesanBlockedPlayerId === requesterId) {
          return false;
        }

        // If player has not chosen anyone yet, mark 'skip' (abstain)
        // If player already made a choice, this confirms their vote/readiness
        if (!player.votedFor) {
          player.votedFor = 'skip';
        }

        const eligible = this.state.phase === 'REVOTE'
          ? this.state.players.filter(p => p.isAlive && !(this.state.tieVotersExcluded || []).includes(p.id) && p.id !== this.state.courtesanBlockedPlayerId)
          : this.state.players.filter(p => p.isAlive && p.id !== this.state.courtesanBlockedPlayerId);

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
    if (this.state.courtesanBlockedPlayerId === nominatorId) {
      return false;
    }

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

    // Blocked by courtesan cannot vote!
    if (this.state.courtesanBlockedPlayerId === voterId) {
      return false;
    }

    // Tie voting exclusion
    if (this.state.phase === 'REVOTE' && (this.state.tieVotersExcluded || []).includes(voterId)) {
      return false;
    }

    const voter = this.state.players.find(p => p.id === voterId);
    if (!voter || !voter.isAlive) return false;

    voter.votedFor = targetId;

    // Check if all eligible players voted
    const eligible = this.state.phase === 'REVOTE'
      ? this.state.players.filter(p => p.isAlive && !(this.state.tieVotersExcluded || []).includes(p.id) && p.id !== this.state.courtesanBlockedPlayerId)
      : this.state.players.filter(p => p.isAlive && p.id !== this.state.courtesanBlockedPlayerId);

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
    const target = this.state.players.find(p => p.id === targetId && p.isAlive);
    if (!target) return false;

    switch (actionType) {
      case 'mafia_kill':
        if (actor.role !== 'mafia' && actor.role !== 'don') return false;
        this.nightActions.mafiaVotes[actorId] = targetId;
        // If a human mafia/don player selects a target, align any bot mafia teammates that already voted tonight
        if (!actor.isBot) {
          this.state.players.forEach(p => {
            if (p.isBot && p.isAlive && (p.role === 'mafia' || p.role === 'don') && this.nightActions.mafiaVotes[p.id]) {
              this.nightActions.mafiaVotes[p.id] = targetId;
            }
          });
        }
        break;
      case 'don_check':
        if (actor.role !== 'don') return false;
        this.nightActions.donCheck = targetId;
        break;
      case 'sheriff_check':
        if (actor.role !== 'sheriff') return false;
        this.nightActions.sheriffCheck = targetId;
        break;
      case 'doctor_heal':
        if (actor.role !== 'doctor') return false;
        // Approved rule: Doctor cannot heal the same player two nights in a row (including themselves)
        if (this.state.doctorLastHealedPlayerId && targetId === this.state.doctorLastHealedPlayerId) {
          return false;
        }
        this.nightActions.doctorHeal = targetId;
        break;
      case 'courtesan_block':
        if (actor.role !== 'courtesan') return false;
        if (targetId === actorId) return false;
        this.nightActions.courtesanBlock = targetId;
        break;
      case 'maniac_kill':
        if (actor.role !== 'maniac') return false;
        this.nightActions.maniacKill = targetId;
        break;
      case 'bodyguard_protect':
        if (actor.role !== 'bodyguard') return false;
        this.nightActions.bodyguardProtect = targetId;
        break;
      default:
        return false;
    }

    if (!this.state.nightActionsCompleted) this.state.nightActionsCompleted = [];
    if (!this.state.nightActionsCompleted.includes(actorId)) {
      this.state.nightActionsCompleted.push(actorId);
    }

    this.broadcastState();
    return true;
  }

  public addChatMessage(senderId: string, text: string, channel: ChatMessage['channel']): boolean {
    // Reject any user text chat messages during active match across all game modes.
    // Text chat is strictly permitted only in the pre-game LOBBY phase.
    // System messages (senderId === 'system' or 'SYSTEM') are part of the official match protocol and remain allowed.
    if (senderId !== 'system' && senderId !== 'SYSTEM' && this.state.phase !== 'LOBBY') {
      return false;
    }

    const sender = this.state.players.find(p => p.id === senderId);
    const specSender = this.spectators.get(senderId);
    if (!sender && !specSender && senderId !== 'system' && senderId !== 'SYSTEM') return false;

    // Blocked by Courtesan cannot send chat messages
    if (sender && this.state.courtesanBlockedPlayerId === sender.id && channel !== 'system') {
      return false;
    }

    // Dead players cannot send messages in 'all' channel
    if (sender && !sender.isAlive && channel !== 'dead' && channel !== 'system') {
      return false;
    }

    const isSpectator = !!specSender && !sender;

    // Spectators can only post in 'all' channel
    if (isSpectator && channel !== 'all') {
      channel = 'all';
    }

    // Check channel permissions for players
    if (channel === 'mafia') {
      const isMafia = sender && (sender.role === 'mafia' || sender.role === 'don');
      const isGameOver = this.state.phase === 'GAME_OVER';
      if (!isMafia && !isGameOver) return false;
    }

    if (channel === 'dead') {
      const isDead = sender && !sender.isAlive;
      const isGameOver = this.state.phase === 'GAME_OVER';
      if (!isDead && !isGameOver) return false;
    }

    // Individual speeches chat restriction (only restricts players; spectators can comment without interrupting)
    if (channel === 'all' && this.state.phase === 'INDIVIDUAL_SPEECHES' && senderId !== 'system' && !isSpectator) {
      if (this.state.currentSpeakerId !== senderId) {
        // Not their turn to speak in all chat!
        return false;
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
    return true;
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
        isRegistered: Boolean(p.isRegistered),
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
      courtesanBlockedPlayerId: this.state.courtesanBlockedPlayerId,
      doctorLastHealedPlayerId: (me?.role === 'doctor' || isGameOver) ? (this.state.doctorLastHealedPlayerId ?? null) : null,
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
      closingAfterMatch: Boolean(this.state.closingAfterMatch),
      closingCountdownSeconds: this.state.closingCountdownSeconds ?? null,
      sessionXp: this.playerSessionXp.get(playerId)?.totalXp || 0,
      sessionXpAwards: this.playerSessionXp.get(playerId)?.awards || [],
      gameOverReward: this.gameOverRewards.get(playerId) || null
    };
  }

  public broadcastState() {
    if (this.isClosed) return;
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
      const humanIdsJson = JSON.stringify(this.collectHumanParticipantIds());
      db.execute({
        sql: `
          INSERT OR REPLACE INTO game_rooms (
            room_code, room_name, host_id, host_name, phase, player_count, max_players, in_game, winner, day_number, settings, spectators, players_json, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            COALESCE((SELECT created_at FROM game_rooms WHERE room_code = ?), ?),
            ?
          )
        `,
        args: [
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
          humanIdsJson,
          this.state.roomCode,
          now,
          now
        ]
      }).catch(() => {});
    } catch (e) {
      // Non-fatal logging
    }
  }

  public broadcastChat() {
    if (this.isClosed) return;
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
  public onDeletionTransitionsCallback?: (
    records: AccountDeletionRequestRecord[],
    roomCode: string,
    endType: 'game_over' | 'stopped' | 'closed'
  ) => Promise<void> | void;

  public createRoom(roomName: string, hostId: string, hostName: string, settings?: Partial<RoomSettings>, hostIsRegistered: boolean = false): Room {
    const code = this.generateRoomCode();
    const finalName = roomName?.trim() || `Комната #${code}`;
    const room = new Room(code, finalName, hostId, hostName, settings, hostIsRegistered);
    room.onCloseCallback = (closedCode) => {
      this.removeRoom(closedCode);
    };
    room.onDeletionTransitionsCallback = async (records, rCode, endType) => {
      if (this.onDeletionTransitionsCallback) {
        await this.onDeletionTransitionsCallback(records, rCode, endType);
      }
    };
    this.rooms.set(code, room);

    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      const humanIdsJson = JSON.stringify(
        hostId && !hostId.startsWith('bot_') && !hostId.startsWith('guest_') ? [hostId] : []
      );
      db.execute({
        sql: `
          INSERT OR REPLACE INTO game_rooms (
            room_code, room_name, host_id, host_name, phase, player_count, max_players, in_game, winner, day_number, settings, spectators, players_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
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
          humanIdsJson,
          now,
          now
        ]
      }).catch(() => {});
    } catch {}

    return room;
  }

  public getRoom(roomCode: string): Room | undefined {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (room && room.isClosed) {
      this.rooms.delete(code);
      return undefined;
    }
    return room;
  }

  public removeRoom(roomCode: string) {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (room) {
      this.rooms.delete(code);
      if (!room.isClosed) {
        room.closeRoom('Комната закрыта.');
      } else {
        room.destroy();
      }
    }
    try {
      const db = getDatabase();
      db.execute({
        sql: 'DELETE FROM game_rooms WHERE room_code = ?',
        args: [code]
      }).catch(() => {});
    } catch {}
  }

  public getPublicRooms(): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = [];
    this.rooms.forEach(room => {
      if (!room.isClosed && !room.state.closingAfterMatch && room.state.settings.isPublic) {
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

  public cleanupDeletedUser(userId: string): { removedFromRooms: string[]; closedRooms: string[] } {
    const cleanId = typeof userId === 'string' ? userId.trim() : '';
    const removedFromRooms: string[] = [];
    const closedRooms: string[] = [];
    if (!cleanId) return { removedFromRooms, closedRooms };

    const entries = Array.from(this.rooms.entries());
    for (const [code, room] of entries) {
      if (!room || room.isClosed) continue;

      let touched = false;
      const hadSocket = room.sockets.has(cleanId);

      if (room.isSpectator(cleanId)) {
        room.sockets.delete(cleanId);
        room.removeSpectator(cleanId);
        touched = true;
      }

      const isSeatedPlayer = room.state.players.some(p => p.id === cleanId);
      const isHost = room.state.hostId === cleanId;

      if ((isSeatedPlayer || isHost) && (room.state.phase === 'LOBBY' || room.state.phase === 'GAME_OVER')) {
        if (isSeatedPlayer) {
          room.removePlayer(cleanId);
        } else {
          room.sockets.delete(cleanId);
          room.closeRoom('Комната закрыта после удаления учётной записи ведущего.');
        }
        touched = true;
        if (room.isClosed) {
          closedRooms.push(code);
        }
      } else if (hadSocket && room.state.phase === 'LOBBY') {
        room.sockets.delete(cleanId);
        touched = true;
      }

      if (touched) {
        removedFromRooms.push(code);
        if (!room.isClosed) {
          const leaveMsg = JSON.stringify({
            type: 'SIGNAL_PEER_LEFT',
            payload: { peerId: cleanId },
          });
          room.sockets.forEach((targetWs) => {
            try {
              if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(leaveMsg);
              }
            } catch {}
          });
        }
      }
    }

    return { removedFromRooms, closedRooms };
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
