import React, { useState, useEffect, useMemo } from 'react';
import {
  Crown,
  Sparkles,
  Gift,
  Coins,
  ShieldAlert,
  Save,
  RotateCcw,
  UserCheck,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  X,
  AlertCircle,
  Package,
  Layers,
  ChevronRight,
  Shield,
  HelpCircle
} from 'lucide-react';
import { sounds } from '../utils/audio';
import {
  ItemDefinition,
  getAdminSelectableItems,
  getDynamicItemsList,
  PREMIUM_CERTIFICATE_ITEM_ID
} from '../data/items';

export type PremiumTier = 'bronze' | 'silver' | 'gold';

export interface PremiumTierConfig {
  doubleDailyBonusCredits: boolean;
  dailyLootboxEnabled: boolean;
  dailyLootboxItemId: string | null;
}

export interface PremiumConfig {
  bronze: PremiumTierConfig;
  silver: PremiumTierConfig;
  gold: PremiumTierConfig;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isAdmin?: boolean;
  premium?: {
    tier: PremiumTier;
    activatedAt: string;
    expiresAt: string;
    source: string;
    remainingDurationMs: number;
    config: PremiumTierConfig;
  } | null;
}

interface AdminPremiumViewProps {
  token?: string | null;
  allUsers: AdminUserListItem[];
  onFeedback?: (fb: { type: 'success' | 'error'; text: string }) => void;
  onRefreshUsers?: () => void;
}

const TIER_META: Record<
  PremiumTier,
  {
    title: string;
    subtitle: string;
    colorClasses: {
      border: string;
      bg: string;
      badge: string;
      accent: string;
      glow: string;
    };
  }
> = {
  bronze: {
    title: 'Bronze',
    subtitle: 'Базовый тариф с фокусом на удвоение кредитов',
    colorClasses: {
      border: 'border-amber-700/60',
      bg: 'bg-gradient-to-b from-amber-950/20 to-zinc-950/40',
      badge: 'bg-amber-950/80 text-amber-300 border-amber-600/70',
      accent: 'text-amber-400',
      glow: 'shadow-amber-900/20'
    }
  },
  silver: {
    title: 'Silver',
    subtitle: 'Продвинутый тариф с ежедневным Premium-лутбоксом',
    colorClasses: {
      border: 'border-slate-500/60',
      bg: 'bg-gradient-to-b from-slate-900/30 to-zinc-950/40',
      badge: 'bg-slate-900/80 text-slate-200 border-slate-400/70',
      accent: 'text-slate-300',
      glow: 'shadow-slate-700/20'
    }
  },
  gold: {
    title: 'Gold',
    subtitle: 'Флагманский статус со всеми ежедневными привилегиями',
    colorClasses: {
      border: 'border-yellow-500/70',
      bg: 'bg-gradient-to-b from-yellow-950/25 to-zinc-950/40',
      badge: 'bg-yellow-950/80 text-yellow-300 border-yellow-500/70',
      accent: 'text-yellow-400',
      glow: 'shadow-yellow-600/30'
    }
  }
};

function formatDurationHuman(remainingMs: number): string {
  if (remainingMs <= 0) return 'Истёк';
  const totalSeconds = Math.floor(remainingMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  const remainingMinutes = totalMinutes % 60;

  if (days > 0) {
    return `${days} дн. ${remainingHours} ч. ${remainingMinutes} мин.`;
  }
  if (hours > 0) {
    return `${hours} ч. ${remainingMinutes} мин.`;
  }
  return `${Math.max(1, remainingMinutes)} мин.`;
}

export const AdminPremiumView: React.FC<AdminPremiumViewProps> = ({
  token,
  allUsers,
  onFeedback,
  onRefreshUsers
}) => {
  const [subTab, setSubTab] = useState<'configs' | 'users'>('configs');
  const [loading, setLoading] = useState(true);
  const [savingTier, setSavingTier] = useState<PremiumTier | null>(null);

  // Config state (original from server and draft being edited)
  const [serverConfig, setServerConfig] = useState<PremiumConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<PremiumConfig>({
    bronze: { doubleDailyBonusCredits: true, dailyLootboxEnabled: false, dailyLootboxItemId: null },
    silver: { doubleDailyBonusCredits: false, dailyLootboxEnabled: true, dailyLootboxItemId: null },
    gold: { doubleDailyBonusCredits: true, dailyLootboxEnabled: true, dailyLootboxItemId: null }
  });

  // User management state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserStatus, setSelectedUserStatus] = useState<any | null>(null);
  const [loadingUserStatus, setLoadingUserStatus] = useState(false);

  // Granting form state
  const [grantMode, setGrantMode] = useState<'certificate' | 'direct'>('certificate');
  const [targetTier, setTargetTier] = useState<PremiumTier>('bronze');
  const [targetDuration, setTargetDuration] = useState<number>(7);
  const [targetUnit, setTargetUnit] = useState<'hours' | 'days'>('days');
  const [isSubmittingGrant, setIsSubmittingGrant] = useState(false);

  // Direct activate confirmation modal
  const [directOverrideModal, setDirectOverrideModal] = useState<{
    isOpen: boolean;
    data: any;
  } | null>(null);

  // Revocation confirmation modal
  const [revokeConfirmModal, setRevokeConfirmModal] = useState<boolean>(false);
  const [isSubmittingRevoke, setIsSubmittingRevoke] = useState(false);

  // Available lootboxes in catalog
  const availableLootboxes = useMemo(() => {
    const catalog = getDynamicItemsList();
    const selectable = getAdminSelectableItems(catalog);
    return selectable.filter(i => i.category === 'chests');
  }, []);

  // Fetch configs
  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/premium/config', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки конфигурации Premium');
      if (data.config) {
        setServerConfig(data.config);
        setDraftConfig(JSON.parse(JSON.stringify(data.config)));
      }
    } catch (err: any) {
      if (onFeedback) {
        onFeedback({ type: 'error', text: err.message || 'Ошибка сети' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [token]);

  // Fetch selected user detailed premium status
  const fetchSelectedUserStatus = async (userId: string) => {
    try {
      setLoadingUserStatus(true);
      const res = await fetch(`/api/admin/premium/user-status/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedUserStatus(data);
      }
    } catch (err) {
      console.error('Failed to load user premium status:', err);
    } finally {
      setLoadingUserStatus(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      fetchSelectedUserStatus(selectedUserId);
    } else {
      setSelectedUserStatus(null);
    }
  }, [selectedUserId]);

  const selectedUser = useMemo(() => {
    return allUsers.find(u => u.id === selectedUserId) || null;
  }, [allUsers, selectedUserId]);

  // Filter users for selector
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) return allUsers.slice(0, 10);
    const q = userSearchQuery.toLowerCase().trim();
    return allUsers
      .filter(
        u =>
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [allUsers, userSearchQuery]);

  // Check if a tier has unsaved draft changes
  const isTierModified = (tier: PremiumTier): boolean => {
    if (!serverConfig) return false;
    const cur = serverConfig[tier];
    const draft = draftConfig[tier];
    return (
      cur.doubleDailyBonusCredits !== draft.doubleDailyBonusCredits ||
      cur.dailyLootboxEnabled !== draft.dailyLootboxEnabled ||
      cur.dailyLootboxItemId !== draft.dailyLootboxItemId
    );
  };

  // Save specific tier config
  const handleSaveTier = async (tier: PremiumTier) => {
    try {
      setSavingTier(tier);
      const tierDraft = draftConfig[tier];
      const res = await fetch(`/api/admin/premium/config/${tier}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(tierDraft)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения конфигурации');

      sounds.playVictory();
      setServerConfig(data.config);
      setDraftConfig(JSON.parse(JSON.stringify(data.config)));
      if (onFeedback) {
        onFeedback({ type: 'success', text: data.message || `Настройки тарифа ${TIER_META[tier].title} сохранены.` });
      }
    } catch (err: any) {
      if (onFeedback) {
        onFeedback({ type: 'error', text: err.message || 'Ошибка сохранения' });
      }
    } finally {
      setSavingTier(null);
    }
  };

  // Revert specific tier draft
  const handleRevertTier = (tier: PremiumTier) => {
    if (!serverConfig) return;
    sounds.playTick();
    setDraftConfig(prev => ({
      ...prev,
      [tier]: JSON.parse(JSON.stringify(serverConfig[tier]))
    }));
  };

  // Execute Method A (Grant Certificate)
  const handleGrantCertificate = async () => {
    if (!selectedUserId) {
      if (onFeedback) onFeedback({ type: 'error', text: 'Выберите игрока.' });
      return;
    }
    const cleanDuration = Math.trunc(Number(targetDuration));
    if (!Number.isSafeInteger(cleanDuration) || cleanDuration < 1) {
      if (onFeedback) onFeedback({ type: 'error', text: 'Продолжительность должна быть целым положительным числом.' });
      return;
    }

    try {
      setIsSubmittingGrant(true);
      const res = await fetch('/api/admin/premium/grant-certificate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: selectedUserId,
          tier: targetTier,
          duration: cleanDuration,
          unit: targetUnit
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка выдачи сертификата');

      sounds.playVictory();
      if (onFeedback) {
        onFeedback({ type: 'success', text: data.resultMessage || 'Премиум-сертификат успешно выдан!' });
      }
      if (onRefreshUsers) onRefreshUsers();
      fetchSelectedUserStatus(selectedUserId);
    } catch (err: any) {
      if (onFeedback) {
        onFeedback({ type: 'error', text: err.message || 'Ошибка выдачи сертификата' });
      }
    } finally {
      setIsSubmittingGrant(false);
    }
  };

  // Execute Method B (Direct Activate)
  const handleDirectActivate = async (confirmOverride = false) => {
    if (!selectedUserId) {
      if (onFeedback) onFeedback({ type: 'error', text: 'Выберите игрока.' });
      return;
    }
    const cleanDuration = Math.trunc(Number(targetDuration));
    if (!Number.isSafeInteger(cleanDuration) || cleanDuration < 1) {
      if (onFeedback) onFeedback({ type: 'error', text: 'Продолжительность должна быть целым положительным числом.' });
      return;
    }

    try {
      setIsSubmittingGrant(true);
      const res = await fetch('/api/admin/premium/direct-activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: selectedUserId,
          tier: targetTier,
          duration: cleanDuration,
          unit: targetUnit,
          confirmOverride,
          expectedCurrentTier: directOverrideModal?.data?.currentTier,
          expectedExpiresAt: directOverrideModal?.data?.currentExpiresAt
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка прямой активации');

      if (data.needsConfirmation) {
        setDirectOverrideModal({
          isOpen: true,
          data
        });
        return;
      }

      setDirectOverrideModal(null);
      sounds.playVictory();
      if (onFeedback) {
        onFeedback({ type: 'success', text: data.resultMessage || 'Статус успешно активирован!' });
      }
      if (onRefreshUsers) onRefreshUsers();
      fetchSelectedUserStatus(selectedUserId);
    } catch (err: any) {
      if (onFeedback) {
        onFeedback({ type: 'error', text: err.message || 'Ошибка прямой активации' });
      }
    } finally {
      setIsSubmittingGrant(false);
    }
  };

  // Execute Revocation
  const handleRevokePremium = async () => {
    if (!selectedUserId) return;
    try {
      setIsSubmittingRevoke(true);
      const res = await fetch('/api/admin/premium/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: selectedUserId,
          expectedTier: activeUserPremium?.tier,
          expectedExpiresAt: activeUserPremium?.expiresAt
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка досрочного отзыва');

      sounds.playVictory();
      setRevokeConfirmModal(false);
      if (onFeedback) {
        onFeedback({ type: 'success', text: data.resultMessage || 'Статус успешно отозван.' });
      }
      if (onRefreshUsers) onRefreshUsers();
      fetchSelectedUserStatus(selectedUserId);
    } catch (err: any) {
      if (onFeedback) {
        onFeedback({ type: 'error', text: err.message || 'Ошибка отзыва Premium' });
      }
    } finally {
      setIsSubmittingRevoke(false);
    }
  };

  const activeUserPremium = selectedUserStatus?.activePremium || selectedUser?.premium;

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0 overflow-y-auto pr-1">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 px-1">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-400" />
            Управление Premium Account
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Настройка тарифов Bronze, Silver, Gold, прямая выдача и отзыв статусов
          </p>
        </div>

        {/* Sub-tabs selector */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              setSubTab('configs');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              subTab === 'configs'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-900/30 font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Тарифы и преимущества</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              setSubTab('users');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              subTab === 'users'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-900/30 font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Выдача и игроки</span>
          </button>
        </div>
      </div>

      {/* ================= SUB-TAB 1: TIER CONFIGS ================= */}
      {subTab === 'configs' && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-300 flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Каждый тариф настраивается независимо. Изменения применяются только после нажатия кнопки «Сохранить»
              в карточке соответствующего тарифа.
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(['bronze', 'silver', 'gold'] as PremiumTier[]).map(tier => {
              const meta = TIER_META[tier];
              const draft = draftConfig[tier];
              const isModified = isTierModified(tier);
              const isSaving = savingTier === tier;
              const hasLootboxWarning = draft.dailyLootboxEnabled && !draft.dailyLootboxItemId;

              return (
                <div
                  key={tier}
                  className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between space-y-4 shadow-lg ${meta.colorClasses.border} ${meta.colorClasses.bg} ${meta.colorClasses.glow}`}
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Crown className={`w-5 h-5 ${meta.colorClasses.accent}`} />
                          <h4 className="text-base font-bold text-white tracking-wide">
                            {meta.title}
                          </h4>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                          {meta.subtitle}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${meta.colorClasses.badge}`}>
                        Тариф
                      </span>
                    </div>

                    {/* Perk 1: Double Daily Bonus Credits */}
                    <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Coins className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-semibold text-zinc-200">
                            Удвоение кредитов
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.doubleDailyBonusCredits}
                            onChange={e => {
                              sounds.playTick();
                              setDraftConfig(prev => ({
                                ...prev,
                                [tier]: {
                                  ...prev[tier],
                                  doubleDailyBonusCredits: e.target.checked
                                }
                              }));
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                        </label>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-snug">
                        Удваивает только кредитную часть обычной ежедневной награды (Day 1–7).
                      </p>
                    </div>

                    {/* Perk 2: Daily Premium Lootbox */}
                    <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Gift className="w-4 h-4 text-purple-400" />
                          <span className="text-xs font-semibold text-zinc-200">
                            Ежедневный лутбокс
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.dailyLootboxEnabled}
                            onChange={e => {
                              sounds.playTick();
                              setDraftConfig(prev => ({
                                ...prev,
                                [tier]: {
                                  ...prev[tier],
                                  dailyLootboxEnabled: e.target.checked
                                }
                              }));
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                      </div>

                      {/* Lootbox Selector */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                          Предмет из каталога:
                        </label>
                        <select
                          disabled={!draft.dailyLootboxEnabled}
                          value={draft.dailyLootboxItemId || ''}
                          onChange={e => {
                            sounds.playTick();
                            const val = e.target.value.trim();
                            setDraftConfig(prev => ({
                              ...prev,
                              [tier]: {
                                ...prev[tier],
                                dailyLootboxItemId: val.length > 0 ? val : null
                              }
                            }));
                          }}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-amber-500 focus:outline-none"
                        >
                          <option value="">— Не выбран —</option>
                          {availableLootboxes.map(box => (
                            <option key={box.id} value={box.id}>
                              {box.icon || '📦'} {box.name} ({box.id})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Warning if enabled without item */}
                      {hasLootboxWarning && (
                        <div className="p-2 rounded-lg bg-amber-950/60 border border-amber-600/70 text-[10px] text-amber-200 flex items-start gap-1.5 leading-snug">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>
                            Лутбокс включён, но не назначен. Награда не будет выдана до выбора предмета. Прочие преимущества работают.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="pt-2 flex items-center justify-between gap-2 border-t border-zinc-800/80">
                    <button
                      type="button"
                      disabled={!isModified || isSaving}
                      onClick={() => handleRevertTier(tier)}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors cursor-pointer"
                      title="Сбросить локальные изменения"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Отмена</span>
                    </button>

                    <button
                      type="button"
                      disabled={!isModified || isSaving}
                      onClick={() => handleSaveTier(tier)}
                      className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs shadow-md shadow-amber-950/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? 'Сохранение...' : 'Сохранить'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= SUB-TAB 2: USERS & GRANTING ================= */}
      {subTab === 'users' && (
        <div className="space-y-5">
          {/* 1. Player Selector Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                <Search className="w-4 h-4 text-amber-400" />
                Выбор целевого игрока
              </h4>
              {selectedUserId && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setSelectedUserId(null);
                  }}
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Снять выбор</span>
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={userSearchQuery}
                onChange={e => setUserSearchQuery(e.target.value)}
                placeholder="Поиск по имени, email или ID игрока..."
                className="w-full bg-zinc-800/90 border border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Quick user selection pills */}
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
              {filteredUsers.map(u => {
                const isSelected = u.id === selectedUserId;
                const hasPrem = Boolean(u.premium);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      sounds.playTick();
                      setSelectedUserId(u.id);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-600/30 border-amber-500 text-white font-bold'
                        : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-300 hover:border-zinc-500'
                    }`}
                  >
                    <span>{u.displayName}</span>
                    {hasPrem && (
                      <span className="text-[10px] px-1 py-0.2 rounded bg-amber-950 border border-amber-600 text-amber-300 font-mono">
                        {u.premium?.tier?.toUpperCase()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected User Status Banner */}
            {selectedUser && (
              <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-zinc-700/80 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>{selectedUser.displayName}</span>
                    <span className="text-[11px] font-mono text-zinc-400">({selectedUser.email})</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono">
                    ID: {selectedUser.id}
                  </div>
                </div>

                {/* Premium Active Status Pill */}
                {activeUserPremium ? (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-xs font-bold text-amber-300">
                          {TIER_META[activeUserPremium.tier as PremiumTier]?.title || activeUserPremium.tier}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-zinc-300">
                        Осталось: {formatDurationHuman(activeUserPremium.remainingDurationMs)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setRevokeConfirmModal(true)}
                      className="px-2.5 py-1 rounded-lg bg-rose-950/70 border border-rose-700 text-rose-300 hover:bg-rose-900 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      Отозвать
                    </button>
                  </div>
                ) : (
                  <div className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs">
                    Нет активного Premium
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Granting Action Box (Disabled if no player selected) */}
          <div className={`p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-5 transition-opacity ${!selectedUserId ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Mode Selector: Method A vs Method B */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-400" />
                  Операция выдачи Premium
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Выберите способ: выдача сертификата в инвентарь (Способ А) или прямая активация на аккаунт (Способ Б)
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-zinc-800 rounded-xl border border-zinc-700">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setGrantMode('certificate');
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    grantMode === 'certificate'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Способ А (Сертификат)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setGrantMode('direct');
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    grantMode === 'direct'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Способ Б (Напрямую)
                </button>
              </div>
            </div>

            {/* Grant Parameters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Tier selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Тариф:
                </label>
                <select
                  value={targetTier}
                  onChange={e => {
                    sounds.playTick();
                    setTargetTier(e.target.value as PremiumTier);
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="bronze">Bronze</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                </select>
              </div>

              {/* Duration input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Продолжительность:
                </label>
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={targetDuration}
                  onChange={e => setTargetDuration(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Unit selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Единица измерения:
                </label>
                <select
                  value={targetUnit}
                  onChange={e => {
                    sounds.playTick();
                    setTargetUnit(e.target.value as 'hours' | 'days');
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="days">Дни</option>
                  <option value="hours">Часы</option>
                </select>
              </div>
            </div>

            {/* Action Explanation Banner */}
            <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/60 text-xs text-zinc-300 leading-relaxed">
              {grantMode === 'certificate' ? (
                <span>
                  Игрок <strong>{selectedUser?.displayName || '...'}</strong> получит один индивидуальный сертификат
                  в инвентарь. Статус Premium <strong>не активируется</strong> автоматически — игрок сможет использовать его
                  в любой момент.
                </span>
              ) : (
                <span>
                  Статус Premium <strong>{TIER_META[targetTier].title}</strong> будет активирован игроку напрямую.
                  Если у игрока уже активен такой же тариф — он будет продлён. Если действует другой тариф — потребуется подтверждение замены.
                </span>
              )}
            </div>

            {/* Submit Action */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={isSubmittingGrant}
                onClick={() => {
                  if (grantMode === 'certificate') {
                    handleGrantCertificate();
                  } else {
                    handleDirectActivate(false);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs shadow-lg shadow-amber-950/40 disabled:opacity-40 flex items-center gap-2 cursor-pointer transition-all"
              >
                <Crown className="w-4 h-4" />
                <span>
                  {isSubmittingGrant
                    ? 'Выполнение...'
                    : grantMode === 'certificate'
                    ? 'Выдать сертификат'
                    : 'Активировать напрямую'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: DIRECT OVERRIDE CONFIRMATION ================= */}
      {directOverrideModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-amber-600/60 p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-600 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">Подтверждение замены действующего тарифа</h4>
                <p className="text-xs text-zinc-400">
                  У игрока уже активен тариф другого уровня.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Действующий тариф:</span>
                <strong className="text-amber-400 uppercase">
                  {directOverrideModal.data.currentTier}
                </strong>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Оставшееся время:</span>
                <span className="font-mono text-zinc-200">
                  {formatDurationHuman(directOverrideModal.data.remainingDurationMs)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400 border-t border-zinc-800 pt-2">
                <span>Новый тариф:</span>
                <strong className="text-emerald-400 uppercase">
                  {directOverrideModal.data.targetTier} ({directOverrideModal.data.targetDuration} {directOverrideModal.data.targetUnit === 'days' ? 'дн.' : 'ч.'})
                </strong>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-[11px] text-rose-300 leading-snug">
              Внимание: Неиспользованное время действующего тарифа будет безвозвратно аннулировано. Новый тариф начнёт действовать с момента подтверждения.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDirectOverrideModal(null)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isSubmittingGrant}
                onClick={() => handleDirectActivate(true)}
                className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md cursor-pointer"
              >
                {isSubmittingGrant ? 'Замена...' : 'Подтвердить замену'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: REVOKE CONFIRMATION ================= */}
      {revokeConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-rose-600/70 p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-600 flex items-center justify-center text-rose-400 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">Досрочный отзыв Premium</h4>
                <p className="text-xs text-zinc-400">
                  Вы собираетесь прекратить действие Premium для игрока <strong>{selectedUser?.displayName}</strong>.
                </p>
              </div>
            </div>

            {activeUserPremium && (
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5 text-xs text-zinc-300">
                <div className="flex justify-between">
                  <span>Текущий статус:</span>
                  <span className="font-bold text-amber-400 uppercase">{activeUserPremium.tier}</span>
                </div>
                <div className="flex justify-between">
                  <span>Остаток срока:</span>
                  <span className="font-mono">{formatDurationHuman(activeUserPremium.remainingDurationMs)}</span>
                </div>
              </div>
            )}

            <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 leading-snug">
              Действие статуса будет прекращено немедленно. Ранее полученные награды и сертификаты в инвентаре игрока удалены не будут. Действие фиксируется в журнале аудита.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRevokeConfirmModal(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isSubmittingRevoke}
                onClick={handleRevokePremium}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md cursor-pointer"
              >
                {isSubmittingRevoke ? 'Отзыв...' : 'Прекратить Premium'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
