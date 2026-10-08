import React, { useState } from 'react';
import { 
  X, 
  Gamepad2, 
  User, 
  ShoppingCart, 
  Scale, 
  Gift, 
  Settings, 
  LogOut,
  SlidersHorizontal,
  ChevronLeft,
  Crown,
  Lock,
  Shield,
  HeartPulse,
  Sparkles,
  Flame,
  Check
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { RoomSettings } from '../types/mafia';
import { AuthUser } from './AuthModal';

export type NavDrawerTab = 'lobby' | 'profile' | 'tasks' | 'clans' | 'shop' | 'pawnshop' | 'bonus' | 'settings' | 'table_settings' | 'admin' | 'logout';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: NavDrawerTab;
  onSelectTab: (tab: NavDrawerTab) => void;
  isLoggedIn: boolean;
  user?: AuthUser | null;
  roomSettings?: RoomSettings;
  onUpdateSettings?: (settings: Partial<RoomSettings>) => void;
  isHost?: boolean;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  activeTab = 'lobby',
  onSelectTab,
  isLoggedIn,
  user,
  roomSettings,
  onUpdateSettings,
  isHost = false
}) => {
  const [view, setView] = useState<'menu' | 'table_settings'>('menu');

  if (!isOpen) return null;

  const isSuperAdmin = user && (user.email.toLowerCase() === 'vledahovic@gmail.com' || user.isAdmin === true);

  const handleItemClick = (tab: NavDrawerTab) => {
    sounds.playTick();
    if (tab === 'table_settings') {
      setView('table_settings');
      return;
    }
    onSelectTab(tab);
  };

  const navItems = [
    {
      id: 'lobby' as NavDrawerTab,
      title: 'Лобби',
      subtitle: 'Активные столы и создание комнаты',
      icon: Gamepad2,
      active: activeTab === 'lobby'
    },
    ...(isSuperAdmin ? [{
      id: 'admin' as NavDrawerTab,
      title: 'Панель Администратора',
      subtitle: 'Управление сервером, игроками и экономикой',
      icon: Crown,
      iconColor: 'text-amber-400',
      active: activeTab === 'admin'
    }] : []),
    ...(roomSettings ? [{
      id: 'table_settings' as NavDrawerTab,
      title: 'Настройки стола',
      subtitle: isHost ? 'Режим, слоты, роли и таймеры' : 'Параметры текущей партии',
      icon: SlidersHorizontal,
      iconColor: 'text-amber-400',
      active: false
    }] : []),
    {
      id: 'profile' as NavDrawerTab,
      title: 'Личный кабинет',
      subtitle: 'Статистика, аватар и инвентарь',
      icon: User,
      active: activeTab === 'profile'
    },
    {
      id: 'tasks' as NavDrawerTab,
      title: 'Ивенты и Задачи',
      subtitle: '4 типа квестов, награды и этапы синдиката',
      icon: Sparkles,
      iconColor: 'text-amber-400',
      badge: 'КВЕСТЫ',
      badgeColor: 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white font-black shadow-xs',
      active: activeTab === 'tasks'
    },
    {
      id: 'clans' as NavDrawerTab,
      title: 'Синдикаты и Кланы',
      subtitle: user?.clanName ? `Ваш клан: [${user.clanTag}] ${user.clanName}` : 'Объединения игроков, рейтинг и клановые теги',
      icon: Shield,
      iconColor: user?.clanId ? 'text-amber-400' : undefined,
      badge: user?.clanTag ? `[${user.clanTag}]` : undefined,
      badgeColor: 'bg-amber-950/80 border-amber-600/70 text-amber-300 font-bold',
      active: activeTab === 'clans'
    },
    {
      id: 'shop' as NavDrawerTab,
      title: 'Магазин',
      subtitle: 'Сундуки, монеты и сертификаты',
      icon: ShoppingCart,
      active: activeTab === 'shop'
    },
    {
      id: 'pawnshop' as NavDrawerTab,
      title: 'Ломбард',
      subtitle: 'Скупка предметов за монеты',
      icon: Scale,
      active: activeTab === 'pawnshop'
    },
    {
      id: 'bonus' as NavDrawerTab,
      title: 'Ежедневный бонус',
      subtitle: user 
        ? (user.lastDailyBonusClaim && new Date(user.lastDailyBonusClaim).toDateString() === new Date().toDateString()
          ? `Серия активна: ${user.dailyBonusStreak || 1} дн. (сегодня собран)` 
          : `Доступна награда дня (+кредиты)!`)
        : 'Награда за ежедневный вход',
      icon: Gift,
      iconColor: user?.lastDailyBonusClaim && new Date(user.lastDailyBonusClaim).toDateString() === new Date().toDateString() ? 'text-amber-500' : 'text-orange-400',
      badge: user 
        ? (user.lastDailyBonusClaim && new Date(user.lastDailyBonusClaim).toDateString() === new Date().toDateString()
          ? `🔥 ${user.dailyBonusStreak || 1} дн.` 
          : '🔥 ЗАБРАТЬ!')
        : undefined,
      badgeColor: user?.lastDailyBonusClaim && new Date(user.lastDailyBonusClaim).toDateString() === new Date().toDateString()
        ? 'bg-orange-950/70 border-orange-700/60 text-orange-300' 
        : 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white font-black animate-pulse shadow-xs',
      active: activeTab === 'bonus'
    },
    {
      id: 'settings' as NavDrawerTab,
      title: 'Настройки',
      subtitle: 'Параметры аккаунта и интерфейса',
      icon: Settings,
      active: activeTab === 'settings'
    },
    {
      id: 'logout' as NavDrawerTab,
      title: 'Выход',
      subtitle: isLoggedIn ? 'Завершить сессию' : 'Войти в аккаунт',
      icon: LogOut,
      iconColor: 'text-amber-700',
      isDanger: true,
      active: false
    }
  ];

  const handleToggleRole = (roleKey: keyof RoomSettings['enabledRoles']) => {
    if (!isHost || !onUpdateSettings || !roomSettings) return;
    onUpdateSettings({
      enabledRoles: {
        ...roomSettings.enabledRoles,
        [roleKey]: !roomSettings.enabledRoles[roleKey]
      }
    });
    sounds.playTick();
  };

  const handleUpdate = (field: keyof RoomSettings, value: unknown) => {
    if (!isHost || !onUpdateSettings || !roomSettings) return;
    onUpdateSettings({ [field]: value });
    sounds.playTick();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-200">
      {/* Backdrop overlay */}
      <div 
        onClick={() => {
          setView('menu');
          onClose();
        }}
        className="absolute inset-0 bg-black/65 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-over Drawer panel from the right */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 pointer-events-auto">
        <div className="w-screen max-w-md bg-[#111219] border-l border-zinc-800/90 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
          
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-zinc-850/80 bg-[#13141d]/90 flex items-start justify-between">
            {view === 'table_settings' ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    sounds.playTick();
                    setView('menu');
                  }}
                  className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-amber-500">
                      НАСТРОЙКИ СТОЛА
                    </span>
                    {isHost ? (
                      <span className="text-[10px] text-amber-400 font-mono bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Crown className="w-3 h-3" /> Ведущий
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-400 font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Просмотр
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-sans font-bold text-white tracking-tight">
                    Параметры партии
                  </h2>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-orange-500 block">
                  НАВИГАЦИЯ
                </span>
                <h2 className="text-2xl font-sans font-bold text-white tracking-tight">
                  Меню
                </h2>
              </div>
            )}

            {/* Close Button */}
            <button
              onClick={() => {
                sounds.playTick();
                setView('menu');
                onClose();
              }}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shadow-xs"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 font-sans">
            {view === 'menu' ? (
              /* Standard Menu Items List */
              <div className="space-y-2.5">
                {navItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item.id)}
                      className={`w-full p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 flex items-center gap-4 group ${
                        item.active
                          ? 'bg-[#181924] border-orange-500/60 shadow-lg shadow-orange-950/20'
                          : 'bg-[#14151e] border-zinc-800/80 hover:bg-[#191a26] hover:border-zinc-700'
                      }`}
                    >
                      {/* Icon Box */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        item.active
                          ? 'bg-orange-950/60 border border-orange-700/60 text-orange-400'
                          : 'bg-zinc-900/90 border border-zinc-800 text-zinc-400 group-hover:text-white'
                      }`}>
                        <Icon className={`w-5 h-5 ${item.iconColor || ''}`} />
                      </div>

                      {/* Title & Subtitle */}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-bold tracking-tight truncate flex items-center justify-between gap-2 ${
                          item.isDanger 
                            ? 'text-amber-500 group-hover:text-orange-400' 
                            : item.active 
                              ? 'text-white' 
                              : 'text-zinc-100 group-hover:text-white'
                        }`}>
                          <span className="truncate">{item.title}</span>
                          {item.badge && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border shrink-0 ${item.badgeColor || ''}`}>
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : roomSettings ? (
              /* TABLE SETTINGS VIEW (RENDERED INSIDE DRAWER) */
              <div className="space-y-5 animate-in fade-in duration-200">
                
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
                        roomSettings.gameMode === 'classic'
                          ? 'bg-[#221c1a] border-orange-500 text-white shadow-xs'
                          : 'bg-[#14151b] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center justify-between">
                        <span>Городская</span>
                        {roomSettings.gameMode === 'classic' && <Check className="w-3.5 h-3.5 text-orange-400" />}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">Общее собрание, Шериф, Доктор</div>
                    </button>

                    <button
                      disabled={!isHost}
                      type="button"
                      onClick={() => handleUpdate('gameMode', 'sport')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        roomSettings.gameMode === 'sport'
                          ? 'bg-[#221c1a] border-orange-500 text-white shadow-xs'
                          : 'bg-[#14151b] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center justify-between">
                        <span>Спортивная</span>
                        {roomSettings.gameMode === 'sport' && <Check className="w-3.5 h-3.5 text-orange-400" />}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">Нулевая минута мафии, 10 мест</div>
                    </button>
                  </div>
                </div>

                {/* Max Players */}
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
                          roomSettings.maxPlayers === count
                            ? 'bg-orange-600 text-white border-orange-500 shadow-xs'
                            : 'bg-[#14151b] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {count} мест
                      </button>
                    ))}
                  </div>
                </div>

                {/* First Day Voting Toggle (ТРЕБОВАНИЕ ТЗ) */}
                <div className="p-3.5 rounded-2xl bg-[#14151f] border border-zinc-800 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-white">
                      Голосование в 1-й день
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      {roomSettings.firstDayVoting 
                        ? 'Номинации и голосование доступны в день 1' 
                        : 'В день 1 кандидаты не номинируются, сразу ночь'}
                    </div>
                  </div>

                  <button
                    disabled={!isHost}
                    type="button"
                    onClick={() => handleUpdate('firstDayVoting', !roomSettings.firstDayVoting)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-colors border ${
                      roomSettings.firstDayVoting
                        ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                    }`}
                  >
                    {roomSettings.firstDayVoting ? 'ВКЛ' : 'ВЫКЛ'}
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
                        value={roomSettings.generalDiscussionDuration}
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
                        {roomSettings.generalDiscussionDuration === 0 ? 'Отключено' : `${roomSettings.generalDiscussionDuration}с`}
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
                        value={roomSettings.individualSpeechDuration}
                        onChange={e => handleUpdate('individualSpeechDuration', parseInt(e.target.value))}
                        className="bg-[#1b1c28] border border-zinc-700 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-400 focus:outline-none cursor-pointer"
                      >
                        <option value={15} className="bg-zinc-900 text-white">15 сек</option>
                        <option value={30} className="bg-zinc-900 text-white">30 сек</option>
                        <option value={45} className="bg-zinc-900 text-white">45 сек</option>
                        <option value={60} className="bg-zinc-900 text-white">60 сек (1 мин)</option>
                      </select>
                    ) : (
                      <span className="text-xs font-mono font-bold text-amber-400">{roomSettings.individualSpeechDuration}с</span>
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
                        value={roomSettings.nightDurationSeconds}
                        onChange={e => handleUpdate('nightDurationSeconds', parseInt(e.target.value))}
                        className="bg-[#1b1c28] border border-zinc-700 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-400 focus:outline-none cursor-pointer"
                      >
                        <option value={15} className="bg-zinc-900 text-white">15 сек</option>
                        <option value={30} className="bg-zinc-900 text-white">30 сек</option>
                        <option value={45} className="bg-zinc-900 text-white">45 сек</option>
                        <option value={60} className="bg-zinc-900 text-white">60 сек</option>
                      </select>
                    ) : (
                      <span className="text-xs font-mono font-bold text-amber-400">{roomSettings.nightDurationSeconds}с</span>
                    )}
                  </div>
                </div>

                {/* Roles Deck Toggles (Classic mode only) */}
                {roomSettings.gameMode === 'classic' && (
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
                        const isEnabled = roomSettings.enabledRoles[roleKey];
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
            ) : null}
          </div>

          {/* Footer note */}
          <div className="p-4 border-t border-zinc-850/80 bg-[#12131b] flex items-center justify-between text-[11px] text-zinc-400">
            {view === 'table_settings' ? (
              <button
                onClick={() => setView('menu')}
                className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
              >
                ← Вернуться в меню
              </button>
            ) : (
              <span className="font-mono">MAFIA GAME • 1930s NOIR</span>
            )}
            <span className="font-mono text-zinc-500">v2.4</span>
          </div>

        </div>
      </div>
    </div>
  );
};
