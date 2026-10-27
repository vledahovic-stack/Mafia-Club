export type ItemCategory = 'certificates' | 'chests' | 'cosmetics' | 'valuables';
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  cost: number;             // Стоимость в магазине (кредиты)
  pawnValue?: number;       // Стоимость сдачи в ломбард (кредиты)
  description: string;
  icon: string;             // Иконка или эмодзи
  usable: boolean;          // Можно ли активировать/использовать
  consumable: boolean;      // Расходуется ли при активации
  effectDescription?: string;
  cosmeticType?: 'card_back' | 'title' | 'avatar_frame' | 'ui_skin';
  inShop?: boolean;
  discountPercent?: number;
  featured?: boolean;
  adminHidden?: boolean;    // Скрыт ли предмет из списков выбора в других разделах админ-панели
}

export interface UserInventoryItem {
  id?: string;
  itemId: string;
  quantity: number;
  acquiredAt: string;
}

export const DEFAULT_NICKNAME_CHANGE_COST = 250;
export const DEFAULT_AVATAR_CHANGE_COST = 500;
export const NICKNAME_CHANGE_CERTIFICATE_ID = 'cert_name_change';
export const AVATAR_CHANGE_CERTIFICATE_ID = 'cert_avatar_change';
export const ROLE_SELECT_CARD_ID = 'card_role_select';

export const RARITY_CONFIG: Record<ItemRarity, { label: string; color: string; bg: string; border: string }> = {
  common: {
    label: 'Обычный',
    color: 'text-zinc-300',
    bg: 'bg-zinc-900/80',
    border: 'border-zinc-700'
  },
  rare: {
    label: 'Редкий',
    color: 'text-blue-400',
    bg: 'bg-blue-950/40',
    border: 'border-blue-600/60'
  },
  epic: {
    label: 'Эпический',
    color: 'text-purple-400',
    bg: 'bg-purple-950/40',
    border: 'border-purple-600/60'
  },
  legendary: {
    label: 'Легендарный',
    color: 'text-amber-400',
    bg: 'bg-amber-950/50',
    border: 'border-amber-500/70'
  }
};

export const CATEGORY_CONFIG: Record<ItemCategory, { label: string; icon: string }> = {
  certificates: { label: 'Сертификаты и документы', icon: '📜' },
  chests: { label: 'Сундуки и кейсы', icon: '🧰' },
  cosmetics: { label: 'Рубашки и титулы', icon: '✨' },
  valuables: { label: 'Ценности ломбарда', icon: '💎' }
};

// ================= DYNAMIC CATALOG REGISTRY =================
// Single unified registry in memory synced exclusively with the database as the master source of truth.
let dynamicCatalogMap: Record<string, ItemDefinition> = {};
let dynamicCatalogList: ItemDefinition[] = [];
let catalogListeners: Array<(items: ItemDefinition[]) => void> = [];

/**
 * Synchronize in-memory item registry with the latest items from the database.
 */
export function syncItemsCatalog(items: ItemDefinition[]): void {
  if (!Array.isArray(items)) return;
  const newMap: Record<string, ItemDefinition> = {};
  for (const item of items) {
    if (item && item.id) {
      newMap[item.id] = { ...item };
    }
  }
  dynamicCatalogMap = newMap;
  dynamicCatalogList = Object.values(newMap);
  catalogListeners.forEach(listener => {
    try { listener(dynamicCatalogList); } catch {}
  });
}

/**
 * Subscribe to item catalog updates (e.g. for React components).
 */
export function subscribeItemsCatalog(listener: (items: ItemDefinition[]) => void): () => void {
  catalogListeners.push(listener);
  return () => {
    catalogListeners = catalogListeners.filter(l => l !== listener);
  };
}

/**
 * Resolve an item definition by ID from the unified database-backed catalog.
 */
export function getItemDefinition(itemId: string): ItemDefinition | undefined {
  if (!itemId) return undefined;
  return dynamicCatalogMap[itemId];
}

/**
 * Get all items currently in the unified catalog.
 */
export function getDynamicItemsList(): ItemDefinition[] {
  return dynamicCatalogList;
}

/**
 * Get a key-value dictionary of all items currently in the unified catalog.
 */
export function getDynamicItemsMap(): Record<string, ItemDefinition> {
  return dynamicCatalogMap;
}

/**
 * Shared administrative filtering mechanism:
 * Returns items available for selection in admin interfaces (where adminHidden !== true),
 * while preserving any already-assigned items (currentlySelectedIds) so existing configurations
 * continue to display and save without losing hidden items.
 */
export function getAdminSelectableItems(
  items?: ItemDefinition[],
  currentlySelectedIds?: string | Array<string | undefined | null> | null
): ItemDefinition[] {
  const source = Array.isArray(items) && items.length > 0 ? items : dynamicCatalogList;
  const selectedSet = new Set<string>();
  if (typeof currentlySelectedIds === 'string' && currentlySelectedIds.trim()) {
    selectedSet.add(currentlySelectedIds.trim());
  } else if (Array.isArray(currentlySelectedIds)) {
    for (const id of currentlySelectedIds) {
      if (typeof id === 'string' && id.trim()) {
        selectedSet.add(id.trim());
      }
    }
  }
  return source.filter(item => !item.adminHidden || selectedSet.has(item.id));
}

