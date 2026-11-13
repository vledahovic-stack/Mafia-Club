import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Clock,
  Crown,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  RotateCcw,
  ShieldAlert,
  Trash2,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';
import { AuthUser } from './AuthModal';
import { useLanguage } from '../context/LanguageContext';
import { reauthenticateWithGoogleFresh } from '../firebase';
import { sounds } from '../utils/audio';
import { resolveAccountDeletionErrorMessage } from '../utils/accountDeletionUi';

function getAvatarDisplay(avatarSeed: string | undefined, displayName: string): string {
  const cleanSeed = (avatarSeed || '').trim();
  const cleanName = (displayName || '').trim();
  const glyphs = cleanSeed ? Array.from(cleanSeed) : [];
  const isCustomShortAvatar =
    Boolean(cleanSeed) &&
    cleanSeed !== cleanName &&
    glyphs.length > 0 &&
    glyphs.length <= 4;

  if (isCustomShortAvatar) {
    return cleanSeed;
  }
  return (cleanName || '?').slice(0, 1).toUpperCase();
}

interface ClanMemberSummary {
  userId: string;
  displayName: string;
  avatarSeed?: string;
  role: 'leader' | 'member';
  rating?: number;
}

interface ClanSummary {
  id: string;
  name: string;
  tag: string;
  leaderId: string;
  members: ClanMemberSummary[];
}

interface RestrictedAccountViewProps {
  user: AuthUser;
  onUserUpdated: (updatedUser: AuthUser) => void;
  onLogout: () => void;
}

function formatCountdown(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return days > 0 ? `${days}д ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export const RestrictedAccountView: React.FC<RestrictedAccountViewProps> = ({
  user,
  onUserUpdated,
  onLogout,
}) => {
  const { t, language } = useLanguage();
  const deletion = user.deletionState;

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [clan, setClan] = useState<ClanSummary | null>(null);
  const [loadingClan, setLoadingClan] = useState<boolean>(false);
  const [selectedSuccessorId, setSelectedSuccessorId] = useState<string>('');
  const [isTransferringLeadership, setIsTransferringLeadership] = useState<boolean>(false);

  // Immediate (0-day) upgrade controls for scheduled requests
  const [showImmediateUpgradeForm, setShowImmediateUpgradeForm] = useState<boolean>(false);
  const [immediateReauthMethod, setImmediateReauthMethod] = useState<'password' | 'google'>(() =>
    user.hasPassword === false ? 'google' : 'password'
  );
  const [immediatePasswordInput, setImmediatePasswordInput] = useState<string>('');
  const [isSubmittingImmediate, setIsSubmittingImmediate] = useState<boolean>(false);

  const isClanLeader = Boolean(user.clanId && user.clanRole === 'leader');
  const isProcessing = deletion?.status === 'processing';
  const isImmediate = deletion?.gracePeriodDays === 0;
  const physicalDeletionEnabled = deletion?.physicalDeletionEnabled === true;
  const hasLocalPassword = user.hasPassword !== false;

  useEffect(() => {
    setImmediateReauthMethod(hasLocalPassword ? 'password' : 'google');
    setImmediatePasswordInput('');
  }, [hasLocalPassword, user.id]);

  // Live 1-second timer tick while scheduled purge date is pending
  useEffect(() => {
    if (!deletion?.scheduledPurgeAt || isImmediate || isProcessing) return;
    setNowMs(Date.now());
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [deletion?.scheduledPurgeAt, isImmediate, isProcessing]);

  // Load clan details ONLY when user is currently clan leader
  const fetchMyClan = useCallback(async () => {
    if (!isClanLeader) {
      setClan(null);
      return;
    }
    const token = localStorage.getItem('mafia_auth_token');
    if (!token) return;

    setLoadingClan(true);
    try {
      const res = await fetch('/api/clans/my', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const loadedClan: ClanSummary | null = data?.clan || null;
        setClan(loadedClan);
        if (loadedClan && Array.isArray(loadedClan.members)) {
          const candidates = loadedClan.members.filter(m => m.userId !== user.id);
          setSelectedSuccessorId(prev =>
            prev && candidates.some(c => c.userId === prev) ? prev : candidates[0]?.userId || ''
          );
        }
      }
    } catch {
      // Ignore transient error
    } finally {
      setLoadingClan(false);
    }
  }, [isClanLeader, user.id]);

  useEffect(() => {
    fetchMyClan();
  }, [fetchMyClan]);

  const handleCancelDeletion = async () => {
    const token = localStorage.getItem('mafia_auth_token');
    if (!token) return;

    setActionError(null);
    setActionSuccess(null);
    setIsCancelling(true);
    sounds.playTick();

    try {
      const res = await fetch('/api/account/deletion-cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(resolveAccountDeletionErrorMessage(data, t, t('deletion.cancel_error', 'Не удалось отменить удаление аккаунта.')));
        return;
      }

      // Refresh full user profile so deletionState becomes cleared/cancelled immediately
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json().catch(() => null);
        if (meData?.user) {
          onUserUpdated(meData.user);
          return;
        }
      }

      onUserUpdated({
        ...user,
        deletionState: data?.deletion || null,
      });
    } catch {
      setActionError(t('deletion.cancel_error', 'Не удалось отменить удаление аккаунта.'));
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRequestImmediateDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    if (!physicalDeletionEnabled) {
      setActionError(
        t(
          'deletion.immediate_upgrade_disabled',
          'Немедленное удаление временно недоступно: автоматическая физическая очистка данных на сервере пока отключена.'
        )
      );
      return;
    }

    const token = localStorage.getItem('mafia_auth_token');
    if (!token) {
      window.dispatchEvent(new CustomEvent('mafia_session_revoked'));
      return;
    }

    const payload: Record<string, any> = { gracePeriodDays: 0 };
    setIsSubmittingImmediate(true);
    sounds.playTick();

    try {
      if (immediateReauthMethod === 'google') {
        try {
          payload.googleIdToken = await reauthenticateWithGoogleFresh(user.email);
        } catch (googleErr: unknown) {
          setActionError(
            googleErr instanceof Error && googleErr.message
              ? googleErr.message
              : t('deletion.err_google_popup', 'Не удалось завершить повторный вход через Google.')
          );
          setIsSubmittingImmediate(false);
          return;
        }
      } else {
        if (!immediatePasswordInput) {
          setActionError(t('deletion.err_password_required', 'Введите действующий пароль для подтверждения.'));
          setIsSubmittingImmediate(false);
          return;
        }
        payload.password = immediatePasswordInput;
      }

      const res = await fetch('/api/account/deletion-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(resolveAccountDeletionErrorMessage(data, t));
        return;
      }

      setImmediatePasswordInput('');
      setShowImmediateUpgradeForm(false);

      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json().catch(() => null);
        if (meData?.user) {
          onUserUpdated(meData.user);
          return;
        }
      }

      onUserUpdated({
        ...user,
        deletionState: data?.deletion ?? user.deletionState ?? null,
      });
    } catch {
      setActionError(t('common.error', 'Ошибка соединения с сервером.'));
    } finally {
      setIsSubmittingImmediate(false);
    }
  };

  const handleTransferLeadership = async () => {
    if (!selectedSuccessorId || !isClanLeader) return;
    const token = localStorage.getItem('mafia_auth_token');
    if (!token) return;

    setActionError(null);
    setActionSuccess(null);
    setIsTransferringLeadership(true);
    sounds.playTick();

    try {
      const res = await fetch('/api/clans/transfer-leadership', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newLeaderUserId: selectedSuccessorId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || 'Не удалось передать лидерство клана.');
        return;
      }

      setActionSuccess(t('deletion.clan_transfer_success', 'Лидерство клана успешно передано.'));
      setClan(data?.clan || null);
      if (data?.user) {
        onUserUpdated(data.user);
      } else {
        onUserUpdated({ ...user, clanRole: 'member' });
      }
    } catch {
      setActionError('Ошибка соединения при передаче лидерства клана.');
    } finally {
      setIsTransferringLeadership(false);
    }
  };

  const scheduledDateMs = deletion?.scheduledPurgeAt ? new Date(deletion.scheduledPurgeAt).getTime() : NaN;
  const remainingMs = Number.isFinite(scheduledDateMs)
    ? Math.max(0, scheduledDateMs - nowMs)
    : deletion?.remainingMs ?? 0;

  const formattedScheduledDate = Number.isFinite(scheduledDateMs)
    ? new Intl.DateTimeFormat(language === 'en' ? 'en-US' : language === 'uk' ? 'uk-UA' : 'ru-RU', {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(new Date(scheduledDateMs))
    : '—';

  const initiatorText =
    deletion?.initiatorType === 'admin'
      ? t('deletion.initiator_admin', 'Администрация Mafia Club')
      : t('deletion.initiator_self', 'Самостоятельный запрос владельца');

  const transferCandidates = (clan?.members || []).filter(m => m.userId !== user.id);

  return (
    <main
      role="main"
      className="min-h-screen flex items-center justify-center px-4 py-8 bg-[var(--skin-bg-canvas)] text-[var(--skin-text-primary)]"
    >
      <div className="skin-modal w-full max-w-xl rounded-[var(--skin-radius-modal)] bg-[var(--skin-bg-modal)] border border-red-800/60 shadow-[var(--skin-shadow-modal)] overflow-hidden">
        {/* Top Warning Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-red-950/80 via-[var(--skin-bg-elevated)] to-[var(--skin-bg-modal)] border-b border-red-900/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[var(--skin-bg-elevated)] border border-red-700/60 flex items-center justify-center text-lg font-black text-[var(--skin-text-primary)] shrink-0 shadow-inner">
              {getAvatarDisplay(user.avatarSeed, user.displayName)}
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-950/90 border border-red-700/70 text-red-300 text-[10px] font-mono font-bold uppercase tracking-wider mb-1">
                <ShieldAlert className="w-3 h-3 shrink-0" />
                <span>{t('deletion.restricted_badge', 'Аккаунт ожидает удаления')}</span>
              </div>
              <h1 className="text-lg font-black tracking-tight text-[var(--skin-text-primary)] truncate">
                {user.displayName}
              </h1>
              <p className="text-xs text-[var(--skin-text-muted)] truncate">{user.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              onLogout();
            }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--skin-btn-secondary-bg)] hover:bg-[var(--skin-bg-elevated)] border border-[var(--skin-btn-secondary-border)] text-[var(--skin-btn-secondary-text)] text-xs font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t('deletion.logout_btn', 'Выйти из аккаунта')}</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Mandatory Restriction Notice */}
          <div className="p-4 rounded-2xl bg-red-950/35 border border-red-800/55 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <h2 className="text-sm font-bold text-red-200">
                {t('deletion.restricted_title', 'Доступ к аккаунту ограничен')}
              </h2>
              <p className="text-xs text-red-100/90 leading-relaxed">
                {isProcessing
                  ? t(
                      'deletion.processing_notice',
                      'Выполняется окончательная обработка удаления аккаунта. Доступ к функциям заблокирован.'
                    )
                  : t(
                      'deletion.restricted_notice',
                      'Ваш аккаунт ожидает удаления. До завершения процедуры игровые и другие функции недоступны. Вы можете отменить удаление до начала окончательной очистки данных'
                    )}
              </p>
            </div>
          </div>

          {/* Request Metadata & Countdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)]">
              <div className="text-[11px] text-[var(--skin-text-muted)] uppercase tracking-wider font-mono">
                {t('deletion.initiator_label', 'Инициатор')}
              </div>
              <div className="text-xs font-bold text-[var(--skin-text-primary)] mt-1">
                {initiatorText}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)]">
              <div className="text-[11px] text-[var(--skin-text-muted)] uppercase tracking-wider font-mono">
                {t('deletion.grace_period_label', 'Срок ожидания')}
              </div>
              <div className="text-xs font-bold text-[var(--skin-text-primary)] mt-1">
                {isImmediate
                  ? t('deletion.zero_grace_label', 'Запрос на немедленное удаление (0 дней)')
                  : `${deletion?.gracePeriodDays ?? 0} ${t('deletion.grace_days_unit', 'дн.')}`}
              </div>
            </div>
          </div>

          {isImmediate ? (
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-700/50 text-xs text-amber-200 leading-relaxed">
              {t(
                'deletion.zero_grace_hint',
                'Срок ожидания не установлен: аккаунт ожидает этапа окончательной очистки данных. Физическое удаление пока не выполнено — вы всё ещё можете отменить запрос.'
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[var(--skin-text-muted)]">
                  {t('deletion.scheduled_at_label', 'Плановая дата удаления')}:
                </span>
                <span className="font-semibold text-[var(--skin-text-primary)]">{formattedScheduledDate}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--skin-border-base)]">
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--skin-text-secondary)]">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  {t('deletion.countdown_label', 'До истечения срока ожидания')}:
                </span>
                <span className="font-mono font-black text-sm text-amber-300">
                  {formatCountdown(remainingMs)}
                </span>
              </div>
              {remainingMs === 0 && !isProcessing && (
                <p className="text-[11px] text-amber-300/90 pt-1">
                  {t('deletion.due_hint', 'Срок ожидания истёк. Аккаунт ожидает окончательной очистки данных.')}
                </p>
              )}
            </div>
          )}

          {/* Error / Success Feedback */}
          {actionError && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-700 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{actionError}</span>
            </div>
          )}
          {actionSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/70 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Conditional Clan Leadership Transfer (ONLY if current user is clan leader) */}
          {isClanLeader && !isProcessing && (
            <div className="p-4 rounded-2xl bg-[var(--skin-bg-elevated)] border border-amber-700/45 space-y-3">
              <div className="flex items-start gap-2.5">
                <Crown className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold text-[var(--skin-text-primary)] uppercase tracking-wider">
                    {t('deletion.clan_transfer_title', 'Передача лидерства в клане')}
                    {clan ? ` [${clan.tag}]` : ''}
                  </h3>
                  <p className="text-[11px] text-[var(--skin-text-secondary)] mt-1 leading-relaxed">
                    {t(
                      'deletion.clan_transfer_desc',
                      'Вы являетесь лидером клана. До удаления аккаунта вы можете передать права лидера другому участнику клана.'
                    )}
                  </p>
                </div>
              </div>

              {loadingClan ? (
                <div className="flex items-center gap-2 text-xs text-[var(--skin-text-muted)] py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('common.loading', 'Загрузка...')}</span>
                </div>
              ) : transferCandidates.length === 0 ? (
                <p className="text-xs text-[var(--skin-text-muted)]">
                  {t(
                    'deletion.clan_transfer_empty',
                    'В клане нет других участников, которым можно передать лидерство.'
                  )}
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    aria-label={t('deletion.clan_transfer_select_label', 'Новый лидер клана')}
                    value={selectedSuccessorId}
                    onChange={e => setSelectedSuccessorId(e.target.value)}
                    disabled={isTransferringLeadership}
                    className="flex-1 px-3 py-2 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-strong)] text-xs text-[var(--skin-text-primary)] focus:outline-none focus:border-amber-500"
                  >
                    {transferCandidates.map(member => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName} (Elo: {member.rating ?? 1000})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleTransferLeadership}
                    disabled={!selectedSuccessorId || isTransferringLeadership}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
                  >
                    {isTransferringLeadership ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{t('deletion.clan_transferring_btn', 'Передача прав...')}</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>{t('deletion.clan_transfer_btn', 'Передать лидерство')}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Immediate Deletion Upgrade Option (when currently scheduled > 0 days) */}
          {deletion?.status === 'scheduled' && !isImmediate && !isProcessing && (
            <div className="p-4 rounded-2xl bg-[var(--skin-bg-subcard)] border border-rose-900/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs font-bold text-[var(--skin-text-primary)] uppercase tracking-wider">
                      {t('deletion.immediate_upgrade_title', 'Переход к немедленному удалению')}
                    </h3>
                    {!physicalDeletionEnabled && (
                      <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold uppercase">
                        {t('deletion.mode_immediate_disabled_badge', 'Отключено на сервере')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--skin-text-secondary)] leading-relaxed">
                    {physicalDeletionEnabled
                      ? t(
                          'deletion.immediate_upgrade_desc',
                          'Вы можете заменить оставшийся срок ожидания на немедленное удаление (0 дней) после повторного подтверждения личности.'
                        )
                      : t(
                          'deletion.immediate_upgrade_disabled',
                          'Немедленное удаление временно недоступно: автоматическая физическая очистка данных на сервере пока отключена.'
                        )}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!physicalDeletionEnabled || isSubmittingImmediate || isCancelling}
                  onClick={() => {
                    setActionError(null);
                    setImmediatePasswordInput('');
                    setShowImmediateUpgradeForm(prev => !prev);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-700/70 bg-rose-950/60 hover:bg-rose-900/70 disabled:opacity-50 disabled:cursor-not-allowed text-rose-200 text-xs font-bold transition-colors cursor-pointer shrink-0 min-h-[38px]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('deletion.immediate_upgrade_btn', 'Запросить немедленное удаление')}</span>
                </button>
              </div>

              {physicalDeletionEnabled && showImmediateUpgradeForm && (
                <form
                  onSubmit={handleRequestImmediateDeletion}
                  className="pt-3 border-t border-[var(--skin-border-base)] space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('deletion.reauth_title', 'Повторное подтверждение личности')}</span>
                    </span>
                    {hasLocalPassword && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          setImmediatePasswordInput('');
                          setImmediateReauthMethod(prev => (prev === 'password' ? 'google' : 'password'));
                        }}
                        disabled={isSubmittingImmediate}
                        className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer"
                      >
                        {immediateReauthMethod === 'password'
                          ? t('deletion.reauth_switch_to_google', 'Или подтвердить через Google')
                          : t('deletion.reauth_switch_to_password', 'Подтвердить паролем')}
                      </button>
                    )}
                  </div>

                  {immediateReauthMethod === 'password' && hasLocalPassword ? (
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[var(--skin-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={immediatePasswordInput}
                        onChange={e => setImmediatePasswordInput(e.target.value)}
                        placeholder={t('deletion.reauth_password_placeholder', 'Введите текущий пароль')}
                        disabled={isSubmittingImmediate}
                        className="skin-input w-full pl-9 pr-3 py-2 rounded-xl border text-xs"
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-[var(--skin-text-secondary)] leading-relaxed">
                      {t(
                        'deletion.reauth_google_desc',
                        'Для подтверждения операции потребуется повторный вход в ваш аккаунт Google.'
                      )}{' '}
                      (<span className="font-mono">{user.email}</span>)
                    </p>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowImmediateUpgradeForm(false);
                        setImmediatePasswordInput('');
                      }}
                      disabled={isSubmittingImmediate}
                      className="skin-btn-secondary flex-1 py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer"
                    >
                      {t('common.cancel', 'Отмена')}
                    </button>
                    <button
                      type="submit"
                      disabled={
                        isSubmittingImmediate ||
                        (immediateReauthMethod === 'password' && !immediatePasswordInput)
                      }
                      className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isSubmittingImmediate ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{t('deletion.submitting_btn', 'Обработка запроса...')}</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t('deletion.immediate_upgrade_confirm_btn', 'Подтвердить немедленное удаление')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Cancel Account Deletion Primary Action */}
          {deletion?.canCancel && !isProcessing && (
            <button
              type="button"
              onClick={handleCancelDeletion}
              disabled={isCancelling || isSubmittingImmediate}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('deletion.cancelling_btn', 'Отмена запроса...')}</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>{t('deletion.cancel_btn', 'Отменить удаление аккаунта')}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </main>
  );
};
