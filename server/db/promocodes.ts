import crypto from 'crypto';
import { Client } from '@libsql/client';
import { getDatabase } from './database';
import { itemsDb, grantInventoryItemWithSnapshot } from './items';
import {
  ItemDefinition,
  LOYALTY_CREDITS_ITEM_ID,
  UserInventoryItem,
} from '../data/items';
import { rewardMutex } from '../utils/asyncLock';
import {
  getDatePartsInTimezone,
  getProjectTimezoneSync,
  getProjectTimezone,
  parseDateTimeInTimezoneToUtcIso,
  getStartOfDayUtcMs,
  getEndOfDayUtcMs,
  isValidIanaTimezone,
} from '../utils/timezone';

const db: {
  execute: Client['execute'];
  transaction: Client['transaction'];
} = {
  execute: (...args: Parameters<Client['execute']>) => getDatabase().execute(...args),
  transaction: (...args: Parameters<Client['transaction']>) => getDatabase().transaction(...args),
};

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type PromoConditionType = 'matches_completed' | 'active_playtime_minutes' | 'reach_level';

export interface PromoRewardCondition {
  type: PromoConditionType;
  target: number; // matches count, minutes of active play, or player level
}

export interface PromoRewardConfig {
  id: string;
  itemId: string;
  quantity: number;
  grantMode: 'immediate' | 'conditional';
  conditionLogic: 'AND' | 'OR';
  conditions: PromoRewardCondition[];
}

export interface PromoRewardSnapshot extends PromoRewardConfig {
  itemTitle: string;
  itemType: string;
  itemIcon: string;
  itemRarity: string;
  itemImageUrl: string;
  itemSnapshot: ItemDefinition | null;
}

export type PromoScheduleType = 'indefinite' | 'start_only' | 'end_only' | 'range' | 'annual';
export type PromoLimitType = 'unlimited' | 'per_cycle' | 'lifetime';

export interface RegularPromoCode {
  id: string;
  codeNormalized: string;
  codeDisplay: string;
  title: string;
  description: string;
  isEnabled: boolean;
  isDeleted: boolean;
  scheduleType: PromoScheduleType;
  scheduleTimezone: string;
  startsAt: string | null;
  endsAt: string | null;
  annualStartMmdd: string | null; // "MM-DD"
  annualEndMmdd: string | null;   // "MM-DD"
  currentCycle: number;
  limitType: PromoLimitType;
  maxActivations: number | null;
  totalActivations: number;
  cycleActivations: number;
  currentCycleKey: string;
  isCurrentlyActiveWindow: boolean;
  effectiveStatus: 'active' | 'disabled' | 'not_started' | 'expired' | 'exhausted';
  rewards: PromoRewardConfig[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerEligibilityConfig {
  enabled: boolean;
  logic: 'AND' | 'OR';
  maxAccountAgeHours?: number | null;
  maxLevel?: number | null;
  minLevel?: number | null;
}

export interface PartnerQualificationCriteria {
  requiredActiveDays: number; // 1..7
  activityType: 'login' | 'completed_match';
  windowDays: number | null; // null = unlimited
}

export type PartnerRewardMode = 'on_activation' | 'on_full_completion';

export interface PartnerRecord {
  id: string;
  userId: string;
  displayNameSnapshot: string;
  emailSnapshot: string;
  userCurrentlyBanned?: boolean;
  userCurrentlyDeleted?: boolean;
  note: string;
  isEnabled: boolean;
  isDeleted: boolean;
  referralCode: PartnerReferralCodeRecord | null;
  stats?: PartnerSummaryStats;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerReferralCodeRecord {
  id: string;
  partnerId: string;
  partnerUserId: string;
  codeNormalized: string;
  codeDisplay: string;
  isEnabled: boolean;
  isDeleted: boolean;
  eligibility: PartnerEligibilityConfig;
  playerRewards: PromoRewardConfig[];
  partnerRewards: PromoRewardConfig[];
  partnerRewardMode: PartnerRewardMode;
  qualificationCriteria: PartnerQualificationCriteria;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerSummaryStats {
  totalBoundPlayers: number;
  boundAtRegistration: number;
  boundInProfile: number;
  qualifiedPlayers: number;
  inProgressPlayers: number;
  expiredPlayers: number;
  playerRewardsFullyCompleted: number;
  partnerRewardsGrantedCount: number;
  partnerRewardsPendingCount: number;
}

export interface PlayerObligationView {
  id: string;
  rewardIndex: number;
  itemId: string;
  itemTitle: string;
  itemType: string;
  itemIcon: string;
  itemImageUrl: string;
  quantity: number;
  grantMode: 'immediate' | 'conditional';
  conditionLogic: 'AND' | 'OR';
  conditions: Array<{
    type: PromoConditionType;
    target: number;
    current: number;
    completed: boolean;
    label: string;
  }>;
  status: 'pending' | 'granted' | 'cancelled_recipient_deleted';
  grantedAt: string | null;
}

export interface PlayerActivationView {
  id: string;
  codeKind: 'regular' | 'partner';
  codeText: string;
  title: string;
  boundVia: 'registration' | 'profile';
  activatedAt: string;
  allPlayerRewardsGranted: boolean;
  obligations: PlayerObligationView[];
}

// ============================================================================
// TIMEZONE & VALIDATION HELPERS (UNIFIED PROJECT TIMEZONE / IANA)
// ============================================================================

export function getMskDateParts(
  date: Date = new Date(),
  timeZone: string = getProjectTimezoneSync()
): {
  year: number;
  month: number;
  day: number;
  dateStr: string; // YYYY-MM-DD
  mmdd: string;    // MM-DD
} {
  const parts = getDatePartsInTimezone(date, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    dateStr: parts.dateStr,
    mmdd: parts.mmdd,
  };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function normalizeCodeString(raw: string): string {
  return String(raw || '').trim().toUpperCase();
}

export function validateCodeFormat(codeNormalized: string): void {
  if (!codeNormalized || codeNormalized.length < 3 || codeNormalized.length > 32) {
    throw new Error('Код должен содержать от 3 до 32 символов');
  }
  if (!/^[A-ZА-ЯЁ0-9_-]+$/i.test(codeNormalized)) {
    throw new Error('Код может содержать только буквы, цифры, дефис и нижнее подчёркивание');
  }
}

/**
 * Evaluates whether a regular promo code's schedule window is active at `now`
 * and computes the deterministic `cycleKey`.
 */
export function evaluatePromoSchedule(
  promo: {
    isEnabled: boolean;
    scheduleType: PromoScheduleType;
    scheduleTimezone?: string | null;
    startsAt: string | null;
    endsAt: string | null;
    annualStartMmdd: string | null;
    annualEndMmdd: string | null;
    currentCycle: number;
  },
  now: Date = new Date(),
  fallbackTimezone: string = getProjectTimezoneSync()
): {
  isWindowActive: boolean;
  windowReason: 'ok' | 'not_started' | 'expired';
  cycleKey: string;
} {
  const nowMs = now.getTime();
  const baseCycle = `c${promo.currentCycle}`;

  if (promo.scheduleType === 'indefinite') {
    return { isWindowActive: true, windowReason: 'ok', cycleKey: baseCycle };
  }

  if (promo.scheduleType === 'start_only') {
    const startMs = promo.startsAt ? Date.parse(promo.startsAt) : NaN;
    if (!Number.isNaN(startMs) && nowMs < startMs) {
      return { isWindowActive: false, windowReason: 'not_started', cycleKey: baseCycle };
    }
    return { isWindowActive: true, windowReason: 'ok', cycleKey: baseCycle };
  }

  if (promo.scheduleType === 'end_only') {
    const endMs = promo.endsAt ? Date.parse(promo.endsAt) : NaN;
    if (!Number.isNaN(endMs) && nowMs > endMs) {
      return { isWindowActive: false, windowReason: 'expired', cycleKey: baseCycle };
    }
    return { isWindowActive: true, windowReason: 'ok', cycleKey: baseCycle };
  }

  if (promo.scheduleType === 'range') {
    const startMs = promo.startsAt ? Date.parse(promo.startsAt) : NaN;
    const endMs = promo.endsAt ? Date.parse(promo.endsAt) : NaN;
    if (!Number.isNaN(startMs) && nowMs < startMs) {
      return { isWindowActive: false, windowReason: 'not_started', cycleKey: baseCycle };
    }
    if (!Number.isNaN(endMs) && nowMs > endMs) {
      return { isWindowActive: false, windowReason: 'expired', cycleKey: baseCycle };
    }
    return { isWindowActive: true, windowReason: 'ok', cycleKey: baseCycle };
  }

  if (promo.scheduleType === 'annual') {
    const startMmdd = (promo.annualStartMmdd || '').trim();
    const endMmdd = (promo.annualEndMmdd || '').trim();
    if (!/^\d{2}-\d{2}$/.test(startMmdd) || !/^\d{2}-\d{2}$/.test(endMmdd)) {
      return { isWindowActive: false, windowReason: 'not_started', cycleKey: `annual:invalid:${baseCycle}` };
    }

    const effectiveTz =
      promo.scheduleTimezone && isValidIanaTimezone(promo.scheduleTimezone)
        ? promo.scheduleTimezone
        : fallbackTimezone;
    const tzDate = getDatePartsInTimezone(now, effectiveTz);
    const currentMmdd = tzDate.mmdd;

    // Same calendar year range (e.g., 05-01 to 05-10 or single day 02-29 to 02-29)
    if (startMmdd <= endMmdd) {
      const cycleStartYear = tzDate.year;
      // Explicit Feb 29 leap year protection
      if ((startMmdd === '02-29' || endMmdd === '02-29') && !isLeapYear(cycleStartYear)) {
        return {
          isWindowActive: false,
          windowReason: 'not_started',
          cycleKey: `annual:${cycleStartYear}:${baseCycle}`,
        };
      }
      if (currentMmdd < startMmdd) {
        return {
          isWindowActive: false,
          windowReason: 'not_started',
          cycleKey: `annual:${cycleStartYear}:${baseCycle}`,
        };
      }
      if (currentMmdd > endMmdd) {
        return {
          isWindowActive: false,
          windowReason: 'expired',
          cycleKey: `annual:${cycleStartYear}:${baseCycle}`,
        };
      }
      return {
        isWindowActive: true,
        windowReason: 'ok',
        cycleKey: `annual:${cycleStartYear}:${baseCycle}`,
      };
    } else {
      // Cross-New-Year range (e.g., 12-25 to 01-10)
      if (currentMmdd >= startMmdd) {
        const cycleStartYear = tzDate.year;
        if (startMmdd === '02-29' && !isLeapYear(cycleStartYear)) {
          return {
            isWindowActive: false,
            windowReason: 'not_started',
            cycleKey: `annual:${cycleStartYear}:${baseCycle}`,
          };
        }
        return {
          isWindowActive: true,
          windowReason: 'ok',
          cycleKey: `annual:${cycleStartYear}:${baseCycle}`,
        };
      }
      if (currentMmdd <= endMmdd) {
        const cycleStartYear = tzDate.year - 1;
        if (endMmdd === '02-29' && !isLeapYear(tzDate.year)) {
          return {
            isWindowActive: false,
            windowReason: 'not_started',
            cycleKey: `annual:${cycleStartYear}:${baseCycle}`,
          };
        }
        return {
          isWindowActive: true,
          windowReason: 'ok',
          cycleKey: `annual:${cycleStartYear}:${baseCycle}`,
        };
      }
      return {
        isWindowActive: false,
        windowReason: 'not_started',
        cycleKey: `annual:${tzDate.year}:${baseCycle}`,
      };
    }
  }

  return { isWindowActive: true, windowReason: 'ok', cycleKey: baseCycle };
}

function safeJsonParse<T>(raw: any, fallback: T): T {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ============================================================================
// MAIN PROMO & PARTNER SERVICE
// ============================================================================

export class PromoCodesDatabase {
  /**
   * Validates a list of reward configs against the unified catalog (`itemsDb`).
   * Ensures quantities > 0 and conditions are valid.
   */
  public async validateAndNormalizeRewards(
    rawRewards: any[],
    allowConditional: boolean = true
  ): Promise<PromoRewardConfig[]> {
    if (!Array.isArray(rawRewards) || rawRewards.length === 0) {
      throw new Error('Необходимо указать хотя бы одну награду');
    }

    const catalogItems = await itemsDb.getAllItems();
    const catalogMap = new Map<string, ItemDefinition>(catalogItems.map((it) => [it.id, it]));

    const result: PromoRewardConfig[] = [];
    for (let i = 0; i < rawRewards.length; i++) {
      const r = rawRewards[i];
      const itemId = String(r?.itemId || '').trim();
      if (!itemId) {
        throw new Error(`Награда #${i + 1}: не выбран предмет из каталога`);
      }
      if (itemId !== LOYALTY_CREDITS_ITEM_ID && !catalogMap.has(itemId)) {
        throw new Error(`Награда #${i + 1}: предмет "${itemId}" не найден в каталоге Клуба`);
      }

      const quantity = Math.floor(Number(r?.quantity));
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1_000_000) {
        throw new Error(`Награда #${i + 1}: количество должно быть целым числом от 1 до 1 000 000`);
      }

      const grantMode: 'immediate' | 'conditional' =
        allowConditional && r?.grantMode === 'conditional' ? 'conditional' : 'immediate';
      const conditionLogic: 'AND' | 'OR' = r?.conditionLogic === 'OR' ? 'OR' : 'AND';

      const conditions: PromoRewardCondition[] = [];
      if (grantMode === 'conditional') {
        const rawConds = Array.isArray(r?.conditions) ? r.conditions : [];
        for (const c of rawConds) {
          const cType = c?.type as PromoConditionType;
          if (
            cType !== 'matches_completed' &&
            cType !== 'active_playtime_minutes' &&
            cType !== 'reach_level'
          ) {
            throw new Error(`Награда #${i + 1}: неизвестный тип условия "${c?.type}"`);
          }
          const target = Number(c?.target);
          if (!Number.isFinite(target) || target <= 0 || target > 100_000) {
            throw new Error(`Награда #${i + 1}: целевое значение условия должно быть больше 0`);
          }
          conditions.push({
            type: cType,
            target: cType === 'active_playtime_minutes' ? Number(target) : Math.floor(target),
          });
        }
        if (conditions.length === 0) {
          throw new Error(`Награда #${i + 1}: для отложенной награды необходимо добавить хотя бы одно условие`);
        }
      }

      result.push({
        id: String(r?.id || `rw_${i + 1}_${crypto.randomUUID().slice(0, 8)}`),
        itemId,
        quantity,
        grantMode,
        conditionLogic,
        conditions,
      });
    }

    return result;
  }

  /**
   * Creates immutable reward snapshots from PromoRewardConfig[] using current catalog state.
   */
  public async buildRewardSnapshots(rewards: PromoRewardConfig[]): Promise<PromoRewardSnapshot[]> {
    const catalogItems = await itemsDb.getAllItems();
    const catalogMap = new Map<string, ItemDefinition>(catalogItems.map((it) => [it.id, it]));

    return rewards.map((r) => {
      if (r.itemId === LOYALTY_CREDITS_ITEM_ID) {
        return {
          ...r,
          itemTitle: 'Кредиты Клуба',
          itemType: 'credits',
          itemIcon: '💰',
          itemRarity: 'rare',
          itemImageUrl: '',
          itemSnapshot: null,
        };
      }
      const shopItem = catalogMap.get(r.itemId) || null;
      const rawIcon = shopItem ? String(shopItem.icon || '🎁') : '🎁';
      const isImageUrl = /^(\/|https?:\/\/|data:image\/)/i.test(rawIcon);
      return {
        ...r,
        itemTitle: shopItem ? shopItem.name : r.itemId,
        itemType: shopItem ? shopItem.category : 'item',
        itemIcon: rawIcon,
        itemRarity: shopItem ? shopItem.rarity : 'common',
        itemImageUrl: isImageUrl ? rawIcon : '',
        itemSnapshot: shopItem ? JSON.parse(JSON.stringify(shopItem)) : null,
      };
    });
  }

  /**
   * Ensures no active regular promo code or active partner referral code has the same normalized code.
   */
  private async assertCodeAvailable(
    codeNormalized: string,
    excludeRegularId?: string,
    excludePartnerCodeId?: string
  ): Promise<void> {
    const regRes = await db.execute({
      sql: 'SELECT id FROM promo_codes WHERE code_normalized = ? AND is_deleted = 0',
      args: [codeNormalized],
    });
    for (const row of regRes.rows) {
      if (String(row.id) !== excludeRegularId) {
        throw new Error(`Промокод "${codeNormalized}" уже существует в списке активных обычных промокодов`);
      }
    }

    const partRes = await db.execute({
      sql: 'SELECT id FROM partner_referral_codes WHERE code_normalized = ? AND is_deleted = 0',
      args: [codeNormalized],
    });
    for (const row of partRes.rows) {
      if (String(row.id) !== excludePartnerCodeId) {
        throw new Error(`Код "${codeNormalized}" уже занят в партнёрской программе`);
      }
    }
  }

  // ==========================================================================
  // REGULAR PROMO CODES (STAGE 2)
  // ==========================================================================

  private mapRegularPromoRow(row: any, now: Date = new Date()): RegularPromoCode {
    const isEnabled = Number(row.is_enabled) === 1;
    const isDeleted = Number(row.is_deleted) === 1;
    const scheduleType = (row.schedule_type || 'indefinite') as PromoScheduleType;
    const scheduleTimezone =
      row.schedule_timezone && isValidIanaTimezone(String(row.schedule_timezone))
        ? String(row.schedule_timezone)
        : 'Europe/Moscow';
    const startsAt = row.starts_at ? String(row.starts_at) : null;
    const endsAt = row.ends_at ? String(row.ends_at) : null;
    const annualStartMmdd = row.annual_start_mmdd ? String(row.annual_start_mmdd) : null;
    const annualEndMmdd = row.annual_end_mmdd ? String(row.annual_end_mmdd) : null;
    const currentCycle = Number(row.current_cycle) || 1;
    const limitType = (row.limit_type || 'unlimited') as PromoLimitType;
    const maxActivations =
      row.max_activations !== null && row.max_activations !== undefined
        ? Number(row.max_activations)
        : null;
    const totalActivations = Number(row.total_activations) || 0;
    const cycleActivations = Number(row.cycle_activations) || 0;

    const sched = evaluatePromoSchedule(
      {
        isEnabled,
        scheduleType,
        scheduleTimezone,
        startsAt,
        endsAt,
        annualStartMmdd,
        annualEndMmdd,
        currentCycle,
      },
      now,
      scheduleTimezone
    );

    let effectiveStatus: RegularPromoCode['effectiveStatus'] = 'active';
    if (!isEnabled) {
      effectiveStatus = 'disabled';
    } else if (!sched.isWindowActive) {
      effectiveStatus = sched.windowReason === 'not_started' ? 'not_started' : 'expired';
    } else if (limitType === 'lifetime' && maxActivations !== null && totalActivations >= maxActivations) {
      effectiveStatus = 'exhausted';
    } else if (limitType === 'per_cycle' && maxActivations !== null && cycleActivations >= maxActivations) {
      effectiveStatus = 'exhausted';
    }

    return {
      id: String(row.id),
      codeNormalized: String(row.code_normalized),
      codeDisplay: String(row.code_display),
      title: String(row.title || ''),
      description: String(row.description || ''),
      isEnabled,
      isDeleted,
      scheduleType,
      scheduleTimezone,
      startsAt,
      endsAt,
      annualStartMmdd,
      annualEndMmdd,
      currentCycle,
      limitType,
      maxActivations,
      totalActivations,
      cycleActivations,
      currentCycleKey: sched.cycleKey,
      isCurrentlyActiveWindow: sched.isWindowActive,
      effectiveStatus,
      rewards: safeJsonParse<PromoRewardConfig[]>(row.rewards_json, []),
      createdBy: row.created_by ? String(row.created_by) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  public async listRegularPromoCodes(now: Date = new Date()): Promise<RegularPromoCode[]> {
    await getProjectTimezone();
    const res = await db.execute(
      'SELECT * FROM promo_codes WHERE is_deleted = 0 ORDER BY created_at DESC'
    );
    return res.rows.map((r) => this.mapRegularPromoRow(r, now));
  }

  public async getRegularPromoCodeById(id: string, now: Date = new Date()): Promise<RegularPromoCode | null> {
    await getProjectTimezone();
    const res = await db.execute({
      sql: 'SELECT * FROM promo_codes WHERE id = ? AND is_deleted = 0',
      args: [id],
    });
    if (res.rows.length === 0) return null;
    return this.mapRegularPromoRow(res.rows[0], now);
  }

  private validateScheduleParams(
    params: {
      scheduleType: PromoScheduleType;
      startsAt?: string | null;
      endsAt?: string | null;
      annualStartMmdd?: string | null;
      annualEndMmdd?: string | null;
    },
    timeZone: string = getProjectTimezoneSync()
  ): {
    scheduleType: PromoScheduleType;
    startsAt: string | null;
    endsAt: string | null;
    annualStartMmdd: string | null;
    annualEndMmdd: string | null;
  } {
    const scheduleType = params.scheduleType || 'indefinite';
    let startsAt = params.startsAt
      ? parseDateTimeInTimezoneToUtcIso(String(params.startsAt).trim(), timeZone)
      : null;
    let endsAt = params.endsAt
      ? parseDateTimeInTimezoneToUtcIso(String(params.endsAt).trim(), timeZone)
      : null;
    let annualStartMmdd = params.annualStartMmdd ? String(params.annualStartMmdd).trim() : null;
    let annualEndMmdd = params.annualEndMmdd ? String(params.annualEndMmdd).trim() : null;

    if (scheduleType === 'start_only') {
      if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
        throw new Error('Укажите корректную дату и время начала действия промокода');
      }
      endsAt = null;
      annualStartMmdd = null;
      annualEndMmdd = null;
    } else if (scheduleType === 'end_only') {
      if (!endsAt || Number.isNaN(Date.parse(endsAt))) {
        throw new Error('Укажите корректную дату и время окончания действия промокода');
      }
      startsAt = null;
      annualStartMmdd = null;
      annualEndMmdd = null;
    } else if (scheduleType === 'range') {
      if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
        throw new Error('Укажите корректную дату и время начала действия промокода');
      }
      if (!endsAt || Number.isNaN(Date.parse(endsAt))) {
        throw new Error('Укажите корректную дату и время окончания действия промокода');
      }
      if (Date.parse(endsAt) <= Date.parse(startsAt)) {
        throw new Error('Дата окончания должна быть позже даты начала');
      }
      annualStartMmdd = null;
      annualEndMmdd = null;
    } else if (scheduleType === 'annual') {
      if (!annualStartMmdd || !/^\d{2}-\d{2}$/.test(annualStartMmdd)) {
        throw new Error('Укажите дату начала ежегодного цикла в формате ММ-ДД (например, 12-25)');
      }
      if (!annualEndMmdd || !/^\d{2}-\d{2}$/.test(annualEndMmdd)) {
        throw new Error('Укажите дату окончания ежегодного цикла в формате ММ-ДД (например, 01-10)');
      }
      startsAt = null;
      endsAt = null;
    } else {
      startsAt = null;
      endsAt = null;
      annualStartMmdd = null;
      annualEndMmdd = null;
    }

    return { scheduleType, startsAt, endsAt, annualStartMmdd, annualEndMmdd };
  }

  public async createRegularPromoCode(params: {
    code: string;
    title?: string;
    description?: string;
    isEnabled?: boolean;
    scheduleType?: PromoScheduleType;
    startsAt?: string | null;
    endsAt?: string | null;
    annualStartMmdd?: string | null;
    annualEndMmdd?: string | null;
    limitType?: PromoLimitType;
    maxActivations?: number | null;
    rewards: any[];
    adminId?: string;
  }): Promise<RegularPromoCode> {
    return rewardMutex.runExclusive('promo_global_activation', async () => {
      const projectTz = await getProjectTimezone();
      const codeDisplay = String(params.code || '').trim().toUpperCase();
      const codeNormalized = normalizeCodeString(codeDisplay);
      validateCodeFormat(codeNormalized);

      await this.assertCodeAvailable(codeNormalized);

      const schedule = this.validateScheduleParams(
        {
          scheduleType: params.scheduleType || 'indefinite',
          startsAt: params.startsAt,
          endsAt: params.endsAt,
          annualStartMmdd: params.annualStartMmdd,
          annualEndMmdd: params.annualEndMmdd,
        },
        projectTz
      );

      const limitType: PromoLimitType = params.limitType || 'unlimited';
      let maxActivations: number | null = null;
      if (limitType === 'per_cycle' || limitType === 'lifetime') {
        const m = Math.floor(Number(params.maxActivations));
        if (!Number.isFinite(m) || m < 1) {
          throw new Error('Лимит активаций должен быть целым числом больше 0');
        }
        maxActivations = m;
      }

      const rewards = await this.validateAndNormalizeRewards(params.rewards, true);
      const id = `promo_${crypto.randomUUID()}`;
      const nowIso = new Date().toISOString();

      await db.execute({
        sql: `INSERT INTO promo_codes (
          id, code_normalized, code_display, title, description,
          is_enabled, is_deleted, schedule_type, schedule_timezone, starts_at, ends_at,
          annual_start_mmdd, annual_end_mmdd, current_cycle,
          limit_type, max_activations, total_activations, cycle_activations,
          rewards_json, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, 0, ?, ?, ?, ?)`,
        args: [
          id,
          codeNormalized,
          codeDisplay,
          String(params.title || '').trim(),
          String(params.description || '').trim(),
          params.isEnabled === false ? 0 : 1,
          schedule.scheduleType,
          projectTz,
          schedule.startsAt,
          schedule.endsAt,
          schedule.annualStartMmdd,
          schedule.annualEndMmdd,
          limitType,
          maxActivations,
          JSON.stringify(rewards),
          params.adminId || null,
          nowIso,
          nowIso,
        ],
      });

      const created = await this.getRegularPromoCodeById(id);
      if (!created) throw new Error('Не удалось создать промокод');
      return created;
    });
  }

  public async updateRegularPromoCode(
    id: string,
    params: {
      code?: string;
      title?: string;
      description?: string;
      isEnabled?: boolean;
      scheduleType?: PromoScheduleType;
      startsAt?: string | null;
      endsAt?: string | null;
      annualStartMmdd?: string | null;
      annualEndMmdd?: string | null;
      limitType?: PromoLimitType;
      maxActivations?: number | null;
      rewards?: any[];
    }
  ): Promise<RegularPromoCode> {
    return rewardMutex.runExclusive('promo_global_activation', async () => {
      const projectTz = await getProjectTimezone();
      const existing = await this.getRegularPromoCodeById(id);
      if (!existing) {
        throw new Error('Промокод не найден или был удалён');
      }

      const codeDisplay =
        params.code !== undefined
          ? String(params.code).trim().toUpperCase()
          : existing.codeDisplay;
      const codeNormalized = normalizeCodeString(codeDisplay);
      validateCodeFormat(codeNormalized);

      if (codeNormalized !== existing.codeNormalized) {
        await this.assertCodeAvailable(codeNormalized, id);
      }

      // Preserve the existing promo's scheduleTimezone unless the schedule parameters were explicitly changed
      const isScheduleModified =
        (params.scheduleType !== undefined && params.scheduleType !== existing.scheduleType) ||
        (params.startsAt !== undefined && params.startsAt !== existing.startsAt) ||
        (params.endsAt !== undefined && params.endsAt !== existing.endsAt) ||
        (params.annualStartMmdd !== undefined && params.annualStartMmdd !== existing.annualStartMmdd) ||
        (params.annualEndMmdd !== undefined && params.annualEndMmdd !== existing.annualEndMmdd);

      const effectiveScheduleTz = isScheduleModified
        ? projectTz
        : existing.scheduleTimezone || projectTz;

      const schedule = this.validateScheduleParams(
        {
          scheduleType: params.scheduleType ?? existing.scheduleType,
          startsAt: params.startsAt !== undefined ? params.startsAt : existing.startsAt,
          endsAt: params.endsAt !== undefined ? params.endsAt : existing.endsAt,
          annualStartMmdd:
            params.annualStartMmdd !== undefined ? params.annualStartMmdd : existing.annualStartMmdd,
          annualEndMmdd:
            params.annualEndMmdd !== undefined ? params.annualEndMmdd : existing.annualEndMmdd,
        },
        effectiveScheduleTz
      );

      const limitType: PromoLimitType = params.limitType ?? existing.limitType;
      let maxActivations: number | null = null;
      if (limitType === 'per_cycle' || limitType === 'lifetime') {
        const rawMax =
          params.maxActivations !== undefined ? params.maxActivations : existing.maxActivations;
        const m = Math.floor(Number(rawMax));
        if (!Number.isFinite(m) || m < 1) {
          throw new Error('Лимит активаций должен быть целым числом больше 0');
        }
        maxActivations = m;
      }

      const rewards =
        params.rewards !== undefined
          ? await this.validateAndNormalizeRewards(params.rewards, true)
          : existing.rewards;

      const isEnabled = params.isEnabled !== undefined ? params.isEnabled : existing.isEnabled;
      const nowIso = new Date().toISOString();

      await db.execute({
        sql: `UPDATE promo_codes SET
          code_normalized = ?,
          code_display = ?,
          title = ?,
          description = ?,
          is_enabled = ?,
          schedule_type = ?,
          schedule_timezone = ?,
          starts_at = ?,
          ends_at = ?,
          annual_start_mmdd = ?,
          annual_end_mmdd = ?,
          limit_type = ?,
          max_activations = ?,
          rewards_json = ?,
          updated_at = ?
        WHERE id = ? AND is_deleted = 0`,
        args: [
          codeNormalized,
          codeDisplay,
          params.title !== undefined ? String(params.title).trim() : existing.title,
          params.description !== undefined ? String(params.description).trim() : existing.description,
          isEnabled ? 1 : 0,
          schedule.scheduleType,
          effectiveScheduleTz,
          schedule.startsAt,
          schedule.endsAt,
          schedule.annualStartMmdd,
          schedule.annualEndMmdd,
          limitType,
          maxActivations,
          JSON.stringify(rewards),
          nowIso,
          id,
        ],
      });

      const updated = await this.getRegularPromoCodeById(id);
      if (!updated) throw new Error('Не удалось обновить промокод');
      return updated;
    });
  }

  /**
   * Manual cycle restart for a Regular Promo Code (Stage 2.3).
   * Increments `current_cycle`, resets `cycle_activations = 0`, preserves all historical
   * activations, granted rewards, and pending obligations.
   */
  public async restartRegularPromoCycle(
    id: string,
    overrides?: {
      scheduleType?: PromoScheduleType;
      startsAt?: string | null;
      endsAt?: string | null;
      annualStartMmdd?: string | null;
      annualEndMmdd?: string | null;
      limitType?: PromoLimitType;
      maxActivations?: number | null;
      isEnabled?: boolean;
    }
  ): Promise<RegularPromoCode> {
    return rewardMutex.runExclusive('promo_global_activation', async () => {
      const projectTz = await getProjectTimezone();
      const existing = await this.getRegularPromoCodeById(id);
      if (!existing) {
        throw new Error('Промокод не найден или был удалён');
      }

      const schedule = this.validateScheduleParams(
        {
          scheduleType: overrides?.scheduleType ?? existing.scheduleType,
          startsAt: overrides?.startsAt !== undefined ? overrides.startsAt : existing.startsAt,
          endsAt: overrides?.endsAt !== undefined ? overrides.endsAt : existing.endsAt,
          annualStartMmdd:
            overrides?.annualStartMmdd !== undefined
              ? overrides.annualStartMmdd
              : existing.annualStartMmdd,
          annualEndMmdd:
            overrides?.annualEndMmdd !== undefined ? overrides.annualEndMmdd : existing.annualEndMmdd,
        },
        projectTz
      );

      const limitType: PromoLimitType = overrides?.limitType ?? existing.limitType;
      let maxActivations: number | null = null;
      if (limitType === 'per_cycle' || limitType === 'lifetime') {
        const rawMax =
          overrides?.maxActivations !== undefined
            ? overrides.maxActivations
            : existing.maxActivations;
        const m = Math.floor(Number(rawMax));
        if (!Number.isFinite(m) || m < 1) {
          throw new Error('Лимит активаций должен быть целым числом больше 0');
        }
        maxActivations = m;
      }

      const newCycle = existing.currentCycle + 1;
      const isEnabled = overrides?.isEnabled !== undefined ? overrides.isEnabled : true;
      const nowIso = new Date().toISOString();

      await db.execute({
        sql: `UPDATE promo_codes SET
          current_cycle = ?,
          cycle_activations = 0,
          is_enabled = ?,
          schedule_type = ?,
          schedule_timezone = ?,
          starts_at = ?,
          ends_at = ?,
          annual_start_mmdd = ?,
          annual_end_mmdd = ?,
          limit_type = ?,
          max_activations = ?,
          updated_at = ?
        WHERE id = ? AND is_deleted = 0`,
        args: [
          newCycle,
          isEnabled ? 1 : 0,
          schedule.scheduleType,
          projectTz,
          schedule.startsAt,
          schedule.endsAt,
          schedule.annualStartMmdd,
          schedule.annualEndMmdd,
          limitType,
          maxActivations,
          nowIso,
          id,
        ],
      });

      const updated = await this.getRegularPromoCodeById(id);
      if (!updated) throw new Error('Не удалось перезапустить цикл промокода');
      return updated;
    });
  }

  /**
   * Soft-deletes a regular promo code (Stage 2.5):
   * - Stops future activations and removes from active admin list
   * - Frees codeNormalized for reuse with a new ID
   * - Preserves all `promo_activations`, `promo_reward_obligations`, and `economy_transactions`
   */
  public async deleteRegularPromoCode(id: string): Promise<void> {
    await rewardMutex.runExclusive('promo_global_activation', async () => {
      const nowIso = new Date().toISOString();
      await db.execute({
        sql: 'UPDATE promo_codes SET is_deleted = 1, is_enabled = 0, deleted_at = ?, updated_at = ? WHERE id = ?',
        args: [nowIso, nowIso, id],
      });
    });
  }

  public async getRegularPromoDetails(id: string): Promise<{
    promo: RegularPromoCode;
    activations: Array<{
      id: string;
      userId: string;
      userDisplayName: string;
      userEmail: string;
      cycleKey: string;
      activatedAt: string;
      allPlayerRewardsGranted: boolean;
      currentGamesSince: number;
      currentActiveMinutesSince: number;
      currentLevel: number;
    }>;
  }> {
    const promo = await this.getRegularPromoCodeById(id);
    if (!promo) throw new Error('Промокод не найден');

    const actRes = await db.execute({
      sql: `SELECT * FROM promo_activations WHERE code_kind = 'regular' AND promo_code_id = ? ORDER BY activated_at DESC LIMIT 250`,
      args: [id],
    });

    return {
      promo,
      activations: actRes.rows.map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        userDisplayName: String(r.user_display_name_snapshot || 'Игрок'),
        userEmail: String(r.user_email_snapshot || ''),
        cycleKey: String(r.cycle_key),
        activatedAt: String(r.activated_at),
        allPlayerRewardsGranted: Number(r.all_player_rewards_granted) === 1,
        currentGamesSince: Number(r.current_games_since) || 0,
        currentActiveMinutesSince: Math.round(((Number(r.current_active_seconds_since) || 0) / 60) * 10) / 10,
        currentLevel: Number(r.current_level) || 1,
      })),
    };
  }

  // ==========================================================================
  // PARTNER REFERRAL PROGRAM (STAGES 3, 5, 6, 7)
  // ==========================================================================

  private mapPartnerCodeRow(row: any): PartnerReferralCodeRecord {
    const rawElig = safeJsonParse<Partial<PartnerEligibilityConfig>>(row.eligibility_json, {});
    const rawQual = safeJsonParse<Partial<PartnerQualificationCriteria>>(
      row.qualification_criteria_json,
      {}
    );

    return {
      id: String(row.id),
      partnerId: String(row.partner_id),
      partnerUserId: String(row.partner_user_id),
      codeNormalized: String(row.code_normalized),
      codeDisplay: String(row.code_display),
      isEnabled: Number(row.is_enabled) === 1,
      isDeleted: Number(row.is_deleted) === 1,
      eligibility: {
        enabled: Boolean(rawElig.enabled),
        logic: rawElig.logic === 'OR' ? 'OR' : 'AND',
        maxAccountAgeHours:
          rawElig.maxAccountAgeHours !== null && rawElig.maxAccountAgeHours !== undefined
            ? Number(rawElig.maxAccountAgeHours)
            : null,
        maxLevel:
          rawElig.maxLevel !== null && rawElig.maxLevel !== undefined
            ? Number(rawElig.maxLevel)
            : null,
        minLevel:
          rawElig.minLevel !== null && rawElig.minLevel !== undefined
            ? Number(rawElig.minLevel)
            : null,
      },
      playerRewards: safeJsonParse<PromoRewardConfig[]>(row.player_rewards_json, []),
      partnerRewards: safeJsonParse<PromoRewardConfig[]>(row.partner_rewards_json, []),
      partnerRewardMode:
        row.partner_reward_mode === 'on_full_completion' ? 'on_full_completion' : 'on_activation',
      qualificationCriteria: {
        requiredActiveDays: Math.min(7, Math.max(1, Number(rawQual.requiredActiveDays) || 1)),
        activityType: rawQual.activityType === 'login' ? 'login' : 'completed_match',
        windowDays:
          rawQual.windowDays !== null &&
          rawQual.windowDays !== undefined &&
          Number(rawQual.windowDays) > 0
            ? Math.floor(Number(rawQual.windowDays))
            : null,
      },
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private normalizeEligibility(raw: any): PartnerEligibilityConfig {
    if (!raw || typeof raw !== 'object' || !raw.enabled) {
      return {
        enabled: false,
        logic: 'AND',
        maxAccountAgeHours: null,
        maxLevel: null,
        minLevel: null,
      };
    }
    const maxAccountAgeHours =
      raw.maxAccountAgeHours !== null &&
      raw.maxAccountAgeHours !== undefined &&
      String(raw.maxAccountAgeHours).trim() !== ''
        ? Number(raw.maxAccountAgeHours)
        : null;
    const maxLevel =
      raw.maxLevel !== null && raw.maxLevel !== undefined && String(raw.maxLevel).trim() !== ''
        ? Math.floor(Number(raw.maxLevel))
        : null;
    const minLevel =
      raw.minLevel !== null && raw.minLevel !== undefined && String(raw.minLevel).trim() !== ''
        ? Math.floor(Number(raw.minLevel))
        : null;

    if (maxAccountAgeHours !== null && (!Number.isFinite(maxAccountAgeHours) || maxAccountAgeHours <= 0)) {
      throw new Error('Максимальный возраст аккаунта должен быть больше 0 часов');
    }
    if (maxLevel !== null && (!Number.isFinite(maxLevel) || maxLevel < 1)) {
      throw new Error('Максимальный уровень должен быть не менее 1');
    }
    if (minLevel !== null && (!Number.isFinite(minLevel) || minLevel < 1)) {
      throw new Error('Минимальный уровень должен быть не менее 1');
    }

    return {
      enabled: true,
      logic: raw.logic === 'OR' ? 'OR' : 'AND',
      maxAccountAgeHours,
      maxLevel,
      minLevel,
    };
  }

  private normalizeQualificationCriteria(raw: any): PartnerQualificationCriteria {
    const requiredActiveDays = Math.floor(Number(raw?.requiredActiveDays ?? 1));
    if (!Number.isFinite(requiredActiveDays) || requiredActiveDays < 1 || requiredActiveDays > 7) {
      throw new Error('Количество активных дней для успешного привлечения должно быть от 1 до 7');
    }
    const activityType: 'login' | 'completed_match' =
      raw?.activityType === 'login' ? 'login' : 'completed_match';
    let windowDays: number | null = null;
    if (
      raw?.windowDays !== null &&
      raw?.windowDays !== undefined &&
      String(raw.windowDays).trim() !== ''
    ) {
      const w = Math.floor(Number(raw.windowDays));
      if (!Number.isFinite(w) || w < 1 || w > 3650) {
        throw new Error('Срок выполнения критерия привлечения должен быть от 1 до 3650 дней');
      }
      windowDays = w;
    }
    return { requiredActiveDays, activityType, windowDays };
  }

  public async computePartnerSummaryStats(
    partnerId: string,
    referralCodeId: string | null,
    filterFrom?: string | null,
    filterTo?: string | null,
    now: Date = new Date()
  ): Promise<PartnerSummaryStats> {
    if (!referralCodeId) {
      return {
        totalBoundPlayers: 0,
        boundAtRegistration: 0,
        boundInProfile: 0,
        qualifiedPlayers: 0,
        inProgressPlayers: 0,
        expiredPlayers: 0,
        playerRewardsFullyCompleted: 0,
        partnerRewardsGrantedCount: 0,
        partnerRewardsPendingCount: 0,
      };
    }

    // Refresh any expired qualifications first
    await this.refreshPartnerQualificationExpirations(partnerId, now);

    const projectTz = await getProjectTimezone();
    let sql = `SELECT * FROM promo_activations WHERE code_kind = 'partner' AND partner_id = ? AND promo_code_id = ?`;
    const args: any[] = [partnerId, referralCodeId];

    if (filterFrom && String(filterFrom).trim()) {
      const rawFrom = String(filterFrom).trim();
      const fromMs = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom)
        ? getStartOfDayUtcMs(rawFrom, projectTz)
        : Date.parse(rawFrom);
      if (!Number.isNaN(fromMs)) {
        sql += ` AND activated_at >= ?`;
        args.push(new Date(fromMs).toISOString());
      }
    }
    if (filterTo && String(filterTo).trim()) {
      const rawTo = String(filterTo).trim();
      const toMs = /^\d{4}-\d{2}-\d{2}$/.test(rawTo)
        ? getEndOfDayUtcMs(rawTo, projectTz)
        : Date.parse(rawTo);
      if (!Number.isNaN(toMs)) {
        sql += ` AND activated_at <= ?`;
        args.push(new Date(toMs).toISOString());
      }
    }

    const res = await db.execute({ sql, args });
    let totalBoundPlayers = 0;
    let boundAtRegistration = 0;
    let boundInProfile = 0;
    let qualifiedPlayers = 0;
    let inProgressPlayers = 0;
    let expiredPlayers = 0;
    let playerRewardsFullyCompleted = 0;
    let partnerRewardsGrantedCount = 0;
    let partnerRewardsPendingCount = 0;

    for (const row of res.rows) {
      totalBoundPlayers++;
      if (row.bound_via === 'registration') boundAtRegistration++;
      else boundInProfile++;

      const qStatus = String(row.qualification_status || 'in_progress');
      if (qStatus === 'qualified') qualifiedPlayers++;
      else if (qStatus === 'expired') expiredPlayers++;
      else inProgressPlayers++;

      if (Number(row.all_player_rewards_granted) === 1) {
        playerRewardsFullyCompleted++;
      }

      const pStatus = String(row.partner_reward_status || '');
      if (pStatus === 'granted') partnerRewardsGrantedCount++;
      else if (pStatus === 'pending_conditions' || pStatus === 'pending_unban') {
        partnerRewardsPendingCount++;
      }
    }

    return {
      totalBoundPlayers,
      boundAtRegistration,
      boundInProfile,
      qualifiedPlayers,
      inProgressPlayers,
      expiredPlayers,
      playerRewardsFullyCompleted,
      partnerRewardsGrantedCount,
      partnerRewardsPendingCount,
    };
  }

  public async listPartners(now: Date = new Date()): Promise<PartnerRecord[]> {
    const pRes = await db.execute(
      'SELECT * FROM partners WHERE is_deleted = 0 ORDER BY created_at DESC'
    );
    const cRes = await db.execute(
      'SELECT * FROM partner_referral_codes WHERE is_deleted = 0'
    );
    const codeByPartner = new Map<string, PartnerReferralCodeRecord>();
    for (const r of cRes.rows) {
      codeByPartner.set(String(r.partner_id), this.mapPartnerCodeRow(r));
    }

    const out: PartnerRecord[] = [];
    for (const row of pRes.rows) {
      const partnerId = String(row.id);
      const userId = String(row.user_id);
      const refCode = codeByPartner.get(partnerId) || null;
      const stats = await this.computePartnerSummaryStats(
        partnerId,
        refCode?.id || null,
        null,
        null,
        now
      );

      const uRes = await db.execute({
        sql: 'SELECT id, display_name, email, is_banned FROM users WHERE id = ?',
        args: [userId],
      });
      const uRow = uRes.rows[0];

      out.push({
        id: partnerId,
        userId,
        displayNameSnapshot: uRow ? String(uRow.display_name) : String(row.display_name_snapshot),
        emailSnapshot: uRow ? String(uRow.email) : String(row.email_snapshot),
        userCurrentlyBanned: uRow ? Number(uRow.is_banned) === 1 : false,
        userCurrentlyDeleted: !uRow,
        note: String(row.note || ''),
        isEnabled: Number(row.is_enabled) === 1,
        isDeleted: Number(row.is_deleted) === 1,
        referralCode: refCode,
        stats,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      });
    }
    return out;
  }

  public async createPartnerWithReferralCode(params: {
    userId: string;
    note?: string;
    isEnabled?: boolean;
    code: string;
    eligibility?: any;
    playerRewards: any[];
    partnerRewards: any[];
    partnerRewardMode?: PartnerRewardMode;
    qualificationCriteria?: any;
    adminId?: string;
  }): Promise<PartnerRecord> {
    return rewardMutex.runExclusive('promo_global_activation', async () => {
      const userId = String(params.userId || '').trim();
      if (!userId) throw new Error('Необходимо выбрать аккаунт игрока-партнёра');

      const userRes = await db.execute({
        sql: 'SELECT id, display_name, email FROM users WHERE id = ?',
        args: [userId],
      });
      if (userRes.rows.length === 0) {
        throw new Error('Выбранный аккаунт игрока не найден в базе данных');
      }
      const userRow = userRes.rows[0];

      // Check that this user doesn't already have an active partner record
      const existingPartnerRes = await db.execute({
        sql: 'SELECT id FROM partners WHERE user_id = ? AND is_deleted = 0',
        args: [userId],
      });
      if (existingPartnerRes.rows.length > 0) {
        throw new Error('Этот игрок уже зарегистрирован как активный партнёр (у каждого партнёра может быть только 1 реферальный код)');
      }

      const codeDisplay = String(params.code || '').trim().toUpperCase();
      const codeNormalized = normalizeCodeString(codeDisplay);
      validateCodeFormat(codeNormalized);
      await this.assertCodeAvailable(codeNormalized);

      const eligibility = this.normalizeEligibility(params.eligibility);
      const playerRewards = await this.validateAndNormalizeRewards(params.playerRewards, true);
      const partnerRewards =
        Array.isArray(params.partnerRewards) && params.partnerRewards.length > 0
          ? await this.validateAndNormalizeRewards(params.partnerRewards, false)
          : [];
      const partnerRewardMode: PartnerRewardMode =
        params.partnerRewardMode === 'on_full_completion' ? 'on_full_completion' : 'on_activation';
      const qualificationCriteria = this.normalizeQualificationCriteria(params.qualificationCriteria);

      const partnerId = `partner_${crypto.randomUUID()}`;
      const codeId = `refcode_${crypto.randomUUID()}`;
      const isEnabled = params.isEnabled === false ? 0 : 1;
      const nowIso = new Date().toISOString();

      const tx = await db.transaction('write');
      try {
        await tx.execute({
          sql: `INSERT INTO partners (
            id, user_id, display_name_snapshot, email_snapshot, note,
            is_enabled, is_deleted, referral_code_id, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
          args: [
            partnerId,
            userId,
            String(userRow.display_name || 'Игрок'),
            String(userRow.email || ''),
            String(params.note || '').trim(),
            isEnabled,
            codeId,
            params.adminId || null,
            nowIso,
            nowIso,
          ],
        });

        await tx.execute({
          sql: `INSERT INTO partner_referral_codes (
            id, partner_id, partner_user_id, code_normalized, code_display,
            is_enabled, is_deleted, eligibility_json, player_rewards_json,
            partner_rewards_json, partner_reward_mode, qualification_criteria_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            codeId,
            partnerId,
            userId,
            codeNormalized,
            codeDisplay,
            isEnabled,
            JSON.stringify(eligibility),
            JSON.stringify(playerRewards),
            JSON.stringify(partnerRewards),
            partnerRewardMode,
            JSON.stringify(qualificationCriteria),
            nowIso,
            nowIso,
          ],
        });

        await tx.commit();
      } catch (e) {
        try {
          await tx.rollback();
        } catch {
          // ignore rollback error
        }
        throw e;
      }

      const all = await this.listPartners();
      const created = all.find((p) => p.id === partnerId);
      if (!created) throw new Error('Не удалось создать карточку партнёра');
      return created;
    });
  }

  public async updatePartnerAndReferralCode(
    partnerId: string,
    params: {
      note?: string;
      isEnabled?: boolean;
      code?: string;
      eligibility?: any;
      playerRewards?: any[];
      partnerRewards?: any[];
      partnerRewardMode?: PartnerRewardMode;
      qualificationCriteria?: any;
    }
  ): Promise<PartnerRecord> {
    return rewardMutex.runExclusive('promo_global_activation', async () => {
      const pRes = await db.execute({
        sql: 'SELECT * FROM partners WHERE id = ? AND is_deleted = 0',
        args: [partnerId],
      });
      if (pRes.rows.length === 0) {
        throw new Error('Партнёр не найден или был удалён');
      }
      const pRow = pRes.rows[0];

      const cRes = await db.execute({
        sql: 'SELECT * FROM partner_referral_codes WHERE partner_id = ? AND is_deleted = 0',
        args: [partnerId],
      });
      if (cRes.rows.length === 0) {
        throw new Error('Реферальный код партнёра не найден');
      }
      const existingCode = this.mapPartnerCodeRow(cRes.rows[0]);

      const codeDisplay =
        params.code !== undefined
          ? String(params.code).trim().toUpperCase()
          : existingCode.codeDisplay;
      const codeNormalized = normalizeCodeString(codeDisplay);
      validateCodeFormat(codeNormalized);

      if (codeNormalized !== existingCode.codeNormalized) {
        await this.assertCodeAvailable(codeNormalized, undefined, existingCode.id);
      }

      const eligibility =
        params.eligibility !== undefined
          ? this.normalizeEligibility(params.eligibility)
          : existingCode.eligibility;

      const playerRewards =
        params.playerRewards !== undefined
          ? await this.validateAndNormalizeRewards(params.playerRewards, true)
          : existingCode.playerRewards;

      const partnerRewards =
        params.partnerRewards !== undefined
          ? Array.isArray(params.partnerRewards) && params.partnerRewards.length > 0
            ? await this.validateAndNormalizeRewards(params.partnerRewards, false)
            : []
          : existingCode.partnerRewards;

      const partnerRewardMode: PartnerRewardMode =
        params.partnerRewardMode !== undefined
          ? params.partnerRewardMode === 'on_full_completion'
            ? 'on_full_completion'
            : 'on_activation'
          : existingCode.partnerRewardMode;

      const qualificationCriteria =
        params.qualificationCriteria !== undefined
          ? this.normalizeQualificationCriteria(params.qualificationCriteria)
          : existingCode.qualificationCriteria;

      const isEnabled =
        params.isEnabled !== undefined ? (params.isEnabled ? 1 : 0) : Number(pRow.is_enabled);
      const note = params.note !== undefined ? String(params.note).trim() : String(pRow.note || '');
      const nowIso = new Date().toISOString();

      const tx = await db.transaction('write');
      try {
        await tx.execute({
          sql: 'UPDATE partners SET note = ?, is_enabled = ?, updated_at = ? WHERE id = ?',
          args: [note, isEnabled, nowIso, partnerId],
        });
        await tx.execute({
          sql: `UPDATE partner_referral_codes SET
            code_normalized = ?,
            code_display = ?,
            is_enabled = ?,
            eligibility_json = ?,
            player_rewards_json = ?,
            partner_rewards_json = ?,
            partner_reward_mode = ?,
            qualification_criteria_json = ?,
            updated_at = ?
          WHERE id = ?`,
          args: [
            codeNormalized,
            codeDisplay,
            isEnabled,
            JSON.stringify(eligibility),
            JSON.stringify(playerRewards),
            JSON.stringify(partnerRewards),
            partnerRewardMode,
            JSON.stringify(qualificationCriteria),
            nowIso,
            existingCode.id,
          ],
        });
        await tx.commit();
      } catch (e) {
        try {
          await tx.rollback();
        } catch {
          // ignore
        }
        throw e;
      }

      const all = await this.listPartners();
      const updated = all.find((p) => p.id === partnerId);
      if (!updated) throw new Error('Не удалось обновить карточку партнёра');
      return updated;
    });
  }

  /**
   * Soft-deletes a Partner & their Referral Code (Stage 3.5):
   * - Stops new activations
   * - Clears active partner admin card & frees the code string for reuse with a new ID
   * - Preserves `user_partner_bindings` (players who already activated a partner code remain permanently bound and cannot activate a second partner code)
   * - Preserves already granted player/partner rewards and pending player obligations
   */
  public async deletePartner(partnerId: string): Promise<void> {
    await rewardMutex.runExclusive('promo_global_activation', async () => {
      const nowIso = new Date().toISOString();
      const tx = await db.transaction('write');
      try {
        await tx.execute({
          sql: 'UPDATE partners SET is_deleted = 1, is_enabled = 0, deleted_at = ?, updated_at = ? WHERE id = ?',
          args: [nowIso, nowIso, partnerId],
        });
        await tx.execute({
          sql: 'UPDATE partner_referral_codes SET is_deleted = 1, is_enabled = 0, deleted_at = ?, updated_at = ? WHERE partner_id = ?',
          args: [nowIso, nowIso, partnerId],
        });
        await tx.commit();
      } catch (e) {
        try {
          await tx.rollback();
        } catch {
          // ignore
        }
        throw e;
      }
    });
  }

  public async getPartnerDetailedReport(
    partnerId: string,
    filterFrom?: string | null,
    filterTo?: string | null,
    now: Date = new Date()
  ): Promise<{
    partner: PartnerRecord;
    filteredStats: PartnerSummaryStats;
    activations: Array<{
      id: string;
      userId: string;
      userDisplayName: string;
      userEmail: string;
      userDeleted: boolean;
      boundVia: 'registration' | 'profile';
      activatedAt: string;
      currentGamesSince: number;
      currentActiveMinutesSince: number;
      currentLevel: number;
      allPlayerRewardsGranted: boolean;
      partnerRewardStatus: string;
      partnerRewardGrantedAt: string | null;
      qualificationStatus: 'in_progress' | 'qualified' | 'expired' | 'not_applicable';
      qualifiedAt: string | null;
      activeDaysCount: number;
      requiredActiveDays: number;
      activeDaysList: string[];
    }>;
    partnerPayoutHistory: Array<{
      id: string;
      invitedUserId: string;
      invitedUserName: string;
      status: string;
      itemTitle: string;
      quantity: number;
      grantedAt: string | null;
      createdAt: string;
    }>;
  }> {
    const partners = await this.listPartners(now);
    const partner = partners.find((p) => p.id === partnerId);
    if (!partner || !partner.referralCode) {
      throw new Error('Партнёр не найден');
    }

    const filteredStats = await this.computePartnerSummaryStats(
      partnerId,
      partner.referralCode.id,
      filterFrom,
      filterTo,
      now
    );

    const projectTz = await getProjectTimezone();
    let actSql = `SELECT * FROM promo_activations WHERE code_kind = 'partner' AND partner_id = ? AND promo_code_id = ?`;
    const actArgs: any[] = [partnerId, partner.referralCode.id];
    if (filterFrom && String(filterFrom).trim()) {
      const rawFrom = String(filterFrom).trim();
      const fromMs = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom)
        ? getStartOfDayUtcMs(rawFrom, projectTz)
        : Date.parse(rawFrom);
      if (!Number.isNaN(fromMs)) {
        actSql += ` AND activated_at >= ?`;
        actArgs.push(new Date(fromMs).toISOString());
      }
    }
    if (filterTo && String(filterTo).trim()) {
      const rawTo = String(filterTo).trim();
      const toMs = /^\d{4}-\d{2}-\d{2}$/.test(rawTo)
        ? getEndOfDayUtcMs(rawTo, projectTz)
        : Date.parse(rawTo);
      if (!Number.isNaN(toMs)) {
        actSql += ` AND activated_at <= ?`;
        actArgs.push(new Date(toMs).toISOString());
      }
    }
    actSql += ` ORDER BY activated_at DESC LIMIT 300`;

    const actRes = await db.execute({ sql: actSql, args: actArgs });
    const activations = actRes.rows.map((r) => {
      const snap = safeJsonParse<any>(r.snapshot_json, {});
      const reqDays = Number(snap?.qualificationCriteria?.requiredActiveDays) || partner.referralCode!.qualificationCriteria.requiredActiveDays || 1;
      const activeDaysList = safeJsonParse<string[]>(r.active_days_json, []);
      return {
        id: String(r.id),
        userId: String(r.user_id),
        userDisplayName: Number(r.user_deleted) === 1
          ? `${r.user_display_name_snapshot || 'Игрок'} (удалён)`
          : String(r.user_display_name_snapshot || 'Игрок'),
        userEmail: Number(r.user_deleted) === 1 ? '—' : String(r.user_email_snapshot || ''),
        userDeleted: Number(r.user_deleted) === 1,
        boundVia: (r.bound_via === 'registration' ? 'registration' : 'profile') as 'registration' | 'profile',
        activatedAt: String(r.activated_at),
        currentGamesSince: Number(r.current_games_since) || 0,
        currentActiveMinutesSince: Math.round(((Number(r.current_active_seconds_since) || 0) / 60) * 10) / 10,
        currentLevel: Number(r.current_level) || 1,
        allPlayerRewardsGranted: Number(r.all_player_rewards_granted) === 1,
        partnerRewardStatus: String(r.partner_reward_status || 'not_applicable'),
        partnerRewardGrantedAt: r.partner_reward_granted_at ? String(r.partner_reward_granted_at) : null,
        qualificationStatus: (r.qualification_status || 'in_progress') as any,
        qualifiedAt: r.qualified_at ? String(r.qualified_at) : null,
        activeDaysCount: activeDaysList.length,
        requiredActiveDays: reqDays,
        activeDaysList,
      };
    });

    const obRes = await db.execute({
      sql: `SELECT o.*, a.user_display_name_snapshot, a.promo_code_id
            FROM promo_reward_obligations o
            JOIN promo_activations a ON a.id = o.activation_id
            WHERE a.partner_id = ? AND a.promo_code_id = ? AND o.recipient_type = 'partner'
            ORDER BY o.created_at DESC LIMIT 300`,
      args: [partnerId, partner.referralCode.id],
    });

    const partnerPayoutHistory = obRes.rows.map((row) => {
      const rwSnap = safeJsonParse<PromoRewardSnapshot>(row.reward_snapshot_json, {} as any);
      return {
        id: String(row.id),
        invitedUserId: String(row.user_id),
        invitedUserName: String(row.user_display_name_snapshot || 'Игрок'),
        status: String(row.status),
        itemTitle: String(rwSnap.itemTitle || rwSnap.itemId || 'Награда'),
        quantity: Number(rwSnap.quantity) || 1,
        grantedAt: row.granted_at ? String(row.granted_at) : null,
        createdAt: String(row.created_at),
      };
    });

    return {
      partner,
      filteredStats,
      activations,
      partnerPayoutHistory,
    };
  }

  // ==========================================================================
  // PLAYER VALIDATION & ACTIVATION ENGINE (STAGES 2, 3, 4, 5, 6, 8, 9)
  // ==========================================================================

  /**
   * Pre-validates a Partner Referral Code before registration completes so that
   * if the user typed a non-existent or disabled referral code on the registration form,
   * they get a clear error message before the account is created.
   */
  public async validatePartnerCodeForRegistration(
    rawCode: string,
    initialLevel: number = 1
  ): Promise<PartnerReferralCodeRecord> {
    const codeNormalized = normalizeCodeString(rawCode);
    if (!codeNormalized) {
      throw new Error('Промокод не найден');
    }

    const partRes = await db.execute({
      sql: `SELECT c.*, p.is_enabled AS partner_enabled, p.is_deleted AS partner_deleted
            FROM partner_referral_codes c
            JOIN partners p ON p.id = c.partner_id
            WHERE c.code_normalized = ? AND c.is_deleted = 0 AND p.is_deleted = 0`,
      args: [codeNormalized],
    });

    if (partRes.rows.length === 0) {
      // Check if they accidentally entered a regular promo code in the partner registration field
      const regRes = await db.execute({
        sql: 'SELECT id FROM promo_codes WHERE code_normalized = ? AND is_deleted = 0',
        args: [codeNormalized],
      });
      if (regRes.rows.length > 0) {
        throw new Error('При регистрации можно указать только реферальный код партнёра. Обычный промокод вы сможете активировать в Личном кабинете сразу после входа.');
      }
      throw new Error('Промокод не найден');
    }

    const row = partRes.rows[0];
    if (Number(row.is_enabled) !== 1 || Number(row.partner_enabled) !== 1) {
      throw new Error('Этот промокод отключён администратором');
    }

    const mapped = this.mapPartnerCodeRow(row);
    const effectiveLevel = Math.max(1, Math.floor(Number(initialLevel) || 1));
    if (mapped.eligibility.enabled) {
      const checks: boolean[] = [];
      if (mapped.eligibility.maxAccountAgeHours !== null && mapped.eligibility.maxAccountAgeHours !== undefined) {
        checks.push(true); // brand new account age is 0
      }
      if (mapped.eligibility.maxLevel !== null && mapped.eligibility.maxLevel !== undefined) {
        checks.push(effectiveLevel <= mapped.eligibility.maxLevel);
      }
      if (mapped.eligibility.minLevel !== null && mapped.eligibility.minLevel !== undefined) {
        checks.push(effectiveLevel >= mapped.eligibility.minLevel);
      }
      if (checks.length > 0) {
        const passed =
          mapped.eligibility.logic === 'OR' ? checks.some(Boolean) : checks.every(Boolean);
        if (!passed) {
          throw new Error('Ваш аккаунт не подходит под условия этого реферального кода');
        }
      }
    }

    return mapped;
  }

  /**
   * Evaluates whether a player condition is met given activation progress.
   */
  public evaluateSingleCondition(
    cond: PromoRewardCondition,
    progress: {
      gamesSinceActivation: number;
      activeSecondsSinceActivation: number;
      currentLevel: number;
    }
  ): { completed: boolean; current: number; target: number; label: string } {
    if (cond.type === 'matches_completed') {
      const target = Math.max(1, Math.floor(Number(cond.target)));
      const current = Math.min(target, Math.max(0, progress.gamesSinceActivation));
      return {
        completed: progress.gamesSinceActivation >= target,
        current,
        target,
        label: `Завершить партий после активации: ${current} / ${target}`,
      };
    }

    if (cond.type === 'active_playtime_minutes') {
      const targetMinutes = Number(cond.target);
      const targetSeconds = Math.max(1, Math.round(targetMinutes * 60));
      const currentMinutes =
        Math.round((Math.min(targetSeconds, Math.max(0, progress.activeSecondsSinceActivation)) / 60) * 10) / 10;
      return {
        completed: progress.activeSecondsSinceActivation >= targetSeconds,
        current: currentMinutes,
        target: targetMinutes,
        label: `Активное время в партиях: ${currentMinutes} / ${targetMinutes} мин.`,
      };
    }

    if (cond.type === 'reach_level') {
      const target = Math.max(1, Math.floor(Number(cond.target)));
      const current = Math.max(1, progress.currentLevel);
      return {
        completed: current >= target,
        current,
        target,
        label: `Достичь уровня: ${current} / ${target}`,
      };
    }

    return { completed: false, current: 0, target: 1, label: 'Условие' };
  }

  public areObligationConditionsMet(
    grantMode: 'immediate' | 'conditional',
    conditionLogic: 'AND' | 'OR',
    conditions: PromoRewardCondition[],
    progress: {
      gamesSinceActivation: number;
      activeSecondsSinceActivation: number;
      currentLevel: number;
    }
  ): boolean {
    if (grantMode === 'immediate' || !conditions || conditions.length === 0) {
      return true;
    }
    const evals = conditions.map((c) => this.evaluateSingleCondition(c, progress).completed);
    return conditionLogic === 'OR' ? evals.some(Boolean) : evals.every(Boolean);
  }

  /**
   * Universal entry point for a player activating a code (either Regular or Partner Referral).
   * Handles atomic concurrency locks, validation of all 9 required error cases,
   * immutable snapshotting, immediate reward granting, and deferred reward obligation creation.
   */
  public async activateCodeForUser(params: {
    userId: string;
    rawCode: string;
    boundVia?: 'registration' | 'profile';
    expectedKind?: 'regular' | 'partner' | 'any';
    now?: Date;
  }): Promise<{
    activationId: string;
    codeKind: 'regular' | 'partner';
    codeDisplay: string;
    title: string;
    immediatelyGranted: Array<{ itemId: string; itemTitle: string; quantity: number }>;
    pendingObligationsCount: number;
    message: string;
  }> {
    const now = params.now || new Date();
    const nowIso = now.toISOString();
    const codeNormalized = normalizeCodeString(params.rawCode);
    if (!codeNormalized) {
      throw new Error('Промокод не найден');
    }

    // Serialize all promo activations globally + per-user so last-slot limits and user inventory never race
    return rewardMutex.runExclusive('promo_global_activation', async () => {
      const activationResult = await rewardMutex.runExclusive(`user:${params.userId}`, async () => {
        // 1. Lookup code in regular promo_codes and partner_referral_codes
        const regRes = await db.execute({
          sql: 'SELECT * FROM promo_codes WHERE code_normalized = ? AND is_deleted = 0',
          args: [codeNormalized],
        });

        const partRes = await db.execute({
          sql: `SELECT c.*, p.is_enabled AS partner_enabled, p.is_deleted AS partner_deleted, p.display_name_snapshot AS partner_name
                FROM partner_referral_codes c
                JOIN partners p ON p.id = c.partner_id
                WHERE c.code_normalized = ? AND c.is_deleted = 0 AND p.is_deleted = 0`,
          args: [codeNormalized],
        });

        if (regRes.rows.length === 0 && partRes.rows.length === 0) {
          throw new Error('Промокод не найден');
        }

        if (regRes.rows.length > 0) {
          if (params.expectedKind === 'partner') {
            throw new Error('При регистрации можно указать только реферальный код партнёра. Обычный промокод активируется в Личном кабинете.');
          }
          const promo = this.mapRegularPromoRow(regRes.rows[0], now);
          return this.executeRegularPromoActivation(params.userId, promo, now);
        } else {
          const partRow = partRes.rows[0];
          const partnerEnabled = Number(partRow.partner_enabled) === 1 && Number(partRow.is_enabled) === 1;
          const partnerCode = this.mapPartnerCodeRow(partRow);
          partnerCode.isEnabled = partnerEnabled;
          return this.executePartnerCodeActivation(
            params.userId,
            partnerCode,
            String(partRow.partner_name || 'Партнёр'),
            params.boundVia || 'profile',
            now
          );
        }
      });

      // Process partner payout after releasing `user:${params.userId}` so `user:${partnerUserId}` is acquired cleanly without nested user lock deadlocks
      if (activationResult.codeKind === 'partner') {
        await this.processPendingPartnerPayoutForActivation(activationResult.activationId, now);
      }

      return activationResult;
    });
  }

  private async executeRegularPromoActivation(
    userId: string,
    promo: RegularPromoCode,
    now: Date
  ): Promise<{
    activationId: string;
    codeKind: 'regular' | 'partner';
    codeDisplay: string;
    title: string;
    immediatelyGranted: Array<{ itemId: string; itemTitle: string; quantity: number }>;
    pendingObligationsCount: number;
    message: string;
  }> {
    // 1. Manual disable check (always has priority over schedule)
    if (!promo.isEnabled) {
      throw new Error('Этот промокод отключён администратором');
    }

    // 2. Schedule check
    const initialSched = evaluatePromoSchedule(
      {
        isEnabled: promo.isEnabled,
        scheduleType: promo.scheduleType,
        scheduleTimezone: promo.scheduleTimezone,
        startsAt: promo.startsAt,
        endsAt: promo.endsAt,
        annualStartMmdd: promo.annualStartMmdd,
        annualEndMmdd: promo.annualEndMmdd,
        currentCycle: promo.currentCycle,
      },
      now,
      promo.scheduleTimezone
    );

    if (!initialSched.isWindowActive) {
      if (initialSched.windowReason === 'not_started') {
        throw new Error('Срок действия промокода ещё не начался');
      }
      throw new Error('Срок действия промокода истёк');
    }

    const rewardSnapshots = await this.buildRewardSnapshots(promo.rewards);

    const tx = await db.transaction('write');
    try {
      // Re-read promo row inside write transaction
      const pRes = await tx.execute({
        sql: 'SELECT * FROM promo_codes WHERE id = ? AND is_deleted = 0',
        args: [promo.id],
      });
      if (pRes.rows.length === 0) {
        throw new Error('Промокод не найден');
      }
      const pRow = pRes.rows[0];
      if (Number(pRow.is_enabled) !== 1) {
        throw new Error('Этот промокод отключён администратором');
      }

      const freshScheduleTz =
        pRow.schedule_timezone && isValidIanaTimezone(String(pRow.schedule_timezone))
          ? String(pRow.schedule_timezone)
          : promo.scheduleTimezone || 'Europe/Moscow';

      // Re-evaluate schedule & cycleKey from fresh DB row inside tx
      const freshSched = evaluatePromoSchedule(
        {
          isEnabled: Number(pRow.is_enabled) === 1,
          scheduleType: (pRow.schedule_type || 'indefinite') as PromoScheduleType,
          scheduleTimezone: freshScheduleTz,
          startsAt: pRow.starts_at ? String(pRow.starts_at) : null,
          endsAt: pRow.ends_at ? String(pRow.ends_at) : null,
          annualStartMmdd: pRow.annual_start_mmdd ? String(pRow.annual_start_mmdd) : null,
          annualEndMmdd: pRow.annual_end_mmdd ? String(pRow.annual_end_mmdd) : null,
          currentCycle: Number(pRow.current_cycle) || 1,
        },
        now,
        freshScheduleTz
      );
      if (!freshSched.isWindowActive) {
        if (freshSched.windowReason === 'not_started') {
          throw new Error('Срок действия промокода ещё не начался');
        }
        throw new Error('Срок действия промокода истёк');
      }
      const cycleKey = freshSched.cycleKey;

      // Check if this user already activated this promo code in the current cycleKey
      const dupRes = await tx.execute({
        sql: `SELECT id FROM promo_activations WHERE user_id = ? AND code_kind = 'regular' AND promo_code_id = ? AND cycle_key = ?`,
        args: [userId, promo.id, cycleKey],
      });
      if (dupRes.rows.length > 0) {
        throw new Error('Вы уже активировали этот промокод в текущем периоде');
      }

      // Check activation limits (counting actual activations for current cycleKey and lifetime inside tx)
      const limitType = String(pRow.limit_type || 'unlimited') as PromoLimitType;
      const maxAct =
        pRow.max_activations !== null && pRow.max_activations !== undefined
          ? Number(pRow.max_activations)
          : null;

      const [lifetimeCountRes, cycleCountRes] = await Promise.all([
        tx.execute({
          sql: `SELECT COUNT(*) AS cnt FROM promo_activations WHERE code_kind = 'regular' AND promo_code_id = ?`,
          args: [promo.id],
        }),
        tx.execute({
          sql: `SELECT COUNT(*) AS cnt FROM promo_activations WHERE code_kind = 'regular' AND promo_code_id = ? AND cycle_key = ?`,
          args: [promo.id, cycleKey],
        }),
      ]);
      const currentLifetimeCount = Math.max(
        Number(pRow.total_activations) || 0,
        Number(lifetimeCountRes.rows[0]?.cnt) || 0
      );
      const currentCycleCount = Number(cycleCountRes.rows[0]?.cnt) || 0;

      if (limitType === 'lifetime' && maxAct !== null && currentLifetimeCount >= maxAct) {
        throw new Error('Лимит активаций промокода исчерпан');
      }
      if (limitType === 'per_cycle' && maxAct !== null && currentCycleCount >= maxAct) {
        throw new Error('Лимит активаций промокода исчерпан');
      }

      // Fetch user row inside transaction
      const uRes = await tx.execute({
        sql: 'SELECT id, display_name, email, credits, level, stats, inventory FROM users WHERE id = ?',
        args: [userId],
      });
      if (uRes.rows.length === 0) {
        throw new Error('Пользователь не найден');
      }
      const uRow = uRes.rows[0];
      const userStats = safeJsonParse<any>(uRow.stats, {});
      const baselineGamesPlayed = Number(userStats.gamesPlayed) || 0;
      const baselineActiveSeconds = Number(userStats.totalSurvivalSeconds) || 0;
      const currentLevel = Number(uRow.level) || 1;
      let userCredits = Number(uRow.credits) || 0;
      let userInventory = safeJsonParse<UserInventoryItem[]>(uRow.inventory, []);

      const activationId = `act_${crypto.randomUUID()}`;
      const nowIso = now.toISOString();

      const snapshotPayload = {
        codeKind: 'regular',
        promoCodeId: promo.id,
        codeDisplay: promo.codeDisplay,
        title: promo.title || `Промокод ${promo.codeDisplay}`,
        cycleKey,
        rewards: rewardSnapshots,
        capturedAt: nowIso,
      };

      const progress = {
        gamesSinceActivation: 0,
        activeSecondsSinceActivation: 0,
        currentLevel,
      };

      const immediatelyGranted: Array<{ itemId: string; itemTitle: string; quantity: number }> = [];
      let pendingCount = 0;

      // Create obligations and grant immediate ones
      for (let idx = 0; idx < rewardSnapshots.length; idx++) {
        const rw = rewardSnapshots[idx];
        const obligationId = `obl_${crypto.randomUUID()}`;
        const idempotencyKey = `promo_obligation:${obligationId}`;
        const isMetNow = this.areObligationConditionsMet(
          rw.grantMode,
          rw.conditionLogic,
          rw.conditions,
          progress
        );

        if (isMetNow) {
          // Grant immediately in this transaction
          const grantRes = this.applyRewardSnapshotToUserState(
            userCredits,
            userInventory,
            rw,
            nowIso
          );
          userCredits = grantRes.credits;
          userInventory = grantRes.inventory;

          await tx.execute({
            sql: `INSERT INTO economy_transactions (
              id, idempotency_key, user_id, operation_type, source_type,
              source_id, code_text_snapshot, credits_delta, items_json, metadata_json, created_at
            ) VALUES (?, ?, ?, 'promo_reward_grant', 'regular_promo', ?, ?, ?, ?, ?, ?)`,
            args: [
              `etx_${crypto.randomUUID()}`,
              idempotencyKey,
              userId,
              promo.id,
              promo.codeDisplay,
              grantRes.creditsDelta,
              JSON.stringify(grantRes.itemsGranted),
              JSON.stringify({ activationId, obligationId, rewardIndex: idx, cycleKey }),
              nowIso,
            ],
          });

          await tx.execute({
            sql: `INSERT INTO promo_reward_obligations (
              id, activation_id, user_id, recipient_type, recipient_user_id,
              reward_index, reward_snapshot_json, conditions_snapshot_json,
              condition_logic, status, idempotency_key, granted_at, created_at, updated_at
            ) VALUES (?, ?, ?, 'player', ?, ?, ?, ?, ?, 'granted', ?, ?, ?, ?)`,
            args: [
              obligationId,
              activationId,
              userId,
              userId,
              idx,
              JSON.stringify(rw),
              JSON.stringify(rw.conditions || []),
              rw.grantMode === 'immediate' ? 'immediate' : rw.conditionLogic,
              idempotencyKey,
              nowIso,
              nowIso,
              nowIso,
            ],
          });

          immediatelyGranted.push({
            itemId: rw.itemId,
            itemTitle: rw.itemTitle,
            quantity: rw.quantity,
          });
        } else {
          pendingCount++;
          await tx.execute({
            sql: `INSERT INTO promo_reward_obligations (
              id, activation_id, user_id, recipient_type, recipient_user_id,
              reward_index, reward_snapshot_json, conditions_snapshot_json,
              condition_logic, status, idempotency_key, granted_at, created_at, updated_at
            ) VALUES (?, ?, ?, 'player', ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?)`,
            args: [
              obligationId,
              activationId,
              userId,
              userId,
              idx,
              JSON.stringify(rw),
              JSON.stringify(rw.conditions || []),
              rw.conditionLogic,
              idempotencyKey,
              nowIso,
              nowIso,
            ],
          });
        }
      }

      // Update user credits & inventory if any immediate rewards were granted
      if (immediatelyGranted.length > 0) {
        await tx.execute({
          sql: 'UPDATE users SET credits = ?, inventory = ? WHERE id = ?',
          args: [userCredits, JSON.stringify(userInventory), userId],
        });
      }

      // Insert activation record
      await tx.execute({
        sql: `INSERT INTO promo_activations (
          id, user_id, user_display_name_snapshot, user_email_snapshot, user_deleted,
          code_kind, promo_code_id, partner_id, partner_user_id, cycle_key,
          code_text_snapshot, bound_via, snapshot_json,
          baseline_games_played, baseline_active_seconds, baseline_level,
          current_games_since, current_active_seconds_since, current_level,
          all_player_rewards_granted, partner_reward_status, qualification_status,
          active_days_json, activated_at, updated_at
        ) VALUES (?, ?, ?, ?, 0, 'regular', ?, NULL, NULL, ?, ?, 'profile', ?, ?, ?, ?, 0, 0, ?, ?, 'not_applicable', 'not_applicable', '[]', ?, ?)`,
        args: [
          activationId,
          userId,
          String(uRow.display_name || 'Игрок'),
          String(uRow.email || ''),
          promo.id,
          cycleKey,
          promo.codeDisplay,
          JSON.stringify(snapshotPayload),
          baselineGamesPlayed,
          baselineActiveSeconds,
          currentLevel,
          currentLevel,
          pendingCount === 0 ? 1 : 0,
          nowIso,
          nowIso,
        ],
      });

      // Increment promo code counters using exact transaction counts
      await tx.execute({
        sql: `UPDATE promo_codes SET
          total_activations = ?,
          cycle_activations = ?,
          updated_at = ?
        WHERE id = ?`,
        args: [currentLifetimeCount + 1, currentCycleCount + 1, nowIso, promo.id],
      });

      await tx.commit();

      return {
        activationId,
        codeKind: 'regular',
        codeDisplay: promo.codeDisplay,
        title: promo.title || `Промокод ${promo.codeDisplay}`,
        immediatelyGranted,
        pendingObligationsCount: pendingCount,
        message:
          pendingCount === 0
            ? 'Промокод успешно активирован! Все награды зачислены.'
            : immediatelyGranted.length > 0
            ? 'Промокод активирован! Мгновенные награды выданы, остальные будут начислены после выполнения условий.'
            : 'Промокод активирован! Награды будут автоматически начислены после выполнения игровых условий.',
      };
    } catch (e) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw e;
    }
  }

  private async executePartnerCodeActivation(
    userId: string,
    partnerCode: PartnerReferralCodeRecord,
    partnerDisplayName: string,
    boundVia: 'registration' | 'profile',
    now: Date
  ): Promise<{
    activationId: string;
    codeKind: 'regular' | 'partner';
    codeDisplay: string;
    title: string;
    immediatelyGranted: Array<{ itemId: string; itemTitle: string; quantity: number }>;
    pendingObligationsCount: number;
    message: string;
  }> {
    if (!partnerCode.isEnabled) {
      throw new Error('Этот промокод отключён администратором');
    }

    // Self-referral check
    if (userId === partnerCode.partnerUserId) {
      throw new Error('Нельзя активировать собственный партнёрский код');
    }

    const playerRewardSnapshots = await this.buildRewardSnapshots(partnerCode.playerRewards);
    const partnerRewardSnapshots =
      partnerCode.partnerRewards.length > 0
        ? await this.buildRewardSnapshots(partnerCode.partnerRewards)
        : [];

    const tx = await db.transaction('write');
    try {
      // 1. Check permanent 1-time partner binding for this player
      const bindRes = await tx.execute({
        sql: 'SELECT * FROM user_partner_bindings WHERE user_id = ?',
        args: [userId],
      });
      if (bindRes.rows.length > 0) {
        const existingBind = bindRes.rows[0];
        if (String(existingBind.referral_code_id) === partnerCode.id) {
          throw new Error('Вы уже активировали этот партнёрский код');
        }
        throw new Error(
          'Вы уже привязаны к партнёрской программе и не можете активировать другой реферальный код'
        );
      }

      // 2. Fetch player user row
      const uRes = await tx.execute({
        sql: 'SELECT id, display_name, email, credits, level, stats, inventory, created_at FROM users WHERE id = ?',
        args: [userId],
      });
      if (uRes.rows.length === 0) {
        throw new Error('Пользователь не найден');
      }
      const uRow = uRes.rows[0];
      const userLevel = Number(uRow.level) || 1;
      const userCreatedAtMs = uRow.created_at ? Date.parse(String(uRow.created_at)) : now.getTime();
      const accountAgeHours = Math.max(0, (now.getTime() - userCreatedAtMs) / (1000 * 60 * 60));

      // 3. Evaluate player eligibility conditions (Stage 3.3)
      if (partnerCode.eligibility.enabled) {
        const checks: Array<{ ok: boolean; reason: string }> = [];
        if (
          partnerCode.eligibility.maxAccountAgeHours !== null &&
          partnerCode.eligibility.maxAccountAgeHours !== undefined
        ) {
          const maxH = Number(partnerCode.eligibility.maxAccountAgeHours);
          checks.push({
            ok: boundVia === 'registration' || accountAgeHours <= maxH,
            reason: `с момента регистрации прошло более ${maxH} ч.`,
          });
        }
        if (
          partnerCode.eligibility.maxLevel !== null &&
          partnerCode.eligibility.maxLevel !== undefined
        ) {
          const maxL = Number(partnerCode.eligibility.maxLevel);
          checks.push({
            ok: userLevel <= maxL,
            reason: `ваш уровень (${userLevel}) выше допустимого (${maxL})`,
          });
        }
        if (
          partnerCode.eligibility.minLevel !== null &&
          partnerCode.eligibility.minLevel !== undefined
        ) {
          const minL = Number(partnerCode.eligibility.minLevel);
          checks.push({
            ok: userLevel >= minL,
            reason: `ваш уровень (${userLevel}) ниже минимального (${minL})`,
          });
        }

        if (checks.length > 0) {
          const passed =
            partnerCode.eligibility.logic === 'OR'
              ? checks.some((c) => c.ok)
              : checks.every((c) => c.ok);
          if (!passed) {
            throw new Error('Ваш аккаунт не подходит под условия этого реферального кода');
          }
        }
      }

      const userStats = safeJsonParse<any>(uRow.stats, {});
      const baselineGamesPlayed = Number(userStats.gamesPlayed) || 0;
      const baselineActiveSeconds = Number(userStats.totalSurvivalSeconds) || 0;
      let userCredits = Number(uRow.credits) || 0;
      let userInventory = safeJsonParse<UserInventoryItem[]>(uRow.inventory, []);

      const activationId = `act_${crypto.randomUUID()}`;
      const nowIso = now.toISOString();
      const mskToday = getMskDateParts(now).dateStr;

      const snapshotPayload = {
        codeKind: 'partner',
        partnerId: partnerCode.partnerId,
        partnerUserId: partnerCode.partnerUserId,
        referralCodeId: partnerCode.id,
        codeDisplay: partnerCode.codeDisplay,
        title: `Партнёрский код ${partnerCode.codeDisplay} (${partnerDisplayName})`,
        playerRewards: playerRewardSnapshots,
        partnerRewards: partnerRewardSnapshots,
        partnerRewardMode: partnerCode.partnerRewardMode,
        qualificationCriteria: partnerCode.qualificationCriteria,
        capturedAt: nowIso,
      };

      const progress = {
        gamesSinceActivation: 0,
        activeSecondsSinceActivation: 0,
        currentLevel: userLevel,
      };

      const immediatelyGranted: Array<{ itemId: string; itemTitle: string; quantity: number }> = [];
      let pendingPlayerCount = 0;

      // 4. Create player reward obligations & grant immediate ones
      for (let idx = 0; idx < playerRewardSnapshots.length; idx++) {
        const rw = playerRewardSnapshots[idx];
        const obligationId = `obl_${crypto.randomUUID()}`;
        const idempotencyKey = `promo_obligation:${obligationId}`;
        const isMetNow = this.areObligationConditionsMet(
          rw.grantMode,
          rw.conditionLogic,
          rw.conditions,
          progress
        );

        if (isMetNow) {
          const grantRes = this.applyRewardSnapshotToUserState(
            userCredits,
            userInventory,
            rw,
            nowIso
          );
          userCredits = grantRes.credits;
          userInventory = grantRes.inventory;

          await tx.execute({
            sql: `INSERT INTO economy_transactions (
              id, idempotency_key, user_id, operation_type, source_type,
              source_id, code_text_snapshot, credits_delta, items_json, metadata_json, created_at
            ) VALUES (?, ?, ?, 'partner_player_reward_grant', 'partner_referral', ?, ?, ?, ?, ?, ?)`,
            args: [
              `etx_${crypto.randomUUID()}`,
              idempotencyKey,
              userId,
              partnerCode.id,
              partnerCode.codeDisplay,
              grantRes.creditsDelta,
              JSON.stringify(grantRes.itemsGranted),
              JSON.stringify({ activationId, obligationId, rewardIndex: idx, partnerId: partnerCode.partnerId }),
              nowIso,
            ],
          });

          await tx.execute({
            sql: `INSERT INTO promo_reward_obligations (
              id, activation_id, user_id, recipient_type, recipient_user_id,
              reward_index, reward_snapshot_json, conditions_snapshot_json,
              condition_logic, status, idempotency_key, granted_at, created_at, updated_at
            ) VALUES (?, ?, ?, 'player', ?, ?, ?, ?, ?, 'granted', ?, ?, ?, ?)`,
            args: [
              obligationId,
              activationId,
              userId,
              userId,
              idx,
              JSON.stringify(rw),
              JSON.stringify(rw.conditions || []),
              rw.grantMode === 'immediate' ? 'immediate' : rw.conditionLogic,
              idempotencyKey,
              nowIso,
              nowIso,
              nowIso,
            ],
          });

          immediatelyGranted.push({
            itemId: rw.itemId,
            itemTitle: rw.itemTitle,
            quantity: rw.quantity,
          });
        } else {
          pendingPlayerCount++;
          await tx.execute({
            sql: `INSERT INTO promo_reward_obligations (
              id, activation_id, user_id, recipient_type, recipient_user_id,
              reward_index, reward_snapshot_json, conditions_snapshot_json,
              condition_logic, status, idempotency_key, granted_at, created_at, updated_at
            ) VALUES (?, ?, ?, 'player', ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?)`,
            args: [
              obligationId,
              activationId,
              userId,
              userId,
              idx,
              JSON.stringify(rw),
              JSON.stringify(rw.conditions || []),
              rw.conditionLogic,
              idempotencyKey,
              nowIso,
              nowIso,
            ],
          });
        }
      }

      if (immediatelyGranted.length > 0) {
        await tx.execute({
          sql: 'UPDATE users SET credits = ?, inventory = ? WHERE id = ?',
          args: [userCredits, JSON.stringify(userInventory), userId],
        });
      }

      const allPlayerRewardsGranted = pendingPlayerCount === 0;

      // 5. Create Partner Reward Obligations (Stage 5)
      // Note: Actual credit/inventory payout to `partnerCode.partnerUserId` is executed immediately after
      // releasing `user:${userId}` via `processPendingPartnerPayoutForActivation` under `user:${partnerUserId}`
      // to guarantee full mutex protection of the partner's balance/inventory without nested user lock deadlocks.
      let partnerRewardStatus:
        | 'not_applicable'
        | 'pending_conditions'
        | 'pending_unban'
        | 'granted'
        | 'cancelled_partner_deleted' = 'not_applicable';
      const partnerRewardGrantedAt: string | null = null;

      if (partnerRewardSnapshots.length > 0) {
        const pUserRes = await tx.execute({
          sql: 'SELECT id, is_banned FROM users WHERE id = ?',
          args: [partnerCode.partnerUserId],
        });
        const partnerUserRow = pUserRes.rows[0];

        for (let idx = 0; idx < partnerRewardSnapshots.length; idx++) {
          const prw = partnerRewardSnapshots[idx];
          const obligationId = `obl_${crypto.randomUUID()}`;
          const idempotencyKey = `promo_obligation:${obligationId}`;

          if (!partnerUserRow) {
            partnerRewardStatus = 'cancelled_partner_deleted';
            await tx.execute({
              sql: `INSERT INTO promo_reward_obligations (
                id, activation_id, user_id, recipient_type, recipient_user_id,
                reward_index, reward_snapshot_json, conditions_snapshot_json,
                condition_logic, status, idempotency_key, granted_at, created_at, updated_at
              ) VALUES (?, ?, ?, 'partner', ?, ?, ?, '[]', 'immediate', 'cancelled_recipient_deleted', ?, NULL, ?, ?)`,
              args: [
                obligationId,
                activationId,
                userId,
                partnerCode.partnerUserId,
                idx,
                JSON.stringify(prw),
                idempotencyKey,
                nowIso,
                nowIso,
              ],
            });
          } else {
            await tx.execute({
              sql: `INSERT INTO promo_reward_obligations (
                id, activation_id, user_id, recipient_type, recipient_user_id,
                reward_index, reward_snapshot_json, conditions_snapshot_json,
                condition_logic, status, idempotency_key, granted_at, created_at, updated_at
              ) VALUES (?, ?, ?, 'partner', ?, ?, ?, '[]', ?, 'pending', ?, NULL, ?, ?)`,
              args: [
                obligationId,
                activationId,
                userId,
                partnerCode.partnerUserId,
                idx,
                JSON.stringify(prw),
                partnerCode.partnerRewardMode,
                idempotencyKey,
                nowIso,
                nowIso,
              ],
            });
          }
        }

        if (partnerUserRow) {
          partnerRewardStatus = 'pending_conditions';
        }
      }

      // 6. Qualification criteria initial evaluation (Stage 6)
      // If activityType === 'login', activating the code right now is an active login session on `mskToday`!
      const qual = partnerCode.qualificationCriteria;
      const initialActiveDays: string[] = [];
      if (qual.activityType === 'login') {
        initialActiveDays.push(mskToday);
        await tx.execute({
          sql: `INSERT INTO user_daily_activity (id, user_id, date_msk, has_login, completed_matches, first_activity_at, updated_at)
                VALUES (?, ?, ?, 1, 0, ?, ?)
                ON CONFLICT(user_id, date_msk) DO UPDATE SET has_login = 1, updated_at = excluded.updated_at`,
          args: [`uda_${crypto.randomUUID()}`, userId, mskToday, nowIso, nowIso],
        });
      }

      const isQualifiedImmediately = initialActiveDays.length >= qual.requiredActiveDays;
      const qualificationStatus = isQualifiedImmediately ? 'qualified' : 'in_progress';
      const qualifiedAt = isQualifiedImmediately ? nowIso : null;

      // 7. Insert permanent binding & activation record
      await tx.execute({
        sql: `INSERT INTO user_partner_bindings (
          user_id, partner_id, partner_user_id, referral_code_id,
          code_text_snapshot, activation_id, bound_via, bound_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          userId,
          partnerCode.partnerId,
          partnerCode.partnerUserId,
          partnerCode.id,
          partnerCode.codeDisplay,
          activationId,
          boundVia,
          nowIso,
        ],
      });

      await tx.execute({
        sql: `INSERT INTO promo_activations (
          id, user_id, user_display_name_snapshot, user_email_snapshot, user_deleted,
          code_kind, promo_code_id, partner_id, partner_user_id, cycle_key,
          code_text_snapshot, bound_via, snapshot_json,
          baseline_games_played, baseline_active_seconds, baseline_level,
          current_games_since, current_active_seconds_since, current_level,
          all_player_rewards_granted, partner_reward_status, partner_reward_granted_at,
          qualification_status, qualified_at, active_days_json, activated_at, updated_at
        ) VALUES (?, ?, ?, ?, 0, 'partner', ?, ?, ?, 'permanent', ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          activationId,
          userId,
          String(uRow.display_name || 'Игрок'),
          String(uRow.email || ''),
          partnerCode.id,
          partnerCode.partnerId,
          partnerCode.partnerUserId,
          partnerCode.codeDisplay,
          boundVia,
          JSON.stringify(snapshotPayload),
          baselineGamesPlayed,
          baselineActiveSeconds,
          userLevel,
          userLevel,
          allPlayerRewardsGranted ? 1 : 0,
          partnerRewardStatus,
          partnerRewardGrantedAt,
          qualificationStatus,
          qualifiedAt,
          JSON.stringify(initialActiveDays),
          nowIso,
          nowIso,
        ],
      });

      await tx.commit();

      return {
        activationId,
        codeKind: 'partner',
        codeDisplay: partnerCode.codeDisplay,
        title: `Партнёрский код ${partnerCode.codeDisplay}`,
        immediatelyGranted,
        pendingObligationsCount: pendingPlayerCount,
        message:
          pendingPlayerCount === 0
            ? 'Партнёрский код успешно активирован! Все награды зачислены.'
            : immediatelyGranted.length > 0
            ? 'Партнёрский код активирован! Мгновенные награды выданы, остальные будут начислены по мере выполнения условий.'
            : 'Партнёрский код активирован! Награды будут автоматически начислены после выполнения условий.',
      };
    } catch (e) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw e;
    }
  }

  /**
   * Pure helper that applies a single PromoRewardSnapshot to `(credits, inventory)`
   * using the unified `grantInventoryItemWithSnapshot` mechanism.
   */
  private applyRewardSnapshotToUserState(
    currentCredits: number,
    currentInventory: UserInventoryItem[],
    reward: PromoRewardSnapshot,
    nowIso: string
  ): {
    credits: number;
    inventory: UserInventoryItem[];
    creditsDelta: number;
    itemsGranted: Array<{ itemId: string; quantity: number }>;
  } {
    let credits = currentCredits;
    let inventory: UserInventoryItem[] = [...currentInventory];
    let creditsDelta = 0;
    const itemsGranted: Array<{ itemId: string; quantity: number }> = [];

    if (reward.itemId === LOYALTY_CREDITS_ITEM_ID) {
      credits += reward.quantity;
      creditsDelta = reward.quantity;
    } else {
      const itemDef: ItemDefinition = reward.itemSnapshot || {
        id: reward.itemId,
        name: reward.itemTitle || reward.itemId,
        description: 'Награда по промокоду Клуба',
        cost: 0,
        pawnValue: 0,
        icon: reward.itemIcon || '🎁',
        category: (reward.itemType as any) || 'gifts',
        rarity: (reward.itemRarity as any) || 'rare',
        usable: false,
        consumable: false,
        inShop: false,
        adminHidden: true,
      };
      const grantRes = grantInventoryItemWithSnapshot(inventory, itemDef, reward.quantity, nowIso);
      inventory = grantRes.inventory;
      itemsGranted.push({ itemId: reward.itemId, quantity: reward.quantity });
    }

    return { credits, inventory, creditsDelta, itemsGranted };
  }

  // ==========================================================================
  // AUTOMATIC PROGRESS, QUALIFICATION & PAYOUT HOOKS (STAGES 4, 5, 6, 10)
  // ==========================================================================

  /**
   * Called on user login / session check.
   * Records `has_login = 1` for today (`date_msk`), updates partner qualification if `activityType === 'login'`,
   * and retries any pending obligations that are already met.
   */
  public async onUserLogin(userId: string, now: Date = new Date()): Promise<void> {
    if (!userId) return;
    try {
      let partnerActivationsToPayout: string[] = [];
      await rewardMutex.runExclusive(`user:${userId}`, async () => {
        const nowIso = now.toISOString();
        const mskDate = getMskDateParts(now).dateStr;

        await db.execute({
          sql: `INSERT INTO user_daily_activity (id, user_id, date_msk, has_login, completed_matches, first_activity_at, updated_at)
                VALUES (?, ?, ?, 1, 0, ?, ?)
                ON CONFLICT(user_id, date_msk) DO UPDATE SET has_login = 1, updated_at = excluded.updated_at`,
          args: [`uda_${crypto.randomUUID()}`, userId, mskDate, nowIso, nowIso],
        });

        await this.evaluatePartnerQualificationForUser(userId, 'login', now);
        const evalRes = await this.evaluateAndGrantPendingObligationsInUserLock(userId, now);
        partnerActivationsToPayout = evalRes.completedPartnerActivationIds;
      });

      for (const actId of partnerActivationsToPayout) {
        await this.processPendingPartnerPayoutForActivation(actId, now);
      }
    } catch (e) {
      console.error('[PromoDb] onUserLogin error:', e);
    }
  }

  /**
   * Called when a player finishes a completed match (`recordGameResult`).
   * Increments `current_games_since`, `current_active_seconds_since` (using server-verified `survivalSeconds`),
   * updates `current_level`, records `completed_matches` for `date_msk`, evaluates partner qualification,
   * and grants any unlocked player or partner rewards!
   */
  public async onMatchCompleted(
    userId: string,
    survivalSeconds: number,
    newLevel: number,
    now: Date = new Date()
  ): Promise<void> {
    if (!userId) return;
    const validSeconds = Math.max(0, Math.floor(Number(survivalSeconds) || 0));
    const validLevel = Math.max(1, Math.floor(Number(newLevel) || 1));

    try {
      let partnerActivationsToPayout: string[] = [];
      await rewardMutex.runExclusive(`user:${userId}`, async () => {
        const nowIso = now.toISOString();
        const mskDate = getMskDateParts(now).dateStr;

        await db.execute({
          sql: `INSERT INTO user_daily_activity (id, user_id, date_msk, has_login, completed_matches, first_activity_at, updated_at)
                VALUES (?, ?, ?, 1, 1, ?, ?)
                ON CONFLICT(user_id, date_msk) DO UPDATE SET
                  has_login = 1,
                  completed_matches = user_daily_activity.completed_matches + 1,
                  updated_at = excluded.updated_at`,
          args: [`uda_${crypto.randomUUID()}`, userId, mskDate, nowIso, nowIso],
        });

        // Update progress counters on all activations belonging to this player
        await db.execute({
          sql: `UPDATE promo_activations SET
                  current_games_since = current_games_since + 1,
                  current_active_seconds_since = current_active_seconds_since + ?,
                  current_level = CASE WHEN ? > current_level THEN ? ELSE current_level END,
                  updated_at = ?
                WHERE user_id = ?`,
          args: [validSeconds, validLevel, validLevel, nowIso, userId],
        });

        await this.evaluatePartnerQualificationForUser(userId, 'completed_match', now);
        const evalRes = await this.evaluateAndGrantPendingObligationsInUserLock(userId, now);
        partnerActivationsToPayout = evalRes.completedPartnerActivationIds;
      });

      for (const actId of partnerActivationsToPayout) {
        await this.processPendingPartnerPayoutForActivation(actId, now);
      }
    } catch (e) {
      console.error('[PromoDb] onMatchCompleted error:', e);
    }
  }

  /**
   * Called whenever a user's level changes outside a match (e.g. XP lootbox, quest reward, admin XP).
   */
  public async onUserLevelChanged(
    userId: string,
    newLevel: number,
    now: Date = new Date()
  ): Promise<void> {
    if (!userId) return;
    const validLevel = Math.max(1, Math.floor(Number(newLevel) || 1));
    try {
      let partnerActivationsToPayout: string[] = [];
      await rewardMutex.runExclusive(`user:${userId}`, async () => {
        const nowIso = now.toISOString();
        await db.execute({
          sql: `UPDATE promo_activations SET
                  current_level = CASE WHEN ? > current_level THEN ? ELSE current_level END,
                  updated_at = ?
                WHERE user_id = ?`,
          args: [validLevel, validLevel, nowIso, userId],
        });
        const evalRes = await this.evaluateAndGrantPendingObligationsInUserLock(userId, now);
        partnerActivationsToPayout = evalRes.completedPartnerActivationIds;
      });

      for (const actId of partnerActivationsToPayout) {
        await this.processPendingPartnerPayoutForActivation(actId, now);
      }
    } catch (e) {
      console.error('[PromoDb] onUserLevelChanged error:', e);
    }
  }

  /**
   * Evaluates partner qualification (`1..7` active calendar days in `Europe/Moscow`)
   * for a bound player.
   */
  private async evaluatePartnerQualificationForUser(
    userId: string,
    triggeredBy: 'login' | 'completed_match',
    now: Date
  ): Promise<void> {
    const actRes = await db.execute({
      sql: `SELECT * FROM promo_activations WHERE user_id = ? AND code_kind = 'partner'`,
      args: [userId],
    });
    if (actRes.rows.length === 0) return;

    const actRow = actRes.rows[0];
    const currentStatus = String(actRow.qualification_status || 'in_progress');
    if (currentStatus === 'qualified' || currentStatus === 'expired' || currentStatus === 'not_applicable') {
      return;
    }

    const snap = safeJsonParse<any>(actRow.snapshot_json, {});
    const qual: PartnerQualificationCriteria = snap?.qualificationCriteria || {
      requiredActiveDays: 1,
      activityType: 'completed_match',
      windowDays: null,
    };

    const activatedAtMs = Date.parse(String(actRow.activated_at));
    const nowMs = now.getTime();
    const nowIso = now.toISOString();

    if (qual.windowDays !== null && qual.windowDays !== undefined && qual.windowDays > 0) {
      const deadlineMs = activatedAtMs + qual.windowDays * 24 * 60 * 60 * 1000;
      if (nowMs > deadlineMs) {
        await db.execute({
          sql: `UPDATE promo_activations SET qualification_status = 'expired', updated_at = ? WHERE id = ? AND qualification_status = 'in_progress'`,
          args: [nowIso, String(actRow.id)],
        });
        return;
      }
    }

    // Check if the triggered activity satisfies the required activityType:
    // - If required is 'completed_match', only 'completed_match' counts.
    // - If required is 'login', both 'login' and 'completed_match' count (completing a match proves active login on this Moscow calendar day).
    if (qual.activityType === 'completed_match' && triggeredBy !== 'completed_match') {
      return;
    }

    const mskToday = getMskDateParts(now).dateStr;
    const activeDays = safeJsonParse<string[]>(actRow.active_days_json, []);
    if (!activeDays.includes(mskToday)) {
      activeDays.push(mskToday);
      activeDays.sort();
    }

    const isNowQualified = activeDays.length >= qual.requiredActiveDays;
    await db.execute({
      sql: `UPDATE promo_activations SET
              active_days_json = ?,
              qualification_status = ?,
              qualified_at = ?,
              updated_at = ?
            WHERE id = ?`,
      args: [
        JSON.stringify(activeDays),
        isNowQualified ? 'qualified' : 'in_progress',
        isNowQualified ? nowIso : null,
        nowIso,
        String(actRow.id),
      ],
    });
  }

  public async refreshPartnerQualificationExpirations(
    partnerId: string,
    now: Date = new Date()
  ): Promise<void> {
    const res = await db.execute({
      sql: `SELECT id, activated_at, snapshot_json, active_days_json FROM promo_activations
            WHERE code_kind = 'partner' AND partner_id = ? AND qualification_status = 'in_progress'`,
      args: [partnerId],
    });
    const nowMs = now.getTime();
    const nowIso = now.toISOString();

    for (const r of res.rows) {
      const snap = safeJsonParse<any>(r.snapshot_json, {});
      const windowDays = snap?.qualificationCriteria?.windowDays;
      if (windowDays !== null && windowDays !== undefined && Number(windowDays) > 0) {
        const deadlineMs = Date.parse(String(r.activated_at)) + Number(windowDays) * 24 * 60 * 60 * 1000;
        if (nowMs > deadlineMs) {
          await db.execute({
            sql: `UPDATE promo_activations SET qualification_status = 'expired', updated_at = ? WHERE id = ? AND qualification_status = 'in_progress'`,
            args: [nowIso, String(r.id)],
          });
        }
      }
    }
  }

  /**
   * Public wrapper that acquires `user:${userId}` lock before evaluating pending player obligations,
   * and then processes any unlocked partner payouts outside `user:${userId}` lock.
   */
  public async evaluateAndGrantPendingObligationsForUser(
    userId: string,
    now: Date = new Date()
  ): Promise<number> {
    const res = await rewardMutex.runExclusive(`user:${userId}`, () =>
      this.evaluateAndGrantPendingObligationsInUserLock(userId, now)
    );
    for (const actId of res.completedPartnerActivationIds) {
      await this.processPendingPartnerPayoutForActivation(actId, now);
    }
    return res.grantedCount;
  }

  /**
   * Internal helper assuming caller ALREADY holds `rewardMutex` for `user:${userId}`.
   */
  private async evaluateAndGrantPendingObligationsInUserLock(
    userId: string,
    now: Date = new Date()
  ): Promise<{ grantedCount: number; completedPartnerActivationIds: string[] }> {
    const actRes = await db.execute({
      sql: `SELECT * FROM promo_activations WHERE user_id = ? AND all_player_rewards_granted = 0`,
      args: [userId],
    });
    if (actRes.rows.length === 0) {
      return { grantedCount: 0, completedPartnerActivationIds: [] };
    }

    let grantedCount = 0;
    const completedPartnerActivationIds: string[] = [];
    const nowIso = now.toISOString();

    for (const actRow of actRes.rows) {
      const activationId = String(actRow.id);
      const obRes = await db.execute({
        sql: `SELECT * FROM promo_reward_obligations WHERE activation_id = ? AND recipient_type = 'player' ORDER BY reward_index ASC`,
        args: [activationId],
      });

      const progress = {
        gamesSinceActivation: Number(actRow.current_games_since) || 0,
        activeSecondsSinceActivation: Number(actRow.current_active_seconds_since) || 0,
        currentLevel: Number(actRow.current_level) || 1,
      };

      const tx = await db.transaction('write');
      try {
        const uRes = await tx.execute({
          sql: 'SELECT id, credits, inventory, level FROM users WHERE id = ?',
          args: [userId],
        });
        if (uRes.rows.length === 0) {
          await tx.rollback();
          continue;
        }
        const uRow = uRes.rows[0];
        progress.currentLevel = Math.max(progress.currentLevel, Number(uRow.level) || 1);

        let userCredits = Number(uRow.credits) || 0;
        let userInventory = safeJsonParse<UserInventoryItem[]>(uRow.inventory, []);
        let grantedInThisAct = 0;
        let stillPending = 0;

        for (const ob of obRes.rows) {
          if (String(ob.status) === 'granted') continue;
          const rw = safeJsonParse<PromoRewardSnapshot>(ob.reward_snapshot_json, null as any);
          if (!rw) continue;

          const conds = safeJsonParse<PromoRewardCondition[]>(ob.conditions_snapshot_json, []);
          const logic = String(ob.condition_logic) === 'OR' ? 'OR' : 'AND';
          const grantMode = String(ob.condition_logic) === 'immediate' ? 'immediate' : 'conditional';

          if (this.areObligationConditionsMet(grantMode, logic, conds, progress)) {
            const idempotencyKey = String(ob.idempotency_key);
            // Verify idempotency in economy_transactions
            const txCheck = await tx.execute({
              sql: 'SELECT id FROM economy_transactions WHERE idempotency_key = ?',
              args: [idempotencyKey],
            });

            if (txCheck.rows.length === 0) {
              const grantRes = this.applyRewardSnapshotToUserState(
                userCredits,
                userInventory,
                rw,
                nowIso
              );
              userCredits = grantRes.credits;
              userInventory = grantRes.inventory;

              await tx.execute({
                sql: `INSERT INTO economy_transactions (
                  id, idempotency_key, user_id, operation_type, source_type,
                  source_id, code_text_snapshot, credits_delta, items_json, metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                  `etx_${crypto.randomUUID()}`,
                  idempotencyKey,
                  userId,
                  actRow.code_kind === 'partner' ? 'partner_player_reward_grant' : 'promo_reward_grant',
                  actRow.code_kind === 'partner' ? 'partner_referral' : 'regular_promo',
                  String(actRow.promo_code_id),
                  String(actRow.code_text_snapshot),
                  grantRes.creditsDelta,
                  JSON.stringify(grantRes.itemsGranted),
                  JSON.stringify({ activationId, obligationId: String(ob.id) }),
                  nowIso,
                ],
              });
            }

            await tx.execute({
              sql: `UPDATE promo_reward_obligations SET status = 'granted', granted_at = ?, updated_at = ? WHERE id = ?`,
              args: [nowIso, nowIso, String(ob.id)],
            });
            grantedInThisAct++;
            grantedCount++;
          } else {
            stillPending++;
          }
        }

        if (grantedInThisAct > 0) {
          await tx.execute({
            sql: 'UPDATE users SET credits = ?, inventory = ? WHERE id = ?',
            args: [userCredits, JSON.stringify(userInventory), userId],
          });
        }

        if (stillPending === 0) {
          await tx.execute({
            sql: 'UPDATE promo_activations SET all_player_rewards_granted = 1, updated_at = ? WHERE id = ?',
            args: [nowIso, activationId],
          });
        }

        await tx.commit();

        if (stillPending === 0 && String(actRow.code_kind) === 'partner') {
          completedPartnerActivationIds.push(activationId);
        }
      } catch (e) {
        try {
          await tx.rollback();
        } catch {
          // ignore
        }
        console.error('[PromoDb] Failed granting deferred player obligation:', e);
      }
    }

    return { grantedCount, completedPartnerActivationIds };
  }

  /**
   * Grants pending partner rewards for `activationId` if eligible (and holds them in `pending_unban` if partner is currently banned).
   * Always acquires `rewardMutex` for `user:${partnerUserId}` (unless caller explicitly passes `partnerLockAlreadyHeld: true`).
   */
  public async processPendingPartnerPayoutForActivation(
    activationId: string,
    now: Date = new Date(),
    options?: { partnerLockAlreadyHeld?: boolean }
  ): Promise<void> {
    const initialActRes = await db.execute({
      sql: 'SELECT id, code_kind, partner_user_id, partner_reward_status FROM promo_activations WHERE id = ?',
      args: [activationId],
    });
    if (initialActRes.rows.length === 0) return;
    const initialRow = initialActRes.rows[0];
    if (String(initialRow.code_kind) !== 'partner') return;

    const initialStatus = String(initialRow.partner_reward_status || '');
    if (
      initialStatus === 'granted' ||
      initialStatus === 'not_applicable' ||
      initialStatus === 'cancelled_partner_deleted'
    ) {
      return;
    }

    const partnerUserId = String(initialRow.partner_user_id || '');
    if (!partnerUserId) return;

    const executePayoutUnderPartnerLock = async () => {
      const nowIso = now.toISOString();
      const tx = await db.transaction('write');
      try {
        // Re-read activation inside transaction under partner lock
        const actRes = await tx.execute({
          sql: 'SELECT * FROM promo_activations WHERE id = ?',
          args: [activationId],
        });
        if (actRes.rows.length === 0) {
          await tx.rollback();
          return;
        }
        const actRow = actRes.rows[0];
        const pStatus = String(actRow.partner_reward_status || '');
        if (
          pStatus === 'granted' ||
          pStatus === 'not_applicable' ||
          pStatus === 'cancelled_partner_deleted'
        ) {
          await tx.rollback();
          return;
        }

        const snap = safeJsonParse<any>(actRow.snapshot_json, {});
        const mode: PartnerRewardMode =
          snap?.partnerRewardMode === 'on_full_completion' ? 'on_full_completion' : 'on_activation';

        if (mode === 'on_full_completion' && Number(actRow.all_player_rewards_granted) !== 1) {
          await tx.rollback();
          return;
        }

        const pUserRes = await tx.execute({
          sql: 'SELECT id, credits, inventory, is_banned FROM users WHERE id = ?',
          args: [partnerUserId],
        });

        if (pUserRes.rows.length === 0) {
          await tx.execute({
            sql: `UPDATE promo_reward_obligations SET status = 'cancelled_recipient_deleted', updated_at = ?
                  WHERE activation_id = ? AND recipient_type = 'partner' AND status = 'pending'`,
            args: [nowIso, activationId],
          });
          await tx.execute({
            sql: `UPDATE promo_activations SET partner_reward_status = 'cancelled_partner_deleted', updated_at = ? WHERE id = ?`,
            args: [nowIso, activationId],
          });
          await tx.commit();
          return;
        }

        const pUser = pUserRes.rows[0];
        if (Number(pUser.is_banned) === 1) {
          await tx.execute({
            sql: `UPDATE promo_activations SET partner_reward_status = 'pending_unban', updated_at = ? WHERE id = ?`,
            args: [nowIso, activationId],
          });
          await tx.commit();
          return;
        }

        const obRes = await tx.execute({
          sql: `SELECT * FROM promo_reward_obligations WHERE activation_id = ? AND recipient_type = 'partner' ORDER BY reward_index ASC`,
          args: [activationId],
        });

        let partnerCredits = Number(pUser.credits) || 0;
        let partnerInventory = safeJsonParse<UserInventoryItem[]>(pUser.inventory, []);
        let grantedAny = false;

        for (const ob of obRes.rows) {
          if (String(ob.status) === 'granted') continue;
          const rw = safeJsonParse<PromoRewardSnapshot>(ob.reward_snapshot_json, null as any);
          if (!rw) continue;

          const idempotencyKey = String(ob.idempotency_key);
          const txCheck = await tx.execute({
            sql: 'SELECT id FROM economy_transactions WHERE idempotency_key = ?',
            args: [idempotencyKey],
          });

          if (txCheck.rows.length === 0) {
            const grantRes = this.applyRewardSnapshotToUserState(
              partnerCredits,
              partnerInventory,
              rw,
              nowIso
            );
            partnerCredits = grantRes.credits;
            partnerInventory = grantRes.inventory;
            grantedAny = true;

            await tx.execute({
              sql: `INSERT INTO economy_transactions (
                id, idempotency_key, user_id, operation_type, source_type,
                source_id, code_text_snapshot, credits_delta, items_json, metadata_json, created_at
              ) VALUES (?, ?, ?, 'partner_owner_reward_grant', 'partner_referral', ?, ?, ?, ?, ?, ?)`,
              args: [
                `etx_${crypto.randomUUID()}`,
                idempotencyKey,
                partnerUserId,
                String(actRow.promo_code_id),
                String(actRow.code_text_snapshot),
                grantRes.creditsDelta,
                JSON.stringify(grantRes.itemsGranted),
                JSON.stringify({
                  activationId,
                  obligationId: String(ob.id),
                  invitedUserId: String(actRow.user_id),
                  partnerId: String(actRow.partner_id),
                  mode,
                }),
                nowIso,
              ],
            });
          }

          await tx.execute({
            sql: `UPDATE promo_reward_obligations SET status = 'granted', granted_at = ?, updated_at = ? WHERE id = ?`,
            args: [nowIso, nowIso, String(ob.id)],
          });
        }

        if (grantedAny) {
          await tx.execute({
            sql: 'UPDATE users SET credits = ?, inventory = ? WHERE id = ?',
            args: [partnerCredits, JSON.stringify(partnerInventory), partnerUserId],
          });
        }

        await tx.execute({
          sql: `UPDATE promo_activations SET partner_reward_status = 'granted', partner_reward_granted_at = ?, updated_at = ? WHERE id = ?`,
          args: [nowIso, nowIso, activationId],
        });

        await tx.commit();
      } catch (e) {
        try {
          await tx.rollback();
        } catch {
          // ignore
        }
        console.error('[PromoDb] processPendingPartnerPayoutForActivation error:', e);
      }
    };

    if (options?.partnerLockAlreadyHeld) {
      await executePayoutUnderPartnerLock();
    } else {
      await rewardMutex.runExclusive(`user:${partnerUserId}`, executePayoutUnderPartnerLock);
    }
  }

  /**
   * Called when an admin toggles a user's ban state (Stage 10).
   * When a partner is unbanned (`isBanned === false`), automatically pays out any held `pending_unban` partner rewards!
   */
  public async onUserBanToggled(
    userId: string,
    isBanned: boolean,
    now: Date = new Date()
  ): Promise<void> {
    if (isBanned) return;
    try {
      await rewardMutex.runExclusive(`user:${userId}`, async () => {
        const res = await db.execute({
          sql: `SELECT id FROM promo_activations WHERE partner_user_id = ? AND partner_reward_status IN ('pending_unban', 'pending_conditions')`,
          args: [userId],
        });
        for (const r of res.rows) {
          await this.processPendingPartnerPayoutForActivation(String(r.id), now, {
            partnerLockAlreadyHeld: true,
          });
        }
      });
    } catch (e) {
      console.error('[PromoDb] onUserBanToggled error:', e);
    }
  }

  /**
   * Called when a player/partner game account is completely deleted (Stages 3.4, 3.5, 10).
   * - If the deleted user was a Partner: soft-deletes their partner record & referral code, cancels future partner rewards, while preserving invited players' rewards and obligations!
   * - If the deleted user was an invited Player: anonymizes `promo_activations` (`user_deleted = 1`) so historical partner stats & qualification remain intact, cancels ungranted player obligations for the deleted user, and removes `user_partner_bindings` for that `user_id` so a brand-new registration in the future is a fresh user.
   */
  public async onUserAccountDeleted(userId: string, now: Date = new Date()): Promise<void> {
    const nowIso = now.toISOString();
    await rewardMutex.runExclusive(`user:${userId}`, async () => {
      // 1. If this user is a partner, soft-delete their partner card & referral code and stop future partner payouts
      const pRes = await db.execute({
        sql: 'SELECT id FROM partners WHERE user_id = ? AND is_deleted = 0',
        args: [userId],
      });
      for (const pRow of pRes.rows) {
        const partnerId = String(pRow.id);
        await db.execute({
          sql: 'UPDATE partners SET is_deleted = 1, is_enabled = 0, deleted_at = ?, updated_at = ? WHERE id = ?',
          args: [nowIso, nowIso, partnerId],
        });
        await db.execute({
          sql: 'UPDATE partner_referral_codes SET is_deleted = 1, is_enabled = 0, deleted_at = ?, updated_at = ? WHERE partner_id = ?',
          args: [nowIso, nowIso, partnerId],
        });
      }

      // Cancel any pending partner payouts where this deleted user was the partner recipient
      await db.execute({
        sql: `UPDATE promo_reward_obligations SET status = 'cancelled_recipient_deleted', updated_at = ?
              WHERE recipient_user_id = ? AND recipient_type = 'partner' AND status = 'pending'`,
        args: [nowIso, userId],
      });
      await db.execute({
        sql: `UPDATE promo_activations SET partner_reward_status = 'cancelled_partner_deleted', updated_at = ?
              WHERE partner_user_id = ? AND partner_reward_status IN ('pending_conditions', 'pending_unban')`,
        args: [nowIso, userId],
      });

      // 2. Anonymize player's activations (preserving partner's historical bound & qualified stats)
      await db.execute({
        sql: `UPDATE promo_activations SET
                user_deleted = 1,
                user_display_name_snapshot = 'Удалённый игрок',
                user_email_snapshot = '',
                qualification_status = CASE WHEN qualification_status = 'in_progress' THEN 'expired' ELSE qualification_status END,
                updated_at = ?
              WHERE user_id = ?`,
        args: [nowIso, userId],
      });

      // Cancel ungranted player obligations for this deleted player
      await db.execute({
        sql: `UPDATE promo_reward_obligations SET status = 'cancelled_recipient_deleted', updated_at = ?
              WHERE user_id = ? AND recipient_type = 'player' AND status = 'pending'`,
        args: [nowIso, userId],
      });

      // Remove user_partner_bindings for the deleted user account so a new registration is a brand-new user
      await db.execute({
        sql: 'DELETE FROM user_partner_bindings WHERE user_id = ?',
        args: [userId],
      });
    });
  }

  // ==========================================================================
  // PLAYER PERSONAL CABINET VIEW STATE (STAGE 8.2)
  // ==========================================================================

  public async getPlayerPromoState(
    userId: string,
    now: Date = new Date()
  ): Promise<{
    partnerBinding: {
      isBound: boolean;
      codeText: string | null;
      boundVia: 'registration' | 'profile' | null;
      boundAt: string | null;
    };
    activations: PlayerActivationView[];
  }> {
    // First make sure any already met obligations are granted
    await this.evaluateAndGrantPendingObligationsForUser(userId, now);

    const bindRes = await db.execute({
      sql: 'SELECT * FROM user_partner_bindings WHERE user_id = ?',
      args: [userId],
    });
    const bindRow = bindRes.rows[0];

    const actRes = await db.execute({
      sql: 'SELECT * FROM promo_activations WHERE user_id = ? ORDER BY activated_at DESC',
      args: [userId],
    });

    const activations: PlayerActivationView[] = [];
    for (const r of actRes.rows) {
      const activationId = String(r.id);
      const snap = safeJsonParse<any>(r.snapshot_json, {});
      const progress = {
        gamesSinceActivation: Number(r.current_games_since) || 0,
        activeSecondsSinceActivation: Number(r.current_active_seconds_since) || 0,
        currentLevel: Number(r.current_level) || 1,
      };

      const obRes = await db.execute({
        sql: `SELECT * FROM promo_reward_obligations WHERE activation_id = ? AND recipient_type = 'player' ORDER BY reward_index ASC`,
        args: [activationId],
      });

      const obligations: PlayerObligationView[] = obRes.rows.map((ob) => {
        const rw = safeJsonParse<PromoRewardSnapshot>(ob.reward_snapshot_json, {} as any);
        const conds = safeJsonParse<PromoRewardCondition[]>(ob.conditions_snapshot_json, []);
        const isGranted = String(ob.status) === 'granted';
        const rawIcon = String(rw.itemIcon || rw.itemImageUrl || (rw.itemType === 'credits' ? '💰' : '🎁'));
        const isImgUrl = /^(\/|https?:\/\/|data:image\/)/i.test(String(rw.itemImageUrl || ''));

        return {
          id: String(ob.id),
          rewardIndex: Number(ob.reward_index) || 0,
          itemId: String(rw.itemId || ''),
          itemTitle: String(rw.itemTitle || rw.itemId || 'Награда'),
          itemType: String(rw.itemType || 'item'),
          itemIcon: isImgUrl ? (rw.itemIcon || '🎁') : rawIcon,
          itemImageUrl: isImgUrl ? String(rw.itemImageUrl) : '',
          quantity: Number(rw.quantity) || 1,
          grantMode: rw.grantMode === 'conditional' ? 'conditional' : 'immediate',
          conditionLogic: rw.conditionLogic === 'OR' ? 'OR' : 'AND',
          conditions: conds.map((c) => {
            const ev = this.evaluateSingleCondition(c, progress);
            return {
              type: c.type,
              target: ev.target,
              current: isGranted ? ev.target : ev.current,
              completed: isGranted ? true : ev.completed,
              label: ev.label,
            };
          }),
          status: (ob.status as any) || 'pending',
          grantedAt: ob.granted_at ? String(ob.granted_at) : null,
        };
      });

      activations.push({
        id: activationId,
        codeKind: r.code_kind === 'partner' ? 'partner' : 'regular',
        codeText: String(r.code_text_snapshot),
        title: String(snap.title || `Код ${r.code_text_snapshot}`),
        boundVia: r.bound_via === 'registration' ? 'registration' : 'profile',
        activatedAt: String(r.activated_at),
        allPlayerRewardsGranted: Number(r.all_player_rewards_granted) === 1,
        obligations,
      });
    }

    return {
      partnerBinding: {
        isBound: Boolean(bindRow),
        codeText: bindRow ? String(bindRow.code_text_snapshot) : null,
        boundVia: bindRow
          ? bindRow.bound_via === 'registration'
            ? 'registration'
            : 'profile'
          : null,
        boundAt: bindRow ? String(bindRow.bound_at) : null,
      },
      activations,
    };
  }
}

export const promoDb = new PromoCodesDatabase();
