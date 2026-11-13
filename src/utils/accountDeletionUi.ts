import type { AccountDeletionClientState, AuthUser } from '../components/AuthModal';

export const MAIN_ADMIN_EMAIL = 'vledahovic@gmail.com';

export function isMainAdminUser(user?: Pick<AuthUser, 'email'> | null): boolean {
  return Boolean(user?.email && user.email.trim().toLowerCase() === MAIN_ADMIN_EMAIL);
}

export function isAdminAccountUser(
  user?: { email?: string | null; isAdmin?: boolean | null; role?: string | null } | null
): boolean {
  if (!user) return false;
  return Boolean(
    isMainAdminUser({ email: user.email || '' }) || user.isAdmin === true || user.role === 'admin'
  );
}

export function canUserManageAccountDeletions(
  user?: {
    email?: string | null;
    isAdmin?: boolean | null;
    role?: string | null;
    canDeleteAccounts?: boolean | null;
  } | null
): boolean {
  if (!user) return false;
  if (isMainAdminUser({ email: user.email || '' })) return true;
  return Boolean((user.isAdmin === true || user.role === 'admin') && user.canDeleteAccounts === true);
}

export function formatDeletionDateTime(
  isoOrDate: string | Date | number | null | undefined,
  language: string
): string {
  if (isoOrDate === null || isoOrDate === undefined) return '—';
  const dateObj = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (!Number.isFinite(dateObj.getTime())) return '—';
  const locale = language === 'en' ? 'en-US' : language === 'uk' ? 'uk-UA' : 'ru-RU';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(dateObj);
  } catch {
    return dateObj.toLocaleString(locale);
  }
}

export function computePredictedPurgeDate(graceDays: number, nowMs: number = Date.now()): Date {
  const safeDays = Number.isFinite(graceDays) ? Math.max(0, Math.min(3650, Math.trunc(graceDays))) : 7;
  return new Date(nowMs + safeDays * 24 * 60 * 60 * 1000);
}

export function resolveAccountDeletionErrorMessage(
  data: { code?: string; error?: string } | null | undefined,
  t: (key: string, fallback: string) => string,
  fallbackMessage?: string
): string {
  const code = typeof data?.code === 'string' ? data.code : '';
  switch (code) {
    case 'INVALID_REAUTH_PASSWORD':
      return t('deletion.err_wrong_password', 'Неверный пароль подтверждения.');
    case 'GOOGLE_REAUTH_STALE':
    case 'GOOGLE_REAUTH_INVALID':
    case 'GOOGLE_REAUTH_ACCOUNT_MISMATCH':
    case 'GOOGLE_REAUTH_UID_MISMATCH':
    case 'GOOGLE_REAUTH_PROVIDER_INVALID':
      return data?.error || t('deletion.err_google_stale', 'Срок подтверждения Google истёк. Пройдите повторную проверку Google.');
    case 'RATE_LIMITED':
    case 'REAUTH_TOO_MANY_FAILURES':
      return data?.error || t('deletion.err_rate_limit', 'Слишком много попыток. Повторите позже.');
    case 'DELETION_PERMISSION_REQUIRED':
    case 'FORBIDDEN_OTHER_ACCOUNT':
    case 'ONLY_MAIN_ADMIN_CAN_DELETE_ADMIN':
    case 'CANNOT_DELETE_MAIN_ADMIN':
    case 'MAIN_ADMIN_SELF_DELETE_FORBIDDEN':
      return data?.error || t('deletion.err_forbidden', 'Недостаточно прав для выполнения операции.');
    case 'SELF_DELETE_FORBIDDEN_IN_ACTIVE_MATCH':
      return t('deletion.account_active_match_block', 'Удалить аккаунт можно после завершения текущей партии');
    case 'ACTIVE_DELETION_REQUEST_EXISTS':
      return t('deletion.err_duplicate', 'Запрос на удаление этого аккаунта уже существует.');
    default:
      return data?.error || fallbackMessage || t('common.error', 'Ошибка');
  }
}

export function getDeletionStatusBadgeMeta(
  deletionState: AccountDeletionClientState | null | undefined,
  t: (key: string, fallback: string) => string
): {
  kind: 'normal' | 'pending_game_end' | 'scheduled' | 'processing';
  label: string;
} {
  const status = deletionState?.hasActiveRequest ? deletionState.status : null;
  if (status === 'pending_game_end') {
    return {
      kind: 'pending_game_end',
      label: t('admin_deletion.status_pending_game_end', 'Ожидает завершения партии'),
    };
  }
  if (status === 'scheduled') {
    return {
      kind: 'scheduled',
      label: t('admin_deletion.status_scheduled', 'Ожидает удаления'),
    };
  }
  if (status === 'processing') {
    return {
      kind: 'processing',
      label: t('admin_deletion.status_processing', 'Выполняется удаление'),
    };
  }
  return {
    kind: 'normal',
    label: t('admin_deletion.status_normal', 'Обычный аккаунт'),
  };
}
