import React, { useState, useEffect, useMemo } from 'react';
import {
  Award,
  Gift,
  MailCheck,
  Ticket,
  Users2,
  Flame,
  Check,
  AlertTriangle,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Loader2,
  Coins,
  Package,
  Layers,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Info
} from 'lucide-react';
import { sounds } from '../utils/audio';
import {
  getAdminSelectableItems,
  getItemDefinition,
  LOYALTY_CREDITS_ITEM_ID,
  LOYALTY_CREDITS_ITEM_DEF,
  LoyaltyBonusConfig,
  LoyaltyBonusType,
  LoyaltyRewardItem,
  LoyaltyBonusClaimRecord,
  ItemDefinition,
  RARITY_CONFIG
} from '../data/items';

interface AdminLoyaltyViewProps {
  token: string | null;
  onFeedback?: (msg: { type: 'success' | 'error'; text: string }) => void;
}

type LoyaltySubTab = 'registration' | 'email_verification' | 'promocodes' | 'referrals' | 'campaigns';

interface LoyaltyStats {
  registrationClaimsCount: number;
  registrationGrantedCount: number;
  emailClaimsCount: number;
  emailGrantedCount: number;
  totalCreditsGranted: number;
  totalItemsGranted: number;
}

export const AdminLoyaltyView: React.FC<AdminLoyaltyViewProps> = ({ token, onFeedback }) => {
  const [activeSubTab, setActiveSubTab] = useState<LoyaltySubTab>('registration');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedbackState] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Server state
  const [serverConfigs, setServerConfigs] = useState<{
    registration: LoyaltyBonusConfig;
    emailVerification: LoyaltyBonusConfig;
  } | null>(null);
  const [stats, setStats] = useState<LoyaltyStats | null>(null);
  const [claimsHistory, setClaimsHistory] = useState<LoyaltyBonusClaimRecord[]>([]);

  // Draft configurations for editing
  const [regDraft, setRegDraft] = useState<{ isEnabled: boolean; items: LoyaltyRewardItem[] }>({
    isEnabled: false,
    items: []
  });
  const [emailDraft, setEmailDraft] = useState<{ isEnabled: boolean; items: LoyaltyRewardItem[] }>({
    isEnabled: false,
    items: []
  });

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedbackState({ type, text });
    if (onFeedback) onFeedback({ type, text });
    setTimeout(() => {
      setFeedbackState(null);
    }, 5000);
  };

  const getAuthHeaders = (): HeadersInit => {
    const t = token || localStorage.getItem('mafia_auth_token') || '';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${t}`
    };
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/loyalty', {
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Не удалось загрузить данные программы лояльности');
      }
      const data = await res.json();
      setServerConfigs(data.configs);
      setStats(data.stats);
      setClaimsHistory(data.history || []);

      if (data.configs) {
        setRegDraft({
          isEnabled: Boolean(data.configs.registration?.isEnabled),
          items: Array.isArray(data.configs.registration?.items) ? [...data.configs.registration.items] : []
        });
        setEmailDraft({
          isEnabled: Boolean(data.configs.emailVerification?.isEnabled),
          items: Array.isArray(data.configs.emailVerification?.items) ? [...data.configs.emailVerification.items] : []
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки';
      notify('error', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Combined catalog: selectable items plus the unified Virtual Credits item at index 0
  const selectableCatalog = useMemo<ItemDefinition[]>(() => {
    const items = getAdminSelectableItems();
    return [LOYALTY_CREDITS_ITEM_DEF, ...items];
  }, []);

  const activeDraft = activeSubTab === 'registration' ? regDraft : emailDraft;
  const setActiveDraft = activeSubTab === 'registration' ? setRegDraft : setEmailDraft;
  const activeServerConfig =
    activeSubTab === 'registration'
      ? serverConfigs?.registration
      : serverConfigs?.emailVerification;

  // Check if current active subtab has unsaved changes
  const hasChanges = useMemo(() => {
    if (!activeServerConfig) return false;
    if (activeDraft.isEnabled !== activeServerConfig.isEnabled) return true;
    if (activeDraft.items.length !== activeServerConfig.items.length) return true;
    for (let i = 0; i < activeDraft.items.length; i++) {
      if (
        activeDraft.items[i].itemId !== activeServerConfig.items[i].itemId ||
        activeDraft.items[i].quantity !== activeServerConfig.items[i].quantity
      ) {
        return true;
      }
    }
    return false;
  }, [activeDraft, activeServerConfig]);

  // Validation: cannot be enabled with 0 items
  const isInvalidEmpty = activeDraft.isEnabled && activeDraft.items.length === 0;

  const handleToggleEnabled = () => {
    sounds.playTick();
    setActiveDraft(prev => ({
      ...prev,
      isEnabled: !prev.isEnabled
    }));
  };

  const handleAddItem = () => {
    sounds.playTick();
    // Pick the first item from catalog that isn't already in the list
    const usedIds = new Set(activeDraft.items.map(it => it.itemId));
    const available = selectableCatalog.find(it => !usedIds.has(it.id));
    if (!available) {
      notify('error', 'Все доступные предметы уже добавлены в список наград.');
      return;
    }
    setActiveDraft(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          itemId: available.id,
          quantity: available.id === LOYALTY_CREDITS_ITEM_ID ? 250 : 1
        }
      ]
    }));
  };

  const handleRemoveItem = (index: number) => {
    sounds.playTick();
    setActiveDraft(prev => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  };

  const handleItemChange = (index: number, nextItemId: string) => {
    sounds.playTick();
    // Guard against duplicates
    const alreadySelected = activeDraft.items.some(
      (it, idx) => idx !== index && it.itemId === nextItemId
    );
    if (alreadySelected) {
      notify('error', 'Этот предмет уже присутствует в списке наград бонуса.');
      return;
    }
    setActiveDraft(prev => {
      const next = [...prev.items];
      next[index] = {
        ...next[index],
        itemId: nextItemId,
        quantity: nextItemId === LOYALTY_CREDITS_ITEM_ID ? 250 : next[index].quantity || 1
      };
      return { ...prev, items: next };
    });
  };

  const handleQuantityChange = (index: number, val: number) => {
    const qty = Math.max(1, Math.min(1000000, Math.floor(val) || 1));
    setActiveDraft(prev => {
      const next = [...prev.items];
      next[index] = { ...next[index], quantity: qty };
      return { ...prev, items: next };
    });
  };

  const handleResetDraft = () => {
    sounds.playTick();
    if (!activeServerConfig) return;
    setActiveDraft({
      isEnabled: activeServerConfig.isEnabled,
      items: activeServerConfig.items.map(it => ({ ...it }))
    });
    notify('success', 'Черновик сброшен к текущей конфигурации сервера.');
  };

  const handleSave = async () => {
    if (isInvalidEmpty) {
      notify('error', 'Нельзя включить бонус без наград. Добавьте предметы или отключите бонус перед сохранением.');
      return;
    }

    setSaving(true);
    try {
      const bonusType: LoyaltyBonusType = activeSubTab as LoyaltyBonusType;
      const res = await fetch('/api/admin/loyalty/config', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          bonusType,
          isEnabled: activeDraft.isEnabled,
          items: activeDraft.items
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при сохранении конфигурации');
      }

      sounds.playTick();
      notify('success', data.message || 'Конфигурация успешно сохранена!');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения';
      notify('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const getItemMeta = (itemId: string): ItemDefinition => {
    if (itemId === LOYALTY_CREDITS_ITEM_ID) {
      return LOYALTY_CREDITS_ITEM_DEF;
    }
    const def = getItemDefinition(itemId);
    if (def) return def;
    return {
      id: itemId,
      name: itemId,
      category: 'valuables',
      rarity: 'common',
      cost: 0,
      icon: '📦',
      usable: false,
      consumable: false,
      description: 'Предмет'
    };
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 text-white font-sans overflow-hidden">
      {/* Toast Notification */}
      {feedback && (
        <div
          className={`shrink-0 mb-3 px-4 py-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-bold transition-all animate-in fade-in slide-in-from-top-2 duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-600 text-emerald-200 shadow-lg shadow-emerald-950/40'
              : 'bg-rose-950/80 border-rose-600 text-rose-200 shadow-lg shadow-rose-950/40'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedbackState(null)}
            className="text-zinc-400 hover:text-white p-1 rounded-lg"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sub-tabs Navigation Bar */}
      <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-zinc-800/80">
        {[
          {
            id: 'registration' as const,
            label: 'Приветственный бонус',
            icon: Gift,
            badge: serverConfigs?.registration?.isEnabled ? 'АКТИВЕН' : 'ОТКЛЮЧЕН',
            badgeColor: serverConfigs?.registration?.isEnabled
              ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
              : 'bg-zinc-850 border-zinc-700 text-zinc-400'
          },
          {
            id: 'email_verification' as const,
            label: 'Бонус за подтверждение email',
            icon: MailCheck,
            badge: serverConfigs?.emailVerification?.isEnabled ? 'АКТИВЕН' : 'ОТКЛЮЧЕН',
            badgeColor: serverConfigs?.emailVerification?.isEnabled
              ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
              : 'bg-zinc-850 border-zinc-700 text-zinc-400'
          },
          {
            id: 'promocodes' as const,
            label: 'Промокоды',
            icon: Ticket,
            badge: 'В РАЗРАБОТКЕ',
            badgeColor: 'bg-amber-950/70 border-amber-800 text-amber-400/80'
          },
          {
            id: 'referrals' as const,
            label: 'Реферальная программа',
            icon: Users2,
            badge: 'В РАЗРАБОТКЕ',
            badgeColor: 'bg-amber-950/70 border-amber-800 text-amber-400/80'
          },
          {
            id: 'campaigns' as const,
            label: 'Акции',
            icon: Flame,
            badge: 'В РАЗРАБОТКЕ',
            badgeColor: 'bg-amber-950/70 border-amber-800 text-amber-400/80'
          }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                sounds.playTick();
                setActiveSubTab(tab.id);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-amber-950/90 to-orange-950/80 border-amber-500/80 text-amber-200 shadow-md shadow-amber-950/30'
                  : 'bg-[#12131b] hover:bg-[#161724] border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-zinc-400'}`} />
              <span>{tab.label}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${tab.badgeColor}`}>
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-zinc-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          <span className="text-xs font-mono">Загрузка программы лояльности...</span>
        </div>
      ) : activeSubTab === 'registration' || activeSubTab === 'email_verification' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-1 pt-3 space-y-4">
          
          {/* Header Card with Status & Master Switch */}
          <div className="p-4 rounded-2xl bg-[#12131b] border border-zinc-800/90 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  {activeSubTab === 'registration'
                    ? 'Приветственный бонус при регистрации'
                    : 'Бонус за подтверждение электронной почты'}
                </h3>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${
                    activeDraft.isEnabled
                      ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
                      : 'bg-zinc-850 border-zinc-700 text-zinc-400'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      activeDraft.isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                    }`}
                  />
                  <span>{activeDraft.isEnabled ? 'БОНУС ВКЛЮЧЕН' : 'БОНУС ОТКЛЮЧЕН'}</span>
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
                {activeSubTab === 'registration'
                  ? 'Выдаётся один раз новым игрокам сразу после успешной регистрации учетной записи (как через форму с паролем, так и при первом входе через Google). Игроки, зарегистрировавшиеся в период отключенного бонуса, получают 0 кредитов и не могут забрать его задним числом.'
                  : 'Выдаётся один раз игрокам при успешном подтверждении владения email 6-значным проверочным кодом (а также новым Google-аккаунтам с подтвержденной почтой). Защищено от повторных начислений уникальным журналом.'}
              </p>
            </div>

            {/* Toggle Switch */}
            <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
              <div className="text-right">
                <div className="text-xs font-bold text-zinc-200">
                  {activeDraft.isEnabled ? 'Активен для игроков' : 'Бонус выключен'}
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  {hasChanges ? 'Есть несохраненные изменения' : 'Синхронизировано с БД'}
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleEnabled}
                className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  activeDraft.isEnabled
                    ? 'bg-emerald-600 shadow-md shadow-emerald-950'
                    : 'bg-zinc-700 hover:bg-zinc-600'
                }`}
                title={activeDraft.isEnabled ? 'Нажмите, чтобы отключить бонус' : 'Нажмите, чтобы включить бонус'}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    activeDraft.isEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Validation Warning if Enabled with 0 Items */}
          {isInvalidEmpty && (
            <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-600/80 text-amber-200 text-xs flex items-center gap-3 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <strong>Внимание!</strong> Бонус переведён в статус «ВКЛЮЧЕН», но список наград пуст. Нажмите
                кнопку <strong>«+ Добавить предмет»</strong>, чтобы назначить кредиты или предметы. Сохранение
                пустого активного бонуса заблокировано.
              </div>
            </div>
          )}

          {/* Items & Rewards Configuration Table */}
          <div className="p-4 rounded-2xl bg-[#12131b] border border-zinc-800/90 shadow-md space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-400" />
                  Список выдаваемых наград ({activeDraft.items.length})
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Награды суммируются: кредиты начисляются на баланс профиля, предметы и сундуки добавляются в инвентарь.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-orange-950/40 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить предмет</span>
              </button>
            </div>

            {/* List */}
            {activeDraft.items.length === 0 ? (
              <div className="py-10 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center text-zinc-400 text-xs space-y-2">
                <Gift className="w-8 h-8 text-zinc-600" />
                <span className="font-bold text-zinc-300">Награды не настроены</span>
                <span className="text-[11px] text-zinc-500 max-w-sm text-center">
                  Бонус сейчас пуст. Нажмите «Добавить предмет» выше, чтобы выбрать внутриигровые кредиты или предметы из каталога.
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeDraft.items.map((entry, idx) => {
                  const meta = getItemMeta(entry.itemId);
                  const isCredits = entry.itemId === LOYALTY_CREDITS_ITEM_ID;
                  const rarity = RARITY_CONFIG[meta.rarity] || RARITY_CONFIG.common;

                  // List of used item IDs excluding this current row
                  const usedItemIds = new Set(
                    activeDraft.items.filter((_, i) => i !== idx).map(it => it.itemId)
                  );

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-[#161724] border border-zinc-800/90 hover:border-zinc-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      {/* Left: Item Picker & Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border ${rarity.bg} ${rarity.border}`}
                        >
                          {meta.icon || '🎁'}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <select
                              value={entry.itemId}
                              onChange={e => handleItemChange(idx, e.target.value)}
                              className="bg-[#0f1016] border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white font-bold focus:outline-none focus:border-amber-500 cursor-pointer max-w-xs truncate"
                            >
                              {selectableCatalog.map(catItem => {
                                const isUsedElsewhere = usedItemIds.has(catItem.id);
                                return (
                                  <option
                                    key={catItem.id}
                                    value={catItem.id}
                                    disabled={isUsedElsewhere}
                                  >
                                    {catItem.icon} {catItem.name} {isUsedElsewhere ? '(уже добавлен)' : ''}
                                  </option>
                                );
                              })}
                            </select>

                            <span
                              className={`text-[9px] font-mono px-2 py-0.5 rounded border uppercase font-bold shrink-0 ${rarity.bg} ${rarity.border} ${rarity.color}`}
                            >
                              {rarity.label}
                            </span>
                          </div>

                          <div className="text-[11px] text-zinc-400 truncate">
                            {meta.description}
                          </div>
                        </div>
                      </div>

                      {/* Right: Quantity Controls & Delete */}
                      <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                        <div className="flex items-center gap-1.5 bg-[#0e0f15] p-1 rounded-xl border border-zinc-800">
                          <span className="text-[10px] text-zinc-400 font-mono px-1">Кол-во:</span>
                          <input
                            type="number"
                            min="1"
                            max="1000000"
                            value={entry.quantity}
                            onChange={e => handleQuantityChange(idx, parseInt(e.target.value) || 1)}
                            className="w-20 bg-[#161724] border border-zinc-700/80 rounded-lg px-2 py-1 text-xs text-amber-300 font-mono font-bold text-center focus:outline-none focus:border-amber-500"
                          />
                          {/* Quick multiplier presets */}
                          <div className="flex items-center gap-1 pl-1">
                            {(isCredits ? [250, 500, 1000] : [1, 2, 5]).map(preset => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  sounds.playTick();
                                  handleQuantityChange(idx, preset);
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                                  entry.quantity === preset
                                    ? 'bg-amber-600 text-white border-amber-500'
                                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                                }`}
                              >
                                {isCredits ? `+${preset}` : `x${preset}`}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          title="Удалить из списка наград"
                          className="p-2 rounded-xl bg-zinc-850 hover:bg-rose-950/80 text-zinc-400 hover:text-rose-300 border border-zinc-700 hover:border-rose-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bottom Actions Bar */}
            <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-zinc-400">
                {activeServerConfig?.updatedAt && (
                  <span className="text-[11px] font-mono text-zinc-500">
                    Последнее сохранение: {new Date(activeServerConfig.updatedAt).toLocaleString('ru-RU')}
                    {activeServerConfig.updatedBy ? ` (${activeServerConfig.updatedBy})` : ''}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetDraft}
                  disabled={!hasChanges || saving}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить черновик</span>
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasChanges || isInvalidEmpty || saving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-orange-950/40 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>Сохранить изменения</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[#12131b] border border-zinc-800/80 space-y-1">
              <div className="text-[10px] font-mono uppercase text-zinc-400 flex items-center justify-between">
                <span>Всего событий</span>
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-white">
                {activeSubTab === 'registration'
                  ? stats?.registrationClaimsCount ?? 0
                  : stats?.emailClaimsCount ?? 0}
              </div>
              <div className="text-[10px] text-zinc-500">Зарегистрировано в системе</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#12131b] border border-emerald-900/40 space-y-1">
              <div className="text-[10px] font-mono uppercase text-emerald-400 flex items-center justify-between">
                <span>Награды выданы</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-emerald-300">
                {activeSubTab === 'registration'
                  ? stats?.registrationGrantedCount ?? 0
                  : stats?.emailGrantedCount ?? 0}
              </div>
              <div className="text-[10px] text-emerald-500">Бонус был активен</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#12131b] border border-zinc-800/80 space-y-1">
              <div className="text-[10px] font-mono uppercase text-zinc-400 flex items-center justify-between">
                <span>Пропущено (был выкл.)</span>
                <XCircle className="w-3.5 h-3.5 text-zinc-500" />
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-zinc-400">
                {activeSubTab === 'registration'
                  ? (stats?.registrationClaimsCount ?? 0) - (stats?.registrationGrantedCount ?? 0)
                  : (stats?.emailClaimsCount ?? 0) - (stats?.emailGrantedCount ?? 0)}
              </div>
              <div className="text-[10px] text-zinc-500">Без ретроактивного доначисления</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#12131b] border border-amber-900/40 space-y-1">
              <div className="text-[10px] font-mono uppercase text-amber-400 flex items-center justify-between">
                <span>Всего кредитов</span>
                <Coins className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-amber-300">
                {stats?.totalCreditsGranted ?? 0} кр.
              </div>
              <div className="text-[10px] text-amber-500">Выдано через лояльность</div>
            </div>
          </div>

          {/* Claims Journal Table */}
          <div className="p-4 rounded-2xl bg-[#12131b] border border-zinc-800/90 shadow-md space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 pb-2.5">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Журнал выдачи наград ({claimsHistory.filter(c => c.bonusType === activeSubTab).length})
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  История начислений с фиксацией статуса, времени и выданных предметов
                </p>
              </div>
            </div>

            {claimsHistory.filter(c => c.bonusType === activeSubTab).length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                Записей в журнале для этого бонуса пока нет
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {claimsHistory
                  .filter(c => c.bonusType === activeSubTab)
                  .slice(0, 30)
                  .map(claim => {
                    const isGranted = claim.status === 'granted';
                    return (
                      <div
                        key={claim.id}
                        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs transition-colors ${
                          isGranted
                            ? 'bg-[#14181f] border-emerald-900/40'
                            : 'bg-[#13141c] border-zinc-800/80'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase shrink-0 ${
                              isGranted
                                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                            }`}
                          >
                            {isGranted ? 'ВЫДАНО' : 'ПРОПУЩЕНО (ВЫКЛ)'}
                          </span>

                          <div className="min-w-0">
                            <div className="font-bold text-zinc-200 truncate flex items-center gap-1.5">
                              <span>{claim.userDisplayName || 'Игрок'}</span>
                              {claim.userEmail && (
                                <span className="text-[10px] text-zinc-400 font-normal">
                                  ({claim.userEmail})
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono">
                              {new Date(claim.claimedAt).toLocaleString('ru-RU')} • ID: {claim.userId}
                            </div>
                          </div>
                        </div>

                        {/* Granted Summary */}
                        <div className="text-right shrink-0">
                          {isGranted ? (
                            <div className="space-y-0.5">
                              {claim.creditsGranted > 0 && (
                                <div className="font-mono font-bold text-amber-300">
                                  +{claim.creditsGranted} кр.
                                </div>
                              )}
                              {claim.itemsGranted && claim.itemsGranted.length > 0 && (
                                <div className="text-[11px] text-purple-300 flex items-center justify-end gap-1 font-mono">
                                  {claim.itemsGranted
                                    .filter(it => it.itemId !== LOYALTY_CREDITS_ITEM_ID)
                                    .map((it, itIdx) => (
                                      <span key={itIdx}>
                                        {it.icon} {it.name} x{it.quantity}
                                      </span>
                                    ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-zinc-500 font-mono">
                              Бонус был отключен в настройках
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

        </div>
      ) : (
        /* In-Development Subtabs Placeholder View */
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-950/40 border border-amber-600/40 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-950/20">
            {activeSubTab === 'promocodes' ? (
              <Ticket className="w-8 h-8" />
            ) : activeSubTab === 'referrals' ? (
              <Users2 className="w-8 h-8" />
            ) : (
              <Flame className="w-8 h-8" />
            )}
          </div>

          <div className="max-w-md space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                {activeSubTab === 'promocodes'
                  ? 'Промокоды и Купоны'
                  : activeSubTab === 'referrals'
                  ? 'Реферальная программа'
                  : 'Праздничные акции и события'}
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/90 border border-amber-600 text-amber-300">
                В РАЗРАБОТКЕ
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {activeSubTab === 'promocodes'
                ? 'Этот модуль позволит создавать разовые и многоразовые промокоды с начислением кредитов, предметов, сертификатов и уникальных сундуков с ограничением по времени и числу активаций.'
                : activeSubTab === 'referrals'
                ? 'Механика реферальных ссылок: награды за приглашение друзей в Город, проценты от сыгранных партий и эксклюзивные командные титулы.'
                : 'Конструктор временных сезонных акций, распродаж в Магазине, удвоения наград за партии (x2 XP / x2 Credits) и праздничных бонусов.'}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#12131b] border border-zinc-800 text-xs text-zinc-500 max-w-sm flex items-center gap-2 text-left">
            <Info className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              Функционал проектируется в рамках расширения Программы Лояльности Mafia Club и появится в следующих обновлениях.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
