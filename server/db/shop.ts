import { ALL_GAME_ITEMS, ItemDefinition, ItemCategory, ItemRarity } from '../data/items';
import { getDatabase } from './database';
import { DatabaseSync } from 'node:sqlite';

export interface ShopSettings {
  globalDiscount: number;
  bannerMessage: string;
  isShopEnabled: boolean;
}

export class ShopDatabase {
  private get db(): DatabaseSync {
    return getDatabase();
  }

  constructor() {
    this.ensureSeed();
  }

  private ensureSeed() {
    // 1. Ensure shop settings
    const settingRow = this.db.prepare("SELECT * FROM shop_settings WHERE id = 'default'").get();
    if (!settingRow) {
      this.db.prepare(`
        INSERT INTO shop_settings (id, global_discount, banner_message, is_shop_enabled, updated_at)
        VALUES ('default', 0, 'Специальные предложения Городского Синдиката!', 1, ?)
      `).run(new Date().toISOString());
    }

    // 2. Ensure shop items
    const countRow = this.db.prepare("SELECT COUNT(*) as count FROM shop_items").get() as { count: number };
    if (!countRow || countRow.count === 0) {
      const insert = this.db.prepare(`
        INSERT INTO shop_items (id, name, category, price, rarity, is_available, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      for (const item of Object.values(ALL_GAME_ITEMS)) {
        insert.run(
          item.id,
          item.name,
          item.category,
          item.cost,
          item.rarity,
          item.inShop !== false ? 1 : 0,
          JSON.stringify(item),
          now
        );
      }
    }
  }

  private rowToItem(row: any): ItemDefinition {
    try {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data || {};
      return {
        ...data,
        id: row.id,
        name: row.name,
        category: row.category as ItemCategory,
        cost: Number(row.price),
        rarity: row.rarity as ItemRarity,
        inShop: Boolean(row.is_available)
      };
    } catch {
      return {
        id: row.id,
        name: row.name,
        category: row.category,
        cost: Number(row.price),
        rarity: row.rarity,
        inShop: Boolean(row.is_available)
      } as any;
    }
  }

  public getAllItems(): ItemDefinition[] {
    const rows = this.db.prepare('SELECT * FROM shop_items').all() as any[];
    return rows.map(r => this.rowToItem(r));
  }

  public getShopItems(): ItemDefinition[] {
    const rows = this.db.prepare('SELECT * FROM shop_items WHERE is_available = 1').all() as any[];
    return rows.map(r => this.rowToItem(r));
  }

  public getItemById(id: string): ItemDefinition | null {
    if (!id) return null;
    const row = this.db.prepare('SELECT * FROM shop_items WHERE id = ?').get(id);
    if (!row) return null;
    return this.rowToItem(row);
  }

  public updateItem(id: string, updates: Partial<ItemDefinition>): ItemDefinition {
    const existing = this.getItemById(id);
    if (!existing) {
      throw new Error(`Товар с ID "${id}" не найден.`);
    }

    const updated: ItemDefinition = {
      ...existing,
      ...updates,
      id: existing.id
    };

    if (typeof updated.cost === 'number') {
      updated.cost = Math.max(0, Math.round(updated.cost));
    }
    if (typeof updated.pawnValue === 'number') {
      updated.pawnValue = Math.max(0, Math.round(updated.pawnValue));
    }

    this.db.prepare(`
      UPDATE shop_items SET
        name = ?,
        category = ?,
        price = ?,
        rarity = ?,
        is_available = ?,
        data = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.category,
      updated.cost,
      updated.rarity,
      updated.inShop !== false ? 1 : 0,
      JSON.stringify(updated),
      new Date().toISOString(),
      id
    );

    return updated;
  }

  public createItem(item: ItemDefinition): ItemDefinition {
    const cleanId = item.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanId) {
      throw new Error('Укажите корректный идентификатор товара (латинские буквы, цифры, подчёркивание).');
    }
    if (this.getItemById(cleanId)) {
      throw new Error(`Товар с ID "${cleanId}" уже существует в каталоге.`);
    }
    if (!item.name.trim()) {
      throw new Error('Укажите название товара.');
    }

    const newItem: ItemDefinition = {
      ...item,
      id: cleanId,
      name: item.name.trim(),
      cost: Math.max(0, Math.round(item.cost || 0)),
      pawnValue: Math.max(0, Math.round(item.pawnValue || Math.round((item.cost || 0) * 0.5))),
      inShop: item.inShop !== undefined ? item.inShop : true,
      usable: item.usable !== undefined ? item.usable : true,
      consumable: item.consumable !== undefined ? item.consumable : false,
      icon: item.icon || '🎁',
      description: item.description?.trim() || 'Описание товара отсутствует.',
      effectDescription: item.effectDescription?.trim() || ''
    };

    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO shop_items (id, name, category, price, rarity, is_available, data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newItem.id,
      newItem.name,
      newItem.category,
      newItem.cost,
      newItem.rarity,
      newItem.inShop ? 1 : 0,
      JSON.stringify(newItem),
      now
    );

    return newItem;
  }

  public deleteItem(id: string): boolean {
    if (!this.getItemById(id)) {
      throw new Error(`Товар с ID "${id}" не найден.`);
    }
    if (id === 'cert_name_change') {
      throw new Error('Нельзя удалить базовый «Сертификат на смену никнейма». Вы можете отключить его в магазине.');
    }

    const res = this.db.prepare('DELETE FROM shop_items WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  public getSettings(): ShopSettings {
    const row = this.db.prepare("SELECT * FROM shop_settings WHERE id = 'default'").get() as any;
    if (!row) {
      return {
        globalDiscount: 0,
        bannerMessage: 'Специальные предложения Городского Синдиката!',
        isShopEnabled: true
      };
    }
    return {
      globalDiscount: Number(row.global_discount ?? 0),
      bannerMessage: row.banner_message || '',
      isShopEnabled: Boolean(row.is_shop_enabled)
    };
  }

  public updateSettings(newSettings: Partial<ShopSettings>): ShopSettings {
    const current = this.getSettings();
    const updated = { ...current, ...newSettings };
    if (typeof updated.globalDiscount === 'number') {
      updated.globalDiscount = Math.max(0, Math.min(90, Math.round(updated.globalDiscount)));
    }

    this.db.prepare(`
      UPDATE shop_settings SET
        global_discount = ?,
        banner_message = ?,
        is_shop_enabled = ?,
        updated_at = ?
      WHERE id = 'default'
    `).run(
      updated.globalDiscount,
      updated.bannerMessage,
      updated.isShopEnabled ? 1 : 0,
      new Date().toISOString()
    );

    return updated;
  }

  public resetToDefaults(): ItemDefinition[] {
    this.db.prepare('DELETE FROM shop_items').run();
    this.ensureSeed();
    this.updateSettings({
      globalDiscount: 0,
      bannerMessage: 'Специальные предложения Городского Синдиката!',
      isShopEnabled: true
    });
    return this.getAllItems();
  }
}

export const shopDb = new ShopDatabase();
