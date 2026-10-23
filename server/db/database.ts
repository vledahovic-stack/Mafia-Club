import path from 'path';
import fs from 'fs';
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

export function initDatabase(): Client {
  if (dbClient) return dbClient;

  const url = process.env.TURSO_DATABASE_URL || `file:${SQLITE_DB_PATH}`;
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

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
  if (initPromise) {
    await initPromise;
  }
}

const DEFAULT_ADMIN_PASSWORD_HASH = '$2b$10$nUsBtb9WUJRFqh8Ds8W4OOGPg2oJw0l2AT6CtDXRtMKEBpIzTNjEW'; // bcrypt hash for '123456'

async function setupDatabase(db: Client) {
  // PRAGMAs (for local SQLite/LibSQL compatibility)
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
            password_hash = ?,
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
            stats, inventory, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          'usr_7nmq32ex',
          adminEmail,
          'Дон Влад',
          'Дон Влад',
          DEFAULT_ADMIN_PASSWORD_HASH,
          'tok_admin_' + Date.now(),
          50000,
          15000,
          25,
          'admin',
          1,
          0,
          null, null, null, null,
          null, null,
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
      stats TEXT NOT NULL DEFAULT '{}',
      inventory TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
    `CREATE INDEX IF NOT EXISTS idx_users_session_token ON users(session_token);`,

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
    );`
  ];

  for (const stmt of schemaStatements) {
    try {
      await db.execute(stmt);
    } catch (e) {
      console.error('[LibSQL] Error executing statement:', stmt, e);
    }
  }

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
