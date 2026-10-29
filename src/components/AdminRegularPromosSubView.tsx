import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Ticket,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  AlertTriangle,
  Eye,
  Power,
  Package,
  Coins,
  ShieldCheck,
  Loader2,
  X,
} from 'lucide-react';
import { ItemDefinition, LOYALTY_CREDITS_ITEM_ID, RARITY_CONFIG } from '../data/items';
import { sounds } from '../utils/audio';
import {
  getClientProjectTimezone,
  subscribeClientProjectTimezone,
  getTimezoneOffsetLabel,
  toDatetimeLocalInTimezone,
  fromDatetimeLocalInTimezone,
} from '../utils/timezone';

export type PromoConditionType = 'matches_completed' | 'active_playtime_minutes' | 'reach_level';

export interface PromoRewardCondition {
  type: PromoConditionType;
  target: number;
}

export interface PromoRewardConfig {
  id: string;
  itemId: string;
  quantity: number;
  grantMode: 'immediate' | 'conditional';
  conditionLogic: 'AND' | 'OR';
  conditions: PromoRewardCondition[];
}

export type PromoScheduleType = 'indefinite' | 'start_only' | 'end_only' | 'range' | 'annual';
export type PromoLimitType = 'unlimited' | 'per_cycle' | 'lifetime';

export interface RegularPromoCode {
  id: string;
  codeNormalized: string;
  codeDisplay: string;
  title: string;
  description: string;
  isEnabled: boolean;
  scheduleType: PromoScheduleType;
  startsAt: string | null;
  endsAt: string | null;
  annualStartMmdd: string | null;
  annualEndMmdd: string | null;
  scheduleTimezone?: string;
  currentCycle: number;
  limitType: PromoLimitType;
  maxActivations: number | null;
  totalActivations: number;
  cycleActivations: number;
  currentCycleKey: string;
  isCurrentlyActiveWindow: boolean;
  effectiveStatus: 'active' | 'disabled' | 'not_started' | 'expired' | 'exhausted';
  rewards: PromoRewardConfig[];
  createdAt: string;
  updatedAt: string;
}

interface AdminRegularPromosSubViewProps {
  token: string;
  catalogItems: ItemDefinition[];
  onNotify?: (msg: string, type: 'success' | 'error') => void;
}

export const AdminRegularPromosSubView: React.FC<AdminRegularPromosSubViewProps> = ({
  token,
  catalogItems,
  onNotify,
}) => {
  const [promos, setPromos] = useState<RegularPromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectTz, setProjectTz] = useState<string>(() => getClientProjectTimezone());

  useEffect(() => {
    return subscribeClientProjectTimezone((tz) => setProjectTz(tz));
  }, []);

  // Create / Edit modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [isEnabledInput, setIsEnabledInput] = useState(true);
  const [scheduleTypeInput, setScheduleTypeInput] = useState<PromoScheduleType>('indefinite');
  const [startsAtInput, setStartsAtInput] = useState('');
  const [endsAtInput, setEndsAtInput] = useState('');
  const [annualStartInput, setAnnualStartInput] = useState('12-25');
  const [annualEndInput, setAnnualEndInput] = useState('01-10');
  const [limitTypeInput, setLimitTypeInput] = useState<PromoLimitType>('unlimited');
  const [maxActivationsInput, setMaxActivationsInput] = useState<number>(100);
  const [rewardsInput, setRewardsInput] = useState<PromoRewardConfig[]>([]);

  // Manual Cycle Restart Confirmation Modal
  const [restartPromo, setRestartPromo] = useState<RegularPromoCode | null>(null);
  const [restartScheduleType, setRestartScheduleType] = useState<PromoScheduleType>('indefinite');
  const [restartStartsAt, setRestartStartsAt] = useState('');
  const [restartEndsAt, setRestartEndsAt] = useState('');
  const [restartAnnualStart, setRestartAnnualStart] = useState('12-25');
  const [restartAnnualEnd, setRestartAnnualEnd] = useState('01-10');
  const [restartLimitType, setRestartLimitType] = useState<PromoLimitType>('unlimited');
  const [restartMaxActivations, setRestartMaxActivations] = useState<number>(100);
  const [restartIsEnabled, setRestartIsEnabled] = useState<boolean>(true);

  // Details / Activations Modal
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<{
    promo: RegularPromoCode;
    activations: Array<{
      id: string;
      userId: string;
      userDisplayName: string;
      userEmail: string;
      cycleKey: string;
      activatedAt: string;
      allPlayerRewardsGranted: boolean;
      currentGamesSince: number;
      currentActiveMinutesSince: number;
      currentLevel: number;
    }>;
  } | null>(null);

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<RegularPromoCode | null>(null);

  const notify = useCallback(
    (msg: string, type: 'success' | 'error') => {
      if (onNotify) onNotify(msg, type);
    },
    [onNotify]
  );

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/promocodes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки промокодов');
      setPromos(data.promocodes || []);
    } catch (err: any) {
      notify(err.message || 'Ошибка загрузки промокодов', 'error');
    } finally {
      setLoading(false);
    }
  }, [token, notify]);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  const selectableCatalog = useMemo(() => {
    const creditsPseudoItem: ItemDefinition = {
      id: LOYALTY_CREDITS_ITEM_ID,
      name: 'Внутриигровые кредиты (кр.)',
      category: 'certificates',
      rarity: 'rare',
      cost: 1,
      pawnValue: 0,
      icon: '💰',
      usable: false,
      consumable: false,
      inShop: false,
      adminHidden: false,
      description: 'Прямое начисление кредитов на игровой баланс пользователя.',
    };
    const usedIds = new Set(rewardsInput.map((r) => r.itemId));
    const visibleItems = catalogItems.filter((it) => !it.adminHidden || usedIds.has(it.id));
    return [creditsPseudoItem, ...visibleItems];
  }, [catalogItems, rewardsInput]);

  const getItemMeta = (itemId: string) => {
    if (itemId === LOYALTY_CREDITS_ITEM_ID) {
      return {
        name: 'Кредиты Клуба',
        icon: '💰',
        rarity: 'rare' as const,
      };
    }
    const found = catalogItems.find((i) => i.id === itemId);
    return {
      name: found?.name || itemId,
      icon: found?.icon || '🎁',
      rarity: (found?.rarity || 'common') as keyof typeof RARITY_CONFIG,
    };
  };

  const openCreateModal = () => {
    sounds.playTick();
    setEditingId(null);
    setCodeInput('');
    setTitleInput('');
    setDescInput('');
    setIsEnabledInput(true);
    setScheduleTypeInput('indefinite');
    setStartsAtInput('');
    setEndsAtInput('');
    setAnnualStartInput('12-25');
    setAnnualEndInput('01-10');
    setLimitTypeInput('unlimited');
    setMaxActivationsInput(100);
    setRewardsInput([
      {
        id: `rw_${Date.now()}`,
        itemId: LOYALTY_CREDITS_ITEM_ID,
        quantity: 250,
        grantMode: 'immediate',
        conditionLogic: 'AND',
        conditions: [],
      },
    ]);
    setEditorOpen(true);
  };

  const openEditModal = (promo: RegularPromoCode) => {
    sounds.playTick();
    const promoTz = promo.scheduleTimezone || projectTz;
    setEditingId(promo.id);
    setCodeInput(promo.codeDisplay);
    setTitleInput(promo.title);
    setDescInput(promo.description);
    setIsEnabledInput(promo.isEnabled);
    setScheduleTypeInput(promo.scheduleType);
    setStartsAtInput(toDatetimeLocalInTimezone(promo.startsAt, promoTz));
    setEndsAtInput(toDatetimeLocalInTimezone(promo.endsAt, promoTz));
    setAnnualStartInput(promo.annualStartMmdd || '12-25');
    setAnnualEndInput(promo.annualEndMmdd || '01-10');
    setLimitTypeInput(promo.limitType);
    setMaxActivationsInput(promo.maxActivations || 100);
    setRewardsInput(
      promo.rewards.length > 0
        ? JSON.parse(JSON.stringify(promo.rewards))
        : [
            {
              id: `rw_${Date.now()}`,
              itemId: LOYALTY_CREDITS_ITEM_ID,
              quantity: 250,
              grantMode: 'immediate',
              conditionLogic: 'AND',
              conditions: [],
            },
          ]
    );
    setEditorOpen(true);
  };

  const handleSavePromo = async () => {
    setSaving(true);
    try {
      const existingPromo = editingId ? promos.find((p) => p.id === editingId) || null : null;
      const effectiveTz = existingPromo?.scheduleTimezone || projectTz;
      const originalStartsLocal = existingPromo
        ? toDatetimeLocalInTimezone(existingPromo.startsAt, effectiveTz)
        : '';
      const originalEndsLocal = existingPromo
        ? toDatetimeLocalInTimezone(existingPromo.endsAt, effectiveTz)
        : '';

      const resolvedStartsAt =
        existingPromo && startsAtInput === originalStartsLocal
          ? existingPromo.startsAt
          : fromDatetimeLocalInTimezone(startsAtInput, projectTz);
      const resolvedEndsAt =
        existingPromo && endsAtInput === originalEndsLocal
          ? existingPromo.endsAt
          : fromDatetimeLocalInTimezone(endsAtInput, projectTz);

      const payload = {
        code: codeInput.trim().toUpperCase(),
        title: titleInput.trim(),
        description: descInput.trim(),
        isEnabled: isEnabledInput,
        scheduleType: scheduleTypeInput,
        startsAt: resolvedStartsAt,
        endsAt: resolvedEndsAt,
        annualStartMmdd: annualStartInput.trim(),
        annualEndMmdd: annualEndInput.trim(),
        limitType: limitTypeInput,
        maxActivations:
          limitTypeInput === 'unlimited' ? null : Math.max(1, Math.floor(Number(maxActivationsInput) || 1)),
        rewards: rewardsInput,
      };

      const url = editingId ? `/api/admin/promocodes/${editingId}` : '/api/admin/promocodes';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения промокода');

      sounds.playTick();
      notify(data.message || 'Промокод сохранён', 'success');
      setEditorOpen(false);
      await fetchPromos();
    } catch (err: any) {
      notify(err.message || 'Ошибка сохранения промокода', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickToggle = async (promo: RegularPromoCode) => {
    try {
      const res = await fetch(`/api/admin/promocodes/${promo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isEnabled: !promo.isEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка переключения статуса');
      sounds.playTick();
      notify(
        `Промокод «${promo.codeDisplay}» ${!promo.isEnabled ? 'включён' : 'отключён'}`,
        'success'
      );
      await fetchPromos();
    } catch (err: any) {
      notify(err.message || 'Ошибка переключения статуса', 'error');
    }
  };

  const openRestartModal = (promo: RegularPromoCode) => {
    sounds.playTick();
    const promoTz = promo.scheduleTimezone || projectTz;
    setRestartPromo(promo);
    setRestartScheduleType(promo.scheduleType);
    setRestartStartsAt(toDatetimeLocalInTimezone(promo.startsAt, promoTz));
    setRestartEndsAt(toDatetimeLocalInTimezone(promo.endsAt, promoTz));
    setRestartAnnualStart(promo.annualStartMmdd || '12-25');
    setRestartAnnualEnd(promo.annualEndMmdd || '01-10');
    setRestartLimitType(promo.limitType);
    setRestartMaxActivations(promo.maxActivations || 100);
    setRestartIsEnabled(true);
  };

  const handleConfirmRestartCycle = async () => {
    if (!restartPromo) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/promocodes/${restartPromo.id}/restart-cycle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scheduleType: restartScheduleType,
          startsAt: fromDatetimeLocalInTimezone(restartStartsAt, projectTz),
          endsAt: fromDatetimeLocalInTimezone(restartEndsAt, projectTz),
          annualStartMmdd: restartAnnualStart.trim(),
          annualEndMmdd: restartAnnualEnd.trim(),
          limitType: restartLimitType,
          maxActivations:
            restartLimitType === 'unlimited'
              ? null
              : Math.max(1, Math.floor(Number(restartMaxActivations) || 1)),
          isEnabled: restartIsEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка перезапуска цикла');
      sounds.playTick();
      notify(data.message || 'Цикл промокода перезапущен', 'success');
      setRestartPromo(null);
      await fetchPromos();
    } catch (err: any) {
      notify(err.message || 'Ошибка перезапуска цикла', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/promocodes/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка удаления промокода');
      sounds.playTick();
      notify(data.message || 'Промокод удалён', 'success');
      setDeleteTarget(null);
      await fetchPromos();
    } catch (err: any) {
      notify(err.message || 'Ошибка удаления промокода', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openDetailsModal = async (promoId: string) => {
    setDetailsModalOpen(true);
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/admin/promocodes/${promoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки деталей');
      setDetailsData(data);
    } catch (err: any) {
      notify(err.message || 'Ошибка загрузки деталей', 'error');
      setDetailsModalOpen(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Reward Editor Helpers
  const addRewardRow = () => {
    setRewardsInput((prev) => [
      ...prev,
      {
        id: `rw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        itemId: LOYALTY_CREDITS_ITEM_ID,
        quantity: 100,
        grantMode: 'immediate',
        conditionLogic: 'AND',
        conditions: [],
      },
    ]);
  };

  const removeRewardRow = (index: number) => {
    setRewardsInput((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRewardRow = (index: number, patch: Partial<PromoRewardConfig>) => {
    setRewardsInput((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        if (next.grantMode === 'conditional' && (!next.conditions || next.conditions.length === 0)) {
          next.conditions = [{ type: 'matches_completed', target: 3 }];
        }
        return next;
      })
    );
  };

  const addConditionToReward = (rewardIndex: number) => {
    setRewardsInput((prev) =>
      prev.map((row, i) => {
        if (i !== rewardIndex) return row;
        return {
          ...row,
          conditions: [...(row.conditions || []), { type: 'matches_completed', target: 1 }],
        };
      })
    );
  };

  const updateConditionInReward = (
    rewardIndex: number,
    condIndex: number,
    patch: Partial<PromoRewardCondition>
  ) => {
    setRewardsInput((prev) =>
      prev.map((row, i) => {
        if (i !== rewardIndex) return row;
        const nextConds = row.conditions.map((c, ci) => (ci === condIndex ? { ...c, ...patch } : c));
        return { ...row, conditions: nextConds };
      })
    );
  };

  const removeConditionFromReward = (rewardIndex: number, condIndex: number) => {
    setRewardsInput((prev) =>
      prev.map((row, i) => {
        if (i !== rewardIndex) return row;
        return {
          ...row,
          conditions: row.conditions.filter((_, ci) => ci !== condIndex),
        };
      })
    );
  };

  const renderStatusBadge = (promo: RegularPromoCode) => {
    switch (promo.effectiveStatus) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            АКТИВЕН
          </span>
        );
      case 'disabled':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 uppercase">
            ОТКЛЮЧЁН
          </span>
        );
      case 'not_started':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-blue-950/80 border border-blue-500/60 text-blue-300 uppercase">
            ОЖИДАЕТ СТАРТА
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/60 text-rose-300 uppercase">
            СРОК ИСТЁК
          </span>
        );
      case 'exhausted':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/60 text-amber-300 uppercase">
            ЛИМИТ ИСЧЕРПАН
          </span>
        );
    }
  };

  const renderScheduleSummary = (promo: RegularPromoCode) => {
    const tz = promo.scheduleTimezone || projectTz;
    const fmt = (iso: string | null) =>
      iso ? new Date(iso).toLocaleString('ru-RU', { timeZone: tz }) : '—';
    if (promo.scheduleType === 'indefinite') return 'Бессрочный';
    if (promo.scheduleType === 'start_only') {
      return `С ${fmt(promo.startsAt)} (${tz})`;
    }
    if (promo.scheduleType === 'end_only') {
      return `До ${fmt(promo.endsAt)} (${tz})`;
    }
    if (promo.scheduleType === 'range') {
      return `${fmt(promo.startsAt)} — ${fmt(promo.endsAt)} (${tz})`;
    }
    if (promo.scheduleType === 'annual') {
      return `Ежегодно (${tz}): ${promo.annualStartMmdd} — ${promo.annualEndMmdd}`;
    }
    return 'Бессрочный';
  };

  return (
    <div className="p-4 sm:p-5 space-y-5">
      {/* Top Banner & Action */}
      <div className="p-4 rounded-2xl bg-[#12131b] border border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wide">
              Обычные промокоды Клуба ({promos.length})
            </h3>
          </div>
          <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
            Управляйте промокодами с гибкими сроками действия, ежегодными циклами, лимитами активаций
            и мгновенными или отложенными наградами из единого каталога предметов.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchPromos}
            className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/80 cursor-pointer"
            title="Обновить список"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-orange-950/40 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Создать промокод</span>
          </button>
        </div>
      </div>

      {/* Promo Codes List */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-2">
          <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
          <span className="text-xs font-mono">Загрузка промокодов...</span>
        </div>
      ) : promos.length === 0 ? (
        <div className="py-12 rounded-2xl bg-[#12131b] border border-dashed border-zinc-800 flex flex-col items-center justify-center text-center p-6 space-y-3">
          <Ticket className="w-10 h-10 text-zinc-600" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-zinc-200">Обычные промокоды ещё не созданы</h4>
            <p className="text-xs text-zinc-500 max-w-md">
              Нажмите «Создать промокод», чтобы добавить акционный код с кредитами, предметами,
              сертификатами или лутбоксами.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {promos.map((promo) => (
            <div
              key={promo.id}
              className="p-4 rounded-2xl bg-[#12131b] border border-zinc-800/90 hover:border-zinc-700/90 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              {/* Left info */}
              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="px-3 py-1 rounded-lg bg-amber-950/60 border border-amber-500/50 font-mono font-bold text-sm text-amber-300 tracking-wider">
                    {promo.codeDisplay}
                  </span>
                  {renderStatusBadge(promo)}
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800/90 border border-zinc-700 text-zinc-300">
                    Цикл #{promo.currentCycle}
                  </span>
                  {promo.title && (
                    <span className="text-xs font-bold text-zinc-200 truncate">{promo.title}</span>
                  )}
                </div>

                {promo.description && (
                  <p className="text-xs text-zinc-400 line-clamp-2">{promo.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-400 font-mono">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                    {renderScheduleSummary(promo)}
                  </span>
                  <span>
                    Активаций (цикл / всего):{' '}
                    <strong className="text-white">{promo.cycleActivations}</strong> /{' '}
                    <strong className="text-white">{promo.totalActivations}</strong>
                    {promo.limitType === 'per_cycle' && promo.maxActivations
                      ? ` (лимит цикла: ${promo.maxActivations})`
                      : promo.limitType === 'lifetime' && promo.maxActivations
                      ? ` (общий лимит: ${promo.maxActivations})`
                      : ' (без лимита)'}
                  </span>
                </div>

                {/* Rewards preview pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {promo.rewards.map((rw, idx) => {
                    const meta = getItemMeta(rw.itemId);
                    return (
                      <span
                        key={rw.id || idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#181a26] border border-zinc-700/80 text-xs text-zinc-200"
                      >
                        <span>{meta.icon}</span>
                        <span className="font-semibold">{meta.name}</span>
                        <span className="text-amber-300 font-mono font-bold">x{rw.quantity}</span>
                        {rw.grantMode === 'conditional' && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-950/90 border border-purple-600/60 text-purple-300">
                            Условия ({rw.conditions.length})
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Right actions */}
              <div className="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-center">
                <button
                  type="button"
                  onClick={() => openDetailsModal(promo.id)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 cursor-pointer"
                  title="Статистика и история активаций"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>Активации</span>
                </button>

                <button
                  type="button"
                  onClick={() => openRestartModal(promo)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-200 text-xs font-semibold flex items-center gap-1.5 border border-indigo-600/50 cursor-pointer"
                  title="Начать новый цикл промокода (разрешить повторную активацию в новом периоде)"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Новый цикл</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickToggle(promo)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border cursor-pointer ${
                    promo.isEnabled
                      ? 'bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border-emerald-600/50'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{promo.isEnabled ? 'Выкл.' : 'Вкл.'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => openEditModal(promo)}
                  className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer"
                  title="Редактировать"
                >
                  <Edit3 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(promo)}
                  className="p-2 rounded-xl bg-zinc-800 hover:bg-rose-950/80 text-zinc-400 hover:text-rose-300 border border-zinc-700 hover:border-rose-600 cursor-pointer"
                  title="Удалить промокод"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =====================================================================
          CREATE / EDIT REGULAR PROMO CODE MODAL
      ===================================================================== */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-[#11121a] border border-zinc-700/90 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 bg-[#161824] border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Ticket className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                  {editingId ? 'Редактирование промокода' : 'Создание нового промокода'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Row 1: Code, Title, Enable */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                    Код промокода *
                  </label>
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    placeholder="MAFIA2025"
                    className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-amber-300 uppercase focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                    Название акции
                  </label>
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="Праздничный бонус"
                    className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                    Статус активности
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsEnabledInput((v) => !v)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer ${
                      isEnabledInput
                        ? 'bg-emerald-950/60 border-emerald-600/70 text-emerald-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span>{isEnabledInput ? 'ВКЛЮЧЁН' : 'ОТКЛЮЧЁН ВРУЧНУЮ'}</span>
                    <Power className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                  Описание / комментарий для администраторов
                </label>
                <input
                  type="text"
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  placeholder="Необязательное описание назначения промокода"
                  className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Row 2: Schedule & Limits */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-[#151722] border border-zinc-800">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-bold text-zinc-200 uppercase tracking-wider">
                      Срок действия и расписание
                    </label>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-amber-300">
                      Пояс: {projectTz} ({getTimezoneOffsetLabel(projectTz)})
                    </span>
                  </div>
                  <select
                    value={scheduleTypeInput}
                    onChange={(e) => setScheduleTypeInput(e.target.value as PromoScheduleType)}
                    className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-amber-500"
                  >
                    <option value="indefinite">Бессрочный (без ограничений по дате)</option>
                    <option value="start_only">Только с даты и времени начала</option>
                    <option value="end_only">Только до даты и времени окончания</option>
                    <option value="range">Интервал (дата начала и дата окончания)</option>
                    <option value="annual">Ежегодный цикл (повторяется каждый год в часовом поясе проекта)</option>
                  </select>

                  {(scheduleTypeInput === 'start_only' || scheduleTypeInput === 'range') && (
                    <div>
                      <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                        Дата и время начала ({projectTz})
                      </label>
                      <input
                        type="datetime-local"
                        value={startsAtInput}
                        onChange={(e) => setStartsAtInput(e.target.value)}
                        className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
                      />
                    </div>
                  )}

                  {(scheduleTypeInput === 'end_only' || scheduleTypeInput === 'range') && (
                    <div>
                      <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                        Дата и время окончания ({projectTz})
                      </label>
                      <input
                        type="datetime-local"
                        value={endsAtInput}
                        onChange={(e) => setEndsAtInput(e.target.value)}
                        className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
                      />
                    </div>
                  )}

                  {scheduleTypeInput === 'annual' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                          Начало (ММ-ДД, {projectTz})
                        </label>
                        <input
                          type="text"
                          value={annualStartInput}
                          onChange={(e) => setAnnualStartInput(e.target.value)}
                          placeholder="12-25"
                          className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                          Конец (ММ-ДД, {projectTz})
                        </label>
                        <input
                          type="text"
                          value={annualEndInput}
                          onChange={(e) => setAnnualEndInput(e.target.value)}
                          placeholder="01-10"
                          className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <div className="col-span-2 text-[10px] text-zinc-400 leading-relaxed">
                        Поддерживаются периоды через Новый год (например, <code>12-25</code> —{' '}
                        <code>01-10</code>) и високосный день <code>02-29</code>. В каждом новом
                        году цикл открывается автоматически (если промокод не отключён вручную).
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-bold text-zinc-200 uppercase tracking-wider">
                    Лимит количества активаций
                  </label>
                  <select
                    value={limitTypeInput}
                    onChange={(e) => setLimitTypeInput(e.target.value as PromoLimitType)}
                    className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-amber-500"
                  >
                    <option value="unlimited">Без лимита по числу игроков</option>
                    <option value="per_cycle">Лимит на один цикл действия</option>
                    <option value="lifetime">Общий пожизненный лимит промокода</option>
                  </select>

                  {limitTypeInput !== 'unlimited' && (
                    <div>
                      <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                        Максимальное число активаций
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={maxActivationsInput}
                        onChange={(e) => setMaxActivationsInput(parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-amber-300"
                      />
                      <p className="text-[10px] text-zinc-500 mt-1">
                        Изменение лимита не обнуляет уже выполненные активации. Каждый игрок может
                        активировать промокод не более 1 раза за текущий цикл.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: Universal Multi-Reward Builder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Package className="w-4 h-4 text-amber-400" />
                      Награды и условия выдачи ({rewardsInput.length})
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      Для каждой награды можно выбрать мгновенную выдачу при активации или выдачу
                      после выполнения условий.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addRewardRow}
                    className="px-3 py-1.5 rounded-xl bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить награду</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {rewardsInput.map((rw, idx) => {
                    const meta = getItemMeta(rw.itemId);
                    return (
                      <div
                        key={rw.id || idx}
                        className="p-3.5 rounded-xl bg-[#151722] border border-zinc-800 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 flex-1">
                            <span className="text-xl">{meta.icon}</span>
                            <select
                              value={rw.itemId}
                              onChange={(e) => updateRewardRow(idx, { itemId: e.target.value })}
                              className="bg-[#0c0d13] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold flex-1"
                            >
                              {selectableCatalog.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.icon} {cat.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-zinc-400">Кол-во:</span>
                            <input
                              type="number"
                              min={1}
                              value={rw.quantity}
                              onChange={(e) =>
                                updateRewardRow(idx, {
                                  quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                                })
                              }
                              className="w-24 bg-[#0c0d13] border border-zinc-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-300 text-center"
                            />
                            <select
                              value={rw.grantMode}
                              onChange={(e) =>
                                updateRewardRow(idx, {
                                  grantMode: e.target.value as 'immediate' | 'conditional',
                                })
                              }
                              className="bg-[#0c0d13] border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-semibold"
                            >
                              <option value="immediate">Сразу при активации</option>
                              <option value="conditional">После выполнения условий</option>
                            </select>

                            {rewardsInput.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeRewardRow(idx)}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-300 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {rw.grantMode === 'conditional' && (
                          <div className="p-3 rounded-xl bg-[#0e1018] border border-purple-900/40 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-purple-300 uppercase">
                                  Условия получения этой награды:
                                </span>
                                <select
                                  value={rw.conditionLogic}
                                  onChange={(e) =>
                                    updateRewardRow(idx, {
                                      conditionLogic: e.target.value as 'AND' | 'OR',
                                    })
                                  }
                                  className="bg-[#161824] border border-purple-700/60 rounded-lg px-2 py-0.5 text-[11px] text-purple-200 font-bold"
                                >
                                  <option value="AND">Выполнить ВСЕ условия (И)</option>
                                  <option value="OR">Выполнить ЛЮБОЕ условие (ИЛИ)</option>
                                </select>
                              </div>

                              <button
                                type="button"
                                onClick={() => addConditionToReward(idx)}
                                className="px-2.5 py-1 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-700/60 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Добавить условие</span>
                              </button>
                            </div>

                            <div className="space-y-2">
                              {rw.conditions.map((cond, cIdx) => (
                                <div
                                  key={cIdx}
                                  className="flex flex-wrap items-center gap-2 bg-[#141622] p-2 rounded-lg border border-zinc-800"
                                >
                                  <select
                                    value={cond.type}
                                    onChange={(e) =>
                                      updateConditionInReward(idx, cIdx, {
                                        type: e.target.value as PromoConditionType,
                                      })
                                    }
                                    className="bg-[#0c0d13] border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white flex-1 min-w-[210px]"
                                  >
                                    <option value="matches_completed">
                                      Завершённые партии (после активации)
                                    </option>
                                    <option value="active_playtime_minutes">
                                      Активное время в партиях (мин., после активации)
                                    </option>
                                    <option value="reach_level">
                                      Достижение уровня (уже достигнутый засчитывается сразу)
                                    </option>
                                  </select>

                                  <input
                                    type="number"
                                    min={1}
                                    step={cond.type === 'active_playtime_minutes' ? '0.5' : '1'}
                                    value={cond.target}
                                    onChange={(e) =>
                                      updateConditionInReward(idx, cIdx, {
                                        target: Math.max(0.5, Number(e.target.value) || 1),
                                      })
                                    }
                                    className="w-24 bg-[#0c0d13] border border-zinc-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-300 text-center"
                                  />

                                  <span className="text-[11px] text-zinc-400 font-mono">
                                    {cond.type === 'matches_completed'
                                      ? 'партий'
                                      : cond.type === 'active_playtime_minutes'
                                      ? 'минут'
                                      : 'уровень'}
                                  </span>

                                  {rw.conditions.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeConditionFromReward(idx, cIdx)}
                                      className="p-1 text-zinc-400 hover:text-rose-400 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-[#161824] border-t border-zinc-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSavePromo}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{editingId ? 'Сохранить изменения' : 'Создать промокод'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MANUAL CYCLE RESTART CONFIRMATION MODAL (STAGE 2.3)
      ===================================================================== */}
      {restartPromo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#11121a] border border-indigo-500/50 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-indigo-950/40 border-b border-indigo-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Перезапуск цикла промокода «{restartPromo.codeDisplay}»
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRestartPromo(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/50 text-indigo-200 space-y-1.5">
                <div className="font-bold">
                  Переход с Цикла #{restartPromo.currentCycle} на Цикл #{restartPromo.currentCycle + 1}
                </div>
                <p className="text-[11px] text-indigo-300/90 leading-relaxed">
                  При запуске нового цикла счётчик активаций текущего цикла сбрасывается в 0, и
                  игроки, активировавшие промокод в предыдущих циклах, смогут активировать его снова
                  1 раз в новом цикле. Все ранее выданные награды и незавершённые обязательства
                  прошлых циклов полностью сохраняются.
                </p>
              </div>

              <div className="space-y-3">
                <div className="font-bold text-zinc-200 uppercase">
                  Проверьте настройки на новый цикл:
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                    Режим срока действия
                  </label>
                  <select
                    value={restartScheduleType}
                    onChange={(e) => setRestartScheduleType(e.target.value as PromoScheduleType)}
                    className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="indefinite">Бессрочный</option>
                    <option value="start_only">С даты начала ({projectTz})</option>
                    <option value="end_only">До даты окончания ({projectTz})</option>
                    <option value="range">Интервал дат ({projectTz})</option>
                    <option value="annual">Ежегодный цикл ({projectTz})</option>
                  </select>
                </div>

                {(restartScheduleType === 'start_only' || restartScheduleType === 'range') && (
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                      Дата начала
                    </label>
                    <input
                      type="datetime-local"
                      value={restartStartsAt}
                      onChange={(e) => setRestartStartsAt(e.target.value)}
                      className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                )}

                {(restartScheduleType === 'end_only' || restartScheduleType === 'range') && (
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                      Дата окончания
                    </label>
                    <input
                      type="datetime-local"
                      value={restartEndsAt}
                      onChange={(e) => setRestartEndsAt(e.target.value)}
                      className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                      Тип лимита
                    </label>
                    <select
                      value={restartLimitType}
                      onChange={(e) => setRestartLimitType(e.target.value as PromoLimitType)}
                      className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
                    >
                      <option value="unlimited">Без лимита</option>
                      <option value="per_cycle">Лимит на цикл</option>
                      <option value="lifetime">Общий лимит</option>
                    </select>
                  </div>
                  {restartLimitType !== 'unlimited' && (
                    <div>
                      <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                        Макс. активаций
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={restartMaxActivations}
                        onChange={(e) =>
                          setRestartMaxActivations(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                        className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-amber-300"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-[#161824] border-t border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRestartPromo(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmRestartCycle}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Подтвердить запуск Цикла #{restartPromo.currentCycle + 1}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DELETE REGULAR PROMO CONFIRMATION MODAL (STAGE 2.5)
      ===================================================================== */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#11121a] border border-rose-500/50 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-rose-950/40 border-b border-rose-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-bold text-white uppercase">
                  Удаление промокода «{deleteTarget.codeDisplay}»
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs text-zinc-300 leading-relaxed">
              <p>
                Промокод <strong>{deleteTarget.codeDisplay}</strong> будет удалён из списка активных
                промокодов, а его новые активации прекратятся.
              </p>
              <p className="text-emerald-300/90 bg-emerald-950/30 border border-emerald-800/40 p-3 rounded-xl">
                Все уже выданные игрокам награды и ожидающие выполнения условий награды по этому
                промокоду будут полностью сохранены.
              </p>
            </div>
            <div className="px-5 py-3.5 bg-[#161824] border-t border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase cursor-pointer"
              >
                Удалить промокод
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PROMO CODE DETAILS & ACTIVATIONS MODAL
      ===================================================================== */}
      {detailsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-[#11121a] border border-zinc-700 shadow-2xl overflow-hidden max-h-[88vh] flex flex-col">
            <div className="px-5 py-4 bg-[#161824] border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white uppercase">
                  История активаций промокода{' '}
                  {detailsData?.promo ? `«${detailsData.promo.codeDisplay}»` : ''}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailsModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {detailsLoading || !detailsData ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  <span className="text-xs font-mono">Загрузка журнала активаций...</span>
                </div>
              ) : detailsData.activations.length === 0 ? (
                <div className="py-10 text-center text-xs text-zinc-500 font-mono">
                  Этот промокод ещё никто не активировал
                </div>
              ) : (
                <div className="space-y-2">
                  {detailsData.activations.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-xl bg-[#161824] border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-zinc-200 flex items-center gap-2">
                          <span>{act.userDisplayName}</span>
                          {act.userEmail && (
                            <span className="text-[11px] text-zinc-400 font-normal">
                              ({act.userEmail})
                            </span>
                          )}
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            {act.cycleKey}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          Активирован: {new Date(act.activatedAt).toLocaleString('ru-RU')} • Партий с
                          активации: {act.currentGamesSince} • Активных мин.:{' '}
                          {act.currentActiveMinutesSince} • Уровень: {act.currentLevel}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {act.allPlayerRewardsGranted ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 text-[10px] font-mono font-bold uppercase">
                            Все награды выданы
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-600/60 text-amber-300 text-[10px] font-mono font-bold uppercase">
                            Выполняет условия
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
