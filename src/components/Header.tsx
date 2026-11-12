import React from 'react';
import { Volume2, VolumeX, BookOpen, FileText, Clock, Users, Shield, User as UserIcon, Menu, Crown, Flame, Sparkles, Sun, Moon } from 'lucide-react';
import { GamePhase } from '../types/mafia';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';
import { GangsterIcon } from './GangsterIcon';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { isSameCalendarDayInTimezone } from '../utils/timezone';
import { NotificationBellButton } from './notifications/NotificationBellButton';

interface HeaderProps {
  roomCode?: string;
  phase?: GamePhase;
  phaseTimeRemaining?: number;
  dayNumber?: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenRules: () => void;
  onOpenNotebook: () => void;
  onLeaveRoom?: () => void;
  user?: AuthUser | null;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenAdmin?: () => void;
  onOpenTasks?: () => void;
  onOpenMenu?: () => void;
  unreadNotificationsCount?: number;
  hasNewNotificationAnimation?: boolean;
  onOpenNotifications?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  roomCode,
  phase,
  phaseTimeRemaining,
  dayNumber,
  soundEnabled,
  onToggleSound,
  onOpenRules,
  onOpenNotebook,
  onLeaveRoom,
  user,
  onOpenAuth,
  onOpenProfile,
  onOpenAdmin,
  onOpenTasks,
  onOpenMenu,
  unreadNotificationsCount,
  hasNewNotificationAnimation,
  onOpenNotifications
}) => {
  const { t } = useLanguage();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const currentPhaseInfo = phase ? ({
    LOBBY: { title: t('phase.lobby_title', 'Сбор гостей'), subtitle: t('phase.lobby_sub', 'Ожидание игроков'), color: 'text-zinc-400' },
    ROLE_REVEAL: { title: t('phase.role_reveal_title', 'Раздача ролей'), subtitle: t('phase.role_reveal_sub', 'Ознакомьтесь с картой'), color: 'text-amber-400' },
    MAFIA_MEETING: { title: t('phase.mafia_meeting_title', 'Знакомство мафии'), subtitle: t('phase.mafia_meeting_sub', 'Ночная нулевая минута'), color: 'text-rose-400' },
    DAY_DISCUSSION: { title: t('phase.day_discussion_title', 'Город проснулся'), subtitle: t('phase.day_discussion_sub', 'Открытые дебаты'), color: 'text-amber-500' },
    INDIVIDUAL_SPEECHES: { title: t('phase.individual_speeches_title', 'Индивидуальные речи'), subtitle: t('phase.individual_speeches_sub', 'Ораторы выступают по очереди'), color: 'text-amber-400' },
    VOTING: { title: t('phase.voting_title', 'Городской суд'), subtitle: t('phase.voting_sub', 'Голосование за казнь'), color: 'text-rose-500' },
    DEFENSE_SPEECH: { title: t('phase.defense_speech_title', 'Оправдательные речи'), subtitle: t('phase.defense_speech_sub', 'Ничья! Защитная речь кандидата'), color: 'text-purple-400' },
    REVOTE: { title: t('phase.revote_title', 'Переголосование'), subtitle: t('phase.revote_sub', 'Повторное голосование'), color: 'text-rose-600' },
    LAST_WORDS_ARREST: { title: t('phase.last_words_arrest_title', 'Последнее слово'), subtitle: t('phase.last_words_arrest_sub', 'Осужденный судом города'), color: 'text-rose-400' },
    NIGHT: { title: t('phase.night_title', 'Город засыпает'), subtitle: t('phase.night_sub', 'Ночные действия'), color: 'text-blue-400' },
    MORNING_REPORT: { title: t('phase.morning_report_title', 'Утренние вести'), subtitle: t('phase.morning_report_sub', 'Итоги ночи'), color: 'text-emerald-400' },
    LAST_WORDS_KILLED: { title: t('phase.last_words_killed_title', 'Завещание'), subtitle: t('phase.last_words_killed_sub', 'Последнее слово погибшего'), color: 'text-purple-400' },
    GAME_OVER: { title: t('phase.game_over_title', 'Финал партии'), subtitle: t('phase.game_over_sub', 'Победа определена'), color: 'text-yellow-400' }
  } as Record<GamePhase, { title: string; subtitle: string; color: string }>)[phase] : null;

  const isSuperAdmin = Boolean(user && (user.isAdmin === true || user.role === 'admin' || user.email?.toLowerCase() === 'vledahovic@gmail.com'));

  return (
    <header className="skin-header sticky top-0 z-40 w-full border-b border-[var(--skin-border-header)] bg-[var(--skin-bg-header)] backdrop-blur-md px-3 sm:px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <GangsterIcon size={28} className="w-7 h-7 rounded-lg drop-shadow-md shrink-0" />
          <div>
            <h1
              className="text-sm font-bold tracking-widest uppercase font-sans text-[var(--skin-text-primary)] flex items-center gap-2"
              style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}
            >
              MAFIA GAME
            </h1>
            <p className="text-[10px] text-[var(--skin-text-muted)] font-mono tracking-wider leading-none">ГОРОД ЗАСЫПАЕТ</p>
          </div>
        </div>

        {/* Phase & Timer Display in game */}
        {phase && phase !== 'LOBBY' && (
          <div className="flex items-center gap-2.5 bg-[var(--skin-bg-card)]/90 border border-[var(--skin-border-base)] px-3 py-1 rounded-md shadow-inner">
            <div className="text-center">
              <div className="flex items-center gap-1.5 justify-center">
                {dayNumber !== undefined && dayNumber > 0 && (
                  <span className="text-[11px] font-medium text-[var(--skin-text-muted)]">
                    {t('header.day', 'День')} {dayNumber} ·
                  </span>
                )}
                <span className={`text-xs font-semibold ${currentPhaseInfo?.color || 'text-[var(--skin-text-secondary)]'}`}>
                  {currentPhaseInfo?.title}
                </span>
              </div>
              <p className="text-[10px] text-[var(--skin-text-muted)]">{currentPhaseInfo?.subtitle}</p>
            </div>

            {phaseTimeRemaining !== undefined && phaseTimeRemaining > 0 && (
              <div className="flex items-center gap-1 pl-2.5 border-l border-[var(--skin-border-base)] text-rose-400 font-mono font-bold text-sm">
                <Clock className="w-3.5 h-3.5" />
                <span>{phaseTimeRemaining}{t('header.seconds_short', 'с')}</span>
              </div>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {roomCode && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--skin-text-muted)] border border-[var(--skin-border-base)] bg-[var(--skin-bg-card)]/60 px-2.5 py-1 rounded">
              <span className="text-[var(--skin-text-muted)]">{t('header.code_label', 'Код:')}</span>
              <span className="font-mono font-bold text-[var(--skin-text-secondary)] tracking-wider">{roomCode}</span>
            </div>
          )}

          {/* Admin Panel Button (Strictly visible ONLY for vledahovic@gmail.com / admin) */}
          {isSuperAdmin && onOpenAdmin && (
            <button
              onClick={() => {
                sounds.playTick();
                onOpenAdmin();
              }}
              title={t('header.admin', 'Панель Главного Администратора')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-600/70 bg-gradient-to-r from-amber-950/70 to-orange-950/70 text-amber-300 hover:text-white hover:border-amber-500 text-xs font-bold transition-all shadow-sm shadow-amber-950/40 cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{t('header.admin', 'Админ-панель')}</span>
            </button>
          )}

          {/* Events & Tasks Button */}
          {onOpenTasks && (
            <button
              onClick={() => {
                sounds.playTick();
                onOpenTasks();
              }}
              title={t('header.tasks', 'Ивенты и Задачи (Квесты)')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-600/70 bg-gradient-to-r from-amber-950/70 to-orange-950/70 text-amber-300 hover:text-white hover:border-amber-500 text-xs font-bold transition-all shadow-sm shadow-amber-950/40 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{t('header.tasks', 'Задачи')}</span>
            </button>
          )}

          {/* Daily Streak Indicator */}
          {user && (
            <button
              onClick={() => {
                sounds.playTick();
                onOpenProfile();
              }}
              title={user.lastDailyBonusClaim && isSameCalendarDayInTimezone(user.lastDailyBonusClaim, new Date())
                ? `${t('header.bonus', 'Ежедневный стрик')}: ${user.dailyBonusStreak || 1} ${t('header.days_short', 'дн.')}`
                : `${t('header.bonus', 'Бонус')}: ${t('header.streak_bonus_ready', 'доступна награда дня!')}`}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${
                user.lastDailyBonusClaim && isSameCalendarDayInTimezone(user.lastDailyBonusClaim, new Date())
                  ? 'bg-orange-950/40 border-orange-700/60 text-orange-300 hover:border-orange-500'
                  : 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white animate-pulse shadow-md shadow-orange-950/50'
              }`}
            >
              <Flame className="w-3.5 h-3.5 fill-current text-yellow-200" />
              <span>{user.dailyBonusStreak && user.dailyBonusStreak > 0 ? `${user.dailyBonusStreak} ${t('header.days_short', 'дн.')}` : t('header.bonus', 'Бонус')}</span>
            </button>
          )}

          {/* User Account / Profile */}
          {user ? (
            <button
              onClick={onOpenProfile}
              className="cyber-profile-badge flex items-center gap-2 px-2 py-1 rounded-lg border border-[var(--skin-border-base)] hover:border-[var(--skin-border-strong)] bg-[var(--skin-bg-card)] text-[var(--skin-text-secondary)] text-xs transition-colors cursor-pointer"
            >
              <div className="cyber-avatar-ring w-5 h-5 rounded-full bg-[var(--skin-accent-secondary)] flex items-center justify-center font-bold text-[10px] text-white">
                {user.displayName.slice(0, 1).toUpperCase()}
              </div>
              <span className="font-medium max-w-[100px] truncate">{user.displayName}</span>
              <span className="cyber-level-badge px-1.5 py-0.2 rounded-full bg-amber-950/80 border border-amber-600/60 text-[var(--skin-text-accent)] font-mono text-[10px] font-bold">
                {t('home.level_short', 'Ур.')} {user.level || 1}
              </span>
              <span className="text-[10px] text-[var(--skin-text-accent)] font-mono hidden sm:inline">{user.stats?.rating || 1200}</span>
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="skin-btn-primary flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>{t('header.login', 'Войти / Регистрация')}</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={() => {
              onToggleSound();
              sounds.playTick();
            }}
            title={soundEnabled ? t('header.sound_toggle', 'Выключить звук') : t('header.sound_toggle', 'Включить звук')}
            className="p-1.5 rounded border border-[var(--skin-border-base)] hover:border-[var(--skin-border-strong)] bg-[var(--skin-bg-card)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400 cyber-icon-cyan" /> : <VolumeX className="w-4 h-4 text-[var(--skin-text-muted)]" />}
          </button>

          {/* Theme Quick Toggle */}
          <button
            onClick={() => {
              sounds.playTick();
              setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
            }}
            title={resolvedTheme === 'dark' ? t('header.theme_light_tip', 'Переключить на светлую тему') : t('header.theme_dark_tip', 'Переключить на тёмную тему')}
            className="p-1.5 rounded border border-[var(--skin-border-base)] hover:border-[var(--skin-border-strong)] bg-[var(--skin-bg-card)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] transition-colors cursor-pointer"
          >
            {resolvedTheme === 'light' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-400" />}
          </button>

          {/* Detective Notebook */}
          {phase && phase !== 'LOBBY' && (
            <button
              onClick={onOpenNotebook}
              title={t('header.notebook', 'Блокнот детектива')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-amber-900/40 bg-amber-950/30 text-[var(--skin-text-accent)] hover:bg-amber-900/40 text-xs font-medium transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--skin-text-accent)]" />
              <span className="hidden md:inline">{t('header.notebook', 'Заметки')}</span>
            </button>
          )}

          {/* Leave Room Button */}
          {onLeaveRoom && (
            <button
              onClick={onLeaveRoom}
              className="px-2.5 py-1 rounded-xl border border-red-900/40 bg-red-950/30 text-red-300 hover:bg-red-900/40 text-xs font-medium transition-colors cursor-pointer"
            >
              {t('header.leave', 'Выйти')}
            </button>
          )}

          {/* Universal Notification Center Bell (Registered users only) */}
          {user && onOpenNotifications && (
            <NotificationBellButton
              unreadCount={unreadNotificationsCount || 0}
              hasNewAnimation={hasNewNotificationAnimation}
              onClick={onOpenNotifications}
            />
          )}

          {/* Hamburger Menu Drawer Button */}
          {onOpenMenu && (
            <button
              onClick={() => {
                sounds.playTick();
                onOpenMenu();
              }}
              title={t('header.menu', 'Меню')}
              className="p-1.5 rounded-xl bg-[var(--skin-bg-card)] border border-[var(--skin-border-base)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)] transition-colors cursor-pointer"
            >
              <Menu className="w-4 h-4 cyber-icon-cyan" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

