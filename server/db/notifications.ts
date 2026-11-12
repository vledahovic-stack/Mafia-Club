import { randomUUID } from 'node:crypto';
import { Client } from '@libsql/client';
import { getDatabase, sanitizeArgs } from './database';
import { rewardMutex } from '../utils/asyncLock';

export type NotificationCategory = 'friends' | 'rewards' | 'system' | 'general';

export type NotificationType =
  | 'friend_request'
  | 'room_invite'
  | 'reward'
  | 'system_alert'
  | 'info'
  | string;

export type NotificationActionState =
  | 'none'
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired';

export interface UserNotification {
  id: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  actorId?: string | null;
  title: string;
  message: string;
  data?: Record<string, any> | null;
  isRead: boolean;
  isInteractive: boolean;
  actionState: NotificationActionState;
  eventKey?: string | null;
  createdAt: string;
  updatedAt: string;
  readAt?: string | null;
}

export interface CreateNotificationInput {
  type: NotificationType;
  category?: NotificationCategory;
  actorId?: string | null;
  title: string;
  message: string;
  data?: Record<string, any> | null;
  isInteractive?: boolean;
  actionState?: NotificationActionState;
  eventKey?: string | null;
  /**
   * Optional custom retention limit (defaults to DEFAULT_NOTIFICATION_LIMIT_PER_USER = 200).
   */
  customLimit?: number;
}

export interface GetNotificationsOptions {
  limit?: number;
  offset?: number;
  category?: NotificationCategory;
  unreadOnly?: boolean;
}

export interface GetNotificationsResult {
  notifications: UserNotification[];
  total: number;
  unreadCount: number;
}

/**
 * Base retention limit per registered user account.
 * Configurable without architectural redesign.
 */
export const DEFAULT_NOTIFICATION_LIMIT_PER_USER = 200;

export class NotificationsDatabase {
  private get db(): Client {
    return getDatabase();
  }

  private rowToNotification(r: any): UserNotification {
    let parsedData: Record<string, any> | null = null;
    if (r.data) {
      if (typeof r.data === 'string') {
        try {
          parsedData = JSON.parse(r.data);
        } catch {
          parsedData = null;
        }
      } else if (typeof r.data === 'object') {
        parsedData = r.data;
      }
    }

    return {
      id: String(r.id),
      userId: String(r.user_id),
      type: String(r.type),
      category: (r.category || 'general') as NotificationCategory,
      actorId: r.actor_id ? String(r.actor_id) : null,
      title: String(r.title || ''),
      message: String(r.message || ''),
      data: parsedData,
      isRead: Number(r.is_read) === 1,
      isInteractive: Number(r.is_interactive) === 1,
      actionState: (r.action_state || 'none') as NotificationActionState,
      eventKey: r.event_key ? String(r.event_key) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      readAt: r.read_at ? String(r.read_at) : null
    };
  }

  /**
   * Internal pruning helper. Must be called when the per-user lock is ALREADY held or within a transaction.
   * NEVER acquires the mutex itself to prevent nested deadlocks.
   *
   * Pruning policy:
   * 1. Remove oldest read notifications (is_read = 1).
   * 2. Then remove oldest unread informational notifications (not pending interactive).
   * 3. NEVER automatically remove pending interactive notifications (is_interactive = 1 AND action_state = 'pending').
   * If protected notifications exceed the limit, they are safely preserved.
   */
  public async pruneUserNotificationsInternal(
    userId: string,
    limit: number = DEFAULT_NOTIFICATION_LIMIT_PER_USER
  ): Promise<number> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) return 0;

    const countRes = await this.db.execute({
      sql: 'SELECT COUNT(*) as total FROM user_notifications WHERE user_id = ?',
      args: [cleanUserId]
    });
    const total = Number(countRes.rows[0]?.total || 0);
    const targetLimit = Math.max(1, limit);

    if (total <= targetLimit) {
      return 0;
    }

    let excess = total - targetLimit;
    let totalDeleted = 0;

    // Phase 1: Oldest read notifications (excluding protected pending interactive actions)
    if (excess > 0) {
      const readRowsRes = await this.db.execute({
        sql: `SELECT id FROM user_notifications 
              WHERE user_id = ? 
                AND is_read = 1 
                AND NOT (is_interactive = 1 AND action_state = 'pending')
              ORDER BY created_at ASC 
              LIMIT ?`,
        args: [cleanUserId, excess]
      });

      if (readRowsRes.rows.length > 0) {
        const readIds = readRowsRes.rows.map(r => String(r.id));
        const placeholders = readIds.map(() => '?').join(',');
        const deleteRes = await this.db.execute({
          sql: `DELETE FROM user_notifications WHERE user_id = ? AND id IN (${placeholders})`,
          args: [cleanUserId, ...readIds]
        });
        const deletedRead = deleteRes.rowsAffected || readIds.length;
        totalDeleted += deletedRead;
        excess = Math.max(0, excess - deletedRead);
      }
    }

    // Phase 2: Oldest unread informational notifications (excluding pending interactive actions)
    if (excess > 0) {
      const infoRowsRes = await this.db.execute({
        sql: `SELECT id FROM user_notifications 
              WHERE user_id = ? 
                AND is_read = 0 
                AND NOT (is_interactive = 1 AND action_state = 'pending')
              ORDER BY created_at ASC 
              LIMIT ?`,
        args: [cleanUserId, excess]
      });

      if (infoRowsRes.rows.length > 0) {
        const infoIds = infoRowsRes.rows.map(r => String(r.id));
        const placeholders = infoIds.map(() => '?').join(',');
        const deleteRes = await this.db.execute({
          sql: `DELETE FROM user_notifications WHERE user_id = ? AND id IN (${placeholders})`,
          args: [cleanUserId, ...infoIds]
        });
        const deletedInfo = deleteRes.rowsAffected || infoIds.length;
        totalDeleted += deletedInfo;
        excess = Math.max(0, excess - deletedInfo);
      }
    }

    // Phase 3: Any remaining excess consists exclusively of protected pending interactive actions.
    // As per specification: do NOT delete protected pending notifications.
    return totalDeleted;
  }

  /**
   * Public thread-safe method to prune old notifications for a user.
   */
  public async pruneUserNotifications(
    userId: string,
    limit: number = DEFAULT_NOTIFICATION_LIMIT_PER_USER
  ): Promise<number> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) return 0;

    return rewardMutex.runExclusive(`notifications:${cleanUserId}`, async () => {
      return this.pruneUserNotificationsInternal(cleanUserId, limit);
    });
  }

  /**
   * Creates a notification for a specific user with automatic deduplication (by eventKey)
   * and storage pruning (enforcing limit 200).
   */
  public async createNotification(
    userId: string,
    input: CreateNotificationInput
  ): Promise<UserNotification> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) {
      throw new Error('Не указан идентификатор получателя уведомления (userId).');
    }
    const cleanTitle = typeof input.title === 'string' ? input.title.trim() : '';
    if (!cleanTitle) {
      throw new Error('Заголовок уведомления не может быть пустым.');
    }
    const cleanMessage = typeof input.message === 'string' ? input.message.trim() : '';
    if (!cleanMessage) {
      throw new Error('Текст уведомления не может быть пустым.');
    }

    return rewardMutex.runExclusive(`notifications:${cleanUserId}`, async () => {
      const nowIso = new Date().toISOString();
      const cleanEventKey = typeof input.eventKey === 'string' && input.eventKey.trim() ? input.eventKey.trim() : null;
      const category: NotificationCategory = input.category || 'general';
      const isInteractive = Boolean(input.isInteractive);
      const actionState: NotificationActionState = isInteractive
        ? (input.actionState || 'pending')
        : 'none';
      const actorId = typeof input.actorId === 'string' && input.actorId.trim() ? input.actorId.trim() : null;
      const dataStr = input.data ? JSON.stringify(input.data) : null;

      // Deduplication check by eventKey
      if (cleanEventKey) {
        const existingRes = await this.db.execute({
          sql: `SELECT * FROM user_notifications WHERE user_id = ? AND event_key = ? LIMIT 1`,
          args: [cleanUserId, cleanEventKey]
        });

        if (existingRes.rows.length > 0) {
          const existing = this.rowToNotification(existingRes.rows[0]);

          // If existing notification is interactive and caller is creating a pending action
          // (e.g. re-sending a request after a previous one was declined, cancelled, or expired):
          if (existing.isInteractive && (actionState === 'pending')) {
            await this.db.execute({
              sql: `UPDATE user_notifications 
                    SET title = ?, message = ?, data = ?, is_read = 0, read_at = NULL,
                        action_state = 'pending', created_at = ?, updated_at = ?
                    WHERE id = ? AND user_id = ?`,
              args: sanitizeArgs([cleanTitle, cleanMessage, dataStr, nowIso, nowIso, existing.id, cleanUserId])
            });

            return {
              ...existing,
              title: cleanTitle,
              message: cleanMessage,
              data: input.data || existing.data,
              isRead: false,
              readAt: null,
              actionState: 'pending',
              createdAt: nowIso,
              updatedAt: nowIso
            };
          }

          // Otherwise return existing notification without creating duplicate
          return existing;
        }
      }

      const notifId = `notif_${randomUUID()}`;

      await this.db.execute({
        sql: `INSERT INTO user_notifications (
                id, user_id, type, category, actor_id, title, message, data,
                is_read, is_interactive, action_state, event_key, created_at, updated_at, read_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: sanitizeArgs([
          notifId,
          cleanUserId,
          input.type,
          category,
          actorId,
          cleanTitle,
          cleanMessage,
          dataStr,
          0, // is_read
          isInteractive ? 1 : 0,
          actionState,
          cleanEventKey,
          nowIso,
          nowIso,
          null
        ])
      });

      // Enforce retention limit (default 200)
      const targetLimit = input.customLimit || DEFAULT_NOTIFICATION_LIMIT_PER_USER;
      await this.pruneUserNotificationsInternal(cleanUserId, targetLimit);

      return {
        id: notifId,
        userId: cleanUserId,
        type: input.type,
        category,
        actorId,
        title: cleanTitle,
        message: cleanMessage,
        data: input.data || null,
        isRead: false,
        isInteractive,
        actionState,
        eventKey: cleanEventKey,
        createdAt: nowIso,
        updatedAt: nowIso,
        readAt: null
      };
    });
  }

  /**
   * Retrieves paginated notifications strictly belonging to the given user.
   */
  public async getUserNotifications(
    userId: string,
    options?: GetNotificationsOptions
  ): Promise<GetNotificationsResult> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) {
      return { notifications: [], total: 0, unreadCount: 0 };
    }

    const limit = Math.max(1, Math.min(100, Number(options?.limit) || 20));
    const offset = Math.max(0, Number(options?.offset) || 0);
    const category = options?.category;
    const unreadOnly = Boolean(options?.unreadOnly);

    // Build WHERE clauses strictly scoping by user_id
    const whereParts: string[] = ['user_id = ?'];
    const args: any[] = [cleanUserId];

    if (category) {
      whereParts.push('category = ?');
      args.push(category);
    }
    if (unreadOnly) {
      whereParts.push('is_read = 0');
    }

    const whereClause = whereParts.join(' AND ');

    // 1. Fetch total matching records
    const totalRes = await this.db.execute({
      sql: `SELECT COUNT(*) as count FROM user_notifications WHERE ${whereClause}`,
      args
    });
    const total = Number(totalRes.rows[0]?.count || 0);

    // 2. Fetch unread count for user
    const unreadRes = await this.db.execute({
      sql: `SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND is_read = 0`,
      args: [cleanUserId]
    });
    const unreadCount = Number(unreadRes.rows[0]?.count || 0);

    // 3. Fetch paginated notifications ordered by creation date descending
    const listRes = await this.db.execute({
      sql: `SELECT * FROM user_notifications 
            WHERE ${whereClause} 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?`,
      args: [...args, limit, offset]
    });

    const notifications = listRes.rows.map(r => this.rowToNotification(r));

    return {
      notifications,
      total,
      unreadCount
    };
  }

  /**
   * Returns the count of unread notifications for a specific user.
   */
  public async getUnreadCount(userId: string): Promise<number> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) return 0;

    const res = await this.db.execute({
      sql: `SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND is_read = 0`,
      args: [cleanUserId]
    });

    return Number(res.rows[0]?.count || 0);
  }

  /**
   * Marks a single notification as read, verifying account ownership.
   */
  public async markAsRead(
    userId: string,
    notificationId: string
  ): Promise<{ success: boolean; notification?: UserNotification }> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    const cleanId = typeof notificationId === 'string' ? notificationId.trim() : '';
    if (!cleanUserId || !cleanId) {
      return { success: false };
    }

    return rewardMutex.runExclusive(`notifications:${cleanUserId}`, async () => {
      const existingRes = await this.db.execute({
        sql: `SELECT * FROM user_notifications WHERE id = ? AND user_id = ? LIMIT 1`,
        args: [cleanId, cleanUserId]
      });

      if (existingRes.rows.length === 0) {
        return { success: false };
      }

      const existing = this.rowToNotification(existingRes.rows[0]);
      if (existing.isRead) {
        return { success: true, notification: existing };
      }

      const nowIso = new Date().toISOString();
      await this.db.execute({
        sql: `UPDATE user_notifications 
              SET is_read = 1, read_at = ?, updated_at = ? 
              WHERE id = ? AND user_id = ?`,
        args: [nowIso, nowIso, cleanId, cleanUserId]
      });

      return {
        success: true,
        notification: {
          ...existing,
          isRead: true,
          readAt: nowIso,
          updatedAt: nowIso
        }
      };
    });
  }

  /**
   * Marks all unread notifications as read for a specific user.
   */
  public async markAllAsRead(
    userId: string
  ): Promise<{ success: boolean; updatedCount: number }> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) {
      return { success: false, updatedCount: 0 };
    }

    return rewardMutex.runExclusive(`notifications:${cleanUserId}`, async () => {
      const nowIso = new Date().toISOString();
      const updateRes = await this.db.execute({
        sql: `UPDATE user_notifications 
              SET is_read = 1, read_at = COALESCE(read_at, ?), updated_at = ? 
              WHERE user_id = ? AND is_read = 0`,
        args: [nowIso, nowIso, cleanUserId]
      });

      const updatedCount = updateRes.rowsAffected || 0;
      return { success: true, updatedCount };
    });
  }

  /**
   * Deletes a single notification, strictly verifying account ownership.
   */
  public async deleteNotification(
    userId: string,
    notificationId: string
  ): Promise<{ success: boolean }> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    const cleanId = typeof notificationId === 'string' ? notificationId.trim() : '';
    if (!cleanUserId || !cleanId) {
      return { success: false };
    }

    return rewardMutex.runExclusive(`notifications:${cleanUserId}`, async () => {
      const deleteRes = await this.db.execute({
        sql: `DELETE FROM user_notifications WHERE id = ? AND user_id = ?`,
        args: [cleanId, cleanUserId]
      });

      return { success: (deleteRes.rowsAffected || 0) > 0 };
    });
  }

  /**
   * Deletes all read notifications for a specific user.
   */
  public async deleteAllRead(
    userId: string
  ): Promise<{ success: boolean; deletedCount: number }> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) {
      return { success: false, deletedCount: 0 };
    }

    return rewardMutex.runExclusive(`notifications:${cleanUserId}`, async () => {
      const deleteRes = await this.db.execute({
        sql: `DELETE FROM user_notifications 
              WHERE user_id = ? 
                AND is_read = 1 
                AND NOT (is_interactive = 1 AND action_state = 'pending')`,
        args: [cleanUserId]
      });

      const deletedCount = deleteRes.rowsAffected || 0;
      return { success: true, deletedCount };
    });
  }

  /**
   * Safely updates the action state of an interactive notification.
   * Enforces protection against re-processing: if action_state is not 'pending', returns alreadyProcessed: true.
   */
  public async updateActionState(
    userId: string,
    notificationId: string,
    newActionState: NotificationActionState,
    extraData?: Record<string, any>
  ): Promise<{
    success: boolean;
    alreadyProcessed?: boolean;
    notification?: UserNotification;
    error?: string;
  }> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    const cleanId = typeof notificationId === 'string' ? notificationId.trim() : '';
    if (!cleanUserId || !cleanId) {
      return { success: false, error: 'Не указан ID пользователя или уведомления.' };
    }

    return rewardMutex.runExclusive(`notifications:${cleanUserId}`, async () => {
      const existingRes = await this.db.execute({
        sql: `SELECT * FROM user_notifications WHERE id = ? AND user_id = ? LIMIT 1`,
        args: [cleanId, cleanUserId]
      });

      if (existingRes.rows.length === 0) {
        return { success: false, error: 'Уведомление не найдено.' };
      }

      const existing = this.rowToNotification(existingRes.rows[0]);

      if (!existing.isInteractive) {
        return {
          success: false,
          error: 'Уведомление не является интерактивным.'
        };
      }

      // Re-processing check: if action is already accepted, declined, cancelled, or expired
      if (existing.actionState !== 'pending') {
        return {
          success: false,
          alreadyProcessed: true,
          notification: existing,
          error: `Действие уже обработано со статусом «${existing.actionState}».`
        };
      }

      const nowIso = new Date().toISOString();
      const mergedData = extraData
        ? { ...(existing.data || {}), ...extraData }
        : existing.data;
      const dataStr = mergedData ? JSON.stringify(mergedData) : null;

      await this.db.execute({
        sql: `UPDATE user_notifications 
              SET action_state = ?, is_read = 1, read_at = COALESCE(read_at, ?), updated_at = ?, data = ?
              WHERE id = ? AND user_id = ? AND action_state = 'pending'`,
        args: sanitizeArgs([newActionState, nowIso, nowIso, dataStr, cleanId, cleanUserId])
      });

      const updatedNotif: UserNotification = {
        ...existing,
        actionState: newActionState,
        isRead: true,
        readAt: existing.readAt || nowIso,
        updatedAt: nowIso,
        data: mergedData
      };

      return {
        success: true,
        alreadyProcessed: false,
        notification: updatedNotif
      };
    });
  }

  /**
   * Helper to look up an active friend request notification by recipient and sender.
   * Useful for syncing notification action state when friend request is accepted/declined elsewhere.
   */
  public async syncFriendRequestNotificationState(
    recipientUserId: string,
    senderUserId: string,
    newActionState: NotificationActionState
  ): Promise<UserNotification | null> {
    const cleanRecipient = typeof recipientUserId === 'string' ? recipientUserId.trim() : '';
    const cleanSender = typeof senderUserId === 'string' ? senderUserId.trim() : '';
    if (!cleanRecipient || !cleanSender) return null;

    return rewardMutex.runExclusive(`notifications:${cleanRecipient}`, async () => {
      const res = await this.db.execute({
        sql: `SELECT * FROM user_notifications 
              WHERE user_id = ? 
                AND type = 'friend_request' 
                AND actor_id = ? 
                AND action_state = 'pending'
              ORDER BY created_at DESC 
              LIMIT 1`,
        args: [cleanRecipient, cleanSender]
      });

      if (res.rows.length === 0) return null;

      const existing = this.rowToNotification(res.rows[0]);
      const nowIso = new Date().toISOString();

      await this.db.execute({
        sql: `UPDATE user_notifications 
              SET action_state = ?, is_read = 1, read_at = COALESCE(read_at, ?), updated_at = ?
              WHERE id = ? AND user_id = ?`,
        args: sanitizeArgs([newActionState, nowIso, nowIso, existing.id, cleanRecipient])
      });

      return {
        ...existing,
        actionState: newActionState,
        isRead: true,
        readAt: existing.readAt || nowIso,
        updatedAt: nowIso
      };
    });
  }

  /**
   * Retrieves a single notification by ID, ensuring strict account ownership.
   */
  public async getNotificationById(
    userId: string,
    notificationId: string
  ): Promise<UserNotification | null> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    const cleanId = typeof notificationId === 'string' ? notificationId.trim() : '';
    if (!cleanUserId || !cleanId) return null;

    const res = await this.db.execute({
      sql: `SELECT * FROM user_notifications WHERE id = ? AND user_id = ? LIMIT 1`,
      args: [cleanId, cleanUserId]
    });

    if (res.rows.length === 0) return null;
    return this.rowToNotification(res.rows[0]);
  }
}

export const notificationsDb = new NotificationsDatabase();
