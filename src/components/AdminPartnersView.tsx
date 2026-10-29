import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users2,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  Power,
  Eye,
  Package,
  Award,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Calendar,
  TrendingUp,
  UserCheck,
  ShieldAlert,
  Loader2,
  X,
} from 'lucide-react';
import {
  ItemDefinition,
  LOYALTY_CREDITS_ITEM_ID,
  getAdminSelectableItems,
  getDynamicItemsList,
  subscribeItemsCatalog,
} from '../data/items';
import { sounds } from '../utils/audio';
import {
  PromoConditionType,
  PromoRewardCondition,
  PromoRewardConfig,
} from './AdminRegularPromosSubView';

export interface PartnerEligibilityConfig {
  enabled: boolean;
  logic: 'AND' | 'OR';
  maxAccountAgeHours?: number | null;
  maxLevel?: number | null;
  minLevel?: number | null;
}

export interface PartnerQualificationCriteria {
  requiredActiveDays: number;
  activityType: 'login' | 'completed_match';
  windowDays: number | null;
}

export type PartnerRewardMode = 'on_activation' | 'on_full_completion';

export interface PartnerSummaryStats {
  totalBoundPlayers: number;
  boundAtRegistration: number;
  boundInProfile: number;
  qualifiedPlayers: number;
  inProgressPlayers: number;
  expiredPlayers: number;
  playerRewardsFullyCompleted: number;
  partnerRewardsGrantedCount: number;
  partnerRewardsPendingCount: number;
}

export interface PartnerReferralCodeRecord {
  id: string;
  partnerId: string;
  partnerUserId: string;
  codeNormalized: string;
  codeDisplay: string;
  isEnabled: boolean;
  eligibility: PartnerEligibilityConfig;
  playerRewards: PromoRewardConfig[];
  partnerRewards: PromoRewardConfig[];
  partnerRewardMode: PartnerRewardMode;
  qualificationCriteria: PartnerQualificationCriteria;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerRecord {
  id: string;
  userId: string;
  displayNameSnapshot: string;
  emailSnapshot: string;
  userCurrentlyBanned?: boolean;
  userCurrentlyDeleted?: boolean;
  note: string;
  isEnabled: boolean;
  referralCode: PartnerReferralCodeRecord | null;
  stats?: PartnerSummaryStats;
  createdAt: string;
  updatedAt: string;
}

interface AdminPartnersViewProps {
  token: string | null;
  users?: Array<{ id: string; displayName: string; email: string; level?: number; isBanned?: boolean }>;
  onFeedback?: (msg: { type: 'success' | 'error'; text: string }) => void;
}

export const AdminPartnersView: React.FC<AdminPartnersViewProps> = ({
  token,
  users = [],
  onFeedback,
}) => {
  const effectiveToken = token || localStorage.getItem('mafia_auth_token') || '';
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [allUsers, setAllUsers] = useState<
    Array<{ id: string; displayName: string; email: string; level?: number; isBanned?: boolean }>
  >(users);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localBanner, setLocalBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Create / Edit Modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<PartnerRecord | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [isEnabledInput, setIsEnabledInput] = useState(true);

  // Eligibility state
  const [eligEnabled, setEligEnabled] = useState(false);
  const [eligLogic, setEligLogic] = useState<'AND' | 'OR'>('AND');
  const [eligMaxAgeHours, setEligMaxAgeHours] = useState<string>('');
  const [eligMaxLevel, setEligMaxLevel] = useState<string>('');
  const [eligMinLevel, setEligMinLevel] = useState<string>('');

  // Player & Partner Rewards state
  const [playerRewardsInput, setPlayerRewardsInput] = useState<PromoRewardConfig[]>([]);
  const [partnerRewardsInput, setPartnerRewardsInput] = useState<PromoRewardConfig[]>([]);
  const [partnerRewardModeInput, setPartnerRewardModeInput] =
    useState<PartnerRewardMode>('on_activation');

  // Qualification Criteria state
  const [qualRequiredDays, setQualRequiredDays] = useState<number>(3);
  const [qualActivityType, setQualActivityType] = useState<'login' | 'completed_match'>(
    'completed_match'
  );
  const [qualWindowDays, setQualWindowDays] = useState<string>('14');

  // Detailed Report Modal
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportPartnerId, setReportPartnerId] = useState<string | null>(null);
  const [reportFilterFrom, setReportFilterFrom] = useState<string>('');
  const [reportFilterTo, setReportFilterTo] = useState<string>('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportTab, setReportTab] = useState<'players' | 'payouts'>('players');
  const [reportData, setReportData] = useState<{
    partner: PartnerRecord;
    filteredStats: PartnerSummaryStats;
    activations: Array<{
      id: string;
      userId: string;
      userDisplayName: string;
      userEmail: string;
      userDeleted: boolean;
      boundVia: 'registration' | 'profile';
      activatedAt: string;
      currentGamesSince: number;
      currentActiveMinutesSince: number;
      currentLevel: number;
      allPlayerRewardsGranted: boolean;
      partnerRewardStatus: string;
      partnerRewardGrantedAt: string | null;
      qualificationStatus: 'in_progress' | 'qualified' | 'expired' | 'not_applicable';
      qualifiedAt: string | null;
      activeDaysCount: number;
      requiredActiveDays: number;
      activeDaysList: string[];
    }>;
    partnerPayoutHistory: Array<{
      id: string;
      invitedUserId: string;
      invitedUserName: string;
      status: string;
      itemTitle: string;
      quantity: number;
      grantedAt: string | null;
      createdAt: string;
    }>;
  } | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<PartnerRecord | null>(null);

  const notify = useCallback(
    (text: string, type: 'success' | 'error') => {
      setLocalBanner({ text, type });
      if (onFeedback) onFeedback({ text, type });
      setTimeout(() => setLocalBanner(null), 5000);
    },
    [onFeedback]
  );

  const fetchPartnersAndUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, uRes] = await Promise.all([
        fetch('/api/admin/partners', {
          headers: { Authorization: `Bearer ${effectiveToken}` },
        }),
        users.length === 0
          ? fetch('/api/admin/users', {
              headers: { Authorization: `Bearer ${effectiveToken}` },
            })
          : Promise.resolve(null),
      ]);

      const pData = await pRes.json();
      if (!pRes.ok) throw new Error(pData.error || 'Ошибка загрузки партнёрской программы');
      setPartners(pData.partners || []);

      if (uRes && uRes.ok) {
        const uData = await uRes.json();
        if (Array.isArray(uData.users)) {
          setAllUsers(uData.users);
        }
      }
    } catch (err: any) {
      notify(err.message || 'Ошибка загрузки партнёров', 'error');
    } finally {
      setLoading(false);
    }
  }, [effectiveToken, users.length, notify]);

  useEffect(() => {
    fetchPartnersAndUsers();
  }, [fetchPartnersAndUsers]);

  useEffect(() => {
    if (users.length > 0) setAllUsers(users);
  }, [users]);

  const [allCatalogItems, setAllCatalogItems] = useState<ItemDefinition[]>(() =>
    getDynamicItemsList()
  );

  useEffect(() => {
    setAllCatalogItems(getDynamicItemsList());
    return subscribeItemsCatalog((updated) => {
      setAllCatalogItems([...updated]);
    });
  }, []);

  const catalogItems = useMemo(() => {
    const selectedIds = [
      ...playerRewardsInput.map((r) => r.itemId),
      ...partnerRewardsInput.map((r) => r.itemId),
    ];
    return getAdminSelectableItems(allCatalogItems, selectedIds);
  }, [allCatalogItems, playerRewardsInput, partnerRewardsInput]);

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
      description: 'Начисление кредитов на баланс игрового профиля.',
    };
    return [creditsPseudoItem, ...catalogItems];
  }, [catalogItems]);

  const getItemMeta = (itemId: string) => {
    if (itemId === LOYALTY_CREDITS_ITEM_ID) {
      return { name: 'Кредиты Клуба', icon: '💰' };
    }
    const found = allCatalogItems.find((i) => i.id === itemId) || catalogItems.find((i) => i.id === itemId);
    return { name: found?.name || itemId, icon: found?.icon || '🎁' };
  };

  const filteredCandidateUsers = useMemo(() => {
    const existingPartnerUserIds = new Set(partners.map((p) => p.userId));
    const q = userSearchQuery.trim().toLowerCase();
    return allUsers
      .filter((u) => !existingPartnerUserIds.has(u.id) || u.id === selectedUserId)
      .filter(
        (u) =>
          !q ||
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [allUsers, partners, userSearchQuery, selectedUserId]);

  const openCreateModal = () => {
    sounds.playTick();
    setEditingPartner(null);
    setUserSearchQuery('');
    setSelectedUserId('');
    setCodeInput('');
    setNoteInput('');
    setIsEnabledInput(true);

    setEligEnabled(false);
    setEligLogic('AND');
    setEligMaxAgeHours('');
    setEligMaxLevel('');
    setEligMinLevel('');

    setPlayerRewardsInput([
      {
        id: `prw_${Date.now()}`,
        itemId: LOYALTY_CREDITS_ITEM_ID,
        quantity: 300,
        grantMode: 'immediate',
        conditionLogic: 'AND',
        conditions: [],
      },
    ]);
    setPartnerRewardsInput([
      {
        id: `ownrw_${Date.now()}`,
        itemId: LOYALTY_CREDITS_ITEM_ID,
        quantity: 150,
        grantMode: 'immediate',
        conditionLogic: 'AND',
        conditions: [],
      },
    ]);
    setPartnerRewardModeInput('on_activation');

    setQualRequiredDays(3);
    setQualActivityType('completed_match');
    setQualWindowDays('14');
    setEditorOpen(true);
  };

  const openEditModal = (partner: PartnerRecord) => {
    sounds.playTick();
    setEditingPartner(partner);
    setSelectedUserId(partner.userId);
    setNoteInput(partner.note || '');
    setIsEnabledInput(partner.isEnabled);

    const ref = partner.referralCode;
    setCodeInput(ref?.codeDisplay || '');

    setEligEnabled(Boolean(ref?.eligibility?.enabled));
    setEligLogic(ref?.eligibility?.logic === 'OR' ? 'OR' : 'AND');
    setEligMaxAgeHours(
      ref?.eligibility?.maxAccountAgeHours !== null &&
        ref?.eligibility?.maxAccountAgeHours !== undefined
        ? String(ref.eligibility.maxAccountAgeHours)
        : ''
    );
    setEligMaxLevel(
      ref?.eligibility?.maxLevel !== null && ref?.eligibility?.maxLevel !== undefined
        ? String(ref.eligibility.maxLevel)
        : ''
    );
    setEligMinLevel(
      ref?.eligibility?.minLevel !== null && ref?.eligibility?.minLevel !== undefined
        ? String(ref.eligibility.minLevel)
        : ''
    );

    setPlayerRewardsInput(
      ref?.playerRewards && ref.playerRewards.length > 0
        ? JSON.parse(JSON.stringify(ref.playerRewards))
        : [
            {
              id: `prw_${Date.now()}`,
              itemId: LOYALTY_CREDITS_ITEM_ID,
              quantity: 300,
              grantMode: 'immediate',
              conditionLogic: 'AND',
              conditions: [],
            },
          ]
    );

    setPartnerRewardsInput(
      ref?.partnerRewards ? JSON.parse(JSON.stringify(ref.partnerRewards)) : []
    );
    setPartnerRewardModeInput(ref?.partnerRewardMode || 'on_activation');

    setQualRequiredDays(ref?.qualificationCriteria?.requiredActiveDays || 3);
    setQualActivityType(ref?.qualificationCriteria?.activityType || 'completed_match');
    setQualWindowDays(
      ref?.qualificationCriteria?.windowDays !== null &&
        ref?.qualificationCriteria?.windowDays !== undefined
        ? String(ref.qualificationCriteria.windowDays)
        : ''
    );

    setEditorOpen(true);
  };

  const handleSavePartner = async () => {
    setSaving(true);
    try {
      const payload = {
        userId: selectedUserId,
        note: noteInput.trim(),
        isEnabled: isEnabledInput,
        code: codeInput.trim().toUpperCase(),
        eligibility: {
          enabled: eligEnabled,
          logic: eligLogic,
          maxAccountAgeHours: eligMaxAgeHours.trim() ? Number(eligMaxAgeHours) : null,
          maxLevel: eligMaxLevel.trim() ? Number(eligMaxLevel) : null,
          minLevel: eligMinLevel.trim() ? Number(eligMinLevel) : null,
        },
        playerRewards: playerRewardsInput,
        partnerRewards: partnerRewardsInput.map((r) => ({ ...r, grantMode: 'immediate', conditions: [] })),
        partnerRewardMode: partnerRewardModeInput,
        qualificationCriteria: {
          requiredActiveDays: qualRequiredDays,
          activityType: qualActivityType,
          windowDays: qualWindowDays.trim() ? Number(qualWindowDays) : null,
        },
      };

      const url = editingPartner
        ? `/api/admin/partners/${editingPartner.id}`
        : '/api/admin/partners';
      const method = editingPartner ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения партнёра');

      sounds.playTick();
      notify(data.message || 'Карточка партнёра сохранена', 'success');
      setEditorOpen(false);
      await fetchPartnersAndUsers();
    } catch (err: any) {
      notify(err.message || 'Ошибка сохранения партнёра', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickToggle = async (partner: PartnerRecord) => {
    try {
      const res = await fetch(`/api/admin/partners/${partner.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveToken}`,
        },
        body: JSON.stringify({ isEnabled: !partner.isEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка переключения статуса');
      sounds.playTick();
      notify(
        `Партнёрский код «${partner.referralCode?.codeDisplay}» ${
          !partner.isEnabled ? 'включён' : 'отключён'
        }`,
        'success'
      );
      await fetchPartnersAndUsers();
    } catch (err: any) {
      notify(err.message || 'Ошибка переключения статуса', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/partners/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${effectiveToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка удаления партнёра');
      sounds.playTick();
      notify(data.message || 'Партнёр удалён', 'success');
      setDeleteTarget(null);
      await fetchPartnersAndUsers();
    } catch (err: any) {
      notify(err.message || 'Ошибка удаления партнёра', 'error');
    } finally {
      setSaving(false);
    }
  };

  const loadPartnerReport = useCallback(
    async (partnerId: string, fromStr: string, toStr: string) => {
      setReportLoading(true);
      try {
        const qs = new URLSearchParams();
        if (fromStr) {
          qs.set('from', new Date(`${fromStr}T00:00:00.000+03:00`).toISOString());
        }
        if (toStr) {
          qs.set('to', new Date(`${toStr}T23:59:59.999+03:00`).toISOString());
        }
        const res = await fetch(`/api/admin/partners/${partnerId}/report?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${effectiveToken}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки отчёта партнёра');
        setReportData(data);
      } catch (err: any) {
        notify(err.message || 'Ошибка загрузки отчёта', 'error');
      } finally {
        setReportLoading(false);
      }
    },
    [effectiveToken, notify]
  );

  const openReportModal = (partnerId: string) => {
    sounds.playTick();
    setReportPartnerId(partnerId);
    setReportFilterFrom('');
    setReportFilterTo('');
    setReportTab('players');
    setReportModalOpen(true);
    loadPartnerReport(partnerId, '', '');
  };

  // Player Reward List Helpers
  const addPlayerReward = () => {
    setPlayerRewardsInput((prev) => [
      ...prev,
      {
        id: `prw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        itemId: LOYALTY_CREDITS_ITEM_ID,
        quantity: 100,
        grantMode: 'immediate',
        conditionLogic: 'AND',
        conditions: [],
      },
    ]);
  };

  const updatePlayerReward = (idx: number, patch: Partial<PromoRewardConfig>) => {
    setPlayerRewardsInput((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, ...patch };
        if (next.grantMode === 'conditional' && (!next.conditions || next.conditions.length === 0)) {
          next.conditions = [{ type: 'matches_completed', target: 3 }];
        }
        return next;
      })
    );
  };

  const removePlayerReward = (idx: number) => {
    setPlayerRewardsInput((prev) => prev.filter((_, i) => i !== idx));
  };

  const addPlayerCondition = (rIdx: number) => {
    setPlayerRewardsInput((prev) =>
      prev.map((r, i) =>
        i === rIdx
          ? { ...r, conditions: [...(r.conditions || []), { type: 'matches_completed', target: 1 }] }
          : r
      )
    );
  };

  const updatePlayerCondition = (
    rIdx: number,
    cIdx: number,
    patch: Partial<PromoRewardCondition>
  ) => {
    setPlayerRewardsInput((prev) =>
      prev.map((r, i) =>
        i === rIdx
          ? {
              ...r,
              conditions: r.conditions.map((c, ci) => (ci === cIdx ? { ...c, ...patch } : c)),
            }
          : r
      )
    );
  };

  const removePlayerCondition = (rIdx: number, cIdx: number) => {
    setPlayerRewardsInput((prev) =>
      prev.map((r, i) =>
        i === rIdx
          ? { ...r, conditions: r.conditions.filter((_, ci) => ci !== cIdx) }
          : r
      )
    );
  };

  // Partner Reward List Helpers
  const addPartnerReward = () => {
    setPartnerRewardsInput((prev) => [
      ...prev,
      {
        id: `ownrw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        itemId: LOYALTY_CREDITS_ITEM_ID,
        quantity: 100,
        grantMode: 'immediate',
        conditionLogic: 'AND',
        conditions: [],
      },
    ]);
  };

  const updatePartnerReward = (idx: number, patch: Partial<PromoRewardConfig>) => {
    setPartnerRewardsInput((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  };

  const removePartnerReward = (idx: number) => {
    setPartnerRewardsInput((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Header Banner */}
      <div className="shrink-0 p-4 rounded-2xl bg-gradient-to-r from-[#171528] via-[#141724] to-[#12131b] border border-purple-500/30 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0 shadow-inner">
            <Users2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide uppercase">
                Партнёрская программа Клуба ({partners.length})
              </h2>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300">
                1 ПАРТНЁР = 1 РЕФЕРАЛЬНЫЙ КОД
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 max-w-2xl">
              Привязка партнёров к игровым профилям, настройка условий для приглашённых игроков,
              вознаграждений партнёру, критериев успешного привлечения (1–7 активных дней) и воронки
              аналитики.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchPartnersAndUsers}
            className="p-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer"
            title="Обновить список"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-purple-950/50 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить партнёра</span>
          </button>
        </div>
      </div>

      {localBanner && (
        <div
          className={`shrink-0 p-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 ${
            localBanner.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200'
              : 'bg-rose-950/70 border-rose-500/60 text-rose-200'
          }`}
        >
          <span>{localBanner.text}</span>
          <button
            type="button"
            onClick={() => setLocalBanner(null)}
            className="text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Partners List */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-zinc-400 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            <span className="text-xs font-mono">Загрузка карточек партнёров...</span>
          </div>
        ) : partners.length === 0 ? (
          <div className="py-16 rounded-2xl bg-[#12131b] border border-dashed border-zinc-800 flex flex-col items-center justify-center text-center p-6 space-y-3">
            <Users2 className="w-10 h-10 text-zinc-600" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-zinc-200">Партнёры ещё не добавлены</h4>
              <p className="text-xs text-zinc-500 max-w-md">
                Нажмите «Добавить партнёра», чтобы привязать игровой аккаунт блогера или стримера и
                создать для него персональный реферальный код.
              </p>
            </div>
          </div>
        ) : (
          partners.map((partner) => {
            const ref = partner.referralCode;
            const st = partner.stats || {
              totalBoundPlayers: 0,
              boundAtRegistration: 0,
              boundInProfile: 0,
              qualifiedPlayers: 0,
              inProgressPlayers: 0,
              expiredPlayers: 0,
              playerRewardsFullyCompleted: 0,
              partnerRewardsGrantedCount: 0,
              partnerRewardsPendingCount: 0,
            };

            return (
              <div
                key={partner.id}
                className="p-4 rounded-2xl bg-[#12131b] border border-zinc-800/90 hover:border-zinc-700 transition-all space-y-4 shadow-md"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Partner & Code Identity */}
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="px-3 py-1 rounded-lg bg-purple-950/70 border border-purple-500/60 font-mono font-bold text-sm text-purple-200 tracking-wider">
                        {ref?.codeDisplay || 'БЕЗ КОДА'}
                      </span>
                      <span className="text-sm font-bold text-white">
                        {partner.displayNameSnapshot}
                      </span>
                      <span className="text-xs text-zinc-400 font-mono">
                        ({partner.emailSnapshot})
                      </span>

                      {partner.isEnabled ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          АКТИВЕН
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 uppercase">
                          ОТКЛЮЧЁН
                        </span>
                      )}

                      {partner.userCurrentlyBanned && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-950/90 border border-rose-500/70 text-rose-300 uppercase">
                          <ShieldAlert className="w-3 h-3" />
                          Аккаунт в бане (выплаты партнёру на паузе)
                        </span>
                      )}
                    </div>

                    {partner.note && (
                      <div className="text-xs text-zinc-400">{partner.note}</div>
                    )}

                    {/* Rules Summary */}
                    {ref && (
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 font-mono pt-0.5">
                        <span>
                          Режим награды партнёру:{' '}
                          <strong className="text-purple-300">
                            {ref.partnerRewardMode === 'on_activation'
                              ? 'Сразу при активации кода'
                              : 'После получения игроком всех наград'}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Критерий привлечения:{' '}
                          <strong className="text-emerald-300">
                            {ref.qualificationCriteria.requiredActiveDays} дн. (
                            {ref.qualificationCriteria.activityType === 'login'
                              ? 'вход в игру'
                              : 'завершённый матч'}
                            {ref.qualificationCriteria.windowDays
                              ? ` за ${ref.qualificationCriteria.windowDays} дн.`
                              : ', бессрочно'}
                            )
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openReportModal(partner.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 border border-purple-500/50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                      <span>Статистика и отчёт</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickToggle(partner)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border cursor-pointer ${
                        partner.isEnabled
                          ? 'bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border-emerald-600/50'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{partner.isEnabled ? 'Выкл.' : 'Вкл.'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditModal(partner)}
                      className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer"
                      title="Настроить код и награды"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(partner)}
                      className="p-2 rounded-xl bg-zinc-800 hover:bg-rose-950/80 text-zinc-400 hover:text-rose-300 border border-zinc-700 hover:border-rose-600 cursor-pointer"
                      title="Удалить карточку партнёра"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Funnel Metrics Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t border-zinc-800/80">
                  <div className="p-2.5 rounded-xl bg-[#161824] border border-zinc-800">
                    <div className="text-[10px] font-mono uppercase text-zinc-400">
                      Привязано игроков
                    </div>
                    <div className="text-base font-bold font-mono text-white mt-0.5">
                      {st.totalBoundPlayers}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      Рег: {st.boundAtRegistration} • Кабинет: {st.boundInProfile}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#141d1b] border border-emerald-900/50">
                    <div className="text-[10px] font-mono uppercase text-emerald-400">
                      Успешно привлечены
                    </div>
                    <div className="text-base font-bold font-mono text-emerald-300 mt-0.5">
                      {st.qualifiedPlayers}
                    </div>
                    <div className="text-[10px] text-emerald-500/80 font-mono">
                      Выполнили критерий
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#161824] border border-amber-900/40">
                    <div className="text-[10px] font-mono uppercase text-amber-400">
                      В процессе
                    </div>
                    <div className="text-base font-bold font-mono text-amber-300 mt-0.5">
                      {st.inProgressPlayers}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      Набирают дни активности
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#161824] border border-rose-900/40">
                    <div className="text-[10px] font-mono uppercase text-rose-400">
                      Не уложились в срок
                    </div>
                    <div className="text-base font-bold font-mono text-rose-300 mt-0.5">
                      {st.expiredPlayers}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      Истекло окно критерия
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#191628] border border-purple-900/50">
                    <div className="text-[10px] font-mono uppercase text-purple-300">
                      Выплаты партнёру
                    </div>
                    <div className="text-base font-bold font-mono text-purple-200 mt-0.5">
                      {st.partnerRewardsGrantedCount}
                      {st.partnerRewardsPendingCount > 0 && (
                        <span className="text-xs text-amber-300 ml-1.5">
                          (+{st.partnerRewardsPendingCount} ожид.)
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-purple-400/80 font-mono">
                      Завершено игроками: {st.playerRewardsFullyCompleted}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* =====================================================================
          CREATE / EDIT PARTNER & REFERRAL CODE MODAL
      ===================================================================== */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl bg-[#11121a] border border-purple-500/40 shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
            <div className="px-5 py-4 bg-[#161824] border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users2 className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                  {editingPartner
                    ? `Настройка партнёра «${editingPartner.displayNameSnapshot}»`
                    : 'Регистрация нового партнёра и реферального кода'}
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
              {/* 1. Partner Account & Referral Code */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-[#151722] border border-zinc-800">
                <div className="md:col-span-1 space-y-2">
                  <label className="block text-[11px] font-mono uppercase text-zinc-400">
                    Игровой аккаунт партнёра *
                  </label>
                  {editingPartner ? (
                    <div className="p-2.5 rounded-xl bg-[#0c0d13] border border-zinc-700 text-xs">
                      <div className="font-bold text-white">
                        {editingPartner.displayNameSnapshot}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        {editingPartner.emailSnapshot}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          placeholder="Поиск игрока по имени / email..."
                          className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white"
                        />
                      </div>
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-2.5 py-2 text-xs text-white font-semibold"
                      >
                        <option value="">— Выберите аккаунт игрока —</option>
                        {filteredCandidateUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName} ({u.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                    Реферальный код партнёра (бессрочный) *
                  </label>
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    placeholder="STREAMER777"
                    className="w-full bg-[#0c0d13] border border-purple-500/60 rounded-xl px-3 py-2 text-sm font-mono font-bold text-purple-200 uppercase"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    У каждого партнёра строго один персональный реферальный код.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                    Статус и заметка
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
                    <span>{isEnabledInput ? 'КОД АКТИВЕН' : 'КОД ОТКЛЮЧЁН'}</span>
                    <Power className="w-4 h-4" />
                  </button>
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Заметка (канал, ссылка и т.д.)"
                    className="w-full bg-[#0c0d13] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-200"
                  />
                </div>
              </div>

              {/* 2. Player Eligibility Conditions & Qualification Criteria */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Eligibility */}
                <div className="p-4 rounded-xl bg-[#151722] border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Условия доступности кода для игрока
                    </span>
                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={eligEnabled}
                        onChange={(e) => setEligEnabled(e.target.checked)}
                      />
                      <span>Ограничить</span>
                    </label>
                  </div>

                  {!eligEnabled ? (
                    <p className="text-[11px] text-zinc-400">
                      Код может активировать любой игрок, который ещё не привязан ни к одному
                      партнёру (как при регистрации, так и в Личном кабинете).
                    </p>
                  ) : (
                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-zinc-400">Связка условий:</span>
                        <select
                          value={eligLogic}
                          onChange={(e) => setEligLogic(e.target.value as 'AND' | 'OR')}
                          className="bg-[#0c0d13] border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white font-semibold"
                        >
                          <option value="AND">Все указанные условия (И)</option>
                          <option value="OR">Хотя бы одно условие (ИЛИ)</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-mono text-zinc-400 mb-1">
                            Макс. часов с рег.
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={eligMaxAgeHours}
                            onChange={(e) => setEligMaxAgeHours(e.target.value)}
                            placeholder="Напр. 72"
                            className="w-full bg-[#0c0d13] border border-zinc-700 rounded-lg px-2 py-1 text-xs font-mono text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono text-zinc-400 mb-1">
                            Макс. уровень
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={eligMaxLevel}
                            onChange={(e) => setEligMaxLevel(e.target.value)}
                            placeholder="Напр. 3"
                            className="w-full bg-[#0c0d13] border border-zinc-700 rounded-lg px-2 py-1 text-xs font-mono text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono text-zinc-400 mb-1">
                            Мин. уровень
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={eligMinLevel}
                            onChange={(e) => setEligMinLevel(e.target.value)}
                            placeholder="Напр. 1"
                            className="w-full bg-[#0c0d13] border border-zinc-700 rounded-lg px-2 py-1 text-xs font-mono text-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Qualification Criteria (Stage 6) */}
                <div className="p-4 rounded-xl bg-[#151722] border border-emerald-900/40 space-y-3">
                  <div className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                    Критерий успешно привлечённого игрока (Статистика)
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[10px] font-mono text-zinc-400 mb-1">
                        Активных дней (1–7)
                      </label>
                      <select
                        value={qualRequiredDays}
                        onChange={(e) => setQualRequiredDays(Number(e.target.value))}
                        className="w-full bg-[#0c0d13] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-emerald-300"
                      >
                        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                          <option key={d} value={d}>
                            {d} {d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-zinc-400 mb-1">
                        Что считать активным днём
                      </label>
                      <select
                        value={qualActivityType}
                        onChange={(e) =>
                          setQualActivityType(e.target.value as 'login' | 'completed_match')
                        }
                        className="w-full bg-[#0c0d13] border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                      >
                        <option value="completed_match">Завершённая партия</option>
                        <option value="login">Вход в аккаунт / сессия</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-zinc-400 mb-1">
                        Срок (дней, пусто = ∞)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={qualWindowDays}
                        onChange={(e) => setQualWindowDays(e.target.value)}
                        placeholder="Бессрочно"
                        className="w-full bg-[#0c0d13] border border-zinc-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    Дни не обязаны идти подряд (засчитывается максимум 1 день за календарные сутки
                    по МСК). Показатель независим от награды партнёра и навсегда остаётся в отчёте.
                  </p>
                </div>
              </div>

              {/* 3. Player Rewards Builder */}
              <div className="p-4 rounded-xl bg-[#151722] border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Package className="w-4 h-4 text-amber-400" />
                      Награды для приглашённого игрока ({playerRewardsInput.length})
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      Могут выдаваться сразу при активации реферального кода или по мере выполнения
                      игровых условий.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addPlayerReward}
                    className="px-3 py-1.5 rounded-xl bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить награду игроку</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {playerRewardsInput.map((rw, idx) => {
                    const meta = getItemMeta(rw.itemId);
                    return (
                      <div
                        key={rw.id || idx}
                        className="p-3 rounded-xl bg-[#0e1018] border border-zinc-800 space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-lg">{meta.icon}</span>
                            <select
                              value={rw.itemId}
                              onChange={(e) => updatePlayerReward(idx, { itemId: e.target.value })}
                              className="bg-[#151722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold flex-1"
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
                                updatePlayerReward(idx, {
                                  quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                                })
                              }
                              className="w-24 bg-[#151722] border border-zinc-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-300 text-center"
                            />
                            <select
                              value={rw.grantMode}
                              onChange={(e) =>
                                updatePlayerReward(idx, {
                                  grantMode: e.target.value as 'immediate' | 'conditional',
                                })
                              }
                              className="bg-[#151722] border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-semibold"
                            >
                              <option value="immediate">Сразу при активации</option>
                              <option value="conditional">После условий</option>
                            </select>

                            {playerRewardsInput.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removePlayerReward(idx)}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-300 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {rw.grantMode === 'conditional' && (
                          <div className="p-2.5 rounded-lg bg-[#141724] border border-purple-900/40 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-purple-300 uppercase">
                                  Условия награды:
                                </span>
                                <select
                                  value={rw.conditionLogic}
                                  onChange={(e) =>
                                    updatePlayerReward(idx, {
                                      conditionLogic: e.target.value as 'AND' | 'OR',
                                    })
                                  }
                                  className="bg-[#0c0d13] border border-purple-700/60 rounded px-2 py-0.5 text-[11px] text-purple-200 font-bold"
                                >
                                  <option value="AND">Все условия (И)</option>
                                  <option value="OR">Любое условие (ИЛИ)</option>
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() => addPlayerCondition(idx)}
                                className="px-2 py-0.5 rounded bg-purple-950 text-purple-200 border border-purple-700/60 text-[10px] font-bold cursor-pointer"
                              >
                                + Условие
                              </button>
                            </div>

                            {rw.conditions.map((cond, cIdx) => (
                              <div key={cIdx} className="flex flex-wrap items-center gap-2">
                                <select
                                  value={cond.type}
                                  onChange={(e) =>
                                    updatePlayerCondition(idx, cIdx, {
                                      type: e.target.value as PromoConditionType,
                                    })
                                  }
                                  className="bg-[#0c0d13] border border-zinc-700 rounded px-2 py-1 text-xs text-white flex-1"
                                >
                                  <option value="matches_completed">
                                    Завершённые партии после активации
                                  </option>
                                  <option value="active_playtime_minutes">
                                    Активное время в партиях (мин., после активации)
                                  </option>
                                  <option value="reach_level">
                                    Достижение уровня (текущий уровень учитывается сразу)
                                  </option>
                                </select>
                                <input
                                  type="number"
                                  min={1}
                                  step={cond.type === 'active_playtime_minutes' ? '0.5' : '1'}
                                  value={cond.target}
                                  onChange={(e) =>
                                    updatePlayerCondition(idx, cIdx, {
                                      target: Math.max(0.5, Number(e.target.value) || 1),
                                    })
                                  }
                                  className="w-20 bg-[#0c0d13] border border-zinc-700 rounded px-2 py-1 text-xs font-mono font-bold text-amber-300 text-center"
                                />
                                {rw.conditions.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removePlayerCondition(idx, cIdx)}
                                    className="text-zinc-400 hover:text-rose-400 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. Partner Rewards Builder (Stage 5) */}
              <div className="p-4 rounded-xl bg-[#181526] border border-purple-800/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-purple-200 uppercase tracking-wider flex items-center gap-2">
                      <Award className="w-4 h-4 text-purple-400" />
                      Вознаграждение самому партнёру за каждого игрока ({partnerRewardsInput.length})
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      Начисляется напрямую в обычный игровой профиль партнёра (баланс кредитов и
                      инвентарь) строго 1 раз за каждого приглашённого игрока.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addPartnerReward}
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить награду партнёру</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-purple-300 mb-1">
                    Момент начисления награды партнёру:
                  </label>
                  <select
                    value={partnerRewardModeInput}
                    onChange={(e) =>
                      setPartnerRewardModeInput(e.target.value as PartnerRewardMode)
                    }
                    className="w-full bg-[#0c0d13] border border-purple-600/60 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    <option value="on_activation">
                      Вариант А — Сразу в момент успешной активации реферального кода игроком
                    </option>
                    <option value="on_full_completion">
                      Вариант Б — Только после того, как приглашённый игрок выполнит все условия и
                      получит все награды кода
                    </option>
                  </select>
                </div>

                {partnerRewardsInput.length === 0 ? (
                  <div className="py-4 text-center text-xs text-zinc-500 font-mono">
                    Награды партнёру не назначены (партнёрский код работает только со статистикой и
                    бонусами для игроков)
                  </div>
                ) : (
                  <div className="space-y-2">
                    {partnerRewardsInput.map((rw, idx) => {
                      const meta = getItemMeta(rw.itemId);
                      return (
                        <div
                          key={rw.id || idx}
                          className="p-2.5 rounded-xl bg-[#0e1018] border border-purple-900/40 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-lg">{meta.icon}</span>
                            <select
                              value={rw.itemId}
                              onChange={(e) => updatePartnerReward(idx, { itemId: e.target.value })}
                              className="bg-[#151722] border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white font-bold flex-1"
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
                                updatePartnerReward(idx, {
                                  quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                                })
                              }
                              className="w-24 bg-[#151722] border border-zinc-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-purple-300 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => removePartnerReward(idx)}
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-300 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                onClick={handleSavePartner}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{editingPartner ? 'Сохранить настройки' : 'Создать партнёра'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DETAILED PARTNER REPORT & FUNNEL MODAL (STAGE 7)
      ===================================================================== */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="w-full max-w-4xl rounded-2xl bg-[#11121a] border border-purple-500/40 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 bg-[#161824] border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                  Отчёт и воронка партнёра{' '}
                  {reportData?.partner
                    ? `«${reportData.partner.displayNameSnapshot}» (${reportData.partner.referralCode?.codeDisplay})`
                    : ''}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Date Filter Bar */}
            <div className="px-5 py-3 bg-[#141622] border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400" />
                <span className="text-zinc-400 font-mono">Период:</span>
                <input
                  type="date"
                  value={reportFilterFrom}
                  onChange={(e) => setReportFilterFrom(e.target.value)}
                  className="bg-[#0c0d13] border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white"
                />
                <span className="text-zinc-500">—</span>
                <input
                  type="date"
                  value={reportFilterTo}
                  onChange={(e) => setReportFilterTo(e.target.value)}
                  className="bg-[#0c0d13] border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() =>
                    reportPartnerId &&
                    loadPartnerReport(reportPartnerId, reportFilterFrom, reportFilterTo)
                  }
                  className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer"
                >
                  Применить
                </button>
                {(reportFilterFrom || reportFilterTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportFilterFrom('');
                      setReportFilterTo('');
                      if (reportPartnerId) loadPartnerReport(reportPartnerId, '', '');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                  >
                    Сбросить
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setReportTab('players')}
                  className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                    reportTab === 'players'
                      ? 'bg-purple-600 text-white'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  Привлечённые игроки ({reportData?.activations.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setReportTab('payouts')}
                  className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                    reportTab === 'payouts'
                      ? 'bg-purple-600 text-white'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  Начисления партнёру ({reportData?.partnerPayoutHistory.length || 0})
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {reportLoading || !reportData ? (
                <div className="py-14 flex flex-col items-center justify-center gap-2 text-zinc-400">
                  <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
                  <span className="text-xs font-mono">Формирование аналитического отчёта...</span>
                </div>
              ) : (
                <>
                  {/* Summary Funnel Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    <div className="p-3 rounded-xl bg-[#161824] border border-zinc-800">
                      <div className="text-[10px] font-mono uppercase text-zinc-400">
                        Уникальных игроков
                      </div>
                      <div className="text-lg font-bold font-mono text-white">
                        {reportData.filteredStats.totalBoundPlayers}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        Рег: {reportData.filteredStats.boundAtRegistration} / Профиль:{' '}
                        {reportData.filteredStats.boundInProfile}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#141d1b] border border-emerald-900/50">
                      <div className="text-[10px] font-mono uppercase text-emerald-400">
                        Успешно привлечено
                      </div>
                      <div className="text-lg font-bold font-mono text-emerald-300">
                        {reportData.filteredStats.qualifiedPlayers}
                      </div>
                      <div className="text-[10px] text-emerald-500 font-mono">
                        Выполнили критерий
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#161824] border border-amber-900/40">
                      <div className="text-[10px] font-mono uppercase text-amber-400">
                        В процессе
                      </div>
                      <div className="text-lg font-bold font-mono text-amber-300">
                        {reportData.filteredStats.inProgressPlayers}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">Набирают активность</div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#161824] border border-rose-900/40">
                      <div className="text-[10px] font-mono uppercase text-rose-400">
                        Не уложились
                      </div>
                      <div className="text-lg font-bold font-mono text-rose-300">
                        {reportData.filteredStats.expiredPlayers}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">Истёк срок окна</div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#191628] border border-purple-900/50">
                      <div className="text-[10px] font-mono uppercase text-purple-300">
                        Выплачено партнёру
                      </div>
                      <div className="text-lg font-bold font-mono text-purple-200">
                        {reportData.filteredStats.partnerRewardsGrantedCount}
                      </div>
                      <div className="text-[10px] text-purple-400 font-mono">
                        В ожидании: {reportData.filteredStats.partnerRewardsPendingCount}
                      </div>
                    </div>
                  </div>

                  {reportTab === 'players' ? (
                    reportData.activations.length === 0 ? (
                      <div className="py-10 text-center text-xs text-zinc-500 font-mono">
                        За выбранный период активаций не найдено
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {reportData.activations.map((act) => (
                          <div
                            key={act.id}
                            className="p-3.5 rounded-xl bg-[#161824] border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-white">{act.userDisplayName}</span>
                                {act.userEmail && (
                                  <span className="text-[11px] text-zinc-400 font-mono">
                                    ({act.userEmail})
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                    act.boundVia === 'registration'
                                      ? 'bg-indigo-950/80 border-indigo-600/60 text-indigo-300'
                                      : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                                  }`}
                                >
                                  {act.boundVia === 'registration'
                                    ? 'При регистрации'
                                    : 'В Личном кабинете'}
                                </span>
                              </div>
                              <div className="text-[11px] text-zinc-400 font-mono">
                                Дата привязки: {new Date(act.activatedAt).toLocaleString('ru-RU')} •
                                Партий с активации: {act.currentGamesSince} • Активных мин.:{' '}
                                {act.currentActiveMinutesSince} • Уровень: {act.currentLevel}
                              </div>
                              <div className="text-[11px] text-zinc-400 font-mono">
                                Активные дни (МСК):{' '}
                                <strong className="text-emerald-300">
                                  {act.activeDaysCount} / {act.requiredActiveDays}
                                </strong>
                                {act.activeDaysList.length > 0 &&
                                  ` (${act.activeDaysList.join(', ')})`}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {/* Qualification badge */}
                              {act.qualificationStatus === 'qualified' ? (
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-[10px] font-mono font-bold uppercase">
                                  Квалифицирован
                                </span>
                              ) : act.qualificationStatus === 'expired' ? (
                                <span className="px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/60 text-rose-300 text-[10px] font-mono font-bold uppercase">
                                  Не уложился в срок
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-500/60 text-amber-300 text-[10px] font-mono font-bold uppercase">
                                  В процессе ({act.activeDaysCount}/{act.requiredActiveDays})
                                </span>
                              )}

                              {/* Partner reward status */}
                              {act.partnerRewardStatus === 'granted' ? (
                                <span className="px-2.5 py-1 rounded-lg bg-purple-950/80 border border-purple-500/60 text-purple-200 text-[10px] font-mono font-bold uppercase">
                                  Награда партнёру выдана
                                </span>
                              ) : act.partnerRewardStatus === 'pending_unban' ? (
                                <span className="px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/60 text-rose-200 text-[10px] font-mono font-bold uppercase">
                                  Удержано (партнёр в бане)
                                </span>
                              ) : act.partnerRewardStatus === 'pending_conditions' ? (
                                <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-mono font-bold uppercase">
                                  Ожидает выполнения условий игроком
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : reportData.partnerPayoutHistory.length === 0 ? (
                    <div className="py-10 text-center text-xs text-zinc-500 font-mono">
                      Начислений партнёру пока нет
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {reportData.partnerPayoutHistory.map((p) => (
                        <div
                          key={p.id}
                          className="p-3 rounded-xl bg-[#161824] border border-zinc-800 flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-white">
                              {p.itemTitle} <span className="text-purple-300">x{p.quantity}</span>
                            </div>
                            <div className="text-[11px] text-zinc-400 font-mono">
                              За игрока: {p.invitedUserName} • Создано:{' '}
                              {new Date(p.createdAt).toLocaleString('ru-RU')}
                              {p.grantedAt
                                ? ` • Выплачено: ${new Date(p.grantedAt).toLocaleString('ru-RU')}`
                                : ''}
                            </div>
                          </div>
                          <div>
                            {p.status === 'granted' ? (
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-[10px] font-mono font-bold uppercase">
                                Выплачено
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-500/60 text-amber-300 text-[10px] font-mono font-bold uppercase">
                                Ожидает ({p.status})
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DELETE PARTNER CONFIRMATION MODAL (STAGE 3.5)
      ===================================================================== */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#11121a] border border-rose-500/50 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-rose-950/40 border-b border-rose-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-bold text-white uppercase">
                  Удаление партнёра «{deleteTarget.displayNameSnapshot}»
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
                Карточка партнёра <strong>{deleteTarget.displayNameSnapshot}</strong> и его
                реферальный код <strong>{deleteTarget.referralCode?.codeDisplay}</strong> будут
                удалены из активного списка, а новые активации прекратятся.
              </p>
              <p className="text-emerald-300/90 bg-emerald-950/30 border border-emerald-800/40 p-3 rounded-xl">
                Все уже полученные и ожидающие награды привлечённых игроков сохраняются, а аккаунты
                этих игроков остаются однократно привязанными к партнёрской программе.
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
                Удалить партнёра
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
