import { Client } from '@libsql/client';
import { getDatabase, sanitizeArgs, waitForDatabaseInit } from './database';
import {
  PremiumTier,
  PremiumTierConfig,
  PremiumConfig,
  PremiumCertificatePayload,
  UserPremiumStatus,
  ActiveUserPremium,
  PREMIUM_CERTIFICATE_ITEM_ID
} from '../../src/data/items';

export type {
  PremiumTier,
  PremiumTierConfig,
  PremiumConfig,
  PremiumCertificatePayload,
  UserPremiumStatus,
  ActiveUserPremium
};
export { PREMIUM_CERTIFICATE_ITEM_ID };

export const DEFAULT_PREMIUM_TIER_CONFIGS: Record<PremiumTier, PremiumTierConfig> = {
  bronze: {
    doubleDailyBonusCredits: true,
    dailyLootboxEnabled: false,
    dailyLootboxItemId: null
  },
  silver: {
    doubleDailyBonusCredits: false,
    dailyLootboxEnabled: true,
    dailyLootboxItemId: null
  },
  gold: {
    doubleDailyBonusCredits: true,
    dailyLootboxEnabled: true,
    dailyLootboxItemId: null
  }
};

export const DEFAULT_PREMIUM_CONFIG: PremiumConfig = {
  bronze: { ...DEFAULT_PREMIUM_TIER_CONFIGS.bronze },
  silver: { ...DEFAULT_PREMIUM_TIER_CONFIGS.silver },
  gold: { ...DEFAULT_PREMIUM_TIER_CONFIGS.gold },
  updatedAt: new Date(0).toISOString(),
  updatedBy: 'system'
};

/**
 * Validates whether a value is one of the supported Premium tiers ('bronze', 'silver', 'gold').
 */
export function isValidTier(tier: unknown): tier is PremiumTier {
  return tier === 'bronze' || tier === 'silver' || tier === 'gold';
}

/**
 * Validates and sanitizes a tier configuration block.
 * Missing or invalid fields safely fall back to default values.
 */
export function validateTierConfig(raw: any, fallback: PremiumTierConfig): PremiumTierConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...fallback };
  }

  const doubleDailyBonusCredits =
    typeof raw.doubleDailyBonusCredits === 'boolean'
      ? raw.doubleDailyBonusCredits
      : fallback.doubleDailyBonusCredits;

  const dailyLootboxEnabled =
    typeof raw.dailyLootboxEnabled === 'boolean'
      ? raw.dailyLootboxEnabled
      : fallback.dailyLootboxEnabled;

  const dailyLootboxItemId =
    typeof raw.dailyLootboxItemId === 'string' && raw.dailyLootboxItemId.trim().length > 0
      ? raw.dailyLootboxItemId.trim()
      : null;

  return {
    doubleDailyBonusCredits,
    dailyLootboxEnabled,
    dailyLootboxItemId
  };
}

/**
 * Validates a certificate payload for duration and unit.
 * Duration must be a positive integer >= 1.
 * Unit must be 'hours' or 'days'.
 */
export function validateCertificatePayload(payload: any): {
  valid: boolean;
  error?: string;
  normalized?: PremiumCertificatePayload;
} {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Отсутствует дескриптор сертификата' };
  }

  if (!isValidTier(payload.tier)) {
    return {
      valid: false,
      error: `Недопустимый тариф Premium: "${payload.tier}". Разрешены: bronze, silver, gold.`
    };
  }

  const durationNum = Number(payload.duration);
  if (!Number.isFinite(durationNum) || !Number.isSafeInteger(durationNum) || durationNum <= 0) {
    return {
      valid: false,
      error: 'Продолжительность действия сертификата должна быть целым положительным числом >= 1.'
    };
  }

  if (payload.unit !== 'hours' && payload.unit !== 'days') {
    return {
      valid: false,
      error: 'Единица продолжительности должна быть "hours" или "days".'
    };
  }

  return {
    valid: true,
    normalized: {
      tier: payload.tier,
      duration: durationNum,
      unit: payload.unit
    }
  };
}

/**
 * Calculates duration in milliseconds from duration number and unit.
 */
export function calculateDurationMs(duration: number, unit: 'hours' | 'days'): number {
  const cleanDuration = Math.max(0, Math.trunc(duration));
  if (unit === 'hours') {
    return cleanDuration * 3600 * 1000;
  }
  return cleanDuration * 24 * 3600 * 1000;
}

/**
 * Calculates remaining duration in milliseconds until UTC expiration timestamp.
 * Returns 0 if expired or invalid.
 */
export function getRemainingDurationMs(expiresAtIso: string, atTimeMs: number = Date.now()): number {
  if (!expiresAtIso || typeof expiresAtIso !== 'string') return 0;
  const expiresAtMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= atTimeMs) {
    return 0;
  }
  return expiresAtMs - atTimeMs;
}

export function getPremiumTierTitle(tier: string): string {
  switch (tier) {
    case 'bronze':
      return 'Premium Bronze';
    case 'silver':
      return 'Premium Silver';
    case 'gold':
      return 'Premium Gold';
    default:
      return 'Premium';
  }
}

export function formatPremiumDurationServer(duration: number, unit: 'hours' | 'days'): string {
  const mod10 = duration % 10;
  const mod100 = duration % 100;
  if (unit === 'hours') {
    if (mod100 >= 11 && mod100 <= 14) return `${duration} часов`;
    if (mod10 === 1) return `${duration} час`;
    if (mod10 >= 2 && mod10 <= 4) return `${duration} часа`;
    return `${duration} часов`;
  }
  if (mod100 >= 11 && mod100 <= 14) return `${duration} дней`;
  if (mod10 === 1) return `${duration} день`;
  if (mod10 >= 2 && mod10 <= 4) return `${duration} дня`;
  return `${duration} дней`;
}

export interface SetUserPremiumOptions {
  userId: string;
  tier: PremiumTier;
  duration: number;
  unit: 'hours' | 'days';
  source: 'certificate' | 'admin';
  certificateId?: string | null;
  adminId?: string | null;
  confirmTierOverride?: boolean;
}

export interface RevokeUserPremiumOptions {
  userId: string;
  adminId: string;
  reason?: string;
}

/**
 * Dedicated database access layer for Premium Account subsystem.
 * Isolated from inventory and gameplay systems.
 */
export class PremiumDatabase {
  private get db(): Client {
    return getDatabase();
  }

  /**
   * Safe repeatable initial seeding of default tier configs.
   * Does NOT overwrite existing configuration if already seeded.
   */
  public async ensureSeed(): Promise<void> {
    try {
      await waitForDatabaseInit();
      const res = await this.db.execute("SELECT id FROM premium_config WHERE id = 'default'");
      if (!res.rows[0]) {
        const nowIso = new Date().toISOString();
        await this.db.execute({
          sql: `
            INSERT INTO premium_config (
              id, bronze_config, silver_config, gold_config, updated_at, updated_by
            ) VALUES ('default', ?, ?, ?, ?, 'system_seed')
          `,
          args: sanitizeArgs([
            JSON.stringify(DEFAULT_PREMIUM_TIER_CONFIGS.bronze),
            JSON.stringify(DEFAULT_PREMIUM_TIER_CONFIGS.silver),
            JSON.stringify(DEFAULT_PREMIUM_TIER_CONFIGS.gold),
            nowIso
          ])
        });
      }
    } catch (err) {
      console.error('[PremiumDb] ensureSeed error:', err);
    }
  }

  /**
   * Retrieves the current configuration for all 3 Premium tiers.
   * Independent configs for Bronze, Silver, Gold without automatic inheritance.
   */
  public async getConfig(): Promise<PremiumConfig> {
    try {
      await waitForDatabaseInit();
      const res = await this.db.execute("SELECT * FROM premium_config WHERE id = 'default'");
      const row = res.rows[0];
      if (!row) {
        await this.ensureSeed();
        return { ...DEFAULT_PREMIUM_CONFIG, updatedAt: new Date().toISOString() };
      }

      let bronze = DEFAULT_PREMIUM_TIER_CONFIGS.bronze;
      let silver = DEFAULT_PREMIUM_TIER_CONFIGS.silver;
      let gold = DEFAULT_PREMIUM_TIER_CONFIGS.gold;

      try {
        if (row.bronze_config) {
          bronze = validateTierConfig(JSON.parse(String(row.bronze_config)), DEFAULT_PREMIUM_TIER_CONFIGS.bronze);
        }
      } catch {}

      try {
        if (row.silver_config) {
          silver = validateTierConfig(JSON.parse(String(row.silver_config)), DEFAULT_PREMIUM_TIER_CONFIGS.silver);
        }
      } catch {}

      try {
        if (row.gold_config) {
          gold = validateTierConfig(JSON.parse(String(row.gold_config)), DEFAULT_PREMIUM_TIER_CONFIGS.gold);
        }
      } catch {}

      return {
        bronze,
        silver,
        gold,
        updatedAt: String(row.updated_at || new Date().toISOString()),
        updatedBy: row.updated_by ? String(row.updated_by) : null
      };
    } catch {
      return { ...DEFAULT_PREMIUM_CONFIG, updatedAt: new Date().toISOString() };
    }
  }

  /**
   * Updates tier configs in the database with validation.
   * Supports partial updates for independent tiers.
   */
  public async updateConfig(
    updates: Partial<Record<PremiumTier, Partial<PremiumTierConfig>>>,
    adminId?: string
  ): Promise<PremiumConfig> {
    await waitForDatabaseInit();
    const current = await this.getConfig();

    const nextBronze = updates.bronze
      ? validateTierConfig({ ...current.bronze, ...updates.bronze }, current.bronze)
      : current.bronze;

    const nextSilver = updates.silver
      ? validateTierConfig({ ...current.silver, ...updates.silver }, current.silver)
      : current.silver;

    const nextGold = updates.gold
      ? validateTierConfig({ ...current.gold, ...updates.gold }, current.gold)
      : current.gold;

    const nowIso = new Date().toISOString();
    const updatedBy = adminId ? String(adminId).trim() : current.updatedBy || 'admin';

    await this.db.execute({
      sql: `
        INSERT INTO premium_config (id, bronze_config, silver_config, gold_config, updated_at, updated_by)
        VALUES ('default', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          bronze_config = excluded.bronze_config,
          silver_config = excluded.silver_config,
          gold_config = excluded.gold_config,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `,
      args: sanitizeArgs([
        JSON.stringify(nextBronze),
        JSON.stringify(nextSilver),
        JSON.stringify(nextGold),
        nowIso,
        updatedBy
      ])
    });

    return {
      bronze: nextBronze,
      silver: nextSilver,
      gold: nextGold,
      updatedAt: nowIso,
      updatedBy
    };
  }

  /**
   * Resets tier configs back to defaults.
   */
  public async resetToDefaults(adminId?: string): Promise<PremiumConfig> {
    return this.updateConfig(DEFAULT_PREMIUM_TIER_CONFIGS, adminId || 'system_reset');
  }

  /**
   * Checks whether a user currently has an active Premium account.
   * Evaluated strictly using server UTC time (atTimeMs).
   * Returns null if user has no premium, or if expires_at <= atTimeMs.
   */
  public async getActiveUserPremium(
    userId: string,
    atTimeMs: number = Date.now()
  ): Promise<ActiveUserPremium | null> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) return null;

    try {
      await waitForDatabaseInit();
      const res = await this.db.execute({
        sql: 'SELECT * FROM user_premium_status WHERE user_id = ?',
        args: [cleanUserId]
      });

      const row = res.rows[0];
      if (!row) return null;

      const expiresAtIso = String(row.expires_at || '');
      const expiresAtMs = Date.parse(expiresAtIso);

      // Check if expired using exact UTC server time
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= atTimeMs) {
        return null;
      }

      const rawTier = String(row.tier || '').toLowerCase();
      if (!isValidTier(rawTier)) {
        return null;
      }

      const config = await this.getConfig();
      const tierConfig = config[rawTier];

      return {
        tier: rawTier,
        activatedAt: String(row.activated_at || ''),
        expiresAt: expiresAtIso,
        source: (row.source === 'admin' ? 'admin' : 'certificate'),
        certificateId: row.certificate_id ? String(row.certificate_id) : null,
        remainingDurationMs: Math.max(0, expiresAtMs - atTimeMs),
        config: tierConfig
      };
    } catch (err) {
      console.error('[PremiumDb] getActiveUserPremium error:', err);
      return null;
    }
  }

  /**
   * Reads raw stored record from user_premium_status regardless of active/expired state.
   */
  public async getUserPremiumRecord(userId: string): Promise<UserPremiumStatus | null> {
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUserId) return null;

    try {
      await waitForDatabaseInit();
      const res = await this.db.execute({
        sql: 'SELECT * FROM user_premium_status WHERE user_id = ?',
        args: [cleanUserId]
      });

      const row = res.rows[0];
      if (!row) return null;

      const rawTier = String(row.tier || '').toLowerCase();
      if (!isValidTier(rawTier)) return null;

      return {
        userId: String(row.user_id),
        tier: rawTier,
        activatedAt: String(row.activated_at || ''),
        expiresAt: String(row.expires_at || ''),
        source: row.source === 'admin' ? 'admin' : 'certificate',
        certificateId: row.certificate_id ? String(row.certificate_id) : null,
        updatedAt: String(row.updated_at || '')
      };
    } catch (err) {
      console.error('[PremiumDb] getUserPremiumRecord error:', err);
      return null;
    }
  }
}

export const premiumDb = new PremiumDatabase();
