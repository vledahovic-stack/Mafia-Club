import { randomBytes } from 'node:crypto';
import type { Client } from '@libsql/client';
import { getDatabase, sanitizeArgs } from './database';
import { isMainAdminEmail } from './users';
import {
  AccountDeletionError,
  AccountDeletionRequestRecord,
  RoomMatchSnapshot,
  detectUserActiveMatchFromRooms,
} from './accountDeletion';
import { rewardMutex } from '../utils/asyncLock';

export const DEFAULT_STALE_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_MAX_PURGE_RETRIES = 5;
const RETRY_BACKOFF_DELAYS_MS = [30_000, 120_000, 300_000, 900_000, 1_800_000];

export function isAutomaticAccountPurgeEnabled(): boolean {
  return process.env.ENABLE_AUTOMATIC_ACCOUNT_PURGE === 'true';
}

export interface RuntimePurgeHooks {
  getRoomsSnapshot?: () => RoomMatchSnapshot[];
  closeUserSessions?: (userId: string) => Promise<void> | void;
  cleanupUserFromRooms?: (userId: string) => Promise<void> | void;
  cleanupVisitorPresence?: (userId: string) => Promise<void> | void;
}

export interface PostCommitCleanupContext {
  userId: string;
  requestId: string;
  operationToken: string;
  customHook?: (ctx: { userId: string; requestId: string; operationToken: string }) => Promise<void> | void;
}

export interface ExecutePhysicalPurgeOptions {
  requestId: string;
  nowMs?: number;
  allowBeforeDue?: boolean;
  staleProcessingTimeoutMs?: number;
  forceResumeProcessing?: boolean;
  roomsSnapshot?: readonly RoomMatchSnapshot[];
  postCommitHook?: (ctx: { userId: string; requestId: string; operationToken: string }) => Promise<void> | void;
  /** Test-only fault injection point inside write transaction prior to DELETE FROM users */
  simulateTxFailurePoint?: 'before_users_delete';
}

export interface ExecutePhysicalPurgeResult {
  success: boolean;
  requestId: string;
  deletedUserId: string;
  operationToken: string;
  completedAt: string;
  wasPartner: boolean;
  clansAffected: number;
  clansDisbanded: number;
  postCommitSuccess: boolean;
  postCommitError?: string;
}

export interface ProcessDueDeletionsOptions {
  nowMs?: number;
  limit?: number;
  staleProcessingTimeoutMs?: number;
  maxRetries?: number;
  /** Must stay false unless explicitly overridden by isolated automated tests or env ENABLE_AUTOMATIC_ACCOUNT_PURGE=true */
  enableAutoPurgeOverride?: boolean;
  roomsSnapshot?: readonly RoomMatchSnapshot[];
}

export interface ProcessDueDeletionsResult {
  enabled: boolean;
  scanned: number;
  succeeded: string[];
  failed: Array<{ requestId: string; code: string; error: string }>;
  skipped: Array<{ requestId: string; reason: string }>;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeSqlLike(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function sanitizePurgeErrorMessage(
  err: unknown,
  redactions?: { userId?: string | null; email?: string | null; displayName?: string | null }
): string {
  let msg = err instanceof Error ? err.message : String(err || 'Unknown purge error');
  msg = msg.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  if (redactions?.email && redactions.email.trim().length >= 3) {
    msg = msg.replace(new RegExp(escapeRegExp(redactions.email.trim()), 'gi'), '[email]');
  }
  if (redactions?.userId && redactions.userId.trim().length >= 3) {
    msg = msg.replace(new RegExp(escapeRegExp(redactions.userId.trim()), 'g'), '[user]');
  }
  if (redactions?.displayName && redactions.displayName.trim().length >= 2) {
    msg = msg.replace(new RegExp(escapeRegExp(redactions.displayName.trim()), 'gi'), '[name]');
  }
  return msg.slice(0, 300);
}

function scrubPiiFromText(
  text: string | null | undefined,
  opts: { userId: string; email: string; displayName: string; nameReplacement: string }
): string {
  if (!text || typeof text !== 'string') return '';
  let out = text;
  if (opts.email && opts.email.trim().length >= 3) {
    out = out.replace(new RegExp(escapeRegExp(opts.email.trim()), 'gi'), '[удалено]');
  }
  if (opts.userId && opts.userId.trim().length >= 3) {
    out = out.replace(new RegExp(escapeRegExp(opts.userId.trim()), 'g'), '[удалено]');
  }
  if (opts.displayName && opts.displayName.trim().length >= 2) {
    out = out.replace(new RegExp(escapeRegExp(opts.displayName.trim()), 'gi'), opts.nameReplacement);
  }
  return out;
}

const PII_METADATA_KEYS = new Set([
  'email',
  'adminEmail',
  'targetEmail',
  'recipientEmail',
  'userEmail',
  'userId',
  'targetUserId',
  'adminId',
  'targetId',
  'initiatedByAdminId',
  'cancelledById',
  'googleUid',
]);

function scrubMetadataValue(
  val: unknown,
  opts: { userId: string; emailLower: string; displayName: string; anonRef: string }
): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    const trimmedLower = val.trim().toLowerCase();
    if (opts.emailLower && trimmedLower === opts.emailLower) {
      return '[удалено]';
    }
    if (opts.userId && val.trim() === opts.userId) {
      return opts.anonRef;
    }
    return scrubPiiFromText(val, {
      userId: opts.userId,
      email: opts.emailLower,
      displayName: opts.displayName,
      nameReplacement: 'Удалённый игрок',
    });
  }
  if (Array.isArray(val)) {
    return val.map((item) => scrubMetadataValue(item, opts));
  }
  if (typeof val === 'object') {
    const record = val as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      if (PII_METADATA_KEYS.has(k) && typeof v === 'string') {
        const lowerV = v.trim().toLowerCase();
        if (lowerV === opts.emailLower) {
          next[k] = '[удалено]';
          continue;
        }
        if (v.trim() === opts.userId) {
          next[k] = opts.anonRef;
          continue;
        }
      }
      next[k] = scrubMetadataValue(v, opts);
    }
    return next;
  }
  return val;
}

function rowToDeletionRecord(row: any): AccountDeletionRequestRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    initiatorType: String(row.initiator_type) as 'self' | 'admin',
    initiatedByAdminId: row.initiated_by_admin_id ? String(row.initiated_by_admin_id) : null,
    status: String(row.status) as AccountDeletionRequestRecord['status'],
    gracePeriodDays: Number(row.grace_period_days),
    createdAt: String(row.created_at),
    graceStartedAt: row.grace_started_at ? String(row.grace_started_at) : null,
    scheduledPurgeAt: row.scheduled_purge_at ? String(row.scheduled_purge_at) : null,
    processingStartedAt: row.processing_started_at ? String(row.processing_started_at) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    cancelledByType: row.cancelled_by_type ? (String(row.cancelled_by_type) as 'self' | 'admin') : null,
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

export class AccountDeletionPurgeService {
  private readonly customDb?: Client;
  private runtimeHooks: RuntimePurgeHooks = {};
  private readonly pendingPostCommitCleanups = new Map<string, PostCommitCleanupContext>();

  constructor(customDb?: Client) {
    this.customDb = customDb;
  }

  private get db(): Client {
    return this.customDb ?? getDatabase();
  }

  public registerRuntimeHooks(hooks: RuntimePurgeHooks): void {
    this.runtimeHooks = { ...this.runtimeHooks, ...hooks };
  }

  public clearRuntimeHooks(): void {
    this.runtimeHooks = {};
  }

  public getPendingPostCommitCleanupUserIds(): string[] {
    return Array.from(this.pendingPostCommitCleanups.keys());
  }

  private async runPostCommitCleanupsForContext(ctx: PostCommitCleanupContext): Promise<void> {
    if (ctx.customHook) {
      await ctx.customHook({
        userId: ctx.userId,
        requestId: ctx.requestId,
        operationToken: ctx.operationToken,
      });
    }
    if (this.runtimeHooks.closeUserSessions) {
      await this.runtimeHooks.closeUserSessions(ctx.userId);
    }
    if (this.runtimeHooks.cleanupUserFromRooms) {
      await this.runtimeHooks.cleanupUserFromRooms(ctx.userId);
    }
    if (this.runtimeHooks.cleanupVisitorPresence) {
      await this.runtimeHooks.cleanupVisitorPresence(ctx.userId);
    }
  }

  public async flushPendingPostCommitCleanups(): Promise<{
    attempted: number;
    succeeded: string[];
    failed: Array<{ userId: string; error: string }>;
  }> {
    const entries = Array.from(this.pendingPostCommitCleanups.entries());
    const succeeded: string[] = [];
    const failed: Array<{ userId: string; error: string }> = [];

    for (const [userId, ctx] of entries) {
      try {
        await this.runPostCommitCleanupsForContext(ctx);
        this.pendingPostCommitCleanups.delete(userId);
        succeeded.push(userId);
      } catch (err) {
        failed.push({ userId, error: sanitizePurgeErrorMessage(err, { userId }) });
      }
    }

    return { attempted: entries.length, succeeded, failed };
  }

  private async recordRetryFailure(
    requestId: string,
    userId: string,
    email: string,
    displayName: string,
    nowMs: number,
    err: unknown
  ): Promise<void> {
    try {
      const res = await this.db.execute({
        sql: 'SELECT retry_count FROM account_deletion_requests WHERE id = ? LIMIT 1',
        args: [requestId],
      });
      const currentRetries = Number(res.rows[0]?.retry_count ?? 0);
      const nextRetryIndex = Math.min(RETRY_BACKOFF_DELAYS_MS.length - 1, Math.max(0, currentRetries));
      const backoffMs = RETRY_BACKOFF_DELAYS_MS[nextRetryIndex];
      const nextRetryAt = new Date(nowMs + backoffMs).toISOString();
      const nowIso = new Date(nowMs).toISOString();
      const safeError = sanitizePurgeErrorMessage(err, { userId, email, displayName });

      await this.db.execute({
        sql: `
          UPDATE account_deletion_requests SET
            retry_count = retry_count + 1,
            last_error = ?,
            next_retry_at = ?,
            updated_at = ?
          WHERE id = ? AND status = 'processing'
        `,
        args: sanitizeArgs([safeError, nextRetryAt, nowIso, requestId]),
      });
    } catch {
      // ignore secondary failure recording error
    }
  }

  private async findCandidateClansForUser(userId: string, userClanId: string | null): Promise<string[]> {
    const pattern = `%${escapeSqlLike(userId)}%`;
    const res = await this.db.execute({
      sql: `SELECT id FROM clans WHERE id = ? OR leader_id = ? OR members LIKE ? ESCAPE '\\'`,
      args: [userClanId || '', userId, pattern],
    });
    const ids = new Set<string>();
    for (const r of res.rows) {
      if (r.id) ids.add(String(r.id));
    }
    return Array.from(ids).sort();
  }

  private async acquireClanLocksAndRun<T>(
    clanIds: string[],
    fn: () => Promise<T>
  ): Promise<T> {
    if (clanIds.length === 0) {
      return fn();
    }
    const [head, ...tail] = clanIds;
    return rewardMutex.runExclusive(`clan:${head}`, () => this.acquireClanLocksAndRun(tail, fn));
  }

  /**
   * Executes the complete, atomic, irreversible Stage 4 physical purge and anonymization
   * for a single `account_deletion_requests` record.
   *
   * Safety guarantees:
   * - Never deletes Main Admin.
   * - Refuses if user is in an active gameplay match (`phase !== 'LOBBY' && phase !== 'GAME_OVER'`).
   * - Claims via strict optimistic CAS lock (`WHERE id = ? AND status = ? AND version = ?`).
   * - Performs all DB deletions and anonymizations in a single `'write'` transaction.
   * - Executes post-commit WS/room/presence cleanup STRICTLY OUTSIDE the SQL transaction.
   */
  public async executeAccountPhysicalPurge(
    options: ExecutePhysicalPurgeOptions
  ): Promise<ExecutePhysicalPurgeResult> {
    const cleanRequestId = typeof options.requestId === 'string' ? options.requestId.trim() : '';
    if (!cleanRequestId) {
      throw new AccountDeletionError('INVALID_REQUEST_ID', 'Не указан идентификатор заявки на удаление.');
    }

    const nowMs =
      typeof options.nowMs === 'number' && Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const staleTimeoutMs =
      typeof options.staleProcessingTimeoutMs === 'number' &&
      Number.isFinite(options.staleProcessingTimeoutMs)
        ? Math.max(0, options.staleProcessingTimeoutMs)
        : DEFAULT_STALE_PROCESSING_TIMEOUT_MS;

    const initialRes = await this.db.execute({
      sql: 'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
      args: [cleanRequestId],
    });
    if (!initialRes.rows[0]) {
      throw new AccountDeletionError('DELETION_REQUEST_NOT_FOUND', 'Запрос на удаление не найден.');
    }
    const initialReq = rowToDeletionRecord(initialRes.rows[0]);
    const targetUserId = initialReq.userId;

    if (initialReq.status === 'cancelled') {
      throw new AccountDeletionError(
        'DELETION_REQUEST_CANCELLED',
        'Запрос на удаление был отменён и не может быть выполнен.'
      );
    }
    if (initialReq.status === 'completed' || targetUserId.startsWith('deleted:')) {
      throw new AccountDeletionError(
        'DELETION_ALREADY_COMPLETED',
        'Физическое удаление аккаунта по этой заявке уже выполнено.'
      );
    }
    if (initialReq.status === 'pending_game_end') {
      throw new AccountDeletionError(
        'USER_IN_ACTIVE_MATCH',
        'Невозможно удалить аккаунт до завершения активной игровой партии.'
      );
    }

    const roomsSnapshot = options.roomsSnapshot ?? this.runtimeHooks.getRoomsSnapshot?.() ?? [];

    const purgeOutcome = await rewardMutex.runExclusive(`user:${targetUserId}`, async () => {
      // Re-read request under user mutex
      const reqCheckRes = await this.db.execute({
        sql: 'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
        args: [cleanRequestId],
      });
      if (!reqCheckRes.rows[0]) {
        throw new AccountDeletionError('DELETION_REQUEST_NOT_FOUND', 'Запрос на удаление не найден.');
      }
      const currentReq = rowToDeletionRecord(reqCheckRes.rows[0]);

      if (currentReq.status === 'cancelled') {
        throw new AccountDeletionError(
          'DELETION_REQUEST_CANCELLED',
          'Запрос на удаление был отменён и не может быть выполнен.'
        );
      }
      if (currentReq.status === 'completed') {
        throw new AccountDeletionError(
          'DELETION_ALREADY_COMPLETED',
          'Физическое удаление аккаунта по этой заявке уже выполнено.'
        );
      }
      if (currentReq.status === 'pending_game_end') {
        throw new AccountDeletionError(
          'USER_IN_ACTIVE_MATCH',
          'Невозможно удалить аккаунт до завершения активной игровой партии.'
        );
      }

      // Guard 1: Check due time when scheduled
      if (currentReq.status === 'scheduled' && !options.allowBeforeDue) {
        const purgeMs = currentReq.scheduledPurgeAt ? Date.parse(currentReq.scheduledPurgeAt) : NaN;
        if (!Number.isFinite(purgeMs) || nowMs < purgeMs) {
          throw new AccountDeletionError(
            'GRACE_PERIOD_NOT_EXPIRED',
            'Срок ожидания удаления ещё не истёк.'
          );
        }
      }

      // Guard 2: Active match verification via runtime rooms snapshot
      const activeMatch = detectUserActiveMatchFromRooms(targetUserId, roomsSnapshot);
      if (activeMatch.inActiveMatch) {
        throw new AccountDeletionError(
          'USER_IN_ACTIVE_MATCH',
          'Нельзя физически удалить аккаунт во время активной игровой партии.'
        );
      }

      // Also check persisted game_rooms for any active in_game room referencing targetUserId
      // only when runtime snapshot wasn't explicitly blocking — in-memory RoomManager is authoritative at runtime.

      // Guard 3: Read user record & verify Main Admin protection BEFORE claiming
      const userRes = await this.db.execute({
        sql: 'SELECT id, email, display_name, clan_id, role, is_admin FROM users WHERE id = ? LIMIT 1',
        args: [targetUserId],
      });
      const userRow = userRes.rows[0];

      if (!userRow) {
        if (currentReq.status === 'processing') {
          // Crash recovery edge case: users row was already deleted, only request status remained 'processing'
          const scrubbedRef = `deleted:${currentReq.operationToken}`;
          const fixTx = await (this.db as any).transaction('write');
          try {
            await fixTx.execute({
              sql: `
                UPDATE account_deletion_requests SET
                  status = 'completed',
                  user_id = ?,
                  initiated_by_admin_id = NULL,
                  cancelled_by_id = NULL,
                  completed_at = ?,
                  last_error = NULL,
                  next_retry_at = NULL,
                  version = version + 1,
                  updated_at = ?
                WHERE id = ? AND status = 'processing' AND version = ?
              `,
              args: sanitizeArgs([
                scrubbedRef,
                nowIso,
                nowIso,
                currentReq.id,
                currentReq.version,
              ]),
            });
            await fixTx.commit();
            return {
              deletedUserId: targetUserId,
              operationToken: currentReq.operationToken,
              completedAt: nowIso,
              wasPartner: false,
              clansAffected: 0,
              clansDisbanded: 0,
            };
          } catch (e) {
            try { await fixTx.rollback(); } catch {}
            throw e;
          } finally {
            try { fixTx.close(); } catch {}
          }
        }
        throw new AccountDeletionError('USER_NOT_FOUND', 'Пользователь не найден.');
      }

      const userEmail = String(userRow.email || '').trim();
      const userEmailLower = userEmail.toLowerCase();
      const userDisplayName = String(userRow.display_name || '').trim();
      const userClanId = userRow.clan_id ? String(userRow.clan_id) : null;

      if (isMainAdminEmail(userEmail)) {
        throw new AccountDeletionError(
          'CANNOT_DELETE_MAIN_ADMIN',
          'Удаление учётной записи главного администратора запрещено системой безопасности.'
        );
      }

      // Phase A: Optimistic CAS Claim BEFORE opening main purge transaction
      let claimedVersion = currentReq.version;
      const claimTx = await (this.db as any).transaction('write');
      try {
        if (currentReq.status === 'scheduled') {
          const claimRes = await claimTx.execute({
            sql: `
              UPDATE account_deletion_requests SET
                status = 'processing',
                processing_started_at = ?,
                next_retry_at = NULL,
                version = version + 1,
                updated_at = ?
              WHERE id = ? AND status = 'scheduled' AND version = ?
            `,
            args: sanitizeArgs([nowIso, nowIso, currentReq.id, currentReq.version]),
          });
          if (Number(claimRes.rowsAffected ?? 0) !== 1) {
            throw new AccountDeletionError(
              'CONCURRENT_STATE_CONFLICT',
              'Заявка уже захвачена другим обработчиком или её статус изменился.'
            );
          }
          claimedVersion = currentReq.version + 1;
        } else if (currentReq.status === 'processing') {
          const startedMs = currentReq.processingStartedAt
            ? Date.parse(currentReq.processingStartedAt)
            : 0;
          const nextRetryMs = currentReq.nextRetryAt ? Date.parse(currentReq.nextRetryAt) : NaN;
          const isBackoffReady = Number.isFinite(nextRetryMs) && nowMs >= nextRetryMs;
          const isStale = !Number.isFinite(startedMs) || nowMs - startedMs >= staleTimeoutMs;

          if (!options.forceResumeProcessing && !isBackoffReady && !isStale) {
            throw new AccountDeletionError(
              'PURGE_IN_PROGRESS',
              'Удаление по этой заявке уже выполняется другим воркером.'
            );
          }

          const claimRes = await claimTx.execute({
            sql: `
              UPDATE account_deletion_requests SET
                processing_started_at = ?,
                next_retry_at = NULL,
                version = version + 1,
                updated_at = ?
              WHERE id = ? AND status = 'processing' AND version = ?
            `,
            args: sanitizeArgs([nowIso, nowIso, currentReq.id, currentReq.version]),
          });
          if (Number(claimRes.rowsAffected ?? 0) !== 1) {
            throw new AccountDeletionError(
              'CONCURRENT_STATE_CONFLICT',
              'Заявка уже захвачена другим обработчиком или её статус изменился.'
            );
          }
          claimedVersion = currentReq.version + 1;
        }
        await claimTx.commit();
      } catch (err) {
        try { await claimTx.rollback(); } catch {}
        throw err;
      } finally {
        try { claimTx.close(); } catch {}
      }

      // Collect candidate clans in deterministic sorted order for deadlock-free nested locking (user:* -> clan:*)
      const candidateClanIds = await this.findCandidateClansForUser(targetUserId, userClanId);

      // Phase B: Single Atomic Write Transaction for Full Physical Deletion & Anonymization
      return this.acquireClanLocksAndRun(candidateClanIds, async () => {
        const tx = await (this.db as any).transaction('write');
        let clansAffected = 0;
        let clansDisbanded = 0;
        let wasPartner = false;

        try {
          const anonRef = `deleted_anon_${currentReq.operationToken}`;
          const scrubbedCompletedUserId = `deleted:${currentReq.operationToken}`;

          // 1. Auth verification / reset / rate-limit tokens
          await tx.execute({
            sql: 'DELETE FROM email_verification_codes WHERE user_id = ? OR LOWER(email) = LOWER(?)',
            args: [targetUserId, userEmailLower],
          });
          await tx.execute({
            sql: 'DELETE FROM password_reset_codes WHERE user_id = ? OR LOWER(email) = LOWER(?)',
            args: [targetUserId, userEmailLower],
          });
          await tx.execute({
            sql: `DELETE FROM ip_rate_limits WHERE ip LIKE ? ESCAPE '\\'`,
            args: [`%|${escapeSqlLike(targetUserId)}`],
          });

          // 2. Mutual social relations (friends, blacklists, invites, notifications)
          await tx.execute({
            sql: 'DELETE FROM user_friends WHERE user_id = ? OR friend_id = ?',
            args: [targetUserId, targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM user_blocks WHERE user_id = ? OR blocked_user_id = ?',
            args: [targetUserId, targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM room_invites WHERE from_user_id = ? OR to_user_id = ?',
            args: [targetUserId, targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM user_notifications WHERE user_id = ? OR actor_id = ?',
            args: [targetUserId, targetUserId],
          });

          // 3. Personal history, progression, tasks, economy, lootboxes, premium, feedback, visitors, push
          await tx.execute({
            sql: 'DELETE FROM match_history WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM user_premium_status WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM daily_bonus_claims WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM user_task_progress WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM user_personal_tasks WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM lootbox_open_operations WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM role_card_refunds WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM loyalty_bonus_claims WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM campaign_claims WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM user_daily_activity WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM feedbacks WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM visitor_logs WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM admin_push_subscriptions WHERE admin_user_id = ? OR LOWER(admin_email) = LOWER(?)',
            args: [targetUserId, userEmailLower],
          });
          await tx.execute({
            sql: 'DELETE FROM economy_transactions WHERE user_id = ?',
            args: [targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM mail_admin_rate_limits WHERE admin_id = ?',
            args: [targetUserId],
          });

          // Clear optional created_by / updated_by references to deleted user/admin
          for (const table of ['promo_codes', 'campaigns']) {
            await tx.execute({
              sql: `UPDATE ${table} SET created_by = NULL WHERE created_by = ? OR LOWER(created_by) = LOWER(?)`,
              args: [targetUserId, userEmailLower],
            });
          }
          for (const table of ['mail_config', 'loyalty_configs', 'premium_config', 'project_settings']) {
            await tx.execute({
              sql: `UPDATE ${table} SET updated_by = NULL WHERE updated_by = ? OR LOWER(updated_by) = LOWER(?)`,
              args: [targetUserId, userEmailLower],
            });
          }

          // 4. Clans: disband if last member, deterministic leader handoff if leader, remove member & clean clan_event_progress
          const clanSqlPattern = `%${escapeSqlLike(targetUserId)}%`;
          const clanRowsRes = await tx.execute({
            sql: `SELECT * FROM clans WHERE id = ? OR leader_id = ? OR members LIKE ? ESCAPE '\\'`,
            args: [userClanId || '', targetUserId, clanSqlPattern],
          });

          for (const clanRow of clanRowsRes.rows) {
            const clanId = String(clanRow.id);
            let members: Array<Record<string, any>> = [];
            try {
              const parsed =
                typeof clanRow.members === 'string' ? JSON.parse(clanRow.members) : clanRow.members;
              if (Array.isArray(parsed)) members = parsed;
            } catch {
              members = [];
            }

            const isLeader = String(clanRow.leader_id || '') === targetUserId;
            const isListedMember = members.some((m) => m && String(m.userId) === targetUserId);
            if (!isLeader && !isListedMember) {
              continue;
            }

            clansAffected++;
            const remaining = members.filter((m) => m && String(m.userId) !== targetUserId);

            if (remaining.length === 0) {
              clansDisbanded++;
              await tx.execute({
                sql: 'DELETE FROM clan_event_progress WHERE clan_id = ?',
                args: [clanId],
              });
              await tx.execute({
                sql: 'DELETE FROM clans WHERE id = ?',
                args: [clanId],
              });
            } else {
              let nextLeaderId = String(clanRow.leader_id || '');
              let nextLeaderName = String(clanRow.leader_name || '');

              if (isLeader || !remaining.some((m) => String(m.userId) === nextLeaderId)) {
                // Deterministic successor selection: earliest valid joinedAt ascending, then original array index
                const ranked = remaining.map((member, index) => {
                  const ts = member.joinedAt ? Date.parse(String(member.joinedAt)) : NaN;
                  return {
                    member,
                    index,
                    sortMs: Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER,
                  };
                });
                ranked.sort((a, b) => {
                  if (a.sortMs !== b.sortMs) return a.sortMs - b.sortMs;
                  return a.index - b.index;
                });

                const promoted = ranked[0].member;
                nextLeaderId = String(promoted.userId);

                const leaderUserRes = await tx.execute({
                  sql: 'SELECT display_name FROM users WHERE id = ? LIMIT 1',
                  args: [nextLeaderId],
                });
                nextLeaderName = leaderUserRes.rows[0]?.display_name
                  ? String(leaderUserRes.rows[0].display_name)
                  : String(promoted.displayName || 'Лидер');

                for (const m of remaining) {
                  m.role = String(m.userId) === nextLeaderId ? 'leader' : 'member';
                }

                await tx.execute({
                  sql: `UPDATE users SET clan_role = 'leader', updated_at = ? WHERE id = ? AND clan_id = ?`,
                  args: [nowIso, nextLeaderId, clanId],
                });
              }

              const totalRating = remaining.reduce(
                (acc, m) => acc + (typeof m.rating === 'number' && Number.isFinite(m.rating) ? m.rating : 1000),
                0
              );

              await tx.execute({
                sql: `
                  UPDATE clans SET
                    leader_id = ?,
                    leader_name = ?,
                    members = ?,
                    rating = ?,
                    updated_at = ?
                  WHERE id = ?
                `,
                args: sanitizeArgs([
                  nextLeaderId,
                  nextLeaderName,
                  JSON.stringify(remaining),
                  totalRating,
                  nowIso,
                  clanId,
                ]),
              });

              // Preserve clan's total_clan_points and other members' progress in clan_event_progress,
              // removing only keys belonging to the deleted user
              const progRes = await tx.execute({
                sql: 'SELECT id, claimed_milestones, member_contributions FROM clan_event_progress WHERE clan_id = ?',
                args: [clanId],
              });
              for (const pRow of progRes.rows) {
                let claimedMap: Record<string, unknown> = {};
                let contribMap: Record<string, unknown> = {};
                try {
                  claimedMap = JSON.parse(String(pRow.claimed_milestones || '{}')) || {};
                } catch {}
                try {
                  contribMap = JSON.parse(String(pRow.member_contributions || '{}')) || {};
                } catch {}

                const hadKey =
                  Object.prototype.hasOwnProperty.call(claimedMap, targetUserId) ||
                  Object.prototype.hasOwnProperty.call(contribMap, targetUserId);
                if (hadKey) {
                  delete claimedMap[targetUserId];
                  delete contribMap[targetUserId];
                  await tx.execute({
                    sql: `
                      UPDATE clan_event_progress SET
                        claimed_milestones = ?,
                        member_contributions = ?,
                        updated_at = ?
                      WHERE id = ?
                    `,
                    args: [JSON.stringify(claimedMap), JSON.stringify(contribMap), nowIso, String(pRow.id)],
                  });
                }
              }
            }
          }

          // 5. Persisted game_rooms cleanup
          const roomRowsRes = await tx.execute({
            sql: `SELECT * FROM game_rooms WHERE host_id = ? OR players_json LIKE ? ESCAPE '\\' OR spectators LIKE ? ESCAPE '\\'`,
            args: [targetUserId, clanSqlPattern, clanSqlPattern],
          });
          for (const rRow of roomRowsRes.rows) {
            const roomCode = String(rRow.room_code);
            let playersList: any[] = [];
            let spectatorsList: any[] = [];
            try {
              playersList = JSON.parse(String(rRow.players_json || '[]')) || [];
            } catch {}
            try {
              spectatorsList = JSON.parse(String(rRow.spectators || '[]')) || [];
            } catch {}

            const filteredPlayers = Array.isArray(playersList)
              ? playersList.filter((id) => String(id) !== targetUserId)
              : [];
            const filteredSpectators = Array.isArray(spectatorsList)
              ? spectatorsList.filter((s) => !(s && String(s.id) === targetUserId))
              : [];

            const wasHost = String(rRow.host_id || '') === targetUserId;
            if (wasHost && filteredPlayers.length === 0) {
              await tx.execute({
                sql: 'DELETE FROM game_rooms WHERE room_code = ?',
                args: [roomCode],
              });
            } else {
              await tx.execute({
                sql: `
                  UPDATE game_rooms SET
                    host_id = ?,
                    host_name = ?,
                    players_json = ?,
                    spectators = ?,
                    player_count = ?,
                    updated_at = ?
                  WHERE room_code = ?
                `,
                args: sanitizeArgs([
                  wasHost ? '' : rRow.host_id,
                  wasHost ? 'Удалённый игрок' : rRow.host_name,
                  JSON.stringify(filteredPlayers),
                  JSON.stringify(filteredSpectators),
                  filteredPlayers.length > 0 ? filteredPlayers.length : Number(rRow.player_count || 0),
                  nowIso,
                  roomCode,
                ]),
              });
            }
          }

          // 6. Lobby chat anonymization (preserving conversation continuity for other players)
          const chatRes = await tx.execute({
            sql: 'SELECT id, text FROM lobby_chat WHERE sender_id = ?',
            args: [targetUserId],
          });
          for (const cRow of chatRes.rows) {
            const cleanText = scrubPiiFromText(String(cRow.text || ''), {
              userId: targetUserId,
              email: userEmail,
              displayName: userDisplayName,
              nameReplacement: 'Удалённый игрок',
            });
            await tx.execute({
              sql: `UPDATE lobby_chat SET sender_id = 'deleted_player', sender_name = 'Удалённый игрок', text = ? WHERE id = ?`,
              args: [cleanText, String(cRow.id)],
            });
          }

          // 7. Partner & Promo Code System (Player AND Partner deletion semantics)
          const partnerRes = await tx.execute({
            sql: 'SELECT id FROM partners WHERE user_id = ?',
            args: [targetUserId],
          });
          wasPartner = partnerRes.rows.length > 0;

          if (wasPartner) {
            await tx.execute({
              sql: `
                UPDATE partners SET
                  is_deleted = 1,
                  is_enabled = 0,
                  user_id = ?,
                  display_name_snapshot = 'Удалённый игрок',
                  email_snapshot = '',
                  created_by = CASE WHEN created_by = ? OR LOWER(created_by) = LOWER(?) THEN NULL ELSE created_by END,
                  deleted_at = COALESCE(deleted_at, ?),
                  updated_at = ?
                WHERE user_id = ?
              `,
              args: [anonRef, targetUserId, userEmailLower, nowIso, nowIso, targetUserId],
            });
            await tx.execute({
              sql: `
                UPDATE partner_referral_codes SET
                  is_deleted = 1,
                  is_enabled = 0,
                  partner_user_id = ?,
                  deleted_at = COALESCE(deleted_at, ?),
                  updated_at = ?
                WHERE partner_user_id = ?
              `,
              args: [anonRef, nowIso, nowIso, targetUserId],
            });
            await tx.execute({
              sql: 'UPDATE user_partner_bindings SET partner_user_id = ? WHERE partner_user_id = ?',
              args: [anonRef, targetUserId],
            });
            await tx.execute({
              sql: `
                UPDATE promo_reward_obligations SET
                  recipient_user_id = ?,
                  status = CASE WHEN status = 'pending' THEN 'cancelled_recipient_deleted' ELSE status END,
                  updated_at = ?
                WHERE recipient_user_id = ? AND recipient_type = 'partner'
              `,
              args: [anonRef, nowIso, targetUserId],
            });

            // Scrub partnerUserId & partner displayName inside promo_activations.snapshot_json too
            const partnerActRes = await tx.execute({
              sql: 'SELECT id, snapshot_json, code_text_snapshot FROM promo_activations WHERE partner_user_id = ?',
              args: [targetUserId],
            });
            for (const actRow of partnerActRes.rows) {
              let snapStr = String(actRow.snapshot_json || '{}');
              try {
                const snap = JSON.parse(snapStr);
                if (snap && typeof snap === 'object') {
                  if (snap.partnerUserId === targetUserId) {
                    snap.partnerUserId = anonRef;
                  }
                  if (typeof snap.title === 'string') {
                    const codeDisp = snap.codeDisplay || actRow.code_text_snapshot || '';
                    snap.title = `Партнёрский код ${codeDisp} (Удалённый игрок)`;
                  }
                  snapStr = JSON.stringify(snap);
                }
              } catch {
                snapStr = scrubPiiFromText(snapStr, {
                  userId: targetUserId,
                  email: userEmail,
                  displayName: userDisplayName,
                  nameReplacement: 'Удалённый игрок',
                });
              }

              await tx.execute({
                sql: `
                  UPDATE promo_activations SET
                    partner_user_id = ?,
                    snapshot_json = ?,
                    partner_reward_status = CASE
                      WHEN partner_reward_status IN ('pending_conditions', 'pending_unban') THEN 'cancelled_partner_deleted'
                      ELSE partner_reward_status
                    END,
                    updated_at = ?
                  WHERE id = ?
                `,
                args: [anonRef, snapStr, nowIso, String(actRow.id)],
              });
            }
          }

          // Clear partner/promo creator metadata if secondary admin created partners
          await tx.execute({
            sql: 'UPDATE partners SET created_by = NULL WHERE created_by = ? OR LOWER(created_by) = LOWER(?)',
            args: [targetUserId, userEmailLower],
          });

          // Invited Player / Regular promo activations & obligations
          await tx.execute({
            sql: `
              UPDATE promo_activations SET
                user_id = ?,
                user_deleted = 1,
                user_display_name_snapshot = 'Удалённый игрок',
                user_email_snapshot = '',
                qualification_status = CASE WHEN qualification_status = 'in_progress' THEN 'expired' ELSE qualification_status END,
                updated_at = ?
              WHERE user_id = ?
            `,
            args: [anonRef, nowIso, targetUserId],
          });
          await tx.execute({
            sql: `
              UPDATE promo_reward_obligations SET
                user_id = ?,
                recipient_user_id = CASE WHEN recipient_type = 'player' AND recipient_user_id = ? THEN ? ELSE recipient_user_id END,
                status = CASE WHEN recipient_type = 'player' AND status = 'pending' THEN 'cancelled_recipient_deleted' ELSE status END,
                updated_at = ?
              WHERE user_id = ?
            `,
            args: [anonRef, targetUserId, anonRef, nowIso, targetUserId],
          });
          await tx.execute({
            sql: 'DELETE FROM user_partner_bindings WHERE user_id = ?',
            args: [targetUserId],
          });

          // 8. Reports anonymization (preserving moderation log without PII)
          const reportsRes = await tx.execute({
            sql: 'SELECT * FROM reports WHERE reporter_id = ? OR target_player_id = ? OR LOWER(target_player_email) = LOWER(?)',
            args: [targetUserId, targetUserId, userEmailLower],
          });
          for (const rep of reportsRes.rows) {
            const isReporter = String(rep.reporter_id || '') === targetUserId;
            const isTarget =
              String(rep.target_player_id || '') === targetUserId ||
              String(rep.target_player_email || '').trim().toLowerCase() === userEmailLower;

            const nextDetails = rep.details
              ? scrubPiiFromText(String(rep.details), {
                  userId: targetUserId,
                  email: userEmail,
                  displayName: userDisplayName,
                  nameReplacement: 'Удалённый игрок',
                })
              : null;
            const nextResolutionNote = rep.resolution_note
              ? scrubPiiFromText(String(rep.resolution_note), {
                  userId: targetUserId,
                  email: userEmail,
                  displayName: userDisplayName,
                  nameReplacement: 'Удалённый игрок',
                })
              : null;

            await tx.execute({
              sql: `
                UPDATE reports SET
                  reporter_id = ?,
                  reporter_name = ?,
                  target_player_id = ?,
                  target_player_name = ?,
                  target_player_email = ?,
                  details = ?,
                  resolution_note = ?
                WHERE id = ?
              `,
              args: sanitizeArgs([
                isReporter ? anonRef : rep.reporter_id,
                isReporter ? 'Удалённый игрок' : rep.reporter_name,
                isTarget ? anonRef : rep.target_player_id,
                isTarget ? 'Удалённый игрок' : rep.target_player_name,
                isTarget ? null : rep.target_player_email,
                nextDetails,
                nextResolutionNote,
                String(rep.id),
              ]),
            });
          }

          // 9. Mail history anonymization
          const mailHistRes = await tx.execute({
            sql: 'SELECT * FROM mail_history WHERE LOWER(recipient_email) = LOWER(?) OR sent_by_admin_id = ? OR LOWER(sent_by_admin_email) = LOWER(?)',
            args: [userEmailLower, targetUserId, userEmailLower],
          });
          for (const mh of mailHistRes.rows) {
            const isRecipient = String(mh.recipient_email || '').trim().toLowerCase() === userEmailLower;
            const isSender =
              String(mh.sent_by_admin_id || '') === targetUserId ||
              String(mh.sent_by_admin_email || '').trim().toLowerCase() === userEmailLower;

            const cleanSubject = scrubPiiFromText(String(mh.subject || ''), {
              userId: targetUserId,
              email: userEmail,
              displayName: userDisplayName,
              nameReplacement: 'Удалённый игрок',
            });
            const cleanBody = scrubPiiFromText(String(mh.body_text || ''), {
              userId: targetUserId,
              email: userEmail,
              displayName: userDisplayName,
              nameReplacement: 'Удалённый игрок',
            });

            await tx.execute({
              sql: `
                UPDATE mail_history SET
                  recipient_email = ?,
                  subject = ?,
                  body_text = ?,
                  sent_by_admin_id = ?,
                  sent_by_admin_email = ?
                WHERE id = ?
              `,
              args: [
                isRecipient ? 'deleted@anonymized.local' : String(mh.recipient_email),
                cleanSubject,
                cleanBody,
                isSender ? 'deleted_admin' : String(mh.sent_by_admin_id),
                isSender ? 'deleted@anonymized.local' : String(mh.sent_by_admin_email),
                String(mh.id),
              ],
            });
          }

          // 10. Audit logs PII scrubbing (for both target and actor roles)
          const emailPattern = userEmailLower.length >= 3 ? `%${escapeSqlLike(userEmailLower)}%` : '__NO_MATCH__';
          const uidPattern = `%${escapeSqlLike(targetUserId)}%`;
          const auditRowsRes = await tx.execute({
            sql: `
              SELECT * FROM audit_logs
              WHERE admin_id = ?
                 OR LOWER(admin_email) = LOWER(?)
                 OR target_id = ?
                 OR metadata LIKE ? ESCAPE '\\'
                 OR LOWER(metadata) LIKE ? ESCAPE '\\'
                 OR details LIKE ? ESCAPE '\\'
                 OR LOWER(details) LIKE ? ESCAPE '\\'
            `,
            args: [
              targetUserId,
              userEmailLower,
              targetUserId,
              uidPattern,
              emailPattern,
              uidPattern,
              emailPattern,
            ],
          });

          for (const aRow of auditRowsRes.rows) {
            const isActor =
              String(aRow.admin_id || '') === targetUserId ||
              String(aRow.admin_email || '').trim().toLowerCase() === userEmailLower;
            const isTarget = String(aRow.target_id || '') === targetUserId;

            const cleanDetails = scrubPiiFromText(String(aRow.details || ''), {
              userId: targetUserId,
              email: userEmail,
              displayName: userDisplayName,
              nameReplacement: isActor ? 'Удалённый пользователь' : 'Удалённый игрок',
            });

            let nextMetadataStr = String(aRow.metadata || '{}');
            try {
              const parsedMeta = JSON.parse(nextMetadataStr);
              const scrubbedMeta = scrubMetadataValue(parsedMeta, {
                userId: targetUserId,
                emailLower: userEmailLower,
                displayName: userDisplayName,
                anonRef,
              });
              nextMetadataStr = JSON.stringify(scrubbedMeta);
            } catch {
              nextMetadataStr = scrubPiiFromText(nextMetadataStr, {
                userId: targetUserId,
                email: userEmail,
                displayName: userDisplayName,
                nameReplacement: 'Удалённый игрок',
              });
            }

            await tx.execute({
              sql: `
                UPDATE audit_logs SET
                  admin_id = ?,
                  admin_email = ?,
                  admin_name = ?,
                  target_id = ?,
                  target_name = ?,
                  details = ?,
                  metadata = ?
                WHERE id = ?
              `,
              args: sanitizeArgs([
                isActor ? null : aRow.admin_id,
                isActor ? 'deleted@anonymized.local' : aRow.admin_email,
                isActor ? 'Удалённый пользователь' : aRow.admin_name,
                isTarget ? anonRef : aRow.target_id,
                isTarget ? 'Удалённый игрок' : aRow.target_name,
                cleanDetails,
                nextMetadataStr,
                String(aRow.id),
              ]),
            });
          }

          // Optional test fault injection hook right before deleting the users row (Scenario #19 atomicity test)
          if (options.simulateTxFailurePoint === 'before_users_delete') {
            throw new Error(`Simulated mid-transaction failure for testing rollback`);
          }

          // 11. Delete the user record itself (must follow dependent cleanups)
          const delUserRes = await tx.execute({
            sql: 'DELETE FROM users WHERE id = ?',
            args: [targetUserId],
          });
          if (Number(delUserRes.rowsAffected ?? 0) !== 1) {
            throw new AccountDeletionError('USER_DELETE_FAILED', 'Не удалось удалить запись пользователя.');
          }

          // 12. Scrub all historical account_deletion_requests referencing this user & mark current completed
          await tx.execute({
            sql: `
              UPDATE account_deletion_requests SET
                user_id = 'deleted:' || operation_token,
                initiated_by_admin_id = CASE WHEN initiated_by_admin_id = ? THEN NULL ELSE initiated_by_admin_id END,
                cancelled_by_id = CASE WHEN cancelled_by_id = ? THEN NULL ELSE cancelled_by_id END,
                updated_at = ?
              WHERE id != ? AND user_id = ?
            `,
            args: [targetUserId, targetUserId, nowIso, currentReq.id, targetUserId],
          });
          await tx.execute({
            sql: `
              UPDATE account_deletion_requests SET
                initiated_by_admin_id = NULL,
                updated_at = ?
              WHERE id != ? AND initiated_by_admin_id = ?
            `,
            args: [nowIso, currentReq.id, targetUserId],
          });
          await tx.execute({
            sql: `
              UPDATE account_deletion_requests SET
                cancelled_by_id = NULL,
                updated_at = ?
              WHERE id != ? AND cancelled_by_id = ?
            `,
            args: [nowIso, currentReq.id, targetUserId],
          });

          const completeRes = await tx.execute({
            sql: `
              UPDATE account_deletion_requests SET
                status = 'completed',
                user_id = ?,
                initiated_by_admin_id = NULL,
                cancelled_by_id = NULL,
                completed_at = ?,
                last_error = NULL,
                next_retry_at = NULL,
                version = version + 1,
                updated_at = ?
              WHERE id = ? AND status = 'processing' AND version = ?
            `,
            args: sanitizeArgs([
              scrubbedCompletedUserId,
              nowIso,
              nowIso,
              currentReq.id,
              claimedVersion,
            ]),
          });
          if (Number(completeRes.rowsAffected ?? 0) !== 1) {
            throw new AccountDeletionError(
              'CONCURRENT_STATE_CONFLICT',
              'Не удалось завершить заявку из-за конкурентного изменения состояния.'
            );
          }

          // 13. Non-PII audit log entry inside same TX (zero userId / email / googleUid / name)
          const auditId = `audit_${nowMs}_${randomBytes(4).toString('hex')}`;
          await tx.execute({
            sql: `
              INSERT INTO audit_logs (
                id, action_type, admin_id, admin_email, admin_name, target_id, target_name, details, metadata, created_at
              ) VALUES (?, 'account_deletion_completed', NULL, 'system@mafiaclub.local', 'Система', ?, 'Удалённый игрок', ?, ?, ?)
            `,
            args: [
              auditId,
              scrubbedCompletedUserId,
              `Окончательное физическое удаление учётной записи успешно завершено (инициатор: ${currentReq.initiatorType})`,
              JSON.stringify({
                requestId: currentReq.id,
                operationToken: currentReq.operationToken,
                initiatorType: currentReq.initiatorType,
                gracePeriodDays: currentReq.gracePeriodDays,
                wasPartner,
                clansAffected,
                clansDisbanded,
              }),
              nowIso,
            ],
          });

          await tx.commit();

          return {
            deletedUserId: targetUserId,
            operationToken: currentReq.operationToken,
            completedAt: nowIso,
            wasPartner,
            clansAffected,
            clansDisbanded,
          };
        } catch (err) {
          try {
            await tx.rollback();
          } catch {}
          await this.recordRetryFailure(
            currentReq.id,
            targetUserId,
            userEmail,
            userDisplayName,
            nowMs,
            err
          );
          throw err;
        } finally {
          try {
            tx.close();
          } catch {}
        }
      });
    });

    // Phase C: Post-commit WebSocket, room, and visitor presence cleanup STRICTLY OUTSIDE SQL TX
    const postCommitCtx: PostCommitCleanupContext = {
      userId: purgeOutcome.deletedUserId,
      requestId: cleanRequestId,
      operationToken: purgeOutcome.operationToken,
      customHook: options.postCommitHook,
    };

    let postCommitSuccess = true;
    let postCommitError: string | undefined;

    try {
      await this.runPostCommitCleanupsForContext(postCommitCtx);
      this.pendingPostCommitCleanups.delete(purgeOutcome.deletedUserId);
    } catch (err) {
      postCommitSuccess = false;
      postCommitError = sanitizePurgeErrorMessage(err, { userId: purgeOutcome.deletedUserId });
      // Store without customHook failure? Keep customHook so flushPendingPostCommitCleanups can retry runtime hooks
      this.pendingPostCommitCleanups.set(purgeOutcome.deletedUserId, {
        userId: purgeOutcome.deletedUserId,
        requestId: cleanRequestId,
        operationToken: purgeOutcome.operationToken,
      });
    }

    return {
      success: true,
      requestId: cleanRequestId,
      deletedUserId: purgeOutcome.deletedUserId,
      operationToken: purgeOutcome.operationToken,
      completedAt: purgeOutcome.completedAt,
      wasPartner: purgeOutcome.wasPartner,
      clansAffected: purgeOutcome.clansAffected,
      clansDisbanded: purgeOutcome.clansDisbanded,
      postCommitSuccess,
      postCommitError,
    };
  }

  /**
   * Background scheduler pass for due `scheduled` requests and stalled `processing` recovery.
   * Strictly disabled unless `ENABLE_AUTOMATIC_ACCOUNT_PURGE === 'true'` or `enableAutoPurgeOverride === true`.
   */
  public async processDueDeletionRequests(
    options: ProcessDueDeletionsOptions = {}
  ): Promise<ProcessDueDeletionsResult> {
    const enabled = isAutomaticAccountPurgeEnabled() || options.enableAutoPurgeOverride === true;
    if (!enabled) {
      return {
        enabled: false,
        scanned: 0,
        succeeded: [],
        failed: [],
        skipped: [],
      };
    }

    const nowMs =
      typeof options.nowMs === 'number' && Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const limit = Math.max(1, Math.min(100, options.limit ?? 25));
    const maxRetries = Math.max(1, options.maxRetries ?? DEFAULT_MAX_PURGE_RETRIES);
    const staleTimeoutMs =
      typeof options.staleProcessingTimeoutMs === 'number' &&
      Number.isFinite(options.staleProcessingTimeoutMs)
        ? Math.max(0, options.staleProcessingTimeoutMs)
        : DEFAULT_STALE_PROCESSING_TIMEOUT_MS;
    const staleCutoffIso = new Date(nowMs - staleTimeoutMs).toISOString();

    const candidatesRes = await this.db.execute({
      sql: `
        SELECT * FROM account_deletion_requests
        WHERE (
          status = 'scheduled'
          AND scheduled_purge_at IS NOT NULL
          AND scheduled_purge_at <= ?
        ) OR (
          status = 'processing'
          AND retry_count < ?
          AND (
            (next_retry_at IS NOT NULL AND next_retry_at <= ?)
            OR (next_retry_at IS NULL AND processing_started_at IS NOT NULL AND processing_started_at <= ?)
          )
        )
        ORDER BY created_at ASC
        LIMIT ?
      `,
      args: [nowIso, maxRetries, nowIso, staleCutoffIso, limit],
    });

    const succeeded: string[] = [];
    const failed: Array<{ requestId: string; code: string; error: string }> = [];
    const skipped: Array<{ requestId: string; reason: string }> = [];

    for (const row of candidatesRes.rows) {
      const rec = rowToDeletionRecord(row);
      try {
        await this.executeAccountPhysicalPurge({
          requestId: rec.id,
          nowMs,
          staleProcessingTimeoutMs: staleTimeoutMs,
          roomsSnapshot: options.roomsSnapshot,
        });
        succeeded.push(rec.id);
      } catch (err) {
        if (err instanceof AccountDeletionError) {
          if (
            err.code === 'CONCURRENT_STATE_CONFLICT' ||
            err.code === 'PURGE_IN_PROGRESS' ||
            err.code === 'DELETION_REQUEST_CANCELLED' ||
            err.code === 'DELETION_ALREADY_COMPLETED' ||
            err.code === 'GRACE_PERIOD_NOT_EXPIRED' ||
            err.code === 'USER_IN_ACTIVE_MATCH'
          ) {
            skipped.push({ requestId: rec.id, reason: err.code });
            continue;
          }
          failed.push({
            requestId: rec.id,
            code: err.code,
            error: sanitizePurgeErrorMessage(err, { userId: rec.userId }),
          });
        } else {
          failed.push({
            requestId: rec.id,
            code: 'PURGE_EXECUTION_ERROR',
            error: sanitizePurgeErrorMessage(err, { userId: rec.userId }),
          });
        }
      }
    }

    return {
      enabled: true,
      scanned: candidatesRes.rows.length,
      succeeded,
      failed,
      skipped,
    };
  }
}

export const accountDeletionPurge = new AccountDeletionPurgeService();
