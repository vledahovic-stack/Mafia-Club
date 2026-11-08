import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import * as webpush from 'web-push';
import { query, queryOne, execute } from '../db/database.js';
import { ADMIN_EMAIL } from '../db/users.js';
import { auditLogsDb } from '../db/auditLogs.js';
import { summarizeUserAgent, type AdminActor } from '../db/visitors.js';
import { getProjectTimezone, getDatePartsInTimezone } from './timezone.js';

export const VISITOR_PUSH_ENABLED_SETTING_KEY = 'visitor_push_notifications_enabled';
export const DEFAULT_PUSH_AGGREGATION_WINDOW_MS = 4000;
export const MAX_PUSH_QUEUE_BATCH_SIZE = 50;
export const STALE_PENDING_PUSH_CUTOFF_MS = 2 * 60 * 1000; // 2 minutes max age on restart
export const PUSH_DELIVERY_TIMEOUT_MS = 8000;

export interface VapidConfigStatus {
  configured: boolean;
  publicKey: string | null;
  subject: string;
  reason?: string;
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  expirationTime?: number | null;
  keys: PushSubscriptionKeys;
}

export interface AdminPushSubscriptionInfo {
  id: string;
  adminUserId: string;
  adminEmail: string;
  endpoint: string;
  deviceLabel: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon: string;
  badge: string;
  tag: string;
  renotify: boolean;
  data: {
    url: string;
    type: 'visitor_alert';
    count: number;
    timestamp: number;
  };
}

export type PushTransportFn = (
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  },
  payload: string,
  options: { timeout: number }
) => Promise<any>;

class VisitorWebPushService {
  private vapidConfigured = false;
  private vapidPublicKey: string | null = null;
  private vapidSubject: string = `mailto:${ADMIN_EMAIL}`;
  private vapidReason: string = 'Не инициализировано';

  private cachedPushEnabled: boolean | null = null;
  private aggregationWindowMs: number = DEFAULT_PUSH_AGGREGATION_WINDOW_MS;
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  // Optional transport override for isolated unit/integration tests
  private customTransport: PushTransportFn | null = null;

  constructor() {
    this.initVapidFromEnv();
  }

  /**
   * Loads and validates VAPID keys from environment variables without logging private secrets.
   */
  public initVapidFromEnv(envOverride?: {
    publicKey?: string;
    privateKey?: string;
    subject?: string;
  }): VapidConfigStatus {
    const rawPub = (envOverride?.publicKey ?? process.env.VAPID_PUBLIC_KEY ?? '').trim();
    const rawPriv = (envOverride?.privateKey ?? process.env.VAPID_PRIVATE_KEY ?? '').trim();
    const rawSub = (envOverride?.subject ?? process.env.VAPID_SUBJECT ?? `mailto:${ADMIN_EMAIL}`).trim();

    this.vapidSubject = rawSub || `mailto:${ADMIN_EMAIL}`;

    if (!rawPub || !rawPriv) {
      this.vapidConfigured = false;
      this.vapidPublicKey = null;
      this.vapidReason = 'VAPID_PUBLIC_KEY и/или VAPID_PRIVATE_KEY не заданы в переменных окружения';
      return this.getVapidStatus();
    }

    try {
      webpush.setVapidDetails(this.vapidSubject, rawPub, rawPriv);
      this.vapidConfigured = true;
      this.vapidPublicKey = rawPub;
      this.vapidReason = 'OK';
    } catch (err: any) {
      this.vapidConfigured = false;
      this.vapidPublicKey = null;
      this.vapidReason = `Некорректный формат VAPID-ключей: ${err?.message || 'ошибка валидации'}`;
    }

    return this.getVapidStatus();
  }

  public getVapidStatus(): VapidConfigStatus {
    return {
      configured: this.vapidConfigured,
      publicKey: this.vapidConfigured ? this.vapidPublicKey : null,
      subject: this.vapidSubject,
      reason: this.vapidConfigured ? undefined : this.vapidReason
    };
  }

  /**
   * Used only in automated test suites to mock push delivery and aggregation timing.
   */
  public setTestConfiguration(opts: {
    transport?: PushTransportFn | null;
    aggregationWindowMs?: number;
    vapidOverride?: { publicKey: string; privateKey: string; subject?: string } | null;
  }) {
    if (opts.transport !== undefined) {
      this.customTransport = opts.transport;
    }
    if (typeof opts.aggregationWindowMs === 'number' && opts.aggregationWindowMs >= 10) {
      this.aggregationWindowMs = opts.aggregationWindowMs;
    }
    if (opts.vapidOverride !== undefined) {
      if (opts.vapidOverride === null) {
        this.initVapidFromEnv({ publicKey: '', privateKey: '' });
      } else {
        this.initVapidFromEnv(opts.vapidOverride);
      }
    }
  }

  /**
   * Strictly verifies that the actor is the Main Administrator (vledahovic@gmail.com).
   */
  public assertMainAdmin(adminUser?: AdminActor | null): void {
    const email = adminUser?.email?.trim().toLowerCase();
    if (!adminUser || !email || email !== ADMIN_EMAIL) {
      throw new Error('Доступ запрещён: управление Web Push доступно исключительно Главному Администратору.');
    }
  }

  /**
   * Reads the persistent global setting `visitor_push_notifications_enabled` (defaults to false).
   */
  public async isVisitorPushEnabled(): Promise<boolean> {
    try {
      const row = await queryOne<{ value: string }>(
        `SELECT value FROM project_settings WHERE key = ? LIMIT 1`,
        [VISITOR_PUSH_ENABLED_SETTING_KEY]
      );
      this.cachedPushEnabled = row?.value === 'true';
      return this.cachedPushEnabled;
    } catch {
      return false;
    }
  }

  /**
   * Updates the persistent global setting `visitor_push_notifications_enabled`.
   * Strictly restricted to Main Administrator.
   * Clears any previously pending queue items so old events are never sent upon re-enabling.
   */
  public async setVisitorPushEnabled(
    enabled: boolean,
    adminUser: AdminActor
  ): Promise<{ enabled: boolean; updatedAt: string }> {
    this.assertMainAdmin(adminUser);

    const nowIso = new Date().toISOString();
    const valStr = enabled ? 'true' : 'false';

    // Clear any pending timer and mark any old pending items as 'skipped'
    // so enabling or disabling never flushes historical visits accumulated earlier
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await execute(
      `UPDATE visitor_logs SET push_status = 'skipped' WHERE push_status = 'pending'`
    );

    await execute(
      `INSERT INTO project_settings (key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
      [VISITOR_PUSH_ENABLED_SETTING_KEY, valStr, nowIso, adminUser.email || ADMIN_EMAIL]
    );

    this.cachedPushEnabled = enabled;

    try {
      await auditLogsDb.logAction({
        actionType: 'visitor_push_toggle',
        adminId: adminUser.id,
        adminEmail: adminUser.email || ADMIN_EMAIL,
        adminName: adminUser.displayName || 'Главный Администратор',
        details: `Главный Администратор ${enabled ? 'включил' : 'выключил'} push-уведомления о новых посетителях.`,
        metadata: { enabled, updatedAt: nowIso }
      });
    } catch {}

    return { enabled, updatedAt: nowIso };
  }

  /**
   * Registers or updates a Web Push subscription for a Main Administrator device.
   */
  public async saveAdminSubscription(
    adminUser: AdminActor,
    subscription: PushSubscriptionInput,
    userAgent?: string | null,
    customDeviceLabel?: string | null
  ): Promise<AdminPushSubscriptionInfo> {
    this.assertMainAdmin(adminUser);

    const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint.trim() : '';
    const p256dh = typeof subscription?.keys?.p256dh === 'string' ? subscription.keys.p256dh.trim() : '';
    const auth = typeof subscription?.keys?.auth === 'string' ? subscription.keys.auth.trim() : '';

    if (!endpoint || (!endpoint.startsWith('https://') && !endpoint.startsWith('http://localhost'))) {
      throw new Error('Некорректный endpoint push-подписки (требуется HTTPS URL)');
    }
    if (!p256dh || !auth || p256dh.length < 16 || auth.length < 8) {
      throw new Error('Отсутствуют криптографические ключи подписки (p256dh / auth)');
    }

    const nowIso = new Date().toISOString();
    const deviceLabel =
      (customDeviceLabel && customDeviceLabel.trim().slice(0, 80)) ||
      summarizeUserAgent(userAgent);
    const cleanUa = userAgent ? userAgent.trim().slice(0, 250) : null;
    const expTime =
      typeof subscription.expirationTime === 'number' ? subscription.expirationTime : null;

    const existing = await queryOne<any>(
      `SELECT id, created_at FROM admin_push_subscriptions WHERE endpoint = ? LIMIT 1`,
      [endpoint]
    );

    const id = existing?.id || `psub_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const createdAt = existing?.created_at || nowIso;

    await execute(
      `INSERT INTO admin_push_subscriptions (
         id, admin_user_id, admin_email, endpoint, p256dh, auth,
         expiration_time, device_label, user_agent, created_at, updated_at, last_error
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(endpoint) DO UPDATE SET
         admin_user_id = excluded.admin_user_id,
         admin_email = excluded.admin_email,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         expiration_time = excluded.expiration_time,
         device_label = excluded.device_label,
         user_agent = excluded.user_agent,
         updated_at = excluded.updated_at,
         last_error = NULL`,
      [
        id,
        adminUser.id,
        ADMIN_EMAIL,
        endpoint,
        p256dh,
        auth,
        expTime,
        deviceLabel,
        cleanUa,
        createdAt,
        nowIso
      ]
    );

    try {
      await auditLogsDb.logAction({
        actionType: 'visitor_push_subscribe',
        adminId: adminUser.id,
        adminEmail: adminUser.email || ADMIN_EMAIL,
        adminName: adminUser.displayName || 'Главный Администратор',
        targetId: id,
        targetName: deviceLabel,
        details: existing?.id
          ? `Главный Администратор обновил push-подписку устройства «${deviceLabel}»`
          : `Главный Администратор подключил push-уведомления на устройстве «${deviceLabel}»`,
        metadata: { subscriptionId: id, deviceLabel, updated: Boolean(existing?.id) }
      });
    } catch {}

    return {
      id,
      adminUserId: adminUser.id,
      adminEmail: ADMIN_EMAIL,
      endpoint,
      deviceLabel,
      userAgent: cleanUa,
      createdAt,
      updatedAt: nowIso,
      lastSuccessAt: null,
      lastError: null
    };
  }

  /**
   * Lists all active Web Push subscriptions belonging to the Main Administrator.
   */
  public async getAdminSubscriptions(adminUser: AdminActor): Promise<AdminPushSubscriptionInfo[]> {
    this.assertMainAdmin(adminUser);

    const rows = await query<any>(
      `SELECT * FROM admin_push_subscriptions
       WHERE LOWER(admin_email) = LOWER(?)
       ORDER BY updated_at DESC`,
      [ADMIN_EMAIL]
    );

    return rows.map((r) => ({
      id: r.id,
      adminUserId: r.admin_user_id,
      adminEmail: r.admin_email,
      endpoint: r.endpoint,
      deviceLabel: r.device_label || 'Устройство администратора',
      userAgent: r.user_agent || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastSuccessAt: r.last_success_at || null,
      lastError: r.last_error || null
    }));
  }

  /**
   * Removes a specific subscription by ID or endpoint.
   */
  public async removeAdminSubscription(
    adminUser: AdminActor,
    idOrEndpoint: string
  ): Promise<{ removed: boolean }> {
    this.assertMainAdmin(adminUser);
    const target = (idOrEndpoint || '').trim();
    if (!target) {
      throw new Error('Не указан идентификатор или endpoint подписки');
    }

    const existing = await queryOne<any>(
      `SELECT id, device_label FROM admin_push_subscriptions
       WHERE LOWER(admin_email) = LOWER(?) AND (id = ? OR endpoint = ?)
       LIMIT 1`,
      [ADMIN_EMAIL, target, target]
    );

    const res = await execute(
      `DELETE FROM admin_push_subscriptions
       WHERE LOWER(admin_email) = LOWER(?) AND (id = ? OR endpoint = ?)`,
      [ADMIN_EMAIL, target, target]
    );

    const removed = (res.rowsAffected || 0) > 0;
    if (removed) {
      try {
        const label = existing?.device_label || 'Устройство администратора';
        await auditLogsDb.logAction({
          actionType: 'visitor_push_unsubscribe',
          adminId: adminUser.id,
          adminEmail: adminUser.email || ADMIN_EMAIL,
          adminName: adminUser.displayName || 'Главный Администратор',
          targetId: existing?.id || 'device',
          targetName: label,
          details: `Главный Администратор отключил push-уведомления на устройстве «${label}»`,
          metadata: { subscriptionId: existing?.id || null, deviceLabel: label }
        });
      } catch {}
    }

    return { removed };
  }

  /**
   * Startup recovery & cleanup:
   * Any pending push notifications older than STALE_PENDING_PUSH_CUTOFF_MS (2 minutes)
   * are marked as 'skipped' to prevent a burst of stale notifications after server restart.
   */
  public async recoverOnStartup(): Promise<void> {
    try {
      const cutoffIso = new Date(Date.now() - STALE_PENDING_PUSH_CUTOFF_MS).toISOString();
      await execute(
        `UPDATE visitor_logs
         SET push_status = 'skipped'
         WHERE push_status = 'pending' AND created_at < ?`,
        [cutoffIso]
      );

      const enabled = await this.isVisitorPushEnabled();
      if (!enabled || !this.vapidConfigured) {
        await execute(
          `UPDATE visitor_logs SET push_status = 'skipped' WHERE push_status = 'pending'`
        );
        return;
      }

      const freshPending = await queryOne<{ c: number }>(
        `SELECT COUNT(*) as c FROM visitor_logs WHERE push_status = 'pending'`
      );
      if ((freshPending?.c || 0) > 0) {
        this.scheduleFlush();
      }
    } catch (err) {
      console.error('[WebPush] Startup recovery error:', err);
    }
  }

  /**
   * Enqueues a newly registered visit for Web Push notification.
   * Called ONLY when `isNewVisit === true` and `shouldNotifyPush === true`.
   */
  public async enqueueVisitorPush(visitId: string): Promise<{ queued: boolean; reason?: string }> {
    if (!visitId) return { queued: false, reason: 'missing_visit_id' };

    try {
      const enabled = await this.isVisitorPushEnabled();
      if (!enabled) {
        await execute(`UPDATE visitor_logs SET push_status = 'skipped' WHERE id = ?`, [visitId]);
        return { queued: false, reason: 'push_disabled' };
      }

      if (!this.vapidConfigured) {
        await execute(`UPDATE visitor_logs SET push_status = 'skipped' WHERE id = ?`, [visitId]);
        return { queued: false, reason: 'vapid_not_configured' };
      }

      const subCountRow = await queryOne<{ c: number }>(
        `SELECT COUNT(*) as c FROM admin_push_subscriptions WHERE LOWER(admin_email) = LOWER(?)`,
        [ADMIN_EMAIL]
      );
      if (!subCountRow || Number(subCountRow.c) === 0) {
        await execute(`UPDATE visitor_logs SET push_status = 'skipped' WHERE id = ?`, [visitId]);
        return { queued: false, reason: 'no_active_subscriptions' };
      }

      await execute(`UPDATE visitor_logs SET push_status = 'pending' WHERE id = ?`, [visitId]);

      // Check if pending queue reached max batch threshold -> flush immediately
      const pendingCountRow = await queryOne<{ c: number }>(
        `SELECT COUNT(*) as c FROM visitor_logs WHERE push_status = 'pending'`
      );
      const pendingCount = Number(pendingCountRow?.c) || 0;

      if (pendingCount >= MAX_PUSH_QUEUE_BATCH_SIZE) {
        if (this.flushTimer) {
          clearTimeout(this.flushTimer);
          this.flushTimer = null;
        }
        await this.flushPendingVisitorPushes();
      } else {
        this.scheduleFlush();
      }

      return { queued: true };
    } catch (err) {
      console.error('[WebPush] Error enqueueing visitor push:', err);
      return { queued: false, reason: 'internal_error' };
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushPendingVisitorPushes().catch((err) => {
        console.error('[WebPush] Scheduled flush error:', err);
      });
    }, this.aggregationWindowMs);
  }

  /**
   * Flushes all currently pending visitor notifications, combining multiple visits
   * that arrived within the aggregation window into a single concise push message.
   */
  public async flushPendingVisitorPushes(): Promise<{
    sentMessages: number;
    aggregatedVisitors: number;
    deliveredDevices: number;
    removedInvalidSubscriptions: number;
  }> {
    if (this.FlushGuardActive()) {
      return {
        sentMessages: 0,
        aggregatedVisitors: 0,
        deliveredDevices: 0,
        removedInvalidSubscriptions: 0
      };
    }

    this.isFlushing = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    try {
      const enabled = await this.isVisitorPushEnabled();
      if (!enabled || !this.vapidConfigured) {
        await execute(`UPDATE visitor_logs SET push_status = 'skipped' WHERE push_status = 'pending'`);
        return {
          sentMessages: 0,
          aggregatedVisitors: 0,
          deliveredDevices: 0,
          removedInvalidSubscriptions: 0
        };
      }

      // Expire stale pending records (> 2 minutes old)
      const cutoffIso = new Date(Date.now() - STALE_PENDING_PUSH_CUTOFF_MS).toISOString();
      await execute(
        `UPDATE visitor_logs SET push_status = 'skipped' WHERE push_status = 'pending' AND created_at < ?`,
        [cutoffIso]
      );

      // Fetch current pending visits (reads latest display_name in case visitor logged in during window)
      const pendingRows = await query<any>(
        `SELECT id, display_name, is_authenticated, online_count, first_seen_at, last_seen_at
         FROM visitor_logs
         WHERE push_status = 'pending'
         ORDER BY first_seen_at ASC
         LIMIT ?`,
        [MAX_PUSH_QUEUE_BATCH_SIZE]
      );

      if (pendingRows.length === 0) {
        return {
          sentMessages: 0,
          aggregatedVisitors: 0,
          deliveredDevices: 0,
          removedInvalidSubscriptions: 0
        };
      }

      const nowIso = new Date().toISOString();
      const ids = pendingRows.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(', ');

      // Atomically mark claimed rows as 'sent' before external network calls to prevent duplicate sends
      await execute(
        `UPDATE visitor_logs
         SET push_status = 'sent', push_sent_at = ?
         WHERE id IN (${placeholders})`,
        [nowIso, ...ids]
      );

      const subscriptions = await query<any>(
        `SELECT * FROM admin_push_subscriptions WHERE LOWER(admin_email) = LOWER(?)`,
        [ADMIN_EMAIL]
      );

      if (subscriptions.length === 0) {
        return {
          sentMessages: 0,
          aggregatedVisitors: pendingRows.length,
          deliveredDevices: 0,
          removedInvalidSubscriptions: 0
        };
      }

      // Format notification payload using project timezone
      const tz = await getProjectTimezone().catch(() => 'Europe/Moscow');
      const latestRow = pendingRows[pendingRows.length - 1];
      const latestOnline = Number(latestRow.online_count) || 1;
      const parts = getDatePartsInTimezone(new Date(latestRow.first_seen_at || nowIso), tz);
      const timeStr = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;

      let title = '';
      let body = '';

      if (pendingRows.length === 1) {
        const visitorName = pendingRows[0].display_name || 'Гость';
        title = 'Новый посетитель Mafia Club';
        body = `${visitorName} · Время: ${timeStr} · Онлайн: ${latestOnline}`;
      } else {
        const count = pendingRows.length;
        const previewNames = pendingRows
          .slice(0, 3)
          .map((r) => r.display_name || 'Гость')
          .join(', ');
        const extra = count > 3 ? ` и ещё ${count - 3}` : '';
        title = `Новые посетители Mafia Club (+${count})`;
        body = `${previewNames}${extra} · Время: ${timeStr} · Онлайн: ${latestOnline}`;
      }

      const payloadObj: PushNotificationPayload = {
        title,
        body,
        icon: '/icons/pwa-192x192.png',
        badge: '/icons/pwa-192x192.png',
        tag: 'mafia-visitor-notification',
        renotify: true,
        data: {
          url: '/',
          type: 'visitor_alert',
          count: pendingRows.length,
          timestamp: Date.now()
        }
      };

      const payloadStr = JSON.stringify(payloadObj);
      let deliveredDevices = 0;
      let removedInvalidSubscriptions = 0;

      const sendPromises = subscriptions.map(async (sub) => {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        try {
          if (this.customTransport) {
            await this.customTransport(pushSub, payloadStr, { timeout: PUSH_DELIVERY_TIMEOUT_MS });
          } else {
            await webpush.sendNotification(pushSub, payloadStr, {
              timeout: PUSH_DELIVERY_TIMEOUT_MS
            });
          }

          deliveredDevices++;
          await execute(
            `UPDATE admin_push_subscriptions
             SET last_success_at = ?, last_error = NULL
             WHERE id = ?`,
            [nowIso, sub.id]
          );
        } catch (err: any) {
          const statusCode = Number(err?.statusCode || err?.status || 0);
          // 410 Gone or 404 Not Found means subscription was revoked or expired permanently
          if (statusCode === 410 || statusCode === 404) {
            removedInvalidSubscriptions++;
            await execute(`DELETE FROM admin_push_subscriptions WHERE id = ?`, [sub.id]);
          } else {
            const errMsg = String(err?.message || 'Push delivery error').slice(0, 200);
            await execute(
              `UPDATE admin_push_subscriptions SET last_error = ? WHERE id = ?`,
              [errMsg, sub.id]
            );
          }
        }
      });

      await Promise.all(sendPromises);

      return {
        sentMessages: 1,
        aggregatedVisitors: pendingRows.length,
        deliveredDevices,
        removedInvalidSubscriptions
      };
    } finally {
      this.isFlushing = false;
    }
  }

  private FlushGuardActive(): boolean {
    return this.isFlushing;
  }
}

export const visitorWebPush = new VisitorWebPushService();
