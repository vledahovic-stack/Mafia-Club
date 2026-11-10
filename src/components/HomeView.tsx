import React, { useState, useEffect } from 'react';
import { PublicRoomSummary, RoleId, RoomSettings } from '../types/mafia';
import { GangsterIcon } from './GangsterIcon';
import { CreateRoomModal } from './CreateRoomModal';
import { LobbyChatDrawer } from './LobbyChatDrawer';
import { NavigationDrawer, NavDrawerTab } from './NavigationDrawer';
import { ShopModal } from './ShopModal';
import { PawnshopModal } from './PawnshopModal';
import { DailyBonusModal } from './DailyBonusModal';
import { SettingsModal } from './SettingsModal';
import { ClansModal } from './ClansModal';
import { EventsModal } from './EventsModal';
import { FeedbackModal } from './FeedbackModal';
import { PromoCodeModal } from './PromoCodeModal';
import { CampaignsModal } from './CampaignsModal';
import { ROLE_DEFINITIONS } from '../data/roles';
import {
  Users,
  MessageCircle,
  Menu,
  KeyRound,
  Crown,
  Flame,
  Shield,
  Eye,
  Sparkles,
  Settings,
  BookOpen,
  Skull,
  HeartPulse
} from 'lucide-react';
import { sounds } from '../utils/audio';
import noirLobbyBg from '../assets/images/noir_mafia_lobby_bg_1791204529068.jpg';

import { AuthUser } from './AuthModal';
import { useLanguage } from '../context/LanguageContext';
import { useSkin } from '../context/SkinContext';

interface HomeViewProps {
  playerName: string;
  playerId: string;
  isLoggedIn: boolean;
  soundEnabled: boolean;
  user?: AuthUser | null;
  onUpdateUser?: (u: AuthUser) => void;
  onToggleSound: () => void;
  onUpdatePlayerName: (name: string) => void;
  onCreateRoom: (roomName: string, settings?: Partial<RoomSettings>) => void;
  onJoinRoom: (roomCode: string, asSpectator?: boolean) => void;
  publicRooms: PublicRoomSummary[];
  onRefreshRooms: () => void;
  onOpenRules: () => void;
  onOpenProfile: (initialTab?: 'inventory' | 'promocodes') => void;
  onOpenAuth: () => void;
  onOpenAdmin?: () => void;
  onLogout: () => void;
}

const GUIDE_ROLE_ORDER: readonly RoleId[] = [
  'civilian',
  'mafia',
  'don',
  'sheriff',
  'doctor',
  'courtesan',
  'maniac',
  'bodyguard'
] as const;

export const HomeView: React.FC<HomeViewProps> = ({
  playerName,
  playerId,
  isLoggedIn,
  soundEnabled,
  user,
  onUpdateUser,
  onToggleSound,
  onUpdatePlayerName,
  onCreateRoom,
  onJoinRoom,
  publicRooms,
  onRefreshRooms,
  onOpenRules,
  onOpenProfile,
  onOpenAuth,
  onOpenAdmin,
  onLogout
}) => {
  const { language, t } = useLanguage();
  const { activeSkin } = useSkin();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLobbyChatOpen, setIsLobbyChatOpen] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || !user) {
      setIsCreateModalOpen(false);
    }
  }, [isLoggedIn, user]);
  
  // Navigation Drawer & Modals state
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
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

  const [showCodeInput, setShowCodeInput] = useState(false);
  const [customCode, setCustomCode] = useState('');

  // Mobile view tab state: 'left' (Game Rooms) or 'right' (About Game)
  const [mobileTab, setMobileTab] = useState<'left' | 'right'>('left');

  // Online stats from server
  const [onlineStats, setOnlineStats] = useState<{ inLobby: number; inGame: number }>({
    inLobby: 0,
    inGame: 3
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/lobby/stats');
        if (res.ok) {
          const data = await res.json();
          setOnlineStats(data);
        }
      } catch {
        // Fallback
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Derive stable 6-digit numeric ID matching screenshot (e.g. "ID: 232134")
  const numericId = React.useMemo(() => {
    let hash = 0;
    for (let i = 0; i < playerId.length; i++) {
      hash = (hash * 37 + playerId.charCodeAt(i)) % 900000;
    }
    return Math.abs(hash) + 100000;
  }, [playerId]);

  const handleJoinByCode = (e?: React.FormEvent, asSpectator = false) => {
    if (e) e.preventDefault();
    if (!customCode.trim()) return;
    onJoinRoom(customCode.trim().toUpperCase(), asSpectator);
    sounds.playTick();
  };

  const handleSelectNavTab = (tab: NavDrawerTab) => {
    setIsNavDrawerOpen(false);
    switch (tab) {
      case 'lobby':
        // Already in lobby
        break;
      case 'profile':
        if (isLoggedIn) {
          onOpenProfile();
        } else {
          onOpenAuth();
        }
        break;
      case 'promocode':
        if (isLoggedIn) {
          setIsPromoModalOpen(true);
        } else {
          onOpenAuth();
        }
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
      case 'install_pwa':
        // Handled inside NavigationDrawer with native prompt or PWAInstallModal
        break;
      case 'admin':
        if (onOpenAdmin) {
          onOpenAdmin();
        }
        break;
      case 'logout':
        if (isLoggedIn) {
          onLogout();
        } else {
          onOpenAuth();
        }
        break;
    }
  };

  // Default rooms if list is still loading
  const displayRooms = publicRooms.length > 0 ? publicRooms : [
    { roomCode: '429', roomName: `${t('home.room_prefix', 'Комната №')}429`, playerCount: 3, maxPlayers: 6, inGame: false, hostName: 'Виктор' },
    { roomCode: '430', roomName: `${t('home.room_prefix', 'Комната №')}430`, playerCount: 4, maxPlayers: 6, inGame: false, hostName: 'Елена' },
    { roomCode: '431', roomName: `${t('home.room_prefix', 'Комната №')}431`, playerCount: 2, maxPlayers: 6, inGame: false, hostName: 'Дмитрий' },
    { roomCode: '432', roomName: `${t('home.room_prefix', 'Комната №')}432`, playerCount: 5, maxPlayers: 6, inGame: false, hostName: 'Михаил' }
  ];

  const renderRoleIcon = (roleId: RoleId) => {
    switch (roleId) {
      case 'don':
        return <Crown className="w-4 h-4" />;
      case 'mafia':
        return <Skull className="w-4 h-4" />;
      case 'sheriff':
        return <Shield className="w-4 h-4" />;
      case 'doctor':
        return <HeartPulse className="w-4 h-4" />;
      case 'courtesan':
        return <Sparkles className="w-4 h-4" />;
      case 'maniac':
        return <Flame className="w-4 h-4" />;
      case 'bodyguard':
        return <Shield className="w-4 h-4" />;
      case 'civilian':
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  return (
    <div
      className="relative h-[100dvh] max-h-[100dvh] md:min-h-screen md:h-auto w-full flex items-center justify-center p-0 md:p-2 bg-cover bg-center select-none overflow-hidden"
      style={{ backgroundImage: `var(--skin-img-lobby, url(${noirLobbyBg}))` }}
    >
      {/* Dark moody vignette overlay */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] pointer-events-none" />

      {/* Main Center Card (Standardized Monolithic Frame: 65% width, 98% height on desktop; 100% full screen on mobile) */}
      <div className="skin-console-frame relative z-10 w-full md:w-[65vw] h-full max-h-full min-h-0 md:min-h-0 md:h-[98vh] bg-[var(--skin-bg-overlay)] border-0 md:border md:border-[var(--skin-border-base)] rounded-none md:rounded-[var(--skin-radius-modal)] shadow-[var(--skin-shadow-modal)] overflow-hidden flex flex-col backdrop-blur-md">
        
        {/* Top Header inside the Hub */}
        <div className="skin-header px-2.5 sm:px-5 py-2 sm:py-2.5 border-b border-[var(--skin-border-header)] flex items-center justify-between gap-1.5 sm:gap-3 bg-[var(--skin-bg-header)] shrink-0">
          {/* Left Side: Player Profile Badge */}
          <div className="flex items-center shrink-0 min-w-0">
            <button
              onClick={() => {
                if (isLoggedIn) {
                  onOpenProfile();
                } else {
                  onOpenAuth();
                }
              }}
              className="cyber-profile-badge flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-2 py-1 rounded-xl hover:bg-[var(--skin-bg-elevated)]/60 transition-all text-left cursor-pointer max-w-[130px] sm:max-w-none"
            >
              {/* Circular Gangster Silhouette Avatar / Cyber Avatar */}
              <div className="cyber-avatar-ring w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-strong)] flex items-center justify-center overflow-hidden shrink-0">
                <GangsterIcon size={24} className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] sm:text-xs font-bold text-[var(--skin-text-primary)] leading-tight flex items-center gap-1 truncate">
                  <span className="truncate">{playerName || t('home.incognito', 'Горожанин')}</span>
                  {user && (
                    <span className="cyber-level-badge px-1 sm:px-1.5 py-0.2 rounded-full bg-amber-950/80 border border-amber-600/60 text-[var(--skin-text-accent)] font-mono text-[9px] sm:text-[10px] font-bold shrink-0">
                      {t('home.level_short', 'Ур.')} {user.level || 1}
                    </span>
                  )}
                </div>
                <div className="text-[9px] sm:text-[10px] text-[var(--skin-text-muted)] font-mono truncate">
                  ID: {numericId}
                </div>
              </div>
            </button>
          </div>

          {/* Center: Permanent Semantic H1 */}
          <h1
            className="min-w-0 flex-1 px-1 text-center font-sans font-black tracking-wider uppercase leading-tight text-[var(--skin-text-primary)] truncate"
            style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}
          >
            <span className="text-[11px] sm:text-xs md:text-sm">
              {t('home.seo_h1_brand', 'Mafia Club')}
            </span>
            <span className="text-[var(--skin-text-muted)] mx-1 hidden sm:inline">—</span>
            <span className="block sm:inline text-[9px] sm:text-xs md:text-sm font-mono font-bold text-[var(--skin-text-accent)] tracking-widest truncate">
              {t('home.seo_h1_sub', 'мафия онлайн')}
            </span>
          </h1>

          {/* Right Side: Quick Action Buttons & Menu Button */}
          <div className="relative flex items-center gap-1 sm:gap-2 shrink-0 justify-end">
            {/* Admin Panel Quick Button */}
            {user && (user.isAdmin === true || user.role === 'admin' || user.email.toLowerCase() === 'vledahovic@gmail.com') && onOpenAdmin && (
              <button
                onClick={() => {
                  sounds.playTick();
                  onOpenAdmin();
                }}
                title={t('header.admin', 'Панель Администратора')}
                className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-950/80 to-orange-950/80 border border-amber-600/70 text-amber-300 hover:text-white hover:border-amber-500 text-xs font-bold transition-all shadow-sm shadow-amber-950/40 cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400 cyber-icon-cyan" />
                <span className="hidden lg:inline">{t('header.admin', 'Админ-панель')}</span>
              </button>
            )}

            {/* Quick Settings & Language Button */}
            <button
              onClick={() => {
                sounds.playTick();
                setIsSettingsOpen(true);
              }}
              title={t('settings.title', 'Настройки')}
              className="p-1.5 rounded-xl text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)]/80 transition-colors cursor-pointer"
            >
              <Settings className="w-5 h-5 cyber-icon-cyan" />
            </button>

            {/* Hamburger Menu Button - Opens Slide-over Curtain Drawer */}
            <button
              onClick={() => {
                sounds.playTick();
                setIsNavDrawerOpen(true);
              }}
              title={t('nav.menu', 'Меню')}
              className="p-1.5 rounded-xl text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)]/80 transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5 cyber-icon-cyan" />
            </button>
          </div>
        </div>

        {/* Mobile View Tab Switcher (Visible only on mobile md:hidden, replaces swipe navigation) */}
        <div
          role="tablist"
          aria-label={t('home.seo_h1', 'Mafia Club — мафия онлайн')}
          className="flex md:hidden border-b border-[var(--skin-border-subtle)] bg-[var(--skin-bg-header)] px-2.5 py-1.5 gap-1.5 shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'left'}
            data-home-tab="rooms"
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
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('home.tab_rooms', 'Игровые комнаты')}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'right'}
            data-home-tab="about"
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
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('home.tab_about', 'Об игре')}</span>
          </button>
        </div>

        {/* Content Grid: 2 Independent Scrollable Columns */}
        <div className="grid grid-cols-1 grid-rows-[minmax(0,1fr)] md:grid-cols-12 flex-1 min-h-0 h-full overflow-hidden">
          
          {/* Left Column: Room List, Online Counters & Global Chat (7 of 12 cols) */}
          <div className={`md:col-span-7 p-3 sm:p-4 md:p-5 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[var(--skin-border-subtle)] bg-[var(--skin-bg-surface)] space-y-2.5 flex-1 min-h-0 h-full overflow-hidden ${
            mobileTab === 'left' ? 'flex' : 'hidden md:flex'
          }`}>
            {/* Top Fixed Controls: Create Room + Single Horizontal Online Counters Row */}
            <div className="space-y-2.5 shrink-0">
              {/* Top "[ + Создать комнату ]" Button */}
              <button
                onClick={() => {
                  sounds.playTick();
                  if (!isLoggedIn || !user) {
                    onCreateRoom('');
                    return;
                  }
                  setIsCreateModalOpen(true);
                }}
                className="cyber-create-room-btn skin-subcard w-full py-2 sm:py-2.5 rounded-[var(--skin-radius-btn)] bg-[var(--skin-bg-subcard)] hover:bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-base)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] font-medium text-xs sm:text-sm tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 group cursor-pointer"
              >
                {activeSkin === 'cyberpunk_neon' ? (
                  <span className="font-bold tracking-wider text-xs sm:text-sm flex items-center justify-center">
                    <span className="bracket font-mono mr-1">[</span>
                    <span>+ Створити room</span>
                    <span className="bracket font-mono ml-1">]</span>
                  </span>
                ) : (
                  <>
                    <span className="text-[var(--skin-accent-primary)] font-mono font-bold">[</span>
                    <span className="font-semibold">{t('home.create_room_btn', '+ Создать комнату')}</span>
                    <span className="text-[var(--skin-accent-primary)] font-mono font-bold">]</span>
                  </>
                )}
              </button>

              {/* Online Counters Row: Single horizontal line directly below Create Room button */}
              <div
                data-testid="home-online-counters"
                className="skin-subcard px-3 py-1.5 rounded-xl bg-[var(--skin-bg-subcard)]/80 border border-[var(--skin-border-subtle)] flex flex-row items-center justify-center sm:justify-between gap-4 sm:gap-6 text-[11px] sm:text-xs font-medium text-[var(--skin-text-secondary)] flex-nowrap overflow-hidden"
              >
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80 shrink-0" />
                  <span>
                    {t('home.in_lobby', 'В лобби:')}{' '}
                    <strong className="text-[var(--skin-text-primary)] font-bold font-mono">{onlineStats.inLobby}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-blue-400 shadow-sm shadow-blue-400/80 shrink-0" />
                  <span>
                    {t('home.in_game_stat', 'В игре:')}{' '}
                    <strong className="text-[var(--skin-text-primary)] font-bold font-mono">{onlineStats.inGame}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Scrollable Rooms Stack */}
            <div className="space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y pr-0.5">
              {displayRooms.map(room => (
                <div
                  key={room.roomCode}
                  className="cyber-room-card skin-card p-2.5 sm:p-3 rounded-[var(--skin-radius-card)] bg-[var(--skin-bg-card)] border border-[var(--skin-border-card)] flex items-center justify-between gap-2.5 transition-colors hover:border-[var(--skin-border-strong)]"
                >
                  {/* Left: Room Title & Player Count */}
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="cyber-room-title text-sm font-bold text-[var(--skin-text-primary)] tracking-tight truncate">
                        {(() => {
                          if (/^(комнат[а-я]*|кімнат[а-я]*|room)\s*(№|#)?\s*\d+/i.test(room.roomName)) {
                            const match = room.roomName.match(/\d+/);
                            const num = match ? match[0] : room.roomCode;
                            return `${t('home.room_prefix', 'Комната №')}${num}`;
                          }
                          return room.roomName;
                        })()}
                      </span>
                      {room.inGame && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-950/80 border border-rose-800/80 text-rose-300 shrink-0">
                          {t('home.in_game', 'В игре')}
                        </span>
                      )}
                    </div>
                    <div className="cyber-room-players flex items-center gap-1.5 text-xs text-[var(--skin-text-muted)]">
                      <Users className="w-3.5 h-3.5 text-[var(--skin-text-muted)] shrink-0" />
                      <span>
                        {room.playerCount}/{room.maxPlayers} {t('home.players_count', 'игроков')}
                      </span>
                    </div>
                  </div>

                  {/* Right: Join or Spectate Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {room.inGame || room.playerCount >= room.maxPlayers ? (
                      <button
                        onClick={() => {
                          onJoinRoom(room.roomCode, true);
                          sounds.playTick();
                        }}
                        className="cyber-room-spectate-btn px-3 sm:px-3.5 py-1.5 rounded-xl bg-gradient-to-b from-indigo-800 to-indigo-950 hover:from-indigo-700 hover:to-indigo-900 border border-indigo-600/70 text-indigo-100 shadow-indigo-950/50 text-white font-bold text-xs tracking-wide transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                        title={room.inGame ? t('home.spectator_full_tooltip', 'Партия в процессе — смотреть как зритель') : t('home.spectator_full_tooltip', 'Комната заполнена — войти зрителем')}
                      >
                        <Eye className="w-3.5 h-3.5 text-indigo-300" />
                        <span>{room.inGame ? t('home.watch', 'Смотреть') : t('home.spectator', 'Зритель')}</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            onJoinRoom(room.roomCode, true);
                            sounds.playTick();
                          }}
                          className="cyber-room-spectate-btn px-2.5 sm:px-3 py-1.5 rounded-xl bg-[var(--skin-bg-subcard)] hover:bg-[var(--skin-bg-elevated)] border border-indigo-900/60 hover:border-indigo-600/70 text-indigo-300 font-bold text-xs transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                          title={t('home.spectator_free_tooltip', 'Войти как зритель (не занимая слот игрока)')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{t('home.spectator', 'Зритель')}</span>
                        </button>

                        <button
                          onClick={() => {
                            onJoinRoom(room.roomCode, false);
                            sounds.playTick();
                          }}
                          className="cyber-room-join-btn skin-btn-join px-3.5 sm:px-4 py-1.5 rounded-xl text-white font-bold text-xs tracking-wide transition-all shadow-md border cursor-pointer"
                        >
                          <span>{t('home.join', 'Войти')}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Panel: Manual Room Code Input & Global Chat Button */}
            <div className="pt-2 border-t border-[var(--skin-border-subtle)] shrink-0 space-y-2">
              {showCodeInput && (
                <form onSubmit={(e) => handleJoinByCode(e, false)} className="flex gap-1.5 sm:gap-2 items-center flex-wrap">
                  <input
                    type="text"
                    value={customCode}
                    maxLength={8}
                    onChange={e => setCustomCode(e.target.value.toUpperCase())}
                    placeholder={t('home.code_placeholder', 'КОД: НАПР. 429')}
                    className="skin-input flex-1 min-w-[110px] bg-[var(--skin-input-bg)] border border-[var(--skin-input-border)] text-[var(--skin-input-text)] font-mono font-bold tracking-widest text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-[var(--skin-input-border-focus)] uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => handleJoinByCode(undefined, true)}
                    className="px-2.5 py-1.5 rounded-xl bg-[var(--skin-bg-subcard)] hover:bg-[var(--skin-bg-elevated)] border border-indigo-700/70 text-indigo-300 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                    title={t('home.spectator_free_tooltip', 'Войти в качестве зрителя')}
                  >
                    <Eye className="w-3 h-3 text-indigo-400" />
                    <span>{t('home.spectator', 'Зритель')}</span>
                  </button>
                  <button
                    type="submit"
                    className="skin-btn-primary px-3 py-1.5 rounded-xl border text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    {t('home.join', 'Войти')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCodeInput(false)}
                    className="text-xs text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] px-1.5 py-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </form>
              )}

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowCodeInput(prev => !prev)}
                  className="cyber-manual-code-btn text-[11px] sm:text-xs text-[var(--skin-text-muted)] hover:text-[var(--skin-text-accent)] transition-colors flex items-center gap-1.5 cursor-pointer min-w-0"
                >
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {activeSkin === 'cyberpunk_neon'
                      ? (language === 'uk' ? 'Ввести код кімнати вручну' : 'Ввести код комнаты вручную')
                      : t('home.enter_code_manually', 'Ввести код комнаты вручную')}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="home-global-chat-btn"
                  onClick={() => {
                    setIsLobbyChatOpen(true);
                    sounds.playTick();
                  }}
                  className="skin-btn-secondary py-1.5 px-3.5 sm:px-4 rounded-full bg-[var(--skin-btn-secondary-bg)] hover:bg-[var(--skin-btn-secondary-bg-hover)] border border-[var(--skin-border-strong)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] font-medium text-xs tracking-wide transition-all flex items-center justify-center gap-1.5 shadow-md shadow-black/50 cursor-pointer shrink-0"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-[var(--skin-text-secondary)] shrink-0" />
                  <span className="font-semibold text-[var(--skin-text-primary)] whitespace-nowrap">
                    {t('home.global_chat', 'Общий чат')}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: ABOUT MAFIA CLUB Reference Guide (5 of 12 cols) */}
          <section
            aria-labelledby="about-mafia-club-heading"
            data-testid="home-about-section"
            className={`md:col-span-5 p-3 sm:p-4 md:p-5 flex flex-col bg-[var(--skin-bg-drawer)] space-y-3 flex-1 min-h-0 h-full overflow-hidden ${
              mobileTab === 'right' ? 'flex' : 'hidden md:flex'
            }`}
          >
            {/* Top Header: О Mafia Club */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--skin-border-subtle)] shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-4 h-4 text-[var(--skin-accent-primary)] shrink-0" />
                <h2
                  id="about-mafia-club-heading"
                  className="font-sans font-bold text-xs sm:text-sm tracking-wider uppercase text-[var(--skin-text-primary)] truncate"
                  style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}
                >
                  {t('home.about.header_title', 'О Mafia Club')}
                </h2>
              </div>
              <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--skin-text-accent)] font-mono shrink-0">
                {t('home.about.header_badge', 'СПРАВОЧНИК КЛУБА')}
              </span>
            </div>

            {/* Independently Scrollable Reference Body */}
            <div
              data-testid="home-about-scroll"
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y pr-1.5 space-y-3.5 font-sans text-xs text-[var(--skin-text-secondary)] leading-relaxed"
            >
              {/* 1. Что такое Mafia Club */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                  {t('home.about.s1_title', '1. Что такое Mafia Club')}
                </h3>
                <p>{t('home.about.s1_p1', '')}</p>
                <p>{t('home.about.s1_p2', '')}</p>
              </article>

              {/* 2. Как начать играть бесплатно в браузере */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                  {t('home.about.s2_title', '2. Как начать играть бесплатно в браузере')}
                </h3>
                <p>{t('home.about.s2_p1', '')}</p>
                <p>{t('home.about.s2_p2', '')}</p>
              </article>

              {/* 3. Как создать комнату и пригласить друзей */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                  {t('home.about.s3_title', '3. Как создать комнату и пригласить друзей')}
                </h3>
                <p>{t('home.about.s3_p1', '')}</p>
                <p>{t('home.about.s3_p2', '')}</p>
              </article>

              {/* 4. Как присоединиться к игре и использовать код комнаты */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                  {t('home.about.s4_title', '4. Как присоединиться к игре и использовать код комнаты')}
                </h3>
                <p>{t('home.about.s4_p1', '')}</p>
                <p>{t('home.about.s4_p2', '')}</p>
              </article>

              {/* 5. Правила городской мафии */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                  {t('home.about.s5_title', '5. Правила городской мафии')}
                </h3>
                <p>{t('home.about.s5_p1', '')}</p>
                <p>{t('home.about.s5_p2', '')}</p>
              </article>

              {/* 6. Спортивная мафия — В разработке */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                    {t('home.about.s6_title', '6. Спортивная мафия')}
                  </h3>
                  <span
                    data-testid="sport-mafia-dev-badge"
                    className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-600/70 text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider shrink-0"
                  >
                    {t('home.about.in_dev_badge', 'В разработке')}
                  </span>
                </div>
                <p>{t('home.about.s6_p1', '')}</p>
                <p>{t('home.about.s6_p2', '')}</p>
              </article>

              {/* 7. Все доступные игровые роли и их способности */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                  {t('home.about.s7_title', '7. Все доступные игровые роли и их способности')}
                </h3>

                <div className="space-y-2">
                  {GUIDE_ROLE_ORDER.map(roleId => {
                    const roleDef = ROLE_DEFINITIONS[roleId];
                    const teamLabel =
                      roleDef.team === 'mafia'
                        ? t('home.about.team_mafia', 'Синдикат мафии')
                        : roleDef.team === 'maniac'
                          ? t('home.about.team_maniac', 'Нейтральный одиночка')
                          : t('home.about.team_civilians', 'Мирный город');

                    return (
                      <div
                        key={roleId}
                        data-role-card={roleId}
                        className="p-2.5 rounded-lg bg-[var(--skin-bg-card)] border border-[var(--skin-border-base)] flex items-start gap-2.5"
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border mt-0.5"
                          style={{
                            backgroundColor: `${roleDef.color}18`,
                            borderColor: `${roleDef.color}45`,
                            color: roleDef.color
                          }}
                        >
                          {renderRoleIcon(roleId)}
                        </div>
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                            <span
                              className="font-bold text-xs"
                              style={{ color: roleDef.color }}
                            >
                              {t(`home.about.role_${roleId}_name`, roleDef.name)}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--skin-text-muted)]">
                              {teamLabel}
                            </span>
                          </div>
                          <p className="text-[11px] sm:text-xs text-[var(--skin-text-secondary)] leading-relaxed">
                            {t(`home.about.role_${roleId}_desc`, roleDef.description)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>

              {/* 8. Условия включения дополнительных ролей */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                  {t('home.about.s8_title', '8. Условия включения дополнительных ролей')}
                </h3>
                <p>{t('home.about.s8_p1', '')}</p>
                <p>{t('home.about.s8_p2', '')}</p>
              </article>

              {/* 9. Порядок игры */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                  {t('home.about.s9_title', '9. Порядок игры: раздача ролей, день, обсуждения, голосование, ночь, действия персонажей')}
                </h3>
                <p>{t('home.about.s9_p1', '')}</p>
                <p>{t('home.about.s9_p2', '')}</p>
              </article>

              {/* 10. Условия победы */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                  {t('home.about.s10_title', '10. Условия победы')}
                </h3>
                <p>{t('home.about.s10_p1', '')}</p>
                <p className="whitespace-pre-line">{t('home.about.s10_p2', '')}</p>
              </article>

              {/* 11. Голосовая и видеосвязь */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                  {t('home.about.s11_title', '11. Голосовая и видеосвязь')}
                </h3>
                <p>{t('home.about.s11_p1', '')}</p>
                <p>{t('home.about.s11_p2', '')}</p>
              </article>

              {/* 12. Дополнительные возможности Mafia Club */}
              <article className="skin-subcard p-3 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-subtle)] space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-accent)]">
                  {t('home.about.s12_title', '12. Дополнительные возможности Mafia Club')}
                </h3>
                <p>{t('home.about.s12_p1', '')}</p>
                <p>{t('home.about.s12_p2', '')}</p>
              </article>
            </div>
          </section>

        </div>

      </div>

      {/* Bottom Sheet Burger Menu (Out-of-Game Variant) */}
      <NavigationDrawer
        isOpen={isNavDrawerOpen}
        onClose={() => setIsNavDrawerOpen(false)}
        variant="out_of_game"
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

      {/* Create Room Modal */}
      <CreateRoomModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={(roomName) => {
          onCreateRoom(roomName);
        }}
      />

      {/* Global Lobby Chat Drawer */}
      <LobbyChatDrawer
        isOpen={isLobbyChatOpen}
        onClose={() => setIsLobbyChatOpen(false)}
        myId={playerId}
        myName={playerName}
      />

    </div>
  );
};
