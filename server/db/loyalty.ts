import { Client } from '@libsql/client';
import { getDatabase, sanitizeArgs, waitForDatabaseInit } from './database';
import {
  getItemDefinition,
  ItemDefinition,
  LOYALTY_CREDITS_ITEM_ID,
  LoyaltyBonusConfig,
  LoyaltyBonusType,
  LoyaltyRewardItem,
  LoyaltyBonusClaimRecord,
  UserInventoryItem
} from '../data/items';
import { grantInventoryItemWithSnapshot } from './lootboxFoundation';
import { rewardMutex } from '../utils/asyncLock';
import { UserRecord } from './users';

export interface LoyaltyGrantResult {
  granted: boolean;
  creditsGranted: number;
  itemsGranted: Array<{ itemId: string; quantity: number; name: string; rarity: string; icon: string }>;
  skippedReason?: string;
  newCredits?: number;
  nextInventory?: UserInventoryItem[];
}

export class LoyaltyDatabase {
  private get db(): Client {
    return getDatabase();
  }

  public async ensureSeed(): Promise<void> {
    try {
      await waitForDatabaseInit();
      const nowIso = new Date().toISOString();
      await this.db.execute({
        sql: `INSERT OR IGNORE INTO loyalty_configs (bonus_type, is_enabled, items, updated_at, updated_by)
              VALUES ('registration', 0, '[]', ?, 'system')`,
        args: [nowIso]
      });
      await this.db.execute({
        sql: `INSERT OR IGNORE INTO loyalty_configs (bonus_type, is_enabled, items, updated_at, updated_by)
              VALUES ('email_verification', 0, '[]', ?, 'system')`,
        args: [nowIso]
      });
    } catch (err) {
      console.error('[LoyaltyDb] Error ensuring seed:', err);
    }
  }

  public async getConfig(bonusType: LoyaltyBonusType): Promise<LoyaltyBonusConfig> {
    await this.ensureSeed();
    const res = await this.db.execute({
      sql: 'SELECT * FROM loyalty_configs WHERE bonus_type = ?',
      args: [bonusType]
    });
    const row = res.rows[0];
    if (!row) {
      return {
        bonusType,
        isEnabled: false,
        items: [],
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
      };
    }

    let items: LoyaltyRewardItem[] = [];
    try {
      items = typeof row.items === 'string' ? JSON.parse(row.items as string) : (row.items as any) || [];
    } catch {
      items = [];
    }

    return {
      bonusType: row.bonus_type as LoyaltyBonusType,
      isEnabled: Boolean(row.is_enabled),
      items: Array.isArray(items) ? items : [],
      updatedAt: (row.updated_at as string) || new Date().toISOString(),
      updatedBy: (row.updated_by as string) || null
    };
  }

  public async getConfigs(): Promise<{
    registration: LoyaltyBonusConfig;
    emailVerification: LoyaltyBonusConfig;
  }> {
    const [registration, emailVerification] = await Promise.all([
      this.getConfig('registration'),
      this.getConfig('email_verification')
    ]);
    return { registration, emailVerification };
  }

  public async updateConfig(
    bonusType: LoyaltyBonusType,
    updates: { isEnabled?: boolean; items?: LoyaltyRewardItem[] },
    adminEmail: string
  ): Promise<LoyaltyBonusConfig> {
    if (bonusType !== 'registration' && bonusType !== 'email_verification') {
      throw new Error(`Недопустимый тип бонуса: ${bonusType}. Допустимы 'registration' и 'email_verification'.`);
    }

    const current = await this.getConfig(bonusType);
    const isEnabled = updates.isEnabled !== undefined ? Boolean(updates.isEnabled) : current.isEnabled;
    const rawItems = updates.items !== undefined ? updates.items : current.items;

    if (!Array.isArray(rawItems)) {
      throw new Error('Список наград должен быть массивом.');
    }

    // Validation: Empty bonus CANNOT be saved as enabled
    if (isEnabled && rawItems.length === 0) {
      throw new Error('Нельзя включить бонус без наград. Добавьте хотя бы одну награду перед активацией.');
    }

    // Validate items and check for duplicates
    const seenItemIds = new Set<string>();
    const sanitizedItems: LoyaltyRewardItem[] = [];

    for (const item of rawItems) {
      if (!item || typeof item !== 'object') {
        throw new Error('Обнаружен некорректный элемент в списке наград.');
      }
      const itemId = (item.itemId || '').trim();
      if (!itemId) {
        throw new Error('Идентификатор предмета (itemId) не может быть пустым.');
      }
      if (seenItemIds.has(itemId)) {
        throw new Error('В списке наград обнаружены повторяющиеся предметы. Объедините количество или удалите дубликаты.');
      }
      seenItemIds.add(itemId);

      const qty = Math.trunc(Number(item.quantity));
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > 1000000) {
        throw new Error(`Количество для предмета "${itemId}" должно быть целым положительным числом от 1 до 1 000 000.`);
      }

      // Check item catalog validity
      if (itemId !== LOYALTY_CREDITS_ITEM_ID) {
        let itemDef = getItemDefinition(itemId);
        if (!itemDef) {
          const itemRowRes = await this.db.execute({
            sql: 'SELECT data FROM shop_items WHERE id = ?',
            args: [itemId]
          });
          const itemRow = itemRowRes.rows[0];
          if (itemRow && typeof itemRow.data === 'string') {
            try {
              itemDef = JSON.parse(itemRow.data) as ItemDefinition;
            } catch {}
          }
        }
        if (!itemDef) {
          throw new Error(`Предмет с ID "${itemId}" не найден в каталоге Города.`);
        }
      }

      sanitizedItems.push({
        itemId,
        quantity: qty
      });
    }

    const nowIso = new Date().toISOString();
    await this.db.execute({
      sql: `
        INSERT INTO loyalty_configs (bonus_type, is_enabled, items, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(bonus_type) DO UPDATE SET
          is_enabled = excluded.is_enabled,
          items = excluded.items,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `,
      args: sanitizeArgs([
        bonusType,
        isEnabled ? 1 : 0,
        JSON.stringify(sanitizedItems),
        nowIso,
        adminEmail || 'admin'
      ])
    });

    return {
      bonusType,
      isEnabled,
      items: sanitizedItems,
      updatedAt: nowIso,
      updatedBy: adminEmail || 'admin'
    };
  }

  public async hasClaim(userId: string, bonusType: LoyaltyBonusType): Promise<boolean> {
    const res = await this.db.execute({
      sql: 'SELECT id FROM loyalty_bonus_claims WHERE user_id = ? AND bonus_type = ?',
      args: [userId, bonusType]
    });
    return Boolean(res.rows[0]);
  }

  public async evaluateAndGrantRegistrationBonus(
    user: UserRecord,
    nowIso: string = new Date().toISOString()
  ): Promise<LoyaltyGrantResult> {
    return this.evaluateAndGrantBonus(user, 'registration', nowIso);
  }

  public async evaluateAndGrantEmailVerificationBonus(
    user: UserRecord,
    nowIso: string = new Date().toISOString()
  ): Promise<LoyaltyGrantResult> {
    return this.evaluateAndGrantBonus(user, 'email_verification', nowIso);
  }

  public async evaluateAndGrantRegistrationBonusInTx(
    tx: any,
    user: UserRecord,
    nowIso: string = new Date().toISOString()
  ): Promise<LoyaltyGrantResult> {
    return this.evaluateAndGrantBonusInTx(tx, user, 'registration', nowIso);
  }

  public async evaluateAndGrantEmailVerificationBonusInTx(
    tx: any,
    user: UserRecord,
    nowIso: string = new Date().toISOString()
  ): Promise<LoyaltyGrantResult> {
    return this.evaluateAndGrantBonusInTx(tx, user, 'email_verification', nowIso);
  }

  /**
   * Standalone atomic bonus evaluation and grant.
   * Serializes per-user operations in-memory via `rewardMutex` (`user:${user.id}`)
   * and executes all DB reads/writes inside a single LibSQL/SQLite `write` transaction.
   */
  private async evaluateAndGrantBonus(
    user: UserRecord,
    bonusType: LoyaltyBonusType,
    nowIso: string
  ): Promise<LoyaltyGrantResult> {
    await this.ensureSeed();
    return rewardMutex.runExclusive(`user:${user.id}`, async () => {
      const tx = await (this.db as any).transaction('write');
      try {
        const result = await this.evaluateAndGrantBonusInTx(tx, user, bonusType, nowIso);
        await tx.commit();

        // Mutate in-memory user object ONLY after transaction commit succeeds
        if (result.granted && result.newCredits !== undefined && result.nextInventory !== undefined) {
          user.credits = result.newCredits;
          user.inventory = result.nextInventory;
        }
        return result;
      } catch (err) {
        try { await tx.rollback(); } catch {}
        throw err;
      } finally {
        try { tx.close(); } catch {}
      }
    });
  }

  /**
   * Executes bonus evaluation, ledger insertion, and user balance/inventory update
   * within an caller-supplied active `write` transaction `tx`.
   *
   * Note: Does NOT mutate `user.credits` or `user.inventory` directly so that if the caller's
   * transaction rolls back, the in-memory `user` object is never left with uncommitted rewards.
   * Instead, returns `newCredits` and `nextInventory` in `LoyaltyGrantResult`.
   */
  public async evaluateAndGrantBonusInTx(
    tx: any,
    user: UserRecord,
    bonusType: LoyaltyBonusType,
    nowIso: string
  ): Promise<LoyaltyGrantResult> {
    // 1. Check DB unique ledger inside write transaction
    const existingRes = await tx.execute({
      sql: 'SELECT id, status FROM loyalty_bonus_claims WHERE user_id = ? AND bonus_type = ?',
      args: [user.id, bonusType]
    });
    if (existingRes.rows[0]) {
      return {
        granted: false,
        creditsGranted: 0,
        itemsGranted: [],
        skippedReason: 'already_processed'
      };
    }

    // 2. Read current bonus config inside the same write transaction
    const configRes = await tx.execute({
      sql: 'SELECT * FROM loyalty_configs WHERE bonus_type = ?',
      args: [bonusType]
    });
    const configRow = configRes.rows[0];
    let configItems: LoyaltyRewardItem[] = [];
    let isEnabled = false;
    if (configRow) {
      isEnabled = Boolean(configRow.is_enabled);
      try {
        const parsed = typeof configRow.items === 'string' ? JSON.parse(configRow.items as string) : configRow.items;
        configItems = Array.isArray(parsed) ? parsed : [];
      } catch {
        configItems = [];
      }
    }

    const claimId = 'claim_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

    // 3. If bonus is disabled or has no items: record skipped_disabled in ledger atomically
    if (!isEnabled || configItems.length === 0) {
      const skipInsertRes = await tx.execute({
        sql: `
          INSERT INTO loyalty_bonus_claims (id, user_id, bonus_type, credits_granted, items_granted, status, claimed_at)
          VALUES (?, ?, ?, 0, '[]', 'skipped_disabled', ?)
          ON CONFLICT(user_id, bonus_type) DO NOTHING
        `,
        args: [claimId, user.id, bonusType, nowIso]
      });

      if (Number(skipInsertRes.rowsAffected || 0) === 0) {
        return {
          granted: false,
          creditsGranted: 0,
          itemsGranted: [],
          skippedReason: 'already_processed'
        };
      }

      return {
        granted: false,
        creditsGranted: 0,
        itemsGranted: [],
        skippedReason: 'disabled'
      };
    }

    // 4. Read fresh user state (credits, inventory) from `users` table inside `tx`
    const userRowRes = await tx.execute({
      sql: 'SELECT id, credits, inventory FROM users WHERE id = ?',
      args: [user.id]
    });
    const userRow = userRowRes.rows[0];
    if (!userRow) {
      throw new Error(`Пользователь "${user.id}" не найден в базе данных при начислении бонуса "${bonusType}".`);
    }

    const currentCredits = Number(userRow.credits || 0);
    let currentInventory: UserInventoryItem[] = [];
    try {
      const parsedInv = typeof userRow.inventory === 'string' ? JSON.parse(userRow.inventory as string) : userRow.inventory;
      currentInventory = Array.isArray(parsedInv) ? parsedInv : [];
    } catch {
      currentInventory = [];
    }

    // 5. Prepare ALL rewards in memory first (strictly all-or-nothing; never skip missing/broken items)
    let creditsToAdd = 0;
    let nextInventory: UserInventoryItem[] = currentInventory.map(slot => ({
      ...slot,
      ...(slot.ruleSnapshot ? { ruleSnapshot: { ...slot.ruleSnapshot } } : {})
    }));
    const itemsGrantedDetails: Array<{
      itemId: string;
      quantity: number;
      name: string;
      rarity: string;
      icon: string;
    }> = [];

    for (const reward of configItems) {
      const rewardItemId = (reward?.itemId || '').trim();
      const rewardQty = Math.trunc(Number(reward?.quantity));
      if (!rewardItemId || !Number.isSafeInteger(rewardQty) || rewardQty < 1) {
        throw new Error(`Некорректная запись награды в конфигурации бонуса "${bonusType}".`);
      }

      if (rewardItemId === LOYALTY_CREDITS_ITEM_ID) {
        creditsToAdd += rewardQty;
        itemsGrantedDetails.push({
          itemId: LOYALTY_CREDITS_ITEM_ID,
          quantity: rewardQty,
          name: 'Внутриигровые кредиты',
          rarity: 'epic',
          icon: '💰'
        });
      } else {
        let itemDef: ItemDefinition | undefined = getItemDefinition(rewardItemId);
        if (!itemDef) {
          // Fallback to reading item definition directly from shop_items inside `tx`
          const itemRowRes = await tx.execute({
            sql: 'SELECT data FROM shop_items WHERE id = ?',
            args: [rewardItemId]
          });
          const itemRow = itemRowRes.rows[0];
          if (itemRow && typeof itemRow.data === 'string') {
            try {
              itemDef = JSON.parse(itemRow.data) as ItemDefinition;
            } catch {}
          }
        }

        if (!itemDef || !itemDef.id) {
          throw new Error(
            `Предмет "${rewardItemId}" из состава бонуса "${bonusType}" отсутствует в каталоге. Выдача прервана для предотвращения частичного начисления.`
          );
        }

        const grantResult = grantInventoryItemWithSnapshot(
          nextInventory,
          itemDef,
          rewardQty,
          nowIso
        );
        nextInventory = grantResult.inventory;
        itemsGrantedDetails.push({
          itemId: itemDef.id,
          quantity: rewardQty,
          name: itemDef.name,
          rarity: itemDef.rarity,
          icon: itemDef.icon
        });
      }
    }

    const newCredits = currentCredits + creditsToAdd;

    // 6. Insert claim into `loyalty_bonus_claims` BEFORE updating `users`
    // Enforces UNIQUE(user_id, bonus_type) and ensures ledger write succeeds before any balance change
    const claimInsertRes = await tx.execute({
      sql: `
        INSERT INTO loyalty_bonus_claims (id, user_id, bonus_type, credits_granted, items_granted, status, claimed_at)
        VALUES (?, ?, ?, ?, ?, 'granted', ?)
        ON CONFLICT(user_id, bonus_type) DO NOTHING
      `,
      args: sanitizeArgs([
        claimId,
        user.id,
        bonusType,
        creditsToAdd,
        JSON.stringify(itemsGrantedDetails),
        nowIso
      ])
    });

    if (Number(claimInsertRes.rowsAffected || 0) === 0) {
      return {
        granted: false,
        creditsGranted: 0,
        itemsGranted: [],
        skippedReason: 'already_processed'
      };
    }

    // 7. Atomically update user credits and inventory inside the same write transaction
    const updateRes = await tx.execute({
      sql: 'UPDATE users SET credits = ?, inventory = ?, updated_at = ? WHERE id = ?',
      args: sanitizeArgs([newCredits, JSON.stringify(nextInventory), nowIso, user.id])
    });

    if (Number(updateRes.rowsAffected || 0) === 0) {
      throw new Error(`Не удалось обновить профиль игрока "${user.id}" при выдаче бонуса "${bonusType}".`);
    }

    return {
      granted: true,
      creditsGranted: creditsToAdd,
      itemsGranted: itemsGrantedDetails,
      newCredits,
      nextInventory
    };
  }

  public async getClaimsHistory(
    bonusType?: LoyaltyBonusType,
    limit: number = 50
  ): Promise<LoyaltyBonusClaimRecord[]> {
    await this.ensureSeed();
    const cleanLimit = Math.max(1, Math.min(200, limit));
    let sql = `
      SELECT c.*, u.email as user_email, u.display_name as user_display_name
      FROM loyalty_bonus_claims c
      LEFT JOIN users u ON u.id = c.user_id
    `;
    const args: any[] = [];
    if (bonusType) {
      sql += ' WHERE c.bonus_type = ?';
      args.push(bonusType);
    }
    sql += ' ORDER BY c.claimed_at DESC LIMIT ?';
    args.push(cleanLimit);

    const res = await this.db.execute({ sql, args: sanitizeArgs(args) });
    return res.rows.map(r => {
      let itemsGranted: any[] = [];
      try {
        itemsGranted = typeof r.items_granted === 'string' ? JSON.parse(r.items_granted as string) : (r.items_granted as any) || [];
      } catch {
        itemsGranted = [];
      }
      return {
        id: r.id as string,
        userId: r.user_id as string,
        bonusType: r.bonus_type as LoyaltyBonusType,
        creditsGranted: Number(r.credits_granted || 0),
        itemsGranted: Array.isArray(itemsGranted) ? itemsGranted : [],
        status: (r.status as 'granted' | 'skipped_disabled') || 'granted',
        claimedAt: r.claimed_at as string,
        userEmail: (r.user_email as string) || undefined,
        userDisplayName: (r.user_display_name as string) || undefined
      };
    });
  }

  public async getStats(): Promise<{
    registrationClaimsCount: number;
    registrationGrantedCount: number;
    emailClaimsCount: number;
    emailGrantedCount: number;
    totalCreditsGranted: number;
    totalItemsGranted: number;
  }> {
    await this.ensureSeed();
    const res = await this.db.execute(`
      SELECT 
        bonus_type,
        status,
        COUNT(*) as cnt,
        SUM(credits_granted) as sum_credits
      FROM loyalty_bonus_claims
      GROUP BY bonus_type, status
    `);

    let registrationClaimsCount = 0;
    let registrationGrantedCount = 0;
    let emailClaimsCount = 0;
    let emailGrantedCount = 0;
    let totalCreditsGranted = 0;

    for (const r of res.rows) {
      const cnt = Number(r.cnt || 0);
      const credits = Number(r.sum_credits || 0);
      const bType = r.bonus_type as string;
      const status = r.status as string;

      if (bType === 'registration') {
        registrationClaimsCount += cnt;
        if (status === 'granted') {
          registrationGrantedCount += cnt;
          totalCreditsGranted += credits;
        }
      } else if (bType === 'email_verification') {
        emailClaimsCount += cnt;
        if (status === 'granted') {
          emailGrantedCount += cnt;
          totalCreditsGranted += credits;
        }
      }
    }

    // Compute total items granted count from granted claims
    const grantedRows = await this.db.execute({
      sql: "SELECT items_granted FROM loyalty_bonus_claims WHERE status = 'granted' AND items_granted != '[]'",
      args: []
    });
    let totalItemsGranted = 0;
    for (const gr of grantedRows.rows) {
      try {
        const arr = JSON.parse(gr.items_granted as string);
        if (Array.isArray(arr)) {
          for (const it of arr) {
            if (it.itemId !== LOYALTY_CREDITS_ITEM_ID) {
              totalItemsGranted += Number(it.quantity || 1);
            }
          }
        }
      } catch {}
    }

    return {
      registrationClaimsCount,
      registrationGrantedCount,
      emailClaimsCount,
      emailGrantedCount,
      totalCreditsGranted,
      totalItemsGranted
    };
  }
}

export const loyaltyDb = new LoyaltyDatabase();
