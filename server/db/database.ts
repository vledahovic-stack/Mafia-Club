import path from 'path';
import fs from 'fs';
import { randomBytes } from 'node:crypto';
import { createClient, Client } from '@libsql/client';

export const SQLITE_DB_PATH = path.resolve(process.cwd(), 'database.sqlite');

let dbClient: Client | null = null;
let initPromise: Promise<void> | null = null;

export function getDatabase(): Client {
  if (!dbClient) {
    dbClient = initDatabase();
  }
  return dbClient;
}

/**
 * Safely sanitizes arguments for LibSQL (maps undefined to null).
 */
export function sanitizeArgs(args: any[]): any[] {
  return args.map(arg => (arg === undefined ? null : arg));
}

export async function query<T = any>(sql: string, args: any[] = []): Promise<T[]> {
  const db = getDatabase();
  const res = await db.execute({ sql, args: sanitizeArgs(args) });
  return res.rows as unknown as T[];
}

export async function queryOne<T = any>(sql: string, args: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, args);
  return rows[0] || null;
}

export async function execute(sql: string, args: any[] = []): Promise<{ rowsAffected: number; lastInsertRowid?: bigint }> {
  const db = getDatabase();
  const res = await db.execute({ sql, args: sanitizeArgs(args) });
  return {
    rowsAffected: res.rowsAffected,
    lastInsertRowid: res.lastInsertRowid
  };
}

export async function batch(statements: Array<{ sql: string; args?: any[] } | string>): Promise<any[]> {
  const db = getDatabase();
  const safeStatements = statements.map(s => {
    if (typeof s === 'string') return s;
    return {
      sql: s.sql,
      args: sanitizeArgs(s.args || [])
    };
  });
  return db.batch(safeStatements);
}

export interface DatabaseConnectionInfo {
  mode: 'turso' | 'local_sqlite';
  target: string;
  isPersistentInCloud: boolean;
  hasAuthToken: boolean;
}

export function getDatabaseConnectionInfo(): DatabaseConnectionInfo {
  const rawTursoUrl = (process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || '').trim();
  const rawAuthToken = (process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '').trim();

  if (rawTursoUrl) {
    let safeTarget = rawTursoUrl;
    try {
      const parsed = new URL(rawTursoUrl);
      safeTarget = `${parsed.protocol}//${parsed.host}${parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : ''}`;
    } catch {
      safeTarget = rawTursoUrl.split('?')[0];
    }
    return {
      mode: 'turso',
      target: safeTarget,
      isPersistentInCloud: true,
      hasAuthToken: Boolean(rawAuthToken)
    };
  }

  return {
    mode: 'local_sqlite',
    target: `file:${SQLITE_DB_PATH}`,
    isPersistentInCloud: false,
    hasAuthToken: false
  };
}

export function initDatabase(): Client {
  if (dbClient) return dbClient;

  const rawTursoUrl = (process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || '').trim();
  const rawAuthToken = (process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '').trim();

  const url = rawTursoUrl || `file:${SQLITE_DB_PATH}`;
  const authToken = rawAuthToken || undefined;

  const client = createClient({
    url,
    authToken
  });
  dbClient = client;

  initPromise = setupDatabase(client).catch(err => {
    console.error('[LibSQL] Error during database initialization:', err);
  });

  return client;
}

export async function waitForDatabaseInit(): Promise<void> {
  if (!dbClient) {
    initDatabase();
  }
  if (initPromise) {
    await initPromise;
  }
}

const DEFAULT_ADMIN_PASSWORD_HASH = '$2b$10$nUsBtb9WUJRFqh8Ds8W4OOGPg2oJw0l2AT6CtDXRtMKEBpIzTNjEW'; // bcrypt hash for '123456'

async function setupDatabase(db: Client) {
  // PRAGMAs (for local SQLite/LibSQL concurrency & foreign keys)
  try {
    await db.execute('PRAGMA journal_mode = WAL;');
  } catch {}
  try {
    await db.execute('PRAGMA busy_timeout = 10000;');
  } catch {}
  try {
    await db.execute('PRAGMA foreign_keys = ON;');
  } catch {}

  await createTables(db);
  await migrateJsonDataIfPresent(db);
  await ensureAdminUser(db);
}

async function ensureAdminUser(db: Client) {
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || 'vledahovic@gmail.com').trim().toLowerCase();
    const existingRes = await db.execute({
      sql: 'SELECT id, password_hash, role, is_admin FROM users WHERE LOWER(email) = LOWER(?)',
      args: [adminEmail]
    });
    const existing = existingRes.rows[0];
    const now = new Date().toISOString();

    if (existing) {
      await db.execute({
        sql: `
          UPDATE users SET
            role = 'admin',
            is_admin = 1,
            is_banned = 0,
            password_hash = COALESCE(NULLIF(password_hash, ''), ?),
            updated_at = ?
          WHERE id = ?
        `,
        args: [DEFAULT_ADMIN_PASSWORD_HASH, now, existing.id]
      });
    } else {
      await db.execute({
        sql: `
          INSERT INTO users (
            id, email, display_name, avatar_seed, password_hash, session_token,
            credits, xp, level, role, is_admin, is_banned,
            clan_id, clan_name, clan_tag, clan_role,
            equipped_card_back, equipped_title,
            daily_bonus_streak, last_daily_bonus_claim,
            is_email_verified, email_verified_at,
            stats, inventory, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          'usr_7nmq32ex',
          adminEmail,
          'Дон Влад',
          'Дон Влад',
          DEFAULT_ADMIN_PASSWORD_HASH,
          'tk_' + randomBytes(32).toString('hex'),
          50000,
          15000,
          25,
          'admin',
          1,
          0,
          null, null, null, null,
          null, null,
          0, null,
          0, null,
          JSON.stringify({ gamesPlayed: 0, gamesWon: 0, rating: 1500, mafiaWins: 0, civilianWins: 0 }),
          JSON.stringify([]),
          now,
          now
        ]
      });
    }
  } catch (err) {
    console.error('[LibSQL] Failed to ensure admin user in database init:', err);
  }
}

async function createTables(db: Client) {
  const schemaStatements = [
    // 1. Users table
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_seed TEXT NOT NULL,
      password_hash TEXT,
      session_token TEXT UNIQUE,
      credits INTEGER NOT NULL DEFAULT 250,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      role TEXT NOT NULL DEFAULT 'user',
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_banned INTEGER NOT NULL DEFAULT 0,
      clan_id TEXT,
      clan_name TEXT,
      clan_tag TEXT,
      clan_role TEXT,
      equipped_card_back TEXT,
      equipped_title TEXT,
      daily_bonus_streak INTEGER NOT NULL DEFAULT 0,
      last_daily_bonus_claim TEXT,
      is_email_verified INTEGER NOT NULL DEFAULT 0,
      email_verified_at TEXT,
      stats TEXT NOT NULL DEFAULT '{}',
      inventory TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
    `CREATE INDEX IF NOT EXISTS idx_users_session_token ON users(session_token);`,

    // Email verification codes table
    `CREATE TABLE IF NOT EXISTS email_verification_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts_left INTEGER NOT NULL DEFAULT 5,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_email_verif_user ON email_verification_codes(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_email_verif_email ON email_verification_codes(email);`,

    // Password reset codes table
    `CREATE TABLE IF NOT EXISTS password_reset_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts_left INTEGER NOT NULL DEFAULT 5,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_reset_codes_email ON password_reset_codes(email);`,

    // IP Rate limits table for multi-process distributed rate limiting
    `CREATE TABLE IF NOT EXISTS ip_rate_limits (
      id TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_ip_rate_limits_lookup ON ip_rate_limits(ip, action, created_at);`,

    // 2. User Friends table
    `CREATE TABLE IF NOT EXISTS user_friends (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_friends_pair ON user_friends(user_id, friend_id);`,
    `CREATE INDEX IF NOT EXISTS idx_user_friends_user ON user_friends(user_id);`,

    // 3. Match History table
    `CREATE TABLE IF NOT EXISTS match_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      room_code TEXT,
      role TEXT NOT NULL,
      role_name TEXT NOT NULL,
      team TEXT NOT NULL,
      won INTEGER NOT NULL,
      survived INTEGER NOT NULL,
      survival_seconds INTEGER NOT NULL,
      rounds_survived INTEGER NOT NULL,
      rating_change INTEGER NOT NULL,
      credits_earned INTEGER NOT NULL,
      xp_earned INTEGER NOT NULL DEFAULT 0,
      xp_breakdown TEXT,
      played_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_matches_user_id ON match_history(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_matches_played_at ON match_history(played_at);`,

    // 4. Room Invites table
    `CREATE TABLE IF NOT EXISTS room_invites (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL,
      from_user_name TEXT NOT NULL,
      from_user_avatar TEXT,
      to_user_id TEXT NOT NULL,
      room_code TEXT NOT NULL,
      room_name TEXT NOT NULL,
      is_private INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_room_invites_to_user ON room_invites(to_user_id);`,

    // 5. Clans table
    `CREATE TABLE IF NOT EXISTS clans (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      tag TEXT UNIQUE NOT NULL,
      description TEXT,
      avatar_url TEXT,
      rating INTEGER NOT NULL DEFAULT 1000,
      leader_id TEXT NOT NULL,
      leader_name TEXT NOT NULL,
      members TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_clans_name ON clans(name);`,
    `CREATE INDEX IF NOT EXISTS idx_clans_tag ON clans(tag);`,

    // 6. Reports table
    `CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      reporter_name TEXT NOT NULL,
      target_player_id TEXT NOT NULL,
      target_player_name TEXT NOT NULL,
      target_player_email TEXT,
      room_code TEXT NOT NULL,
      reason TEXT NOT NULL,
      reason_category TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      resolution_note TEXT,
      action_taken TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);`,

    // 7. Shop Settings & Items table
    `CREATE TABLE IF NOT EXISTS shop_settings (
      id TEXT PRIMARY KEY,
      global_discount INTEGER NOT NULL DEFAULT 0,
      banner_message TEXT NOT NULL,
      is_shop_enabled INTEGER NOT NULL DEFAULT 1,
      nickname_cost INTEGER NOT NULL DEFAULT 250,
      avatar_cost INTEGER NOT NULL DEFAULT 500,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS shop_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price INTEGER NOT NULL,
      rarity TEXT NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      is_admin_hidden INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,

    // 8. Daily Bonus Config & Claims table
    `CREATE TABLE IF NOT EXISTS daily_bonus_config (
      id TEXT PRIMARY KEY,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      multiplier REAL NOT NULL DEFAULT 1.0,
      streak_policy TEXT NOT NULL DEFAULT 'flexible_24h',
      cooldown_hours REAL NOT NULL DEFAULT 20.0,
      banner_message TEXT NOT NULL,
      vip_bonus_percent INTEGER NOT NULL DEFAULT 10,
      days TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS daily_bonus_claims (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_display_name TEXT NOT NULL,
      day INTEGER NOT NULL,
      credits INTEGER NOT NULL,
      item_id TEXT,
      claimed_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_daily_bonus_claims_user ON daily_bonus_claims(user_id);`,

    // 9. Game Rooms & Lobby Chat
    `CREATE TABLE IF NOT EXISTS game_rooms (
      room_code TEXT PRIMARY KEY,
      room_name TEXT NOT NULL,
      host_id TEXT NOT NULL,
      host_name TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'LOBBY',
      player_count INTEGER NOT NULL DEFAULT 1,
      max_players INTEGER NOT NULL DEFAULT 10,
      in_game INTEGER NOT NULL DEFAULT 0,
      winner TEXT,
      day_number INTEGER NOT NULL DEFAULT 0,
      settings TEXT NOT NULL DEFAULT '{}',
      spectators TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_game_rooms_phase ON game_rooms(phase);`,
    `CREATE TABLE IF NOT EXISTS lobby_chat (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_lobby_chat_created ON lobby_chat(created_at);`,

    // 10. Events and Quests System Tables
    `CREATE TABLE IF NOT EXISTS events_and_tasks_config (
      id TEXT PRIMARY KEY,
      master_toggles TEXT NOT NULL,
      personal_reroll_free_daily_limit INTEGER NOT NULL DEFAULT 1,
      personal_reroll_cost INTEGER NOT NULL DEFAULT 50,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS task_archive (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_count INTEGER NOT NULL,
      target_role TEXT,
      reward_credits INTEGER NOT NULL DEFAULT 0,
      reward_item_id TEXT,
      reward_item_name TEXT,
      reward_xp INTEGER NOT NULL DEFAULT 0,
      clan_points INTEGER NOT NULL DEFAULT 0,
      starts_at TEXT,
      ends_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      is_repeatable INTEGER NOT NULL DEFAULT 0,
      repeat_cycle TEXT DEFAULT 'none',
      onboarding_min_reg_date TEXT,
      event_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_task_archive_type ON task_archive(type);`,
    `CREATE INDEX IF NOT EXISTS idx_task_archive_status ON task_archive(status);`,

    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      banner_url TEXT,
      icon TEXT NOT NULL DEFAULT '🎉',
      type TEXT NOT NULL DEFAULT 'general',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      repeat_cycle TEXT DEFAULT 'none',
      task_ids TEXT NOT NULL DEFAULT '[]',
      clan_milestones TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);`,

    `CREATE TABLE IF NOT EXISTS user_task_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      current_count INTEGER NOT NULL DEFAULT 0,
      is_completed INTEGER NOT NULL DEFAULT 0,
      is_claimed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      claimed_at TEXT,
      assigned_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_user_task_progress_user ON user_task_progress(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_user_task_progress_task ON user_task_progress(task_id);`,

    `CREATE TABLE IF NOT EXISTS user_personal_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date_str TEXT NOT NULL,
      task_ids TEXT NOT NULL,
      rerolls_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_personal_tasks_pair ON user_personal_tasks(user_id, date_str);`,

    `CREATE TABLE IF NOT EXISTS clan_event_progress (
      id TEXT PRIMARY KEY,
      clan_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      total_clan_points INTEGER NOT NULL DEFAULT 0,
      claimed_milestones TEXT NOT NULL DEFAULT '{}',
      member_contributions TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_clan_event_pair ON clan_event_progress(clan_id, event_id);`,

    // 11. Audit Logs Table
    `CREATE TABLE IF NOT EXISTS audit_logs (
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
    );`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);`,

    // 12. Feedback & Bug Report Table
    `CREATE TABLE IF NOT EXISTS feedbacks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_avatar_seed TEXT,
      type TEXT NOT NULL DEFAULT 'bug',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      images TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      reward_credits INTEGER,
      rewarded_at TEXT,
      rewarded_by_admin_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_feedbacks_user ON feedbacks(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status);`,
    `CREATE INDEX IF NOT EXISTS idx_feedbacks_created ON feedbacks(created_at);`,

    // 13. Experience & Level System Config Table
    `CREATE TABLE IF NOT EXISTS experience_config (
      id TEXT PRIMARY KEY,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      global_multiplier REAL NOT NULL DEFAULT 1.0,
      max_level INTEGER NOT NULL DEFAULT 20,
      action_rules TEXT NOT NULL,
      level_milestones TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,

    // 14. System One-Time Migrations Registry Table
    `CREATE TABLE IF NOT EXISTS system_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      details TEXT
    );`,

    // 15. Lootbox Open Operations (Idempotency & Audit Table)
    `CREATE TABLE IF NOT EXISTS lootbox_open_operations (
      operation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      inventory_entry_id TEXT NOT NULL,
      lootbox_item_id TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      snapshot_version INTEGER NOT NULL,
      rewards_json TEXT NOT NULL,
      response_payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, operation_id)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_lootbox_ops_user_created ON lootbox_open_operations(user_id, created_at DESC);`,

    // 16. Deleted Custom Lootbox Replacements (Admin-Assigned Forwarding Table)
    `CREATE TABLE IF NOT EXISTS deleted_item_replacements (
      deleted_item_id TEXT PRIMARY KEY,
      deleted_item_name TEXT NOT NULL,
      replacement_type TEXT NOT NULL,
      replacement_item_id TEXT,
      replacement_qty INTEGER NOT NULL,
      deleted_by_admin_id TEXT,
      deleted_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );`,

    // 17. Lootbox Media Assets Metadata & Resource References
    `CREATE TABLE IF NOT EXISTS lootbox_media_assets (
      id TEXT PRIMARY KEY,
      asset_type TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      auto_detected_category TEXT NOT NULL,
      storage_type TEXT NOT NULL DEFAULT 'url',
      source_url TEXT NOT NULL,
      checksum_sha256 TEXT,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_lootbox_media_type_cat ON lootbox_media_assets(asset_type, category);`,

    // 18. Lootbox Default Sounds by Category
    `CREATE TABLE IF NOT EXISTS lootbox_sound_defaults (
      category TEXT PRIMARY KEY,
      sound_asset_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,

    // 19. Mail Templates Table
    `CREATE TABLE IF NOT EXISTS mail_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_mail_templates_name ON mail_templates(name);`,

    // 20. Mail History Journal Table
    `CREATE TABLE IF NOT EXISTS mail_history (
      id TEXT PRIMARY KEY,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT NOT NULL,
      template_id TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      sent_by_admin_id TEXT NOT NULL,
      sent_by_admin_email TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      transport TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS idx_mail_history_sent_at ON mail_history(sent_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_mail_history_recipient ON mail_history(recipient_email);`,

    // 21. Mail Admin Rate Limits Table
    `CREATE TABLE IF NOT EXISTS mail_admin_rate_limits (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      sent_at INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_mail_admin_rl ON mail_admin_rate_limits(admin_id, sent_at);`,

    // 22. Mail Configuration Table (Active transport: 'resend_api' | 'smtp')
    `CREATE TABLE IF NOT EXISTS mail_config (
      id TEXT PRIMARY KEY,
      transport TEXT NOT NULL DEFAULT 'smtp',
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );`,

    // 23. Loyalty Program Configs ('registration' | 'email_verification')
    `CREATE TABLE IF NOT EXISTS loyalty_configs (
      bonus_type TEXT PRIMARY KEY,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      items TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );`,

    // 24. Loyalty Bonus Claims Ledger
    `CREATE TABLE IF NOT EXISTS loyalty_bonus_claims (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bonus_type TEXT NOT NULL,
      credits_granted INTEGER NOT NULL DEFAULT 0,
      items_granted TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'granted',
      claimed_at TEXT NOT NULL
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_claims_user_type ON loyalty_bonus_claims(user_id, bonus_type);`,
    `CREATE INDEX IF NOT EXISTS idx_loyalty_claims_claimed_at ON loyalty_bonus_claims(claimed_at DESC);`,

    // 25. Unified Economy Transactions Ledger (Idempotency & Immutable Audit)
    `CREATE TABLE IF NOT EXISTS economy_transactions (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      code_text_snapshot TEXT,
      credits_delta INTEGER NOT NULL DEFAULT 0,
      items_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_economy_tx_user ON economy_transactions(user_id, created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_economy_tx_source ON economy_transactions(source_type, source_id);`,

    // 26. Regular Promo Codes Table
    `CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      code_normalized TEXT NOT NULL,
      code_display TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      schedule_type TEXT NOT NULL DEFAULT 'indefinite',
      starts_at TEXT,
      ends_at TEXT,
      annual_start_mmdd TEXT,
      annual_end_mmdd TEXT,
      current_cycle INTEGER NOT NULL DEFAULT 1,
      limit_type TEXT NOT NULL DEFAULT 'unlimited',
      max_activations INTEGER,
      total_activations INTEGER NOT NULL DEFAULT 0,
      cycle_activations INTEGER NOT NULL DEFAULT 0,
      rewards_json TEXT NOT NULL DEFAULT '[]',
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS idx_promo_codes_norm ON promo_codes(code_normalized, is_deleted);`,

    // 27. Partners Table (Partner Referral Program)
    `CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      display_name_snapshot TEXT NOT NULL,
      email_snapshot TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      referral_code_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS idx_partners_user ON partners(user_id, is_deleted);`,

    // 28. Partner Referral Codes Table (Strictly 1 Referral Code per Partner)
    `CREATE TABLE IF NOT EXISTS partner_referral_codes (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      partner_user_id TEXT NOT NULL,
      code_normalized TEXT NOT NULL,
      code_display TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      eligibility_json TEXT NOT NULL DEFAULT '{}',
      player_rewards_json TEXT NOT NULL DEFAULT '[]',
      partner_rewards_json TEXT NOT NULL DEFAULT '[]',
      partner_reward_mode TEXT NOT NULL DEFAULT 'on_activation',
      qualification_criteria_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS idx_partner_ref_codes_norm ON partner_referral_codes(code_normalized, is_deleted);`,
    `CREATE INDEX IF NOT EXISTS idx_partner_ref_codes_partner ON partner_referral_codes(partner_id, is_deleted);`,

    // 29. Permanent One-Time User Partner Bindings Table
    `CREATE TABLE IF NOT EXISTS user_partner_bindings (
      user_id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      partner_user_id TEXT NOT NULL,
      referral_code_id TEXT NOT NULL,
      code_text_snapshot TEXT NOT NULL,
      activation_id TEXT NOT NULL,
      bound_via TEXT NOT NULL DEFAULT 'profile',
      bound_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_user_partner_bindings_partner ON user_partner_bindings(partner_id);`,
    `CREATE INDEX IF NOT EXISTS idx_user_partner_bindings_code ON user_partner_bindings(referral_code_id);`,

    // 30. Promo & Partner Code Activations Table (Immutable Snapshots & Progress)
    `CREATE TABLE IF NOT EXISTS promo_activations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_display_name_snapshot TEXT NOT NULL DEFAULT '',
      user_email_snapshot TEXT NOT NULL DEFAULT '',
      user_deleted INTEGER NOT NULL DEFAULT 0,
      code_kind TEXT NOT NULL,
      promo_code_id TEXT NOT NULL,
      partner_id TEXT,
      partner_user_id TEXT,
      cycle_key TEXT NOT NULL,
      code_text_snapshot TEXT NOT NULL,
      bound_via TEXT NOT NULL DEFAULT 'profile',
      snapshot_json TEXT NOT NULL,
      baseline_games_played INTEGER NOT NULL DEFAULT 0,
      baseline_active_seconds INTEGER NOT NULL DEFAULT 0,
      baseline_level INTEGER NOT NULL DEFAULT 1,
      current_games_since INTEGER NOT NULL DEFAULT 0,
      current_active_seconds_since INTEGER NOT NULL DEFAULT 0,
      current_level INTEGER NOT NULL DEFAULT 1,
      all_player_rewards_granted INTEGER NOT NULL DEFAULT 0,
      partner_reward_status TEXT NOT NULL DEFAULT 'not_applicable',
      partner_reward_granted_at TEXT,
      qualification_status TEXT NOT NULL DEFAULT 'not_applicable',
      qualified_at TEXT,
      active_days_json TEXT NOT NULL DEFAULT '[]',
      activated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_act_unique_cycle ON promo_activations(user_id, code_kind, promo_code_id, cycle_key);`,
    `CREATE INDEX IF NOT EXISTS idx_promo_act_user ON promo_activations(user_id, activated_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_promo_act_code ON promo_activations(code_kind, promo_code_id);`,
    `CREATE INDEX IF NOT EXISTS idx_promo_act_partner ON promo_activations(partner_id, activated_at DESC);`,

    // 31. Individual Reward Obligations Table (Immediate & Deferred Player/Partner Rewards)
    `CREATE TABLE IF NOT EXISTS promo_reward_obligations (
      id TEXT PRIMARY KEY,
      activation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      recipient_type TEXT NOT NULL,
      recipient_user_id TEXT NOT NULL,
      reward_index INTEGER NOT NULL,
      reward_snapshot_json TEXT NOT NULL,
      conditions_snapshot_json TEXT NOT NULL DEFAULT '[]',
      condition_logic TEXT NOT NULL DEFAULT 'immediate',
      status TEXT NOT NULL DEFAULT 'pending',
      idempotency_key TEXT NOT NULL UNIQUE,
      granted_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_promo_obligations_act ON promo_reward_obligations(activation_id);`,
    `CREATE INDEX IF NOT EXISTS idx_promo_obligations_recipient ON promo_reward_obligations(recipient_user_id, status);`,
    `CREATE INDEX IF NOT EXISTS idx_promo_obligations_player ON promo_reward_obligations(user_id, status);`,

    // 32. User Daily Activity Table (Calendar Days in Project Timezone for Partner Qualification)
    `CREATE TABLE IF NOT EXISTS user_daily_activity (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date_msk TEXT NOT NULL,
      has_login INTEGER NOT NULL DEFAULT 0,
      completed_matches INTEGER NOT NULL DEFAULT 0,
      first_activity_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_daily_activity_pair ON user_daily_activity(user_id, date_msk);`,

    // 33. Project Settings Table (Unified Project Timezone & Global System Settings)
    `CREATE TABLE IF NOT EXISTS project_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );`,

    // 34. Gift Campaigns («Акции») Table
    `CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      schedule_timezone TEXT NOT NULL DEFAULT 'UTC',
      rewards_json TEXT NOT NULL DEFAULT '[]',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(is_deleted, is_enabled, starts_at, ends_at);`,

    // 35. Gift Campaign Claims Ledger (Strictly 1 Grant per (campaign_id, user_id))
    `CREATE TABLE IF NOT EXISTS campaign_claims (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      campaign_title_snapshot TEXT NOT NULL DEFAULT '',
      campaign_description_snapshot TEXT NOT NULL DEFAULT '',
      user_id TEXT NOT NULL,
      user_display_name TEXT NOT NULL DEFAULT '',
      user_email TEXT NOT NULL DEFAULT '',
      trigger_source TEXT NOT NULL DEFAULT 'login',
      status TEXT NOT NULL DEFAULT 'granted',
      rewards_granted_json TEXT NOT NULL DEFAULT '[]',
      credits_granted INTEGER NOT NULL DEFAULT 0,
      entitled_at TEXT NOT NULL,
      claimed_at TEXT,
      notified_at TEXT,
      UNIQUE(campaign_id, user_id)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_campaign_claims_campaign ON campaign_claims(campaign_id, status, claimed_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_campaign_claims_user ON campaign_claims(user_id, status, notified_at);`
  ];

  try {
    await db.batch(schemaStatements);
  } catch {
    for (const stmt of schemaStatements) {
      try {
        await db.execute(stmt);
      } catch (e) {
        console.error('[LibSQL] Error executing statement:', stmt, e);
      }
    }
  }

  // Safe incremental migration: add transport column to mail_history if not present
  try {
    await db.execute('ALTER TABLE mail_history ADD COLUMN transport TEXT;');
  } catch {
    // Column already exists or table freshly created
  }

  // Safe incremental migration: add email verification columns to users if not present
  try {
    await db.execute('ALTER TABLE users ADD COLUMN is_email_verified INTEGER NOT NULL DEFAULT 0;');
  } catch {}
  try {
    await db.execute('ALTER TABLE users ADD COLUMN email_verified_at TEXT;');
  } catch {}

  // Safe incremental migration: add last_daily_bonus_claim_date_tz to users to prevent duplicate claims across timezone changes
  try {
    await db.execute('ALTER TABLE users ADD COLUMN last_daily_bonus_claim_date_tz TEXT;');
  } catch {}

  // Safe incremental migration: add schedule_timezone to promo_codes and backfill existing schedules to 'Europe/Moscow'
  try {
    await db.execute('ALTER TABLE promo_codes ADD COLUMN schedule_timezone TEXT;');
  } catch {}
  try {
    await db.execute({
      sql: `UPDATE promo_codes SET schedule_timezone = 'Europe/Moscow' WHERE schedule_timezone IS NULL OR schedule_timezone = ''`,
      args: []
    });
  } catch {}

  // Initialize or load project_timezone in project_settings:
  // - For existing project databases (with existing users, items, promo codes, or legacy data): preserve 'Europe/Moscow' until admin explicitly changes it.
  // - For brand-new empty installations: default to 'UTC'.
  try {
    const existingTzRes = await db.execute({
      sql: `SELECT value FROM project_settings WHERE key = 'project_timezone' LIMIT 1`,
      args: []
    });
    if (existingTzRes.rows.length === 0) {
      const checkExistingDataRes = await db.execute({
        sql: `SELECT
                (SELECT COUNT(*) FROM users) +
                (SELECT COUNT(*) FROM shop_items) +
                (SELECT COUNT(*) FROM promo_codes) +
                (SELECT COUNT(*) FROM daily_bonus_claims) AS total_existing`,
        args: []
      });
      const totalExisting = Number(checkExistingDataRes.rows[0]?.total_existing || 0);
      const hasLegacyUsersJson = fs.existsSync(path.resolve(process.cwd(), 'data', 'users.json'));
      const isExistingProject = totalExisting > 0 || hasLegacyUsersJson;
      const initialTimezone = isExistingProject ? 'Europe/Moscow' : 'UTC';
      const initialBy = isExistingProject ? 'system_migration' : 'system_default';
      const nowIso = new Date().toISOString();

      await db.execute({
        sql: `INSERT OR IGNORE INTO project_settings (key, value, updated_at, updated_by) VALUES ('project_timezone', ?, ?, ?)`,
        args: [initialTimezone, nowIso, initialBy]
      });
    }
  } catch (err) {
    console.error('[LibSQL] Error initializing project_timezone setting:', err);
  }

  // Backfill email verification only for Google-authenticated accounts (no password hash)
  try {
    const nowIso = new Date().toISOString();
    await db.execute({
      sql: `UPDATE users SET is_email_verified = 1, email_verified_at = COALESCE(email_verified_at, ?) 
            WHERE password_hash IS NULL AND (is_email_verified IS NULL OR is_email_verified = 0)`,
      args: [nowIso]
    });
  } catch {}

  // Ensure default lobby messages
  try {
    const chatCountRes = await db.execute('SELECT COUNT(*) as count FROM lobby_chat');
    const chatCount = Number(chatCountRes.rows[0]?.count || 0);
    if (chatCount === 0) {
      await db.batch([
        {
          sql: 'INSERT INTO lobby_chat (id, sender_id, sender_name, text, created_at) VALUES (?, ?, ?, ?, ?)',
          args: ['msg_init_1', 'sys', 'Виктор "Шрам"', 'Приветствую в Городе. Сегодня ночью будет жарко.', Date.now() - 1000 * 60 * 5]
        },
        {
          sql: 'INSERT INTO lobby_chat (id, sender_id, sender_name, text, created_at) VALUES (?, ?, ?, ?, ?)',
          args: ['msg_init_2', 'sys', 'Елена "Лиса"', 'В комнатах идет набор игроков, присоединяйтесь!', Date.now() - 1000 * 60 * 2]
        }
      ]);
    }
  } catch {}

  // Ensure default loyalty configs (both initially disabled and empty)
  try {
    const nowIso = new Date().toISOString();
    await db.execute({
      sql: `INSERT OR IGNORE INTO loyalty_configs (bonus_type, is_enabled, items, updated_at, updated_by)
            VALUES ('registration', 0, '[]', ?, 'system')`,
      args: [nowIso]
    });
    await db.execute({
      sql: `INSERT OR IGNORE INTO loyalty_configs (bonus_type, is_enabled, items, updated_at, updated_by)
            VALUES ('email_verification', 0, '[]', ?, 'system')`,
      args: [nowIso]
    });
  } catch (err) {
    console.error('[LibSQL] Error seeding loyalty configs:', err);
  }
}

/**
 * Automatically migrates existing legacy JSON files into LibSQL tables if newly initialized.
 */
async function migrateJsonDataIfPresent(db: Client) {
  const DATA_DIR = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(DATA_DIR)) return;

  try {
    // Check if users already seeded
    const userCountRes = await db.execute('SELECT COUNT(*) as count FROM users');
    const userCount = Number(userCountRes.rows[0]?.count || 0);

    if (userCount === 0) {
      const usersFile = path.join(DATA_DIR, 'users.json');
      if (fs.existsSync(usersFile)) {
        try {
          const raw = fs.readFileSync(usersFile, 'utf-8');
          const users: any[] = JSON.parse(raw);
          const userStatements: Array<{ sql: string; args: any[] }> = [];

          for (const u of users) {
            const now = u.createdAt || new Date().toISOString();
            userStatements.push({
              sql: `
                INSERT OR REPLACE INTO users (
                  id, email, display_name, avatar_seed, password_hash, session_token,
                  credits, xp, level, role, is_admin, is_banned,
                  clan_id, clan_name, clan_tag, clan_role,
                  equipped_card_back, equipped_title,
                  daily_bonus_streak, last_daily_bonus_claim,
                  stats, inventory, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              args: sanitizeArgs([
                u.id,
                u.email.toLowerCase(),
                u.displayName,
                u.avatarSeed || u.displayName,
                u.passwordHash || null,
                u.sessionToken || null,
                typeof u.credits === 'number' ? u.credits : 250,
                typeof u.xp === 'number' ? u.xp : 0,
                typeof u.level === 'number' ? u.level : 1,
                u.role || 'user',
                u.isAdmin ? 1 : 0,
                u.isBanned ? 1 : 0,
                u.clanId || null,
                u.clanName || null,
                u.clanTag || null,
                u.clanRole || null,
                u.equippedCosmetics?.cardBack || null,
                u.equippedCosmetics?.title || null,
                u.dailyBonusStreak || 0,
                u.lastDailyBonusClaim || null,
                JSON.stringify(u.stats || { gamesPlayed: 0, gamesWon: 0, rating: 1200, mafiaWins: 0, civilianWins: 0 }),
                JSON.stringify(u.inventory || []),
                now,
                now
              ])
            });

            if (Array.isArray(u.matchHistory)) {
              for (const m of u.matchHistory) {
                userStatements.push({
                  sql: `
                    INSERT OR REPLACE INTO match_history (
                      id, user_id, room_code, role, role_name, team, won, survived,
                      survival_seconds, rounds_survived, rating_change, credits_earned,
                      xp_earned, xp_breakdown, played_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `,
                  args: sanitizeArgs([
                    m.id || `m_${Math.random().toString(36).substring(2)}`,
                    u.id,
                    m.roomCode || null,
                    m.role || 'citizen',
                    m.roleName || 'Мирный житель',
                    m.team || 'civilians',
                    m.won ? 1 : 0,
                    m.survived ? 1 : 0,
                    m.survivalSeconds || 0,
                    m.roundsSurvived || 1,
                    m.ratingChange || 0,
                    m.creditsEarned || 0,
                    m.xpEarned || 0,
                    m.xpBreakdown ? JSON.stringify(m.xpBreakdown) : null,
                    m.playedAt || now
                  ])
                });
              }
            }

            if (Array.isArray(u.friends)) {
              for (const f of u.friends) {
                userStatements.push({
                  sql: `
                    INSERT OR REPLACE INTO user_friends (
                      id, user_id, friend_id, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                  `,
                  args: sanitizeArgs([
                    `${u.id}_${f.friendId}`,
                    u.id,
                    f.friendId,
                    f.status || 'accepted',
                    f.createdAt || now,
                    f.createdAt || now
                  ])
                });
              }
            }
          }

          if (userStatements.length > 0) {
            // Run in chunks to prevent large payload limits
            for (let i = 0; i < userStatements.length; i += 50) {
              await db.batch(userStatements.slice(i, i + 50));
            }
            console.log(`[LibSQL] Successfully migrated ${users.length} users from legacy JSON to LibSQL.`);
          }
        } catch (e) {
          console.error('[LibSQL] Error migrating users.json:', e);
        }
      }
    }

    // Clans migration
    const clanCountRes = await db.execute('SELECT COUNT(*) as count FROM clans');
    const clanCount = Number(clanCountRes.rows[0]?.count || 0);

    if (clanCount === 0) {
      const clansFile = path.join(DATA_DIR, 'clans.json');
      if (fs.existsSync(clansFile)) {
        try {
          const raw = fs.readFileSync(clansFile, 'utf-8');
          const clans: any[] = JSON.parse(raw);
          const clanStatements: Array<{ sql: string; args: any[] }> = [];

          for (const c of clans) {
            const now = c.createdAt || new Date().toISOString();
            clanStatements.push({
              sql: `
                INSERT OR REPLACE INTO clans (
                  id, name, tag, description, avatar_url, rating, leader_id, leader_name, members, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              args: sanitizeArgs([
                c.id,
                c.name,
                c.tag,
                c.description || '',
                c.avatarUrl || null,
                c.rating || 1000,
                c.leaderId || '',
                c.leaderName || '',
                JSON.stringify(c.members || []),
                now,
                now
              ])
            });
          }

          if (clanStatements.length > 0) {
            await db.batch(clanStatements);
            console.log(`[LibSQL] Successfully migrated ${clans.length} clans to LibSQL.`);
          }
        } catch (e) {
          console.error('[LibSQL] Error migrating clans.json:', e);
        }
      }
    }

    // Reports migration
    const reportCountRes = await db.execute('SELECT COUNT(*) as count FROM reports');
    const reportCount = Number(reportCountRes.rows[0]?.count || 0);

    if (reportCount === 0) {
      const reportsFile = path.join(DATA_DIR, 'reports.json');
      if (fs.existsSync(reportsFile)) {
        try {
          const raw = fs.readFileSync(reportsFile, 'utf-8');
          const reports: any[] = JSON.parse(raw);
          const reportStatements: Array<{ sql: string; args: any[] }> = [];

          for (const r of reports) {
            reportStatements.push({
              sql: `
                INSERT OR REPLACE INTO reports (
                  id, reporter_id, reporter_name, target_player_id, target_player_name, target_player_email,
                  room_code, reason, reason_category, details, status, resolution_note, action_taken, created_at, resolved_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              args: sanitizeArgs([
                r.id,
                r.reporterId,
                r.reporterName,
                r.targetPlayerId,
                r.targetPlayerName,
                r.targetPlayerEmail || null,
                r.roomCode,
                r.reason,
                r.reasonCategory || 'toxicity',
                r.details || '',
                r.status || 'pending',
                r.resolutionNote || null,
                r.actionTaken || null,
                r.createdAt || new Date().toISOString(),
                r.resolvedAt || null
              ])
            });
          }

          if (reportStatements.length > 0) {
            await db.batch(reportStatements);
            console.log(`[LibSQL] Successfully migrated ${reports.length} reports to LibSQL.`);
          }
        } catch (e) {
          console.error('[LibSQL] Error migrating reports.json:', e);
        }
      }
    }
  } catch (err) {
    console.error('[LibSQL] Error during JSON migration check:', err);
  }
}
