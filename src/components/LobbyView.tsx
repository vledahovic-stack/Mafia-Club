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
import { PromoCodeModal } from './PromoCodeModal';
import { CampaignsModal } from './CampaignsModal';
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
  MoreVertical,
  X
} from 'lucide-react';
import { sounds } from '../utils/audio';
import noirLobbyBg from '../assets/images/noir_mafia_lobby_bg_1791204529068.jpg';
import { AuthUser } from './AuthModal';
import { useLanguage } from '../context/LanguageContext';
import { PlayerTableContextMenu, useTableFriends } from './PlayerTableContextMenu';
import { NotificationBellButton } from './notifications/NotificationBellButton';

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
  onOpenProfile: (initialTab?: 'inventory' | 'promocodes') => void;
  onOpenAuth: () => void;
  onOpenAdmin?: () => void;
  onToggleSound: () => void;
  onSendMessage: (text: string, channel?: ChatMessage['channel']) => void;
  onLogout: () => void;
  onJoinAsPlayer?: () => void;
  onSwitchToSpectator?: () => void;
  onTransferHost?: (targetPlayerId: string) => void;
  webRtc?: ReturnType<typeof useWebRtc>;
  onOpenWebRtcSettings?: () => void;
  unreadNotificationsCount?: number;
  hasNewNotificationAnimation?: boolean;
  onOpenNotifications?: () => void;
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
  onTransferHost,
  webRtc,
  onOpenWebRtcSettings,
  unreadNotificationsCount,
  hasNewNotificationAnimation,
  onOpenNotifications
}) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [mobileTab, setMobileTab] = useState<'left' | 'right'>('left');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX > 0 && mobileTab === 'left') {
        setMobileTab('right');
        sounds.playTick();
      } else if (diffX < 0 && mobileTab === 'right') {
        setMobileTab('left');
        sounds.playTick();
      }
    }
    setTouchStartX(null);
    setTouchStartY(null);
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
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [isCampaignsOpen, setIsCampaignsOpen] = useState(false);
  const [tasksDefaultTab, setTasksDefaultTab] = useState<'global' | 'onboarding' | 'personal' | 'clan'>('global');
  const [isRoleCardModalOpen, setIsRoleCardModalOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState<ChatMessage['channel']>('all');
  const [chatInput, setChatInput] = useState('');
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [activePlayerMenuId, setActivePlayerMenuId] = useState<string | null>(null);

  const tableFriends = useTableFriends(isLoggedIn, user?.id);

  React.useEffect(() => {
    if (!activePlayerMenuId) return;
    const handleOutsideClick = () => {
      setActivePlayerMenuId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [activePlayerMenuId]);

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
      case 'leave_room':
        onLeaveRoom();
        break;
      case 'profile':
        if (isLoggedIn) onOpenProfile();
        else onOpenAuth();
        break;
      case 'promocode':
        if (isLoggedIn) setIsPromoModalOpen(true);
        else onOpenAuth();
        break;
      case 'campaigns':
        setIsCampaignsOpen(true);
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
      style={{ backgroundImage: `var(--skin-img-lobby, url(${noirLobbyBg}))` }}
    >
      {/* Dark moody vignette overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] pointer-events-none" />

      {/* Main Center Console Card (Monolithic Frame: 65% width, 98% height on desktop; 100% on mobile) */}
      <div className="skin-console-frame relative z-10 w-full md:w-[65vw] h-full max-h-full min-h-0 md:min-h-0 md:h-[98vh] bg-[var(--skin-bg-overlay)] border-0 md:border md:border-[var(--skin-border-base)] rounded-none md:rounded-[var(--skin-radius-modal)] shadow-[var(--skin-shadow-modal)] overflow-hidden flex flex-col backdrop-blur-md">

        {/* Top Header inside console */}
        <div className="skin-header px-3 sm:px-4 py-2 sm:py-2.5 border-b border-[var(--skin-border-header)] flex flex-wrap items-center justify-between gap-2 bg-[var(--skin-bg-header)] shrink-0">
          
          {/* Left / Center: Invite Code Badge (Maximally compact) */}
          <div 
            onClick={handleCopyInvite}
            title={t('lobby.click_copy_invite', 'Нажмите, чтобы скопировать ссылку на стол')}
            className="skin-subcard flex items-center gap-1.5 bg-[var(--skin-bg-subcard)] hover:bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-base)] hover:border-[var(--skin-border-strong)] px-2 py-0.5 rounded-lg shadow-inner cursor-pointer transition-all group shrink-0"
          >
            <span className="text-[10px] font-mono text-[var(--skin-text-muted)] leading-none">{t('header.code_label', 'Код:')}</span>
            <span className="text-xs font-mono font-bold tracking-wider text-[var(--skin-text-accent)] leading-none">
              {roomState.roomCode}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCopyInvite();
              }}
              title={t('lobby.copy_for_friends', 'Скопировать ссылку для друзей')}
              className="p-0.5 rounded text-[var(--skin-text-muted)] group-hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)] transition-colors leading-none cursor-pointer"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400 animate-in zoom-in-75 duration-150" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
            {copied && (
              <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-700/60 px-1 py-0.2 rounded leading-none animate-in fade-in duration-150">
                {t('lobby.code_copied', 'скопировано')}
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
              title={t('lobby.chat_drawer_title', 'Чат и журнал стола')}
              className="skin-subcard relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] hover:bg-[var(--skin-bg-elevated)] hover:border-[var(--skin-border-strong)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] transition-all shadow-inner cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-[var(--skin-accent-primary)] cyber-icon-cyan" />
              <span className="hidden sm:inline text-xs font-semibold">{t('lobby.chat_tab', 'Чат стола')}</span>
              {chatMessages.length > 0 && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-[var(--skin-accent-secondary)] text-white leading-tight">
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
                title={t('header.admin', 'Панель Администратора')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-950/80 to-orange-950/80 border border-amber-600/70 text-amber-300 hover:text-white hover:border-amber-500 text-xs font-bold transition-all shadow-sm shadow-amber-950/40 cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">{t('header.admin', 'Админ-панель')}</span>
              </button>
            )}

            {/* Player Profile Badge */}
            <button
              onClick={() => {
                if (isLoggedIn) onOpenProfile();
                else onOpenAuth();
              }}
              className="cyber-profile-badge flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-[var(--skin-bg-elevated)]/60 transition-colors text-left cursor-pointer"
            >
              <div className={`w-8 h-8 rounded-full border flex items-center justify-center overflow-hidden shrink-0 ${
                isSpectator ? 'bg-indigo-950/80 border-indigo-700/80 text-indigo-300' : 'cyber-avatar-ring bg-[var(--skin-bg-elevated)] border-[var(--skin-border-strong)]'
              }`}>
                {isSpectator ? <Eye className="w-4 h-4 text-indigo-400" /> : <GangsterIcon size={26} className="w-6 h-6" />}
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-bold text-[var(--skin-text-primary)] leading-tight flex items-center gap-1">
                  <span className="truncate max-w-[120px]">{playerName}</span>
                  {isHost && <Crown className="w-3 h-3 text-[var(--skin-text-accent)] shrink-0" />}
                  {isSpectator && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                      {t('lobby.role_spectator', 'Зритель')}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-[var(--skin-text-muted)] font-mono">
                  {isSpectator ? t('lobby.role_spectator', 'Наблюдатель') : isHost ? t('lobby.role_host', 'Ведущий стола') : t('lobby.role_player', 'Игрок')}
                </div>
              </div>
            </button>

            {/* Universal Notification Center Bell Button (Registered players only) */}
            {user && onOpenNotifications && (
              <NotificationBellButton
                unreadCount={unreadNotificationsCount || 0}
                hasNewAnimation={hasNewNotificationAnimation}
                onClick={onOpenNotifications}
              />
            )}

            {/* Hamburger Menu Button */}
            <button
              onClick={() => {
                sounds.playTick();
                setIsNavDrawerOpen(true);
              }}
              title={t('lobby.nav_menu', 'Меню навигации')}
              className="p-2 rounded-xl text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)] transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5 cyber-icon-cyan" />
            </button>
          </div>

        </div>

        {/* Mobile View Tab Switcher (Visible only on mobile md:hidden) */}
        <div className="flex md:hidden border-b border-[var(--skin-border-subtle)] bg-[var(--skin-bg-header)] px-2.5 py-1.5 gap-1.5 shrink-0">
          <button
            onClick={() => {
              sounds.playTick();
              setMobileTab('left');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileTab === 'left'
                ? 'skin-btn-primary text-white shadow-xs'
                : 'text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] bg-[var(--skin-bg-subcard)]/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t('lobby.members_tab', 'Участники')} ({players.length}/{settings.maxPlayers})</span>
          </button>
          <button
            onClick={() => {
              sounds.playTick();
              setMobileTab('right');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileTab === 'right'
                ? 'skin-btn-primary text-white shadow-xs'
                : 'text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] bg-[var(--skin-bg-subcard)]/60'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{t('lobby.table_settings', 'Настройки стола')}</span>
          </button>
        </div>

        {/* Content Body: Left Column (Table Seats) + Right Column (Room Settings) */}
        <div 
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="grid grid-cols-1 grid-rows-[minmax(0,1fr)] md:grid-cols-12 flex-1 min-h-0 h-full overflow-hidden"
        >
          
          {/* Left Column: Player Seats (7 of 12 cols) */}
          <div className={`md:col-span-7 p-2.5 sm:p-4 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[var(--skin-border-subtle)] bg-[var(--skin-bg-surface)] space-y-2 md:space-y-3 flex-1 min-h-0 h-full overflow-hidden ${
            mobileTab === 'left' ? 'flex' : 'hidden md:flex'
          }`}>
            
            <div className="space-y-2 md:space-y-3 flex-1 flex flex-col justify-start min-h-0 overflow-hidden">
              {/* Header: Сбор участников & счетчик мест (Hidden on mobile, visible on desktop) */}
              <div className="hidden md:flex items-center justify-between pb-1">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[var(--skin-accent-primary)]" />
                  <h2
                    className="font-sans font-bold text-xs tracking-wider uppercase text-[var(--skin-text-primary)]"
                    style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}
                  >
                    {t('lobby.members_at_table', 'Участники за столом')}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-[var(--skin-text-muted)]">
                    {players.length} / {settings.maxPlayers} {t('lobby.seats_count', 'мест')}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[var(--skin-text-accent)] bg-amber-950/40 border border-amber-900/60 px-2 py-0.5 rounded-full">
                    {settings.gameMode === 'sport' ? t('lobby.mode_sport', 'Спортивная') : t('lobby.mode_city', 'Городская')}
                  </span>
                </div>
              </div>

              {/* SPECTATOR STATUS BANNER */}
              {isSpectator && (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/70 via-[#161726] to-[var(--skin-bg-card)] border border-indigo-700/80 shadow-md flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-indigo-900/60 border border-indigo-600/80 flex items-center justify-center text-indigo-300 shrink-0">
                      <Eye className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5">
                        <span>{t('lobby.spectator_mode', 'Режим зрителя')}</span>
                        <span className="px-1.5 py-0.2 rounded bg-indigo-900 text-indigo-200 text-[9px] font-mono font-bold uppercase">
                          {t('lobby.spectating', 'Наблюдение')}
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--skin-text-muted)] truncate">
                        {t('lobby.spectator_desc', 'Вы не занимаете слот игрока. Доступен просмотр стола и чат.')}
                      </p>
                    </div>
                  </div>

                  {players.length < settings.maxPlayers && onJoinAsPlayer && (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        onJoinAsPlayer();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <span>{t('lobby.take_seat_btn', '🪑 Сесть за стол')}</span>
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
              <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-1">
                {players.map((player, index) => {
                  const isMe = player.id === myId;
                  const isMenuOpen = !isMe && activePlayerMenuId === player.id;

                  return (
                    <div
                      key={player.id}
                      onClick={(e) => {
                        if (isMe) return;
                        e.stopPropagation();
                        sounds.playTick();
                        setActivePlayerMenuId(prev => {
                          const next = prev === player.id ? null : player.id;
                          if (next) {
                            tableFriends.refreshFriends();
                          }
                          return next;
                        });
                      }}
                      className={`skin-card relative py-1.5 px-2.5 rounded-xl border flex items-center justify-between transition-all ${
                        isMe
                          ? 'bg-[var(--skin-bg-elevated)] border-[var(--skin-border-accent)] shadow-md'
                          : isMenuOpen
                          ? 'z-30 bg-[var(--skin-bg-elevated)] border-[var(--skin-border-strong)] shadow-lg cursor-pointer'
                          : 'bg-[var(--skin-bg-card)] border-[var(--skin-border-card)] hover:border-[var(--skin-border-strong)] cursor-pointer'
                      }`}
                    >
                      {/* Left: Slot number, Avatar & Name */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-mono font-bold text-[var(--skin-accent-primary)] w-4 shrink-0">
                          #{index + 1}
                        </span>

                        <div className="cyber-avatar-ring w-8 h-8 rounded-lg overflow-hidden bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-strong)] flex items-center justify-center shrink-0 relative shadow-inner">
                          <GangsterIcon size={20} className="w-4 h-4 text-[var(--skin-text-secondary)]" />
                        </div>

                        <div className="truncate">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {player.clanTag && (
                              <span 
                                className="text-[9px] font-mono font-black px-1 py-0.5 rounded bg-amber-950/80 border border-amber-600/70 text-[var(--skin-text-accent)] shadow-xs"
                                title={player.clanName ? `Клан: ${player.clanName}` : undefined}
                              >
                                [{player.clanTag}]
                              </span>
                            )}
                            <span className="cyber-room-title text-xs font-bold text-[var(--skin-text-primary)] truncate">
                              {player.name}
                            </span>
                            {isMe && <span className="text-[10px] text-[var(--skin-text-accent)] font-medium">{t('lobby.you', '(Вы)')}</span>}
                            {player.isHost && (
                              <span className="text-[10px] text-[var(--skin-text-accent)] font-mono flex items-center gap-0.5">
                                <Crown className="w-2.5 h-2.5" /> {t('lobby.host_badge', 'Ведущий')}
                              </span>
                            )}
                            {/* Role Selection Badge */}
                            {player.hasUsedRoleCard && (
                              isMe && player.preferredRole ? (
                                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-amber-950/90 border border-amber-500/80 text-[var(--skin-text-accent)] font-bold flex items-center gap-1 shadow-sm">
                                  <span>🎴</span>
                                  <span>{ROLE_DEFINITIONS[player.preferredRole]?.name || t('lobby.ordered_role', 'Заказ')}</span>
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-[var(--skin-bg-subcard)] border border-amber-600/50 text-[var(--skin-text-accent)] font-medium flex items-center gap-1" title={t('lobby.role_card_desc', 'Игрок применил Карточку выбора роли')}>
                                  <span>🎴</span>
                                  <span>{t('lobby.role_card_title', 'Карта роли')}</span>
                                </span>
                              )
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-[var(--skin-text-muted)] font-mono">
                            <span>{player.isBot ? t('lobby.bot', 'ИИ-Бот') : player.connected ? t('lobby.online', 'В сети') : t('lobby.offline', 'Не в сети')}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Interactive Microphone & Audio Control Buttons */}
                      <div className="flex items-center gap-1 shrink-0 ml-1.5">
                        {webRtc && !player.isBot && (
                          isMe ? (
                            /* Local player interactive mic & video toggle buttons */
                            <div className="flex items-center gap-1 bg-[var(--skin-bg-subcard)] p-0.5 rounded-lg border border-[var(--skin-border-base)] shadow-inner">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sounds.playTick();
                                  webRtc.toggleMic();
                                }}
                                title={webRtc.isMicOn ? t('settings.sound_off', 'Выключить микрофон') : t('settings.sound_on', 'Включить микрофон')}
                                className={`px-2 py-0.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer ${
                                  webRtc.isMicOn
                                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/50'
                                    : 'bg-rose-950/80 hover:bg-rose-900 border border-rose-700/70 text-rose-300'
                                }`}
                              >
                                {webRtc.isMicOn ? (
                                  <>
                                    <Mic className="w-3 h-3 animate-pulse text-emerald-200" />
                                    <span className="text-[9px] uppercase tracking-wider font-mono">{t('lobby.mic_on', 'Мик Вкл')}</span>
                                  </>
                                ) : (
                                  <>
                                    <MicOff className="w-3 h-3 text-rose-400" />
                                    <span className="text-[9px] uppercase tracking-wider font-mono">{t('lobby.mic_off', 'Мик Выкл')}</span>
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
                                title={webRtc.isCameraOn ? t('settings.sound_off', 'Выключить камеру') : t('settings.sound_on', 'Включить камеру')}
                                className={`p-1 rounded-md text-xs transition-all border cursor-pointer ${
                                  webRtc.isCameraOn
                                    ? 'bg-sky-600/90 hover:bg-sky-500 text-white border-sky-400/50'
                                    : 'bg-[var(--skin-bg-card)] hover:bg-[var(--skin-bg-elevated)] text-[var(--skin-text-muted)] border-[var(--skin-border-base)]'
                                }`}
                              >
                                {webRtc.isCameraOn ? <Video className="w-3 h-3 text-sky-200" /> : <VideoOff className="w-3 h-3" />}
                              </button>
                            </div>
                          ) : (
                            /* Remote peer mic status / audio toggle button */
                            <div className="flex items-center gap-1 bg-[var(--skin-bg-subcard)] p-0.5 rounded-lg border border-[var(--skin-border-base)]">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sounds.playTick();
                                  webRtc.toggleBlockIncomingAudio();
                                }}
                                title={
                                  webRtc.settings.blockIncomingAudio
                                    ? t('settings.sound_off', 'Звук заглушен')
                                    : (webRtc.remotePeers.get(player.id)?.mediaState.isAudioEnabled ? t('lobby.mic_on', 'Микрофон активен') : t('lobby.mic_off', 'Микрофон выключен'))
                                }
                                className={`px-1.5 py-0.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 border cursor-pointer ${
                                  webRtc.settings.blockIncomingAudio
                                    ? 'bg-rose-950/60 border-rose-800 text-rose-300 hover:bg-rose-900/60'
                                    : webRtc.remotePeers.get(player.id)?.mediaState.isAudioEnabled
                                    ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                                    : 'bg-[var(--skin-bg-card)] border-[var(--skin-border-base)] text-[var(--skin-text-muted)]'
                                }`}
                              >
                                {webRtc.remotePeers.get(player.id)?.mediaState.isAudioEnabled && !webRtc.settings.blockIncomingAudio ? (
                                  <>
                                    <Mic className="w-3 h-3 text-emerald-400" />
                                    <span className="text-[9px] font-mono text-emerald-300">{t('settings.sound_on', 'Вкл')}</span>
                                  </>
                                ) : (
                                  <>
                                    <MicOff className="w-3 h-3 text-[var(--skin-text-muted)]" />
                                    <span className="text-[9px] font-mono text-[var(--skin-text-muted)]">{t('settings.sound_off', 'Выкл')}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )
                        )}

                        {/* Transfer Host button (host only, for connected human players) */}
                        {isHost && !isMe && !player.isBot && player.connected && onTransferHost && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sounds.playTick();
                              onTransferHost(player.id);
                            }}
                            title={t('lobby.transfer_host', 'Передать права ведущего этому игроку')}
                            className="px-2 py-1 rounded-lg bg-amber-950/70 hover:bg-amber-900 border border-amber-700/60 text-amber-300 hover:text-white text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Crown className="w-3 h-3 text-amber-400" />
                            <span className="hidden sm:inline">{t('lobby.make_host', 'Ведущий')}</span>
                          </button>
                        )}

                        {/* Bot Delete button (host only) */}
                        {isHost && player.isBot && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveBot(player.id);
                            }}
                            title={t('lobby.delete_bot', 'Удалить бота')}
                            className="p-1.5 rounded-lg text-[var(--skin-text-muted)] hover:text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Context Menu Trigger Icon for other players */}
                        {!isMe && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sounds.playTick();
                              setActivePlayerMenuId(prev => {
                                const next = prev === player.id ? null : player.id;
                                if (next) {
                                  tableFriends.refreshFriends();
                                }
                                return next;
                              });
                            }}
                            title={t('game.player_actions', 'Меню участника')}
                            className={`p-1 rounded-lg border transition-colors cursor-pointer ${
                              isMenuOpen
                                ? 'bg-[var(--skin-bg-elevated)] border-[var(--skin-border-strong)] text-[var(--skin-text-primary)]'
                                : 'bg-[var(--skin-bg-subcard)]/60 border-[var(--skin-border-base)] text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:border-[var(--skin-border-strong)]'
                            }`}
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Participant Adaptive Context Menu (Stage 1: Friendship actions; extensible for Stages 2–4) */}
                      {isMenuOpen && (
                        <PlayerTableContextMenu
                          targetPlayer={player}
                          seatNumber={index + 1}
                          myId={myId}
                          isLoggedIn={isLoggedIn}
                          currentUserId={user?.id}
                          friendStatus={tableFriends.getFriendStatus(player.id)}
                          isLoadingFriendAction={tableFriends.loadingPlayerId === player.id}
                          feedback={tableFriends.feedback}
                          onSendFriendRequest={tableFriends.sendFriendRequestToPlayer}
                          onAcceptFriendRequest={tableFriends.acceptFriendRequestFromPlayer}
                          onRemoveFriend={tableFriends.removeFriendFromPlayer}
                          openUpward={index >= players.length - 2 && index >= 2}
                        />
                      )}
                    </div>
                  );
                })}

                {/* Empty slots placeholder */}
                {Array.from({ length: Math.max(0, Math.min(settings.maxPlayers - players.length, 3)) }).map((_, i) => (
                  <div
                    key={`empty_${i}`}
                    className="py-2 px-3 rounded-xl border border-dashed border-[var(--skin-border-base)] bg-[var(--skin-bg-slot)]/50 flex items-center justify-center text-[var(--skin-text-muted)] text-xs font-mono"
                  >
                    {t('lobby.empty_slot', 'Свободное место')} #{players.length + i + 1} ({t('lobby.waiting_player', 'Ожидание игрока...')})
                  </div>
                ))}
              </div>

              {/* SPECTATORS LIST IN LOBBY */}
              {roomState.spectators && roomState.spectators.length > 0 && (
                <div className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--skin-text-secondary)]">
                    <div className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{t('lobby.spectators', 'Зрители')} ({roomState.spectators.length}):</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {roomState.spectators.map(s => (
                      <span
                        key={s.id}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono border flex items-center gap-1 ${
                          s.id === myId
                            ? 'bg-indigo-950/90 border-indigo-600 text-indigo-200 font-bold'
                            : 'bg-[var(--skin-bg-card)] border-[var(--skin-border-base)] text-[var(--skin-text-muted)]'
                        }`}
                      >
                        {s.clanTag && <span className="text-[var(--skin-text-accent)] font-bold">[{s.clanTag}]</span>}
                        <span>{s.name}</span>
                        {s.id === myId && <span className="text-[var(--skin-text-accent)]">{t('lobby.you', '(Вы)')}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ROLE SELECTION CARD INTERACTIVE WIDGET (for players only) */}
              {!isSpectator && (
                <div className="pt-0.5 sm:pt-1 shrink-0 w-full flex justify-center items-center md:block">
                  {myPlayer?.hasUsedRoleCard && myPreferredRoleDef ? (
                    <div className="p-2 sm:p-3 rounded-xl bg-gradient-to-r from-[var(--skin-bg-elevated)] to-[var(--skin-bg-subcard)] border border-[var(--skin-border-accent)] flex items-center justify-between gap-2.5 shadow-md">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-sm sm:text-base shrink-0">
                          🎴
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5 truncate">
                            <span className="text-[var(--skin-text-accent)]">{t('lobby.ordered_role', 'Заказана роль:')}</span>
                            <span style={{ color: myPreferredRoleDef.color }} className="font-extrabold">
                              {myPreferredRoleDef.name}
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--skin-text-muted)] truncate">
                            {t('lobby.card_activated_note', '100% гарантия при отсутствии конкурентов • Карта активирована')}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          sounds.playTick();
                          setIsRoleCardModalOpen(true);
                        }}
                        className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-600/70 text-[var(--skin-text-accent)] hover:text-white text-xs font-bold transition-all shrink-0 cursor-pointer"
                      >
                        {t('lobby.change_role', 'Сменить')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        setIsRoleCardModalOpen(true);
                      }}
                      className="w-full p-2 sm:p-3 rounded-xl bg-gradient-to-r from-[var(--skin-bg-elevated)] to-[var(--skin-bg-subcard)] hover:brightness-110 border border-[var(--skin-border-accent)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] text-xs font-bold transition-all flex items-center justify-between gap-2 shadow-sm group cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-xs sm:text-sm group-hover:scale-110 transition-transform">
                          🎴
                        </div>
                        <div className="text-left">
                          <div className="text-[var(--skin-text-accent)] font-bold leading-tight">
                            {t('lobby.role_card_title', 'Карточка выбора роли')}
                          </div>
                          <div className="text-[10px] text-[var(--skin-text-muted)] font-normal">
                            {roleCardsCount > 0 ? `${t('lobby.role_card_in_stock', 'В наличии:')} ${roleCardsCount} шт.` : t('lobby.role_card_desc', 'Заказать желаемую роль на следующую игру')}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] font-mono text-[var(--skin-text-accent)] bg-amber-950/50 px-2 py-0.5 sm:py-1 rounded-lg border border-amber-800/40">
                        <span>{t('lobby.select', 'Выбрать')}</span>
                        <span>➔</span>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Actions for Left Column */}
            <div className="space-y-1.5 md:space-y-2.5 pt-1.5 md:pt-2.5 border-t border-[var(--skin-border-subtle)] shrink-0">
              {isHost ? (
                <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2">
                  {/* Add Bot button */}
                  {players.length < settings.maxPlayers && (
                    <button
                      onClick={onAddBot}
                      className="skin-btn-secondary py-2 sm:py-2.5 px-3 sm:px-3.5 rounded-xl border text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Bot className="w-4 h-4 text-[var(--skin-text-accent)]" />
                      <span>{t('lobby.add_bot', '+ Добавить бота')}</span>
                    </button>
                  )}

                  {/* Start Game Button */}
                  <button
                    disabled={!canStart || isStartingGame}
                    onClick={() => {
                      setIsStartingGame(true);
                      sounds.playGavel();
                      onStartGame();
                      setTimeout(() => setIsStartingGame(false), 2000);
                    }}
                    className="cyber-room-join-btn skin-btn-join flex-1 py-2 sm:py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-2 border cursor-pointer"
                  >
                    <Play className={`w-4 h-4 fill-white ${isStartingGame ? 'animate-spin' : ''}`} />
                    <span>{isStartingGame ? 'Раздача карт...' : canStart ? t('lobby.start_game', 'Раздать карты и начать игру') : t('lobby.need_more_players', 'Нужно от 4 игроков')}</span>
                  </button>
                </div>
              ) : isSpectator ? (
                <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2.5">
                  <div className="flex-1 p-2 sm:p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-indigo-900/40 text-center text-xs text-[var(--skin-text-secondary)] flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                    <span>{t('lobby.spectator_waiting', 'Вы в режиме зрителя. Ожидание начала игры ведущим стола...')}</span>
                  </div>

                  {players.length < settings.maxPlayers && onJoinAsPlayer && (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        onJoinAsPlayer();
                      }}
                      className="py-2 md:py-3 px-4 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                    >
                      <span>{t('lobby.take_seat', '🪑 Сесть за игровой стол')}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2.5">
                  <div className="flex-1 p-2 sm:p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-center text-xs text-[var(--skin-text-muted)] flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--skin-text-accent)] animate-pulse" />
                    <span>{t('lobby.waiting_host', 'Ожидание создателя комнаты для раздачи ролей...')}</span>
                  </div>

                  {onSwitchToSpectator && (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        onSwitchToSpectator();
                      }}
                      className="skin-btn-secondary py-3 px-3.5 rounded-xl border font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                      title={t('lobby.to_spectators', 'Освободить слот и перейти в зрители')}
                    >
                      <Eye className="w-4 h-4 text-indigo-400" />
                      <span>{t('lobby.to_spectators', 'В зрители')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Room Settings (5 of 12 cols) */}
          <div className={`md:col-span-5 p-3 sm:p-4 flex flex-col bg-[var(--skin-bg-drawer)] space-y-2.5 sm:space-y-3 flex-1 min-h-0 h-full overflow-hidden transition-colors duration-300 ${
            mobileTab === 'right' ? 'flex' : 'hidden md:flex'
          }`}>
            
            {/* Header: Настройки стола */}
            <div className="flex items-center justify-between pb-1.5 border-b border-[var(--skin-border-subtle)] shrink-0">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[var(--skin-accent-primary)]" />
                <h2 className="font-sans font-bold text-xs tracking-wider uppercase text-[var(--skin-text-primary)]">
                  {t('lobby.table_settings', 'Настройки стола')}
                </h2>
              </div>
              {isHost ? (
                <span className="text-[10px] font-mono font-bold text-[var(--skin-text-accent)] bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Crown className="w-3 h-3 text-[var(--skin-text-accent)]" /> {t('lobby.host_badge', 'Ведущий')}
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold text-[var(--skin-text-muted)] bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> {t('lobby.view_only', 'Просмотр')}
                </span>
              )}
            </div>

            {/* Scrollable Settings Panel */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y space-y-3 pr-1 pb-[max(1rem,env(safe-area-inset-bottom))] font-sans">
              
              {!isHost && (
                <div className="p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-amber-900/50 text-xs text-amber-300 flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>{t('lobby.host_only_settings', 'Только создатель комнаты может изменять настройки стола.')}</span>
                </div>
              )}

              {/* Game Mode Selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--skin-text-muted)] block">
                  {t('lobby.game_mode', 'Режим игры:')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={!isHost}
                    type="button"
                    onClick={() => handleUpdate('gameMode', 'classic')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      settings.gameMode === 'classic'
                        ? 'bg-[var(--skin-bg-elevated)] border-[var(--skin-border-accent)] text-[var(--skin-text-primary)] shadow-[var(--skin-glow-accent)]'
                        : 'bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] text-[var(--skin-text-muted)] hover:text-[var(--skin-text-secondary)]'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>{t('lobby.mode_city', 'Городская')}</span>
                      {settings.gameMode === 'classic' && <Check className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />}
                    </div>
                    <div className="text-[10px] text-[var(--skin-text-muted)] mt-0.5 leading-tight">{t('lobby.mode_city_desc', 'Общее собрание, Шериф, Доктор')}</div>
                  </button>

                  <button
                    disabled={!isHost}
                    type="button"
                    onClick={() => handleUpdate('gameMode', 'sport')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      settings.gameMode === 'sport'
                        ? 'bg-[var(--skin-bg-elevated)] border-[var(--skin-border-accent)] text-[var(--skin-text-primary)] shadow-[var(--skin-glow-accent)]'
                        : 'bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] text-[var(--skin-text-muted)] hover:text-[var(--skin-text-secondary)]'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>{t('lobby.mode_sport', 'Спортивная')}</span>
                      {settings.gameMode === 'sport' && <Check className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />}
                    </div>
                    <div className="text-[10px] text-[var(--skin-text-muted)] mt-0.5 leading-tight">{t('lobby.mode_sport_desc', 'Нулевая минута мафии, 10 мест')}</div>
                  </button>
                </div>
              </div>

              {/* Max Players Limit */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--skin-text-muted)] block">
                  {t('lobby.seats_limit', 'Лимит мест за столом:')}
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[6, 8, 10, 12].map(count => (
                    <button
                      key={count}
                      disabled={!isHost}
                      type="button"
                      onClick={() => handleUpdate('maxPlayers', count)}
                      className={`py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                        settings.maxPlayers === count
                          ? 'skin-btn-primary bg-orange-600 text-white border-orange-500 shadow-xs'
                          : 'bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] text-[var(--skin-text-muted)] hover:text-[var(--skin-text-secondary)]'
                      }`}
                    >
                      {count} {t('lobby.seats_count', 'мест')}
                    </button>
                  ))}
                </div>
              </div>

              {/* First Day Voting Toggle */}
              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-center justify-between gap-2.5">
                <div>
                  <div className="text-xs font-bold text-[var(--skin-text-primary)]">
                    {t('lobby.voting_day_1', 'Голосование в 1-й день')}
                  </div>
                  <div className="text-[10px] text-[var(--skin-text-muted)] leading-tight mt-0.5">
                    {settings.firstDayVoting 
                      ? t('lobby.voting_day_1_on', 'Номинации и голосование доступны в день 1') 
                      : t('lobby.voting_day_1_off', 'В день 1 кандидаты не номинируются, сразу ночь')}
                  </div>
                </div>

                <button
                  disabled={!isHost}
                  type="button"
                  onClick={() => handleUpdate('firstDayVoting', !settings.firstDayVoting)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-colors border shrink-0 ${
                    settings.firstDayVoting
                      ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                      : 'bg-[var(--skin-bg-card)] border-[var(--skin-border-base)] text-[var(--skin-text-muted)]'
                  }`}
                >
                  {settings.firstDayVoting ? t('settings.sound_on', 'ВКЛ') : t('settings.sound_off', 'ВЫКЛ')}
                </button>
              </div>

              {/* Timers */}
              <div className="space-y-2 pt-1.5 border-t border-[var(--skin-border-subtle)]">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--skin-text-muted)] block">
                  {t('lobby.timers_title', 'Таймеры фаз игры:')}
                </label>

                {/* General Discussion Timer: 0 - 120s step 15s */}
                <div className="skin-subcard flex items-center justify-between p-2 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)]">
                  <div>
                    <div className="text-xs font-bold text-[var(--skin-text-primary)]">{t('lobby.timer_general', 'Общее собрание:')}</div>
                    <div className="text-[10px] text-[var(--skin-text-muted)]">{t('lobby.timer_general_desc', 'Общий разговор всех живых')}</div>
                  </div>
                  {isHost ? (
                    <select
                      value={settings.generalDiscussionDuration}
                      onChange={e => handleUpdate('generalDiscussionDuration', parseInt(e.target.value))}
                      className="bg-[var(--skin-input-bg)] border border-[var(--skin-input-border)] px-2.5 py-1 rounded-lg text-xs font-bold text-[var(--skin-text-accent)] focus:outline-none cursor-pointer"
                    >
                      <option value={0} className="bg-zinc-900 text-zinc-400">0{t('header.seconds_short', 'с')} ({t('lobby.disabled', 'Отключено')})</option>
                      <option value={15} className="bg-zinc-900 text-white">15 {t('header.seconds_short', 'с')}</option>
                      <option value={30} className="bg-zinc-900 text-white">30 {t('header.seconds_short', 'с')}</option>
                      <option value={45} className="bg-zinc-900 text-white">45 {t('header.seconds_short', 'с')}</option>
                      <option value={60} className="bg-zinc-900 text-white">60 {t('header.seconds_short', 'с')}</option>
                      <option value={75} className="bg-zinc-900 text-white">75 {t('header.seconds_short', 'с')}</option>
                      <option value={90} className="bg-zinc-900 text-white">90 {t('header.seconds_short', 'с')}</option>
                      <option value={105} className="bg-zinc-900 text-white">105 {t('header.seconds_short', 'с')}</option>
                      <option value={120} className="bg-zinc-900 text-white">120 {t('header.seconds_short', 'с')}</option>
                    </select>
                  ) : (
                    <span className="text-xs font-mono font-bold text-[var(--skin-text-accent)]">
                      {settings.generalDiscussionDuration === 0 ? t('lobby.disabled', 'Отключено') : `${settings.generalDiscussionDuration}${t('header.seconds_short', 'с')}`}
                    </span>
                  )}
                </div>

                {/* Individual Speech Timer: 15, 30, 45, 60s */}
                <div className="skin-subcard flex items-center justify-between p-2 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)]">
                  <div>
                    <div className="text-xs font-bold text-[var(--skin-text-primary)]">{t('lobby.timer_speeches', 'Индивидуальные речи:')}</div>
                    <div className="text-[10px] text-[var(--skin-text-muted)]">{t('lobby.timer_speeches_desc', 'Время на речь каждого игрока')}</div>
                  </div>
                  {isHost ? (
                    <select
                      value={settings.individualSpeechDuration}
                      onChange={e => handleUpdate('individualSpeechDuration', parseInt(e.target.value))}
                      className="bg-[var(--skin-input-bg)] border border-[var(--skin-input-border)] px-2.5 py-1 rounded-lg text-xs font-bold text-[var(--skin-text-accent)] focus:outline-none cursor-pointer"
                    >
                      <option value={15} className="bg-zinc-900 text-white">15 {t('header.seconds_short', 'с')}</option>
                      <option value={30} className="bg-zinc-900 text-white">30 {t('header.seconds_short', 'с')}</option>
                      <option value={45} className="bg-zinc-900 text-white">45 {t('header.seconds_short', 'с')}</option>
                      <option value={60} className="bg-zinc-900 text-white">60 {t('header.seconds_short', 'с')}</option>
                    </select>
                  ) : (
                    <span className="text-xs font-mono font-bold text-[var(--skin-text-accent)]">{settings.individualSpeechDuration}{t('header.seconds_short', 'с')}</span>
                  )}
                </div>

                {/* Night Phase Timer: 15, 30, 45, 60s */}
                <div className="skin-subcard flex items-center justify-between p-2 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)]">
                  <div>
                    <div className="text-xs font-bold text-[var(--skin-text-primary)]">{t('lobby.timer_night', 'Ночная фаза:')}</div>
                    <div className="text-[10px] text-[var(--skin-text-muted)]">{t('lobby.timer_night_desc', 'Действия мафии, шерифа, доктора')}</div>
                  </div>
                  {isHost ? (
                    <select
                      value={settings.nightDurationSeconds}
                      onChange={e => handleUpdate('nightDurationSeconds', parseInt(e.target.value))}
                      className="bg-[var(--skin-input-bg)] border border-[var(--skin-input-border)] px-2.5 py-1 rounded-lg text-xs font-bold text-[var(--skin-text-accent)] focus:outline-none cursor-pointer"
                    >
                      <option value={15} className="bg-zinc-900 text-white">15 {t('header.seconds_short', 'с')}</option>
                      <option value={30} className="bg-zinc-900 text-white">30 {t('header.seconds_short', 'с')}</option>
                      <option value={45} className="bg-zinc-900 text-white">45 {t('header.seconds_short', 'с')}</option>
                      <option value={60} className="bg-zinc-900 text-white">60 {t('header.seconds_short', 'с')}</option>
                    </select>
                  ) : (
                    <span className="text-xs font-mono font-bold text-[var(--skin-text-accent)]">{settings.nightDurationSeconds}{t('header.seconds_short', 'с')}</span>
                  )}
                </div>
              </div>

              {/* Roles Deck Toggles (Classic mode only) */}
              {settings.gameMode === 'classic' && (
                <div className="space-y-1.5 pt-1.5 border-t border-[var(--skin-border-subtle)]">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--skin-text-muted)] block">
                    {t('lobby.roles_in_deck', 'Активные роли в колоде:')}
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
                          className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-colors ${
                            isEnabled
                              ? 'bg-[var(--skin-bg-elevated)] border-[var(--skin-border-strong)] text-[var(--skin-text-primary)]'
                              : 'bg-[var(--skin-bg-slot)] border-[var(--skin-border-subtle)] text-[var(--skin-text-muted)] opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                            <span className="truncate">{label}</span>
                          </div>
                          <span className={`text-[9px] font-bold font-mono ${isEnabled ? 'text-emerald-400' : 'text-[var(--skin-text-muted)]'}`}>
                            {isEnabled ? t('settings.sound_on', 'ВКЛ') : t('settings.sound_off', 'ВЫКЛ')}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Doctor saves from Courtesan joint death toggle (City Mafia only) */}
                  <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-center justify-between gap-2.5 mt-2">
                    <div className="min-w-0 pr-1">
                      <div className="text-xs font-bold text-[var(--skin-text-primary)]">
                        Доктор спасает от совместной гибели с Путаной
                      </div>
                      <div className="text-[10px] text-[var(--skin-text-muted)] leading-tight mt-0.5">
                        {settings.doctorSavesFromCourtesanDeath
                          ? 'ВКЛ: если Путана погибает, но Доктор лечил её гостя, гость выживает'
                          : 'ВЫКЛ (по умолчанию): гость погибает вместе с Путаной, даже если Доктор лечил гостя'}
                      </div>
                    </div>

                    <button
                      disabled={!isHost}
                      type="button"
                      onClick={() => handleUpdate('doctorSavesFromCourtesanDeath', !settings.doctorSavesFromCourtesanDeath)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-colors border shrink-0 ${
                        settings.doctorSavesFromCourtesanDeath
                          ? 'bg-pink-950/80 border-pink-600 text-pink-300'
                          : 'bg-[var(--skin-bg-card)] border-[var(--skin-border-base)] text-[var(--skin-text-muted)]'
                      }`}
                    >
                      {settings.doctorSavesFromCourtesanDeath ? t('settings.sound_on', 'ВКЛ') : t('settings.sound_off', 'ВЫКЛ')}
                    </button>
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>

      </div>

      {/* Slide-over Table Chat & Journal Drawer */}
      {isChatDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-200">
          <div 
            onClick={() => setIsChatDrawerOpen(false)}
            className="absolute inset-0 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs transition-opacity"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 pointer-events-auto">
            <div className="skin-drawer w-screen max-w-md bg-[var(--skin-bg-drawer)] border-l border-[var(--skin-border-base)] shadow-[var(--skin-shadow-modal)] flex flex-col justify-between animate-in slide-in-from-right duration-300">
              
              {/* Drawer Header */}
              <div className="skin-header p-4 sm:p-5 border-b border-[var(--skin-border-header)] bg-[var(--skin-bg-header)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-[var(--skin-radius-btn)] bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-accent)] text-[var(--skin-accent-primary)]">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--skin-text-primary)] tracking-wide uppercase">
                      {t('lobby.chat_and_journal', 'Чат и журнал стола')}
                    </h3>
                    <p className="text-[10px] text-[var(--skin-text-muted)]">
                      {t('lobby.room_code', 'Код стола')}: <span className="font-mono text-[var(--skin-accent-primary)]">{roomState.roomCode}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    sounds.playTick();
                    setIsChatDrawerOpen(false);
                  }}
                  className="p-2 rounded-[var(--skin-radius-btn)] bg-[var(--skin-bg-card)] border border-[var(--skin-border-base)] text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-card-hover)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 min-h-0 flex flex-col p-4 space-y-3 font-sans overflow-hidden">
                {/* Channel Tabs */}
                <div className="flex border border-[var(--skin-border-subtle)] bg-[var(--skin-bg-subcard)] p-1 gap-1 text-xs rounded-[var(--skin-radius-btn)] shrink-0">
                  <button
                    onClick={() => setActiveChannel('all')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-colors ${
                      activeChannel === 'all'
                        ? 'bg-[var(--skin-bg-elevated)] text-[var(--skin-text-primary)] shadow-xs'
                        : 'text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)]'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3 text-[var(--skin-text-muted)]" />
                    <span>{t('lobby.chat_channel_all', 'Общий')}</span>
                  </button>

                  <button
                    onClick={() => setActiveChannel('system')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-colors ${
                      activeChannel === 'system'
                        ? 'bg-[var(--skin-bg-elevated)] text-[var(--skin-text-accent)] shadow-xs'
                        : 'text-[var(--skin-text-muted)] hover:text-[var(--skin-text-accent)]'
                    }`}
                  >
                    <ScrollText className="w-3 h-3" />
                    <span>{t('lobby.chat_channel_system', 'Журнал')}</span>
                  </button>
                </div>

                {/* Live Online Status */}
                {activeChannel !== 'system' && (
                  <div className="px-2.5 py-1.5 bg-[var(--skin-bg-subcard)]/90 border border-[var(--skin-border-subtle)] rounded-[var(--skin-radius-btn)] space-y-1 shrink-0">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-mono text-[var(--skin-text-muted)] flex items-center gap-1.5 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{t('lobby.chat_members', 'Участники стола:')}</span>
                      </span>
                      <span className="font-mono text-[9px] text-[var(--skin-text-muted)]">
                        <span className="text-emerald-400 font-bold">{players.filter(p => p.connected || p.isBot).length}</span> / {players.length} {t('lobby.online', 'онлайн')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                      {players.map(p => {
                        const isOnline = p.connected || p.isBot;
                        const isMe = p.id === myId;
                        return (
                          <div
                            key={p.id}
                            title={`${p.name}: ${p.isBot ? t('lobby.bot', 'ИИ-Бот') : p.connected ? t('lobby.online', 'В сети') : t('lobby.offline', 'Оффлайн')}`}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-medium border shrink-0 transition-colors ${
                              isOnline
                                ? 'bg-[var(--skin-bg-elevated)] border-[var(--skin-border-base)] text-[var(--skin-text-secondary)]'
                                : 'bg-[var(--skin-bg-slot)] border-[var(--skin-border-subtle)] text-[var(--skin-text-muted)] opacity-60'
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
                            {isMe && <span className="text-[9px] text-[var(--skin-text-accent)] font-bold">{t('lobby.you', '(Вы)')}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Messages List */}
                <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2 border border-[var(--skin-border-subtle)] rounded-[var(--skin-radius-card)] bg-[var(--skin-bg-canvas)]/80">
                  {currentMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center text-xs text-[var(--skin-text-muted)] p-4">
                      {activeChannel === 'system'
                        ? t('lobby.journal_empty', 'События комнаты фиксируются в журнале протокола')
                        : t('lobby.chat_empty', 'Приветствуйте других игроков в чате стола!')}
                    </div>
                  ) : (
                    currentMessages.map(msg => {
                      const isMe = msg.senderId === myId;
                      const isSystem = msg.channel === 'system' || msg.senderId === 'system';

                      if (isSystem) {
                        return (
                          <div key={msg.id} className="p-2 rounded-lg bg-[var(--skin-bg-subcard)] border border-amber-900/30 text-[10px] text-amber-200/90 leading-relaxed font-mono">
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
                                <span>👁️</span> {t('lobby.role_spectator', 'Зритель')}
                              </span>
                            )}

                            <span className={`text-[10px] font-bold ${isMe ? 'text-[var(--skin-text-accent)]' : 'text-[var(--skin-text-muted)]'}`}>
                              {msg.senderName}
                            </span>
                            <span className="text-[9px] text-[var(--skin-text-muted)] font-mono">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className={`p-2 rounded-[var(--skin-radius-btn)] max-w-[85%] text-xs leading-relaxed ${
                            isMe
                              ? 'skin-btn-join bg-gradient-to-r from-[#b85820] to-[#8c3d12] text-white shadow-xs'
                              : msg.isSpectator
                              ? 'bg-indigo-950/30 border border-indigo-900/60 text-indigo-100'
                              : 'bg-[var(--skin-bg-card)] border border-[var(--skin-border-base)] text-[var(--skin-text-primary)]'
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
                      className="whitespace-nowrap px-2 py-0.5 rounded-lg bg-[var(--skin-bg-subcard)] hover:bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-base)] text-[10px] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] transition-colors"
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
                      placeholder={t('lobby.chat_input_placeholder', 'Сообщение за столом...')}
                      className="skin-input flex-1 bg-[var(--skin-input-bg)] border border-[var(--skin-input-border)] rounded-[var(--skin-radius-btn)] px-3 py-2 text-xs text-[var(--skin-input-text)] placeholder-[var(--skin-input-placeholder)] focus:outline-none focus:border-[var(--skin-input-focus-border)]"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="skin-btn-primary p-2 rounded-[var(--skin-radius-btn)] bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white transition-colors"
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

      {/* Bottom Sheet Burger Menu (In-Game Variant for Room Waiting Lobby) */}
      <NavigationDrawer
        isOpen={isNavDrawerOpen}
        onClose={() => setIsNavDrawerOpen(false)}
        variant="in_game"
        onSelectTab={handleSelectNavTab}
        isLoggedIn={isLoggedIn}
        user={user}
        onLeaveRoom={onLeaveRoom}
        isHost={isHost}
      />

      {/* Shop Modal */}
      <ShopModal
        isOpen={isShopOpen}
        onClose={() => setIsShopOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
        onOpenAuth={onOpenAuth}
        onOpenInventory={() => onOpenProfile('inventory')}
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

      {/* Promo Code Activation Modal */}
      <PromoCodeModal
        isOpen={isPromoModalOpen}
        onClose={() => setIsPromoModalOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
        onOpenProfilePromocodes={() => onOpenProfile('promocodes')}
      />

      {/* Campaigns & Gifts Modal */}
      <CampaignsModal
        isOpen={isCampaignsOpen}
        onClose={() => setIsCampaignsOpen(false)}
        user={user || null}
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
        user={user}
        onOpenShop={() => setIsShopOpen(true)}
        onUpdateUser={onUpdateUser}
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
