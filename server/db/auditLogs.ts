import { getDatabase } from './database';
import { DatabaseSync } from 'node:sqlite';

export type AuditActionType =
  | 'role_change'
  | 'room_shutdown'
  | 'event_create'
  | 'event_update'
  | 'event_delete'
  | 'task_create'
  | 'task_update'
  | 'task_delete'
  | 'user_ban'
  | 'credits_change'
  | 'item_give'
  | 'user_rename'
  | 'rating_change'
  | 'broadcast'
  | 'report_resolve'
  | 'shop_update'
  | 'daily_bonus_update'
  | 'system';

export interface AuditLogRecord {
  id: string;
  actionType: AuditActionType;
  adminId?: string;
  adminEmail: string;
  adminName: string;
  targetId?: string;
  targetName?: string;
  details: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export class AuditLogsDatabase {
  private get db(): DatabaseSync {
    return getDatabase();
  }

  constructor() {
    this.ensureTable();
    this.seedInitialLogsIfEmpty();
  }

  private ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action_type TEXT NOT NULL,
        admin_id TEXT,
        admin_email TEXT NOT NULL,
        admin_name TEXT NOT NULL,
        target_id TEXT,
        target_name TEXT,
        details TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
    `);
  }

  private rowToLog(row: any): AuditLogRecord {
    let metadata = {};
    if (row.metadata) {
      try {
        metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      } catch {
        metadata = {};
      }
    }
    return {
      id: row.id,
      actionType: row.action_type as AuditActionType,
      adminId: row.admin_id || undefined,
      adminEmail: row.admin_email,
      adminName: row.admin_name,
      targetId: row.target_id || undefined,
      targetName: row.target_name || undefined,
      details: row.details,
      metadata,
      createdAt: row.created_at
    };
  }

  public logAction(params: {
    actionType: AuditActionType;
    adminId?: string;
    adminEmail?: string;
    adminName?: string;
    targetId?: string;
    targetName?: string;
    details: string;
    metadata?: Record<string, any>;
    createdAt?: string;
  }): AuditLogRecord {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = params.createdAt || new Date().toISOString();
    const adminEmail = params.adminEmail || 'vledahovic@gmail.com';
    const adminName = params.adminName || 'Главный Администратор';

    const insert = this.db.prepare(`
      INSERT INTO audit_logs (
        id, action_type, admin_id, admin_email, admin_name, target_id, target_name, details, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      id,
      params.actionType,
      params.adminId || null,
      adminEmail,
      adminName,
      params.targetId || null,
      params.targetName || null,
      params.details,
      JSON.stringify(params.metadata || {}),
      now
    );

    return {
      id,
      actionType: params.actionType,
      adminId: params.adminId,
      adminEmail,
      adminName,
      targetId: params.targetId,
      targetName: params.targetName,
      details: params.details,
      metadata: params.metadata || {},
      createdAt: now
    };
  }

  public getLogs(filter?: {
    limit?: number;
    actionType?: string;
    search?: string;
  }): AuditLogRecord[] {
    const limit = filter?.limit && filter.limit > 0 ? filter.limit : 100;
    const actionType = filter?.actionType && filter.actionType !== 'all' ? filter.actionType : null;
    const search = filter?.search ? filter.search.trim().toLowerCase() : null;

    let query = 'SELECT * FROM audit_logs';
    const conditions: string[] = [];
    const params: any[] = [];

    if (actionType) {
      conditions.push('action_type = ?');
      params.push(actionType);
    }

    if (search) {
      conditions.push(`(
        LOWER(details) LIKE ? OR 
        LOWER(admin_name) LIKE ? OR 
        LOWER(admin_email) LIKE ? OR 
        LOWER(COALESCE(target_name, '')) LIKE ? OR
        LOWER(action_type) LIKE ?
      )`);
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => this.rowToLog(r));
  }

  public getStats(): {
    totalLogs: number;
    roleChangesCount: number;
    roomShutdownsCount: number;
    eventActionsCount: number;
    moderationActionsCount: number;
  } {
    const total = (this.db.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as { count: number })?.count || 0;
    const roleChanges = (this.db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE action_type = 'role_change'").get() as { count: number })?.count || 0;
    const roomShutdowns = (this.db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE action_type = 'room_shutdown'").get() as { count: number })?.count || 0;
    const eventActions = (this.db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE action_type IN ('event_create', 'event_update', 'event_delete', 'task_create', 'task_update', 'task_delete')").get() as { count: number })?.count || 0;
    const moderationActions = (this.db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE action_type IN ('user_ban', 'report_resolve', 'user_rename')").get() as { count: number })?.count || 0;

    return {
      totalLogs: total,
      roleChangesCount: roleChanges,
      roomShutdownsCount: roomShutdowns,
      eventActionsCount: eventActions,
      moderationActionsCount: moderationActions
    };
  }

  public clearLogs(): void {
    this.db.exec('DELETE FROM audit_logs');
  }

  public seedInitialLogsIfEmpty(): void {
    const count = (this.db.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as { count: number })?.count || 0;
    if (count > 0) return;

    const baseTime = Date.now();
    const adminEmail = 'vledahovic@gmail.com';
    const adminName = 'vledahovic (Главный Админ)';

    const seedEntries: Array<{
      actionType: AuditActionType;
      details: string;
      targetId?: string;
      targetName?: string;
      metadata?: Record<string, any>;
      minutesAgo: number;
    }> = [
      {
        actionType: 'role_change',
        details: 'Назначены постоянные права Главного Администратора аккаунту vledahovic@gmail.com',
        targetId: 'admin_root',
        targetName: 'vledahovic@gmail.com',
        metadata: { oldRole: 'user', newRole: 'admin', reason: 'System fallback administrator provision' },
        minutesAgo: 1440
      },
      {
        actionType: 'event_create',
        details: 'Создан глобальный сезонный ивент «Кровавая Луна над Городом» с клановыми рубежами и наградами',
        targetId: 'evt_blood_moon',
        targetName: 'Кровавая Луна над Городом',
        metadata: { type: 'clan_war', targetPoints: 5000, rewardCredits: 1000 },
        minutesAgo: 720
      },
      {
        actionType: 'task_create',
        details: 'Добавлена новая ежедневная боевая задача «Ночной охотник: Ликвидировать 2 мирных жителя»',
        targetId: 'task_mafia_night_hunter',
        targetName: 'Ночной охотник',
        metadata: { targetCount: 2, rewardCredits: 120, clanPoints: 15 },
        minutesAgo: 600
      },
      {
        actionType: 'room_shutdown',
        details: 'Принудительное закрытие комнаты #NOIR77 по причине неактивности ведущего',
        targetId: 'NOIR77',
        targetName: 'Комната #NOIR77 (Нуар Классика)',
        metadata: { roomCode: 'NOIR77', reason: 'Host inactivity timeout', playersDismissed: 4 },
        minutesAgo: 310
      },
      {
        actionType: 'user_ban',
        details: 'Блокировка нарушителя «Тролль_99» за токсичное поведение и спам в чате',
        targetId: 'usr_troll99',
        targetName: 'Тролль_99',
        metadata: { reason: 'Toxicity & game throwing', reportId: 'rep_demo_01' },
        minutesAgo: 180
      },
      {
        actionType: 'daily_bonus_update',
        details: 'Активирован специальный множитель x2 для наград ежедневного входа на выходные',
        targetId: 'daily_bonus_cfg',
        targetName: 'Конфигурация бонусов',
        metadata: { multiplier: 2, streakPolicy: 'calendar_day' },
        minutesAgo: 95
      },
      {
        actionType: 'broadcast',
        details: 'Отправлено системное оповещение во все комнаты: «Внимание: в 21:00 стартует клановый турнир Города!»',
        targetName: 'Все активные комнаты',
        metadata: { recipientCount: 6 },
        minutesAgo: 45
      }
    ];

    for (const item of seedEntries) {
      const createdAt = new Date(baseTime - item.minutesAgo * 60 * 1000).toISOString();
      this.logAction({
        actionType: item.actionType,
        adminEmail,
        adminName,
        targetId: item.targetId,
        targetName: item.targetName,
        details: item.details,
        metadata: item.metadata,
        createdAt
      });
    }
  }
}

export const auditLogsDb = new AuditLogsDatabase();
