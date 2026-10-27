import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Upload,
  Film,
  Music,
  ChevronUp,
  ChevronDown,
  Lock,
  ShieldAlert,
  Coins,
  Trophy,
  Gift,
  Layers,
  Info,
  Check,
  X,
  Eye,
  Dice5,
  Hash,
  FileAudio,
  Image as ImageIcon
} from 'lucide-react';
import {
  ItemDefinition,
  ItemRarity,
  LootboxDropMode,
  LootboxRewardType,
  LootboxRewardEntry,
  LootboxConsolationPrize,
  LootboxRuleConfig,
  LootboxPresentationConfig,
  LootboxSequenceAnimation,
  AnimationFrameSpec,
  LootboxSoundCategory,
  LootboxMediaAssetRecord,
  RARITY_CONFIG,
  SOUND_CATEGORY_CONFIG,
  getAdminSelectableItems,
  syncItemsCatalog
} from '../data/items';
import { sounds } from '../utils/audio';

interface AdminLootboxBuilderViewProps {
  items: ItemDefinition[];
  onItemsChange: (updatedItems: ItemDefinition[]) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onRefreshAudit?: () => void;
}

type BuilderSubTab = 'general' | 'rewards' | 'simulator' | 'animations' | 'sounds';

const LEGACY_SYSTEM_CHEST_IDS = new Set(['chest_novice', 'chest_don', 'chest_sheriff']);

const LOOTBOX_ICON_PRESETS = ['🧰', '💼', '🗃️', '🎁', '📦', '👑', '💎', '⚜️', '🗝️', '🛡️', '🎰', '🏆'];

const ANIMATION_PRESETS: Array<{
  id: 'classic_mafia' | 'golden_vault' | 'police_archive' | 'neon_syndicate';
  title: string;
  subtitle: string;
  accentClass: string;
  idleFrames: string[];
  openFrames: string[];
}> = [
  {
    id: 'classic_mafia',
    title: 'Классический нуар',
    subtitle: 'Тёмный контрабандный ящик с янтарным свечением замка',
    accentClass: 'from-amber-950/80 to-zinc-900 border-amber-600/60 text-amber-300',
    idleFrames: ['🧰', '🔒', '🧰', '✨'],
    openFrames: ['🧰', '🗝️', '🔓', '💥', '🎁']
  },
  {
    id: 'golden_vault',
    title: 'Золотой сейф Рокфеллера',
    subtitle: 'Массивный банковский сейф Синдиката с золотыми слитками',
    accentClass: 'from-yellow-950/80 to-amber-950/70 border-yellow-500/70 text-yellow-200',
    idleFrames: ['💼', '⚜️', '💼', '👑'],
    openFrames: ['💼', '⚙️', '🔓', '🪙', '👑']
  },
  {
    id: 'police_archive',
    title: 'Полицейский архив',
    subtitle: 'Секретный дипломат комиссара с печатью особого отдела',
    accentClass: 'from-blue-950/80 to-slate-950 border-blue-500/60 text-blue-200',
    idleFrames: ['🗃️', '🛡️', '🗃️', '📜'],
    openFrames: ['🗃️', '🔍', '🔓', '📂', '🎖️']
  },
  {
    id: 'neon_syndicate',
    title: 'Неоновый Синдикат',
    subtitle: 'Кибер-контейнер с голографическим шифром и импульсом',
    accentClass: 'from-purple-950/80 to-cyan-950/70 border-cyan-500/60 text-cyan-200',
    idleFrames: ['📦', '⚡', '📦', '💠'],
    openFrames: ['📦', '⚡', '🔓', '🌟', '💎']
  }
];

const SOUND_CATEGORIES_ORDER: LootboxSoundCategory[] = [
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

interface SimulationBreakdownRow {
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

interface SimulationResultData {
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
  rewardBreakdown: SimulationBreakdownRow[];
}

function createDefaultAnimation(mode: 'idle' | 'open'): LootboxSequenceAnimation {
  return {
    mode: 'preset',
    presetId: 'classic_mafia',
    fps: mode === 'idle' ? 6 : 12,
    frames: []
  };
}

function buildDefaultDraftLootbox(): ItemDefinition {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return {
    id: `lb_custom_${randomSuffix}`,
    name: 'Сундук Синдиката',
    category: 'chests',
    rarity: 'rare',
    cost: 200,
    pawnValue: 100,
    icon: '🧰',
    usable: true,
    consumable: true,
    inShop: true,
    adminHidden: false,
    featured: false,
    discountPercent: 0,
    description: 'Контрабандный кейс с трофеями семьи. Открывает награду согласно неизменяемому снимку правил.',
    effectDescription: 'Открывает случайную награду из пула лутбокса.',
    isCustomLootbox: true,
    lootboxConfig: {
      version: 1,
      snapshotHash: '',
      dropMode: 'single_weighted',
      allowNestedLootboxes: false,
      rewards: [
        {
          id: 'rw_1',
          type: 'credits',
          minQty: 100,
          maxQty: 250,
          weight: 60
        },
        {
          id: 'rw_2',
          type: 'xp',
          minQty: 50,
          maxQty: 120,
          weight: 40
        }
      ],
      consolationPrize: null,
      updatedAt: new Date().toISOString()
    },
    presentationConfig: {
      idleAnimation: createDefaultAnimation('idle'),
      openAnimation: createDefaultAnimation('open'),
      openSoundAssetId: null,
      rewardCategorySoundOverrides: {}
    }
  };
}

export const AdminLootboxBuilderView: React.FC<AdminLootboxBuilderViewProps> = ({
  items,
  onItemsChange,
  onNotify,
  onRefreshAudit
}) => {
  const [lootboxes, setLootboxes] = useState<ItemDefinition[]>([]);
  const [mediaAssets, setMediaAssets] = useState<LootboxMediaAssetRecord[]>([]);
  const [soundDefaults, setSoundDefaults] = useState<Partial<Record<LootboxSoundCategory, string>>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [savingBasic, setSavingBasic] = useState<boolean>(false);
  const [savingRules, setSavingRules] = useState<boolean>(false);
  const [savingPresentation, setSavingPresentation] = useState<boolean>(false);

  // Selected lootbox ID or 'new_draft' when creating a brand-new custom lootbox
  const [selectedId, setSelectedId] = useState<string>('chest_novice');
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<BuilderSubTab>('general');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Working form state for the currently selected lootbox
  const [draftItem, setDraftItem] = useState<ItemDefinition>(() => buildDefaultDraftLootbox());
  const [hasUnsavedBasic, setHasUnsavedBasic] = useState<boolean>(false);
  const [hasUnsavedRules, setHasUnsavedRules] = useState<boolean>(false);
  const [hasUnsavedPresentation, setHasUnsavedPresentation] = useState<boolean>(false);

  // Simulator state
  const [simIterations, setSimIterations] = useState<number>(1000);
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<SimulationResultData | null>(null);

  // Animation preview state
  const [previewPhase, setPreviewPhase] = useState<'idle' | 'opening' | 'opened'>('idle');
  const [previewFrameIdx, setPreviewFrameIdx] = useState<number>(0);
  const [uploadingFrameTarget, setUploadingFrameTarget] = useState<'idle' | 'open' | null>(null);
  const [framePickerTarget, setFramePickerTarget] = useState<'idle' | 'open' | null>(null);

  // Sound library upload & playback state
  const [uploadingSound, setUploadingSound] = useState<boolean>(false);
  const [soundUploadTitle, setSoundUploadTitle] = useState<string>('');
  const [soundUploadRewardType, setSoundUploadRewardType] = useState<LootboxRewardType | 'open' | 'consolation'>('open');
  const [soundUploadRarity, setSoundUploadRarity] = useState<ItemRarity>('common');
  const [soundUploadManualCategory, setSoundUploadManualCategory] = useState<string>('');
  const [playingAssetId, setPlayingAssetId] = useState<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Custom lootbox delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deleteReplacementType, setDeleteReplacementType] = useState<'credits' | 'item' | 'lootbox'>('credits');
  const [deleteReplacementItemId, setDeleteReplacementItemId] = useState<string>('');
  const [deleteReplacementQty, setDeleteReplacementQty] = useState<number>(200);
  const [isDeletingLootbox, setIsDeletingLootbox] = useState<boolean>(false);

  // Unsaved switch confirmation state
  const [pendingSelectTarget, setPendingSelectTarget] = useState<{ id: string; isNew: boolean } | null>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('mafia_auth_token');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
  };

  const hasAnyUnsavedChanges = hasUnsavedBasic || hasUnsavedRules || hasUnsavedPresentation;

  // Load all lootboxes, media assets, and sound defaults from server
  const fetchConstructorData = async (preferredId?: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/lootboxes', {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось загрузить данные конструктора лутбоксов.');
      }

      const loadedLootboxes: ItemDefinition[] = Array.isArray(data.lootboxes) ? data.lootboxes : [];
      const loadedItems: ItemDefinition[] = Array.isArray(data.items) ? data.items : items;
      setLootboxes(loadedLootboxes);
      setMediaAssets(Array.isArray(data.mediaAssets) ? data.mediaAssets : []);
      setSoundDefaults(data.soundDefaults || {});

      if (Array.isArray(data.items)) {
        onItemsChange(loadedItems);
        syncItemsCatalog(loadedItems);
      }

      const targetId = preferredId || selectedId;
      const found = loadedLootboxes.find(lb => lb.id === targetId) || loadedLootboxes[0];
      if (found && !isCreatingNew) {
        applyLootboxToDraft(found, false);
        setSelectedId(found.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки конструктора лутбоксов';
      onNotify('error', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConstructorData();
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
    };
  }, []);

  const applyLootboxToDraft = (lb: ItemDefinition, creatingNew: boolean) => {
    const defaultCfg: LootboxRuleConfig = lb.lootboxConfig
      ? {
          ...lb.lootboxConfig,
          rewards: (lb.lootboxConfig.rewards || []).map(r => ({ ...r })),
          consolationPrize: lb.lootboxConfig.consolationPrize
            ? { ...lb.lootboxConfig.consolationPrize }
            : null
        }
      : {
          version: 1,
          snapshotHash: '',
          dropMode: 'single_weighted',
          allowNestedLootboxes: false,
          rewards: [{ id: 'rw_1', type: 'credits', minQty: 100, maxQty: 100, weight: 100 }],
          consolationPrize: null,
          updatedAt: new Date().toISOString()
        };

    const defaultPres: LootboxPresentationConfig = {
      idleAnimation: lb.presentationConfig?.idleAnimation
        ? {
            ...lb.presentationConfig.idleAnimation,
            frames: (lb.presentationConfig.idleAnimation.frames || []).map(f => ({ ...f }))
          }
        : createDefaultAnimation('idle'),
      openAnimation: lb.presentationConfig?.openAnimation
        ? {
            ...lb.presentationConfig.openAnimation,
            frames: (lb.presentationConfig.openAnimation.frames || []).map(f => ({ ...f }))
          }
        : createDefaultAnimation('open'),
      openSoundAssetId: lb.presentationConfig?.openSoundAssetId ?? null,
      rewardCategorySoundOverrides: { ...(lb.presentationConfig?.rewardCategorySoundOverrides || {}) }
    };

    setDraftItem({
      ...lb,
      lootboxConfig: defaultCfg,
      presentationConfig: defaultPres
    });
    setIsCreatingNew(creatingNew);
    setHasUnsavedBasic(creatingNew);
    setHasUnsavedRules(creatingNew);
    setHasUnsavedPresentation(false);
    setSimResult(null);
    setPreviewPhase('idle');
    setPreviewFrameIdx(0);
  };

  const handleSelectLootbox = (id: string, isNew: boolean = false) => {
    if (hasAnyUnsavedChanges) {
      setPendingSelectTarget({ id, isNew });
      return;
    }
    proceedSelectLootbox(id, isNew);
  };

  const proceedSelectLootbox = (id: string, isNew: boolean) => {
    setPendingSelectTarget(null);
    sounds.playTick();
    if (isNew) {
      const freshDraft = buildDefaultDraftLootbox();
      applyLootboxToDraft(freshDraft, true);
      setSelectedId(freshDraft.id);
      setActiveSubTab('general');
      return;
    }
    const target = lootboxes.find(lb => lb.id === id);
    if (target) {
      applyLootboxToDraft(target, false);
      setSelectedId(target.id);
    }
  };

  // Filtered sidebar list
  const filteredLootboxes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return lootboxes.filter(lb => {
      if (!q) return true;
      return (
        lb.name.toLowerCase().includes(q) ||
        lb.id.toLowerCase().includes(q) ||
        (lb.description || '').toLowerCase().includes(q)
      );
    });
  }, [lootboxes, searchQuery]);

  // Image and audio assets separated
  const imageAssets = useMemo(
    () => mediaAssets.filter(a => a.assetType === 'image'),
    [mediaAssets]
  );
  const audioAssets = useMemo(
    () => mediaAssets.filter(a => a.assetType === 'audio'),
    [mediaAssets]
  );

  // Selectable regular items (non-chests) and selectable nested lootboxes
  const regularCatalogItems = useMemo(
    () => items.filter(i => i.category !== 'chests'),
    [items]
  );

  const isCurrentSystemChest = LEGACY_SYSTEM_CHEST_IDS.has(draftItem.id);

  // ============================================================================
  // CLIENT-SIDE RULE VALIDATION & PROBABILITY CALCULATIONS
  // ============================================================================
  const ruleDiagnostics = useMemo(() => {
    const cfg = draftItem.lootboxConfig;
    const errors: string[] = [];
    if (!cfg) {
      return {
        valid: false,
        errors: ['Отсутствует конфигурация правил выпадения.'],
        computedProbabilities: [] as number[],
        emptyDropPercent: 0,
        hasGuaranteed100: false,
        totalWeight: 0
      };
    }

    const rewards = cfg.rewards || [];
    if (rewards.length === 0) {
      errors.push('Добавьте хотя бы одну награду в список правил лутбокса.');
    }

    const totalWeight = rewards.reduce(
      (sum, r) => sum + (typeof r.weight === 'number' && r.weight > 0 ? r.weight : 0),
      0
    );

    let hasGuaranteed100 = false;
    const computedProbabilities: number[] = [];

    // Cycle check helper for nested lootboxes
    const checkNestedCycle = (targetLootboxId: string): boolean => {
      if (targetLootboxId === draftItem.id) return true;
      const visited = new Set<string>([draftItem.id]);
      const queue: string[] = [targetLootboxId];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (curr === draftItem.id) return true;
        if (visited.has(curr)) continue;
        visited.add(curr);
        const lbDef = lootboxes.find(l => l.id === curr);
        const childRewards = lbDef?.lootboxConfig?.rewards || [];
        for (const cr of childRewards) {
          if (cr.type === 'lootbox' && cr.itemId) {
            if (cr.itemId === draftItem.id) return true;
            queue.push(cr.itemId);
          }
        }
      }
      return false;
    };

    rewards.forEach((rw, idx) => {
      const rowLabel = `Награда #${idx + 1}`;
      const minQ = Number(rw.minQty);
      const maxQ = rw.maxQty !== undefined ? Number(rw.maxQty) : minQ;
      if (!Number.isInteger(minQ) || minQ < 1) {
        errors.push(`${rowLabel}: минимальное количество должно быть целым числом >= 1.`);
      }
      if (!Number.isInteger(maxQ) || maxQ < minQ) {
        errors.push(`${rowLabel}: максимальное количество должно быть >= минимального (${minQ}).`);
      }

      if (rw.type === 'item') {
        if (!rw.itemId) {
          errors.push(`${rowLabel}: выберите предмет из единого каталога.`);
        } else {
          const found = items.find(i => i.id === rw.itemId);
          if (!found) {
            errors.push(`${rowLabel}: предмет "${rw.itemId}" не найден в едином каталоге.`);
          } else if (found.category === 'chests') {
            errors.push(`${rowLabel}: "${found.name}" является сундуком — укажите тип награды «Вложенный лутбокс».`);
          }
        }
      } else if (rw.type === 'lootbox') {
        if (!cfg.allowNestedLootboxes) {
          errors.push(`${rowLabel}: включите опцию «Разрешить вложенные лутбоксы» для выдачи сундука внутри сундука.`);
        }
        if (!rw.itemId) {
          errors.push(`${rowLabel}: выберите вложенный лутбокс.`);
        } else if (checkNestedCycle(rw.itemId)) {
          errors.push(
            `${rowLabel}: обнаружена циклическая ссылка лутбоксов (${draftItem.id} ⇄ ${rw.itemId}). Циклы запрещены.`
          );
        }
      }

      if (cfg.dropMode === 'independent') {
        const ch = Number(rw.chancePercent ?? 0);
        if (!Number.isFinite(ch) || ch < 0 || ch > 100) {
          errors.push(`${rowLabel}: шанс выпадения должен быть от 0% до 100%.`);
        }
        if (ch <= 0) {
          errors.push(`${rowLabel}: шанс выпадения должен быть больше 0%.`);
        }
        if (ch >= 100) {
          hasGuaranteed100 = true;
        }
        computedProbabilities.push(Math.max(0, Math.min(100, Number(ch.toFixed(4)))));
      } else {
        const w = Number(rw.weight ?? 0);
        if (!Number.isFinite(w) || w <= 0) {
          errors.push(`${rowLabel}: вес (weight) должен быть положительным числом > 0.`);
        }
        const pct = totalWeight > 0 ? Number(((w / totalWeight) * 100).toFixed(4)) : 0;
        computedProbabilities.push(pct);
      }
    });

    if (cfg.dropMode === 'single_weighted') {
      hasGuaranteed100 = rewards.length > 0;
      if (cfg.consolationPrize) {
        errors.push('Утешительный приз недоступен в режиме «Ровно одна награда по весам».');
      }
    } else if (cfg.consolationPrize && hasGuaranteed100) {
      errors.push('Утешительный приз недоступен, так как есть награда со 100% вероятностью.');
    }

    let emptyDropPercent = 0;
    if (cfg.dropMode === 'independent' && rewards.length > 0) {
      const emptyFraction = rewards.reduce((acc, r) => {
        const p = Math.max(0, Math.min(100, Number(r.chancePercent ?? 0))) / 100;
        return acc * (1 - p);
      }, 1);
      emptyDropPercent = Number((emptyFraction * 100).toFixed(4));
    }

    return {
      valid: errors.length === 0,
      errors,
      computedProbabilities,
      emptyDropPercent,
      hasGuaranteed100,
      totalWeight
    };
  }, [draftItem.id, draftItem.lootboxConfig, items, lootboxes]);

  // ============================================================================
  // LIVE ANIMATION PREVIEW ENGINE (IDLE LOOP & SINGLE-SHOT OPEN)
  // ============================================================================
  const currentPreviewAnim: LootboxSequenceAnimation = useMemo(() => {
    const pres = draftItem.presentationConfig;
    if (previewPhase === 'opening') {
      return pres?.openAnimation || createDefaultAnimation('open');
    }
    return pres?.idleAnimation || createDefaultAnimation('idle');
  }, [draftItem.presentationConfig, previewPhase]);

  const activePresetMeta = useMemo(() => {
    const presetId = currentPreviewAnim.presetId || 'classic_mafia';
    return ANIMATION_PRESETS.find(p => p.id === presetId) || ANIMATION_PRESETS[0];
  }, [currentPreviewAnim.presetId]);

  useEffect(() => {
    if (previewPhase === 'opened') return;

    const isCustomFrames =
      currentPreviewAnim.mode === 'custom_frames' &&
      Array.isArray(currentPreviewAnim.frames) &&
      currentPreviewAnim.frames.length > 0;

    const totalFrames = isCustomFrames
      ? currentPreviewAnim.frames.length
      : previewPhase === 'opening'
        ? activePresetMeta.openFrames.length
        : activePresetMeta.idleFrames.length;

    if (totalFrames <= 0) return;

    const safeIdx = previewFrameIdx % totalFrames;
    const customFrameSpec = isCustomFrames ? currentPreviewAnim.frames[safeIdx] : undefined;
    const fps = Math.max(1, Math.min(60, Number(currentPreviewAnim.fps || 8)));
    const frameDelayMs =
      customFrameSpec?.durationMs && customFrameSpec.durationMs > 0
        ? customFrameSpec.durationMs
        : Math.max(30, Math.round(1000 / fps));

    const timer = window.setTimeout(() => {
      if (previewPhase === 'opening') {
        // Single-shot playback for Open Animation
        if (safeIdx + 1 >= totalFrames) {
          setPreviewPhase('opened');
        } else {
          setPreviewFrameIdx(safeIdx + 1);
        }
      } else {
        // Looped playback for Idle Animation
        setPreviewFrameIdx((safeIdx + 1) % totalFrames);
      }
    }, frameDelayMs);

    return () => window.clearTimeout(timer);
  }, [previewPhase, previewFrameIdx, currentPreviewAnim, activePresetMeta]);

  // Play sound helper (uses uploaded audio asset or falls back to procedural WebAudio synth)
  const playSoundByAssetIdOrCategory = (assetId?: string | null, fallbackCategory?: LootboxSoundCategory) => {
    const resolvedAssetId =
      assetId ||
      (fallbackCategory && draftItem.presentationConfig?.rewardCategorySoundOverrides?.[fallbackCategory]) ||
      (fallbackCategory && soundDefaults[fallbackCategory]) ||
      null;

    if (resolvedAssetId) {
      const asset = audioAssets.find(a => a.id === resolvedAssetId);
      if (asset && asset.sourceUrl) {
        try {
          if (activeAudioRef.current) {
            activeAudioRef.current.pause();
          }
          const audio = new Audio(asset.sourceUrl);
          activeAudioRef.current = audio;
          setPlayingAssetId(asset.id);
          audio.onended = () => setPlayingAssetId(null);
          audio.onerror = () => setPlayingAssetId(null);
          audio.play().catch(() => {
            setPlayingAssetId(null);
            sounds.playTick();
          });
          return;
        } catch {
          // Fallback to synth below
        }
      }
    }
    sounds.playTick();
  };

  const handleTriggerPreviewOpen = () => {
    setPreviewFrameIdx(0);
    setPreviewPhase('opening');
    playSoundByAssetIdOrCategory(draftItem.presentationConfig?.openSoundAssetId, 'lootbox_open');
  };

  // ============================================================================
  // SAVE HANDLERS (CREATE, UPDATE BASIC, UPDATE RULES, UPDATE PRESENTATION)
  // ============================================================================
  const handleCreateNewLootbox = async () => {
    if (!draftItem.name.trim()) {
      onNotify('error', 'Укажите название лутбокса.');
      return;
    }
    if (!ruleDiagnostics.valid) {
      onNotify('error', ruleDiagnostics.errors[0] || 'Исправьте ошибки в правилах выпадения перед созданием.');
      setActiveSubTab('rewards');
      return;
    }

    setSavingBasic(true);
    try {
      const res = await fetch('/api/admin/lootboxes', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: draftItem.id,
          name: draftItem.name.trim(),
          rarity: draftItem.rarity,
          cost: draftItem.cost,
          pawnValue: draftItem.pawnValue,
          icon: draftItem.icon,
          description: draftItem.description,
          effectDescription: draftItem.effectDescription,
          inShop: draftItem.inShop,
          adminHidden: draftItem.adminHidden,
          featured: draftItem.featured,
          discountPercent: draftItem.discountPercent,
          lootboxConfig: draftItem.lootboxConfig,
          presentationConfig: draftItem.presentationConfig
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка создания лутбокса');

      sounds.playTick();
      onNotify('success', data.message || `Лутбокс «${ data.lootbox.name }» создан!`);
      setIsCreatingNew(false);
      setHasUnsavedBasic(false);
      setHasUnsavedRules(false);
      setHasUnsavedPresentation(false);
      await fetchConstructorData(data.lootbox.id);
      onRefreshAudit?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка создания лутбокса';
      onNotify('error', msg);
    } finally {
      setSavingBasic(false);
    }
  };

  const handleSaveBasicSettings = async () => {
    if (isCreatingNew) {
      await handleCreateNewLootbox();
      return;
    }
    if (!draftItem.name.trim()) {
      onNotify('error', 'Название лутбокса не может быть пустым.');
      return;
    }

    setSavingBasic(true);
    try {
      const res = await fetch(`/api/admin/lootboxes/${encodeURIComponent(draftItem.id)}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: draftItem.name.trim(),
          rarity: draftItem.rarity,
          cost: draftItem.cost,
          pawnValue: draftItem.pawnValue,
          icon: draftItem.icon,
          description: draftItem.description,
          effectDescription: draftItem.effectDescription,
          inShop: draftItem.inShop,
          adminHidden: draftItem.adminHidden,
          featured: draftItem.featured,
          discountPercent: draftItem.discountPercent
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения настроек лутбокса');

      sounds.playTick();
      setHasUnsavedBasic(false);
      onNotify('success', data.message || 'Основные параметры лутбокса сохранены.');
      await fetchConstructorData(draftItem.id);
      onRefreshAudit?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения основных параметров';
      onNotify('error', msg);
    } finally {
      setSavingBasic(false);
    }
  };

  const handleSaveRules = async () => {
    if (isCreatingNew) {
      await handleCreateNewLootbox();
      return;
    }
    if (!ruleDiagnostics.valid) {
      onNotify('error', ruleDiagnostics.errors[0] || 'Проверьте корректность правил выпадения.');
      return;
    }

    setSavingRules(true);
    try {
      const res = await fetch(`/api/admin/lootboxes/${encodeURIComponent(draftItem.id)}/rules`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          lootboxConfig: draftItem.lootboxConfig
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения правил выпадения');

      sounds.playTick();
      setHasUnsavedRules(false);
      onNotify('success', data.message || 'Правила выпадения успешно сохранены!');
      await fetchConstructorData(draftItem.id);
      onRefreshAudit?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения правил выпадения';
      onNotify('error', msg);
    } finally {
      setSavingRules(false);
    }
  };

  const handleSavePresentation = async () => {
    if (isCreatingNew) {
      await handleCreateNewLootbox();
      return;
    }

    setSavingPresentation(true);
    try {
      const res = await fetch(`/api/admin/lootboxes/${encodeURIComponent(draftItem.id)}/presentation`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          presentationConfig: draftItem.presentationConfig
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения оформления и звуков');

      sounds.playTick();
      setHasUnsavedPresentation(false);
      onNotify('success', data.message || 'Анимации и звуковое оформление сохранены.');
      await fetchConstructorData(draftItem.id);
      onRefreshAudit?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения оформления';
      onNotify('error', msg);
    } finally {
      setSavingPresentation(false);
    }
  };

  // ============================================================================
  // DELETE CUSTOM LOOTBOX WITH REPLACEMENT
  // ============================================================================
  const handleConfirmDeleteCustomLootbox = async () => {
    if (isCurrentSystemChest || !draftItem.isCustomLootbox) {
      onNotify('error', 'Базовые системные сундуки нельзя удалять.');
      return;
    }

    setIsDeletingLootbox(true);
    try {
      const res = await fetch(`/api/admin/lootboxes/${encodeURIComponent(draftItem.id)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          replacementType: deleteReplacementType,
          replacementItemId: deleteReplacementType === 'credits' ? null : deleteReplacementItemId,
          replacementQty: deleteReplacementQty
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка удаления пользовательского лутбокса');

      sounds.playTick();
      setDeleteModalOpen(false);
      setHasUnsavedBasic(false);
      setHasUnsavedRules(false);
      setHasUnsavedPresentation(false);
      onNotify('success', data.message || 'Лутбокс удалён с сохранением компенсации.');
      await fetchConstructorData('chest_novice');
      onRefreshAudit?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка удаления лутбокса';
      onNotify('error', msg);
    } finally {
      setIsDeletingLootbox(false);
    }
  };

  // ============================================================================
  // REWARDS LIST HELPERS
  // ============================================================================
  const updateRuleConfig = (updater: (prev: LootboxRuleConfig) => LootboxRuleConfig) => {
    setDraftItem(prev => {
      const currentCfg: LootboxRuleConfig = prev.lootboxConfig || {
        version: 1,
        snapshotHash: '',
        dropMode: 'single_weighted',
        allowNestedLootboxes: false,
        rewards: [],
        consolationPrize: null,
        updatedAt: new Date().toISOString()
      };
      const nextCfg = updater(currentCfg);
      // Automatically clear consolationPrize if switching to single_weighted or if any reward has 100% chance in independent mode
      const has100InIndependent =
        nextCfg.dropMode === 'independent' &&
        (nextCfg.rewards || []).some(r => Number(r.chancePercent ?? 0) >= 100);
      if (nextCfg.dropMode === 'single_weighted' || has100InIndependent) {
        nextCfg.consolationPrize = null;
      }
      return {
        ...prev,
        lootboxConfig: nextCfg
      };
    });
    setHasUnsavedRules(true);
  };

  const handleAddRewardEntry = (type: LootboxRewardType = 'credits') => {
    sounds.playTick();
    updateRuleConfig(cfg => {
      const nextIdx = (cfg.rewards?.length || 0) + 1;
      const selectableRegular = getAdminSelectableItems(regularCatalogItems);
      const selectableChests = lootboxes.filter(lb => lb.id !== draftItem.id && !lb.adminHidden);
      const defaultItemId =
        type === 'item'
          ? selectableRegular[0]?.id || regularCatalogItems[0]?.id || 'card_role_select'
          : type === 'lootbox'
            ? selectableChests[0]?.id || 'chest_novice'
            : undefined;

      const newEntry: LootboxRewardEntry = {
        id: `rw_${Date.now()}_${nextIdx}`,
        type,
        ...(defaultItemId ? { itemId: defaultItemId } : {}),
        minQty: type === 'credits' ? 100 : type === 'xp' ? 50 : 1,
        maxQty: type === 'credits' ? 200 : type === 'xp' ? 100 : 1,
        ...(cfg.dropMode === 'independent' ? { chancePercent: 25 } : { weight: 20 })
      };

      return {
        ...cfg,
        ...(type === 'lootbox' ? { allowNestedLootboxes: true } : {}),
        rewards: [...(cfg.rewards || []), newEntry]
      };
    });
  };

  const handleUpdateRewardEntry = (index: number, patch: Partial<LootboxRewardEntry>) => {
    updateRuleConfig(cfg => {
      const nextRewards = [...(cfg.rewards || [])];
      const existing = nextRewards[index];
      if (!existing) return cfg;

      const updated: LootboxRewardEntry = {
        ...existing,
        ...patch
      };

      // When changing reward type, populate a sensible default itemId if needed
      if (patch.type === 'item' && !updated.itemId) {
        const selectableRegular = getAdminSelectableItems(regularCatalogItems);
        updated.itemId = selectableRegular[0]?.id || regularCatalogItems[0]?.id || 'card_role_select';
        updated.minQty = 1;
        updated.maxQty = 1;
      } else if (patch.type === 'lootbox' && (!updated.itemId || updated.itemId === draftItem.id)) {
        const otherChest = lootboxes.find(lb => lb.id !== draftItem.id);
        updated.itemId = otherChest?.id || 'chest_novice';
        updated.minQty = 1;
        updated.maxQty = 1;
      } else if (patch.type === 'credits' || patch.type === 'xp') {
        delete updated.itemId;
      }

      nextRewards[index] = updated;
      return {
        ...cfg,
        ...(patch.type === 'lootbox' ? { allowNestedLootboxes: true } : {}),
        rewards: nextRewards
      };
    });
  };

  const handleMoveRewardEntry = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    updateRuleConfig(cfg => {
      const list = [...(cfg.rewards || [])];
      if (targetIdx < 0 || targetIdx >= list.length) return cfg;
      const temp = list[index];
      list[index] = list[targetIdx];
      list[targetIdx] = temp;
      return { ...cfg, rewards: list };
    });
  };

  const handleDeleteRewardEntry = (index: number) => {
    sounds.playTick();
    updateRuleConfig(cfg => ({
      ...cfg,
      rewards: (cfg.rewards || []).filter((_, i) => i !== index)
    }));
  };

  // ============================================================================
  // SIMULATOR HANDLER
  // ============================================================================
  const handleRunSimulation = async () => {
    if (!ruleDiagnostics.valid) {
      onNotify('error', ruleDiagnostics.errors[0] || 'Исправьте ошибки в правилах выпадения перед запуском симуляции.');
      return;
    }

    setSimRunning(true);
    try {
      const res = await fetch(`/api/admin/lootboxes/${encodeURIComponent(draftItem.id)}/simulate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          iterations: simIterations,
          lootboxConfig: draftItem.lootboxConfig,
          draftName: draftItem.name,
          draftRarity: draftItem.rarity
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка запуска симулятора');

      sounds.playTick();
      setSimResult(data.simulation);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка симуляции открытий';
      onNotify('error', msg);
    } finally {
      setSimRunning(false);
    }
  };

  // ============================================================================
  // ANIMATION FRAMES & SOUND UPLOAD HANDLERS
  // ============================================================================
  const updateSequenceAnimation = (
    target: 'idle' | 'open',
    updater: (prev: LootboxSequenceAnimation) => LootboxSequenceAnimation
  ) => {
    setDraftItem(prev => {
      const currentPres = prev.presentationConfig || {};
      const key = target === 'idle' ? 'idleAnimation' : 'openAnimation';
      const baseAnim = currentPres[key] || createDefaultAnimation(target);
      const nextAnim = updater(baseAnim);
      return {
        ...prev,
        presentationConfig: {
          ...currentPres,
          [key]: nextAnim
        }
      };
    });
    setHasUnsavedPresentation(true);
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`Не удалось прочитать файл ${file.name}`));
      reader.readAsDataURL(file);
    });

  const handleUploadFrameFiles = async (target: 'idle' | 'open', fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadingFrameTarget(target);
    try {
      const uploadedFrames: AnimationFrameSpec[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (file.size > 2 * 1024 * 1024) {
          throw new Error(`Файл «${file.name}» превышает лимит 2 МБ для одного кадра.`);
        }
        const dataUrl = await readFileAsDataUrl(file);
        const res = await fetch('/api/admin/lootboxes/media/upload', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            assetType: 'image',
            title: file.name.replace(/\.[^.]+$/, ''),
            sourceUrl: dataUrl,
            mimeType: file.type,
            category: target === 'open' ? 'frame_open' : 'frame_idle'
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Ошибка загрузки кадра ${file.name}`);

        if (Array.isArray(data.mediaAssets)) {
          setMediaAssets(data.mediaAssets);
        }
        uploadedFrames.push({
          id: data.asset.id,
          imageUrl: data.asset.sourceUrl,
          order: i
        });
      }

      updateSequenceAnimation(target, prev => {
        const merged = [...(prev.frames || []), ...uploadedFrames].map((f, idx) => ({
          ...f,
          order: idx
        }));
        return {
          ...prev,
          mode: 'custom_frames',
          frames: merged
        };
      });

      sounds.playTick();
      onNotify('success', `Загружено кадров в анимацию: ${uploadedFrames.length} шт.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки кадров анимации';
      onNotify('error', msg);
    } finally {
      setUploadingFrameTarget(null);
    }
  };

  const handleAddExistingFrameFromLibrary = (target: 'idle' | 'open', asset: LootboxMediaAssetRecord) => {
    sounds.playTick();
    updateSequenceAnimation(target, prev => {
      const nextFrames = [
        ...(prev.frames || []),
        {
          id: `${asset.id}_${Date.now().toString(36)}`,
          imageUrl: asset.sourceUrl,
          order: (prev.frames || []).length
        }
      ];
      return {
        ...prev,
        mode: 'custom_frames',
        frames: nextFrames
      };
    });
    onNotify('success', `Кадр «${asset.title}» добавлен из библиотеки.`);
  };

  const handleUploadSoundFile = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (file.size > 3 * 1024 * 1024) {
      onNotify('error', `Аудиофайл «${file.name}» превышает лимит 3 МБ.`);
      return;
    }

    setUploadingSound(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const cleanTitle = soundUploadTitle.trim() || file.name.replace(/\.[^.]+$/, '');
      const res = await fetch('/api/admin/lootboxes/media/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          assetType: 'audio',
          title: cleanTitle,
          sourceUrl: dataUrl,
          mimeType: file.type || 'audio/mpeg',
          targetRewardType: soundUploadRewardType,
          targetItemRarity: soundUploadRarity,
          ...(soundUploadManualCategory ? { category: soundUploadManualCategory } : {})
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки аудиофайла');

      if (Array.isArray(data.mediaAssets)) {
        setMediaAssets(data.mediaAssets);
      }
      setSoundUploadTitle('');
      sounds.playTick();
      onNotify('success', data.message || `Звук «${data.asset.title}» добавлен в библиотеку!`);
      onRefreshAudit?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки звука';
      onNotify('error', msg);
    } finally {
      setUploadingSound(false);
    }
  };

  const handleUpdateSoundAssetCategory = async (assetId: string, nextCategory: LootboxSoundCategory) => {
    try {
      const res = await fetch(`/api/admin/lootboxes/media/${encodeURIComponent(assetId)}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ category: nextCategory })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка смены категории звука');
      if (Array.isArray(data.mediaAssets)) {
        setMediaAssets(data.mediaAssets);
      }
      sounds.playTick();
      onNotify('success', data.message || 'Категория звука обновлена.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка обновления категории звука';
      onNotify('error', msg);
    }
  };

  const handleSetGlobalSoundDefault = async (category: LootboxSoundCategory, soundAssetId: string | null) => {
    try {
      const res = await fetch('/api/admin/lootboxes/sounds/defaults', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ category, soundAssetId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка назначения звука по умолчанию');
      setSoundDefaults(data.soundDefaults || {});
      sounds.playTick();
      onNotify('success', data.message || 'Звук по умолчанию обновлён.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения звука по умолчанию';
      onNotify('error', msg);
    }
  };

  const handleDeleteMediaAsset = async (assetId: string) => {
    try {
      const res = await fetch(`/api/admin/lootboxes/media/${encodeURIComponent(assetId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка удаления ресурса');
      if (Array.isArray(data.mediaAssets)) setMediaAssets(data.mediaAssets);
      if (data.soundDefaults) setSoundDefaults(data.soundDefaults);
      sounds.playTick();
      onNotify('success', 'Ресурс удалён из библиотеки.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка удаления ресурса';
      onNotify('error', msg);
    }
  };

  // Helper to render animation editor card for either idleAnimation or openAnimation
  const renderSequenceEditorCard = (target: 'idle' | 'open', title: string, subtitle: string) => {
    const anim =
      (target === 'idle'
        ? draftItem.presentationConfig?.idleAnimation
        : draftItem.presentationConfig?.openAnimation) || createDefaultAnimation(target);

    const isUploading = uploadingFrameTarget === target;

    return (
      <div className="p-4 rounded-xl bg-[#13141c] border border-zinc-800/90 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-800/80">
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Film className="w-4 h-4 text-amber-400" />
              <span>{title}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-700 text-amber-300">
                {target === 'idle' ? 'ЗАЦИКЛЕНА (LOOP)' : 'ОДНОКРАТНАЯ (1X)'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">{subtitle}</p>
          </div>

          {/* Mode Toggle: Preset vs Custom Frames */}
          <div className="flex items-center gap-1.5 bg-[#0e0f15] p-1 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                updateSequenceAnimation(target, prev => ({
                  ...prev,
                  mode: 'preset',
                  presetId: prev.presetId || 'classic_mafia'
                }));
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                anim.mode === 'preset'
                  ? 'bg-amber-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Пресет стиля
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                updateSequenceAnimation(target, prev => ({
                  ...prev,
                  mode: 'custom_frames'
                }));
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                anim.mode === 'custom_frames'
                  ? 'bg-amber-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Свои кадры ({anim.frames?.length || 0})
            </button>
          </div>
        </div>

        {/* Speed (FPS) control */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center bg-[#171822] p-3 rounded-lg border border-zinc-800/80">
          <div className="sm:col-span-5">
            <label className="text-[11px] font-bold text-zinc-300 font-mono uppercase block">
              Скорость воспроизведения (FPS)
            </label>
            <span className="text-[10px] text-zinc-400">
              {anim.fps} кадр/сек (~{Math.round(1000 / Math.max(1, anim.fps))} мс на кадр)
            </span>
          </div>
          <div className="sm:col-span-5 flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={60}
              value={anim.fps || 12}
              onChange={e =>
                updateSequenceAnimation(target, prev => ({
                  ...prev,
                  fps: Math.max(1, Math.min(60, Number(e.target.value) || 12))
                }))
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>
          <div className="sm:col-span-2">
            <input
              type="number"
              min={1}
              max={60}
              value={anim.fps || 12}
              onChange={e =>
                updateSequenceAnimation(target, prev => ({
                  ...prev,
                  fps: Math.max(1, Math.min(60, Number(e.target.value) || 12))
                }))
              }
              className="w-full px-2.5 py-1 bg-[#101117] border border-zinc-700 rounded-lg text-xs font-mono font-bold text-amber-300 text-right tabular-nums"
            />
          </div>
        </div>

        {anim.mode === 'preset' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ANIMATION_PRESETS.map(preset => {
              const isSelected = (anim.presetId || 'classic_mafia') === preset.id;
              const framesPreview = target === 'idle' ? preset.idleFrames : preset.openFrames;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    updateSequenceAnimation(target, prev => ({
                      ...prev,
                      mode: 'preset',
                      presetId: preset.id
                    }));
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? `bg-gradient-to-r ${preset.accentClass} shadow-md`
                      : 'bg-[#171822] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{preset.title}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate mt-0.5">{preset.subtitle}</div>
                  </div>
                  <div className="flex items-center gap-1 text-base shrink-0 bg-black/40 px-2 py-1 rounded-lg border border-white/10">
                    {framesPreview.map((em, i) => (
                      <span key={i}>{em}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Upload or pick existing frames */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploading ? 'Загрузка в БД...' : 'Загрузить кадры (PNG/WebP/GIF)'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    multiple
                    disabled={isUploading}
                    onChange={e => {
                      handleUploadFrameFiles(target, e.target.files);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setFramePickerTarget(framePickerTarget === target ? null : target);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                  <span>Из библиотеки ({imageAssets.length})</span>
                </button>
              </div>

              <span className="text-[10px] text-zinc-400 font-mono">
                Лимит: до 60 кадров, макс. 2 МБ / кадр (хранение в БД Turso/SQLite)
              </span>
            </div>

            {/* Library Frame Picker Drawer */}
            {framePickerTarget === target && (
              <div className="p-3 rounded-xl bg-[#0e0f15] border border-amber-700/50 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-300">
                    Выберите ранее загруженный кадр для повторного использования:
                  </span>
                  <button
                    type="button"
                    onClick={() => setFramePickerTarget(null)}
                    className="text-zinc-400 hover:text-white text-xs"
                  >
                    Закрыть ✕
                  </button>
                </div>
                {imageAssets.length === 0 ? (
                  <div className="text-xs text-zinc-500 py-3 text-center">
                    В библиотеке пока нет загруженных кадров. Загрузите первый файл кнопкой выше.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-h-40 overflow-y-auto pr-1">
                    {imageAssets.map(asset => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => handleAddExistingFrameFromLibrary(target, asset)}
                        className="p-1.5 rounded-lg bg-[#171822] hover:bg-zinc-800 border border-zinc-700 hover:border-amber-500 flex flex-col items-center gap-1 text-center transition-all cursor-pointer"
                        title={`Добавить кадр «${asset.title}»`}
                      >
                        <img
                          src={asset.sourceUrl}
                          alt={asset.title}
                          className="w-12 h-12 object-contain rounded bg-black/50"
                        />
                        <span className="text-[10px] text-zinc-300 truncate w-full">{asset.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Ordered Frame Sequence List */}
            {(!anim.frames || anim.frames.length === 0) ? (
              <div className="p-6 rounded-xl border border-dashed border-zinc-800 text-center text-xs text-zinc-400">
                Для режима «Свои кадры» добавьте хотя бы один кадр или переключитесь на «Пресет стиля».
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {anim.frames.map((frame, fIdx) => (
                  <div
                    key={frame.id || fIdx}
                    className="p-2 rounded-lg bg-[#171822] border border-zinc-800 flex items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[10px] font-mono font-bold text-amber-300 tabular-nums">
                        #{fIdx + 1}
                      </span>
                      <img
                        src={frame.imageUrl}
                        alt={`Кадр ${fIdx + 1}`}
                        className="w-10 h-10 rounded bg-black/60 object-contain border border-zinc-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-200 truncate">
                          Кадр последовательности #{fIdx + 1}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate">
                          ID: {frame.id}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-400 font-mono">Длит. (мс):</span>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          placeholder={`${Math.round(1000 / Math.max(1, anim.fps || 12))}`}
                          value={frame.durationMs || ''}
                          onChange={e => {
                            const val = Number(e.target.value);
                            updateSequenceAnimation(target, prev => {
                              const nextFrames = [...(prev.frames || [])];
                              nextFrames[fIdx] = {
                                ...nextFrames[fIdx],
                                ...(val > 0 ? { durationMs: Math.round(val) } : { durationMs: undefined })
                              };
                              return { ...prev, frames: nextFrames };
                            });
                          }}
                          className="w-20 px-2 py-1 bg-[#101117] border border-zinc-700 rounded text-xs font-mono text-white text-right tabular-nums"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={fIdx === 0}
                        onClick={() =>
                          updateSequenceAnimation(target, prev => {
                            const list = [...(prev.frames || [])];
                            if (fIdx <= 0) return prev;
                            const tmp = list[fIdx];
                            list[fIdx] = list[fIdx - 1];
                            list[fIdx - 1] = tmp;
                            return { ...prev, frames: list.map((f, i) => ({ ...f, order: i })) };
                          })
                        }
                        className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 cursor-pointer"
                        title="Переместить кадр выше"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={fIdx === anim.frames.length - 1}
                        onClick={() =>
                          updateSequenceAnimation(target, prev => {
                            const list = [...(prev.frames || [])];
                            if (fIdx >= list.length - 1) return prev;
                            const tmp = list[fIdx];
                            list[fIdx] = list[fIdx + 1];
                            list[fIdx + 1] = tmp;
                            return { ...prev, frames: list.map((f, i) => ({ ...f, order: i })) };
                          })
                        }
                        className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 cursor-pointer"
                        title="Переместить кадр ниже"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateSequenceAnimation(target, prev => ({
                            ...prev,
                            frames: (prev.frames || [])
                              .filter((_, i) => i !== fIdx)
                              .map((f, i) => ({ ...f, order: i }))
                          }))
                        }
                        className="p-1 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-800/70 text-rose-300 cursor-pointer"
                        title="Удалить кадр из последовательности"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const currentCfg = draftItem.lootboxConfig;
  const currentRewards = currentCfg?.rewards || [];

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-3.5 select-none">
      {/* ================= IMMUTABILITY WARNING BANNER (REQUIRED BY SECTION 9) ================= */}
      <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-start sm:items-center gap-2.5 text-xs text-amber-200">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
          <span>
            <strong>Гарантия неизменяемости снимков:</strong> Изменения правил выпадения применяются только к новым экземплярам лутбокса. Уже выданные экземпляры сохраняют прежние правила.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
          <span className="px-2 py-0.5 rounded bg-black/50 border border-amber-700/60 text-amber-300 tabular-nums">
            Версия правил: v{currentCfg?.version ?? 1}
          </span>
          {currentCfg?.snapshotHash && (
            <span
              className="px-2 py-0.5 rounded bg-black/50 border border-zinc-700 text-zinc-300 tabular-nums"
              title={`Полный SHA-256 хеш правил: ${currentCfg.snapshotHash}`}
            >
              SHA-256: {currentCfg.snapshotHash.slice(0, 10)}…
            </span>
          )}
        </div>
      </div>

      {/* ================= MAIN SPLIT WORKSPACE: LEFT CATALOG LIST + RIGHT EDITOR ================= */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3.5 min-h-0 overflow-hidden">
        {/* LEFT COLUMN (3.5 of 12 cols): Lootbox List & Create Button */}
        <div className="lg:col-span-4 xl:col-span-3.5 bg-[#12131b] border border-zinc-800/90 rounded-xl p-3 flex flex-col min-h-0 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-amber-400" />
                <span>Лутбоксы ({lootboxes.length})</span>
              </h3>
              <p className="text-[10px] text-zinc-400">Единый каталог `shop_items`</p>
            </div>

            <button
              type="button"
              onClick={() => handleSelectLootbox('new_draft', true)}
              className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Создать</span>
            </button>
          </div>

          {/* Search input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Поиск сундука по названию или ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#171822] border border-zinc-800 rounded-lg text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Lootboxes List */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 max-h-52 lg:max-h-none">
            {isCreatingNew && (
              <div className="p-2.5 rounded-xl border border-amber-500 bg-amber-950/30 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">{draftItem.icon || '🧰'}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-amber-200 truncate">
                      {draftItem.name || 'Новый лутбокс'}
                    </div>
                    <div className="text-[10px] font-mono text-amber-400">ЧЕРНОВИК (не сохранён)</div>
                  </div>
                </div>
              </div>
            )}

            {filteredLootboxes.map(lb => {
              const isSelected = !isCreatingNew && lb.id === draftItem.id;
              const isSystem = LEGACY_SYSTEM_CHEST_IDS.has(lb.id) || lb.isCustomLootbox === false;
              const rarityStyle = RARITY_CONFIG[lb.rarity] || RARITY_CONFIG.common;

              return (
                <button
                  key={lb.id}
                  type="button"
                  onClick={() => handleSelectLootbox(lb.id, false)}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-orange-950/70 to-amber-950/50 border-orange-500 text-white shadow-sm'
                      : 'bg-[#161722] hover:bg-[#1b1c29] border-zinc-800/90 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-black/40 border border-zinc-700/80 flex items-center justify-center text-lg shrink-0">
                      {lb.icon || '🧰'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span className="truncate">{lb.name}</span>
                        {lb.adminHidden && (
                          <span className="px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 text-[9px] font-mono">
                            СКРЫТ
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1.5 mt-0.5">
                        <span className="truncate">{lb.id}</span>
                        <span>•</span>
                        <span className="text-amber-300 tabular-nums">{lb.cost} кр</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                        isSystem
                          ? 'bg-blue-950/70 border-blue-700/60 text-blue-300'
                          : 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
                      }`}
                    >
                      {isSystem ? 'СИСТЕМНЫЙ' : 'КАСТОМНЫЙ'}
                    </span>
                    <span className={`text-[9px] font-mono ${rarityStyle.color}`}>
                      v{lb.lootboxConfig?.version ?? 0} · {lb.lootboxConfig?.rewards?.length ?? 0} нагр.
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN (8.5 of 12 cols): Active Lootbox Editor */}
        <div className="lg:col-span-8 xl:col-span-8.5 bg-[#12131b] border border-zinc-800/90 rounded-xl p-3.5 sm:p-4 flex flex-col min-h-0 overflow-y-auto space-y-4">
          {/* Top Bar of Editor: Selected Chest Identity + Sub-Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-950 to-zinc-900 border border-amber-600/60 flex items-center justify-center text-2xl shrink-0">
                {draftItem.icon || '🧰'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-white truncate">
                    {draftItem.name || 'Без названия'}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      isCurrentSystemChest
                        ? 'bg-blue-950/80 border-blue-600/70 text-blue-300'
                        : 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300'
                    }`}
                  >
                    {isCurrentSystemChest ? 'Системный сундук' : 'Пользовательский лутбокс'}
                  </span>
                  {hasAnyUnsavedChanges && (
                    <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-500 text-amber-300 text-[10px] font-mono font-bold animate-pulse">
                      Несохранённые изменения
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-2 mt-0.5 flex-wrap">
                  <span>ID: {draftItem.id}</span>
                  <span>•</span>
                  <span>Режим: {currentCfg?.dropMode === 'independent' ? 'Независимые шансы' : '1 награда по весам'}</span>
                  <span>•</span>
                  <span className="tabular-nums">Наград в пуле: {currentRewards.length}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isCurrentSystemChest && !isCreatingNew && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setDeleteReplacementType('credits');
                    setDeleteReplacementQty(Math.max(10, draftItem.cost || 100));
                    setDeleteModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Удалить пользовательский лутбокс с назначением компенсации"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => fetchConstructorData(draftItem.id)}
                disabled={loading}
                className="p-2 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
                title="Обновить данные с сервера"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Sub-Navigation Bar (5 Constructor Sections) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0">
            {[
              { id: 'general' as BuilderSubTab, label: '1. Основные настройки', icon: SlidersHorizontal, dirty: hasUnsavedBasic },
              { id: 'rewards' as BuilderSubTab, label: `2. Награды и шансы (${currentRewards.length})`, icon: Gift, dirty: hasUnsavedRules },
              { id: 'simulator' as BuilderSubTab, label: '3. Симулятор открытий', icon: Dice5, dirty: false },
              { id: 'animations' as BuilderSubTab, label: '4. Анимации и превью', icon: Film, dirty: hasUnsavedPresentation },
              { id: 'sounds' as BuilderSubTab, label: `5. Библиотека звуков (${audioAssets.length})`, icon: Music, dirty: hasUnsavedPresentation }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setActiveSubTab(tab.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-600 border-amber-400 text-white shadow-xs'
                      : 'bg-[#171822] border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.dirty && <span className="w-2 h-2 rounded-full bg-amber-300" />}
                </button>
              );
            })}
          </div>

          {/* =====================================================================
              SUB-TAB 1: GENERAL & ADVANCED SETTINGS (SECTION 3)
             ===================================================================== */}
          {activeSubTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                {/* Name (Required) */}
                <div className="sm:col-span-6 space-y-1">
                  <label className="text-[11px] font-bold text-zinc-300 uppercase font-mono">
                    Название лутбокса <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={draftItem.name}
                    onChange={e => {
                      setDraftItem(prev => ({ ...prev, name: e.target.value }));
                      setHasUnsavedBasic(true);
                    }}
                    placeholder="Например: Сейф Капореджиме"
                    className="w-full px-3 py-2 bg-[#171822] border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* System ID */}
                <div className="sm:col-span-6 space-y-1">
                  <label className="text-[11px] font-bold text-zinc-300 uppercase font-mono">
                    Системный ID в каталоге `shop_items`
                  </label>
                  <input
                    type="text"
                    disabled={!isCreatingNew}
                    value={draftItem.id}
                    onChange={e => {
                      const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                      setDraftItem(prev => ({ ...prev, id: clean }));
                      setHasUnsavedBasic(true);
                    }}
                    className="w-full px-3 py-2 bg-[#101117] border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300 disabled:opacity-70"
                  />
                </div>

                {/* Rarity */}
                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-bold text-zinc-300 uppercase font-mono">
                    Редкость
                  </label>
                  <select
                    value={draftItem.rarity}
                    onChange={e => {
                      setDraftItem(prev => ({ ...prev, rarity: e.target.value as ItemRarity }));
                      setHasUnsavedBasic(true);
                    }}
                    className="w-full px-3 py-2 bg-[#171822] border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="common">Обычный (Common)</option>
                    <option value="rare">Редкий (Rare)</option>
                    <option value="epic">Эпический (Epic)</option>
                    <option value="legendary">Легендарный (Legendary)</option>
                  </select>
                </div>

                {/* Shop Price */}
                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-bold text-zinc-300 uppercase font-mono">
                    Стоимость в магазине (кр.)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={draftItem.cost}
                    onChange={e => {
                      setDraftItem(prev => ({ ...prev, cost: Math.max(0, Math.round(Number(e.target.value) || 0)) }));
                      setHasUnsavedBasic(true);
                    }}
                    className="w-full px-3 py-2 bg-[#171822] border border-zinc-700 rounded-lg text-xs font-mono font-bold text-amber-300 tabular-nums focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Pawn Value */}
                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-bold text-zinc-300 uppercase font-mono">
                    Сдача в ломбард (кр.)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={draftItem.pawnValue ?? Math.round((draftItem.cost || 0) * 0.5)}
                    onChange={e => {
                      setDraftItem(prev => ({
                        ...prev,
                        pawnValue: Math.max(0, Math.round(Number(e.target.value) || 0))
                      }));
                      setHasUnsavedBasic(true);
                    }}
                    className="w-full px-3 py-2 bg-[#171822] border border-zinc-700 rounded-lg text-xs font-mono font-bold text-emerald-300 tabular-nums focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Icon / Image Picker */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-300 uppercase font-mono">
                  Иконка / символ лутбокса
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={draftItem.icon}
                    onChange={e => {
                      setDraftItem(prev => ({ ...prev, icon: e.target.value }));
                      setHasUnsavedBasic(true);
                    }}
                    className="w-20 px-3 py-1.5 bg-[#171822] border border-zinc-700 rounded-lg text-center text-base"
                  />
                  {LOOTBOX_ICON_PRESETS.map(ic => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => {
                        sounds.playTick();
                        setDraftItem(prev => ({ ...prev, icon: ic }));
                        setHasUnsavedBasic(true);
                      }}
                      className={`w-9 h-9 rounded-lg border text-base flex items-center justify-center transition-colors cursor-pointer ${
                        draftItem.icon === ic
                          ? 'bg-amber-950 border-amber-500'
                          : 'bg-[#171822] border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description (Optional) & Effect Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-zinc-300 uppercase font-mono">
                    Художественное описание (необязательное поле)
                  </label>
                  <textarea
                    rows={3}
                    value={draftItem.description || ''}
                    onChange={e => {
                      setDraftItem(prev => ({ ...prev, description: e.target.value }));
                      setHasUnsavedBasic(true);
                    }}
                    placeholder="Описание сундука в магазине и инвентаре игрока..."
                    className="w-full px-3 py-2 bg-[#171822] border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-zinc-300 uppercase font-mono">
                    Описание эффекта открытия
                  </label>
                  <textarea
                    rows={3}
                    value={draftItem.effectDescription || ''}
                    onChange={e => {
                      setDraftItem(prev => ({ ...prev, effectDescription: e.target.value }));
                      setHasUnsavedBasic(true);
                    }}
                    placeholder="Краткая подсказка механики при наведении..."
                    className="w-full px-3 py-2 bg-[#171822] border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Shop Availability & Admin Visibility Flags */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <label className="p-3 rounded-xl bg-[#171822] border border-zinc-800 flex items-center justify-between gap-2 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-white">Продавать в Магазине</div>
                    <div className="text-[10px] text-zinc-400">Доступен игрокам для покупки за кредиты</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftItem.inShop !== false}
                    onChange={e => {
                      setDraftItem(prev => ({ ...prev, inShop: e.target.checked }));
                      setHasUnsavedBasic(true);
                    }}
                    className="w-4 h-4 accent-amber-500"
                  />
                </label>

                <label className="p-3 rounded-xl bg-[#171822] border border-zinc-800 flex items-center justify-between gap-2 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-white">Скрыть в списках админки</div>
                    <div className="text-[10px] text-zinc-400">Флаг `adminHidden` для селекторов выдачи</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(draftItem.adminHidden)}
                    onChange={e => {
                      setDraftItem(prev => ({ ...prev, adminHidden: e.target.checked }));
                      setHasUnsavedBasic(true);
                    }}
                    className="w-4 h-4 accent-amber-500"
                  />
                </label>

                <label className="p-3 rounded-xl bg-[#171822] border border-zinc-800 flex items-center justify-between gap-2 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-white">Витрина «Хит продаж»</div>
                    <div className="text-[10px] text-zinc-400">Выделенная карточка в магазине</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(draftItem.featured)}
                    onChange={e => {
                      setDraftItem(prev => ({ ...prev, featured: e.target.checked }));
                      setHasUnsavedBasic(true);
                    }}
                    className="w-4 h-4 accent-amber-500"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleSaveBasicSettings}
                  disabled={savingBasic}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {savingBasic
                      ? 'Сохранение...'
                      : isCreatingNew
                        ? 'Создать лутбокс в каталоге'
                        : 'Сохранить основные настройки'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* =====================================================================
              SUB-TAB 2: REWARDS & TWO DROP MODES (SECTIONS 4 & 5)
             ===================================================================== */}
          {activeSubTab === 'rewards' && (
            <div className="space-y-4">
              {/* Drop Mode Switcher with Detailed Explanations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    updateRuleConfig(cfg => ({
                      ...cfg,
                      dropMode: 'single_weighted',
                      consolationPrize: null,
                      rewards: (cfg.rewards || []).map(r => ({
                        ...r,
                        weight: typeof r.weight === 'number' && r.weight > 0 ? r.weight : Math.max(1, Math.round(r.chancePercent || 20))
                      }))
                    }));
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                    currentCfg?.dropMode === 'single_weighted'
                      ? 'bg-gradient-to-r from-amber-950/70 to-orange-950/40 border-amber-500 text-white shadow-sm'
                      : 'bg-[#171822] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 uppercase font-mono">
                      Режим 1: Ровно одна награда (по весам)
                    </span>
                    {currentCfg?.dropMode === 'single_weighted' && (
                      <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    При открытии гарантированно выпадает <strong>ровно одна</strong> награда. Вы задаёте относительный вес каждой позиции, а система автоматически вычисляет точный процент выпадения.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    updateRuleConfig(cfg => ({
                      ...cfg,
                      dropMode: 'independent',
                      rewards: (cfg.rewards || []).map((r, idx) => ({
                        ...r,
                        chancePercent:
                          typeof r.chancePercent === 'number' && r.chancePercent > 0
                            ? r.chancePercent
                            : ruleDiagnostics.computedProbabilities[idx] || 25
                      }))
                    }));
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                    currentCfg?.dropMode === 'independent'
                      ? 'bg-gradient-to-r from-amber-950/70 to-orange-950/40 border-amber-500 text-white shadow-sm'
                      : 'bg-[#171822] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 uppercase font-mono">
                      Режим 2: Независимое выпадение (0%–100%)
                    </span>
                    {currentCfg?.dropMode === 'independent' && (
                      <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    Каждая награда проверяется отдельно со своим шансом 0%–100% (допускаются дробные проценты, сумма не обязана равняться 100%). Может выпасть несколько наград сразу или ни одной.
                  </p>
                </button>
              </div>

              {/* Real-time Probability Summary & Nested Lootboxes Toggle */}
              <div className="p-3 rounded-xl bg-[#161722] border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-4 font-mono">
                  {currentCfg?.dropMode === 'single_weighted' ? (
                    <>
                      <span>
                        Сумма весов: <strong className="text-amber-300 tabular-nums">{ruleDiagnostics.totalWeight}</strong>
                      </span>
                      <span>
                        Шанс пустого открытия: <strong className="text-emerald-400 tabular-nums">0% (гарантия 1 награды)</strong>
                      </span>
                    </>
                  ) : (
                    <>
                      <span>
                        Вероятность пустого открытия:{' '}
                        <strong className="text-amber-300 tabular-nums">{ruleDiagnostics.emptyDropPercent}%</strong>
                      </span>
                      <span>
                        Гарантия (100% лот):{' '}
                        <strong className={ruleDiagnostics.hasGuaranteed100 ? 'text-emerald-400' : 'text-zinc-400'}>
                          {ruleDiagnostics.hasGuaranteed100 ? 'ДА' : 'НЕТ'}
                        </strong>
                      </span>
                    </>
                  )}
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    checked={Boolean(currentCfg?.allowNestedLootboxes)}
                    onChange={e =>
                      updateRuleConfig(cfg => ({
                        ...cfg,
                        allowNestedLootboxes: e.target.checked
                      }))
                    }
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span>Разрешить вложенные лутбоксы</span>
                </label>
              </div>

              {/* Quick Add Reward Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-white uppercase font-mono">
                  Пул наград лутбокса ({currentRewards.length})
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAddRewardEntry('credits')}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/70 text-emerald-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Кредиты</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddRewardEntry('xp')}
                    className="px-2.5 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/70 text-cyan-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Опыт (XP)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddRewardEntry('item')}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-700/70 text-amber-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Предмет из каталога</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddRewardEntry('lootbox')}
                    className="px-2.5 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 border border-purple-700/70 text-purple-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Вложенный лутбокс</span>
                  </button>
                </div>
              </div>

              {/* Rewards Table / Rows */}
              <div className="space-y-2">
                {currentRewards.map((rw, idx) => {
                  const computedPct = ruleDiagnostics.computedProbabilities[idx] ?? 0;
                  const selectableRegularForSlot = getAdminSelectableItems(regularCatalogItems, rw.itemId);
                  const selectableLootboxesForSlot = getAdminSelectableItems(
                    lootboxes.filter(l => l.id !== draftItem.id),
                    rw.itemId
                  );

                  return (
                    <div
                      key={rw.id || idx}
                      className="p-3 rounded-xl bg-[#171822] border border-zinc-800/90 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center text-xs"
                    >
                      {/* Order & Type */}
                      <div className="md:col-span-3 flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-[10px] font-mono font-bold text-zinc-300 tabular-nums">
                          #{idx + 1}
                        </span>
                        <select
                          value={rw.type}
                          onChange={e =>
                            handleUpdateRewardEntry(idx, { type: e.target.value as LootboxRewardType })
                          }
                          className="flex-1 px-2.5 py-1.5 bg-[#101117] border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                        >
                          <option value="credits">🪙 Кредиты</option>
                          <option value="xp">⚡ Опыт (XP)</option>
                          <option value="item">🎁 Предмет</option>
                          <option value="lootbox">🧰 Лутбокс</option>
                        </select>
                      </div>

                      {/* Target Item / Currency Label */}
                      <div className="md:col-span-3">
                        {rw.type === 'item' ? (
                          <select
                            value={rw.itemId || ''}
                            onChange={e => handleUpdateRewardEntry(idx, { itemId: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-[#101117] border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                          >
                            {selectableRegularForSlot.map(it => (
                              <option key={it.id} value={it.id}>
                                {it.icon} {it.name} ({RARITY_CONFIG[it.rarity]?.label})
                                {it.adminHidden ? ' [скрыт]' : ''}
                              </option>
                            ))}
                          </select>
                        ) : rw.type === 'lootbox' ? (
                          <select
                            value={rw.itemId || ''}
                            onChange={e => handleUpdateRewardEntry(idx, { itemId: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-[#101117] border border-zinc-700 rounded-lg text-xs text-purple-200 focus:outline-none focus:border-amber-500"
                          >
                            {selectableLootboxesForSlot.map(lb => (
                              <option key={lb.id} value={lb.id}>
                                {lb.icon} {lb.name} ({lb.id})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="px-2.5 py-1.5 rounded-lg bg-[#101117] border border-zinc-800 text-zinc-300 font-mono text-[11px]">
                            {rw.type === 'credits' ? 'Начисление кредитов' : 'Начисление опыта XP'}
                          </div>
                        )}
                      </div>

                      {/* Quantity Min / Max */}
                      <div className="md:col-span-2 flex items-center gap-1.5">
                        <div className="flex-1">
                          <span className="text-[9px] text-zinc-400 font-mono block">Мин. кол-во</span>
                          <input
                            type="number"
                            min={1}
                            value={rw.minQty}
                            onChange={e => {
                              const val = Math.max(1, Math.trunc(Number(e.target.value) || 1));
                              handleUpdateRewardEntry(idx, {
                                minQty: val,
                                maxQty: Math.max(val, rw.maxQty ?? val)
                              });
                            }}
                            className="w-full px-2 py-1 bg-[#101117] border border-zinc-700 rounded text-xs font-mono text-white tabular-nums"
                          />
                        </div>
                        <div className="flex-1">
                          <span className="text-[9px] text-zinc-400 font-mono block">Макс. кол-во</span>
                          <input
                            type="number"
                            min={rw.minQty}
                            value={rw.maxQty ?? rw.minQty}
                            onChange={e => {
                              const val = Math.max(rw.minQty, Math.trunc(Number(e.target.value) || rw.minQty));
                              handleUpdateRewardEntry(idx, { maxQty: val });
                            }}
                            className="w-full px-2 py-1 bg-[#101117] border border-zinc-700 rounded text-xs font-mono text-white tabular-nums"
                          />
                        </div>
                      </div>

                      {/* Chance % or Weight + Auto-Calculated % */}
                      <div className="md:col-span-2">
                        {currentCfg?.dropMode === 'independent' ? (
                          <div>
                            <span className="text-[9px] text-amber-300 font-mono block">Шанс (0–100%)</span>
                            <input
                              type="number"
                              min={0.0001}
                              max={100}
                              step="any"
                              value={rw.chancePercent ?? 0}
                              onChange={e =>
                                handleUpdateRewardEntry(idx, {
                                  chancePercent: Number(e.target.value)
                                })
                              }
                              className="w-full px-2 py-1 bg-[#101117] border border-amber-700/70 rounded text-xs font-mono font-bold text-amber-300 tabular-nums"
                            />
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center justify-between text-[9px] font-mono">
                              <span className="text-zinc-400">Вес</span>
                              <span className="text-amber-300 font-bold tabular-nums">= {computedPct}%</span>
                            </div>
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              value={rw.weight ?? 10}
                              onChange={e =>
                                handleUpdateRewardEntry(idx, {
                                  weight: Number(e.target.value)
                                })
                              }
                              className="w-full px-2 py-1 bg-[#101117] border border-zinc-700 rounded text-xs font-mono font-bold text-amber-300 tabular-nums"
                            />
                          </div>
                        )}
                      </div>

                      {/* Custom Reveal Sound + Move Up/Down + Delete */}
                      <div className="md:col-span-2 flex items-center justify-end gap-1">
                        <select
                          value={rw.revealSoundAssetId || ''}
                          onChange={e =>
                            handleUpdateRewardEntry(idx, {
                              revealSoundAssetId: e.target.value || undefined
                            })
                          }
                          title="Индивидуальный звук выпадения этой награды (наивысший приоритет)"
                          className="w-24 px-1.5 py-1 bg-[#101117] border border-zinc-700 rounded text-[10px] text-zinc-300"
                        >
                          <option value="">🔊 Звук: Авто</option>
                          {audioAssets.map(aud => (
                            <option key={aud.id} value={aud.id}>
                              🎵 {aud.title}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveRewardEntry(idx, -1)}
                          className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 cursor-pointer"
                          title="Выше"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === currentRewards.length - 1}
                          onClick={() => handleMoveRewardEntry(idx, 1)}
                          className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 cursor-pointer"
                          title="Ниже"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRewardEntry(idx)}
                          className="p-1 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-800/70 text-rose-300 cursor-pointer"
                          title="Удалить награду"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Consolation Prize Section (Section 5: Independent mode only & no 100% reward) */}
              {currentCfg?.dropMode === 'independent' && (
                <div className="p-3.5 rounded-xl bg-[#161722] border border-zinc-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Утешительный приз (при пустом открытии)</span>
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Срабатывает автоматически, если ни одна из независимых наград не выпала.
                      </p>
                    </div>

                    {ruleDiagnostics.hasGuaranteed100 ? (
                      <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-400 font-mono">
                        Недоступно: в списке есть награда со 100% шансом
                      </span>
                    ) : (
                      <label className="flex items-center gap-2 text-xs font-bold text-indigo-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(currentCfg?.consolationPrize)}
                          onChange={e =>
                            updateRuleConfig(cfg => ({
                              ...cfg,
                              consolationPrize: e.target.checked
                                ? { type: 'credits', minQty: 25, maxQty: 50 }
                                : null
                            }))
                          }
                          className="w-4 h-4 accent-indigo-500"
                        />
                        <span>Включить утешительный приз</span>
                      </label>
                    )}
                  </div>

                  {currentCfg?.consolationPrize && !ruleDiagnostics.hasGuaranteed100 && (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2 border-t border-zinc-800">
                      <div>
                        <label className="text-[10px] font-mono text-zinc-400 block">Тип приза</label>
                        <select
                          value={currentCfg.consolationPrize.type}
                          onChange={e => {
                            const nextType = e.target.value as LootboxRewardType;
                            updateRuleConfig(cfg => ({
                              ...cfg,
                              consolationPrize: {
                                type: nextType,
                                ...(nextType === 'item'
                                  ? { itemId: regularCatalogItems[0]?.id || 'item_lighter', minQty: 1, maxQty: 1 }
                                  : { minQty: 25, maxQty: 50 })
                              }
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#101117] border border-zinc-700 rounded-lg text-xs text-white"
                        >
                          <option value="credits">🪙 Кредиты</option>
                          <option value="xp">⚡ Опыт (XP)</option>
                          <option value="item">🎁 Предмет</option>
                        </select>
                      </div>

                      {currentCfg.consolationPrize.type === 'item' && (
                        <div>
                          <label className="text-[10px] font-mono text-zinc-400 block">Предмет</label>
                          <select
                            value={currentCfg.consolationPrize.itemId || ''}
                            onChange={e =>
                              updateRuleConfig(cfg => ({
                                ...cfg,
                                consolationPrize: cfg.consolationPrize
                                  ? { ...cfg.consolationPrize, itemId: e.target.value }
                                  : null
                              }))
                            }
                            className="w-full px-2.5 py-1.5 bg-[#101117] border border-zinc-700 rounded-lg text-xs text-white"
                          >
                            {getAdminSelectableItems(regularCatalogItems, currentCfg.consolationPrize.itemId).map(it => (
                              <option key={it.id} value={it.id}>
                                {it.icon} {it.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="text-[10px] font-mono text-zinc-400 block">Мин. кол-во</label>
                        <input
                          type="number"
                          min={1}
                          value={currentCfg.consolationPrize.minQty}
                          onChange={e => {
                            const v = Math.max(1, Math.trunc(Number(e.target.value) || 1));
                            updateRuleConfig(cfg => ({
                              ...cfg,
                              consolationPrize: cfg.consolationPrize
                                ? {
                                    ...cfg.consolationPrize,
                                    minQty: v,
                                    maxQty: Math.max(v, cfg.consolationPrize.maxQty ?? v)
                                  }
                                : null
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#101117] border border-zinc-700 rounded-lg text-xs font-mono text-white tabular-nums"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-mono text-zinc-400 block">Макс. кол-во</label>
                        <input
                          type="number"
                          min={currentCfg.consolationPrize.minQty}
                          value={currentCfg.consolationPrize.maxQty ?? currentCfg.consolationPrize.minQty}
                          onChange={e => {
                            const minV = currentCfg.consolationPrize?.minQty || 1;
                            const v = Math.max(minV, Math.trunc(Number(e.target.value) || minV));
                            updateRuleConfig(cfg => ({
                              ...cfg,
                              consolationPrize: cfg.consolationPrize
                                ? { ...cfg.consolationPrize, maxQty: v }
                                : null
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#101117] border border-zinc-700 rounded-lg text-xs font-mono text-white tabular-nums"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Validation Errors Box */}
              {!ruleDiagnostics.valid && (
                <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-700 text-xs text-rose-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-rose-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Обнаружены ошибки в правилах выпадения:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {ruleDiagnostics.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleSaveRules}
                  disabled={savingRules || !ruleDiagnostics.valid}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {savingRules
                      ? 'Сохранение правил...'
                      : isCreatingNew
                        ? 'Создать лутбокс с этими правилами'
                        : `Сохранить правила выпадения (будет создана v${(currentCfg?.version ?? 0) + 1})`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* =====================================================================
              SUB-TAB 3: OPENING SIMULATOR (SECTION 6)
             ===================================================================== */}
          {activeSubTab === 'simulator' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#161722] border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase font-mono flex items-center gap-1.5">
                    <Dice5 className="w-4 h-4 text-amber-400" />
                    <span>Серверный симулятор открытий (Крипто-ГСЧ)</span>
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Прогоняет текущий набор правил через боевой движок `evaluateLootboxDrop` без траты предметов и изменения БД.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {[10, 100, 1000, 5000, 10000].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => {
                        sounds.playTick();
                        setSimIterations(cnt);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer tabular-nums ${
                        simIterations === cnt
                          ? 'bg-amber-600 border-amber-400 text-white'
                          : 'bg-[#101117] border-zinc-700 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {cnt.toLocaleString('ru-RU')}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={handleRunSimulation}
                    disabled={simRunning || !ruleDiagnostics.valid}
                    className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{simRunning ? 'Расчёт...' : 'Запустить симуляцию'}</span>
                  </button>
                </div>
              </div>

              {simResult && (
                <div className="space-y-3.5">
                  {/* KPI Summary Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    <div className="p-3 rounded-xl bg-[#171822] border border-zinc-800">
                      <div className="text-[10px] font-mono text-zinc-400 uppercase">Открытий</div>
                      <div className="text-base font-bold font-mono text-white tabular-nums mt-0.5">
                        {simResult.iterations.toLocaleString('ru-RU')}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#171822] border border-zinc-800">
                      <div className="text-[10px] font-mono text-zinc-400 uppercase">Ср. наград / откр.</div>
                      <div className="text-base font-bold font-mono text-amber-300 tabular-nums mt-0.5">
                        {(
                          simResult.rewardBreakdown.reduce((acc, r) => acc + r.hitsCount, 0) /
                          Math.max(1, simResult.iterations)
                        ).toFixed(3)}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#171822] border border-zinc-800">
                      <div className="text-[10px] font-mono text-zinc-400 uppercase">Пустых открытий</div>
                      <div className="text-base font-bold font-mono text-rose-300 tabular-nums mt-0.5">
                        {simResult.emptyOpensCount} ({simResult.emptyOpensPercent}%)
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#171822] border border-zinc-800">
                      <div className="text-[10px] font-mono text-zinc-400 uppercase">Ср. кредитов / откр.</div>
                      <div className="text-base font-bold font-mono text-emerald-300 tabular-nums mt-0.5">
                        +{simResult.avgCreditsPerOpen} кр
                      </div>
                    </div>

                    <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-[#171822] border border-zinc-800">
                      <div className="text-[10px] font-mono text-zinc-400 uppercase">Утешит. призов</div>
                      <div className="text-base font-bold font-mono text-indigo-300 tabular-nums mt-0.5">
                        {simResult.consolationTriggersCount} ({simResult.consolationTriggersPercent}%)
                      </div>
                    </div>
                  </div>

                  {/* Theoretical vs Empirical Breakdown Table */}
                  <div className="rounded-xl border border-zinc-800 overflow-x-auto bg-[#14151e]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-[#101117] text-[10px] font-mono uppercase text-zinc-400">
                          <th className="py-2.5 px-3">Награда</th>
                          <th className="py-2.5 px-3 text-right">Диапазон</th>
                          <th className="py-2.5 px-3 text-right">Заявленный шанс</th>
                          <th className="py-2.5 px-3 text-right">Фактически выпало</th>
                          <th className="py-2.5 px-3 text-right">Факт. частота</th>
                          <th className="py-2.5 px-3 text-right">Отклонение</th>
                          <th className="py-2.5 px-3 text-right">Ср. кол-во / откр.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/70 font-mono">
                        {simResult.rewardBreakdown.map(row => {
                          const delta = Number(
                            (row.empiricalHitRatePercent - row.theoreticalProbabilityPercent).toFixed(2)
                          );
                          return (
                            <tr key={row.entryId} className="hover:bg-zinc-900/50">
                              <td className="py-2 px-3 font-sans font-semibold text-white">
                                {row.label}
                              </td>
                              <td className="py-2 px-3 text-right text-zinc-300 tabular-nums">
                                {row.minQty === row.maxQty ? row.minQty : `${row.minQty}–${row.maxQty}`}
                              </td>
                              <td className="py-2 px-3 text-right text-amber-300 font-bold tabular-nums">
                                {row.theoreticalProbabilityPercent}%
                              </td>
                              <td className="py-2 px-3 text-right text-zinc-200 tabular-nums">
                                {row.hitsCount.toLocaleString('ru-RU')} раз
                              </td>
                              <td className="py-2 px-3 text-right text-emerald-300 font-bold tabular-nums">
                                {row.empiricalHitRatePercent}%
                              </td>
                              <td
                                className={`py-2 px-3 text-right tabular-nums ${
                                  Math.abs(delta) <= 2 ? 'text-zinc-400' : 'text-amber-400'
                                }`}
                              >
                                {delta > 0 ? `+${delta}%` : `${delta}%`}
                              </td>
                              <td className="py-2 px-3 text-right text-zinc-300 tabular-nums">
                                {row.avgQuantityPerOpen}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              SUB-TAB 4: ANIMATIONS & INTERACTIVE PREVIEW (SECTION 7)
             ===================================================================== */}
          {activeSubTab === 'animations' && (
            <div className="space-y-4">
              {/* Interactive Stage Preview Box */}
              <div className="p-4 rounded-xl bg-gradient-to-b from-[#171824] to-[#0f1017] border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="space-y-2 max-w-md">
                  <div className="text-xs font-bold text-amber-300 uppercase font-mono flex items-center gap-1.5">
                    <Eye className="w-4 h-4" />
                    <span>Живое превью анимаций лутбокса</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Проверьте обе независимые фазы: <strong>Анимация ожидания</strong> проигрывается циклично, а по нажатию «Проверить открытие» запускается однократная <strong>Анимация открытия</strong> со звуком и финальным показом награды.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playTick();
                        setPreviewFrameIdx(0);
                        setPreviewPhase('idle');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                        previewPhase === 'idle'
                          ? 'bg-amber-600 border-amber-400 text-white'
                          : 'bg-zinc-850 border-zinc-700 text-zinc-300'
                      }`}
                    >
                      🔄 Режим ожидания (Loop)
                    </button>

                    <button
                      type="button"
                      onClick={handleTriggerPreviewOpen}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Проверить открытие (1x)</span>
                    </button>
                  </div>
                </div>

                {/* Live Animated Stage */}
                <div className="w-full md:w-72 h-44 rounded-2xl bg-black/70 border border-amber-600/40 flex flex-col items-center justify-center p-4 relative overflow-hidden shrink-0">
                  <span className="absolute top-2 left-2.5 text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-900/90 border border-zinc-700 text-zinc-300">
                    {previewPhase === 'idle'
                      ? `ОЖИДАНИЕ · КАДР #${previewFrameIdx + 1}`
                      : previewPhase === 'opening'
                        ? `ОТКРЫТИЕ · КАДР #${previewFrameIdx + 1}`
                        : 'НАГРАДА ПОЛУЧЕНА'}
                  </span>

                  {previewPhase === 'opened' ? (
                    <div className="flex flex-col items-center text-center space-y-1.5 animate-in zoom-in-95 duration-200">
                      <div className="text-4xl">🎁</div>
                      <div className="text-xs font-bold text-amber-300">
                        Открыт «{draftItem.name}»!
                      </div>
                      <div className="text-[11px] font-mono text-emerald-300">
                        Награда выдана по снимку правил
                      </div>
                    </div>
                  ) : currentPreviewAnim.mode === 'custom_frames' &&
                    currentPreviewAnim.frames &&
                    currentPreviewAnim.frames.length > 0 ? (
                    <img
                      src={
                        currentPreviewAnim.frames[
                          previewFrameIdx % currentPreviewAnim.frames.length
                        ]?.imageUrl
                      }
                      alt="Кадр превью"
                      className="w-24 h-24 object-contain drop-shadow-lg transition-transform duration-150"
                    />
                  ) : (
                    <div className="text-5xl select-none transition-transform duration-150 transform scale-110">
                      {previewPhase === 'opening'
                        ? activePresetMeta.openFrames[
                            previewFrameIdx % activePresetMeta.openFrames.length
                          ]
                        : activePresetMeta.idleFrames[
                            previewFrameIdx % activePresetMeta.idleFrames.length
                          ]}
                    </div>
                  )}

                  <span className="absolute bottom-2 right-2.5 text-[10px] font-mono text-zinc-400 tabular-nums">
                    {currentPreviewAnim.fps} FPS
                  </span>
                </div>
              </div>

              {/* Editor 1: Idle Animation */}
              {renderSequenceEditorCard(
                'idle',
                '1. Анимация ожидания (Idle Animation)',
                'Воспроизводится по кругу (зацикленно), пока лутбокс находится на экране перед открытием.'
              )}

              {/* Editor 2: Open Animation */}
              {renderSequenceEditorCard(
                'open',
                '2. Анимация открытия (Open Animation)',
                'Воспроизводится один раз от первого до последнего кадра в момент вскрытия лутбокса.'
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleSavePresentation}
                  disabled={savingPresentation}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {savingPresentation ? 'Сохранение...' : 'Сохранить анимации лутбокса'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* =====================================================================
              SUB-TAB 5: BUILT-IN SOUND LIBRARY & AUDIO ROUTING (SECTION 8)
             ===================================================================== */}
          {activeSubTab === 'sounds' && (
            <div className="space-y-4">
              {/* Priority Hierarchy Banner */}
              <div className="p-3.5 rounded-xl bg-[#161722] border border-zinc-800 space-y-1.5">
                <div className="text-xs font-bold text-amber-300 uppercase font-mono flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4" />
                  <span>Приоритет воспроизведения звуков при открытии лутбокса</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                  <div className="p-2 rounded-lg bg-[#101117] border border-amber-600/50 text-amber-200">
                    <strong>1. Звук конкретной награды</strong>
                    <div className="text-[10px] text-zinc-400">Задаётся в строке самой награды</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#101117] border border-zinc-700 text-zinc-200">
                    <strong>2. Звук категории лутбокса</strong>
                    <div className="text-[10px] text-zinc-400">Настройка для текущего сундука</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#101117] border border-zinc-700 text-zinc-200">
                    <strong>3. Стандартный звук категории</strong>
                    <div className="text-[10px] text-zinc-400">Глобальный звук по умолчанию</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#101117] border border-zinc-800 text-zinc-400">
                    <strong>4. Встроенный синтезатор</strong>
                    <div className="text-[10px] text-zinc-500">Резервный WebAudio звук</div>
                  </div>
                </div>
              </div>

              {/* Upload New Sound Form with Auto-Detection by Reward Type */}
              <div className="p-4 rounded-xl bg-[#13141c] border border-zinc-800/90 space-y-3">
                <div className="text-xs font-bold text-white uppercase font-mono flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>Загрузить новый звук в постоянную библиотеку (`lootbox_media_assets`)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-4 space-y-1">
                    <label className="text-[10px] font-mono text-zinc-400 uppercase block">
                      Название звука
                    </label>
                    <input
                      type="text"
                      value={soundUploadTitle}
                      onChange={e => setSoundUploadTitle(e.target.value)}
                      placeholder="Например: Фанфары Дона"
                      className="w-full px-2.5 py-1.5 bg-[#171822] border border-zinc-700 rounded-lg text-xs text-white"
                    />
                  </div>

                  <div className="sm:col-span-3 space-y-1">
                    <label className="text-[10px] font-mono text-zinc-400 uppercase block">
                      Автоопределение по типу награды
                    </label>
                    <select
                      value={soundUploadRewardType}
                      onChange={e => setSoundUploadRewardType(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 bg-[#171822] border border-zinc-700 rounded-lg text-xs text-white"
                    >
                      <option value="open">🔓 Открытие лутбокса</option>
                      <option value="credits">🪙 Выпадение кредитов</option>
                      <option value="xp">⚡ Выпадение опыта (XP)</option>
                      <option value="item">🎁 Выпадение предмета</option>
                      <option value="lootbox">🧰 Вложенный лутбокс</option>
                      <option value="consolation">✨ Утешительный приз</option>
                    </select>
                  </div>

                  {soundUploadRewardType === 'item' && (
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[10px] font-mono text-zinc-400 uppercase block">
                        Редкость предмета
                      </label>
                      <select
                        value={soundUploadRarity}
                        onChange={e => setSoundUploadRarity(e.target.value as ItemRarity)}
                        className="w-full px-2.5 py-1.5 bg-[#171822] border border-zinc-700 rounded-lg text-xs text-white"
                      >
                        <option value="common">Обычный</option>
                        <option value="rare">Редкий</option>
                        <option value="epic">Эпический</option>
                        <option value="legendary">Легендарный</option>
                      </select>
                    </div>
                  )}

                  <div className={`${soundUploadRewardType === 'item' ? 'sm:col-span-3' : 'sm:col-span-5'}`}>
                    <label className="w-full px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                      <FileAudio className="w-3.5 h-3.5" />
                      <span>{uploadingSound ? 'Загрузка аудио...' : 'Выбрать аудиофайл (MP3/WAV/OGG до 3 МБ)'}</span>
                      <input
                        type="file"
                        accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/aac"
                        disabled={uploadingSound}
                        onChange={e => {
                          handleUploadSoundFile(e.target.files);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Current Lootbox Sound Overrides + Global Category Defaults Matrix */}
              <div className="p-4 rounded-xl bg-[#13141c] border border-zinc-800/90 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase font-mono">
                      Назначение звуков по категориям (текущий лутбокс и глобальные по умолчанию)
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      Настройте собственный звук открытия для «{draftItem.name}» или задайте стандартные звуки категорий для всех сундуков.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 overflow-x-auto bg-[#171822]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-[#101117] text-[10px] font-mono uppercase text-zinc-400">
                        <th className="py-2 px-3">Категория события / награды</th>
                        <th className="py-2 px-3">Звук для «{draftItem.name}»</th>
                        <th className="py-2 px-3">Глобальный звук по умолчанию</th>
                        <th className="py-2 px-3 text-right">Тест</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {SOUND_CATEGORIES_ORDER.map(cat => {
                        const meta = SOUND_CATEGORY_CONFIG[cat];
                        const isOpenCat = cat === 'lootbox_open';
                        const currentLootboxSoundId = isOpenCat
                          ? draftItem.presentationConfig?.openSoundAssetId || ''
                          : draftItem.presentationConfig?.rewardCategorySoundOverrides?.[cat] || '';
                        const globalDefaultSoundId = soundDefaults[cat] || '';

                        return (
                          <tr key={cat} className="hover:bg-zinc-900/40">
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${meta.badgeColor}`}>
                                {meta.label}
                              </span>
                              <div className="text-[10px] text-zinc-400 mt-0.5">{meta.description}</div>
                            </td>

                            <td className="py-2 px-3">
                              <select
                                value={currentLootboxSoundId}
                                onChange={e => {
                                  const val = e.target.value || null;
                                  setDraftItem(prev => {
                                    const pres = prev.presentationConfig || {};
                                    if (isOpenCat) {
                                      return {
                                        ...prev,
                                        presentationConfig: { ...pres, openSoundAssetId: val }
                                      };
                                    }
                                    const nextOverrides = { ...(pres.rewardCategorySoundOverrides || {}) };
                                    if (val) {
                                      nextOverrides[cat] = val;
                                    } else {
                                      delete nextOverrides[cat];
                                    }
                                    return {
                                      ...prev,
                                      presentationConfig: {
                                        ...pres,
                                        rewardCategorySoundOverrides: nextOverrides
                                      }
                                    };
                                  });
                                  setHasUnsavedPresentation(true);
                                }}
                                className="w-full px-2 py-1 bg-[#101117] border border-zinc-700 rounded text-xs text-white"
                              >
                                <option value="">— Использовать глобальный по умолчанию —</option>
                                {audioAssets.map(aud => (
                                  <option key={aud.id} value={aud.id}>
                                    🎵 {aud.title} ({SOUND_CATEGORY_CONFIG[aud.category as LootboxSoundCategory]?.label || aud.category})
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="py-2 px-3">
                              <select
                                value={globalDefaultSoundId}
                                onChange={e => handleSetGlobalSoundDefault(cat, e.target.value || null)}
                                className="w-full px-2 py-1 bg-[#101117] border border-zinc-700 rounded text-xs text-amber-200"
                              >
                                <option value="">🎹 Встроенный синтезатор WebAudio</option>
                                {audioAssets.map(aud => (
                                  <option key={aud.id} value={aud.id}>
                                    🎵 {aud.title}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => playSoundByAssetIdOrCategory(currentLootboxSoundId || null, cat)}
                                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[11px] font-mono cursor-pointer inline-flex items-center gap-1"
                              >
                                <Play className="w-3 h-3 text-amber-400" />
                                <span>Прослушать</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Uploaded Audio Assets Library List */}
              <div className="p-4 rounded-xl bg-[#13141c] border border-zinc-800/90 space-y-2.5">
                <div className="text-xs font-bold text-white uppercase font-mono">
                  Все загруженные звуки в библиотеке ({audioAssets.length})
                </div>

                {audioAssets.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-zinc-800 text-center text-xs text-zinc-400">
                    В библиотеке пока нет загруженных аудиофайлов. Вы можете загрузить MP3/WAV/OGG выше.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {audioAssets.map(asset => (
                      <div
                        key={asset.id}
                        className="p-2.5 rounded-lg bg-[#171822] border border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => playSoundByAssetIdOrCategory(asset.id)}
                            className="w-8 h-8 rounded-lg bg-amber-600/20 border border-amber-500/50 text-amber-300 flex items-center justify-center cursor-pointer shrink-0"
                            title="Прослушать звук"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate">{asset.title}</div>
                            <div className="text-[10px] font-mono text-zinc-400">
                              {asset.mimeType} · {Math.max(1, Math.round(asset.byteSize / 1024))} КБ · Автокатегория: {asset.autoDetectedCategory || '—'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={asset.category}
                            onChange={e =>
                              handleUpdateSoundAssetCategory(asset.id, e.target.value as LootboxSoundCategory)
                            }
                            className="px-2 py-1 bg-[#101117] border border-zinc-700 rounded text-xs text-amber-200"
                            title="Изменить категорию звука вручную"
                          >
                            {SOUND_CATEGORIES_ORDER.map(cat => (
                              <option key={cat} value={cat}>
                                {SOUND_CATEGORY_CONFIG[cat].label}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => handleDeleteMediaAsset(asset.id)}
                            className="p-1.5 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 cursor-pointer"
                            title="Удалить звук из библиотеки"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleSavePresentation}
                  disabled={savingPresentation}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {savingPresentation ? 'Сохранение...' : 'Сохранить звуковые настройки лутбокса'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= MODAL: DELETE CUSTOM LOOTBOX WITH REPLACEMENT ================= */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#12131b] border border-rose-700/70 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Удаление лутбокса «{draftItem.name}»</span>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              При удалении пользовательского лутбокса из каталога `shop_items` укажите компенсацию в таблице `deleted_item_replacements` на случай, если этот сундук упоминался внутри старых снимков правил.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-mono text-zinc-400 uppercase block mb-1">
                  Тип компенсации при замене
                </label>
                <select
                  value={deleteReplacementType}
                  onChange={e => setDeleteReplacementType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#171822] border border-zinc-700 rounded-lg text-xs text-white"
                >
                  <option value="credits">🪙 Кредиты</option>
                  <option value="item">🎁 Предмет из каталога</option>
                  <option value="lootbox">🧰 Другой лутбокс</option>
                </select>
              </div>

              {deleteReplacementType !== 'credits' && (
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 uppercase block mb-1">
                    Предмет / лутбокс для замены
                  </label>
                  <select
                    value={deleteReplacementItemId}
                    onChange={e => setDeleteReplacementItemId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#171822] border border-zinc-700 rounded-lg text-xs text-white"
                  >
                    <option value="">— Выберите из каталога —</option>
                    {(deleteReplacementType === 'lootbox'
                      ? lootboxes.filter(l => l.id !== draftItem.id)
                      : regularCatalogItems
                    ).map(it => (
                      <option key={it.id} value={it.id}>
                        {it.icon} {it.name} ({it.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-[11px] font-mono text-zinc-400 uppercase block mb-1">
                  Количество компенсации
                </label>
                <input
                  type="number"
                  min={1}
                  value={deleteReplacementQty}
                  onChange={e => setDeleteReplacementQty(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
                  className="w-full px-3 py-2 bg-[#171822] border border-zinc-700 rounded-lg text-xs font-mono text-amber-300 tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isDeletingLootbox}
                onClick={handleConfirmDeleteCustomLootbox}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
              >
                {isDeletingLootbox ? 'Удаление...' : 'Подтвердить удаление'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: UNSAVED CHANGES GUARD ================= */}
      {pendingSelectTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#12131b] border border-amber-600/70 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Несохранённые изменения в конструкторе</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              У текущего лутбокса «{draftItem.name}» есть несохранённые изменения. Переключиться на другой лутбокс без сохранения?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setPendingSelectTarget(null)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                Остаться и сохранить
              </button>
              <button
                type="button"
                onClick={() => proceedSelectLootbox(pendingSelectTarget.id, pendingSelectTarget.isNew)}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
              >
                Сбросить и переключиться
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
