import { ALL_GAME_ITEMS, ItemDefinition, ItemCategory, ItemRarity } from '../data/items';
import { getDatabase, sanitizeArgs } from './database';
import { Client } from '@libsql/client';

export interface ShopSettings {
  globalDiscount: number;
  bannerMessage: string;
  isShopEnabled: boolean;
  nicknameChangeCost: number;
  avatarChangeCost: number;
}

export class ShopDatabase {
  private get db(): Client {
    return getDatabase();
  }

  public async ensureSeed(): Promise<void> {
    try {
      // Migration: Add columns if they do not exist
      try {
        await this.db.execute("ALTER TABLE shop_settings ADD COLUMN nickname_cost INTEGER DEFAULT 250");
      } catch {}
      try {
        await this.db.execute("ALTER TABLE shop_settings ADD COLUMN avatar_cost INTEGER DEFAULT 500");
      } catch {}

      // 1. Ensure shop settings
      const settingRes = await this.db.execute("SELECT * FROM shop_settings WHERE id = 'default'");
      if (!settingRes.rows[0]) {
        await this.db.execute({
          sql: `
            INSERT INTO shop_settings (id, global_discount, banner_message, is_shop_enabled, nickname_cost, avatar_cost, updated_at)
            VALUES ('default', 0, 'Специальные предложения Городского Синдиката!', 1, 250, 500, ?)
          `,
          args: [new Date().toISOString()]
        });
      }

      // Ensure cert_avatar_change exists
      const certAvatarRes = await this.db.execute("SELECT id FROM shop_items WHERE id = 'cert_avatar_change'");
      if (!certAvatarRes.rows[0]) {
        const item = ALL_GAME_ITEMS.cert_avatar_change;
        if (item) {
          await this.db.execute({
            sql: `
              INSERT INTO shop_items (id, name, category, price, rarity, is_available, data, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            args: sanitizeArgs([
              item.id,
              item.name,
              item.category,
              item.cost,
              item.rarity,
              item.inShop !== false ? 1 : 0,
              JSON.stringify(item),
              new Date().toISOString()
            ])
          });
        }
      }

      // 2. Ensure shop items
      const countRes = await this.db.execute('SELECT COUNT(*) as count FROM shop_items');
      const count = Number(countRes.rows[0]?.count || 0);
      if (count === 0) {
        const statements: Array<{ sql: string; args: any[] }> = [];
        const now = new Date().toISOString();
        for (const item of Object.values(ALL_GAME_ITEMS)) {
          statements.push({
            sql: `
              INSERT INTO shop_items (id, name, category, price, rarity, is_available, data, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            args: sanitizeArgs([
              item.id,
              item.name,
              item.category,
              item.cost,
              item.rarity,
              item.inShop !== false ? 1 : 0,
              JSON.stringify(item),
              now
            ])
          });
        }
        if (statements.length > 0) {
          await this.db.batch(statements);
        }
      }
    } catch {}
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

  public async getAllItems(): Promise<ItemDefinition[]> {
    const res = await this.db.execute('SELECT * FROM shop_items');
    return res.rows.map(r => this.rowToItem(r));
  }

  public async getShopItems(): Promise<ItemDefinition[]> {
    const res = await this.db.execute('SELECT * FROM shop_items WHERE is_available = 1');
    return res.rows.map(r => this.rowToItem(r));
  }

  public async getItemById(id: string): Promise<ItemDefinition | null> {
    if (!id) return null;
    const res = await this.db.execute({
      sql: 'SELECT * FROM shop_items WHERE id = ?',
      args: [id]
    });
    const row = res.rows[0];
    if (!row) return null;
    return this.rowToItem(row);
  }

  public async updateItem(id: string, updates: Partial<ItemDefinition>): Promise<ItemDefinition> {
    const existing = await this.getItemById(id);
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

    await this.db.execute({
      sql: `
        UPDATE shop_items SET
          name = ?,
          category = ?,
          price = ?,
          rarity = ?,
          is_available = ?,
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
        JSON.stringify(updated),
        new Date().toISOString(),
        id
      ])
    });

    return updated;
  }

  public async createItem(item: ItemDefinition): Promise<ItemDefinition> {
    const cleanId = item.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanId) {
      throw new Error('Укажите корректный идентификатор товара (латинские буквы, цифры, подчёркивание).');
    }
    if (await this.getItemById(cleanId)) {
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
    await this.db.execute({
      sql: `
        INSERT INTO shop_items (id, name, category, price, rarity, is_available, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([
        newItem.id,
        newItem.name,
        newItem.category,
        newItem.cost,
        newItem.rarity,
        newItem.inShop ? 1 : 0,
        JSON.stringify(newItem),
        now
      ])
    });

    return newItem;
  }

  public async deleteItem(id: string): Promise<boolean> {
    if (!(await this.getItemById(id))) {
      throw new Error(`Товар с ID "${id}" не найден.`);
    }
    if (id === 'cert_name_change' || id === 'cert_avatar_change') {
      throw new Error('Нельзя удалить системный сертификат. Вы можете отключить его в магазине.');
    }

    const res = await this.db.execute({
      sql: 'DELETE FROM shop_items WHERE id = ?',
      args: [id]
    });
    return (res.rowsAffected ?? 0) > 0;
  }

  public async getSettings(): Promise<ShopSettings> {
    const res = await this.db.execute("SELECT * FROM shop_settings WHERE id = 'default'");
    const row = res.rows[0];
    if (!row) {
      return {
        globalDiscount: 0,
        bannerMessage: 'Специальные предложения Городского Синдиката!',
        isShopEnabled: true,
        nicknameChangeCost: 250,
        avatarChangeCost: 500
      };
    }
    return {
      globalDiscount: Number(row.global_discount ?? 0),
      bannerMessage: (row.banner_message as string) || '',
      isShopEnabled: Boolean(row.is_shop_enabled),
      nicknameChangeCost: typeof row.nickname_cost === 'number' ? Number(row.nickname_cost) : 250,
      avatarChangeCost: typeof row.avatar_cost === 'number' ? Number(row.avatar_cost) : 500
    };
  }

  public async updateSettings(newSettings: Partial<ShopSettings>): Promise<ShopSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...newSettings };
    if (typeof updated.globalDiscount === 'number') {
      updated.globalDiscount = Math.max(0, Math.min(90, Math.round(updated.globalDiscount)));
    }
    if (typeof updated.nicknameChangeCost === 'number') {
      updated.nicknameChangeCost = Math.max(0, Math.round(updated.nicknameChangeCost));
    }
    if (typeof updated.avatarChangeCost === 'number') {
      updated.avatarChangeCost = Math.max(0, Math.round(updated.avatarChangeCost));
    }

    await this.db.execute({
      sql: `
        UPDATE shop_settings SET
          global_discount = ?,
          banner_message = ?,
          is_shop_enabled = ?,
          nickname_cost = ?,
          avatar_cost = ?,
          updated_at = ?
        WHERE id = 'default'
      `,
      args: sanitizeArgs([
        updated.globalDiscount,
        updated.bannerMessage,
        updated.isShopEnabled ? 1 : 0,
        updated.nicknameChangeCost,
        updated.avatarChangeCost,
        new Date().toISOString()
      ])
    });

    return updated;
  }

  public async resetToDefaults(): Promise<ItemDefinition[]> {
    await this.db.execute('DELETE FROM shop_items');
    await this.ensureSeed();
    await this.updateSettings({
      globalDiscount: 0,
      bannerMessage: 'Специальные предложения Городского Синдиката!',
      isShopEnabled: true
    });
    return this.getAllItems();
  }
}

export const shopDb = new ShopDatabase();
