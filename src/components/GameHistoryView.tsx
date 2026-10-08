import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AuthUser, MatchRecord } from './AuthModal';
import { 
  Trophy, 
  Shield, 
  Skull, 
  Clock, 
  Flame, 
  RotateCw, 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  Award, 
  Crown, 
  Search, 
  Filter, 
  Sparkles, 
  HeartPulse, 
  Users, 
  History,
  AlertCircle,
  Coins,
  BarChart2
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { calculateSingleRoleMastery } from '../data/mastery';

interface GameHistoryViewProps {
  user: AuthUser;
}

interface RoleStatItem {
  role: string;
  roleName: string;
  icon: string;
  games: number;
  wins: number;
  winRate: number;
  survivedCount: number;
}

interface GameHistoryData {
  userId: string;
  displayName: string;
  matches: MatchRecord[];
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    rating: number;
    mafiaWins: number;
    civilianWins: number;
    averageSurvivalSeconds?: number;
    totalSurvivalSeconds?: number;
  };
  summary: {
    totalGames: number;
    wins: number;
    losses: number;
    winRate: number;
    mafiaWins: number;
    civilianWins: number;
    rating: number;
    averageSurvivalSeconds: number;
    favoriteRole: RoleStatItem;
    bestRole: RoleStatItem;
  };
  roleStats: RoleStatItem[];
}

const ROLE_COLORS: Record<string, string> = {
  citizen: '#94a3b8',
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
  mafia: '🕶️',
  don: '👑',
  sheriff: '⭐',
  doctor: '💉',
  courtesan: '💋',
  maniac: '🔪',
  bodyguard: '🛡️'
};

export const GameHistoryView: React.FC<GameHistoryViewProps> = ({ user }) => {
  const [data, setData] = useState<GameHistoryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterOutcome, setFilterOutcome] = useState<'all' | 'won' | 'lost' | 'survived'>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/user/game-history?userId=${user.id}`, { headers });
      if (!res.ok) {
        throw new Error('Не удалось загрузить историю игр с сервера.');
      }
      const json: GameHistoryData = await res.json();
      setData(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка соединения с сервером';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Fallback summary if backend is loading or unavailable
  const totalGames = data?.summary.totalGames ?? user.stats?.gamesPlayed ?? 0;
  const totalWins = data?.summary.wins ?? user.stats?.gamesWon ?? 0;
  const totalLosses = data?.summary.losses ?? Math.max(0, totalGames - totalWins);
  const winRate = data?.summary.winRate ?? (totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0);
  const matches = data?.matches ?? user.matchHistory ?? [];

  // Filtered matches
  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      if (filterOutcome === 'won' && !m.won) return false;
      if (filterOutcome === 'lost' && m.won) return false;
      if (filterOutcome === 'survived' && !m.survived) return false;
      if (filterRole !== 'all' && m.role !== filterRole) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const roleMatch = (m.roleName || '').toLowerCase().includes(q);
        const teamMatch = (m.team || '').toLowerCase().includes(q);
        if (!roleMatch && !teamMatch) return false;
      }
      return true;
    });
  }, [matches, filterOutcome, filterRole, searchQuery]);

  const favoriteRole = data?.summary.favoriteRole || {
    role: 'citizen',
    roleName: 'Мирный житель',
    icon: '👤',
    games: 0,
    wins: 0,
    winRate: 0,
    survivedCount: 0
  };

  const bestRole = data?.summary.bestRole || favoriteRole;
  const avgSecs = data?.summary.averageSurvivalSeconds || user.stats?.averageSurvivalSeconds || 180;
  const avgMins = Math.floor(avgSecs / 60);
  const avgRemSecs = avgSecs % 60;

  return (
    <div className="space-y-5 select-none animate-in fade-in duration-200">
      
      {/* Header Bar with Refresh Button */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-950/60 border border-orange-700/60 flex items-center justify-center text-orange-400">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              История игр и статистика матчей
            </h3>
            <p className="text-[11px] text-zinc-400">
              Сводка ваших побед, поражений и результативности по ролям
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            sounds.playTick();
            fetchHistory();
          }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#171822] hover:bg-[#202230] border border-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-50"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-400' : 'text-zinc-400'}`} />
          <span>{loading ? 'Загрузка...' : 'Обновить'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* EXECUTIVE SUMMARY KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: Matches & Win Rate */}
        <div className="p-3.5 rounded-2xl bg-[#14151f] border border-zinc-800 space-y-2 relative overflow-hidden shadow-inner">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-bold">Всего партий</span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-white">{totalGames}</span>
            <span className="text-xs font-mono font-bold text-emerald-400">({winRate}% винрейт)</span>
          </div>
          {/* Dual bar for Wins vs Losses */}
          <div className="w-full bg-zinc-850 h-2 rounded-full overflow-hidden flex">
            <div 
              style={{ width: `${winRate}%` }} 
              className="bg-emerald-500 h-full rounded-l-full transition-all duration-500" 
              title={`Побед: ${totalWins}`} 
            />
            <div 
              style={{ width: `${100 - winRate}%` }} 
              className="bg-rose-500/80 h-full rounded-r-full transition-all duration-500" 
              title={`Поражений: ${totalLosses}`} 
            />
          </div>
        </div>

        {/* Card 2: Wins vs Losses */}
        <div className="p-3.5 rounded-2xl bg-[#14151f] border border-zinc-800 space-y-1.5 shadow-inner">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-bold">Победы / Поражения</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center justify-between font-mono pt-0.5">
            <div>
              <span className="text-lg font-black text-emerald-400">{totalWins}</span>
              <span className="text-[10px] text-zinc-400 ml-1">побед</span>
            </div>
            <div className="text-zinc-600">/</div>
            <div>
              <span className="text-lg font-black text-rose-400">{totalLosses}</span>
              <span className="text-[10px] text-zinc-400 ml-1">поражений</span>
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500 pt-0.5 border-t border-zinc-850 font-mono">
            <span>Мирные: {data?.summary.civilianWins ?? user.stats?.civilianWins ?? 0}</span>
            <span>Мафия: {data?.summary.mafiaWins ?? user.stats?.mafiaWins ?? 0}</span>
          </div>
        </div>

        {/* Card 3: Favorite Role */}
        <div className="p-3.5 rounded-2xl bg-[#14151f] border border-zinc-800 space-y-1.5 shadow-inner">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-bold">Любимая роль</span>
            <Crown className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <div className="text-xl p-1.5 rounded-xl bg-amber-950/40 border border-amber-800/40">
              {favoriteRole.icon}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">
                {favoriteRole.roleName}
              </div>
              <div className="text-[10px] font-mono text-amber-400">
                {favoriteRole.games} игр · {favoriteRole.winRate}% побед
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Best Role / Survival */}
        <div className="p-3.5 rounded-2xl bg-[#14151f] border border-zinc-800 space-y-1.5 shadow-inner">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-bold">Среднее выживание</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-1.5 pt-0.5">
            <span className="text-xl font-black font-mono text-white">
              {avgMins}м {avgRemSecs}с
            </span>
          </div>
          <div className="text-[10px] text-zinc-400 font-mono truncate">
            Лучшая роль: {bestRole.icon} {bestRole.roleName} ({bestRole.winRate}%)
          </div>
        </div>
      </div>

      {/* ROLE MASTERY BREAKDOWN */}
      <div className="p-4 rounded-2xl bg-[#12131d] border border-zinc-800/80 space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Результативность по ролям
            </h4>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">
            Нажмите на роль для быстрой фильтрации
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {(data?.roleStats || [
            { role: 'citizen', roleName: 'Мирный житель', icon: '👤', games: 0, wins: 0, winRate: 0, survivedCount: 0 },
            { role: 'mafia', roleName: 'Мафия', icon: '🕶️', games: 0, wins: 0, winRate: 0, survivedCount: 0 },
            { role: 'don', roleName: 'Дон Мафии', icon: '👑', games: 0, wins: 0, winRate: 0, survivedCount: 0 },
            { role: 'sheriff', roleName: 'Шериф', icon: '⭐', games: 0, wins: 0, winRate: 0, survivedCount: 0 },
            { role: 'doctor', roleName: 'Доктор', icon: '💉', games: 0, wins: 0, winRate: 0, survivedCount: 0 },
            { role: 'courtesan', roleName: 'Красотка', icon: '💋', games: 0, wins: 0, winRate: 0, survivedCount: 0 },
            { role: 'maniac', roleName: 'Маньяк', icon: '🔪', games: 0, wins: 0, winRate: 0, survivedCount: 0 },
            { role: 'bodyguard', roleName: 'Телохранитель', icon: '🛡️', games: 0, wins: 0, winRate: 0, survivedCount: 0 }
          ]).map(rs => {
            const isSelected = filterRole === rs.role;
            const color = ROLE_COLORS[rs.role] || '#71717a';
            const mastery = calculateSingleRoleMastery(rs.role, {
              games: rs.games,
              wins: rs.wins,
              survivedCount: rs.survivedCount
            });

            return (
              <div
                key={rs.role}
                onClick={() => {
                  setFilterRole(isSelected ? 'all' : rs.role);
                  sounds.playTick();
                }}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-[#1e1f32] border-amber-500 shadow-md ring-1 ring-amber-500/50'
                    : mastery.isMasterOrAbove
                    ? 'bg-[#181525] border-amber-500/60 shadow-xs'
                    : 'bg-[#151622] border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-base">{rs.icon}</span>
                    <span className="text-xs font-bold text-white truncate">{rs.roleName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {mastery.currentTier.id !== 'locked' && (
                      <span className={`text-[9px] px-1 py-0.2 rounded font-mono font-bold ${
                        mastery.isMasterOrAbove ? 'bg-amber-950 text-amber-300 border border-amber-600/70' : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        {mastery.currentTier.icon} {mastery.currentTier.nameRu}
                      </span>
                    )}
                    <span className="text-[10px] font-mono font-bold" style={{ color }}>
                      {rs.winRate}%
                    </span>
                  </div>
                </div>

                <div className="w-full bg-zinc-850 h-1.5 rounded-full overflow-hidden mb-1">
                  <div
                    style={{ width: `${rs.winRate}%`, backgroundColor: color }}
                    className="h-full rounded-full transition-all duration-300"
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>Игр: <strong className="text-zinc-200">{rs.games}</strong></span>
                  <span>Побед: <strong className="text-emerald-400">{rs.wins}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MATCH HISTORY LOG SECTION */}
      <div className="space-y-3">
        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Outcome Filter Buttons */}
          <div className="flex items-center gap-1 bg-[#13141d] p-1 rounded-xl border border-zinc-850 overflow-x-auto">
            {[
              { id: 'all', label: 'Все матчи' },
              { id: 'won', label: '🏆 Победы' },
              { id: 'lost', label: '💀 Поражения' },
              { id: 'survived', label: '🛡️ Выжил' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => {
                  setFilterOutcome(f.id as any);
                  sounds.playTick();
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  filterOutcome === f.id
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search & Active Role Reset */}
          <div className="flex items-center gap-2">
            {filterRole !== 'all' && (
              <button
                onClick={() => setFilterRole('all')}
                className="px-2.5 py-1 rounded-xl bg-amber-950/60 border border-amber-700/60 text-amber-300 text-xs font-bold flex items-center gap-1"
              >
                <span>Роль: {ROLE_NAMES[filterRole] || filterRole}</span>
                <span className="text-zinc-400 hover:text-white">✕</span>
              </button>
            )}

            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Поиск по роли..."
                className="w-full bg-[#13141d] border border-zinc-800 rounded-xl pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>

        {/* Matches Feed */}
        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
          {filteredMatches.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-zinc-800 bg-[#101118] text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
                <History className="w-5 h-5" />
              </div>
              <h5 className="text-xs font-bold text-zinc-300">
                {matches.length === 0 ? 'История игр пока пуста' : 'Нет матчей по выбранным фильтрам'}
              </h5>
              <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                {matches.length === 0 
                  ? 'Сыграйте партию за любым столом или с ботами, и результат автоматически зафиксируется в вашем личном деле!'
                  : 'Попробуйте сбросить фильтры или изменить поисковый запрос.'}
              </p>
            </div>
          ) : (
            filteredMatches.map(m => {
              const roleColor = ROLE_COLORS[m.role] || '#71717a';
              const icon = ROLE_ICONS[m.role] || '🎭';
              const dateStr = new Date(m.playedAt).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={m.id}
                  className={`p-3 sm:p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    m.won 
                      ? 'bg-gradient-to-r from-emerald-950/20 to-[#12141a] border-emerald-900/50 hover:border-emerald-700/60 shadow-sm' 
                      : 'bg-gradient-to-r from-rose-950/20 to-[#12141a] border-rose-900/50 hover:border-rose-700/60 shadow-sm'
                  }`}
                >
                  {/* Left: Role Icon & Match Details */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border shadow-inner"
                      style={{ backgroundColor: `${roleColor}25`, borderColor: `${roleColor}60` }}
                    >
                      {icon}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white tracking-wide">{m.roleName}</span>
                        
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          m.won 
                            ? 'bg-emerald-950 border border-emerald-700 text-emerald-300' 
                            : 'bg-rose-950 border border-rose-700 text-rose-300'
                        }`}>
                          {m.won ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-rose-400" />}
                          <span>{m.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</span>
                        </span>

                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          m.survived ? 'bg-blue-950/70 text-blue-300 border border-blue-800/60' : 'bg-zinc-900 text-zinc-500'
                        }`}>
                          {m.survived ? '✓ Выжил' : '✗ Убит'}
                        </span>
                      </div>

                      <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-2 flex-wrap">
                        <span>{dateStr}</span>
                        <span>•</span>
                        <span>Время в игре: {Math.floor(m.survivalSeconds / 60)}м {m.survivalSeconds % 60}с ({m.roundsSurvived} раундов)</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Rewards & Rating Change */}
                  <div className="text-right shrink-0 font-mono space-y-0.5">
                    <div className={`text-xs font-black flex items-center justify-end gap-1 ${m.won ? 'text-emerald-400' : 'text-rose-400'}`}>
                      <span>{m.ratingChange > 0 ? `+${m.ratingChange}` : m.ratingChange}</span>
                      <span className="text-[10px] text-zinc-400">MMR</span>
                    </div>

                    <div className="text-[11px] font-bold text-amber-400 flex items-center justify-end gap-1">
                      <Coins className="w-3 h-3 text-amber-400" />
                      <span>+{m.creditsEarned} кр</span>
                    </div>

                    {typeof m.xpEarned === 'number' && m.xpEarned > 0 && (
                      <div className="text-[11px] font-bold text-yellow-300 flex items-center justify-end gap-1">
                        <Sparkles className="w-3 h-3 text-yellow-300" />
                        <span>+{m.xpEarned} XP</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
};
