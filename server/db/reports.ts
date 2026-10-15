import { getDatabase, sanitizeArgs } from './database';
import { Client } from '@libsql/client';

export interface ReportRecord {
  id: string;
  reporterId: string;
  reporterName: string;
  targetPlayerId: string;
  targetPlayerName: string;
  targetPlayerEmail?: string;
  roomCode: string;
  reason: string;
  reasonCategory: 'toxicity' | 'throwing' | 'spam' | 'inappropriate_name' | 'other';
  details?: string;
  createdAt: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  resolutionNote?: string;
  actionTaken?: 'ban' | 'warning' | 'dismissed' | 'none';
  resolvedAt?: string;
}

export class ReportsDatabase {
  private get db(): Client {
    return getDatabase();
  }

  private rowToReport(r: any): ReportRecord {
    return {
      id: r.id,
      reporterId: r.reporter_id,
      reporterName: r.reporter_name,
      targetPlayerId: r.target_player_id,
      targetPlayerName: r.target_player_name,
      targetPlayerEmail: r.target_player_email || undefined,
      roomCode: r.room_code,
      reason: r.reason,
      reasonCategory: r.reason_category as ReportRecord['reasonCategory'],
      details: r.details || undefined,
      createdAt: r.created_at,
      status: r.status as ReportRecord['status'],
      resolutionNote: r.resolution_note || undefined,
      actionTaken: r.action_taken as ReportRecord['actionTaken'],
      resolvedAt: r.resolved_at || undefined
    };
  }

  public async getAllReports(): Promise<ReportRecord[]> {
    const res = await this.db.execute('SELECT * FROM reports ORDER BY created_at DESC');
    return res.rows.map(r => this.rowToReport(r));
  }

  public async getPendingCount(): Promise<number> {
    const res = await this.db.execute("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'");
    return Number(res.rows[0]?.count || 0);
  }

  public async createReport(params: {
    reporterId: string;
    reporterName: string;
    targetPlayerId: string;
    targetPlayerName: string;
    targetPlayerEmail?: string;
    roomCode: string;
    reason: string;
    reasonCategory: ReportRecord['reasonCategory'];
    details?: string;
  }): Promise<ReportRecord> {
    const id = 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    await this.db.execute({
      sql: `
        INSERT INTO reports (
          id, reporter_id, reporter_name, target_player_id, target_player_name, target_player_email,
          room_code, reason, reason_category, details, status, resolution_note, action_taken, created_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([
        id,
        params.reporterId,
        params.reporterName,
        params.targetPlayerId,
        params.targetPlayerName,
        params.targetPlayerEmail || null,
        params.roomCode,
        params.reason,
        params.reasonCategory,
        params.details || null,
        'pending',
        null,
        null,
        now,
        null
      ])
    });

    return {
      id,
      reporterId: params.reporterId,
      reporterName: params.reporterName,
      targetPlayerId: params.targetPlayerId,
      targetPlayerName: params.targetPlayerName,
      targetPlayerEmail: params.targetPlayerEmail,
      roomCode: params.roomCode,
      reason: params.reason,
      reasonCategory: params.reasonCategory,
      details: params.details,
      createdAt: now,
      status: 'pending'
    };
  }

  public async resolveReport(
    reportId: string, 
    status: ReportRecord['status'], 
    actionTaken: ReportRecord['actionTaken'], 
    resolutionNote?: string
  ): Promise<ReportRecord> {
    const checkRes = await this.db.execute({
      sql: 'SELECT * FROM reports WHERE id = ?',
      args: [reportId]
    });
    if (!checkRes.rows[0]) {
      throw new Error(`Жалоба #${reportId} не найдена.`);
    }

    const resolvedAt = new Date().toISOString();
    await this.db.execute({
      sql: `
        UPDATE reports SET
          status = ?,
          action_taken = ?,
          resolution_note = ?,
          resolved_at = ?
        WHERE id = ?
      `,
      args: sanitizeArgs([status, actionTaken || 'none', resolutionNote || '', resolvedAt, reportId])
    });

    const updatedRes = await this.db.execute({
      sql: 'SELECT * FROM reports WHERE id = ?',
      args: [reportId]
    });
    return this.rowToReport(updatedRes.rows[0]);
  }

  public async deleteReport(reportId: string): Promise<boolean> {
    const res = await this.db.execute({
      sql: 'DELETE FROM reports WHERE id = ?',
      args: [reportId]
    });
    return (res.rowsAffected ?? 0) > 0;
  }
}

export const reportsDb = new ReportsDatabase();
