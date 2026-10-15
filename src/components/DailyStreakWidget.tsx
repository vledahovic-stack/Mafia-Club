import React, { useState } from 'react';
import { 
  Flame, 
  Sparkles, 
  Check, 
  Coins, 
  Gift, 
  Crown, 
  Clock, 
  Zap, 
  Loader2,
  ArrowRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';
import { calculateDailyStreak, STREAK_DAYS_CONFIG } from '../utils/streak';

interface DailyStreakWidgetProps {
  user: AuthUser | null | undefined;
  onUpdateUser?: (updated: AuthUser) => void;
  onOpenBonusModal?: () => void;
  onOpenAuth?: () => void;
  variant?: 'lobby_card' | 'profile_full' | 'compact_badge' | 'header_pill';
  className?: string;
}

export const DailyStreakWidget: React.FC<DailyStreakWidgetProps> = ({
  user,
  onUpdateUser,
  onOpenBonusModal,
  onOpenAuth,
  variant = 'lobby_card',
  className = ''
}) => {
  const [loading, setLoading] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState<string | null>(null);

  const streakInfo = calculateDailyStreak(user);

  // Quick 1-click claim
  const handleQuickClaim = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }

    if (streakInfo.claimedToday) {
      if (onOpenBonusModal) onOpenBonusModal();
      return;
    }

    setLoading(true);
    setClaimFeedback(null);

    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/user/claim-daily-bonus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка получения бонуса');
      }

      sounds.playGunshot();
      if (onUpdateUser) {
        onUpdateUser(data.user);
      }
      setClaimFeedback(`🔥 +${data.reward} кр получено! Серия: ${data.streakDay} дн.`);
      setTimeout(() => setClaimFeedback(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось забрать бонус';
      setClaimFeedback(msg);
      setTimeout(() => setClaimFeedback(null), 4000);
    } finally {
      setLoading(false);
    }
  };

  // ================= 1. HEADER PILL VARIANT =================
  if (variant === 'header_pill') {
    if (!user) return null;

    return (
      <button
        onClick={() => {
          sounds.playTick();
          if (onOpenBonusModal) onOpenBonusModal();
        }}
        title={streakInfo.claimedToday ? `Серия активна: ${streakInfo.streak} дн.` : `Забрать награду дня (+${streakInfo.todayRewardCredits} кр)!`}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-all ${
          streakInfo.claimedToday
            ? 'bg-orange-950/40 border-orange-700/60 text-orange-300 hover:border-orange-500'
            : 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white animate-pulse shadow-md shadow-orange-950/50'
        } ${className}`}
      >
        <Flame className={`w-3.5 h-3.5 ${streakInfo.claimedToday ? 'text-amber-400' : 'text-yellow-200 fill-current'}`} />
        <span>{streakInfo.streak > 0 ? `${streakInfo.streak} дн.` : 'Бонус'}</span>
        {!streakInfo.claimedToday && (
          <span className="text-[10px] bg-black/40 px-1 rounded text-yellow-300">
            +{streakInfo.todayRewardCredits}
          </span>
        )}
      </button>
    );
  }

  // ================= 2. COMPACT BADGE VARIANT =================
  if (variant === 'compact_badge') {
    return (
      <div 
        onClick={() => {
          sounds.playTick();
          if (onOpenBonusModal) onOpenBonusModal();
        }}
        className={`cursor-pointer group flex items-center gap-2 p-2 rounded-xl border transition-all ${
          streakInfo.claimedToday
            ? 'bg-[#151620] border-zinc-800 hover:border-orange-600/70 text-zinc-300'
            : 'bg-gradient-to-r from-orange-950/60 to-amber-950/60 border-orange-500/80 text-white shadow-sm'
        } ${className}`}
      >
        <div className={`p-1.5 rounded-lg shrink-0 ${
          streakInfo.claimedToday 
            ? 'bg-zinc-850 text-orange-400' 
            : 'bg-orange-600 text-white animate-bounce'
        }`}>
          <Flame className="w-4 h-4 fill-current" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold font-mono">
            <span>Серия: {streakInfo.streak} {streakInfo.streak === 1 ? 'день' : streakInfo.streak < 5 ? 'дня' : 'дней'}</span>
            {!streakInfo.claimedToday && (
              <span className="px-1 rounded text-[9px] bg-amber-500 text-zinc-950 font-black">
                ГОТОВО
              </span>
            )}
          </div>
          <div className="text-[10px] text-zinc-400 truncate">
            {streakInfo.claimedToday ? `Завтра: День ${streakInfo.nextDay} (+${streakInfo.nextRewardCredits} кр)` : `Награда: +${streakInfo.todayRewardCredits} кр`}
          </div>
        </div>
      </div>
    );
  }

  // ================= 3. LOBBY CARD VARIANT (FOR SOCIAL HUB) =================
  if (variant === 'lobby_card') {
    return (
      <div className={`space-y-2.5 p-3.5 sm:p-4 rounded-xl bg-gradient-to-b from-[#161722] to-[#12131a] border border-zinc-800/90 relative overflow-hidden transition-all hover:border-zinc-700 shadow-md ${className}`}>
        
        {/* Ambient Top Glow */}
        <div className="absolute -top-10 -right-10 w-28 h-28 bg-orange-600/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-orange-950/80 border border-orange-600/60 text-orange-400 shrink-0">
              <Flame className="w-4 h-4 fill-current animate-pulse text-amber-400" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 font-mono block leading-none">
                ЕЖЕДНЕВНЫЙ СТРИК
              </span>
              <span className="text-[10px] text-zinc-400 font-mono mt-0.5 block">
                Бонусы за непрерывные входы
              </span>
            </div>
          </div>

          {/* Current streak indicator badge */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-950/60 border border-orange-600/70 text-orange-300 font-mono font-bold text-xs">
            <Flame className="w-3.5 h-3.5 fill-current text-orange-400" />
            <span>{streakInfo.streak > 0 ? `${streakInfo.streak} ДН.` : 'СТАРТ'}</span>
          </div>
        </div>

        {/* Feedback message banner if just claimed */}
        {claimFeedback && (
          <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-600/80 text-emerald-200 text-xs font-mono font-bold flex items-center justify-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{claimFeedback}</span>
          </div>
        )}

        {/* 7-Day Mini Progression Chain */}
        <div className="grid grid-cols-7 gap-1 pt-1 pb-1">
          {STREAK_DAYS_CONFIG.map((d) => {
            const isCompleted = streakInfo.claimedToday 
              ? d.day <= streakInfo.targetDay 
              : d.day < streakInfo.targetDay;
            const isCurrent = d.day === streakInfo.targetDay;
            const isSpecial = !!d.isSpecial;

            return (
              <div
                key={d.day}
                title={`${d.title}: +${d.credits} кр.${d.itemName ? ` + ${d.itemName}` : ''}`}
                className={`flex flex-col items-center justify-between p-1.5 rounded-lg border text-center transition-all ${
                  isCompleted
                    ? 'bg-amber-950/40 border-amber-600/70 text-amber-300'
                    : isCurrent
                    ? 'bg-gradient-to-b from-orange-950/80 to-amber-950/80 border-orange-500 shadow-sm shadow-orange-950/60 text-white ring-1 ring-orange-500/60'
                    : 'bg-[#151620] border-zinc-850 text-zinc-500'
                }`}
              >
                {/* Day label */}
                <span className={`text-[9px] font-mono leading-none ${
                  isCurrent ? 'font-black text-amber-300' : isCompleted ? 'text-amber-400 font-bold' : 'text-zinc-500'
                }`}>
                  Д{d.day}
                </span>

                {/* Day Icon / State */}
                <div className="my-1 text-sm">
                  {isCompleted ? (
                    <span className="w-4 h-4 rounded-full bg-emerald-600/80 text-white flex items-center justify-center text-[10px] font-bold mx-auto">
                      ✓
                    </span>
                  ) : (
                    <span>{d.icon}</span>
                  )}
                </div>

                {/* Coins reward */}
                <span className={`text-[9px] font-mono font-bold leading-none ${
                  isCurrent ? 'text-amber-300' : isCompleted ? 'text-amber-400/80' : 'text-zinc-500'
                }`}>
                  {d.credits}
                </span>
              </div>
            );
          })}
        </div>

        {/* Retention incentive highlight */}
        <div className="flex items-center justify-between text-[11px] px-1 text-zinc-400">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Бонус дня: <strong className="text-amber-300 font-mono">+{streakInfo.todayRewardCredits} кр</strong></span>
          </span>
          <span className="font-mono text-[10px] text-zinc-500">
            {streakInfo.daysToGrandPrize > 0 ? `До 👑: ${streakInfo.daysToGrandPrize} дн.` : 'ФИНАЛ: 👑 Дар Дона!'}
          </span>
        </div>

        {/* Action Button: Claim or Status */}
        <div className="pt-1">
          {streakInfo.canClaimToday ? (
            <button
              onClick={handleQuickClaim}
              disabled={loading}
              className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs tracking-wide transition-all shadow-md shadow-orange-950/50 flex items-center justify-center gap-2 cursor-pointer group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Получение награды...</span>
                </>
              ) : (
                <>
                  <Flame className="w-3.5 h-3.5 fill-current text-yellow-200 group-hover:scale-110 transition-transform" />
                  <span>Забрать бонус дня (+{streakInfo.todayRewardCredits} кр)</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => {
                sounds.playTick();
                if (onOpenBonusModal) onOpenBonusModal();
              }}
              className="w-full py-2 px-3 rounded-xl bg-[#181924] hover:bg-[#1e1f2d] border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-medium text-xs transition-colors flex items-center justify-between group cursor-pointer"
            >
              <span className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
                <Check className="w-3.5 h-3.5" />
                <span>Награда собрана</span>
              </span>
              <span className="text-[11px] font-mono text-zinc-400 group-hover:text-amber-300 flex items-center gap-1">
                <span>Завтра: +{streakInfo.nextRewardCredits} кр</span>
                <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          )}
        </div>

      </div>
    );
  }

  // ================= 4. PROFILE FULL VARIANT =================
  return (
    <div className={`p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#161724] to-[#12131c] border border-zinc-800 space-y-4 shadow-xl ${className}`}>
      
      {/* Top Section */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-600 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-orange-950/50 border border-orange-400/40 shrink-0">
            <Flame className="w-6 h-6 fill-current text-yellow-200 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase">
                Ежедневный Стрик входов
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-orange-950/80 border border-orange-600 text-orange-300 font-mono font-bold text-xs flex items-center gap-1">
                <Flame className="w-3 h-3 fill-current text-amber-400" />
                <span>{streakInfo.streak} {streakInfo.streak === 1 ? 'ДЕНЬ' : streakInfo.streak < 5 ? 'ДНЯ' : 'ДНЕЙ'} ПОДРЯД</span>
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Непрерывный ежедневный вход повышает награду с 50 до 500 кредитов (+900%) и гарантирует ценный трофей
            </p>
          </div>
        </div>

        {/* Claim / Status Action Button */}
        <div>
          {streakInfo.canClaimToday ? (
            <button
              onClick={handleQuickClaim}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs tracking-wide shadow-md shadow-orange-950/60 transition-all flex items-center gap-2 cursor-pointer group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Начисление...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 fill-current text-yellow-200 group-hover:scale-110" />
                  <span>Забрать День {streakInfo.targetDay} (+{streakInfo.todayRewardCredits} кр)</span>
                </>
              )}
            </button>
          ) : (
            <div className="px-3.5 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-700/70 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>СЕГОДНЯ ЗАБРАНО</span>
            </div>
          )}
        </div>
      </div>

      {/* Claim Feedback Banner */}
      {claimFeedback && (
        <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-xs font-mono font-bold text-center animate-in fade-in">
          {claimFeedback}
        </div>
      )}

      {/* 7-Day Visual Progression Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {STREAK_DAYS_CONFIG.map((d) => {
          const isCompleted = streakInfo.claimedToday 
            ? d.day <= streakInfo.targetDay 
            : d.day < streakInfo.targetDay;
          const isCurrent = d.day === streakInfo.targetDay;
          const isSpecial = !!d.isSpecial;

          return (
            <div
              key={d.day}
              className={`p-3 rounded-xl border flex flex-col justify-between text-center transition-all ${
                isCompleted
                  ? 'bg-amber-950/30 border-amber-600/70 text-amber-200 shadow-sm'
                  : isCurrent
                  ? 'bg-gradient-to-b from-orange-950/80 to-amber-950/80 border-orange-500 shadow-lg shadow-orange-950/50 text-white ring-2 ring-orange-500/70'
                  : 'bg-[#151622] border-zinc-800 text-zinc-400'
              }`}
            >
              {/* Day header & badge */}
              <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                <span className={isCurrent ? 'text-amber-300' : isCompleted ? 'text-amber-400' : 'text-zinc-500'}>
                  ДЕНЬ {d.day}
                </span>
                {isCompleted ? (
                  <span className="text-emerald-400 font-bold">✓</span>
                ) : isCurrent ? (
                  <span className="text-yellow-300 animate-pulse">★</span>
                ) : (
                  <span className="text-zinc-600">🔒</span>
                )}
              </div>

              {/* Icon */}
              <div className="my-2 text-2xl filter drop-shadow-md">
                {d.icon}
              </div>

              {/* Reward & Bonus percent */}
              <div className="space-y-0.5">
                <div className={`text-xs font-mono font-bold ${
                  isCurrent ? 'text-amber-300' : isCompleted ? 'text-amber-400' : 'text-zinc-300'
                }`}>
                  +{d.credits} кр
                </div>
                {d.bonusPercent > 0 && (
                  <div className="text-[9px] font-mono text-orange-400 font-semibold">
                    +{d.bonusPercent}%
                  </div>
                )}
                {d.itemName && (
                  <div className="text-[9px] text-purple-300 truncate font-semibold mt-1">
                    📜 Сертификат
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Retention Incentive Stats */}
      <div className="p-3 rounded-xl bg-[#141520] border border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-zinc-300">
          <Crown className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Главный приз 7-го дня: <strong className="text-amber-300 font-mono">500 кр.</strong> + <strong className="text-purple-300">Сертификат смены никнейма</strong>
          </span>
        </div>

        {onOpenBonusModal && (
          <button
            onClick={() => {
              sounds.playTick();
              onOpenBonusModal();
            }}
            className="text-amber-400 hover:text-amber-300 font-mono font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>Подробнее о бонусе</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

    </div>
  );
};
