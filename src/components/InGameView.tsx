import React, { useState } from 'react';
import { ClientRoomState, ChatMessage, RoleId, Player } from '../types/mafia';
import { ROLE_DEFINITIONS } from '../data/roles';
import { GangsterIcon } from './GangsterIcon';
import { NavigationDrawer, NavDrawerTab } from './NavigationDrawer';
import { ShopModal } from './ShopModal';
import { PawnshopModal } from './PawnshopModal';
import { DailyBonusModal } from './DailyBonusModal';
import { SettingsModal } from './SettingsModal';
import { RoleRevealView } from './RoleRevealView';
import { NightPhaseView } from './NightPhaseView';
import { ReportPlayerModal } from './ReportPlayerModal';
import { ClansModal } from './ClansModal';
import { EventsModal } from './EventsModal';
import { EventFeedOverlay } from './EventFeedOverlay';
import { 
  Menu, 
  Volume2, 
  VolumeX, 
  FileText, 
  Gavel, 
  Clock, 
  Skull, 
  Crown, 
  Shield, 
  Send, 
  MessageSquare, 
  ScrollText, 
  Lock, 
  LogOut, 
  Check, 
  CheckCircle2, 
  AlertTriangle,
  Square,
  Mic,
  FastForward,
  Flame,
  Moon,
  Flag,
  MoreVertical,
  AtSign,
  Eye,
  Sparkles
} from 'lucide-react';
import { sounds } from '../utils/audio';
import noirLobbyBg from '../assets/images/noir_mafia_lobby_bg_1791204529068.jpg';
import { AuthUser } from './AuthModal';

interface InGameViewProps {
  roomState: ClientRoomState;
  myId: string;
  playerName: string;
  user: AuthUser | null;
  onUpdateUser?: (u: AuthUser) => void;
  soundEnabled: boolean;
  chatMessages: ChatMessage[];
  isLoggedIn: boolean;
  onNominatePlayer: (playerId: string) => void;
  onVotePlayer: (targetId: string | 'skip') => void;
  onSubmitNightAction: (actionType: string, targetId: string) => void;
  onSkipPhase: () => void;
  onSendMessage: (text: string, channel: ChatMessage['channel']) => void;
  onToggleSound: () => void;
  onOpenRules: () => void;
  onOpenNotebook: () => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenAdmin?: () => void;
  onLeaveRoom: () => void;
  onStopGame: () => void;
  onLogout: () => void;
}

const PHASE_LABELS: Record<string, { title: string; subtitle: string; color: string }> = {
  ROLE_REVEAL: { title: 'Раздача ролей', subtitle: 'Ознакомьтесь с картой', color: 'text-amber-400' },
  MAFIA_MEETING: { title: 'Знакомство мафии', subtitle: 'Ночная нулевая минута (1 минута)', color: 'text-rose-400' },
  DAY_DISCUSSION: { title: 'Общее собрание', subtitle: 'Открытые дебаты жителей', color: 'text-amber-400' },
  INDIVIDUAL_SPEECHES: { title: 'Индивидуальные речи', subtitle: 'Ораторы выступают по очереди', color: 'text-amber-500' },
  VOTING: { title: 'Городской суд', subtitle: 'Голосование за казнь', color: 'text-rose-500' },
  DEFENSE_SPEECH: { title: 'Оправдательные речи', subtitle: 'Ничья! Защитная речь кандидата', color: 'text-purple-400' },
  REVOTE: { title: 'Переголосование', subtitle: 'Повторное голосование при ничьей', color: 'text-rose-600' },
  LAST_WORDS_ARREST: { title: 'Последнее слово', subtitle: 'Осужденный судом города', color: 'text-rose-400' },
  NIGHT: { title: 'Ночная фаза', subtitle: 'Город засыпает. Просыпается мафия', color: 'text-blue-400' },
  MORNING_REPORT: { title: 'Утренние вести', subtitle: 'Итоги ночи в городской газете', color: 'text-emerald-400' },
  LAST_WORDS_KILLED: { title: 'Завещание', subtitle: 'Последнее слово убитого ночью', color: 'text-purple-400' },
  GAME_OVER: { title: 'Финал партии', subtitle: 'Победа определена', color: 'text-yellow-400' }
};

const QUICK_PHRASES = [
  'Я мирный житель!',
  'Обратите внимание на голосование!',
  'Почему он так нервничает?',
  'Давайте выслушаем аргументы.',
  'Шериф, проверь его ночью!',
  'Я голосую за город.'
];

export const InGameView: React.FC<InGameViewProps> = ({
  roomState,
  myId,
  playerName,
  user,
  onUpdateUser,
  soundEnabled,
  chatMessages,
  isLoggedIn,
  onNominatePlayer,
  onVotePlayer,
  onSubmitNightAction,
  onSkipPhase,
  onSendMessage,
  onToggleSound,
  onOpenRules,
  onOpenNotebook,
  onOpenProfile,
  onOpenAuth,
  onOpenAdmin,
  onLeaveRoom,
  onStopGame,
  onLogout
}) => {
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [isPawnshopOpen, setIsPawnshopOpen] = useState(false);
  const [isBonusOpen, setIsBonusOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClansOpen, setIsClansOpen] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [tasksDefaultTab, setTasksDefaultTab] = useState<'global' | 'onboarding' | 'personal' | 'clan'>('global');
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);

  // Player report and context menu state
  const [selectedPlayerForReport, setSelectedPlayerForReport] = useState<{ id: string; name: string } | null>(null);
  const [activePlayerMenuId, setActivePlayerMenuId] = useState<string | null>(null);

  // Chat channel state
  const [activeChannel, setActiveChannel] = useState<ChatMessage['channel']>('all');
  const [chatInput, setChatInput] = useState('');

  const myPlayer = roomState.players.find(p => p.id === myId);
  const isSpectator = Boolean(roomState.isSpectator || !myPlayer);
  const isHost = !isSpectator && (roomState.hostId === myId || myPlayer?.isHost === true);
  const isAlive = !isSpectator && (myPlayer?.isAlive ?? false);
  const isMafia = !isSpectator && (roomState.myRole === 'mafia' || roomState.myRole === 'don');
  const isGameOver = roomState.phase === 'GAME_OVER';

  const myRoleDef = roomState.myRole ? ROLE_DEFINITIONS[roomState.myRole] : null;
  const currentPhaseInfo = PHASE_LABELS[roomState.phase] || {
    title: 'Игра в процессе',
    subtitle: 'Партия активна',
    color: 'text-zinc-200'
  };

  // Vote counting
  const voteTallies: Record<string, number> = {};
  let skipVoteCount = 0;
  let totalVotesCount = 0;
  roomState.players.forEach(p => {
    if (p.votedFor === 'skip') {
      skipVoteCount++;
      totalVotesCount++;
    } else if (p.votedFor) {
      voteTallies[p.votedFor] = (voteTallies[p.votedFor] || 0) + 1;
      totalVotesCount++;
    }
  });

  const alivePlayers = roomState.players.filter(p => p.isAlive);
  const eligibleVoters = roomState.phase === 'REVOTE'
    ? alivePlayers.filter(p => !(roomState.tieVotersExcluded || []).includes(p.id))
    : alivePlayers;

  const isTieExcluded = roomState.phase === 'REVOTE' && (roomState.tieVotersExcluded || []).includes(myId);

  // Speaker check
  const isCurrentSpeaker = roomState.currentSpeakerId === myId;
  const currentSpeakerPlayer = roomState.players.find(p => p.id === roomState.currentSpeakerId);

  // Day 1 voting allowed check
  const isFirstDayNoVoting = roomState.dayNumber === 1 && !roomState.settings.firstDayVoting;

  const handleNominate = (targetId: string) => {
    onNominatePlayer(targetId);
    sounds.playGavel();
  };

  const handleVote = (targetId: string | 'skip') => {
    onVotePlayer(targetId);
    sounds.playGavel();
  };

  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage(chatInput.trim(), activeChannel);
    setChatInput('');
    sounds.playMessageSound();
  };

  const handleQuickPhrase = (phrase: string) => {
    onSendMessage(phrase, activeChannel);
    sounds.playMessageSound();
  };

  const handleSelectNavTab = (tab: NavDrawerTab) => {
    setIsNavDrawerOpen(false);
    switch (tab) {
      case 'lobby':
        onLeaveRoom();
        break;
      case 'profile':
        if (isLoggedIn) onOpenProfile();
        else onOpenAuth();
        break;
      case 'tasks':
        setTasksDefaultTab('global');
        setIsTasksOpen(true);
        break;
      case 'clans':
        setIsClansOpen(true);
        break;
      case 'shop':
        setIsShopOpen(true);
        break;
      case 'pawnshop':
        setIsPawnshopOpen(true);
        break;
      case 'bonus':
        setIsBonusOpen(true);
        break;
      case 'settings':
        setIsSettingsOpen(true);
        break;
      case 'admin':
        if (onOpenAdmin) onOpenAdmin();
        break;
      case 'logout':
        if (isLoggedIn) onLogout();
        else onOpenAuth();
        break;
    }
  };

  // Stable numeric ID
  const numericId = React.useMemo(() => {
    let hash = 0;
    for (let i = 0; i < myId.length; i++) {
      hash = (hash * 37 + myId.charCodeAt(i)) % 900000;
    }
    return Math.abs(hash) + 100000;
  }, [myId]);

  // Filter messages for current channel view
  const currentMessages = chatMessages.filter(m => {
    if (activeChannel === 'system') return m.channel === 'system';
    return m.channel === activeChannel;
  });

  // Chat permission logic
  let canSend = true;
  let sendDisabledReason = '';

  if (activeChannel === 'system') {
    canSend = false;
    sendDisabledReason = 'Журнал протоколируется ведущим';
  } else if (activeChannel === 'all') {
    if (isSpectator) {
      // Spectators can observe and chat freely in the common chat channel
      canSend = true;
    } else if (roomState.phase === 'NIGHT' && isAlive) {
      canSend = false;
      sendDisabledReason = 'Ночью город спит — говорить нельзя';
    } else if (roomState.phase === 'MAFIA_MEETING' && isAlive) {
      canSend = false;
      sendDisabledReason = 'Нулевая минута — город спит';
    } else if (roomState.phase === 'INDIVIDUAL_SPEECHES' && isAlive && !isCurrentSpeaker) {
      canSend = false;
      sendDisabledReason = `Сейчас говорит: ${currentSpeakerPlayer?.name || 'другой игрок'}`;
    } else if ((roomState.phase === 'DEFENSE_SPEECH' || roomState.phase === 'LAST_WORDS_ARREST' || roomState.phase === 'LAST_WORDS_KILLED') && isAlive && !isCurrentSpeaker) {
      canSend = false;
      sendDisabledReason = `Слово предоставлено игроку: ${currentSpeakerPlayer?.name || 'оратор'}`;
    } else if (!isAlive && !isGameOver) {
      canSend = false;
      sendDisabledReason = 'Мёртвые не могут писать живым';
    }
  } else if (activeChannel === 'mafia') {
    if (!isMafia && !isGameOver) {
      canSend = false;
      sendDisabledReason = 'Только для мафии';
    }
  } else if (activeChannel === 'dead') {
    if ((isAlive || isSpectator) && !isGameOver) {
      canSend = false;
      sendDisabledReason = 'Только для выбывших игроков';
    }
  }

  // General discussion skip calculation (70%)
  const skipCount = (roomState.phaseSkipVotedIds || []).length;
  const skipThreshold = Math.ceil(alivePlayers.length * 0.70);
  const hasUserSkipped = (roomState.phaseSkipVotedIds || []).includes(myId);

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center p-2 sm:p-5 bg-cover bg-center select-none"
      style={{ backgroundImage: `url(${noirLobbyBg})` }}
    >
      {/* Dark moody vignette overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] pointer-events-none" />

      {/* Main Center Console Card */}
      <div className="relative z-10 w-full max-w-[960px] bg-[#0d0e13]/94 border border-zinc-800/90 rounded-2xl sm:rounded-3xl shadow-2xl shadow-black overflow-hidden flex flex-col backdrop-blur-md">
        
        {/* Top Header inside console card */}
        <div className="px-5 py-3.5 border-b border-zinc-850 flex flex-wrap items-center justify-between gap-3 bg-[#111218]/92">
          
          {/* Left Brand: Gangster with Tommy Gun + MAFIA GAME */}
          <div className="flex items-center gap-3">
            <GangsterIcon size={36} className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 drop-shadow-md" />
            <div>
              <h1 className="font-sans font-bold tracking-widest text-white text-sm sm:text-base uppercase leading-none">
                MAFIA GAME
              </h1>
              <p className="text-[10px] text-amber-500 font-mono tracking-wider mt-0.5">
                СТОЛ #{roomState.roomCode}
              </p>
            </div>
          </div>

          {/* Center: Phase Title, Subtitle & Round Timer */}
          <div className="flex items-center gap-3 bg-[#161722] border border-zinc-800 px-3.5 py-1.5 rounded-xl shadow-inner">
            <div className="text-left sm:text-center">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                {roomState.dayNumber > 0 && (
                  <span className="text-zinc-400 font-medium">День {roomState.dayNumber} ·</span>
                )}
                <span className={currentPhaseInfo.color}>{currentPhaseInfo.title}</span>
              </div>
              <p className="text-[10px] text-zinc-400 hidden sm:block leading-tight">
                {currentPhaseInfo.subtitle}
              </p>
            </div>

            {roomState.phaseTimeRemaining > 0 && (
              <div className="flex items-center gap-1 pl-2.5 border-l border-zinc-800 text-amber-400 font-mono font-bold text-xs sm:text-sm">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>{roomState.phaseTimeRemaining}с</span>
              </div>
            )}
          </div>

          {/* Right: Actions, Player Badge & Hamburger Menu */}
          <div className="flex items-center gap-2">
            
            {/* Detective Notebook button */}
            <button
              onClick={() => {
                sounds.playTick();
                onOpenNotebook();
              }}
              title="Блокнот детектива"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 hover:bg-amber-900/40 text-xs font-semibold transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Заметки</span>
            </button>

            {/* Events & Quests Quick Button */}
            <button
              onClick={() => {
                sounds.playTick();
                setTasksDefaultTab('global');
                setIsTasksOpen(true);
              }}
              title="Ивенты и Задачи"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-950/70 to-orange-950/70 border border-amber-600/70 text-amber-300 hover:text-white hover:border-amber-400 text-xs font-bold transition-all shadow-sm shadow-amber-950/40"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Квесты</span>
            </button>

            {/* Spectator Count Indicator */}
            {((roomState.spectatorCount ?? 0) > 0 || isSpectator) && (
              <div 
                title="Зрители, наблюдающие за партией"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-950/70 border border-indigo-700/60 text-indigo-300 text-xs font-bold transition-all shadow-xs"
              >
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-mono">{roomState.spectatorCount || (roomState.spectators?.length || 1)}</span>
                <span className="hidden sm:inline text-[10px] text-indigo-400 font-normal">зрит.</span>
              </div>
            )}

            {/* Admin Panel Quick Button */}
            {user && (user.email.toLowerCase() === 'vledahovic@gmail.com' || user.isAdmin) && onOpenAdmin && (
              <button
                onClick={() => {
                  sounds.playTick();
                  onOpenAdmin();
                }}
                title="Панель Администратора"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-950/80 to-orange-950/80 border border-amber-600/70 text-amber-300 hover:text-white hover:border-amber-500 text-xs font-bold transition-all shadow-sm shadow-amber-950/40"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Админ-панель</span>
              </button>
            )}

            {/* Host Stop Match Button */}
            {isHost && (
              <button
                onClick={() => {
                  sounds.playTick();
                  setIsStopConfirmOpen(true);
                }}
                title="Остановить партию досрочно"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 hover:text-white text-xs font-bold transition-all shadow-xs"
              >
                <Square className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
                <span className="hidden sm:inline">Остановить</span>
              </button>
            )}

            {/* Sound toggle */}
            <button
              onClick={() => {
                onToggleSound();
                sounds.playTick();
              }}
              title={soundEnabled ? 'Выключить звук [M]' : 'Включить звук [M]'}
              className="p-2 rounded-xl bg-[#171822] border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-zinc-500" />}
            </button>

            {/* Player badge */}
            <button
              onClick={() => {
                if (isLoggedIn) onOpenProfile();
                else onOpenAuth();
              }}
              className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-zinc-800/50 transition-colors text-left"
            >
              <div className={`w-8 h-8 rounded-full border flex items-center justify-center overflow-hidden shrink-0 ${
                isSpectator ? 'bg-indigo-950/80 border-indigo-700/80 text-indigo-300' : 'bg-zinc-800 border-zinc-700/80'
              }`}>
                {isSpectator ? <Eye className="w-4 h-4 text-indigo-400" /> : <GangsterIcon size={26} className="w-6 h-6" />}
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-bold text-white leading-tight flex items-center gap-1.5">
                  <span className="truncate max-w-[100px]">{playerName || 'Incognito'}</span>
                  {user && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-950/80 border border-amber-600/60 text-amber-300 font-mono text-[10px] font-bold">
                      Ур. {user.level || 1}
                    </span>
                  )}
                  {isSpectator ? (
                    <span className="text-[10px] text-indigo-300 font-mono font-bold bg-indigo-950 px-1.5 py-0.2 rounded border border-indigo-800/60">
                      Зритель
                    </span>
                  ) : myRoleDef ? (
                    <span className="text-[10px] text-amber-400 font-mono">({myRoleDef.name})</span>
                  ) : null}
                </div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  ID: {numericId}
                </div>
              </div>
            </button>

            {/* Live In-Session Experience Indicator */}
            {typeof roomState.sessionXp === 'number' && roomState.sessionXp > 0 && (
              <button
                type="button"
                onClick={onOpenProfile}
                title={`Заработано опыта в этой партии: +${roomState.sessionXp} XP. Нажмите, чтобы открыть шкалу опыта в профиле.`}
                className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-950/80 via-yellow-950/70 to-orange-950/80 border border-amber-500/70 text-amber-300 hover:text-white text-xs font-mono font-bold transition-all shadow-sm shadow-amber-950/50 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
                <span>+{roomState.sessionXp} XP</span>
              </button>
            )}

            {/* Hamburger Menu Button */}
            <button
              onClick={() => {
                sounds.playTick();
                setIsNavDrawerOpen(true);
              }}
              title="Меню навигации"
              className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

        </div>

        {/* Content Body: Role Reveal, Mafia Meeting, Night, or Table & Chat */}
        {roomState.phase === 'ROLE_REVEAL' ? (
          <div className="p-4 sm:p-6 flex items-center justify-center min-h-[500px]">
            <RoleRevealView
              role={roomState.myRole}
              teammates={roomState.myTeammates}
              timeRemaining={roomState.phaseTimeRemaining}
              isSpectator={isSpectator}
            />
          </div>
        ) : roomState.phase === 'MAFIA_MEETING' ? (
          /* SPORT MAFIA ZERO MINUTE (Ночная нулевая минута) */
          <div className="p-6 sm:p-10 flex flex-col items-center justify-center text-center space-y-5 min-h-[500px] bg-[#0c0d12]">
            <div className="w-16 h-16 rounded-3xl bg-rose-950/70 border border-rose-800 flex items-center justify-center text-rose-400 shadow-2xl">
              <Moon className="w-8 h-8" />
            </div>

            <div className="max-w-md space-y-2">
              <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-rose-400">
                СПОРТИВНЫЙ РЕЖИМ • НУЛЕВАЯ МИНУТА
              </span>
              <h2 className="text-2xl font-sans font-bold text-white">
                {isMafia ? 'Знакомство синдиката' : 'Город мирно спит'}
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {isMafia
                  ? 'У вас ровно 1 минута. Обсудите в секретном чате «Мафия» жесты, последовательность отстрела и план на игру!'
                  : isSpectator
                  ? 'Мафия знакомится в секретном чате. Вы наблюдаете за ходом партии в качестве зрителя.'
                  : 'Синдикат знакомится друг с другом. До наступления первого дня и общего собрания осталось:'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#14151f] border border-zinc-800 flex items-center gap-3 font-mono">
              <Clock className="w-5 h-5 text-amber-500 animate-pulse" />
              <span className="text-xl font-bold text-amber-400">{roomState.phaseTimeRemaining} сек</span>
            </div>

            {isMafia && roomState.myTeammates && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-900/60 text-xs text-rose-200">
                <span className="font-bold block mb-1">Подельники за столом:</span>
                <div className="flex gap-2 justify-center">
                  {roomState.myTeammates.map(t => (
                    <span key={t.id} className="bg-rose-900/50 px-2 py-0.5 rounded font-mono">
                      {t.name} ({t.role === 'don' ? 'Дон 👑' : 'Мафия'})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 min-h-[520px]">
            
            {/* Left 7 Columns: Game Table (or Night Phase) */}
            <div className="md:col-span-7 p-4 sm:p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-zinc-850 space-y-4">
              
              {/* If Night Phase: show Night Action Console */}
              {roomState.phase === 'NIGHT' ? (
                <div className="flex-1 flex flex-col justify-center">
                  <NightPhaseView
                    myRole={roomState.myRole}
                    myId={myId}
                    players={roomState.players}
                    timeRemaining={roomState.phaseTimeRemaining}
                    isSpectator={isSpectator}
                    onSubmitNightAction={onSubmitNightAction}
                    onSkipPhase={onSkipPhase}
                    isNightActionCompleted={(roomState.nightActionsCompleted || []).includes(myId)}
                    isSkipVoted={(roomState.phaseSkipVotedIds || []).includes(myId)}
                    totalNightActiveRoles={roomState.totalNightActiveRoles}
                    nightSkipVotesCount={roomState.nightSkipVotesCount}
                    sheriffLastCheckResult={roomState.sheriffLastCheckResult}
                    donLastCheckResult={roomState.donLastCheckResult}
                    sheriffCurrentCheckResult={roomState.sheriffCurrentCheckResult}
                    donCurrentCheckResult={roomState.donCurrentCheckResult}
                  />
                </div>
              ) : (
                /* Day / Speeches / Voting Phase: Table with Player Cards */
                <div className="space-y-3.5 flex-1 flex flex-col justify-between">
                  
                  {/* PHASE ANNOUNCEMENT & ACTION BANNERS */}
                  {/* 1. DAY_DISCUSSION Banner */}
                  {roomState.phase === 'DAY_DISCUSSION' && (
                    <div className="p-3.5 rounded-2xl bg-[#14151f] border border-amber-900/60 flex items-center justify-between gap-3 shadow-md">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">
                            ☀️ Общее собрание (День {roomState.dayNumber})
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          {isSpectator
                            ? 'Идёт общее собрание жителей города. Вы наблюдаете за ходом дебатов.'
                            : isFirstDayNoVoting
                            ? 'Голосование в 1-й день отключено ведущим.'
                            : 'Свободное обсуждение. Вы можете досрочно завершить собрание:'}
                        </p>
                      </div>

                      {!isSpectator && isAlive && (
                        <button
                          onClick={onSkipPhase}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                            hasUserSkipped
                              ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                              : 'bg-[#181924] hover:bg-[#222432] border-zinc-800 text-zinc-200 hover:text-white'
                          }`}
                        >
                          <FastForward className="w-3.5 h-3.5 text-amber-400" />
                          <span>Пропустить ({skipCount}/{skipThreshold})</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* 2. INDIVIDUAL_SPEECHES Banner */}
                  {roomState.phase === 'INDIVIDUAL_SPEECHES' && (
                    <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 shadow-md transition-all ${
                      isCurrentSpeaker
                        ? 'bg-[#1e1915] border-amber-500/80 ring-1 ring-amber-500/50'
                        : 'bg-[#14151f] border-zinc-800'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          isCurrentSpeaker ? 'bg-amber-500 text-zinc-950 animate-pulse' : 'bg-zinc-800 text-amber-400'
                        }`}>
                          <Mic className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                            <span>Говорит: {currentSpeakerPlayer?.name || 'Оратор'}</span>
                            {isCurrentSpeaker && <span className="text-amber-400 font-mono font-bold">(Вы)</span>}
                          </h4>
                          <p className="text-[11px] text-zinc-400">
                            {isCurrentSpeaker
                              ? `Ваша речь! ${!isFirstDayNoVoting ? 'Вы можете номинировать кандидата.' : ''}`
                              : isSpectator
                              ? 'Слушайте выступление текущего игрока.'
                              : 'Остальные участники слушают и не перебивают.'}
                          </p>
                        </div>
                      </div>

                      {!isSpectator && isCurrentSpeaker && (
                        <button
                          onClick={onSkipPhase}
                          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#b85820] to-[#8c3d12] hover:from-[#c96226] text-white text-xs font-bold transition-all shadow-md flex items-center gap-1"
                        >
                          <FastForward className="w-3.5 h-3.5" />
                          <span>Завершить речь</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* 3. DEFENSE_SPEECH Banner */}
                  {roomState.phase === 'DEFENSE_SPEECH' && (
                    <div className="p-3.5 rounded-2xl bg-[#1c141c] border border-purple-900/60 flex items-center justify-between gap-3 shadow-md">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-purple-300 uppercase tracking-wide">
                          ⚖️ Оправдательная речь при ничьей
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          Защищается: <strong className="text-white">{currentSpeakerPlayer?.name}</strong>
                        </p>
                      </div>

                      {!isSpectator && isCurrentSpeaker && (
                        <button
                          onClick={onSkipPhase}
                          className="px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold transition-all flex items-center gap-1"
                        >
                          <FastForward className="w-3.5 h-3.5" />
                          <span>Завершить речь</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* 4. LAST_WORDS_ARREST & LAST_WORDS_KILLED Banner */}
                  {(roomState.phase === 'LAST_WORDS_ARREST' || roomState.phase === 'LAST_WORDS_KILLED') && (
                    <div className="p-3.5 rounded-2xl bg-[#1d1215] border border-rose-900/70 flex items-center justify-between gap-3 shadow-md">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-rose-300 uppercase tracking-wide flex items-center gap-1.5">
                          <Skull className="w-4 h-4 text-rose-400" />
                          <span>{roomState.phase === 'LAST_WORDS_ARREST' ? 'Последнее слово арестованного' : 'Завещание погибшего жителя'}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          Говорит: <strong className="text-white">{currentSpeakerPlayer?.name}</strong>
                        </p>
                      </div>

                      {!isSpectator && isCurrentSpeaker && (
                        <button
                          onClick={onSkipPhase}
                          className="px-3 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold transition-all flex items-center gap-1"
                        >
                          <FastForward className="w-3.5 h-3.5" />
                          <span>Завершить слово</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* 5. VOTING & REVOTE Tribunal Banner */}
                  {(roomState.phase === 'VOTING' || roomState.phase === 'REVOTE') && (
                    <div className="p-3.5 rounded-2xl bg-[#17141f] border border-rose-900/60 flex flex-wrap items-center justify-between gap-3 shadow-md">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-rose-950/60 border border-rose-700/60 flex items-center justify-center text-rose-400">
                          <Gavel className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                            {roomState.phase === 'REVOTE' ? 'Повторное голосование (Ничья)' : 'Городской суд: Голосование'}
                          </h4>
                          <p className="text-[11px] text-zinc-400">
                            {isSpectator
                              ? 'Игроки голосуют за кандидатов на исключение. Вы наблюдаете за ходом суда.'
                              : isTieExcluded
                              ? '⚠️ Вы лишены права голоса на переголосовании.'
                              : myPlayer?.votedFor
                              ? myPlayer.votedFor === 'skip'
                                ? 'Вы воздержались от голосования'
                                : `Ваш выбор: ${roomState.players.find(p => p.id === myPlayer.votedFor)?.name}`
                              : 'Выберите кандидата на казнь:'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-[11px] font-mono text-zinc-400 bg-zinc-900 px-2.5 py-1.5 rounded-xl border border-zinc-800">
                          Голосов: <strong className="text-amber-400 font-bold">{roomState.votesCastCount ?? totalVotesCount} из {roomState.totalEligibleVoters ?? eligibleVoters.length}</strong>
                        </div>

                        {!isSpectator && !isTieExcluded && isAlive && (
                          <button
                            type="button"
                            onClick={() => {
                              sounds.playTick();
                              onSkipPhase();
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                              myPlayer?.votedFor
                                ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                                : 'bg-[#181924] hover:bg-[#202230] border-zinc-800 text-zinc-200 hover:text-white'
                            }`}
                          >
                            <FastForward className="w-3.5 h-3.5 text-amber-400" />
                            <span>
                              {myPlayer?.votedFor && myPlayer.votedFor !== 'skip'
                                ? 'Подтвердить выбор'
                                : myPlayer?.votedFor === 'skip'
                                ? 'Выбор зафиксирован'
                                : 'Пропустить (Воздержаться)'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Player Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[430px] overflow-y-auto pr-1">
                    {roomState.players.map((player, index) => {
                      const isMe = player.id === myId;
                      const isCandidate = (roomState.nominatedPlayerIds || []).includes(player.id);
                      const isDefenseCandidate = (roomState.defenseCandidates || []).includes(player.id);
                      const isSpeaker = roomState.currentSpeakerId === player.id;
                      const votesForThisPlayer = voteTallies[player.id] || 0;
                      const roleDef = player.role ? ROLE_DEFINITIONS[player.role] : null;

                      // Eligibility for nomination
                      const canBeNominated = 
                        !isSpectator &&
                        roomState.phase === 'INDIVIDUAL_SPEECHES' && 
                        isCurrentSpeaker && 
                        player.isAlive && 
                        !isCandidate && 
                        !isFirstDayNoVoting &&
                        !roomState.currentSpeakerHasNominated &&
                        player.id !== myId;

                      // Can vote for this player
                      const canVoteForPlayer = 
                        !isSpectator &&
                        isAlive &&
                        !isTieExcluded &&
                        ((roomState.phase === 'VOTING' && isCandidate) || 
                        (roomState.phase === 'REVOTE' && isDefenseCandidate));

                      return (
                        <div
                          key={player.id}
                          className={`relative rounded-2xl border p-3 flex flex-col justify-between transition-all duration-200 ${
                            !player.isAlive
                              ? 'bg-[#0f1015]/60 border-zinc-900 opacity-55'
                              : isSpeaker
                              ? 'bg-[#1d1815] border-amber-500 shadow-xl shadow-amber-950/30 ring-2 ring-amber-500/60'
                              : isCandidate || isDefenseCandidate
                              ? 'bg-[#191217] border-rose-600/80 shadow-lg shadow-rose-950/30'
                              : isMe
                              ? 'bg-[#171622] border-amber-500/60 shadow-md shadow-amber-950/20'
                              : 'bg-[#13141a] border-zinc-800/80 hover:border-zinc-700'
                          }`}
                        >
                          {/* Card Top: Slot Number and Bot Badge */}
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono font-bold text-amber-500">
                                  #{index + 1}
                                </span>
                                <span className={`w-2 h-2 rounded-full ${player.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                              </div>

                              <div className="flex items-center gap-1">
                                {isSpeaker && (
                                  <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-950 border border-amber-700/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Mic className="w-2.5 h-2.5" /> ГОВОРИТ
                                  </span>
                                )}
                                {player.isBot && (
                                  <span className="text-[9px] text-zinc-400 font-mono bg-zinc-900 px-1.5 py-0.5 rounded">
                                    БОТ
                                  </span>
                                )}
                                {player.isHost && (
                                  <span className="text-[9px] text-amber-400 font-semibold flex items-center gap-0.5">
                                    <Crown className="w-2.5 h-2.5" /> Хост
                                  </span>
                                )}

                                {/* Player Context Menu with Report Button */}
                                {!isMe && (
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        sounds.playTick();
                                        setActivePlayerMenuId(activePlayerMenuId === player.id ? null : player.id);
                                      }}
                                      title="Действия с игроком"
                                      className="p-1 rounded-md bg-zinc-850 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                                    >
                                      <MoreVertical className="w-3 h-3" />
                                    </button>

                                    {/* Dropdown Context Menu */}
                                    {activePlayerMenuId === player.id && (
                                      <div 
                                        onClick={e => e.stopPropagation()}
                                        className="absolute right-0 top-6 z-40 w-44 bg-[#14151e] border border-zinc-700/90 rounded-xl shadow-2xl p-1 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            sounds.playTick();
                                            setActivePlayerMenuId(null);
                                            setSelectedPlayerForReport({ id: player.id, name: player.name });
                                          }}
                                          className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 text-left font-bold flex items-center gap-2 transition-colors"
                                        >
                                          <Flag className="w-3.5 h-3.5 text-rose-400" />
                                          <span>Пожаловаться</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            sounds.playTick();
                                            setActivePlayerMenuId(null);
                                            setChatInput(prev => `${prev ? prev + ' ' : ''}@${player.name} `);
                                          }}
                                          className="w-full px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 text-left flex items-center gap-2 transition-colors"
                                        >
                                          <AtSign className="w-3.5 h-3.5 text-amber-400" />
                                          <span>Упомянуть в чате</span>
                                        </button>

                                        {canBeNominated && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActivePlayerMenuId(null);
                                              handleNominate(player.id);
                                            }}
                                            className="w-full px-2.5 py-1.5 rounded-lg hover:bg-amber-950/70 text-amber-300 text-left font-bold flex items-center gap-2 transition-colors"
                                          >
                                            <Gavel className="w-3.5 h-3.5 text-amber-400" />
                                            <span>Выдвинуть на суд</span>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Center Avatar & Name */}
                            <div className="flex flex-col items-center text-center space-y-1.5 py-1">
                              <div className="relative">
                                <div className={`w-11 h-11 rounded-full flex items-center justify-center border shadow-inner transition-all duration-700 ${
                                  !player.isAlive
                                    ? 'bg-zinc-950 border-rose-900/60 text-zinc-500 opacity-60 grayscale contrast-125'
                                    : isSpeaker
                                    ? 'bg-amber-950 border-amber-600 text-amber-200'
                                    : 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                }`}>
                                  <GangsterIcon size={28} className={`w-7 h-7 transition-all duration-700 ${!player.isAlive ? 'opacity-30' : ''}`} />
                                </div>

                                {/* Cross-out and elimination overlay */}
                                {!player.isAlive && (
                                  <div className="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none animate-in fade-in duration-500">
                                    {/* Red cross-out lines */}
                                    <svg className="w-full h-full text-rose-600 drop-shadow-[0_0_3px_rgba(225,29,72,0.9)]" viewBox="0 0 44 44">
                                      <line x1="10" y1="10" x2="34" y2="34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                      <line x1="34" y1="10" x2="10" y2="34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                    </svg>
                                    <div className="absolute bottom-[-2px] right-[-2px] w-4 h-4 rounded-full bg-rose-950 border border-rose-600 flex items-center justify-center shadow">
                                      <Skull className="w-2.5 h-2.5 text-rose-300" />
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="w-full">
                                {player.clanTag && (
                                  <span 
                                    className="text-[9px] font-mono font-black px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-600/70 text-amber-300 inline-block mb-0.5"
                                    title={player.clanName || undefined}
                                  >
                                    [{player.clanTag}]
                                  </span>
                                )}
                                <h5 className={`text-xs font-bold truncate transition-colors duration-500 ${!player.isAlive ? 'line-through decoration-rose-500/80 decoration-2 text-zinc-500' : 'text-zinc-100'}`}>
                                  {player.name}
                                </h5>
                                {isMe && <span className="text-[10px] text-amber-400 font-medium">(Вы)</span>}
                              </div>
                            </div>

                            {/* Self Role Badge or Public Revealed Role */}
                            {(isMe ? myRoleDef : roleDef) && (
                              <div 
                                className="mt-1 py-0.5 px-2 rounded-lg text-[10px] font-bold text-center border truncate font-mono"
                                style={{
                                  backgroundColor: `${(isMe ? myRoleDef : roleDef)!.color}15`,
                                  borderColor: `${(isMe ? myRoleDef : roleDef)!.color}50`,
                                  color: (isMe ? myRoleDef : roleDef)!.color
                                }}
                              >
                                {(isMe ? myRoleDef : roleDef)!.name}
                              </div>
                            )}

                            {/* Candidate Badges */}
                            {(isCandidate || isDefenseCandidate) && (
                              <div className="mt-1 py-0.5 px-2 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-[10px] font-bold text-center flex items-center justify-center gap-1">
                                <Gavel className="w-3 h-3 text-rose-400" />
                                <span>{roomState.phase === 'REVOTE' ? 'НИЧЬЯ • ПЕРЕСУД' : 'НА СУДЕ'}</span>
                              </div>
                            )}
                          </div>

                          {/* Action Buttons & Votes Footer */}
                          <div className="mt-2.5 pt-2 border-t border-zinc-850 space-y-1.5">
                            {/* Nomination button: ONLY available for current speaker during INDIVIDUAL_SPEECHES */}
                            {canBeNominated && (
                              <button
                                onClick={() => handleNominate(player.id)}
                                className="w-full py-1.5 px-2 rounded-xl bg-[#181924] hover:bg-[#222432] border border-amber-700/60 text-amber-300 hover:text-white text-[11px] font-bold transition-colors flex items-center justify-center gap-1"
                              >
                                <Gavel className="w-3 h-3 text-amber-400" />
                                <span>Выдвинуть на суд</span>
                              </button>
                            )}

                            {/* Voting Button during VOTING or REVOTE */}
                            {canVoteForPlayer && (
                              <div className="space-y-1">
                                {isAlive && !isTieExcluded && (
                                  <button
                                    onClick={() => handleVote(player.id)}
                                    className={`w-full py-1.5 px-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1 ${
                                      myPlayer?.votedFor === player.id
                                        ? 'bg-rose-600 text-white border border-rose-500 shadow-rose-950/50'
                                        : 'bg-gradient-to-r from-[#b85820] to-[#8c3d12] hover:from-[#c96226] hover:to-[#9e4616] text-white border border-amber-900/60'
                                    }`}
                                  >
                                    {myPlayer?.votedFor === player.id ? (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Ваш голос</span>
                                      </>
                                    ) : (
                                      <span>Казнить</span>
                                    )}
                                  </button>
                                )}

                                <div className="flex items-center justify-between text-[10px] text-zinc-400 px-1 font-mono">
                                  <span>Голосов:</span>
                                  <span className="font-bold text-amber-400">{votesForThisPlayer}</span>
                                </div>
                              </div>
                            )}

                            {/* Show who player voted for */}
                            {!roomState.settings.anonymousVoting && (roomState.phase === 'VOTING' || roomState.phase === 'REVOTE') && player.votedFor && (
                              <div className="text-[10px] text-zinc-400 text-center truncate">
                                Голос: {player.votedFor === 'skip' ? 'Воздержался' : roomState.players.find(p => p.id === player.votedFor)?.name || '...'}
                              </div>
                            )}
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bottom bar of Left Column: Leave Table and Host Stop Match */}
              <div className="pt-2 flex items-center justify-between border-t border-zinc-850">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      sounds.playTick();
                      onLeaveRoom();
                    }}
                    className="py-1.5 px-3 rounded-xl bg-[#161720] hover:bg-[#1f212d] border border-zinc-800 text-zinc-400 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-400" />
                    <span>Покинуть стол</span>
                  </button>

                  {isHost && (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        setIsStopConfirmOpen(true);
                      }}
                      className="py-1.5 px-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/80 text-rose-300 hover:text-white text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <Square className="w-3 h-3 fill-rose-400 text-rose-400" />
                      <span>Остановить партию</span>
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-zinc-400 font-mono">
                  {alivePlayers.length} живых из {roomState.players.length}
                </div>
              </div>

            </div>

            {/* Right 5 Columns: Social Hub / Live Chat & Journal */}
            <div className="md:col-span-5 p-4 sm:p-6 flex flex-col justify-between bg-[#101117] space-y-4">
              
              {/* Channel Tabs */}
              <div className="flex border-b border-zinc-850 bg-[#13141d] p-1 gap-1 text-xs rounded-xl">
                <button
                  onClick={() => setActiveChannel('all')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-colors ${
                    activeChannel === 'all'
                      ? 'bg-[#1b1c28] text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3 h-3 text-zinc-400" />
                  <span>Общий</span>
                </button>

                {(isMafia || isGameOver) && (
                  <button
                    onClick={() => setActiveChannel('mafia')}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-colors ${
                      activeChannel === 'mafia'
                        ? 'bg-rose-950/70 text-rose-200 border border-rose-800/60 shadow-xs'
                        : 'text-rose-400 hover:text-rose-300'
                    }`}
                  >
                    <Lock className="w-3 h-3 text-rose-500" />
                    <span>Мафия</span>
                  </button>
                )}

                {(!isAlive || isGameOver) && (
                  <button
                    onClick={() => setActiveChannel('dead')}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-colors ${
                      activeChannel === 'dead'
                        ? 'bg-[#1b1c28] text-zinc-200 shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Skull className="w-3 h-3 text-zinc-400" />
                    <span>Кладбище</span>
                  </button>
                )}

                <button
                  onClick={() => setActiveChannel('system')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-colors ${
                    activeChannel === 'system'
                      ? 'bg-[#1b1c28] text-amber-300 shadow-xs'
                      : 'text-zinc-400 hover:text-amber-400'
                  }`}
                >
                  <ScrollText className="w-3 h-3" />
                  <span>Журнал</span>
                </button>
              </div>

              {/* Chat Members Live Status Bar */}
              {activeChannel !== 'system' && (
                <div className="px-2.5 py-1.5 bg-[#13141d]/90 border border-zinc-850 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono text-zinc-400 flex items-center gap-1.5 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>
                        {activeChannel === 'mafia' ? 'Синдикат в сети:' : activeChannel === 'dead' ? 'Кладбище в сети:' : 'Участники стола:'}
                      </span>
                    </span>
                    <span className="font-mono text-[9px] text-zinc-500">
                      <span className="text-emerald-400 font-bold">
                        {(activeChannel === 'mafia' 
                          ? roomState.players.filter(p => (p.role === 'mafia' || p.role === 'don') && (p.connected || p.isBot))
                          : activeChannel === 'dead'
                          ? roomState.players.filter(p => !p.isAlive && (p.connected || p.isBot))
                          : roomState.players.filter(p => p.connected || p.isBot)
                        ).length}
                      </span> / {
                        (activeChannel === 'mafia' 
                          ? roomState.players.filter(p => p.role === 'mafia' || p.role === 'don')
                          : activeChannel === 'dead'
                          ? roomState.players.filter(p => !p.isAlive)
                          : roomState.players
                        ).length
                      } онлайн
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                    {(activeChannel === 'mafia' 
                      ? roomState.players.filter(p => p.role === 'mafia' || p.role === 'don' || isGameOver)
                      : activeChannel === 'dead'
                      ? roomState.players.filter(p => !p.isAlive || isGameOver)
                      : roomState.players
                    ).map(p => {
                      const isOnline = p.connected || p.isBot;
                      const isMe = p.id === myId;
                      return (
                        <div
                          key={p.id}
                          title={`${p.name}: ${p.isBot ? 'ИИ-Бот' : p.connected ? 'В сети' : 'Оффлайн'} ${!p.isAlive ? '(Выбыл)' : ''}`}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-medium border shrink-0 transition-colors ${
                            isOnline
                              ? 'bg-[#181924] border-zinc-800 text-zinc-200'
                              : 'bg-[#111217] border-zinc-900 text-zinc-500 opacity-60'
                          }`}
                        >
                          <span className="relative flex h-2 w-2">
                            {p.connected && !p.isBot && (
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                            )}
                            <span
                              className={`relative inline-flex rounded-full h-2 w-2 ${
                                p.isBot
                                  ? 'bg-amber-400'
                                  : p.connected
                                  ? 'bg-emerald-400 shadow-xs shadow-emerald-400/80'
                                  : 'bg-zinc-600'
                              }`}
                            />
                          </span>
                          <span className="truncate max-w-[75px]">{p.name}</span>
                          {isMe && <span className="text-[9px] text-amber-400 font-bold">(Вы)</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Spectators Live Row in Common Chat */}
                  {activeChannel === 'all' && roomState.spectators && roomState.spectators.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1 border-t border-zinc-800/60">
                      <span className="text-[9px] font-mono text-indigo-400 font-bold flex items-center gap-1 shrink-0">
                        <Eye className="w-3 h-3 text-indigo-400" />
                        <span>Зрители ({roomState.spectators.length}):</span>
                      </span>
                      {roomState.spectators.map(s => {
                        const isMe = s.id === myId;
                        return (
                          <div
                            key={s.id}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-950/40 border border-indigo-900/50 text-[9px] text-indigo-200 shrink-0"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            <span className="truncate max-w-[75px]">{s.name}</span>
                            {s.clanTag && <span className="text-amber-400 font-mono">[{s.clanTag}]</span>}
                            {isMe && <span className="text-amber-400 font-bold">(Вы)</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Chat Messages Feed */}
              <div className="flex-1 overflow-y-auto max-h-[300px] p-2 space-y-2 font-sans border border-zinc-850 rounded-xl bg-[#0e0f14]/80">
                {currentMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center text-xs text-zinc-500 p-4">
                    {activeChannel === 'system'
                      ? 'События фиксируются в журнале протокола'
                      : 'Сообщений пока нет. Выскажитесь первым!'}
                  </div>
                ) : (
                  currentMessages.map(msg => {
                    const isMe = msg.senderId === myId;
                    const isSystem = msg.channel === 'system' || msg.senderId === 'system';

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="p-2 rounded-lg bg-[#14151f] border border-amber-900/30 text-[10px] text-amber-200/90 leading-relaxed font-mono">
                          {msg.text}
                        </div>
                      );
                    }

                    const sender = roomState.players.find(p => p.id === msg.senderId);
                    const isSenderOnline = sender ? (sender.connected || sender.isBot) : true;

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5 px-1 flex-wrap">
                          <span className="relative flex h-2 w-2 shrink-0">
                            {sender?.connected && !sender?.isBot && (
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                            )}
                            <span
                              className={`relative inline-flex rounded-full h-2 w-2 ${
                                msg.isSpectator
                                  ? 'bg-indigo-400'
                                  : sender?.isBot
                                  ? 'bg-amber-400'
                                  : isSenderOnline
                                  ? 'bg-emerald-400 shadow-xs shadow-emerald-400/80'
                                  : 'bg-zinc-600'
                              }`}
                              title={msg.isSpectator ? 'Зритель' : sender?.isBot ? 'ИИ-Бот' : isSenderOnline ? 'В сети' : 'Оффлайн'}
                            />
                          </span>

                          {msg.clanTag && (
                            <span className="text-[9px] font-mono font-black px-1 py-0.2 rounded bg-amber-950/80 border border-amber-600/70 text-amber-300">
                              [{msg.clanTag}]
                            </span>
                          )}

                          {msg.isSpectator && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-950/90 border border-indigo-700/70 text-indigo-300 flex items-center gap-0.5">
                              <span>👁️</span> Зритель
                            </span>
                          )}

                          <span className={`text-[10px] font-bold ${isMe ? 'text-amber-400' : 'text-zinc-400'}`}>
                            {msg.senderName}
                          </span>
                          <span className="text-[9px] text-zinc-600 font-mono">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className={`p-2 rounded-xl max-w-[85%] text-xs leading-relaxed ${
                          isMe
                            ? 'bg-gradient-to-r from-[#b85820] to-[#8c3d12] text-white shadow-xs'
                            : msg.isSpectator
                            ? 'bg-indigo-950/30 border border-indigo-900/60 text-indigo-100'
                            : msg.channel === 'mafia'
                            ? 'bg-rose-950/40 border border-rose-900/60 text-rose-100'
                            : msg.channel === 'dead'
                            ? 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                            : 'bg-[#161722] border border-zinc-800 text-zinc-100'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Quick phrases */}
              {canSend && (
                <div className="overflow-x-auto flex gap-1 scrollbar-none py-0.5">
                  {QUICK_PHRASES.slice(0, 4).map((phrase, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickPhrase(phrase)}
                      className="whitespace-nowrap px-2 py-0.5 rounded-lg bg-[#171822] hover:bg-[#202230] border border-zinc-800 text-[10px] text-zinc-300 hover:text-white transition-colors"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              )}

              {/* Chat Input Field */}
              <div className="pt-1">
                {canSend ? (
                  <form onSubmit={handleSendChat} className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      maxLength={200}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder={activeChannel === 'mafia' ? 'Заговор мафии...' : 'Ваша реплика...'}
                      className="flex-1 bg-[#151620] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="p-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <div className="py-2 px-3 rounded-xl bg-[#14151f] border border-zinc-800 text-center text-[10px] text-zinc-400">
                    {sendDisabledReason}
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

      </div>

      {/* Slide-over Curtain Drawer for Hamburger Menu */}
      <NavigationDrawer
        isOpen={isNavDrawerOpen}
        onClose={() => setIsNavDrawerOpen(false)}
        activeTab="lobby"
        onSelectTab={handleSelectNavTab}
        isLoggedIn={isLoggedIn}
        user={user}
        roomSettings={roomState.settings}
        isHost={isHost}
      />

      {/* Shop Modal */}
      <ShopModal
        isOpen={isShopOpen}
        onClose={() => setIsShopOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
        onOpenAuth={onOpenAuth}
        onOpenInventory={onOpenProfile}
      />

      {/* Pawnshop Modal */}
      <PawnshopModal
        isOpen={isPawnshopOpen}
        onClose={() => setIsPawnshopOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
        onOpenShop={() => setIsShopOpen(true)}
      />

      {/* Daily Bonus Modal */}
      <DailyBonusModal
        isOpen={isBonusOpen}
        onClose={() => setIsBonusOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
        onOpenAuth={onOpenAuth}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
        onOpenRules={onOpenRules}
      />

      {/* Host Stop Match Confirmation Modal */}
      {isStopConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs select-none animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#12131a] border border-rose-900/70 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-950/80 border border-rose-700/80 flex items-center justify-center text-rose-400 shrink-0">
                <Square className="w-6 h-6 fill-rose-500 text-rose-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white uppercase tracking-wide">
                  Остановить партию?
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Вы являетесь ведущим стола. При досрочной остановке партия будет немедленно завершена, все роли сброшены, а игроки вернутся в лобби комнаты для новой раздачи.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsStopConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#181924] hover:bg-[#202230] border border-zinc-800 text-zinc-300 hover:text-white font-semibold text-xs transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  sounds.playGavel();
                  setIsStopConfirmOpen(false);
                  onStopGame();
                }}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-rose-900 hover:from-rose-600 hover:to-rose-800 text-white font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-rose-950/60 border border-rose-600/60"
              >
                Остановить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player Report Modal */}
      <ReportPlayerModal
        isOpen={!!selectedPlayerForReport}
        onClose={() => setSelectedPlayerForReport(null)}
        targetPlayer={selectedPlayerForReport}
        reporter={{
          id: myId,
          name: playerName || user?.displayName || 'Игрок'
        }}
        roomCode={roomState.roomCode}
      />

      {/* Clans & Syndicates Modal */}
      <ClansModal
        isOpen={isClansOpen}
        onClose={() => setIsClansOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
        onOpenAuth={onOpenAuth}
        onOpenClanTasks={() => {
          setIsClansOpen(false);
          setTasksDefaultTab('clan');
          setIsTasksOpen(true);
        }}
      />

      {/* Events & Tasks Modal */}
      <EventsModal
        isOpen={isTasksOpen}
        onClose={() => setIsTasksOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
        onOpenClans={() => {
          setIsTasksOpen(false);
          setIsClansOpen(true);
        }}
        onOpenAuth={onOpenAuth}
        defaultTab={tasksDefaultTab}
      />

      {/* Visual Event Feed Overlay & History Log */}
      <EventFeedOverlay
        roomState={roomState}
        myId={myId}
      />

    </div>
  );
};
