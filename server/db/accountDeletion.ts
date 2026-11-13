import { randomBytes } from 'node:crypto';
import type { Client } from '@libsql/client';
import { getDatabase, sanitizeArgs } from './database';
import { rewardMutex } from '../utils/asyncLock';

export type AccountDeletionInitiator = 'self' | 'admin';

export type AccountDeletionStatus =
  | 'pending_game_end'
  | 'scheduled'
  | 'processing'
  | 'cancelled'
  | 'completed';

export const ACTIVE_DELETION_STATUSES: readonly AccountDeletionStatus[] = [
  'pending_game_end',
  'scheduled',
  'processing',
] as const;

export const TERMINAL_DELETION_STATUSES: readonly AccountDeletionStatus[] = [
  'cancelled',
  'completed',
] as const;

export const ALLOWED_STATUS_TRANSITIONS: Record<AccountDeletionStatus, readonly AccountDeletionStatus[]> = {
  pending_game_end: ['scheduled', 'processing', 'cancelled'],
  scheduled: ['processing', 'cancelled'],
  processing: ['completed'],
  cancelled: [],
  completed: [],
};

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MAX_GRACE_PERIOD_DAYS = 3650;

export type AccountAction =
  | 'room_create'
  | 'room_join'
  | 'match_join'
  | 'shop_purchase'
  | 'pawnshop_sell'
  | 'reward_claim'
  | 'item_use'
  | 'balance_or_stats_change'
  | 'social_action'
  | 'public_profile_view'
  | 'auth_login'
  | 'self_restricted_profile_view'
  | 'deletion_status_view'
  | 'deletion_cancel'
  | 'deletion_confirm_immediate'
  | 'clan_transfer_leadership';

const ALLOWED_ACTIONS_IN_SCHEDULED: ReadonlySet<AccountAction> = new Set<AccountAction>([
  'auth_login',
  'self_restricted_profile_view',
  'deletion_status_view',
  'deletion_cancel',
  'deletion_confirm_immediate',
  'clan_transfer_leadership',
]);

export interface AccountDeletionRequestRecord {
  id: string;
  userId: string;
  initiatorType: AccountDeletionInitiator;
  initiatedByAdminId: string | null;
  status: AccountDeletionStatus;
  gracePeriodDays: number;
  createdAt: string;
  graceStartedAt: string | null;
  scheduledPurgeAt: string | null;
  processingStartedAt: string | null;
  cancelledAt: string | null;
  cancelledByType: AccountDeletionInitiator | null;
  cancelledById: string | null;
  completedAt: string | null;
  operationToken: string;
  version: number;
  retryCount: number;
  lastError: string | null;
  nextRetryAt: string | null;
  updatedAt: string;
}

export interface AccountDeletionStateSummary {
  hasActiveRequest: boolean;
  status: AccountDeletionStatus | null;
  request: AccountDeletionRequestRecord | null;
  isRestricted: boolean;
  isPendingGameEnd: boolean;
  isScheduled: boolean;
  isProcessing: boolean;
  isImmediate: boolean;
  isDueForPurge: boolean;
  remainingMs: number | null;
  canCancel: boolean;
}

export interface RoomMatchSnapshot {
  roomCode?: string;
  phase: string;
  hostId?: string;
  players: Array<{ id: string; isBot?: boolean }>;
}

export interface ActiveMatchRuleEvaluation {
  allowed: boolean;
  initialStatus?: 'pending_game_end' | 'scheduled' | 'processing';
  code?: string;
  message?: string;
}

export interface AccountActionCheckResult {
  allowed: boolean;
  deletionStatus: AccountDeletionStatus | null;
  code?: string;
  message?: string;
}

export interface CreateDeletionRequestInput {
  userId: string;
  initiatorType: AccountDeletionInitiator;
  initiatedByAdminId?: string | null;
  gracePeriodDays: number;
  isInActiveMatch?: boolean;
  startImmediateProcessing?: boolean;
  nowMs?: number;
}

export interface CancelDeletionRequestInput {
  userId: string;
  requestId?: string;
  cancelledByType: AccountDeletionInitiator;
  cancelledById?: string | null;
  nowMs?: number;
}

export class AccountDeletionError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AccountDeletionError';
    this.code = code;
  }
}

export function isActiveDeletionStatus(status: AccountDeletionStatus | null | undefined): boolean {
  if (!status) return false;
  return (ACTIVE_DELETION_STATUSES as readonly string[]).includes(status);
}

export function isValidStatusTransition(
  fromStatus: AccountDeletionStatus,
  toStatus: AccountDeletionStatus
): boolean {
  const allowed = ALLOWED_STATUS_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

export function validateGracePeriodDays(gracePeriodDays: number): number {
  if (
    typeof gracePeriodDays !== 'number' ||
    !Number.isFinite(gracePeriodDays) ||
    !Number.isInteger(gracePeriodDays)
  ) {
    throw new AccountDeletionError(
      'INVALID_GRACE_PERIOD',
      'Срок ожидания удаления должен быть целым неотрицательным числом дней.'
    );
  }
  if (gracePeriodDays < 0 || gracePeriodDays > MAX_GRACE_PERIOD_DAYS) {
    throw new AccountDeletionError(
      'INVALID_GRACE_PERIOD',
      `Срок ожидания удаления должен находиться в диапазоне от 0 до ${MAX_GRACE_PERIOD_DAYS} дней.`
    );
  }
  return gracePeriodDays;
}

export function computeScheduledPurgeAt(graceStartedAtMs: number, gracePeriodDays: number): string {
  if (typeof graceStartedAtMs !== 'number' || !Number.isFinite(graceStartedAtMs)) {
    throw new AccountDeletionError('INVALID_TIMESTAMP', 'Некорректная отметка времени начала ожидания.');
  }
  const validDays = validateGracePeriodDays(gracePeriodDays);
  return new Date(graceStartedAtMs + validDays * MS_PER_DAY).toISOString();
}

export function detectUserActiveMatchFromRooms(
  userId: string,
  rooms: readonly RoomMatchSnapshot[]
): { inActiveMatch: boolean; roomCode: string | null; phase: string | null } {
  const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!cleanUserId || !Array.isArray(rooms)) {
    return { inActiveMatch: false, roomCode: null, phase: null };
  }

  for (const room of rooms) {
    if (!room || !room.phase) continue;
    const isGameplayActive = room.phase !== 'LOBBY' && room.phase !== 'GAME_OVER';
    if (!isGameplayActive) continue;

    const isHost = room.hostId === cleanUserId;
    const isSeatedPlayer = Array.isArray(room.players)
      ? room.players.some((p: { id: string; isBot?: boolean }) => Boolean(p && !p.isBot && p.id === cleanUserId))
      : false;

    if (isHost || isSeatedPlayer) {
      return {
        inActiveMatch: true,
        roomCode: room.roomCode || null,
        phase: room.phase,
      };
    }
  }

  return { inActiveMatch: false, roomCode: null, phase: null };
}

export function evaluateActiveMatchRule(params: {
  initiatorType: AccountDeletionInitiator;
  isInActiveMatch: boolean;
  gracePeriodDays: number;
  startImmediateProcessing?: boolean;
}): ActiveMatchRuleEvaluation {
  const validDays = validateGracePeriodDays(params.gracePeriodDays);

  if (params.initiatorType !== 'self' && params.initiatorType !== 'admin') {
    throw new AccountDeletionError('INVALID_INITIATOR', 'Некорректный инициатор запроса удаления.');
  }

  if (params.isInActiveMatch) {
    if (params.initiatorType === 'self') {
      return {
        allowed: false,
        code: 'SELF_DELETE_FORBIDDEN_IN_ACTIVE_MATCH',
        message: 'Нельзя запросить удаление аккаунта во время активной игровой партии.',
      };
    }
    return {
      allowed: true,
      initialStatus: 'pending_game_end',
    };
  }

  if (validDays === 0 && params.startImmediateProcessing === true) {
    return {
      allowed: true,
      initialStatus: 'processing',
    };
  }

  return {
    allowed: true,
    initialStatus: 'scheduled',
  };
}

export function evaluateAccountActionPermission(
  deletionStatus: AccountDeletionStatus | null,
  action: AccountAction
): AccountActionCheckResult {
  if (!deletionStatus || deletionStatus === 'cancelled' || deletionStatus === 'completed') {
    return { allowed: true, deletionStatus: deletionStatus ?? null };
  }

  if (deletionStatus === 'pending_game_end') {
    // Player finishes current match by existing rules; creating a second request is handled separately.
    return { allowed: true, deletionStatus };
  }

  if (deletionStatus === 'processing') {
    if (action === 'deletion_status_view') {
      return { allowed: true, deletionStatus };
    }
    return {
      allowed: false,
      deletionStatus,
      code: 'ACCOUNT_DELETION_PROCESSING',
      message: 'Выполняется окончательное удаление учётной записи. Операция недоступна.',
    };
  }

  // Status: 'scheduled'
  if (ALLOWED_ACTIONS_IN_SCHEDULED.has(action)) {
    return { allowed: true, deletionStatus };
  }

  if (action === 'public_profile_view') {
    return {
      allowed: false,
      deletionStatus,
      code: 'PUBLIC_PROFILE_UNAVAILABLE_PENDING_DELETION',
      message: 'Профиль игрока недоступен, так как учётная запись ожидает удаления.',
    };
  }

  return {
    allowed: false,
    deletionStatus,
    code: 'ACCOUNT_SCHEDULED_FOR_DELETION',
    message: 'Аккаунт находится в режиме ожидания удаления. Действие временно заблокировано.',
  };
}

export class AccountDeletionDatabase {
  private readonly customDb?: Client;

  constructor(customDb?: Client) {
    this.customDb = customDb;
  }

  private get db(): Client {
    return this.customDb ?? getDatabase();
  }

  private rowToRecord(row: any): AccountDeletionRequestRecord {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      initiatorType: String(row.initiator_type) as AccountDeletionInitiator,
      initiatedByAdminId: row.initiated_by_admin_id ? String(row.initiated_by_admin_id) : null,
      status: String(row.status) as AccountDeletionStatus,
      gracePeriodDays: Number(row.grace_period_days),
      createdAt: String(row.created_at),
      graceStartedAt: row.grace_started_at ? String(row.grace_started_at) : null,
      scheduledPurgeAt: row.scheduled_purge_at ? String(row.scheduled_purge_at) : null,
      processingStartedAt: row.processing_started_at ? String(row.processing_started_at) : null,
      cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
      cancelledByType: row.cancelled_by_type
        ? (String(row.cancelled_by_type) as AccountDeletionInitiator)
        : null,
      cancelledById: row.cancelled_by_id ? String(row.cancelled_by_id) : null,
      completedAt: row.completed_at ? String(row.completed_at) : null,
      operationToken: String(row.operation_token),
      version: Number(row.version ?? 1),
      retryCount: Number(row.retry_count ?? 0),
      lastError: row.last_error ? String(row.last_error) : null,
      nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : null,
      updatedAt: String(row.updated_at),
    };
  }

  public async getRequestById(requestId: string): Promise<AccountDeletionRequestRecord | null> {
    const cleanId = typeof requestId === 'string' ? requestId.trim() : '';
    if (!cleanId) return null;

    const res = await this.db.execute({
      sql: 'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
      args: [cleanId],
    });
    return res.rows[0] ? this.rowToRecord(res.rows[0]) : null;
  }

  public async getRequestByOperationToken(
    operationToken: string
  ): Promise<AccountDeletionRequestRecord | null> {
    const cleanToken = typeof operationToken === 'string' ? operationToken.trim() : '';
    if (!cleanToken) return null;

    const res = await this.db.execute({
      sql: 'SELECT * FROM account_deletion_requests WHERE operation_token = ? LIMIT 1',
      args: [cleanToken],
    });
    return res.rows[0] ? this.rowToRecord(res.rows[0]) : null;
  }

  public async getActiveRequestByUserId(userId: string): Promise<AccountDeletionRequestRecord | null> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) return null;

    const res = await this.db.execute({
      sql: `SELECT * FROM account_deletion_requests
            WHERE user_id = ?
              AND status IN ('pending_game_end', 'scheduled', 'processing')
            ORDER BY created_at DESC
            LIMIT 1`,
      args: [cleanUserId],
    });
    return res.rows[0] ? this.rowToRecord(res.rows[0]) : null;
  }

  public async getLatestRequestByUserId(userId: string): Promise<AccountDeletionRequestRecord | null> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) return null;

    const res = await this.db.execute({
      sql: `SELECT * FROM account_deletion_requests
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1`,
      args: [cleanUserId],
    });
    return res.rows[0] ? this.rowToRecord(res.rows[0]) : null;
  }

  public async hasActiveRequest(userId: string): Promise<boolean> {
    const active = await this.getActiveRequestByUserId(userId);
    return active !== null;
  }

  public summarizeRecord(
    active: AccountDeletionRequestRecord | null,
    nowMs: number = Date.now()
  ): AccountDeletionStateSummary {
    if (!active) {
      return {
        hasActiveRequest: false,
        status: null,
        request: null,
        isRestricted: false,
        isPendingGameEnd: false,
        isScheduled: false,
        isProcessing: false,
        isImmediate: false,
        isDueForPurge: false,
        remainingMs: null,
        canCancel: false,
      };
    }

    const purgeMs = active.scheduledPurgeAt ? new Date(active.scheduledPurgeAt).getTime() : null;
    const remainingMs = purgeMs !== null && Number.isFinite(purgeMs) ? Math.max(0, purgeMs - nowMs) : null;
    const isDueForPurge =
      active.status === 'scheduled' && purgeMs !== null && Number.isFinite(purgeMs) && nowMs >= purgeMs;

    return {
      hasActiveRequest: true,
      status: active.status,
      request: active,
      isRestricted: active.status === 'scheduled' || active.status === 'processing',
      isPendingGameEnd: active.status === 'pending_game_end',
      isScheduled: active.status === 'scheduled',
      isProcessing: active.status === 'processing',
      isImmediate: active.gracePeriodDays === 0,
      isDueForPurge,
      remainingMs,
      canCancel: isValidStatusTransition(active.status, 'cancelled'),
    };
  }

  public async getActiveRequestsByUserIdsMap(): Promise<Map<string, AccountDeletionRequestRecord>> {
    const res = await this.db.execute({
      sql: `SELECT * FROM account_deletion_requests
            WHERE status IN ('pending_game_end', 'scheduled', 'processing')
            ORDER BY created_at DESC`,
      args: [],
    });
    const map = new Map<string, AccountDeletionRequestRecord>();
    for (const row of res.rows) {
      const rec = this.rowToRecord(row);
      if (!map.has(rec.userId)) {
        map.set(rec.userId, rec);
      }
    }
    return map;
  }

  public async getAccountDeletionState(
    userId: string,
    nowMs: number = Date.now()
  ): Promise<AccountDeletionStateSummary> {
    const active = await this.getActiveRequestByUserId(userId);
    return this.summarizeRecord(active, nowMs);
  }

  public async createDeletionRequest(
    input: CreateDeletionRequestInput
  ): Promise<AccountDeletionRequestRecord> {
    const cleanUserId = typeof input.userId === 'string' ? input.userId.trim() : '';
    if (!cleanUserId) {
      throw new AccountDeletionError('INVALID_USER_ID', 'Не указан идентификатор пользователя.');
    }

    const validDays = validateGracePeriodDays(input.gracePeriodDays);
    const initiatorType = input.initiatorType;
    const cleanAdminId =
      initiatorType === 'admin' && typeof input.initiatedByAdminId === 'string'
        ? input.initiatedByAdminId.trim()
        : null;

    if (initiatorType === 'admin' && !cleanAdminId) {
      throw new AccountDeletionError(
        'ADMIN_ID_REQUIRED',
        'Для запроса администратора требуется идентификатор администратора.'
      );
    }

    const nowMs = typeof input.nowMs === 'number' && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const isInActiveMatch = Boolean(input.isInActiveMatch);

    const ruleEval = evaluateActiveMatchRule({
      initiatorType,
      isInActiveMatch,
      gracePeriodDays: validDays,
      startImmediateProcessing: input.startImmediateProcessing,
    });

    if (!ruleEval.allowed || !ruleEval.initialStatus) {
      throw new AccountDeletionError(
        ruleEval.code || 'DELETION_REQUEST_NOT_ALLOWED',
        ruleEval.message || 'Создание запроса на удаление отклонено.'
      );
    }

    const initialStatus = ruleEval.initialStatus;
    const graceStartedAt = initialStatus === 'pending_game_end' ? null : nowIso;
    const scheduledPurgeAt =
      initialStatus === 'pending_game_end' ? null : computeScheduledPurgeAt(nowMs, validDays);
    const processingStartedAt = initialStatus === 'processing' ? nowIso : null;

    return rewardMutex.runExclusive(`user:${cleanUserId}`, async () => {
      const tx = await (this.db as any).transaction('write');
      try {
        const userRes = await tx.execute({
          sql: 'SELECT id FROM users WHERE id = ? LIMIT 1',
          args: [cleanUserId],
        });
        if (!userRes.rows[0]) {
          throw new AccountDeletionError('USER_NOT_FOUND', 'Пользователь не найден.');
        }

        const existingRes = await tx.execute({
          sql: `SELECT id, status FROM account_deletion_requests
                WHERE user_id = ? AND status IN ('pending_game_end', 'scheduled', 'processing')
                LIMIT 1`,
          args: [cleanUserId],
        });
        if (existingRes.rows[0]) {
          throw new AccountDeletionError(
            'ACTIVE_DELETION_REQUEST_EXISTS',
            'У этого аккаунта уже есть активный запрос на удаление.'
          );
        }

        const requestId = `adr_${nowMs}_${randomBytes(6).toString('hex')}`;
        const operationToken = `delop_${randomBytes(16).toString('hex')}`;

        await tx.execute({
          sql: `
            INSERT INTO account_deletion_requests (
              id, user_id, initiator_type, initiated_by_admin_id, status, grace_period_days,
              created_at, grace_started_at, scheduled_purge_at, processing_started_at,
              cancelled_at, cancelled_by_type, cancelled_by_id, completed_at,
              operation_token, version, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, 1, ?)
          `,
          args: sanitizeArgs([
            requestId,
            cleanUserId,
            initiatorType,
            cleanAdminId,
            initialStatus,
            validDays,
            nowIso,
            graceStartedAt,
            scheduledPurgeAt,
            processingStartedAt,
            operationToken,
            nowIso,
          ]),
        });

        const insertedRes = await tx.execute({
          sql: 'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
          args: [requestId],
        });
        await tx.commit();
        return this.rowToRecord(insertedRes.rows[0]);
      } catch (err: any) {
        try {
          await tx.rollback();
        } catch {}
        if (err instanceof AccountDeletionError) {
          throw err;
        }
        const msg = String(err?.message || '');
        if (msg.includes('UNIQUE') || msg.includes('SQLITE_CONSTRAINT')) {
          throw new AccountDeletionError(
            'ACTIVE_DELETION_REQUEST_EXISTS',
            'У этого аккаунта уже есть активный запрос на удаление.'
          );
        }
        throw err;
      } finally {
        try {
          tx.close();
        } catch {}
      }
    });
  }

  public async cancelDeletionRequest(
    input: CancelDeletionRequestInput
  ): Promise<AccountDeletionRequestRecord> {
    const cleanUserId = typeof input.userId === 'string' ? input.userId.trim() : '';
    if (!cleanUserId) {
      throw new AccountDeletionError('INVALID_USER_ID', 'Не указан идентификатор пользователя.');
    }

    if (input.cancelledByType !== 'self' && input.cancelledByType !== 'admin') {
      throw new AccountDeletionError('INVALID_INITIATOR', 'Некорректный инициатор отмены.');
    }

    const cleanCancelledById =
      typeof input.cancelledById === 'string' && input.cancelledById.trim()
        ? input.cancelledById.trim()
        : input.cancelledByType === 'self'
          ? cleanUserId
          : null;

    if (input.cancelledByType === 'admin' && !cleanCancelledById) {
      throw new AccountDeletionError(
        'ADMIN_ID_REQUIRED',
        'Для отмены администратором требуется идентификатор администратора.'
      );
    }

    const nowMs = typeof input.nowMs === 'number' && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
    const nowIso = new Date(nowMs).toISOString();

    return rewardMutex.runExclusive(`user:${cleanUserId}`, async () => {
      const tx = await (this.db as any).transaction('write');
      try {
        const selectRes = input.requestId
          ? await tx.execute({
              sql: 'SELECT * FROM account_deletion_requests WHERE id = ? AND user_id = ? LIMIT 1',
              args: [input.requestId.trim(), cleanUserId],
            })
          : await tx.execute({
              sql: `SELECT * FROM account_deletion_requests
                    WHERE user_id = ?
                    ORDER BY CASE WHEN status IN ('pending_game_end', 'scheduled', 'processing') THEN 0 ELSE 1 END,
                             created_at DESC
                    LIMIT 1`,
              args: [cleanUserId],
            });

        const row = selectRes.rows[0];
        if (!row) {
          throw new AccountDeletionError('DELETION_REQUEST_NOT_FOUND', 'Запрос на удаление не найден.');
        }

        const current = this.rowToRecord(row);
        if (!isValidStatusTransition(current.status, 'cancelled')) {
          if (current.status === 'processing') {
            throw new AccountDeletionError(
              'CANNOT_CANCEL_PROCESSING_DELETION',
              'Нельзя отменить удаление, которое уже выполняется.'
            );
          }
          if (current.status === 'completed') {
            throw new AccountDeletionError(
              'CANNOT_CANCEL_COMPLETED_DELETION',
              'Нельзя отменить уже завершённое удаление аккаунта.'
            );
          }
          throw new AccountDeletionError(
            'INVALID_STATUS_TRANSITION',
            `Переход из состояния «${current.status}» в «cancelled» запрещён.`
          );
        }

        const updRes = await tx.execute({
          sql: `
            UPDATE account_deletion_requests SET
              status = 'cancelled',
              cancelled_at = ?,
              cancelled_by_type = ?,
              cancelled_by_id = ?,
              version = version + 1,
              updated_at = ?
            WHERE id = ? AND status = ? AND version = ?
          `,
          args: sanitizeArgs([
            nowIso,
            input.cancelledByType,
            cleanCancelledById,
            nowIso,
            current.id,
            current.status,
            current.version,
          ]),
        });

        if (Number(updRes.rowsAffected ?? 0) !== 1) {
          throw new AccountDeletionError(
            'CONCURRENT_STATE_CONFLICT',
            'Состояние запроса было изменено конкурентной операцией.'
          );
        }

        const updatedRes = await tx.execute({
          sql: 'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
          args: [current.id],
        });
        await tx.commit();
        return this.rowToRecord(updatedRes.rows[0]);
      } catch (err) {
        try {
          await tx.rollback();
        } catch {}
        throw err;
      } finally {
        try {
          tx.close();
        } catch {}
      }
    });
  }

  public async transitionAfterGameEnd(
    userId: string,
    options?: {
      requestId?: string;
      startImmediateProcessing?: boolean;
      nowMs?: number;
    }
  ): Promise<AccountDeletionRequestRecord> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) {
      throw new AccountDeletionError('INVALID_USER_ID', 'Не указан идентификатор пользователя.');
    }

    const nowMs =
      typeof options?.nowMs === 'number' && Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const nowIso = new Date(nowMs).toISOString();

    return rewardMutex.runExclusive(`user:${cleanUserId}`, async () => {
      const tx = await (this.db as any).transaction('write');
      try {
        const res = options?.requestId
          ? await tx.execute({
              sql: 'SELECT * FROM account_deletion_requests WHERE id = ? AND user_id = ? LIMIT 1',
              args: [options.requestId.trim(), cleanUserId],
            })
          : await tx.execute({
              sql: `SELECT * FROM account_deletion_requests
                    WHERE user_id = ? AND status = 'pending_game_end'
                    LIMIT 1`,
              args: [cleanUserId],
            });

        const row = res.rows[0];
        if (!row) {
          throw new AccountDeletionError(
            'DELETION_REQUEST_NOT_FOUND',
            'Активный запрос в состоянии pending_game_end не найден.'
          );
        }

        const current = this.rowToRecord(row);
        const targetStatus: AccountDeletionStatus =
          current.gracePeriodDays === 0 && options?.startImmediateProcessing === true
            ? 'processing'
            : 'scheduled';

        if (!isValidStatusTransition(current.status, targetStatus)) {
          throw new AccountDeletionError(
            'INVALID_STATUS_TRANSITION',
            `Переход из состояния «${current.status}» в «${targetStatus}» запрещён.`
          );
        }

        const scheduledPurgeAt = computeScheduledPurgeAt(nowMs, current.gracePeriodDays);
        const processingStartedAt = targetStatus === 'processing' ? nowIso : null;

        const updRes = await tx.execute({
          sql: `
            UPDATE account_deletion_requests SET
              status = ?,
              grace_started_at = ?,
              scheduled_purge_at = ?,
              processing_started_at = ?,
              version = version + 1,
              updated_at = ?
            WHERE id = ? AND status = ? AND version = ?
          `,
          args: sanitizeArgs([
            targetStatus,
            nowIso,
            scheduledPurgeAt,
            processingStartedAt,
            nowIso,
            current.id,
            current.status,
            current.version,
          ]),
        });

        if (Number(updRes.rowsAffected ?? 0) !== 1) {
          throw new AccountDeletionError(
            'CONCURRENT_STATE_CONFLICT',
            'Состояние запроса было изменено конкурентной операцией.'
          );
        }

        const updatedRes = await tx.execute({
          sql: 'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
          args: [current.id],
        });
        await tx.commit();
        return this.rowToRecord(updatedRes.rows[0]);
      } catch (err) {
        try {
          await tx.rollback();
        } catch {}
        throw err;
      } finally {
        try {
          tx.close();
        } catch {}
      }
    });
  }

  /**
   * Stage 1 state transition helper ONLY: marks a scheduled request as `processing`.
   * Does NOT delete or anonymize user records (physical purge belongs to later stages).
   */
  public async beginProcessingRequest(
    requestId: string,
    options?: {
      nowMs?: number;
      allowBeforeDue?: boolean;
    }
  ): Promise<AccountDeletionRequestRecord> {
    const cleanId = typeof requestId === 'string' ? requestId.trim() : '';
    if (!cleanId) {
      throw new AccountDeletionError('INVALID_REQUEST_ID', 'Не указан идентификатор запроса.');
    }

    const existing = await this.getRequestById(cleanId);
    if (!existing) {
      throw new AccountDeletionError('DELETION_REQUEST_NOT_FOUND', 'Запрос на удаление не найден.');
    }

    const nowMs =
      typeof options?.nowMs === 'number' && Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const nowIso = new Date(nowMs).toISOString();

    return rewardMutex.runExclusive(`user:${existing.userId}`, async () => {
      const tx = await (this.db as any).transaction('write');
      try {
        const res = await tx.execute({
          sql: 'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
          args: [cleanId],
        });
        const row = res.rows[0];
        if (!row) {
          throw new AccountDeletionError('DELETION_REQUEST_NOT_FOUND', 'Запрос на удаление не найден.');
        }
        const current = this.rowToRecord(row);

        if (!isValidStatusTransition(current.status, 'processing')) {
          throw new AccountDeletionError(
            'INVALID_STATUS_TRANSITION',
            `Переход из состояния «${current.status}» в «processing» запрещён.`
          );
        }

        if (current.status === 'scheduled' && !options?.allowBeforeDue) {
          const purgeMs = current.scheduledPurgeAt ? new Date(current.scheduledPurgeAt).getTime() : NaN;
          if (!Number.isFinite(purgeMs) || nowMs < purgeMs) {
            throw new AccountDeletionError(
              'GRACE_PERIOD_NOT_EXPIRED',
              'Срок ожидания удаления ещё не истёк.'
            );
          }
        }

        const graceStartedAt = current.graceStartedAt || nowIso;
        const scheduledPurgeAt =
          current.scheduledPurgeAt || computeScheduledPurgeAt(nowMs, current.gracePeriodDays);

        const updRes = await tx.execute({
          sql: `
            UPDATE account_deletion_requests SET
              status = 'processing',
              grace_started_at = ?,
              scheduled_purge_at = ?,
              processing_started_at = ?,
              version = version + 1,
              updated_at = ?
            WHERE id = ? AND status = ? AND version = ?
          `,
          args: sanitizeArgs([
            graceStartedAt,
            scheduledPurgeAt,
            nowIso,
            nowIso,
            current.id,
            current.status,
            current.version,
          ]),
        });

        if (Number(updRes.rowsAffected ?? 0) !== 1) {
          throw new AccountDeletionError(
            'CONCURRENT_STATE_CONFLICT',
            'Состояние запроса было изменено конкурентной операцией.'
          );
        }

        const updatedRes = await tx.execute({
          sql: 'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
          args: [current.id],
        });
        await tx.commit();
        return this.rowToRecord(updatedRes.rows[0]);
      } catch (err) {
        try {
          await tx.rollback();
        } catch {}
        throw err;
      } finally {
        try {
          tx.close();
        } catch {}
      }
    });
  }

  /**
   * Stage 1 state transition helper ONLY: marks a `processing` request as `completed`
   * and scrubs user_id / admin references so no email, name, or original Google UID remains.
   * Does NOT delete actual user data in Stage 1.
   */
  public async markRequestCompleted(
    requestId: string,
    nowMs: number = Date.now()
  ): Promise<AccountDeletionRequestRecord> {
    const cleanId = typeof requestId === 'string' ? requestId.trim() : '';
    if (!cleanId) {
      throw new AccountDeletionError('INVALID_REQUEST_ID', 'Не указан идентификатор запроса.');
    }

    const existing = await this.getRequestById(cleanId);
    if (!existing) {
      throw new AccountDeletionError('DELETION_REQUEST_NOT_FOUND', 'Запрос на удаление не найден.');
    }

    const validNowMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
    const nowIso = new Date(validNowMs).toISOString();

    return rewardMutex.runExclusive(`user:${existing.userId}`, async () => {
      const tx = await (this.db as any).transaction('write');
      try {
        const res = await tx.execute({
          sql: 'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
          args: [cleanId],
        });
        const row = res.rows[0];
        if (!row) {
          throw new AccountDeletionError('DELETION_REQUEST_NOT_FOUND', 'Запрос на удаление не найден.');
        }
        const current = this.rowToRecord(row);

        if (!isValidStatusTransition(current.status, 'completed')) {
          throw new AccountDeletionError(
            'INVALID_STATUS_TRANSITION',
            `Переход из состояния «${current.status}» в «completed» запрещён.`
          );
        }

        const scrubbedUserRef = `deleted:${current.operationToken}`;

        const updRes = await tx.execute({
          sql: `
            UPDATE account_deletion_requests SET
              status = 'completed',
              user_id = ?,
              initiated_by_admin_id = NULL,
              cancelled_by_id = NULL,
              completed_at = ?,
              version = version + 1,
              updated_at = ?
            WHERE id = ? AND status = ? AND version = ?
          `,
          args: sanitizeArgs([
            scrubbedUserRef,
            nowIso,
            nowIso,
            current.id,
            current.status,
            current.version,
          ]),
        });

        if (Number(updRes.rowsAffected ?? 0) !== 1) {
          throw new AccountDeletionError(
            'CONCURRENT_STATE_CONFLICT',
            'Состояние запроса было изменено конкурентной операцией.'
          );
        }

        const updatedRes = await tx.execute({
          sql: 'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
          args: [current.id],
        });
        await tx.commit();
        return this.rowToRecord(updatedRes.rows[0]);
      } catch (err) {
        try {
          await tx.rollback();
        } catch {}
        throw err;
      } finally {
        try {
          tx.close();
        } catch {}
      }
    });
  }

  public async checkUserActionAllowed(
    userId: string,
    action: AccountAction
  ): Promise<AccountActionCheckResult> {
    const active = await this.getActiveRequestByUserId(userId);
    return evaluateAccountActionPermission(active ? active.status : null, action);
  }

  public async assertUserActionAllowed(userId: string, action: AccountAction): Promise<void> {
    const check = await this.checkUserActionAllowed(userId, action);
    if (!check.allowed) {
      throw new AccountDeletionError(
        check.code || 'ACCOUNT_ACTION_BLOCKED',
        check.message || 'Действие недоступно для данного статуса учётной записи.'
      );
    }
  }

  public async isUserPublicProfileHidden(userId: string): Promise<boolean> {
    const check = await this.checkUserActionAllowed(userId, 'public_profile_view');
    return !check.allowed;
  }

  public async getHiddenProfileUserIdSet(): Promise<Set<string>> {
    const res = await this.db.execute({
      sql: `SELECT user_id FROM account_deletion_requests WHERE status IN ('scheduled', 'processing')`,
      args: [],
    });
    const hidden = new Set<string>();
    for (const row of res.rows) {
      const uid = typeof row.user_id === 'string' ? row.user_id.trim() : '';
      if (uid) hidden.add(uid);
    }
    return hidden;
  }

  public async convertScheduledToZeroGrace(input: {
    userId: string;
    nowMs?: number;
  }): Promise<AccountDeletionRequestRecord> {
    const cleanUserId = typeof input.userId === 'string' ? input.userId.trim() : '';
    if (!cleanUserId) {
      throw new AccountDeletionError('INVALID_USER_ID', 'Не указан идентификатор пользователя.');
    }

    const nowMs =
      typeof input.nowMs === 'number' && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
    const nowIso = new Date(nowMs).toISOString();

    return rewardMutex.runExclusive(`user:${cleanUserId}`, async () => {
      const tx = await (this.db as any).transaction('write');
      try {
        const res = await tx.execute({
          sql: `SELECT * FROM account_deletion_requests
                WHERE user_id = ? AND status = 'scheduled'
                LIMIT 1`,
          args: [cleanUserId],
        });
        const row = res.rows[0];
        if (!row) {
          throw new AccountDeletionError(
            'DELETION_REQUEST_NOT_FOUND',
            'Активный запрос в статусе «scheduled» не найден.'
          );
        }

        const current = this.rowToRecord(row);
        if (current.gracePeriodDays === 0) {
          await tx.commit();
          return current;
        }

        const graceStartedAt = current.graceStartedAt || nowIso;
        const scheduledPurgeAt = graceStartedAt;

        const updRes = await tx.execute({
          sql: `
            UPDATE account_deletion_requests SET
              grace_period_days = 0,
              grace_started_at = ?,
              scheduled_purge_at = ?,
              version = version + 1,
              updated_at = ?
            WHERE id = ? AND status = 'scheduled' AND version = ?
          `,
          args: sanitizeArgs([
            graceStartedAt,
            scheduledPurgeAt,
            nowIso,
            current.id,
            current.version,
          ]),
        });

        if (Number(updRes.rowsAffected ?? 0) !== 1) {
          throw new AccountDeletionError(
            'CONCURRENT_STATE_CONFLICT',
            'Состояние запроса было изменено конкурентной операцией.'
          );
        }

        const updatedRes = await tx.execute({
          sql: 'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
          args: [current.id],
        });
        await tx.commit();
        return this.rowToRecord(updatedRes.rows[0]);
      } catch (err) {
        try {
          await tx.rollback();
        } catch {}
        throw err;
      } finally {
        try {
          tx.close();
        } catch {}
      }
    });
  }

  public async transitionRoomParticipantsAfterGameEnd(
    userIds: readonly string[],
    options?: { nowMs?: number }
  ): Promise<AccountDeletionRequestRecord[]> {
    const cleanIds = Array.from(
      new Set(
        (userIds || [])
          .filter((id): id is string => typeof id === 'string')
          .map(id => id.trim())
          .filter(id => Boolean(id) && !id.startsWith('bot_') && !id.startsWith('guest_'))
      )
    );
    if (cleanIds.length === 0) return [];

    const placeholders = cleanIds.map(() => '?').join(', ');
    const pendingRes = await this.db.execute({
      sql: `SELECT user_id, id FROM account_deletion_requests
            WHERE status = 'pending_game_end' AND user_id IN (${placeholders})`,
      args: sanitizeArgs(cleanIds),
    });

    if (pendingRes.rows.length === 0) return [];

    const transitioned: AccountDeletionRequestRecord[] = [];
    for (const row of pendingRes.rows) {
      const uid = String(row.user_id);
      const reqId = String(row.id);
      try {
        const rec = await this.transitionAfterGameEnd(uid, {
          requestId: reqId,
          nowMs: options?.nowMs,
        });
        transitioned.push(rec);
      } catch (err) {
        if (
          err instanceof AccountDeletionError &&
          (err.code === 'DELETION_REQUEST_NOT_FOUND' ||
            err.code === 'CONCURRENT_STATE_CONFLICT' ||
            err.code === 'INVALID_STATUS_TRANSITION')
        ) {
          continue;
        }
        throw err;
      }
    }

    return transitioned;
  }

  public async reconcilePendingGameEndRequestsOnStartup(
    activeRooms: readonly RoomMatchSnapshot[],
    nowMs: number = Date.now()
  ): Promise<{
    transitioned: AccountDeletionRequestRecord[];
    unresolved: Array<{ requestId: string; userId: string; reason: string }>;
  }> {
    const pendingRes = await this.db.execute({
      sql: `SELECT * FROM account_deletion_requests WHERE status = 'pending_game_end' ORDER BY created_at ASC`,
      args: [],
    });

    const transitioned: AccountDeletionRequestRecord[] = [];
    const unresolved: Array<{ requestId: string; userId: string; reason: string }> = [];

    if (pendingRes.rows.length === 0) {
      return { transitioned, unresolved };
    }

    const roomsRes = await this.db
      .execute({
        sql: `SELECT room_code, host_id, phase, in_game, players_json, updated_at FROM game_rooms`,
        args: [],
      })
      .catch(() => ({ rows: [] as any[] }));

    const parsedRooms = (roomsRes.rows || []).map((r: any) => {
      let playerIds: string[] = [];
      try {
        const parsed = typeof r.players_json === 'string' ? JSON.parse(r.players_json) : r.players_json;
        if (Array.isArray(parsed)) {
          playerIds = parsed.map((x: any) => String(x)).filter(Boolean);
        }
      } catch {
        playerIds = [];
      }
      return {
        roomCode: String(r.room_code || ''),
        hostId: String(r.host_id || ''),
        phase: String(r.phase || ''),
        inGame: Number(r.in_game || 0) === 1,
        playerIds,
        updatedAt: String(r.updated_at || ''),
      };
    });

    for (const row of pendingRes.rows) {
      const req = this.rowToRecord(row);
      const activeMatch = detectUserActiveMatchFromRooms(req.userId, activeRooms);
      if (activeMatch.inActiveMatch) {
        continue;
      }

      const reqCreatedMs = new Date(req.createdAt).getTime();

      // Evidence 1: match_history row recorded after the deletion request was created
      const matchRes = await this.db
        .execute({
          sql: `SELECT id, played_at FROM match_history WHERE user_id = ? AND played_at >= ? ORDER BY played_at DESC LIMIT 1`,
          args: [req.userId, req.createdAt],
        })
        .catch(() => ({ rows: [] as any[] }));

      const hasMatchHistoryProof = matchRes.rows.length > 0;

      // Evidence 2: game_rooms row explicitly shows GAME_OVER or LOBBY updated at/after request creation
      const matchingRoom = parsedRooms.find(
        r => r.hostId === req.userId || r.playerIds.includes(req.userId)
      );
      const matchingRoomUpdatedMs = matchingRoom ? new Date(matchingRoom.updatedAt).getTime() : NaN;
      const hasFinishedRoomProof = Boolean(
        matchingRoom &&
          (matchingRoom.phase === 'GAME_OVER' || matchingRoom.phase === 'LOBBY') &&
          Number.isFinite(matchingRoomUpdatedMs) &&
          (!Number.isFinite(reqCreatedMs) || matchingRoomUpdatedMs >= reqCreatedMs)
      );

      if (hasMatchHistoryProof || hasFinishedRoomProof) {
        try {
          const rec = await this.transitionAfterGameEnd(req.userId, {
            requestId: req.id,
            nowMs,
          });
          transitioned.push(rec);
        } catch (err) {
          if (
            !(
              err instanceof AccountDeletionError &&
              (err.code === 'DELETION_REQUEST_NOT_FOUND' ||
                err.code === 'CONCURRENT_STATE_CONFLICT' ||
                err.code === 'INVALID_STATUS_TRANSITION')
            )
          ) {
            throw err;
          }
        }
      } else {
        // Do NOT treat missing or mid-game game_rooms rows as unconditional proof of normal match end
        unresolved.push({
          requestId: req.id,
          userId: req.userId,
          reason: matchingRoom
            ? `Persisted room ${matchingRoom.roomCode} remained in phase ${matchingRoom.phase}`
            : 'No persisted post-request match_history or finished game_rooms evidence found after restart',
        });
      }
    }

    return { transitioned, unresolved };
  }
}

export const accountDeletionDb = new AccountDeletionDatabase();
