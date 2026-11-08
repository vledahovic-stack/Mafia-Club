import { randomBytes } from 'node:crypto';
import { getDatabase, query, queryOne, execute, sanitizeArgs } from './database.js';
import { userDb, ADMIN_EMAIL, UserProfile } from './users.js';
import { auditLogsDb } from './auditLogs.js';
import { getProjectTimezone, getDatePartsInTimezone, localPartsToUtcMs } from '../utils/timezone.js';
import { visitorWebPush } from '../utils/webPush.js';

/**
 * Summarizes a browser User-Agent string into a compact OS/Browser label
 * without storing full fingerprinting data.
 */
export function summarizeUserAgent(ua?: string | null): string {
  if (!ua || typeof ua !== 'string') return 'Web Browser';
  const s = ua.trim();
  if (!s) return 'Web Browser';

  let os = 'Desktop';
  if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/Windows/i.test(s)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(s)) os = 'macOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
  else if (/YaBrowser/i.test(s)) browser = 'Yandex';
  else if (/Firefox\/|FxiOS/i.test(s)) browser = 'Firefox';
  else if (/Chrome\/|CriOS/i.test(s)) browser = 'Chrome';
  else if (/Safari\//i.test(s)) browser = 'Safari';

  return `${browser} / ${os}`;
}

/**
 * Session Activity Window: 30 minutes in milliseconds.
 * Consecutive requests or refreshed pages within 30 minutes belong to the same visit.
 */
export const VISITOR_ACTIVITY_WINDOW_MS = 30 * 60 * 1000;

/**
 * Default retention period for visitor logs: 7 days.
 */
export const VISITOR_RETENTION_DAYS = 7;

/**
 * Presence window for active online visitors on the site (5 minutes).
 */
export const GUEST_ONLINE_PRESENCE_MS = 5 * 60 * 1000;

export interface VisitorLogRecord {
  id: string;
  visitorKey: string;
  sessionKey: string;
  isAuthenticated: boolean;
  userId?: string | null;
  displayName: string;
  onlineCount: number;
  deviceSummary?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
}

export interface RecordActivityParams {
  visitorKey: string;
  sessionKey?: string;
  userId?: string | null;
  userToken?: string | null;
  userEmail?: string | null;
  deviceSummary?: string | null;
  baseOnlineCount?: number;
}

export interface RecordActivityResult {
  status: 'new_visit' | 'session_updated' | 'ignored_admin';
  isNewVisit: boolean;
  visitRecord?: VisitorLogRecord | null;
  shouldNotifyPush: boolean;
  onlineCount: number;
}

export interface AdminActor {
  id: string;
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
  isAdmin?: boolean | null;
}

export class VisitorsDatabase {
  private db = getDatabase();

  /**
   * Concurrency lock map keyed by visitorKey to serialize near-simultaneous
   * tab openings or concurrent pings from the exact same browser/device.
   */
  private visitorLocks = new Map<string, Promise<any>>();

  /**
   * In-memory presence map for active guests browsing the site (visitorKey -> lastSeenMs).
   * Automatically purged after 5 minutes of inactivity.
   */
  private activeGuestPresence = new Map<string, number>();

  /**
   * Checks whether the given email belongs strictly to the Main Administrator.
   */
  public isMainAdmin(email?: string | null): boolean {
    if (!email) return false;
    return email.trim().toLowerCase() === ADMIN_EMAIL;
  }

  /**
   * Updates guest presence in memory and calculates total unique online count.
   * Total online = (known base registered/room online count) + (unique active guests not in base).
   */
  public updateGuestPresenceAndCalculateOnline(visitorKey: string, isGuest: boolean, baseOnlineCount = 0): number {
    const nowMs = Date.now();

    // 1. Refresh or clean up guest presence map
    if (visitorKey) {
      if (isGuest) {
        this.activeGuestPresence.set(visitorKey, nowMs);
      } else {
        this.activeGuestPresence.delete(visitorKey);
      }
    }

    // Opportunistically prune stale guests (> 5 min)
    if (this.activeGuestPresence.size > 200) {
      this.activeGuestPresence.forEach((lastSeen, key) => {
        if (nowMs - lastSeen > GUEST_ONLINE_PRESENCE_MS) {
          this.activeGuestPresence.delete(key);
        }
      });
    }

    let activeGuestsCount = 0;
    this.activeGuestPresence.forEach((lastSeen) => {
      if (nowMs - lastSeen <= GUEST_ONLINE_PRESENCE_MS) {
        activeGuestsCount++;
      }
    });

    // Online count represents active WebSocket/room players + active browsing guests
    return Math.max(1, baseOnlineCount + activeGuestsCount);
  }

  /**
   * Synchronizes concurrent requests for the same visitorKey sequentially.
   */
  private async withVisitorLock<T>(visitorKey: string, fn: () => Promise<T>): Promise<T> {
    const cleanKey = (visitorKey || 'anonymous').trim();
    const prevPromise = this.visitorLocks.get(cleanKey) || Promise.resolve();

    let releaseLock: () => void = () => {};
    const currentPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.visitorLocks.set(cleanKey, prevPromise.then(() => currentPromise));

    try {
      await prevPromise;
      return await fn();
    } finally {
      releaseLock();
      if (this.visitorLocks.get(cleanKey) === currentPromise) {
        this.visitorLocks.delete(cleanKey);
      }
    }
  }

  /**
   * Core visitor activity registration function.
   * 
   * Deduplication & 30-minute window rules:
   * 1. If user is Main Admin (vledahovic@gmail.com): skipped completely (no log, no push).
   * 2. If visitorKey had an active session within the last 30 minutes:
   *    - Reuses existing visit record, updates lastSeenAt and onlineCount.
   *    - Returns isNewVisit = false, shouldNotifyPush = false.
   * 3. If visitorKey has no session or lastSeenAt >= 30 minutes ago:
   *    - Creates a new VisitorLogRecord.
   *    - Returns isNewVisit = true, shouldNotifyPush = true.
   */
  public async recordVisitorActivity(params: RecordActivityParams): Promise<RecordActivityResult> {
    const rawKey = (params.visitorKey || '').trim();
    if (!rawKey) {
      throw new Error('visitorKey is required');
    }

    return this.withVisitorLock(rawKey, async () => {
      // 1. Resolve & verify user identity if a token is supplied
      let verifiedUser: UserProfile | null = null;
      if (params.userToken && params.userToken.trim()) {
        try {
          verifiedUser = await userDb.getUserByToken(params.userToken.trim());
        } catch {
          verifiedUser = null;
        }
      } else if (params.userId && params.userId.trim()) {
        try {
          verifiedUser = await userDb.getUserById(params.userId.trim());
        } catch {
          verifiedUser = null;
        }
      }

      const effectiveEmail = verifiedUser?.email || params.userEmail || null;

      // 2. Strict Main Administrator exclusion:
      // Main admin visits are never logged and never trigger visitor push notifications
      if (this.isMainAdmin(effectiveEmail)) {
        return {
          status: 'ignored_admin',
          isNewVisit: false,
          visitRecord: null,
          shouldNotifyPush: false,
          onlineCount: params.baseOnlineCount || 1
        };
      }

      const isAuth = Boolean(verifiedUser);
      const effectiveUserId = verifiedUser ? verifiedUser.id : null;
      const effectiveDisplayName = verifiedUser ? verifiedUser.displayName : 'Гость';
      const sessionKey = (params.sessionKey || `ses_${rawKey}`).trim();
      const deviceSummary = params.deviceSummary ? params.deviceSummary.trim().slice(0, 100) : null;

      // 3. Calculate snapshot online count
      const snapshotOnlineCount = this.updateGuestPresenceAndCalculateOnline(
        rawKey,
        !isAuth,
        params.baseOnlineCount || 0
      );

      const now = new Date();
      const nowIso = now.toISOString();
      const nowMs = now.getTime();

      // 4. Query the most recent active visit record within the 30-minute window.
      // Security rule: Unauthenticated requests can ONLY match unauthenticated guest records for that visitor_key,
      // preventing any identity spoofing via visitor_key. Authenticated requests match either their own user_id
      // or an unauthenticated guest record from the same browser (seamless guest -> login upgrade).
      const cutoffWindowIso = new Date(nowMs - VISITOR_ACTIVITY_WINDOW_MS).toISOString();
      let existingRow: any = null;

      if (isAuth && effectiveUserId) {
        existingRow = await queryOne<any>(
          `SELECT * FROM visitor_logs
           WHERE last_seen_at > ?
             AND (user_id = ? OR (visitor_key = ? AND is_authenticated = 0))
           ORDER BY last_seen_at DESC
           LIMIT 1`,
          [cutoffWindowIso, effectiveUserId, rawKey]
        );
      } else {
        existingRow = await queryOne<any>(
          `SELECT * FROM visitor_logs
           WHERE visitor_key = ?
             AND is_authenticated = 0
             AND last_seen_at > ?
           ORDER BY last_seen_at DESC
           LIMIT 1`,
          [rawKey, cutoffWindowIso]
        );
      }

      if (existingRow && existingRow.last_seen_at) {
        const lastSeenMs = new Date(existingRow.last_seen_at).getTime();
        const elapsedMs = nowMs - lastSeenMs;

        // If activity is within the 30-minute window, update existing visit period
        if (elapsedMs < VISITOR_ACTIVITY_WINDOW_MS) {
          const updatedAuth = isAuth ? 1 : 0;
          const updatedUserId = isAuth ? effectiveUserId : null;
          const updatedDisplayName = isAuth ? effectiveDisplayName : existingRow.display_name;

          await execute(
            `UPDATE visitor_logs
             SET last_seen_at = ?,
                 online_count = ?,
                 is_authenticated = ?,
                 user_id = ?,
                 display_name = ?
             WHERE id = ?`,
            [
              nowIso,
              snapshotOnlineCount,
              updatedAuth,
              updatedUserId,
              updatedDisplayName,
              existingRow.id
            ]
          );

          const updatedRecord: VisitorLogRecord = {
            id: existingRow.id,
            visitorKey: existingRow.visitor_key,
            sessionKey: existingRow.session_key,
            isAuthenticated: Boolean(updatedAuth),
            userId: updatedUserId,
            displayName: updatedDisplayName,
            onlineCount: snapshotOnlineCount,
            deviceSummary: existingRow.device_summary,
            firstSeenAt: existingRow.first_seen_at,
            lastSeenAt: nowIso,
            createdAt: existingRow.created_at
          };

          return {
            status: 'session_updated',
            isNewVisit: false,
            visitRecord: updatedRecord,
            shouldNotifyPush: false,
            onlineCount: snapshotOnlineCount
          };
        }
      }

      // 5. If no active session or 30-minute window expired: create a NEW VISIT
      const newId = `vis_${Date.now()}_${randomBytes(4).toString('hex')}`;
      await execute(
        `INSERT INTO visitor_logs (
           id, visitor_key, session_key, is_authenticated, user_id,
           display_name, online_count, device_summary, first_seen_at, last_seen_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          rawKey,
          sessionKey,
          isAuth ? 1 : 0,
          effectiveUserId,
          effectiveDisplayName,
          snapshotOnlineCount,
          deviceSummary,
          nowIso,
          nowIso,
          nowIso
        ]
      );

      const newRecord: VisitorLogRecord = {
        id: newId,
        visitorKey: rawKey,
        sessionKey,
        isAuthenticated: isAuth,
        userId: effectiveUserId,
        displayName: effectiveDisplayName,
        onlineCount: snapshotOnlineCount,
        deviceSummary,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        createdAt: nowIso
      };

      // Enqueue Web Push notification for this new visit (isolated from DB logging: errors never affect visit registration)
      await visitorWebPush.enqueueVisitorPush(newId).catch(() => {});

      // Opportunistic lazy cleanup of logs older than 7 days (run ~5% of new visits)
      if (Math.random() < 0.05) {
        this.cleanupOldVisitorLogs().catch(() => {});
      }

      return {
        status: 'new_visit',
        isNewVisit: true,
        visitRecord: newRecord,
        shouldNotifyPush: true,
        onlineCount: snapshotOnlineCount
      };
    });
  }

  /**
   * Automatically deletes visitor log records older than the specified retention period (7 days).
   * Safe server-side operation that touches only the visitor_logs table.
   */
  public async cleanupOldVisitorLogs(daysToKeep: number = VISITOR_RETENTION_DAYS): Promise<{ deletedCount: number }> {
    const safeDays = Math.max(1, Math.min(365, Number(daysToKeep) || VISITOR_RETENTION_DAYS));
    const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const cutoffIso = cutoffDate.toISOString();

    const res = await execute(
      `DELETE FROM visitor_logs WHERE last_seen_at < ?`,
      [cutoffIso]
    );

    const deleted = res.rowsAffected || 0;
    if (deleted > 0) {
      console.log(`[Visitors] Cleaned up ${deleted} visitor logs older than ${safeDays} days (cutoff: ${cutoffIso})`);
    }

    return { deletedCount: deleted };
  }

  /**
   * Manually clears the entire visitor_logs table.
   * Strictly restricted to the Main Administrator (vledahovic@gmail.com).
   * Logs the action into audit_logs.
   */
  public async clearVisitorLogs(adminUser: AdminActor): Promise<{ deletedCount: number }> {
    if (!adminUser || !adminUser.email || !this.isMainAdmin(adminUser.email)) {
      throw new Error('Доступ запрещён: ручная очистка журнала посещений разрешена исключительно Главному Администратору.');
    }

    const countRow = await queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM visitor_logs`);
    const totalCount = countRow?.count || 0;

    const res = await execute(`DELETE FROM visitor_logs`);
    const deletedCount = res.rowsAffected !== undefined ? res.rowsAffected : totalCount;

    // Record action into audit_logs
    try {
      await auditLogsDb.logAction({
        actionType: 'visitor_logs_clear',
        adminId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.displayName || 'Главный Администратор',
        details: `Главный Администратор очистил журнал посещений (удалено записей: ${deletedCount}).`,
        metadata: {
          action: 'clear_visitor_logs',
          deletedCount,
          timestamp: new Date().toISOString()
        }
      });
    } catch (auditErr) {
      console.error('[Visitors] Failed to write audit log for visitor logs clear:', auditErr);
    }

    return { deletedCount };
  }

  /**
   * Retrieves paginated visitor logs for the administration panel.
   */
  public async getVisitorLogs(options?: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<{ logs: VisitorLogRecord[]; totalCount: number }> {
    const limit = Math.max(1, Math.min(100, options?.limit || 50));
    const offset = Math.max(0, options?.offset || 0);
    const search = options?.search ? options.search.trim().toLowerCase() : null;

    let whereClause = '';
    const args: any[] = [];

    if (search) {
      whereClause = 'WHERE LOWER(display_name) LIKE ? OR LOWER(visitor_key) LIKE ?';
      args.push(`%${search}%`, `%${search}%`);
    }

    const countRow = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM visitor_logs ${whereClause}`,
      args
    );
    const totalCount = countRow?.count || 0;

    const rows = await query<any>(
      `SELECT * FROM visitor_logs
       ${whereClause}
       ORDER BY last_seen_at DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );

    const logs: VisitorLogRecord[] = rows.map((r) => ({
      id: r.id,
      visitorKey: r.visitor_key,
      sessionKey: r.session_key,
      isAuthenticated: Boolean(r.is_authenticated),
      userId: r.user_id || null,
      displayName: r.display_name,
      onlineCount: Number(r.online_count) || 0,
      deviceSummary: r.device_summary || null,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      createdAt: r.created_at
    }));

    return { logs, totalCount };
  }

  /**
   * Retrieves summary visitor metrics for admin dashboard.
   */
  public async getVisitorStats(baseOnlineCount: number = 0): Promise<{
    todayVisits: number;
    uniqueVisitors24h: number;
    activeOnlineSnapshot: number;
    activeGuestsCount: number;
  }> {
    const now = new Date();
    let startOfToday: string;
    try {
      const tz = await getProjectTimezone();
      const parts = getDatePartsInTimezone(now, tz);
      const startMs = localPartsToUtcMs(
        { year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0, second: 0, ms: 0 },
        tz
      );
      startOfToday = new Date(startMs).toISOString();
    } catch {
      startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }

    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const todayRes = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM visitor_logs WHERE first_seen_at >= ?`,
      [startOfToday]
    );

    const uniqueRes = await queryOne<{ count: number }>(
      `SELECT COUNT(DISTINCT visitor_key) as count FROM visitor_logs WHERE last_seen_at >= ?`,
      [dayAgo]
    );

    let activeGuests = 0;
    const nowMs = Date.now();
    this.activeGuestPresence.forEach((lastSeen) => {
      if (nowMs - lastSeen <= GUEST_ONLINE_PRESENCE_MS) {
        activeGuests++;
      }
    });

    return {
      todayVisits: Number(todayRes?.count) || 0,
      uniqueVisitors24h: Number(uniqueRes?.count) || 0,
      activeGuestsCount: activeGuests,
      activeOnlineSnapshot: Math.max(0, baseOnlineCount + activeGuests)
    };
  }
}

export const visitorsDb = new VisitorsDatabase();
