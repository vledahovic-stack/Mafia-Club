import bcrypt from 'bcryptjs';
import { ItemDefinition, UserInventoryItem, DEFAULT_NICKNAME_CHANGE_COST, DEFAULT_AVATAR_CHANGE_COST, NICKNAME_CHANGE_CERTIFICATE_ID, AVATAR_CHANGE_CERTIFICATE_ID, ROLE_SELECT_CARD_ID } from '../data/items';
import { shopDb, itemsDb } from './shop';
import { dailyBonusDb } from './dailyBonus';
import { getLevelFromXp } from '../game/experience';
import { experienceDb } from './experience';
import { getDatabase, sanitizeArgs } from './database';
import { Client } from '@libsql/client';
import { sendPasswordResetEmail } from '../utils/mailer';
import { rewardMutex } from '../utils/asyncLock';

export const DEFAULT_ADMIN_EMAIL = 'vledahovic@gmail.com';
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
export const DEFAULT_ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '123456').trim();

export function getAdminEmails(): string[] {
  const envList = [
    process.env.ADMIN_EMAIL,
    process.env.ADMIN_EMAILS
  ]
    .filter(Boolean)
    .flatMap(s => (s as string).split(','))
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const defaults = [DEFAULT_ADMIN_EMAIL];
  return Array.from(new Set([...defaults, ...envList]));
}

export function isEmailAdmin(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (clean === DEFAULT_ADMIN_EMAIL) return true;
  return getAdminEmails().includes(clean);
}

export interface MatchRecord {
  id: string;
  playedAt: string;
  role: string;
  roleName: string;
  team: 'civilians' | 'mafia' | 'maniac';
  won: boolean;
  survived: boolean;
  survivalSeconds: number;
  roundsSurvived: number;
  ratingChange: number;
  creditsEarned: number;
  xpEarned?: number;
  xpBreakdown?: Array<{ reason: string; xp: number }>;
}

export interface FriendInfo {
  id: string;
  displayName: string;
  email: string;
  avatarSeed: string;
  clanTag?: string | null;
  clanName?: string | null;
  rating: number;
  gamesPlayed: number;
  gamesWon: number;
  status: 'accepted' | 'pending_sent' | 'pending_received';
  title?: string;
  addedAt: string;
  onlineStatus: 'online' | 'in_game' | 'in_lobby' | 'offline';
  currentRoomCode?: string | null;
  currentRoomName?: string | null;
}

export interface RoomInvite {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar: string;
  toUserId: string;
  roomCode: string;
  roomName: string;
  isPrivate: boolean;
  createdAt: string;
  expiresAt: number;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarSeed: string;
  credits: number;
  xp: number;
  level: number;
  role: 'admin' | 'moderator' | 'user';
  isAdmin: boolean;
  isBanned: boolean;
  clanId?: string | null;
  clanName?: string | null;
  clanTag?: string | null;
  clanRole?: 'leader' | 'member' | null;
  equippedCosmetics?: {
    cardBack?: string;
    title?: string;
    uiSkin?: string;
  };
  dailyBonusStreak?: number;
  lastDailyBonusClaim?: string;
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    rating: number;
    mafiaWins: number;
    civilianWins: number;
    totalSurvivalSeconds?: number;
    averageSurvivalSeconds?: number;
    roleStats?: Record<string, {
      role: string;
      roleName: string;
      games: number;
      wins: number;
      survivedCount: number;
      totalSurvivalSeconds: number;
    }>;
  };
  inventory: UserInventoryItem[];
  createdAt: string;
}

export interface UserRecord extends UserProfile {
  passwordHash?: string;
  sessionToken?: string;
}

export class UserDatabase {
  private get db(): Client {
    return getDatabase();
  }

  constructor() {
    this.ensureAdminSeed().catch(() => {});
  }

  private rowToUser(row: any): UserRecord {
    let stats: any = {};
    let inventory: any[] = [];
    try {
      stats = typeof row.stats === 'string' ? JSON.parse(row.stats) : row.stats || {};
    } catch {
      stats = {};
    }
    try {
      inventory = typeof row.inventory === 'string' ? JSON.parse(row.inventory) : row.inventory || [];
    } catch {
      inventory = [];
    }

    const isTargetAdmin = isEmailAdmin(row.email);
    if (isTargetAdmin && (!row.is_admin || row.role !== 'admin')) {
      this.db.execute({
        sql: "UPDATE users SET is_admin = 1, role = 'admin' WHERE id = ?",
        args: [row.id]
      }).catch(() => {});
    }

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarSeed: row.avatar_seed || row.display_name,
      passwordHash: row.password_hash || undefined,
      sessionToken: row.session_token || undefined,
      credits: Number(row.credits ?? 250),
      xp: Number(row.xp ?? 0),
      level: Number(row.level ?? 1),
      role: isTargetAdmin ? 'admin' : (row.role || 'user'),
      isAdmin: isTargetAdmin || Boolean(row.is_admin || row.role === 'admin'),
      isBanned: Boolean(row.is_banned),
      clanId: row.clan_id || null,
      clanName: row.clan_name || null,
      clanTag: row.clan_tag || null,
      clanRole: row.clan_role || null,
      equippedCosmetics: {
        cardBack: row.equipped_card_back || undefined,
        title: row.equipped_title || undefined
      },
      dailyBonusStreak: Number(row.daily_bonus_streak ?? 0),
      lastDailyBonusClaim: row.last_daily_bonus_claim || undefined,
      stats,
      inventory,
      createdAt: row.created_at
    };
  }

  private async saveUserToDb(u: UserRecord): Promise<void> {
    const isTargetAdmin = isEmailAdmin(u.email);
    const isAdminVal = isTargetAdmin || u.isAdmin || u.role === 'admin' ? 1 : 0;
    const roleVal = isTargetAdmin ? 'admin' : (u.role || 'user');

    await this.db.execute({
      sql: `
        UPDATE users SET
          email = ?,
          display_name = ?,
          avatar_seed = ?,
          password_hash = ?,
          session_token = ?,
          credits = ?,
          xp = ?,
          level = ?,
          role = ?,
          is_admin = ?,
          is_banned = ?,
          clan_id = ?,
          clan_name = ?,
          clan_tag = ?,
          clan_role = ?,
          equipped_card_back = ?,
          equipped_title = ?,
          daily_bonus_streak = ?,
          last_daily_bonus_claim = ?,
          stats = ?,
          inventory = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: sanitizeArgs([
        u.email.toLowerCase(),
        u.displayName,
        u.avatarSeed,
        u.passwordHash || null,
        u.sessionToken || null,
        u.credits,
        u.xp,
        u.level,
        roleVal,
        isAdminVal,
        u.isBanned ? 1 : 0,
        u.clanId || null,
        u.clanName || null,
        u.clanTag || null,
        u.clanRole || null,
        u.equippedCosmetics?.cardBack || null,
        u.equippedCosmetics?.title || null,
        u.dailyBonusStreak || 0,
        u.lastDailyBonusClaim || null,
        JSON.stringify(u.stats || {}),
        JSON.stringify(u.inventory || []),
        new Date().toISOString(),
        u.id
      ])
    });
  }

  public async ensureAdminSeed(): Promise<void> {
    try {
      const defaultPasswordHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
      for (const email of getAdminEmails()) {
        const cleanEmail = email.trim().toLowerCase();
        const checkRes = await this.db.execute({
          sql: 'SELECT id, email, password_hash, role, is_admin FROM users WHERE LOWER(email) = LOWER(?)',
          args: [cleanEmail]
        });
        const existing = checkRes.rows[0];

        if (existing) {
          await this.db.execute({
            sql: `
              UPDATE users SET
                role = 'admin',
                is_admin = 1,
                is_banned = 0,
                password_hash = ?,
                updated_at = ?
              WHERE id = ?
            `,
            args: [defaultPasswordHash, new Date().toISOString(), existing.id]
          });
        } else {
          const now = new Date().toISOString();
          const adminId = 'usr_admin_' + Math.random().toString(36).substring(2, 8);
          const displayName = cleanEmail === DEFAULT_ADMIN_EMAIL ? 'Дон Влад' : 'Администратор';
          const sessionToken = 'tk_' + Math.random().toString(36).substring(2) + Date.now().toString(36);

          await this.db.execute({
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
            args: sanitizeArgs([
              adminId,
              cleanEmail,
              displayName,
              displayName,
              defaultPasswordHash,
              sessionToken,
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
              JSON.stringify([
                {
                  id: 'inv_admin_cert',
                  itemId: NICKNAME_CHANGE_CERTIFICATE_ID,
                  quantity: 10,
                  acquiredAt: now
                }
              ]),
              now,
              now
            ])
          });
        }
      }
    } catch (err) {
      console.error('[AdminSeed] Failed to ensure admin seed:', err);
    }
  }

  public async register(email: string, password: string, displayName?: string): Promise<UserRecord> {
    const cleanEmail = email.trim().toLowerCase();
    const isTargetAdmin = isEmailAdmin(cleanEmail);
    const existingRes = await this.db.execute({
      sql: 'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
      args: [cleanEmail]
    });
    const existing = existingRes.rows[0];

    if (existing) {
      if (isTargetAdmin) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const sessionToken = 'tk_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        const now = new Date().toISOString();

        await this.db.execute({
          sql: `
            UPDATE users SET
              password_hash = ?,
              session_token = ?,
              role = 'admin',
              is_admin = 1,
              is_banned = 0,
              display_name = COALESCE(NULLIF(?, ''), display_name),
              updated_at = ?
            WHERE LOWER(email) = LOWER(?)
          `,
          args: sanitizeArgs([passwordHash, sessionToken, displayName?.trim() || null, now, cleanEmail])
        });

        const updatedRes = await this.db.execute({
          sql: 'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
          args: [cleanEmail]
        });
        return this.rowToUser(updatedRes.rows[0]);
      }

      throw new Error('Пользователь с таким email уже зарегистрирован.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const id = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const cleanDisplayName = displayName?.trim() || cleanEmail.split('@')[0] || (isTargetAdmin ? 'Дон Влад' : 'Игрок');
    const now = new Date().toISOString();

    const user: UserRecord = {
      id,
      email: cleanEmail,
      displayName: cleanDisplayName,
      avatarSeed: cleanDisplayName,
      passwordHash,
      sessionToken: 'tk_' + Math.random().toString(36).substring(2) + Date.now().toString(36),
      createdAt: now,
      credits: isTargetAdmin ? 50000 : 250,
      xp: isTargetAdmin ? 10000 : 0,
      level: isTargetAdmin ? 25 : 1,
      inventory: [
        {
          id: 'inv_' + Math.random().toString(36).substring(2),
          itemId: NICKNAME_CHANGE_CERTIFICATE_ID,
          quantity: isTargetAdmin ? 10 : 1,
          acquiredAt: now
        }
      ],
      role: isTargetAdmin ? 'admin' : 'user',
      isAdmin: isTargetAdmin,
      isBanned: false,
      dailyBonusStreak: 0,
      stats: {
        gamesPlayed: 0,
        gamesWon: 0,
        rating: isTargetAdmin ? 1500 : 1200,
        mafiaWins: 0,
        civilianWins: 0
      }
    };

    await this.db.execute({
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
      args: sanitizeArgs([
        user.id,
        user.email,
        user.displayName,
        user.avatarSeed,
        user.passwordHash || null,
        user.sessionToken || null,
        user.credits,
        user.xp,
        user.level,
        user.role,
        user.isAdmin ? 1 : 0,
        0,
        null, null, null, null,
        null, null,
        0, null,
        JSON.stringify(user.stats),
        JSON.stringify(user.inventory),
        now,
        now
      ])
    });

    return user;
  }

  public async login(email: string, password: string): Promise<UserRecord> {
    const cleanEmail = email.trim().toLowerCase();
    const isTargetAdmin = isEmailAdmin(cleanEmail);

    let checkRes = await this.db.execute({
      sql: 'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
      args: [cleanEmail]
    });
    let row = checkRes.rows[0];

    if (!row && isTargetAdmin) {
      await this.ensureAdminSeed();
      checkRes = await this.db.execute({
        sql: 'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
        args: [cleanEmail]
      });
      row = checkRes.rows[0];
    }

    if (!row) {
      throw new Error('Пользователь с таким email не найден.');
    }

    const user = this.rowToUser(row);
    if (user.isBanned) {
      throw new Error('Ваш аккаунт заблокирован администрацией.');
    }

    const isMasterPassword = isTargetAdmin && password === DEFAULT_ADMIN_PASSWORD;

    if (!isMasterPassword) {
      if (!user.passwordHash) {
        throw new Error('Данный аккаунт зарегистрирован через Google. Войдите через Google или восстановите пароль.');
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        throw new Error('Неверный пароль.');
      }
    } else {
      const salt = await bcrypt.genSalt(10);
      user.passwordHash = await bcrypt.hash(password, salt);
    }

    if (isTargetAdmin) {
      user.role = 'admin';
      user.isAdmin = true;
    }

    user.sessionToken = 'tk_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    await this.saveUserToDb(user);

    return user;
  }

  public async requestPasswordResetCode(email: string): Promise<{ success: boolean; message: string; emailSent?: boolean; devCode?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const now = Date.now();

    // Clean up expired codes
    await this.db.execute({
      sql: 'DELETE FROM password_reset_codes WHERE expires_at < ?',
      args: [now]
    });

    const checkRes = await this.db.execute({
      sql: 'SELECT id, email, display_name FROM users WHERE LOWER(email) = LOWER(?)',
      args: [cleanEmail]
    });
    const userRow = checkRes.rows[0];

    // If user doesn't exist, return neutral response to prevent user enumeration
    if (!userRow) {
      return {
        success: true,
        message: 'Если указанный адрес зарегистрирован, 6-значный код восстановления отправлен.'
      };
    }

    // Rate-limit: Check if code was requested within the last 45 seconds
    const activeRes = await this.db.execute({
      sql: 'SELECT * FROM password_reset_codes WHERE LOWER(email) = LOWER(?) AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
      args: [cleanEmail, now]
    });
    const activeRow = activeRes.rows[0];
    if (activeRow) {
      const createdAtMs = new Date(activeRow.created_at as string).getTime();
      const elapsed = (now - createdAtMs) / 1000;
      if (elapsed < 45) {
        const waitSec = Math.ceil(45 - elapsed);
        throw new Error(`Повторный запрос кода возможен через ${waitSec} сек.`);
      }
    }

    // Invalidate prior codes for this user
    await this.db.execute({
      sql: 'DELETE FROM password_reset_codes WHERE LOWER(email) = LOWER(?)',
      args: [cleanEmail]
    });

    // Generate cryptographically random 6-digit numeric code
    const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(8);
    const codeHash = await bcrypt.hash(rawCode, salt);
    const codeId = 'prc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const expiresAt = now + 15 * 60 * 1000; // 15 minutes validity
    const isoNow = new Date(now).toISOString();

    await this.db.execute({
      sql: `
        INSERT INTO password_reset_codes (id, user_id, email, code_hash, attempts_left, expires_at, created_at)
        VALUES (?, ?, ?, ?, 5, ?, ?)
      `,
      args: [codeId, userRow.id, cleanEmail, codeHash, expiresAt, isoNow]
    });

    // Dispatch real email via mailer
    const mailResult = await sendPasswordResetEmail(cleanEmail, rawCode, (userRow.display_name as string) || undefined);

    let message = 'Код подтверждения для восстановления пароля отправлен на ваш email.';
    if (!mailResult.sent) {
      if (mailResult.reason === 'SMTP_NOT_CONFIGURED') {
        message = 'Код подтверждения сгенерирован (почтовый сервер SMTP не подключен в .env, код доступен для тестирования).';
      } else {
        message = 'Код сгенерирован, но возникла ошибка при отправке email на почтовый сервер. Проверьте настройки SMTP.';
      }
    }

    return {
      success: true,
      message,
      emailSent: mailResult.sent,
      devCode: mailResult.devCode
    };
  }

  public async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<UserRecord> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = (code || '').trim();
    const now = Date.now();

    if (!cleanCode) {
      throw new Error('Укажите 6-значный код подтверждения.');
    }
    if (newPassword.length < 6) {
      throw new Error('Новый пароль должен содержать не менее 6 символов.');
    }

    const checkRes = await this.db.execute({
      sql: 'SELECT * FROM password_reset_codes WHERE LOWER(email) = LOWER(?) AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
      args: [cleanEmail, now]
    });
    const codeRow = checkRes.rows[0];

    if (!codeRow) {
      throw new Error('Код подтверждения не найден или срок его действия истёк. Запросите новый код.');
    }

    const attemptsLeft = Number(codeRow.attempts_left ?? 5);
    if (attemptsLeft <= 0) {
      await this.db.execute({
        sql: 'DELETE FROM password_reset_codes WHERE id = ?',
        args: [codeRow.id]
      });
      throw new Error('Превышено количество попыток ввода. Запросите новый код.');
    }

    const isMatch = await bcrypt.compare(cleanCode, codeRow.code_hash as string);
    if (!isMatch) {
      const remaining = attemptsLeft - 1;
      if (remaining <= 0) {
        await this.db.execute({
          sql: 'DELETE FROM password_reset_codes WHERE id = ?',
          args: [codeRow.id]
        });
        throw new Error('Неверный код подтверждения. Попытки исчерпаны, запросите новый код.');
      } else {
        await this.db.execute({
          sql: 'UPDATE password_reset_codes SET attempts_left = ? WHERE id = ?',
          args: [remaining, codeRow.id]
        });
        throw new Error(`Неверный код подтверждения. Осталось попыток: ${remaining}.`);
      }
    }

    // Code is valid! Delete code and update password
    await this.db.execute({
      sql: 'DELETE FROM password_reset_codes WHERE LOWER(email) = LOWER(?)',
      args: [cleanEmail]
    });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    const sessionToken = 'tk_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const isoNow = new Date().toISOString();

    await this.db.execute({
      sql: `
        UPDATE users SET
          password_hash = ?,
          session_token = ?,
          role = CASE WHEN LOWER(email) = LOWER(?) THEN 'admin' ELSE role END,
          is_admin = CASE WHEN LOWER(email) = LOWER(?) THEN 1 ELSE is_admin END,
          is_banned = 0,
          updated_at = ?
        WHERE LOWER(email) = LOWER(?)
      `,
      args: sanitizeArgs([passwordHash, sessionToken, cleanEmail, cleanEmail, isoNow, cleanEmail])
    });

    const updatedRes = await this.db.execute({
      sql: 'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
      args: [cleanEmail]
    });
    return this.rowToUser(updatedRes.rows[0]);
  }

  public async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<UserRecord> {
    const userRowRes = await this.db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [userId]
    });
    const userRow = userRowRes.rows[0];
    if (!userRow) {
      throw new Error('Пользователь не найден.');
    }

    if (newPassword.length < 6) {
      throw new Error('Новый пароль должен содержать не менее 6 символов.');
    }

    if (userRow.password_hash) {
      const isMatch = await bcrypt.compare(currentPassword, userRow.password_hash as string);
      if (!isMatch) {
        throw new Error('Текущий пароль указан неверно.');
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    const sessionToken = 'tk_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const isoNow = new Date().toISOString();

    await this.db.execute({
      sql: 'UPDATE users SET password_hash = ?, session_token = ?, updated_at = ? WHERE id = ?',
      args: [passwordHash, sessionToken, isoNow, userId]
    });

    const updatedRes = await this.db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [userId]
    });
    return this.rowToUser(updatedRes.rows[0]);
  }

  public async resetPassword(email: string, newPassword: string, code?: string): Promise<UserRecord> {
    if (!code) {
      throw new Error('Для безопасного сброса пароля требуется 6-значный код подтверждения.');
    }
    return this.confirmPasswordReset(email, code, newPassword);
  }

  public async syncGoogleUser(googleUid: string, email: string, displayName: string): Promise<UserRecord> {
    const cleanEmail = email.trim().toLowerCase();
    const checkRes = await this.db.execute({
      sql: 'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
      args: [cleanEmail]
    });
    const row = checkRes.rows[0];

    if (row) {
      const user = this.rowToUser(row);
      if (user.isBanned) {
        throw new Error('Ваш аккаунт заблокирован администрацией.');
      }
      user.sessionToken = 'tk_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      if (displayName && user.displayName.startsWith('Player_')) {
        user.displayName = displayName;
      }
      await this.saveUserToDb(user);
      return user;
    }

    const id = googleUid || ('user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));
    const cleanDisplayName = displayName?.trim() || cleanEmail.split('@')[0] || 'Игрок';
    const isTargetAdmin = isEmailAdmin(cleanEmail);
    const now = new Date().toISOString();

    const user: UserRecord = {
      id,
      email: cleanEmail,
      displayName: cleanDisplayName,
      avatarSeed: cleanDisplayName,
      sessionToken: 'tk_' + Math.random().toString(36).substring(2) + Date.now().toString(36),
      createdAt: now,
      credits: 250,
      xp: 0,
      level: 1,
      inventory: [
        {
          id: 'inv_' + Math.random().toString(36).substring(2),
          itemId: NICKNAME_CHANGE_CERTIFICATE_ID,
          quantity: 1,
          acquiredAt: now
        }
      ],
      role: isTargetAdmin ? 'admin' : 'user',
      isAdmin: isTargetAdmin,
      isBanned: false,
      dailyBonusStreak: 0,
      stats: {
        gamesPlayed: 0,
        gamesWon: 0,
        rating: 1200,
        mafiaWins: 0,
        civilianWins: 0
      }
    };

    await this.db.execute({
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
      args: sanitizeArgs([
        user.id,
        user.email,
        user.displayName,
        user.avatarSeed,
        null,
        user.sessionToken || null,
        user.credits,
        user.xp,
        user.level,
        user.role,
        user.isAdmin ? 1 : 0,
        0,
        null, null, null, null,
        null, null,
        0, null,
        JSON.stringify(user.stats),
        JSON.stringify(user.inventory),
        now,
        now
      ])
    });

    return user;
  }

  public async changeDisplayName(userId: string, newDisplayName: string, useCertificate: boolean): Promise<{ 
    user: UserProfile; 
    certificateUsed: boolean; 
    costCredits: number 
  }> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    const clean = newDisplayName.trim();
    if (clean.length < 2 || clean.length > 30) {
      throw new Error('Имя должно содержать от 2 до 30 символов.');
    }
    if (clean === user.displayName) {
      throw new Error('Новое имя совпадает с текущим.');
    }

    const shopSettings = await shopDb.getSettings();
    const nicknameCost = typeof shopSettings.nicknameChangeCost === 'number' ? shopSettings.nicknameChangeCost : DEFAULT_NICKNAME_CHANGE_COST;

    let certificateUsed = false;
    let costCredits = 0;

    if (useCertificate) {
      const certIndex = user.inventory.findIndex(item => item.itemId === NICKNAME_CHANGE_CERTIFICATE_ID && item.quantity > 0);
      if (certIndex === -1) {
        throw new Error('В инвентаре отсутствует «Сертификат на смену никнейма».');
      }
      user.inventory[certIndex].quantity -= 1;
      if (user.inventory[certIndex].quantity <= 0) {
        user.inventory.splice(certIndex, 1);
      }
      certificateUsed = true;
    } else {
      if (user.credits < nicknameCost) {
        throw new Error(`Недостаточно кредитов. Требуется ${nicknameCost} кр (у вас ${user.credits} кр).`);
      }
      user.credits -= nicknameCost;
      costCredits = nicknameCost;
    }

    user.displayName = clean;
    await this.saveUserToDb(user as UserRecord);

    return { user, certificateUsed, costCredits };
  }

  public async changeAvatar(userId: string, newAvatarSeed: string, useCertificate: boolean): Promise<{ 
    user: UserProfile; 
    certificateUsed: boolean; 
    costCredits: number 
  }> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    const clean = newAvatarSeed.trim();
    if (!clean) {
      throw new Error('Укажите корректный аватар.');
    }

    const shopSettings = await shopDb.getSettings();
    const avatarCost = typeof shopSettings.avatarChangeCost === 'number' ? shopSettings.avatarChangeCost : DEFAULT_AVATAR_CHANGE_COST;

    let certificateUsed = false;
    let costCredits = 0;

    if (useCertificate) {
      const certIndex = user.inventory.findIndex(item => item.itemId === AVATAR_CHANGE_CERTIFICATE_ID && item.quantity > 0);
      if (certIndex === -1) {
        throw new Error('В инвентаре отсутствует «Сертификат на смену аватара».');
      }
      user.inventory[certIndex].quantity -= 1;
      if (user.inventory[certIndex].quantity <= 0) {
        user.inventory.splice(certIndex, 1);
      }
      certificateUsed = true;
    } else {
      if (user.credits < avatarCost) {
        throw new Error(`Недостаточно кредитов. Требуется ${avatarCost} кр (у вас ${user.credits} кр).`);
      }
      user.credits -= avatarCost;
      costCredits = avatarCost;
    }

    user.avatarSeed = clean;
    await this.saveUserToDb(user as UserRecord);

    return { user, certificateUsed, costCredits };
  }

  public async buyItem(userId: string, itemId: string): Promise<{ user: UserProfile; item: ItemDefinition; message: string }> {
    return rewardMutex.runExclusive(`user:${userId}`, async () => {
      const itemDef = await shopDb.getItemById(itemId);
      if (!itemDef) throw new Error('Предмет не найден в каталоге магазина.');
      if (itemDef.inShop === false) throw new Error('Этот предмет недоступен для покупки в магазине.');

      const settings = await shopDb.getSettings();
      if (!settings.isShopEnabled) {
        const checkAdminRes = await this.db.execute({
          sql: 'SELECT is_admin, role, email FROM users WHERE id = ?',
          args: [userId]
        });
        const uRow = checkAdminRes.rows[0];
        const isAdmin = Boolean(uRow?.is_admin || uRow?.role === 'admin' || (uRow?.email as string)?.toLowerCase() === 'vledahovic@gmail.com');
        if (!isAdmin) {
          throw new Error('Магазин временно закрыт на переучёт.');
        }
      }

      let effectivePrice = itemDef.cost;
      if (settings.globalDiscount > 0) {
        effectivePrice = Math.max(1, Math.round(effectivePrice * (1 - settings.globalDiscount / 100)));
      }

      const tx = await this.db.transaction('write');
      try {
        const userRes = await tx.execute({
          sql: 'SELECT id, credits, inventory FROM users WHERE id = ?',
          args: [userId]
        });
        const userRow = userRes.rows[0];
        if (!userRow) throw new Error('Пользователь не найден.');

        const currentCredits = Number(userRow.credits || 0);
        if (currentCredits < effectivePrice) {
          throw new Error(`Недостаточно кредитов. Требуется ${effectivePrice} кр, у вас ${currentCredits} кр.`);
        }

        let inventory: UserInventoryItem[] = [];
        try { inventory = JSON.parse(userRow.inventory as string) || []; } catch {}

        const existingIndex = inventory.findIndex(inv => inv.itemId === itemId);
        const now = new Date().toISOString();
        if (existingIndex !== -1) {
          inventory[existingIndex].quantity += 1;
        } else {
          inventory.push({
            id: 'inv_' + Math.random().toString(36).substring(2),
            itemId,
            quantity: 1,
            acquiredAt: now
          });
        }

        // Database-level conditional deduction: prevents negative balance even without mutex
        const updateRes = await tx.execute({
          sql: `
            UPDATE users SET
              credits = credits - ?,
              inventory = ?,
              updated_at = ?
            WHERE id = ? AND credits >= ?
          `,
          args: [effectivePrice, JSON.stringify(inventory), now, userId, effectivePrice]
        });

        if ((updateRes.rowsAffected ?? 0) === 0) {
          throw new Error('Недостаточно кредитов для покупки.');
        }

        await tx.commit();

        const updatedUser = await this.getUserById(userId);
        return {
          user: updatedUser!,
          item: itemDef,
          message: `Вы успешно приобрели «${itemDef.name}» за ${effectivePrice} кр.`
        };
      } catch (err) {
        if (!tx.closed) {
          try { await tx.rollback(); } catch {}
        }
        throw err;
      } finally {
        if (!tx.closed) tx.close();
      }
    });
  }

  public async pawnItem(userId: string, itemId: string): Promise<{ user: UserProfile; payout: number; message: string }> {
    return rewardMutex.runExclusive(`user:${userId}`, async () => {
      const itemDef = await itemsDb.getItemById(itemId);
      if (!itemDef) throw new Error('Неизвестный предмет.');
      const payout = itemDef.pawnValue || Math.max(10, Math.floor(itemDef.cost * 0.4));
      const now = new Date().toISOString();

      const tx = await this.db.transaction('write');
      try {
        const userRes = await tx.execute({
          sql: 'SELECT id, credits, inventory FROM users WHERE id = ?',
          args: [userId]
        });
        const userRow = userRes.rows[0];
        if (!userRow) throw new Error('Пользователь не найден.');

        let inventory: UserInventoryItem[] = [];
        try { inventory = JSON.parse(userRow.inventory as string) || []; } catch {}

        const existingIndex = inventory.findIndex(inv => inv.itemId === itemId && inv.quantity > 0);
        if (existingIndex === -1) {
          throw new Error('Предмет отсутствует в вашем инвентаре.');
        }

        inventory[existingIndex].quantity -= 1;
        if (inventory[existingIndex].quantity <= 0) {
          inventory.splice(existingIndex, 1);
        }

        await tx.execute({
          sql: `
            UPDATE users SET
              credits = credits + ?,
              inventory = ?,
              updated_at = ?
            WHERE id = ?
          `,
          args: [payout, JSON.stringify(inventory), now, userId]
        });

        await tx.commit();

        const updatedUser = await this.getUserById(userId);
        return {
          user: updatedUser!,
          payout,
          message: `Предмет «${itemDef.name}» сдан ростовщику. Вы получили +${payout} кр.`
        };
      } catch (err) {
        if (!tx.closed) {
          try { await tx.rollback(); } catch {}
        }
        throw err;
      } finally {
        if (!tx.closed) tx.close();
      }
    });
  }

  public async useItem(userId: string, itemId: string): Promise<{ user: UserProfile; resultMessage: string; reward?: any }> {
    return rewardMutex.runExclusive(`user:${userId}`, async () => {
      const itemDef = await itemsDb.getItemById(itemId);
      if (!itemDef) throw new Error('Определение предмета не найдено.');

      const tx = await this.db.transaction('write');
      try {
        const userRes = await tx.execute({
          sql: 'SELECT id, credits, inventory, equipped_card_back, equipped_title FROM users WHERE id = ?',
          args: [userId]
        });
        const userRow = userRes.rows[0];
        if (!userRow) throw new Error('Пользователь не найден.');

        let inventory: UserInventoryItem[] = [];
        try { inventory = JSON.parse(userRow.inventory as string) || []; } catch {}

        const invIndex = inventory.findIndex(i => i.itemId === itemId && i.quantity > 0);
        if (invIndex === -1) throw new Error('Предмет отсутствует в вашем инвентаре.');

        let resultMessage = '';
        let reward: any = null;
        let creditsDelta = 0;
        let cardBackToSet = userRow.equipped_card_back as string | null;
        let titleToSet = userRow.equipped_title as string | null;

        if (itemDef.cosmeticType === 'card_back') {
          cardBackToSet = itemId;
          resultMessage = `Рубашка карт «${itemDef.name}» успешно экипирована!`;
        } else if (itemDef.cosmeticType === 'title') {
          titleToSet = itemDef.name;
          resultMessage = `Титул «${itemDef.name}» теперь отображается в вашем досье!`;
        } else if (itemDef.cosmeticType === 'ui_skin') {
          resultMessage = `Стиль интерфейса «${itemDef.name}» успешно активирован!`;
        } else if (itemDef.category === 'chests') {
          inventory[invIndex].quantity -= 1;
          if (inventory[invIndex].quantity <= 0) {
            inventory.splice(invIndex, 1);
          }
          const possibleCredits = [100, 200, 350, 500, 1000];
          const winCredit = possibleCredits[Math.floor(Math.random() * possibleCredits.length)];
          creditsDelta = winCredit;
          reward = { credits: winCredit };
          resultMessage = `Вы открыли «${itemDef.name}» и нашли ${winCredit} кр!`;
        } else {
          resultMessage = `Предмет «${itemDef.name}» готов к использованию за игровым столом.`;
        }

        const now = new Date().toISOString();
        await tx.execute({
          sql: `
            UPDATE users SET
              credits = credits + ?,
              inventory = ?,
              equipped_card_back = ?,
              equipped_title = ?,
              updated_at = ?
            WHERE id = ?
          `,
          args: [creditsDelta, JSON.stringify(inventory), cardBackToSet, titleToSet, now, userId]
        });

        await tx.commit();

        const updatedUser = await this.getUserById(userId);
        return { user: updatedUser!, resultMessage, reward };
      } catch (err) {
        if (!tx.closed) {
          try { await tx.rollback(); } catch {}
        }
        throw err;
      } finally {
        if (!tx.closed) tx.close();
      }
    });
  }

  public async equipSkin(userId: string, skinId: string): Promise<{ user: UserProfile; equippedSkin: string }> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    if (skinId === 'default' || !skinId) {
      user.equippedCosmetics = user.equippedCosmetics || {};
      user.equippedCosmetics.uiSkin = undefined;
      await this.saveUserToDb(user as UserRecord);
      return { user, equippedSkin: 'default' };
    }

    const skinItemId = `skin_${skinId}`;
    const ownsItem = user.inventory.some(i => (i.itemId === skinItemId || i.itemId === skinId) && i.quantity > 0);
    const isSuperAdmin = Boolean(user.isAdmin || user.role === 'admin' || user.email?.toLowerCase() === 'vledahovic@gmail.com');

    if (!ownsItem && !isSuperAdmin) {
      throw new Error('Этот стиль интерфейса отсутствует в вашем инвентаре. Приобретите его на Черном Рынке.');
    }

    user.equippedCosmetics = user.equippedCosmetics || {};
    user.equippedCosmetics.uiSkin = skinId;
    await this.saveUserToDb(user as UserRecord);
    return { user, equippedSkin: skinId };
  }

  public async useRoleCardInRoom(userId: string): Promise<{ user: UserProfile; success: boolean }> {
    return rewardMutex.runExclusive(`user:${userId}`, async () => {
      const user = await this.getUserById(userId);
      if (!user) throw new Error('Пользователь не найден.');

      const invIndex = user.inventory.findIndex(i => i.itemId === ROLE_SELECT_CARD_ID && i.quantity > 0);
      if (invIndex === -1) {
        throw new Error('У вас нет «Карточки выбора роли» в инвентаре.');
      }

      user.inventory[invIndex].quantity -= 1;
      if (user.inventory[invIndex].quantity <= 0) {
        user.inventory.splice(invIndex, 1);
      }

      await this.saveUserToDb(user as UserRecord);
      return { user, success: true };
    });
  }

  public async claimDailyBonus(userId: string): Promise<{ 
    user: UserProfile; 
    claimedDay: number; 
    rewardCredits: number; 
    bonusItem?: ItemDefinition; 
    message: string;
    nextClaimAvailableInMs: number;
    vipBonusCredits: number;
  }> {
    return rewardMutex.runExclusive(`user:${userId}`, async () => {
      const user = await this.getUserById(userId);
      if (!user) throw new Error('Пользователь не найден.');

      const config = await dailyBonusDb.getConfig();
      if (!config.isEnabled && !user.isAdmin) {
        throw new Error('Ежедневный бонус временно отключен администрацией.');
      }

      const now = Date.now();
      const cooldownMs = config.cooldownHours * 3600 * 1000;
      const originalLastClaim = user.lastDailyBonusClaim || null;

      if (user.lastDailyBonusClaim) {
        const lastClaimTime = new Date(user.lastDailyBonusClaim).getTime();
        const elapsed = now - lastClaimTime;
        if (elapsed < cooldownMs) {
          const remainingHours = Math.ceil((cooldownMs - elapsed) / 3600000);
          throw new Error(`Вы уже получили награду сегодня. Следующий бонус будет доступен через ${remainingHours} ч.`);
        }

        if (config.streakPolicy !== 'never_reset') {
          const resetThreshold = (config.cooldownHours + 28) * 3600 * 1000;
          if (elapsed > resetThreshold) {
            user.dailyBonusStreak = 0;
          }
        }
      }

      let targetDay = (user.dailyBonusStreak || 0) + 1;
      if (targetDay > 7) targetDay = 1;

      const dayConfig = config.days.find(d => d.day === targetDay) || config.days[0] || { day: 1, credits: 50 };
      let baseCredits = Math.round(dayConfig.credits * config.multiplier);
      let vipBonusCredits = 0;

      if (user.isAdmin || (user.equippedCosmetics && user.equippedCosmetics.title)) {
        vipBonusCredits = Math.round(baseCredits * (config.vipBonusPercent / 100));
      }
      const totalCredits = baseCredits + vipBonusCredits;

      const newClaimTime = new Date(now).toISOString();

      let bonusItem: ItemDefinition | undefined = undefined;
      if (dayConfig.itemId) {
        bonusItem = (await itemsDb.getItemById(dayConfig.itemId)) || undefined;
        if (bonusItem) {
          const exIndex = user.inventory.findIndex(i => i.itemId === dayConfig.itemId);
          if (exIndex !== -1) user.inventory[exIndex].quantity += 1;
          else user.inventory.push({
            id: 'inv_' + Math.random().toString(36).substring(2),
            itemId: dayConfig.itemId,
            quantity: 1,
            acquiredAt: newClaimTime
          });
        }
      }

      // Atomic transaction on the database level to ensure idempotency and complete atomicity
      const tx = await this.db.transaction('write');
      try {
        let updateRes: any;
        if (originalLastClaim) {
          updateRes = await tx.execute({
            sql: `
              UPDATE users SET
                credits = credits + ?,
                daily_bonus_streak = ?,
                last_daily_bonus_claim = ?,
                inventory = ?,
                updated_at = ?
              WHERE id = ? AND last_daily_bonus_claim = ?
            `,
            args: [
              totalCredits,
              targetDay,
              newClaimTime,
              JSON.stringify(user.inventory),
              newClaimTime,
              userId,
              originalLastClaim
            ]
          });
        } else {
          updateRes = await tx.execute({
            sql: `
              UPDATE users SET
                credits = credits + ?,
                daily_bonus_streak = ?,
                last_daily_bonus_claim = ?,
                inventory = ?,
                updated_at = ?
              WHERE id = ? AND (last_daily_bonus_claim IS NULL OR last_daily_bonus_claim = '')
            `,
            args: [
              totalCredits,
              targetDay,
              newClaimTime,
              JSON.stringify(user.inventory),
              newClaimTime,
              userId
            ]
          });
        }

        if ((updateRes.rowsAffected ?? 0) === 0) {
          throw new Error('Награда уже была получена другим параллельным запросом.');
        }

        const claimLogId = 'claim_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        await tx.execute({
          sql: `
            INSERT INTO daily_bonus_claims (id, user_id, user_display_name, day, credits, item_id, claimed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          args: sanitizeArgs([
            claimLogId,
            user.id,
            user.displayName,
            targetDay,
            totalCredits,
            dayConfig.itemId || null,
            newClaimTime
          ])
        });

        await tx.commit();
      } catch (err) {
        if (!tx.closed) {
          try { await tx.rollback(); } catch {}
        }
        throw err;
      } finally {
        if (!tx.closed) {
          tx.close();
        }
      }

      user.credits += totalCredits;
      user.dailyBonusStreak = targetDay;
      user.lastDailyBonusClaim = newClaimTime;

      return {
        user,
        claimedDay: targetDay,
        rewardCredits: totalCredits,
        bonusItem,
        message: `День ${targetDay}: получено +${totalCredits} кр!`,
        nextClaimAvailableInMs: cooldownMs,
        vipBonusCredits
      };
    });
  }

  public async adminResetDailyBonusCooldown(userId: string): Promise<UserProfile> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    user.lastDailyBonusClaim = undefined;
    await this.saveUserToDb(user as UserRecord);
    return user;
  }

  public async getUserByToken(token: string): Promise<UserProfile | null> {
    if (!token) return null;
    const res = await this.db.execute({
      sql: 'SELECT * FROM users WHERE session_token = ?',
      args: [token]
    });
    const row = res.rows[0];
    if (!row) return null;
    const u = this.rowToUser(row);
    if (u.isBanned) return null;
    return u;
  }

  public async getUserById(id: string): Promise<UserProfile | null> {
    if (!id) return null;
    const res = await this.db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [id]
    });
    const row = res.rows[0];
    if (!row) return null;
    return this.rowToUser(row);
  }

  public async recordGameResult(
    userId: string, 
    won: boolean, 
    roleTeam: 'mafia' | 'civilians' | 'maniac',
    role?: string,
    survived: boolean = true,
    survivalSeconds: number = 180,
    roundsSurvived: number = 3,
    customXpAwards?: { totalXp: number; reasons: Array<{ reason: string; xp: number }> }
  ): Promise<{ xpEarned: number; totalXp: number; oldLevel: number; newLevel: number; leveledUp: boolean } | null> {
    const user = await this.getUserById(userId);
    if (!user) return null;

    const ratingDelta = won ? 25 : -15;
    const creditsDelta = won ? 50 : 15;

    user.stats.gamesPlayed = (user.stats.gamesPlayed || 0) + 1;
    if (won) {
      user.stats.gamesWon = (user.stats.gamesWon || 0) + 1;
      user.stats.rating = (user.stats.rating || 1200) + ratingDelta;
      user.credits += creditsDelta;
      if (roleTeam === 'mafia') user.stats.mafiaWins = (user.stats.mafiaWins || 0) + 1;
      else user.stats.civilianWins = (user.stats.civilianWins || 0) + 1;
    } else {
      user.stats.rating = Math.max(800, (user.stats.rating || 1200) + ratingDelta);
      user.credits += creditsDelta;
    }

    const expConfig = await experienceDb.getConfig();
    const mult = expConfig.isEnabled ? expConfig.globalMultiplier : 1.0;
    const baseActionXp = Math.round((expConfig.actionRules.find(r => r.id === 'participation')?.xp ?? 50) * mult);
    const winXp = won ? Math.round((expConfig.actionRules.find(r => r.id === 'win')?.xp ?? 120) * mult) : 0;
    const survivalXp = survived ? Math.round((expConfig.actionRules.find(r => r.id === 'survival')?.xp ?? 40) * mult) : 0;
    const inMatchActionsXp = customXpAwards?.totalXp || 0;
    const totalXpEarned = baseActionXp + winXp + survivalXp + inMatchActionsXp;

    const oldXp = typeof user.xp === 'number' ? user.xp : 0;
    const oldLevel = typeof user.level === 'number' ? user.level : experienceDb.getLevelFromXp(oldXp, expConfig.levelMilestones);

    user.xp = oldXp + totalXpEarned;
    user.level = experienceDb.getLevelFromXp(user.xp, expConfig.levelMilestones);
    const leveledUp = user.level > oldLevel;

    const actualRole = role || (roleTeam === 'mafia' ? 'mafia' : 'citizen');
    const roleNames: Record<string, string> = {
      citizen: 'Мирный житель',
      mafia: 'Мафия',
      don: 'Дон Мафии',
      sheriff: 'Шериф',
      doctor: 'Доктор',
      courtesan: 'Красотка',
      maniac: 'Маньяк',
      bodyguard: 'Телохранитель'
    };
    const roleName = roleNames[actualRole] || actualRole;

    if (!user.stats.roleStats) user.stats.roleStats = {};
    if (!user.stats.roleStats[actualRole]) {
      user.stats.roleStats[actualRole] = {
        role: actualRole,
        roleName,
        games: 0,
        wins: 0,
        survivedCount: 0,
        totalSurvivalSeconds: 0
      };
    }
    const rStat = user.stats.roleStats[actualRole];
    rStat.games++;
    if (won) rStat.wins++;
    if (survived) rStat.survivedCount++;
    rStat.totalSurvivalSeconds += survivalSeconds;

    const totalSecs = (user.stats.totalSurvivalSeconds || 0) + survivalSeconds;
    user.stats.totalSurvivalSeconds = totalSecs;
    user.stats.averageSurvivalSeconds = Math.round(totalSecs / user.stats.gamesPlayed);

    const xpBreakdown = [
      { reason: 'Участие в партии', xp: baseActionXp },
      ...(won ? [{ reason: 'Победа в матче', xp: winXp }] : []),
      ...(survived ? [{ reason: 'Выживание до конца партии', xp: survivalXp }] : []),
      ...(customXpAwards?.reasons || [])
    ];

    const matchId = 'match_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    await this.db.execute({
      sql: `
        INSERT INTO match_history (
          id, user_id, room_code, role, role_name, team, won, survived,
          survival_seconds, rounds_survived, rating_change, credits_earned,
          xp_earned, xp_breakdown, played_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([
        matchId,
        userId,
        null,
        actualRole,
        roleName,
        roleTeam,
        won ? 1 : 0,
        survived ? 1 : 0,
        survivalSeconds,
        roundsSurvived,
        ratingDelta,
        creditsDelta,
        totalXpEarned,
        JSON.stringify(xpBreakdown),
        now
      ])
    });

    await this.saveUserToDb(user as UserRecord);

    return {
      xpEarned: totalXpEarned,
      totalXp: user.xp,
      oldLevel,
      newLevel: user.level,
      leveledUp
    };
  }

  public async addXp(userId: string, amount: number, reason: string = 'Действие в игре'): Promise<{
    userId: string;
    amount: number;
    reason: string;
    totalXp: number;
    oldLevel: number;
    newLevel: number;
    leveledUp: boolean;
  } | null> {
    return rewardMutex.runExclusive(`user:${userId}`, async () => {
      const user = await this.getUserById(userId);
      if (!user) return null;

      const expConfig = await experienceDb.getConfig();
      const oldXp = typeof user.xp === 'number' ? user.xp : 0;
      const oldLevel = typeof user.level === 'number' ? user.level : experienceDb.getLevelFromXp(oldXp, expConfig.levelMilestones);
      user.xp = Math.max(0, oldXp + amount);
      user.level = experienceDb.getLevelFromXp(user.xp, expConfig.levelMilestones);
      const leveledUp = user.level > oldLevel;

      await this.saveUserToDb(user as UserRecord);
      return {
        userId,
        amount,
        reason,
        totalXp: user.xp,
        oldLevel,
        newLevel: user.level,
        leveledUp
      };
    });
  }

  public async setUserXp(userId: string, targetXp: number): Promise<{
    userId: string;
    totalXp: number;
    oldLevel: number;
    newLevel: number;
  } | null> {
    const user = await this.getUserById(userId);
    if (!user) return null;

    const expConfig = await experienceDb.getConfig();
    const oldLevel = typeof user.level === 'number' ? user.level : experienceDb.getLevelFromXp(user.xp || 0, expConfig.levelMilestones);
    user.xp = Math.max(0, Math.floor(targetXp));
    user.level = experienceDb.getLevelFromXp(user.xp, expConfig.levelMilestones);

    await this.saveUserToDb(user as UserRecord);
    return {
      userId,
      totalXp: user.xp,
      oldLevel,
      newLevel: user.level
    };
  }

  public async getGameHistory(userId: string): Promise<{
    userId: string;
    displayName: string;
    matches: MatchRecord[];
    summary: {
      gamesPlayed: number;
      gamesWon: number;
      winRate: number;
      rating: number;
      mafiaWins: number;
      civilianWins: number;
      totalSurvivalSeconds: number;
      averageSurvivalSeconds: number;
      mostPlayedRole: { role: string; name: string; games: number } | null;
      bestWinRateRole: { role: string; name: string; winRate: number; games: number } | null;
    };
    roleBreakdown: Record<string, any>;
  }> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    const res = await this.db.execute({
      sql: 'SELECT * FROM match_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 50',
      args: [userId]
    });

    const matches: MatchRecord[] = res.rows.map(r => ({
      id: r.id as string,
      playedAt: r.played_at as string,
      role: r.role as string,
      roleName: r.role_name as string,
      team: r.team as 'civilians' | 'mafia' | 'maniac',
      won: Boolean(r.won),
      survived: Boolean(r.survived),
      survivalSeconds: Number(r.survival_seconds),
      roundsSurvived: Number(r.rounds_survived),
      ratingChange: Number(r.rating_change),
      creditsEarned: Number(r.credits_earned),
      xpEarned: Number(r.xp_earned || 0),
      xpBreakdown: r.xp_breakdown ? JSON.parse(r.xp_breakdown as string) : undefined
    }));

    const stats = user.stats || {
      gamesPlayed: 0,
      gamesWon: 0,
      rating: 1200,
      mafiaWins: 0,
      civilianWins: 0,
      roleStats: {}
    };

    const roleStatsList = Object.values(stats.roleStats || {});
    let mostPlayedRole = roleStatsList.length > 0
      ? roleStatsList.reduce((max, curr) => curr.games > max.games ? curr : max, roleStatsList[0])
      : null;

    let bestWinRateRole = roleStatsList.filter(r => r.games >= 2).length > 0
      ? roleStatsList.filter(r => r.games >= 2).reduce((best, curr) => {
          const currRate = curr.wins / curr.games;
          const bestRate = best.wins / best.games;
          return currRate > bestRate ? curr : best;
        }, roleStatsList[0])
      : null;

    return {
      userId: user.id,
      displayName: user.displayName,
      matches,
      summary: {
        gamesPlayed: stats.gamesPlayed || 0,
        gamesWon: stats.gamesWon || 0,
        winRate: stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0,
        rating: stats.rating || 1200,
        mafiaWins: stats.mafiaWins || 0,
        civilianWins: stats.civilianWins || 0,
        totalSurvivalSeconds: stats.totalSurvivalSeconds || 0,
        averageSurvivalSeconds: stats.averageSurvivalSeconds || 0,
        mostPlayedRole: mostPlayedRole ? { role: mostPlayedRole.role, name: mostPlayedRole.roleName, games: mostPlayedRole.games } : null,
        bestWinRateRole: bestWinRateRole ? { 
          role: bestWinRateRole.role, 
          name: bestWinRateRole.roleName, 
          winRate: Math.round((bestWinRateRole.wins / bestWinRateRole.games) * 100),
          games: bestWinRateRole.games 
        } : null
      },
      roleBreakdown: stats.roleStats || {}
    };
  }

  public async checkIsAdminByToken(token: string): Promise<boolean> {
    const u = await this.getUserByToken(token);
    return !!u && (u.isAdmin || u.role === 'admin' || isEmailAdmin(u.email));
  }

  public async getAllUsers(): Promise<UserProfile[]> {
    const res = await this.db.execute('SELECT * FROM users ORDER BY created_at DESC');
    return res.rows.map(r => this.rowToUser(r));
  }

  public async updateCredits(userId: string, delta: number): Promise<UserProfile> {
    return this.adminUpdateCredits(userId, delta, false);
  }

  public async addItemToInventory(userId: string, itemId: string, quantity: number = 1): Promise<UserProfile> {
    return this.adminGiveItem(userId, itemId, quantity);
  }

  public async adminUpdateCredits(userId: string, amount: number, isSet: boolean): Promise<UserProfile> {
    return rewardMutex.runExclusive(`user:${userId}`, async () => {
      const user = await this.getUserById(userId);
      if (!user) throw new Error('Пользователь не найден.');

      if (isSet) {
        user.credits = Math.max(0, amount);
      } else {
        user.credits = Math.max(0, user.credits + amount);
      }

      await this.saveUserToDb(user as UserRecord);
      return user;
    });
  }

  public async adminGiveItem(userId: string, itemId: string, quantity: number = 1): Promise<UserProfile> {
    return rewardMutex.runExclusive(`user:${userId}`, async () => {
      const user = await this.getUserById(userId);
      if (!user) throw new Error('Пользователь не найден.');

      const itemDef = await itemsDb.getItemById(itemId);
      if (!itemDef) throw new Error('Предмет не найден в каталоге.');

      const exIndex = user.inventory.findIndex(i => i.itemId === itemId);
      if (exIndex !== -1) {
        user.inventory[exIndex].quantity += quantity;
      } else {
        user.inventory.push({
          id: 'inv_' + Math.random().toString(36).substring(2),
          itemId,
          quantity,
          acquiredAt: new Date().toISOString()
        });
      }

      await this.saveUserToDb(user as UserRecord);
      return user;
    });
  }

  public async adminToggleBan(userId: string): Promise<UserProfile> {
    const res = await this.db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [userId]
    });
    const row = res.rows[0];
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    if (isEmailAdmin(user.email)) {
      throw new Error('Нельзя заблокировать главного администратора.');
    }

    user.isBanned = !user.isBanned;
    if (user.isBanned) {
      user.sessionToken = undefined;
    }

    await this.saveUserToDb(user);
    return user;
  }

  public async adminUpdateRating(userId: string, rating: number): Promise<UserProfile> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    user.stats.rating = Math.max(100, Math.min(5000, rating));
    await this.saveUserToDb(user as UserRecord);
    return user;
  }

  public async adminUpdateDisplayName(userId: string, displayName: string): Promise<UserProfile> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    const clean = displayName.trim();
    if (clean.length < 2 || clean.length > 30) {
      throw new Error('Имя должно содержать от 2 до 30 символов.');
    }

    user.displayName = clean;
    await this.saveUserToDb(user as UserRecord);
    return user;
  }

  public async adminUpdateRole(userId: string, role: string, isAdmin?: boolean): Promise<UserProfile> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    const cleanRole = role.toLowerCase().trim() as 'admin' | 'moderator' | 'user';
    if (!['user', 'moderator', 'admin'].includes(cleanRole)) {
      throw new Error('Некорректная роль пользователя (допустимо: user, moderator, admin).');
    }

    if (isEmailAdmin(user.email) && cleanRole !== 'admin') {
      throw new Error('Нельзя снять права администратора с главного администратора системы.');
    }

    user.role = cleanRole;
    user.isAdmin = typeof isAdmin === 'boolean' ? isAdmin : (cleanRole === 'admin');
    await this.saveUserToDb(user as UserRecord);
    return user;
  }

  public async updateUserClan(userId: string, clanInfo: { 
    clanId: string | null; 
    clanName: string | null; 
    clanTag: string | null; 
    clanRole: 'leader' | 'member' | null 
  }): Promise<UserProfile> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    user.clanId = clanInfo.clanId;
    user.clanName = clanInfo.clanName;
    user.clanTag = clanInfo.clanTag;
    user.clanRole = clanInfo.clanRole;

    await this.saveUserToDb(user as UserRecord);
    return user;
  }

  public async equipMasteryBadge(userId: string, badgeTitle: string, flairTitle?: string): Promise<UserProfile> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    user.equippedCosmetics = user.equippedCosmetics || {};
    user.equippedCosmetics.title = badgeTitle;

    await this.saveUserToDb(user as UserRecord);
    return user;
  }

  public async getFriends(
    userId: string, 
    statusResolverOrOnlineIds?: ((userId: string) => { 
      onlineStatus: 'online' | 'in_game' | 'in_lobby' | 'offline'; 
      currentRoomCode?: string | null; 
      currentRoomName?: string | null; 
    }) | Set<string>, 
    userRoomMap: Map<string, { roomCode: string; roomName: string; phase: string }> = new Map()
  ): Promise<FriendInfo[]> {
    const res = await this.db.execute({
      sql: `
        SELECT f.friend_id, f.status, f.created_at as friend_created_at, u.*
        FROM user_friends f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ?
      `,
      args: [userId]
    });

    const result: FriendInfo[] = [];

    for (const r of res.rows) {
      const u = this.rowToUser(r);
      let onlineStatus: 'online' | 'in_game' | 'in_lobby' | 'offline' = 'offline';
      let currentRoomCode: string | null = null;
      let currentRoomName: string | null = null;

      if (typeof statusResolverOrOnlineIds === 'function') {
        const live = statusResolverOrOnlineIds(u.id);
        onlineStatus = live.onlineStatus;
        currentRoomCode = live.currentRoomCode || null;
        currentRoomName = live.currentRoomName || null;
      } else {
        const onlineSet = statusResolverOrOnlineIds instanceof Set ? statusResolverOrOnlineIds : new Set<string>();
        const isOnline = onlineSet.has(u.id);
        const roomInfo = userRoomMap.get(u.id);
        if (isOnline) {
          if (roomInfo) {
            onlineStatus = roomInfo.phase === 'LOBBY' ? 'in_lobby' : 'in_game';
          } else {
            onlineStatus = 'online';
          }
        }
        currentRoomCode = roomInfo?.roomCode || null;
        currentRoomName = roomInfo?.roomName || null;
      }

      result.push({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        avatarSeed: u.avatarSeed,
        clanTag: u.clanTag,
        clanName: u.clanName,
        rating: u.stats?.rating || 1200,
        gamesPlayed: u.stats?.gamesPlayed || 0,
        gamesWon: u.stats?.gamesWon || 0,
        status: r.status as 'accepted' | 'pending_sent' | 'pending_received',
        title: u.equippedCosmetics?.title,
        addedAt: r.friend_created_at as string,
        onlineStatus,
        currentRoomCode,
        currentRoomName
      });
    }

    result.sort((a, b) => {
      const order = { in_game: 0, in_lobby: 1, online: 2, offline: 3 };
      if (order[a.onlineStatus] !== order[b.onlineStatus]) {
        return order[a.onlineStatus] - order[b.onlineStatus];
      }
      return a.displayName.localeCompare(b.displayName);
    });

    return result;
  }

  public async sendFriendRequest(fromUserId: string, targetIdentifier: string): Promise<{ success: boolean; message: string; friend: FriendInfo }> {
    const fromUser = await this.getUserById(fromUserId);
    if (!fromUser) throw new Error('Пользователь не найден.');

    const clean = targetIdentifier.trim();
    let checkEmail = await this.db.execute({
      sql: 'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
      args: [clean]
    });
    let targetRow = checkEmail.rows[0];

    if (!targetRow) {
      const checkId = await this.db.execute({
        sql: 'SELECT * FROM users WHERE id = ?',
        args: [clean]
      });
      targetRow = checkId.rows[0];
    }
    if (!targetRow) {
      const checkName = await this.db.execute({
        sql: 'SELECT * FROM users WHERE LOWER(display_name) = LOWER(?)',
        args: [clean]
      });
      targetRow = checkName.rows[0];
    }
    if (!targetRow) {
      throw new Error(`Игрок «${clean}» не найден.`);
    }

    const targetUser = this.rowToUser(targetRow);
    if (targetUser.id === fromUserId) {
      throw new Error('Вы не можете добавить в друзья самого себя.');
    }

    const checkFriendRes = await this.db.execute({
      sql: 'SELECT status FROM user_friends WHERE user_id = ? AND friend_id = ?',
      args: [fromUserId, targetUser.id]
    });
    const existingFriend = checkFriendRes.rows[0];

    if (existingFriend) {
      if (existingFriend.status === 'accepted') {
        throw new Error(`Игрок ${targetUser.displayName} уже в вашем списке друзей.`);
      }
      if (existingFriend.status === 'pending_sent') {
        throw new Error(`Запрос в друзья игроку ${targetUser.displayName} уже отправлен.`);
      }
      if (existingFriend.status === 'pending_received') {
        return this.acceptFriendRequest(fromUserId, targetUser.id);
      }
    }

    const now = new Date().toISOString();
    await this.db.batch([
      {
        sql: 'INSERT OR REPLACE INTO user_friends (id, user_id, friend_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: sanitizeArgs([`${fromUserId}_${targetUser.id}`, fromUserId, targetUser.id, 'pending_sent', now, now])
      },
      {
        sql: 'INSERT OR REPLACE INTO user_friends (id, user_id, friend_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: sanitizeArgs([`${targetUser.id}_${fromUserId}`, targetUser.id, fromUserId, 'pending_received', now, now])
      }
    ]);

    return {
      success: true,
      message: `Запрос в друзья успешно отправлен игроку ${targetUser.displayName}!`,
      friend: {
        id: targetUser.id,
        displayName: targetUser.displayName,
        email: targetUser.email,
        avatarSeed: targetUser.avatarSeed,
        clanTag: targetUser.clanTag,
        clanName: targetUser.clanName,
        rating: targetUser.stats?.rating || 1200,
        gamesPlayed: targetUser.stats?.gamesPlayed || 0,
        gamesWon: targetUser.stats?.gamesWon || 0,
        status: 'pending_sent',
        title: targetUser.equippedCosmetics?.title,
        addedAt: now,
        onlineStatus: 'offline'
      }
    };
  }

  public async acceptFriendRequest(userId: string, targetUserId: string): Promise<{ success: boolean; message: string; friend: FriendInfo }> {
    const targetUser = await this.getUserById(targetUserId);
    if (!targetUser) throw new Error('Пользователь не найден.');

    const now = new Date().toISOString();
    await this.db.execute({
      sql: `
        UPDATE user_friends SET status = 'accepted', updated_at = ?
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      `,
      args: [now, userId, targetUserId, targetUserId, userId]
    });

    return {
      success: true,
      message: `Вы приняли запрос в друзья от ${targetUser.displayName}!`,
      friend: {
        id: targetUser.id,
        displayName: targetUser.displayName,
        email: targetUser.email,
        avatarSeed: targetUser.avatarSeed,
        clanTag: targetUser.clanTag,
        clanName: targetUser.clanName,
        rating: targetUser.stats?.rating || 1200,
        gamesPlayed: targetUser.stats?.gamesPlayed || 0,
        gamesWon: targetUser.stats?.gamesWon || 0,
        status: 'accepted',
        title: targetUser.equippedCosmetics?.title,
        addedAt: now,
        onlineStatus: 'offline'
      }
    };
  }

  public async declineFriendRequest(userId: string, targetUserId: string): Promise<{ success: boolean; message: string }> {
    await this.db.execute({
      sql: `
        DELETE FROM user_friends
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      `,
      args: [userId, targetUserId, targetUserId, userId]
    });

    return { success: true, message: 'Запрос в друзья отклонён.' };
  }

  public async removeFriend(userId: string, targetUserId: string): Promise<{ success: boolean; message: string }> {
    await this.db.execute({
      sql: `
        DELETE FROM user_friends
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      `,
      args: [userId, targetUserId, targetUserId, userId]
    });

    return { success: true, message: 'Игрок удален из списка друзей.' };
  }

  public async searchPlayers(queryStr: string, currentUserId: string): Promise<Array<{
    id: string;
    displayName: string;
    avatarSeed: string;
    rating: number;
    clanTag?: string | null;
    isFriend: boolean;
    hasPendingRequest: boolean;
  }>> {
    const clean = queryStr.trim().toLowerCase();
    if (!clean) return [];

    const res = await this.db.execute({
      sql: `
        SELECT * FROM users
        WHERE id != ? AND (LOWER(display_name) LIKE ? OR LOWER(email) LIKE ?)
        LIMIT 15
      `,
      args: sanitizeArgs([currentUserId, `%${clean}%`, `%${clean}%`])
    });

    const results: Array<any> = [];

    for (const r of res.rows) {
      const u = this.rowToUser(r);
      const friendRes = await this.db.execute({
        sql: 'SELECT status FROM user_friends WHERE user_id = ? AND friend_id = ?',
        args: [currentUserId, u.id]
      });
      const friendRow = friendRes.rows[0];

      results.push({
        id: u.id,
        displayName: u.displayName,
        avatarSeed: u.avatarSeed,
        rating: u.stats?.rating || 1200,
        clanTag: u.clanTag,
        isFriend: friendRow?.status === 'accepted',
        hasPendingRequest: friendRow?.status === 'pending_sent' || friendRow?.status === 'pending_received'
      });
    }

    return results;
  }

  public async createRoomInvite(
    fromUserId: string,
    toUserId: string,
    roomCode: string,
    roomName: string,
    isPrivate: boolean = false
  ): Promise<RoomInvite> {
    const fromUser = await this.getUserById(fromUserId);
    if (!fromUser) throw new Error('Отправитель не найден.');

    const inviteId = 'inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const invite: RoomInvite = {
      id: inviteId,
      fromUserId,
      fromUserName: fromUser.displayName,
      fromUserAvatar: fromUser.avatarSeed,
      toUserId,
      roomCode: roomCode.toUpperCase(),
      roomName: roomName || `Стол #${roomCode}`,
      isPrivate,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + 180000
    };

    await this.db.execute({
      sql: `
        INSERT INTO room_invites (
          id, from_user_id, from_user_name, from_user_avatar, to_user_id,
          room_code, room_name, is_private, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([
        invite.id,
        invite.fromUserId,
        invite.fromUserName,
        invite.fromUserAvatar,
        invite.toUserId,
        invite.roomCode,
        invite.roomName,
        invite.isPrivate ? 1 : 0,
        invite.createdAt,
        invite.expiresAt
      ])
    });

    return invite;
  }

  public async getPendingRoomInvites(userId: string): Promise<RoomInvite[]> {
    const now = Date.now();
    const res = await this.db.execute({
      sql: 'SELECT * FROM room_invites WHERE to_user_id = ? AND expires_at > ? ORDER BY expires_at DESC',
      args: [userId, now]
    });

    return res.rows.map(r => ({
      id: r.id as string,
      fromUserId: r.from_user_id as string,
      fromUserName: r.from_user_name as string,
      fromUserAvatar: (r.from_user_avatar as string) || (r.from_user_name as string),
      toUserId: r.to_user_id as string,
      roomCode: r.room_code as string,
      roomName: r.room_name as string,
      isPrivate: Boolean(r.is_private),
      createdAt: r.created_at as string,
      expiresAt: Number(r.expires_at)
    }));
  }

  public async dismissRoomInvite(userId: string, inviteId: string): Promise<void> {
    await this.db.execute({
      sql: 'DELETE FROM room_invites WHERE id = ? AND to_user_id = ?',
      args: [inviteId, userId]
    });
  }
}

export const userDb = new UserDatabase();
