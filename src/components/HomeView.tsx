import React, { useState, useEffect } from 'react';
import { PublicRoomSummary, RoomSettings } from '../types/mafia';
import { GangsterIcon } from './GangsterIcon';
import { CreateRoomModal } from './CreateRoomModal';
import { LobbyChatDrawer } from './LobbyChatDrawer';
import { NavigationDrawer, NavDrawerTab } from './NavigationDrawer';
import { ShopModal } from './ShopModal';
import { PawnshopModal } from './PawnshopModal';
import { DailyBonusModal } from './DailyBonusModal';
import { SettingsModal } from './SettingsModal';
import { DailyStreakWidget } from './DailyStreakWidget';
import { ClansModal } from './ClansModal';
import { EventsModal } from './EventsModal';
import { PWAInstallButton } from './PWAInstallButton';
import { Users, Plus, MessageCircle, Menu, KeyRound, Crown, Flame, Shield, ChevronRight, Eye, Sparkles } from 'lucide-react';
import { sounds } from '../utils/audio';
import noirLobbyBg from '../assets/images/noir_mafia_lobby_bg_1791204529068.jpg';

import { AuthUser } from './AuthModal';

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
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenAdmin?: () => void;
  onLogout: () => void;
}

const MAFIA_JOKES = [
  {
    line1: 'Штирлиц открыл окно.',
    line2: 'Подул ветер.',
    line3: '«Сквозняк», — догадался Штирлиц.'
  },
  {
    line1: 'Дон Корлеоне пришел к доктору.',
    line2: '— Доктор, мне кажется, за мной следят.',
    line3: '— Конечно следят, вы же не заплатили за прошлый визит.'
  },
  {
    line1: 'Шериф на утреннем голосовании:',
    line2: '— Я проверил игрока №3, он мафия!',
    line3: 'Игрок №3: «Я просто нервничаю, потому что доктор не пришел!»'
  }
];

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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLobbyChatOpen, setIsLobbyChatOpen] = useState(false);
  
  // Navigation Drawer & Modals state
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [isPawnshopOpen, setIsPawnshopOpen] = useState(false);
  const [isBonusOpen, setIsBonusOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClansOpen, setIsClansOpen] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [tasksDefaultTab, setTasksDefaultTab] = useState<'global' | 'onboarding' | 'personal' | 'clan'>('global');

  const [showCodeInput, setShowCodeInput] = useState(false);
  const [customCode, setCustomCode] = useState('');

  // Online stats from server
  const [onlineStats, setOnlineStats] = useState<{ inLobby: number; inGame: number }>({
    inLobby: 0,
    inGame: 3
  });

  // Joke timer & rotation
  const [jokeIndex, setJokeIndex] = useState(0);
  const [jokeSecondsRemaining, setJokeSecondsRemaining] = useState(55);

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

  useEffect(() => {
    const timer = setInterval(() => {
      setJokeSecondsRemaining(prev => {
        if (prev <= 1) {
          setJokeIndex(old => (old + 1) % MAFIA_JOKES.length);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentJoke = MAFIA_JOKES[jokeIndex];

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
    { roomCode: '429', roomName: 'Комнату №429', playerCount: 3, maxPlayers: 6, inGame: false, hostName: 'Виктор' },
    { roomCode: '430', roomName: 'Комнату №430', playerCount: 4, maxPlayers: 6, inGame: false, hostName: 'Елена' },
    { roomCode: '431', roomName: 'Комнату №431', playerCount: 2, maxPlayers: 6, inGame: false, hostName: 'Дмитрий' },
    { roomCode: '432', roomName: 'Комнату №432', playerCount: 5, maxPlayers: 6, inGame: false, hostName: 'Михаил' }
  ];

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center p-0 md:p-2 bg-cover bg-center select-none overflow-x-hidden"
      style={{ backgroundImage: `url(${noirLobbyBg})` }}
    >
      {/* Dark moody vignette overlay */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] pointer-events-none" />

      {/* Main Center Card (Standardized Monolithic Frame: 65% width, 98% height on desktop; 100% full screen on mobile) */}
      <div className="relative z-10 w-full md:w-[65vw] h-full min-h-screen md:min-h-0 md:h-[98vh] bg-[#0d0e13]/95 border-0 md:border md:border-zinc-800/90 rounded-none md:rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col backdrop-blur-md">
        
        {/* Top Header inside the Hub */}
        <div className="px-6 py-4 border-b border-zinc-850 flex items-center justify-between bg-[#111218]/90">
          {/* Left Brand: Gangster with Tommy Gun + MAFIA GAME */}
          <div className="flex items-center gap-3">
            <GangsterIcon size={38} className="w-9 h-9 shrink-0 drop-shadow-md" />
            <h1 className="font-sans font-bold tracking-widest text-white text-base sm:text-lg uppercase">
              MAFIA GAME
            </h1>
          </div>

          {/* Right: Player Profile Badge & Menu Button */}
          <div className="relative flex items-center gap-2 sm:gap-3">
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

            {/* Daily Streak Header Indicator Pill */}
            {user && (
              <DailyStreakWidget
                user={user}
                onUpdateUser={onUpdateUser}
                onOpenBonusModal={() => setIsBonusOpen(true)}
                onOpenAuth={onOpenAuth}
                variant="header_pill"
              />
            )}

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
              <span className="hidden sm:inline">Квесты</span>
            </button>

            <button
              onClick={() => {
                if (isLoggedIn) {
                  onOpenProfile();
                } else {
                  onOpenAuth();
                }
              }}
              className="flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-zinc-800/50 transition-colors text-left"
            >
              {/* Circular Gangster Silhouette Avatar */}
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0">
                <GangsterIcon size={28} className="w-7 h-7" />
              </div>
              <div>
                <div className="text-xs font-bold text-white leading-tight flex items-center gap-1.5">
                  <span>{playerName || 'Incognito'}</span>
                  {user && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-950/80 border border-amber-600/60 text-amber-300 font-mono text-[10px] font-bold">
                      Ур. {user.level || 1}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  ID: {numericId}
                </div>
              </div>
            </button>

            {/* Hamburger Menu Button - Opens Slide-over Curtain Drawer */}
            <button
              onClick={() => {
                sounds.playTick();
                setIsNavDrawerOpen(true);
              }}
              title="Меню навигации"
              className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Grid: 2 Columns matching mockup */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0 overflow-y-auto">
          
          {/* Left Column: Room List & Creation (7 of 12 cols) */}
          <div className="md:col-span-7 p-6 sm:p-7 flex flex-col justify-between border-b md:border-b-0 md:border-r border-zinc-850 space-y-4">
            <div className="space-y-3.5">
              
              {/* Top "[ + Создать комнату ]" Button */}
              <button
                onClick={() => {
                  setIsCreateModalOpen(true);
                  sounds.playTick();
                }}
                className="w-full py-3 rounded-xl bg-[#14151b] hover:bg-[#1a1b24] border border-zinc-800/90 text-zinc-200 hover:text-white font-medium text-xs sm:text-sm tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 group"
              >
                <span className="text-amber-500 font-mono font-bold">[</span>
                <span className="font-semibold">+ Создать комнату</span>
                <span className="text-amber-500 font-mono font-bold">]</span>
              </button>

              {/* Rooms Stack (Exact vertical stack from screenshot) */}
              <div className="space-y-2.5 pt-1">
                {displayRooms.map(room => (
                  <div
                    key={room.roomCode}
                    className="p-3.5 sm:p-4 rounded-xl bg-[#13141a] border border-zinc-800/80 flex items-center justify-between gap-3 transition-colors hover:border-zinc-700"
                  >
                    {/* Left: Room Title & Player Count */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white tracking-tight truncate">
                          {room.roomName.startsWith('Комнат') ? room.roomName : `Комнату №${room.roomCode}`}
                        </span>
                        {room.inGame && (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-950/80 border border-rose-800/80 text-rose-300 shrink-0">
                            В игре
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <Users className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span>
                          {room.playerCount}/{room.maxPlayers} игроков
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
                          className="px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-b from-indigo-800 to-indigo-950 hover:from-indigo-700 hover:to-indigo-900 border border-indigo-600/70 text-indigo-100 shadow-indigo-950/50 text-white font-bold text-xs tracking-wide transition-all shadow-md flex items-center gap-1.5"
                          title={room.inGame ? 'Партия в процессе — смотреть как зритель' : 'Комната заполнена — войти зрителем'}
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-300" />
                          <span>{room.inGame ? 'Смотреть' : 'Зритель'}</span>
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              onJoinRoom(room.roomCode, true);
                              sounds.playTick();
                            }}
                            className="px-2.5 sm:px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-indigo-900/60 hover:border-indigo-600/70 text-indigo-300 font-bold text-xs transition-all flex items-center gap-1 shadow-sm"
                            title="Войти как зритель (не занимая слот игрока)"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Зритель</span>
                          </button>

                          <button
                            onClick={() => {
                              onJoinRoom(room.roomCode, false);
                              sounds.playTick();
                            }}
                            className="px-3.5 sm:px-4 py-2 rounded-xl text-white font-bold text-xs tracking-wide transition-all shadow-md border bg-gradient-to-b from-[#b85820] to-[#8c3d12] hover:from-[#c96226] hover:to-[#9e4616] border-amber-900/60 shadow-orange-950/40"
                          >
                            <span>Войти</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick join by custom code at bottom */}
            <div className="pt-2">
              {!showCodeInput ? (
                <button
                  onClick={() => setShowCodeInput(true)}
                  className="text-[11px] text-zinc-400 hover:text-amber-400 transition-colors flex items-center gap-1.5"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>Ввести код комнаты вручную</span>
                </button>
              ) : (
                <form onSubmit={(e) => handleJoinByCode(e, false)} className="flex gap-2 items-center flex-wrap">
                  <input
                    type="text"
                    value={customCode}
                    maxLength={8}
                    onChange={e => setCustomCode(e.target.value.toUpperCase())}
                    placeholder="КОД: НАПР. 429"
                    className="flex-1 min-w-[120px] bg-[#14151b] border border-zinc-800 text-white font-mono font-bold tracking-widest text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-orange-500 uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => handleJoinByCode(undefined, true)}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-indigo-700/70 text-indigo-300 text-xs font-bold transition-colors flex items-center gap-1"
                    title="Войти в качестве зрителя"
                  >
                    <Eye className="w-3 h-3 text-indigo-400" />
                    <span>Зритель</span>
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors"
                  >
                    Войти
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCodeInput(false)}
                    className="text-xs text-zinc-400 hover:text-white px-1"
                  >
                    ✕
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Right Column: SOCIAL HUB / ОНЛАЙН (5 of 12 cols) */}
          <div className="md:col-span-5 p-6 sm:p-7 flex flex-col justify-between bg-[#101117] space-y-6">
            <div className="space-y-5">
              
              {/* Top Header: SOCIAL HUB | ОНЛАЙН */}
              <div className="flex items-center justify-between pb-1">
                <h2 className="font-sans font-bold text-sm tracking-wider uppercase text-white">
                  SOCIAL HUB
                </h2>
                <span className="text-xs font-bold tracking-widest uppercase text-amber-500 font-mono">
                  ОНЛАЙН
                </span>
              </div>

              {/* Status Indicators: 🟢 В лобби: 0 | 🔵 В игре: 3 */}
              <div className="flex items-center gap-6 text-xs font-medium text-zinc-300">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80" />
                  <span>В лобби: <strong className="text-white font-bold">{onlineStats.inLobby}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 shadow-sm shadow-blue-400/80" />
                  <span>В игре: <strong className="text-white font-bold">{onlineStats.inGame}</strong></span>
                </div>
              </div>

              {/* Widget 1: ШУТКА МИНУТЫ */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-500">
                  <span>ШУТКА МИНУТЫ</span>
                  <span className="font-mono text-zinc-400 text-[11px] font-normal">
                    {jokeSecondsRemaining}s
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#14151b] border border-zinc-850 text-xs text-zinc-300 leading-relaxed font-sans space-y-1">
                  <p>{currentJoke.line1}</p>
                  <p>{currentJoke.line2}</p>
                  <p className="pt-0.5">{currentJoke.line3}</p>
                </div>
              </div>

              {/* Widget 2: СИНДИКАТЫ И КЛАНЫ */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-500">
                  <span>СИНДИКАТЫ И КЛАНЫ</span>
                  {user?.clanTag && (
                    <span className="font-mono text-[10px] text-amber-300 font-bold px-1.5 py-0.5 bg-amber-950/80 border border-amber-600/70 rounded">
                      [{user.clanTag}]
                    </span>
                  )}
                </div>

                <div 
                  onClick={() => {
                    setIsClansOpen(true);
                    sounds.playTick();
                  }}
                  className="p-3 rounded-xl bg-[#14151b] hover:bg-[#1b1c25] border border-zinc-850 hover:border-amber-600/50 text-xs text-zinc-300 transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl shrink-0">🛡️</span>
                    <div className="truncate">
                      <div className="font-bold text-white group-hover:text-amber-400 transition-colors truncate">
                        {user?.clanName ? user.clanName : 'Создать или вступить'}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono truncate">
                        {user?.clanName ? `Роль: ${user.clanRole === 'leader' ? 'Лидер' : 'Участник'}` : 'Клановые войны и рейтинг'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition-colors shrink-0 ml-1" />
                </div>
              </div>

              {/* Widget 3: ИВЕНТЫ / КВЕСТЫ */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-500">
                  ИВЕНТЫ / КВЕСТЫ
                </div>

                <div className="p-3 rounded-xl bg-[#14151b] border border-zinc-850 text-xs text-zinc-400 font-sans">
                  Активных ивентов сейчас нет — скоро появятся 📆
                </div>
              </div>

            </div>

            {/* Bottom Action: "💬 Общий чат" Pill Button (exact replica) */}
            <div className="pt-2 flex justify-center">
              <button
                onClick={() => {
                  setIsLobbyChatOpen(true);
                  sounds.playTick();
                }}
                className="w-full max-w-[200px] py-2 px-5 rounded-full bg-[#1b1c24] hover:bg-[#232430] border border-zinc-750 text-zinc-200 hover:text-white font-medium text-xs tracking-wide transition-all flex items-center justify-center gap-2 shadow-md shadow-black/50"
              >
                <MessageCircle className="w-3.5 h-3.5 text-zinc-300" />
                <span className="font-semibold text-zinc-100">Общий чат</span>
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* Slide-over Curtain Drawer for Hamburger Menu (Exact layout from user screenshot) */}
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
