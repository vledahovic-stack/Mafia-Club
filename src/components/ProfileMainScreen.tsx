import React, { useState } from 'react';
import {
  Package,
  Trophy,
  Users,
  Gift,
  Shield,
  Coins,
  Edit3,
  Camera,
  Copy,
  Check,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  X,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  Award,
  Flame
} from 'lucide-react';
import { AuthUser } from './AuthModal';
import { LevelInfo } from '../utils/experience';
import { sounds } from '../utils/audio';

export type ProfilePrimaryScreenId =
  | 'main'
  | 'inventory'
  | 'progress'
  | 'friends'
  | 'promocodes'
  | 'account'
  | 'nickname'
  | 'avatar'
  | 'webrtc'
  | 'language';

/**
 * Computes the public 6-digit numeric game ID used across Mafia Club headers
 * (HomeView.tsx and InGameView.tsx).
 * Example: internal user.id 'usr_7nmq32ex' -> '456650'.
 */
export function getPublicPlayerId(rawId?: string | null): string {
  const idStr = typeof rawId === 'string' ? rawId : '';
  if (!idStr) return '';
  let hash = 0;
  for (let i = 0; i < idStr.length; i++) {
    hash = (hash * 37 + idStr.charCodeAt(i)) % 900000;
  }
  return String(Math.abs(hash) + 100000);
}

interface ProfileMainScreenProps {
  user: AuthUser;
  levelInfo: LevelInfo;
  userCredits: number;
  totalInventoryCount: number;
  friendsCount: number | null;
  pendingFriendsCount: number;
  friendsLoading: boolean;
  masteredRolesCount: number;
  streakDays: number;
  canClaimStreakToday: boolean;
  hasPromoInProgress: boolean;
  isPartnerBound: boolean;
  certificateCount: number;
  avatarCertificateCount: number;
  onSelectScreen: (screen: ProfilePrimaryScreenId) => void;
  onOpenNicknameChange: () => void;
  onOpenAvatarChange: () => void;
  onOpenShop?: () => void;
  onClose: () => void;
}

export const ProfileMainScreen: React.FC<ProfileMainScreenProps> = ({
  user,
  levelInfo,
  userCredits,
  totalInventoryCount,
  friendsCount,
  pendingFriendsCount,
  friendsLoading,
  masteredRolesCount,
  streakDays,
  canClaimStreakToday,
  hasPromoInProgress,
  isPartnerBound,
  certificateCount,
  avatarCertificateCount,
  onSelectScreen,
  onOpenNicknameChange,
  onOpenAvatarChange,
  onOpenShop,
  onClose
}) => {
  const [copiedId, setCopiedId] = useState(false);

  const hasValidStats = Boolean(user.stats && typeof user.stats === 'object');
  const gamesPlayed =
    hasValidStats && typeof user.stats?.gamesPlayed === 'number'
      ? Math.max(0, user.stats.gamesPlayed)
      : null;
  const gamesWon =
    hasValidStats && typeof user.stats?.gamesWon === 'number'
      ? Math.max(0, user.stats.gamesWon)
      : null;
  const eloRating =
    hasValidStats && typeof user.stats?.rating === 'number'
      ? user.stats.rating
      : 1200;

  const winRate =
    gamesPlayed !== null && gamesWon !== null
      ? gamesPlayed > 0
        ? Math.round((gamesWon / gamesPlayed) * 100)
        : 0
      : null;

  const publicPlayerId = React.useMemo(() => getPublicPlayerId(user?.id), [user?.id]);

  const handleCopyUserId = async () => {
    if (!publicPlayerId) return;
    try {
      await navigator.clipboard.writeText(publicPlayerId);
      sounds.playTick();
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Fallback copy if clipboard API is restricted
      try {
        const textArea = document.createElement('textarea');
        textArea.value = publicPlayerId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        sounds.playTick();
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
      } catch {
        // ignore
      }
    }
  };

  // Determine avatar display value (preserving existing seed behavior while supporting multi-codepoint emojis)
  const avatarGlyphs = user.avatarSeed ? Array.from(user.avatarSeed.trim()) : [];
  const isCustomShortAvatar =
    Boolean(user.avatarSeed) &&
    user.avatarSeed.trim() !== user.displayName.trim() &&
    avatarGlyphs.length > 0 &&
    avatarGlyphs.length <= 4;
  const avatarDisplay = isCustomShortAvatar
    ? user.avatarSeed.trim()
    : (user.displayName || '?').slice(0, 1).toUpperCase();

  const menuItems: Array<{
    id: ProfilePrimaryScreenId;
    title: string;
    subtitle: string;
    icon: React.ElementType;
    metaText: string;
    alertText?: string | null;
  }> = [
    {
      id: 'inventory',
      title: 'Инвентарь',
      subtitle: 'Экипировка, сундуки, сертификаты, косметика и каталог предметов',
      icon: Package,
      metaText: `${totalInventoryCount} предм.`
    },
    {
      id: 'progress',
      title: 'Прогресс и статистика',
      subtitle: 'Прогресс игрока, общая статистика, мастерство ролей, история матчей и награды',
      icon: Trophy,
      metaText: `Ур. ${levelInfo.level} · ${eloRating} Elo${masteredRolesCount > 0 ? ` · 👑 ${masteredRolesCount}` : ''}`
    },
    {
      id: 'friends',
      title: 'Друзья',
      subtitle: 'Список друзей, онлайн-статусы, заявки и приглашения в комнату',
      icon: Users,
      metaText: friendsLoading
        ? 'Загрузка...'
        : friendsCount !== null
          ? `${friendsCount} друз.`
          : 'Список друзей',
      alertText: pendingFriendsCount > 0 ? `+${pendingFriendsCount} заяв.` : null
    },
    {
      id: 'promocodes',
      title: 'Промокоды и партнёрство',
      subtitle: 'Активация кодов, реферальная привязка и прогресс наград',
      icon: Gift,
      metaText: hasPromoInProgress
        ? 'Награды в прогрессе'
        : isPartnerBound
          ? 'Партнёр привязан'
          : 'Коды и рефералы'
    },
    {
      id: 'account',
      title: 'Аккаунт',
      subtitle: 'Электронная почта, статус подтверждения, смена данных и выход',
      icon: Shield,
      metaText: user.isEmailVerified ? 'Почта подтверждена' : 'Почта не подтверждена',
      alertText: !user.isEmailVerified ? 'Подтвердить' : null
    }
  ];

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-150">
      {/* ================= EXTENDED PLAYER CARD (РАСШИРЕННАЯ КАРТОЧКА ИГРОКА) ================= */}
      <section
        style={{
          backgroundColor: 'var(--skin-bg-card)',
          borderColor: 'var(--skin-border-accent)',
          boxShadow: 'var(--skin-shadow-card)'
        }}
        className="skin-card rounded-2xl border p-4 sm:p-6 space-y-4 sm:space-y-5 relative overflow-hidden"
      >
        {/* Top Row: Identity (Avatar + Nickname + Player ID) & Balance Block */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          {/* Left: Avatar + Nickname + Clan/Title + Copyable ID */}
          <div className="flex items-start gap-3.5 sm:gap-4 min-w-0">
            {/* 1. Interactive Avatar -> Opens Avatar Change Screen */}
            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                onOpenAvatarChange();
              }}
              title="Нажмите, чтобы сменить аватар профиля"
              style={{
                background: 'var(--skin-btn-primary-bg)',
                borderColor: 'var(--skin-border-accent)',
                boxShadow: 'var(--skin-glow-accent)'
              }}
              className="cyber-avatar-ring relative group w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-white font-bold text-2xl sm:text-3xl border shrink-0 cursor-pointer overflow-hidden transition-transform active:scale-95"
            >
              <span className="drop-shadow-md select-none">{avatarDisplay}</span>
              <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-0.5 text-[10px] text-[var(--skin-accent-secondary)] font-bold transition-opacity">
                <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--skin-accent-secondary)]" />
                <span>Аватар</span>
              </div>
              {avatarCertificateCount > 0 && (
                <span
                  title={`Доступно сертификатов смены аватара: ${avatarCertificateCount} шт.`}
                  className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[9px] font-mono text-purple-300 border border-purple-500/50"
                >
                  🎭 {avatarCertificateCount}
                </span>
              )}
            </button>

            {/* 2 & 3. Nickname (Clickable -> Opens Nickname Change) + Clan/Cosmetic Title + Player ID */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    onOpenNicknameChange();
                  }}
                  title="Нажмите, чтобы сменить игровой никнейм"
                  className="group inline-flex items-center gap-1.5 text-left max-w-full cursor-pointer rounded-lg px-1.5 py-0.5 -ml-1.5 hover:bg-[var(--skin-bg-subcard)] transition-colors"
                >
                  <span className="text-lg sm:text-xl font-bold text-[var(--skin-text-primary)] tracking-tight truncate">
                    {user.displayName}
                  </span>
                  <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--skin-text-muted)] group-hover:text-[var(--skin-accent-primary)] shrink-0 transition-colors" />
                  {certificateCount > 0 && (
                    <span
                      title={`Доступно сертификатов смены никнейма: ${certificateCount} шт.`}
                      className="text-[10px] font-mono text-blue-300 bg-blue-950/70 border border-blue-700/50 px-1.5 py-0.2 rounded shrink-0"
                    >
                      📜 {certificateCount}
                    </span>
                  )}
                </button>

                {user.clanTag && (
                  <span
                    className="text-xs font-mono font-bold text-amber-300"
                    title={
                      user.clanName
                        ? `Клан: ${user.clanName} (${user.clanRole === 'leader' ? 'Лидер' : 'Участник'})`
                        : undefined
                    }
                  >
                    [{user.clanTag}]
                  </span>
                )}

                {user.equippedCosmetics?.title && (
                  <span className="text-xs font-medium text-[var(--skin-accent-secondary)]">
                    · {user.equippedCosmetics.title}
                  </span>
                )}
              </div>

              {/* 3. Unique Public Player ID with Copy Action */}
              <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--skin-text-secondary)]">
                <span className="font-mono text-[11px] sm:text-xs text-[var(--skin-text-muted)] select-all">
                  ID: <strong className="text-[var(--skin-text-secondary)] font-mono tabular-nums">{publicPlayerId || '—'}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleCopyUserId}
                  title="Скопировать публичный игровой ID"
                  style={{
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: copiedId ? 'var(--skin-border-accent)' : 'var(--skin-border-base)',
                    color: copiedId ? 'var(--skin-accent-primary)' : 'var(--skin-text-secondary)'
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium hover:text-[var(--skin-text-primary)] transition-colors cursor-pointer shrink-0"
                >
                  {copiedId ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-300">Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Копировать ID</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Email status line */}
              <div className="flex items-center gap-2 text-xs text-[var(--skin-text-muted)]">
                <span className="truncate max-w-[220px] sm:max-w-xs font-mono text-[11px]">{user.email}</span>
                <span aria-hidden="true">·</span>
                {user.isEmailVerified ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Подтверждён</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playTick();
                      onSelectScreen('account');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-semibold underline underline-offset-2 cursor-pointer"
                  >
                    <AlertCircle className="w-3 h-3" />
                    <span>Подтвердить почту</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 11. Credits Balance Block (next to core player info, outside inventory) */}
          <div
            style={{
              backgroundColor: 'var(--skin-bg-subcard)',
              borderColor: 'var(--skin-border-base)'
            }}
            className="p-3 sm:px-4 sm:py-3 rounded-xl border flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0"
          >
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--skin-text-muted)] sm:text-right">
                Баланс кредитов
              </div>
              <div className="text-base sm:text-lg font-mono font-bold tabular-nums text-amber-400 flex items-center sm:justify-end gap-1.5 mt-0.5">
                <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{userCredits.toLocaleString('ru-RU')} кр</span>
              </div>
            </div>
            {onOpenShop && (
              <button
                type="button"
                onClick={() => {
                  sounds.playTick();
                  onClose();
                  onOpenShop();
                }}
                style={{
                  backgroundColor: 'var(--skin-bg-elevated)',
                  borderColor: 'var(--skin-border-accent)',
                  color: 'var(--skin-accent-secondary)'
                }}
                className="px-2.5 py-1 rounded-lg border text-[11px] font-bold hover:brightness-110 transition-all flex items-center gap-1 cursor-pointer shrink-0"
              >
                <ShoppingBag className="w-3 h-3" />
                <span>Магазин</span>
              </button>
            )}
          </div>
        </div>

        {/* Middle Row: 4. Current Level & 6. XP Progress Scale */}
        <div
          style={{
            backgroundColor: 'var(--skin-bg-subcard)',
            borderColor: 'var(--skin-border-subtle)'
          }}
          className="p-3.5 rounded-xl border space-y-2"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">{levelInfo.badgeIcon}</span>
              <span className="text-xs sm:text-sm font-bold text-[var(--skin-text-primary)] tabular-nums">
                Уровень {levelInfo.level}
              </span>
              <span className="text-xs text-[var(--skin-text-muted)]" aria-hidden="true">
                ·
              </span>
              <span className="text-xs sm:text-sm font-semibold text-[var(--skin-accent-primary)]">
                {levelInfo.title}
              </span>
            </div>

            <div className="text-xs font-mono tabular-nums text-[var(--skin-text-secondary)]">
              <strong className="text-[var(--skin-accent-primary)]">
                {levelInfo.xpInCurrentLevel.toLocaleString('ru-RU')} / {levelInfo.xpNeededForNextLevel.toLocaleString('ru-RU')} XP
              </strong>{' '}
              ({levelInfo.progressPercent}%)
            </div>
          </div>

          {/* XP Progress Bar */}
          <div
            style={{
              backgroundColor: 'var(--skin-bg-slot)',
              borderColor: 'var(--skin-border-base)'
            }}
            className="w-full h-2.5 rounded-full overflow-hidden border relative"
          >
            <div
              style={{
                width: `${Math.max(2, levelInfo.progressPercent)}%`,
                background: 'var(--skin-btn-primary-bg)'
              }}
              className="h-full rounded-full transition-all duration-500"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[var(--skin-text-muted)]">
            <span>Всего опыта: {levelInfo.totalXp.toLocaleString('ru-RU')} XP</span>
            <span>До ур. {levelInfo.level + 1}: {levelInfo.remainingXpToNextLevel.toLocaleString('ru-RU')} XP</span>
          </div>
        </div>

        {/* Bottom Row: Key Quantitative Metrics Grid (5. Elo, 7. Matches, 8. Wins, 9. Win Rate, 10. Friends) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {/* 5. Рейтинг Elo */}
          <div
            style={{
              backgroundColor: 'var(--skin-bg-subcard)',
              borderColor: 'var(--skin-border-base)'
            }}
            className="p-3 rounded-xl border space-y-0.5"
          >
            <div className="text-[11px] text-[var(--skin-text-secondary)] flex items-center justify-between">
              <span>Рейтинг Elo</span>
              <Trophy className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
            </div>
            <div className="text-base sm:text-lg font-mono font-bold tabular-nums text-[var(--skin-text-primary)]">
              {eloRating}
            </div>
          </div>

          {/* 7. Сыграно матчей */}
          <div
            style={{
              backgroundColor: 'var(--skin-bg-subcard)',
              borderColor: 'var(--skin-border-base)'
            }}
            className="p-3 rounded-xl border space-y-0.5"
          >
            <div className="text-[11px] text-[var(--skin-text-secondary)] flex items-center justify-between">
              <span>Матчей</span>
              <Sparkles className="w-3.5 h-3.5 text-[var(--skin-text-muted)]" />
            </div>
            <div className="text-base sm:text-lg font-mono font-bold tabular-nums text-[var(--skin-text-primary)]">
              {gamesPlayed !== null ? gamesPlayed : '—'}
            </div>
          </div>

          {/* 8. Количество побед */}
          <div
            style={{
              backgroundColor: 'var(--skin-bg-subcard)',
              borderColor: 'var(--skin-border-base)'
            }}
            className="p-3 rounded-xl border space-y-0.5"
          >
            <div className="text-[11px] text-[var(--skin-text-secondary)] flex items-center justify-between">
              <span>Победы</span>
              <Award className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-base sm:text-lg font-mono font-bold tabular-nums text-emerald-400">
              {gamesWon !== null ? gamesWon : '—'}
            </div>
          </div>

          {/* 9. Процент побед */}
          <div
            style={{
              backgroundColor: 'var(--skin-bg-subcard)',
              borderColor: 'var(--skin-border-base)'
            }}
            className="p-3 rounded-xl border space-y-0.5"
          >
            <div className="text-[11px] text-[var(--skin-text-secondary)] flex items-center justify-between">
              <span>Винрейт</span>
              <Flame className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-base sm:text-lg font-mono font-bold tabular-nums text-[var(--skin-text-primary)]">
              {winRate !== null ? `${winRate}%` : '—'}
            </div>
          </div>

          {/* 10. Количество друзей */}
          <div
            style={{
              backgroundColor: 'var(--skin-bg-subcard)',
              borderColor: 'var(--skin-border-base)'
            }}
            className="col-span-2 sm:col-span-1 p-3 rounded-xl border space-y-0.5"
          >
            <div className="text-[11px] text-[var(--skin-text-secondary)] flex items-center justify-between">
              <span>Друзья</span>
              <Users className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
            </div>
            <div className="text-base sm:text-lg font-mono font-bold tabular-nums text-[var(--skin-text-primary)]">
              {friendsLoading ? '...' : friendsCount !== null ? friendsCount : '—'}
            </div>
          </div>
        </div>
      </section>

      {/* ================= MAIN PROFILE MENU (5 ОСНОВНЫХ РАЗДЕЛОВ) ================= */}
      <nav aria-label="Основные разделы профиля" className="space-y-2.5">
        <div className="px-1 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-secondary)]">
            Разделы профиля
          </h4>
          <span className="text-[11px] text-[var(--skin-text-muted)]">
            Выберите раздел для перехода
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  sounds.playTick();
                  onSelectScreen(item.id);
                }}
                style={{
                  backgroundColor: 'var(--skin-bg-card)',
                  borderColor: 'var(--skin-border-card)'
                }}
                className="skin-card group w-full p-3.5 sm:p-4 rounded-2xl border text-left flex items-center justify-between gap-3.5 transition-all hover:border-[var(--skin-border-accent)] active:scale-[0.995] cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    style={{
                      backgroundColor: 'var(--skin-bg-subcard)',
                      borderColor: 'var(--skin-border-accent)',
                      color: 'var(--skin-accent-primary)'
                    }}
                    className="w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm sm:text-base font-bold text-[var(--skin-text-primary)] group-hover:text-[var(--skin-accent-secondary)] transition-colors">
                        {item.title}
                      </span>
                      {item.alertText && (
                        <span className="text-[11px] font-semibold text-amber-400">
                          · {item.alertText}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--skin-text-secondary)] truncate mt-0.5">
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-xs font-mono tabular-nums text-[var(--skin-text-secondary)] hidden sm:inline">
                    {item.metaText}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--skin-text-muted)] group-hover:text-[var(--skin-accent-primary)] group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

interface ProfileScreenHeaderProps {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  onBackToMain: () => void;
  onClose: () => void;
  rightSlot?: React.ReactNode;
}

export const ProfileScreenHeader: React.FC<ProfileScreenHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  onBackToMain,
  onClose,
  rightSlot
}) => {
  return (
    <header
      style={{
        background: 'var(--skin-bg-header)',
        borderColor: 'var(--skin-border-header)'
      }}
      className="skin-header px-3.5 sm:px-6 py-3 sm:py-3.5 border-b flex items-center justify-between gap-3 shrink-0"
    >
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            onBackToMain();
          }}
          style={{
            backgroundColor: 'var(--skin-bg-subcard)',
            borderColor: 'var(--skin-border-accent)',
            color: 'var(--skin-text-primary)'
          }}
          className="px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 hover:border-[var(--skin-accent-primary)] transition-colors shrink-0 cursor-pointer"
          title="Вернуться на главный экран профиля"
        >
          <ArrowLeft className="w-4 h-4 text-[var(--skin-accent-primary)]" />
          <span>Назад в профиль</span>
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <div
            style={{
              backgroundColor: 'var(--skin-bg-subcard)',
              borderColor: 'var(--skin-border-base)',
              color: 'var(--skin-accent-primary)'
            }}
            className="hidden sm:flex w-8 h-8 rounded-lg border items-center justify-center shrink-0"
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-[var(--skin-text-primary)] truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-[var(--skin-text-secondary)] truncate hidden sm:block">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {rightSlot}
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'var(--skin-btn-secondary-bg)',
            borderColor: 'var(--skin-btn-secondary-border)',
            color: 'var(--skin-text-secondary)'
          }}
          className="p-1.5 sm:p-2 rounded-xl border hover:text-[var(--skin-text-primary)] transition-colors cursor-pointer"
          title="Закрыть профиль"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
