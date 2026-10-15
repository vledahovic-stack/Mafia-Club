import { ALL_GAME_ITEMS } from '../data/items';
import { getDatabase } from './database';
import { DatabaseSync } from 'node:sqlite';

export interface DailyBonusDayConfig {
  day: number;
  credits: number;
  icon?: string;
  itemId?: string;
  itemName?: string;
  itemIcon?: string;
  isSpecial?: boolean;
  title?: string;
}

export interface DailyBonusConfig {
  isEnabled: boolean;
  multiplier: number;
  streakPolicy: 'calendar_day' | 'flexible_24h' | 'never_reset';
  cooldownHours: number;
  bannerMessage: string;
  vipBonusPercent: number;
  days: DailyBonusDayConfig[];
  updatedAt: string;
}

export interface ClaimRecord {
  id: string;
  userId: string;
  userDisplayName: string;
  day: number;
  credits: number;
  itemId?: string;
  claimedAt: string;
}

const DEFAULT_DAYS: DailyBonusDayConfig[] = [
  { day: 1, credits: 50, title: 'Приветствие Семьи', icon: '🪙', isSpecial: false },
  { day: 2, credits: 75, title: 'Разведка квартала', icon: '🪙', isSpecial: false },
  { day: 3, credits: 100, title: 'Доверие Капо', icon: '💰', isSpecial: false },
  { day: 4, credits: 150, title: 'Подпольный куш', icon: '💰', isSpecial: false },
  { day: 5, credits: 200, title: 'Взнос Синдиката', icon: '💰', isSpecial: false },
  { day: 6, credits: 300, title: 'Золото Крестного', icon: '💎', isSpecial: false },
  { 
    day: 7, 
    credits: 500, 
    title: 'Триумф Мафии', 
    icon: '👑', 
    isSpecial: true,
    itemId: 'case_wooden',
    itemName: 'Деревянный кейс синдиката',
    itemIcon: '📦'
  }
];

const DEFAULT_CONFIG: DailyBonusConfig = {
  isEnabled: true,
  multiplier: 1.0,
  streakPolicy: 'flexible_24h',
  cooldownHours: 20.0,
  bannerMessage: 'Заходите каждый день и собирайте дань города! Достигните 7 дня для супер-приза!',
  vipBonusPercent: 10,
  days: DEFAULT_DAYS,
  updatedAt: new Date().toISOString()
};

export class DailyBonusDatabase {
  private get db(): DatabaseSync {
    return getDatabase();
  }

  constructor() {
    this.ensureSeed();
  }

  private ensureSeed() {
    const row = this.db.prepare("SELECT * FROM daily_bonus_config WHERE id = 'default'").get();
    if (!row) {
      this.db.prepare(`
        INSERT INTO daily_bonus_config (
          id, is_enabled, multiplier, streak_policy, cooldown_hours, banner_message, vip_bonus_percent, days, updated_at
        ) VALUES ('default', 1, 1.0, 'flexible_24h', 20.0, ?, 10, ?, ?)
      `).run(
        DEFAULT_CONFIG.bannerMessage,
        JSON.stringify(DEFAULT_DAYS),
        new Date().toISOString()
      );
    }
  }

  public getConfig(): DailyBonusConfig {
    const row = this.db.prepare("SELECT * FROM daily_bonus_config WHERE id = 'default'").get() as any;
    if (!row) return DEFAULT_CONFIG;

    let days: DailyBonusDayConfig[] = DEFAULT_DAYS;
    try {
      days = typeof row.days === 'string' ? JSON.parse(row.days) : row.days || DEFAULT_DAYS;
    } catch {
      days = DEFAULT_DAYS;
    }

    return {
      isEnabled: Boolean(row.is_enabled),
      multiplier: Number(row.multiplier ?? 1.0),
      streakPolicy: (row.streak_policy || 'flexible_24h') as DailyBonusConfig['streakPolicy'],
      cooldownHours: Number(row.cooldown_hours ?? 20.0),
      bannerMessage: row.banner_message || '',
      vipBonusPercent: Number(row.vip_bonus_percent ?? 10),
      days,
      updatedAt: row.updated_at || new Date().toISOString()
    };
  }

  public updateConfig(updates: Partial<DailyBonusConfig>): DailyBonusConfig {
    const current = this.getConfig();

    let updatedDays = current.days;
    if (updates.days && Array.isArray(updates.days)) {
      updatedDays = updates.days.map((d, index) => {
        const dayNum = index + 1;
        const itemDef = d.itemId && ALL_GAME_ITEMS[d.itemId] ? ALL_GAME_ITEMS[d.itemId] : null;
        return {
          day: dayNum,
          credits: Math.max(0, Number(d.credits) || 0),
          title: d.title || `День ${dayNum}`,
          icon: d.icon || '🪙',
          isSpecial: d.isSpecial ?? (dayNum === 7),
          itemId: d.itemId || undefined,
          itemName: itemDef ? itemDef.name : (d.itemName || undefined),
          itemIcon: itemDef ? itemDef.icon : (d.itemIcon || undefined)
        };
      });
    }

    const merged: DailyBonusConfig = {
      ...current,
      ...updates,
      days: updatedDays,
      multiplier: typeof updates.multiplier === 'number' ? Math.max(0.5, Math.min(5, updates.multiplier)) : current.multiplier,
      cooldownHours: typeof updates.cooldownHours === 'number' ? Math.max(1, Math.min(48, updates.cooldownHours)) : current.cooldownHours,
      vipBonusPercent: typeof updates.vipBonusPercent === 'number' ? Math.max(0, Math.min(100, updates.vipBonusPercent)) : current.vipBonusPercent,
      updatedAt: new Date().toISOString()
    };

    this.db.prepare(`
      UPDATE daily_bonus_config SET
        is_enabled = ?,
        multiplier = ?,
        streak_policy = ?,
        cooldown_hours = ?,
        banner_message = ?,
        vip_bonus_percent = ?,
        days = ?,
        updated_at = ?
      WHERE id = 'default'
    `).run(
      merged.isEnabled ? 1 : 0,
      merged.multiplier,
      merged.streakPolicy,
      merged.cooldownHours,
      merged.bannerMessage,
      merged.vipBonusPercent,
      JSON.stringify(merged.days),
      merged.updatedAt
    );

    return merged;
  }

  public resetToDefaults(): DailyBonusConfig {
    return this.updateConfig(DEFAULT_CONFIG);
  }

  public applyPreset(preset: 'default' | 'weekend_x2' | 'generous' | 'economy'): DailyBonusConfig {
    switch (preset) {
      case 'weekend_x2':
        return this.updateConfig({
          multiplier: 2.0,
          bannerMessage: '🔥 УИКЕНД ДВОЙНЫХ НАГРАД! Все ежедневные кредиты умножаются на x2!',
          isEnabled: true
        });
      case 'generous':
        return this.updateConfig({
          multiplier: 1.5,
          days: [
            { day: 1, credits: 100, title: 'Щедрый старт', icon: '💰', isSpecial: false },
            { day: 2, credits: 150, title: 'Золото улиц', icon: '💰', isSpecial: false },
            { day: 3, credits: 200, title: 'Большой куш', icon: '💎', isSpecial: false },
            { day: 4, credits: 300, title: 'Теневой банк', icon: '💎', isSpecial: false },
            { day: 5, credits: 400, title: 'Клан Чикаго', icon: '👑', isSpecial: false },
            { day: 6, credits: 600, title: 'Триумф Мафии', icon: '👑', isSpecial: false },
            { 
              day: 7, 
              credits: 1000, 
              title: 'Сейф Синдиката', 
              icon: '🏆', 
              isSpecial: true,
              itemId: 'safe_don',
              itemName: 'Сейф Дона',
              itemIcon: '💼'
            }
          ],
          bannerMessage: '🎉 Праздничная неделя! Увеличенные награды и Сейф Дона на 7-й день!'
        });
      case 'economy':
        return this.updateConfig({
          multiplier: 1.0,
          days: [
            { day: 1, credits: 25, title: 'Медяк новичка', icon: '🪙', isSpecial: false },
            { day: 2, credits: 40, title: 'Первая плата', icon: '🪙', isSpecial: false },
            { day: 3, credits: 60, title: 'Уличный сбор', icon: '🪙', isSpecial: false },
            { day: 4, credits: 90, title: 'Деньги клуба', icon: '💰', isSpecial: false },
            { day: 5, credits: 120, title: 'Тайник', icon: '💰', isSpecial: false },
            { day: 6, credits: 180, title: 'Премия', icon: '💎', isSpecial: false },
            { 
              day: 7, 
              credits: 300, 
              title: 'Награда Дона', 
              icon: '👑', 
              isSpecial: true,
              itemId: 'cert_name_change',
              itemName: 'Сертификат смены никнейма',
              itemIcon: '📜'
            }
          ],
          bannerMessage: 'Заходите каждый день и собирайте сбережения города!'
        });
      case 'default':
      default:
        return this.resetToDefaults();
    }
  }

  public recordClaim(record: {
    userId: string;
    userDisplayName: string;
    day: number;
    credits: number;
    itemId?: string;
  }) {
    const id = 'claim_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO daily_bonus_claims (id, user_id, user_display_name, day, credits, item_id, claimed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      record.userId,
      record.userDisplayName,
      record.day,
      record.credits,
      record.itemId || null,
      now
    );
  }

  public getClaimsHistory(): ClaimRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM daily_bonus_claims ORDER BY claimed_at DESC LIMIT 500
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      userDisplayName: r.user_display_name,
      day: Number(r.day),
      credits: Number(r.credits),
      itemId: r.item_id || undefined,
      claimedAt: r.claimed_at
    }));
  }

  public getStats(totalUsersCount: number, activeStreaksCount: number): {
    totalClaims: number;
    todayClaims: number;
    totalCreditsGiven: number;
    totalItemsGiven: number;
    activeStreaksCount: number;
    claimsHistory: ClaimRecord[];
  } {
    const claims = this.getClaimsHistory();
    const today = new Date().toDateString();

    let todayClaims = 0;
    let totalCreditsGiven = 0;
    let totalItemsGiven = 0;

    claims.forEach(c => {
      totalCreditsGiven += c.credits || 0;
      if (c.itemId) totalItemsGiven++;
      if (new Date(c.claimedAt).toDateString() === today) {
        todayClaims++;
      }
    });

    return {
      totalClaims: claims.length,
      todayClaims,
      totalCreditsGiven,
      totalItemsGiven,
      activeStreaksCount,
      claimsHistory: claims.slice(0, 20)
    };
  }
}

export const dailyBonusDb = new DailyBonusDatabase();
