import { ItemDefinition, ItemCategory, ItemRarity } from '../data/items';
import { getDatabase, sanitizeArgs } from './database';
import { Client } from '@libsql/client';
import { itemsDb } from './items';

export { itemsDb };

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
      // 1. Ensure master items catalog in database
      await itemsDb.ensureSeed();

      // 2. Migration: Add columns to shop_settings if they do not exist
      try {
        await this.db.execute("ALTER TABLE shop_settings ADD COLUMN nickname_cost INTEGER DEFAULT 250");
      } catch {}
      try {
        await this.db.execute("ALTER TABLE shop_settings ADD COLUMN avatar_cost INTEGER DEFAULT 500");
      } catch {}

      // 3. Ensure shop settings
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
    } catch (e) {
      console.error('[ShopDb] ensureSeed error:', e);
    }
  }

  public async getAllItems(): Promise<ItemDefinition[]> {
    return itemsDb.getAllItems();
  }

  public async getShopItems(): Promise<ItemDefinition[]> {
    return itemsDb.getShopItems();
  }

  public async getItemById(id: string): Promise<ItemDefinition | null> {
    return itemsDb.getItemById(id);
  }

  public async updateItem(id: string, updates: Partial<ItemDefinition>): Promise<ItemDefinition> {
    return itemsDb.updateItem(id, updates);
  }

  public async createItem(item: ItemDefinition): Promise<ItemDefinition> {
    return itemsDb.createItem(item);
  }

  public async deleteItem(id: string): Promise<boolean> {
    return itemsDb.deleteItem(id);
  }

  public async setAdminVisibility(id: string, adminHidden: boolean): Promise<ItemDefinition> {
    return itemsDb.setAdminVisibility(id, adminHidden);
  }

  public async bulkSetAdminVisibility(ids: string[], adminHidden: boolean): Promise<ItemDefinition[]> {
    return itemsDb.bulkSetAdminVisibility(ids, adminHidden);
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
    await this.updateSettings({
      globalDiscount: 0,
      bannerMessage: 'Специальные предложения Городского Синдиката!',
      isShopEnabled: true,
      nicknameChangeCost: 250,
      avatarChangeCost: 500
    });
    return itemsDb.getAllItems();
  }
}

export const shopDb = new ShopDatabase();
