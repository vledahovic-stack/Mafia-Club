import crypto from 'crypto';
import {
  ItemDefinition,
  ItemCategory,
  ItemRarity,
  LootboxPresentationConfig,
  LootboxRewardType,
  LootboxSoundCategory,
  LootboxMediaAssetRecord,
  LootboxRuleConfig,
  UserInventoryItem,
  syncItemsCatalog
} from '../data/items';
import { getDatabase, sanitizeArgs, waitForDatabaseInit } from './database';
import { Client } from '@libsql/client';
import { rewardMutex } from '../utils/asyncLock';
import {
  DeletedItemReplacementRecord,
  LEGACY_SYSTEM_CHEST_IDS,
  LegacySystemChestId,
  LootboxSimulationResult,
  LootboxValidationResult,
  buildLegacyInitialChestRuleConfig,
  buildLegacyInitialChestSnapshot,
  computeLootboxRuleSnapshotHash,
  isLegacySystemChestId,
  isValidLootboxRuleSnapshot,
  isValidSha256Hex,
  simulateLootboxDrops,
  validateLootboxPresentationConfig,
  validateLootboxRuleConfig
} from './lootboxFoundation';

export * from './lootboxFoundation';

/**
 * One-time migration identifier stored in `system_migrations`.
 * Ensures that if a persistent database (such as production Turso) only had a partial subset
 * of the 17 original items before the catalog unification, the missing initial items are safely
 * inserted ONCE (`INSERT OR IGNORE`) without overwriting existing records or resurrecting items
 * on every future restart.
 */
const INITIAL_CATALOG_MIGRATION_ID = 'catalog_v1_restore_initial_17_items';
export const LEGACY_CHESTS_SNAPSHOT_MIGRATION_ID = 'lootbox_v1_migrate_legacy_chests_and_inventories';

const INITIAL_17_CATALOG_MIGRATION_RECORDS: ReadonlyArray<ItemDefinition> = [
  {
    id: 'card_role_select',
    name: 'Карточка выбора роли',
    category: 'certificates',
    rarity: 'epic',
    cost: 250,
    pawnValue: 125,
    icon: '🎴',
    usable: true,
    consumable: true,
    inShop: true,
    adminHidden: false,
    description:
      'Особый ордер Синдиката на заказ желаемой роли. Активируется в лобби перед стартом партии. Если нет конкурентов — 100% гарантия роли! При конкуренции роль разыгрывается случайно. Предмет сгорает при использовании.',
    effectDescription:
      'Заказ желаемой роли в лобби перед стартом партии (100% без конкурентов или рандом при соперничестве).'
  },
  {
    id: 'cert_name_change',
    name: 'Сертификат на смену никнейма',
    category: 'certificates',
    rarity: 'rare',
    cost: 250,
    pawnValue: 125,
    icon: '📜',
    usable: true,
    consumable: true,
    inShop: true,
    adminHidden: false,
    description:
      'Официальный гербовый бланк Городского Магистрата. Предоставляет право на 1 бесплатную смену игрового никнейма.',
    effectDescription: 'Бесплатная смена никнейма в профиле без списания 250 кредитов.'
  },
  {
    id: 'cert_avatar_change',
    name: 'Сертификат на смену аватара',
    category: 'certificates',
    rarity: 'rare',
    cost: 500,
    pawnValue: 250,
    icon: '🎭',
    usable: true,
    consumable: true,
    inShop: true,
    adminHidden: false,
    description:
      'Официальный пропуск Городского Фотоателье. Предоставляет право на 1 бесплатную смену внешности / аватара профиля.',
    effectDescription: 'Бесплатная смена аватара в профиле без списания 500 кредитов.'
  },
  {
    id: 'chest_novice',
    name: 'Сундук Мафиози',
    category: 'chests',
    rarity: 'common',
    cost: 100,
    pawnValue: 50,
    icon: '🧰',
    usable: true,
    consumable: true,
    inShop: true,
    adminHidden: false,
    description:
      'Начальный сундук контрабандиста. Содержит монеты, ценности ломбарда или базовые рубашки карт.',
    effectDescription: 'Открывает случайную награду от 50 до 150 кредитов или косметику.'
  },
  {
    id: 'chest_don',
    name: 'Сейф Дона',
    category: 'chests',
    rarity: 'epic',
    cost: 300,
    pawnValue: 150,
    icon: '🔒',
    usable: true,
    consumable: true,
    inShop: true,
    adminHidden: false,
    description:
      'Тяжёлый сейф с кодовым замком синдиката. Содержит редкие титулы, сертификаты и крупные суммы кредитов.',
    effectDescription: 'Шанс получить сертификат на смену никнейма, титул или 250-400 кредитов.'
  },
  {
    id: 'chest_sheriff',
    name: 'Кейс Шерифа',
    category: 'chests',
    rarity: 'legendary',
    cost: 500,
    pawnValue: 250,
    icon: '💼',
    usable: true,
    consumable: true,
    inShop: true,
    adminHidden: false,
    description:
      'Архивный дипломат специального отдела полиции. Содержит элитные сертификаты и легендарные титулы.',
    effectDescription: 'Гарантированно содержит ценный предмет или крупный запас кредитов.'
  },
  {
    id: 'card_crimson',
    name: 'Рубашка «Кровавая Ночь»',
    category: 'cosmetics',
    rarity: 'rare',
    cost: 120,
    pawnValue: 60,
    icon: '🎴',
    usable: true,
    consumable: false,
    cosmeticType: 'card_back',
    inShop: true,
    adminHidden: false,
    description: 'Тёмно-алая шёлковая отделка рубашки карт в стиле классического гангстерского нуара.',
    effectDescription: 'Экипирует рубиново-красную рубашку карт.'
  },
  {
    id: 'card_gold',
    name: 'Рубашка «Золотой Дон»',
    category: 'cosmetics',
    rarity: 'epic',
    cost: 150,
    pawnValue: 75,
    icon: '🃏',
    usable: true,
    consumable: false,
    cosmeticType: 'card_back',
    inShop: true,
    adminHidden: false,
    description: 'Эксклюзивная золотая отделка игровых карт с позолоченным тиснением.',
    effectDescription: 'Экипирует золотую рубашку карт на вашем столе.'
  },
  {
    id: 'title_law',
    name: 'Титул «Неподкупный»',
    category: 'cosmetics',
    rarity: 'rare',
    cost: 180,
    pawnValue: 90,
    icon: '🛡️',
    usable: true,
    consumable: false,
    cosmeticType: 'title',
    inShop: true,
    adminHidden: false,
    description: 'Почётный знак отличия честных граждан и защитников закона.',
    effectDescription: 'Отображает титул «Неподкупный» в вашем профиле.'
  },
  {
    id: 'title_godfather',
    name: 'Титул «Крёстный Отец»',
    category: 'cosmetics',
    rarity: 'legendary',
    cost: 200,
    pawnValue: 100,
    icon: '👑',
    usable: true,
    consumable: false,
    cosmeticType: 'title',
    inShop: true,
    adminHidden: false,
    description: 'Уважительный титул, внушающий трепет всему преступному синдикату.',
    effectDescription: 'Отображает золотой титул «Крёстный Отец» в вашем профиле.'
  },
  {
    id: 'skin_crimson_syndicate',
    name: 'Стиль «Синдикат Багровой Луны»',
    category: 'cosmetics',
    rarity: 'epic',
    cost: 350,
    pawnValue: 175,
    icon: '🩸',
    usable: true,
    consumable: false,
    cosmeticType: 'ui_skin',
    inShop: true,
    featured: true,
    adminHidden: false,
    description:
      'Эксклюзивный премиальный стиль интерфейса в багрово-рубиновых и обсидиановых тонах с кроваво-золотыми контурами.',
    effectDescription: 'Активирует динамический стиль «Синдикат Багровой Луны» во всём интерфейсе игры.'
  },
  {
    id: 'skin_vintage_gold',
    name: 'Стиль «Золотой Век Рокфеллера»',
    category: 'cosmetics',
    rarity: 'epic',
    cost: 450,
    pawnValue: 225,
    icon: '⚜️',
    usable: true,
    consumable: false,
    cosmeticType: 'ui_skin',
    inShop: true,
    adminHidden: false,
    description:
      'Аристократичный стиль Ар-Деко с позолоченными рамками карточек, латунными вензелями и глубоким бархатным фоном.',
    effectDescription: 'Активирует динамический стиль «Золотой Век Рокфеллера» во всём интерфейсе игры.'
  },
  {
    id: 'skin_cyber_noir',
    name: 'Стиль «Неоновый Детектив 2088»',
    category: 'cosmetics',
    rarity: 'legendary',
    cost: 600,
    pawnValue: 300,
    icon: '🌃',
    usable: true,
    consumable: false,
    cosmeticType: 'ui_skin',
    inShop: true,
    featured: true,
    adminHidden: false,
    description:
      'Киберпанковский стиль интерфейса с неоновыми бирюзовыми HUD-контурами, кибер-панелями и цифровыми акцентами.',
    effectDescription: 'Активирует динамический стиль «Неоновый Детектив 2088» во всём интерфейсе игры.'
  },
  {
    id: 'skin_cyberpunk_neon',
    name: 'Стиль «Киберпанк Неон 2088»',
    category: 'cosmetics',
    rarity: 'legendary',
    cost: 750,
    pawnValue: 375,
    icon: '⚡',
    usable: true,
    consumable: false,
    cosmeticType: 'ui_skin',
    inShop: true,
    featured: true,
    adminHidden: false,
    description:
      'Эксклюзивный неоновый кибер-интерфейс с многослойными светящимися контурами, розово-синей матрицей и футуристическим HUD.',
    effectDescription:
      'Активирует динамический киберпанк-скин «Киберпанк Неон 2088» с неоновыми рамками, цифровым фоном и кибер-аватаром.'
  },
  {
    id: 'item_lighter',
    name: 'Серебряная зажигалка Zippo',
    category: 'valuables',
    rarity: 'common',
    cost: 120,
    pawnValue: 80,
    icon: '🕯️',
    usable: false,
    consumable: true,
    inShop: true,
    adminHidden: false,
    description: 'Гравированная серебряная зажигалка, найденная в пальто дона. Принимается в ломбарде.',
    effectDescription: 'Сдаётся в городском ломбарде за 80 внутриигровых кредитов.'
  },
  {
    id: 'item_watch',
    name: 'Золотые карманные часы',
    category: 'valuables',
    rarity: 'rare',
    cost: 200,
    pawnValue: 120,
    icon: '⏱️',
    usable: false,
    consumable: true,
    inShop: true,
    adminHidden: false,
    description: 'Швейцарские золотые часы на цепочке. Трофей с громкого дела 1928 года. Можно сдать в ломбард.',
    effectDescription: 'Сдаётся в городском ломбарде за 120 внутриигровых кредитов.'
  },
  {
    id: 'item_cufflinks',
    name: 'Запонки с рубином',
    category: 'valuables',
    rarity: 'epic',
    cost: 240,
    pawnValue: 160,
    icon: '💎',
    usable: false,
    consumable: true,
    inShop: true,
    adminHidden: false,
    description: 'Фамильная реликвия чикагской семьи. Ростовщики платят за неё высокую цену.',
    effectDescription: 'Сдаётся в городском ломбарде за 160 внутриигровых кредитов.'
  }
];

/**
 * ItemsDatabase is the single master repository for all game items in Mafia Club.
 * Backed exclusively by the database (Turso in production / SQLite in local dev)
 * with in-memory catalog synchronization.
 */
export class ItemsDatabase {
  private isSeeded = false;
  private seedPromise: Promise<void> | null = null;

  private get db(): Client {
    return getDatabase();
  }

  /**
   * Synchronizes the in-memory item registry from the database table `shop_items`.
   * Also performs a safe one-time restoration migration (`catalog_v1_restore_initial_17_items`)
   * if the database has not yet had all 17 initial catalog items migrated into `shop_items`.
   */
  public async ensureSeed(): Promise<void> {
    if (this.isSeeded) return;
    if (this.seedPromise) return this.seedPromise;

    this.seedPromise = (async () => {
      try {
        await waitForDatabaseInit();

        try {
          await this.db.execute('ALTER TABLE shop_items ADD COLUMN is_admin_hidden INTEGER NOT NULL DEFAULT 0');
        } catch {}

        try {
          await this.db.execute(`
            CREATE TABLE IF NOT EXISTS system_migrations (
              id TEXT PRIMARY KEY,
              applied_at TEXT NOT NULL,
              details TEXT
            )
          `);
        } catch {}

        await this.runOneTimeInitialCatalogMigrationIfNeeded();
        await this.runLegacyChestsAndInventoriesMigrationIfNeeded();

        const res = await this.db.execute('SELECT * FROM shop_items ORDER BY category, price ASC');
        const allItems = res.rows.map(r => this.rowToItem(r));
        syncItemsCatalog(allItems);
        this.isSeeded = true;
      } catch (e) {
        console.error('[ItemsDb] ensureSeed error:', e);
      } finally {
        this.seedPromise = null;
      }
    })();

    return this.seedPromise;
  }

  /**
   * Executes a strictly one-time migration tracked in `system_migrations`.
   * Inserts ONLY the missing records out of the 17 initial items using `INSERT OR IGNORE`,
   * preserving any existing records (such as `card_role_select` and `skin_vintage_gold` on Turso)
   * without modifying their IDs, prices, settings, or visibility flags.
   */
  private async runOneTimeInitialCatalogMigrationIfNeeded(): Promise<void> {
    const migRes = await this.db.execute({
      sql: 'SELECT id FROM system_migrations WHERE id = ?',
      args: [INITIAL_CATALOG_MIGRATION_ID]
    });

    if (migRes.rows.length > 0) {
      return;
    }

    const result = await this.insertMissingInitialItemsInternal();
    const now = new Date().toISOString();

    await this.db.execute({
      sql: 'INSERT OR REPLACE INTO system_migrations (id, applied_at, details) VALUES (?, ?, ?)',
      args: sanitizeArgs([
        INITIAL_CATALOG_MIGRATION_ID,
        now,
        JSON.stringify({
          restoredCount: result.restoredIds.length,
          restoredIds: result.restoredIds,
          skippedExistingIds: result.skippedExistingIds
        })
      ])
    });

    if (result.restoredIds.length > 0) {
      console.log(
        `[ItemsDb] One-time catalog migration (${INITIAL_CATALOG_MIGRATION_ID}): restored ${result.restoredIds.length} missing items (${result.restoredIds.join(', ')}), preserved ${result.skippedExistingIds.length} existing items.`
      );
    }
  }

  private async insertMissingInitialItemsInternal(): Promise<{
    restoredIds: string[];
    skippedExistingIds: string[];
  }> {
    const existingRes = await this.db.execute('SELECT id FROM shop_items');
    const existingIds = new Set<string>(existingRes.rows.map((r: any) => String(r.id)));

    const restoredIds: string[] = [];
    const skippedExistingIds: string[] = [];
    const statements: Array<{ sql: string; args: any[] }> = [];
    const now = new Date().toISOString();

    for (const item of INITIAL_17_CATALOG_MIGRATION_RECORDS) {
      if (existingIds.has(item.id)) {
        skippedExistingIds.push(item.id);
        continue;
      }

      restoredIds.push(item.id);
      const isLegacyChest = isLegacySystemChestId(item.id);
      const itemData: ItemDefinition = {
        ...item,
        inShop: item.inShop !== false,
        adminHidden: Boolean(item.adminHidden),
        ...(isLegacyChest
          ? {
              isCustomLootbox: false,
              lootboxConfig: buildLegacyInitialChestRuleConfig(item.id as LegacySystemChestId)
            }
          : {})
      };

      statements.push({
        sql: `
          INSERT OR IGNORE INTO shop_items (
            id, name, category, price, rarity, is_available, is_admin_hidden, data, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: sanitizeArgs([
          itemData.id,
          itemData.name,
          itemData.category,
          itemData.cost,
          itemData.rarity,
          itemData.inShop ? 1 : 0,
          itemData.adminHidden ? 1 : 0,
          JSON.stringify(itemData),
          now
        ])
      });
    }

    if (statements.length > 0) {
      await this.db.batch(statements);
    }

    return { restoredIds, skippedExistingIds };
  }

  /**
   * Runs the legacy chest & player inventory snapshot migration if not yet recorded,
   * AND performs a fast idempotent safety verification so no pre-existing legacy chest
   * ('chest_novice', 'chest_don', 'chest_sheriff') ever lacks its historical ruleSnapshot.
   */
  private async runLegacyChestsAndInventoriesMigrationIfNeeded(): Promise<void> {
    await this.runLegacyChestsAndInventoriesMigration();
  }

  /**
   * Idempotent, mutex-protected, transactional migration for the 3 legacy chests
   * ('chest_novice', 'chest_don', 'chest_sheriff') and already-granted instances in `users.inventory`.
   *
   * Guarantees:
   * - Never alters quantities of chests or any other items.
   * - Never touches non-legacy items or custom lootboxes.
   * - Never overwrites an already-valid `ruleSnapshot` or `lootboxConfig`.
   * - Never copies modified catalog rules onto old un-snapshotted player chests (always uses historical v0 `[100, 200, 350, 500, 1000]`).
   * - Protects each user's inventory update with `rewardMutex.runExclusive('user:' + userId)` + write transaction + optimistic check.
   */
  public async runLegacyChestsAndInventoriesMigration(): Promise<{
    migratedCatalogChestIds: string[];
    skippedCatalogChestIds: string[];
    migratedUsersCount: number;
    migratedInventorySlotsCount: number;
    skippedInventorySlotsCount: number;
  }> {
    // 1. Pre-migration validation of historical v0 configs and SHA-256 hashes
    const catalogRes = await this.db.execute('SELECT * FROM shop_items');
    const catalogMap: Record<string, ItemDefinition> = {};
    for (const row of catalogRes.rows) {
      const parsed = this.rowToItem(row);
      catalogMap[parsed.id] = parsed;
    }

    for (const chestId of LEGACY_SYSTEM_CHEST_IDS) {
      const legacyCfg = buildLegacyInitialChestRuleConfig(chestId);
      if (!isValidSha256Hex(legacyCfg.snapshotHash)) {
        throw new Error(`[LootboxMigration] Invalid SHA-256 hash generated for legacy chest "${chestId}".`);
      }
      const validation = validateLootboxRuleConfig(chestId, legacyCfg, catalogMap);
      if (!validation.valid) {
        throw new Error(
          `[LootboxMigration] Legacy config validation failed for "${chestId}": ${validation.errors.join('; ')}`
        );
      }
    }

    // 2. Migrate the 3 legacy chest definitions in `shop_items` if they don't yet have a valid lootboxConfig
    const migratedCatalogChestIds: string[] = [];
    const skippedCatalogChestIds: string[] = [];

    for (const chestId of LEGACY_SYSTEM_CHEST_IDS) {
      const tx = await this.db.transaction('write');
      try {
        const rowRes = await tx.execute({
          sql: 'SELECT * FROM shop_items WHERE id = ?',
          args: [chestId]
        });
        const row = rowRes.rows[0];
        if (!row) {
          await tx.rollback();
          throw new Error(
            `[LootboxMigration] Legacy chest "${chestId}" is missing from shop_items. Aborting migration.`
          );
        }

        const rawDataStr = String(row.data || '');
        const itemDef = this.rowToItem(row);
        const existingCfg = itemDef.lootboxConfig;
        const hasValidExistingConfig =
          Boolean(existingCfg) &&
          isValidSha256Hex(existingCfg?.snapshotHash) &&
          existingCfg?.snapshotHash === computeLootboxRuleSnapshotHash(chestId, existingCfg!);

        if (hasValidExistingConfig && itemDef.isCustomLootbox === false) {
          skippedCatalogChestIds.push(chestId);
          await tx.commit();
        } else {
          const updatedItem: ItemDefinition = {
            ...itemDef,
            isCustomLootbox: false,
            lootboxConfig: hasValidExistingConfig
              ? existingCfg!
              : buildLegacyInitialChestRuleConfig(chestId)
          };

          const updateRes = await tx.execute({
            sql: 'UPDATE shop_items SET data = ? WHERE id = ? AND data = ?',
            args: sanitizeArgs([JSON.stringify(updatedItem), chestId, rawDataStr])
          });

          if ((updateRes.rowsAffected ?? 0) === 0) {
            throw new Error(
              `[LootboxMigration] Concurrent modification detected on shop_items for "${chestId}".`
            );
          }

          await tx.commit();
          migratedCatalogChestIds.push(chestId);
        }
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
    }

    // 3. Migrate existing player inventories in `users`
    const usersRes = await this.db.execute('SELECT id FROM users');
    const userIds = usersRes.rows.map((r: any) => String(r.id));

    let migratedUsersCount = 0;
    let migratedInventorySlotsCount = 0;
    let skippedInventorySlotsCount = 0;

    for (const userId of userIds) {
      await rewardMutex.runExclusive(`user:${userId}`, async () => {
        const tx = await this.db.transaction('write');
        try {
          const uRes = await tx.execute({
            sql: 'SELECT id, inventory FROM users WHERE id = ?',
            args: [userId]
          });
          const uRow = uRes.rows[0];
          if (!uRow) {
            await tx.commit();
            return;
          }

          const originalInventoryStr =
            typeof uRow.inventory === 'string' ? uRow.inventory : JSON.stringify(uRow.inventory || []);

          let parsedInventory: UserInventoryItem[];
          try {
            const raw = JSON.parse(originalInventoryStr || '[]');
            if (!Array.isArray(raw)) {
              throw new Error(`Inventory of user "${userId}" is not an array.`);
            }
            parsedInventory = raw;
          } catch (parseErr) {
            throw new Error(
              `[LootboxMigration] Failed to parse inventory JSON for user "${userId}": ${
                parseErr instanceof Error ? parseErr.message : String(parseErr)
              }`
            );
          }

          let userChanged = false;
          const updatedInventory: UserInventoryItem[] = parsedInventory.map((slot, idx) => {
            if (!slot || typeof slot !== 'object' || !isLegacySystemChestId(slot.itemId)) {
              return slot;
            }

            const chestId = slot.itemId as LegacySystemChestId;
            if (isValidLootboxRuleSnapshot(chestId, slot.ruleSnapshot) && slot.id) {
              skippedInventorySlotsCount += 1;
              return slot;
            }

            userChanged = true;
            migratedInventorySlotsCount += 1;

            const preservedSnapshot = isValidLootboxRuleSnapshot(chestId, slot.ruleSnapshot)
              ? slot.ruleSnapshot
              : buildLegacyInitialChestSnapshot(chestId, {
                  capturedAt: slot.acquiredAt || undefined
                });

            return {
              ...slot,
              id: slot.id && String(slot.id).trim() ? String(slot.id).trim() : `inv_legacy_${userId}_${idx}_${chestId}`,
              itemId: chestId,
              quantity: slot.quantity,
              acquiredAt: slot.acquiredAt,
              ruleSnapshot: preservedSnapshot
            };
          });

          if (userChanged) {
            const updateRes = await tx.execute({
              sql: 'UPDATE users SET inventory = ? WHERE id = ? AND inventory = ?',
              args: sanitizeArgs([JSON.stringify(updatedInventory), userId, uRow.inventory])
            });

            if ((updateRes.rowsAffected ?? 0) === 0) {
              throw new Error(
                `[LootboxMigration] Concurrent modification detected on inventory for user "${userId}".`
              );
            }
            migratedUsersCount += 1;
          }

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
      });
    }

    // 4. Post-migration verification before recording completion in `system_migrations`
    const verifyUsersRes = await this.db.execute('SELECT id, inventory FROM users');
    for (const uRow of verifyUsersRes.rows) {
      const inv: UserInventoryItem[] = JSON.parse(String(uRow.inventory || '[]'));
      for (const slot of inv) {
        if (slot && isLegacySystemChestId(slot.itemId)) {
          if (!isValidLootboxRuleSnapshot(slot.itemId, slot.ruleSnapshot)) {
            throw new Error(
              `[LootboxMigration] Post-migration verification failed: user "${String(uRow.id)}" still has legacy chest "${slot.itemId}" without a valid ruleSnapshot.`
            );
          }
        }
      }
    }

    const existingMig = await this.db.execute({
      sql: 'SELECT id FROM system_migrations WHERE id = ?',
      args: [LEGACY_CHESTS_SNAPSHOT_MIGRATION_ID]
    });

    if (existingMig.rows.length === 0) {
      await this.db.execute({
        sql: 'INSERT OR REPLACE INTO system_migrations (id, applied_at, details) VALUES (?, ?, ?)',
        args: sanitizeArgs([
          LEGACY_CHESTS_SNAPSHOT_MIGRATION_ID,
          new Date().toISOString(),
          JSON.stringify({
            migratedCatalogChestIds,
            skippedCatalogChestIds,
            migratedUsersCount,
            migratedInventorySlotsCount,
            skippedInventorySlotsCount
          })
        ])
      });

      console.log(
        `[ItemsDb] Completed migration ${LEGACY_CHESTS_SNAPSHOT_MIGRATION_ID}: catalog chests migrated=${migratedCatalogChestIds.length} (skipped=${skippedCatalogChestIds.length}), users migrated=${migratedUsersCount}, slots migrated=${migratedInventorySlotsCount} (skipped=${skippedInventorySlotsCount}).`
      );
    }

    return {
      migratedCatalogChestIds,
      skippedCatalogChestIds,
      migratedUsersCount,
      migratedInventorySlotsCount,
      skippedInventorySlotsCount
    };
  }

  /**
   * Safe administrative method to check and restore any missing items from the 17 initial records
   * without overwriting or duplicating existing records.
   */
  public async restoreMissingInitialItems(): Promise<{
    restoredIds: string[];
    skippedExistingIds: string[];
    items: ItemDefinition[];
  }> {
    await this.ensureSeed();
    const { restoredIds, skippedExistingIds } = await this.insertMissingInitialItemsInternal();
    const items = await this.getAllItems();
    syncItemsCatalog(items);
    return { restoredIds, skippedExistingIds, items };
  }

  public rowToItem(row: any): ItemDefinition {
    try {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data || {};
      const adminHidden =
        row.is_admin_hidden !== undefined && row.is_admin_hidden !== null
          ? Boolean(Number(row.is_admin_hidden))
          : Boolean(data.adminHidden);
      return {
        ...data,
        id: row.id,
        name: row.name,
        category: row.category as ItemCategory,
        cost: Number(row.price),
        rarity: row.rarity as ItemRarity,
        inShop: Boolean(row.is_available),
        adminHidden
      };
    } catch {
      return {
        id: row.id,
        name: row.name,
        category: row.category,
        cost: Number(row.price),
        rarity: row.rarity,
        inShop: Boolean(row.is_available),
        adminHidden: Boolean(Number(row.is_admin_hidden || 0))
      } as any;
    }
  }

  /**
   * Returns ALL items in the game catalog from the database.
   * This is the master list of all items (whether in shop or not, and whether hidden in admin selectors or not).
   */
  public async getAllItems(): Promise<ItemDefinition[]> {
    await this.ensureSeed();
    const res = await this.db.execute('SELECT * FROM shop_items ORDER BY category, price ASC');
    const items = res.rows.map(r => this.rowToItem(r));
    syncItemsCatalog(items);
    return items;
  }

  /**
   * Returns items that are marked as for sale in the shop (is_available = 1).
   * Note: adminHidden does NOT affect shop availability for players.
   */
  public async getShopItems(): Promise<ItemDefinition[]> {
    await this.ensureSeed();
    const res = await this.db.execute('SELECT * FROM shop_items WHERE is_available = 1 ORDER BY category, price ASC');
    return res.rows.map(r => this.rowToItem(r));
  }

  /**
   * Retrieves a single item definition by ID strictly from the database.
   */
  public async getItemById(id: string): Promise<ItemDefinition | null> {
    if (!id) return null;
    await this.ensureSeed();
    const res = await this.db.execute({
      sql: 'SELECT * FROM shop_items WHERE id = ?',
      args: [id]
    });
    const row = res.rows[0];
    if (row) {
      return this.rowToItem(row);
    }
    return null;
  }

  /**
   * Returns a dictionary map of all catalog items keyed by ID.
   */
  public async getCatalogMap(): Promise<Record<string, ItemDefinition>> {
    const items = await this.getAllItems();
    const map: Record<string, ItemDefinition> = {};
    for (const item of items) {
      map[item.id] = item;
    }
    return map;
  }

  /**
   * Returns all records from `deleted_item_replacements` keyed by `deleted_item_id`.
   */
  public async getDeletedItemReplacementsMap(): Promise<Record<string, DeletedItemReplacementRecord>> {
    await this.ensureSeed();
    const res = await this.db.execute('SELECT * FROM deleted_item_replacements');
    const map: Record<string, DeletedItemReplacementRecord> = {};
    for (const row of res.rows) {
      const deletedId = String(row.deleted_item_id || '').trim();
      if (!deletedId) continue;
      map[deletedId] = {
        deletedItemId: deletedId,
        deletedItemName: String(row.deleted_item_name || deletedId),
        replacementType: row.replacement_type as 'credits' | 'item' | 'lootbox',
        replacementItemId: row.replacement_item_id ? String(row.replacement_item_id) : null,
        replacementQty: Math.max(1, Math.trunc(Number(row.replacement_qty || 1))),
        deletedAt: String(row.deleted_at || ''),
        deletedByAdminId: row.deleted_by_admin_id ? String(row.deleted_by_admin_id) : null
      };
    }
    return map;
  }

  /**
   * Returns all lootbox items (`category === 'chests'`) in the unified catalog.
   */
  public async getAllLootboxes(): Promise<ItemDefinition[]> {
    const all = await this.getAllItems();
    return all.filter(item => item.category === 'chests');
  }

  /**
   * Returns a single lootbox item (`category === 'chests'`) by ID.
   */
  public async getLootboxById(id: string): Promise<ItemDefinition | null> {
    const item = await this.getItemById(id);
    if (!item || item.category !== 'chests') {
      return null;
    }
    return item;
  }

  /**
   * Creates a new custom lootbox in the unified `shop_items` catalog (`category: 'chests'`, `isCustomLootbox: true`).
   */
  public async createCustomLootbox(input: {
    id: string;
    name: string;
    rarity?: ItemRarity;
    cost?: number;
    pawnValue?: number;
    icon?: string;
    description?: string;
    effectDescription?: string;
    inShop?: boolean;
    featured?: boolean;
    discountPercent?: number;
    adminHidden?: boolean;
    lootboxConfig?: Partial<LootboxRuleConfig>;
    presentationConfig?: LootboxPresentationConfig;
  }): Promise<{ item: ItemDefinition; validation: LootboxValidationResult }> {
    const cleanId = String(input?.id || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');

    if (!cleanId) {
      throw new Error('Укажите корректный идентификатор лутбокса (латинские буквы, цифры, подчёркивание).');
    }
    if (isLegacySystemChestId(cleanId)) {
      throw new Error(`Идентификатор "${cleanId}" зарезервирован за базовым системным сундуком.`);
    }
    if (await this.getItemById(cleanId)) {
      throw new Error(`Предмет или лутбокс с ID "${cleanId}" уже существует в едином каталоге.`);
    }
    if (!input.name || !String(input.name).trim()) {
      throw new Error('Укажите название лутбокса.');
    }

    const catalogMap = await this.getCatalogMap();
    const rawConfig: Partial<LootboxRuleConfig> = input.lootboxConfig || {
      version: 1,
      dropMode: 'single_weighted',
      allowNestedLootboxes: false,
      rewards: [{ id: 'rw_1', type: 'credits', minQty: 100, maxQty: 100, weight: 100 }],
      consolationPrize: null
    };

    const validation = validateLootboxRuleConfig(
      cleanId,
      { ...rawConfig, version: 1 },
      catalogMap
    );
    if (!validation.valid || !validation.normalizedConfig) {
      throw new Error(`Ошибка валидации правил лутбокса: ${validation.errors.join(' ')}`);
    }

    let normalizedPresentation: LootboxPresentationConfig | undefined;
    if (input.presentationConfig !== undefined && input.presentationConfig !== null) {
      const presCheck = validateLootboxPresentationConfig(input.presentationConfig);
      if (!presCheck.valid) {
        throw new Error(`Ошибка валидации визуально-звукового оформления: ${presCheck.errors.join(' ')}`);
      }
      normalizedPresentation = presCheck.normalized;
    }

    const cost = Math.max(0, Math.round(Number(input.cost ?? 100)));
    const pawnValue =
      input.pawnValue !== undefined && input.pawnValue !== null
        ? Math.max(0, Math.round(Number(input.pawnValue)))
        : Math.max(0, Math.round(cost * 0.5));

    const now = new Date().toISOString();
    const newLootbox: ItemDefinition = {
      id: cleanId,
      name: String(input.name).trim(),
      category: 'chests',
      rarity: input.rarity || 'common',
      cost,
      pawnValue,
      icon: input.icon?.trim() || '🧰',
      usable: true,
      consumable: true,
      inShop: input.inShop !== undefined ? Boolean(input.inShop) : false,
      adminHidden: Boolean(input.adminHidden),
      ...(input.featured !== undefined ? { featured: Boolean(input.featured) } : {}),
      ...(typeof input.discountPercent === 'number' ? { discountPercent: input.discountPercent } : {}),
      description: input.description?.trim() || 'Пользовательский лутбокс Синдиката.',
      effectDescription: input.effectDescription?.trim() || 'Открывает награду согласно снимку правил лутбокса.',
      isCustomLootbox: true,
      lootboxConfig: {
        ...validation.normalizedConfig,
        version: 1,
        updatedAt: now
      },
      ...(normalizedPresentation ? { presentationConfig: normalizedPresentation } : {})
    };

    await this.db.execute({
      sql: `
        INSERT INTO shop_items (id, name, category, price, rarity, is_available, is_admin_hidden, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([
        newLootbox.id,
        newLootbox.name,
        newLootbox.category,
        newLootbox.cost,
        newLootbox.rarity,
        newLootbox.inShop ? 1 : 0,
        newLootbox.adminHidden ? 1 : 0,
        JSON.stringify(newLootbox),
        now
      ])
    });

    const all = await this.getAllItems();
    syncItemsCatalog(all);

    return { item: newLootbox, validation };
  }

  /**
   * Updates an existing lootbox's metadata (and optionally its rules and/or presentation).
   * Preserves `isCustomLootbox: false` for the 3 legacy chests ('chest_novice', 'chest_don', 'chest_sheriff')
   * and `isCustomLootbox: true` for custom lootboxes.
   */
  public async updateLootbox(
    id: string,
    updates: Partial<ItemDefinition>
  ): Promise<{ item: ItemDefinition; validation?: LootboxValidationResult }> {
    const existing = await this.getLootboxById(id);
    if (!existing) {
      throw new Error(`Лутбокс с ID "${id}" не найден в каталоге.`);
    }

    const catalogMap = await this.getCatalogMap();
    const now = new Date().toISOString();

    let nextLootboxConfig = existing.lootboxConfig;
    let validation: LootboxValidationResult | undefined;

    if (updates.lootboxConfig) {
      const nextVersion = (existing.lootboxConfig?.version ?? 0) + 1;
      validation = validateLootboxRuleConfig(
        existing.id,
        {
          ...updates.lootboxConfig,
          version: nextVersion,
          updatedAt: now
        },
        catalogMap
      );
      if (!validation.valid || !validation.normalizedConfig) {
        throw new Error(`Ошибка валидации правил лутбокса: ${validation.errors.join(' ')}`);
      }
      nextLootboxConfig = {
        ...validation.normalizedConfig,
        version: nextVersion,
        updatedAt: now
      };
    }

    let nextPresentationConfig = existing.presentationConfig;
    if (updates.presentationConfig !== undefined) {
      const presCheck = validateLootboxPresentationConfig(updates.presentationConfig);
      if (!presCheck.valid) {
        throw new Error(`Ошибка валидации визуально-звукового оформления: ${presCheck.errors.join(' ')}`);
      }
      nextPresentationConfig = presCheck.normalized;
    }

    const isLegacy = isLegacySystemChestId(existing.id);
    const updated: ItemDefinition = {
      ...existing,
      ...updates,
      id: existing.id,
      category: 'chests',
      usable: true,
      consumable: true,
      isCustomLootbox: isLegacy ? false : true,
      name: updates.name !== undefined ? String(updates.name).trim() || existing.name : existing.name,
      cost:
        typeof updates.cost === 'number'
          ? Math.max(0, Math.round(updates.cost))
          : existing.cost,
      pawnValue:
        typeof updates.pawnValue === 'number'
          ? Math.max(0, Math.round(updates.pawnValue))
          : existing.pawnValue,
      adminHidden:
        updates.adminHidden !== undefined ? Boolean(updates.adminHidden) : Boolean(existing.adminHidden),
      lootboxConfig: nextLootboxConfig,
      ...(nextPresentationConfig ? { presentationConfig: nextPresentationConfig } : {})
    };

    await this.db.execute({
      sql: `
        UPDATE shop_items SET
          name = ?,
          category = ?,
          price = ?,
          rarity = ?,
          is_available = ?,
          is_admin_hidden = ?,
          data = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: sanitizeArgs([
        updated.name,
        updated.category,
        updated.cost,
        updated.rarity,
        updated.inShop !== false ? 1 : 0,
        updated.adminHidden ? 1 : 0,
        JSON.stringify(updated),
        now,
        existing.id
      ])
    });

    const all = await this.getAllItems();
    syncItemsCatalog(all);

    return { item: updated, validation };
  }

  /**
   * Saves new drop rules (`lootboxConfig`) for an existing lootbox, increments `version`,
   * recomputes the full 64-char SHA-256 `snapshotHash`, and updates `shop_items` without
   * altering any already-issued player inventory instances.
   */
  public async updateLootboxRules(
    id: string,
    inputConfig: Partial<LootboxRuleConfig>
  ): Promise<{ item: ItemDefinition; validation: LootboxValidationResult }> {
    const existing = await this.getLootboxById(id);
    if (!existing) {
      throw new Error(`Лутбокс с ID "${id}" не найден в каталоге.`);
    }

    const catalogMap = await this.getCatalogMap();
    const nextVersion = (existing.lootboxConfig?.version ?? 0) + 1;
    const now = new Date().toISOString();

    const validation = validateLootboxRuleConfig(
      existing.id,
      {
        ...inputConfig,
        version: nextVersion,
        updatedAt: now
      },
      catalogMap
    );

    if (!validation.valid || !validation.normalizedConfig) {
      throw new Error(`Ошибка валидации правил выпадения: ${validation.errors.join(' ')}`);
    }

    const isLegacy = isLegacySystemChestId(existing.id);
    const updated: ItemDefinition = {
      ...existing,
      category: 'chests',
      isCustomLootbox: isLegacy ? false : true,
      lootboxConfig: {
        ...validation.normalizedConfig,
        version: nextVersion,
        updatedAt: now
      }
    };

    await this.db.execute({
      sql: `
        UPDATE shop_items SET
          data = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: sanitizeArgs([JSON.stringify(updated), now, existing.id])
    });

    const all = await this.getAllItems();
    syncItemsCatalog(all);

    return { item: updated, validation };
  }

  /**
   * Updates ONLY the visual/audio `presentationConfig` of a lootbox.
   * Never alters `lootboxConfig`, `version`, or `snapshotHash`.
   */
  public async updateLootboxPresentation(
    id: string,
    presentationConfig: LootboxPresentationConfig
  ): Promise<ItemDefinition> {
    const existing = await this.getLootboxById(id);
    if (!existing) {
      throw new Error(`Лутбокс с ID "${id}" не найден в каталоге.`);
    }

    const presCheck = validateLootboxPresentationConfig(presentationConfig);
    if (!presCheck.valid) {
      throw new Error(`Ошибка валидации визуально-звукового оформления: ${presCheck.errors.join(' ')}`);
    }

    const now = new Date().toISOString();
    const updated: ItemDefinition = {
      ...existing,
      presentationConfig: presCheck.normalized
    };

    await this.db.execute({
      sql: `
        UPDATE shop_items SET
          data = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: sanitizeArgs([JSON.stringify(updated), now, existing.id])
    });

    const all = await this.getAllItems();
    syncItemsCatalog(all);

    return updated;
  }

  /**
   * Runs a pure server-side drop simulation for a lootbox using the exact same RNG and drop logic
   * as `userDb.useItem`, without modifying any database state.
   * Supports both existing saved lootboxes and unsaved draft configurations in the constructor.
   */
  public async simulateLootbox(
    id: string,
    options?: {
      iterations?: number;
      lootboxConfig?: Partial<LootboxRuleConfig>;
      draftName?: string;
      draftRarity?: ItemRarity;
    }
  ): Promise<LootboxSimulationResult> {
    const cleanId = String(id || 'draft_lootbox').trim() || 'draft_lootbox';
    const existing = await this.getLootboxById(cleanId);

    const candidateConfig = options?.lootboxConfig || existing?.lootboxConfig;
    if (!candidateConfig) {
      if (!existing) {
        throw new Error(`Лутбокс с ID "${cleanId}" не найден в каталоге.`);
      }
      throw new Error(`У лутбокса "${cleanId}" отсутствуют правила выпадения для симуляции.`);
    }

    const targetLootboxItem: ItemDefinition = existing || {
      id: cleanId,
      name: options?.draftName?.trim() || 'Черновик лутбокса',
      category: 'chests',
      rarity: options?.draftRarity || 'common',
      cost: 100,
      pawnValue: 50,
      description: 'Черновик лутбокса для симуляции вероятностей',
      icon: '🧰',
      usable: true,
      consumable: true,
      isCustomLootbox: true
    };

    const iterations = options?.iterations !== undefined ? Number(options.iterations) : 1000;
    const [catalogMap, replacementsMap] = await Promise.all([
      this.getCatalogMap(),
      this.getDeletedItemReplacementsMap()
    ]);

    return simulateLootboxDrops(targetLootboxItem, candidateConfig, iterations, catalogMap, replacementsMap);
  }

  /**
   * Deletes an admin-created custom lootbox (`isCustomLootbox === true`) from `shop_items`
   * and atomically records a replacement rule in `deleted_item_replacements` so any old
   * snapshots or nested lootbox references continue to resolve safely.
   * System chests ('chest_novice', 'chest_don', 'chest_sheriff') and regular items cannot be deleted.
   */
  public async deleteCustomLootbox(
    id: string,
    options?: {
      replacementType?: 'credits' | 'item' | 'lootbox';
      replacementItemId?: string | null;
      replacementQty?: number;
      adminId?: string | null;
    }
  ): Promise<{
    deletedId: string;
    deletedName: string;
    replacement: DeletedItemReplacementRecord;
  }> {
    const cleanId = String(id || '').trim();
    if (!cleanId) {
      throw new Error('Укажите идентификатор удаляемого лутбокса.');
    }
    if (isLegacySystemChestId(cleanId)) {
      throw new Error(
        `Системный сундук «${cleanId}» является базовым элементом игры и не может быть удалён (разрешено только редактирование его параметров и правил).`
      );
    }

    const existing = await this.getItemById(cleanId);
    if (!existing) {
      throw new Error(`Лутбокс с ID "${cleanId}" не найден в каталоге.`);
    }
    if (existing.category !== 'chests' || existing.isCustomLootbox !== true) {
      throw new Error(
        `Предмет «${existing.name}» (${cleanId}) не является пользовательским лутбоксом и не может быть удалён.`
      );
    }

    const replacementType: 'credits' | 'item' | 'lootbox' =
      options?.replacementType === 'item' || options?.replacementType === 'lootbox'
        ? options.replacementType
        : 'credits';

    const defaultCredits = Math.max(10, Math.round(existing.cost || 100));
    const rawQty =
      options?.replacementQty !== undefined && options?.replacementQty !== null
        ? Number(options.replacementQty)
        : replacementType === 'credits'
          ? defaultCredits
          : 1;
    const replacementQty = Math.trunc(rawQty);

    if (!Number.isSafeInteger(replacementQty) || replacementQty < 1) {
      throw new Error('Количество компенсации при удалении лутбокса должно быть целым числом >= 1.');
    }

    let replacementItemId: string | null = null;
    if (replacementType === 'item' || replacementType === 'lootbox') {
      replacementItemId = String(options?.replacementItemId || '').trim();
      if (!replacementItemId) {
        throw new Error('Для замены предметом или лутбоксом необходимо указать replacementItemId.');
      }
      if (replacementItemId === cleanId) {
        throw new Error('Удаляемый лутбокс не может быть назначен заменой самому себе.');
      }
      const targetReplacement = await this.getItemById(replacementItemId);
      if (!targetReplacement) {
        throw new Error(`Предмет для замены "${replacementItemId}" не найден в едином каталоге.`);
      }
      if (replacementType === 'lootbox' && targetReplacement.category !== 'chests') {
        throw new Error(`Предмет "${replacementItemId}" не является лутбоксом (category !== "chests").`);
      }
      if (replacementType === 'item' && targetReplacement.category === 'chests') {
        throw new Error(`Предмет "${replacementItemId}" является лутбоксом — выберите тип замены "lootbox".`);
      }
    }

    const now = new Date().toISOString();
    const tx = await this.db.transaction('write');
    try {
      await tx.execute({
        sql: `
          INSERT OR REPLACE INTO deleted_item_replacements (
            deleted_item_id, deleted_item_name, replacement_type, replacement_item_id,
            replacement_qty, deleted_by_admin_id, deleted_at, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: sanitizeArgs([
          cleanId,
          existing.name,
          replacementType,
          replacementItemId,
          replacementQty,
          options?.adminId || null,
          now,
          JSON.stringify({
            cost: existing.cost,
            rarity: existing.rarity,
            lastVersion: existing.lootboxConfig?.version ?? 1,
            lastSnapshotHash: existing.lootboxConfig?.snapshotHash ?? null
          })
        ])
      });

      await tx.execute({
        sql: 'DELETE FROM shop_items WHERE id = ?',
        args: [cleanId]
      });

      await tx.commit();
    } catch (err) {
      if (!tx.closed) {
        try { await tx.rollback(); } catch {}
      }
      throw err;
    } finally {
      if (!tx.closed) tx.close();
    }

    const all = await this.getAllItems();
    syncItemsCatalog(all);

    return {
      deletedId: cleanId,
      deletedName: existing.name,
      replacement: {
        deletedItemId: cleanId,
        deletedItemName: existing.name,
        replacementType,
        replacementItemId,
        replacementQty,
        deletedAt: now,
        deletedByAdminId: options?.adminId || null
      }
    };
  }

  // ==========================================================================
  // PERSISTENT LOOTBOX MEDIA ASSETS (FRAMES & SOUNDS) & SOUND DEFAULTS
  // ==========================================================================

  public autoDetectSoundCategory(options: {
    targetRewardType?: LootboxRewardType | 'open' | 'consolation';
    targetItemRarity?: ItemRarity;
    title?: string;
  }): LootboxSoundCategory {
    if (options.targetRewardType === 'open') return 'lootbox_open';
    if (options.targetRewardType === 'consolation') return 'consolation';
    if (options.targetRewardType === 'credits') return 'reward_credits';
    if (options.targetRewardType === 'xp') return 'reward_xp';
    if (options.targetRewardType === 'lootbox') return 'reward_lootbox';
    if (options.targetRewardType === 'item') {
      if (options.targetItemRarity === 'legendary') return 'reward_item_legendary';
      if (options.targetItemRarity === 'epic') return 'reward_item_epic';
      if (options.targetItemRarity === 'rare') return 'reward_item_rare';
      return 'reward_item_common';
    }

    const t = String(options.title || '').toLowerCase();
    if (t.includes('open') || t.includes('открыт') || t.includes('сундук') || t.includes('сейф') || t.includes('lock')) {
      return 'lootbox_open';
    }
    if (t.includes('credit') || t.includes('coin') || t.includes('монет') || t.includes('кред') || t.includes('cash')) {
      return 'reward_credits';
    }
    if (t.includes('xp') || t.includes('опыт') || t.includes('level') || t.includes('уров')) {
      return 'reward_xp';
    }
    if (t.includes('legend') || t.includes('легенд') || t.includes('fanfare') || t.includes('jackpot')) {
      return 'reward_item_legendary';
    }
    if (t.includes('epic') || t.includes('эпич') || t.includes('эпик')) {
      return 'reward_item_epic';
    }
    if (t.includes('rare') || t.includes('редк')) {
      return 'reward_item_rare';
    }
    if (t.includes('chest') || t.includes('lootbox') || t.includes('лутбокс') || t.includes('вложен')) {
      return 'reward_lootbox';
    }
    if (t.includes('consol') || t.includes('утеш')) {
      return 'consolation';
    }
    return 'reward_item_common';
  }

  private rowToMediaAsset(row: any): LootboxMediaAssetRecord {
    let metadata: Record<string, any> | null = null;
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(String(row.metadata_json));
      } catch {
        metadata = null;
      }
    }
    return {
      id: String(row.id),
      assetType: row.asset_type === 'audio' ? 'audio' : 'image',
      title: String(row.title || ''),
      category: String(row.category || ''),
      autoDetectedCategory: row.auto_detected_category ? String(row.auto_detected_category) : null,
      storageType: row.storage_type === 'url' ? 'url' : 'data_url',
      sourceUrl: String(row.source_url || ''),
      checksumSha256: String(row.checksum_sha256 || ''),
      mimeType: String(row.mime_type || ''),
      byteSize: Number(row.byte_size || 0),
      durationMs: row.duration_ms !== null && row.duration_ms !== undefined ? Number(row.duration_ms) : null,
      metadata,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || '')
    };
  }

  public async getMediaAssets(assetType?: 'image' | 'audio'): Promise<LootboxMediaAssetRecord[]> {
    await this.ensureSeed();
    if (assetType === 'image' || assetType === 'audio') {
      const res = await this.db.execute({
        sql: 'SELECT * FROM lootbox_media_assets WHERE asset_type = ? ORDER BY created_at DESC',
        args: [assetType]
      });
      return res.rows.map(r => this.rowToMediaAsset(r));
    }
    const res = await this.db.execute('SELECT * FROM lootbox_media_assets ORDER BY created_at DESC');
    return res.rows.map(r => this.rowToMediaAsset(r));
  }

  public async getMediaAssetById(id: string): Promise<LootboxMediaAssetRecord | null> {
    const cleanId = String(id || '').trim();
    if (!cleanId) return null;
    await this.ensureSeed();
    const res = await this.db.execute({
      sql: 'SELECT * FROM lootbox_media_assets WHERE id = ?',
      args: [cleanId]
    });
    const row = res.rows[0];
    return row ? this.rowToMediaAsset(row) : null;
  }

  public async uploadMediaAsset(input: {
    assetType: 'image' | 'audio';
    title: string;
    sourceUrl: string;
    mimeType?: string;
    category?: string;
    targetRewardType?: LootboxRewardType | 'open' | 'consolation';
    targetItemRarity?: ItemRarity;
    durationMs?: number | null;
    metadata?: Record<string, any> | null;
  }): Promise<{ asset: LootboxMediaAssetRecord; reusedExisting: boolean }> {
    await this.ensureSeed();

    const assetType = input.assetType === 'audio' ? 'audio' : input.assetType === 'image' ? 'image' : null;
    if (!assetType) {
      throw new Error('Тип медиа-ресурса (assetType) должен быть "image" или "audio".');
    }

    const rawUrl = String(input.sourceUrl || '').trim();
    if (!rawUrl) {
      throw new Error('Необходимо передать содержимое файла (data URL) или ссылку (sourceUrl).');
    }

    const allowedImageMimes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'image/svg+xml'
    ];
    const allowedAudioMimes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac'
    ];

    let storageType: 'data_url' | 'url' = 'url';
    let detectedMime = String(input.mimeType || '').trim().toLowerCase();
    let byteSize = 0;
    let checksumSha256 = '';
    let decodedBuffer: Buffer | null = null;

    if (rawUrl.startsWith('data:')) {
      storageType = 'data_url';
      const match = rawUrl.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/i);
      if (!match) {
        throw new Error('Некорректный формат base64 Data URL для медиа-файла.');
      }
      detectedMime = match[1].trim().toLowerCase();
      const base64Payload = match[2].trim();
      decodedBuffer = Buffer.from(base64Payload, 'base64');
      byteSize = decodedBuffer.byteLength;
      if (byteSize === 0) {
        throw new Error('Загружаемый медиа-файл пуст (0 байт).');
      }
      checksumSha256 = crypto.createHash('sha256').update(decodedBuffer).digest('hex');
    } else if (/^https?:\/\//i.test(rawUrl) || (rawUrl.startsWith('/') && !rawUrl.startsWith('//'))) {
      storageType = 'url';
      if (!detectedMime) {
        detectedMime = assetType === 'image' ? 'image/png' : 'audio/mpeg';
      }
      byteSize = Buffer.byteLength(rawUrl, 'utf8');
      checksumSha256 = crypto.createHash('sha256').update(rawUrl, 'utf8').digest('hex');
    } else {
      throw new Error('sourceUrl должен быть валидным base64 Data URL (data:...) или HTTP/HTTPS ссылкой.');
    }

    const maxBytes = assetType === 'image' ? 2 * 1024 * 1024 : 3 * 1024 * 1024;
    if (byteSize > maxBytes) {
      const limitMb = assetType === 'image' ? '2 МБ' : '3 МБ';
      throw new Error(
        `Размер файла (${(byteSize / (1024 * 1024)).toFixed(2)} МБ) превышает допустимый лимит ${limitMb}.`
      );
    }

    if (assetType === 'image' && !allowedImageMimes.includes(detectedMime)) {
      throw new Error(
        `Недопустимый формат кадра "${detectedMime}". Поддерживаются: PNG, JPEG, WebP, GIF, SVG.`
      );
    }
    if (assetType === 'audio' && !allowedAudioMimes.includes(detectedMime)) {
      throw new Error(
        `Недопустимый формат аудио "${detectedMime}". Поддерживаются: MP3, WAV, OGG, WebM, M4A/AAC.`
      );
    }

    // Security inspection for SVG and binary polyglot payloads
    if (decodedBuffer) {
      if (detectedMime === 'image/svg+xml') {
        const svgText = decodedBuffer.toString('utf8');
        if (!/<svg[\s>]/i.test(svgText) || !/<\/svg\s*>/i.test(svgText)) {
          throw new Error('Загруженный SVG-файл имеет некорректную структуру (<svg>...</svg>).');
        }
        const dangerousSvgPatterns: Array<{ pattern: RegExp; reason: string }> = [
          { pattern: /<\s*script\b/i, reason: 'тег <script>' },
          { pattern: /<\s*foreignObject\b/i, reason: 'тег <foreignObject>' },
          { pattern: /<\s*iframe\b/i, reason: 'тег <iframe>' },
          { pattern: /<\s*object\b/i, reason: 'тег <object>' },
          { pattern: /<\s*embed\b/i, reason: 'тег <embed>' },
          { pattern: /<!ENTITY\b/i, reason: 'XML ENTITY (XXE)' },
          { pattern: /\bon[a-z]+\s*=/i, reason: 'обработчик событий (onload/onerror/onclick)' },
          { pattern: /javascript\s*:/i, reason: 'протокол javascript:' },
          { pattern: /vbscript\s*:/i, reason: 'протокол vbscript:' },
          { pattern: /data\s*:\s*text\/html/i, reason: 'вложенный data:text/html' }
        ];
        for (const check of dangerousSvgPatterns) {
          if (check.pattern.test(svgText)) {
            throw new Error(
              `SVG-файл отклонён системой безопасности: обнаружен потенциально вредоносный элемент (${check.reason}).`
            );
          }
        }
      } else {
        // Ensure non-SVG binary uploads do not start with HTML/script/SVG markup
        const headUtf8 = decodedBuffer.subarray(0, Math.min(256, decodedBuffer.length)).toString('utf8');
        if (/^\s*<(?:!DOCTYPE\s+html|html|script|svg|iframe)\b/i.test(headUtf8)) {
          throw new Error(
            `Файл отклонён системой безопасности: содержимое файла не соответствует заявленному MIME-типу "${detectedMime}".`
          );
        }
      }
    }

    const cleanTitle =
      String(input.title || '').trim() ||
      (assetType === 'image' ? 'Кадр анимации лутбокса' : 'Звуковой эффект лутбокса');

    const autoCategory =
      assetType === 'audio'
        ? this.autoDetectSoundCategory({
            targetRewardType: input.targetRewardType,
            targetItemRarity: input.targetItemRarity,
            title: cleanTitle
          })
        : input.category === 'frame_open'
          ? 'frame_open'
          : 'frame_idle';

    const finalCategory = String(input.category || '').trim() || autoCategory;

    // Check if an identical asset by (asset_type, checksum_sha256) already exists for reuse
    const existingRes = await this.db.execute({
      sql: 'SELECT * FROM lootbox_media_assets WHERE asset_type = ? AND checksum_sha256 = ? LIMIT 1',
      args: [assetType, checksumSha256]
    });

    const now = new Date().toISOString();
    if (existingRes.rows.length > 0) {
      const existingAsset = this.rowToMediaAsset(existingRes.rows[0]);
      if (input.category && input.category.trim() && input.category.trim() !== existingAsset.category) {
        await this.db.execute({
          sql: 'UPDATE lootbox_media_assets SET category = ?, updated_at = ? WHERE id = ?',
          args: [input.category.trim(), now, existingAsset.id]
        });
        existingAsset.category = input.category.trim();
        existingAsset.updatedAt = now;
      }
      return { asset: existingAsset, reusedExisting: true };
    }

    const id = `media_${assetType}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const durationMs =
      typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs > 0
        ? Math.round(input.durationMs)
        : null;

    await this.db.execute({
      sql: `
        INSERT INTO lootbox_media_assets (
          id, asset_type, title, category, auto_detected_category,
          storage_type, source_url, checksum_sha256, mime_type, byte_size,
          duration_ms, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([
        id,
        assetType,
        cleanTitle,
        finalCategory,
        autoCategory,
        storageType,
        rawUrl,
        checksumSha256,
        detectedMime,
        byteSize,
        durationMs,
        JSON.stringify(input.metadata || {}),
        now,
        now
      ])
    });

    const created = await this.getMediaAssetById(id);
    return { asset: created!, reusedExisting: false };
  }

  public async updateMediaAsset(
    id: string,
    updates: { title?: string; category?: string }
  ): Promise<LootboxMediaAssetRecord> {
    const existing = await this.getMediaAssetById(id);
    if (!existing) {
      throw new Error(`Медиа-ресурс с ID "${id}" не найден в библиотеке.`);
    }

    const nextTitle =
      updates.title !== undefined && String(updates.title).trim()
        ? String(updates.title).trim()
        : existing.title;
    const nextCategory =
      updates.category !== undefined && String(updates.category).trim()
        ? String(updates.category).trim()
        : existing.category;

    const now = new Date().toISOString();
    await this.db.execute({
      sql: 'UPDATE lootbox_media_assets SET title = ?, category = ?, updated_at = ? WHERE id = ?',
      args: sanitizeArgs([nextTitle, nextCategory, now, existing.id])
    });

    return (await this.getMediaAssetById(existing.id))!;
  }

  public async deleteMediaAsset(id: string): Promise<boolean> {
    const existing = await this.getMediaAssetById(id);
    if (!existing) {
      throw new Error(`Медиа-ресурс с ID "${id}" не найден в библиотеке.`);
    }

    await this.db.batch([
      {
        sql: 'DELETE FROM lootbox_sound_defaults WHERE sound_asset_id = ?',
        args: [existing.id]
      },
      {
        sql: 'DELETE FROM lootbox_media_assets WHERE id = ?',
        args: [existing.id]
      }
    ]);

    return true;
  }

  public async getSoundDefaults(): Promise<Partial<Record<LootboxSoundCategory, string>>> {
    await this.ensureSeed();
    const res = await this.db.execute('SELECT * FROM lootbox_sound_defaults');
    const defaults: Partial<Record<LootboxSoundCategory, string>> = {};
    for (const row of res.rows) {
      const cat = String(row.category || '').trim() as LootboxSoundCategory;
      const assetId = String(row.sound_asset_id || '').trim();
      if (cat && assetId) {
        defaults[cat] = assetId;
      }
    }
    return defaults;
  }

  public async setSoundDefault(
    category: LootboxSoundCategory,
    soundAssetId: string | null
  ): Promise<Partial<Record<LootboxSoundCategory, string>>> {
    const validSoundCategories: LootboxSoundCategory[] = [
      'lootbox_open',
      'reward_credits',
      'reward_xp',
      'reward_item_common',
      'reward_item_rare',
      'reward_item_epic',
      'reward_item_legendary',
      'reward_lootbox',
      'consolation'
    ];
    if (!validSoundCategories.includes(category)) {
      throw new Error(`Неизвестная звуковая категория "${category}".`);
    }

    const cleanAssetId = soundAssetId && String(soundAssetId).trim() ? String(soundAssetId).trim() : null;
    if (cleanAssetId) {
      const asset = await this.getMediaAssetById(cleanAssetId);
      if (!asset || asset.assetType !== 'audio') {
        throw new Error(`Звуковой ресурс "${cleanAssetId}" не найден в библиотеке звуков.`);
      }
    }

    const now = new Date().toISOString();
    if (!cleanAssetId) {
      await this.db.execute({
        sql: 'DELETE FROM lootbox_sound_defaults WHERE category = ?',
        args: [category]
      });
    } else {
      await this.db.execute({
        sql: `
          INSERT OR REPLACE INTO lootbox_sound_defaults (category, sound_asset_id, updated_at)
          VALUES (?, ?, ?)
        `,
        args: [category, cleanAssetId, now]
      });
    }

    return this.getSoundDefaults();
  }

  /**
   * Creates a new item in the unified catalog.
   */
  public async createItem(item: ItemDefinition): Promise<ItemDefinition> {
    if (item && item.category === 'chests') {
      const res = await this.createCustomLootbox(item);
      return res.item;
    }

    const cleanId = item.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanId) {
      throw new Error('Укажите корректный идентификатор товара (латинские буквы, цифры, подчёркивание).');
    }
    if (await this.getItemById(cleanId)) {
      throw new Error(`Предмет с ID "${cleanId}" уже существует в каталоге.`);
    }
    if (!item.name?.trim()) {
      throw new Error('Укажите название предмета.');
    }

    const newItem: ItemDefinition = {
      ...item,
      id: cleanId,
      name: item.name.trim(),
      category: item.category || 'valuables',
      rarity: item.rarity || 'common',
      cost: Math.max(0, Math.round(item.cost || 0)),
      pawnValue: Math.max(0, Math.round(item.pawnValue || Math.round((item.cost || 0) * 0.5))),
      inShop: item.inShop !== undefined ? item.inShop : false,
      adminHidden: Boolean(item.adminHidden),
      usable: item.usable !== undefined ? item.usable : false,
      consumable: item.consumable !== undefined ? item.consumable : true,
      icon: item.icon || '🎁',
      description: item.description?.trim() || 'Описание предмета отсутствует.',
      effectDescription: item.effectDescription?.trim() || ''
    };

    const now = new Date().toISOString();
    await this.db.execute({
      sql: `
        INSERT INTO shop_items (id, name, category, price, rarity, is_available, is_admin_hidden, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([
        newItem.id,
        newItem.name,
        newItem.category,
        newItem.cost,
        newItem.rarity,
        newItem.inShop ? 1 : 0,
        newItem.adminHidden ? 1 : 0,
        JSON.stringify(newItem),
        now
      ])
    });

    const all = await this.getAllItems();
    syncItemsCatalog(all);

    return newItem;
  }

  /**
   * Updates an existing item in the catalog.
   */
  public async updateItem(id: string, updates: Partial<ItemDefinition>): Promise<ItemDefinition> {
    const existing = await this.getItemById(id);
    if (!existing) {
      throw new Error(`Предмет с ID "${id}" не найден.`);
    }

    if (existing.category === 'chests') {
      const res = await this.updateLootbox(id, updates);
      return res.item;
    }

    const updated: ItemDefinition = {
      ...existing,
      ...updates,
      id: existing.id,
      adminHidden: updates.adminHidden !== undefined ? Boolean(updates.adminHidden) : Boolean(existing.adminHidden)
    };

    if (typeof updated.cost === 'number') {
      updated.cost = Math.max(0, Math.round(updated.cost));
    }
    if (typeof updated.pawnValue === 'number') {
      updated.pawnValue = Math.max(0, Math.round(updated.pawnValue));
    }

    await this.db.execute({
      sql: `
        UPDATE shop_items SET
          name = ?,
          category = ?,
          price = ?,
          rarity = ?,
          is_available = ?,
          is_admin_hidden = ?,
          data = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: sanitizeArgs([
        updated.name,
        updated.category,
        updated.cost,
        updated.rarity,
        updated.inShop !== false ? 1 : 0,
        updated.adminHidden ? 1 : 0,
        JSON.stringify(updated),
        new Date().toISOString(),
        id
      ])
    });

    const all = await this.getAllItems();
    syncItemsCatalog(all);

    return updated;
  }

  /**
   * Updates ONLY the administrative visibility flag (adminHidden / is_admin_hidden) for a single item,
   * without altering any other properties, prices, shop status, or mechanics.
   */
  public async setAdminVisibility(id: string, adminHidden: boolean): Promise<ItemDefinition> {
    const existing = await this.getItemById(id);
    if (!existing) {
      throw new Error(`Предмет с ID "${id}" не найден в каталоге.`);
    }

    const updated: ItemDefinition = {
      ...existing,
      adminHidden: Boolean(adminHidden)
    };

    await this.db.execute({
      sql: `
        UPDATE shop_items SET
          is_admin_hidden = ?,
          data = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: sanitizeArgs([
        updated.adminHidden ? 1 : 0,
        JSON.stringify(updated),
        new Date().toISOString(),
        id
      ])
    });

    const all = await this.getAllItems();
    syncItemsCatalog(all);

    return updated;
  }

  /**
   * Bulk updates ONLY the administrative visibility flag (adminHidden / is_admin_hidden) for multiple items
   * in a single atomic batch transaction, without altering any other item properties.
   */
  public async bulkSetAdminVisibility(ids: string[], adminHidden: boolean): Promise<ItemDefinition[]> {
    const cleanIds = Array.from(new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean)));
    if (cleanIds.length === 0) {
      throw new Error('Выберите хотя бы один предмет для массового изменения видимости.');
    }

    await this.ensureSeed();
    const placeholders = cleanIds.map(() => '?').join(', ');
    const res = await this.db.execute({
      sql: `SELECT * FROM shop_items WHERE id IN (${placeholders})`,
      args: sanitizeArgs(cleanIds)
    });

    if (res.rows.length === 0) {
      throw new Error('Выбранные предметы не найдены в каталоге.');
    }

    const now = new Date().toISOString();
    const hiddenFlag = adminHidden ? 1 : 0;
    const statements = res.rows.map(row => {
      const existing = this.rowToItem(row);
      const updated: ItemDefinition = {
        ...existing,
        adminHidden: Boolean(adminHidden)
      };
      return {
        sql: `
          UPDATE shop_items SET
            is_admin_hidden = ?,
            data = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: sanitizeArgs([hiddenFlag, JSON.stringify(updated), now, existing.id])
      };
    });

    await this.db.batch(statements);

    const all = await this.getAllItems();
    syncItemsCatalog(all);

    const updatedSet = new Set(cleanIds);
    return all.filter(i => updatedSet.has(i.id));
  }

  /**
   * Regular game items are created through development and cannot be deleted via the admin panel.
   * Custom lootboxes (`isCustomLootbox === true`) can be deleted via `deleteCustomLootbox`.
   */
  public async deleteItem(id: string): Promise<boolean> {
    const existing = await this.getItemById(id);
    if (!existing) {
      throw new Error(`Предмет с ID "${id}" не найден.`);
    }
    if (existing.category === 'chests' && existing.isCustomLootbox === true) {
      await this.deleteCustomLootbox(id);
      return true;
    }
    throw new Error(
      'Удаление базовых внутриигровых предметов через админ-панель запрещено. Обычные предметы создаются через разработку, а для скрытия предмета из списков выбора используйте флаг «Скрыть» в разделе «Каталог предметов».'
    );
  }
}

export const itemsDb = new ItemsDatabase();



