import { getDatabase, sanitizeArgs } from './database';
import { Client } from '@libsql/client';

export type FeedbackType = 'bug' | 'idea' | 'improvement' | 'other';
export type FeedbackStatus = 'pending' | 'reviewed' | 'rewarded' | 'declined' | 'fixed';

export interface FeedbackRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userAvatarSeed?: string;
  type: FeedbackType;
  title: string;
  description: string;
  images: string[];
  status: FeedbackStatus;
  adminNote?: string;
  rewardCredits?: number;
  rewardedAt?: string;
  rewardedByAdminName?: string;
  createdAt: string;
  updatedAt: string;
}

export class FeedbackDatabase {
  private get db(): Client {
    return getDatabase();
  }

  private rowToRecord(r: any): FeedbackRecord {
    let images: string[] = [];
    try {
      images = typeof r.images === 'string' ? JSON.parse(r.images) : r.images || [];
    } catch {
      images = [];
    }

    return {
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      userName: r.user_name,
      userAvatarSeed: r.user_avatar_seed || undefined,
      type: r.type as FeedbackType,
      title: r.title,
      description: r.description,
      images,
      status: r.status as FeedbackStatus,
      adminNote: r.admin_note || undefined,
      rewardCredits: r.reward_credits !== null && r.reward_credits !== undefined ? Number(r.reward_credits) : undefined,
      rewardedAt: r.rewarded_at || undefined,
      rewardedByAdminName: r.rewarded_by_admin_name || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  public async getAll(): Promise<FeedbackRecord[]> {
    const res = await this.db.execute('SELECT * FROM feedbacks ORDER BY created_at DESC');
    return res.rows.map(r => this.rowToRecord(r));
  }

  public async getByUserId(userId: string): Promise<FeedbackRecord[]> {
    const res = await this.db.execute({
      sql: 'SELECT * FROM feedbacks WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId]
    });
    return res.rows.map(r => this.rowToRecord(r));
  }

  public async getById(id: string): Promise<FeedbackRecord | null> {
    const res = await this.db.execute({
      sql: 'SELECT * FROM feedbacks WHERE id = ?',
      args: [id]
    });
    const row = res.rows[0];
    if (!row) return null;
    return this.rowToRecord(row);
  }

  public async getPendingCount(): Promise<number> {
    const res = await this.db.execute("SELECT COUNT(*) as count FROM feedbacks WHERE status = 'pending'");
    return Number(res.rows[0]?.count || 0);
  }

  public async create(params: {
    userId: string;
    userEmail: string;
    userName: string;
    userAvatarSeed?: string;
    type: FeedbackType;
    title: string;
    description: string;
    images?: string[];
  }): Promise<FeedbackRecord> {
    const id = 'fb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const imagesJson = JSON.stringify(params.images || []);

    await this.db.execute({
      sql: `
        INSERT INTO feedbacks (
          id, user_id, user_email, user_name, user_avatar_seed,
          type, title, description, images, status, admin_note,
          reward_credits, rewarded_at, rewarded_by_admin_name,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([
        id,
        params.userId,
        params.userEmail,
        params.userName,
        params.userAvatarSeed || null,
        params.type,
        params.title,
        params.description,
        imagesJson,
        'pending',
        null,
        null,
        null,
        null,
        now,
        now
      ])
    });

    return {
      id,
      userId: params.userId,
      userEmail: params.userEmail,
      userName: params.userName,
      userAvatarSeed: params.userAvatarSeed,
      type: params.type,
      title: params.title,
      description: params.description,
      images: params.images || [],
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };
  }

  public async updateStatus(
    id: string,
    status: FeedbackStatus,
    adminNote?: string,
    rewardCredits?: number,
    adminName?: string
  ): Promise<FeedbackRecord> {
    const current = await this.getById(id);
    if (!current) throw new Error('Обращение не найдено');

    const now = new Date().toISOString();
    const finalRewardCredits = rewardCredits !== undefined ? rewardCredits : (current.rewardCredits || null);
    const finalRewardedAt = rewardCredits && rewardCredits > 0 ? (current.rewardedAt || now) : (current.rewardedAt || null);
    const finalAdminName = adminName || current.rewardedByAdminName || null;

    await this.db.execute({
      sql: `
        UPDATE feedbacks SET
          status = ?,
          admin_note = ?,
          reward_credits = ?,
          rewarded_at = ?,
          rewarded_by_admin_name = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: sanitizeArgs([
        status,
        adminNote !== undefined ? adminNote : (current.adminNote || null),
        finalRewardCredits,
        finalRewardedAt,
        finalAdminName,
        now,
        id
      ])
    });

    const updated = await this.getById(id);
    return updated!;
  }

  public async delete(id: string): Promise<void> {
    await this.db.execute({
      sql: 'DELETE FROM feedbacks WHERE id = ?',
      args: [id]
    });
  }
}

export const feedbackDb = new FeedbackDatabase();
