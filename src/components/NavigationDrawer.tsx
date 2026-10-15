import React from 'react';
import { 
  X, 
  Gamepad2, 
  User, 
  ShoppingCart, 
  Scale, 
  Gift, 
  Settings, 
  LogOut,
  Crown,
  Shield,
  Sparkles,
  MessageSquareHeart,
  Square
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { RoomSettings } from '../types/mafia';
import { AuthUser } from './AuthModal';

export type NavDrawerTab = 'lobby' | 'profile' | 'tasks' | 'clans' | 'shop' | 'pawnshop' | 'bonus' | 'feedback' | 'settings' | 'admin' | 'logout' | 'leave_room' | 'stop_match';

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
  onLeaveRoom?: () => void;
  onStopMatch?: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  activeTab = 'lobby',
  onSelectTab,
  isLoggedIn,
  user,
  isHost,
  onLeaveRoom,
  onStopMatch
}) => {
  if (!isOpen) return null;

  const isSuperAdmin = Boolean(user && (user.isAdmin === true || user.role === 'admin' || user.email?.toLowerCase() === 'vledahovic@gmail.com'));

  const handleItemClick = (tab: NavDrawerTab) => {
    sounds.playTick();
    if (tab === 'stop_match') {
      onClose();
      onStopMatch?.();
      return;
    }
    if (tab === 'leave_room') {
      onClose();
      onLeaveRoom?.();
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
      id: 'feedback' as NavDrawerTab,
      title: 'Связь с Администратором',
      subtitle: 'Сообщить о баге или предложить идею (награда кр.)',
      icon: MessageSquareHeart,
      iconColor: 'text-amber-400',
      badge: 'БАГИ / ИДЕИ',
      badgeColor: 'bg-amber-950/80 border-amber-600/70 text-amber-300 font-bold',
      active: activeTab === 'feedback'
    },
    ...(isHost && onStopMatch ? [{
      id: 'stop_match' as NavDrawerTab,
      title: 'Остановить партию',
      subtitle: 'Досрочно завершить игру и сбросить стол в лобби',
      icon: Square,
      iconColor: 'fill-rose-500 text-rose-500',
      isDanger: true,
      badge: 'ВЕДУЩИЙ',
      badgeColor: 'bg-rose-950/80 border-rose-700/80 text-rose-300 font-bold',
      active: false
    }] : []),
    ...(onLeaveRoom ? [{
      id: 'leave_room' as NavDrawerTab,
      title: 'Покинуть стол',
      subtitle: 'Выйти из текущей комнаты в общее лобби',
      icon: LogOut,
      iconColor: 'text-rose-400',
      isDanger: true,
      active: false
    }] : []),
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

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-200">
      {/* Backdrop overlay */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-over Drawer panel from the right */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 pointer-events-auto">
        <div className="w-screen max-w-md bg-[#111219] border-l border-zinc-800/90 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
          
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-zinc-850/80 bg-[#13141d]/90 flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-orange-500 block">
                НАВИГАЦИЯ
              </span>
              <h2 className="text-2xl font-sans font-bold text-white tracking-tight">
                Меню
              </h2>
            </div>

            {/* Close Button */}
            <button
              onClick={() => {
                sounds.playTick();
                onClose();
              }}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shadow-xs"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body: Standard Menu Items List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 font-sans">
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
          </div>

          {/* Footer note */}
          <div className="p-4 border-t border-zinc-850/80 bg-[#12131b] flex items-center justify-between text-[11px] text-zinc-400">
            <span className="font-mono">MAFIA GAME • 1930s NOIR</span>
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-500 hover:text-amber-400 underline underline-offset-2 transition-colors"
            >
              Конфиденциальность
            </a>
          </div>

        </div>
      </div>
    </div>
  );
};
