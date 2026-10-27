import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X,
  Gift,
  Sparkles,
  Volume2,
  VolumeX,
  FastForward,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Coins,
  Zap,
  Layers,
  Info,
  Loader2
} from 'lucide-react';
import { AuthUser } from './AuthModal';
import {
  ItemDefinition,
  ItemRarity,
  RARITY_CONFIG,
  LootboxRuleSnapshot,
  LootboxPresentationConfig,
  LootboxSequenceAnimation,
  LootboxMediaAssetRecord,
  LootboxSoundCategory,
  LootboxRewardEntry,
  UserInventoryItem,
  getItemDefinition
} from '../data/items';
import { sounds } from '../utils/audio';

export interface ServerEvaluatedRewardItem {
  entryId: string;
  type: 'credits' | 'xp' | 'item' | 'lootbox';
  itemId?: string;
  itemName: string;
  rarity?: ItemRarity;
  icon: string;
  quantity: number;
  isConsolation?: boolean;
  wasReplaced?: boolean;
  originalItemId?: string;
  originalItemName?: string;
  revealSoundAssetId?: string;
}

export interface ServerLootboxOpenRewardPayload {
  credits?: number;
  xp?: number;
  items?: Array<{ itemId: string; name: string; quantity: number; isLootbox: boolean }>;
  rewards: ServerEvaluatedRewardItem[];
  dropMode: 'independent' | 'single_weighted';
  isEmptyDrop: boolean;
  consolationAwarded: boolean;
  snapshotHash: string;
  snapshotVersion: number;
  lootboxName: string;
  openedInventoryEntryId: string;
  operationId: string;
}

export interface PendingLootboxOperationRecord {
  operationId: string;
  userId: string;
  itemId: string;
  inventoryEntryId?: string;
  lootboxName: string;
  lootboxIcon: string;
  createdAt: string;
}

const PENDING_OP_STORAGE_KEY_PREFIX = 'mafia_pending_lootbox_op_';
const SOUND_MUTE_STORAGE_KEY = 'mafia_lootbox_sound_muted';

export function getPendingLootboxStorageKey(userId: string): string {
  return `${PENDING_OP_STORAGE_KEY_PREFIX}${userId}`;
}

interface LootboxOpenModalProps {
  user: AuthUser;
  inventoryEntry: UserInventoryItem;
  itemDef: ItemDefinition;
  mediaAssetsMap: Record<string, LootboxMediaAssetRecord>;
  soundDefaults: Record<LootboxSoundCategory, string | null>;
  deletedReplacements: Record<string, {
    deletedItemId: string;
    deletedItemName: string;
    replacementType: 'credits' | 'item' | 'lootbox';
    replacementItemId: string | null;
    replacementQty: number;
  }>;
  onClose: () => void;
  onUpdateUser: (updatedUser: AuthUser) => void;
  recoveredPayload?: {
    user?: AuthUser;
    resultMessage: string;
    reward: ServerLootboxOpenRewardPayload;
    operationId: string;
  } | null;
}

type ModalPhase = 'idle' | 'requesting' | 'opening_anim' | 'revealing' | 'summary' | 'network_retry';

const PRESET_VISUAL_THEMES: Record<
  string,
  {
    title: string;
    accentText: string;
    borderClass: string;
    glowClass: string;
    bgClass: string;
    badgeBg: string;
  }
> = {
  classic_mafia: {
    title: 'Классический архив Мафии',
    accentText: 'text-amber-300',
    borderClass: 'border-amber-500/50',
    glowClass: 'shadow-[0_0_55px_rgba(245,158,11,0.28)]',
    bgClass: 'from-amber-950/50 via-[#151621] to-[#0f1018]',
    badgeBg: 'bg-amber-500/20 border-amber-400/50 text-amber-200'
  },
  golden_vault: {
    title: 'Золотой сейф Дона',
    accentText: 'text-yellow-300',
    borderClass: 'border-yellow-400/60',
    glowClass: 'shadow-[0_0_65px_rgba(234,179,8,0.35)]',
    bgClass: 'from-yellow-950/55 via-amber-950/35 to-[#0f1018]',
    badgeBg: 'bg-yellow-500/20 border-yellow-400/60 text-yellow-200'
  },
  police_archive: {
    title: 'Секретный архив Комиссара',
    accentText: 'text-blue-300',
    borderClass: 'border-blue-500/50',
    glowClass: 'shadow-[0_0_60px_rgba(59,130,246,0.3)]',
    bgClass: 'from-blue-950/50 via-slate-900/60 to-[#0f1018]',
    badgeBg: 'bg-blue-500/20 border-blue-400/50 text-blue-200'
  },
  neon_syndicate: {
    title: 'Неоновый тайник Синдиката',
    accentText: 'text-fuchsia-300',
    borderClass: 'border-fuchsia-500/50',
    glowClass: 'shadow-[0_0_60px_rgba(217,70,239,0.3)]',
    bgClass: 'from-fuchsia-950/50 via-purple-950/40 to-[#0f1018]',
    badgeBg: 'bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-200'
  }
};

function generateClientOperationId(userId: string, entryId?: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `lb_open_${userId.slice(0, 10)}_${(entryId || 'slot').slice(0, 12)}_${rand}`;
}

export const LootboxOpenModal: React.FC<LootboxOpenModalProps> = ({
  user,
  inventoryEntry,
  itemDef,
  mediaAssetsMap,
  soundDefaults,
  deletedReplacements,
  onClose,
  onUpdateUser,
  recoveredPayload
}) => {
  // Resolve effective immutable ruleSnapshot for this inventory stack
  const snapshot: LootboxRuleSnapshot | null = useMemo(() => {
    if (inventoryEntry.ruleSnapshot && Array.isArray(inventoryEntry.ruleSnapshot.rewards)) {
      return inventoryEntry.ruleSnapshot;
    }
    if (itemDef.lootboxConfig && Array.isArray(itemDef.lootboxConfig.rewards)) {
      return {
        lootboxItemId: itemDef.id,
        version: itemDef.lootboxConfig.version || 1,
        snapshotHash: itemDef.lootboxConfig.snapshotHash || 'live',
        capturedAt: inventoryEntry.acquiredAt || itemDef.lootboxConfig.updatedAt || new Date().toISOString(),
        name: itemDef.name,
        description: itemDef.description,
        pawnValue: itemDef.pawnValue,
        dropMode: itemDef.lootboxConfig.dropMode,
        allowNestedLootboxes: itemDef.lootboxConfig.allowNestedLootboxes,
        rewards: itemDef.lootboxConfig.rewards,
        consolationPrize: itemDef.lootboxConfig.consolationPrize || null
      };
    }
    return null;
  }, [inventoryEntry, itemDef]);

  const presentation: LootboxPresentationConfig = useMemo(() => {
    return (
      itemDef.presentationConfig || {
        idleAnimation: { mode: 'preset', presetId: 'classic_mafia', fps: 8, frames: [] },
        openAnimation: { mode: 'preset', presetId: 'classic_mafia', fps: 12, frames: [] },
        openSoundAssetId: null,
        rewardCategorySoundOverrides: {}
      }
    );
  }, [itemDef.presentationConfig]);

  const presetKey =
    presentation.idleAnimation?.presetId ||
    presentation.openAnimation?.presetId ||
    'classic_mafia';
  const presetTheme = PRESET_VISUAL_THEMES[presetKey] || PRESET_VISUAL_THEMES.classic_mafia;

  // Sound Mute state (persisted in localStorage)
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SOUND_MUTE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    try {
      localStorage.setItem(SOUND_MUTE_STORAGE_KEY, next ? '1' : '0');
    } catch {}
    if (next && activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      } catch {}
    }
  };

  // Modal lifecycle phase
  const [phase, setPhase] = useState<ModalPhase>(() => (recoveredPayload ? 'summary' : 'idle'));
  const [operationId, setOperationId] = useState<string>(() =>
    recoveredPayload?.operationId || generateClientOperationId(user.id, inventoryEntry.id)
  );
  const [serverResult, setServerResult] = useState<{
    user: AuthUser;
    resultMessage: string;
    reward: ServerLootboxOpenRewardPayload;
  } | null>(() =>
    recoveredPayload
      ? {
          user: recoveredPayload.user || user,
          resultMessage: recoveredPayload.resultMessage,
          reward: recoveredPayload.reward
        }
      : null
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showProbabilities, setShowProbabilities] = useState<boolean>(true);
  const [revealedCount, setRevealedCount] = useState<number>(() =>
    recoveredPayload ? recoveredPayload.reward?.rewards?.length || 0 : 0
  );
  const [frameIndex, setFrameIndex] = useState<number>(0);
  const [skipRequested, setSkipRequested] = useState<boolean>(false);

  const timersRef = useRef<number[]>([]);
  const frameIntervalRef = useRef<number | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    if (frameIntervalRef.current !== null) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimers();
      if (activeAudioRef.current) {
        try {
          activeAudioRef.current.pause();
          activeAudioRef.current = null;
        } catch {}
      }
    };
  }, [clearAllTimers]);

  // Resolve media asset URL or imageUrl from frame spec / mediaAssetsMap
  const resolveAssetUrl = useCallback(
    (assetIdOrUrl?: string | null): string | null => {
      if (!assetIdOrUrl) return null;
      const clean = String(assetIdOrUrl).trim();
      if (!clean) return null;
      if (clean.startsWith('data:') || clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/')) {
        return clean;
      }
      const asset = mediaAssetsMap[clean];
      if (asset && asset.sourceUrl) {
        return asset.sourceUrl;
      }
      return `/api/lootboxes/media/${encodeURIComponent(clean)}`;
    },
    [mediaAssetsMap]
  );

  // Play sound with priority:
  // 1) Explicit assetId (reward revealSoundAssetId / lootbox openSoundAssetId / lootbox category override)
  // 2) Global category default from soundDefaults
  // 3) Procedural WebAudio fallback (sounds.playLootboxOpen / sounds.playLootboxReward)
  const playLootboxSound = useCallback(
    (category: LootboxSoundCategory | 'open', explicitAssetId?: string | null) => {
      if (isMuted) return;

      let chosenAssetId: string | null = explicitAssetId || null;
      if (!chosenAssetId && category !== 'open') {
        const overrideId = presentation.rewardCategorySoundOverrides?.[category];
        if (overrideId) {
          chosenAssetId = overrideId;
        }
      }
      if (!chosenAssetId && category !== 'open' && soundDefaults?.[category]) {
        chosenAssetId = soundDefaults[category];
      }
      if (!chosenAssetId && category === 'open' && soundDefaults?.lootbox_open) {
        chosenAssetId = soundDefaults.lootbox_open;
      }

      const audioSrc = resolveAssetUrl(chosenAssetId);
      if (audioSrc) {
        try {
          if (activeAudioRef.current) {
            activeAudioRef.current.pause();
          }
          const audio = new Audio(audioSrc);
          audio.volume = 0.65;
          activeAudioRef.current = audio;
          audio.play().catch(() => {
            if (category === 'open' || category === 'lootbox_open') {
              sounds.playLootboxOpen();
            } else {
              sounds.playLootboxReward(category);
            }
          });
          return;
        } catch {
          // fallback below
        }
      }

      if (category === 'open' || category === 'lootbox_open') {
        sounds.playLootboxOpen();
      } else {
        sounds.playLootboxReward(category);
      }
    },
    [isMuted, presentation.rewardCategorySoundOverrides, soundDefaults, resolveAssetUrl]
  );

  // Determine active frame sequence for current phase
  const activeSequence: LootboxSequenceAnimation | null = useMemo(() => {
    if (phase === 'idle' || phase === 'requesting' || phase === 'network_retry') {
      return presentation.idleAnimation || null;
    }
    if (phase === 'opening_anim') {
      return presentation.openAnimation || null;
    }
    return null;
  }, [phase, presentation]);

  const validFrames = useMemo(() => {
    if (!activeSequence || activeSequence.mode !== 'custom_frames' || !Array.isArray(activeSequence.frames)) {
      return [];
    }
    return [...activeSequence.frames]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((f) => ({
        ...f,
        resolvedSrc: resolveAssetUrl(f.imageUrl)
      }))
      .filter((f) => Boolean(f.resolvedSrc));
  }, [activeSequence, resolveAssetUrl]);

  // Preload custom animation frames so opening plays smoothly without flicker
  useEffect(() => {
    const allFrames = [
      ...(presentation.idleAnimation?.frames || []),
      ...(presentation.openAnimation?.frames || [])
    ];
    allFrames.forEach((f) => {
      const src = resolveAssetUrl(f.imageUrl);
      if (src) {
        const img = new Image();
        img.src = src;
      }
    });
  }, [presentation, resolveAssetUrl]);

  // Run frame ticker when valid custom frames exist
  useEffect(() => {
    if (frameIntervalRef.current !== null) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (validFrames.length === 0) {
      setFrameIndex(0);
      return;
    }

    const isLoop = phase !== 'opening_anim';
    setFrameIndex(0);
    if (validFrames.length === 1) return;

    const fps = Math.max(1, Math.min(60, Number(activeSequence?.fps || 8)));
    const stepMs = Math.max(40, Math.round(1000 / fps));

    frameIntervalRef.current = window.setInterval(() => {
      setFrameIndex((prev) => {
        if (prev + 1 < validFrames.length) {
          return prev + 1;
        }
        return isLoop ? 0 : prev;
      });
    }, stepMs);

    return () => {
      if (frameIntervalRef.current !== null) {
        window.clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    };
  }, [phase, validFrames.length, activeSequence?.fps]);

  // Map a server evaluated reward to its sound category
  const getRewardSoundCategory = (rw: ServerEvaluatedRewardItem): LootboxSoundCategory => {
    if (rw.isConsolation) return 'consolation';
    if (rw.type === 'credits') return 'reward_credits';
    if (rw.type === 'xp') return 'reward_xp';
    if (rw.type === 'lootbox') return 'reward_lootbox';
    if (rw.rarity === 'legendary') return 'reward_item_legendary';
    if (rw.rarity === 'epic') return 'reward_item_epic';
    if (rw.rarity === 'rare') return 'reward_item_rare';
    return 'reward_item_common';
  };

  // Start visual opening & sequential reward reveal after server confirms result
  const startOpeningSequence = useCallback(
    (confirmedData: { user: AuthUser; resultMessage: string; reward: ServerLootboxOpenRewardPayload }) => {
      clearAllTimers();
      setServerResult(confirmedData);
      onUpdateUser(confirmedData.user);

      // Clear pending recovery key now that client received and applied the server response
      try {
        localStorage.removeItem(getPendingLootboxStorageKey(user.id));
      } catch {}

      if (skipRequested) {
        setRevealedCount(confirmedData.reward?.rewards?.length || 0);
        setPhase('summary');
        return;
      }

      setPhase('opening_anim');
      setShowProbabilities(false);
      playLootboxSound('open', presentation.openSoundAssetId);

      const openSeq = presentation.openAnimation;
      const openFps = Math.max(1, Number(openSeq?.fps || 10));
      const openFramesCount = openSeq?.mode === 'custom_frames' ? (openSeq.frames?.length || 0) : 0;
      const openDurationMs =
        openFramesCount > 0
          ? Math.min(3500, Math.max(650, Math.round((openFramesCount / openFps) * 1000)))
          : 1050;

      const rewardsList = confirmedData.reward?.rewards || [];

      const tOpenDone = window.setTimeout(() => {
        if (rewardsList.length === 0) {
          playLootboxSound('consolation', null);
          setRevealedCount(0);
          setPhase('summary');
          return;
        }

        setPhase('revealing');
        setRevealedCount(0);

        rewardsList.forEach((rw, idx) => {
          const tReveal = window.setTimeout(() => {
            setRevealedCount(idx + 1);
            playLootboxSound(getRewardSoundCategory(rw), rw.revealSoundAssetId || null);
          }, idx * 520 + 120);
          timersRef.current.push(tReveal);
        });

        const tSummary = window.setTimeout(() => {
          setPhase('summary');
        }, rewardsList.length * 520 + 600);
        timersRef.current.push(tSummary);
      }, openDurationMs);

      timersRef.current.push(tOpenDone);
    },
    [
      clearAllTimers,
      onUpdateUser,
      playLootboxSound,
      presentation.openAnimation,
      presentation.openSoundAssetId,
      skipRequested,
      user.id
    ]
  );

  // Instant Skip ("Пропустить"): skips visual animation immediately without resending request
  const handleSkipAnimation = () => {
    setSkipRequested(true);
    clearAllTimers();
    if (serverResult) {
      const list = serverResult.reward?.rewards || [];
      setRevealedCount(list.length);
      setPhase('summary');
      if (list.length > 0) {
        const last = list[list.length - 1];
        playLootboxSound(getRewardSoundCategory(last), last.revealSoundAssetId || null);
      }
    }
  };

  // Send open request to server with idempotent operationId
  const executeOpenLootbox = async (opIdToUse: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setErrorText(null);
    setPhase('requesting');

    // Save pending operation in localStorage so a page reload or connection drop can recover it
    const pendingRecord: PendingLootboxOperationRecord = {
      operationId: opIdToUse,
      userId: user.id,
      itemId: itemDef.id,
      inventoryEntryId: inventoryEntry.id,
      lootboxName: snapshot?.name || itemDef.name,
      lootboxIcon: itemDef.icon,
      createdAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(getPendingLootboxStorageKey(user.id), JSON.stringify(pendingRecord));
    } catch {}

    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/user/use-item', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          itemId: itemDef.id,
          inventoryEntryId: inventoryEntry.id,
          operationId: opIdToUse
        })
      });

      const data = await res.json();
      if (!res.ok) {
        // Logical error (e.g. chest no longer in inventory) — clear pending op
        try {
          localStorage.removeItem(getPendingLootboxStorageKey(user.id));
        } catch {}
        setErrorText(data.error || 'Не удалось открыть лутбокс.');
        setPhase('idle');
        return;
      }

      startOpeningSequence({
        user: data.user,
        resultMessage: data.resultMessage,
        reward: data.reward
      });
    } catch {
      // Network failure or interrupted connection: verify via recovery endpoint first
      try {
        const token = localStorage.getItem('mafia_auth_token');
        const checkRes = await fetch(
          `/api/user/lootbox-operations/${encodeURIComponent(opIdToUse)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.found && checkData.operation?.resultPayload) {
            startOpeningSequence({
              user: checkData.user || user,
              resultMessage: checkData.operation.resultPayload.resultMessage || 'Лутбокс открыт!',
              reward: checkData.operation.resultPayload.reward
            });
            return;
          }
        }
      } catch {
        // Still offline
      }

      setErrorText(
        'Связь с сервером прервалась во время открытия. Нажмите «Восстановить результат», чтобы безопасно получить итог операции без повторного списания сундука.'
      );
      setPhase('network_retry');
    } finally {
      inFlightRef.current = false;
    }
  };

  // Compute display probabilities strictly from the stack's ruleSnapshot
  const probabilityRows = useMemo(() => {
    if (!snapshot || !Array.isArray(snapshot.rewards)) return [];
    const rewards = snapshot.rewards;
    const isIndependent = snapshot.dropMode === 'independent';
    const totalWeight = rewards.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);

    return rewards.map((entry: LootboxRewardEntry, idx: number) => {
      const probPercent = isIndependent
        ? Math.min(100, Math.max(0, Number(entry.chancePercent) || 0))
        : totalWeight > 0
        ? ((Number(entry.weight) || 0) / totalWeight) * 100
        : 0;

      let label = '';
      let icon = '🎁';
      let rarity: ItemRarity = 'common';
      let replacementNote: string | null = null;

      const minQ = Math.max(1, Number(entry.minQty) || 1);
      const maxQ = entry.maxQty !== undefined && entry.maxQty !== null ? Math.max(minQ, Number(entry.maxQty)) : minQ;
      const qtyText = minQ === maxQ ? `${minQ}` : `${minQ}–${maxQ}`;

      if (entry.type === 'credits') {
        icon = '💰';
        rarity = maxQ >= 500 ? 'legendary' : maxQ >= 250 ? 'epic' : maxQ >= 100 ? 'rare' : 'common';
        label = `${qtyText} кредитов`;
      } else if (entry.type === 'xp') {
        icon = '⭐';
        rarity = maxQ >= 300 ? 'epic' : maxQ >= 100 ? 'rare' : 'common';
        label = `${qtyText} XP`;
      } else if ((entry.type === 'item' || entry.type === 'lootbox') && entry.itemId) {
        const liveItem = getItemDefinition(entry.itemId);
        const delRep = deletedReplacements[entry.itemId];
        if (liveItem && !delRep) {
          icon = liveItem.icon;
          rarity = liveItem.rarity;
          label = `${liveItem.name}${maxQ > 1 ? ` ×${qtyText}` : ''}`;
        } else if (delRep) {
          icon = delRep.replacementType === 'credits' ? '💰' : '🔄';
          rarity = 'rare';
          label = entry.itemNameSnapshot || delRep.deletedItemName || entry.itemId;
          if (delRep.replacementType === 'credits') {
            replacementNote = `Замена удалённого предмета: +${delRep.replacementQty * minQ} кр.`;
          } else {
            const repDef = delRep.replacementItemId ? getItemDefinition(delRep.replacementItemId) : null;
            replacementNote = `Замена: ${repDef ? repDef.name : delRep.replacementItemId} ×${delRep.replacementQty}`;
          }
        } else {
          icon = entry.type === 'lootbox' ? '🧰' : '📦';
          label = `${entry.itemNameSnapshot || entry.itemId}${maxQ > 1 ? ` ×${qtyText}` : ''}`;
        }
      }

      return {
        id: entry.id || `slot_${idx}`,
        icon,
        label,
        rarity,
        probPercent,
        replacementNote,
        type: entry.type
      };
    });
  }, [snapshot, deletedReplacements]);

  const currentFrameSrc = validFrames[frameIndex]?.resolvedSrc || null;
  const grantedRewards = serverResult?.reward?.rewards || [];

  // Remaining count of this exact stack after opening
  const remainingStackInUpdatedUser = useMemo(() => {
    const inv = serverResult?.user?.inventory || user.inventory || [];
    if (inventoryEntry.id) {
      const exact = inv.find((i) => i.id === inventoryEntry.id);
      return exact ? exact.quantity : 0;
    }
    const byId = inv.find((i) => i.itemId === itemDef.id);
    return byId ? byId.quantity : 0;
  }, [serverResult, user.inventory, inventoryEntry.id, itemDef.id]);

  // Open another chest from the same stack
  const handleOpenAnotherFromSameStack = () => {
    const inv = serverResult?.user?.inventory || user.inventory || [];
    const target = inventoryEntry.id
      ? inv.find((i) => i.id === inventoryEntry.id && i.quantity > 0)
      : inv.find((i) => i.itemId === itemDef.id && i.quantity > 0);
    if (!target) {
      onClose();
      return;
    }
    clearAllTimers();
    setSkipRequested(false);
    setServerResult(null);
    setRevealedCount(0);
    setErrorText(null);
    const nextOpId = generateClientOperationId(user.id, target.id);
    setOperationId(nextOpId);
    setPhase('idle');
  };

  return (
    <div className="fixed inset-0 z-70 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-2xl max-h-[94vh] rounded-3xl border ${presetTheme.borderClass} bg-gradient-to-b ${presetTheme.bgClass} ${presetTheme.glowClass} flex flex-col overflow-hidden`}
      >
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-white/10 bg-black/40 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-black/60 border border-white/15 flex items-center justify-center text-2xl shrink-0">
              {itemDef.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-white truncate">
                  {snapshot?.name || itemDef.name}
                </h3>
                {snapshot && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-950/90 border border-orange-500/50 text-orange-300">
                    Снимок v{snapshot.version}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${presetTheme.badgeBg}`}>
                  {snapshot?.dropMode === 'independent' ? 'Независимые шансы' : '1 взвешенная награда'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                {presetTheme.title} • В этом стеке: {phase === 'summary' ? remainingStackInUpdatedUser : inventoryEntry.quantity} шт.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Sound Mute / Unmute Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              title={isMuted ? 'Включить звук лутбокса' : 'Отключить звук лутбокса'}
              className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isMuted
                  ? 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'
                  : 'bg-amber-950/60 border-amber-500/50 text-amber-300 hover:bg-amber-900/60'
              }`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{isMuted ? 'Без звука' : 'Звук вкл.'}</span>
            </button>

            {/* Close button (disabled only while HTTP request is in flight) */}
            <button
              type="button"
              disabled={phase === 'requesting'}
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
              title="Закрыть окно"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Visual Animation Stage */}
          <div className="relative rounded-2xl border border-white/10 bg-black/55 p-6 flex flex-col items-center justify-center min-h-[215px] overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.14),transparent_70%)] pointer-events-none" />

            {/* Skip Button during opening/revealing */}
            {(phase === 'opening_anim' || phase === 'revealing' || phase === 'requesting') && (
              <button
                type="button"
                onClick={handleSkipAnimation}
                className="absolute top-3 right-3 z-20 px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-amber-500/50 text-amber-300 text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer transition-all"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Пропустить</span>
              </button>
            )}

            {/* Idle / Requesting / Opening Visual */}
            {(phase === 'idle' || phase === 'requesting' || phase === 'opening_anim' || phase === 'network_retry') && (
              <div className="relative z-10 flex flex-col items-center text-center space-y-3">
                <div
                  className={`w-32 h-32 sm:w-36 sm:h-36 rounded-3xl bg-black/60 border-2 ${presetTheme.borderClass} flex items-center justify-center overflow-hidden shadow-2xl transition-transform duration-300 ${
                    phase === 'opening_anim'
                      ? 'scale-110 animate-bounce'
                      : phase === 'requesting'
                      ? 'scale-105 animate-pulse'
                      : 'hover:scale-105'
                  }`}
                >
                  {currentFrameSrc ? (
                    <img
                      src={currentFrameSrc}
                      alt={itemDef.name}
                      className="w-full h-full object-contain p-2"
                    />
                  ) : (
                    <span
                      className={`text-6xl sm:text-7xl select-none ${
                        phase === 'opening_anim' ? 'animate-spin' : 'animate-pulse'
                      }`}
                    >
                      {itemDef.icon}
                    </span>
                  )}
                </div>

                {validFrames.length > 1 && (
                  <span className="px-2 py-0.5 rounded bg-black/60 border border-white/10 text-[10px] font-mono text-zinc-400">
                    Кадр {frameIndex + 1} / {validFrames.length}
                  </span>
                )}

                <div className="space-y-1 max-w-md">
                  <div className={`text-sm font-bold ${presetTheme.accentText}`}>
                    {phase === 'requesting'
                      ? 'Сервер проверяет снимок правил и рассчитывает выпадение...'
                      : phase === 'opening_anim'
                      ? 'Вскрываем замки лутбокса...'
                      : phase === 'network_retry'
                      ? 'Ожидание подтверждения операции от сервера'
                      : snapshot?.description || itemDef.description}
                  </div>
                  {snapshot && (
                    <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Неизменяемый снимок правил #{snapshot.snapshotHash.slice(0, 8)}
                      </span>
                      {snapshot.consolationPrize?.enabled && (
                        <span>• Защита от пустого открытия (утешительный приз)</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sequential Reward Reveal / Final Summary Stage */}
            {(phase === 'revealing' || phase === 'summary') && serverResult && (
              <div className="relative z-10 w-full space-y-4">
                <div className="text-center space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {phase === 'revealing'
                        ? `Раскрытие наград (${revealedCount} из ${grantedRewards.length})...`
                        : 'Лутбокс успешно открыт!'}
                    </span>
                  </div>
                  <p className="text-xs text-amber-200/90 font-medium pt-1">
                    {serverResult.resultMessage}
                  </p>
                </div>

                {grantedRewards.length === 0 ? (
                  <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-700 text-center space-y-1">
                    <div className="text-3xl">💨</div>
                    <div className="text-sm font-bold text-zinc-200">В этот раз сундук оказался пуст</div>
                    <p className="text-xs text-zinc-400">
                      Независимые шансы слотов не сработали при этом открытии.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {grantedRewards.slice(0, revealedCount).map((rw, idx) => {
                      const rCfg = RARITY_CONFIG[rw.rarity || 'common'] || RARITY_CONFIG.common;
                      return (
                        <div
                          key={`${rw.entryId}_${idx}`}
                          className={`p-3.5 rounded-2xl border ${rCfg.bg} ${rCfg.border} flex items-center gap-3 animate-in zoom-in-95 fade-in duration-200`}
                        >
                          <div className="w-12 h-12 rounded-xl bg-black/50 border border-white/10 flex items-center justify-center text-2xl shrink-0">
                            {rw.icon || '🎁'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] font-mono uppercase font-bold ${rCfg.color}`}>
                                {rCfg.label}
                              </span>
                              {rw.isConsolation && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[9px] font-mono font-bold">
                                  Утешительный приз
                                </span>
                              )}
                              {rw.wasReplaced && (
                                <span className="px-1.5 py-0.2 rounded bg-purple-500/20 border border-purple-400/50 text-purple-200 text-[9px] font-mono font-bold">
                                  Компенсация замены
                                </span>
                              )}
                            </div>
                            <div className="text-xs sm:text-sm font-bold text-white truncate mt-0.5">
                              {rw.itemName}
                              {rw.quantity > 1 && rw.type !== 'credits' && rw.type !== 'xp' ? ` ×${rw.quantity}` : ''}
                            </div>
                            <div className="text-[11px] text-zinc-300 flex items-center gap-2 mt-0.5 flex-wrap">
                              {rw.type === 'credits' && (
                                <span className="text-amber-300 font-mono font-bold flex items-center gap-1">
                                  <Coins className="w-3 h-3" /> +{rw.quantity} кр.
                                </span>
                              )}
                              {rw.type === 'xp' && (
                                <span className="text-cyan-300 font-mono font-bold flex items-center gap-1">
                                  <Zap className="w-3 h-3" /> +{rw.quantity} XP
                                </span>
                              )}
                              {rw.type === 'lootbox' && (
                                <span className="text-orange-300 font-mono font-bold flex items-center gap-1">
                                  <Layers className="w-3 h-3" /> Вложенный лутбокс в инвентаре
                                </span>
                              )}
                              {rw.type === 'item' && (
                                <span className="text-emerald-300 font-mono font-bold">
                                  Добавлено в инвентарь ({rw.quantity} шт.)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Updated Balances Banner */}
                {phase === 'summary' && (
                  <div className="p-3 rounded-xl bg-black/50 border border-white/10 flex items-center justify-between flex-wrap gap-2 text-xs">
                    <span className="text-zinc-400 font-mono">
                      Операция подтверждена сервером (#{serverResult.reward.operationId.slice(-8)})
                    </span>
                    <div className="flex items-center gap-3 font-mono font-bold">
                      <span className="text-amber-300 flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-amber-400" />
                        Баланс: {serverResult.user.credits} кр.
                      </span>
                      <span className="text-cyan-300 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-cyan-400" />
                        Опыт: {serverResult.user.xp || 0} XP
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error / Network Retry Alert */}
          {errorText && (
            <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-600/70 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <div className="font-bold">Внимание</div>
                <div>{errorText}</div>
              </div>
            </div>
          )}

          {/* Snapshot Drop Table & Exact Probabilities */}
          {snapshot && probabilityRows.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowProbabilities(!showProbabilities)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-left bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                  <Info className="w-3.5 h-3.5 text-amber-400" />
                  <span>Состав лутбокса и шансы выпадения (из снимка правил v{snapshot.version})</span>
                </div>
                <span className="text-[11px] font-mono text-amber-300">
                  {showProbabilities ? 'Скрыть ▲' : `Показать (${probabilityRows.length}) ▼`}
                </span>
              </button>

              {showProbabilities && (
                <div className="p-3.5 space-y-2 max-h-56 overflow-y-auto divide-y divide-white/5">
                  {probabilityRows.map((row) => {
                    const rCfg = RARITY_CONFIG[row.rarity] || RARITY_CONFIG.common;
                    return (
                      <div key={row.id} className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-lg shrink-0">{row.icon}</span>
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate flex items-center gap-1.5">
                              <span className="truncate">{row.label}</span>
                              <span className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-black/50 ${rCfg.color}`}>
                                {rCfg.label}
                              </span>
                            </div>
                            {row.replacementNote && (
                              <div className="text-[10px] text-amber-300/90 font-mono truncate">
                                {row.replacementNote}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0 font-mono">
                          <span className="px-2 py-0.5 rounded-lg bg-black/60 border border-white/10 text-amber-300 font-bold text-[11px]">
                            {row.probPercent.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {snapshot.consolationPrize?.enabled && (
                    <div className="pt-2.5 flex items-center justify-between gap-2 text-[11px] text-emerald-300 font-mono">
                      <span>🛡️ Гарантированный утешительный приз (при пустом броске):</span>
                      <span className="font-bold">
                        {snapshot.consolationPrize.type === 'credits'
                          ? `${snapshot.consolationPrize.minQty}–${snapshot.consolationPrize.maxQty || snapshot.consolationPrize.minQty} кр.`
                          : snapshot.consolationPrize.type === 'xp'
                          ? `${snapshot.consolationPrize.minQty}–${snapshot.consolationPrize.maxQty || snapshot.consolationPrize.minQty} XP`
                          : snapshot.consolationPrize.itemNameSnapshot || snapshot.consolationPrize.itemId || 'Награда'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="px-5 py-3.5 border-t border-white/10 bg-black/60 flex items-center justify-between gap-3 shrink-0">
          {phase === 'idle' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => executeOpenLootbox(operationId)}
                className="flex-1 py-2.5 px-5 rounded-xl bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-500 hover:from-orange-500 hover:to-yellow-400 text-zinc-950 font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-950/50 cursor-pointer"
              >
                <Gift className="w-4 h-4" />
                <span>Открыть «{snapshot?.name || itemDef.name}»</span>
              </button>
            </>
          )}

          {phase === 'requesting' && (
            <div className="w-full flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-amber-300 font-bold">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Выполняется защищённый розыгрыш на сервере...</span>
              </div>
              <button
                type="button"
                onClick={handleSkipAnimation}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Пропустить анимацию</span>
              </button>
            </div>
          )}

          {(phase === 'opening_anim' || phase === 'revealing') && (
            <div className="w-full flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-300 font-medium">
                Результат уже сохранён в базе данных. Воспроизводится анимация...
              </span>
              <button
                type="button"
                onClick={handleSkipAnimation}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Пропустить</span>
              </button>
            </div>
          )}

          {phase === 'network_retry' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold cursor-pointer"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={() => executeOpenLootbox(operationId)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Восстановить результат (без повторного списания)</span>
              </button>
            </>
          )}

          {phase === 'summary' && (
            <div className="w-full flex items-center justify-between gap-2.5">
              {remainingStackInUpdatedUser > 0 ? (
                <button
                  type="button"
                  onClick={handleOpenAnotherFromSameStack}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Открыть ещё из этого стека ({remainingStackInUpdatedUser} шт.)</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className={`${
                  remainingStackInUpdatedUser > 0 ? 'px-5' : 'w-full'
                } py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer`}
              >
                Забрать награды и закрыть
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
