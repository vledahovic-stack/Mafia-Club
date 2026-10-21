import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  Zap,
  Sliders,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  RefreshCw,
  Save,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Search,
  Filter,
  Users,
  Award,
  Shield,
  Layers,
  ChevronRight,
  Info,
  Flame,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  PlayCircle
} from 'lucide-react';
import { sounds } from '../utils/audio';
import {
  ExperienceConfig,
  XpActionRule,
  XpMilestone,
  TierType,
  TIER_STYLE_PRESETS,
  DEFAULT_XP_ACTION_RULES,
  DEFAULT_LEVEL_MILESTONES,
  calculateLevelInfo,
  generateMilestonesFromCurve,
  setRuntimeExperienceConfig
} from '../utils/experience';

interface AdminExperienceViewProps {
  token?: string | null;
  onFeedback?: (fb: { type: 'success' | 'error'; text: string }) => void;
}

type ExperienceSubTab = 'milestones' | 'actions' | 'curve' | 'simulator' | 'presets';

export const AdminExperienceView: React.FC<AdminExperienceViewProps> = ({ token, onFeedback }) => {
  const [subTab, setSubTab] = useState<ExperienceSubTab>('milestones');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Experience config state
  const [config, setConfig] = useState<ExperienceConfig>({
    id: 'default',
    isEnabled: true,
    globalMultiplier: 1.0,
    maxLevel: 20,
    actionRules: [...DEFAULT_XP_ACTION_RULES],
    levelMilestones: [...DEFAULT_LEVEL_MILESTONES],
    updatedAt: new Date().toISOString()
  });

  // Server stats
  const [stats, setStats] = useState<{
    totalUsers?: number;
    totalUsersWithXp?: number;
    totalXpDistributed?: number;
    topPlayer?: { name: string; xp: number; level: number } | null;
    levelCounts?: Record<number, number>;
  } | null>(null);

  // Filters & searches
  const [actionCategoryFilter, setActionCategoryFilter] = useState<'all' | 'game' | 'vote' | 'night' | 'defense' | 'custom'>('all');
  const [actionSearch, setActionSearch] = useState('');
  const [milestoneSearch, setMilestoneSearch] = useState('');

  // Modals & form state
  const [isAddActionModalOpen, setIsAddActionModalOpen] = useState(false);
  const [newActionForm, setNewActionForm] = useState<Partial<XpActionRule>>({
    id: '',
    name: '',
    category: 'custom',
    xp: 25,
    icon: '⭐',
    description: ''
  });

  const [isAddMilestoneModalOpen, setIsAddMilestoneModalOpen] = useState(false);
  const [newMilestoneForm, setNewMilestoneForm] = useState<Partial<XpMilestone>>({
    level: 21,
    title: '',
    badgeIcon: '👑',
    requiredXp: 12000,
    tier: 'legend',
    perkDescription: ''
  });

  // Curve generator settings
  const [curveType, setCurveType] = useState<'polynomial' | 'linear' | 'exponential' | 'custom_step'>('polynomial');
  const [curveBaseXp, setCurveBaseXp] = useState(100);
  const [curveStep, setCurveStep] = useState(250);
  const [curveGrowthPercent, setCurveGrowthPercent] = useState(15);
  const [curveMaxLevel, setCurveMaxLevel] = useState(20);

  // Interactive Live Simulator state
  const [simulatorXpInput, setSimulatorXpInput] = useState<number>(2750);

  // Player quick XP management
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [playersList, setPlayersList] = useState<Array<{ id: string; displayName: string; xp?: number; level?: number; email?: string }>>([]);
  const [selectedPlayerForXp, setSelectedPlayerForXp] = useState<{ id: string; displayName: string; xp: number; level: number } | null>(null);
  const [playerXpAdjustment, setPlayerXpAdjustment] = useState<number>(100);
  const [playerXpSetExact, setPlayerXpSetExact] = useState<number>(0);
  const [isAdjustingPlayerXp, setIsAdjustingPlayerXp] = useState(false);

  const notify = (type: 'success' | 'error', text: string) => {
    if (onFeedback) {
      onFeedback({ type, text });
    }
  };

  // Load configuration and stats from backend
  const loadExperienceData = async () => {
    setLoading(true);
    try {
      const authToken = token || localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/admin/experience', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });

      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig(data.config);
          setRuntimeExperienceConfig(data.config);
          setCurveMaxLevel(data.config.maxLevel || 20);
        }
        if (data.stats) {
          setStats(data.stats);
        }
      } else {
        // Fallback to public endpoint
        const pubRes = await fetch('/api/experience/config');
        if (pubRes.ok) {
          const pubData = await pubRes.json();
          if (pubData.config) {
            setConfig(pubData.config);
            setRuntimeExperienceConfig(pubData.config);
          }
        }
      }
    } catch (e) {
      console.error('[AdminExperience] Load error:', e);
      notify('error', 'Ошибка связи с сервером. Используются локальные настройки.');
    } finally {
      setLoading(false);
      setHasChanges(false);
    }
  };

  // Load users list for player XP adjustments
  const loadUsersList = async () => {
    try {
      const authToken = token || localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/admin/users', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.users)) {
          setPlayersList(data.users);
        }
      }
    } catch (e) {
      console.warn('[AdminExperience] Failed to load users for XP modal:', e);
    }
  };

  useEffect(() => {
    loadExperienceData();
    loadUsersList();
  }, [token]);

  // Save changes to backend
  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      sounds.playTick();
      const authToken = token || localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/admin/experience/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(config)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Не удалось сохранить конфигурацию');
      }

      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
        setRuntimeExperienceConfig(data.config);
      }
      sounds.playVictory();
      setHasChanges(false);
      notify('success', 'Настройки шкалы опыта успешно сохранены и применены на сервере!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения шкалы опыта';
      notify('error', msg);
    } finally {
      setSaving(false);
    }
  };

  // Reset to factory defaults
  const handleResetToDefaults = async () => {
    if (!window.confirm('Сбросить шкалу опыта и все правила начисления к значениям по умолчанию?')) {
      return;
    }
    setSaving(true);
    try {
      sounds.playGavel();
      const authToken = token || localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/admin/experience/reset', {
        method: 'POST',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка сброса настроек');
      }

      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
        setRuntimeExperienceConfig(data.config);
      }
      sounds.playVictory();
      setHasChanges(false);
      notify('success', 'Шкала опыта успешно сброшена к заводским настройкам.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сброса настроек';
      notify('error', msg);
    } finally {
      setSaving(false);
    }
  };

  // Update single action XP rule
  const handleUpdateActionXp = (actionId: string, newXp: number) => {
    const safeXp = Math.max(0, Math.round(newXp));
    setConfig(prev => ({
      ...prev,
      actionRules: prev.actionRules.map(r => r.id === actionId ? { ...r, xp: safeXp } : r)
    }));
    setHasChanges(true);
  };

  // Add new custom action rule
  const handleAddActionRule = () => {
    if (!newActionForm.name || !newActionForm.name.trim()) {
      notify('error', 'Укажите название игрового действия');
      return;
    }
    const slug = (newActionForm.id || newActionForm.name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/gi, '_');

    if (config.actionRules.some(r => r.id === slug)) {
      notify('error', `Действие с идентификатором «${slug}» уже существует!`);
      return;
    }

    const created: XpActionRule = {
      id: slug,
      name: newActionForm.name.trim(),
      category: newActionForm.category || 'custom',
      xp: Math.max(0, Number(newActionForm.xp || 25)),
      icon: newActionForm.icon || '⭐',
      description: newActionForm.description?.trim() || 'Пользовательское действие',
      isCustom: true
    };

    setConfig(prev => ({
      ...prev,
      actionRules: [...prev.actionRules, created]
    }));
    setHasChanges(true);
    setIsAddActionModalOpen(false);
    setNewActionForm({ id: '', name: '', category: 'custom', xp: 25, icon: '⭐', description: '' });
    sounds.playVictory();
    notify('success', `Действие «${created.name}» добавлено! Нажмите «Сохранить изменения».`);
  };

  // Delete custom action rule
  const handleDeleteActionRule = (id: string) => {
    sounds.playTick();
    setConfig(prev => ({
      ...prev,
      actionRules: prev.actionRules.filter(r => r.id !== id)
    }));
    setHasChanges(true);
    notify('success', 'Действие удалено из списка.');
  };

  // Update single milestone
  const handleUpdateMilestone = (level: number, patch: Partial<XpMilestone>) => {
    setConfig(prev => ({
      ...prev,
      levelMilestones: prev.levelMilestones.map(m => m.level === level ? { ...m, ...patch } : m)
    }));
    setHasChanges(true);
  };

  // Delete a milestone level
  const handleDeleteMilestone = (level: number) => {
    if (config.levelMilestones.length <= 2) {
      notify('error', 'В шкале должно оставаться как минимум 2 уровня.');
      return;
    }
    sounds.playTick();
    setConfig(prev => {
      const remaining = prev.levelMilestones.filter(m => m.level !== level);
      // Re-index levels to keep continuous numbering 1..N
      const reindexed = remaining.map((m, idx) => ({ ...m, level: idx + 1 }));
      return {
        ...prev,
        maxLevel: reindexed.length,
        levelMilestones: reindexed
      };
    });
    setHasChanges(true);
    notify('success', `Уровень ${level} удален. Шкала переиндексирована.`);
  };

  // Add new milestone level
  const handleAddMilestone = () => {
    const nextLevelNum = config.levelMilestones.length + 1;
    const lastMilestone = config.levelMilestones[config.levelMilestones.length - 1];
    const prevRequiredXp = lastMilestone ? lastMilestone.requiredXp : 0;
    const suggestedXp = prevRequiredXp + 1000;

    const level = newMilestoneForm.level || nextLevelNum;
    const title = newMilestoneForm.title?.trim() || `Авторитет ${level} ранга`;
    const badgeIcon = newMilestoneForm.badgeIcon || '👑';
    const tier = newMilestoneForm.tier || 'legend';
    const requiredXp = Math.max(prevRequiredXp + 50, Number(newMilestoneForm.requiredXp || suggestedXp));
    const perkDescription = newMilestoneForm.perkDescription?.trim() || 'Эксклюзивный статус и признание в Городе';

    const styles = TIER_STYLE_PRESETS[tier] || TIER_STYLE_PRESETS.legend;

    const created: XpMilestone = {
      level,
      title,
      badgeIcon,
      requiredXp,
      tier,
      perkDescription,
      color: styles.color,
      textColor: styles.textColor,
      bgGradient: styles.bgGradient,
      borderColor: styles.borderColor,
      glowColor: styles.glowColor
    };

    setConfig(prev => {
      const list = [...prev.levelMilestones, created].sort((a, b) => a.level - b.level);
      return {
        ...prev,
        maxLevel: Math.max(prev.maxLevel, list.length),
        levelMilestones: list
      };
    });

    setHasChanges(true);
    setIsAddMilestoneModalOpen(false);
    sounds.playVictory();
    notify('success', `Новый уровень ${level} («${title}») добавлен в шкалу!`);
  };

  // Quick Max Level setter
  const handleSetMaxLevel = (newMax: number) => {
    const count = Math.max(2, Math.min(100, Math.round(newMax)));
    if (count === config.maxLevel && count === config.levelMilestones.length) return;

    sounds.playTick();
    setConfig(prev => {
      if (count < prev.levelMilestones.length) {
        // Truncate
        const truncated = prev.levelMilestones.slice(0, count);
        return { ...prev, maxLevel: count, levelMilestones: truncated };
      } else {
        // Expand using formula
        const generated = generateMilestonesFromCurve(
          { formulaType: 'polynomial', maxLevel: count },
          prev.levelMilestones
        );
        return { ...prev, maxLevel: count, levelMilestones: generated };
      }
    });
    setHasChanges(true);
    notify('success', `Шкала обновлена до ${count} уровней. Нажмите «Сохранить изменения».`);
  };

  // Apply Curve formula to all levels
  const handleApplyCurveFormula = () => {
    sounds.playGavel();
    const generated = generateMilestonesFromCurve({
      formulaType: curveType,
      maxLevel: curveMaxLevel,
      baseXp: curveBaseXp,
      incrementPerLevel: curveStep,
      growthRatePercent: curveGrowthPercent
    }, config.levelMilestones);

    setConfig(prev => ({
      ...prev,
      maxLevel: curveMaxLevel,
      levelMilestones: generated
    }));
    setHasChanges(true);
    sounds.playVictory();
    notify('success', `Формула прогрессии успешно рассчитана для ${curveMaxLevel} уровней!`);
  };

  // Apply Balance Preset
  const handleApplyPreset = (presetKey: 'classic' | 'fast' | 'hardcore' | 'grand50') => {
    sounds.playTick();
    if (presetKey === 'classic') {
      setConfig(prev => ({
        ...prev,
        globalMultiplier: 1.0,
        maxLevel: 20,
        actionRules: [...DEFAULT_XP_ACTION_RULES],
        levelMilestones: [...DEFAULT_LEVEL_MILESTONES]
      }));
      notify('success', 'Применен пресет «Классический Город» (20 уровней, x1.0)');
    } else if (presetKey === 'fast') {
      setConfig(prev => ({
        ...prev,
        globalMultiplier: 2.0,
        maxLevel: 20,
        actionRules: DEFAULT_XP_ACTION_RULES.map(r => ({ ...r, xp: Math.round(r.xp * 1.5) })),
        levelMilestones: generateMilestonesFromCurve({ formulaType: 'linear', maxLevel: 20, incrementPerLevel: 200 })
      }));
      notify('success', 'Применен пресет «Быстрый старт (x2)» — быстрая прокачка!');
    } else if (presetKey === 'hardcore') {
      setConfig(prev => ({
        ...prev,
        globalMultiplier: 0.8,
        maxLevel: 25,
        actionRules: DEFAULT_XP_ACTION_RULES.map(r => ({ ...r, xp: Math.round(r.xp * 0.8) })),
        levelMilestones: generateMilestonesFromCurve({ formulaType: 'exponential', maxLevel: 25, baseXp: 150, growthRatePercent: 18 })
      }));
      notify('success', 'Применен пресет «Хардкорный нуар» — ценность каждого ранга!');
    } else if (presetKey === 'grand50') {
      const generated = generateMilestonesFromCurve({ formulaType: 'polynomial', maxLevel: 50 });
      setConfig(prev => ({
        ...prev,
        globalMultiplier: 1.2,
        maxLevel: 50,
        levelMilestones: generated
      }));
      notify('success', 'Применен пресет «Грандиозный синдикат (50 уровней)»!');
    }
    setHasChanges(true);
  };

  // Quick Player XP adjustment handler
  const handleAdjustPlayerXp = async (isExact: boolean) => {
    if (!selectedPlayerForXp) return;
    setIsAdjustingPlayerXp(true);
    try {
      sounds.playTick();
      const authToken = token || localStorage.getItem('mafia_auth_token');
      const payload = isExact
        ? { userId: selectedPlayerForXp.id, xp: playerXpSetExact, isSet: true, reason: 'Установка XP администратором' }
        : { userId: selectedPlayerForXp.id, addXp: playerXpAdjustment, reason: 'Коррекция XP администратором' };

      const res = await fetch('/api/admin/users/xp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка обновления опыта');
      }

      const data = await res.json();
      sounds.playVictory();
      notify('success', data.message || `Опыт игрока ${selectedPlayerForXp.displayName} успешно изменен!`);
      
      // Update local state
      if (data.user) {
        setSelectedPlayerForXp({
          id: data.user.id,
          displayName: data.user.displayName,
          xp: data.user.xp || 0,
          level: data.user.level || 1
        });
        setPlayersList(prev => prev.map(p => p.id === data.user.id ? { ...p, xp: data.user.xp, level: data.user.level } : p));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка корректировки XP';
      notify('error', msg);
    } finally {
      setIsAdjustingPlayerXp(false);
    }
  };

  // Filtered action rules
  const filteredActions = useMemo(() => {
    return config.actionRules.filter(action => {
      const matchCat = actionCategoryFilter === 'all' || action.category === actionCategoryFilter;
      const matchSearch = !actionSearch || 
        action.name.toLowerCase().includes(actionSearch.toLowerCase()) ||
        action.description.toLowerCase().includes(actionSearch.toLowerCase()) ||
        action.id.toLowerCase().includes(actionSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [config.actionRules, actionCategoryFilter, actionSearch]);

  // Filtered milestones
  const filteredMilestones = useMemo(() => {
    return config.levelMilestones.filter(m => {
      if (!milestoneSearch) return true;
      const s = milestoneSearch.toLowerCase();
      return (
        m.level.toString().includes(s) ||
        m.title.toLowerCase().includes(s) ||
        m.perkDescription.toLowerCase().includes(s) ||
        m.tier.toLowerCase().includes(s)
      );
    });
  }, [config.levelMilestones, milestoneSearch]);

  // Live simulator computation
  const simulatedInfo = useMemo(() => {
    return calculateLevelInfo(simulatorXpInput);
  }, [simulatorXpInput, config]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d0e15] text-zinc-100 overflow-hidden font-sans">
      
      {/* ================= TOP HEADER TOOLBAR ================= */}
      <div className="shrink-0 p-3 sm:p-4 bg-[#12131e] border-b border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xl shadow-lg shadow-amber-950/40 shrink-0">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
                Шкала Опыта и Уровней
              </h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono border ${
                config.isEnabled 
                  ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300' 
                  : 'bg-rose-950/80 border-rose-600 text-rose-300'
              }`}>
                {config.isEnabled ? 'СИСТЕМА АКТИВНА' : 'ОТКЛЮЧЕНА'}
              </span>
              {config.globalMultiplier !== 1.0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/60 text-amber-300 text-[10px] font-bold font-mono">
                  x{config.globalMultiplier} БУСТ
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Настройка наград за действия, расчет порогов уровней, генератор шкалы и тестер баланса
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={loadExperienceData}
            disabled={loading || saving}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
            title="Обновить с сервера"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleResetToDefaults}
            disabled={saving}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-rose-700 text-zinc-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="Сброс к исходным настройкам"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Сбросить</span>
          </button>

          <button
            onClick={handleSaveConfig}
            disabled={saving || !hasChanges}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-md ${
              hasChanges
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-zinc-950 shadow-orange-950/50 animate-pulse'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700 cursor-not-allowed opacity-70'
            }`}
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Сохранение...' : hasChanges ? 'Сохранить изменения' : 'Сохранено'}</span>
          </button>
        </div>
      </div>

      {/* ================= SUB-NAVIGATION TABS (Mobile scrollable) ================= */}
      <div className="shrink-0 bg-[#0f1019] border-b border-zinc-800/80 px-2 sm:px-4 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {[
          { id: 'milestones' as const, label: 'Шкала Уровней', icon: Trophy, count: config.levelMilestones.length },
          { id: 'actions' as const, label: 'Награды за Действия', icon: Zap, count: config.actionRules.length },
          { id: 'curve' as const, label: 'Конструктор Формул', icon: Sliders, badge: 'AUTO' },
          { id: 'simulator' as const, label: 'Симулятор и Тест', icon: PlayCircle, badge: 'LIVE' },
          { id: 'presets' as const, label: 'Пресеты Баланса', icon: Sparkles }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                sounds.playTick();
                setSubTab(tab.id);
              }}
              className={`h-8 sm:h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/70 text-amber-300 shadow-sm'
                  : 'bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-zinc-500'}`} />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-amber-500/30 text-amber-200' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {tab.count}
                </span>
              )}
              {tab.badge && (
                <span className="px-1 py-0.2 rounded bg-amber-500 text-zinc-950 font-black text-[9px] font-mono">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ================= MAIN CONTENT PANELS ================= */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
        
        {/* ================= TAB 1: MILESTONES / LEVELS SCALE ================= */}
        {subTab === 'milestones' && (
          <div className="space-y-4">
            {/* Top Toolbar for Levels */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#13141f] p-3.5 rounded-2xl border border-zinc-800">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-400">Количество уровней:</span>
                  <div className="flex items-center gap-1 bg-zinc-900 px-2 py-1 rounded-xl border border-zinc-750">
                    <button
                      onClick={() => handleSetMaxLevel(config.maxLevel - 1)}
                      disabled={config.maxLevel <= 2}
                      className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center justify-center disabled:opacity-40"
                    >
                      -
                    </button>
                    <span className="font-mono font-black text-amber-300 text-sm px-2">
                      {config.maxLevel}
                    </span>
                    <button
                      onClick={() => handleSetMaxLevel(config.maxLevel + 1)}
                      disabled={config.maxLevel >= 100}
                      className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center justify-center disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400">
                  <span>Быстрый выбор:</span>
                  {[10, 20, 25, 30, 50].map(cnt => (
                    <button
                      key={cnt}
                      onClick={() => handleSetMaxLevel(cnt)}
                      className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono font-bold transition-colors ${
                        config.maxLevel === cnt
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-zinc-850 border-zinc-750 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {cnt} ур.
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={milestoneSearch}
                    onChange={e => setMilestoneSearch(e.target.value)}
                    placeholder="Поиск ранга или перка..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-750 text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                  />
                  {milestoneSearch && (
                    <button onClick={() => setMilestoneSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => {
                    sounds.playTick();
                    const nextNum = config.levelMilestones.length + 1;
                    const prevXp = config.levelMilestones[config.levelMilestones.length - 1]?.requiredXp || 10000;
                    setNewMilestoneForm({
                      level: nextNum,
                      title: `Авторитет ${nextNum} ранга`,
                      badgeIcon: nextNum >= 25 ? '👑' : nextNum >= 15 ? '💎' : '⭐',
                      requiredXp: prevXp + 1000,
                      tier: 'legend',
                      perkDescription: 'Новый ранг в мафиозном синдикате'
                    });
                    setIsAddMilestoneModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить уровень</span>
                </button>
              </div>
            </div>

            {/* Milestones List (Responsive: Cards on Mobile, Table on Desktop) */}
            <div className="space-y-2.5">
              {filteredMilestones.map((milestone, idx) => {
                const prevMilestone = idx > 0 ? filteredMilestones[idx - 1] : null;
                const deltaXp = prevMilestone ? milestone.requiredXp - prevMilestone.requiredXp : milestone.requiredXp;
                const styles = TIER_STYLE_PRESETS[milestone.tier] || TIER_STYLE_PRESETS.rookie;

                return (
                  <div
                    key={milestone.level}
                    className="p-3 sm:p-4 rounded-2xl bg-[#12131d] border border-zinc-800 hover:border-zinc-700/80 transition-all flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm"
                  >
                    {/* Left: Level badge, icon, title, tier */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-750 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                        {milestone.badgeIcon}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
                            УР. {milestone.level}
                          </span>
                          <input
                            type="text"
                            value={milestone.title}
                            onChange={e => handleUpdateMilestone(milestone.level, { title: e.target.value })}
                            className="text-sm font-bold text-white bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-amber-500 focus:outline-hidden px-1 py-0.5 rounded transition-colors"
                            title="Кликните для редактирования названия ранга"
                          />
                          <select
                            value={milestone.tier}
                            onChange={e => handleUpdateMilestone(milestone.level, { tier: e.target.value as TierType })}
                            className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border bg-zinc-900 focus:outline-hidden cursor-pointer ${styles.badgeBg}`}
                          >
                            <option value="rookie">Новичок (Серый)</option>
                            <option value="bronze">Бронза</option>
                            <option value="silver">Серебро</option>
                            <option value="gold">Золото</option>
                            <option value="platinum">Платина</option>
                            <option value="diamond">Алмаз</option>
                            <option value="legend">Легенда (Золото+Огонь)</option>
                          </select>
                        </div>

                        {/* Perk Description input */}
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                          <input
                            type="text"
                            value={milestone.perkDescription}
                            onChange={e => handleUpdateMilestone(milestone.level, { perkDescription: e.target.value })}
                            placeholder="Привилегия или награда за ранг..."
                            className="w-full text-xs text-zinc-400 bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-amber-500 focus:outline-hidden px-1 py-0.5 rounded transition-colors truncate"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Right: Required XP input and quick controls */}
                    <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-zinc-800/80">
                      <div className="text-right">
                        <div className="text-[10px] text-zinc-400 font-mono">
                          Порог опыта (XP)
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={milestone.requiredXp}
                            onChange={e => handleUpdateMilestone(milestone.level, { requiredXp: Math.max(0, Number(e.target.value)) })}
                            className="w-28 text-right font-mono font-black text-amber-300 bg-zinc-900 border border-zinc-750 focus:border-amber-500 focus:outline-hidden px-2 py-1 rounded-lg text-sm"
                          />
                          <span className="text-xs font-mono text-zinc-400">XP</span>
                        </div>
                        {idx > 0 && (
                          <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                            +{deltaXp.toLocaleString()} XP от пред.
                          </div>
                        )}
                      </div>

                      {/* Icon selector quick change */}
                      <input
                        type="text"
                        value={milestone.badgeIcon}
                        onChange={e => handleUpdateMilestone(milestone.level, { badgeIcon: e.target.value })}
                        maxLength={2}
                        className="w-9 h-9 text-center text-lg bg-zinc-900 border border-zinc-750 rounded-lg hover:border-amber-500 focus:outline-hidden"
                        title="Иконка/Эмодзи"
                      />

                      {/* Delete button (only if more than 2 levels) */}
                      <button
                        onClick={() => handleDeleteMilestone(milestone.level)}
                        className="p-2 rounded-lg bg-zinc-900 hover:bg-rose-950/80 border border-zinc-800 hover:border-rose-700 text-zinc-500 hover:text-rose-300 transition-colors"
                        title="Удалить этот уровень"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 2: ACTIONS & REWARDS ================= */}
        {subTab === 'actions' && (
          <div className="space-y-4">
            {/* Filter & Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#13141f] p-3.5 rounded-2xl border border-zinc-800">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all' as const, label: 'Все' },
                  { id: 'game' as const, label: 'Матч & Победа' },
                  { id: 'night' as const, label: 'Ночные роли' },
                  { id: 'vote' as const, label: 'Голосование' },
                  { id: 'defense' as const, label: 'Защита' },
                  { id: 'custom' as const, label: 'Пользовательские' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      sounds.playTick();
                      setActionCategoryFilter(cat.id);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-colors ${
                      actionCategoryFilter === cat.id
                        ? 'bg-amber-500 text-zinc-950'
                        : 'bg-zinc-900 border border-zinc-750 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={actionSearch}
                    onChange={e => setActionSearch(e.target.value)}
                    placeholder="Поиск действия..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-750 text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                  />
                  {actionSearch && (
                    <button onClick={() => setActionSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => {
                    sounds.playTick();
                    setIsAddActionModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить действие</span>
                </button>
              </div>
            </div>

            {/* Actions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredActions.map(action => (
                <div
                  key={action.id}
                  className="p-3.5 rounded-2xl bg-[#12131d] border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between gap-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-2xl shrink-0 mt-0.5">{action.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{action.name}</span>
                          {action.isCustom && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-950/80 border border-purple-600/60 text-purple-300 text-[9px] font-mono">
                              КАСТОМ
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2 leading-snug">
                          {action.description}
                        </p>
                        <span className="inline-block mt-1 text-[9px] font-mono text-zinc-500 uppercase">
                          ID: {action.id}
                        </span>
                      </div>
                    </div>

                    {action.isCustom && (
                      <button
                        onClick={() => handleDeleteActionRule(action.id)}
                        className="p-1 rounded text-zinc-500 hover:text-rose-400 transition-colors"
                        title="Удалить пользовательское действие"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* XP Reward Stepper */}
                  <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                    <span className="text-xs text-zinc-400 font-medium">Награда XP:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleUpdateActionXp(action.id, action.xp - 5)}
                        className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs flex items-center justify-center"
                      >
                        -5
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={action.xp}
                        onChange={e => handleUpdateActionXp(action.id, Number(e.target.value))}
                        className="w-16 text-center font-mono font-black text-amber-300 bg-zinc-900 border border-zinc-750 focus:border-amber-500 focus:outline-hidden py-1 rounded-lg text-xs"
                      />
                      <button
                        onClick={() => handleUpdateActionXp(action.id, action.xp + 5)}
                        className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs flex items-center justify-center"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 3: CURVE FORMULA BUILDER ================= */}
        {subTab === 'curve' && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="p-4 sm:p-5 rounded-2xl bg-[#12131e] border border-zinc-800 space-y-4 shadow-md">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <span>Математический Конструктор Шкалы Прогрессии</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Автоматически рассчитайте плавную кривую опыта для любого количества уровней в один клик.
                </p>
              </div>

              {/* Formula Type Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'polynomial' as const,
                    title: 'Полиномиальная (Mafia Standard)',
                    desc: '25 * L² + 25 * L - 50. Сбалансированный рост сложности с каждым рангом.'
                  },
                  {
                    id: 'linear' as const,
                    title: 'Линейная (Равномерный шаг)',
                    desc: 'Каждый уровень требует фиксированную добавку (например +250 XP).'
                  },
                  {
                    id: 'exponential' as const,
                    title: 'Экспоненциальная (+% на уровень)',
                    desc: 'Каждый следующий уровень на N% сложнее предыдущего.'
                  }
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      sounds.playTick();
                      setCurveType(item.id);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      curveType === item.id
                        ? 'bg-amber-950/40 border-amber-500 text-white shadow-sm'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="text-xs font-bold">{item.title}</div>
                    <div className="text-[11px] text-zinc-400 mt-1 leading-snug">{item.desc}</div>
                  </button>
                ))}
              </div>

              {/* Formula Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="text-xs font-bold text-zinc-400 block mb-1">Количество уровней (Max Level):</label>
                  <input
                    type="number"
                    min="2"
                    max="100"
                    value={curveMaxLevel}
                    onChange={e => setCurveMaxLevel(Math.max(2, Math.min(100, Number(e.target.value))))}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-sm font-mono font-bold text-amber-300"
                  />
                </div>

                {curveType === 'linear' && (
                  <div>
                    <label className="text-xs font-bold text-zinc-400 block mb-1">Шаг опыта на уровень (+XP):</label>
                    <input
                      type="number"
                      min="50"
                      step="50"
                      value={curveStep}
                      onChange={e => setCurveStep(Math.max(10, Number(e.target.value)))}
                      className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-sm font-mono font-bold text-white"
                    />
                  </div>
                )}

                {curveType === 'exponential' && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Базовый опыт (Ур. 2):</label>
                      <input
                        type="number"
                        min="50"
                        step="50"
                        value={curveBaseXp}
                        onChange={e => setCurveBaseXp(Math.max(10, Number(e.target.value)))}
                        className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-sm font-mono font-bold text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Прирост сложности (%):</label>
                      <input
                        type="number"
                        min="5"
                        max="50"
                        step="1"
                        value={curveGrowthPercent}
                        onChange={e => setCurveGrowthPercent(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-sm font-mono font-bold text-white"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Action Button */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleApplyCurveFormula}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-zinc-950 font-black text-xs flex items-center gap-2 shadow-md shadow-orange-950/40 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Сгенерировать и применить формулу к {curveMaxLevel} уровням</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: LIVE SIMULATOR ================= */}
        {subTab === 'simulator' && (
          <div className="space-y-4 max-w-4xl mx-auto">
            {/* XP Input Bar */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#12131e] border border-zinc-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <PlayCircle className="w-4 h-4 text-emerald-400" />
                    <span>Интерактивный Тестер и Симулятор Шкалы Опыта</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Введите произвольный опыт (XP), чтобы увидеть, как отобразится профиль и карточка игрока
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {[500, 1500, 2700, 5000, 10450].map(val => (
                    <button
                      key={val}
                      onClick={() => {
                        sounds.playTick();
                        setSimulatorXpInput(val);
                      }}
                      className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-750 text-xs font-mono font-bold text-zinc-300 hover:text-amber-400"
                    >
                      {val} XP
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={simulatorXpInput}
                    onChange={e => setSimulatorXpInput(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-zinc-950 border border-zinc-750 focus:border-amber-500 focus:outline-hidden px-4 py-2.5 rounded-xl font-mono font-black text-amber-300 text-lg"
                    placeholder="Например: 2750"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-500 font-bold">
                    XP
                  </span>
                </div>
              </div>
            </div>

            {/* Simulated Player Card */}
            <div className={`p-5 rounded-2xl border bg-gradient-to-r ${simulatedInfo.bgGradient} ${simulatedInfo.borderColor} space-y-4 shadow-xl`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-900/90 border border-zinc-700/80 flex items-center justify-center text-3xl shadow-lg shrink-0">
                    {simulatedInfo.badgeIcon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-black/40 border border-white/20 text-white font-mono font-black text-xs">
                        УРОВЕНЬ {simulatedInfo.level}
                      </span>
                      <span className={`text-xs font-black uppercase tracking-wider ${simulatedInfo.textColor}`}>
                        {simulatedInfo.tier}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-white mt-0.5">
                      {simulatedInfo.title}
                    </h3>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xl font-mono font-black text-white">
                    {simulatedInfo.totalXp.toLocaleString()} <span className="text-xs text-amber-400">XP</span>
                  </div>
                  <div className="text-[11px] text-zinc-300 mt-0.5">
                    {simulatedInfo.remainingXpToNextLevel > 0 
                      ? `До уровня ${simulatedInfo.level + 1}: ${simulatedInfo.remainingXpToNextLevel.toLocaleString()} XP`
                      : 'Максимальный ранг достигнут!'}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-300 font-bold">
                    {simulatedInfo.xpInCurrentLevel} / {simulatedInfo.xpNeededForNextLevel} XP
                  </span>
                  <span className="text-amber-400 font-black">
                    {simulatedInfo.progressPercent}%
                  </span>
                </div>
                <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden p-0.5 border border-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300 shadow-sm"
                    style={{ width: `${simulatedInfo.progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Actions breakdown suggestion */}
              {simulatedInfo.remainingXpToNextLevel > 0 && (
                <div className="pt-2 border-t border-white/10 text-xs text-zinc-300 flex items-center justify-between">
                  <span>Для повышения до уровня {simulatedInfo.level + 1} требуется:</span>
                  <span className="font-mono font-bold text-amber-300">
                    ~{Math.ceil(simulatedInfo.remainingXpToNextLevel / 120)} побед в матче или {Math.ceil(simulatedInfo.remainingXpToNextLevel / 45)} ночных проверок
                  </span>
                </div>
              )}
            </div>

            {/* Quick Player Adjuster Tool */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#12131e] border border-zinc-800 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>Коррекция опыта конкретного игрока (Live Admin Tool)</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Выберите игрока:</label>
                  <select
                    value={selectedPlayerForXp?.id || ''}
                    onChange={e => {
                      const found = playersList.find(p => p.id === e.target.value);
                      if (found) {
                        setSelectedPlayerForXp({
                          id: found.id,
                          displayName: found.displayName,
                          xp: found.xp || 0,
                          level: found.level || 1
                        });
                        setPlayerXpSetExact(found.xp || 0);
                      } else {
                        setSelectedPlayerForXp(null);
                      }
                    }}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">-- Выберите игрока из базы --</option>
                    {playersList.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} (Ур. {p.level || 1} · {p.xp || 0} XP)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedPlayerForXp && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] text-zinc-400 block mb-1">Начислить XP (+ / -):</label>
                      <input
                        type="number"
                        step="50"
                        value={playerXpAdjustment}
                        onChange={e => setPlayerXpAdjustment(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs font-mono text-white"
                      />
                    </div>
                    <button
                      onClick={() => handleAdjustPlayerXp(false)}
                      disabled={isAdjustingPlayerXp}
                      className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs"
                    >
                      {isAdjustingPlayerXp ? '...' : 'Начислить'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 5: PRESETS ================= */}
        {subTab === 'presets' && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="p-4 sm:p-5 rounded-2xl bg-[#12131e] border border-zinc-800 space-y-4 shadow-md">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Готовые Пресеты Баланса Опыта</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Выберите подходящую конфигурацию для вашего сервера: от быстрого старта до хардкорного режима.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[
                  {
                    id: 'classic' as const,
                    title: 'Классический Город',
                    icon: '🏙️',
                    desc: '20 уровней. Оригинальная квадратичная шкала Mafia Online. Идеально для стандартного темпа игры.',
                    features: ['20 рангов от Новичка до Живой Легенды', 'Стандартные награды (+120 XP за победу)', 'Множитель x1.0']
                  },
                  {
                    id: 'fast' as const,
                    title: 'Быстрый Старт (x2 Boost)',
                    icon: '🚀',
                    desc: 'Ускоренная прогрессия для тестовых серверов или праздничных ивентов с двойным опытом.',
                    features: ['Глобальный буст x2.0', 'Линейный шаг прокачки', 'Быстрое открытие всех титулов']
                  },
                  {
                    id: 'hardcore' as const,
                    title: 'Хардкорный Нуар',
                    icon: '💀',
                    desc: 'Требовательная шкала для соревновательных лиг. Достижение высоких рангов требует подлинного мастерства.',
                    features: ['25 уровней с экспоненциальным ростом', 'Сниженный опыт за пассивные действия', 'Каждый ранг имеет огромный вес']
                  },
                  {
                    id: 'grand50' as const,
                    title: 'Грандиозный Синдикат (50 уровней)',
                    icon: '👑',
                    desc: 'Масштабная дорожная карта на 50 уровней для долгосрочной игры и удержания ветеранов.',
                    features: ['50 уникальных званий и рангов', 'Плавная квадратичная прогрессия', 'Множитель x1.2 для долгого пути']
                  }
                ].map(preset => (
                  <div
                    key={preset.id}
                    className="p-4 rounded-2xl bg-[#141522] border border-zinc-800 hover:border-amber-500/60 transition-all flex flex-col justify-between gap-3 shadow-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{preset.icon}</span>
                        <div>
                          <h4 className="text-sm font-bold text-white">{preset.title}</h4>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                        {preset.desc}
                      </p>
                      <ul className="mt-3 space-y-1">
                        {preset.features.map((f, i) => (
                          <li key={i} className="text-[11px] text-zinc-300 flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => handleApplyPreset(preset.id)}
                      className="w-full py-2 rounded-xl bg-zinc-900 hover:bg-amber-500 hover:text-zinc-950 text-amber-300 font-bold text-xs border border-zinc-750 transition-colors mt-2"
                    >
                      Применить пресет
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ================= MODAL: ADD CUSTOM ACTION RULE ================= */}
      {isAddActionModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs select-none">
          <div className="w-full max-w-md bg-[#13141f] border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Добавить Действие для Начисления XP</span>
              </h3>
              <button
                onClick={() => setIsAddActionModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Название действия:</label>
                <input
                  type="text"
                  value={newActionForm.name || ''}
                  onChange={e => setNewActionForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Например: Ночной арест преступника"
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Категория:</label>
                  <select
                    value={newActionForm.category || 'custom'}
                    onChange={e => setNewActionForm(prev => ({ ...prev, category: e.target.value as any }))}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="custom">Пользовательское</option>
                    <option value="game">Матч и Победа</option>
                    <option value="night">Ночные роли</option>
                    <option value="vote">Голосование</option>
                    <option value="defense">Защита</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Иконка / Эмодзи:</label>
                  <input
                    type="text"
                    value={newActionForm.icon || '⭐'}
                    onChange={e => setNewActionForm(prev => ({ ...prev, icon: e.target.value }))}
                    maxLength={2}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white text-center text-base"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Награда опытом (+XP):</label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={newActionForm.xp || 25}
                  onChange={e => setNewActionForm(prev => ({ ...prev, xp: Number(e.target.value) }))}
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-300"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Описание:</label>
                <textarea
                  rows={2}
                  value={newActionForm.description || ''}
                  onChange={e => setNewActionForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="За что именно выдается опыт..."
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAddActionModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold"
              >
                Отмена
              </button>
              <button
                onClick={handleAddActionRule}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs"
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD LEVEL MILESTONE ================= */}
      {isAddMilestoneModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs select-none">
          <div className="w-full max-w-md bg-[#13141f] border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Добавить Новый Уровень в Шкалу</span>
              </h3>
              <button
                onClick={() => setIsAddMilestoneModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Номер уровня:</label>
                  <input
                    type="number"
                    min="1"
                    value={newMilestoneForm.level || 21}
                    onChange={e => setNewMilestoneForm(prev => ({ ...prev, level: Number(e.target.value) }))}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white"
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Иконка / Бейдж:</label>
                  <input
                    type="text"
                    value={newMilestoneForm.badgeIcon || '👑'}
                    onChange={e => setNewMilestoneForm(prev => ({ ...prev, badgeIcon: e.target.value }))}
                    maxLength={2}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white text-center text-base"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Название звания / ранга:</label>
                <input
                  type="text"
                  value={newMilestoneForm.title || ''}
                  onChange={e => setNewMilestoneForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Например: Архитектор Синдиката"
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Необходимый XP:</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={newMilestoneForm.requiredXp || 12000}
                    onChange={e => setNewMilestoneForm(prev => ({ ...prev, requiredXp: Number(e.target.value) }))}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-300"
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Тир (Цветовой ранг):</label>
                  <select
                    value={newMilestoneForm.tier || 'legend'}
                    onChange={e => setNewMilestoneForm(prev => ({ ...prev, tier: e.target.value as TierType }))}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="rookie">Новичок</option>
                    <option value="bronze">Бронза</option>
                    <option value="silver">Серебро</option>
                    <option value="gold">Золото</option>
                    <option value="platinum">Платина</option>
                    <option value="diamond">Алмаз</option>
                    <option value="legend">Легенда</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Привилегия / Описание награды:</label>
                <input
                  type="text"
                  value={newMilestoneForm.perkDescription || ''}
                  onChange={e => setNewMilestoneForm(prev => ({ ...prev, perkDescription: e.target.value }))}
                  placeholder="Эксклюзивная аура, титул в чате, бонус к кредитам..."
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAddMilestoneModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold"
              >
                Отмена
              </button>
              <button
                onClick={handleAddMilestone}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs"
              >
                Создать уровень
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
