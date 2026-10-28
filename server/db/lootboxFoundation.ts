import crypto from 'node:crypto';
import {
  AnimationFrameSpec,
  ItemDefinition,
  LootboxConsolationPrize,
  LootboxDropMode,
  LootboxPresentationConfig,
  LootboxRewardEntry,
  LootboxRewardType,
  LootboxRuleConfig,
  LootboxRuleSnapshot,
  LootboxSequenceAnimation,
  LootboxSoundCategory,
  UserInventoryItem
} from '../data/items';

export const LEGACY_SYSTEM_CHEST_IDS = ['chest_novice', 'chest_don', 'chest_sheriff'] as const;
export type LegacySystemChestId = (typeof LEGACY_SYSTEM_CHEST_IDS)[number];

export const LEGACY_CHEST_CREDIT_AMOUNTS: ReadonlyArray<number> = [100, 200, 350, 500, 1000];
export const LEGACY_CHEST_INITIAL_CAPTURED_AT = '2026-01-01T00:00:00.000Z';

export const MAX_CURRENCY_REWARD_QTY = 1_000_000;
export const MAX_ITEM_REWARD_QTY = 100;
export const MAX_REWARDS_PER_LOOTBOX = 100;
export const MAX_WEIGHT_VALUE = 1_000_000;
export const PROBABILITY_BASIS_POINTS_SCALE = 10_000; // 1% = 10,000 units -> 0.0001% precision

export interface CanonicalRewardRule {
  type: LootboxRewardType;
  itemId: string | null;
  minQty: number;
  maxQty: number;
  chanceBp: number | null;
  weightScaled: number | null;
}

export interface CanonicalConsolationRule {
  type: LootboxRewardType;
  itemId: string | null;
  minQty: number;
  maxQty: number;
}

export interface CanonicalLootboxRules {
  schemaVersion: 1;
  lootboxItemId: string;
  dropMode: LootboxDropMode;
  allowNestedLootboxes: boolean;
  rewards: CanonicalRewardRule[];
  consolationPrize: CanonicalConsolationRule | null;
}

export interface LootboxValidationResult {
  valid: boolean;
  errors: string[];
  normalizedConfig?: LootboxRuleConfig;
  computedProbabilitiesPercent?: number[];
  emptyDropProbabilityPercent?: number;
  hasGuaranteedReward?: boolean;
}

export function isLegacySystemChestId(itemId: string): itemId is LegacySystemChestId {
  return (LEGACY_SYSTEM_CHEST_IDS as ReadonlyArray<string>).includes(itemId);
}

export function isValidSha256Hex(hash: unknown): hash is string {
  return typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash);
}

function roundTo4Decimals(val: number): number {
  return Math.round(val * PROBABILITY_BASIS_POINTS_SCALE) / PROBABILITY_BASIS_POINTS_SCALE;
}

/**
 * Builds the canonical, deterministic representation of a lootbox's drop rules.
 * Includes ONLY parameters that affect actual drop evaluation and reward quantities.
 * Visual/audio fields (icon, revealSoundAssetId, presentationConfig) are excluded.
 */
export function buildCanonicalLootboxRules(
  lootboxItemId: string,
  config: Pick<LootboxRuleConfig, 'dropMode' | 'allowNestedLootboxes' | 'rewards' | 'consolationPrize'>
): CanonicalLootboxRules {
  const cleanItemId = String(lootboxItemId || '').trim();
  const dropMode: LootboxDropMode = config.dropMode === 'independent' ? 'independent' : 'single_weighted';
  const allowNested = Boolean(config.allowNestedLootboxes);

  const canonicalRewards: CanonicalRewardRule[] = (config.rewards || []).map(entry => {
    const minQty = Math.trunc(Number(entry.minQty));
    const maxQty =
      entry.maxQty !== undefined && entry.maxQty !== null
        ? Math.trunc(Number(entry.maxQty))
        : minQty;
    const isItemOrLootbox = entry.type === 'item' || entry.type === 'lootbox';

    return {
      type: entry.type,
      itemId: isItemOrLootbox ? String(entry.itemId || '').trim() : null,
      minQty,
      maxQty,
      chanceBp:
        dropMode === 'independent'
          ? Math.round(Number(entry.chancePercent ?? 0) * PROBABILITY_BASIS_POINTS_SCALE)
          : null,
      weightScaled:
        dropMode === 'single_weighted'
          ? Math.round(Number(entry.weight ?? 0) * PROBABILITY_BASIS_POINTS_SCALE)
          : null
    };
  });

  const hasGuaranteedInIndependent =
    dropMode === 'independent' &&
    canonicalRewards.some(r => r.chanceBp !== null && r.chanceBp >= 100 * PROBABILITY_BASIS_POINTS_SCALE);

  let canonicalConsolation: CanonicalConsolationRule | null = null;
  if (
    dropMode === 'independent' &&
    !hasGuaranteedInIndependent &&
    config.consolationPrize &&
    config.consolationPrize.enabled
  ) {
    const cp = config.consolationPrize;
    const cpMin = Math.trunc(Number(cp.minQty));
    const cpMax = cp.maxQty !== undefined && cp.maxQty !== null ? Math.trunc(Number(cp.maxQty)) : cpMin;
    const isCpItemOrLootbox = cp.type === 'item' || cp.type === 'lootbox';
    canonicalConsolation = {
      type: cp.type,
      itemId: isCpItemOrLootbox ? String(cp.itemId || '').trim() : null,
      minQty: cpMin,
      maxQty: cpMax
    };
  }

  return {
    schemaVersion: 1,
    lootboxItemId: cleanItemId,
    dropMode,
    allowNestedLootboxes: allowNested,
    rewards: canonicalRewards,
    consolationPrize: canonicalConsolation
  };
}

/**
 * Deterministically serializes canonical lootbox rules into a JSON string with fixed key order.
 */
export function serializeCanonicalLootboxRules(
  lootboxItemId: string,
  config: Pick<LootboxRuleConfig, 'dropMode' | 'allowNestedLootboxes' | 'rewards' | 'consolationPrize'>
): string {
  const canonical = buildCanonicalLootboxRules(lootboxItemId, config);
  return JSON.stringify(canonical);
}

/**
 * Computes a full 64-character lowercase hex SHA-256 digest of the canonical lootbox rules.
 */
export function computeLootboxRuleSnapshotHash(
  lootboxItemId: string,
  config: Pick<LootboxRuleConfig, 'dropMode' | 'allowNestedLootboxes' | 'rewards' | 'consolationPrize'>
): string {
  const serialized = serializeCanonicalLootboxRules(lootboxItemId, config);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * Detects direct (A -> A) or indirect (A -> B -> C -> A) cycles in nested lootbox references,
 * inspecting both regular rewards and consolation prizes.
 */
export function detectLootboxDependencyCycles(
  parentLootboxId: string,
  candidateConfig: Pick<LootboxRuleConfig, 'dropMode' | 'allowNestedLootboxes' | 'rewards' | 'consolationPrize'>,
  catalogMap: Record<string, ItemDefinition>
): { hasCycle: boolean; cyclePath?: string[] } {
  const getReferencedLootboxIds = (
    cfg: Pick<LootboxRuleConfig, 'dropMode' | 'allowNestedLootboxes' | 'rewards' | 'consolationPrize'> | undefined
  ): string[] => {
    if (!cfg) return [];
    const refs = new Set<string>();
    for (const r of cfg.rewards || []) {
      if (r.type === 'lootbox' && r.itemId && r.itemId.trim()) {
        refs.add(r.itemId.trim());
      }
    }
    if (
      cfg.dropMode === 'independent' &&
      cfg.consolationPrize &&
      cfg.consolationPrize.enabled &&
      cfg.consolationPrize.type === 'lootbox' &&
      cfg.consolationPrize.itemId &&
      cfg.consolationPrize.itemId.trim()
    ) {
      refs.add(cfg.consolationPrize.itemId.trim());
    }
    return Array.from(refs);
  };

  const adjacency = new Map<string, string[]>();
  for (const [id, itemDef] of Object.entries(catalogMap)) {
    if (itemDef && itemDef.category === 'chests' && id !== parentLootboxId) {
      adjacency.set(id, getReferencedLootboxIds(itemDef.lootboxConfig));
    }
  }
  adjacency.set(parentLootboxId, getReferencedLootboxIds(candidateConfig));

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const pathStack: string[] = [];

  const dfs = (nodeId: string): string[] | null => {
    visiting.add(nodeId);
    pathStack.push(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const nextId of neighbors) {
      if (visiting.has(nextId)) {
        const cycleStartIdx = pathStack.indexOf(nextId);
        return [...pathStack.slice(cycleStartIdx), nextId];
      }
      if (!visited.has(nextId)) {
        const foundCycle = dfs(nextId);
        if (foundCycle) return foundCycle;
      }
    }

    pathStack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  };

  // Start DFS from parentLootboxId first, then check any remaining nodes
  const cycleFromParent = dfs(parentLootboxId);
  if (cycleFromParent) {
    return { hasCycle: true, cyclePath: cycleFromParent };
  }

  for (const nodeId of adjacency.keys()) {
    if (!visited.has(nodeId)) {
      const cycle = dfs(nodeId);
      if (cycle) {
        return { hasCycle: true, cyclePath: cycle };
      }
    }
  }

  return { hasCycle: false };
}

function validateSingleRewardSpec(
  label: string,
  entry: {
    type?: unknown;
    itemId?: unknown;
    minQty?: unknown;
    maxQty?: unknown;
  },
  parentLootboxId: string,
  allowNestedLootboxes: boolean,
  catalogMap: Record<string, ItemDefinition>,
  errors: string[]
): { minQty: number; maxQty: number; targetItem?: ItemDefinition } {
  const validTypes: LootboxRewardType[] = ['credits', 'xp', 'item', 'lootbox'];
  if (typeof entry.type !== 'string' || !validTypes.includes(entry.type as LootboxRewardType)) {
    errors.push(`${label}: некорректный тип награды "${String(entry.type)}". Допустимо: credits, xp, item, lootbox.`);
    return { minQty: 1, maxQty: 1 };
  }

  const rewardType = entry.type as LootboxRewardType;
  const maxAllowedQty =
    rewardType === 'credits' || rewardType === 'xp' ? MAX_CURRENCY_REWARD_QTY : MAX_ITEM_REWARD_QTY;

  const rawMin = Number(entry.minQty);
  if (!Number.isSafeInteger(rawMin) || rawMin < 1) {
    errors.push(`${label}: минимальное количество (minQty) должно быть целым положительным числом >= 1.`);
  } else if (rawMin > maxAllowedQty) {
    errors.push(`${label}: минимальное количество (${rawMin}) превышает безопасный предел (${maxAllowedQty}).`);
  }

  let resolvedMax = rawMin;
  if (entry.maxQty !== undefined && entry.maxQty !== null && entry.maxQty !== '') {
    const rawMax = Number(entry.maxQty);
    if (!Number.isSafeInteger(rawMax) || rawMax < 1) {
      errors.push(`${label}: максимальное количество (maxQty) должно быть целым положительным числом.`);
    } else if (Number.isSafeInteger(rawMin) && rawMax < rawMin) {
      errors.push(`${label}: максимальное количество (${rawMax}) не может быть меньше минимального (${rawMin}).`);
    } else if (rawMax > maxAllowedQty) {
      errors.push(`${label}: максимальное количество (${rawMax}) превышает безопасный предел (${maxAllowedQty}).`);
    } else {
      resolvedMax = rawMax;
    }
  }

  let targetItem: ItemDefinition | undefined;
  if (rewardType === 'item' || rewardType === 'lootbox') {
    const rawItemId = typeof entry.itemId === 'string' ? entry.itemId.trim() : '';
    if (!rawItemId) {
      errors.push(`${label}: необходимо указать идентификатор предмета (itemId) для типа "${rewardType}".`);
    } else {
      targetItem = catalogMap[rawItemId];
      if (!targetItem) {
        errors.push(`${label}: предмет "${rawItemId}" не найден в едином каталоге предметов.`);
      } else if (rewardType === 'item' && targetItem.category === 'chests') {
        errors.push(
          `${label}: предмет "${rawItemId}" является лутбоксом (category="chests"), используйте тип награды "lootbox".`
        );
      } else if (rewardType === 'lootbox' && targetItem.category !== 'chests') {
        errors.push(
          `${label}: предмет "${rawItemId}" не является лутбоксом (category="${targetItem.category}"), используйте тип награды "item".`
        );
      }

      if (rewardType === 'lootbox') {
        if (!allowNestedLootboxes) {
          errors.push(
            `${label}: в настройках данного лутбокса запрещено выпадение вложенных лутбоксов (allowNestedLootboxes = false).`
          );
        }
        if (rawItemId === parentLootboxId) {
          errors.push(`${label}: лутбокс "${parentLootboxId}" не может содержать сам себя напрямую.`);
        }
      }
    }
  }

  return {
    minQty: Number.isSafeInteger(rawMin) && rawMin >= 1 ? rawMin : 1,
    maxQty: resolvedMax,
    targetItem
  };
}

/**
 * Comprehensive server-side validator for lootbox rule configurations.
 * Enforces all constraints for 'independent' and 'single_weighted' modes,
 * quantity bounds, catalog item existence, consolation prize rules, and DAG cycle checks.
 */
export function validateLootboxRuleConfig(
  parentLootboxId: string,
  inputConfig: Partial<LootboxRuleConfig> | null | undefined,
  catalogMap: Record<string, ItemDefinition>
): LootboxValidationResult {
  const errors: string[] = [];
  const cleanParentId = String(parentLootboxId || '').trim();
  if (!cleanParentId) {
    errors.push('Не указан идентификатор лутбокса (parentLootboxId).');
  }

  if (!inputConfig || typeof inputConfig !== 'object') {
    return { valid: false, errors: ['Конфигурация правил лутбокса отсутствует или некорректна.'] };
  }

  const dropMode = inputConfig.dropMode;
  if (dropMode !== 'independent' && dropMode !== 'single_weighted') {
    errors.push(
      `Недопустимый режим выпадения "${String(dropMode)}". Поддерживаются строго два режима: "independent" и "single_weighted".`
    );
  }

  const allowNestedLootboxes =
    inputConfig.allowNestedLootboxes !== undefined ? Boolean(inputConfig.allowNestedLootboxes) : true;

  if (!Array.isArray(inputConfig.rewards) || inputConfig.rewards.length === 0) {
    errors.push('Список наград лутбокса (rewards) должен содержать хотя бы одну запись.');
  } else if (inputConfig.rewards.length > MAX_REWARDS_PER_LOOTBOX) {
    errors.push(`Количество записей наград превышает допустимый предел (${MAX_REWARDS_PER_LOOTBOX}).`);
  }

  const normalizedRewards: LootboxRewardEntry[] = [];
  let hasGuaranteedReward = false;
  let totalWeight = 0;

  if (Array.isArray(inputConfig.rewards)) {
    inputConfig.rewards.forEach((rawEntry, idx) => {
      const label = `Награда #${idx + 1}`;
      if (!rawEntry || typeof rawEntry !== 'object') {
        errors.push(`${label}: запись награды повреждена.`);
        return;
      }

      const { minQty, maxQty, targetItem } = validateSingleRewardSpec(
        label,
        rawEntry,
        cleanParentId,
        allowNestedLootboxes,
        catalogMap,
        errors
      );

      let normalizedChance: number | undefined;
      let normalizedWeight: number | undefined;

      if (dropMode === 'independent') {
        const rawChance = Number(rawEntry.chancePercent);
        if (
          rawEntry.chancePercent === undefined ||
          rawEntry.chancePercent === null ||
          !Number.isFinite(rawChance)
        ) {
          errors.push(`${label}: для режима "independent" необходимо указать числовую вероятность chancePercent.`);
        } else if (rawChance < 0 || rawChance > 100) {
          errors.push(
            `${label}: вероятность (${rawChance}%) должна находиться в диапазоне от 0% до 100% включительно.`
          );
        } else {
          normalizedChance = roundTo4Decimals(rawChance);
          if (normalizedChance === 100) {
            hasGuaranteedReward = true;
          }
        }
      } else if (dropMode === 'single_weighted') {
        const rawWeight = Number(rawEntry.weight);
        if (rawEntry.weight === undefined || rawEntry.weight === null || !Number.isFinite(rawWeight)) {
          errors.push(`${label}: для режима "single_weighted" необходимо указать положительный вес (weight).`);
        } else if (rawWeight <= 0) {
          errors.push(`${label}: относительный вес (${rawWeight}) должен быть строго больше 0.`);
        } else if (rawWeight > MAX_WEIGHT_VALUE) {
          errors.push(`${label}: относительный вес (${rawWeight}) превышает допустимый предел (${MAX_WEIGHT_VALUE}).`);
        } else {
          normalizedWeight = roundTo4Decimals(rawWeight);
          totalWeight += normalizedWeight;
        }
      }

      const entryId =
        typeof rawEntry.id === 'string' && rawEntry.id.trim()
          ? rawEntry.id.trim()
          : `rw_${idx + 1}`;

      const isItemOrLootbox = rawEntry.type === 'item' || rawEntry.type === 'lootbox';
      normalizedRewards.push({
        id: entryId,
        type: rawEntry.type as LootboxRewardType,
        ...(isItemOrLootbox && rawEntry.itemId ? { itemId: String(rawEntry.itemId).trim() } : {}),
        ...(isItemOrLootbox && (targetItem?.name || rawEntry.itemNameSnapshot)
          ? { itemNameSnapshot: targetItem?.name || rawEntry.itemNameSnapshot }
          : {}),
        minQty,
        ...(maxQty > minQty ? { maxQty } : { maxQty: minQty }),
        ...(dropMode === 'independent' && normalizedChance !== undefined ? { chancePercent: normalizedChance } : {}),
        ...(dropMode === 'single_weighted' && normalizedWeight !== undefined ? { weight: normalizedWeight } : {}),
        ...(typeof rawEntry.revealSoundAssetId === 'string' && rawEntry.revealSoundAssetId.trim()
          ? { revealSoundAssetId: rawEntry.revealSoundAssetId.trim() }
          : {})
      });
    });
  }

  // Validate Consolation Prize rules
  let normalizedConsolation: LootboxConsolationPrize | null = null;
  if (inputConfig.consolationPrize && inputConfig.consolationPrize.enabled !== false) {
    if (dropMode === 'single_weighted') {
      errors.push('Утешительный приз недоступен в режиме "single_weighted" (ровно одна награда).');
    } else if (dropMode === 'independent' && hasGuaranteedReward) {
      errors.push(
        'Утешительный приз недоступен, так как в пуле присутствует гарантированная награда с вероятностью 100%.'
      );
    } else if (dropMode === 'independent') {
      const cp = inputConfig.consolationPrize;
      const { minQty, maxQty, targetItem } = validateSingleRewardSpec(
        'Утешительный приз',
        cp,
        cleanParentId,
        allowNestedLootboxes,
        catalogMap,
        errors
      );
      const isCpItemOrLootbox = cp.type === 'item' || cp.type === 'lootbox';
      normalizedConsolation = {
        enabled: true,
        type: cp.type,
        ...(isCpItemOrLootbox && cp.itemId ? { itemId: String(cp.itemId).trim() } : {}),
        ...(isCpItemOrLootbox && (targetItem?.name || cp.itemNameSnapshot)
          ? { itemNameSnapshot: targetItem?.name || cp.itemNameSnapshot }
          : {}),
        minQty,
        maxQty,
        ...(typeof cp.revealSoundAssetId === 'string' && cp.revealSoundAssetId.trim()
          ? { revealSoundAssetId: cp.revealSoundAssetId.trim() }
          : {})
      };
    }
  }

  // DAG cycle check across rewards and consolationPrize
  if (cleanParentId && (dropMode === 'independent' || dropMode === 'single_weighted')) {
    const cycleCheck = detectLootboxDependencyCycles(
      cleanParentId,
      {
        dropMode,
        allowNestedLootboxes,
        rewards: normalizedRewards,
        consolationPrize: normalizedConsolation
      },
      catalogMap
    );

    if (cycleCheck.hasCycle) {
      errors.push(
        `Обнаружена циклическая зависимость вложенных лутбоксов: ${(cycleCheck.cyclePath || []).join(' -> ')}. Прямые и косвенные циклы запрещены.`
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const version =
    typeof inputConfig.version === 'number' && Number.isSafeInteger(inputConfig.version) && inputConfig.version >= 0
      ? inputConfig.version
      : 1;

  const baseForHash = {
    dropMode: dropMode as LootboxDropMode,
    allowNestedLootboxes,
    rewards: normalizedRewards,
    consolationPrize: normalizedConsolation
  };

  const snapshotHash = computeLootboxRuleSnapshotHash(cleanParentId, baseForHash);

  const normalizedConfig: LootboxRuleConfig = {
    version,
    snapshotHash,
    dropMode: dropMode as LootboxDropMode,
    allowNestedLootboxes,
    rewards: normalizedRewards,
    consolationPrize: normalizedConsolation,
    updatedAt: inputConfig.updatedAt || new Date().toISOString()
  };

  // Compute informational probabilities
  let computedProbabilitiesPercent: number[] = [];
  let emptyDropProbabilityPercent = 0;

  if (dropMode === 'single_weighted' && totalWeight > 0) {
    computedProbabilitiesPercent = normalizedRewards.map(r =>
      roundTo4Decimals(((r.weight || 0) / totalWeight) * 100)
    );
    emptyDropProbabilityPercent = 0;
  } else if (dropMode === 'independent') {
    computedProbabilitiesPercent = normalizedRewards.map(r => r.chancePercent ?? 0);
    const emptyProbFraction = normalizedRewards.reduce((acc, r) => {
      const p = Math.max(0, Math.min(100, r.chancePercent ?? 0)) / 100;
      return acc * (1 - p);
    }, 1);
    emptyDropProbabilityPercent = roundTo4Decimals(emptyProbFraction * 100);
  }

  return {
    valid: true,
    errors: [],
    normalizedConfig,
    computedProbabilitiesPercent,
    emptyDropProbabilityPercent,
    hasGuaranteedReward
  };
}

/**
 * Creates a complete immutable snapshot of a lootbox's rules and identity at the moment of issuance.
 */
export function createLootboxRuleSnapshot(
  itemDef: Pick<ItemDefinition, 'id' | 'name' | 'description' | 'pawnValue' | 'lootboxConfig'>,
  capturedAt: string = new Date().toISOString()
): LootboxRuleSnapshot {
  if (!itemDef.lootboxConfig) {
    throw new Error(`У лутбокса "${itemDef.id}" отсутствует конфигурация правил (lootboxConfig).`);
  }

  const cfg = itemDef.lootboxConfig;
  const computedHash = computeLootboxRuleSnapshotHash(itemDef.id, cfg);

  return {
    snapshotHash: computedHash,
    version: cfg.version,
    capturedAt,
    lootboxItemId: itemDef.id,
    name: itemDef.name,
    description: itemDef.description,
    ...(typeof itemDef.pawnValue === 'number' ? { pawnValue: itemDef.pawnValue } : {}),
    dropMode: cfg.dropMode,
    allowNestedLootboxes: Boolean(cfg.allowNestedLootboxes),
    rewards: cfg.rewards.map(r => ({
      ...r,
      maxQty: r.maxQty !== undefined && r.maxQty !== null ? r.maxQty : r.minQty
    })),
    consolationPrize: cfg.consolationPrize ? { ...cfg.consolationPrize } : null
  };
}

/**
 * Validates that an existing ruleSnapshot on an inventory item is structurally intact
 * and its snapshotHash genuinely matches its canonical rules.
 */
export function isValidLootboxRuleSnapshot(
  expectedItemId: string,
  snapshot: unknown
): snapshot is LootboxRuleSnapshot {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const s = snapshot as LootboxRuleSnapshot;
  if (!isValidSha256Hex(s.snapshotHash)) return false;
  if (s.lootboxItemId !== expectedItemId) return false;
  if (s.dropMode !== 'independent' && s.dropMode !== 'single_weighted') return false;
  if (!Array.isArray(s.rewards) || s.rewards.length === 0) return false;
  if (typeof s.name !== 'string' || !s.name.trim()) return false;
  if (typeof s.description !== 'string') return false;

  const expectedHash = computeLootboxRuleSnapshotHash(expectedItemId, {
    dropMode: s.dropMode,
    allowNestedLootboxes: Boolean(s.allowNestedLootboxes),
    rewards: s.rewards,
    consolationPrize: s.consolationPrize ?? null
  });

  return s.snapshotHash === expectedHash;
}

/**
 * Compares two lootbox rule snapshots to determine if two inventory stacks can be merged.
 * Never relies solely on hash equality: verifies full 64-char SHA-256 hash equality,
 * byte-for-byte canonical rule JSON equality, AND equality of captured immutable instance
 * fields (version, name, description, pawnValue) so instances with differing required snapshots
 * are never mixed.
 */
export function areLootboxRuleSnapshotsEqualForStacking(
  a: LootboxRuleSnapshot | undefined | null,
  b: LootboxRuleSnapshot | undefined | null
): boolean {
  if (!a || !b) return false;
  if (a.lootboxItemId !== b.lootboxItemId) return false;
  if (!isValidSha256Hex(a.snapshotHash) || !isValidSha256Hex(b.snapshotHash)) return false;
  if (a.snapshotHash !== b.snapshotHash) return false;

  // Deep canonical rule verification (prevents any theoretical hash collision from merging different rules)
  const canonicalA = serializeCanonicalLootboxRules(a.lootboxItemId, a);
  const canonicalB = serializeCanonicalLootboxRules(b.lootboxItemId, b);
  if (canonicalA !== canonicalB) return false;

  // Verify captured immutable instance metadata so changing name/description/pawnValue/version
  // does not silently overwrite or mix with an earlier snapshot's captured fields
  if (a.version !== b.version) return false;
  if (a.name !== b.name) return false;
  if (a.description !== b.description) return false;
  if ((a.pawnValue ?? null) !== (b.pawnValue ?? null)) return false;

  return true;
}

/**
 * Determines whether two UserInventoryItem entries can be safely stacked together.
 * - Regular items (without ruleSnapshot) stack by itemId.
 * - Lootbox items (with ruleSnapshot) stack ONLY when both itemId and full ruleSnapshot match.
 */
export function canMergeInventorySlots(
  slotA: UserInventoryItem,
  slotB: UserInventoryItem
): boolean {
  if (!slotA || !slotB) return false;
  if (slotA.itemId !== slotB.itemId) return false;

  const aHasSnapshot = Boolean(slotA.ruleSnapshot);
  const bHasSnapshot = Boolean(slotB.ruleSnapshot);

  if (!aHasSnapshot && !bHasSnapshot) {
    return true;
  }

  if (aHasSnapshot !== bHasSnapshot) {
    return false;
  }

  return areLootboxRuleSnapshotsEqualForStacking(slotA.ruleSnapshot, slotB.ruleSnapshot);
}

/**
 * Builds the historical v0 LootboxRuleConfig for one of the three original system chests
 * ('chest_novice', 'chest_don', 'chest_sheriff').
 * Reproduces the exact pre-constructor mechanic: equal 20% probability for [100, 200, 350, 500, 1000] credits.
 */
export function buildLegacyInitialChestRuleConfig(
  chestId: LegacySystemChestId,
  updatedAt: string = LEGACY_CHEST_INITIAL_CAPTURED_AT
): LootboxRuleConfig {
  const rewards: LootboxRewardEntry[] = LEGACY_CHEST_CREDIT_AMOUNTS.map((credits, idx) => ({
    id: `legacy_${chestId}_credits_${idx + 1}`,
    type: 'credits',
    minQty: credits,
    maxQty: credits,
    weight: 20
  }));

  const baseConfig = {
    dropMode: 'single_weighted' as const,
    allowNestedLootboxes: false,
    rewards,
    consolationPrize: null
  };

  const snapshotHash = computeLootboxRuleSnapshotHash(chestId, baseConfig);

  return {
    version: 0,
    snapshotHash,
    ...baseConfig,
    updatedAt
  };
}

/**
 * Builds the immutable historical v0 LootboxRuleSnapshot for an already-granted legacy chest
 * ('chest_novice', 'chest_don', 'chest_sheriff').
 * Strictly uses the historical [100, 200, 350, 500, 1000] credit rules and never reads modified catalog rules.
 */
export function buildLegacyInitialChestSnapshot(
  chestId: LegacySystemChestId,
  metadata?: { name?: string; description?: string; pawnValue?: number; capturedAt?: string }
): LootboxRuleSnapshot {
  const defaultMeta: Record<LegacySystemChestId, { name: string; description: string; pawnValue: number }> = {
    chest_novice: {
      name: 'Сундук Мафиози',
      description: 'Начальный сундук контрабандиста. Содержит монеты, ценности ломбарда или базовые рубашки карт.',
      pawnValue: 50
    },
    chest_don: {
      name: 'Сейф Дона',
      description: 'Тяжёлый сейф с кодовым замком синдиката. Содержит редкие титулы, сертификаты и крупные суммы кредитов.',
      pawnValue: 150
    },
    chest_sheriff: {
      name: 'Кейс Шерифа',
      description: 'Архивный дипломат специального отдела полиции. Содержит элитные сертификаты и легендарные титулы.',
      pawnValue: 250
    }
  };

  const fallback = defaultMeta[chestId];
  const legacyRuleConfig = buildLegacyInitialChestRuleConfig(chestId);

  return {
    snapshotHash: legacyRuleConfig.snapshotHash,
    version: 0,
    capturedAt: metadata?.capturedAt || LEGACY_CHEST_INITIAL_CAPTURED_AT,
    lootboxItemId: chestId,
    name: metadata?.name?.trim() || fallback.name,
    description: metadata?.description ?? fallback.description,
    pawnValue: typeof metadata?.pawnValue === 'number' ? metadata.pawnValue : fallback.pawnValue,
    dropMode: legacyRuleConfig.dropMode,
    allowNestedLootboxes: legacyRuleConfig.allowNestedLootboxes,
    rewards: legacyRuleConfig.rewards.map(r => ({ ...r })),
    consolationPrize: null
  };
}

// ============================================================================
// STAGE 2: UNIFIED INVENTORY GRANTING, RNG DROP ENGINE, REPLACEMENTS & SIMULATOR
// ============================================================================

export const MAX_REPLACEMENT_CHAIN_DEPTH = 5;
export const MAX_SIMULATION_ITERATIONS = 50_000;

export interface DeletedItemReplacementRecord {
  deletedItemId: string;
  deletedItemName: string;
  replacementType: 'credits' | 'item' | 'lootbox';
  replacementItemId: string | null;
  replacementQty: number;
  deletedAt: string;
  deletedByAdminId?: string | null;
}

export interface ResolvedReplacementResult {
  type: 'credits' | 'item' | 'lootbox';
  itemId: string | null;
  targetItem?: ItemDefinition;
  quantity: number;
  wasReplaced: boolean;
  originalItemId: string;
  originalItemName?: string;
}

export interface EvaluatedLootboxReward {
  entryId: string;
  type: LootboxRewardType;
  itemId?: string;
  itemName?: string;
  rarity?: string;
  icon?: string;
  quantity: number;
  isConsolation: boolean;
  wasReplaced?: boolean;
  originalItemId?: string;
  originalItemName?: string;
  revealSoundAssetId?: string;
}

export interface LootboxEvaluationResult {
  lootboxItemId: string;
  snapshotHash: string;
  snapshotVersion: number;
  dropMode: LootboxDropMode;
  isEmptyDrop: boolean;
  consolationAwarded: boolean;
  rewards: EvaluatedLootboxReward[];
  totalCreditsGranted: number;
  totalXpGranted: number;
}

export interface LootboxSimulationRewardBreakdown {
  entryId: string;
  type: LootboxRewardType;
  itemId?: string;
  label: string;
  minQty: number;
  maxQty: number;
  theoreticalProbabilityPercent: number;
  hitsCount: number;
  empiricalHitRatePercent: number;
  totalQuantityGranted: number;
  avgQuantityPerOpen: number;
}

export interface LootboxSimulationResult {
  lootboxItemId: string;
  iterations: number;
  dropMode: LootboxDropMode;
  snapshotHash: string;
  emptyOpensCount: number;
  emptyOpensPercent: number;
  consolationTriggersCount: number;
  consolationTriggersPercent: number;
  totalCreditsGranted: number;
  avgCreditsPerOpen: number;
  totalXpGranted: number;
  avgXpPerOpen: number;
  rewardBreakdown: LootboxSimulationRewardBreakdown[];
}

export function generateInventoryEntryId(): string {
  return `inv_${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * Unified, pure in-memory inventory stack allocator that strictly enforces
 * immutable `LootboxRuleSnapshot` creation for lootboxes (`category === 'chests'`)
 * and regular item merging (`category !== 'chests'`) without adding snapshots.
 *
 * Safe to invoke inside any existing SQLite/Turso write transaction without opening nested transactions.
 */
export function grantInventoryItemWithSnapshot(
  currentInventory: UserInventoryItem[],
  itemDef: ItemDefinition,
  quantity: number = 1,
  nowIso: string = new Date().toISOString()
): {
  inventory: UserInventoryItem[];
  grantedSlot: UserInventoryItem;
  mergedIntoExistingStack: boolean;
} {
  if (!itemDef || !itemDef.id) {
    throw new Error('Невозможно выдать предмет: отсутствует определение предмета из единого каталога.');
  }

  const cleanQty = Math.trunc(Number(quantity));
  if (!Number.isSafeInteger(cleanQty) || cleanQty < 1) {
    throw new Error(`Количество выдаваемого предмета "${itemDef.id}" должно быть целым положительным числом >= 1.`);
  }

  const nextInventory: UserInventoryItem[] = (Array.isArray(currentInventory) ? currentInventory : []).map(slot => ({
    ...slot,
    ...(slot.ruleSnapshot ? { ruleSnapshot: { ...slot.ruleSnapshot } } : {})
  }));

  // 1. Regular item (non-chest): merge by itemId ONLY when slot has no ruleSnapshot
  if (itemDef.category !== 'chests') {
    const existingRegular = nextInventory.find(
      slot => slot.itemId === itemDef.id && !slot.ruleSnapshot
    );

    if (existingRegular) {
      if (!existingRegular.id || !String(existingRegular.id).trim()) {
        existingRegular.id = generateInventoryEntryId();
      }
      existingRegular.quantity = Math.max(0, Math.trunc(Number(existingRegular.quantity || 0))) + cleanQty;
      return {
        inventory: nextInventory,
        grantedSlot: existingRegular,
        mergedIntoExistingStack: true
      };
    }

    const newRegularSlot: UserInventoryItem = {
      id: generateInventoryEntryId(),
      itemId: itemDef.id,
      quantity: cleanQty,
      acquiredAt: nowIso
    };
    nextInventory.push(newRegularSlot);
    return {
      inventory: nextInventory,
      grantedSlot: newRegularSlot,
      mergedIntoExistingStack: false
    };
  }

  // 2. Lootbox item (category === 'chests'): build immutable ruleSnapshot from current catalog definition
  let ruleSnapshot: LootboxRuleSnapshot;
  if (itemDef.lootboxConfig) {
    ruleSnapshot = createLootboxRuleSnapshot(itemDef, nowIso);
  } else if (isLegacySystemChestId(itemDef.id)) {
    ruleSnapshot = buildLegacyInitialChestSnapshot(itemDef.id, {
      name: itemDef.name,
      description: itemDef.description,
      pawnValue: itemDef.pawnValue,
      capturedAt: nowIso
    });
  } else {
    throw new Error(
      `Невозможно выдать лутбокс "${itemDef.id}" («${itemDef.name}»): у лутбокса отсутствует конфигурация правил выпадения (lootboxConfig).`
    );
  }

  const candidateSlot: UserInventoryItem = {
    id: generateInventoryEntryId(),
    itemId: itemDef.id,
    quantity: cleanQty,
    acquiredAt: nowIso,
    ruleSnapshot
  };

  // Stack ONLY when both itemId and full ruleSnapshot match (64-char SHA-256 + canonical JSON + captured metadata)
  const matchingStack = nextInventory.find(existingSlot =>
    canMergeInventorySlots(existingSlot, candidateSlot)
  );

  if (matchingStack) {
    if (!matchingStack.id || !String(matchingStack.id).trim()) {
      matchingStack.id = generateInventoryEntryId();
    }
    matchingStack.quantity = Math.max(0, Math.trunc(Number(matchingStack.quantity || 0))) + cleanQty;
    return {
      inventory: nextInventory,
      grantedSlot: matchingStack,
      mergedIntoExistingStack: true
    };
  }

  nextInventory.push(candidateSlot);
  return {
    inventory: nextInventory,
    grantedSlot: candidateSlot,
    mergedIntoExistingStack: false
  };
}

/**
 * Resolves an item or nested lootbox reference from a historical `ruleSnapshot`.
 * If the target item was deleted via compensated deletion and recorded in `deleted_item_replacements`,
 * resolves the admin-configured replacement ('credits', 'item', or 'lootbox') with cycle and max-depth protection.
 * Never invents arbitrary credit fallbacks if a missing item has no explicit replacement record.
 */
export function resolveDeletedItemReplacement(
  itemId: string,
  baseQuantity: number,
  replacementsMap: Record<string, DeletedItemReplacementRecord>,
  catalogMap: Record<string, ItemDefinition>,
  expectedInitialKind?: 'item' | 'lootbox'
): ResolvedReplacementResult {
  const cleanInitialId = String(itemId || '').trim();
  if (!cleanInitialId) {
    throw new Error('В снимке правил лутбокса обнаружена награда без идентификатора предмета (itemId).');
  }

  const initialQty = Math.max(1, Math.trunc(Number(baseQuantity) || 1));

  // If the item is NOT in deleted_item_replacements and exists in active catalog, return directly
  if (!replacementsMap[cleanInitialId] && catalogMap[cleanInitialId]) {
    const activeItem = catalogMap[cleanInitialId];
    const resolvedKind: 'item' | 'lootbox' = activeItem.category === 'chests' ? 'lootbox' : 'item';
    if (expectedInitialKind && expectedInitialKind !== resolvedKind) {
      throw new Error(
        `Несоответствие типа награды для "${cleanInitialId}": ожидался "${expectedInitialKind}", но в каталоге категория "${activeItem.category}".`
      );
    }
    return {
      type: resolvedKind,
      itemId: activeItem.id,
      targetItem: activeItem,
      quantity: initialQty,
      wasReplaced: false,
      originalItemId: cleanInitialId
    };
  }

  // Otherwise, resolve through `deleted_item_replacements` chain
  let currentId = cleanInitialId;
  let currentQty = initialQty;
  let originalName: string | undefined;
  const visitedIds = new Set<string>([currentId]);

  for (let depth = 1; depth <= MAX_REPLACEMENT_CHAIN_DEPTH; depth++) {
    const rep = replacementsMap[currentId];
    if (!rep) {
      throw new Error(
        `Предмет или лутбокс "${currentId}" отсутствует в едином каталоге предметов и не имеет назначенной замены в таблице deleted_item_replacements.`
      );
    }

    if (depth === 1) {
      originalName = rep.deletedItemName;
    }

    const mult = Math.max(1, Math.trunc(Number(rep.replacementQty) || 1));
    currentQty = currentQty * mult;

    if (rep.replacementType === 'credits') {
      return {
        type: 'credits',
        itemId: null,
        quantity: currentQty,
        wasReplaced: true,
        originalItemId: cleanInitialId,
        originalItemName: originalName
      };
    }

    const nextTargetId = String(rep.replacementItemId || '').trim();
    if (!nextTargetId) {
      throw new Error(
        `Некорректная запись замены в deleted_item_replacements для "${currentId}": не указан replacement_item_id.`
      );
    }

    if (visitedIds.has(nextTargetId)) {
      throw new Error(
        `Обнаружена циклическая цепочка замен удалённых предметов: ${Array.from(visitedIds).join(' -> ')} -> ${nextTargetId}.`
      );
    }
    visitedIds.add(nextTargetId);

    // If nextTargetId itself was later deleted and replaced, continue walking the chain
    if (replacementsMap[nextTargetId]) {
      currentId = nextTargetId;
      continue;
    }

    const targetItem = catalogMap[nextTargetId];
    if (!targetItem) {
      throw new Error(
        `Предмет замены "${nextTargetId}" (назначенный вместо удалённого "${currentId}") не найден в едином каталоге предметов.`
      );
    }

    const resolvedType: 'item' | 'lootbox' = targetItem.category === 'chests' ? 'lootbox' : 'item';
    return {
      type: resolvedType,
      itemId: targetItem.id,
      targetItem,
      quantity: currentQty,
      wasReplaced: true,
      originalItemId: cleanInitialId,
      originalItemName: originalName
    };
  }

  throw new Error(
    `Превышена максимальная глубина цепочки замен (${MAX_REPLACEMENT_CHAIN_DEPTH}) для удалённого предмета "${cleanInitialId}".`
  );
}

/**
 * Cryptographically uniform integer quantity roll in [minQty, maxQty] inclusive.
 */
export function rollRewardQuantity(minQty: number, maxQty?: number | null): number {
  const min = Math.max(1, Math.trunc(Number(minQty) || 1));
  const max =
    maxQty !== undefined && maxQty !== null && Number.isFinite(Number(maxQty))
      ? Math.max(min, Math.trunc(Number(maxQty)))
      : min;

  if (min === max) {
    return min;
  }
  return crypto.randomInt(min, max + 1);
}

/**
 * Pure server-side cryptographic drop evaluator for an immutable `LootboxRuleSnapshot`.
 * Strictly uses `crypto.randomInt` and supports both `'independent'` and `'single_weighted'` modes.
 */
export function evaluateLootboxDrop(
  snapshot: LootboxRuleSnapshot,
  options: {
    catalogMap: Record<string, ItemDefinition>;
    replacementsMap?: Record<string, DeletedItemReplacementRecord>;
  }
): LootboxEvaluationResult {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Невозможно выполнить розыгрыш: снимок правил лутбокса отсутствует.');
  }

  const snapItemId = (snapshot as any)?.lootboxItemId || '';
  if (!isValidLootboxRuleSnapshot(snapItemId, snapshot)) {
    throw new Error(
      `Снимок правил лутбокса "${snapItemId}" повреждён или его SHA-256 хеш не совпадает с каноническими правилами.`
    );
  }

  const catalogMap = options.catalogMap || {};
  const replacementsMap = options.replacementsMap || {};
  const rawSelectedEntries: Array<{
    entryId: string;
    type: LootboxRewardType;
    itemId?: string;
    itemNameSnapshot?: string;
    minQty: number;
    maxQty?: number;
    isConsolation: boolean;
    revealSoundAssetId?: string;
  }> = [];

  let consolationAwarded = false;

  if (snapshot.dropMode === 'independent') {
    const fullScale = 100 * PROBABILITY_BASIS_POINTS_SCALE; // 1,000,000
    let hasGuaranteedHundredPercent = false;

    for (let i = 0; i < snapshot.rewards.length; i++) {
      const r = snapshot.rewards[i];
      const chanceBp = Math.round(
        Math.max(0, Math.min(100, Number(r.chancePercent ?? 0))) * PROBABILITY_BASIS_POINTS_SCALE
      );
      if (chanceBp >= fullScale) {
        hasGuaranteedHundredPercent = true;
      }

      let dropped = false;
      if (chanceBp <= 0) {
        dropped = false;
      } else if (chanceBp >= fullScale) {
        dropped = true;
      } else {
        const roll = crypto.randomInt(0, fullScale);
        dropped = roll < chanceBp;
      }

      if (dropped) {
        rawSelectedEntries.push({
          entryId: r.id || `rw_${i + 1}`,
          type: r.type,
          itemId: r.itemId,
          itemNameSnapshot: r.itemNameSnapshot,
          minQty: r.minQty,
          maxQty: r.maxQty,
          isConsolation: false,
          revealSoundAssetId: r.revealSoundAssetId
        });
      }
    }

    if (
      rawSelectedEntries.length === 0 &&
      !hasGuaranteedHundredPercent &&
      snapshot.consolationPrize &&
      snapshot.consolationPrize.enabled
    ) {
      const cp = snapshot.consolationPrize;
      consolationAwarded = true;
      rawSelectedEntries.push({
        entryId: 'consolation_prize',
        type: cp.type,
        itemId: cp.itemId,
        itemNameSnapshot: cp.itemNameSnapshot,
        minQty: cp.minQty,
        maxQty: cp.maxQty,
        isConsolation: true,
        revealSoundAssetId: cp.revealSoundAssetId
      });
    }
  } else if (snapshot.dropMode === 'single_weighted') {
    const scaledWeights = snapshot.rewards.map(r => {
      const w = Math.round(Number(r.weight ?? 0) * PROBABILITY_BASIS_POINTS_SCALE);
      if (!Number.isSafeInteger(w) || w <= 0) {
        throw new Error(
          `Некорректный вес (${String(r.weight)}) в снимке правил лутбокса "${snapshot.lootboxItemId}".`
        );
      }
      return w;
    });

    const totalScaledWeight = scaledWeights.reduce((acc, w) => acc + w, 0);
    if (totalScaledWeight <= 0) {
      throw new Error(`Суммарный вес наград лутбокса "${snapshot.lootboxItemId}" должен быть строго больше 0.`);
    }

    const ticket = crypto.randomInt(0, totalScaledWeight);
    let cursor = 0;
    let chosenIdx = snapshot.rewards.length - 1;

    for (let i = 0; i < scaledWeights.length; i++) {
      cursor += scaledWeights[i];
      if (ticket < cursor) {
        chosenIdx = i;
        break;
      }
    }

    const chosen = snapshot.rewards[chosenIdx];
    rawSelectedEntries.push({
      entryId: chosen.id || `rw_${chosenIdx + 1}`,
      type: chosen.type,
      itemId: chosen.itemId,
      itemNameSnapshot: chosen.itemNameSnapshot,
      minQty: chosen.minQty,
      maxQty: chosen.maxQty,
      isConsolation: false,
      revealSoundAssetId: chosen.revealSoundAssetId
    });
  } else {
    throw new Error(`Неподдерживаемый режим выпадения "${String(snapshot.dropMode)}".`);
  }

  const evaluatedRewards: EvaluatedLootboxReward[] = [];
  let totalCreditsGranted = 0;
  let totalXpGranted = 0;

  for (const selected of rawSelectedEntries) {
    const rolledQty = rollRewardQuantity(selected.minQty, selected.maxQty);

    if (selected.type === 'credits') {
      totalCreditsGranted += rolledQty;
      evaluatedRewards.push({
        entryId: selected.entryId,
        type: 'credits',
        itemName: `${rolledQty} кредитов`,
        icon: '💰',
        quantity: rolledQty,
        isConsolation: selected.isConsolation,
        ...(selected.revealSoundAssetId ? { revealSoundAssetId: selected.revealSoundAssetId } : {})
      });
    } else if (selected.type === 'xp') {
      totalXpGranted += rolledQty;
      evaluatedRewards.push({
        entryId: selected.entryId,
        type: 'xp',
        itemName: `${rolledQty} XP`,
        icon: '⭐',
        quantity: rolledQty,
        isConsolation: selected.isConsolation,
        ...(selected.revealSoundAssetId ? { revealSoundAssetId: selected.revealSoundAssetId } : {})
      });
    } else if (selected.type === 'item' || selected.type === 'lootbox') {
      if (selected.type === 'lootbox' && !snapshot.allowNestedLootboxes) {
        throw new Error(
          `В снимке правил лутбокса "${snapshot.lootboxItemId}" запрещено выпадение вложенных лутбоксов (allowNestedLootboxes = false).`
        );
      }

      const resolved = resolveDeletedItemReplacement(
        String(selected.itemId || ''),
        rolledQty,
        replacementsMap,
        catalogMap,
        selected.type
      );

      if (resolved.type === 'credits') {
        totalCreditsGranted += resolved.quantity;
        evaluatedRewards.push({
          entryId: selected.entryId,
          type: 'credits',
          itemName: `${resolved.quantity} кредитов`,
          icon: '💰',
          quantity: resolved.quantity,
          isConsolation: selected.isConsolation,
          wasReplaced: true,
          originalItemId: resolved.originalItemId,
          originalItemName: resolved.originalItemName || selected.itemNameSnapshot,
          ...(selected.revealSoundAssetId ? { revealSoundAssetId: selected.revealSoundAssetId } : {})
        });
      } else {
        const targetDef = resolved.targetItem!;
        if (resolved.type === 'lootbox' && !snapshot.allowNestedLootboxes) {
          throw new Error(
            `В снимке правил лутбокса "${snapshot.lootboxItemId}" запрещено выпадение вложенных лутбоксов.`
          );
        }

        evaluatedRewards.push({
          entryId: selected.entryId,
          type: resolved.type,
          itemId: targetDef.id,
          itemName: targetDef.name,
          rarity: targetDef.rarity,
          icon: targetDef.icon,
          quantity: resolved.quantity,
          isConsolation: selected.isConsolation,
          ...(resolved.wasReplaced
            ? {
                wasReplaced: true,
                originalItemId: resolved.originalItemId,
                originalItemName: resolved.originalItemName || selected.itemNameSnapshot
              }
            : {}),
          ...(selected.revealSoundAssetId ? { revealSoundAssetId: selected.revealSoundAssetId } : {})
        });
      }
    }
  }

  return {
    lootboxItemId: snapshot.lootboxItemId,
    snapshotHash: snapshot.snapshotHash,
    snapshotVersion: snapshot.version,
    dropMode: snapshot.dropMode,
    isEmptyDrop: evaluatedRewards.length === 0,
    consolationAwarded,
    rewards: evaluatedRewards,
    totalCreditsGranted,
    totalXpGranted
  };
}

/**
 * Pure server-side Monte Carlo drop simulator for the Admin Lootbox Constructor.
 * Uses the exact same `evaluateLootboxDrop` math and `crypto.randomInt` without mutating any DB state.
 */
export function simulateLootboxDrops(
  lootboxItem: Pick<ItemDefinition, 'id' | 'name' | 'description' | 'pawnValue'>,
  candidateConfig: Partial<LootboxRuleConfig>,
  iterations: number,
  catalogMap: Record<string, ItemDefinition>,
  replacementsMap: Record<string, DeletedItemReplacementRecord> = {}
): LootboxSimulationResult {
  const cleanIterations = Math.trunc(Number(iterations));
  if (!Number.isSafeInteger(cleanIterations) || cleanIterations < 1 || cleanIterations > MAX_SIMULATION_ITERATIONS) {
    throw new Error(
      `Количество симуляций должно быть целым числом от 1 до ${MAX_SIMULATION_ITERATIONS} (указано: ${String(iterations)}).`
    );
  }

  const validation = validateLootboxRuleConfig(lootboxItem.id, candidateConfig, catalogMap);
  if (!validation.valid || !validation.normalizedConfig) {
    throw new Error(`Ошибка валидации правил лутбокса для симуляции: ${validation.errors.join(' ')}`);
  }

  const normalizedConfig = validation.normalizedConfig;
  const tempSnapshot = createLootboxRuleSnapshot({
    id: lootboxItem.id,
    name: lootboxItem.name || lootboxItem.id,
    description: lootboxItem.description || '',
    pawnValue: lootboxItem.pawnValue,
    lootboxConfig: normalizedConfig
  });

  const breakdownMap = new Map<string, LootboxSimulationRewardBreakdown>();
  normalizedConfig.rewards.forEach((r, idx) => {
    const entryId = r.id || `rw_${idx + 1}`;
    const theoreticalProb = validation.computedProbabilitiesPercent?.[idx] ?? 0;
    const itemLabel =
      r.type === 'credits'
        ? `Кредиты (${r.minQty}${r.maxQty && r.maxQty > r.minQty ? `–${r.maxQty}` : ''})`
        : r.type === 'xp'
        ? `Опыт XP (${r.minQty}${r.maxQty && r.maxQty > r.minQty ? `–${r.maxQty}` : ''})`
        : catalogMap[r.itemId || '']?.name || r.itemNameSnapshot || r.itemId || entryId;

    breakdownMap.set(entryId, {
      entryId,
      type: r.type,
      ...(r.itemId ? { itemId: r.itemId } : {}),
      label: itemLabel,
      minQty: r.minQty,
      maxQty: r.maxQty ?? r.minQty,
      theoreticalProbabilityPercent: theoreticalProb,
      hitsCount: 0,
      empiricalHitRatePercent: 0,
      totalQuantityGranted: 0,
      avgQuantityPerOpen: 0
    });
  });

  if (normalizedConfig.consolationPrize && normalizedConfig.consolationPrize.enabled) {
    const cp = normalizedConfig.consolationPrize;
    const cpLabel =
      cp.type === 'credits'
        ? `Утешительный приз: Кредиты (${cp.minQty}${cp.maxQty && cp.maxQty > cp.minQty ? `–${cp.maxQty}` : ''})`
        : cp.type === 'xp'
        ? `Утешительный приз: XP (${cp.minQty}${cp.maxQty && cp.maxQty > cp.minQty ? `–${cp.maxQty}` : ''})`
        : `Утешительный приз: ${catalogMap[cp.itemId || '']?.name || cp.itemNameSnapshot || cp.itemId}`;

    breakdownMap.set('consolation_prize', {
      entryId: 'consolation_prize',
      type: cp.type,
      ...(cp.itemId ? { itemId: cp.itemId } : {}),
      label: cpLabel,
      minQty: cp.minQty,
      maxQty: cp.maxQty ?? cp.minQty,
      theoreticalProbabilityPercent: validation.emptyDropProbabilityPercent ?? 0,
      hitsCount: 0,
      empiricalHitRatePercent: 0,
      totalQuantityGranted: 0,
      avgQuantityPerOpen: 0
    });
  }

  let emptyOpensCount = 0;
  let consolationTriggersCount = 0;
  let totalCreditsGranted = 0;
  let totalXpGranted = 0;

  for (let i = 0; i < cleanIterations; i++) {
    const evalRes = evaluateLootboxDrop(tempSnapshot, { catalogMap, replacementsMap });
    if (evalRes.isEmptyDrop) {
      emptyOpensCount += 1;
    }
    if (evalRes.consolationAwarded) {
      consolationTriggersCount += 1;
    }
    totalCreditsGranted += evalRes.totalCreditsGranted;
    totalXpGranted += evalRes.totalXpGranted;

    for (const rw of evalRes.rewards) {
      const stat = breakdownMap.get(rw.entryId);
      if (stat) {
        stat.hitsCount += 1;
        stat.totalQuantityGranted += rw.quantity;
      }
    }
  }

  const rewardBreakdown: LootboxSimulationRewardBreakdown[] = Array.from(breakdownMap.values()).map(stat => ({
    ...stat,
    empiricalHitRatePercent: roundTo4Decimals((stat.hitsCount / cleanIterations) * 100),
    avgQuantityPerOpen: roundTo4Decimals(stat.totalQuantityGranted / cleanIterations)
  }));

  return {
    lootboxItemId: lootboxItem.id,
    iterations: cleanIterations,
    dropMode: normalizedConfig.dropMode,
    snapshotHash: normalizedConfig.snapshotHash,
    emptyOpensCount,
    emptyOpensPercent: roundTo4Decimals((emptyOpensCount / cleanIterations) * 100),
    consolationTriggersCount,
    consolationTriggersPercent: roundTo4Decimals((consolationTriggersCount / cleanIterations) * 100),
    totalCreditsGranted,
    avgCreditsPerOpen: roundTo4Decimals(totalCreditsGranted / cleanIterations),
    totalXpGranted,
    avgXpPerOpen: roundTo4Decimals(totalXpGranted / cleanIterations),
    rewardBreakdown
  };
}

/**
 * Validates and normalizes `LootboxPresentationConfig` (idle/open animations and sound overrides).
 * Note: Presentation config never affects `snapshotHash` or drop rules.
 */
export function validateLootboxPresentationConfig(
  input: unknown
): { valid: boolean; errors: string[]; normalized?: LootboxPresentationConfig } {
  if (input === undefined || input === null) {
    return { valid: true, errors: {}, normalized: {} } as any;
  }
  if (typeof input !== 'object') {
    return { valid: false, errors: ['presentationConfig должен быть объектом.'] };
  }

  const raw = input as Record<string, any>;
  const errors: string[] = [];

  const validPresets = ['classic_mafia', 'golden_vault', 'police_archive', 'neon_syndicate'];
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

  const validateAnim = (label: string, anim: any): LootboxSequenceAnimation | undefined => {
    if (anim === undefined || anim === null) return undefined;
    if (typeof anim !== 'object') {
      errors.push(`${label}: конфигурация анимации должна быть объектом.`);
      return undefined;
    }
    const mode = anim.mode === 'custom_frames' ? 'custom_frames' : anim.mode === 'preset' ? 'preset' : null;
    if (!mode) {
      errors.push(`${label}: режим анимации (mode) должен быть "preset" или "custom_frames".`);
      return undefined;
    }

    const fps = Number(anim.fps ?? 12);
    if (!Number.isFinite(fps) || fps < 1 || fps > 60) {
      errors.push(`${label}: частота кадров (fps) должна быть от 1 до 60.`);
    }

    let presetId: LootboxSequenceAnimation['presetId'];
    if (anim.presetId !== undefined && anim.presetId !== null && anim.presetId !== '') {
      if (!validPresets.includes(String(anim.presetId))) {
        errors.push(`${label}: неизвестный пресет анимации "${String(anim.presetId)}".`);
      } else {
        presetId = anim.presetId;
      }
    }

    const frames: AnimationFrameSpec[] = [];
    if (Array.isArray(anim.frames)) {
      if (anim.frames.length > 60) {
        errors.push(`${label}: количество кадров не может превышать 60.`);
      }
      anim.frames.forEach((f: any, idx: number) => {
        if (!f || typeof f !== 'object' || typeof f.imageUrl !== 'string' || !f.imageUrl.trim()) {
          errors.push(`${label} (кадр #${idx + 1}): необходимо указать корректный imageUrl.`);
          return;
        }
        frames.push({
          id: typeof f.id === 'string' && f.id.trim() ? f.id.trim() : `frame_${idx + 1}`,
          imageUrl: f.imageUrl.trim(),
          order: typeof f.order === 'number' && Number.isFinite(f.order) ? Math.trunc(f.order) : idx,
          ...(typeof f.durationMs === 'number' && f.durationMs > 0 ? { durationMs: Math.trunc(f.durationMs) } : {})
        });
      });
    } else if (mode === 'custom_frames') {
      errors.push(`${label}: для режима "custom_frames" необходимо передать массив кадров (frames).`);
    }

    if (mode === 'custom_frames' && frames.length === 0) {
      errors.push(`${label}: для режима "custom_frames" требуется хотя бы один кадр.`);
    }

    return {
      mode,
      ...(presetId ? { presetId } : {}),
      fps: Number.isFinite(fps) ? Math.max(1, Math.min(60, Math.round(fps))) : 12,
      frames
    };
  };

  const idleAnimation = validateAnim('idleAnimation', raw.idleAnimation);
  const openAnimation = validateAnim('openAnimation', raw.openAnimation);

  let openSoundAssetId: string | null | undefined;
  if (raw.openSoundAssetId !== undefined) {
    if (raw.openSoundAssetId === null || raw.openSoundAssetId === '') {
      openSoundAssetId = null;
    } else if (typeof raw.openSoundAssetId === 'string') {
      openSoundAssetId = raw.openSoundAssetId.trim();
    } else {
      errors.push('openSoundAssetId должен быть строкой или null.');
    }
  }

  let rewardCategorySoundOverrides: Partial<Record<LootboxSoundCategory, string>> | undefined;
  if (raw.rewardCategorySoundOverrides !== undefined && raw.rewardCategorySoundOverrides !== null) {
    if (typeof raw.rewardCategorySoundOverrides !== 'object' || Array.isArray(raw.rewardCategorySoundOverrides)) {
      errors.push('rewardCategorySoundOverrides должен быть объектом.');
    } else {
      rewardCategorySoundOverrides = {};
      for (const [k, v] of Object.entries(raw.rewardCategorySoundOverrides)) {
        if (!validSoundCategories.includes(k as LootboxSoundCategory)) {
          errors.push(`Неизвестная звуковая категория "${k}" в rewardCategorySoundOverrides.`);
        } else if (typeof v === 'string' && v.trim()) {
          rewardCategorySoundOverrides[k as LootboxSoundCategory] = v.trim();
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    normalized: {
      ...(idleAnimation ? { idleAnimation } : {}),
      ...(openAnimation ? { openAnimation } : {}),
      ...(openSoundAssetId !== undefined ? { openSoundAssetId } : {}),
      ...(rewardCategorySoundOverrides ? { rewardCategorySoundOverrides } : {})
    }
  };
}

