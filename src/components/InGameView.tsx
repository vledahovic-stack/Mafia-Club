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
  EyeOff,
  Sparkles,
  History,
  Users,
  Scale
} from 'lucide-react';
import { sounds } from '../utils/audio';
import noirLobbyBg from '../assets/images/noir_mafia_lobby_bg_1791204529068.jpg';
import { AuthUser } from './AuthModal';
import { useWebRtc } from '../hooks/useWebRtc';
import { PlayerVideoSlot } from './PlayerVideoSlot';
import { useLanguage } from '../context/LanguageContext';

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
  webRtc?: ReturnType<typeof useWebRtc>;
  onOpenWebRtcSettings?: () => void;
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
  onLogout,
  webRtc,
  onOpenWebRtcSettings
}) => {
  const { t } = useLanguage();
  const [mobileTab, setMobileTab] = useState<'left' | 'right'>('left');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX - touchEndX;
    if (Math.abs(diffX) > 50) {
      if (diffX > 0 && mobileTab === 'left') {
        setMobileTab('right');
        sounds.playTick();
      } else if (diffX < 0 && mobileTab === 'right') {
        setMobileTab('left');
        sounds.playTick();
      }
    }
    setTouchStartX(null);
  };

  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [isPawnshopOpen, setIsPawnshopOpen] = useState(false);
  const [isBonusOpen, setIsBonusOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClansOpen, setIsClansOpen] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [tasksDefaultTab, setTasksDefaultTab] = useState<'global' | 'onboarding' | 'personal' | 'clan'>('global');
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);
  const [showEliminatedPlayers, setShowEliminatedPlayers] = useState(false);

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
  const currentPhaseInfo = (() => {
    switch (roomState.phase) {
      case 'ROLE_REVEAL':
        return { title: t('phase.role_reveal_title', 'Раздача ролей'), subtitle: t('phase.role_reveal_sub', 'Ознакомьтесь с картой'), color: 'text-amber-400' };
      case 'MAFIA_MEETING':
        return { title: t('phase.mafia_meeting_title', 'Знакомство мафии'), subtitle: t('phase.mafia_meeting_sub', 'Ночная нулевая минута (1 минута)'), color: 'text-rose-400' };
      case 'DAY_DISCUSSION':
        return { title: t('phase.day_discussion_title', 'Общее собрание'), subtitle: t('phase.day_discussion_sub', 'Открытые дебаты жителей'), color: 'text-amber-400' };
      case 'INDIVIDUAL_SPEECHES':
        return { title: t('phase.individual_speeches_title', 'Индивидуальные речи'), subtitle: t('phase.individual_speeches_sub', 'Ораторы выступают по очереди'), color: 'text-amber-500' };
      case 'VOTING':
        return { title: t('phase.voting_title', 'Городской суд'), subtitle: t('phase.voting_sub', 'Голосование за казнь'), color: 'text-rose-500' };
      case 'DEFENSE_SPEECH':
        return { title: t('phase.defense_speech_title', 'Оправдательные речи'), subtitle: t('phase.defense_speech_sub', 'Ничья! Защитная речь кандидата'), color: 'text-purple-400' };
      case 'REVOTE':
        return { title: t('phase.revote_title', 'Переголосование'), subtitle: t('phase.revote_sub', 'Повторное голосование при ничьей'), color: 'text-rose-600' };
      case 'LAST_WORDS_ARREST':
        return { title: t('phase.last_words_arrest_title', 'Последнее слово'), subtitle: t('phase.last_words_arrest_sub', 'Осужденный судом города'), color: 'text-rose-400' };
      case 'NIGHT':
        return { title: t('phase.night_title', 'Ночная фаза'), subtitle: t('phase.night_sub', 'Город засыпает. Просыпается мафия'), color: 'text-blue-400' };
      case 'MORNING_REPORT':
        return { title: t('phase.morning_report_title', 'Утренние вести'), subtitle: t('phase.morning_report_sub', 'Итоги ночи в городской газете'), color: 'text-emerald-400' };
      case 'LAST_WORDS_KILLED':
        return { title: t('phase.last_words_killed_title', 'Завещание'), subtitle: t('phase.last_words_killed_sub', 'Последнее слово убитого ночью'), color: 'text-purple-400' };
      case 'GAME_OVER':
        return { title: t('phase.game_over_title', 'Финал партии'), subtitle: t('phase.game_over_sub', 'Победа определена'), color: 'text-yellow-400' };
      default:
        return { title: t('phase.lobby_title', 'Игра в процессе'), subtitle: t('phase.lobby_sub', 'Партия активна'), color: 'text-zinc-200' };
    }
  })();

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

  // Solo speech phases
  const isSoloSpeechPhase = 
    roomState.phase === 'INDIVIDUAL_SPEECHES' || 
    roomState.phase === 'DEFENSE_SPEECH' || 
    roomState.phase === 'LAST_WORDS_ARREST' || 
    roomState.phase === 'LAST_WORDS_KILLED';

  return (
    <div
      className={`relative w-full flex items-center justify-center p-0 md:p-2 bg-cover bg-center select-none ${
        roomState.phase === 'DAY_DISCUSSION' || isSoloSpeechPhase
          ? 'h-[100dvh] max-h-[100dvh] overflow-hidden md:min-h-screen md:h-auto md:max-h-none md:overflow-x-hidden'
          : 'min-h-screen overflow-x-hidden'
      }`}
      style={{ backgroundImage: `url(${noirLobbyBg})` }}
    >
      {/* Dark moody vignette overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] pointer-events-none" />

      {/* Main Center Console Card (Monolithic Frame: 65% width, 98% height on desktop; 100% on mobile) */}
      <div className={`relative z-10 w-full md:w-[65vw] bg-[#0d0e13]/95 border-0 md:border md:border-zinc-800/90 rounded-none md:rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col backdrop-blur-md ${
        roomState.phase === 'DAY_DISCUSSION' || isSoloSpeechPhase
          ? 'h-full max-h-[100dvh] md:min-h-0 md:h-[98vh]'
          : 'h-full min-h-screen md:min-h-0 md:h-[98vh]'
      }`}>
        
        {/* Top Header inside console card */}
        <div className={`px-3 sm:px-5 border-b border-zinc-850 flex flex-wrap items-center justify-between gap-2 sm:gap-3 bg-[#111218]/92 shrink-0 ${
          roomState.phase === 'DAY_DISCUSSION' || isSoloSpeechPhase ? 'py-1 sm:py-2.5 md:py-3.5' : 'py-3.5'
        }`}>
          


          {/* Right: Actions, Player Badge & Hamburger Menu */}
          <div className="flex items-center gap-2 ml-auto justify-end">
            
            {/* Detective Notebook button */}
            <button
              onClick={() => {
                sounds.playTick();
                onOpenNotebook();
              }}
              title={t('header.notebook', 'Блокнот детектива')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 hover:bg-amber-900/40 text-xs font-semibold transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">{t('header.notebook', 'Заметки')}</span>
            </button>

            {/* Events & Quests Quick Button */}
            <button
              onClick={() => {
                sounds.playTick();
                setTasksDefaultTab('global');
                setIsTasksOpen(true);
              }}
              title={t('header.tasks', 'Ивенты и Задачи')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-950/70 to-orange-950/70 border border-amber-600/70 text-amber-300 hover:text-white hover:border-amber-400 text-xs font-bold transition-all shadow-sm shadow-amber-950/40"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">{t('header.tasks', 'Квесты')}</span>
            </button>

            {/* Spectator Count Indicator */}
            {((roomState.spectatorCount ?? 0) > 0 || isSpectator) && (
              <div 
                title={t('lobby.spectators', 'Зрители, наблюдающие за партией')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-950/70 border border-indigo-700/60 text-indigo-300 text-xs font-bold transition-all shadow-xs"
              >
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-mono">{roomState.spectatorCount || (roomState.spectators?.length || 1)}</span>
                <span className="hidden sm:inline text-[10px] text-indigo-400 font-normal">{t('lobby.role_spectator', 'зрит.')}</span>
              </div>
            )}

            {/* Admin Panel Quick Button */}
            {user && (user.isAdmin === true || user.role === 'admin' || user.email.toLowerCase() === 'vledahovic@gmail.com') && onOpenAdmin && (
              <button
                onClick={() => {
                  sounds.playTick();
                  onOpenAdmin();
                }}
                title={t('header.admin', 'Панель Администратора')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-950/80 to-orange-950/80 border border-amber-600/70 text-amber-300 hover:text-white hover:border-amber-500 text-xs font-bold transition-all shadow-sm shadow-amber-950/40"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">{t('header.admin', 'Админ-панель')}</span>
              </button>
            )}

            {/* Host Stop Match Button */}
            {isHost && (
              <button
                onClick={() => {
                  sounds.playTick();
                  setIsStopConfirmOpen(true);
                }}
                title={t('nav.stop_match', 'Остановить партию досрочно')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 hover:text-white text-xs font-bold transition-all shadow-xs"
              >
                <Square className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
                <span className="hidden sm:inline">{t('nav.stop_match', 'Остановить')}</span>
              </button>
            )}

            {/* Sound toggle */}
            <button
              onClick={() => {
                onToggleSound();
                sounds.playTick();
              }}
              title={soundEnabled ? `${t('settings.sound_off', 'Выключить звук')} [M]` : `${t('settings.sound_on', 'Включить звук')} [M]`}
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
                      {t('profile.level_short', 'Ур.')} {user.level || 1}
                    </span>
                  )}
                  {isSpectator ? (
                    <span className="text-[10px] text-indigo-300 font-mono font-bold bg-indigo-950 px-1.5 py-0.2 rounded border border-indigo-800/60">
                      {t('lobby.role_spectator', 'Зритель')}
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
                title={`+${roomState.sessionXp} XP`}
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
              title={t('lobby.nav_menu', 'Меню навигации')}
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
              equippedCardBack={user?.equippedCosmetics?.cardBack}
              playerName={playerName}
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
          <div 
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className={`grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0 ${
              roomState.phase === 'DAY_DISCUSSION' || isSoloSpeechPhase
                ? 'h-full overflow-hidden md:overflow-y-auto'
                : 'overflow-y-auto'
            }`}
          >
            
            {/* Left 7 Columns: Game Table (or Night Phase) */}
            <div className={`md:col-span-7 flex flex-col justify-between border-b md:border-b-0 md:border-r border-zinc-850 ${
              roomState.phase === 'DAY_DISCUSSION' || isSoloSpeechPhase
                ? 'px-1.5 sm:px-5 pt-0.5 sm:pt-1.5 pb-1 sm:pb-4 space-y-1 sm:space-y-2 h-full min-h-0 overflow-hidden md:overflow-visible md:h-auto md:p-6 md:space-y-4'
                : 'p-4 sm:p-6 space-y-4'
            } ${
              mobileTab === 'left' ? 'flex' : 'hidden md:flex'
            }`}>
              
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
                <div className={`flex-1 min-h-0 flex flex-col ${
                  roomState.phase === 'DAY_DISCUSSION' || isSoloSpeechPhase
                    ? 'justify-start gap-1 sm:gap-1.5 h-full overflow-hidden md:overflow-visible md:h-auto md:space-y-3.5 md:justify-between'
                    : 'space-y-3.5 justify-between'
                }`}>
                  
                  {/* Compact Phase & Timer Bar */}
                  <div className="flex items-center justify-between gap-2 bg-[#14151f]/90 border border-zinc-800/80 px-3 py-1.5 rounded-lg shadow-xs shrink-0">
                    <div className="flex items-center gap-1.5 text-xs font-bold truncate">
                      {roomState.dayNumber > 0 && (
                        <span className="text-zinc-400 font-medium">День {roomState.dayNumber} ·</span>
                      )}
                      <span className={currentPhaseInfo.color}>{currentPhaseInfo.title}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {roomState.phase === 'DAY_DISCUSSION' && (roomState.players.length - alivePlayers.length) > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            sounds.playTick();
                            setShowEliminatedPlayers(prev => !prev);
                          }}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/40 hover:bg-black/60 border border-zinc-700/60 text-zinc-300 hover:text-white transition-colors"
                          title={showEliminatedPlayers ? 'Скрыть выбывших игроков' : 'Показать скрытые карточки выбывших игроков'}
                        >
                          {showEliminatedPlayers ? (
                            <>
                              <EyeOff className="w-2.5 h-2.5 text-zinc-400" />
                              <span>Скрыть ({roomState.players.length - alivePlayers.length})</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-2.5 h-2.5 text-amber-400" />
                              <span>Выбыло: {roomState.players.length - alivePlayers.length}</span>
                            </>
                          )}
                        </button>
                      )}

                      {roomState.phaseTimeRemaining > 0 && (
                        <div className="flex items-center gap-1 text-amber-400 font-mono font-bold text-xs shrink-0 bg-black/40 px-2 py-0.5 rounded border border-amber-500/20">
                          <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
                          <span>{roomState.phaseTimeRemaining}с</span>
                        </div>
                      )}
                    </div>
                  </div>



                  {/* Active vs Eliminated Players calculation */}
                  {(() => {
                    const eliminatedCount = roomState.players.filter(p => !p.isAlive).length;
                    const displayedPlayers = roomState.players
                      .map((p, originalIndex) => ({ player: p, originalIndex }))
                      .filter(({ player }) => {
                        // Keep alive players, or keep eliminated players if toggled or if currently speaking their last words
                        if (player.isAlive) return true;
                        if (showEliminatedPlayers) return true;
                        if (roomState.currentSpeakerId === player.id) return true;
                        return false;
                      });

                    const isVotingPhase = 
                      roomState.phase === 'VOTING' || 
                      roomState.phase === 'REVOTE';

                    // VOTING VIEW: When voting phase is active, hide all player cards and show a dedicated, convenient voting list
                    if (isVotingPhase) {
                      const candidateIds = roomState.phase === 'REVOTE'
                        ? ((roomState.defenseCandidates && roomState.defenseCandidates.length > 0)
                            ? roomState.defenseCandidates
                            : (roomState.nominatedPlayerIds || []))
                        : (roomState.nominatedPlayerIds || []);

                      const candidatePlayers = candidateIds
                        .map(id => {
                          const originalIndex = roomState.players.findIndex(p => p.id === id);
                          const player = roomState.players.find(p => p.id === id);
                          return player ? { player, originalIndex } : null;
                        })
                        .filter((item): item is { player: Player; originalIndex: number } => item !== null);

                      const eligibleVoters = roomState.phase === 'REVOTE'
                        ? roomState.players.filter(p => p.isAlive && !(roomState.tieVotersExcluded || []).includes(p.id))
                        : roomState.players.filter(p => p.isAlive);

                      const votedCount = eligibleVoters.filter(p => p.votedFor !== undefined && p.votedFor !== null).length;
                      const totalVoters = eligibleVoters.length;
                      const canCastVote = !isSpectator && isAlive && !isTieExcluded;
                      const myVote = myPlayer?.votedFor;

                      const votedCandidateObj = candidatePlayers.find(c => c.player.id === myVote);

                      const abstainVoters = roomState.players.filter(p => p.isAlive && p.votedFor === 'skip');
                      const abstainCount = abstainVoters.length;

                      return (
                        <div className="space-y-2 flex-1 flex flex-col justify-start max-w-3xl mx-auto w-full">
                          {/* 1. ULTRA-COMPACT VOTING STRIP */}
                          <div className="bg-[#14121a]/95 border border-rose-700/60 rounded-xl px-3 py-2 shadow-md flex items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-rose-950 border border-rose-600/70 flex items-center justify-center text-rose-400 shrink-0">
                                <Gavel className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs sm:text-sm font-cinzel font-black tracking-wider text-rose-300 uppercase truncate">
                                  {roomState.phase === 'REVOTE' ? t('phase.revote_title', 'Переголосование') : t('phase.voting_title', 'Суд: Голосование')}
                                </span>
                                <span className="text-[10px] font-mono font-bold bg-rose-950/90 text-rose-300 border border-rose-700/60 px-1.5 py-0.2 rounded shrink-0">
                                  {candidatePlayers.length} {t('game.candidates_short', 'канд.')}
                                </span>
                              </div>
                            </div>

                            {/* User status badge / guidance */}
                            <div className="flex items-center gap-2 shrink-0">
                              {canCastVote ? (
                                myVote && myVote !== 'skip' && votedCandidateObj ? (
                                  <div className="bg-emerald-950/70 border border-emerald-600/80 rounded-lg px-2 py-0.5 flex items-center gap-1 text-[11px] text-emerald-300">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                    <span className="font-medium truncate max-w-[140px] sm:max-w-none">
                                      {t('game.vote_for', 'Голос за')} #{votedCandidateObj.originalIndex + 1}
                                    </span>
                                  </div>
                                ) : myVote === 'skip' ? (
                                  <div className="bg-amber-950/70 border border-amber-600/80 rounded-lg px-2 py-0.5 flex items-center gap-1 text-[11px] text-amber-300">
                                    <Check className="w-3 h-3 text-amber-400 shrink-0" />
                                    <span>{t('game.abstained', 'Воздержались')}</span>
                                  </div>
                                ) : (
                                  <div className="bg-amber-950/50 border border-amber-500/60 rounded-lg px-2 py-0.5 flex items-center gap-1 text-[11px] text-amber-300 animate-pulse">
                                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                    <span>{t('game.choose_candidate', 'Выберите кандидата')}</span>
                                  </div>
                                )
                              ) : (
                                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-lg">
                                  {isTieExcluded ? t('game.no_vote_right', 'Без права голоса') : t('lobby.spectating', 'Наблюдение')}
                                </span>
                              )}

                              <div className="bg-zinc-900/90 border border-zinc-750 px-2 py-0.5 rounded-lg flex items-center gap-1 text-[11px] font-mono">
                                <span className="text-zinc-400">{t('game.votes_count', 'Голосов:')}</span>
                                <span className="font-bold text-amber-400">{votedCount}/{totalVoters}</span>
                              </div>
                            </div>
                          </div>

                          {/* 2. MAXIMALLY COMPACT CANDIDATE LIST */}
                          <div className="bg-[#101118]/90 border border-zinc-800/80 rounded-xl divide-y divide-zinc-800/60 overflow-hidden shadow-md">
                            {candidatePlayers.length === 0 ? (
                              <div className="p-4 text-center space-y-1.5">
                                <Gavel className="w-6 h-6 text-zinc-600 mx-auto" />
                                <div className="text-xs font-bold text-zinc-300">{t('game.no_candidates', 'Нет кандидатов на голосование')}</div>
                                {canCastVote && (
                                  <button
                                    type="button"
                                    onClick={onSkipPhase}
                                    className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-all"
                                  >
                                    {t('game.next_phase', 'Перейти к следующей фазе')}
                                  </button>
                                )}
                              </div>
                            ) : (
                              candidatePlayers.map(({ player: candidate, originalIndex: candIndex }) => {
                                const isCandidateMe = candidate.id === myId;
                                const isSelectedByMe = myVote === candidate.id;
                                
                                const candidateVotes = roomState.players.filter(p => p.isAlive && p.votedFor === candidate.id);
                                const candidateVoteCount = candidateVotes.length;

                                return (
                                  <div
                                    key={candidate.id}
                                    className={`px-3 py-2 flex items-center justify-between gap-2.5 transition-colors ${
                                      isSelectedByMe
                                        ? 'bg-emerald-950/25 border-l-4 border-l-emerald-500'
                                        : 'hover:bg-zinc-800/30'
                                    }`}
                                  >
                                    {/* Left: Slot Number, Compact Avatar/Video, Name & Vote Badges */}
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {/* Seat badge */}
                                      <span className="text-xs font-mono font-black text-amber-300 bg-amber-950/80 border border-amber-600/70 px-1.5 py-0.5 rounded-md shrink-0 shadow-xs">
                                        #{candIndex + 1}
                                      </span>

                                      {/* Compact Avatar / Video Thumbnail */}
                                      <div className="w-7 h-7 shrink-0 rounded-lg overflow-hidden bg-black/60 border border-zinc-800 flex items-center justify-center relative">
                                        {webRtc ? (
                                          <PlayerVideoSlot
                                            playerId={candidate.id}
                                            isMe={isCandidateMe}
                                            isAlive={candidate.isAlive}
                                            isSpeaker={false}
                                            isSpotlight={false}
                                            localStream={webRtc.localStream}
                                            isLocalCameraOn={webRtc.isCameraOn}
                                            isLocalMicOn={webRtc.isMicOn}
                                            isLocalSpeaking={webRtc.localSpeaking}
                                            remotePeer={webRtc.remotePeers.get(candidate.id)}
                                            blockIncomingVideo={webRtc.settings.blockIncomingVideo}
                                            dataSaverMode={webRtc.settings.dataSaverMode}
                                            onToggleMic={webRtc.toggleMic}
                                            onToggleCamera={webRtc.toggleCamera}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <GangsterIcon size={20} />
                                        )}
                                        <span 
                                          className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full border border-black ${candidate.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} 
                                          title={candidate.connected ? t('lobby.online', 'В сети') : t('lobby.offline', 'Не в сети')}
                                        />
                                      </div>

                                      {/* Candidate Name & Info */}
                                      <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                                        <span className="font-bold text-xs sm:text-sm text-zinc-100 truncate max-w-[120px] sm:max-w-[160px]">
                                          {candidate.name}
                                        </span>
                                        {isCandidateMe && (
                                          <span className="text-[9px] text-amber-400 font-mono font-bold bg-amber-950/70 border border-amber-600/50 px-1 py-0.2 rounded shrink-0">
                                            {t('lobby.you_upper', 'ВЫ')}
                                          </span>
                                        )}
                                        {candidate.clanTag && (
                                          <span className="text-[9px] font-mono font-bold text-amber-400 bg-black/50 border border-amber-500/40 px-1 rounded shrink-0">
                                            [{candidate.clanTag}]
                                          </span>
                                        )}
                                      </div>

                                      {/* Candidate vote counter & voter seats */}
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                                          candidateVoteCount > 0
                                            ? 'bg-amber-950/80 border-amber-600/70 text-amber-300'
                                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                                        }`}>
                                          <Gavel className="w-3 h-3 text-amber-400" />
                                          <span>{candidateVoteCount}</span>
                                        </span>

                                        {!roomState.settings.anonymousVoting && candidateVotes.length > 0 && (
                                          <div className="hidden sm:flex items-center gap-0.5">
                                            {candidateVotes.map(voter => {
                                              const vIdx = roomState.players.findIndex(p => p.id === voter.id);
                                              return (
                                                <span 
                                                  key={voter.id}
                                                  title={`${voter.name}`}
                                                  className="text-[9px] font-mono bg-zinc-900 border border-zinc-750 text-zinc-300 px-1 py-0.2 rounded"
                                                >
                                                  #{vIdx + 1}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Right: Vote Action Button */}
                                    <div className="shrink-0">
                                      {canCastVote ? (
                                        <button
                                          type="button"
                                          onClick={() => handleVote(candidate.id)}
                                          className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                                            isSelectedByMe
                                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400 shadow-xs'
                                              : 'bg-gradient-to-r from-rose-700 to-rose-900 hover:from-rose-600 hover:to-rose-800 text-white border border-rose-600/70 active:scale-95 shadow-xs'
                                          }`}
                                        >
                                          {isSelectedByMe ? (
                                            <>
                                              <CheckCircle2 className="w-3 h-3" />
                                              <span>{t('game.your_choice', 'Ваш выбор')}</span>
                                            </>
                                          ) : (
                                            <>
                                              <Gavel className="w-3 h-3 text-rose-200" />
                                              <span>{t('game.vote', 'Голос')}</span>
                                            </>
                                          )}
                                        </button>
                                      ) : (
                                        <span className="text-xs font-mono text-zinc-500">
                                          {candidateVoteCount} {t('game.candidates_short', 'гол.')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}

                            {/* 3. INTEGRATED COMPACT ABSTAIN / SKIP ROW */}
                            <div className={`px-3 py-1.5 flex items-center justify-between gap-2.5 transition-colors bg-black/20 ${
                              myVote === 'skip' ? 'bg-amber-950/20 border-l-4 border-l-amber-500' : ''
                            }`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-md bg-zinc-900 border border-zinc-750 flex items-center justify-center text-zinc-400 shrink-0">
                                  <Square className="w-3 h-3" />
                                </div>
                                <span className="text-xs text-zinc-300 font-medium truncate">
                                  {t('game.abstain_all', 'Воздержаться (Против всех)')}
                                </span>
                                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                                  abstainCount > 0
                                    ? 'bg-zinc-800 border-zinc-700 text-amber-300'
                                    : 'bg-zinc-900/50 border-zinc-800 text-zinc-500'
                                }`}>
                                  {abstainCount}
                                </span>
                                {!roomState.settings.anonymousVoting && abstainVoters.length > 0 && (
                                  <span className="hidden sm:inline text-[10px] font-mono text-zinc-500">
                                    ({abstainVoters.map(v => `#${roomState.players.findIndex(p => p.id === v.id) + 1}`).join(', ')})
                                  </span>
                                )}
                              </div>

                              <div className="shrink-0">
                                {canCastVote && (
                                  <button
                                    type="button"
                                    onClick={() => handleVote('skip')}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                      myVote === 'skip'
                                        ? 'bg-amber-600 text-white font-bold border border-amber-400 shadow-xs'
                                        : 'bg-[#181924] hover:bg-[#202230] text-zinc-300 border border-zinc-700'
                                    }`}
                                  >
                                    {myVote === 'skip' ? `✓ ${t('game.abstained', 'Воздержались')}` : t('game.abstain', 'Воздержаться')}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 4. ULTRA-COMPACT TABLE TURNOUT TRACKER */}
                          <div className="bg-[#0d0e14]/90 border border-zinc-850 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] font-mono flex-wrap">
                            <span className="text-zinc-400 flex items-center gap-1 shrink-0">
                              <Users className="w-3 h-3 text-zinc-500" />
                              <span>{t('game.turnout', 'Явка')} ({votedCount}/{totalVoters}):</span>
                            </span>
                            <div className="flex items-center gap-1 flex-wrap">
                              {eligibleVoters.map(voter => {
                                const origIdx = roomState.players.findIndex(p => p.id === voter.id);
                                const hasVoted = voter.votedFor !== undefined && voter.votedFor !== null;
                                const isMe = voter.id === myId;

                                return (
                                  <span
                                    key={voter.id}
                                    title={`${voter.name}: ${hasVoted ? t('game.voted', 'Проголосовал') : t('game.thinking', 'Думает')}`}
                                    className={`px-1.5 py-0.2 rounded border text-[10px] flex items-center gap-0.5 ${
                                      hasVoted
                                        ? 'bg-emerald-950/70 border-emerald-600/70 text-emerald-300'
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                                    } ${isMe ? 'ring-1 ring-amber-400/60' : ''}`}
                                  >
                                    <span className={hasVoted ? 'text-emerald-400 font-bold' : 'text-zinc-400'}>
                                      #{origIdx + 1}
                                    </span>
                                    {hasVoted ? (
                                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                                    ) : (
                                      <span className="w-1 h-1 rounded-full bg-amber-500/60 animate-pulse" />
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const isSoloSpeakerPhase = 
                      roomState.phase === 'INDIVIDUAL_SPEECHES' || 
                      roomState.phase === 'DEFENSE_SPEECH' || 
                      roomState.phase === 'LAST_WORDS_ARREST' || 
                      roomState.phase === 'LAST_WORDS_KILLED';

                    const speakerPlayer = currentSpeakerPlayer || (
                      roomState.phase === 'DEFENSE_SPEECH' && (roomState.defenseCandidates?.length ?? 0) > 0
                        ? roomState.players.find(p => p.id === roomState.defenseCandidates?.[0])
                        : null
                    ) || alivePlayers[0] || roomState.players[0];

                    const speakerActualIndex = speakerPlayer 
                      ? roomState.players.findIndex(p => p.id === speakerPlayer.id) 
                      : 0;

                    // SOLO SPEAKER VIEW: When speech phase is active, show ONLY the speaker card & nomination list
                    if (isSoloSpeakerPhase && speakerPlayer) {
                      const isSpeakerMe = speakerPlayer.id === myId;
                      const speakerRoleDef = isSpeakerMe 
                        ? myRoleDef 
                        : (speakerPlayer.role ? ROLE_DEFINITIONS[speakerPlayer.role] : null);

                      return (
                        <div className="space-y-1 sm:space-y-2 md:space-y-3 flex-1 min-h-0 flex flex-col justify-start overflow-hidden md:overflow-visible">
                          {/* 1. SOLO SPEAKER CARD - FULL BLEED VIDEO/AVATAR */}
                          <div className="bg-[#12131d] border-2 border-amber-500/80 rounded-2xl shadow-xl shadow-amber-950/25 relative overflow-hidden aspect-[16/10] sm:aspect-[16/9] min-h-[130px] sm:min-h-[170px] max-h-[30vh] sm:max-h-[300px] md:max-h-[340px] flex items-center justify-center shrink-0">
                            {/* Video stream or Avatar occupies the ENTIRE space of the card */}
                            <div className="absolute inset-0 w-full h-full">
                              {webRtc ? (
                                <PlayerVideoSlot
                                  playerId={speakerPlayer.id}
                                  isMe={isSpeakerMe}
                                  isAlive={speakerPlayer.isAlive}
                                  isSpeaker={true}
                                  isSpotlight={true}
                                  fillCard={true}
                                  localStream={webRtc.localStream}
                                  isLocalCameraOn={webRtc.isCameraOn}
                                  isLocalMicOn={webRtc.isMicOn}
                                  isLocalSpeaking={webRtc.localSpeaking}
                                  remotePeer={webRtc.remotePeers.get(speakerPlayer.id)}
                                  blockIncomingVideo={webRtc.settings.blockIncomingVideo}
                                  dataSaverMode={webRtc.settings.dataSaverMode}
                                  onToggleMic={webRtc.toggleMic}
                                  onToggleCamera={webRtc.toggleCamera}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#181926] to-[#0d0e14]">
                                  <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center border shadow-inner transition-all duration-500 ${
                                    !speakerPlayer.isAlive
                                      ? 'bg-zinc-950 border-rose-900/60 text-zinc-500 opacity-60 grayscale'
                                      : 'bg-amber-950 border-amber-600 text-amber-200 ring-2 ring-amber-500/60'
                                  }`}>
                                    <GangsterIcon size={40} className={`w-10 h-10 sm:w-12 sm:h-12 ${!speakerPlayer.isAlive ? 'opacity-30' : ''}`} />
                                  </div>

                                  {!speakerPlayer.isAlive && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-[1px]">
                                      <svg className="w-full h-full text-rose-600 drop-shadow-[0_0_4px_rgba(225,29,72,0.9)] opacity-85" viewBox="0 0 100 80" preserveAspectRatio="none">
                                        <line x1="8" y1="8" x2="92" y2="72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                        <line x1="92" y1="8" x2="8" y2="72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                      </svg>
                                      <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-rose-950 border border-rose-600 flex items-center justify-center shadow">
                                        <Skull className="w-3.5 h-3.5 text-rose-300" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Top Overlay: Slot #, Status, Menu */}
                            <div className="absolute top-0 left-0 right-0 z-20 p-2.5 sm:p-3 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between pointer-events-auto">
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-mono font-black text-amber-300 bg-black/60 border border-amber-500/70 px-2 py-0.5 rounded-lg shadow-sm backdrop-blur-sm">
                                  #{speakerActualIndex + 1}
                                </span>
                                <span 
                                  className={`w-2 h-2 rounded-full ${speakerPlayer.connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'}`} 
                                  title={speakerPlayer.connected ? t('lobby.online', 'В сети') : t('lobby.offline', 'Не в сети')}
                                />
                                
                                {roomState.phase !== 'INDIVIDUAL_SPEECHES' && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/80 border border-amber-600/70 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-xs backdrop-blur-sm">
                                      <Mic className="w-3 h-3 text-amber-400 animate-pulse" />
                                      <span>
                                        {roomState.phase === 'DEFENSE_SPEECH'
                                          ? t('phase.defense_speech_title', 'Оправдательные речи').toUpperCase()
                                          : roomState.phase === 'LAST_WORDS_ARREST'
                                          ? t('phase.last_words_arrest_title', 'Последнее слово').toUpperCase()
                                          : t('phase.last_words_killed_title', 'Завещание').toUpperCase()}
                                      </span>
                                    </span>

                                    {isSpeakerMe && (
                                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/90 border border-emerald-600/70 px-2 py-0.5 rounded-md animate-pulse backdrop-blur-sm">
                                        {t('game.at_mic', 'Вы у микрофона')}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                {speakerPlayer.isBot && (
                                  <span className="text-[9px] text-zinc-300 font-mono bg-black/60 border border-zinc-700 px-1.5 py-0.5 rounded backdrop-blur-sm">
                                    {t('lobby.bot', 'БОТ')}
                                  </span>
                                )}
                                {speakerPlayer.isHost && (
                                  <span title={t('lobby.role_host', 'Ведущий стола')} className="text-amber-400 drop-shadow-sm">
                                    <Crown className="w-4 h-4" />
                                  </span>
                                )}

                                {/* Context actions for other players */}
                                {!isSpeakerMe && (
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        sounds.playTick();
                                        setActivePlayerMenuId(activePlayerMenuId === speakerPlayer.id ? null : speakerPlayer.id);
                                      }}
                                      title={t('game.player_actions', 'Действия с игроком')}
                                      className="p-1 rounded bg-black/50 text-zinc-300 hover:text-white hover:bg-black/70 border border-zinc-700/60 backdrop-blur-sm transition-colors"
                                    >
                                      <MoreVertical className="w-4 h-4" />
                                    </button>

                                    {activePlayerMenuId === speakerPlayer.id && (
                                      <div 
                                        onClick={e => e.stopPropagation()}
                                        className="absolute right-0 top-7 z-40 w-44 bg-[#14151e] border border-zinc-700/90 rounded-xl shadow-2xl p-1 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            sounds.playTick();
                                            setActivePlayerMenuId(null);
                                            setSelectedPlayerForReport({ id: speakerPlayer.id, name: speakerPlayer.name });
                                          }}
                                          className="w-full px-2 py-1.5 rounded-lg hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 text-left font-bold flex items-center gap-2 transition-colors text-[11px]"
                                        >
                                          <Flag className="w-3 h-3 text-rose-400" />
                                          <span>{t('game.report', 'Пожаловаться')}</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            sounds.playTick();
                                            setActivePlayerMenuId(null);
                                            setChatInput(prev => `${prev ? prev + ' ' : ''}@${speakerPlayer.name} `);
                                          }}
                                          className="w-full px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 text-left flex items-center gap-2 transition-colors text-[11px]"
                                        >
                                          <AtSign className="w-3 h-3 text-amber-400" />
                                          <span>{t('game.mention', 'Упомянуть в чате')}</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Bottom Overlay: Speaker Name, Clan Tag, Role */}
                            <div className="absolute bottom-0 left-0 right-0 z-20 p-2 sm:p-2.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col items-center justify-center gap-1 pointer-events-auto">
                              <div className="flex items-center justify-center gap-1.5 text-sm sm:text-base font-bold truncate drop-shadow-md">
                                {speakerPlayer.clanTag && (
                                  <span 
                                    className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-black/70 border border-amber-500/70 text-amber-300 shrink-0 backdrop-blur-sm"
                                    title={speakerPlayer.clanName || undefined}
                                  >
                                    [{speakerPlayer.clanTag}]
                                  </span>
                                )}
                                <span className={`truncate ${!speakerPlayer.isAlive ? 'line-through text-zinc-400' : 'text-zinc-100 font-extrabold'}`}>
                                  {speakerPlayer.name}
                                </span>
                                {isSpeakerMe && <span className="text-xs text-amber-400 font-semibold shrink-0">({t('lobby.you', '(Вы)')})</span>}
                              </div>

                              {speakerRoleDef && (
                                <div className="flex items-center justify-center">
                                  <span 
                                    className="py-0.5 px-2.5 rounded-md text-[10px] font-bold border truncate font-mono backdrop-blur-md shadow-xs"
                                    style={{
                                      backgroundColor: `${speakerRoleDef.color}25`,
                                      borderColor: `${speakerRoleDef.color}70`,
                                      color: speakerRoleDef.color
                                    }}
                                  >
                                    {speakerRoleDef.name}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 2. CANDIDATES LIST FOR CURRENT SPEAKER DURING INDIVIDUAL SPEECHES */}
                          {roomState.phase === 'INDIVIDUAL_SPEECHES' && (
                            <div className="bg-[#10111a] border border-zinc-800/90 rounded-xl p-1.5 sm:p-2.5 md:p-3 space-y-1 sm:space-y-2 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
                              <div className="flex items-center justify-between gap-2 border-b border-zinc-850/80 pb-1 sm:pb-2 shrink-0">
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-amber-950/80 border border-amber-600/60 flex items-center justify-center text-amber-400 shrink-0">
                                    <Gavel className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                                      <span>{t('game.candidates_voting', 'Кандидаты на голосование')}</span>
                                      <span className="text-[10px] text-zinc-400 font-normal">
                                        ({alivePlayers.length} {t('game.alive_at_table', 'живых за столом')})
                                      </span>
                                    </h4>
                                    <p className="text-[10px] text-zinc-400 leading-tight">
                                      {isCurrentSpeaker ? (
                                        roomState.currentSpeakerHasNominated ? (
                                          <span className="text-emerald-400 font-medium">{t('game.already_nominated', 'Вы уже выставили кандидата в этот ход.')}</span>
                                        ) : isFirstDayNoVoting ? (
                                          <span className="text-amber-400/90">{t('game.nomination_disabled_day1', 'Выставление в 1-й день отключено правилами стола.')}</span>
                                        ) : (
                                          <span className="text-zinc-300">{t('game.select_nominee', 'Выберите живого игрока для выставления на городской суд:')}</span>
                                        )
                                      ) : (
                                        <span>{t('game.speaker_can_nominate', 'Спикер может выставить одного живого игрока на голосование.')}</span>
                                      )}
                                    </p>
                                  </div>
                                </div>

                                {/* Active Nominated Candidates count */}
                                {(roomState.nominatedPlayerIds || []).length > 0 && (
                                  <div className="text-[10px] font-mono bg-rose-950/60 border border-rose-800/70 px-2 py-0.5 rounded text-rose-300 shrink-0">
                                    {t('game.in_court', 'В суде:')} <strong className="text-white">{(roomState.nominatedPlayerIds || []).length}</strong>
                                  </div>
                                )}
                              </div>

                              {/* Living Players Candidates Grid - 1 column on mobile, dynamic height filling */}
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 sm:gap-1.5 flex-1 min-h-0 overflow-y-auto pr-1 md:max-h-[220px] lg:max-h-[260px]">
                                {alivePlayers.map(p => {
                                  const pIndex = roomState.players.findIndex(x => x.id === p.id);
                                  const isAlreadyNominated = (roomState.nominatedPlayerIds || []).includes(p.id);
                                  const isSelf = p.id === myId;
                                  const isTheSpeaker = p.id === speakerPlayer.id;
                                  const canNominateThisPlayer = 
                                    !isSpectator &&
                                    isCurrentSpeaker &&
                                    !roomState.currentSpeakerHasNominated &&
                                    !isAlreadyNominated &&
                                    !isFirstDayNoVoting &&
                                    !isSelf;

                                  return (
                                    <div
                                      key={p.id}
                                      className={`flex items-center justify-between gap-1.5 p-1.5 sm:p-2 rounded-lg border text-xs transition-colors shrink-0 ${
                                        isAlreadyNominated
                                          ? 'bg-rose-950/30 border-rose-800/60 text-zinc-200'
                                          : isTheSpeaker
                                          ? 'bg-amber-950/20 border-amber-800/50 text-amber-200'
                                          : 'bg-[#151622] border-zinc-800/70 hover:border-zinc-700 text-zinc-200'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-[10px] font-mono font-bold text-amber-400 shrink-0">
                                          #{pIndex + 1}
                                        </span>
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1 font-bold text-[11px] truncate">
                                            {p.clanTag && (
                                              <span className="text-[8px] font-mono px-0.5 rounded bg-zinc-800 text-amber-300 shrink-0">
                                                [{p.clanTag}]
                                              </span>
                                            )}
                                            <span className="truncate">{p.name}</span>
                                            {isSelf && <span className="text-[9px] text-amber-400 shrink-0">({t('lobby.you', '(Вы)')})</span>}
                                          </div>
                                          {isAlreadyNominated && (
                                            <div className="text-[9px] text-rose-400 font-mono flex items-center gap-0.5">
                                              <Gavel className="w-2.5 h-2.5 shrink-0" />
                                              <span className="truncate">{t('game.nominated', 'В суде')} {p.nominatedBy ? `(${p.nominatedBy})` : ''}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div className="shrink-0">
                                        {canNominateThisPlayer ? (
                                          <button
                                            type="button"
                                            onClick={() => handleNominate(p.id)}
                                            className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px] transition-transform active:scale-95 shadow flex items-center gap-1"
                                            title={`${t('game.nominate', 'Выставить')} ${p.name}`}
                                          >
                                            <Gavel className="w-3 h-3 text-black" />
                                            <span>{t('game.nominate', 'Выставить')}</span>
                                          </button>
                                        ) : isAlreadyNominated ? (
                                          <span className="text-[9px] font-mono text-rose-400 bg-rose-950/80 border border-rose-800/60 px-1.5 py-0.5 rounded">
                                            {t('game.nominated', 'Выставлен')}
                                          </span>
                                        ) : isTheSpeaker ? (
                                          <span className="text-[9px] font-mono text-amber-400 bg-amber-950/80 border border-amber-800/50 px-1.5 py-0.5 rounded">
                                            {t('game.speaker', 'Спикер')}
                                          </span>
                                        ) : isCurrentSpeaker && roomState.currentSpeakerHasNominated ? (
                                          <span className="text-[9px] text-zinc-500 font-mono">
                                            1
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 3. DEFENSE SPEECH CANDIDATES CONTEXT */}
                          {roomState.phase === 'DEFENSE_SPEECH' && (
                            <div className="bg-[#14101e] border border-purple-900/60 rounded-xl p-2.5 sm:p-3 text-xs space-y-1.5 shadow-sm">
                              <div className="flex items-center gap-1.5 text-purple-300 font-bold">
                                <Gavel className="w-3.5 h-3.5 text-purple-400" />
                                <span>{t('phase.defense_speech_sub', 'Кандидаты при ничьей (выступают по очереди):')}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {(roomState.defenseCandidates || []).map(cid => {
                                  const cand = roomState.players.find(p => p.id === cid);
                                  if (!cand) return null;
                                  const cIdx = roomState.players.findIndex(p => p.id === cid);
                                  const isCurrDefSpeaker = speakerPlayer.id === cand.id;
                                  return (
                                    <span
                                      key={cid}
                                      className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border flex items-center gap-1 ${
                                        isCurrDefSpeaker
                                          ? 'bg-purple-950 text-purple-200 border-purple-500 ring-1 ring-purple-500/70 shadow'
                                          : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                                      }`}
                                    >
                                      <span>#{cIdx + 1} {cand.name}</span>
                                      {isCurrDefSpeaker && <Mic className="w-2.5 h-2.5 text-purple-400 animate-pulse" />}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <>
                        {/* Header bar above Player Cards Grid with Alive Count and Eliminated Toggle */}
                        {eliminatedCount > 0 && roomState.phase !== 'DAY_DISCUSSION' && (
                          <div className="flex items-center justify-between text-[11px] px-1 py-0.5 text-zinc-400">
                            <div className="flex items-center gap-1.5 font-mono text-[10px]">
                              <span className="text-zinc-300">
                                {t('home.in_game', 'В игре:')} <strong className="text-amber-400 font-bold">{roomState.players.length - eliminatedCount}</strong>/{roomState.players.length}
                              </span>
                              <span className="text-rose-400/80">
                                ({t('game.eliminated', 'Выбыло:')} {eliminatedCount})
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                sounds.playTick();
                                setShowEliminatedPlayers(prev => !prev);
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#141520] hover:bg-[#1d1f30] border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
                              title={showEliminatedPlayers ? t('common.hide', 'Скрыть выбывших игроков') : t('common.show', 'Показать скрытые карточки выбывших игроков')}
                            >
                              {showEliminatedPlayers ? (
                                <>
                                  <EyeOff className="w-3 h-3 text-zinc-400" />
                                  <span>{t('common.hide', 'Скрыть')} ({eliminatedCount})</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3 h-3 text-amber-400" />
                                  <span>{t('common.show', 'Показать')} ({eliminatedCount})</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {/* Player Cards Grid - 2 horizontally, 6 vertically, 1px gap, no scroll on mobile during DAY_DISCUSSION */}
                        <div className={`grid ${
                          roomState.phase === 'DAY_DISCUSSION'
                            ? 'grid-cols-2 grid-rows-6 gap-[1px] flex-1 min-h-0 h-full overflow-hidden md:gap-2 md:grid-cols-4 lg:grid-cols-5 md:grid-rows-none md:auto-rows-auto md:flex-initial md:h-auto md:max-h-[580px] md:overflow-y-auto md:pr-1'
                            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 sm:gap-2 max-h-[460px] overflow-y-auto pr-1'
                        }`}>
                          {displayedPlayers.map(({ player, originalIndex }) => {
                            const index = originalIndex;
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

                            // In DAY_DISCUSSION phase: Full-bleed video/avatar card analogous to the individual speech card
                            if (roomState.phase === 'DAY_DISCUSSION') {
                              return (
                                <div
                                  key={player.id}
                                  className={`relative rounded-xs md:rounded-xl border overflow-hidden flex items-center justify-center transition-all duration-200 h-full w-full min-h-0 md:min-h-[76px] md:aspect-[16/10] ${
                                    !player.isAlive
                                      ? 'bg-[#0b0c10] border-zinc-900/90 opacity-60'
                                      : isSpeaker
                                      ? 'bg-[#1b1713] border-amber-500 shadow-md shadow-amber-950/40 ring-1 ring-amber-500/70'
                                      : isCandidate || isDefenseCandidate
                                      ? 'bg-[#181116] border-rose-600/80 shadow-sm shadow-rose-950/30'
                                      : isMe
                                      ? 'bg-[#151520] border-amber-500/60 ring-1 ring-amber-500/30'
                                      : 'bg-[#111218] border-zinc-800/80 hover:border-zinc-700'
                                  }`}
                                >
                                  {/* Full-bleed Video stream or Avatar */}
                                  <div className="absolute inset-0 w-full h-full">
                                    {webRtc ? (
                                      <PlayerVideoSlot
                                        playerId={player.id}
                                        isMe={isMe}
                                        isAlive={player.isAlive}
                                        isSpeaker={isSpeaker}
                                        isSpotlight={false}
                                        fillCard={true}
                                        compactFill={true}
                                        localStream={webRtc.localStream}
                                        isLocalCameraOn={webRtc.isCameraOn}
                                        isLocalMicOn={webRtc.isMicOn}
                                        isLocalSpeaking={webRtc.localSpeaking}
                                        remotePeer={webRtc.remotePeers.get(player.id)}
                                        blockIncomingVideo={webRtc.settings.blockIncomingVideo}
                                        dataSaverMode={webRtc.settings.dataSaverMode}
                                        onToggleMic={webRtc.toggleMic}
                                        onToggleCamera={webRtc.toggleCamera}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="relative w-full h-full flex flex-col items-center justify-center p-1 bg-gradient-to-b from-[#14151e] to-[#0d0e14]">
                                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border shadow-inner transition-all duration-500 ${
                                          !player.isAlive
                                            ? 'bg-zinc-950 border-rose-900/60 text-zinc-500 opacity-60 grayscale'
                                            : isSpeaker
                                            ? 'bg-amber-950 border-amber-600 text-amber-200'
                                            : 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                        }`}>
                                          <GangsterIcon size={22} className={`w-5 h-5 sm:w-6 sm:h-6 ${!player.isAlive ? 'opacity-30' : ''}`} />
                                        </div>

                                        {!player.isAlive && (
                                          <div className="absolute inset-0 rounded-lg flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-[1px]">
                                            <svg className="w-full h-full text-rose-600 drop-shadow-[0_0_4px_rgba(225,29,72,0.9)] opacity-85" viewBox="0 0 100 80" preserveAspectRatio="none">
                                              <line x1="8" y1="8" x2="92" y2="72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                              <line x1="92" y1="8" x2="8" y2="72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                            </svg>
                                            <div className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-rose-950 border border-rose-600 flex items-center justify-center shadow">
                                              <Skull className="w-2 h-2 text-rose-300" />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Top Overlay: Slot #, Status, Bot, Host, Menu */}
                                  <div className="absolute top-0 left-0 right-0 z-20 px-1.5 py-0.5 sm:py-1 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between pointer-events-auto">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] sm:text-[10px] font-mono font-black text-amber-300 bg-black/70 border border-amber-500/70 px-1.5 py-0.2 rounded shadow-xs backdrop-blur-sm">
                                        #{index + 1}
                                      </span>
                                      <span 
                                        className={`w-1.5 h-1.5 rounded-full ${player.connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'}`} 
                                        title={player.connected ? t('lobby.online', 'В сети') : t('lobby.offline', 'Не в сети')}
                                      />
                                      {isSpeaker && (
                                        <span className="text-[7px] font-mono font-bold text-amber-300 bg-amber-950/80 border border-amber-600/70 px-1 py-0.2 rounded flex items-center gap-0.5 backdrop-blur-sm">
                                          <Mic className="w-2 h-2 text-amber-400 animate-pulse" />
                                          <span className="hidden xs:inline">{t('game.speaker', 'СПИКЕР').toUpperCase()}</span>
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-0.5 sm:gap-1">
                                      {player.isBot && (
                                        <span className="text-[7px] text-zinc-300 font-mono bg-black/70 border border-zinc-700 px-1 py-0.2 rounded backdrop-blur-sm">
                                          {t('lobby.bot', 'БОТ')}
                                        </span>
                                      )}
                                      {player.isHost && (
                                        <span title={t('lobby.role_host', 'Ведущий стола')} className="text-amber-400 drop-shadow-sm">
                                          <Crown className="w-3 h-3" />
                                        </span>
                                      )}

                                      {/* Context actions menu */}
                                      {!isMe && (
                                        <div className="relative">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              sounds.playTick();
                                              setActivePlayerMenuId(activePlayerMenuId === player.id ? null : player.id);
                                            }}
                                            title={t('game.player_actions', 'Действия с игроком')}
                                            className="p-0.5 rounded bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80 border border-zinc-700/60 backdrop-blur-sm transition-colors"
                                          >
                                            <MoreVertical className="w-3 h-3" />
                                          </button>

                                          {activePlayerMenuId === player.id && (
                                            <div 
                                              onClick={e => e.stopPropagation()}
                                              className="absolute right-0 top-5 z-40 w-40 bg-[#14151e] border border-zinc-700/90 rounded-xl shadow-2xl p-1 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                                            >
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  sounds.playTick();
                                                  setActivePlayerMenuId(null);
                                                  setSelectedPlayerForReport({ id: player.id, name: player.name });
                                                }}
                                                className="w-full px-2 py-1.5 rounded-lg hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 text-left font-bold flex items-center gap-2 transition-colors text-[11px]"
                                              >
                                                <Flag className="w-3 h-3 text-rose-400" />
                                                <span>{t('game.report', 'Пожаловаться')}</span>
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => {
                                                  sounds.playTick();
                                                  setActivePlayerMenuId(null);
                                                  setChatInput(prev => `${prev ? prev + ' ' : ''}@${player.name} `);
                                                }}
                                                className="w-full px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 text-left flex items-center gap-2 transition-colors text-[11px]"
                                              >
                                                <AtSign className="w-3 h-3 text-amber-400" />
                                                <span>{t('game.mention', 'Упомянуть в чате')}</span>
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Bottom Overlay: Player Name, Clan Tag, Role & Status Badges */}
                                  <div className="absolute bottom-0 left-0 right-0 z-20 px-1 py-0.5 sm:py-1 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col items-center justify-center gap-0.5 pointer-events-auto">
                                    <div className="flex items-center justify-center gap-1 text-[10px] sm:text-[11px] font-bold leading-tight truncate w-full px-1 drop-shadow-md">
                                      {player.clanTag && (
                                        <span 
                                          className="text-[7px] sm:text-[8px] font-mono font-black px-1 py-0.2 rounded bg-black/70 border border-amber-500/70 text-amber-300 shrink-0 backdrop-blur-sm"
                                          title={player.clanName || undefined}
                                        >
                                          [{player.clanTag}]
                                        </span>
                                      )}
                                      <span className={`truncate ${!player.isAlive ? 'line-through text-zinc-400' : 'text-zinc-100 font-extrabold'}`}>
                                        {player.name}
                                      </span>
                                      {isMe && <span className="text-[8px] sm:text-[9px] text-amber-400 font-bold shrink-0">({t('lobby.you', '(Вы)')})</span>}
                                    </div>

                                    {/* Role or Candidate / Court Badge */}
                                    {((isMe ? myRoleDef : roleDef) || isCandidate || isDefenseCandidate) && (
                                      <div className="flex items-center justify-center gap-1 flex-wrap">
                                        {(isMe ? myRoleDef : roleDef) && (
                                          <span 
                                            className="py-0.2 px-1 rounded text-[7px] sm:text-[8px] font-bold border truncate font-mono backdrop-blur-md shadow-2xs"
                                            style={{
                                              backgroundColor: `${(isMe ? myRoleDef : roleDef)!.color}25`,
                                              borderColor: `${(isMe ? myRoleDef : roleDef)!.color}70`,
                                              color: (isMe ? myRoleDef : roleDef)!.color
                                            }}
                                          >
                                            {(isMe ? myRoleDef : roleDef)!.name}
                                          </span>
                                        )}

                                        {(isCandidate || isDefenseCandidate) && (
                                          <span className="py-0.2 px-1 rounded bg-rose-950/90 border border-rose-700 text-rose-300 text-[7px] sm:text-[8px] font-bold flex items-center gap-0.5 backdrop-blur-sm">
                                            <Gavel className="w-2 h-2 text-rose-400" />
                                            <span>{t('game.in_court', 'СУД').toUpperCase()}</span>
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={player.id}
                                className={`relative rounded-xl border p-1 sm:p-1.5 flex flex-col justify-between transition-all duration-200 ${
                                  !player.isAlive
                                    ? 'bg-[#0b0c10]/70 border-zinc-900/90 opacity-55'
                                    : isSpeaker
                                    ? 'bg-[#1b1713] border-amber-500 shadow-md shadow-amber-950/40 ring-1 ring-amber-500/70'
                                    : isCandidate || isDefenseCandidate
                                    ? 'bg-[#181116] border-rose-600/80 shadow-sm shadow-rose-950/30'
                                    : isMe
                                    ? 'bg-[#151520] border-amber-500/50'
                                    : 'bg-[#111218] border-zinc-800/80 hover:border-zinc-700'
                                }`}
                              >
                                {/* Card Top: Slot Number and Indicators */}
                                <div>
                                  <div className="flex items-center justify-between gap-1 mb-0.5">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-mono font-bold text-amber-400">
                                        #{index + 1}
                                      </span>
                                      <span className={`w-1.5 h-1.5 rounded-full ${player.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                                    </div>

                                    <div className="flex items-center gap-1">
                                      {isSpeaker && (
                                        <span className="text-[8px] font-mono font-bold text-amber-300 bg-amber-950/80 border border-amber-600/70 px-1 py-0.2 rounded flex items-center gap-0.5">
                                          <Mic className="w-2 h-2 text-amber-400 animate-pulse" />
                                          <span>{t('game.speaker', 'СПИКЕР').toUpperCase()}</span>
                                        </span>
                                      )}
                                      {player.isBot && (
                                        <span className="text-[8px] text-zinc-400 font-mono bg-zinc-900 px-1 py-0.2 rounded">
                                          {t('lobby.bot', 'БОТ')}
                                        </span>
                                      )}
                                      {player.isHost && (
                                        <span title={t('lobby.role_host', 'Ведущий стола')} className="text-amber-400">
                                          <Crown className="w-2.5 h-2.5" />
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
                                            title={t('game.player_actions', 'Действия с игроком')}
                                            className="p-0.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                                          >
                                            <MoreVertical className="w-3 h-3" />
                                          </button>

                                          {/* Dropdown Context Menu */}
                                          {activePlayerMenuId === player.id && (
                                            <div 
                                              onClick={e => e.stopPropagation()}
                                              className="absolute right-0 top-5 z-40 w-40 bg-[#14151e] border border-zinc-700/90 rounded-xl shadow-2xl p-1 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                                            >
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  sounds.playTick();
                                                  setActivePlayerMenuId(null);
                                                  setSelectedPlayerForReport({ id: player.id, name: player.name });
                                                }}
                                                className="w-full px-2 py-1.5 rounded-lg hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 text-left font-bold flex items-center gap-2 transition-colors text-[11px]"
                                              >
                                                <Flag className="w-3 h-3 text-rose-400" />
                                                <span>{t('game.report', 'Пожаловаться')}</span>
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => {
                                                  sounds.playTick();
                                                  setActivePlayerMenuId(null);
                                                  setChatInput(prev => `${prev ? prev + ' ' : ''}@${player.name} `);
                                                }}
                                                className="w-full px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 text-left flex items-center gap-2 transition-colors text-[11px]"
                                              >
                                                <AtSign className="w-3 h-3 text-amber-400" />
                                                <span>{t('game.mention', 'Упомянуть в чате')}</span>
                                              </button>

                                              {canBeNominated && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setActivePlayerMenuId(null);
                                                    handleNominate(player.id);
                                                  }}
                                                  className="w-full px-2 py-1.5 rounded-lg hover:bg-amber-950/70 text-amber-300 text-left font-bold flex items-center gap-2 transition-colors text-[11px]"
                                                >
                                                  <Gavel className="w-3 h-3 text-amber-400" />
                                                  <span>{t('game.nominate', 'Выдвинуть')}</span>
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Center Avatar / Video Slot */}
                                  <div className="w-full flex-1 flex items-center justify-center min-h-0">
                                    {webRtc ? (
                                      <PlayerVideoSlot
                                        playerId={player.id}
                                        isMe={isMe}
                                        isAlive={player.isAlive}
                                        isSpeaker={isSpeaker}
                                        isSpotlight={false}
                                        localStream={webRtc.localStream}
                                        isLocalCameraOn={webRtc.isCameraOn}
                                        isLocalMicOn={webRtc.isMicOn}
                                        isLocalSpeaking={webRtc.localSpeaking}
                                        remotePeer={webRtc.remotePeers.get(player.id)}
                                        blockIncomingVideo={webRtc.settings.blockIncomingVideo}
                                        dataSaverMode={webRtc.settings.dataSaverMode}
                                        onToggleMic={webRtc.toggleMic}
                                        onToggleCamera={webRtc.toggleCamera}
                                        className="w-full"
                                      />
                                    ) : (
                                      <div className="relative w-full aspect-[4/3] sm:aspect-[16/11] min-h-[56px] max-h-[96px] rounded-lg overflow-hidden bg-gradient-to-b from-[#14151e] to-[#0d0e14] border border-zinc-800/80 flex items-center justify-center">
                                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border shadow-inner transition-all duration-500 ${
                                          !player.isAlive
                                            ? 'bg-zinc-950 border-rose-900/60 text-zinc-500 opacity-60 grayscale'
                                            : isSpeaker
                                            ? 'bg-amber-950 border-amber-600 text-amber-200'
                                            : 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                        }`}>
                                          <GangsterIcon size={20} className={`w-4 h-4 sm:w-5 sm:h-5 ${!player.isAlive ? 'opacity-30' : ''}`} />
                                        </div>

                                        {!player.isAlive && (
                                          <div className="absolute inset-0 rounded-lg flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-[1px]">
                                            <svg className="w-full h-full text-rose-600 drop-shadow-[0_0_4px_rgba(225,29,72,0.9)] opacity-85" viewBox="0 0 100 80" preserveAspectRatio="none">
                                              <line x1="8" y1="8" x2="92" y2="72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                              <line x1="92" y1="8" x2="8" y2="72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                            </svg>
                                            <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-rose-950 border border-rose-600 flex items-center justify-center shadow">
                                              <Skull className="w-2.5 h-2.5 text-rose-300" />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Name Line with Clan Tag and Self Indicator */}
                                    <div className="w-full mt-0.5 text-center">
                                      <div className="flex items-center justify-center gap-1 text-[10px] sm:text-[11px] font-bold leading-tight truncate">
                                        {player.clanTag && (
                                          <span 
                                            className="text-[8px] font-mono font-black px-1 py-0.2 rounded bg-amber-950/80 border border-amber-600/70 text-amber-300 shrink-0"
                                            title={player.clanName || undefined}
                                          >
                                            [{player.clanTag}]
                                          </span>
                                        )}
                                        <span className={`truncate ${!player.isAlive ? 'line-through decoration-rose-500/80 text-zinc-500' : 'text-zinc-100'}`}>
                                          {player.name}
                                        </span>
                                        {isMe && <span className="text-[9px] text-amber-400 font-medium shrink-0">({t('lobby.you', '(Вы)')})</span>}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Self Role Badge or Public Revealed Role & Candidate Badges */}
                                  {((isMe ? myRoleDef : roleDef) || isCandidate || isDefenseCandidate) && (
                                    <div className="flex items-center justify-center gap-1 mt-0.5 flex-wrap">
                                      {(isMe ? myRoleDef : roleDef) && (
                                        <span 
                                          className="py-0.2 px-1 rounded text-[8px] sm:text-[9px] font-bold border truncate font-mono"
                                          style={{
                                            backgroundColor: `${(isMe ? myRoleDef : roleDef)!.color}15`,
                                            borderColor: `${(isMe ? myRoleDef : roleDef)!.color}50`,
                                            color: (isMe ? myRoleDef : roleDef)!.color
                                          }}
                                        >
                                          {(isMe ? myRoleDef : roleDef)!.name}
                                        </span>
                                      )}

                                      {(isCandidate || isDefenseCandidate) && (
                                        <span className="py-0.2 px-1 rounded bg-rose-950/80 border border-rose-800 text-rose-300 text-[8px] sm:text-[9px] font-bold flex items-center gap-0.5">
                                          <Gavel className="w-2 h-2 text-rose-400" />
                                          <span>{roomState.phase === 'REVOTE' ? t('phase.revote_title', 'НИЧЬЯ') : t('game.in_court', 'СУД')}</span>
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Action Buttons & Votes Footer */}
                                {(canBeNominated || canVoteForPlayer || (!roomState.settings.anonymousVoting && (roomState.phase === 'VOTING' || roomState.phase === 'REVOTE') && player.votedFor)) && (
                                  <div className="mt-1 pt-1 border-t border-zinc-850/80 space-y-1">
                                    {/* Nomination button */}
                                    {canBeNominated && (
                                      <button
                                        onClick={() => handleNominate(player.id)}
                                        className="w-full py-0.5 px-1 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:text-white text-[9px] sm:text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                                      >
                                        <Gavel className="w-2.5 h-2.5 text-amber-400" />
                                        <span>{t('game.nominate', 'Выдвинуть')}</span>
                                      </button>
                                    )}

                                    {/* Voting Button during VOTING or REVOTE */}
                                    {canVoteForPlayer && (
                                      <div className="space-y-0.5">
                                        {isAlive && !isTieExcluded && (
                                          <button
                                            onClick={() => handleVote(player.id)}
                                            className={`w-full py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all shadow-xs flex items-center justify-center gap-1 ${
                                              myPlayer?.votedFor === player.id
                                                ? 'bg-rose-600 text-white border border-rose-500 shadow-rose-950/40'
                                                : 'bg-gradient-to-r from-[#b85820] to-[#8c3d12] hover:from-[#c96226] hover:to-[#9e4616] text-white border border-amber-900/60'
                                            }`}
                                          >
                                            {myPlayer?.votedFor === player.id ? (
                                              <>
                                                <Check className="w-3 h-3" />
                                                <span>{t('game.your_choice', 'Ваш голос')}</span>
                                              </>
                                            ) : (
                                              <span>{t('game.execute', 'Казнить')}</span>
                                            )}
                                          </button>
                                        )}

                                        <div className="flex items-center justify-between text-[9px] text-zinc-400 px-0.5 font-mono">
                                          <span>{t('game.votes_count', 'Голосов:')}</span>
                                          <span className="font-bold text-amber-400">{votesForThisPlayer}</span>
                                        </div>
                                      </div>
                                    )}

                                    {/* Show who player voted for */}
                                    {!roomState.settings.anonymousVoting && (roomState.phase === 'VOTING' || roomState.phase === 'REVOTE') && player.votedFor && (
                                      <div className="text-[9px] text-zinc-400 text-center truncate">
                                        {t('game.vote', 'Голос')}: {player.votedFor === 'skip' ? t('game.abstained', 'Воздержался') : roomState.players.find(p => p.id === player.votedFor)?.name || '...'}
                                      </div>
                                    )}
                                  </div>
                                )}

                              </div>
                            );
                          })}
                        </div>
                </>
              );
            })()}
          </div>
        )}

              {/* Bottom bar of Left Column: Player count & Action / Skip Controls (aligned to right) */}
              <div className={`flex items-center justify-between gap-2 border-t border-zinc-850 flex-wrap shrink-0 ${
                roomState.phase === 'DAY_DISCUSSION' || isSoloSpeechPhase
                  ? 'pt-1 pb-0.5 sm:pt-2.5 sm:pb-0'
                  : 'pt-2.5'
              }`}>
                <div className="text-[11px] text-zinc-400 font-mono">
                  {alivePlayers.length} {t('game.alive_at_table', 'живых из')} {roomState.players.length}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {/* 1. Day discussion skip */}
                  {roomState.phase === 'DAY_DISCUSSION' && !isSpectator && isAlive && (
                    <button
                      type="button"
                      onClick={onSkipPhase}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-sm ${
                        hasUserSkipped
                          ? 'bg-amber-950/80 border-amber-500 text-amber-300 ring-1 ring-amber-500/50'
                          : 'bg-[#181924] hover:bg-[#222432] border-zinc-700 text-zinc-100 hover:text-white'
                      }`}
                    >
                      <FastForward className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('game.skip', 'Пропустить')} ({skipCount}/{skipThreshold})</span>
                    </button>
                  )}

                  {/* 2. Individual speech complete */}
                  {roomState.phase === 'INDIVIDUAL_SPEECHES' && !isSpectator && isCurrentSpeaker && (
                    <button
                      type="button"
                      onClick={onSkipPhase}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#b85820] to-[#8c3d12] hover:from-[#c96226] text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                    >
                      <FastForward className="w-3.5 h-3.5" />
                      <span>{t('game.finish_speech', 'Завершить речь')}</span>
                    </button>
                  )}

                  {/* 3. Defense speech complete */}
                  {roomState.phase === 'DEFENSE_SPEECH' && !isSpectator && isCurrentSpeaker && (
                    <button
                      type="button"
                      onClick={onSkipPhase}
                      className="px-3.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                    >
                      <FastForward className="w-3.5 h-3.5" />
                      <span>{t('game.finish_speech', 'Завершить речь')}</span>
                    </button>
                  )}

                  {/* 4. Last words complete */}
                  {(roomState.phase === 'LAST_WORDS_ARREST' || roomState.phase === 'LAST_WORDS_KILLED') && !isSpectator && isCurrentSpeaker && (
                    <button
                      type="button"
                      onClick={onSkipPhase}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                    >
                      <FastForward className="w-3.5 h-3.5" />
                      <span>{t('game.finish_words', 'Завершить слово')}</span>
                    </button>
                  )}

                  {/* 5. Voting confirm / skip (abstain) */}
                  {(roomState.phase === 'VOTING' || roomState.phase === 'REVOTE') && !isSpectator && !isTieExcluded && isAlive && (
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playTick();
                        onSkipPhase();
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-sm ${
                        myPlayer?.votedFor
                          ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                          : 'bg-[#181924] hover:bg-[#202230] border-zinc-700 text-zinc-100 hover:text-white'
                      }`}
                    >
                      <FastForward className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {myPlayer?.votedFor && myPlayer.votedFor !== 'skip'
                          ? t('game.confirm_choice', 'Подтвердить выбор')
                          : myPlayer?.votedFor === 'skip'
                          ? t('game.choice_recorded', 'Выбор зафиксирован')
                          : t('game.abstain_skip', 'Пропустить (Воздержаться)')}
                      </span>
                    </button>
                  )}

                  {/* 6. Night phase finish/skip */}
                  {roomState.phase === 'NIGHT' && !isSpectator && isAlive && (
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playTick();
                        onSkipPhase();
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-sm ${
                        (roomState.phaseSkipVotedIds || []).includes(myId)
                          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500/40'
                          : 'bg-[#181924] hover:bg-[#202230] border-zinc-700 text-zinc-100 hover:text-white'
                      }`}
                    >
                      <FastForward className={`w-3.5 h-3.5 ${(roomState.phaseSkipVotedIds || []).includes(myId) ? 'text-emerald-400' : 'text-amber-400'}`} />
                      <span>
                        {(roomState.phaseSkipVotedIds || []).includes(myId)
                          ? `${t('game.ready_morning', 'Готов к утру')} (${roomState.nightSkipVotesCount || 0}/${roomState.totalNightActiveRoles || 1})`
                          : `${t('game.finish_night', 'Завершить ночь')} (${roomState.nightSkipVotesCount || 0}/${roomState.totalNightActiveRoles || 1})`}
                      </span>
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* Right 5 Columns: Social Hub / Live Chat & Journal */}
            <div className={`md:col-span-5 p-4 sm:p-6 flex flex-col justify-between bg-[#101117] space-y-4 ${
              mobileTab === 'right' ? 'flex' : 'hidden md:flex'
            }`}>
              
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
                  <span>{t('chat.channel_all', 'Общий')}</span>
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
                    <span>{t('chat.channel_mafia', 'Мафия')}</span>
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
                    <span>{t('chat.channel_dead', 'Кладбище')}</span>
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
                  <span>{t('chat.channel_system', 'Журнал')}</span>
                </button>
              </div>

              {/* Chat Members Live Status Bar */}
              {activeChannel !== 'system' && (
                <div className="px-2.5 py-1.5 bg-[#13141d]/90 border border-zinc-850 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono text-zinc-400 flex items-center gap-1.5 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>
                        {activeChannel === 'mafia'
                          ? t('chat.syndicate_online', 'Синдикат в сети:')
                          : activeChannel === 'dead'
                          ? t('chat.graveyard_online', 'Кладбище в сети:')
                          : t('chat.table_members', 'Участники стола:')}
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
                      } {t('common.online_suffix', 'онлайн')}
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
                          title={`${p.name}: ${p.isBot ? t('game.ai_bot', 'ИИ-Бот') : p.connected ? t('lobby.online', 'В сети') : t('lobby.offline', 'Оффлайн')} ${!p.isAlive ? `(${t('game.eliminated_status', 'Выбыл')})` : ''}`}
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
                          {isMe && <span className="text-[9px] text-amber-400 font-bold">({t('game.you_tag', 'Вы')})</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Spectators Live Row in Common Chat */}
                  {activeChannel === 'all' && roomState.spectators && roomState.spectators.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1 border-t border-zinc-800/60">
                      <span className="text-[9px] font-mono text-indigo-400 font-bold flex items-center gap-1 shrink-0">
                        <Eye className="w-3 h-3 text-indigo-400" />
                        <span>{t('game.spectators_count', 'Зрители')} ({roomState.spectators.length}):</span>
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
                            {isMe && <span className="text-amber-400 font-bold">({t('game.you_tag', 'Вы')})</span>}
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
                      ? t('chat.system_empty', 'События фиксируются в журнале протокола')
                      : t('chat.messages_empty', 'Сообщений пока нет. Выскажитесь первым!')}
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
                              title={msg.isSpectator ? t('game.spectator_badge', 'Зритель') : sender?.isBot ? t('game.ai_bot', 'ИИ-Бот') : isSenderOnline ? t('lobby.online', 'В сети') : t('lobby.offline', 'Оффлайн')}
                            />
                          </span>

                          {msg.clanTag && (
                            <span className="text-[9px] font-mono font-black px-1 py-0.2 rounded bg-amber-950/80 border border-amber-600/70 text-amber-300">
                              [{msg.clanTag}]
                            </span>
                          )}

                          {msg.isSpectator && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-950/90 border border-indigo-700/70 text-indigo-300 flex items-center gap-0.5">
                              <span>👁️</span> {t('game.spectator_badge', 'Зритель')}
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
                  {[
                    t('game.phrase_1', 'Я мирный житель!'),
                    t('game.phrase_2', 'Обратите внимание на голосование!'),
                    t('game.phrase_3', 'Почему он так нервничает?'),
                    t('game.phrase_4', 'Давайте выслушаем аргументы.'),
                    t('game.phrase_5', 'Шериф, проверь его ночью!'),
                    t('game.phrase_6', 'Я голосую за город.')
                  ].slice(0, 4).map((phrase, idx) => (
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
                      placeholder={activeChannel === 'mafia' ? t('chat.mafia_placeholder', 'Заговор мафии...') : t('chat.input_placeholder', 'Ваша реплика...')}
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
        onLeaveRoom={onLeaveRoom}
        onStopMatch={() => setIsStopConfirmOpen(true)}
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
                  {t('game.stop_match_title', 'Остановить партию?')}
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {t('game.stop_match_desc', 'Вы являетесь ведущим стола. При досрочной остановке партия будет немедленно завершена, все роли сброшены, а игроки вернутся в лобби комнаты для новой раздачи.')}
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsStopConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#181924] hover:bg-[#202230] border border-zinc-800 text-zinc-300 hover:text-white font-semibold text-xs transition-colors"
              >
                {t('common.cancel', 'Отмена')}
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
                {t('game.stop_match_btn', 'Остановить')}
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
          name: playerName || user?.displayName || t('common.player', 'Игрок')
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
