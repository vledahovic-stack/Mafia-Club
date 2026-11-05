import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  Sparkles,
  Gift,
  FileText,
  Search,
  SlidersHorizontal,
  ArrowLeft,
  X,
  Check,
  Scale,
  Tag,
  Layers,
  Shield,
  ShoppingBag,
  ChevronRight,
  Loader2,
  RotateCcw
} from 'lucide-react';
import { AuthUser } from './AuthModal';
import {
  ItemDefinition,
  ItemCategory,
  ItemRarity,
  UserInventoryItem,
  LootboxRuleSnapshot,
  LootboxMediaAssetRecord,
  RARITY_CONFIG,
  CATEGORY_CONFIG,
  NICKNAME_CHANGE_CERTIFICATE_ID,
  AVATAR_CHANGE_CERTIFICATE_ID,
  ROLE_SELECT_CARD_ID,
  getItemDefinition
} from '../data/items';
import { sounds } from '../utils/audio';

export type InventoryHubCategoryId = 'chests' | 'certificates' | 'cosmetics' | 'gifts' | 'valuables';
export type InventoryViewMode = 'hub' | 'list' | 'catalog';
export type InventorySortBy = 'recent' | 'oldest' | 'name_asc' | 'quantity_desc' | 'rarity_desc';
export type InventoryEquipFilter = 'all' | 'equipped' | 'unequipped';

export interface InventoryFilterState {
  category: InventoryHubCategoryId | 'all';
  rarity: ItemRarity | 'all';
  equipStatus: InventoryEquipFilter;
  sortBy: InventorySortBy;
}

const DEFAULT_FILTER_STATE: InventoryFilterState = {
  category: 'all',
  rarity: 'all',
  equipStatus: 'all',
  sortBy: 'recent'
};

const RARITY_WEIGHT: Record<ItemRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4
};

export interface GroupedInventoryStack {
  stackKey: string;
  invItem: UserInventoryItem;
  itemDef: ItemDefinition;
  uiCategory: InventoryHubCategoryId;
  quantity: number;
  acquiredAtMs: number;
  originalIndex: number;
  isLootbox: boolean;
  stackSnapshot: LootboxRuleSnapshot | null;
}

export interface EquippedSlotEntry {
  slotType: 'card_back' | 'title' | 'ui_skin';
  slotLabel: string;
  itemId: string;
  name: string;
  description: string;
  icon: string;
  rarity: ItemRarity;
  ownedStack: GroupedInventoryStack | null;
  isMasteryBadgeTitle?: boolean;
}

interface PlayerInventoryScreenProps {
  user: AuthUser;
  catalogList: ItemDefinition[];
  mediaAssetsMap: Record<string, LootboxMediaAssetRecord>;
  deletedReplacements: Record<string, any>;
  actionLoading: boolean;
  initialSubView?: 'items' | 'catalog';
  resolveInventoryItemDef: (invItem: UserInventoryItem) => ItemDefinition | null;
  resolveStackSnapshot: (invItem: UserInventoryItem, itemDef: ItemDefinition) => LootboxRuleSnapshot | null;
  onUseItem: (itemId: string) => Promise<void> | void;
  onUnequipMasteryTitle?: () => Promise<void> | void;
  onPawnItem: (itemId: string, inventoryEntryId?: string) => Promise<void> | void;
  onOpenLootbox: (invItem: UserInventoryItem, itemDef: ItemDefinition) => void;
  onOpenShop?: () => void;
  onCloseProfile?: () => void;
}

const HUB_CATEGORIES_META: Record<
  InventoryHubCategoryId,
  {
    id: InventoryHubCategoryId;
    title: string;
    shortTitle: string;
    subtitle: string;
    emptyTitle: string;
    emptyDescription: string;
    icon: string;
    lucideIcon: React.ElementType;
    accentText: string;
    accentBadgeBg: string;
  }
> = {
  chests: {
    id: 'chests',
    title: 'Сундуки',
    shortTitle: 'Сундуки',
    subtitle: 'Лутбоксы, сейфы и кейсы с наградами',
    emptyTitle: 'У вас пока нет сундуков',
    emptyDescription: 'Сундуки можно приобрести в Магазине Города, получить за промокоды, уровни или игровые события.',
    icon: '🧰',
    lucideIcon: Gift,
    accentText: 'text-amber-300',
    accentBadgeBg: 'bg-amber-950/80 border-amber-600/60 text-amber-300'
  },
  certificates: {
    id: 'certificates',
    title: 'Сертификаты',
    shortTitle: 'Сертификаты',
    subtitle: 'Смена никнейма, аватара и особые документы',
    emptyTitle: 'Нет доступных сертификатов',
    emptyDescription: 'Сертификаты позволяют бесплатно менять никнейм, аватар или выбирать роль перед началом партии.',
    icon: '📜',
    lucideIcon: FileText,
    accentText: 'text-blue-300',
    accentBadgeBg: 'bg-blue-950/80 border-blue-600/60 text-blue-300'
  },
  cosmetics: {
    id: 'cosmetics',
    title: 'Оформление',
    shortTitle: 'Оформление',
    subtitle: 'Скины интерфейса, рубашки карт и титулы',
    emptyTitle: 'Нет предметов оформления',
    emptyDescription: 'Эксклюзивные стили интерфейса, рубашки карт и титулы досье выделят вас за игровым столом.',
    icon: '✨',
    lucideIcon: Sparkles,
    accentText: 'text-purple-300',
    accentBadgeBg: 'bg-purple-950/80 border-purple-600/60 text-purple-300'
  },
  gifts: {
    id: 'gifts',
    title: 'Подарки',
    shortTitle: 'Подарки',
    subtitle: 'Подарочные наборы и знаки внимания',
    emptyTitle: 'Раздел подарков пуст',
    emptyDescription: 'У вас пока нет подарков в инвентаре. Здесь будут отображаться полученные и доступные подарки.',
    icon: '🎀',
    lucideIcon: Gift,
    accentText: 'text-rose-300',
    accentBadgeBg: 'bg-rose-950/80 border-rose-600/60 text-rose-300'
  },
  valuables: {
    id: 'valuables',
    title: 'Ценности ломбарда',
    shortTitle: 'Ценности',
    subtitle: 'Трофеи и предметы для сдачи ростовщику',
    emptyTitle: 'Нет ценностей для ломбарда',
    emptyDescription: 'Ценные трофеи выпадают из сундуков и могут быть сданы в Городской Ломбард за кредиты.',
    icon: '💎',
    lucideIcon: Scale,
    accentText: 'text-emerald-300',
    accentBadgeBg: 'bg-emerald-950/80 border-emerald-600/60 text-emerald-300'
  }
};

const QUAD_TILE_IDS: Array<'chests' | 'certificates' | 'cosmetics' | 'gifts'> = [
  'chests',
  'certificates',
  'cosmetics',
  'gifts'
];

const ALL_CATEGORY_GROUP_ORDER: InventoryHubCategoryId[] = [
  'chests',
  'certificates',
  'cosmetics',
  'gifts',
  'valuables'
];

export function resolveUiCategory(itemDef: ItemDefinition): InventoryHubCategoryId {
  const rawCat = String(itemDef.category || '');
  if (rawCat === 'chests') return 'chests';
  if (rawCat === 'certificates') return 'certificates';
  if (rawCat === 'cosmetics') return 'cosmetics';
  if (rawCat === 'gifts') return 'gifts';
  if (rawCat === 'valuables') return 'valuables';
  return 'cosmetics';
}

export const PlayerInventoryScreen: React.FC<PlayerInventoryScreenProps> = ({
  user,
  catalogList,
  mediaAssetsMap,
  deletedReplacements,
  actionLoading,
  initialSubView = 'items',
  resolveInventoryItemDef,
  resolveStackSnapshot,
  onUseItem,
  onUnequipMasteryTitle,
  onPawnItem,
  onOpenLootbox,
  onOpenShop,
  onCloseProfile
}) => {
  // Navigation level: 'hub' (Level 1) | 'list' (Level 2 owned items) | 'catalog' (Level 2 catalog)
  const [viewMode, setViewMode] = useState<InventoryViewMode>(() =>
    initialSubView === 'catalog' ? 'catalog' : 'hub'
  );
  const [activeCategory, setActiveCategory] = useState<InventoryHubCategoryId | 'all'>('all');

  useEffect(() => {
    if (initialSubView === 'catalog') {
      setViewMode('catalog');
    } else {
      setViewMode('hub');
    }
  }, [initialSubView]);

  // Search & Filter state on Level 2 List Screen
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedFilter, setAppliedFilter] = useState<InventoryFilterState>(DEFAULT_FILTER_STATE);
  const [draftFilter, setDraftFilter] = useState<InventoryFilterState>(DEFAULT_FILTER_STATE);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Progressive rendering limit for long lists (Section 11)
  const [visibleLimit, setVisibleLimit] = useState<number>(48);

  // Detailed item modal state (Section 9)
  const [selectedStackKey, setSelectedStackKey] = useState<string | null>(null);
  const [selectedEquippedFallback, setSelectedEquippedFallback] = useState<EquippedSlotEntry | null>(null);

  // Catalog state (Section 5.5)
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<ItemCategory | 'all'>('all');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<ItemDefinition | null>(null);

  const rawInventory = Array.isArray(user.inventory) ? user.inventory : [];

  // Helper to check if an item definition is currently equipped by the player
  const isItemEquipped = React.useCallback(
    (itemDef: ItemDefinition): boolean => {
      if (itemDef.cosmeticType === 'title') {
        return Boolean(user.equippedCosmetics?.title && user.equippedCosmetics.title === itemDef.name);
      }
      if (itemDef.cosmeticType === 'ui_skin' || itemDef.id.startsWith('skin_')) {
        const skinId = itemDef.id.replace(/^skin_/, '');
        return Boolean(user.equippedCosmetics?.uiSkin && user.equippedCosmetics.uiSkin === skinId);
      }
      if (itemDef.cosmeticType === 'card_back' || itemDef.category === 'cosmetics') {
        return Boolean(user.equippedCosmetics?.cardBack && user.equippedCosmetics.cardBack === itemDef.id);
      }
      return false;
    },
    [user.equippedCosmetics]
  );

  // Helper to resolve custom lootbox idle frame preview image URL
  const getCustomPreviewSrc = React.useCallback(
    (itemDef: ItemDefinition): string => {
      const firstIdleFrameUrl =
        itemDef.presentationConfig?.idleAnimation?.mode === 'custom_frames'
          ? itemDef.presentationConfig?.idleAnimation?.frames?.[0]?.imageUrl || ''
          : '';
      if (!firstIdleFrameUrl) return '';
      if (
        firstIdleFrameUrl.startsWith('data:') ||
        firstIdleFrameUrl.startsWith('http') ||
        firstIdleFrameUrl.startsWith('/')
      ) {
        return firstIdleFrameUrl;
      }
      return (
        mediaAssetsMap[firstIdleFrameUrl]?.sourceUrl ||
        `/api/lootboxes/media/${encodeURIComponent(firstIdleFrameUrl)}`
      );
    },
    [mediaAssetsMap]
  );

  // Build grouped inventory stacks (Section 7):
  // - Regular items (non-lootbox, no ruleSnapshot) merge safely by itemId with summed quantity.
  // - Lootbox items (category === 'chests' or has ruleSnapshot) NEVER merge across different slots/snapshots:
  //   each server UserInventoryItem slot preserves its individual ruleSnapshot, version, and inventoryEntryId.
  const groupedStacks = useMemo<GroupedInventoryStack[]>(() => {
    const regularByItemId = new Map<string, GroupedInventoryStack>();
    const lootboxStacks: GroupedInventoryStack[] = [];

    rawInventory.forEach((invItem, index) => {
      if (!invItem || typeof invItem.quantity !== 'number' || invItem.quantity <= 0) return;
      const itemDef = resolveInventoryItemDef(invItem);
      if (!itemDef) return;

      const uiCategory = resolveUiCategory(itemDef);
      const isLootbox = itemDef.category === 'chests' || Boolean(invItem.ruleSnapshot);
      const parsedMs = invItem.acquiredAt ? Date.parse(invItem.acquiredAt) : NaN;
      const acquiredAtMs = Number.isFinite(parsedMs) ? parsedMs : 0;

      if (isLootbox) {
        const stackSnapshot = resolveStackSnapshot(invItem, itemDef);
        const stackKey = invItem.id
          ? `lb_${invItem.id}`
          : `lb_${invItem.itemId}_${stackSnapshot?.snapshotHash || 'nosnap'}_${index}`;
        lootboxStacks.push({
          stackKey,
          invItem,
          itemDef,
          uiCategory: 'chests',
          quantity: Math.trunc(invItem.quantity),
          acquiredAtMs,
          originalIndex: index,
          isLootbox: true,
          stackSnapshot
        });
      } else {
        const existing = regularByItemId.get(invItem.itemId);
        if (existing) {
          existing.quantity += Math.trunc(invItem.quantity);
          if (acquiredAtMs > existing.acquiredAtMs) {
            existing.acquiredAtMs = acquiredAtMs;
            existing.invItem = {
              ...existing.invItem,
              quantity: existing.quantity,
              acquiredAt: invItem.acquiredAt
            };
          } else {
            existing.invItem = {
              ...existing.invItem,
              quantity: existing.quantity
            };
          }
        } else {
          regularByItemId.set(invItem.itemId, {
            stackKey: `reg_${invItem.itemId}`,
            invItem: { ...invItem, quantity: Math.trunc(invItem.quantity) },
            itemDef,
            uiCategory,
            quantity: Math.trunc(invItem.quantity),
            acquiredAtMs,
            originalIndex: index,
            isLootbox: false,
            stackSnapshot: null
          });
        }
      }
    });

    return [...lootboxStacks, ...Array.from(regularByItemId.values())];
  }, [rawInventory, resolveInventoryItemDef, resolveStackSnapshot]);

  // Category instance counters (Section 5.4): sum of quantities without double counting
  const categoryInstanceCounts = useMemo<Record<InventoryHubCategoryId | 'all', number>>(() => {
    const counts: Record<InventoryHubCategoryId | 'all', number> = {
      all: 0,
      chests: 0,
      certificates: 0,
      cosmetics: 0,
      gifts: 0,
      valuables: 0
    };
    for (const stack of groupedStacks) {
      counts.all += stack.quantity;
      counts[stack.uiCategory] = (counts[stack.uiCategory] || 0) + stack.quantity;
    }
    return counts;
  }, [groupedStacks]);

  // Equipped items list for the "Экипировано" block (Section 5.1)
  const equippedEntries = useMemo<EquippedSlotEntry[]>(() => {
    const list: EquippedSlotEntry[] = [];
    const eq = user.equippedCosmetics;
    if (!eq) return list;

    // 1. UI Skin
    if (eq.uiSkin && eq.uiSkin !== 'default') {
      const skinItemId = eq.uiSkin.startsWith('skin_') ? eq.uiSkin : `skin_${eq.uiSkin}`;
      const ownedStack =
        groupedStacks.find(s => s.itemDef.id === skinItemId || s.itemDef.id === eq.uiSkin) || null;
      const itemDef = ownedStack?.itemDef || getItemDefinition(skinItemId) || getItemDefinition(eq.uiSkin);
      list.push({
        slotType: 'ui_skin',
        slotLabel: 'Стиль интерфейса',
        itemId: itemDef?.id || skinItemId,
        name: itemDef?.name || `Стиль: ${eq.uiSkin}`,
        description:
          itemDef?.description || 'Активный визуальный пакет оформления интерфейса Mafia Club.',
        icon: itemDef?.icon || '🎨',
        rarity: itemDef?.rarity || 'legendary',
        ownedStack
      });
    }

    // 2. Card Back
    if (eq.cardBack) {
      const ownedStack = groupedStacks.find(s => s.itemDef.id === eq.cardBack) || null;
      const itemDef = ownedStack?.itemDef || getItemDefinition(eq.cardBack);
      list.push({
        slotType: 'card_back',
        slotLabel: 'Рубашка карт',
        itemId: itemDef?.id || eq.cardBack,
        name: itemDef?.name || eq.cardBack,
        description: itemDef?.description || 'Активная рубашка ваших игровых карт за столом.',
        icon: itemDef?.icon || '🃏',
        rarity: itemDef?.rarity || 'rare',
        ownedStack
      });
    }

    // 3. Title
    if (eq.title) {
      const ownedStack =
        groupedStacks.find(
          s => s.itemDef.cosmeticType === 'title' && s.itemDef.name === eq.title
        ) || null;
      const catalogTitleDef =
        ownedStack?.itemDef ||
        catalogList.find(c => c.cosmeticType === 'title' && c.name === eq.title);
      list.push({
        slotType: 'title',
        slotLabel: 'Титул досье',
        itemId: catalogTitleDef?.id || `title_${eq.title}`,
        name: eq.title,
        description:
          catalogTitleDef?.description ||
          'Почётный титул, отображаемый рядом с вашим именем в профиле и списке друзей.',
        icon: catalogTitleDef?.icon || '👑',
        rarity: catalogTitleDef?.rarity || 'epic',
        ownedStack,
        isMasteryBadgeTitle: !catalogTitleDef
      });
    }

    return list;
  }, [user.equippedCosmetics, groupedStacks, catalogList]);

  // Active selected stack for Detail Modal (reactive to state updates & quantity changes - Section 10)
  const activeDetailStack = useMemo<GroupedInventoryStack | null>(() => {
    if (!selectedStackKey) return null;
    return groupedStacks.find(s => s.stackKey === selectedStackKey) || null;
  }, [selectedStackKey, groupedStacks]);

  // Automatically close the detail modal if the last instance of the selected item was consumed/pawned
  useEffect(() => {
    if (selectedStackKey && !activeDetailStack) {
      setSelectedStackKey(null);
    }
  }, [selectedStackKey, activeDetailStack]);

  // Open a category or "Все предметы" list screen (Level 2)
  const handleOpenCategoryList = (category: InventoryHubCategoryId | 'all') => {
    sounds.playTick();
    setActiveCategory(category);
    const nextFilter: InventoryFilterState = {
      ...DEFAULT_FILTER_STATE,
      category: 'all'
    };
    setAppliedFilter(nextFilter);
    setDraftFilter(nextFilter);
    setSearchQuery('');
    setIsSearchOpen(false);
    setVisibleLimit(48);
    setViewMode('list');
  };

  // Sorting function for stacks
  const sortStacks = React.useCallback(
    (stacks: GroupedInventoryStack[], sortBy: InventorySortBy): GroupedInventoryStack[] => {
      const copy = [...stacks];
      copy.sort((a, b) => {
        if (sortBy === 'recent') {
          if (b.acquiredAtMs !== a.acquiredAtMs) return b.acquiredAtMs - a.acquiredAtMs;
          return b.originalIndex - a.originalIndex;
        }
        if (sortBy === 'oldest') {
          if (a.acquiredAtMs !== b.acquiredAtMs) return a.acquiredAtMs - b.acquiredAtMs;
          return a.originalIndex - b.originalIndex;
        }
        if (sortBy === 'name_asc') {
          const nameA = a.stackSnapshot?.name || a.itemDef.name;
          const nameB = b.stackSnapshot?.name || b.itemDef.name;
          return nameA.localeCompare(nameB, 'ru');
        }
        if (sortBy === 'quantity_desc') {
          if (b.quantity !== a.quantity) return b.quantity - a.quantity;
          return b.acquiredAtMs - a.acquiredAtMs;
        }
        if (sortBy === 'rarity_desc') {
          const rDiff = (RARITY_WEIGHT[b.itemDef.rarity] || 0) - (RARITY_WEIGHT[a.itemDef.rarity] || 0);
          if (rDiff !== 0) return rDiff;
          return b.acquiredAtMs - a.acquiredAtMs;
        }
        return 0;
      });
      return copy;
    },
    []
  );

  // Filtered and sorted stacks for the current Level 2 list screen
  const filteredListStacks = useMemo<GroupedInventoryStack[]>(() => {
    const cleanSearch = searchQuery.trim().toLowerCase();

    const matches = groupedStacks.filter(stack => {
      // 1. Screen category constraint
      if (activeCategory !== 'all' && stack.uiCategory !== activeCategory) {
        return false;
      }
      // 2. Filter modal category constraint (when on 'all' screen)
      if (
        activeCategory === 'all' &&
        appliedFilter.category !== 'all' &&
        stack.uiCategory !== appliedFilter.category
      ) {
        return false;
      }
      // 3. Rarity filter
      if (appliedFilter.rarity !== 'all' && stack.itemDef.rarity !== appliedFilter.rarity) {
        return false;
      }
      // 4. Equip status filter
      if (appliedFilter.equipStatus !== 'all') {
        const equipped = isItemEquipped(stack.itemDef);
        if (appliedFilter.equipStatus === 'equipped' && !equipped) return false;
        if (appliedFilter.equipStatus === 'unequipped' && equipped) return false;
      }
      // 5. Search by item name
      if (cleanSearch) {
        const displayName = (stack.stackSnapshot?.name || stack.itemDef.name).toLowerCase();
        if (!displayName.includes(cleanSearch)) return false;
      }
      return true;
    });

    return sortStacks(matches, appliedFilter.sortBy);
  }, [groupedStacks, activeCategory, appliedFilter, searchQuery, isItemEquipped, sortStacks]);

  // Count how many non-default filter criteria are currently applied
  const activeFilterCriteriaCount = useMemo(() => {
    let count = 0;
    if (activeCategory === 'all' && appliedFilter.category !== 'all') count++;
    if (appliedFilter.rarity !== 'all') count++;
    if (appliedFilter.equipStatus !== 'all') count++;
    if (appliedFilter.sortBy !== 'recent') count++;
    return count;
  }, [activeCategory, appliedFilter]);

  // Filtered catalog items for Level 2 Catalog screen
  const filteredCatalog = useMemo(() => {
    const clean = catalogSearch.trim().toLowerCase();
    return catalogList.filter(item => {
      const matchesCategory = catalogCategory === 'all' || item.category === catalogCategory;
      const matchesSearch =
        !clean ||
        item.name.toLowerCase().includes(clean) ||
        item.description.toLowerCase().includes(clean);
      return matchesCategory && matchesSearch;
    });
  }, [catalogList, catalogCategory, catalogSearch]);

  // Render a single compact item card in the Level 2 list (Section 6.2)
  const renderCompactInventoryCard = (stack: GroupedInventoryStack) => {
    const { itemDef, stackSnapshot, quantity, isLootbox } = stack;
    const rarity = RARITY_CONFIG[itemDef.rarity] || RARITY_CONFIG.common;
    const equipped = isItemEquipped(itemDef);
    const customPreviewSrc = getCustomPreviewSrc(itemDef);
    const displayName = stackSnapshot?.name || itemDef.name;

    return (
      <button
        key={stack.stackKey}
        type="button"
        onClick={() => {
          sounds.playTick();
          setSelectedEquippedFallback(null);
          setSelectedStackKey(stack.stackKey);
        }}
        style={
          itemDef.rarity === 'common'
            ? {
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: equipped ? 'var(--skin-border-accent)' : 'var(--skin-border-card)'
              }
            : undefined
        }
        className={`group relative p-3 sm:p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-2.5 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${rarity.bg} ${
          equipped ? 'ring-1 ring-emerald-500/70 border-emerald-500/80' : rarity.border
        }`}
      >
        {/* Top Row: Rarity / Version + Quantity Badge */}
        <div className="flex items-center justify-between gap-1.5 w-full">
          <div className="flex items-center gap-1 min-w-0 flex-wrap">
            <span className={`text-[9px] sm:text-[10px] uppercase font-mono font-bold truncate ${rarity.color}`}>
              {rarity.label}
            </span>
            {isLootbox && stackSnapshot && (
              <span
                title={`Зафиксированный снимок правил сундука v${stackSnapshot.version}`}
                className="px-1.5 py-0.2 rounded bg-orange-950/80 border border-orange-500/40 text-orange-300 text-[9px] font-mono font-bold shrink-0"
              >
                v{stackSnapshot.version}
              </span>
            )}
          </div>

          <span className="px-2 py-0.5 rounded-full bg-black/65 border border-white/10 text-zinc-100 text-[10px] font-mono font-bold shrink-0">
            ×{quantity}
          </span>
        </div>

        {/* Center Visual: Item Icon or Image */}
        <div className="my-1 flex items-center justify-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-black/45 border border-white/10 flex items-center justify-center text-3xl sm:text-4xl overflow-hidden shadow-inner group-hover:border-white/25 transition-colors">
            {customPreviewSrc ? (
              <img
                src={customPreviewSrc}
                alt={displayName}
                loading="lazy"
                className="w-full h-full object-contain p-1.5"
              />
            ) : (
              <span className="select-none">{itemDef.icon}</span>
            )}
          </div>
        </div>

        {/* Bottom Row: Item Title + Equipped Status */}
        <div className="space-y-1.5 w-full">
          <div className="text-xs sm:text-sm font-bold text-[var(--skin-text-primary)] leading-snug line-clamp-2 min-h-[2.25rem]">
            {displayName}
          </div>

          <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/10">
            {equipped ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-600/70 text-emerald-300 text-[10px] font-bold">
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Экипировано</span>
              </span>
            ) : (
              <span className="text-[10px] font-medium text-[var(--skin-text-secondary)] truncate">
                {HUB_CATEGORIES_META[stack.uiCategory].shortTitle}
              </span>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-[var(--skin-text-muted)] group-hover:text-[var(--skin-text-primary)] shrink-0 transition-colors" />
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-150">
      {/* =====================================================================
          LEVEL 1: MAIN INVENTORY SCREEN (ГЛАВНЫЙ ЭКРАН ИНВЕНТАРЯ)
         ===================================================================== */}
      {viewMode === 'hub' && (
        <div className="space-y-4 sm:space-y-5">
          {/* 5.1. COMPACT EQUIPPED ITEMS BLOCK (БЛОК «ЭКИПИРОВАНО») */}
          <section
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-card)',
              boxShadow: 'var(--skin-shadow-card)'
            }}
            className="skin-card rounded-2xl border p-3.5 sm:p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  style={{
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: 'var(--skin-border-accent)',
                    color: 'var(--skin-accent-primary)'
                  }}
                  className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0"
                >
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-[var(--skin-text-primary)] uppercase tracking-wider">
                    Экипировано
                  </h3>
                </div>
              </div>

              <span className="text-[11px] font-mono text-[var(--skin-text-secondary)]">
                {equippedEntries.length > 0
                  ? `Активно: ${equippedEntries.length}`
                  : 'Не выбрано'}
              </span>
            </div>

            {equippedEntries.length === 0 ? (
              <div
                style={{
                  backgroundColor: 'var(--skin-bg-subcard)',
                  borderColor: 'var(--skin-border-base)'
                }}
                className="p-3 rounded-xl border border-dashed flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sparkles className="w-4 h-4 text-[var(--skin-text-muted)] shrink-0" />
                  <span className="text-xs text-[var(--skin-text-secondary)] truncate">
                    Ни один предмет оформления сейчас не экипирован
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenCategoryList('cosmetics')}
                  className="text-[11px] font-bold text-[var(--skin-accent-primary)] hover:underline shrink-0 cursor-pointer"
                >
                  Оформление →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {equippedEntries.map(entry => {
                  const rarity = RARITY_CONFIG[entry.rarity] || RARITY_CONFIG.common;
                  return (
                    <button
                      key={`${entry.slotType}_${entry.itemId}`}
                      type="button"
                      onClick={() => {
                        sounds.playTick();
                        if (entry.ownedStack) {
                          setSelectedEquippedFallback(null);
                          setSelectedStackKey(entry.ownedStack.stackKey);
                        } else {
                          setSelectedStackKey(null);
                          setSelectedEquippedFallback(entry);
                        }
                      }}
                      style={{
                        backgroundColor: 'var(--skin-bg-subcard)',
                        borderColor: 'var(--skin-border-accent)'
                      }}
                      className="p-2.5 sm:p-3 rounded-xl border text-left flex items-center justify-between gap-2.5 hover:brightness-110 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-black/45 border border-white/10 flex items-center justify-center text-xl shrink-0">
                          {entry.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono uppercase text-[var(--skin-text-muted)] truncate">
                              {entry.slotLabel}
                            </span>
                            <span className={`text-[9px] font-mono font-bold uppercase ${rarity.color}`}>
                              · {rarity.label}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-[var(--skin-text-primary)] truncate mt-0.5">
                            {entry.name}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--skin-text-muted)] group-hover:text-[var(--skin-text-primary)] shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* 5.2 & 5.3. FOUR CONCAVE CATEGORY TILES (2x2) + CENTRAL CIRCULAR BUTTON "ВСЕ ПРЕДМЕТЫ" */}
          <section className="relative max-w-2xl mx-auto py-1">
            <div
              style={
                {
                  '--inv-cutout-r': '66px',
                  '--inv-half-gap': '6px'
                } as React.CSSProperties
              }
              className="relative grid grid-cols-2 gap-3 sm:[--inv-cutout-r:76px] sm:[--inv-half-gap:8px] sm:gap-4"
            >
              {QUAD_TILE_IDS.map((catId, idx) => {
                const meta = HUB_CATEGORIES_META[catId];
                const count = categoryInstanceCounts[catId] || 0;

                // Determine which inner corner has the concave circular cutout matching the center button
                // idx 0: Top-Left -> cutout at Bottom-Right
                // idx 1: Top-Right -> cutout at Bottom-Left
                // idx 2: Bottom-Left -> cutout at Top-Right
                // idx 3: Bottom-Right -> cutout at Top-Left
                const maskOrigin =
                  idx === 0
                    ? 'calc(100% + var(--inv-half-gap)) calc(100% + var(--inv-half-gap))'
                    : idx === 1
                    ? 'calc(0% - var(--inv-half-gap)) calc(100% + var(--inv-half-gap))'
                    : idx === 2
                    ? 'calc(100% + var(--inv-half-gap)) calc(0% - var(--inv-half-gap))'
                    : 'calc(0% - var(--inv-half-gap)) calc(0% - var(--inv-half-gap))';

                const maskGradient = `radial-gradient(circle var(--inv-cutout-r) at ${maskOrigin}, transparent calc(var(--inv-cutout-r) - 1px), #000 var(--inv-cutout-r))`;

                // Safe padding away from the concave inner corner so text and badges never collide with the arc
                const safeCornerPadding =
                  idx === 0
                    ? 'pr-12 pb-10 sm:pr-16 sm:pb-12 text-left items-start'
                    : idx === 1
                    ? 'pl-12 pb-10 sm:pl-16 sm:pb-12 text-right items-end'
                    : idx === 2
                    ? 'pr-12 pt-10 sm:pr-16 sm:pt-12 text-left items-start'
                    : 'pl-12 pt-10 sm:pl-16 sm:pt-12 text-right items-end';

                return (
                  <button
                    key={catId}
                    type="button"
                    onClick={() => handleOpenCategoryList(catId)}
                    style={{
                      backgroundColor: 'var(--skin-bg-card)',
                      borderColor: 'var(--skin-border-card)',
                      boxShadow: 'var(--skin-shadow-card)',
                      WebkitMaskImage: maskGradient,
                      maskImage: maskGradient
                    }}
                    className={`skin-card group relative min-h-[148px] sm:min-h-[168px] p-3.5 sm:p-5 rounded-2xl border flex flex-col justify-between transition-all hover:border-[var(--skin-border-accent)] hover:bg-[var(--skin-bg-elevated)] active:scale-[0.99] cursor-pointer ${safeCornerPadding}`}
                  >
                    {/* Top section of tile: Icon + Count Badge */}
                    <div
                      className={`flex items-center gap-2 w-full ${
                        idx % 2 === 1 ? 'flex-row-reverse justify-start' : 'justify-between'
                      }`}
                    >
                      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-black/45 border border-white/10 flex items-center justify-center text-xl sm:text-2xl shrink-0 shadow-inner">
                        <span>{meta.icon}</span>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full border font-mono text-xs sm:text-sm font-black tabular-nums ${
                          count > 0
                            ? meta.accentBadgeBg
                            : 'bg-black/40 border-[var(--skin-border-base)] text-[var(--skin-text-muted)]'
                        }`}
                      >
                        {count}
                      </span>
                    </div>

                    {/* Bottom section of tile: Category Title & Subtitle */}
                    <div className="space-y-0.5 max-w-full">
                      <div className="text-sm sm:text-base font-bold text-[var(--skin-text-primary)] group-hover:text-[var(--skin-accent-secondary)] transition-colors truncate">
                        {meta.title}
                      </div>
                      <p className="text-[10px] sm:text-xs text-[var(--skin-text-secondary)] line-clamp-2 leading-tight">
                        {meta.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* Decorative concentric border ring outlining the concave circular cutout */}
              <div
                aria-hidden="true"
                style={{
                  borderColor: 'var(--skin-border-strong)'
                }}
                className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[132px] h-[132px] sm:w-[152px] sm:h-[152px] rounded-full border border-dashed opacity-60 z-10"
              />

              {/* 5.3. CENTRAL CIRCULAR BUTTON "ВСЕ ПРЕДМЕТЫ" */}
              <button
                type="button"
                onClick={() => handleOpenCategoryList('all')}
                style={{
                  background: 'var(--skin-btn-primary-bg)',
                  color: 'var(--skin-btn-primary-text)',
                  borderColor: 'var(--skin-border-accent)',
                  boxShadow: 'var(--skin-glow-accent)'
                }}
                className="z-20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[114px] h-[114px] sm:w-[132px] sm:h-[132px] rounded-full border-2 flex flex-col items-center justify-center text-center p-2 shadow-2xl transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Layers className="w-5 h-5 sm:w-6 sm:h-6 mb-1 shrink-0" />
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-tight leading-tight">
                  Все предметы
                </span>
                <span className="mt-1 px-2 py-0.2 rounded-full bg-black/45 border border-white/20 text-[10px] sm:text-[11px] font-mono font-bold tabular-nums">
                  {categoryInstanceCounts.all} шт.
                </span>
              </button>
            </div>
          </section>

          {/* If player also owns pawnshop valuables ('valuables'), show a quick access banner so they are visible from hub too */}
          {categoryInstanceCounts.valuables > 0 && (
            <div className="max-w-2xl mx-auto">
              <button
                type="button"
                onClick={() => handleOpenCategoryList('valuables')}
                style={{
                  backgroundColor: 'var(--skin-bg-subcard)',
                  borderColor: 'var(--skin-border-base)'
                }}
                className="w-full p-3 rounded-xl border flex items-center justify-between gap-3 hover:border-[var(--skin-border-accent)] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg">💎</span>
                  <div className="text-left min-w-0">
                    <div className="text-xs font-bold text-[var(--skin-text-primary)] truncate">
                      Ценности ломбарда
                    </div>
                    <div className="text-[11px] text-[var(--skin-text-secondary)] truncate">
                      Трофеи для сдачи ростовщику за кредиты
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 font-mono text-xs font-bold">
                    {categoryInstanceCounts.valuables}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--skin-text-muted)]" />
                </div>
              </button>
            </div>
          )}

          {/* 5.5. SEPARATE BUTTON "КАТАЛОГ ПРЕДМЕТОВ" */}
          <section className="max-w-2xl mx-auto pt-1">
            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                setViewMode('catalog');
              }}
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-accent)',
                boxShadow: 'var(--skin-shadow-card)'
              }}
              className="skin-card w-full p-4 rounded-2xl border flex items-center justify-between gap-3 hover:bg-[var(--skin-bg-elevated)] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  style={{
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: 'var(--skin-border-accent)',
                    color: 'var(--skin-accent-primary)'
                  }}
                  className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
                >
                  <Tag className="w-5 h-5" />
                </div>
                <div className="text-left min-w-0">
                  <div className="text-sm sm:text-base font-bold text-[var(--skin-text-primary)] group-hover:text-[var(--skin-accent-secondary)] transition-colors truncate">
                    Каталог предметов
                  </div>
                  <div className="text-[11px] sm:text-xs text-[var(--skin-text-secondary)] truncate">
                    Полный справочник всех существующих предметов, редкостей и цен Города ({catalogList.length})
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--skin-accent-primary)] shrink-0">
                <span className="hidden sm:inline">Открыть</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          </section>
        </div>
      )}

      {/* =====================================================================
          LEVEL 2: OWNED ITEMS LIST SCREEN (ЭКРАН СПИСКА ПРЕДМЕТОВ)
         ===================================================================== */}
      {viewMode === 'list' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Top Navigation & Controls Bar (Section 6) */}
          <div
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-card)'
            }}
            className="skin-card p-3 sm:p-4 rounded-2xl border space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Left: Back to Main Inventory Hub + Category Title */}
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setViewMode('hub');
                  }}
                  style={{
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: 'var(--skin-border-base)',
                    color: 'var(--skin-text-primary)'
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold hover:border-[var(--skin-border-accent)] transition-colors cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
                  <span>Инвентарь</span>
                </button>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">
                      {activeCategory === 'all' ? '📦' : HUB_CATEGORIES_META[activeCategory].icon}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-[var(--skin-text-primary)] truncate">
                      {activeCategory === 'all'
                        ? 'Все предметы'
                        : HUB_CATEGORIES_META[activeCategory].title}
                    </h3>
                    <span className="px-2 py-0.2 rounded-full bg-black/50 border border-white/10 text-[11px] font-mono font-bold text-[var(--skin-text-secondary)] shrink-0">
                      {categoryInstanceCounts[activeCategory] || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Compact Search Button + Filter Button */}
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setIsSearchOpen(prev => {
                      if (prev) setSearchQuery('');
                      return !prev;
                    });
                  }}
                  style={{
                    backgroundColor:
                      isSearchOpen || searchQuery
                        ? 'var(--skin-bg-elevated)'
                        : 'var(--skin-bg-subcard)',
                    borderColor:
                      isSearchOpen || searchQuery
                        ? 'var(--skin-border-accent)'
                        : 'var(--skin-border-base)',
                    color: 'var(--skin-text-primary)'
                  }}
                  className="p-2 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Поиск по названию предмета"
                >
                  <Search className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
                  <span className="hidden sm:inline">Поиск</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setDraftFilter(appliedFilter);
                    setIsFilterModalOpen(true);
                  }}
                  style={{
                    backgroundColor:
                      activeFilterCriteriaCount > 0
                        ? 'var(--skin-bg-elevated)'
                        : 'var(--skin-bg-subcard)',
                    borderColor:
                      activeFilterCriteriaCount > 0
                        ? 'var(--skin-border-accent)'
                        : 'var(--skin-border-base)',
                    color: 'var(--skin-text-primary)'
                  }}
                  className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
                  <span>Фильтр</span>
                  {activeFilterCriteriaCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-zinc-950 text-[10px] font-mono font-black">
                      {activeFilterCriteriaCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Expandable Search Input (Section 8.1) */}
            {isSearchOpen && (
              <div className="relative pt-1 animate-in fade-in duration-150">
                <Search className="w-4 h-4 text-[var(--skin-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 mt-0.5" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Введите название предмета из вашего инвентаря..."
                  className="skin-input w-full border rounded-xl pl-9 pr-9 py-2 text-xs font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Applied filter summary chips (Section 8.2) */}
            {activeFilterCriteriaCount > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[var(--skin-border-subtle)] text-[11px]">
                <span className="text-[var(--skin-text-muted)] font-mono">Фильтры:</span>
                {activeCategory === 'all' && appliedFilter.category !== 'all' && (
                  <span className="px-2 py-0.5 rounded-lg bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-primary)] font-semibold">
                    Категория: {HUB_CATEGORIES_META[appliedFilter.category].shortTitle}
                  </span>
                )}
                {appliedFilter.rarity !== 'all' && (
                  <span className="px-2 py-0.5 rounded-lg bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-primary)] font-semibold">
                    Редкость: {RARITY_CONFIG[appliedFilter.rarity].label}
                  </span>
                )}
                {appliedFilter.equipStatus !== 'all' && (
                  <span className="px-2 py-0.5 rounded-lg bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-primary)] font-semibold">
                    {appliedFilter.equipStatus === 'equipped' ? 'Только экипированные' : 'Не экипированные'}
                  </span>
                )}
                {appliedFilter.sortBy !== 'recent' && (
                  <span className="px-2 py-0.5 rounded-lg bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-primary)] font-semibold">
                    Сортировка:{' '}
                    {appliedFilter.sortBy === 'oldest'
                      ? 'Сначала старые'
                      : appliedFilter.sortBy === 'name_asc'
                      ? 'По названию (А–Я)'
                      : appliedFilter.sortBy === 'quantity_desc'
                      ? 'По количеству'
                      : 'По редкости'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setAppliedFilter(DEFAULT_FILTER_STATE);
                  }}
                  className="text-rose-400 hover:text-rose-300 font-bold ml-auto cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Сбросить</span>
                </button>
              </div>
            )}
          </div>

          {/* List Content (Section 6.1, 6.2, 6.3) */}
          {filteredListStacks.length === 0 ? (
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-base)'
              }}
              className="skin-card p-8 rounded-2xl border border-dashed text-center space-y-3"
            >
              <Package className="w-10 h-10 text-[var(--skin-text-muted)] mx-auto" />
              <div className="text-sm font-bold text-[var(--skin-text-primary)]">
                {searchQuery || activeFilterCriteriaCount > 0
                  ? 'По заданным критериям предметов не найдено'
                  : activeCategory !== 'all'
                  ? HUB_CATEGORIES_META[activeCategory].emptyTitle
                  : 'Ваш инвентарь пока пуст'}
              </div>
              <p className="text-xs text-[var(--skin-text-secondary)] max-w-sm mx-auto leading-relaxed">
                {searchQuery || activeFilterCriteriaCount > 0
                  ? 'Попробуйте изменить поисковый запрос или сбросить установленные фильтры.'
                  : activeCategory !== 'all'
                  ? HUB_CATEGORIES_META[activeCategory].emptyDescription
                  : 'Вы можете приобрести сундуки, сертификаты и оформление в Магазине Города или получить их за участие в играх.'}
              </p>

              <div className="flex items-center justify-center gap-2.5 pt-2 flex-wrap">
                {searchQuery || activeFilterCriteriaCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playTick();
                      setSearchQuery('');
                      setAppliedFilter(DEFAULT_FILTER_STATE);
                    }}
                    className="skin-btn-secondary px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer"
                  >
                    Сбросить поиск и фильтры
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setViewMode('hub');
                  }}
                  style={{
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: 'var(--skin-border-base)',
                    color: 'var(--skin-text-primary)'
                  }}
                  className="px-4 py-2 rounded-xl border text-xs font-bold hover:border-[var(--skin-border-accent)] transition-colors cursor-pointer"
                >
                  ← Назад в инвентарь
                </button>

                {onOpenShop && activeCategory !== 'gifts' && (
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playTick();
                      if (onCloseProfile) onCloseProfile();
                      onOpenShop();
                    }}
                    style={{
                      background: 'var(--skin-btn-primary-bg)',
                      color: 'var(--skin-btn-primary-text)'
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all hover:brightness-110 cursor-pointer flex items-center gap-1.5"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Открыть Магазин</span>
                  </button>
                )}
              </div>
            </div>
          ) : activeCategory === 'all' && appliedFilter.category === 'all' ? (
            /* Grouped by category on "Все предметы" (Section 6.3), hiding empty groups */
            <div className="space-y-5">
              {ALL_CATEGORY_GROUP_ORDER.map(catId => {
                const groupItems = filteredListStacks.filter(s => s.uiCategory === catId);
                if (groupItems.length === 0) return null;
                const meta = HUB_CATEGORIES_META[catId];
                const groupInstanceSum = groupItems.reduce((sum, s) => sum + s.quantity, 0);

                return (
                  <section key={catId} className="space-y-2.5">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{meta.icon}</span>
                        <h4 className="text-xs sm:text-sm font-bold text-[var(--skin-text-primary)] uppercase tracking-wider">
                          {meta.title}
                        </h4>
                        <span className="px-2 py-0.2 rounded-full bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[10px] font-mono font-bold text-[var(--skin-text-secondary)]">
                          {groupInstanceSum} шт.
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenCategoryList(catId)}
                        className="text-[11px] font-bold text-[var(--skin-accent-primary)] hover:underline cursor-pointer"
                      >
                        Только эта категория →
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
                      {groupItems.map(stack => renderCompactInventoryCard(stack))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            /* Single Category List with progressive rendering for large inventories */
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
                {filteredListStacks.slice(0, visibleLimit).map(stack => renderCompactInventoryCard(stack))}
              </div>

              {filteredListStacks.length > visibleLimit && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit(prev => prev + 48)}
                    className="skin-btn-secondary px-5 py-2 rounded-xl border text-xs font-bold cursor-pointer"
                  >
                    Показать ещё ({filteredListStacks.length - visibleLimit})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          LEVEL 2: STANDALONE CATALOG SCREEN (ЭКРАН КАТАЛОГА ПРЕДМЕТОВ - 5.5)
         ===================================================================== */}
      {viewMode === 'catalog' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Top Bar with Back to Main Inventory Hub */}
          <div
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-card)'
            }}
            className="skin-card p-3 sm:p-4 rounded-2xl border space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setViewMode('hub');
                  }}
                  style={{
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: 'var(--skin-border-base)',
                    color: 'var(--skin-text-primary)'
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold hover:border-[var(--skin-border-accent)] transition-colors cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
                  <span>Инвентарь</span>
                </button>

                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-[var(--skin-text-primary)] truncate">
                    Каталог предметов ({catalogList.length})
                  </h3>
                  <p className="text-[11px] text-[var(--skin-text-secondary)] truncate">
                    Справочник всех предметов Mafia Club (отдельно от вашего личного инвентаря)
                  </p>
                </div>
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 text-[var(--skin-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)}
                  placeholder="Поиск в каталоге..."
                  className="skin-input w-full border rounded-xl pl-8 pr-3 py-1.5 text-xs"
                />
              </div>
            </div>

            {/* Category filter tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setCatalogCategory('all')}
                style={
                  catalogCategory === 'all'
                    ? {
                        background: 'var(--skin-btn-primary-bg)',
                        color: 'var(--skin-btn-primary-text)'
                      }
                    : {
                        backgroundColor: 'var(--skin-bg-subcard)',
                        borderColor: 'var(--skin-border-base)',
                        color: 'var(--skin-text-secondary)'
                      }
                }
                className="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors shrink-0 cursor-pointer"
              >
                Все ({catalogList.length})
              </button>
              {Object.entries(CATEGORY_CONFIG).map(([k, c]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCatalogCategory(k as ItemCategory)}
                  style={
                    catalogCategory === k
                      ? {
                          background: 'var(--skin-btn-primary-bg)',
                          color: 'var(--skin-btn-primary-text)'
                        }
                      : {
                          backgroundColor: 'var(--skin-bg-subcard)',
                          borderColor: 'var(--skin-border-base)',
                          color: 'var(--skin-text-secondary)'
                        }
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs border flex items-center gap-1 transition-colors shrink-0 cursor-pointer ${
                    catalogCategory === k ? 'font-bold' : 'font-medium'
                  }`}
                >
                  <span>{c.icon}</span>
                  <span>{c.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Catalog Items Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredCatalog.map(item => {
              const rarity = RARITY_CONFIG[item.rarity] || RARITY_CONFIG.common;
              const ownedQty = groupedStacks
                .filter(s => s.itemDef.id === item.id)
                .reduce((sum, s) => sum + s.quantity, 0);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    sounds.playTick();
                    setSelectedCatalogItem(item);
                  }}
                  style={
                    item.rarity === 'common'
                      ? {
                          backgroundColor: 'var(--skin-bg-card)',
                          borderColor: 'var(--skin-border-card)'
                        }
                      : undefined
                  }
                  className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all hover:scale-[1.01] ${rarity.bg} ${rarity.border}`}
                >
                  <div className="text-3xl p-2 rounded-xl bg-black/40 border border-white/10 shrink-0">
                    {item.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-[10px] uppercase font-mono font-bold ${rarity.color}`}>
                        {rarity.label}
                      </span>
                      {ownedQty > 0 && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 text-[9px] font-bold">
                          В инвентаре: {ownedQty} шт.
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-[var(--skin-text-primary)] tracking-tight truncate mt-0.5">
                      {item.name}
                    </h4>
                    <p className="text-[11px] text-[var(--skin-text-secondary)] line-clamp-2 mt-0.5 leading-tight">
                      {item.description}
                    </p>

                    <div className="flex items-center gap-3 mt-2 text-[10px] font-mono">
                      <span className="text-amber-400 font-bold">Магазин: {item.cost} кр</span>
                      {item.pawnValue ? (
                        <span className="text-[var(--skin-text-muted)]">Ломбард: {item.pawnValue} кр</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          FILTER MODAL (ОКНО ФИЛЬТРОВ - SECTION 8.2)
         ===================================================================== */}
      {isFilterModalOpen && (
        <div
          style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
          className="fixed inset-0 z-60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            style={{
              backgroundColor: 'var(--skin-bg-modal)',
              borderColor: 'var(--skin-border-card)',
              boxShadow: 'var(--skin-shadow-modal)'
            }}
            className="skin-modal w-full max-w-md border rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[var(--skin-border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[var(--skin-accent-primary)]" />
                <h4 className="text-sm font-bold text-[var(--skin-text-primary)]">
                  Фильтр и сортировка предметов
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="skin-btn-secondary p-1 rounded-lg border cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* 1. Category Filter (when viewing 'All Items') */}
              {activeCategory === 'all' && (
                <div className="space-y-1.5">
                  <label className="font-bold text-[var(--skin-text-secondary)] uppercase tracking-wider block text-[11px]">
                    Категория:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'all', label: 'Все категории' },
                        { id: 'chests', label: '🧰 Сундуки' },
                        { id: 'certificates', label: '📜 Сертификаты' },
                        { id: 'cosmetics', label: '✨ Оформление' },
                        { id: 'gifts', label: '🎀 Подарки' },
                        { id: 'valuables', label: '💎 Ценности' }
                      ] as const
                    ).map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDraftFilter(prev => ({ ...prev, category: opt.id }))}
                        style={
                          draftFilter.category === opt.id
                            ? {
                                background: 'var(--skin-btn-primary-bg)',
                                color: 'var(--skin-btn-primary-text)'
                              }
                            : {
                                backgroundColor: 'var(--skin-bg-subcard)',
                                borderColor: 'var(--skin-border-base)',
                                color: 'var(--skin-text-secondary)'
                              }
                        }
                        className="px-2.5 py-2 rounded-xl border font-bold text-[11px] truncate cursor-pointer"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Rarity Filter */}
              <div className="space-y-1.5">
                <label className="font-bold text-[var(--skin-text-secondary)] uppercase tracking-wider block text-[11px]">
                  Редкость:
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'Любая' },
                      { id: 'common', label: 'Обычный' },
                      { id: 'rare', label: 'Редкий' },
                      { id: 'epic', label: 'Эпический' },
                      { id: 'legendary', label: 'Легендарный' }
                    ] as const
                  ).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDraftFilter(prev => ({ ...prev, rarity: opt.id }))}
                      style={
                        draftFilter.rarity === opt.id
                          ? {
                              background: 'var(--skin-btn-primary-bg)',
                              color: 'var(--skin-btn-primary-text)'
                            }
                          : {
                              backgroundColor: 'var(--skin-bg-subcard)',
                              borderColor: 'var(--skin-border-base)',
                              color: 'var(--skin-text-secondary)'
                            }
                      }
                      className="px-2 py-2 rounded-xl border font-bold text-[11px] truncate cursor-pointer"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Equipped Status Filter */}
              <div className="space-y-1.5">
                <label className="font-bold text-[var(--skin-text-secondary)] uppercase tracking-wider block text-[11px]">
                  Статус экипировки:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'Все' },
                      { id: 'equipped', label: 'Экипировано' },
                      { id: 'unequipped', label: 'Не экипировано' }
                    ] as const
                  ).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDraftFilter(prev => ({ ...prev, equipStatus: opt.id }))}
                      style={
                        draftFilter.equipStatus === opt.id
                          ? {
                              background: 'var(--skin-btn-primary-bg)',
                              color: 'var(--skin-btn-primary-text)'
                            }
                          : {
                              backgroundColor: 'var(--skin-bg-subcard)',
                              borderColor: 'var(--skin-border-base)',
                              color: 'var(--skin-text-secondary)'
                            }
                      }
                      className="px-2.5 py-2 rounded-xl border font-bold text-[11px] truncate cursor-pointer"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Sort By */}
              <div className="space-y-1.5">
                <label className="font-bold text-[var(--skin-text-secondary)] uppercase tracking-wider block text-[11px]">
                  Сортировка:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'recent', label: 'Сначала недавно полученные' },
                      { id: 'oldest', label: 'Сначала давние' },
                      { id: 'name_asc', label: 'По названию (А–Я)' },
                      { id: 'quantity_desc', label: 'По количеству' },
                      { id: 'rarity_desc', label: 'По редкости' }
                    ] as const
                  ).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDraftFilter(prev => ({ ...prev, sortBy: opt.id }))}
                      style={
                        draftFilter.sortBy === opt.id
                          ? {
                              background: 'var(--skin-btn-primary-bg)',
                              color: 'var(--skin-btn-primary-text)'
                            }
                          : {
                              backgroundColor: 'var(--skin-bg-subcard)',
                              borderColor: 'var(--skin-border-base)',
                              color: 'var(--skin-text-secondary)'
                            }
                      }
                      className="px-3 py-2 rounded-xl border font-bold text-[11px] text-left truncate cursor-pointer"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mandatory Filter Action Buttons: "Сбросить фильтр" & "Применить" */}
            <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-[var(--skin-border-subtle)]">
              <button
                type="button"
                onClick={() => {
                  sounds.playTick();
                  setDraftFilter(DEFAULT_FILTER_STATE);
                  setAppliedFilter(DEFAULT_FILTER_STATE);
                  setIsFilterModalOpen(false);
                }}
                className="skin-btn-secondary flex-1 py-2.5 rounded-xl border text-xs font-bold cursor-pointer"
              >
                Сбросить фильтр
              </button>
              <button
                type="button"
                onClick={() => {
                  sounds.playTick();
                  setAppliedFilter(draftFilter);
                  setIsFilterModalOpen(false);
                }}
                style={{
                  background: 'var(--skin-btn-primary-bg)',
                  color: 'var(--skin-btn-primary-text)'
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold shadow-md hover:brightness-110 transition-all cursor-pointer"
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DETAILED OWNED ITEM MODAL (ПОДРОБНОЕ ОКНО ПРЕДМЕТА - SECTION 9)
         ===================================================================== */}
      {(activeDetailStack || selectedEquippedFallback) && (() => {
        const stack = activeDetailStack;
        const fallback = selectedEquippedFallback;
        const itemDef: ItemDefinition = stack
          ? stack.itemDef
          : {
              id: fallback!.itemId,
              name: fallback!.name,
              description: fallback!.description,
              category: 'cosmetics',
              rarity: fallback!.rarity,
              cost: 0,
              icon: fallback!.icon,
              usable: true,
              consumable: false,
              cosmeticType: fallback!.slotType
            };

        const stackSnapshot = stack?.stackSnapshot || null;
        const isChest = Boolean(stack?.isLootbox || itemDef.category === 'chests');
        const rarity = RARITY_CONFIG[itemDef.rarity] || RARITY_CONFIG.common;
        const equipped = stack ? isItemEquipped(itemDef) : true;
        const quantity = stack ? stack.quantity : 1;
        const displayName = stackSnapshot?.name || itemDef.name;
        const displayDesc = stackSnapshot?.description || itemDef.description;
        const customPreviewSrc = getCustomPreviewSrc(itemDef);

        const effectivePawnValue =
          typeof stackSnapshot?.pawnValue === 'number'
            ? stackSnapshot.pawnValue
            : itemDef.pawnValue;

        const snapshotRewards = stackSnapshot?.rewards || [];
        const totalWeight = snapshotRewards.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);

        const isEquippableCosmetic =
          itemDef.category === 'cosmetics' ||
          itemDef.cosmeticType === 'card_back' ||
          itemDef.cosmeticType === 'title' ||
          itemDef.cosmeticType === 'ui_skin' ||
          itemDef.id.startsWith('skin_');

        return (
          <div
            style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
            className="fixed inset-0 z-60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div
              style={{
                backgroundColor: 'var(--skin-bg-modal)',
                borderColor: 'var(--skin-border-card)',
                boxShadow: 'var(--skin-shadow-modal)'
              }}
              className="skin-modal w-full max-w-md max-h-[90dvh] border rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-4 overflow-y-auto"
            >
              {/* Top Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* 1. Large Item Image / Icon */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-black/50 border border-white/15 flex items-center justify-center text-4xl sm:text-5xl shrink-0 overflow-hidden shadow-inner">
                    {customPreviewSrc ? (
                      <img
                        src={customPreviewSrc}
                        alt={displayName}
                        className="w-full h-full object-contain p-1.5"
                      />
                    ) : (
                      <span>{itemDef.icon}</span>
                    )}
                  </div>

                  {/* 2, 4, 5, 6. Name, Rarity, Quantity, Equipped Status */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] uppercase font-mono font-bold ${rarity.color}`}>
                        {rarity.label}
                      </span>
                      <span className="px-2 py-0.2 rounded-full bg-black/60 border border-white/10 text-zinc-200 text-[10px] font-mono font-bold">
                        Количество: {quantity} шт.
                      </span>
                      {isChest && stackSnapshot && (
                        <span className="px-1.5 py-0.2 rounded bg-orange-950/80 border border-orange-500/40 text-orange-300 text-[9px] font-mono font-bold">
                          Снимок v{stackSnapshot.version}
                        </span>
                      )}
                    </div>

                    <h4 className="text-base sm:text-lg font-bold text-[var(--skin-text-primary)] leading-snug break-words">
                      {displayName}
                    </h4>

                    {isEquippableCosmetic && (
                      <div>
                        {equipped ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-600/70 text-emerald-300 text-[10px] font-bold">
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Статус: Экипировано</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/40 border border-[var(--skin-border-base)] text-[var(--skin-text-secondary)] text-[10px] font-mono">
                            Статус: В инвентаре (не экипировано)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedStackKey(null);
                    setSelectedEquippedFallback(null);
                  }}
                  className="skin-btn-secondary p-1.5 rounded-xl border cursor-pointer shrink-0"
                  title="Закрыть подробности"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 3. Description & Effect / Lootbox Snapshot Drop Table */}
              <div className="space-y-3">
                <p className="skin-subcard text-xs text-[var(--skin-text-secondary)] leading-relaxed p-3 rounded-xl border">
                  {displayDesc}
                </p>

                {itemDef.effectDescription && (
                  <div className="text-[11px] text-amber-300 bg-amber-950/30 p-2.5 rounded-xl border border-amber-800/50 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{itemDef.effectDescription}</span>
                  </div>
                )}

                {isChest && stackSnapshot && snapshotRewards.length > 0 && (
                  <div className="p-3 rounded-xl bg-black/45 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                      <span>Возможные награды (снимок v{stackSnapshot.version}):</span>
                      {stackSnapshot.consolationPrize?.enabled && (
                        <span className="text-emerald-400 font-bold">✓ Гарантия</span>
                      )}
                    </div>
                    <div className="max-h-36 overflow-y-auto pr-1 space-y-1">
                      {snapshotRewards.map((r, rIdx) => {
                        const probPercent =
                          stackSnapshot.dropMode === 'independent'
                            ? Math.min(100, Math.max(0, Number(r.chancePercent) || 0))
                            : totalWeight > 0
                            ? ((Number(r.weight) || 0) / totalWeight) * 100
                            : 0;

                        const minQ = Math.max(1, Number(r.minQty) || 1);
                        const maxQ =
                          r.maxQty !== undefined && r.maxQty !== null
                            ? Math.max(minQ, Number(r.maxQty))
                            : minQ;
                        const qtyStr = minQ === maxQ ? `${minQ}` : `${minQ}–${maxQ}`;

                        let rewardLabel = '';
                        let rewardIcon = '🎁';
                        if (r.type === 'credits') {
                          rewardIcon = '💰';
                          rewardLabel = `${qtyStr} кр.`;
                        } else if (r.type === 'xp') {
                          rewardIcon = '⭐';
                          rewardLabel = `${qtyStr} XP`;
                        } else if ((r.type === 'item' || r.type === 'lootbox') && r.itemId) {
                          const targetDef = getItemDefinition(r.itemId);
                          const delMeta = deletedReplacements[r.itemId];
                          if (targetDef && !delMeta) {
                            rewardIcon = targetDef.icon;
                            rewardLabel = `${targetDef.name}${maxQ > 1 ? ` ×${qtyStr}` : ''}`;
                          } else if (delMeta) {
                            rewardIcon = '💰';
                            rewardLabel = `${
                              r.itemNameSnapshot || delMeta.deletedItemName || r.itemId
                            } (замена)`;
                          } else {
                            rewardIcon = r.type === 'lootbox' ? '🧰' : '📦';
                            rewardLabel = `${r.itemNameSnapshot || r.itemId}${
                              maxQ > 1 ? ` ×${qtyStr}` : ''
                            }`;
                          }
                        }

                        return (
                          <div
                            key={r.id || rIdx}
                            className="flex items-center justify-between gap-2 text-[11px] py-0.5 border-b border-white/5 last:border-0"
                          >
                            <span className="text-zinc-200 truncate flex items-center gap-1.5">
                              <span>{rewardIcon}</span>
                              <span className="truncate">{rewardLabel}</span>
                            </span>
                            <span className="font-mono font-bold text-amber-300 shrink-0">
                              {probPercent.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 7. Valid Item Actions (Section 9) */}
              <div className="space-y-2 pt-2 border-t border-[var(--skin-border-subtle)]">
                {itemDef.id === ROLE_SELECT_CARD_ID ? (
                  <div className="w-full py-2.5 px-3 rounded-xl bg-amber-950/70 border border-amber-600/60 text-amber-300 text-xs font-semibold text-center">
                    🎴 Активируется в лобби комнаты перед началом партии
                  </div>
                ) : itemDef.id === NICKNAME_CHANGE_CERTIFICATE_ID ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => {
                      setSelectedStackKey(null);
                      onUseItem(itemDef.id);
                    }}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <span>Использовать (Сменить никнейм)</span>
                  </button>
                ) : itemDef.id === AVATAR_CHANGE_CERTIFICATE_ID ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => {
                      setSelectedStackKey(null);
                      onUseItem(itemDef.id);
                    }}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <span>Использовать (Сменить аватар)</span>
                  </button>
                ) : isChest && stack ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => {
                      sounds.playTick();
                      setSelectedStackKey(null);
                      onOpenLootbox(stack.invItem, itemDef);
                    }}
                    style={{
                      background: 'var(--skin-btn-primary-bg)',
                      color: 'var(--skin-btn-primary-text)'
                    }}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all hover:brightness-110 flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <Gift className="w-4 h-4" />
                    <span>Открыть сундук</span>
                  </button>
                ) : fallback?.isMasteryBadgeTitle && onUnequipMasteryTitle ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={async () => {
                      await onUnequipMasteryTitle();
                      setSelectedEquippedFallback(null);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-950/70 hover:bg-rose-900/70 border border-rose-700 text-rose-200 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    <span>Снять титул</span>
                  </button>
                ) : isEquippableCosmetic ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={async () => {
                      await onUseItem(itemDef.id);
                      if (fallback) {
                        setSelectedEquippedFallback(null);
                      }
                    }}
                    style={
                      !equipped
                        ? {
                            background: 'var(--skin-btn-primary-bg)',
                            color: 'var(--skin-btn-primary-text)'
                          }
                        : undefined
                    }
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      equipped
                        ? 'bg-rose-950/70 hover:bg-rose-900/70 border border-rose-700/80 text-rose-200'
                        : 'shadow-md hover:brightness-110'
                    }`}
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : equipped ? (
                      <>
                        <X className="w-4 h-4" />
                        <span>Снять экипировку</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Экипировать</span>
                      </>
                    )}
                  </button>
                ) : null}

                {/* Pawnshop Action (only if owned in inventory and has pawnValue > 0) */}
                {stack && effectivePawnValue && effectivePawnValue > 0 ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => onPawnItem(itemDef.id, stack.invItem.id)}
                    className="skin-btn-secondary w-full py-2.5 px-4 rounded-xl border text-amber-300 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Scale className="w-4 h-4 text-amber-400" />
                        <span>Сдать в ломбард (+{effectivePawnValue} кр за 1 шт.)</span>
                      </>
                    )}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedStackKey(null);
                    setSelectedEquippedFallback(null);
                  }}
                  className="skin-btn-secondary w-full py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer"
                >
                  Вернуться к списку
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =====================================================================
          CATALOG ITEM PREVIEW MODAL
         ===================================================================== */}
      {selectedCatalogItem && (
        <div
          style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
          className="fixed inset-0 z-60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-150"
        >
          <div
            style={{
              backgroundColor: 'var(--skin-bg-modal)',
              borderColor: 'var(--skin-border-card)',
              boxShadow: 'var(--skin-shadow-modal)'
            }}
            className="skin-modal w-full max-w-sm border rounded-3xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="text-3xl p-2.5 rounded-2xl bg-black/50 border border-white/10">
                  {selectedCatalogItem.icon}
                </div>
                <div>
                  <span
                    className={`text-[10px] uppercase font-mono font-bold ${
                      RARITY_CONFIG[selectedCatalogItem.rarity].color
                    }`}
                  >
                    {RARITY_CONFIG[selectedCatalogItem.rarity].label}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--skin-text-primary)]">
                    {selectedCatalogItem.name}
                  </h4>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCatalogItem(null)}
                className="skin-btn-secondary p-1 rounded-lg border cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="skin-subcard text-xs text-[var(--skin-text-secondary)] leading-relaxed p-3 rounded-xl border">
              {selectedCatalogItem.description}
            </p>
            {selectedCatalogItem.effectDescription && (
              <div className="text-[11px] text-amber-300 bg-amber-950/30 p-2.5 rounded-xl border border-amber-800/50 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{selectedCatalogItem.effectDescription}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs font-mono pt-1">
              <span className="text-amber-400 font-bold">
                Цена в магазине: {selectedCatalogItem.cost} кр
              </span>
              {selectedCatalogItem.pawnValue ? (
                <span className="text-[var(--skin-text-secondary)]">
                  Ломбард: {selectedCatalogItem.pawnValue} кр
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setSelectedCatalogItem(null)}
              className="skin-btn-secondary w-full py-2 rounded-xl border font-bold text-xs transition-colors cursor-pointer"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
