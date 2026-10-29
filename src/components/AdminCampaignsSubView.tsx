import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Flame,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
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
  Users,
  Gift,
  HelpCircle,
} from 'lucide-react';
import { ItemDefinition, LOYALTY_CREDITS_ITEM_ID, LOYALTY_CREDITS_ITEM_DEF, RARITY_CONFIG } from '../data/items';
import { sounds } from '../utils/audio';
import {
  getClientProjectTimezone,
  subscribeClientProjectTimezone,
  getTimezoneOffsetLabel,
  toDatetimeLocalInTimezone,
  fromDatetimeLocalInTimezone,
  formatDateTimeInTimezone,
} from '../utils/timezone';

export interface CampaignRewardItem {
  itemId: string;
  quantity: number;
}

export interface CampaignGrantedRewardSnapshot {
  itemId: string;
  quantity: number;
  name: string;
  icon: string;
  category: string;
  rarity: string;
  imageUrl?: string;
}

export type CampaignEffectiveStatus = 'active' | 'upcoming' | 'expired' | 'disabled';

export interface CampaignRecord {
  id: string;
  title: string;
  description: string;
  isEnabled: boolean;
  isDeleted: boolean;
  startsAt: string;
  endsAt: string;
  scheduleTimezone: string;
  rewards: CampaignRewardItem[];
  rewardsEnriched: CampaignGrantedRewardSnapshot[];
  effectiveStatus: CampaignEffectiveStatus;
  isCurrentlyActiveWindow: boolean;
  uniqueRecipientsCount: number;
  pendingEntitlementsCount: number;
  totalCreditsGranted: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignClaimRecord {
  id: string;
  campaignId: string;
  campaignTitleSnapshot: string;
  campaignDescriptionSnapshot: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  triggerSource: 'register' | 'login' | 'online_presence' | 'reconnect_entitlement';
  status: 'entitled' | 'granted';
  rewardsGranted: CampaignGrantedRewardSnapshot[];
  creditsGranted: number;
  entitledAt: string;
  claimedAt: string | null;
  notifiedAt: string | null;
}

interface AdminCampaignsSubViewProps {
  token: string;
  catalogItems: ItemDefinition[];
  onNotify?: (msg: string, type: 'success' | 'error') => void;
}

export const AdminCampaignsSubView: React.FC<AdminCampaignsSubViewProps> = ({
  token,
  catalogItems,
  onNotify,
}) => {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectTz, setProjectTz] = useState<string>(() => getClientProjectTimezone());

  useEffect(() => {
    return subscribeClientProjectTimezone((tz) => setProjectTz(tz));
  }, []);

  // Modal states
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [isEnabledInput, setIsEnabledInput] = useState(true);
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [endsAtLocal, setEndsAtLocal] = useState('');
  const [rewardsInput, setRewardsInput] = useState<CampaignRewardItem[]>([]);

  // Recipients / Claims modal
  const [claimsModalOpen, setClaimsModalOpen] = useState(false);
  const [viewingCampaign, setViewingCampaign] = useState<CampaignRecord | null>(null);
  const [claimsList, setClaimsList] = useState<CampaignClaimRecord[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);

  // Delete modal
  const [deletingCampaign, setDeletingCampaign] = useState<CampaignRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getAuthHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token || localStorage.getItem('mafia_auth_token') || ''}`,
    }),
    [token]
  );

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/campaigns', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      } else {
        const err = await res.json().catch(() => ({}));
        onNotify?.(err.error || 'Ошибка загрузки акций', 'error');
      }
    } catch {
      onNotify?.('Сетевая ошибка при загрузке акций', 'error');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, onNotify]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Combined selectable catalog for rewards (Items + Loyalty Credits)
  const selectableCatalog = useMemo(() => {
    const list: ItemDefinition[] = [LOYALTY_CREDITS_ITEM_DEF];
    for (const item of catalogItems) {
      if (!list.some((existing) => existing.id === item.id)) {
        list.push(item);
      }
    }
    return list;
  }, [catalogItems]);

  const getItemMeta = useCallback(
    (itemId: string): ItemDefinition => {
      if (itemId === LOYALTY_CREDITS_ITEM_ID) return LOYALTY_CREDITS_ITEM_DEF;
      const found = catalogItems.find((i) => i.id === itemId);
      if (found) return found;
      return {
        id: itemId,
        name: itemId,
        category: 'valuables',
        rarity: 'common',
        cost: 0,
        icon: '📦',
        usable: false,
        consumable: false,
        description: 'Предмет',
      };
    },
    [catalogItems]
  );

  // Open Create Modal
  const handleOpenCreate = () => {
    sounds.playTick();
    setEditingId(null);
    setTitleInput('');
    setDescInput('');
    setIsEnabledInput(true);

    // Default dates in project timezone: now + 7 days
    const now = new Date();
    const plus7d = new Date(Date.now() + 7 * 86_400_000);
    setStartsAtLocal(toDatetimeLocalInTimezone(now.toISOString(), projectTz));
    setEndsAtLocal(toDatetimeLocalInTimezone(plus7d.toISOString(), projectTz));

    // Do NOT hardcode default rewards; start with an empty list
    setRewardsInput([]);
    setEditorOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (camp: CampaignRecord) => {
    sounds.playTick();
    setEditingId(camp.id);
    setTitleInput(camp.title);
    setDescInput(camp.description || '');
    setIsEnabledInput(camp.isEnabled);
    setStartsAtLocal(toDatetimeLocalInTimezone(camp.startsAt, projectTz));
    setEndsAtLocal(toDatetimeLocalInTimezone(camp.endsAt, projectTz));
    setRewardsInput(camp.rewards.map((r) => ({ ...r })));
    setEditorOpen(true);
  };

  // Save Campaign (Create or Edit)
  const handleSaveCampaign = async () => {
    if (!titleInput.trim()) {
      onNotify?.('Укажите название акции', 'error');
      return;
    }
    if (!startsAtLocal || !endsAtLocal) {
      onNotify?.('Укажите дату начала и окончания акции', 'error');
      return;
    }

    const startIso = fromDatetimeLocalInTimezone(startsAtLocal, projectTz);
    const endIso = fromDatetimeLocalInTimezone(endsAtLocal, projectTz);
    if (!startIso || !endIso) {
      onNotify?.('Некорректный формат дат проведения', 'error');
      return;
    }
    if (Date.parse(endIso) <= Date.parse(startIso)) {
      onNotify?.('Дата окончания акции должна быть позже даты начала', 'error');
      return;
    }

    if (rewardsInput.length === 0) {
      onNotify?.('Добавьте хотя бы одну награду из каталога предметов', 'error');
      return;
    }

    for (const r of rewardsInput) {
      if (!r.itemId || r.quantity < 1) {
        onNotify?.('Укажите корректные предметы и количество (от 1)', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        title: titleInput.trim(),
        description: descInput.trim(),
        isEnabled: isEnabledInput,
        startsAt: startIso,
        endsAt: endIso,
        scheduleTimezone: projectTz,
        rewards: rewardsInput,
      };

      const url = editingId ? `/api/admin/campaigns/${editingId}` : '/api/admin/campaigns';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при сохранении акции');
      }

      sounds.playTick();
      onNotify?.(data.message || 'Акция успешно сохранена!', 'success');
      setEditorOpen(false);
      await fetchCampaigns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения';
      onNotify?.(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle Campaign Enabled
  const handleToggleEnabled = async (camp: CampaignRecord) => {
    sounds.playTick();
    const nextState = !camp.isEnabled;
    try {
      const res = await fetch(`/api/admin/campaigns/${camp.id}/toggle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isEnabled: nextState }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка изменения статуса');
      }
      onNotify?.(data.message || 'Статус акции обновлен', 'success');
      await fetchCampaigns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка обновления';
      onNotify?.(msg, 'error');
    }
  };

  // Delete Campaign
  const handleConfirmDelete = async () => {
    if (!deletingCampaign) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${deletingCampaign.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка удаления акции');
      }
      sounds.playTick();
      onNotify?.(data.message || 'Акция удалена', 'success');
      setDeletingCampaign(null);
      await fetchCampaigns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка удаления';
      onNotify?.(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // View Claims / Recipients
  const handleViewClaims = async (camp: CampaignRecord) => {
    sounds.playTick();
    setViewingCampaign(camp);
    setClaimsList([]);
    setClaimsModalOpen(true);
    setClaimsLoading(true);

    try {
      const res = await fetch(`/api/admin/campaigns/${camp.id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setClaimsList(data.claims || []);
      } else {
        onNotify?.('Не удалось загрузить журнал начислений акции', 'error');
      }
    } catch {
      onNotify?.('Сетевая ошибка при загрузке журнала', 'error');
    } finally {
      setClaimsLoading(false);
    }
  };

  // Reward items handlers in editor
  const handleAddRewardRow = () => {
    sounds.playTick();
    const available = selectableCatalog.find(
      (it) => !rewardsInput.some((r) => r.itemId === it.id)
    );
    const chosenId = available ? available.id : LOYALTY_CREDITS_ITEM_ID;
    const defaultQty = chosenId === LOYALTY_CREDITS_ITEM_ID ? 500 : 1;
    setRewardsInput((prev) => [...prev, { itemId: chosenId, quantity: defaultQty }]);
  };

  const handleRemoveRewardRow = (idx: number) => {
    sounds.playTick();
    setRewardsInput((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRewardItemChange = (idx: number, newId: string) => {
    setRewardsInput((prev) =>
      prev.map((entry, i) => {
        if (i !== idx) return entry;
        const isCredits = newId === LOYALTY_CREDITS_ITEM_ID;
        return {
          itemId: newId,
          quantity: isCredits && entry.quantity === 1 ? 500 : entry.quantity,
        };
      })
    );
  };

  const handleRewardQtyChange = (idx: number, qty: number) => {
    const cleanQty = Math.max(1, Math.min(1_000_000, qty || 1));
    setRewardsInput((prev) =>
      prev.map((entry, i) => (i === idx ? { ...entry, quantity: cleanQty } : entry))
    );
  };

  // Status Badge Helper
  const renderStatusBadge = (camp: CampaignRecord) => {
    switch (camp.effectiveStatus) {
      case 'active':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border bg-emerald-950/80 border-emerald-500 text-emerald-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>АКТИВНА</span>
          </span>
        );
      case 'upcoming':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border bg-amber-950/80 border-amber-600 text-amber-300 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>СКОРО НАЧНЁТСЯ</span>
          </span>
        );
      case 'expired':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border bg-zinc-800 border-zinc-700 text-zinc-400 flex items-center gap-1.5">
            <XCircle className="w-3 h-3 text-zinc-500" />
            <span>ЗАВЕРШЕНА</span>
          </span>
        );
      case 'disabled':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border bg-zinc-900 border-zinc-800 text-zinc-500 flex items-center gap-1.5">
            <Power className="w-3 h-3 text-zinc-600" />
            <span>ОТКЛЮЧЕНА</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Info & Actions */}
      <div className="p-4 rounded-2xl bg-[#12131b] border border-zinc-800/90 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400" />
              <span>Акции и подарки за вход</span>
            </h3>
            <span className="px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-amber-400" />
              <span>
                Часовой пояс: {projectTz} ({getTimezoneOffsetLabel(projectTz)})
              </span>
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
            Настройте временные подарочные акции для игроков (на открытие клуба, праздники или выходные).
            Подарок выдаётся строго 1 раз на аккаунт при регистрации, входе или активном присутствии в игре
            в установленный период.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchCampaigns}
            disabled={loading}
            className="p-2.5 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
            title="Обновить список акций"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-orange-950/40 cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Создать акцию</span>
          </button>
        </div>
      </div>

      {/* Campaigns List */}
      {loading ? (
        <div className="p-12 text-center text-zinc-400 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          <span className="text-xs font-mono">Загрузка акций...</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="p-10 border border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-center space-y-3 bg-[#11121a]">
          <div className="w-12 h-12 rounded-2xl bg-amber-950/40 border border-amber-600/40 flex items-center justify-center text-amber-400">
            <Gift className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white">Список акций пуст</h4>
            <p className="text-xs text-zinc-500 max-w-md">
              Нажмите «Создать акцию» выше, чтобы запустить первую акцию Mafia Club к открытию платформы.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((camp) => {
            return (
              <div
                key={camp.id}
                className="p-4 rounded-2xl bg-[#12131b] border border-zinc-800/90 hover:border-zinc-700/80 transition-all space-y-3 shadow-md"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="text-sm font-bold text-white tracking-wide truncate">
                        {camp.title}
                      </h4>
                      {renderStatusBadge(camp)}
                    </div>
                    {camp.description && (
                      <p className="text-xs text-zinc-400 leading-snug line-clamp-2">
                        {camp.description}
                      </p>
                    )}
                  </div>

                  {/* Actions & Master Switch */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleViewClaims(camp)}
                      className="px-3 py-1.5 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-750 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Просмотреть получателей подарка"
                    >
                      <Eye className="w-3.5 h-3.5 text-amber-400" />
                      <span>Журнал ({camp.uniqueRecipientsCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(camp)}
                      className="p-2 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-750 transition-colors cursor-pointer"
                      title="Редактировать параметры акции"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-zinc-300" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingCampaign(camp)}
                      className="p-2 rounded-xl bg-zinc-850 hover:bg-rose-950/80 text-zinc-400 hover:text-rose-300 border border-zinc-750 hover:border-rose-600 transition-colors cursor-pointer"
                      title="Удалить акцию"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Enable / Disable Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(camp)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        camp.isEnabled ? 'bg-emerald-600' : 'bg-zinc-700 hover:bg-zinc-600'
                      }`}
                      title={camp.isEnabled ? 'Отключить акцию' : 'Включить акцию'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          camp.isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Period, stats & rewards breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2 border-t border-zinc-800/70 text-xs">
                  {/* Period */}
                  <div className="p-2.5 rounded-xl bg-[#0e0f15] border border-zinc-850 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>Период действия (проектный пояс)</span>
                    </span>
                    <div className="font-mono text-zinc-200 text-[11px] leading-tight">
                      <div>С: {formatDateTimeInTimezone(camp.startsAt, projectTz)}</div>
                      <div>По: {formatDateTimeInTimezone(camp.endsAt, projectTz)}</div>
                    </div>
                  </div>

                  {/* Recipients Stat */}
                  <div className="p-2.5 rounded-xl bg-[#0e0f15] border border-zinc-850 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-emerald-400" />
                      <span>Получатели подарка</span>
                    </span>
                    <div className="font-mono font-bold text-white text-sm flex items-center gap-2">
                      <span className="text-emerald-400">{camp.uniqueRecipientsCount}</span>
                      <span className="text-zinc-500 text-[10px] font-normal">уник. игроков</span>
                      {camp.totalCreditsGranted > 0 && (
                        <span className="text-amber-400 text-xs font-normal">
                          (+{camp.totalCreditsGranted} кр.)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rewards preview */}
                  <div className="p-2.5 rounded-xl bg-[#0e0f15] border border-zinc-850 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase flex items-center gap-1.5">
                      <Package className="w-3 h-3 text-purple-400" />
                      <span>Награды ({camp.rewardsEnriched.length})</span>
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {camp.rewardsEnriched.map((r, rIdx) => {
                        const rarity = (RARITY_CONFIG as Record<string, any>)[r.rarity] || RARITY_CONFIG.common;
                        return (
                          <span
                            key={rIdx}
                            className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold flex items-center gap-1 ${rarity.bg} ${rarity.border} ${rarity.color}`}
                          >
                            <span>{r.icon}</span>
                            <span>{r.name}</span>
                            <span className="text-white">x{r.quantity}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor Modal (Create / Edit) */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150 select-none">
          <div className="w-full max-w-2xl bg-[#12131b] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-800/80 bg-[#141520] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-950/40">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white uppercase tracking-wider">
                    {editingId ? 'Редактирование акции' : 'Создание подарочной акции'}
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Настройка расписания в проектном поясе и состава подарков
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs font-sans">
              {/* Title & Enabled */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                  Название акции *
                </label>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="Например: Зайди в Mafia Club в период открытия и получи подарок!"
                  className="w-full bg-[#0e0f15] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                  Описание акции
                </label>
                <textarea
                  rows={2}
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  placeholder="Опишите условия получения или поздравление игрокам..."
                  className="w-full bg-[#0e0f15] border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {/* Schedule Period in Project Timezone */}
              <div className="p-3.5 rounded-2xl bg-[#0f1017] border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>Период действия акции</span>
                  </span>
                  <span className="text-[10px] font-mono text-amber-400/90">
                    {projectTz} ({getTimezoneOffsetLabel(projectTz)})
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-mono">Дата и время начала:</label>
                    <input
                      type="datetime-local"
                      value={startsAtLocal}
                      onChange={(e) => setStartsAtLocal(e.target.value)}
                      className="w-full bg-[#161724] border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-mono">Дата и время окончания:</label>
                    <input
                      type="datetime-local"
                      value={endsAtLocal}
                      onChange={(e) => setEndsAtLocal(e.target.value)}
                      className="w-full bg-[#161724] border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="text-[10px] text-zinc-400 leading-relaxed flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span>
                    Даты вводятся в часовом поясе проекта. При сохранении они фиксируются в точном UTC, поэтому
                    последующие изменения проектного пояса не сместят уже заданный период.
                  </span>
                </div>
              </div>

              {/* Active Toggle Switch */}
              <div className="p-3.5 rounded-2xl bg-[#0f1017] border border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Статус акции</div>
                  <div className="text-[11px] text-zinc-400">
                    {isEnabledInput
                      ? 'Акция включена и будет автоматически выдавать подарки в свой период'
                      : 'Акция выключена (подарки не начисляются)'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsEnabledInput(!isEnabledInput)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isEnabledInput ? 'bg-emerald-600' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isEnabledInput ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Rewards List */}
              <div className="p-3.5 rounded-2xl bg-[#0f1017] border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Gift className="w-4 h-4 text-amber-400" />
                      <span>Состав подарка ({rewardsInput.length})</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      Кредиты и предметы из каталога, начисляемые игрокам
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddRewardRow}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить предмет</span>
                  </button>
                </div>

                {rewardsInput.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500 font-mono border border-dashed border-zinc-800 rounded-xl">
                    Награды не добавлены. Нажмите «+ Добавить предмет» выше, чтобы выбрать кредиты или предметы.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {rewardsInput.map((entry, idx) => {
                      const meta = getItemMeta(entry.itemId);
                      const isCredits = entry.itemId === LOYALTY_CREDITS_ITEM_ID;
                      const rarity = RARITY_CONFIG[meta.rarity] || RARITY_CONFIG.common;

                      const usedElsewhere = new Set(
                        rewardsInput.filter((_, i) => i !== idx).map((it) => it.itemId)
                      );

                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-[#161724] border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          {/* Item Select */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 border ${rarity.bg} ${rarity.border}`}
                            >
                              {meta.icon || '🎁'}
                            </div>

                            <div className="flex-1 min-w-0">
                              <select
                                value={entry.itemId}
                                onChange={(e) => handleRewardItemChange(idx, e.target.value)}
                                className="w-full max-w-xs bg-[#0f1016] border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
                              >
                                {selectableCatalog.map((catItem) => {
                                  const disabled = usedElsewhere.has(catItem.id);
                                  return (
                                    <option key={catItem.id} value={catItem.id} disabled={disabled}>
                                      {catItem.icon} {catItem.name} {disabled ? '(уже выбран)' : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          </div>

                          {/* Quantity & Delete */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <span className="text-[10px] text-zinc-400 font-mono">Кол-во:</span>
                            <input
                              type="number"
                              min="1"
                              max="1000000"
                              value={entry.quantity}
                              onChange={(e) => handleRewardQtyChange(idx, parseInt(e.target.value, 10) || 1)}
                              className="w-20 bg-[#0e0f15] border border-zinc-700 rounded-lg px-2 py-1 text-xs text-amber-300 font-mono font-bold text-center focus:outline-none focus:border-amber-500"
                            />

                            {/* Preset Buttons */}
                            <div className="flex items-center gap-1">
                              {(isCredits ? [250, 500, 1000] : [1, 2, 5]).map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => handleRewardQtyChange(idx, preset)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                                    entry.quantity === preset
                                      ? 'bg-amber-600 text-white border-amber-500'
                                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                                  }`}
                                >
                                  {isCredits ? `+${preset}` : `x${preset}`}
                                </button>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveRewardRow(idx)}
                              className="p-1.5 rounded-lg bg-zinc-850 hover:bg-rose-950 text-zinc-400 hover:text-rose-300 border border-zinc-750 hover:border-rose-600 transition-colors cursor-pointer"
                              title="Удалить предмет"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800/80 bg-[#141520] flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Отмена
              </button>

              <button
                type="button"
                onClick={handleSaveCampaign}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-orange-950/40 cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{editingId ? 'Сохранить изменения' : 'Создать акцию'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#12131b] border border-rose-900/70 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-950/80 border border-rose-700/80 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white uppercase tracking-wide">
                  Удалить акцию?
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Вы собираетесь удалить акцию «<strong>{deletingCampaign.title}</strong>».
                </p>
                <div className="p-2.5 rounded-xl bg-[#0f1017] border border-zinc-800 text-[11px] text-zinc-400 space-y-1 mt-2">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Безопасное удаление:</span>
                  </div>
                  <p>
                    Все выданные игрокам подарки ({deletingCampaign.uniqueRecipientsCount} шт.) и начисленные
                    кредиты навсегда останутся в профилях и инвентарях игроков.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCampaign(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-rose-900 hover:from-rose-600 hover:to-rose-800 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-rose-950/60 border border-rose-600/60 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Удалить</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Claims / Recipients History Modal */}
      {claimsModalOpen && viewingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150 select-none">
          <div className="w-full max-w-2xl bg-[#12131b] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-zinc-800/80 bg-[#141520] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-950/80 border border-amber-600/60 flex items-center justify-center text-amber-300">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white uppercase tracking-wider">
                    Журнал получателей подарка
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    «{viewingCampaign.title}» • Всего: {claimsList.length} записей
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setClaimsModalOpen(false)}
                className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="p-5 overflow-y-auto space-y-2 flex-1 text-xs font-sans">
              {claimsLoading ? (
                <div className="py-12 text-center text-zinc-400 flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
                  <span className="text-xs font-mono">Загрузка получателей...</span>
                </div>
              ) : claimsList.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500 font-mono border border-dashed border-zinc-800 rounded-xl">
                  Подарок в рамках этой акции ещё никто не получал.
                </div>
              ) : (
                claimsList.map((claim) => {
                  return (
                    <div
                      key={claim.id}
                      className="p-3 rounded-xl bg-[#14181f] border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-bold text-zinc-200 flex items-center gap-1.5 truncate">
                          <span>{claim.userDisplayName || 'Игрок'}</span>
                          {claim.userEmail && (
                            <span className="text-[10px] text-zinc-400 font-normal">
                              ({claim.userEmail})
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          Выдано: {formatDateTimeInTimezone(claim.claimedAt || claim.entitledAt, projectTz)} •
                          Источник: {claim.triggerSource} • ID: {claim.userId}
                        </div>
                      </div>

                      {/* Rewards summary */}
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0 self-end sm:self-center">
                        {claim.creditsGranted > 0 && (
                          <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-600 text-amber-300 font-mono font-bold text-[10px]">
                            +{claim.creditsGranted} кр.
                          </span>
                        )}
                        {claim.rewardsGranted
                          .filter((r) => r.itemId !== LOYALTY_CREDITS_ITEM_ID)
                          .map((r, rIdx) => (
                            <span
                              key={rIdx}
                              className="px-2 py-0.5 rounded bg-zinc-850 border border-zinc-700 text-purple-300 font-mono text-[10px] flex items-center gap-1"
                            >
                              <span>{r.icon}</span>
                              <span>{r.name}</span>
                              <span className="text-white font-bold">x{r.quantity}</span>
                            </span>
                          ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-800/80 bg-[#141520] flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setClaimsModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
