import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Trophy,
  Shield,
  Clock,
  Flame,
  TrendingUp,
  Calendar,
  Award,
  BarChart2,
  PieChart as PieIcon,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Crown,
  RotateCw,
  Search,
  ChevronRight,
  X,
  Check,
  Target,
  History,
  Coins,
  Loader2,
  Layers
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';
import { AuthUser, MatchRecord } from './AuthModal';
import {
  LevelInfo,
  XpMilestone,
  XpActionRule,
  calculateLevelInfo,
  getLevelMilestones,
  getXpActionRules,
  getRuntimeExperienceConfig,
  subscribeToExperienceConfig,
  fetchExperienceConfig
} from '../utils/experience';
import {
  RoleMasteryInfo,
  getUserAllRolesMastery,
  getUserMasterySummary
} from '../data/mastery';
import { sounds } from '../utils/audio';

export type ProgressSectionTabId =
  | 'experience'
  | 'stats'
  | 'mastery'
  | 'history'
  | 'achievements';

interface ServerGameHistoryResponse {
  userId: string;
  displayName: string;
  matches: MatchRecord[];
  summary?: {
    gamesPlayed: number;
    gamesWon: number;
    winRate: number;
    rating: number;
    mafiaWins: number;
    civilianWins: number;
    totalSurvivalSeconds: number;
    averageSurvivalSeconds: number;
    mostPlayedRole: { role: string; name: string; games: number } | null;
    bestWinRateRole: { role: string; name: string; winRate: number; games: number } | null;
  };
  roleBreakdown?: Record<
    string,
    {
      role: string;
      roleName: string;
      games: number;
      wins: number;
      survivedCount: number;
      totalSurvivalSeconds: number;
    }
  >;
}

interface PlayerProgressStatsScreenProps {
  user: AuthUser;
  levelInfo?: LevelInfo;
  activeMilestones?: XpMilestone[];
  activeActionRules?: XpActionRule[];
  maxLevel?: number;
  initialSubTab?: ProgressSectionTabId;
  onSubTabChange?: (tab: ProgressSectionTabId) => void;
  onUpdateUser: (updatedUser: AuthUser) => void;
  onOpenTasks?: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  citizen: '#94a3b8',
  civilian: '#94a3b8',
  mafia: '#f43f5e',
  don: '#e11d48',
  sheriff: '#38bdf8',
  doctor: '#34d399',
  courtesan: '#ec4899',
  maniac: '#a855f7',
  bodyguard: '#f59e0b'
};

const ROLE_NAMES: Record<string, string> = {
  citizen: 'Мирный житель',
  civilian: 'Мирный житель',
  mafia: 'Мафия',
  don: 'Дон Мафии',
  sheriff: 'Шериф',
  doctor: 'Доктор',
  courtesan: 'Красотка',
  maniac: 'Маньяк',
  bodyguard: 'Телохранитель'
};

const ROLE_ICONS: Record<string, string> = {
  citizen: '👤',
  civilian: '👤',
  mafia: '🕶️',
  don: '👑',
  sheriff: '⭐',
  doctor: '💉',
  courtesan: '💋',
  maniac: '🔪',
  bodyguard: '🛡️'
};

const TEAM_LABELS: Record<string, string> = {
  civilians: 'Мирный город',
  mafia: 'Клан Мафии',
  maniac: 'Одиночка (Маньяк)'
};

const HISTORY_PAGE_SIZE = 15;

export const PlayerProgressStatsScreen: React.FC<PlayerProgressStatsScreenProps> = ({
  user,
  levelInfo: propLevelInfo,
  activeMilestones: propMilestones,
  activeActionRules: propActionRules,
  maxLevel: propMaxLevel,
  initialSubTab = 'experience',
  onSubTabChange,
  onUpdateUser,
  onOpenTasks
}) => {
  const [expConfig, setExpConfig] = useState(getRuntimeExperienceConfig());
  useEffect(() => {
    fetchExperienceConfig().then(cfg => setExpConfig(cfg));
    return subscribeToExperienceConfig(cfg => setExpConfig(cfg));
  }, []);

  const levelInfo = useMemo(
    () => propLevelInfo || calculateLevelInfo(user.xp),
    [propLevelInfo, user.xp, expConfig]
  );
  const activeMilestones = useMemo(
    () => propMilestones || getLevelMilestones(),
    [propMilestones, expConfig]
  );
  const activeActionRules = useMemo(
    () => propActionRules || getXpActionRules(),
    [propActionRules, expConfig]
  );
  const maxLevel = propMaxLevel ?? (expConfig.maxLevel || activeMilestones.length);

  const [activeTab, setActiveTab] = useState<ProgressSectionTabId>(initialSubTab);

  useEffect(() => {
    setActiveTab(initialSubTab);
  }, [initialSubTab]);

  const handleSelectTab = (tab: ProgressSectionTabId) => {
    sounds.playTick();
    setActiveTab(tab);
    if (onSubTabChange) {
      onSubTabChange(tab);
    }
  };

  // Real server game history state
  const [historyResponse, setHistoryResponse] = useState<ServerGameHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const fetchGameHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/user/game-history?userId=${encodeURIComponent(user.id)}`, {
        headers
      });
      if (!res.ok) {
        throw new Error('Не удалось загрузить историю матчей с сервера.');
      }
      const json: ServerGameHistoryResponse = await res.json();
      setHistoryResponse(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка соединения с сервером';
      setHistoryError(msg);
    } finally {
      setHistoryLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchGameHistory();
  }, [fetchGameHistory]);

  // Real match history list (no synthetic/fake matches)
  const matches: MatchRecord[] = useMemo(() => {
    if (historyResponse && Array.isArray(historyResponse.matches)) {
      return historyResponse.matches;
    }
    if (Array.isArray(user.matchHistory)) {
      return user.matchHistory;
    }
    return [];
  }, [historyResponse, user.matchHistory]);

  // Authoritative overall stats from server summary + user.stats
  const stats = user.stats || {
    gamesPlayed: 0,
    gamesWon: 0,
    rating: 1200,
    mafiaWins: 0,
    civilianWins: 0
  };

  const totalGames = Math.max(
    0,
    historyResponse?.summary?.gamesPlayed ?? stats.gamesPlayed ?? 0
  );
  const totalWins = Math.max(
    0,
    historyResponse?.summary?.gamesWon ?? stats.gamesWon ?? 0
  );
  const drawsInHistory = useMemo(
    () => matches.filter(m => Boolean(m.isDraw)).length,
    [matches]
  );
  const totalLosses = Math.max(0, totalGames - totalWins - drawsInHistory);
  const winRate =
    totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
  const currentElo =
    historyResponse?.summary?.rating ??
    (typeof stats.rating === 'number' ? stats.rating : 1200);

  const civilianWins =
    historyResponse?.summary?.civilianWins ?? stats.civilianWins ?? 0;
  const mafiaWins =
    historyResponse?.summary?.mafiaWins ?? stats.mafiaWins ?? 0;
  const maniacWinsFromHistory = useMemo(
    () => matches.filter(m => m.team === 'maniac' && m.won && !m.isDraw).length,
    [matches]
  );

  // Real survival metrics (0 when 0 games, never fabricated 180s)
  const avgSurvivalSeconds = useMemo(() => {
    if (totalGames <= 0 && matches.length === 0) return 0;
    const serverAvg =
      historyResponse?.summary?.averageSurvivalSeconds ??
      stats.averageSurvivalSeconds;
    if (typeof serverAvg === 'number' && serverAvg >= 0) {
      return Math.round(serverAvg);
    }
    if (matches.length > 0) {
      const sum = matches.reduce((acc, m) => acc + (Number(m.survivalSeconds) || 0), 0);
      return Math.round(sum / matches.length);
    }
    return 0;
  }, [totalGames, historyResponse, stats.averageSurvivalSeconds, matches]);

  const totalSurvivalSeconds = useMemo(() => {
    const serverTotal =
      historyResponse?.summary?.totalSurvivalSeconds ?? stats.totalSurvivalSeconds;
    if (typeof serverTotal === 'number' && serverTotal >= 0) {
      return Math.round(serverTotal);
    }
    return matches.reduce((acc, m) => acc + (Number(m.survivalSeconds) || 0), 0);
  }, [historyResponse, stats.totalSurvivalSeconds, matches]);

  const avgSurvivalMin = Math.floor(avgSurvivalSeconds / 60);
  const avgSurvivalSec = avgSurvivalSeconds % 60;
  const totalSurvivalMin = Math.floor(totalSurvivalSeconds / 60);

  const survivedMatchesCount = useMemo(
    () => matches.filter(m => m.survived).length,
    [matches]
  );
  const survivalRateInHistory =
    matches.length > 0
      ? Math.round((survivedMatchesCount / matches.length) * 100)
      : null;

  // True Elo Dynamics reconstructed strictly from currentElo and real ratingChange deltas in matches
  // (No fictional offsets or demo points)
  const eloTimelineData = useMemo(() => {
    if (matches.length === 0) return [];
    // matches[0] is the most recent match; work backwards from currentElo
    const pointsReversed: Array<{
      matchId: string;
      label: string;
      playedAt: string;
      ratingAfter: number;
      ratingChange: number;
      roleName: string;
      won: boolean;
      isDraw?: boolean;
    }> = [];

    let cursorElo = currentElo;
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const delta = Number(m.ratingChange) || 0;
      const dateShort = new Date(m.playedAt).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit'
      });
      pointsReversed.push({
        matchId: m.id,
        label: dateShort,
        playedAt: m.playedAt,
        ratingAfter: cursorElo,
        ratingChange: delta,
        roleName: m.roleName || ROLE_NAMES[m.role] || m.role,
        won: m.won,
        isDraw: m.isDraw
      });
      cursorElo = cursorElo - delta;
    }

    return pointsReversed.reverse().map((pt, idx) => ({
      ...pt,
      indexLabel: `#${idx + 1}`
    }));
  }, [matches, currentElo]);

  const netEloDeltaRecent = useMemo(() => {
    if (matches.length === 0) return null;
    return matches.reduce((sum, m) => sum + (Number(m.ratingChange) || 0), 0);
  }, [matches]);

  // Role Mastery & Role Statistics merged from user.stats.roleStats (or server roleBreakdown) + mastery.ts
  const effectiveUserForMastery = useMemo<AuthUser>(() => {
    const mergedRoleStats =
      historyResponse?.roleBreakdown &&
      Object.keys(historyResponse.roleBreakdown).length > 0
        ? historyResponse.roleBreakdown
        : user.stats?.roleStats;

    return {
      ...user,
      matchHistory: matches,
      stats: {
        gamesPlayed: totalGames,
        gamesWon: totalWins,
        rating: currentElo,
        mafiaWins,
        civilianWins,
        totalSurvivalSeconds,
        averageSurvivalSeconds: avgSurvivalSeconds,
        roleStats: mergedRoleStats
      }
    };
  }, [
    user,
    historyResponse,
    matches,
    totalGames,
    totalWins,
    currentElo,
    mafiaWins,
    civilianWins,
    totalSurvivalSeconds,
    avgSurvivalSeconds
  ]);

  const masterySummary = useMemo(
    () => getUserMasterySummary(effectiveUserForMastery),
    [effectiveUserForMastery]
  );
  const allRolesMastery = useMemo(
    () => getUserAllRolesMastery(effectiveUserForMastery),
    [effectiveUserForMastery]
  );

  // Per-role average survival time from roleStats or matchHistory
  const roleAvgSurvivalMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    const breakdown =
      historyResponse?.roleBreakdown || user.stats?.roleStats || {};
    Object.entries(breakdown).forEach(([key, val]) => {
      const normKey = key === 'civilian' ? 'citizen' : key;
      if (val && val.games > 0 && typeof val.totalSurvivalSeconds === 'number') {
        map[normKey] = Math.round(val.totalSurvivalSeconds / val.games);
      }
    });
    if (Object.keys(map).length === 0 && matches.length > 0) {
      const byRole: Record<string, { games: number; secs: number }> = {};
      matches.forEach(m => {
        const normKey = m.role === 'civilian' ? 'citizen' : m.role;
        if (!byRole[normKey]) byRole[normKey] = { games: 0, secs: 0 };
        byRole[normKey].games += 1;
        byRole[normKey].secs += Number(m.survivalSeconds) || 0;
      });
      Object.entries(byRole).forEach(([k, v]) => {
        if (v.games > 0) map[k] = Math.round(v.secs / v.games);
      });
    }
    return map;
  }, [historyResponse, user.stats?.roleStats, matches]);

  // Most played & best winrate roles (only when real games > 0)
  const mostPlayedRoleEntry = useMemo(() => {
    const played = allRolesMastery.filter(r => r.gamesPlayed > 0);
    if (played.length === 0) return null;
    return [...played].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0];
  }, [allRolesMastery]);

  const bestWinRateRoleEntry = useMemo(() => {
    const qualified = allRolesMastery.filter(r => r.gamesPlayed >= 2);
    const pool = qualified.length > 0 ? qualified : allRolesMastery.filter(r => r.gamesPlayed > 0);
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) =>
      b.winRate !== a.winRate ? b.winRate - a.winRate : b.gamesPlayed - a.gamesPlayed
    )[0];
  }, [allRolesMastery]);

  // Role filter & detail modal state (Tab 3)
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'played' | 'mastered' | 'progress' | 'locked'
  >('all');
  const [selectedRoleDetail, setSelectedRoleDetail] = useState<RoleMasteryInfo | null>(null);
  const [equippingRoleId, setEquippingRoleId] = useState<string | null>(null);
  const [equipFeedback, setEquipFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const filteredRoles = useMemo(() => {
    switch (roleFilter) {
      case 'played':
        return allRolesMastery.filter(r => r.gamesPlayed > 0);
      case 'mastered':
        return allRolesMastery.filter(r => r.isMasterOrAbove);
      case 'progress':
        return allRolesMastery.filter(
          r => r.currentTier.id !== 'locked' && !r.isMasterOrAbove
        );
      case 'locked':
        return allRolesMastery.filter(r => r.currentTier.id === 'locked');
      default:
        return allRolesMastery;
    }
  }, [allRolesMastery, roleFilter]);

  const isRoleTitleEquipped = useCallback(
    (role: RoleMasteryInfo): boolean => {
      const currentTitle = user.equippedCosmetics?.title;
      if (!currentTitle) return false;
      return (
        currentTitle.includes(role.masterBadgeTitleRu) ||
        currentTitle.includes(role.masterBadgeTitle) ||
        currentTitle.includes(role.flairTitle)
      );
    },
    [user.equippedCosmetics?.title]
  );

  const handleEquipOrUnequipRoleBadge = async (role: RoleMasteryInfo) => {
    if (!role.isMasterOrAbove) return;
    const currentlyEquipped = isRoleTitleEquipped(role);

    setEquippingRoleId(role.roleId);
    setEquipFeedback(null);
    sounds.playTick();

    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/user/equip-mastery-badge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(
          currentlyEquipped
            ? { badgeTitle: '' }
            : {
                roleId: role.roleId,
                badgeTitle: `${role.icon} ${role.masterBadgeTitleRu}`,
                flairTitle: role.flairTitle
              }
        )
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось обновить титул мастерства');
      }

      sounds.playGunshot();
      if (data.user) {
        onUpdateUser(data.user);
      }
      setEquipFeedback({
        type: 'success',
        text: currentlyEquipped
          ? 'Титул мастерства снят с вашего профиля.'
          : `Титул «${role.masterBadgeTitleRu}» установлен в профиле!`
      });
      setTimeout(() => setEquipFeedback(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка применения титула';
      setEquipFeedback({ type: 'error', text: msg });
      setTimeout(() => setEquipFeedback(null), 3500);
    } finally {
      setEquippingRoleId(null);
    }
  };

  // Match history filters, progressive pagination & detail modal (Tab 4)
  const [historyOutcomeFilter, setHistoryOutcomeFilter] = useState<
    'all' | 'won' | 'lost' | 'draw' | 'survived'
  >('all');
  const [historyRoleFilter, setHistoryRoleFilter] = useState<string>('all');
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [visibleMatchesCount, setVisibleMatchesCount] = useState<number>(HISTORY_PAGE_SIZE);
  const [selectedMatchDetail, setSelectedMatchDetail] = useState<MatchRecord | null>(null);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleMatchesCount(HISTORY_PAGE_SIZE);
  }, [historyOutcomeFilter, historyRoleFilter, historySearchQuery]);

  const filteredMatches = useMemo(() => {
    const cleanQuery = historySearchQuery.trim().toLowerCase();
    return matches.filter(m => {
      if (historyOutcomeFilter === 'won' && (!m.won || m.isDraw)) return false;
      if (historyOutcomeFilter === 'lost' && (m.won || m.isDraw)) return false;
      if (historyOutcomeFilter === 'draw' && !m.isDraw) return false;
      if (historyOutcomeFilter === 'survived' && !m.survived) return false;

      if (historyRoleFilter !== 'all') {
        const normRole = m.role === 'civilian' ? 'citizen' : m.role;
        if (normRole !== historyRoleFilter) return false;
      }

      if (cleanQuery) {
        const rName = (m.roleName || ROLE_NAMES[m.role] || m.role || '').toLowerCase();
        const tName = (TEAM_LABELS[m.team] || m.team || '').toLowerCase();
        if (!rName.includes(cleanQuery) && !tName.includes(cleanQuery)) return false;
      }

      return true;
    });
  }, [matches, historyOutcomeFilter, historyRoleFilter, historySearchQuery]);

  const visibleMatches = useMemo(
    () => filteredMatches.slice(0, visibleMatchesCount),
    [filteredMatches, visibleMatchesCount]
  );

  // Pie chart data for Wins / Losses / Draws (Tab 2)
  const winLossPieData = useMemo(() => {
    const items = [
      { name: 'Победы', value: totalWins, color: '#10b981' },
      { name: 'Поражения', value: totalLosses, color: '#f43f5e' }
    ];
    if (drawsInHistory > 0) {
      items.push({ name: 'Ничьи', value: drawsInHistory, color: '#f59e0b' });
    }
    return items;
  }, [totalWins, totalLosses, drawsInHistory]);

  return (
    <div className="space-y-4 sm:space-y-5 select-none animate-in fade-in duration-150">
      {/* =====================================================================
          INTERNAL COMPACT NAVIGATION BAR (5 LOGICAL BLOCKS, NO DUPLICATE STREAK)
         ===================================================================== */}
      <nav
        aria-label="Разделы прогресса и статистики"
        style={{
          backgroundColor: 'var(--skin-bg-elevated)',
          borderColor: 'var(--skin-border-base)'
        }}
        className="p-1.5 rounded-2xl border flex items-center gap-1.5 overflow-x-auto no-scrollbar"
      >
        {[
          {
            id: 'experience' as const,
            label: `Прогресс (Ур. ${levelInfo.level})`,
            icon: Sparkles
          },
          {
            id: 'stats' as const,
            label: 'Общая статистика',
            icon: BarChart2
          },
          {
            id: 'mastery' as const,
            label: `Роли и мастерство${
              masterySummary.masteredCount > 0 ? ` (${masterySummary.masteredCount})` : ''
            }`,
            icon: Crown
          },
          {
            id: 'history' as const,
            label: `История матчей (${matches.length})`,
            icon: History
          },
          {
            id: 'achievements' as const,
            label: 'Достижения',
            badge: 'В разработке',
            icon: Award
          }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelectTab(tab.id)}
              style={
                isActive
                  ? {
                      background: 'var(--skin-btn-primary-bg)',
                      color: 'var(--skin-btn-primary-text)',
                      borderColor: 'var(--skin-border-accent)'
                    }
                  : {
                      backgroundColor: 'var(--skin-bg-subcard)',
                      borderColor: 'var(--skin-border-base)',
                      color: 'var(--skin-text-secondary)'
                    }
              }
              className="px-3 py-2 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all cursor-pointer hover:text-[var(--skin-text-primary)]"
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="px-1.5 py-0.2 rounded bg-black/45 border border-white/15 text-[9px] font-mono font-semibold text-amber-300">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* =====================================================================
          BLOCK 1: PLAYER PROGRESS (ПРОГРЕСС ИГРОКА: УРОВЕНЬ, XP, ELO И ДИНАМИКА ELO)
         ===================================================================== */}
      {activeTab === 'experience' && (
        <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-150">
          {/* 1.1. Hero Level & XP Scale Card */}
          <section
            className={`p-4 sm:p-5 rounded-2xl bg-gradient-to-r ${levelInfo.bgGradient} border ${levelInfo.borderColor} shadow-xl relative overflow-hidden`}
          >
            <div className="absolute -right-8 -top-8 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
              {/* Left: Level Emblem & Rank Title */}
              <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-black/45 border border-amber-500/60 flex items-center justify-center text-2xl sm:text-3xl shadow-xl shrink-0">
                  {levelInfo.badgeIcon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg sm:text-xl font-black text-white tabular-nums">
                      Уровень {levelInfo.level}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-amber-300">
                      • {levelInfo.title}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-black/50 border border-amber-500/50 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                      Лига {levelInfo.tier}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 mt-1 max-w-lg leading-relaxed">
                    Шкала опыта отражает ваш игровой прогресс в Mafia Club. Очки XP начисляются за завершённые партии, победы и результативные ночные и дневные действия.
                  </p>
                </div>
              </div>

              {/* Right: Total XP & Current Elo Summary */}
              <div className="grid grid-cols-2 gap-2.5 shrink-0">
                <div className="px-3.5 py-2.5 rounded-xl bg-black/50 border border-zinc-700/80 text-right">
                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                    Накоплено XP
                  </div>
                  <div className="text-base sm:text-lg font-mono font-black text-amber-400 tabular-nums">
                    {levelInfo.totalXp.toLocaleString('ru-RU')} XP
                  </div>
                </div>

                <div className="px-3.5 py-2.5 rounded-xl bg-black/50 border border-zinc-700/80 text-right">
                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                    Рейтинг Elo
                  </div>
                  <div className="text-base sm:text-lg font-mono font-black text-white tabular-nums flex items-center justify-end gap-1">
                    <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{currentElo}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* XP Progress Bar */}
            <div className="mt-4 space-y-2 relative z-10">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="text-zinc-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Прогресс до ур. {levelInfo.level + 1}:</span>
                  <strong className="text-amber-400 tabular-nums">
                    {levelInfo.xpInCurrentLevel.toLocaleString('ru-RU')} /{' '}
                    {levelInfo.xpNeededForNextLevel.toLocaleString('ru-RU')} XP
                  </strong>
                </span>
                <span className="text-amber-400 tabular-nums">{levelInfo.progressPercent}%</span>
              </div>

              <div className="w-full h-3.5 bg-black/60 rounded-full overflow-hidden border border-zinc-700/90 relative p-0.5 shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 rounded-full transition-all duration-700"
                  style={{ width: `${Math.max(2, levelInfo.progressPercent)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-300 flex-wrap gap-2 tabular-nums">
                <span>Начало ур. {levelInfo.level}: {levelInfo.currentLevelXp.toLocaleString('ru-RU')} XP</span>
                <span className="text-amber-300 font-bold">
                  Осталось до ур. {levelInfo.level + 1}: {levelInfo.remainingXpToNextLevel.toLocaleString('ru-RU')} XP
                </span>
                <span>Порог ур. {levelInfo.level + 1}: {levelInfo.nextLevelXp.toLocaleString('ru-RU')} XP</span>
              </div>
            </div>
          </section>

          {/* 1.2. Real Elo Rating & Verified Historical Elo Dynamics */}
          <section
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-card)'
            }}
            className="skin-card p-4 sm:p-5 rounded-2xl border space-y-3"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-[var(--skin-text-primary)] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Динамика рейтинга Elo</span>
                </h4>
                <p className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                  Реальная история изменения вашего рейтинга по зафиксированным матчам
                </p>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-primary)] font-bold tabular-nums">
                  Текущий: {currentElo} Elo
                </span>
                {netEloDeltaRecent !== null && (
                  <span
                    className={`px-2.5 py-1 rounded-lg border font-bold tabular-nums ${
                      netEloDeltaRecent > 0
                        ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
                        : netEloDeltaRecent < 0
                        ? 'bg-rose-950/70 border-rose-700/60 text-rose-300'
                        : 'bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] text-[var(--skin-text-secondary)]'
                    }`}
                  >
                    {netEloDeltaRecent > 0 ? `+${netEloDeltaRecent}` : netEloDeltaRecent} Elo ({matches.length} игр)
                  </span>
                )}
              </div>
            </div>

            {eloTimelineData.length === 0 ? (
              <div
                style={{
                  backgroundColor: 'var(--skin-bg-subcard)',
                  borderColor: 'var(--skin-border-base)'
                }}
                className="p-6 rounded-xl border border-dashed text-center space-y-1.5"
              >
                <TrendingUp className="w-6 h-6 text-[var(--skin-text-muted)] mx-auto" />
                <div className="text-xs font-bold text-[var(--skin-text-primary)]">
                  Исторические данные динамики Elo пока отсутствуют
                </div>
                <p className="text-[11px] text-[var(--skin-text-secondary)] max-w-md mx-auto">
                  Ваш стартовый рейтинг составляет {currentElo} Elo. После завершения первых партий здесь появится график реальных изменений рейтинга.
                </p>
              </div>
            ) : (
              <div className="h-44 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={eloTimelineData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="realEloGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="indexLabel" stroke="#71717a" fontSize={10} tickLine={false} />
                    <YAxis stroke="#71717a" fontSize={10} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#181924',
                        borderColor: '#3f3f46',
                        borderRadius: '10px',
                        fontSize: '11px'
                      }}
                      formatter={(val: any, _name: any, item: any) => {
                        const d = item?.payload?.ratingChange || 0;
                        const dStr = d > 0 ? `+${d}` : `${d}`;
                        return [`${val} Elo (${dStr})`, item?.payload?.roleName || 'Рейтинг'];
                      }}
                      labelFormatter={(_label: any, payload: any) => {
                        const p = payload?.[0]?.payload;
                        if (!p) return '';
                        return `${new Date(p.playedAt).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}`;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="ratingAfter"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#realEloGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* 1.3. Quests & Events XP Shortcut Banner */}
          {onOpenTasks && (
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-accent)'
              }}
              className="skin-card p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div
                  style={{
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: 'var(--skin-border-accent)'
                  }}
                  className="w-10 h-10 rounded-xl border flex items-center justify-center text-xl shrink-0"
                >
                  🎯
                </div>
                <div>
                  <h4 className="font-bold text-[var(--skin-text-primary)] text-xs sm:text-sm">
                    Дополнительный опыт за выполнение задач и ивентов
                  </h4>
                  <p className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                    Выполняйте общие, вводные, личные и клановые задачи для ускоренного повышения уровня.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sounds.playTick();
                  onOpenTasks();
                }}
                style={{
                  background: 'var(--skin-btn-primary-bg)',
                  color: 'var(--skin-btn-primary-text)'
                }}
                className="px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider shrink-0 transition-all shadow-md hover:brightness-110 cursor-pointer"
              >
                Квесты и Ивенты
              </button>
            </div>
          )}

          {/* 1.4. XP Action Rules (Как начисляется опыт в партии) */}
          <section
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-card)'
            }}
            className="skin-card p-4 sm:p-5 rounded-2xl border space-y-3"
          >
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-[var(--skin-text-primary)] flex items-center gap-2">
                <Award className="w-4 h-4 text-[var(--skin-accent-primary)]" />
                <span>Начисление опыта за действия в партии</span>
              </h4>
              <p className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                Действующие базовые нормативы начисления XP по правилам сервера
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {activeActionRules.map(action => (
                <div
                  key={action.id}
                  className="skin-subcard p-3 rounded-xl border flex items-start justify-between gap-2.5"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="text-lg shrink-0 mt-0.5">{action.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--skin-text-primary)] leading-snug">
                        {action.name}
                      </div>
                      <div className="text-[10px] text-[var(--skin-text-secondary)] mt-0.5 leading-tight">
                        {action.description}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-lg bg-amber-950/80 border border-amber-600/70 text-amber-300 font-mono font-black text-xs shrink-0 tabular-nums">
                    +{action.xp} XP
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 1.5. Level Milestones Roadmap */}
          <section
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-card)'
            }}
            className="skin-card p-4 sm:p-5 rounded-2xl border space-y-3"
          >
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-[var(--skin-text-primary)] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[var(--skin-accent-primary)]" />
                <span>
                  Таблица уровней и званий Города (1 — {maxLevel || activeMilestones.length})
                </span>
              </h4>
              <p className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                Пороги накопленного опыта для каждого уровня профиля
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
              {activeMilestones.map(milestone => {
                const isReached = levelInfo.level >= milestone.level;
                const isCurrent = levelInfo.level === milestone.level;

                return (
                  <div
                    key={milestone.level}
                    style={
                      !isCurrent
                        ? {
                            backgroundColor: 'var(--skin-bg-subcard)',
                            borderColor: isReached
                              ? 'rgba(16, 185, 129, 0.45)'
                              : 'var(--skin-border-subtle)'
                          }
                        : undefined
                    }
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                      isCurrent
                        ? 'bg-gradient-to-r from-amber-950/60 to-yellow-950/50 border-amber-500 shadow-md shadow-amber-950/40'
                        : !isReached
                        ? 'opacity-75'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                          isCurrent
                            ? 'bg-amber-950 border border-amber-400'
                            : isReached
                            ? 'bg-emerald-950/80 border border-emerald-700'
                            : 'bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-base)]'
                        }`}
                      >
                        {milestone.badgeIcon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-[var(--skin-text-primary)] truncate">
                            Ур. {milestone.level} · {milestone.title}
                          </span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500 text-zinc-950 text-[9px] font-black font-mono">
                              ТЕКУЩИЙ
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--skin-text-secondary)] truncate mt-0.5">
                          {milestone.perkDescription}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono">
                      <div className="text-[10px] text-[var(--skin-text-secondary)] tabular-nums">
                        {milestone.requiredXp.toLocaleString('ru-RU')} XP
                      </div>
                      {isReached ? (
                        <span className="text-[10px] font-bold text-emerald-400">✓ Достигнут</span>
                      ) : (
                        <span className="text-[10px] text-[var(--skin-text-muted)]">🔒 Закрыт</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          BLOCK 2: GENERAL STATISTICS (ОБЩАЯ СТАТИСТИКА ИГРОКА)
         ===================================================================== */}
      {activeTab === 'stats' && (
        <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-150">
          {/* 2.1. Core Verified Indicators Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Matches Played */}
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-card)'
              }}
              className="skin-card p-3.5 rounded-2xl border space-y-1"
            >
              <div className="flex items-center justify-between text-[var(--skin-text-secondary)] text-[11px]">
                <span>Сыграно матчей</span>
                <Layers className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-[var(--skin-text-primary)]">
                {totalGames}
              </div>
              <div className="text-[10px] font-mono text-[var(--skin-text-muted)]">
                Завершённых партий
              </div>
            </div>

            {/* Wins & Losses */}
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-card)'
              }}
              className="skin-card p-3.5 rounded-2xl border space-y-1"
            >
              <div className="flex items-center justify-between text-[var(--skin-text-secondary)] text-[11px]">
                <span>Победы / Поражения</span>
                <Trophy className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono tabular-nums flex items-baseline gap-1.5">
                <span className="text-emerald-400">{totalWins}</span>
                <span className="text-xs text-[var(--skin-text-muted)]">/</span>
                <span className="text-rose-400">{totalLosses}</span>
              </div>
              <div className="text-[10px] font-mono text-[var(--skin-text-muted)]">
                {drawsInHistory > 0 ? `Ничьих в истории: ${drawsInHistory}` : 'Исходы партий'}
              </div>
            </div>

            {/* Win Rate */}
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-card)'
              }}
              className="skin-card p-3.5 rounded-2xl border space-y-1.5"
            >
              <div className="flex items-center justify-between text-[var(--skin-text-secondary)] text-[11px]">
                <span>Процент побед</span>
                <Flame className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-amber-300">
                {totalGames > 0 ? `${winRate}%` : '0%'}
              </div>
              <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${totalGames > 0 ? winRate : 0}%` }}
                  className="bg-emerald-500 h-full transition-all duration-500"
                />
                <div
                  style={{ width: `${totalGames > 0 ? 100 - winRate : 0}%` }}
                  className="bg-rose-500/80 h-full transition-all duration-500"
                />
              </div>
            </div>

            {/* Elo Rating */}
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-card)'
              }}
              className="skin-card p-3.5 rounded-2xl border space-y-1"
            >
              <div className="flex items-center justify-between text-[var(--skin-text-secondary)] text-[11px]">
                <span>Рейтинг Elo</span>
                <Award className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-[var(--skin-text-primary)]">
                {currentElo}
              </div>
              <div className="text-[10px] font-mono text-amber-400">
                Официальный рейтинг стола
              </div>
            </div>
          </div>

          {/* 2.2. Secondary Server-Supported Metrics (Factions, Survival, Top Roles) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {/* Faction Wins */}
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-card)'
              }}
              className="skin-card p-4 rounded-2xl border space-y-2"
            >
              <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center justify-between">
                <span>Победы по сторонам</span>
                <Shield className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-0.5 font-mono text-xs">
                <div className="p-2.5 rounded-xl bg-sky-950/35 border border-sky-800/50">
                  <div className="text-[10px] text-sky-300 uppercase">Мирный город</div>
                  <div className="text-base font-black text-white tabular-nums mt-0.5">
                    {civilianWins}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-950/35 border border-rose-800/50">
                  <div className="text-[10px] text-rose-300 uppercase">Клан Мафии</div>
                  <div className="text-base font-black text-white tabular-nums mt-0.5">
                    {mafiaWins}
                  </div>
                </div>
              </div>
              {maniacWinsFromHistory > 0 && (
                <div className="text-[11px] font-mono text-purple-300 pt-1">
                  Побед за Маньяка (в истории): <strong>{maniacWinsFromHistory}</strong>
                </div>
              )}
            </div>

            {/* Survival Time Metrics */}
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-card)'
              }}
              className="skin-card p-4 rounded-2xl border space-y-2"
            >
              <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center justify-between">
                <span>Показатели выживания</span>
                <Clock className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="space-y-1 font-mono">
                <div className="text-lg font-black text-blue-300 tabular-nums">
                  {totalGames > 0 ? `${avgSurvivalMin}м ${avgSurvivalSec}с` : '—'}
                </div>
                <div className="text-[11px] text-[var(--skin-text-secondary)]">
                  Среднее время жизни в партии
                </div>
              </div>
              <div className="pt-1 border-t border-[var(--skin-border-subtle)] flex items-center justify-between text-[11px] font-mono text-[var(--skin-text-muted)]">
                <span>Всего в партиях: {totalSurvivalMin} мин.</span>
                {survivalRateInHistory !== null && (
                  <span className="text-emerald-400 font-bold">
                    Выжил: {survivalRateInHistory}%
                  </span>
                )}
              </div>
            </div>

            {/* Favorite & Best Role */}
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-card)'
              }}
              className="skin-card p-4 rounded-2xl border space-y-2"
            >
              <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center justify-between">
                <span>Ключевые роли</span>
                <Crown className="w-3.5 h-3.5 text-amber-400" />
              </div>
              {mostPlayedRoleEntry ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--skin-text-secondary)] text-[11px]">Частая роль:</span>
                    <span className="font-bold text-[var(--skin-text-primary)] truncate">
                      {mostPlayedRoleEntry.icon} {mostPlayedRoleEntry.roleName} ({mostPlayedRoleEntry.gamesPlayed})
                    </span>
                  </div>
                  {bestWinRateRoleEntry && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--skin-text-secondary)] text-[11px]">Лучший винрейт:</span>
                      <span className="font-bold text-emerald-400 truncate font-mono">
                        {bestWinRateRoleEntry.icon} {bestWinRateRoleEntry.roleName} ({bestWinRateRoleEntry.winRate}%)
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[var(--skin-text-muted)] py-2">
                  Нет сыгранных ролей
                </div>
              )}
              <div className="pt-1 border-t border-[var(--skin-border-subtle)]">
                <button
                  type="button"
                  onClick={() => handleSelectTab('mastery')}
                  className="text-[11px] font-bold text-[var(--skin-accent-primary)] hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>Все карточки ролей</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* 2.3. Visual Charts or Honest Empty State */}
          {totalGames === 0 ? (
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-base)'
              }}
              className="skin-card p-8 rounded-2xl border border-dashed text-center space-y-2"
            >
              <BarChart2 className="w-9 h-9 text-[var(--skin-text-muted)] mx-auto" />
              <div className="text-sm font-bold text-[var(--skin-text-primary)]">
                Статистика матчей пока пуста
              </div>
              <p className="text-xs text-[var(--skin-text-secondary)] max-w-md mx-auto leading-relaxed">
                У вас ещё нет завершённых партий. Сыграйте в классическую или спортивную мафию, чтобы здесь появились диаграммы побед и подробная статистика.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
              {/* Wins vs Losses Pie Chart */}
              <div
                style={{
                  backgroundColor: 'var(--skin-bg-card)',
                  borderColor: 'var(--skin-border-card)'
                }}
                className="skin-card md:col-span-5 p-4 rounded-2xl border flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5">
                    <PieIcon className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Соотношение исходов</span>
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {winRate}% WR
                  </span>
                </div>

                <div className="h-44 w-full my-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={winLossPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={68}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {winLossPieData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            stroke="#13141c"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#181924',
                          borderColor: '#3f3f46',
                          borderRadius: '8px',
                          fontSize: '11px'
                        }}
                        formatter={(val: any) => [`${val} матчей`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-around text-xs font-mono pt-2 border-t border-[var(--skin-border-subtle)] flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-[var(--skin-text-secondary)]">
                      Победы: <b className="text-emerald-400">{totalWins}</b>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <span className="text-[var(--skin-text-secondary)]">
                      Поражения: <b className="text-rose-400">{totalLosses}</b>
                    </span>
                  </div>
                  {drawsInHistory > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="text-[var(--skin-text-secondary)]">
                        Ничьи: <b className="text-amber-400">{drawsInHistory}</b>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Faction Wins Bar Chart */}
              <div
                style={{
                  backgroundColor: 'var(--skin-bg-card)',
                  borderColor: 'var(--skin-border-card)'
                }}
                className="skin-card md:col-span-7 p-4 rounded-2xl border flex flex-col justify-between"
              >
                <span className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Победы по фракциям</span>
                </span>

                <div className="h-44 w-full my-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'Мирный город', wins: civilianWins, fill: '#38bdf8' },
                        { name: 'Клан Мафии', wins: mafiaWins, fill: '#f43f5e' },
                        ...(maniacWinsFromHistory > 0
                          ? [{ name: 'Маньяк', wins: maniacWinsFromHistory, fill: '#a855f7' }]
                          : [])
                      ]}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="name" stroke="#71717a" fontSize={11} />
                      <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#181924',
                          borderColor: '#3f3f46',
                          borderRadius: '8px',
                          fontSize: '11px'
                        }}
                        formatter={(val: any) => [`${val} побед`, 'Результат']}
                      />
                      <Bar dataKey="wins" radius={[6, 6, 0, 0]}>
                        <Cell fill="#38bdf8" />
                        <Cell fill="#f43f5e" />
                        {maniacWinsFromHistory > 0 && <Cell fill="#a855f7" />}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[var(--skin-text-secondary)] pt-2 border-t border-[var(--skin-border-subtle)] font-mono">
                  <span>
                    Мирный город: <b className="text-sky-400">{civilianWins}</b>
                  </span>
                  <span>
                    Клан Мафии: <b className="text-rose-400">{mafiaWins}</b>
                  </span>
                  {maniacWinsFromHistory > 0 && (
                    <span>
                      Маньяк: <b className="text-purple-400">{maniacWinsFromHistory}</b>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          BLOCK 3: ROLE STATISTICS & MASTERY (СТАТИСТИКА И МАСТЕРСТВО РОЛЕЙ)
         ===================================================================== */}
      {activeTab === 'mastery' && (
        <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-150">
          {equipFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                equipFeedback.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-600/70 text-emerald-200'
                  : 'bg-rose-950/80 border-rose-600/70 text-rose-200'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{equipFeedback.text}</span>
            </div>
          )}

          {/* 3.1. Compact Role Mastery & Stats Header Summary */}
          <section
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-card)'
            }}
            className="skin-card p-4 sm:p-5 rounded-2xl border space-y-3"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-[var(--skin-text-primary)] flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400" />
                    <span>Статистика и мастерство ролей</span>
                  </h3>
                  {user.equippedCosmetics?.title && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-600/60 text-amber-300 text-[11px] font-bold">
                      Активный титул: {user.equippedCosmetics.title}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--skin-text-secondary)] max-w-xl leading-relaxed">
                  Показатели ваших игр, побед и выживаемости по каждой роли. Достигайте ранга «Мастер» (от 8 игр и 65% побед), чтобы открывать и надевать почётные титулы профиля.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 shrink-0 font-mono text-center">
                <div className="skin-subcard p-2.5 rounded-xl border">
                  <div className="text-[10px] text-[var(--skin-text-muted)] uppercase">Мастера</div>
                  <div className="text-sm sm:text-base font-black text-amber-400 tabular-nums mt-0.5">
                    {masterySummary.masteredCount} / {allRolesMastery.length}
                  </div>
                </div>
                <div className="skin-subcard p-2.5 rounded-xl border">
                  <div className="text-[10px] text-[var(--skin-text-muted)] uppercase">Очки ролей</div>
                  <div className="text-sm sm:text-base font-black text-sky-400 tabular-nums mt-0.5">
                    {masterySummary.totalMasteryPoints}
                  </div>
                </div>
                <div className="skin-subcard p-2.5 rounded-xl border">
                  <div className="text-[10px] text-[var(--skin-text-muted)] uppercase">Сыграно ролей</div>
                  <div className="text-sm sm:text-base font-black text-emerald-400 tabular-nums mt-0.5">
                    {allRolesMastery.filter(r => r.gamesPlayed > 0).length} / {allRolesMastery.length}
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Chips */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-[var(--skin-border-subtle)]">
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { id: 'all' as const, label: `Все роли (${allRolesMastery.length})` },
                  {
                    id: 'played' as const,
                    label: `Сыгранные (${allRolesMastery.filter(r => r.gamesPlayed > 0).length})`
                  },
                  {
                    id: 'mastered' as const,
                    label: `Значки Мастера (${masterySummary.masteredCount})`
                  },
                  {
                    id: 'progress' as const,
                    label: `В прокачке (${
                      allRolesMastery.filter(
                        r => r.currentTier.id !== 'locked' && !r.isMasterOrAbove
                      ).length
                    })`
                  },
                  {
                    id: 'locked' as const,
                    label: `Без игр (${
                      allRolesMastery.filter(r => r.currentTier.id === 'locked').length
                    })`
                  }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      sounds.playTick();
                      setRoleFilter(f.id);
                    }}
                    style={
                      roleFilter === f.id
                        ? {
                            background: 'var(--skin-btn-primary-bg)',
                            color: 'var(--skin-btn-primary-text)'
                          }
                        : {
                            backgroundColor: 'var(--skin-bg-subcard)',
                            borderColor: 'var(--skin-border-base)',
                            color: 'var(--skin-text-secondary)'
                          }
                    }
                    className="px-2.5 py-1 rounded-xl border text-[11px] font-bold transition-all cursor-pointer"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] font-mono text-[var(--skin-text-muted)]">
                Нажмите на карточку роли для подробностей
              </span>
            </div>
          </section>

          {/* 3.2. Role Cards Grid */}
          {filteredRoles.length === 0 ? (
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-base)'
              }}
              className="skin-card p-8 rounded-2xl border border-dashed text-center space-y-2"
            >
              <Crown className="w-8 h-8 text-[var(--skin-text-muted)] mx-auto" />
              <div className="text-xs font-bold text-[var(--skin-text-primary)]">
                Нет ролей по выбранному фильтру
              </div>
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className="skin-btn-secondary px-4 py-1.5 rounded-xl border text-xs font-bold cursor-pointer mt-1"
              >
                Показать все роли
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredRoles.map(role => {
                const tier = role.currentTier;
                const isMaster = role.isMasterOrAbove;
                const isEquipped = isRoleTitleEquipped(role);
                const roleAvgSecs = roleAvgSurvivalMap[role.roleId] || 0;

                return (
                  <div
                    key={role.roleId}
                    onClick={() => {
                      sounds.playTick();
                      setSelectedRoleDetail(role);
                    }}
                    style={
                      !isMaster
                        ? {
                            backgroundColor:
                              tier.id !== 'locked'
                                ? 'var(--skin-bg-card)'
                                : 'var(--skin-bg-subcard)',
                            borderColor:
                              tier.id !== 'locked'
                                ? 'var(--skin-border-card)'
                                : 'var(--skin-border-subtle)'
                          }
                        : undefined
                    }
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between gap-3 group hover:border-[var(--skin-border-accent)] ${
                      isMaster
                        ? `${tier.bgGradient} ${tier.borderColor} ring-1 ring-amber-500/40 shadow-lg`
                        : tier.id === 'locked'
                        ? 'opacity-80 hover:opacity-100'
                        : ''
                    }`}
                  >
                    {/* Card Header: Role Icon, Name, Faction & Mastery Tier Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center text-2xl border shrink-0 shadow-inner ${
                            isMaster
                              ? 'bg-black/50 border-amber-400/60'
                              : 'bg-black/40 border-white/10'
                          }`}
                        >
                          {role.icon}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-[var(--skin-text-primary)] truncate">
                              {role.roleName}
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                                role.team === 'mafia'
                                  ? 'bg-rose-950/80 border-rose-800 text-rose-300'
                                  : role.team === 'maniac'
                                  ? 'bg-purple-950/80 border-purple-800 text-purple-300'
                                  : 'bg-sky-950/80 border-sky-800 text-sky-300'
                              }`}
                            >
                              {role.team === 'mafia'
                                ? 'Синдикат'
                                : role.team === 'maniac'
                                ? 'Одиночка'
                                : 'Мирные'}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-amber-300/90 mt-0.5 truncate">
                            {role.masterBadgeTitleRu} ·{' '}
                            <span className="font-normal italic text-[var(--skin-text-secondary)]">
                              «{role.flairTitle}»
                            </span>
                          </div>
                        </div>
                      </div>

                      <div
                        className={`px-2.5 py-1 rounded-xl border flex items-center gap-1 text-[11px] font-bold shrink-0 ${
                          isMaster
                            ? 'bg-amber-950/90 border-amber-400 text-amber-300'
                            : tier.id !== 'locked'
                            ? 'bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] text-[var(--skin-text-primary)]'
                            : 'bg-black/40 border-[var(--skin-border-subtle)] text-[var(--skin-text-muted)]'
                        }`}
                      >
                        <span>{tier.icon}</span>
                        <span>{tier.nameRu}</span>
                      </div>
                    </div>

                    {/* Quantitative Role Stats Row */}
                    <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl bg-black/35 border border-white/5 font-mono text-center">
                      <div>
                        <div className="text-[9px] text-[var(--skin-text-muted)] uppercase">
                          Матчей
                        </div>
                        <div className="text-xs font-bold text-[var(--skin-text-primary)] tabular-nums">
                          {role.gamesPlayed}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-[var(--skin-text-muted)] uppercase">
                          Побед
                        </div>
                        <div className="text-xs font-bold text-emerald-400 tabular-nums">
                          {role.gamesWon}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-[var(--skin-text-muted)] uppercase">
                          Винрейт
                        </div>
                        <div
                          className={`text-xs font-bold tabular-nums ${
                            role.winRate >= 65
                              ? 'text-amber-300'
                              : role.winRate >= 50
                              ? 'text-emerald-400'
                              : 'text-[var(--skin-text-primary)]'
                          }`}
                        >
                          {role.winRate}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-[var(--skin-text-muted)] uppercase">
                          Выжил
                        </div>
                        <div className="text-xs font-bold text-sky-300 tabular-nums">
                          {role.survivedCount}
                          {roleAvgSecs > 0
                            ? ` (${Math.floor(roleAvgSecs / 60)}м)`
                            : ''}
                        </div>
                      </div>
                    </div>

                    {/* Progress to Next Tier & Equip Title Action */}
                    <div className="space-y-2">
                      {role.nextTier ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-[var(--skin-text-secondary)]">
                            <span>
                              До ранга <strong className="text-[var(--skin-text-primary)]">{role.nextTier.nameRu}</strong>:
                            </span>
                            <span className="font-mono font-bold tabular-nums">
                              {role.progressToNextTier.percentCompleted}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
                            <div
                              className={`h-full transition-all duration-500 rounded-full ${
                                isMaster
                                  ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                                  : 'bg-gradient-to-r from-sky-500 to-amber-500'
                              }`}
                              style={{ width: `${role.progressToNextTier.percentCompleted}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[9px] font-mono text-[var(--skin-text-secondary)] tabular-nums">
                            <span
                              className={
                                role.progressToNextTier.hasGamesMet
                                  ? 'text-emerald-400'
                                  : 'text-[var(--skin-text-secondary)]'
                              }
                            >
                              {role.progressToNextTier.hasGamesMet ? '✓' : '•'} Игры: {role.gamesPlayed}/{role.nextTier.minGames}
                            </span>
                            <span
                              className={
                                role.progressToNextTier.hasWinRateMet
                                  ? 'text-emerald-400'
                                  : 'text-[var(--skin-text-secondary)]'
                              }
                            >
                              {role.progressToNextTier.hasWinRateMet ? '✓' : '•'} Винрейт: {role.winRate}% / {role.nextTier.minWinRate}%
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] font-bold text-rose-300 flex items-center justify-between bg-rose-950/40 p-2 rounded-xl border border-rose-800/40">
                          <span className="flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5 text-rose-400" />
                            <span>Достигнут высший ранг Грандмастера</span>
                          </span>
                          <span className="font-mono">100%</span>
                        </div>
                      )}

                      {isMaster && (
                        <div
                          className="pt-1 flex items-center gap-2"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            disabled={equippingRoleId === role.roleId}
                            onClick={() => handleEquipOrUnequipRoleBadge(role)}
                            style={
                              !isEquipped
                                ? {
                                    background: 'var(--skin-btn-primary-bg)',
                                    color: 'var(--skin-btn-primary-text)'
                                  }
                                : undefined
                            }
                            className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              isEquipped
                                ? 'bg-emerald-950/90 border border-emerald-600 text-emerald-300 hover:bg-rose-950/80 hover:border-rose-600 hover:text-rose-200'
                                : 'shadow-md hover:brightness-110'
                            }`}
                          >
                            {equippingRoleId === role.roleId ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isEquipped ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Титул активен (нажмите, чтобы снять)</span>
                              </>
                            ) : (
                              <>
                                <Crown className="w-3.5 h-3.5 text-amber-300" />
                                <span>Надеть титул «{role.masterBadgeTitleRu}»</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          BLOCK 4: MATCH HISTORY (ИСТОРИЯ МАТЧЕЙ С ПОДРОБНОСТЯМИ И ПАГИНАЦИЕЙ)
         ===================================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* 4.1. Filter & Controls Bar */}
          <section
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-card)'
            }}
            className="skin-card p-3.5 sm:p-4 rounded-2xl border space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[var(--skin-text-primary)] flex items-center gap-2">
                  <History className="w-4 h-4 text-[var(--skin-accent-primary)]" />
                  <span>История завершённых матчей ({filteredMatches.length})</span>
                </h3>
                <p className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                  Нажмите на любую запись матча, чтобы открыть подробную сводку и начисленный опыт
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  sounds.playTick();
                  fetchGameHistory();
                }}
                disabled={historyLoading}
                className="skin-btn-secondary flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                <RotateCw
                  className={`w-3.5 h-3.5 ${
                    historyLoading
                      ? 'animate-spin text-[var(--skin-accent-primary)]'
                      : 'text-[var(--skin-text-secondary)]'
                  }`}
                />
                <span>{historyLoading ? 'Обновление...' : 'Обновить'}</span>
              </button>
            </div>

            {historyError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{historyError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1 border-t border-[var(--skin-border-subtle)]">
              {/* Outcome Filter Buttons */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all' as const, label: 'Все' },
                  { id: 'won' as const, label: 'Победы' },
                  { id: 'lost' as const, label: 'Поражения' },
                  ...(drawsInHistory > 0 ? [{ id: 'draw' as const, label: 'Ничьи' }] : []),
                  { id: 'survived' as const, label: 'Выжил' }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      sounds.playTick();
                      setHistoryOutcomeFilter(f.id);
                    }}
                    style={
                      historyOutcomeFilter === f.id
                        ? {
                            background: 'var(--skin-btn-primary-bg)',
                            color: 'var(--skin-btn-primary-text)'
                          }
                        : {
                            backgroundColor: 'var(--skin-bg-subcard)',
                            borderColor: 'var(--skin-border-base)',
                            color: 'var(--skin-text-secondary)'
                          }
                    }
                    className="px-2.5 py-1 rounded-lg border text-xs font-bold transition-all whitespace-nowrap cursor-pointer"
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Role Select & Search Input */}
              <div className="flex items-center gap-2">
                <select
                  value={historyRoleFilter}
                  onChange={e => {
                    sounds.playTick();
                    setHistoryRoleFilter(e.target.value);
                  }}
                  className="skin-input border rounded-xl px-2.5 py-1.5 text-xs font-medium cursor-pointer"
                >
                  <option value="all">Все роли</option>
                  {Object.entries(ROLE_NAMES)
                    .filter(([k]) => k !== 'civilian')
                    .map(([roleKey, roleLabel]) => (
                      <option key={roleKey} value={roleKey}>
                        {roleLabel}
                      </option>
                    ))}
                </select>

                <div className="relative flex-1 sm:w-44">
                  <Search className="w-3.5 h-3.5 text-[var(--skin-text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={e => setHistorySearchQuery(e.target.value)}
                    placeholder="Поиск по роли..."
                    className="skin-input w-full border rounded-xl pl-8 pr-3 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 4.2. Compact Match Records List with Progressive Pagination */}
          {filteredMatches.length === 0 ? (
            <div
              style={{
                backgroundColor: 'var(--skin-bg-card)',
                borderColor: 'var(--skin-border-base)'
              }}
              className="skin-card p-8 rounded-2xl border border-dashed text-center space-y-2"
            >
              <History className="w-9 h-9 text-[var(--skin-text-muted)] mx-auto" />
              <div className="text-sm font-bold text-[var(--skin-text-primary)]">
                {matches.length === 0
                  ? 'История матчей пока пуста'
                  : 'Матчи по выбранным фильтрам не найдены'}
              </div>
              <p className="text-xs text-[var(--skin-text-secondary)] max-w-md mx-auto leading-relaxed">
                {matches.length === 0
                  ? 'После завершения вашей первой партии здесь появится запись с датой, вашей ролью, результатом, изменением Elo и полученным опытом.'
                  : 'Попробуйте сбросить установленные фильтры исхода или роли.'}
              </p>
              {matches.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    setHistoryOutcomeFilter('all');
                    setHistoryRoleFilter('all');
                    setHistorySearchQuery('');
                  }}
                  className="skin-btn-secondary px-4 py-1.5 rounded-xl border text-xs font-bold cursor-pointer mt-1"
                >
                  Сбросить фильтры
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleMatches.map(m => {
                const roleColor = ROLE_COLORS[m.role] || '#71717a';
                const icon = ROLE_ICONS[m.role] || '🎭';
                const roleDisplayName = m.roleName || ROLE_NAMES[m.role] || m.role;
                const teamLabel = TEAM_LABELS[m.team] || m.team;
                const dateStr = new Date(m.playedAt).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                const gameModeLabel = (m as any).gameMode
                  ? (m as any).gameMode === 'sport'
                    ? 'Спортивная мафия'
                    : 'Классическая мафия'
                  : null;

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      sounds.playTick();
                      setSelectedMatchDetail(m);
                    }}
                    style={{
                      backgroundColor: 'var(--skin-bg-card)'
                    }}
                    className={`w-full text-left p-3 sm:p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer group ${
                      m.isDraw
                        ? 'border-amber-800/50 hover:border-amber-500/70'
                        : m.won
                        ? 'border-emerald-800/50 hover:border-emerald-500/70'
                        : 'border-rose-900/50 hover:border-rose-500/70'
                    }`}
                  >
                    {/* Left: Role Icon + Outcome + Date & Meta */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border shadow-inner"
                        style={{
                          backgroundColor: `${roleColor}20`,
                          borderColor: `${roleColor}55`
                        }}
                      >
                        {icon}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-bold text-[var(--skin-text-primary)]">
                            {roleDisplayName}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--skin-text-muted)]">
                            ({teamLabel})
                          </span>

                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                              m.isDraw
                                ? 'bg-amber-950 border border-amber-700 text-amber-300'
                                : m.won
                                ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                                : 'bg-rose-950 border border-rose-700 text-rose-300'
                            }`}
                          >
                            {m.isDraw ? (
                              <AlertCircle className="w-3 h-3 text-amber-400" />
                            ) : m.won ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <XCircle className="w-3 h-3 text-rose-400" />
                            )}
                            <span>{m.isDraw ? 'НИЧЬЯ' : m.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</span>
                          </span>

                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                              m.survived
                                ? 'bg-blue-950/70 text-blue-300 border border-blue-800/60'
                                : 'bg-black/40 text-[var(--skin-text-muted)]'
                            }`}
                          >
                            {m.survived ? '✓ Выжил' : '✗ Убит'}
                          </span>
                        </div>

                        <div className="text-[11px] text-[var(--skin-text-secondary)] font-mono flex items-center gap-2 flex-wrap">
                          <span>{dateStr}</span>
                          {gameModeLabel && (
                            <>
                              <span>•</span>
                              <span>{gameModeLabel}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>
                            {Math.floor(m.survivalSeconds / 60)}м {m.survivalSeconds % 60}с ({m.roundsSurvived} раунд.)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Elo Delta, Credits, XP & Chevron */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right font-mono space-y-0.5">
                        <div
                          className={`text-xs font-black tabular-nums ${
                            m.isDraw
                              ? 'text-amber-400'
                              : m.won
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {m.ratingChange > 0 ? `+${m.ratingChange}` : m.ratingChange} Elo
                        </div>
                        <div className="flex items-center justify-end gap-2 text-[10px] font-bold tabular-nums">
                          <span className="text-amber-400">+{m.creditsEarned} кр</span>
                          {typeof m.xpEarned === 'number' && m.xpEarned > 0 && (
                            <span className="text-yellow-300">+{m.xpEarned} XP</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--skin-text-muted)] group-hover:text-[var(--skin-text-primary)] shrink-0 transition-colors" />
                    </div>
                  </button>
                );
              })}

              {/* Progressive Pagination Button */}
              {filteredMatches.length > visibleMatchesCount && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playTick();
                      setVisibleMatchesCount(prev => prev + HISTORY_PAGE_SIZE);
                    }}
                    className="skin-btn-secondary px-5 py-2 rounded-xl border text-xs font-bold cursor-pointer"
                  >
                    Показать ещё матчи ({filteredMatches.length - visibleMatchesCount} осталось)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          BLOCK 5: ACHIEVEMENTS & REWARDS (ДОСТИЖЕНИЯ И НАГРАДЫ)
         ===================================================================== */}
      {activeTab === 'achievements' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Standalone Achievements Notice with unified "В разработке" badge */}
          <section
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-card)'
            }}
            className="skin-card p-5 sm:p-6 rounded-2xl border space-y-3"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div
                  style={{
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: 'var(--skin-border-accent)',
                    color: 'var(--skin-accent-primary)'
                  }}
                  className="w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0"
                >
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-bold text-[var(--skin-text-primary)]">
                      Витрина личных достижений и медалей
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-600/60 text-amber-300 text-[10px] font-mono font-bold uppercase tracking-wider">
                      В разработке
                    </span>
                  </div>
                  <p className="text-xs text-[var(--skin-text-secondary)] mt-1 max-w-xl leading-relaxed">
                    Отдельная система коллекционных медалей и особых поручений Города находится в разработке. Уже сейчас в вашем профиле действуют две активные системы наград и званий:
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {/* Active System 1: Role Mastery Badges & Titles */}
              <button
                type="button"
                onClick={() => handleSelectTab('mastery')}
                style={{
                  backgroundColor: 'var(--skin-bg-subcard)',
                  borderColor: 'var(--skin-border-base)'
                }}
                className="p-4 rounded-xl border text-left flex items-center justify-between gap-3 hover:border-[var(--skin-border-accent)] transition-all cursor-pointer group"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs sm:text-sm font-bold text-[var(--skin-text-primary)] truncate">
                      Значки и титулы мастерства ролей
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--skin-text-secondary)]">
                    Открыто значков Мастера: <strong className="text-amber-300 font-mono">{masterySummary.masteredCount} из {allRolesMastery.length}</strong>
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--skin-text-muted)] group-hover:text-[var(--skin-text-primary)] shrink-0" />
              </button>

              {/* Active System 2: Level Ranks & Perks */}
              <button
                type="button"
                onClick={() => handleSelectTab('experience')}
                style={{
                  backgroundColor: 'var(--skin-bg-subcard)',
                  borderColor: 'var(--skin-border-base)'
                }}
                className="p-4 rounded-xl border text-left flex items-center justify-between gap-3 hover:border-[var(--skin-border-accent)] transition-all cursor-pointer group"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs sm:text-sm font-bold text-[var(--skin-text-primary)] truncate">
                      Ранги и звания шкалы опыта
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--skin-text-secondary)]">
                    Текущий ранг: <strong className="text-amber-300">Ур. {levelInfo.level} · {levelInfo.title}</strong>
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--skin-text-muted)] group-hover:text-[var(--skin-text-primary)] shrink-0" />
              </button>
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: DETAILED ROLE MASTERY & STATS MODAL (ПОДРОБНОСТИ РОЛИ)
         ===================================================================== */}
      {selectedRoleDetail && (
        <div
          style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
          className="fixed inset-0 z-60 flex items-center justify-center p-4 backdrop-blur-xs select-none animate-in fade-in duration-150"
          onClick={() => setSelectedRoleDetail(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--skin-bg-modal)',
              borderColor: 'var(--skin-border-card)',
              boxShadow: 'var(--skin-shadow-modal)'
            }}
            className="skin-modal w-full max-w-lg border rounded-3xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-black/60 border border-amber-500/50 flex items-center justify-center text-3xl shadow-inner shrink-0">
                  {selectedRoleDetail.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-[var(--skin-text-secondary)] uppercase font-mono">
                      {selectedRoleDetail.roleName}
                    </span>
                    <span className="px-2 py-0.2 rounded-full bg-amber-950 text-amber-300 border border-amber-600 text-[10px] font-bold">
                      {selectedRoleDetail.currentTier.icon} {selectedRoleDetail.currentTier.nameRu}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-[var(--skin-text-primary)] tracking-tight mt-0.5">
                    {selectedRoleDetail.masterBadgeTitleRu}
                  </h3>
                  <p className="text-xs text-amber-400 font-serif italic">
                    «{selectedRoleDetail.flairTitle}»
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRoleDetail(null)}
                className="skin-btn-secondary p-1.5 rounded-xl border transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="skin-subcard text-xs text-[var(--skin-text-secondary)] leading-relaxed p-3 rounded-2xl border">
              {selectedRoleDetail.description}
            </p>

            <div className="grid grid-cols-4 gap-2 text-center font-mono">
              <div className="skin-subcard p-2.5 rounded-2xl border">
                <div className="text-[9px] text-[var(--skin-text-secondary)] uppercase">Матчей</div>
                <div className="text-sm font-bold text-[var(--skin-text-primary)] mt-0.5 tabular-nums">
                  {selectedRoleDetail.gamesPlayed}
                </div>
              </div>
              <div className="skin-subcard p-2.5 rounded-2xl border">
                <div className="text-[9px] text-[var(--skin-text-secondary)] uppercase">Побед</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5 tabular-nums">
                  {selectedRoleDetail.gamesWon}
                </div>
              </div>
              <div className="skin-subcard p-2.5 rounded-2xl border">
                <div className="text-[9px] text-[var(--skin-text-secondary)] uppercase">Винрейт</div>
                <div className="text-sm font-bold text-amber-300 mt-0.5 tabular-nums">
                  {selectedRoleDetail.winRate}%
                </div>
              </div>
              <div className="skin-subcard p-2.5 rounded-2xl border">
                <div className="text-[9px] text-[var(--skin-text-secondary)] uppercase">Выжил</div>
                <div className="text-sm font-bold text-sky-400 mt-0.5 tabular-nums">
                  {selectedRoleDetail.survivedCount}
                </div>
              </div>
            </div>

            <div className="skin-subcard space-y-2 p-3.5 rounded-2xl border">
              <h4 className="text-xs font-bold text-[var(--skin-text-primary)] uppercase font-mono tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
                <span>Требования для ранга «Мастер» и титула</span>
              </h4>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-[var(--skin-text-secondary)]">
                    Сыграно партий на роли (минимум 8):
                  </span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      selectedRoleDetail.gamesPlayed >= 8 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {selectedRoleDetail.gamesPlayed} / 8{' '}
                    {selectedRoleDetail.gamesPlayed >= 8 ? '✓' : ''}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-[var(--skin-text-secondary)]">
                    Процент побед (минимум 65%):
                  </span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      selectedRoleDetail.winRate >= 65 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {selectedRoleDetail.winRate}% / 65%{' '}
                    {selectedRoleDetail.winRate >= 65 ? '✓' : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {selectedRoleDetail.isMasterOrAbove && (
                <button
                  type="button"
                  onClick={() => {
                    handleEquipOrUnequipRoleBadge(selectedRoleDetail);
                    setSelectedRoleDetail(null);
                  }}
                  style={{
                    background: 'var(--skin-btn-primary-bg)',
                    color: 'var(--skin-btn-primary-text)'
                  }}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs shadow-lg hover:brightness-110 transition-all cursor-pointer"
                >
                  {isRoleTitleEquipped(selectedRoleDetail)
                    ? 'Снять титул с профиля'
                    : `Надеть титул «${selectedRoleDetail.masterBadgeTitleRu}»`}
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedRoleDetail(null)}
                className="skin-btn-secondary flex-1 py-2.5 rounded-xl border font-bold text-xs transition-colors cursor-pointer"
              >
                Назад к ролям
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: MATCH DETAILS MODAL (ПОДРОБНОСТИ МАТЧА ИЗ ИСТОРИИ)
         ===================================================================== */}
      {selectedMatchDetail && (() => {
        const m = selectedMatchDetail;
        const roleColor = ROLE_COLORS[m.role] || '#71717a';
        const icon = ROLE_ICONS[m.role] || '🎭';
        const roleDisplayName = m.roleName || ROLE_NAMES[m.role] || m.role;
        const teamLabel = TEAM_LABELS[m.team] || m.team;
        const fullDateStr = new Date(m.playedAt).toLocaleString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        const gameModeLabel = (m as any).gameMode
          ? (m as any).gameMode === 'sport'
            ? 'Спортивная мафия'
            : 'Классическая мафия'
          : null;
        const breakdown = Array.isArray(m.xpBreakdown) ? m.xpBreakdown : [];

        return (
          <div
            style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
            className="fixed inset-0 z-60 flex items-center justify-center p-4 backdrop-blur-xs select-none animate-in fade-in duration-150"
            onClick={() => setSelectedMatchDetail(null)}
          >
            <div
              style={{
                backgroundColor: 'var(--skin-bg-modal)',
                borderColor: 'var(--skin-border-card)',
                boxShadow: 'var(--skin-shadow-modal)'
              }}
              className="skin-modal w-full max-w-md border rounded-3xl p-5 space-y-4 animate-in zoom-in-95 duration-150"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border shrink-0 shadow-inner"
                    style={{
                      backgroundColor: `${roleColor}20`,
                      borderColor: `${roleColor}55`
                    }}
                  >
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          m.isDraw
                            ? 'bg-amber-950 border border-amber-700 text-amber-300'
                            : m.won
                            ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                            : 'bg-rose-950 border border-rose-700 text-rose-300'
                        }`}
                      >
                        {m.isDraw ? 'НИЧЬЯ' : m.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--skin-text-muted)]">
                        {teamLabel}
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-[var(--skin-text-primary)] truncate mt-0.5">
                      Роль: {roleDisplayName}
                    </h4>
                    <div className="text-[11px] font-mono text-[var(--skin-text-secondary)]">
                      {fullDateStr}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedMatchDetail(null)}
                  className="skin-btn-secondary p-1.5 rounded-xl border cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Match Summary Stats */}
              <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
                <div className="skin-subcard p-3 rounded-xl border space-y-0.5">
                  <div className="text-[10px] text-[var(--skin-text-muted)] uppercase">
                    Статус к концу игры
                  </div>
                  <div
                    className={`font-bold ${
                      m.survived ? 'text-blue-300' : 'text-zinc-300'
                    }`}
                  >
                    {m.survived ? '✓ Выжил до конца' : '✗ Покинул стол / Убит'}
                  </div>
                </div>

                <div className="skin-subcard p-3 rounded-xl border space-y-0.5">
                  <div className="text-[10px] text-[var(--skin-text-muted)] uppercase">
                    Длительность / Раунды
                  </div>
                  <div className="font-bold text-[var(--skin-text-primary)] tabular-nums">
                    {Math.floor(m.survivalSeconds / 60)}м {m.survivalSeconds % 60}с ({m.roundsSurvived} раунд.)
                  </div>
                </div>

                <div className="skin-subcard p-3 rounded-xl border space-y-0.5">
                  <div className="text-[10px] text-[var(--skin-text-muted)] uppercase">
                    Изменение рейтинга
                  </div>
                  <div
                    className={`font-black tabular-nums ${
                      m.isDraw
                        ? 'text-amber-400'
                        : m.won
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {m.ratingChange > 0 ? `+${m.ratingChange}` : m.ratingChange} Elo
                  </div>
                </div>

                <div className="skin-subcard p-3 rounded-xl border space-y-0.5">
                  <div className="text-[10px] text-[var(--skin-text-muted)] uppercase">
                    Награда за партию
                  </div>
                  <div className="font-bold text-amber-400 tabular-nums flex items-center gap-2">
                    <span>+{m.creditsEarned} кр</span>
                    {typeof m.xpEarned === 'number' && (
                      <span className="text-yellow-300">· +{m.xpEarned} XP</span>
                    )}
                  </div>
                </div>
              </div>

              {gameModeLabel && (
                <div className="text-xs text-[var(--skin-text-secondary)] font-mono px-1">
                  Режим партии: <strong className="text-[var(--skin-text-primary)]">{gameModeLabel}</strong>
                </div>
              )}

              {/* XP Breakdown if recorded */}
              {breakdown.length > 0 && (
                <div className="skin-subcard p-3.5 rounded-2xl border space-y-2">
                  <div className="text-[11px] font-bold text-[var(--skin-text-primary)] uppercase font-mono flex items-center justify-between">
                    <span>Детализация полученного опыта (XP)</span>
                    {typeof m.xpEarned === 'number' && (
                      <span className="text-amber-400">Всего: +{m.xpEarned} XP</span>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {breakdown.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 text-xs py-1 border-b border-white/5 last:border-0"
                      >
                        <span className="text-[var(--skin-text-secondary)] truncate">
                          {item.reason}
                        </span>
                        <span className="font-mono font-bold text-amber-300 shrink-0 tabular-nums">
                          +{item.xp} XP
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedMatchDetail(null)}
                className="skin-btn-secondary w-full py-2.5 rounded-xl border font-bold text-xs transition-colors cursor-pointer"
              >
                Назад к истории матчей
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
