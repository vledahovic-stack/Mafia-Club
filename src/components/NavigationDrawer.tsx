import React, { useEffect, useState } from 'react';
import { 
  X, 
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
  Sun,
  Moon,
  Ticket,
  Flame,
  Download,
  Check,
  Users,
  ScrollText
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { RoomSettings } from '../types/mafia';
import { AuthUser } from './AuthModal';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { isSameCalendarDayInTimezone } from '../utils/timezone';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';

export type NavDrawerTab =
  | 'lobby'
  | 'game_table'
  | 'game_protocol'
  | 'profile'
  | 'promocode'
  | 'campaigns'
  | 'tasks'
  | 'clans'
  | 'shop'
  | 'pawnshop'
  | 'bonus'
  | 'feedback'
  | 'settings'
  | 'install_pwa'
  | 'admin'
  | 'logout'
  | 'leave_room'
  | 'stop_match';

export type BurgerMenuVariant = 'out_of_game' | 'in_game';

/**
 * Independent top-to-bottom item order for the Out-of-Game Burger Menu (HomeView, when !roomState).
 * Note: 'lobby' is intentionally excluded because the user is already on the main screen.
 * 'install_pwa' is positioned between settings and feedback.
 */
export const OUT_OF_GAME_MENU_ORDER: readonly NavDrawerTab[] = [
  'profile',
  'bonus',
  'tasks',
  'shop',
  'campaigns',
  'promocode',
  'clans',
  'pawnshop',
  'settings',
  'install_pwa',
  'feedback',
  'admin',
  'logout'
] as const;

/**
 * Independent top-to-bottom item order for the In-Game Burger Menu (LobbyView & InGameView).
 * Items 'stop_match' (13) and 'leave_room' (14) are placed at the bottom in a visually separated danger group.
 * Note: 'lobby' is intentionally excluded so it never duplicates 'leave_room'.
 */
export const IN_GAME_MENU_ORDER: readonly NavDrawerTab[] = [
  'game_table',
  'game_protocol',
  'settings',
  'profile',
  'tasks',
  'bonus',
  'shop',
  'campaigns',
  'promocode',
  'clans',
  'pawnshop',
  'feedback',
  'admin',
  'logout',
  'stop_match',
  'leave_room'
] as const;

export interface BurgerMenuItemDescriptor {
  id: NavDrawerTab;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  badge?: string;
  badgeColor?: string;
  active: boolean;
  isDanger?: boolean;
  group: 'main' | 'room_actions';
}

export interface BuildBurgerMenuOptions {
  variant: BurgerMenuVariant;
  activeTab?: NavDrawerTab;
  isLoggedIn: boolean;
  user?: AuthUser | null;
  isHost?: boolean;
  onLeaveRoom?: () => void;
  onStopMatch?: () => void;
  t: (key: string, fallback: string) => string;
  isInstalled?: boolean;
  isIOS?: boolean;
  isAndroid?: boolean;
  inGameMobileTab?: 'left' | 'right';
  protocolRecordsCount?: number;
}

export function buildBurgerMenuItems({
  variant,
  activeTab,
  isLoggedIn,
  user,
  isHost,
  onLeaveRoom,
  onStopMatch,
  t,
  isInstalled,
  isIOS,
  isAndroid,
  inGameMobileTab,
  protocolRecordsCount
}: BuildBurgerMenuOptions): BurgerMenuItemDescriptor[] {
  const isAuthenticated = Boolean(isLoggedIn || user);
  const isSuperAdmin = Boolean(
    user &&
      (user.isAdmin === true ||
        user.role === 'admin' ||
        (typeof user.email === 'string' && user.email.toLowerCase() === 'vledahovic@gmail.com'))
  );

  const bonusClaimedToday = Boolean(
    user?.lastDailyBonusClaim && isSameCalendarDayInTimezone(user.lastDailyBonusClaim, new Date())
  );

  const catalog: Record<NavDrawerTab, BurgerMenuItemDescriptor | null> = {
    lobby: null, // Explicitly removed from both menus
    game_table: inGameMobileTab
      ? {
          id: 'game_table',
          title: t('game.tab_table', 'Игровой стол'),
          subtitle: t('game.tab_table_sub', 'Игровой стол и карточки игроков'),
          icon: Users,
          iconColor: inGameMobileTab === 'left' ? 'text-amber-400' : 'text-zinc-400',
          badge: inGameMobileTab === 'left' ? t('common.active', 'АКТИВЕН') : undefined,
          badgeColor: 'bg-amber-950/80 border-amber-600/70 text-amber-300 font-bold',
          active: inGameMobileTab === 'left',
          group: 'main'
        }
      : null,
    game_protocol: inGameMobileTab
      ? {
          id: 'game_protocol',
          title: t('protocol.title_short', 'Протокол'),
          subtitle: t('protocol.subtitle', 'Официальный журнал событий партии'),
          icon: ScrollText,
          iconColor: inGameMobileTab === 'right' ? 'text-amber-400' : 'text-zinc-400',
          badge: typeof protocolRecordsCount === 'number'
            ? inGameMobileTab === 'right'
              ? `${protocolRecordsCount} · АКТИВЕН`
              : `${protocolRecordsCount}`
            : inGameMobileTab === 'right'
              ? t('common.active', 'АКТИВЕН')
              : undefined,
          badgeColor: inGameMobileTab === 'right'
            ? 'bg-amber-950/80 border-amber-600/70 text-amber-300 font-bold'
            : 'bg-[var(--skin-bg-card)] border-[var(--skin-border-base)] text-[var(--skin-text-muted)] font-mono',
          active: inGameMobileTab === 'right',
          group: 'main'
        }
      : null,
    profile: {
      id: 'profile',
      title: t('nav.profile', 'Личный кабинет'),
      subtitle: t('nav.profile_sub', 'Статистика, аватар и инвентарь'),
      icon: User,
      active: activeTab === 'profile',
      group: 'main'
    },
    bonus: {
      id: 'bonus',
      title: t('nav.bonus', 'Ежедневный бонус'),
      subtitle: user
        ? bonusClaimedToday
          ? `Серия активна: ${user.dailyBonusStreak || 1} дн. (сегодня собран)`
          : 'Доступна награда дня (+кредиты)!'
        : t('nav.bonus_sub', 'Награда за ежедневный вход'),
      icon: Gift,
      iconColor: bonusClaimedToday ? 'text-amber-500' : 'text-orange-400',
      badge: user
        ? bonusClaimedToday
          ? `🔥 ${user.dailyBonusStreak || 1} дн.`
          : '🔥 ЗАБРАТЬ!'
        : undefined,
      badgeColor: bonusClaimedToday
        ? 'bg-orange-950/70 border-orange-700/60 text-orange-300'
        : 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white font-black animate-pulse shadow-xs',
      active: activeTab === 'bonus',
      group: 'main'
    },
    tasks: {
      id: 'tasks',
      title: t('nav.tasks', 'Ивенты и Задачи'),
      subtitle: t('nav.tasks_sub', '4 типа квестов, награды и этапы синдиката'),
      icon: Sparkles,
      iconColor: 'text-amber-400',
      badge: 'КВЕСТЫ',
      badgeColor: 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white font-black shadow-xs',
      active: activeTab === 'tasks',
      group: 'main'
    },
    shop: {
      id: 'shop',
      title: t('nav.shop', 'Черный Рынок'),
      subtitle: t('nav.shop_sub', 'Сундуки, монеты и сертификаты'),
      icon: ShoppingCart,
      active: activeTab === 'shop',
      group: 'main'
    },
    campaigns: isAuthenticated
      ? {
          id: 'campaigns',
          title: t('nav.campaigns', 'Акции'),
          subtitle: t('nav.campaigns_sub', 'Подарки к открытию клуба и праздничные события'),
          icon: Flame,
          iconColor: 'text-amber-400',
          badge: 'ПОДАРКИ',
          badgeColor: 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white font-black shadow-xs',
          active: activeTab === 'campaigns',
          group: 'main'
        }
      : null,
    promocode: isAuthenticated
      ? {
          id: 'promocode',
          title: t('nav.promocode', 'Активировать промокод'),
          subtitle: t('nav.promocode_sub', 'Ввод промокода или кода партнёра и получение наград'),
          icon: Ticket,
          iconColor: 'text-amber-400',
          badge: 'БОНУС',
          badgeColor: 'bg-amber-950/80 border-amber-600/70 text-amber-300 font-bold',
          active: activeTab === 'promocode',
          group: 'main'
        }
      : null,
    clans: {
      id: 'clans',
      title: t('nav.clans', 'Синдикаты и Кланы'),
      subtitle: user?.clanName
        ? `Ваш клан: [${user.clanTag}] ${user.clanName}`
        : t('nav.clans_sub', 'Объединения игроков, рейтинг и клановые теги'),
      icon: Shield,
      iconColor: user?.clanId ? 'text-amber-400' : undefined,
      badge: user?.clanTag ? `[${user.clanTag}]` : undefined,
      badgeColor: 'bg-amber-950/80 border-amber-600/70 text-amber-300 font-bold',
      active: activeTab === 'clans',
      group: 'main'
    },
    pawnshop: {
      id: 'pawnshop',
      title: t('nav.pawnshop', 'Ломбард Дона'),
      subtitle: t('nav.pawnshop_sub', 'Скупка предметов за монеты'),
      icon: Scale,
      active: activeTab === 'pawnshop',
      group: 'main'
    },
    settings: {
      id: 'settings',
      title: t('nav.settings', 'Настройки'),
      subtitle: t('nav.settings_sub', 'Язык, звук, правила и параметры видеосвязи'),
      icon: Settings,
      active: activeTab === 'settings',
      group: 'main'
    },
    install_pwa: !isInstalled
      ? {
          id: 'install_pwa',
          title: t('nav.install_pwa', 'Установить приложение'),
          subtitle: isIOS
            ? t('nav.install_pwa_ios_sub', 'Быстрый запуск с экрана iOS')
            : isAndroid
              ? t('nav.install_pwa_android_sub', 'Автономный клиент Mafia Club для Android')
              : t('nav.install_pwa_sub', 'Запуск с рабочего стола без рамок браузера'),
          icon: Download,
          iconColor: 'text-[var(--skin-accent-primary)]',
          badge: isAndroid ? 'ANDROID' : isIOS ? 'IOS' : 'PWA',
          badgeColor: 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300 font-bold',
          active: false,
          group: 'main'
        }
      : null,
    feedback: {
      id: 'feedback',
      title: t('nav.feedback', 'Обратная связь'),
      subtitle: t('nav.feedback_sub', 'Сообщить о баге или предложить идею'),
      icon: MessageSquareHeart,
      iconColor: 'text-amber-400',
      badge: 'БАГИ / ИДЕИ',
      badgeColor: 'bg-amber-950/80 border-amber-600/70 text-amber-300 font-bold',
      active: activeTab === 'feedback',
      group: 'main'
    },
    admin: isSuperAdmin
      ? {
          id: 'admin',
          title: t('nav.admin', 'Панель Администратора'),
          subtitle: t('nav.admin_sub', 'Управление сервером, игроками и экономикой'),
          icon: Crown,
          iconColor: 'text-amber-400',
          active: activeTab === 'admin',
          group: 'main'
        }
      : null,
    logout: {
      id: 'logout',
      title: isLoggedIn ? t('nav.logout', 'Выйти из аккаунта') : t('header.login', 'Войти в аккаунт'),
      subtitle: isLoggedIn
        ? t('nav.logout_sub', 'Сменить персонажа или выйти из системы')
        : t('auth.welcome_sub', 'Авторизация и профиль'),
      icon: LogOut,
      active: false,
      group: 'main'
    },
    stop_match:
      variant === 'in_game' && isHost && onStopMatch
        ? {
            id: 'stop_match',
            title: t('nav.stop_match', 'Остановить партию'),
            subtitle: t('nav.stop_match_sub', 'Досрочно завершить игру и сбросить стол в лобби'),
            icon: Square,
            iconColor: 'fill-rose-500 text-rose-500',
            isDanger: true,
            badge: 'ВЕДУЩИЙ',
            badgeColor: 'bg-rose-950/80 border-rose-700/80 text-rose-300 font-bold',
            active: false,
            group: 'room_actions'
          }
        : null,
    leave_room:
      variant === 'in_game' && onLeaveRoom
        ? {
            id: 'leave_room',
            title: t('nav.leave_room', 'Выйти из комнаты'),
            subtitle: t('nav.leave_room_sub', 'Покинуть текущий стол и вернуться в общее лобби'),
            icon: LogOut,
            iconColor: 'text-rose-400',
            isDanger: true,
            active: false,
            group: 'room_actions'
          }
        : null
  };

  const order = variant === 'in_game' ? IN_GAME_MENU_ORDER : OUT_OF_GAME_MENU_ORDER;
  const result: BurgerMenuItemDescriptor[] = [];

  for (const tabId of order) {
    const descriptor = catalog[tabId];
    if (descriptor) {
      result.push(descriptor);
    }
  }

  return result;
}

export interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  variant?: BurgerMenuVariant;
  activeTab?: NavDrawerTab;
  onSelectTab: (tab: NavDrawerTab) => void;
  isLoggedIn: boolean;
  user?: AuthUser | null;
  roomSettings?: RoomSettings;
  onUpdateSettings?: (settings: Partial<RoomSettings>) => void;
  isHost?: boolean;
  onLeaveRoom?: () => void;
  onStopMatch?: () => void;
  inGameMobileTab?: 'left' | 'right';
  protocolRecordsCount?: number;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  variant,
  activeTab,
  onSelectTab,
  isLoggedIn,
  user,
  isHost,
  onLeaveRoom,
  onStopMatch,
  inGameMobileTab,
  protocolRecordsCount
}) => {
  const { t } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const pwaInstall = usePWAInstall();
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);

  // Resolve menu variant: explicit prop takes precedence, fallback derives from room context
  const resolvedVariant: BurgerMenuVariant =
    variant ?? (onLeaveRoom || onStopMatch ? 'in_game' : 'out_of_game');

  // Animation states for smooth bottom-up open and top-down reverse close
  const [shouldRender, setShouldRender] = useState<boolean>(isOpen);
  const [isSheetVisible, setIsSheetVisible] = useState<boolean>(false);

  useEffect(() => {
    let raf1: number | null = null;
    let raf2: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (isOpen) {
      setShouldRender(true);
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          setIsSheetVisible(true);
        });
      });
    } else {
      setIsSheetVisible(false);
      timer = setTimeout(() => {
        setShouldRender(false);
      }, 220);
    }

    return () => {
      if (raf1 !== null) window.cancelAnimationFrame(raf1);
      if (raf2 !== null) window.cancelAnimationFrame(raf2);
      if (timer !== null) clearTimeout(timer);
    };
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        sounds.playTick();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Lock background document scroll while menu is open and restore on close/unmount
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isOpen]);

  if (!shouldRender && !isOpen && !showInstallGuide) return null;

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
    if (tab === 'install_pwa') {
      if (pwaInstall.isInstallable) {
        pwaInstall.install().then((accepted) => {
          if (accepted) {
            onClose();
          }
        });
      } else {
        setShowInstallGuide(true);
      }
      return;
    }
    onSelectTab(tab);
  };

  const navItems = buildBurgerMenuItems({
    variant: resolvedVariant,
    activeTab,
    isLoggedIn,
    user,
    isHost,
    onLeaveRoom,
    onStopMatch,
    t,
    isInstalled: pwaInstall.isInstalled,
    isIOS: pwaInstall.isIOS,
    isAndroid: pwaInstall.isAndroid,
    inGameMobileTab,
    protocolRecordsCount
  });

  const mainItems = navItems.filter(item => item.group === 'main');
  const roomActionItems = navItems.filter(item => item.group === 'room_actions');

  const renderMenuButton = (item: BurgerMenuItemDescriptor) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        type="button"
        data-menu-item={item.id}
        onClick={() => handleItemClick(item.id)}
        className={`w-full min-h-[46px] px-3 py-2 rounded-xl border text-left transition-all duration-150 flex items-center gap-3 group cursor-pointer ${
          item.isDanger
            ? 'bg-rose-950/25 border-rose-800/60 hover:bg-rose-950/45 hover:border-rose-600/80'
            : item.active
              ? 'skin-card bg-[var(--skin-bg-elevated)] border-[var(--skin-border-accent)] shadow-[var(--skin-glow-accent)]'
              : 'skin-subcard bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] hover:bg-[var(--skin-bg-elevated)] hover:border-[var(--skin-border-strong)]'
        }`}
      >
        {/* Compact Icon Box */}
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
            item.isDanger
              ? 'bg-rose-950/70 border border-rose-700/70 text-rose-400 group-hover:text-rose-300'
              : item.active
                ? 'bg-[var(--skin-bg-card)] border border-[var(--skin-border-accent)] text-[var(--skin-accent-primary)]'
                : 'bg-[var(--skin-bg-card)] border border-[var(--skin-border-subtle)] text-[var(--skin-text-muted)] group-hover:text-[var(--skin-text-primary)]'
          }`}
        >
          <Icon className={`w-4 h-4 ${item.iconColor || ''}`} />
        </div>

        {/* Compact Title & Subtitle */}
        <div className="flex-1 min-w-0">
          <div
            className={`text-[13px] sm:text-sm font-bold tracking-tight leading-tight flex items-center justify-between gap-2 ${
              item.isDanger
                ? 'text-rose-300 group-hover:text-rose-200'
                : item.active
                  ? 'text-[var(--skin-text-primary)]'
                  : 'text-[var(--skin-text-secondary)] group-hover:text-[var(--skin-text-primary)]'
            }`}
          >
            <span className="truncate flex items-center gap-1.5">
              <span>{item.title}</span>
              {item.active && (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 inline-block" />
              )}
            </span>
            {item.badge && (
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border shrink-0 leading-none ${
                  item.badgeColor || ''
                }`}
              >
                {item.badge}
              </span>
            )}
          </div>
          <div
            className={`text-[11px] leading-snug truncate mt-0.5 ${
              item.isDanger ? 'text-rose-300/75' : 'text-[var(--skin-text-muted)]'
            }`}
          >
            {item.subtitle}
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      <div
        data-menu-variant={resolvedVariant}
        className={`fixed inset-0 z-50 overflow-hidden select-none flex flex-col justify-end md:flex-row md:justify-end ${
          isOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
      {/* Backdrop overlay */}
      <div
        onClick={() => {
          sounds.playTick();
          onClose();
        }}
        className={`fixed inset-0 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs transition-opacity duration-200 ${
          isSheetVisible && isOpen ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Responsive Container: Bottom Sheet on mobile (<768px) / Right Slide-over Panel on desktop (>=768px) */}
      <div className="relative z-10 w-full max-w-lg mx-auto px-0 sm:px-2 flex flex-col justify-end max-h-full md:mx-0 md:px-0 md:w-screen md:max-w-md md:h-full md:max-h-full">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={resolvedVariant === 'in_game' ? t('nav.in_game_menu', 'Игровое меню') : t('nav.club_menu', 'Меню клуба')}
          className={`skin-drawer w-full max-h-[min(85dvh,calc(100dvh-0.75rem))] md:h-full md:max-h-none bg-[var(--skin-bg-drawer)] border-t border-x md:border-t-0 md:border-r-0 md:border-l border-[var(--skin-border-base)] rounded-t-2xl sm:rounded-t-3xl md:rounded-none shadow-[var(--skin-shadow-modal)] flex flex-col justify-between overflow-hidden transition-transform duration-200 ease-out will-change-transform ${
            isSheetVisible && isOpen
              ? 'translate-y-0 translate-x-0 md:translate-y-0 md:translate-x-0'
              : 'translate-y-full translate-x-0 md:translate-y-0 md:translate-x-full'
          }`}
        >
          {/* Compact Top Handle (mobile only) + Header */}
          <div className="skin-header px-4 pt-2 pb-2.5 md:py-3.5 border-b border-[var(--skin-border-header)] bg-[var(--skin-bg-header)] shrink-0">
            <div className="w-10 h-1 rounded-full bg-[var(--skin-border-strong)]/60 mx-auto mb-2 md:hidden" />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2 min-w-0">
                <h2
                  className="text-base sm:text-lg font-sans font-bold text-[var(--skin-text-primary)] tracking-tight truncate"
                  style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}
                >
                  {resolvedVariant === 'in_game' ? t('nav.in_game_menu', 'Игровое меню') : t('nav.club_menu', 'Меню')}
                </h2>
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-[var(--skin-accent-primary)] shrink-0">
                  {resolvedVariant === 'in_game' ? 'СТОЛ / ПАРТИЯ' : 'НАВИГАЦИЯ'}
                </span>
              </div>

              {/* Compact Close Button */}
              <button
                type="button"
                onClick={() => {
                  sounds.playTick();
                  onClose();
                }}
                title={t('common.close', 'Закрыть')}
                className="p-1.5 rounded-lg bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)] transition-colors shadow-xs cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Body: Menu Items List */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 font-sans">
            <div className="space-y-1.5">
              {mainItems.map(renderMenuButton)}
            </div>

            {/* Visually Separated Room & Match Control Actions (Items 13 & 14 in In-Game Menu) */}
            {roomActionItems.length > 0 && (
              <div
                data-menu-group="room_actions"
                className="pt-2 mt-2 border-t border-rose-900/40 space-y-1.5"
              >
                {roomActionItems.map(renderMenuButton)}
              </div>
            )}
          </div>

          {/* Compact Footer with safe-area bottom padding */}
          <div className="px-4 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:py-3 border-t border-[var(--skin-border-header)] bg-[var(--skin-bg-header)] flex items-center justify-between text-[11px] text-[var(--skin-text-muted)] shrink-0">
            <span className="font-mono text-[10px] tracking-wider">MAFIA CLUB</span>

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
                {resolvedTheme === 'light' ? (
                  <Sun className="w-3 h-3 text-amber-500" />
                ) : (
                  <Moon className="w-3 h-3 text-indigo-400" />
                )}
                <span>{resolvedTheme === 'light' ? 'Светлая' : 'Тёмная'}</span>
              </button>

              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--skin-text-accent)] hover:brightness-110 underline underline-offset-2 transition-colors ml-1 text-[10px]"
              >
                {t('settings.privacy_title', 'Конфиденциальность')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Platform-specific PWA Installation Guide Modal */}
    <PWAInstallModal
      isOpen={showInstallGuide}
      onClose={() => setShowInstallGuide(false)}
      isIOS={pwaInstall.isIOS}
      isAndroid={pwaInstall.isAndroid}
      isDesktop={pwaInstall.isDesktop}
    />
  </>
);
};

export const OutOfGameBurgerMenu: React.FC<Omit<NavigationDrawerProps, 'variant' | 'onLeaveRoom' | 'onStopMatch'>> = (
  props
) => <NavigationDrawer {...props} variant="out_of_game" />;

export const InGameBurgerMenu: React.FC<Omit<NavigationDrawerProps, 'variant'>> = (props) => (
  <NavigationDrawer {...props} variant="in_game" />
);
