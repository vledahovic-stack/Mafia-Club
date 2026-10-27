import { ItemDefinition, ItemCategory, ItemRarity, syncItemsCatalog } from '../data/items';
import { getDatabase, sanitizeArgs, waitForDatabaseInit } from './database';
import { Client } from '@libsql/client';

/**
 * One-time migration identifier stored in `system_migrations`.
 * Ensures that if a persistent database (such as production Turso) only had a partial subset
 * of the 17 original items before the catalog unification, the missing initial items are safely
 * inserted ONCE (`INSERT OR IGNORE`) without overwriting existing records or resurrecting items
 * on every future restart.
 */
const INITIAL_CATALOG_MIGRATION_ID = 'catalog_v1_restore_initial_17_items';

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
      const itemData: ItemDefinition = {
        ...item,
        inShop: item.inShop !== false,
        adminHidden: Boolean(item.adminHidden)
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
   * Creates a new item in the unified catalog.
   */
  public async createItem(item: ItemDefinition): Promise<ItemDefinition> {
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
   * Future custom lootboxes will only be deletable through a compensated deletion workflow.
   */
  public async deleteItem(id: string): Promise<boolean> {
    const existing = await this.getItemById(id);
    if (!existing) {
      throw new Error(`Предмет с ID "${id}" не найден.`);
    }
    throw new Error(
      'Удаление внутриигровых предметов через админ-панель запрещено. Обычные предметы создаются через разработку, а для скрытия предмета из списков выбора используйте флаг «Скрыть» в разделе «Каталог предметов».'
    );
  }
}

export const itemsDb = new ItemsDatabase();
