import React, { useState } from 'react';
import { ClientRoomState, RoomSettings, ChatMessage, RoleId } from '../types/mafia';
import { GangsterIcon } from './GangsterIcon';
import { NavigationDrawer, NavDrawerTab } from './NavigationDrawer';
import { ShopModal } from './ShopModal';
import { PawnshopModal } from './PawnshopModal';
import { DailyBonusModal } from './DailyBonusModal';
import { SettingsModal } from './SettingsModal';
import { RoleSelectCardModal } from './RoleSelectCardModal';
import { ClansModal } from './ClansModal';
import { EventsModal } from './EventsModal';
import { FeedbackModal } from './FeedbackModal';
import { ROLE_DEFINITIONS } from '../data/roles';
import { ROLE_SELECT_CARD_ID } from '../data/items';
import { useWebRtc } from '../hooks/useWebRtc';
import { WebRtcControlsBar } from './WebRtcControlsBar';
import { 
  Users, 
  Play, 
  Copy, 
  Check, 
  Bot, 
  Trash2, 
  Crown, 
  Menu, 
  LogOut, 
  MessageSquare,
  Send,
  ScrollText,
  Lock,
  Sparkles,
  Eye,
  Mic,
  MicOff,
  Video,
  VideoOff,
  SlidersHorizontal,
  HeartPulse,
  Flame,
  Shield,
  X
} from 'lucide-react';
import { sounds } from '../utils/audio';
import noirLobbyBg from '../assets/images/noir_mafia_lobby_bg_1791204529068.jpg';
import { AuthUser } from './AuthModal';

interface LobbyViewProps {
  roomState: ClientRoomState;
  myId: string;
  playerName: string;
  isLoggedIn: boolean;
  soundEnabled: boolean;
  user?: AuthUser | null;
  onUpdateUser?: (u: AuthUser) => void;
  chatMessages: ChatMessage[];
  onStartGame: () => void;
  onAddBot: () => void;
  onRemoveBot: (botId: string) => void;
  onUpdateSettings: (settings: Partial<RoomSettings>) => void;
  onLeaveRoom: () => void;
  onOpenRules: () => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenAdmin?: () => void;
  onToggleSound: () => void;
  onSendMessage: (text: string, channel?: ChatMessage['channel']) => void;
  onLogout: () => void;
  onJoinAsPlayer?: () => void;
  onSwitchToSpectator?: () => void;
  webRtc?: ReturnType<typeof useWebRtc>;
  onOpenWebRtcSettings?: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  roomState,
  myId,
  playerName,
  isLoggedIn,
  soundEnabled,
  user,
  onUpdateUser,
  chatMessages,
  onStartGame,
  onAddBot,
  onRemoveBot,
  onUpdateSettings,
  onLeaveRoom,
  onOpenRules,
  onOpenProfile,
  onOpenAuth,
  onOpenAdmin,
  onToggleSound,
  onSendMessage,
  onLogout,
  onJoinAsPlayer,
  onSwitchToSpectator,
  webRtc,
  onOpenWebRtcSettings
}) => {
  const [copied, setCopied] = useState(false);
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
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [isPawnshopOpen, setIsPawnshopOpen] = useState(false);
  const [isBonusOpen, setIsBonusOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClansOpen, setIsClansOpen] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [tasksDefaultTab, setTasksDefaultTab] = useState<'global' | 'onboarding' | 'personal' | 'clan'>('global');
  const [isRoleCardModalOpen, setIsRoleCardModalOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState<ChatMessage['channel']>('all');
  const [chatInput, setChatInput] = useState('');

  const isHost = roomState.hostId === myId;
  const players = roomState.players;
  const settings = roomState.settings;
  const myPlayer = players.find(p => p.id === myId);
  const isSpectator = Boolean(roomState.isSpectator || !myPlayer);

  const roleCardInventoryItem = user?.inventory?.find(i => i.itemId === ROLE_SELECT_CARD_ID);
  const roleCardsCount = roleCardInventoryItem ? roleCardInventoryItem.quantity : 0;
  const myPreferredRoleDef = myPlayer?.preferredRole ? ROLE_DEFINITIONS[myPlayer.preferredRole] : null;

  // Handle invitation copy
  const handleCopyInvite = () => {
    const shareUrl = `${window.location.origin}?room=${roomState.roomCode}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    sounds.playTick();
    setTimeout(() => setCopied(false), 2000);
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
      case 'feedback':
        setIsFeedbackOpen(true);
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

  const handleToggleRole = (roleKey: keyof RoomSettings['enabledRoles']) => {
    if (!isHost || !onUpdateSettings) return;
    onUpdateSettings({
      enabledRoles: {
        ...settings.enabledRoles,
        [roleKey]: !settings.enabledRoles[roleKey]
      }
    });
    sounds.playTick();
  };

  const handleUpdate = (field: keyof RoomSettings, value: unknown) => {
    if (!isHost || !onUpdateSettings) return;
    onUpdateSettings({ [field]: value });
    sounds.playTick();
  };

  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage(chatInput.trim(), activeChannel);
    setChatInput('');
    sounds.playMessageSound();
  };

  const canStart = players.length >= 4;

  const currentMessages = chatMessages.filter(m => {
    if (activeChannel === 'system') return m.channel === 'system';
    return m.channel === activeChannel;
  });

  return (
    <div
      className="relative h-[100dvh] max-h-[100dvh] md:min-h-screen md:h-auto w-full flex items-center justify-center p-0 md:p-2 bg-cover bg-center select-none overflow-hidden"
      style={{ backgroundImage: `url(${noirLobbyBg})` }}
    >
      {/* Dark moody vignette overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] pointer-events-none" />

      {/* Main Center Console Card (Monolithic Frame: 65% width, 98% height on desktop; 100% on mobile) */}
      <div className="relative z-10 w-full md:w-[65vw] h-full max-h-full min-h-0 md:min-h-0 md:h-[98vh] bg-[#0d0e13]/95 border-0 md:border md:border-zinc-800/90 rounded-none md:rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col backdrop-blur-md">

        {/* Top Header inside console */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-zinc-850 flex flex-wrap items-center justify-between gap-2.5 bg-[#111218]/90 shrink-0">
          
          {/* Left / Center: Invite Code Badge (Maximally compact) */}
          <div 
            onClick={handleCopyInvite}
            title="Нажмите, чтобы скопировать ссылку на стол"
            className="flex items-center gap-1.5 bg-[#141520] hover:bg-[#181928] border border-zinc-800/90 hover:border-zinc-700 px-2 py-0.5 rounded-lg shadow-inner cursor-pointer transition-all group shrink-0"
          >
            <span className="text-[10px] font-mono text-zinc-400 leading-none">Код:</span>
            <span className="text-xs font-mono font-bold tracking-wider text-orange-400 group-hover:text-orange-300 leading-none">
              {roomState.roomCode}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCopyInvite();
              }}
              title="Скопировать ссылку для друзей"
              className="p-0.5 rounded text-zinc-400 group-hover:text-white hover:bg-zinc-800/70 transition-colors leading-none"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400 animate-in zoom-in-75 duration-150" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
            {copied && (
              <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-700/60 px-1 py-0.2 rounded leading-none animate-in fade-in duration-150">
                скопировано
              </span>
            )}
          </div>

          {/* Right: Actions, Player Badge + Hamburger Menu */}
          <div className="flex items-center gap-2 sm:gap-3 ml-auto justify-end">
            
            {/* Table Chat & Journal Drawer Toggle Button */}
            <button
              onClick={() => {
                sounds.playTick();
                setIsChatDrawerOpen(true);
              }}
              title="Чат и журнал стола"
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161722] border border-zinc-800/80 hover:bg-[#1f202f] hover:border-zinc-700 text-zinc-300 hover:text-white transition-all shadow-inner"
            >
              <MessageSquare className="w-4 h-4 text-orange-400" />
              <span className="hidden sm:inline text-xs font-semibold">Чат стола</span>
              {chatMessages.length > 0 && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-orange-600 text-white leading-tight">
                  {chatMessages.length}
                </span>
              )}
            </button>

            {/* Admin Panel Quick Button */}
            {user && (user.isAdmin === true || user.role === 'admin' || user.email.toLowerCase() === 'vledahovic@gmail.com') && onOpenAdmin && (
              <button
                onClick={() => {
                  sounds.playTick();
                  onOpenAdmin();
                }}
                title="Панель Администратора"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-950/80 to-orange-950/80 border border-amber-600/70 text-amber-300 hover:text-white hover:border-amber-500 text-xs font-bold transition-all shadow-sm shadow-amber-950/40"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Админ-панель</span>
              </button>
            )}

            {/* Player Profile Badge */}
            <button
              onClick={() => {
                if (isLoggedIn) onOpenProfile();
                else onOpenAuth();
              }}
              className="flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-zinc-800/50 transition-colors text-left"
            >
              <div className={`w-8 h-8 rounded-full border flex items-center justify-center overflow-hidden shrink-0 ${
                isSpectator ? 'bg-indigo-950/80 border-indigo-700/80 text-indigo-300' : 'bg-zinc-800 border-zinc-700/80'
              }`}>
                {isSpectator ? <Eye className="w-4 h-4 text-indigo-400" /> : <GangsterIcon size={26} className="w-6 h-6" />}
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-bold text-white leading-tight flex items-center gap-1">
                  <span className="truncate max-w-[120px]">{playerName}</span>
                  {isHost && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                  {isSpectator && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                      Зритель
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  {isSpectator ? 'Наблюдатель' : isHost ? 'Ведущий стола' : 'Игрок'}
                </div>
              </div>
            </button>

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

        {/* Mobile View Tab Switcher (Visible only on mobile md:hidden) */}
        <div className="flex md:hidden border-b border-zinc-850 bg-[#12131b] p-1.5 gap-1.5 shrink-0">
          <button
            onClick={() => {
              sounds.playTick();
              setMobileTab('left');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === 'left'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white bg-zinc-900/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Участники ({players.length}/{settings.maxPlayers})</span>
          </button>
          <button
            onClick={() => {
              sounds.playTick();
              setMobileTab('right');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === 'right'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white bg-zinc-900/60'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Настройки стола</span>
          </button>
        </div>

        {/* Content Body: Left Column (Table Seats) + Right Column (Room Settings) */}
        <div 
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0 overflow-hidden md:overflow-y-auto"
        >
          
          {/* Left Column: Player Seats (7 of 12 cols) */}
          <div className={`md:col-span-7 p-2.5 sm:p-7 flex flex-col justify-between border-b md:border-b-0 md:border-r border-zinc-850 space-y-2 md:space-y-4 flex-1 min-h-0 h-full overflow-hidden ${
            mobileTab === 'left' ? 'flex' : 'hidden md:flex'
          }`}>
            
            <div className="space-y-2 md:space-y-4 flex-1 flex flex-col justify-start min-h-0 md:block md:flex-none overflow-hidden">
              {/* Header: Сбор участников & счетчик мест (Hidden on mobile, visible on desktop) */}
              <div className="hidden md:flex items-center justify-between pb-1">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-orange-400" />
                  <h2 className="font-sans font-bold text-xs tracking-wider uppercase text-white">
                    Участники за столом
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-zinc-400">
                    {players.length} / {settings.maxPlayers} мест
                  </span>
                  <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/40 border border-amber-900/60 px-2 py-0.5 rounded-full">
                    {settings.gameMode === 'sport' ? 'Спортивная' : 'Городская'}
                  </span>
                </div>
              </div>

              {/* SPECTATOR STATUS BANNER */}
              {isSpectator && (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/70 via-[#161726] to-[#12131d] border border-indigo-700/80 shadow-md flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-indigo-900/60 border border-indigo-600/80 flex items-center justify-center text-indigo-300 shrink-0">
                      <Eye className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Режим зрителя</span>
                        <span className="px-1.5 py-0.2 rounded bg-indigo-900 text-indigo-200 text-[9px] font-mono font-bold uppercase">
                          Наблюдение
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 truncate">
                        Вы не занимаете слот игрока. Доступен просмотр стола и чат.
                      </p>
                    </div>
                  </div>

                  {players.length < settings.maxPlayers && onJoinAsPlayer && (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        onJoinAsPlayer();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 transition-all flex items-center gap-1.5 shrink-0"
                    >
                      <span>🪑 Сесть за стол</span>
                    </button>
                  )}
                </div>
              )}

              {/* WebRTC Video & Audio Controls Bar */}
              {webRtc && (
                <WebRtcControlsBar
                  isMicOn={webRtc.isMicOn}
                  isCameraOn={webRtc.isCameraOn}
                  onToggleMic={webRtc.toggleMic}
                  onToggleCamera={webRtc.toggleCamera}
                  settings={webRtc.settings}
                  onToggleDataSaver={webRtc.toggleDataSaverMode}
                  onToggleBlockVideo={webRtc.toggleBlockIncomingVideo}
                  onToggleBlockAudio={webRtc.toggleBlockIncomingAudio}
                  onOpenSettings={() => {
                    if (onOpenWebRtcSettings) {
                      onOpenWebRtcSettings();
                    } else {
                      setIsSettingsOpen(true);
                    }
                  }}
                  mediaError={webRtc.mediaError}
                  mediaErrorCode={webRtc.mediaErrorCode}
                  onClearMediaError={webRtc.clearMediaError}
                  isVirtualCamera={webRtc.isVirtualCamera}
                  onEnableVirtualCamera={webRtc.enableVirtualCamera}
                  className="mb-3 hidden md:flex"
                />
              )}

              {/* Seating Cards Grid */}
              <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1 md:flex-none md:max-h-[340px]">
                {players.map((player, index) => {
                  const isMe = player.id === myId;

                  return (
                    <div
                      key={player.id}
                      className={`py-2 px-2.5 rounded-xl border flex items-center justify-between transition-all ${
                        isMe
                          ? 'bg-[#181924] border-orange-500/60 shadow-md shadow-orange-950/20'
                          : 'bg-[#13141a] border-zinc-800/80 hover:border-zinc-750'
                      }`}
                    >
                      {/* Left: Slot number, Avatar & Name */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-mono font-bold text-orange-500 w-4 shrink-0">
                          #{index + 1}
                        </span>

                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 relative shadow-inner">
                          <GangsterIcon size={20} className="w-4 h-4 text-zinc-300" />
                        </div>

                        <div className="truncate">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {player.clanTag && (
                              <span 
                                className="text-[9px] font-mono font-black px-1 py-0.5 rounded bg-amber-950/80 border border-amber-600/70 text-amber-300 shadow-xs"
                                title={player.clanName ? `Клан: ${player.clanName}` : undefined}
                              >
                                [{player.clanTag}]
                              </span>
                            )}
                            <span className="text-xs font-bold text-white truncate">
                              {player.name}
                            </span>
                            {isMe && <span className="text-[10px] text-amber-400 font-medium">(Вы)</span>}
                            {player.isHost && (
                              <span className="text-[10px] text-amber-400 font-mono flex items-center gap-0.5">
                                <Crown className="w-2.5 h-2.5" /> Хост
                              </span>
                            )}
                            {/* Role Selection Badge */}
                            {player.hasUsedRoleCard && (
                              isMe && player.preferredRole ? (
                                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-amber-950/90 border border-amber-500/80 text-amber-300 font-bold flex items-center gap-1 shadow-sm">
                                  <span>🎴</span>
                                  <span>{ROLE_DEFINITIONS[player.preferredRole]?.name || 'Заказ'}</span>
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-zinc-800 border border-amber-600/50 text-amber-300 font-medium flex items-center gap-1" title="Игрок применил Карточку выбора роли">
                                  <span>🎴</span>
                                  <span>Карта роли</span>
                                </span>
                              )
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
                            <span>{player.isBot ? 'ИИ-Бот' : player.connected ? 'В сети' : 'Не в сети'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Interactive Microphone & Audio Control Buttons */}
                      <div className="flex items-center gap-1 shrink-0 ml-1.5">
                        {webRtc && !player.isBot && (
                          isMe ? (
                            /* Local player interactive mic & video toggle buttons */
                            <div className="flex items-center gap-1 bg-[#111219] p-0.5 rounded-lg border border-zinc-800/90 shadow-inner">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sounds.playTick();
                                  webRtc.toggleMic();
                                }}
                                title={webRtc.isMicOn ? "Выключить микрофон" : "Включить микрофон"}
                                className={`px-2 py-0.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 shadow-sm ${
                                  webRtc.isMicOn
                                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/50'
                                    : 'bg-rose-950/80 hover:bg-rose-900 border border-rose-700/70 text-rose-300'
                                }`}
                              >
                                {webRtc.isMicOn ? (
                                  <>
                                    <Mic className="w-3 h-3 animate-pulse text-emerald-200" />
                                    <span className="text-[9px] uppercase tracking-wider font-mono">Мик Вкл</span>
                                  </>
                                ) : (
                                  <>
                                    <MicOff className="w-3 h-3 text-rose-400" />
                                    <span className="text-[9px] uppercase tracking-wider font-mono">Мик Выкл</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sounds.playTick();
                                  webRtc.toggleCamera();
                                }}
                                title={webRtc.isCameraOn ? "Выключить камеру" : "Включить камеру"}
                                className={`p-1 rounded-md text-xs transition-all border ${
                                  webRtc.isCameraOn
                                    ? 'bg-sky-600/90 hover:bg-sky-500 text-white border-sky-400/50'
                                    : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-400 border-zinc-750'
                                }`}
                              >
                                {webRtc.isCameraOn ? <Video className="w-3 h-3 text-sky-200" /> : <VideoOff className="w-3 h-3" />}
                              </button>
                            </div>
                          ) : (
                            /* Remote peer mic status / audio toggle button */
                            <div className="flex items-center gap-1 bg-[#111219] p-0.5 rounded-lg border border-zinc-800/80">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sounds.playTick();
                                  webRtc.toggleBlockIncomingAudio();
                                }}
                                title={
                                  webRtc.settings.blockIncomingAudio
                                    ? "Звук заглушен (нажмите чтобы включить)"
                                    : (webRtc.remotePeers.get(player.id)?.mediaState.isAudioEnabled ? "Микрофон игрока активен" : "Микрофон игрока выключен")
                                }
                                className={`px-1.5 py-0.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 border ${
                                  webRtc.settings.blockIncomingAudio
                                    ? 'bg-rose-950/60 border-rose-800 text-rose-300 hover:bg-rose-900/60'
                                    : webRtc.remotePeers.get(player.id)?.mediaState.isAudioEnabled
                                    ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                                    : 'bg-zinc-850 border-zinc-750 text-zinc-400'
                                }`}
                              >
                                {webRtc.remotePeers.get(player.id)?.mediaState.isAudioEnabled && !webRtc.settings.blockIncomingAudio ? (
                                  <>
                                    <Mic className="w-3 h-3 text-emerald-400" />
                                    <span className="text-[9px] font-mono text-emerald-300">Вкл</span>
                                  </>
                                ) : (
                                  <>
                                    <MicOff className="w-3 h-3 text-zinc-400" />
                                    <span className="text-[9px] font-mono text-zinc-400">Выкл</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )
                        )}

                        {/* Bot Delete button (host only) */}
                        {isHost && player.isBot && (
                          <button
                            type="button"
                            onClick={() => onRemoveBot(player.id)}
                            title="Удалить бота"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Empty slots placeholder */}
                {Array.from({ length: Math.max(0, Math.min(settings.maxPlayers - players.length, 3)) }).map((_, i) => (
                  <div
                    key={`empty_${i}`}
                    className="p-3 rounded-xl border border-dashed border-zinc-800/70 bg-[#111217]/50 flex items-center justify-center text-zinc-400 text-xs font-mono"
                  >
                    Свободное место #{players.length + i + 1} (Ожидание игрока...)
                  </div>
                ))}
              </div>

              {/* SPECTATORS LIST IN LOBBY */}
              {roomState.spectators && roomState.spectators.length > 0 && (
                <div className="p-3 rounded-xl bg-[#12131b] border border-zinc-850 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                    <div className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Зрители ({roomState.spectators.length}):</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {roomState.spectators.map(s => (
                      <span
                        key={s.id}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono border flex items-center gap-1 ${
                          s.id === myId
                            ? 'bg-indigo-950/90 border-indigo-600 text-indigo-200 font-bold'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {s.clanTag && <span className="text-amber-400 font-bold">[{s.clanTag}]</span>}
                        <span>{s.name}</span>
                        {s.id === myId && <span className="text-amber-400">(Вы)</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ROLE SELECTION CARD INTERACTIVE WIDGET (for players only) */}
              {!isSpectator && (
                <div className="pt-0.5 sm:pt-1 shrink-0 w-full flex justify-center items-center md:block">
                  {myPlayer?.hasUsedRoleCard && myPreferredRoleDef ? (
                    <div className="p-2 sm:p-3 rounded-xl bg-gradient-to-r from-[#1b1c2b] to-[#141522] border border-amber-500/70 flex items-center justify-between gap-2.5 shadow-md shadow-amber-950/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-sm sm:text-base shrink-0">
                          🎴
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                            <span className="text-amber-400">Заказана роль:</span>
                            <span style={{ color: myPreferredRoleDef.color }} className="font-extrabold">
                              {myPreferredRoleDef.name}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-400 truncate">
                            100% гарантия при отсутствии конкурентов • Карта активирована
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          sounds.playTick();
                          setIsRoleCardModalOpen(true);
                        }}
                        className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-600/70 text-amber-300 hover:text-white text-xs font-bold transition-all shrink-0"
                      >
                        Сменить
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        setIsRoleCardModalOpen(true);
                      }}
                      className="w-full p-2 sm:p-3 rounded-xl bg-gradient-to-r from-[#171826] to-[#13141f] hover:from-[#1e1f32] hover:to-[#171826] border border-amber-500/40 hover:border-amber-400/80 text-zinc-200 hover:text-white text-xs font-bold transition-all flex items-center justify-between gap-2 shadow-sm group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-xs sm:text-sm group-hover:scale-110 transition-transform">
                          🎴
                        </div>
                        <div className="text-left">
                          <div className="text-amber-300 font-bold leading-tight">
                            Карточка выбора роли
                          </div>
                          <div className="text-[10px] text-zinc-400 font-normal">
                            {roleCardsCount > 0 ? `В наличии: ${roleCardsCount} шт. • Нажмите для выбора` : 'Заказать желаемую роль на следующую игру'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-950/50 px-2 py-0.5 sm:py-1 rounded-lg border border-amber-800/40">
                        <span>Выбрать</span>
                        <span>➔</span>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Actions for Left Column */}
            <div className="space-y-1.5 md:space-y-3 pt-1.5 md:pt-3 border-t border-zinc-850 shrink-0">
              {isHost ? (
                <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2.5">
                  {/* Add Bot button */}
                  {players.length < settings.maxPlayers && (
                    <button
                      onClick={onAddBot}
                      className="py-2 md:py-3 px-3 sm:px-4 rounded-xl bg-[#181924] hover:bg-[#202230] border border-zinc-800 text-zinc-200 hover:text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                    >
                      <Bot className="w-4 h-4 text-amber-500" />
                      <span>+ Добавить бота</span>
                    </button>
                  )}

                  {/* Switch to spectator for host if other human players */}
                  {onSwitchToSpectator && players.filter(p => !p.isBot).length > 1 && (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        onSwitchToSpectator();
                      }}
                      className="py-2 md:py-3 px-3 sm:px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 text-zinc-300 hover:text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                      title="Передать права ведущего и перейти в зрители"
                    >
                      <Eye className="w-4 h-4 text-indigo-400" />
                      <span>В зрители</span>
                    </button>
                  )}

                  {/* Start Game Button */}
                  <button
                    disabled={!canStart}
                    onClick={() => {
                      sounds.playGavel();
                      onStartGame();
                    }}
                    className="flex-1 py-2 md:py-3 rounded-xl bg-gradient-to-r from-[#b85820] to-[#8c3d12] hover:from-[#c96226] hover:to-[#9e4616] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2 border border-amber-900/60"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>{canStart ? 'Раздать карты и начать игру' : 'Нужно от 4 игроков'}</span>
                  </button>
                </div>
              ) : isSpectator ? (
                <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2.5">
                  <div className="flex-1 p-2 sm:p-3 rounded-xl bg-[#14151e] border border-indigo-900/40 text-center text-xs text-zinc-300 flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                    <span>Вы в режиме зрителя. Ожидание начала игры ведущим стола...</span>
                  </div>

                  {players.length < settings.maxPlayers && onJoinAsPlayer && (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        onJoinAsPlayer();
                      }}
                      className="py-2 md:py-3 px-4 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 shrink-0"
                    >
                      <span>🪑 Сесть за игровой стол</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2.5">
                  <div className="flex-1 p-2 sm:p-3 rounded-xl bg-[#14151e] border border-zinc-800 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span>Ожидание создателя комнаты для раздачи ролей...</span>
                  </div>

                  {onSwitchToSpectator && (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        onSwitchToSpectator();
                      }}
                      className="py-3 px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shrink-0"
                      title="Освободить слот и перейти в зрители"
                    >
                      <Eye className="w-4 h-4 text-indigo-400" />
                      <span>В зрители</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Room Settings (5 of 12 cols) */}
          <div className={`md:col-span-5 p-5 sm:p-6 flex flex-col justify-between bg-[#101117] space-y-4 ${
            mobileTab === 'right' ? 'flex' : 'hidden md:flex'
          }`}>
            
            {/* Header: Настройки стола */}
            <div className="flex items-center justify-between pb-1 border-b border-zinc-850 shrink-0">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-orange-400" />
                <h2 className="font-sans font-bold text-xs tracking-wider uppercase text-white">
                  Настройки стола
                </h2>
              </div>
              {isHost ? (
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-400" /> Ведущий
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Просмотр
                </span>
              )}
            </div>

            {/* Scrollable Settings Panel */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 font-sans">
              
              {!isHost && (
                <div className="p-3 rounded-xl bg-[#18141f] border border-amber-900/50 text-xs text-amber-300 flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Только создатель комнаты может изменять настройки стола.</span>
                </div>
              )}

              {/* Game Mode Selector */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
                  Режим игры:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={!isHost}
                    type="button"
                    onClick={() => handleUpdate('gameMode', 'classic')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      settings.gameMode === 'classic'
                        ? 'bg-[#221c1a] border-orange-500 text-white shadow-xs'
                        : 'bg-[#14151b] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Городская</span>
                      {settings.gameMode === 'classic' && <Check className="w-3.5 h-3.5 text-orange-400" />}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">Общее собрание, Шериф, Доктор</div>
                  </button>

                  <button
                    disabled={!isHost}
                    type="button"
                    onClick={() => handleUpdate('gameMode', 'sport')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      settings.gameMode === 'sport'
                        ? 'bg-[#221c1a] border-orange-500 text-white shadow-xs'
                        : 'bg-[#14151b] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Спортивная</span>
                      {settings.gameMode === 'sport' && <Check className="w-3.5 h-3.5 text-orange-400" />}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">Нулевая минута мафии, 10 мест</div>
                  </button>
                </div>
              </div>

              {/* Max Players Limit */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
                  Лимит мест за столом:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[6, 8, 10, 12].map(count => (
                    <button
                      key={count}
                      disabled={!isHost}
                      type="button"
                      onClick={() => handleUpdate('maxPlayers', count)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                        settings.maxPlayers === count
                          ? 'bg-orange-600 text-white border-orange-500 shadow-xs'
                          : 'bg-[#14151b] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {count} мест
                    </button>
                  ))}
                </div>
              </div>

              {/* First Day Voting Toggle */}
              <div className="p-3.5 rounded-2xl bg-[#14151f] border border-zinc-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-white">
                    Голосование в 1-й день
                  </div>
                  <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                    {settings.firstDayVoting 
                      ? 'Номинации и голосование доступны в день 1' 
                      : 'В день 1 кандидаты не номинируются, сразу ночь'}
                  </div>
                </div>

                <button
                  disabled={!isHost}
                  type="button"
                  onClick={() => handleUpdate('firstDayVoting', !settings.firstDayVoting)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-colors border ${
                    settings.firstDayVoting
                      ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                  }`}
                >
                  {settings.firstDayVoting ? 'ВКЛ' : 'ВЫКЛ'}
                </button>
              </div>

              {/* Timers */}
              <div className="space-y-3 pt-1 border-t border-zinc-850">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
                  Таймеры фаз игры:
                </label>

                {/* General Discussion Timer: 0 - 120s step 15s */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#14151b] border border-zinc-800">
                  <div>
                    <div className="text-xs font-bold text-white">Общее собрание:</div>
                    <div className="text-[10px] text-zinc-400">Общий разговор всех живых</div>
                  </div>
                  {isHost ? (
                    <select
                      value={settings.generalDiscussionDuration}
                      onChange={e => handleUpdate('generalDiscussionDuration', parseInt(e.target.value))}
                      className="bg-[#1b1c28] border border-zinc-700 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-400 focus:outline-none cursor-pointer"
                    >
                      <option value={0} className="bg-zinc-900 text-zinc-400">0с (Отключено)</option>
                      <option value={15} className="bg-zinc-900 text-white">15 сек</option>
                      <option value={30} className="bg-zinc-900 text-white">30 сек</option>
                      <option value={45} className="bg-zinc-900 text-white">45 сек</option>
                      <option value={60} className="bg-zinc-900 text-white">60 сек (1 мин)</option>
                      <option value={75} className="bg-zinc-900 text-white">75 сек</option>
                      <option value={90} className="bg-zinc-900 text-white">90 сек</option>
                      <option value={105} className="bg-zinc-900 text-white">105 сек</option>
                      <option value={120} className="bg-zinc-900 text-white">120 сек (2 мин)</option>
                    </select>
                  ) : (
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {settings.generalDiscussionDuration === 0 ? 'Отключено' : `${settings.generalDiscussionDuration}с`}
                    </span>
                  )}
                </div>

                {/* Individual Speech Timer: 15, 30, 45, 60s */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#14151b] border border-zinc-800">
                  <div>
                    <div className="text-xs font-bold text-white">Индивидуальные речи:</div>
                    <div className="text-[10px] text-zinc-400">Время на речь каждого игрока</div>
                  </div>
                  {isHost ? (
                    <select
                      value={settings.individualSpeechDuration}
                      onChange={e => handleUpdate('individualSpeechDuration', parseInt(e.target.value))}
                      className="bg-[#1b1c28] border border-zinc-700 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-400 focus:outline-none cursor-pointer"
                    >
                      <option value={15} className="bg-zinc-900 text-white">15 сек</option>
                      <option value={30} className="bg-zinc-900 text-white">30 сек</option>
                      <option value={45} className="bg-zinc-900 text-white">45 сек</option>
                      <option value={60} className="bg-zinc-900 text-white">60 сек (1 мин)</option>
                    </select>
                  ) : (
                    <span className="text-xs font-mono font-bold text-amber-400">{settings.individualSpeechDuration}с</span>
                  )}
                </div>

                {/* Night Phase Timer: 15, 30, 45, 60s */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#14151b] border border-zinc-800">
                  <div>
                    <div className="text-xs font-bold text-white">Ночная фаза:</div>
                    <div className="text-[10px] text-zinc-400">Действия мафии, шерифа, доктора</div>
                  </div>
                  {isHost ? (
                    <select
                      value={settings.nightDurationSeconds}
                      onChange={e => handleUpdate('nightDurationSeconds', parseInt(e.target.value))}
                      className="bg-[#1b1c28] border border-zinc-700 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-400 focus:outline-none cursor-pointer"
                    >
                      <option value={15} className="bg-zinc-900 text-white">15 сек</option>
                      <option value={30} className="bg-zinc-900 text-white">30 сек</option>
                      <option value={45} className="bg-zinc-900 text-white">45 сек</option>
                      <option value={60} className="bg-zinc-900 text-white">60 сек</option>
                    </select>
                  ) : (
                    <span className="text-xs font-mono font-bold text-amber-400">{settings.nightDurationSeconds}с</span>
                  )}
                </div>
              </div>

              {/* Roles Deck Toggles (Classic mode only) */}
              {settings.gameMode === 'classic' && (
                <div className="space-y-2 pt-1 border-t border-zinc-850">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
                    Активные роли в колоде:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { key: 'don', label: 'Дон Мафии', icon: Crown, color: 'text-rose-400' },
                      { key: 'sheriff', label: 'Шериф', icon: Shield, color: 'text-amber-400' },
                      { key: 'doctor', label: 'Доктор', icon: HeartPulse, color: 'text-emerald-400' },
                      { key: 'courtesan', label: 'Путана', icon: Sparkles, color: 'text-pink-400' },
                      { key: 'maniac', label: 'Маньяк', icon: Flame, color: 'text-purple-400' },
                      { key: 'bodyguard', label: 'Охранник', icon: Shield, color: 'text-blue-400' }
                    ].map(({ key, label, icon: Icon, color }) => {
                      const roleKey = key as keyof RoomSettings['enabledRoles'];
                      const isEnabled = settings.enabledRoles[roleKey];
                      return (
                        <button
                          key={key}
                          disabled={!isHost}
                          type="button"
                          onClick={() => handleToggleRole(roleKey)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                            isEnabled
                              ? 'bg-[#161722] border-zinc-700 text-white'
                              : 'bg-[#121319] border-zinc-850 text-zinc-500 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                            <span className="truncate">{label}</span>
                          </div>
                          <span className={`text-[9px] font-bold font-mono ${isEnabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            {isEnabled ? 'ВКЛ' : 'ВЫКЛ'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            {/* Bottom Actions: Leave Room */}
            <div className="pt-2 border-t border-zinc-850 flex items-center justify-between shrink-0">
              <button
                onClick={() => {
                  sounds.playTick();
                  onLeaveRoom();
                }}
                className="py-1.5 px-3 rounded-xl bg-[#161720] hover:bg-[#1e202c] border border-zinc-800 text-zinc-400 hover:text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>Покинуть стол</span>
              </button>

              <div className="text-[11px] text-zinc-400 font-mono">
                {players.length} из {settings.maxPlayers} мест
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Slide-over Table Chat & Journal Drawer */}
      {isChatDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-200">
          <div 
            onClick={() => setIsChatDrawerOpen(false)}
            className="absolute inset-0 bg-black/65 backdrop-blur-xs transition-opacity"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 pointer-events-auto">
            <div className="w-screen max-w-md bg-[#101117] border-l border-zinc-800/90 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
              
              {/* Drawer Header */}
              <div className="p-4 sm:p-5 border-b border-zinc-850/80 bg-[#13141d]/90 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-orange-950/60 border border-orange-800/60 text-orange-400">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                      Чат и журнал стола
                    </h3>
                    <p className="text-[10px] text-zinc-400">
                      Код стола: <span className="font-mono text-orange-400">{roomState.roomCode}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    sounds.playTick();
                    setIsChatDrawerOpen(false);
                  }}
                  className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 min-h-0 flex flex-col p-4 space-y-3 font-sans overflow-hidden">
                {/* Channel Tabs */}
                <div className="flex border-b border-zinc-850 bg-[#13141d] p-1 gap-1 text-xs rounded-xl shrink-0">
                  <button
                    onClick={() => setActiveChannel('all')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-colors ${
                      activeChannel === 'all'
                        ? 'bg-[#1b1c28] text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3 text-zinc-400" />
                    <span>Общий</span>
                  </button>

                  <button
                    onClick={() => setActiveChannel('system')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-colors ${
                      activeChannel === 'system'
                        ? 'bg-[#1b1c28] text-amber-300 shadow-xs'
                        : 'text-zinc-400 hover:text-amber-400'
                    }`}
                  >
                    <ScrollText className="w-3 h-3" />
                    <span>Журнал</span>
                  </button>
                </div>

                {/* Live Online Status */}
                {activeChannel !== 'system' && (
                  <div className="px-2.5 py-1.5 bg-[#13141d]/90 border border-zinc-850 rounded-xl space-y-1 shrink-0">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-mono text-zinc-400 flex items-center gap-1.5 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Участники стола:</span>
                      </span>
                      <span className="font-mono text-[9px] text-zinc-500">
                        <span className="text-emerald-400 font-bold">{players.filter(p => p.connected || p.isBot).length}</span> / {players.length} онлайн
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                      {players.map(p => {
                        const isOnline = p.connected || p.isBot;
                        const isMe = p.id === myId;
                        return (
                          <div
                            key={p.id}
                            title={`${p.name}: ${p.isBot ? 'ИИ-Бот' : p.connected ? 'В сети' : 'Оффлайн'}`}
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
                  </div>
                )}

                {/* Messages List */}
                <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2 border border-zinc-850 rounded-xl bg-[#0e0f14]/80">
                  {currentMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center text-xs text-zinc-500 p-4">
                      {activeChannel === 'system'
                        ? 'События комнаты фиксируются в журнале протокола'
                        : 'Приветствуйте других игроков в чате стола!'}
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

                      const sender = players.find(p => p.id === msg.senderId);
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
                              : 'bg-[#161722] border border-zinc-800 text-zinc-100'
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Quick Phrases */}
                <div className="overflow-x-auto flex gap-1 scrollbar-none py-0.5 shrink-0">
                  {['Привет всем!', 'Готов к игре!', 'Ждем еще игроков...', 'Раздавайте карты!'].map((phrase, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        onSendMessage(phrase, 'all');
                        sounds.playMessageSound();
                      }}
                      className="whitespace-nowrap px-2 py-0.5 rounded-lg bg-[#171822] hover:bg-[#202230] border border-zinc-800 text-[10px] text-zinc-300 hover:text-white transition-colors"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>

                {/* Chat Input */}
                <div className="pt-1 shrink-0">
                  <form onSubmit={handleSendChat} className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      maxLength={200}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="Сообщение за столом..."
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
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Slide-over Curtain Drawer for Hamburger Menu */}
      <NavigationDrawer
        isOpen={isNavDrawerOpen}
        onClose={() => setIsNavDrawerOpen(false)}
        activeTab="lobby"
        onSelectTab={handleSelectNavTab}
        isLoggedIn={isLoggedIn}
        user={user}
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

      {/* Role Selection Card Modal */}
      <RoleSelectCardModal
        isOpen={isRoleCardModalOpen}
        onClose={() => setIsRoleCardModalOpen(false)}
        roomState={roomState}
        myId={myId}
        user={user}
        onUpdateUser={onUpdateUser}
        onOpenShop={() => {
          setIsRoleCardModalOpen(false);
          setIsShopOpen(true);
        }}
        onOpenAuth={onOpenAuth}
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

      {/* Feedback & Bug Reporting Modal */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        user={user}
        onOpenAuth={onOpenAuth}
        onUpdateUser={onUpdateUser}
      />

    </div>
  );
};
