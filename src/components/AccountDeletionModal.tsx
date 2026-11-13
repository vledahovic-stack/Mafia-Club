import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  Lock,
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
  isMainAdminUser,
  resolveAccountDeletionErrorMessage,
} from '../utils/accountDeletionUi';

interface AccountDeletionModalProps {
  isOpen: boolean;
  user: AuthUser;
  isInActiveMatch?: boolean;
  onClose: () => void;
  onDeletionSubmitted: (updatedUser: AuthUser) => void;
}

const GRACE_PRESETS = [7, 14, 30] as const;

export const AccountDeletionModal: React.FC<AccountDeletionModalProps> = ({
  isOpen,
  user,
  isInActiveMatch = false,
  onClose,
  onDeletionSubmitted,
}) => {
  const { t, language } = useLanguage();

  // Always default to scheduled (never pre-select immediate deletion)
  const [deletionMode, setDeletionMode] = useState<'scheduled' | 'immediate'>('scheduled');
  const [graceDaysInput, setGraceDaysInput] = useState<string>('7');
  const [reauthMethod, setReauthMethod] = useState<'password' | 'google'>(() =>
    user.hasPassword === false ? 'google' : 'password'
  );
  // Password exists ONLY transiently while the confirmation dialog is open
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [serverDeletionState, setServerDeletionState] = useState<AccountDeletionClientState | null>(
    user.deletionState ?? null
  );
  const [serverInActiveMatch, setServerInActiveMatch] = useState<boolean>(false);

  const isMainAdmin = isMainAdminUser(user);
  const hasLocalPassword = user.hasPassword !== false;

  // Reset transient inputs every time modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      setPasswordInput('');
      setErrorMsg(null);
      setIsSubmitting(false);
      return;
    }

    setDeletionMode('scheduled');
    setGraceDaysInput('7');
    setReauthMethod(hasLocalPassword ? 'password' : 'google');
    setPasswordInput('');
    setErrorMsg(null);
    setServerDeletionState(user.deletionState ?? null);
    setServerInActiveMatch(false);

    let cancelled = false;
    const token = localStorage.getItem('mafia_auth_token');
    if (token) {
      setIsLoadingStatus(true);
      fetch('/api/account/deletion-status', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async res => (res.ok ? res.json() : null))
        .then(data => {
          if (cancelled || !data) return;
          setServerDeletionState(data);
          setServerInActiveMatch(Boolean(data.inActiveMatch));
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setIsLoadingStatus(false);
        });
    }

    return () => {
      cancelled = true;
      setPasswordInput('');
    };
  }, [isOpen, hasLocalPassword, user.deletionState]);

  if (!isOpen) return null;

  const activeState = serverDeletionState ?? user.deletionState ?? null;
  const physicalDeletionEnabled = activeState?.physicalDeletionEnabled === true;
  const effectiveInActiveMatch = Boolean(isInActiveMatch || serverInActiveMatch);
  const alreadyHasActiveRequest = Boolean(activeState?.hasActiveRequest);

  // Enforce safe fallback: never allow immediate mode to remain active when physical purge is disabled
  const effectiveMode: 'scheduled' | 'immediate' =
    physicalDeletionEnabled && deletionMode === 'immediate' ? 'immediate' : 'scheduled';

  const parsedDays = Number(graceDaysInput);
  const isDaysValid =
    effectiveMode === 'immediate' ||
    (Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 3650);

  const effectiveGraceDays = effectiveMode === 'immediate' ? 0 : isDaysValid ? parsedDays : 7;
  const predictedPurgeDate = computePredictedPurgeDate(effectiveGraceDays);
  const formattedPredictedDate = formatDeletionDateTime(predictedPurgeDate, language);

  const canSubmit =
    !isMainAdmin &&
    !effectiveInActiveMatch &&
    !alreadyHasActiveRequest &&
    !isSubmitting &&
    !isLoadingStatus &&
    isDaysValid &&
    (reauthMethod === 'google' || passwordInput.length > 0);

  const handleClose = () => {
    setPasswordInput('');
    setErrorMsg(null);
    onClose();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (isMainAdmin) {
      setErrorMsg(
        t('deletion.account_main_admin_protected', 'Главный администратор защищён от самостоятельного удаления.')
      );
      return;
    }

    if (effectiveInActiveMatch) {
      setErrorMsg(
        t('deletion.account_active_match_block', 'Удалить аккаунт можно после завершения текущей партии')
      );
      return;
    }

    if (alreadyHasActiveRequest) {
      setErrorMsg(t('deletion.err_duplicate', 'Запрос на удаление этого аккаунта уже существует.'));
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

    const requestBody: Record<string, any> = {
      gracePeriodDays: effectiveGraceDays,
    };

    setIsSubmitting(true);
    sounds.playTick();

    try {
      if (reauthMethod === 'google') {
        try {
          // Real fresh Google sign-in popup updating auth_time; never stored in React state
          const freshGoogleIdToken = await reauthenticateWithGoogleFresh(user.email);
          requestBody.googleIdToken = freshGoogleIdToken;
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
        if (!passwordInput) {
          setErrorMsg(t('deletion.err_password_required', 'Введите действующий пароль для подтверждения.'));
          setIsSubmitting(false);
          return;
        }
        requestBody.password = passwordInput;
      }

      const res = await fetch('/api/account/deletion-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrorMsg(resolveAccountDeletionErrorMessage(data, t));
        return;
      }

      // Clear sensitive password immediately on success
      setPasswordInput('');

      // Refresh /api/auth/me or apply returned deletionState so App transitions cleanly to RestrictedAccountView
      let nextUser: AuthUser = {
        ...user,
        deletionState: data?.deletion ?? user.deletionState ?? null,
      };
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const meData = await meRes.json().catch(() => null);
          if (meData?.user) {
            nextUser = meData.user;
          }
        }
      } catch {
        // Fallback uses deletion returned from POST /api/account/deletion-request
      }

      onDeletionSubmitted(nextUser);
    } catch {
      setErrorMsg(t('common.error', 'Ошибка соединения с сервером.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
      className="fixed inset-0 z-70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="self-deletion-modal-title"
    >
      <div className="skin-modal w-full max-w-lg rounded-[var(--skin-radius-modal)] bg-[var(--skin-bg-modal)] border border-rose-800/70 shadow-[var(--skin-shadow-modal)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-rose-900/50 bg-gradient-to-r from-rose-950/70 via-[var(--skin-bg-elevated)] to-[var(--skin-bg-modal)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-950/90 border border-rose-700/70 flex items-center justify-center text-rose-400 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="self-deletion-modal-title"
                className="text-base font-bold text-[var(--skin-text-primary)] truncate"
              >
                {t('deletion.modal_title', 'Удаление аккаунта')}
              </h3>
              <p className="text-[11px] text-[var(--skin-text-secondary)] truncate">
                {t('deletion.modal_subtitle', 'Внимательно ознакомьтесь с последствиями перед подтверждением')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label={t('common.close', 'Закрыть')}
            className="skin-btn-secondary p-2 rounded-xl border cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* Consequences Warning */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-rose-950/35 border border-rose-800/60 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-bold text-rose-200">
                {t('deletion.consequences_title', 'Что будет безвозвратно утрачено:')}
              </div>
              <p className="text-rose-100/90 leading-relaxed">
                {t(
                  'deletion.consequences_list',
                  'Весь инвентарь, кредиты, активный Premium-статус, игровой опыт (XP), статистика матчей, история игр, друзья, участие в клане и персональные данные.'
                )}
              </p>
            </div>
          </div>

          {/* Guards: Main Admin / Active Match / Duplicate Request */}
          {isMainAdmin && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-700/60 text-xs text-amber-200 flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {t('deletion.account_main_admin_protected', 'Главный администратор защищён от самостоятельного удаления.')}
              </span>
            </div>
          )}

          {!isMainAdmin && effectiveInActiveMatch && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-700/60 text-xs text-amber-200 flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {t('deletion.account_active_match_block', 'Удалить аккаунт можно после завершения текущей партии')}
              </span>
            </div>
          )}

          {!isMainAdmin && alreadyHasActiveRequest && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-700/60 text-xs text-amber-200 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{t('deletion.err_duplicate', 'Запрос на удаление этого аккаунта уже существует.')}</span>
            </div>
          )}

          {/* Physical Deletion Disabled Notice (Requirement 6 & 12) */}
          {!physicalDeletionEnabled && (
            <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-700/50 text-[11px] text-amber-200 leading-relaxed flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                {t(
                  'deletion.purge_disabled_notice',
                  'Автоматическое физическое удаление данных на сервере сейчас отключено. Немедленная очистка временно недоступна — вы можете оформить отложенное удаление или дождаться включения функции.'
                )}
              </span>
            </div>
          )}

          {/* Mode Selection: Scheduled vs Immediate */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--skin-text-secondary)]">
              {t('deletion.mode_label', 'Режим удаления')}
            </label>

            <div className="space-y-2">
              {/* Delayed / Scheduled option (Default) */}
              <label
                className={`block p-3.5 rounded-xl border transition-all cursor-pointer ${
                  effectiveMode === 'scheduled'
                    ? 'bg-[var(--skin-bg-elevated)] border-rose-500/80 shadow-sm'
                    : 'bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] hover:border-[var(--skin-border-strong)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="self-deletion-mode"
                    value="scheduled"
                    checked={effectiveMode === 'scheduled'}
                    onChange={() => setDeletionMode('scheduled')}
                    disabled={isSubmitting || alreadyHasActiveRequest || isMainAdmin}
                    className="mt-0.5 accent-rose-500"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-xs font-bold text-[var(--skin-text-primary)]">
                      {t('deletion.mode_scheduled_title', 'Отложенное удаление через выбранный срок')}
                    </div>
                    <p className="text-[11px] text-[var(--skin-text-secondary)] leading-relaxed">
                      {t(
                        'deletion.mode_scheduled_desc',
                        'Аккаунт сразу перейдёт в ограниченный режим ожидания. До наступления даты удаления вы сможете отменить запрос.'
                      )}
                    </p>
                  </div>
                </div>
              </label>

              {/* Immediate (0-day) option — prepared for future activation, safely disabled when physicalDeletionEnabled is false */}
              <label
                aria-disabled={!physicalDeletionEnabled}
                className={`block p-3.5 rounded-xl border transition-all ${
                  !physicalDeletionEnabled
                    ? 'bg-[var(--skin-bg-subcard)]/60 border-[var(--skin-border-base)] opacity-65 cursor-not-allowed'
                    : effectiveMode === 'immediate'
                    ? 'bg-rose-950/30 border-rose-500 cursor-pointer'
                    : 'bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] hover:border-[var(--skin-border-strong)] cursor-pointer'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="self-deletion-mode"
                    value="immediate"
                    checked={effectiveMode === 'immediate'}
                    onChange={() => {
                      if (physicalDeletionEnabled) {
                        setDeletionMode('immediate');
                      }
                    }}
                    disabled={!physicalDeletionEnabled || isSubmitting || alreadyHasActiveRequest || isMainAdmin}
                    className="mt-0.5 accent-rose-500"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[var(--skin-text-primary)]">
                        {t('deletion.mode_immediate_title', 'Немедленное удаление (0 дней)')}
                      </span>
                      {!physicalDeletionEnabled && (
                        <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold uppercase">
                          {t('deletion.mode_immediate_disabled_badge', 'Отключено на сервере')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--skin-text-secondary)] leading-relaxed">
                      {t('deletion.mode_immediate_desc', 'Запрос регистрируется без ожидания срока.')}
                    </p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Waiting Period Selector (when scheduled mode selected) */}
          {effectiveMode === 'scheduled' && (
            <div className="p-3.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label
                  htmlFor="self-deletion-days-input"
                  className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t('deletion.grace_select_label', 'Срок ожидания (дней)')}</span>
                </label>

                <div className="flex items-center gap-1.5">
                  {GRACE_PRESETS.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGraceDaysInput(String(preset))}
                      disabled={isSubmitting}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                        Number(graceDaysInput) === preset
                          ? 'bg-rose-600 border-rose-500 text-white'
                          : 'bg-[var(--skin-bg-elevated)] border-[var(--skin-border-base)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)]'
                      }`}
                    >
                      {preset} {t('deletion.grace_days_unit', 'дн.')}
                    </button>
                  ))}
                </div>
              </div>

              <input
                id="self-deletion-days-input"
                type="number"
                min={1}
                max={3650}
                step={1}
                value={graceDaysInput}
                onChange={e => setGraceDaysInput(e.target.value)}
                placeholder={t('deletion.grace_days_placeholder', 'Количество дней (от 1)')}
                disabled={isSubmitting}
                className="skin-input w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--skin-border-subtle)] text-xs">
                <span className="text-[var(--skin-text-muted)]">
                  {t('deletion.estimated_date_label', 'Предполагаемая дата удаления:')}
                </span>
                <span className="font-bold text-amber-300">{formattedPredictedDate}</span>
              </div>
            </div>
          )}

          {/* Re-authentication Section */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--skin-text-primary)]">
                <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{t('deletion.reauth_title', 'Повторное подтверждение личности')}</span>
              </div>

              {hasLocalPassword && (
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setPasswordInput('');
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

            {reauthMethod === 'password' && hasLocalPassword ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="self-deletion-password-input"
                  className="block text-[11px] text-[var(--skin-text-secondary)]"
                >
                  {t('deletion.reauth_password_label', 'Действующий пароль от аккаунта')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--skin-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="self-deletion-password-input"
                    type="password"
                    autoComplete="current-password"
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    placeholder={t('deletion.reauth_password_placeholder', 'Введите текущий пароль')}
                    disabled={isSubmitting || isMainAdmin || effectiveInActiveMatch || alreadyHasActiveRequest}
                    className="skin-input w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--skin-text-secondary)] leading-relaxed">
                  {t(
                    'deletion.reauth_google_desc',
                    'Для подтверждения операции потребуется повторный вход в ваш аккаунт Google.'
                  )}
                </p>
                <div className="text-[11px] font-mono text-[var(--skin-text-muted)] truncate">
                  {user.email}
                </div>
              </div>
            )}
          </div>

          {/* Error Feedback */}
          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-950/70 border border-rose-700 text-rose-200 text-xs flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2 border-t border-[var(--skin-border-subtle)]">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="skin-btn-secondary flex-1 py-2.5 px-4 rounded-xl border text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
            >
              {t('common.cancel', 'Отмена')}
            </button>

            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg transition-colors flex items-center justify-center gap-2 cursor-pointer min-h-[40px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('deletion.submitting_btn', 'Обработка запроса...')}</span>
                </>
              ) : reauthMethod === 'google' ? (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>{t('deletion.reauth_google_btn', 'Подтвердить через Google и удалить')}</span>
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
      </div>
    </div>
  );
};
