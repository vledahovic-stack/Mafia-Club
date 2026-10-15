import { getDatabase } from './database';
import { DatabaseSync } from 'node:sqlite';

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
  private get db(): DatabaseSync {
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

  public getAll(): FeedbackRecord[] {
    const rows = this.db.prepare('SELECT * FROM feedbacks ORDER BY created_at DESC').all() as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  public getByUserId(userId: string): FeedbackRecord[] {
    const rows = this.db.prepare('SELECT * FROM feedbacks WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  public getById(id: string): FeedbackRecord | null {
    const row = this.db.prepare('SELECT * FROM feedbacks WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToRecord(row);
  }

  public getPendingCount(): number {
    const res = this.db.prepare("SELECT COUNT(*) as count FROM feedbacks WHERE status = 'pending'").get() as { count: number };
    return res?.count || 0;
  }

  public create(params: {
    userId: string;
    userEmail: string;
    userName: string;
    userAvatarSeed?: string;
    type: FeedbackType;
    title: string;
    description: string;
    images?: string[];
  }): FeedbackRecord {
    const id = 'fb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const imagesJson = JSON.stringify(params.images || []);

    const insert = this.db.prepare(`
      INSERT INTO feedbacks (
        id, user_id, user_email, user_name, user_avatar_seed,
        type, title, description, images, status, admin_note,
        reward_credits, rewarded_at, rewarded_by_admin_name,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
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
    );

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

  public updateStatus(
    id: string,
    status: FeedbackStatus,
    adminNote?: string,
    rewardCredits?: number,
    adminName?: string
  ): FeedbackRecord {
    const current = this.getById(id);
    if (!current) throw new Error('Обращение не найдено');

    const now = new Date().toISOString();
    const finalRewardCredits = rewardCredits !== undefined ? rewardCredits : (current.rewardCredits || null);
    const finalRewardedAt = rewardCredits && rewardCredits > 0 ? (current.rewardedAt || now) : (current.rewardedAt || null);
    const finalAdminName = adminName || current.rewardedByAdminName || null;

    this.db.prepare(`
      UPDATE feedbacks SET
        status = ?,
        admin_note = ?,
        reward_credits = ?,
        rewarded_at = ?,
        rewarded_by_admin_name = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      status,
      adminNote !== undefined ? adminNote : (current.adminNote || null),
      finalRewardCredits,
      finalRewardedAt,
      finalAdminName,
      now,
      id
    );

    return this.getById(id)!;
  }

  public delete(id: string): void {
    this.db.prepare('DELETE FROM feedbacks WHERE id = ?').run(id);
  }
}

export const feedbackDb = new FeedbackDatabase();
