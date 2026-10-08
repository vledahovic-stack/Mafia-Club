import bcrypt from 'bcryptjs';
import { ALL_GAME_ITEMS, ItemDefinition, UserInventoryItem, DEFAULT_NICKNAME_CHANGE_COST, NICKNAME_CHANGE_CERTIFICATE_ID, ROLE_SELECT_CARD_ID } from '../data/items';
import { shopDb } from './shop';
import { dailyBonusDb } from './dailyBonus';
import { getLevelFromXp } from '../game/experience';
import { getDatabase } from './database';
import { DatabaseSync } from 'node:sqlite';

export const ADMIN_EMAIL = 'vledahovic@gmail.com';

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
  createdAt: string;
  credits: number;
  xp: number;
  level: number;
  inventory: UserInventoryItem[];
  role: 'admin' | 'user';
  isAdmin: boolean;
  isBanned?: boolean;
  equippedCosmetics?: {
    cardBack?: string;
    title?: string;
  };
  lastDailyBonusClaim?: string;
  dailyBonusStreak?: number;
  clanId?: string | null;
  clanName?: string | null;
  clanTag?: string | null;
  clanRole?: 'leader' | 'member' | null;
  matchHistory?: MatchRecord[];
  friends?: Array<{
    friendId: string;
    status: 'accepted' | 'pending_sent' | 'pending_received';
    createdAt: string;
  }>;
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
}

export interface UserRecord extends UserProfile {
  passwordHash?: string;
  sessionToken?: string;
}

export class UserDatabase {
  private get db(): DatabaseSync {
    return getDatabase();
  }

  constructor() {
    this.ensureAdminSeed();
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

    const isTargetAdmin = (row.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();

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

  private saveUserToDb(u: UserRecord) {
    const isTargetAdmin = u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const isAdminVal = isTargetAdmin || u.isAdmin || u.role === 'admin' ? 1 : 0;
    const roleVal = isTargetAdmin ? 'admin' : u.role;

    const stmt = this.db.prepare(`
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
    `);

    stmt.run(
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
    );
  }

  private ensureAdminSeed() {
    const admin = this.db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(ADMIN_EMAIL) as any;
    if (admin) {
      this.db.prepare("UPDATE users SET role = 'admin', is_admin = 1 WHERE id = ?").run(admin.id);
    }
  }

  public async register(email: string, password: string, displayName?: string): Promise<UserRecord> {
    const cleanEmail = email.trim().toLowerCase();
    const existing = this.db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(cleanEmail);
    if (existing) {
      throw new Error('Пользователь с таким email уже зарегистрирован.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const id = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const cleanDisplayName = displayName?.trim() || cleanEmail.split('@')[0] || 'Игрок';
    const isTargetAdmin = cleanEmail === ADMIN_EMAIL.toLowerCase();
    const now = new Date().toISOString();

    const user: UserRecord = {
      id,
      email: cleanEmail,
      displayName: cleanDisplayName,
      avatarSeed: cleanDisplayName,
      passwordHash,
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

    const insert = this.db.prepare(`
      INSERT INTO users (
        id, email, display_name, avatar_seed, password_hash, session_token,
        credits, xp, level, role, is_admin, is_banned,
        clan_id, clan_name, clan_tag, clan_role,
        equipped_card_back, equipped_title,
        daily_bonus_streak, last_daily_bonus_claim,
        stats, inventory, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
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
    );

    return user;
  }

  public async login(email: string, password: string): Promise<UserRecord> {
    const cleanEmail = email.trim().toLowerCase();
    const row = this.db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(cleanEmail);
    if (!row) {
      throw new Error('Пользователь с таким email не найден.');
    }

    const user = this.rowToUser(row);
    if (user.isBanned) {
      throw new Error('Ваш аккаунт заблокирован администрацией.');
    }

    if (!user.passwordHash) {
      throw new Error('Данный аккаунт зарегистрирован через Google. Войдите через Google.');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Неверный пароль.');
    }

    user.sessionToken = 'tk_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    this.saveUserToDb(user);

    return user;
  }

  public async syncGoogleUser(googleUid: string, email: string, displayName: string): Promise<UserRecord> {
    const cleanEmail = email.trim().toLowerCase();
    let row = this.db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(cleanEmail);

    if (row) {
      const user = this.rowToUser(row);
      if (user.isBanned) {
        throw new Error('Ваш аккаунт заблокирован администрацией.');
      }
      user.sessionToken = 'tk_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      if (displayName && user.displayName.startsWith('Player_')) {
        user.displayName = displayName;
      }
      this.saveUserToDb(user);
      return user;
    }

    const id = googleUid || ('user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));
    const cleanDisplayName = displayName?.trim() || cleanEmail.split('@')[0] || 'Игрок';
    const isTargetAdmin = cleanEmail === ADMIN_EMAIL.toLowerCase();
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

    const insert = this.db.prepare(`
      INSERT INTO users (
        id, email, display_name, avatar_seed, password_hash, session_token,
        credits, xp, level, role, is_admin, is_banned,
        clan_id, clan_name, clan_tag, clan_role,
        equipped_card_back, equipped_title,
        daily_bonus_streak, last_daily_bonus_claim,
        stats, inventory, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
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
    );

    return user;
  }

  public changeDisplayName(userId: string, newDisplayName: string, useCertificate: boolean): { 
    user: UserProfile; 
    certificateUsed: boolean; 
    costCredits: number 
  } {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    const clean = newDisplayName.trim();
    if (clean.length < 2 || clean.length > 30) {
      throw new Error('Имя должно содержать от 2 до 30 символов.');
    }
    if (clean === user.displayName) {
      throw new Error('Новое имя совпадает с текущим.');
    }

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
      if (user.credits < DEFAULT_NICKNAME_CHANGE_COST) {
        throw new Error(`Недостаточно кредитов. Требуется ${DEFAULT_NICKNAME_CHANGE_COST} кр (у вас ${user.credits} кр).`);
      }
      user.credits -= DEFAULT_NICKNAME_CHANGE_COST;
      costCredits = DEFAULT_NICKNAME_CHANGE_COST;
    }

    user.displayName = clean;
    this.saveUserToDb(user);

    return { user, certificateUsed, costCredits };
  }

  public buyItem(userId: string, itemId: string): { user: UserProfile; item: ItemDefinition; message: string } {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    const itemDef = shopDb.getItemById(itemId);
    if (!itemDef) throw new Error('Предмет не найден в каталоге магазина.');

    const settings = shopDb.getSettings();
    if (!settings.isShopEnabled && !user.isAdmin) {
      throw new Error('Магазин временно закрыт на переучёт.');
    }

    let effectivePrice = itemDef.cost;
    if (settings.globalDiscount > 0) {
      effectivePrice = Math.max(1, Math.round(effectivePrice * (1 - settings.globalDiscount / 100)));
    }

    if (user.credits < effectivePrice) {
      throw new Error(`Недостаточно кредитов. Требуется ${effectivePrice} кр, у вас ${user.credits} кр.`);
    }

    user.credits -= effectivePrice;
    const existingIndex = user.inventory.findIndex(inv => inv.itemId === itemId);
    if (existingIndex !== -1) {
      user.inventory[existingIndex].quantity += 1;
    } else {
      user.inventory.push({
        id: 'inv_' + Math.random().toString(36).substring(2),
        itemId,
        quantity: 1,
        acquiredAt: new Date().toISOString()
      });
    }

    this.saveUserToDb(user);
    return {
      user,
      item: itemDef,
      message: `Вы успешно приобрели «${itemDef.name}» за ${effectivePrice} кр.`
    };
  }

  public pawnItem(userId: string, itemId: string): { user: UserProfile; payout: number; message: string } {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    const existingIndex = user.inventory.findIndex(inv => inv.itemId === itemId && inv.quantity > 0);
    if (existingIndex === -1) {
      throw new Error('Предмет отсутствует в вашем инвентаре.');
    }

    const itemDef = ALL_GAME_ITEMS[itemId];
    if (!itemDef) throw new Error('Неизвестный предмет.');

    const payout = itemDef.pawnValue || Math.max(10, Math.floor(itemDef.cost * 0.4));
    user.credits += payout;
    user.inventory[existingIndex].quantity -= 1;
    if (user.inventory[existingIndex].quantity <= 0) {
      user.inventory.splice(existingIndex, 1);
    }

    this.saveUserToDb(user);
    return {
      user,
      payout,
      message: `Предмет «${itemDef.name}» сдан ростовщику. Вы получили +${payout} кр.`
    };
  }

  public useItem(userId: string, itemId: string): { user: UserProfile; resultMessage: string; reward?: any } {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    const invIndex = user.inventory.findIndex(i => i.itemId === itemId && i.quantity > 0);
    if (invIndex === -1) throw new Error('Предмет отсутствует в вашем инвентаре.');

    const itemDef = ALL_GAME_ITEMS[itemId];
    if (!itemDef) throw new Error('Определение предмета не найдено.');

    let resultMessage = '';
    let reward: any = null;

    if (itemDef.cosmeticType === 'card_back') {
      user.equippedCosmetics = user.equippedCosmetics || {};
      user.equippedCosmetics.cardBack = itemId;
      resultMessage = `Рубашка карт «${itemDef.name}» успешно экипирована!`;
    } else if (itemDef.cosmeticType === 'title') {
      user.equippedCosmetics = user.equippedCosmetics || {};
      user.equippedCosmetics.title = itemDef.name;
      resultMessage = `Титул «${itemDef.name}» теперь отображается в вашем досье!`;
    } else if (itemDef.category === 'chests') {
      user.inventory[invIndex].quantity -= 1;
      if (user.inventory[invIndex].quantity <= 0) {
        user.inventory.splice(invIndex, 1);
      }

      const possibleCredits = [100, 200, 350, 500, 1000];
      const winCredit = possibleCredits[Math.floor(Math.random() * possibleCredits.length)];
      user.credits += winCredit;
      reward = { credits: winCredit };
      resultMessage = `Вы открыли «${itemDef.name}» и нашли ${winCredit} кр!`;
    } else {
      resultMessage = `Предмет «${itemDef.name}» готов к использованию за игровым столом.`;
    }

    this.saveUserToDb(user);
    return { user, resultMessage, reward };
  }

  public useRoleCardInRoom(userId: string): { user: UserProfile; success: boolean } {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    const invIndex = user.inventory.findIndex(i => i.itemId === ROLE_SELECT_CARD_ID && i.quantity > 0);
    if (invIndex === -1) {
      throw new Error('У вас нет «Карточки выбора роли» в инвентаре.');
    }

    user.inventory[invIndex].quantity -= 1;
    if (user.inventory[invIndex].quantity <= 0) {
      user.inventory.splice(invIndex, 1);
    }

    this.saveUserToDb(user);
    return { user, success: true };
  }

  public claimDailyBonus(userId: string): { 
    user: UserProfile; 
    claimedDay: number; 
    rewardCredits: number; 
    bonusItem?: ItemDefinition; 
    message: string;
    nextClaimAvailableInMs: number;
    vipBonusCredits: number;
  } {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    const config = dailyBonusDb.getConfig();
    if (!config.isEnabled && !user.isAdmin) {
      throw new Error('Ежедневный бонус временно отключен администрацией.');
    }

    const now = Date.now();
    const cooldownMs = config.cooldownHours * 3600 * 1000;

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

    user.credits += totalCredits;
    user.dailyBonusStreak = targetDay;
    user.lastDailyBonusClaim = new Date(now).toISOString();

    let bonusItem: ItemDefinition | undefined = undefined;
    if (dayConfig.itemId && ALL_GAME_ITEMS[dayConfig.itemId]) {
      bonusItem = ALL_GAME_ITEMS[dayConfig.itemId];
      const exIndex = user.inventory.findIndex(i => i.itemId === dayConfig.itemId);
      if (exIndex !== -1) user.inventory[exIndex].quantity += 1;
      else user.inventory.push({
        id: 'inv_' + Math.random().toString(36).substring(2),
        itemId: dayConfig.itemId,
        quantity: 1,
        acquiredAt: new Date().toISOString()
      });
    }

    dailyBonusDb.recordClaim({
      userId: user.id,
      userDisplayName: user.displayName,
      day: targetDay,
      credits: totalCredits,
      itemId: dayConfig.itemId
    });

    this.saveUserToDb(user);

    return {
      user,
      claimedDay: targetDay,
      rewardCredits: totalCredits,
      bonusItem,
      message: `День ${targetDay}: получено +${totalCredits} кр!`,
      nextClaimAvailableInMs: cooldownMs,
      vipBonusCredits
    };
  }

  public adminResetDailyBonusCooldown(userId: string): UserProfile {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    user.lastDailyBonusClaim = undefined;
    this.saveUserToDb(user);
    return user;
  }

  public getUserByToken(token: string): UserProfile | null {
    if (!token) return null;
    const row = this.db.prepare('SELECT * FROM users WHERE session_token = ?').get(token);
    if (!row) return null;
    const u = this.rowToUser(row);
    if (u.isBanned) return null;
    return u;
  }

  public getUserById(id: string): UserProfile | null {
    if (!id) return null;
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!row) return null;
    return this.rowToUser(row);
  }

  public recordGameResult(
    userId: string, 
    won: boolean, 
    roleTeam: 'mafia' | 'civilians' | 'maniac',
    role?: string,
    survived: boolean = true,
    survivalSeconds: number = 180,
    roundsSurvived: number = 3,
    customXpAwards?: { totalXp: number; reasons: Array<{ reason: string; xp: number }> }
  ): { xpEarned: number; totalXp: number; oldLevel: number; newLevel: number; leveledUp: boolean } | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) return null;
    const user = this.rowToUser(row);

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

    // Experience (XP) Calculation
    const baseActionXp = 50;
    const winXp = won ? 120 : 0;
    const survivalXp = survived ? 40 : 0;
    const inMatchActionsXp = customXpAwards?.totalXp || 0;
    const totalXpEarned = baseActionXp + winXp + survivalXp + inMatchActionsXp;

    const oldXp = typeof user.xp === 'number' ? user.xp : 0;
    const oldLevel = typeof user.level === 'number' ? user.level : getLevelFromXp(oldXp);

    user.xp = oldXp + totalXpEarned;
    user.level = getLevelFromXp(user.xp);
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

    const insertMatch = this.db.prepare(`
      INSERT INTO match_history (
        id, user_id, room_code, role, role_name, team, won, survived,
        survival_seconds, rounds_survived, rating_change, credits_earned,
        xp_earned, xp_breakdown, played_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertMatch.run(
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
    );

    this.saveUserToDb(user);

    return {
      xpEarned: totalXpEarned,
      totalXp: user.xp,
      oldLevel,
      newLevel: user.level,
      leveledUp
    };
  }

  public addXp(userId: string, amount: number, reason: string = 'Действие в игре') {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) return null;
    const user = this.rowToUser(row);

    const oldXp = typeof user.xp === 'number' ? user.xp : 0;
    const oldLevel = typeof user.level === 'number' ? user.level : getLevelFromXp(oldXp);
    user.xp = Math.max(0, oldXp + amount);
    user.level = getLevelFromXp(user.xp);
    const leveledUp = user.level > oldLevel;

    this.saveUserToDb(user);
    return {
      userId,
      amount,
      reason,
      totalXp: user.xp,
      oldLevel,
      newLevel: user.level,
      leveledUp
    };
  }

  public getGameHistory(userId: string) {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    const matchRows = this.db.prepare(`
      SELECT * FROM match_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 50
    `).all(userId) as any[];

    const matches: MatchRecord[] = matchRows.map(r => ({
      id: r.id,
      playedAt: r.played_at,
      role: r.role,
      roleName: r.role_name,
      team: r.team as 'civilians' | 'mafia' | 'maniac',
      won: Boolean(r.won),
      survived: Boolean(r.survived),
      survivalSeconds: Number(r.survival_seconds),
      roundsSurvived: Number(r.rounds_survived),
      ratingChange: Number(r.rating_change),
      creditsEarned: Number(r.credits_earned),
      xpEarned: Number(r.xp_earned || 0),
      xpBreakdown: r.xp_breakdown ? JSON.parse(r.xp_breakdown) : undefined
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

  public checkIsAdminByToken(token: string): boolean {
    const u = this.getUserByToken(token);
    return !!u && (u.isAdmin || u.role === 'admin' || u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  }

  public getAllUsers(): UserProfile[] {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as any[];
    return rows.map(r => this.rowToUser(r));
  }

  public updateCredits(userId: string, delta: number): UserProfile {
    return this.adminUpdateCredits(userId, delta, false);
  }

  public addItemToInventory(userId: string, itemId: string, quantity: number = 1): UserProfile {
    return this.adminGiveItem(userId, itemId, quantity);
  }

  public adminUpdateCredits(userId: string, amount: number, isSet: boolean): UserProfile {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    if (isSet) {
      user.credits = Math.max(0, amount);
    } else {
      user.credits = Math.max(0, user.credits + amount);
    }

    this.saveUserToDb(user);
    return user;
  }

  public adminGiveItem(userId: string, itemId: string, quantity: number = 1): UserProfile {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    const itemDef = ALL_GAME_ITEMS[itemId];
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

    this.saveUserToDb(user);
    return user;
  }

  public adminToggleBan(userId: string): UserProfile {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      throw new Error('Нельзя заблокировать главного администратора.');
    }

    user.isBanned = !user.isBanned;
    if (user.isBanned) {
      user.sessionToken = undefined;
    }

    this.saveUserToDb(user);
    return user;
  }

  public adminUpdateRating(userId: string, rating: number): UserProfile {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    user.stats.rating = Math.max(100, Math.min(5000, rating));
    this.saveUserToDb(user);
    return user;
  }

  public adminUpdateDisplayName(userId: string, displayName: string): UserProfile {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    const clean = displayName.trim();
    if (clean.length < 2 || clean.length > 30) {
      throw new Error('Имя должно содержать от 2 до 30 символов.');
    }

    user.displayName = clean;
    this.saveUserToDb(user);
    return user;
  }

  public updateUserClan(userId: string, clanInfo: { 
    clanId: string | null; 
    clanName: string | null; 
    clanTag: string | null; 
    clanRole: 'leader' | 'member' | null 
  }): UserProfile {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    user.clanId = clanInfo.clanId;
    user.clanName = clanInfo.clanName;
    user.clanTag = clanInfo.clanTag;
    user.clanRole = clanInfo.clanRole;

    this.saveUserToDb(user);
    return user;
  }

  public equipMasteryBadge(userId: string, badgeTitle: string, flairTitle?: string): UserProfile {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('Пользователь не найден.');
    const user = this.rowToUser(row);

    user.equippedCosmetics = user.equippedCosmetics || {};
    user.equippedCosmetics.title = badgeTitle;

    this.saveUserToDb(user);
    return user;
  }

  public getFriends(
    userId: string, 
    statusResolverOrOnlineIds?: ((userId: string) => { 
      onlineStatus: 'online' | 'in_game' | 'in_lobby' | 'offline'; 
      currentRoomCode?: string | null; 
      currentRoomName?: string | null; 
    }) | Set<string>, 
    userRoomMap: Map<string, { roomCode: string; roomName: string; phase: string }> = new Map()
  ): FriendInfo[] {
    const friendRows = this.db.prepare(`
      SELECT f.friend_id, f.status, f.created_at as friend_created_at, u.*
      FROM user_friends f
      JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ?
    `).all(userId) as any[];

    const result: FriendInfo[] = [];

    for (const r of friendRows) {
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
        addedAt: r.friend_created_at,
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

  public sendFriendRequest(fromUserId: string, targetIdentifier: string): { success: boolean; message: string; friend: FriendInfo } {
    const fromRow = this.db.prepare('SELECT * FROM users WHERE id = ?').get(fromUserId);
    if (!fromRow) throw new Error('Пользователь не найден.');
    const fromUser = this.rowToUser(fromRow);

    const clean = targetIdentifier.trim();
    let targetRow = this.db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(clean);
    if (!targetRow) {
      targetRow = this.db.prepare('SELECT * FROM users WHERE id = ?').get(clean);
    }
    if (!targetRow) {
      targetRow = this.db.prepare('SELECT * FROM users WHERE LOWER(display_name) = LOWER(?)').get(clean);
    }
    if (!targetRow) {
      throw new Error(`Игрок «${clean}» не найден.`);
    }

    const targetUser = this.rowToUser(targetRow);
    if (targetUser.id === fromUserId) {
      throw new Error('Вы не можете добавить в друзья самого себя.');
    }

    const existingFriend = this.db.prepare(
      'SELECT status FROM user_friends WHERE user_id = ? AND friend_id = ?'
    ).get(fromUserId, targetUser.id) as any;

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
    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO user_friends (id, user_id, friend_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(`${fromUserId}_${targetUser.id}`, fromUserId, targetUser.id, 'pending_sent', now, now);
    insertStmt.run(`${targetUser.id}_${fromUserId}`, targetUser.id, fromUserId, 'pending_received', now, now);

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

  public acceptFriendRequest(userId: string, targetUserId: string): { success: boolean; message: string; friend: FriendInfo } {
    const targetRow = this.db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
    if (!targetRow) throw new Error('Пользователь не найден.');
    const targetUser = this.rowToUser(targetRow);

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE user_friends SET status = 'accepted', updated_at = ?
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).run(now, userId, targetUserId, targetUserId, userId);

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

  public declineFriendRequest(userId: string, targetUserId: string): { success: boolean; message: string } {
    this.db.prepare(`
      DELETE FROM user_friends
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).run(userId, targetUserId, targetUserId, userId);

    return { success: true, message: 'Запрос в друзья отклонён.' };
  }

  public removeFriend(userId: string, targetUserId: string): { success: boolean; message: string } {
    this.db.prepare(`
      DELETE FROM user_friends
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).run(userId, targetUserId, targetUserId, userId);

    return { success: true, message: 'Игрок удален из списка друзей.' };
  }

  public searchPlayers(query: string, currentUserId: string): Array<{
    id: string;
    displayName: string;
    avatarSeed: string;
    rating: number;
    clanTag?: string | null;
    isFriend: boolean;
    hasPendingRequest: boolean;
  }> {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];

    const rows = this.db.prepare(`
      SELECT * FROM users
      WHERE id != ? AND (LOWER(display_name) LIKE ? OR LOWER(email) LIKE ?)
      LIMIT 15
    `).all(currentUserId, `%${clean}%`, `%${clean}%`) as any[];

    const results: Array<any> = [];

    for (const r of rows) {
      const u = this.rowToUser(r);
      const friendRow = this.db.prepare(
        'SELECT status FROM user_friends WHERE user_id = ? AND friend_id = ?'
      ).get(currentUserId, u.id) as any;

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

  public createRoomInvite(
    fromUserId: string,
    toUserId: string,
    roomCode: string,
    roomName: string,
    isPrivate: boolean = false
  ): RoomInvite {
    const fromRow = this.db.prepare('SELECT * FROM users WHERE id = ?').get(fromUserId);
    if (!fromRow) throw new Error('Отправитель не найден.');
    const fromUser = this.rowToUser(fromRow);

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

    const insert = this.db.prepare(`
      INSERT INTO room_invites (
        id, from_user_id, from_user_name, from_user_avatar, to_user_id,
        room_code, room_name, is_private, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
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
    );

    return invite;
  }

  public getPendingRoomInvites(userId: string): RoomInvite[] {
    const now = Date.now();
    const rows = this.db.prepare(`
      SELECT * FROM room_invites WHERE to_user_id = ? AND expires_at > ? ORDER BY expires_at DESC
    `).all(userId, now) as any[];

    return rows.map(r => ({
      id: r.id,
      fromUserId: r.from_user_id,
      fromUserName: r.from_user_name,
      fromUserAvatar: r.from_user_avatar || r.from_user_name,
      toUserId: r.to_user_id,
      roomCode: r.room_code,
      roomName: r.room_name,
      isPrivate: Boolean(r.is_private),
      createdAt: r.created_at,
      expiresAt: Number(r.expires_at)
    }));
  }

  public dismissRoomInvite(userId: string, inviteId: string): void {
    this.db.prepare('DELETE FROM room_invites WHERE id = ? AND to_user_id = ?').run(inviteId, userId);
  }
}

export const userDb = new UserDatabase();
