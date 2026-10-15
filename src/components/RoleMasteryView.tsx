import React, { useState, useMemo } from 'react';
import { AuthUser } from './AuthModal';
import { 
  ROLE_MASTERY_REGISTRY, 
  MASTERY_TIERS, 
  RoleMasteryInfo, 
  getUserAllRolesMastery, 
  getUserMasterySummary,
  MasteryTierConfig
} from '../data/mastery';
import { 
  Award, 
  Trophy, 
  Crown, 
  Flame, 
  Shield, 
  CheckCircle2, 
  Lock, 
  Sparkles, 
  TrendingUp, 
  ChevronRight, 
  HelpCircle, 
  X, 
  Info,
  Check,
  Star,
  Users,
  Target
} from 'lucide-react';
import { sounds } from '../utils/audio';

interface RoleMasteryViewProps {
  user: AuthUser;
  onUpdateUser?: (updated: AuthUser) => void;
}

export const RoleMasteryView: React.FC<RoleMasteryViewProps> = ({ user, onUpdateUser }) => {
  const [filter, setFilter] = useState<'all' | 'mastered' | 'progress' | 'locked'>('all');
  const [selectedRoleDetail, setSelectedRoleDetail] = useState<RoleMasteryInfo | null>(null);
  const [equippingRoleId, setEquippingRoleId] = useState<string | null>(null);
  const [equipFeedback, setEquipFeedback] = useState<string | null>(null);

  const summary = useMemo(() => getUserMasterySummary(user), [user]);
  const allMastery = useMemo(() => getUserAllRolesMastery(user), [user]);

  const filteredRoles = useMemo(() => {
    switch (filter) {
      case 'mastered':
        return allMastery.filter(r => r.isMasterOrAbove);
      case 'progress':
        return allMastery.filter(r => r.currentTier.id !== 'locked' && !r.isMasterOrAbove);
      case 'locked':
        return allMastery.filter(r => r.currentTier.id === 'locked');
      default:
        return allMastery;
    }
  }, [allMastery, filter]);

  // Handle equipping a Master Badge / Title to the profile
  const handleEquipBadge = async (role: RoleMasteryInfo) => {
    if (!role.isMasterOrAbove) return;

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
        body: JSON.stringify({
          roleId: role.roleId,
          badgeTitle: `${role.icon} ${role.masterBadgeTitleRu}`,
          flairTitle: role.flairTitle
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось применить значок');
      }

      sounds.playGunshot();
      if (onUpdateUser && data.user) {
        onUpdateUser(data.user);
      }
      setEquipFeedback(`Титул «${role.masterBadgeTitleRu}» успешно установлен в профиле!`);
      setTimeout(() => setEquipFeedback(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка применения титула';
      setEquipFeedback(msg);
      setTimeout(() => setEquipFeedback(null), 3000);
    } finally {
      setEquippingRoleId(null);
    }
  };

  const isEquippedTitle = (role: RoleMasteryInfo) => {
    const currentTitle = user.equippedCosmetics?.title;
    if (!currentTitle) return false;
    return currentTitle.includes(role.masterBadgeTitleRu) || currentTitle.includes(role.masterBadgeTitle) || currentTitle.includes(role.flairTitle);
  };

  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-200">
      
      {/* Toast Feedback */}
      {equipFeedback && (
        <div className="p-3 rounded-xl bg-amber-950/90 border border-amber-500/80 text-amber-200 text-xs font-bold flex items-center gap-2 shadow-lg animate-in slide-in-from-top-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{equipFeedback}</span>
        </div>
      )}

      {/* TOP SUMMARY HERO BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#1b1528] via-[#141624] to-[#12131c] border border-amber-600/40 p-5 sm:p-6 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-radial from-amber-600/10 via-transparent to-transparent pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          
          {/* Left: Mastery Level & Highlights */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-600/70 text-amber-300 font-mono text-[10px] font-bold tracking-wider uppercase flex items-center gap-1">
                <Crown className="w-3 h-3 text-amber-400" />
                <span>СИСТЕМА МАСТЕРСТВА РОЛЕЙ</span>
              </span>
              {summary.masteredCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-600/70 text-rose-300 font-mono text-[10px] font-bold">
                  {summary.masteredCount} {summary.masteredCount === 1 ? 'Значок' : 'Значка'} Мастера
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Зал Славы и Значки Мастерства</span>
            </h2>

            <p className="text-xs text-zinc-300 max-w-xl leading-relaxed">
              Побеждайте с высоким процентом побед на любимых ролях, чтобы открывать эксклюзивные значки 
              <strong className="text-amber-300 font-semibold"> «Master Sheriff»</strong>, 
              <strong className="text-rose-400 font-semibold"> «Master Mafia»</strong> и устанавливать их как активные титулы профиля.
            </p>
          </div>

          {/* Right: Quick Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 shrink-0">
            <div className="p-3 rounded-2xl bg-[#0e0f17]/90 border border-zinc-800 text-center space-y-0.5">
              <div className="text-[10px] uppercase font-mono text-zinc-400 font-bold">Открыто Мастеров</div>
              <div className="text-xl font-bold text-amber-400 flex items-center justify-center gap-1 font-mono">
                <Crown className="w-4 h-4 text-amber-400" />
                <span>{summary.masteredCount} / 8</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[#0e0f17]/90 border border-zinc-800 text-center space-y-0.5">
              <div className="text-[10px] uppercase font-mono text-zinc-400 font-bold">Очки Мастерства</div>
              <div className="text-xl font-bold text-sky-400 flex items-center justify-center gap-1 font-mono">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>{summary.totalMasteryPoints}</span>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3 rounded-2xl bg-[#0e0f17]/90 border border-zinc-800 text-center space-y-0.5">
              <div className="text-[10px] uppercase font-mono text-zinc-400 font-bold">Лучшая роль</div>
              <div className="text-xs font-bold text-emerald-400 truncate flex items-center justify-center gap-1 mt-1">
                <span>{summary.topRole.icon}</span>
                <span className="truncate">{summary.topRole.roleName}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* MASTERY TIERS PROGRESSION CRITERIA BAR */}
      <div className="p-4 rounded-2xl bg-[#13141f] border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span>Ранги и требования мастерства</span>
          </h4>
          <span className="text-[10px] text-zinc-400">Требуется минимум игр и высокий % побед</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
          {/* Novice */}
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-700/60 flex flex-col items-center gap-1">
            <span className="text-lg">🥉</span>
            <span className="font-bold text-slate-300 text-[11px]">Новичок</span>
            <span className="text-[10px] text-zinc-400 font-mono">1+ игра</span>
          </div>

          {/* Adept */}
          <div className="p-2.5 rounded-xl bg-sky-950/60 border border-sky-700/60 flex flex-col items-center gap-1">
            <span className="text-lg">🥈</span>
            <span className="font-bold text-sky-300 text-[11px]">Адепт</span>
            <span className="text-[10px] text-zinc-400 font-mono">≥3 игр · ≥45% побед</span>
          </div>

          {/* Expert */}
          <div className="p-2.5 rounded-xl bg-purple-950/60 border border-purple-700/60 flex flex-col items-center gap-1">
            <span className="text-lg">🥇</span>
            <span className="font-bold text-purple-300 text-[11px]">Эксперт</span>
            <span className="text-[10px] text-zinc-400 font-mono">≥5 игр · ≥55% побед</span>
          </div>

          {/* Master */}
          <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-500/80 ring-1 ring-amber-500/30 flex flex-col items-center gap-1 shadow-md shadow-amber-950/40">
            <span className="text-lg animate-bounce">👑</span>
            <span className="font-bold text-amber-300 text-[11px]">Мастер</span>
            <span className="text-[10px] text-amber-200/80 font-mono font-bold">≥8 игр · ≥65% побед</span>
          </div>

          {/* Grandmaster */}
          <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-gradient-to-r from-rose-950 via-purple-950 to-amber-950 border border-rose-500/80 ring-1 ring-rose-500/40 flex flex-col items-center gap-1 shadow-lg shadow-rose-950/50">
            <span className="text-lg animate-pulse">🔥</span>
            <span className="font-bold text-rose-300 text-[11px]">Грандмастер</span>
            <span className="text-[10px] text-rose-200/90 font-mono font-bold">≥15 игр · ≥75% побед</span>
          </div>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex items-center justify-between gap-2 flex-wrap border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => { setFilter('all'); sounds.playTick(); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filter === 'all'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-[#151622] text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            Все роли ({allMastery.length})
          </button>

          <button
            onClick={() => { setFilter('mastered'); sounds.playTick(); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
              filter === 'mastered'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-[#151622] text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>Полученные значки ({summary.masteredCount})</span>
          </button>

          <button
            onClick={() => { setFilter('progress'); sounds.playTick(); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filter === 'progress'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-[#151622] text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            В процессе ({allMastery.filter(r => r.currentTier.id !== 'locked' && !r.isMasterOrAbove).length})
          </button>

          <button
            onClick={() => { setFilter('locked'); sounds.playTick(); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filter === 'locked'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-[#151622] text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            Не начаты ({allMastery.filter(r => r.currentTier.id === 'locked').length})
          </button>
        </div>

        <span className="text-[11px] text-zinc-400 font-mono">
          Нажмите на карточку роли для подсказок
        </span>
      </div>

      {/* ROLE MASTERY CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredRoles.map(role => {
          const tier = role.currentTier;
          const isMaster = role.isMasterOrAbove;
          const isEquipped = isEquippedTitle(role);

          return (
            <div
              key={role.roleId}
              onClick={() => {
                setSelectedRoleDetail(role);
                sounds.playTick();
              }}
              className={`p-4 rounded-3xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between gap-3 group hover:scale-[1.01] ${
                isMaster 
                  ? `${tier.bgGradient} ${tier.borderColor} ring-1 ring-amber-500/40 shadow-xl ${tier.glowColor}` 
                  : tier.id !== 'locked' 
                  ? 'bg-[#13141f]/90 border-zinc-800 hover:border-zinc-700' 
                  : 'bg-[#0e0f16]/70 border-zinc-850 opacity-75 hover:opacity-100'
              }`}
            >
              {/* Top Row: Icon, Titles & Tier Badge */}
              <div className="flex items-start justify-between gap-3">
                
                <div className="flex items-center gap-3">
                  {/* Role Icon Emblazon */}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner border shrink-0 ${
                    isMaster 
                      ? 'bg-black/50 border-amber-400/60 ring-2 ring-amber-400/30' 
                      : 'bg-black/40 border-white/10'
                  }`}>
                    {role.icon}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white tracking-tight">
                        {role.roleName}
                      </span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                        role.team === 'mafia' 
                          ? 'bg-rose-950/80 border-rose-800 text-rose-300' 
                          : role.team === 'maniac' 
                          ? 'bg-purple-950/80 border-purple-800 text-purple-300' 
                          : 'bg-sky-950/80 border-sky-800 text-sky-300'
                      }`}>
                        {role.team === 'mafia' ? 'Синдикат' : role.team === 'maniac' ? 'Одиночка' : 'Мирные'}
                      </span>
                    </div>

                    <h3 className={`text-sm font-black tracking-tight mt-0.5 flex items-center gap-1 ${
                      isMaster ? 'text-amber-300 drop-shadow' : 'text-zinc-200'
                    }`}>
                      <span>{role.masterBadgeTitleRu}</span>
                      {isMaster && <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />}
                    </h3>
                    <p className="text-[10px] text-amber-400/80 font-serif italic">«{role.flairTitle}»</p>
                  </div>
                </div>

                {/* Tier Ribbon */}
                <div className={`px-2.5 py-1 rounded-xl border flex items-center gap-1 text-xs font-bold shrink-0 ${
                  isMaster 
                    ? 'bg-amber-950/90 border-amber-400 text-amber-300 shadow-md shadow-amber-950/50' 
                    : tier.id !== 'locked' 
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-300' 
                    : 'bg-black/40 border-zinc-800 text-zinc-500'
                }`}>
                  <span>{tier.icon}</span>
                  <span>{tier.nameRu}</span>
                </div>
              </div>

              {/* Middle Row: Win Rate Gauge & Stats */}
              <div className="grid grid-cols-3 gap-2 py-1 bg-black/30 rounded-2xl p-2.5 border border-white/5 font-mono text-center">
                <div>
                  <div className="text-[9px] text-zinc-400 uppercase">Партий</div>
                  <div className="text-xs font-bold text-white">{role.gamesPlayed}</div>
                </div>
                <div>
                  <div className="text-[9px] text-zinc-400 uppercase">Побед</div>
                  <div className="text-xs font-bold text-emerald-400">{role.gamesWon}</div>
                </div>
                <div>
                  <div className="text-[9px] text-zinc-400 uppercase">Винрейт</div>
                  <div className={`text-xs font-bold ${
                    role.winRate >= 65 ? 'text-amber-300' : role.winRate >= 50 ? 'text-emerald-400' : 'text-zinc-300'
                  }`}>
                    {role.winRate}%
                  </div>
                </div>
              </div>

              {/* Bottom Row: Next Tier Progress or Equip Action */}
              <div className="space-y-2">
                {role.nextTier ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>Следующий ранг: <strong className="text-zinc-200">{role.nextTier.nameRu}</strong></span>
                      <span className="font-mono">{role.progressToNextTier.percentCompleted}%</span>
                    </div>

                    <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className={`h-full transition-all duration-500 rounded-full ${
                          isMaster ? 'bg-gradient-to-r from-amber-500 to-rose-500' : 'bg-gradient-to-r from-sky-500 to-amber-500'
                        }`}
                        style={{ width: `${role.progressToNextTier.percentCompleted}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400">
                      <span className={role.progressToNextTier.hasGamesMet ? 'text-emerald-400' : 'text-zinc-400'}>
                        {role.progressToNextTier.hasGamesMet ? '✓' : '✗'} Игры: {role.gamesPlayed}/{role.nextTier.minGames}
                      </span>
                      <span className={role.progressToNextTier.hasWinRateMet ? 'text-emerald-400' : 'text-zinc-400'}>
                        {role.progressToNextTier.hasWinRateMet ? '✓' : '✗'} Победы: {role.winRate}% (нужно {role.nextTier.minWinRate}%)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] font-bold text-rose-300 flex items-center justify-between bg-rose-950/40 p-2 rounded-xl border border-rose-800/40">
                    <span className="flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-rose-400" />
                      <span>Максимальный ранг Грандмастера достигнут!</span>
                    </span>
                    <span className="font-mono">100%</span>
                  </div>
                )}

                {/* Equip Button if Master unlocked */}
                {isMaster && (
                  <div className="pt-1 flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={equippingRoleId === role.roleId}
                      onClick={() => handleEquipBadge(role)}
                      className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md ${
                        isEquipped
                          ? 'bg-emerald-950 border border-emerald-600 text-emerald-300 cursor-default'
                          : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-amber-950/50 cursor-pointer'
                      }`}
                    >
                      {isEquipped ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Надето как титул</span>
                        </>
                      ) : (
                        <>
                          <Crown className="w-3.5 h-3.5 text-amber-300" />
                          <span>Надеть значок «{role.masterBadgeTitleRu}»</span>
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

      {/* DETAILED ROLE MODAL */}
      {selectedRoleDetail && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none animate-in fade-in duration-150"
          onClick={() => setSelectedRoleDetail(null)}
        >
          <div 
            className="w-full max-w-lg bg-[#141520] border border-zinc-700 rounded-3xl p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-black/60 border border-amber-500/50 flex items-center justify-center text-3xl shadow-inner">
                  {selectedRoleDetail.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 uppercase font-mono">{selectedRoleDetail.roleName}</span>
                    <span className="px-2 py-0.2 rounded-full bg-amber-950 text-amber-300 border border-amber-600 text-[10px] font-bold">
                      {selectedRoleDetail.currentTier.nameRu}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {selectedRoleDetail.masterBadgeTitleRu}
                  </h3>
                  <p className="text-xs text-amber-400 font-serif italic">«{selectedRoleDetail.flairTitle}»</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedRoleDetail(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Description */}
            <p className="text-xs text-zinc-300 leading-relaxed bg-black/30 p-3 rounded-2xl border border-white/5">
              {selectedRoleDetail.description}
            </p>

            {/* Stats Breakdown */}
            <div className="grid grid-cols-4 gap-2 text-center font-mono">
              <div className="p-2.5 rounded-2xl bg-[#0c0d14] border border-zinc-800">
                <div className="text-[9px] text-zinc-400 uppercase">Игр</div>
                <div className="text-sm font-bold text-white mt-0.5">{selectedRoleDetail.gamesPlayed}</div>
              </div>
              <div className="p-2.5 rounded-2xl bg-[#0c0d14] border border-zinc-800">
                <div className="text-[9px] text-zinc-400 uppercase">Побед</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">{selectedRoleDetail.gamesWon}</div>
              </div>
              <div className="p-2.5 rounded-2xl bg-[#0c0d14] border border-zinc-800">
                <div className="text-[9px] text-zinc-400 uppercase">Винрейт</div>
                <div className="text-sm font-bold text-amber-300 mt-0.5">{selectedRoleDetail.winRate}%</div>
              </div>
              <div className="p-2.5 rounded-2xl bg-[#0c0d14] border border-zinc-800">
                <div className="text-[9px] text-zinc-400 uppercase">Выжил</div>
                <div className="text-sm font-bold text-sky-400 mt-0.5">{selectedRoleDetail.survivedCount} раз</div>
              </div>
            </div>

            {/* Criteria Checklist */}
            <div className="space-y-2 p-3.5 rounded-2xl bg-[#0d0e16] border border-zinc-800">
              <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-amber-400" />
                <span>Условия для звания «Мастер»</span>
              </h4>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-zinc-300">Сыграно партий на роли (мин. 8):</span>
                  <span className={`font-mono font-bold ${selectedRoleDetail.gamesPlayed >= 8 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {selectedRoleDetail.gamesPlayed} / 8 {selectedRoleDetail.gamesPlayed >= 8 ? '✓' : ''}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-zinc-300">Процент побед (мин. 65%):</span>
                  <span className={`font-mono font-bold ${selectedRoleDetail.winRate >= 65 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {selectedRoleDetail.winRate}% / 65% {selectedRoleDetail.winRate >= 65 ? '✓' : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {selectedRoleDetail.isMasterOrAbove && (
                <button
                  type="button"
                  onClick={() => {
                    handleEquipBadge(selectedRoleDetail);
                    setSelectedRoleDetail(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-lg shadow-amber-950/40"
                >
                  Надеть титул «{selectedRoleDetail.masterBadgeTitleRu}»
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedRoleDetail(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors"
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
