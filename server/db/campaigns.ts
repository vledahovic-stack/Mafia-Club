import crypto from 'crypto';
import { Client } from '@libsql/client';
import { getDatabase, sanitizeArgs } from './database';
import { grantInventoryItemWithSnapshot } from './items';
import {
  ItemDefinition,
  LOYALTY_CREDITS_ITEM_ID,
  LOYALTY_CREDITS_ITEM_DEF,
  UserInventoryItem,
  getItemDefinition,
} from '../data/items';
export { LOYALTY_CREDITS_ITEM_ID, LOYALTY_CREDITS_ITEM_DEF };
import { rewardMutex } from '../utils/asyncLock';
import {
  getProjectTimezone,
  parseDateTimeInTimezoneToUtcIso,
  isValidIanaTimezone,
} from '../utils/timezone';

const db: {
  execute: Client['execute'];
  transaction: Client['transaction'];
} = {
  execute: (...args: Parameters<Client['execute']>) => getDatabase().execute(...args),
  transaction: (...args: Parameters<Client['transaction']>) => getDatabase().transaction(...args),
};

export interface CampaignRewardItem {
  itemId: string;
  quantity: number;
}

export interface CampaignGrantedRewardSnapshot {
  itemId: string;
  quantity: number;
  name: string;
  icon: string;
  category: string;
  rarity: string;
  imageUrl?: string;
}

export type CampaignEffectiveStatus = 'active' | 'upcoming' | 'expired' | 'disabled';

export interface CampaignRecord {
  id: string;
  title: string;
  description: string;
  isEnabled: boolean;
  isDeleted: boolean;
  startsAt: string; // UTC ISO
  endsAt: string;   // UTC ISO
  scheduleTimezone: string;
  rewards: CampaignRewardItem[];
  rewardsEnriched: CampaignGrantedRewardSnapshot[];
  effectiveStatus: CampaignEffectiveStatus;
  isCurrentlyActiveWindow: boolean;
  uniqueRecipientsCount: number;
  pendingEntitlementsCount: number;
  totalCreditsGranted: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignClaimRecord {
  id: string;
  campaignId: string;
  campaignTitleSnapshot: string;
  campaignDescriptionSnapshot: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  triggerSource: 'register' | 'login' | 'online_presence' | 'reconnect_entitlement';
  status: 'entitled' | 'granted';
  rewardsGranted: CampaignGrantedRewardSnapshot[];
  creditsGranted: number;
  entitledAt: string;
  claimedAt: string | null;
  notifiedAt: string | null;
}

export interface PlayerCampaignView {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  scheduleTimezone: string;
  effectiveStatus: 'active' | 'upcoming';
  rewards: CampaignGrantedRewardSnapshot[];
  claimedByMe: boolean;
  claimedAt: string | null;
  myGrantedRewards: CampaignGrantedRewardSnapshot[] | null;
}

export interface CreateOrUpdateCampaignInput {
  title: string;
  description?: string;
  isEnabled?: boolean;
  startsAt?: string;       // UTC ISO or datetime-local
  endsAt?: string;         // UTC ISO or datetime-local
  startsAtLocal?: string;  // YYYY-MM-DDTHH:mm in project timezone
  endsAtLocal?: string;    // YYYY-MM-DDTHH:mm in project timezone
  scheduleTimezone?: string;
  rewards: CampaignRewardItem[];
}

export class CampaignsDatabase {
  private async resolveItemDef(itemId: string, txOrDb: { execute: Client['execute'] } = db): Promise<ItemDefinition | null> {
    const cleanId = (itemId || '').trim();
    if (!cleanId) return null;
    if (cleanId === LOYALTY_CREDITS_ITEM_ID) {
      return LOYALTY_CREDITS_ITEM_DEF;
    }
    const memDef = getItemDefinition(cleanId);
    if (memDef) return memDef;

    try {
      const res = await txOrDb.execute({
        sql: 'SELECT data FROM shop_items WHERE id = ?',
        args: [cleanId],
      });
      const row = res.rows[0];
      if (row && typeof row.data === 'string') {
        const parsed = JSON.parse(row.data) as ItemDefinition;
        if (parsed && parsed.id) return parsed;
      }
    } catch {}
    return null;
  }

  private async enrichRewardsList(
    rewards: CampaignRewardItem[],
    txOrDb: { execute: Client['execute'] } = db
  ): Promise<CampaignGrantedRewardSnapshot[]> {
    const enriched: CampaignGrantedRewardSnapshot[] = [];
    for (const r of rewards) {
      const def = await this.resolveItemDef(r.itemId, txOrDb);
      enriched.push({
        itemId: r.itemId,
        quantity: r.quantity,
        name: def?.name || (r.itemId === LOYALTY_CREDITS_ITEM_ID ? 'Внутриигровые кредиты' : r.itemId),
        icon: def?.icon || (r.itemId === LOYALTY_CREDITS_ITEM_ID ? '💰' : '🎁'),
        category: def?.category || (r.itemId === LOYALTY_CREDITS_ITEM_ID ? 'currency' : 'valuables'),
        rarity: def?.rarity || (r.itemId === LOYALTY_CREDITS_ITEM_ID ? 'epic' : 'common'),
        imageUrl: (def as any)?.imageUrl,
      });
    }
    return enriched;
  }

  public computeEffectiveStatus(
    isEnabled: boolean,
    startsAtIso: string,
    endsAtIso: string,
    nowMs: number = Date.now()
  ): { effectiveStatus: CampaignEffectiveStatus; isCurrentlyActiveWindow: boolean } {
    const startMs = Date.parse(startsAtIso);
    const endMs = Date.parse(endsAtIso);
    const inWindow = !Number.isNaN(startMs) && !Number.isNaN(endMs) && nowMs >= startMs && nowMs <= endMs;

    if (!isEnabled) {
      return { effectiveStatus: 'disabled', isCurrentlyActiveWindow: false };
    }
    if (nowMs < startMs) {
      return { effectiveStatus: 'upcoming', isCurrentlyActiveWindow: false };
    }
    if (nowMs > endMs) {
      return { effectiveStatus: 'expired', isCurrentlyActiveWindow: false };
    }
    return { effectiveStatus: 'active', isCurrentlyActiveWindow: inWindow };
  }

  private async validateAndNormalizeInput(
    input: CreateOrUpdateCampaignInput
  ): Promise<{
    title: string;
    description: string;
    isEnabled: boolean;
    startsAtIso: string;
    endsAtIso: string;
    scheduleTimezone: string;
    normalizedRewards: CampaignRewardItem[];
  }> {
    const title = (input.title || '').toString().trim();
    if (!title) {
      throw new Error('Укажите название акции.');
    }
    if (title.length > 200) {
      throw new Error('Название акции не должно превышать 200 символов.');
    }

    const description = (input.description ?? '').toString().trim();
    if (description.length > 3000) {
      throw new Error('Описание акции не должно превышать 3000 символов.');
    }

    const isEnabled = input.isEnabled !== undefined ? Boolean(input.isEnabled) : true;
    const projectTz = await getProjectTimezone();
    const tzToUse =
      input.scheduleTimezone && isValidIanaTimezone(input.scheduleTimezone)
        ? input.scheduleTimezone
        : projectTz;

    let startsAtIso: string | null = null;
    if (input.startsAtLocal && typeof input.startsAtLocal === 'string') {
      startsAtIso = parseDateTimeInTimezoneToUtcIso(input.startsAtLocal, tzToUse);
    } else if (input.startsAt && typeof input.startsAt === 'string') {
      // Check if it's already an ISO string with Z or offset, or local datetime string
      const raw = input.startsAt.trim();
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
        startsAtIso = parseDateTimeInTimezoneToUtcIso(raw, tzToUse);
      } else {
        const parsedMs = Date.parse(raw);
        if (!Number.isNaN(parsedMs)) {
          startsAtIso = new Date(parsedMs).toISOString();
        }
      }
    }

    let endsAtIso: string | null = null;
    if (input.endsAtLocal && typeof input.endsAtLocal === 'string') {
      endsAtIso = parseDateTimeInTimezoneToUtcIso(input.endsAtLocal, tzToUse);
    } else if (input.endsAt && typeof input.endsAt === 'string') {
      const raw = input.endsAt.trim();
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
        endsAtIso = parseDateTimeInTimezoneToUtcIso(raw, tzToUse);
      } else {
        const parsedMs = Date.parse(raw);
        if (!Number.isNaN(parsedMs)) {
          endsAtIso = new Date(parsedMs).toISOString();
        }
      }
    }

    if (!startsAtIso) {
      throw new Error('Укажите корректную дату и время начала акции.');
    }
    if (!endsAtIso) {
      throw new Error('Укажите корректную дату и время окончания акции.');
    }

    const startMs = Date.parse(startsAtIso);
    const endMs = Date.parse(endsAtIso);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      throw new Error('Некорректный формат дат проведения акции.');
    }
    if (endMs <= startMs) {
      throw new Error('Дата и время окончания акции должны быть позже даты и времени начала.');
    }

    if (!Array.isArray(input.rewards) || input.rewards.length === 0) {
      throw new Error('Добавьте хотя бы одну награду из каталога предметов для акции.');
    }

    const mergedMap = new Map<string, number>();
    for (const rawReward of input.rewards) {
      const itemId = (rawReward?.itemId || '').toString().trim();
      const qty = Math.trunc(Number(rawReward?.quantity));
      if (!itemId) {
        throw new Error('В списке наград указан пустой идентификатор предмета.');
      }
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > 1_000_000) {
        throw new Error(`Количество для предмета "${itemId}" должно быть целым числом от 1 до 1 000 000.`);
      }
      const def = await this.resolveItemDef(itemId);
      if (!def) {
        throw new Error(`Предмет "${itemId}" не найден в едином каталоге предметов.`);
      }
      mergedMap.set(itemId, (mergedMap.get(itemId) || 0) + qty);
    }

    const normalizedRewards: CampaignRewardItem[] = Array.from(mergedMap.entries()).map(
      ([itemId, quantity]) => ({ itemId, quantity })
    );

    if (normalizedRewards.length === 0) {
      throw new Error('Список наград акции не может быть пустым.');
    }

    return {
      title,
      description,
      isEnabled,
      startsAtIso,
      endsAtIso,
      scheduleTimezone: tzToUse,
      normalizedRewards,
    };
  }

  public async createCampaign(
    input: CreateOrUpdateCampaignInput,
    adminEmail?: string
  ): Promise<CampaignRecord> {
    const validated = await this.validateAndNormalizeInput(input);
    const nowIso = new Date().toISOString();
    const id = 'camp_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');

    await db.execute({
      sql: `
        INSERT INTO campaigns (
          id, title, description, is_enabled, starts_at, ends_at,
          schedule_timezone, rewards_json, is_deleted, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `,
      args: sanitizeArgs([
        id,
        validated.title,
        validated.description,
        validated.isEnabled ? 1 : 0,
        validated.startsAtIso,
        validated.endsAtIso,
        validated.scheduleTimezone,
        JSON.stringify(validated.normalizedRewards),
        adminEmail || null,
        nowIso,
        nowIso,
      ]),
    });

    const created = await this.getCampaignById(id);
    if (!created) {
      throw new Error('Ошибка чтения созданной акции.');
    }
    return created;
  }

  public async updateCampaign(
    id: string,
    input: CreateOrUpdateCampaignInput,
    _adminEmail?: string
  ): Promise<CampaignRecord> {
    const existingRes = await db.execute({
      sql: 'SELECT * FROM campaigns WHERE id = ? AND is_deleted = 0',
      args: [id],
    });
    const existingRow = existingRes.rows[0];
    if (!existingRow) {
      throw new Error('Акция не найдена или была удалена.');
    }
    const mergedInput: CreateOrUpdateCampaignInput = {
      title: input.title !== undefined ? input.title : String(existingRow.title),
      description: input.description !== undefined ? input.description : String(existingRow.description || ''),
      isEnabled: input.isEnabled !== undefined ? !!input.isEnabled : !!existingRow.is_enabled,
      startsAt: input.startsAt !== undefined ? input.startsAt : String(existingRow.starts_at),
      endsAt: input.endsAt !== undefined ? input.endsAt : String(existingRow.ends_at),
      scheduleTimezone: input.scheduleTimezone !== undefined ? input.scheduleTimezone : String(existingRow.schedule_timezone || 'Europe/Moscow'),
      rewards: input.rewards !== undefined ? input.rewards : (JSON.parse(String(existingRow.rewards_json || '[]'))),
    };

    const validated = await this.validateAndNormalizeInput(mergedInput);
    const nowIso = new Date().toISOString();

    await db.execute({
      sql: `
        UPDATE campaigns
        SET title = ?,
            description = ?,
            is_enabled = ?,
            starts_at = ?,
            ends_at = ?,
            schedule_timezone = ?,
            rewards_json = ?,
            updated_at = ?
        WHERE id = ? AND is_deleted = 0
      `,
      args: sanitizeArgs([
        validated.title,
        validated.description,
        validated.isEnabled ? 1 : 0,
        validated.startsAtIso,
        validated.endsAtIso,
        validated.scheduleTimezone,
        JSON.stringify(validated.normalizedRewards),
        nowIso,
        id,
      ]),
    });

    const updated = await this.getCampaignById(id);
    if (!updated) {
      throw new Error('Ошибка чтения обновлённой акции.');
    }
    return updated;
  }

  public async toggleCampaign(id: string, isEnabled: boolean): Promise<CampaignRecord> {
    const existingRes = await db.execute({
      sql: 'SELECT * FROM campaigns WHERE id = ? AND is_deleted = 0',
      args: [id],
    });
    if (!existingRes.rows[0]) {
      throw new Error('Акция не найдена или была удалена.');
    }

    const nowIso = new Date().toISOString();
    await db.execute({
      sql: 'UPDATE campaigns SET is_enabled = ?, updated_at = ? WHERE id = ? AND is_deleted = 0',
      args: [isEnabled ? 1 : 0, nowIso, id],
    });

    const updated = await this.getCampaignById(id);
    if (!updated) {
      throw new Error('Ошибка чтения обновлённой акции.');
    }
    return updated;
  }

  public async deleteCampaign(id: string): Promise<{ deleted: boolean; preservedClaimsCount: number }> {
    const existingRes = await db.execute({
      sql: 'SELECT * FROM campaigns WHERE id = ? AND is_deleted = 0',
      args: [id],
    });
    if (!existingRes.rows[0]) {
      throw new Error('Акция не найдена или уже удалена.');
    }

    const claimsCountRes = await db.execute({
      sql: "SELECT COUNT(*) as cnt FROM campaign_claims WHERE campaign_id = ? AND status = 'granted'",
      args: [id],
    });
    const preservedClaimsCount = Number(claimsCountRes.rows[0]?.cnt || 0);

    const nowIso = new Date().toISOString();
    // Soft-delete campaign so granted claims history and player inventories remain 100% intact
    await db.execute({
      sql: 'UPDATE campaigns SET is_deleted = 1, is_enabled = 0, deleted_at = ?, updated_at = ? WHERE id = ?',
      args: [nowIso, nowIso, id],
    });

    return { deleted: true, preservedClaimsCount };
  }

  private async mapRowToCampaignRecord(row: any, nowMs: number = Date.now()): Promise<CampaignRecord> {
    let rewards: CampaignRewardItem[] = [];
    try {
      const parsed = typeof row.rewards_json === 'string' ? JSON.parse(row.rewards_json) : row.rewards_json;
      if (Array.isArray(parsed)) rewards = parsed;
    } catch {}

    const rewardsEnriched = await this.enrichRewardsList(rewards);
    const isEnabled = Boolean(row.is_enabled);
    const startsAt = String(row.starts_at);
    const endsAt = String(row.ends_at);
    const { effectiveStatus, isCurrentlyActiveWindow } = this.computeEffectiveStatus(
      isEnabled,
      startsAt,
      endsAt,
      nowMs
    );

    const statsRes = await db.execute({
      sql: `
        SELECT
          SUM(CASE WHEN status = 'granted' THEN 1 ELSE 0 END) as granted_cnt,
          SUM(CASE WHEN status = 'entitled' THEN 1 ELSE 0 END) as entitled_cnt,
          SUM(CASE WHEN status = 'granted' THEN credits_granted ELSE 0 END) as total_credits
        FROM campaign_claims
        WHERE campaign_id = ?
      `,
      args: [String(row.id)],
    });
    const statsRow = statsRes.rows[0];

    return {
      id: String(row.id),
      title: String(row.title || ''),
      description: String(row.description || ''),
      isEnabled,
      isDeleted: Boolean(row.is_deleted),
      startsAt,
      endsAt,
      scheduleTimezone: String(row.schedule_timezone || 'UTC'),
      rewards,
      rewardsEnriched,
      effectiveStatus,
      isCurrentlyActiveWindow,
      uniqueRecipientsCount: Number(statsRow?.granted_cnt || 0),
      pendingEntitlementsCount: Number(statsRow?.entitled_cnt || 0),
      totalCreditsGranted: Number(statsRow?.total_credits || 0),
      createdBy: row.created_by ? String(row.created_by) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  public async getCampaignById(id: string, nowMs: number = Date.now()): Promise<CampaignRecord | null> {
    const res = await db.execute({
      sql: 'SELECT * FROM campaigns WHERE id = ? AND is_deleted = 0',
      args: [id],
    });
    if (!res.rows[0]) return null;
    return this.mapRowToCampaignRecord(res.rows[0], nowMs);
  }

  public async listAdminCampaigns(nowMs: number = Date.now()): Promise<CampaignRecord[]> {
    const res = await db.execute({
      sql: 'SELECT * FROM campaigns WHERE is_deleted = 0 ORDER BY created_at DESC',
      args: [],
    });
    const list: CampaignRecord[] = [];
    for (const row of res.rows) {
      list.push(await this.mapRowToCampaignRecord(row, nowMs));
    }
    return list;
  }

  public async getCampaignClaims(campaignId: string, limit: number = 200): Promise<CampaignClaimRecord[]> {
    const res = await db.execute({
      sql: `
        SELECT * FROM campaign_claims
        WHERE campaign_id = ?
        ORDER BY COALESCE(claimed_at, entitled_at) DESC
        LIMIT ?
      `,
      args: [campaignId, limit],
    });
    return res.rows.map((r) => this.mapRowToClaimRecord(r));
  }

  private mapRowToClaimRecord(r: any): CampaignClaimRecord {
    let rewardsGranted: CampaignGrantedRewardSnapshot[] = [];
    try {
      const parsed =
        typeof r.rewards_granted_json === 'string'
          ? JSON.parse(r.rewards_granted_json)
          : r.rewards_granted_json;
      if (Array.isArray(parsed)) rewardsGranted = parsed;
    } catch {}

    return {
      id: String(r.id),
      campaignId: String(r.campaign_id),
      campaignTitleSnapshot: String(r.campaign_title_snapshot || ''),
      campaignDescriptionSnapshot: String(r.campaign_description_snapshot || ''),
      userId: String(r.user_id),
      userDisplayName: String(r.user_display_name || ''),
      userEmail: String(r.user_email || ''),
      triggerSource: (r.trigger_source as CampaignClaimRecord['triggerSource']) || 'login',
      status: (r.status as 'entitled' | 'granted') || 'granted',
      rewardsGranted,
      creditsGranted: Number(r.credits_granted || 0),
      entitledAt: String(r.entitled_at),
      claimedAt: r.claimed_at ? String(r.claimed_at) : null,
      notifiedAt: r.notified_at ? String(r.notified_at) : null,
    };
  }

  /**
   * Returns campaigns visible to players in the Burger Menu «Акции» modal:
   * - Active campaigns (status 'active')
   * - Upcoming campaigns (status 'upcoming')
   * Disabled and expired campaigns are strictly excluded.
   */
  public async listPlayerVisibleCampaigns(
    userId: string | null,
    nowMs: number = Date.now()
  ): Promise<PlayerCampaignView[]> {
    const res = await db.execute({
      sql: 'SELECT * FROM campaigns WHERE is_deleted = 0 AND is_enabled = 1 ORDER BY starts_at ASC',
      args: [],
    });

    const userClaimsMap = new Map<string, CampaignClaimRecord>();
    if (userId) {
      const claimsRes = await db.execute({
        sql: "SELECT * FROM campaign_claims WHERE user_id = ? AND status = 'granted'",
        args: [userId],
      });
      for (const row of claimsRes.rows) {
        const mapped = this.mapRowToClaimRecord(row);
        userClaimsMap.set(mapped.campaignId, mapped);
      }
    }

    const result: PlayerCampaignView[] = [];
    for (const row of res.rows) {
      const isEnabled = Boolean(row.is_enabled);
      const startsAt = String(row.starts_at);
      const endsAt = String(row.ends_at);
      const { effectiveStatus } = this.computeEffectiveStatus(isEnabled, startsAt, endsAt, nowMs);

      if (effectiveStatus !== 'active' && effectiveStatus !== 'upcoming') {
        continue;
      }

      let rawRewards: CampaignRewardItem[] = [];
      try {
        const parsed = typeof row.rewards_json === 'string' ? JSON.parse(row.rewards_json) : row.rewards_json;
        if (Array.isArray(parsed)) rawRewards = parsed;
      } catch {}

      const enriched = await this.enrichRewardsList(rawRewards);
      const myClaim = userClaimsMap.get(String(row.id));

      result.push({
        id: String(row.id),
        title: String(row.title || ''),
        description: String(row.description || ''),
        startsAt,
        endsAt,
        scheduleTimezone: String(row.schedule_timezone || 'UTC'),
        effectiveStatus,
        rewards: enriched,
        claimedByMe: Boolean(myClaim),
        claimedAt: myClaim?.claimedAt || null,
        myGrantedRewards: myClaim ? myClaim.rewardsGranted : null,
      });
    }

    // Sort: 'active' first (by startsAt ASC), then 'upcoming' (by startsAt ASC)
    result.sort((a, b) => {
      if (a.effectiveStatus !== b.effectiveStatus) {
        return a.effectiveStatus === 'active' ? -1 : 1;
      }
      return Date.parse(a.startsAt) - Date.parse(b.startsAt);
    });

    return result;
  }

  /**
   * Records confirmed user presence during active campaigns (`status = 'entitled'`).
   * If the player's connection drops before grant completes and they reconnect after the campaign ends,
   * their `'entitled'` record guarantees they still receive the gift on reconnect.
   */
  public async confirmUserEntitlementForActiveCampaigns(
    userId: string,
    triggerSource: 'register' | 'login' | 'online_presence' | 'reconnect_entitlement' = 'online_presence',
    nowMs: number = Date.now()
  ): Promise<number> {
    if (!userId) return 0;
    const nowIso = new Date(nowMs).toISOString();

    // Find active campaigns right now
    const activeRes = await db.execute({
      sql: `
        SELECT * FROM campaigns
        WHERE is_deleted = 0
          AND is_enabled = 1
          AND starts_at <= ?
          AND ends_at >= ?
      `,
      args: [nowIso, nowIso],
    });
    if (activeRes.rows.length === 0) return 0;

    // Check which campaigns this user already has in campaign_claims
    const existingRes = await db.execute({
      sql: 'SELECT campaign_id FROM campaign_claims WHERE user_id = ?',
      args: [userId],
    });
    const existingCampaignIds = new Set(existingRes.rows.map((r) => String(r.campaign_id)));

    const missingCampaigns = activeRes.rows.filter((r) => !existingCampaignIds.has(String(r.id)));
    if (missingCampaigns.length === 0) return 0;

    // Verify user exists and is not banned
    const userRes = await db.execute({
      sql: 'SELECT id, display_name, email, is_banned FROM users WHERE id = ?',
      args: [userId],
    });
    const userRow = userRes.rows[0];
    if (!userRow || Boolean(userRow.is_banned)) return 0;

    let newlyEntitled = 0;
    for (const campRow of missingCampaigns) {
      const claimId = 'cclaim_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
      let rawRewards: CampaignRewardItem[] = [];
      try {
        const parsed =
          typeof campRow.rewards_json === 'string'
            ? JSON.parse(campRow.rewards_json)
            : campRow.rewards_json;
        if (Array.isArray(parsed)) rawRewards = parsed;
      } catch {}
      const enrichedSnapshot = await this.enrichRewardsList(rawRewards);

      const insRes = await db.execute({
        sql: `
          INSERT INTO campaign_claims (
            id, campaign_id, campaign_title_snapshot, campaign_description_snapshot,
            user_id, user_display_name, user_email, trigger_source,
            status, rewards_granted_json, credits_granted, entitled_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'entitled', ?, 0, ?)
          ON CONFLICT(campaign_id, user_id) DO NOTHING
        `,
        args: sanitizeArgs([
          claimId,
          String(campRow.id),
          String(campRow.title || ''),
          String(campRow.description || ''),
          String(userRow.id),
          String(userRow.display_name || ''),
          String(userRow.email || ''),
          triggerSource,
          JSON.stringify(enrichedSnapshot),
          nowIso,
        ]),
      });
      if (Number(insRes.rowsAffected || 0) > 0) {
        newlyEntitled++;
      }
    }
    return newlyEntitled;
  }

  /**
   * Evaluates active campaigns for `userId`, records confirmed presence, and atomically grants
   * any pending entitlements (including entitlements recorded before a disconnect even if the
   * campaign window has since ended).
   *
   * Protected by `rewardMutex.runExclusive('user:' + userId)` and LibSQL `write` transaction.
   */
  public async evaluateAndGrantForUser(
    userId: string,
    triggerSource: 'register' | 'login' | 'online_presence' | 'reconnect_entitlement' = 'online_presence',
    nowMs: number = Date.now()
  ): Promise<{
    newlyGrantedClaims: CampaignClaimRecord[];
    unnotifiedClaims: CampaignClaimRecord[];
  }> {
    if (!userId) {
      return { newlyGrantedClaims: [], unnotifiedClaims: [] };
    }

    // 1. Confirm presence in any currently active campaigns
    await this.confirmUserEntitlementForActiveCampaigns(userId, triggerSource, nowMs);

    // 2. Check if user has any pending 'entitled' claims to grant
    const pendingCheckRes = await db.execute({
      sql: "SELECT id FROM campaign_claims WHERE user_id = ? AND status = 'entitled'",
      args: [userId],
    });

    const newlyGrantedClaims: CampaignClaimRecord[] = [];

    if (pendingCheckRes.rows.length > 0) {
      await rewardMutex.runExclusive(`user:${userId}`, async () => {
        const tx = await db.transaction('write');
        try {
          const pendingRes = await tx.execute({
            sql: "SELECT * FROM campaign_claims WHERE user_id = ? AND status = 'entitled'",
            args: [userId],
          });

          if (pendingRes.rows.length === 0) {
            await tx.commit();
            return;
          }

          const userRowRes = await tx.execute({
            sql: 'SELECT id, display_name, email, credits, inventory, is_banned FROM users WHERE id = ?',
            args: [userId],
          });
          const userRow = userRowRes.rows[0];
          if (!userRow || Boolean(userRow.is_banned)) {
            await tx.commit();
            return;
          }

          let currentCredits = Number(userRow.credits || 0);
          let currentInventory: UserInventoryItem[] = [];
          try {
            const parsedInv =
              typeof userRow.inventory === 'string'
                ? JSON.parse(userRow.inventory)
                : userRow.inventory;
            currentInventory = Array.isArray(parsedInv) ? parsedInv : [];
          } catch {
            currentInventory = [];
          }

          const grantNowIso = new Date(nowMs).toISOString();

          for (const claimRow of pendingRes.rows) {
            const claimId = String(claimRow.id);
            const campaignId = String(claimRow.campaign_id);

            // Check if the campaign still exists to get the latest rewards_json (if edited before grant)
            const campRes = await tx.execute({
              sql: 'SELECT title, description, rewards_json FROM campaigns WHERE id = ?',
              args: [campaignId],
            });
            const campRow = campRes.rows[0];

            let rewardsToGrant: CampaignRewardItem[] = [];
            if (campRow && typeof campRow.rewards_json === 'string') {
              try {
                const parsed = JSON.parse(campRow.rewards_json);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  rewardsToGrant = parsed;
                }
              } catch {}
            }
            if (rewardsToGrant.length === 0) {
              // Fallback to snapshotted rewards on the entitlement row
              try {
                const snapParsed =
                  typeof claimRow.rewards_granted_json === 'string'
                    ? JSON.parse(claimRow.rewards_granted_json)
                    : claimRow.rewards_granted_json;
                if (Array.isArray(snapParsed)) {
                  rewardsToGrant = snapParsed.map((s: any) => ({
                    itemId: String(s.itemId),
                    quantity: Number(s.quantity || 1),
                  }));
                }
              } catch {}
            }

            if (rewardsToGrant.length === 0) {
              continue;
            }

            let creditsDelta = 0;
            const grantedSnapshots: CampaignGrantedRewardSnapshot[] = [];

            for (const reward of rewardsToGrant) {
              const rItemId = (reward.itemId || '').trim();
              const rQty = Math.trunc(Number(reward.quantity));
              if (!rItemId || !Number.isSafeInteger(rQty) || rQty < 1) continue;

              if (rItemId === LOYALTY_CREDITS_ITEM_ID) {
                creditsDelta += rQty;
                grantedSnapshots.push({
                  itemId: LOYALTY_CREDITS_ITEM_ID,
                  quantity: rQty,
                  name: LOYALTY_CREDITS_ITEM_DEF.name,
                  icon: LOYALTY_CREDITS_ITEM_DEF.icon,
                  category: LOYALTY_CREDITS_ITEM_DEF.category,
                  rarity: LOYALTY_CREDITS_ITEM_DEF.rarity,
                });
              } else {
                const itemDef = await this.resolveItemDef(rItemId, tx);
                if (!itemDef) {
                  throw new Error(
                    `Предмет "${rItemId}" из акции "${campaignId}" не найден в каталоге при выдаче.`
                  );
                }
                const grantRes = grantInventoryItemWithSnapshot(
                  currentInventory,
                  itemDef,
                  rQty,
                  grantNowIso
                );
                currentInventory = grantRes.inventory;
                grantedSnapshots.push({
                  itemId: itemDef.id,
                  quantity: rQty,
                  name: itemDef.name,
                  icon: itemDef.icon,
                  category: itemDef.category,
                  rarity: itemDef.rarity,
                  imageUrl: (itemDef as any)?.imageUrl,
                });
              }
            }

            currentCredits += creditsDelta;

            const titleSnapshot = campRow?.title
              ? String(campRow.title)
              : String(claimRow.campaign_title_snapshot || '');
            const descSnapshot = campRow?.description
              ? String(campRow.description)
              : String(claimRow.campaign_description_snapshot || '');

            // Mark claim as 'granted'
            const updClaimRes = await tx.execute({
              sql: `
                UPDATE campaign_claims
                SET status = 'granted',
                    campaign_title_snapshot = ?,
                    campaign_description_snapshot = ?,
                    user_display_name = ?,
                    user_email = ?,
                    rewards_granted_json = ?,
                    credits_granted = ?,
                    claimed_at = ?
                WHERE id = ? AND status = 'entitled'
              `,
              args: sanitizeArgs([
                titleSnapshot,
                descSnapshot,
                String(userRow.display_name || ''),
                String(userRow.email || ''),
                JSON.stringify(grantedSnapshots),
                creditsDelta,
                grantNowIso,
                claimId,
              ]),
            });

            if (Number(updClaimRes.rowsAffected || 0) > 0) {
              // Record immutable economy transaction
              const txId = 'ectx_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
              await tx.execute({
                sql: `
                  INSERT INTO economy_transactions (
                    id, idempotency_key, user_id, operation_type, source_type, source_id,
                    code_text_snapshot, credits_delta, items_json, metadata_json, created_at
                  ) VALUES (?, ?, ?, 'campaign_gift', 'campaign', ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(idempotency_key) DO NOTHING
                `,
                args: sanitizeArgs([
                  txId,
                  `campaign_claim:${claimId}`,
                  userId,
                  campaignId,
                  titleSnapshot,
                  creditsDelta,
                  JSON.stringify(grantedSnapshots),
                  JSON.stringify({ triggerSource: claimRow.trigger_source, claimId }),
                  grantNowIso,
                ]),
              });

              newlyGrantedClaims.push({
                id: claimId,
                campaignId,
                campaignTitleSnapshot: titleSnapshot,
                campaignDescriptionSnapshot: descSnapshot,
                userId,
                userDisplayName: String(userRow.display_name || ''),
                userEmail: String(userRow.email || ''),
                triggerSource: (claimRow.trigger_source as any) || triggerSource,
                status: 'granted',
                rewardsGranted: grantedSnapshots,
                creditsGranted: creditsDelta,
                entitledAt: String(claimRow.entitled_at),
                claimedAt: grantNowIso,
                notifiedAt: null,
              });
            }
          }

          if (newlyGrantedClaims.length > 0) {
            await tx.execute({
              sql: 'UPDATE users SET credits = ?, inventory = ?, updated_at = ? WHERE id = ?',
              args: sanitizeArgs([
                currentCredits,
                JSON.stringify(currentInventory),
                grantNowIso,
                userId,
              ]),
            });
          }

          await tx.commit();
        } catch (err) {
          try {
            await tx.rollback();
          } catch {}
          throw err;
        } finally {
          try {
            tx.close();
          } catch {}
        }
      });
    }

    const unnotifiedClaims = await this.getUnnotifiedClaimsForUser(userId);
    return { newlyGrantedClaims, unnotifiedClaims };
  }

  public async getUnnotifiedClaimsForUser(userId: string): Promise<CampaignClaimRecord[]> {
    if (!userId) return [];
    const res = await db.execute({
      sql: `
        SELECT * FROM campaign_claims
        WHERE user_id = ?
          AND status = 'granted'
          AND notified_at IS NULL
        ORDER BY claimed_at ASC
      `,
      args: [userId],
    });
    return res.rows.map((r) => this.mapRowToClaimRecord(r));
  }

  public async acknowledgeNotifications(userId: string, claimIds?: string[]): Promise<number> {
    if (!userId) return 0;
    const nowIso = new Date().toISOString();

    if (Array.isArray(claimIds) && claimIds.length > 0) {
      let updatedCount = 0;
      for (const cid of claimIds) {
        if (!cid || typeof cid !== 'string') continue;
        const res = await db.execute({
          sql: `
            UPDATE campaign_claims
            SET notified_at = ?
            WHERE id = ? AND user_id = ? AND status = 'granted' AND notified_at IS NULL
          `,
          args: [nowIso, cid, userId],
        });
        updatedCount += Number(res.rowsAffected || 0);
      }
      return updatedCount;
    }

    const res = await db.execute({
      sql: `
        UPDATE campaign_claims
        SET notified_at = ?
        WHERE user_id = ? AND status = 'granted' AND notified_at IS NULL
      `,
      args: [nowIso, userId],
    });
    return Number(res.rowsAffected || 0);
  }

  public async hasActiveCampaignsNow(nowMs: number = Date.now()): Promise<boolean> {
    const nowIso = new Date(nowMs).toISOString();
    const res = await db.execute({
      sql: `
        SELECT id FROM campaigns
        WHERE is_deleted = 0
          AND is_enabled = 1
          AND starts_at <= ?
          AND ends_at >= ?
        LIMIT 1
      `,
      args: [nowIso, nowIso],
    });
    return res.rows.length > 0;
  }
}

export const campaignsDb = new CampaignsDatabase();
