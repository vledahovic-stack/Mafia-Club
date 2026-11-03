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
  Square,
  Globe,
  Sun,
  Moon,
  Ticket,
  Flame
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { RoomSettings } from '../types/mafia';
import { AuthUser } from './AuthModal';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { isSameCalendarDayInTimezone } from '../utils/timezone';

export type NavDrawerTab = 'lobby' | 'profile' | 'promocode' | 'campaigns' | 'tasks' | 'clans' | 'shop' | 'pawnshop' | 'bonus' | 'feedback' | 'settings' | 'admin' | 'logout' | 'leave_room' | 'stop_match';

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
  const { language, setLanguage, t, languages } = useLanguage();
  const { theme, resolvedTheme, setTheme } = useTheme();
  if (!isOpen) return null;

  const isAuthenticated = Boolean(isLoggedIn || user);
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
      title: t('nav.lobby', 'Лобби'),
      subtitle: t('nav.lobby_sub', 'Активные столы и создание комнаты'),
      icon: Gamepad2,
      active: activeTab === 'lobby'
    },
    ...(isSuperAdmin ? [{
      id: 'admin' as NavDrawerTab,
      title: t('nav.admin', 'Панель Администратора'),
      subtitle: t('nav.admin_sub', 'Управление сервером, игроками и экономикой'),
      icon: Crown,
      iconColor: 'text-amber-400',
      active: activeTab === 'admin'
    }] : []),
    {
      id: 'profile' as NavDrawerTab,
      title: t('nav.profile', 'Личный кабинет'),
      subtitle: t('nav.profile_sub', 'Статистика, аватар и инвентарь'),
      icon: User,
      active: activeTab === 'profile'
    },
    ...(isAuthenticated ? [{
      id: 'promocode' as NavDrawerTab,
      title: t('nav.promocode', 'Активировать промокод'),
      subtitle: t('nav.promocode_sub', 'Ввод промокода или кода партнёра и получение наград'),
      icon: Ticket,
      iconColor: 'text-amber-400',
      badge: 'БОНУС',
      badgeColor: 'bg-amber-950/80 border-amber-600/70 text-amber-300 font-bold',
      active: activeTab === 'promocode'
    }] : []),
    ...(isAuthenticated ? [{
      id: 'campaigns' as NavDrawerTab,
      title: t('nav.campaigns', 'Акции'),
      subtitle: t('nav.campaigns_sub', 'Подарки к открытию клуба и праздничные события'),
      icon: Flame,
      iconColor: 'text-amber-400',
      badge: 'ПОДАРКИ',
      badgeColor: 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white font-black shadow-xs',
      active: activeTab === 'campaigns'
    }] : []),
    {
      id: 'tasks' as NavDrawerTab,
      title: t('nav.tasks', 'Ивенты и Задачи'),
      subtitle: t('nav.tasks_sub', '4 типа квестов, награды и этапы синдиката'),
      icon: Sparkles,
      iconColor: 'text-amber-400',
      badge: 'КВЕСТЫ',
      badgeColor: 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white font-black shadow-xs',
      active: activeTab === 'tasks'
    },
    {
      id: 'clans' as NavDrawerTab,
      title: t('nav.clans', 'Синдикаты и Кланы'),
      subtitle: user?.clanName ? `Ваш клан: [${user.clanTag}] ${user.clanName}` : t('nav.clans_sub', 'Объединения игроков, рейтинг и клановые теги'),
      icon: Shield,
      iconColor: user?.clanId ? 'text-amber-400' : undefined,
      badge: user?.clanTag ? `[${user.clanTag}]` : undefined,
      badgeColor: 'bg-amber-950/80 border-amber-600/70 text-amber-300 font-bold',
      active: activeTab === 'clans'
    },
    {
      id: 'shop' as NavDrawerTab,
      title: t('nav.shop', 'Черный Рынок'),
      subtitle: t('nav.shop_sub', 'Сундуки, монеты и сертификаты'),
      icon: ShoppingCart,
      active: activeTab === 'shop'
    },
    {
      id: 'pawnshop' as NavDrawerTab,
      title: t('nav.pawnshop', 'Ломбард Дона'),
      subtitle: t('nav.pawnshop_sub', 'Скупка предметов за монеты'),
      icon: Scale,
      active: activeTab === 'pawnshop'
    },
    {
      id: 'bonus' as NavDrawerTab,
      title: t('nav.bonus', 'Ежедневный бонус'),
      subtitle: user 
        ? (user.lastDailyBonusClaim && isSameCalendarDayInTimezone(user.lastDailyBonusClaim, new Date())
          ? `Серия активна: ${user.dailyBonusStreak || 1} дн. (сегодня собран)` 
          : `Доступна награда дня (+кредиты)!`)
        : t('nav.bonus_sub', 'Награда за ежедневный вход'),
      icon: Gift,
      iconColor: user?.lastDailyBonusClaim && isSameCalendarDayInTimezone(user.lastDailyBonusClaim, new Date()) ? 'text-amber-500' : 'text-orange-400',
      badge: user 
        ? (user.lastDailyBonusClaim && isSameCalendarDayInTimezone(user.lastDailyBonusClaim, new Date())
          ? `🔥 ${user.dailyBonusStreak || 1} дн.` 
          : '🔥 ЗАБРАТЬ!')
        : undefined,
      badgeColor: user?.lastDailyBonusClaim && isSameCalendarDayInTimezone(user.lastDailyBonusClaim, new Date())
        ? 'bg-orange-950/70 border-orange-700/60 text-orange-300' 
        : 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white font-black animate-pulse shadow-xs',
      active: activeTab === 'bonus'
    },
    {
      id: 'feedback' as NavDrawerTab,
      title: t('nav.feedback', 'Обратная связь'),
      subtitle: t('nav.feedback_sub', 'Сообщить о баге или предложить идею'),
      icon: MessageSquareHeart,
      iconColor: 'text-amber-400',
      badge: 'БАГИ / ИДЕИ',
      badgeColor: 'bg-amber-950/80 border-amber-600/70 text-amber-300 font-bold',
      active: activeTab === 'feedback'
    },
    ...(isHost && onStopMatch ? [{
      id: 'stop_match' as NavDrawerTab,
      title: t('nav.stop_match', 'Остановить партию'),
      subtitle: t('nav.stop_match_sub', 'Досрочно завершить игру и сбросить стол в лобби'),
      icon: Square,
      iconColor: 'fill-rose-500 text-rose-500',
      isDanger: true,
      badge: 'ВЕДУЩИЙ',
      badgeColor: 'bg-rose-950/80 border-rose-700/80 text-rose-300 font-bold',
      active: false
    }] : []),
    ...(onLeaveRoom ? [{
      id: 'leave_room' as NavDrawerTab,
      title: t('nav.leave_room', 'Выйти из комнаты'),
      subtitle: t('nav.leave_room_sub', 'Покинуть текущий стол и вернуться в общее лобби'),
      icon: LogOut,
      iconColor: 'text-rose-400',
      isDanger: true,
      active: false
    }] : []),
    {
      id: 'settings' as NavDrawerTab,
      title: t('nav.settings', 'Настройки'),
      subtitle: t('nav.settings_sub', 'Язык, звук, правила и параметры видеосвязи'),
      icon: Settings,
      active: activeTab === 'settings'
    },
    {
      id: 'logout' as NavDrawerTab,
      title: isLoggedIn ? t('nav.logout', 'Выйти из аккаунта') : t('header.login', 'Войти в аккаунт'),
      subtitle: isLoggedIn ? t('nav.logout_sub', 'Сменить персонажа или выйти из системы') : t('auth.welcome_sub', 'Авторизация и профиль'),
      icon: LogOut,
      active: false
    }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-200">
      {/* Backdrop overlay */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs transition-opacity"
      />

      {/* Slide-over Drawer panel from the right */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 pointer-events-auto">
        <div className="skin-drawer w-screen max-w-md bg-[var(--skin-bg-drawer)] border-l border-[var(--skin-border-base)] shadow-[var(--skin-shadow-modal)] flex flex-col justify-between animate-in slide-in-from-right duration-300">
          
          {/* Header */}
          <div className="skin-header p-5 sm:p-6 border-b border-[var(--skin-border-header)] bg-[var(--skin-bg-header)] flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-[var(--skin-accent-primary)] block">
                НАВИГАЦИЯ
              </span>
              <h2
                className="text-2xl font-sans font-bold text-[var(--skin-text-primary)] tracking-tight"
                style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}
              >
                Меню
              </h2>
            </div>

            {/* Close Button */}
            <button
              onClick={() => {
                sounds.playTick();
                onClose();
              }}
              className="p-2 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)] transition-colors shadow-xs"
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
                        ? 'skin-card bg-[var(--skin-bg-elevated)] border-[var(--skin-border-accent)] shadow-[var(--skin-glow-accent)]'
                        : 'skin-subcard bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] hover:bg-[var(--skin-bg-elevated)] hover:border-[var(--skin-border-strong)]'
                    }`}
                  >
                    {/* Icon Box */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      item.active
                        ? 'bg-[var(--skin-bg-card)] border border-[var(--skin-border-accent)] text-[var(--skin-accent-primary)]'
                        : 'bg-[var(--skin-bg-card)] border border-[var(--skin-border-subtle)] text-[var(--skin-text-muted)] group-hover:text-[var(--skin-text-primary)]'
                    }`}>
                      <Icon className={`w-5 h-5 ${item.iconColor || ''}`} />
                    </div>

                    {/* Title & Subtitle */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-bold tracking-tight truncate flex items-center justify-between gap-2 ${
                        item.isDanger 
                          ? 'text-amber-500 group-hover:text-orange-400' 
                          : item.active 
                            ? 'text-[var(--skin-text-primary)]' 
                            : 'text-[var(--skin-text-secondary)] group-hover:text-[var(--skin-text-primary)]'
                      }`}>
                        <span className="truncate">{item.title}</span>
                        {item.badge && (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border shrink-0 ${item.badgeColor || ''}`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--skin-text-muted)] truncate mt-0.5">
                        {item.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer note */}
          <div className="p-4 border-t border-[var(--skin-border-header)] bg-[var(--skin-bg-header)] flex items-center justify-between text-[11px] text-[var(--skin-text-muted)]">
            <span className="font-mono">MAFIA GAME</span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  sounds.playTick();
                  setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] hover:border-[var(--skin-border-strong)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] transition-colors cursor-pointer text-[10px] font-semibold"
                title="Сменить тему"
              >
                {resolvedTheme === 'light' ? <Sun className="w-3 h-3 text-amber-500" /> : <Moon className="w-3 h-3 text-indigo-400" />}
                <span>{resolvedTheme === 'light' ? 'Светлая' : 'Тёмная'}</span>
              </button>

              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--skin-text-accent)] hover:brightness-110 underline underline-offset-2 transition-colors ml-1"
              >
                {t('settings.privacy_title', 'Конфиденциальность')}
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
