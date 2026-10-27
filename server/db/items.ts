import { ItemDefinition, ItemCategory, ItemRarity, syncItemsCatalog } from '../data/items';
import { getDatabase, sanitizeArgs } from './database';
import { Client } from '@libsql/client';

/**
 * ItemsDatabase is the single master repository for all game items in Mafia Club.
 * Backed exclusively by the database with in-memory catalog synchronization.
 */
export class ItemsDatabase {
  private isSeeded = false;
  private seedPromise: Promise<void> | null = null;

  private get db(): Client {
    return getDatabase();
  }

  /**
   * Synchronizes the in-memory item registry from the SQLite table shop_items.
   */
  public async ensureSeed(): Promise<void> {
    if (this.isSeeded) return;
    if (this.seedPromise) return this.seedPromise;

    this.seedPromise = (async () => {
      try {
        try {
          await this.db.execute('ALTER TABLE shop_items ADD COLUMN is_admin_hidden INTEGER NOT NULL DEFAULT 0');
        } catch {}

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

    await this.db.batch(statements, 'write');

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

