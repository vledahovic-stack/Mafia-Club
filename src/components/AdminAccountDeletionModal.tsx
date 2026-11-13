import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  Lock,
  RotateCcw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type { AccountDeletionClientState, AuthUser } from './AuthModal';
import { useLanguage } from '../context/LanguageContext';
import { reauthenticateWithGoogleFresh } from '../firebase';
import { sounds } from '../utils/audio';
import {
  computePredictedPurgeDate,
  formatDeletionDateTime,
  getDeletionStatusBadgeMeta,
  isAdminAccountUser,
  isMainAdminUser,
  resolveAccountDeletionErrorMessage,
} from '../utils/accountDeletionUi';
import { getPublicPlayerId } from './ProfileMainScreen';

export interface AdminDeletionTargetUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'moderator' | 'user';
  isAdmin: boolean;
  canDeleteAccounts?: boolean;
  inActiveMatch?: boolean;
  deletionState?: AccountDeletionClientState | null;
}

interface AdminAccountDeletionModalProps {
  isOpen: boolean;
  actingAdmin: AuthUser;
  targetUser: AdminDeletionTargetUser | null;
  physicalDeletionEnabled: boolean;
  onClose: () => void;
  onStatusChanged: (targetUserId: string, newDeletionState: AccountDeletionClientState | null, message: string) => void;
}

const ADMIN_GRACE_PRESETS = [7, 14, 30] as const;

export const AdminAccountDeletionModal: React.FC<AdminAccountDeletionModalProps> = ({
  isOpen,
  actingAdmin,
  targetUser,
  physicalDeletionEnabled: initialPhysicalEnabled,
  onClose,
  onStatusChanged,
}) => {
  const { t, language } = useLanguage();

  const [deletionMode, setDeletionMode] = useState<'scheduled' | 'immediate'>('scheduled');
  const [graceDaysInput, setGraceDaysInput] = useState<string>('7');
  const [reauthMethod, setReauthMethod] = useState<'password' | 'google'>(() =>
    actingAdmin.hasPassword === false ? 'google' : 'password'
  );
  // Transient admin re-auth password — cleared on close/submit/unmount, never persisted
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [liveDeletionState, setLiveDeletionState] = useState<AccountDeletionClientState | null>(null);
  const [liveInActiveMatch, setLiveInActiveMatch] = useState<boolean>(false);

  const isCallerMainAdmin = isMainAdminUser(actingAdmin);
  const hasActingAdminPassword = actingAdmin.hasPassword !== false;

  useEffect(() => {
    if (!isOpen || !targetUser) {
      setAdminPasswordInput('');
      setErrorMsg(null);
      setIsSubmitting(false);
      return;
    }

    setDeletionMode('scheduled');
    setGraceDaysInput('7');
    setReauthMethod(hasActingAdminPassword ? 'password' : 'google');
    setAdminPasswordInput('');
    setErrorMsg(null);
    setLiveDeletionState(targetUser.deletionState ?? null);
    setLiveInActiveMatch(Boolean(targetUser.inActiveMatch));

    let cancelled = false;
    const token = localStorage.getItem('mafia_auth_token');
    if (token) {
      setIsLoadingStatus(true);
      fetch(`/api/admin/users/${encodeURIComponent(targetUser.id)}/deletion-status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async res => (res.ok ? res.json() : null))
        .then(data => {
          if (cancelled || !data) return;
          setLiveDeletionState(data);
          setLiveInActiveMatch(Boolean(data.inActiveMatch));
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setIsLoadingStatus(false);
        });
    }

    return () => {
      cancelled = true;
      setAdminPasswordInput('');
    };
  }, [isOpen, targetUser, hasActingAdminPassword]);

  if (!isOpen || !targetUser) return null;

  const isTargetSelf = targetUser.id === actingAdmin.id;
  const isTargetMainAdmin = isMainAdminUser(targetUser);
  const isTargetOtherAdmin = isAdminAccountUser(targetUser) && !isCallerMainAdmin;
  const isBlockedTarget = isTargetSelf || isTargetMainAdmin || isTargetOtherAdmin;

  const physicalDeletionEnabled =
    typeof liveDeletionState?.physicalDeletionEnabled === 'boolean'
      ? liveDeletionState.physicalDeletionEnabled
      : initialPhysicalEnabled;

  const hasActiveRequest = Boolean(liveDeletionState?.hasActiveRequest);
  const statusMeta = getDeletionStatusBadgeMeta(liveDeletionState, t);

  const effectiveMode: 'scheduled' | 'immediate' =
    physicalDeletionEnabled && deletionMode === 'immediate' ? 'immediate' : 'scheduled';
  const parsedDays = Number(graceDaysInput);
  const isDaysValid =
    effectiveMode === 'immediate' ||
    (Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 3650);
  const effectiveGraceDays = effectiveMode === 'immediate' ? 0 : isDaysValid ? parsedDays : 7;

  const predictedDateStr = formatDeletionDateTime(
    computePredictedPurgeDate(effectiveGraceDays),
    language
  );
  const activeScheduledDateStr = formatDeletionDateTime(liveDeletionState?.scheduledPurgeAt, language);
  const publicPlayerId = getPublicPlayerId(targetUser.id);

  const handleClose = () => {
    setAdminPasswordInput('');
    setErrorMsg(null);
    onClose();
  };

  const handleCreateAdminDeletionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isTargetSelf) {
      setErrorMsg(t('admin_deletion.cannot_delete_self', 'Собственный аккаунт удаляется только в профиле.'));
      return;
    }
    if (isTargetMainAdmin) {
      setErrorMsg(t('admin_deletion.cannot_delete_main_admin', 'Главный администратор защищён от удаления.'));
      return;
    }
    if (isTargetOtherAdmin) {
      setErrorMsg(
        t('admin_deletion.only_main_admin_deletes_admin', 'Удалять административные аккаунты может только Главный Администратор.')
      );
      return;
    }
    if (effectiveMode === 'immediate' && !physicalDeletionEnabled) {
      setErrorMsg(
        t(
          'deletion.purge_disabled_notice',
          'Автоматическое физическое удаление данных на сервере сейчас отключено. Немедленная очистка временно недоступна — вы можете оформить отложенное удаление или дождаться включения функции.'
        )
      );
      return;
    }
    if (!isDaysValid) {
      setErrorMsg(t('deletion.err_invalid_days', 'Укажите целое число дней от 1 до 3650.'));
      return;
    }

    const token = localStorage.getItem('mafia_auth_token');
    if (!token) {
      window.dispatchEvent(new CustomEvent('mafia_session_revoked'));
      return;
    }

    const payload: Record<string, any> = {
      gracePeriodDays: effectiveGraceDays,
    };

    setIsSubmitting(true);
    sounds.playTick();

    try {
      if (reauthMethod === 'google') {
        try {
          const freshGoogleIdToken = await reauthenticateWithGoogleFresh(actingAdmin.email);
          payload.googleIdToken = freshGoogleIdToken;
        } catch (googleErr: unknown) {
          const msg =
            googleErr instanceof Error && googleErr.message
              ? googleErr.message
              : t('deletion.err_google_popup', 'Не удалось завершить повторный вход через Google.');
          setErrorMsg(msg);
          setIsSubmitting(false);
          return;
        }
      } else {
        if (!adminPasswordInput) {
          setErrorMsg(t('deletion.err_password_required', 'Введите действующий пароль для подтверждения.'));
          setIsSubmitting(false);
          return;
        }
        payload.password = adminPasswordInput;
      }

      const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUser.id)}/deletion-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrorMsg(resolveAccountDeletionErrorMessage(data, t));
        return;
      }

      setAdminPasswordInput('');
      setLiveDeletionState(data?.deletion ?? null);
      onStatusChanged(
        targetUser.id,
        data?.deletion ?? null,
        data?.message || 'Запрос на удаление аккаунта зарегистрирован.'
      );
    } catch {
      setErrorMsg(t('common.error', 'Ошибка соединения с сервером.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelAdminDeletion = async () => {
    setErrorMsg(null);
    const token = localStorage.getItem('mafia_auth_token');
    if (!token) {
      window.dispatchEvent(new CustomEvent('mafia_session_revoked'));
      return;
    }

    setIsSubmitting(true);
    sounds.playTick();

    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUser.id)}/deletion-cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrorMsg(resolveAccountDeletionErrorMessage(data, t));
        return;
      }

      setLiveDeletionState(data?.deletion ?? null);
      onStatusChanged(
        targetUser.id,
        data?.deletion ?? null,
        data?.message || 'Запрос удаления аккаунта отменён.'
      );
    } catch {
      setErrorMsg(t('common.error', 'Ошибка соединения с сервером.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs select-none animate-in fade-in duration-150 admin-panel-exempt"
      data-skin-exempt="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-deletion-modal-title"
    >
      <div className="w-full max-w-lg bg-[#121319] border border-rose-900/70 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-zinc-800 bg-[#16131a] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-rose-950/90 border border-rose-700/70 flex items-center justify-center text-rose-400 shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 id="admin-deletion-modal-title" className="text-sm font-bold text-white truncate">
                {t('admin_deletion.modal_title', 'Административное удаление аккаунта')}
              </h4>
              <p className="text-[11px] text-zinc-400 truncate">{targetUser.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('common.close', 'Закрыть')}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Selected Account Info */}
          <div className="p-3.5 rounded-xl bg-[#161722] border border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                {t('admin_deletion.target_label', 'Выбранный аккаунт')}
              </div>
              <div className="text-sm font-bold text-white truncate mt-0.5">{targetUser.displayName}</div>
              <div className="text-[11px] font-mono text-zinc-400 mt-0.5 break-all">
                ID: {publicPlayerId || '—'} · ({targetUser.id})
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-wider shrink-0 ${
                statusMeta.kind === 'pending_game_end'
                  ? 'bg-purple-950/80 border-purple-600/70 text-purple-200'
                  : statusMeta.kind === 'scheduled'
                  ? 'bg-amber-950/80 border-amber-600/70 text-amber-200'
                  : statusMeta.kind === 'processing'
                  ? 'bg-rose-950/90 border-rose-600 text-rose-200'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-300'
              }`}
            >
              {statusMeta.label}
            </span>
          </div>

          {isLoadingStatus && (
            <div className="flex items-center gap-2 text-xs text-zinc-400 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>{t('common.loading', 'Загрузка...')}</span>
            </div>
          )}

          {/* Protection Notices */}
          {isBlockedTarget && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-700/60 text-xs text-amber-200 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                {isTargetSelf
                  ? t('admin_deletion.cannot_delete_self', 'Собственный аккаунт удаляется только в профиле.')
                  : isTargetMainAdmin
                  ? t('admin_deletion.cannot_delete_main_admin', 'Главный администратор защищён от удаления.')
                  : t(
                      'admin_deletion.only_main_admin_deletes_admin',
                      'Удалять административные аккаунты может только Главный Администратор.'
                    )}
              </span>
            </div>
          )}

          {/* Active Request Summary & Cancellation View */}
          {hasActiveRequest && liveDeletionState ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#161722] border border-amber-700/50 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-400">Статус запроса:</span>
                  <span className="font-mono font-bold text-amber-300">{liveDeletionState.status}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-400">{t('deletion.initiator_label', 'Инициатор')}:</span>
                  <span className="font-semibold text-white">
                    {liveDeletionState.initiatorType === 'admin'
                      ? t('deletion.initiator_admin', 'Администрация Mafia Club')
                      : t('deletion.initiator_self', 'Самостоятельный запрос владельца')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-400">{t('deletion.grace_period_label', 'Срок ожидания')}:</span>
                  <span className="font-mono text-white">
                    {liveDeletionState.gracePeriodDays ?? 0} {t('deletion.grace_days_unit', 'дн.')}
                  </span>
                </div>
                {liveDeletionState.status === 'pending_game_end' ? (
                  <div className="pt-2 border-t border-zinc-800 text-[11px] text-purple-200 leading-relaxed">
                    {t(
                      'admin_deletion.countdown_after_match',
                      'Отсчёт выбранного срока ожидания начнётся только после завершения текущей партии.'
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800">
                    <span className="text-zinc-400">
                      {t('deletion.scheduled_at_label', 'Плановая дата удаления')}:
                    </span>
                    <span className="font-semibold text-amber-300">{activeScheduledDateStr}</span>
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-700 text-rose-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold cursor-pointer min-h-[40px]"
                >
                  {t('common.close', 'Закрыть')}
                </button>
                {liveDeletionState.canCancel && !isBlockedTarget && (
                  <button
                    type="button"
                    onClick={handleCancelAdminDeletion}
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer min-h-[40px]"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('deletion.cancelling_btn', 'Отмена запроса...')}</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4" />
                        <span>{t('admin_deletion.cancel_request_btn', 'Отменить удаление аккаунта')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Create New Admin Deletion Request Form */
            <form onSubmit={handleCreateAdminDeletionRequest} className="space-y-4">
              {/* Consequences */}
              <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-800/60 flex items-start gap-2.5 text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-rose-200">
                    {t('deletion.consequences_title', 'Что будет безвозвратно утрачено:')}
                  </div>
                  <p className="text-rose-100/85 leading-relaxed">
                    {t(
                      'deletion.consequences_list',
                      'Весь инвентарь, кредиты, активный Premium-статус, игровой опыт (XP), статистика матчей, история игр, друзья, участие в клане и персональные данные.'
                    )}
                  </p>
                </div>
              </div>

              {/* Active Match Notice (Requirement 9) */}
              {liveInActiveMatch && (
                <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-600/70 text-xs text-purple-100 flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-purple-300 shrink-0 mt-0.5" />
                  <span>
                    {t(
                      'admin_deletion.active_match_warning',
                      'Игрок сейчас участвует в партии. Запрос будет зарегистрирован, но удаление начнётся только после завершения матча'
                    )}
                  </span>
                </div>
              )}

              {/* Physical Deletion Disabled Notice (Requirement 6 & 12) */}
              {!physicalDeletionEnabled && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-700/50 text-[11px] text-amber-200 leading-relaxed flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {t(
                      'deletion.purge_disabled_notice',
                      'Автоматическое физическое удаление данных на сервере сейчас отключено. Немедленная очистка временно недоступна — вы можете оформить отложенное удаление или дождаться включения функции.'
                    )}
                  </span>
                </div>
              )}

              {/* Mode choice */}
              <div className="space-y-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  {t('deletion.mode_label', 'Режим удаления')}
                </label>

                <label
                  className={`block p-3 rounded-xl border transition-all cursor-pointer ${
                    effectiveMode === 'scheduled'
                      ? 'bg-[#191b28] border-rose-500/80'
                      : 'bg-[#151621] border-zinc-800'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="admin-deletion-mode"
                      value="scheduled"
                      checked={effectiveMode === 'scheduled'}
                      onChange={() => setDeletionMode('scheduled')}
                      disabled={isSubmitting || isBlockedTarget}
                      className="mt-0.5 accent-rose-500"
                    />
                    <div className="text-xs">
                      <div className="font-bold text-white">
                        {t('deletion.mode_scheduled_title', 'Отложенное удаление через выбранный срок')}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        {t(
                          'deletion.mode_scheduled_desc',
                          'Аккаунт сразу перейдёт в ограниченный режим ожидания. До наступления даты удаления вы сможете отменить запрос.'
                        )}
                      </div>
                    </div>
                  </div>
                </label>

                <label
                  aria-disabled={!physicalDeletionEnabled}
                  className={`block p-3 rounded-xl border transition-all ${
                    !physicalDeletionEnabled
                      ? 'bg-[#13141c] border-zinc-800/70 opacity-60 cursor-not-allowed'
                      : effectiveMode === 'immediate'
                      ? 'bg-rose-950/30 border-rose-500 cursor-pointer'
                      : 'bg-[#151621] border-zinc-800 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="admin-deletion-mode"
                      value="immediate"
                      checked={effectiveMode === 'immediate'}
                      onChange={() => {
                        if (physicalDeletionEnabled) setDeletionMode('immediate');
                      }}
                      disabled={!physicalDeletionEnabled || isSubmitting || isBlockedTarget}
                      className="mt-0.5 accent-rose-500"
                    />
                    <div className="text-xs flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white">
                          {t('deletion.mode_immediate_title', 'Немедленное удаление (0 дней)')}
                        </span>
                        {!physicalDeletionEnabled && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold uppercase">
                            {t('deletion.mode_immediate_disabled_badge', 'Отключено на сервере')}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        {t('deletion.mode_immediate_desc', 'Запрос регистрируется без ожидания срока.')}
                      </div>
                    </div>
                  </div>
                </label>
              </div>

              {/* Waiting Days */}
              {effectiveMode === 'scheduled' && (
                <div className="p-3.5 rounded-xl bg-[#161722] border border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label
                      htmlFor="admin-deletion-days-input"
                      className="text-xs font-bold text-zinc-200 flex items-center gap-1.5"
                    >
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('deletion.grace_select_label', 'Срок ожидания (дней)')}</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      {ADMIN_GRACE_PRESETS.map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setGraceDaysInput(String(preset))}
                          disabled={isSubmitting || isBlockedTarget}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border cursor-pointer ${
                            Number(graceDaysInput) === preset
                              ? 'bg-rose-600 border-rose-500 text-white'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white'
                          }`}
                        >
                          {preset} {t('deletion.grace_days_unit', 'дн.')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    id="admin-deletion-days-input"
                    type="number"
                    min={1}
                    max={3650}
                    step={1}
                    value={graceDaysInput}
                    onChange={e => setGraceDaysInput(e.target.value)}
                    disabled={isSubmitting || isBlockedTarget}
                    className="w-full bg-[#101117] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-rose-500"
                  />

                  <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
                    <span>{t('deletion.estimated_date_label', 'Предполагаемая дата удаления:')}</span>
                    <span className="font-semibold text-amber-300">
                      {liveInActiveMatch
                        ? t(
                            'admin_deletion.countdown_after_match',
                            'Отсчёт выбранного срока ожидания начнётся только после завершения текущей партии.'
                          )
                        : predictedDateStr}
                    </span>
                  </div>
                </div>
              )}

              {/* Acting Admin Re-authentication */}
              <div className="p-3.5 rounded-xl bg-[#161722] border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t('deletion.reauth_title', 'Повторное подтверждение личности')}</span>
                  </span>
                  {hasActingAdminPassword && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setAdminPasswordInput('');
                        setReauthMethod(prev => (prev === 'password' ? 'google' : 'password'));
                      }}
                      disabled={isSubmitting}
                      className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer"
                    >
                      {reauthMethod === 'password'
                        ? t('deletion.reauth_switch_to_google', 'Или подтвердить через Google')
                        : t('deletion.reauth_switch_to_password', 'Подтвердить паролем')}
                    </button>
                  )}
                </div>

                {reauthMethod === 'password' && hasActingAdminPassword ? (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="admin-deletion-password-input"
                      className="block text-[11px] text-zinc-400"
                    >
                      {t('admin_deletion.admin_reauth_label', 'Пароль действующего администратора')} ({actingAdmin.email})
                    </label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="admin-deletion-password-input"
                        type="password"
                        autoComplete="current-password"
                        value={adminPasswordInput}
                        onChange={e => setAdminPasswordInput(e.target.value)}
                        placeholder={t('deletion.reauth_password_placeholder', 'Введите текущий пароль')}
                        disabled={isSubmitting || isBlockedTarget}
                        className="w-full bg-[#101117] border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {t(
                      'deletion.reauth_google_desc',
                      'Для подтверждения операции потребуется повторный вход в ваш аккаунт Google.'
                    )}{' '}
                    (<span className="font-mono text-zinc-300">{actingAdmin.email}</span>)
                  </p>
                )}
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-950/70 border border-rose-700 text-rose-200 text-xs flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold cursor-pointer min-h-[40px]"
                >
                  {t('common.cancel', 'Отмена')}
                </button>

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    isBlockedTarget ||
                    !isDaysValid ||
                    (reauthMethod === 'password' && !adminPasswordInput)
                  }
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer min-h-[40px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('deletion.submitting_btn', 'Обработка запроса...')}</span>
                    </>
                  ) : reauthMethod === 'google' ? (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>{t('admin_deletion.admin_reauth_google', 'Подтвердить через Google (администратор)')}</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>{t('deletion.confirm_btn', 'Подтвердить удаление')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
