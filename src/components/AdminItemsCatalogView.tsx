import React, { useState, useMemo } from 'react';
import {
  Package,
  Search,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  SlidersHorizontal,
  ArrowUpDown,
  ShieldCheck,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Lock,
  Info,
  RefreshCw,
  ShoppingCart
} from 'lucide-react';
import {
  ItemDefinition,
  ItemCategory,
  ItemRarity,
  RARITY_CONFIG,
  CATEGORY_CONFIG,
  syncItemsCatalog
} from '../data/items';
import { sounds } from '../utils/audio';

interface AdminItemsCatalogViewProps {
  items: ItemDefinition[];
  onItemsChange: (updatedItems: ItemDefinition[]) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onRefreshAudit?: () => void;
}

type VisibilityFilter = 'all' | 'visible' | 'hidden';
type SortOption =
  | 'default'
  | 'name_asc'
  | 'name_desc'
  | 'id_asc'
  | 'rarity_desc'
  | 'rarity_asc'
  | 'hidden_first'
  | 'visible_first';

const RARITY_WEIGHT: Record<ItemRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4
};

export const AdminItemsCatalogView: React.FC<AdminItemsCatalogViewProps> = ({
  items,
  onItemsChange,
  onNotify,
  onRefreshAudit
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<ItemCategory | 'all'>('all');
  const [rarityFilter, setRarityFilter] = useState<ItemRarity | 'all'>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('mafia_auth_token');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
  };

  // Counters across the entire catalog
  const catalogStats = useMemo(() => {
    const total = items.length;
    const hidden = items.filter(i => Boolean(i.adminHidden)).length;
    const visible = total - hidden;
    const chestsCount = items.filter(i => i.category === 'chests').length;
    return { total, visible, hidden, chestsCount };
  }, [items]);

  // Filtered & sorted items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = items.filter(item => {
      if (q) {
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesId = item.id.toLowerCase().includes(q);
        const matchesDesc = (item.description || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesDesc) return false;
      }

      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }

      if (rarityFilter !== 'all' && item.rarity !== rarityFilter) {
        return false;
      }

      const isHidden = Boolean(item.adminHidden);
      if (visibilityFilter === 'visible' && isHidden) return false;
      if (visibilityFilter === 'hidden' && !isHidden) return false;

      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name, 'ru');
        case 'name_desc':
          return b.name.localeCompare(a.name, 'ru');
        case 'id_asc':
          return a.id.localeCompare(b.id);
        case 'rarity_desc':
          return (RARITY_WEIGHT[b.rarity] || 0) - (RARITY_WEIGHT[a.rarity] || 0) || a.name.localeCompare(b.name, 'ru');
        case 'rarity_asc':
          return (RARITY_WEIGHT[a.rarity] || 0) - (RARITY_WEIGHT[b.rarity] || 0) || a.name.localeCompare(b.name, 'ru');
        case 'hidden_first':
          return Number(Boolean(b.adminHidden)) - Number(Boolean(a.adminHidden)) || a.name.localeCompare(b.name, 'ru');
        case 'visible_first':
          return Number(Boolean(a.adminHidden)) - Number(Boolean(b.adminHidden)) || a.name.localeCompare(b.name, 'ru');
        default:
          return 0;
      }
    });

    return sorted;
  }, [items, searchQuery, categoryFilter, rarityFilter, visibilityFilter, sortBy]);

  // Pagination calculation
  const totalPages = useMemo(() => {
    if (pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(filteredItems.length / pageSize));
  }, [filteredItems.length, pageSize]);

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    if (pageSize <= 0) return filteredItems;
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safeCurrentPage, pageSize]);

  // Refresh catalog from server
  const handleRefreshCatalog = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/items/catalog', {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки каталога');
      if (Array.isArray(data.items)) {
        onItemsChange(data.items);
        syncItemsCatalog(data.items);
      }
      sounds.playTick();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось обновить каталог предметов';
      onNotify('error', msg);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Safe non-destructive restoration of missing initial items
  const handleRestoreMissingItems = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/items/restore-missing', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка восстановления каталога');
      if (Array.isArray(data.items)) {
        onItemsChange(data.items);
        syncItemsCatalog(data.items);
      }
      sounds.playTick();
      onNotify('success', data.message);
      onRefreshAudit?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка восстановления предметов';
      onNotify('error', msg);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Single item visibility toggle ("Скрыть" checkbox)
  const handleToggleItemHidden = async (item: ItemDefinition, nextHidden: boolean) => {
    setUpdatingIds(prev => new Set(prev).add(item.id));
    try {
      const res = await fetch('/api/admin/items/visibility', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: item.id, adminHidden: nextHidden })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения статуса скрытия');

      sounds.playTick();
      if (Array.isArray(data.items)) {
        onItemsChange(data.items);
        syncItemsCatalog(data.items);
      } else if (data.item) {
        const nextList = items.map(i => (i.id === item.id ? data.item : i));
        onItemsChange(nextList);
        syncItemsCatalog(nextList);
      }
      onNotify('success', data.message);
      onRefreshAudit?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка изменения видимости предмета';
      onNotify('error', msg);
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Bulk visibility update ("Скрыть выбранные" / "Показать выбранные")
  const handleBulkSetVisibility = async (adminHidden: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsBulkUpdating(true);
    try {
      const res = await fetch('/api/admin/items/visibility/bulk', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ids, adminHidden })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка массового обновления');

      sounds.playTick();
      if (Array.isArray(data.items)) {
        onItemsChange(data.items);
        syncItemsCatalog(data.items);
      }
      setSelectedIds(new Set());
      onNotify('success', data.message);
      onRefreshAudit?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка массового изменения видимости';
      onNotify('error', msg);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Selection helpers
  const toggleSelectOne = (id: string) => {
    sounds.playTick();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every(item => selectedIds.has(item.id));

  const toggleSelectAllFiltered = () => {
    sounds.playTick();
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredItems.forEach(item => next.delete(item.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredItems.forEach(item => next.add(item.id));
        return next;
      });
    }
  };

  const resetFilters = () => {
    sounds.playTick();
    setSearchQuery('');
    setCategoryFilter('all');
    setRarityFilter('all');
    setVisibilityFilter('all');
    setSortBy('default');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0 overflow-y-auto pr-1">
      {/* Header & Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 px-1">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-400" />
            <span>Единый каталог внутриигровых предметов ({catalogStats.total})</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Реестр всех внутриигровых предметов и сундуков с управлением их видимостью в административных списках выбора
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {catalogStats.total < 17 && (
            <button
              type="button"
              onClick={handleRestoreMissingItems}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white border border-amber-400 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="Безопасно добавить недостающие предметы из 17 базовых без перезаписи существующих записей"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Восстановить недостающие ({17 - catalogStats.total})</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleRefreshCatalog}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            <span>Обновить каталог</span>
          </button>
        </div>
      </div>

      {/* Summary Counters: Total, Visible, Hidden, Lootboxes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            setVisibilityFilter('all');
            setCurrentPage(1);
          }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            visibilityFilter === 'all'
              ? 'bg-[#171826] border-amber-500/70 shadow-sm'
              : 'bg-[#13141d] border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-zinc-400">Всего в каталоге</span>
            <Package className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white font-mono mt-1">{catalogStats.total}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Единый реестр БД (вкл. {catalogStats.chestsCount} сундук.)</div>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            setVisibilityFilter('visible');
            setCurrentPage(1);
          }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            visibilityFilter === 'visible'
              ? 'bg-emerald-950/30 border-emerald-500/80 shadow-sm'
              : 'bg-[#13141d] border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-emerald-300">Видимые в списках</span>
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 font-mono mt-1">{catalogStats.visible}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Доступны при настройке наград и выдаче</div>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            setVisibilityFilter('hidden');
            setCurrentPage(1);
          }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            visibilityFilter === 'hidden'
              ? 'bg-rose-950/30 border-rose-500/80 shadow-sm'
              : 'bg-[#13141d] border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-rose-300">Скрытые в списках</span>
            <EyeOff className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-rose-400 font-mono mt-1">{catalogStats.hidden}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Скрыты из списков выбора админ-панели</div>
        </button>

        <div className="p-3 rounded-xl bg-[#13141d] border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-zinc-400">Защита каталога</span>
            <Lock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xs font-bold text-zinc-200 mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Удаление отключено</span>
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            Скрытие не влияет на магазин и инвентари
          </div>
        </div>
      </div>

      {/* Architecture & Non-Destructive Visibility Notice */}
      <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40 flex items-start gap-2.5 text-xs text-zinc-300 shrink-0">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold text-amber-300">Как работает флаг «Скрыть»:</span> отмеченные предметы скрываются только из выпадающих списков выбора в других разделах админ-панели (задания, ивенты, ежедневные бонусы, ручная выдача, выбор из каталога). Сам предмет остаётся в этом каталоге, сохраняет все свойства, продолжает работать в магазине, ломбарде, инвентарях игроков и уже настроенных наградах.
        </div>
      </div>

      {/* Search, Filters & Sorting Toolbar */}
      <div className="p-3.5 rounded-xl bg-[#13141d] border border-zinc-800 space-y-3 shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          {/* Search by Name or ID */}
          <div className="sm:col-span-5 relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Поиск по названию предмета или уникальному ID..."
              className="w-full pl-9 pr-3 py-2 bg-[#0e0f16] border border-zinc-700/80 rounded-xl text-xs text-white placeholder:text-zinc-400 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Category Filter */}
          <div className="sm:col-span-3">
            <select
              value={categoryFilter}
              onChange={e => {
                sounds.playTick();
                setCategoryFilter(e.target.value as ItemCategory | 'all');
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-[#0e0f16] border border-zinc-700/80 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">Все категории ({items.length})</option>
              {(Object.keys(CATEGORY_CONFIG) as ItemCategory[]).map(cat => (
                <option key={cat} value={cat}>
                  {CATEGORY_CONFIG[cat].icon} {CATEGORY_CONFIG[cat].label}
                </option>
              ))}
            </select>
          </div>

          {/* Rarity Filter */}
          <div className="sm:col-span-2">
            <select
              value={rarityFilter}
              onChange={e => {
                sounds.playTick();
                setRarityFilter(e.target.value as ItemRarity | 'all');
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-[#0e0f16] border border-zinc-700/80 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">Любая редкость</option>
              {(Object.keys(RARITY_CONFIG) as ItemRarity[]).map(rarity => (
                <option key={rarity} value={rarity}>
                  {RARITY_CONFIG[rarity].label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Selector */}
          <div className="sm:col-span-2">
            <div className="relative">
              <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={sortBy}
                onChange={e => {
                  sounds.playTick();
                  setSortBy(e.target.value as SortOption);
                  setCurrentPage(1);
                }}
                className="w-full pl-8 pr-2 py-2 bg-[#0e0f16] border border-zinc-700/80 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="default">По умолчанию</option>
                <option value="name_asc">Имя (А → Я)</option>
                <option value="name_desc">Имя (Я → А)</option>
                <option value="id_asc">ID (A → Z)</option>
                <option value="rarity_desc">Редкость (убыв.)</option>
                <option value="rarity_asc">Редкость (возр.)</option>
                <option value="hidden_first">Сначала скрытые</option>
                <option value="visible_first">Сначала видимые</option>
              </select>
            </div>
          </div>
        </div>

        {/* Second Filter Row: Visibility status chips & Bulk Selection Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono uppercase text-zinc-400 mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3 text-amber-400" />
              <span>Статус в списках:</span>
            </span>
            {[
              { id: 'all' as VisibilityFilter, label: `Все (${catalogStats.total})` },
              { id: 'visible' as VisibilityFilter, label: `Только видимые (${catalogStats.visible})` },
              { id: 'hidden' as VisibilityFilter, label: `Только скрытые (${catalogStats.hidden})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  sounds.playTick();
                  setVisibilityFilter(tab.id);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                  visibilityFilter === tab.id
                    ? 'bg-amber-600 text-white border-amber-500'
                    : 'bg-[#0e0f16] text-zinc-400 hover:text-white border-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {(searchQuery || categoryFilter !== 'all' || rarityFilter !== 'all' || visibilityFilter !== 'all' || sortBy !== 'default') && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-950/40 border border-amber-800/50 cursor-pointer"
              >
                Сбросить фильтры
              </button>
            )}
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="text-[11px] font-mono">На странице:</span>
            {[10, 20, 50, 0].map(size => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  sounds.playTick();
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border cursor-pointer ${
                  pageSize === size
                    ? 'bg-zinc-200 text-zinc-900 border-white'
                    : 'bg-[#0e0f16] text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                {size === 0 ? 'Все' : size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk Operations Bar */}
      <div className="p-3 rounded-xl bg-[#141522] border border-zinc-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={toggleSelectAllFiltered}
            disabled={filteredItems.length === 0}
            className="px-2.5 py-1.5 rounded-lg bg-[#0e0f16] hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 flex items-center gap-2 transition-colors disabled:opacity-40 cursor-pointer"
          >
            {allFilteredSelected ? (
              <CheckSquare className="w-4 h-4 text-amber-400" />
            ) : (
              <Square className="w-4 h-4 text-zinc-400" />
            )}
            <span>
              {allFilteredSelected
                ? `Снять выделение (${filteredItems.length})`
                : `Выбрать все в выборке (${filteredItems.length})`}
            </span>
          </button>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-amber-950/70 border border-amber-700/70 text-amber-300 text-xs font-mono font-bold">
                Выбрано: {selectedIds.size}
              </span>
              <button
                type="button"
                onClick={() => {
                  sounds.playTick();
                  setSelectedIds(new Set());
                }}
                className="text-xs text-zinc-400 hover:text-white underline underline-offset-2 cursor-pointer"
              >
                Очистить выбор
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={selectedIds.size === 0 || isBulkUpdating}
            onClick={() => handleBulkSetVisibility(true)}
            className="px-3.5 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <EyeOff className="w-3.5 h-3.5 text-rose-400" />
            <span>Скрыть выбранные</span>
          </button>

          <button
            type="button"
            disabled={selectedIds.size === 0 || isBulkUpdating}
            onClick={() => handleBulkSetVisibility(false)}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/80 text-emerald-200 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span>Показать выбранные</span>
          </button>
        </div>
      </div>

      {/* Catalog Items List */}
      <div className="space-y-2">
        {paginatedItems.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#13141d] border border-zinc-800 text-center space-y-2">
            <Package className="w-8 h-8 text-zinc-500 mx-auto" />
            <div className="text-sm font-bold text-zinc-300">Предметы по заданным фильтрам не найдены</div>
            <p className="text-xs text-zinc-400">
              Попробуйте изменить поисковый запрос или сбросить фильтр видимости.
            </p>
          </div>
        ) : (
          paginatedItems.map(item => {
            const rarityCfg = RARITY_CONFIG[item.rarity] || RARITY_CONFIG.common;
            const catCfg = CATEGORY_CONFIG[item.category] || { label: item.category, icon: '📦' };
            const isHidden = Boolean(item.adminHidden);
            const isSelected = selectedIds.has(item.id);
            const isUpdating = updatingIds.has(item.id);
            const inShop = item.inShop !== false;

            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-[#1a1826] border-amber-500/70'
                    : isHidden
                    ? 'bg-[#121218]/90 border-rose-900/40'
                    : 'bg-[#13141d] border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Left side: Bulk select checkbox + Icon + Metadata */}
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => toggleSelectOne(item.id)}
                    title={isSelected ? 'Снять отметку для массового действия' : 'Выбрать предмет для массового действия'}
                    className="mt-1 sm:mt-0 p-1 rounded-lg text-zinc-400 hover:text-white transition-colors shrink-0 cursor-pointer"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Square className="w-4 h-4 text-zinc-500" />
                    )}
                  </button>

                  <div
                    className={`w-12 h-12 rounded-xl border flex items-center justify-center text-2xl shrink-0 ${rarityCfg.bg} ${rarityCfg.border}`}
                  >
                    {item.icon || '🎁'}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-white truncate">{item.name}</span>

                      {/* Unique ID badge */}
                      <span className="px-2 py-0.5 rounded bg-black/50 border border-zinc-700/80 text-[10px] font-mono text-amber-300">
                        ID: {item.id}
                      </span>

                      {/* Category badge */}
                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700/70 text-[10px] font-semibold text-zinc-300 flex items-center gap-1">
                        <span>{catCfg.icon}</span>
                        <span>{catCfg.label}</span>
                      </span>

                      {/* Rarity badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${rarityCfg.bg} ${rarityCfg.color} ${rarityCfg.border}`}
                      >
                        {rarityCfg.label}
                      </span>

                      {/* Shop presence informational badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 ${
                          inShop
                            ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <ShoppingCart className="w-2.5 h-2.5" />
                        <span>{inShop ? `${item.cost} кр` : 'Вне витрины'}</span>
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 line-clamp-1">{item.description}</p>
                  </div>
                </div>

                {/* Right side: Administrative Visibility Status & "Скрыть" Checkbox */}
                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/80 shrink-0">
                  {/* Status Indicator Badge */}
                  <div
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold flex items-center gap-1.5 ${
                      isHidden
                        ? 'bg-rose-950/70 border-rose-700/70 text-rose-300'
                        : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                    }`}
                  >
                    {isHidden ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-rose-400" />
                        <span>СКРЫТ В СПИСКАХ</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        <span>ДОСТУПЕН В СПИСКАХ</span>
                      </>
                    )}
                  </div>

                  {/* Required "Скрыть" Checkbox */}
                  <label
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all select-none ${
                      isUpdating ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                    } ${
                      isHidden
                        ? 'bg-rose-950/90 border-rose-600 text-white shadow-sm'
                        : 'bg-[#0e0f16] hover:bg-zinc-800 border-zinc-700 text-zinc-200'
                    }`}
                    title="Когда чекбокс «Скрыть» включён — предмет скрывается из выпадающих списков выбора в других разделах админки, но остаётся в каталоге и в игре"
                  >
                    <input
                      type="checkbox"
                      checked={isHidden}
                      disabled={isUpdating}
                      onChange={e => handleToggleItemHidden(item, e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-900 border-zinc-600 text-rose-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Скрыть</span>
                  </label>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {pageSize > 0 && totalPages > 1 && (
        <div className="p-3 rounded-xl bg-[#13141d] border border-zinc-800 flex items-center justify-between gap-2 text-xs shrink-0">
          <div className="text-zinc-400 font-mono">
            Показано {(safeCurrentPage - 1) * pageSize + 1}–
            {Math.min(safeCurrentPage * pageSize, filteredItems.length)} из {filteredItems.length}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => {
                sounds.playTick();
                setCurrentPage(p => Math.max(1, p - 1));
              }}
              className="px-2.5 py-1 rounded-lg bg-[#0e0f16] hover:bg-zinc-800 border border-zinc-700 text-zinc-200 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Назад</span>
            </button>

            <span className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 font-mono font-bold text-amber-300">
              Стр. {safeCurrentPage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => {
                sounds.playTick();
                setCurrentPage(p => Math.min(totalPages, p + 1));
              }}
              className="px-2.5 py-1 rounded-lg bg-[#0e0f16] hover:bg-zinc-800 border border-zinc-700 text-zinc-200 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <span>Вперёд</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
