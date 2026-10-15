import React, { useState, useEffect } from 'react';
import { X, Gift, Sparkles, Check, Coins, Loader2, Zap, AlertCircle } from 'lucide-react';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';

interface DailyBonusDayConfig {
  day: number;
  credits: number;
  icon?: string;
  itemId?: string;
  itemName?: string;
  itemIcon?: string;
  isSpecial?: boolean;
  title?: string;
}

interface DailyBonusConfig {
  isEnabled: boolean;
  multiplier: number;
  bannerMessage: string;
  days: DailyBonusDayConfig[];
}

interface DailyBonusModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: AuthUser | null;
  onUpdateUser?: (u: AuthUser) => void;
  onOpenAuth?: () => void;
}

const DEFAULT_DAYS: DailyBonusDayConfig[] = [
  { day: 1, credits: 50, isSpecial: false },
  { day: 2, credits: 75, isSpecial: false },
  { day: 3, credits: 100, isSpecial: false },
  { day: 4, credits: 150, isSpecial: false },
  { day: 5, credits: 200, isSpecial: false },
  { day: 6, credits: 300, isSpecial: false },
  { day: 7, credits: 500, isSpecial: true, itemName: 'Сертификат смены ника', itemIcon: '📜' }
];

export const DailyBonusModal: React.FC<DailyBonusModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onOpenAuth
}) => {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [config, setConfig] = useState<DailyBonusConfig>({
    isEnabled: true,
    multiplier: 1.0,
    bannerMessage: 'Заходите каждый день и получайте золотые кредиты Города!',
    days: DEFAULT_DAYS
  });

  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/daily-bonus/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.config) {
          setConfig(data.config);
        }
      })
      .catch(() => {
        // Fallback to defaults
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const userCredits = user && typeof user.credits === 'number' ? user.credits : 250;
  
  // Check if claimed today
  const lastClaimDate = user?.lastDailyBonusClaim ? new Date(user.lastDailyBonusClaim).toDateString() : null;
  const today = new Date().toDateString();
  const claimedToday = lastClaimDate === today;

  // Determine current streak day (1 to 7)
  const currentStreak = typeof user?.dailyBonusStreak === 'number' && user.dailyBonusStreak > 0
    ? user.dailyBonusStreak
    : 1;

  // Active day to highlight
  // If claimed today, currentStreak is the day they just claimed.
  // If not claimed today, their next day is (currentStreak % 7) + 1 if previous claim was yesterday, or 1 if reset.
  let targetDay = currentStreak;
  if (!claimedToday && user?.lastDailyBonusClaim) {
    const lastClaim = new Date(user.lastDailyBonusClaim);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastClaim.toDateString() === yesterday.toDateString()) {
      targetDay = (currentStreak % 7) + 1;
    } else {
      targetDay = 1;
    }
  } else if (!user?.lastDailyBonusClaim) {
    targetDay = 1;
  }

  const multiplier = config.multiplier || 1.0;
  const dayRewards = config.days && config.days.length === 7 ? config.days : DEFAULT_DAYS;
  const targetDayReward = dayRewards.find(d => d.day === targetDay) || dayRewards[targetDay - 1] || dayRewards[0];
  const calculatedCredits = Math.round((targetDayReward.credits || 50) * multiplier);

  const handleClaim = async () => {
    if (!user) {
      if (onOpenAuth) {
        onClose();
        onOpenAuth();
      }
      return;
    }

    if (claimedToday || !config.isEnabled) return;

    setLoading(true);
    setFeedback(null);

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
      setFeedback(data.message || `Бонус +${data.reward || calculatedCredits} кредитов успешно получен!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось забрать бонус';
      setFeedback(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-2 bg-black/80 backdrop-blur-xs select-none overflow-x-hidden">
      <div className="w-full md:w-[65vw] h-full min-h-screen md:min-h-0 md:h-[98vh] bg-[#121319] border-0 md:border md:border-zinc-800 rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-850 bg-gradient-to-r from-[#171822] to-[#12131a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-700/60 flex items-center justify-center text-amber-400">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white uppercase tracking-wider">
                  Ежедневный бонус
                </h3>
                {multiplier > 1 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500 text-zinc-950 font-black text-[10px] font-mono tracking-tight flex items-center gap-0.5 animate-pulse">
                    <Zap className="w-3 h-3 fill-current" />
                    x{multiplier} АКЦИЯ
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                {config.bannerMessage || 'Заходите каждый день и получайте золотые кредиты Города'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          
          {/* Disabled Notice if turned off */}
          {!config.isEnabled && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>Выдача ежедневных бонусов временно приостановлена администрацией.</span>
            </div>
          )}

          {/* Balance & Multiplier display */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#181923] border border-zinc-800">
            <div>
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-mono">Ваш баланс:</span>
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-sm">
                <Coins className="w-4 h-4" />
                <span>{userCredits} кредитов</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-mono">Серия входов:</span>
              <span className="text-xs font-bold text-zinc-200">
                День {claimedToday ? currentStreak : targetDay} из 7
              </span>
            </div>
          </div>

          {feedback && (
            <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs font-semibold text-center animate-in fade-in">
              {feedback}
            </div>
          )}

          {/* 7 Days Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {dayRewards.map(d => {
              const isCurrent = d.day === targetDay;
              const isClaimed = claimedToday ? d.day <= currentStreak : d.day < targetDay;
              const finalAmount = Math.round(d.credits * multiplier);

              return (
                <div
                  key={d.day}
                  className={`p-2 rounded-xl border text-center flex flex-col items-center justify-between min-h-[96px] transition-all relative ${
                    isCurrent && !claimedToday
                      ? 'bg-amber-950/50 border-amber-500 shadow-md shadow-amber-950/50 ring-1 ring-amber-500 scale-105 z-10'
                      : isClaimed
                      ? 'bg-zinc-900/60 border-zinc-800 opacity-60'
                      : d.isSpecial
                      ? 'bg-[#1b1722] border-amber-800/80 text-amber-300'
                      : 'bg-[#151620] border-zinc-800/80 text-zinc-400'
                  }`}
                >
                  <span className="text-[10px] font-mono text-zinc-400 font-bold">
                    День {d.day}
                  </span>
                  
                  {d.itemIcon ? (
                    <span className="text-xl my-0.5" title={d.itemName || 'Специальный предмет'}>
                      {d.itemIcon}
                    </span>
                  ) : (
                    <Coins className={`w-5 h-5 my-0.5 ${d.isSpecial ? 'text-amber-300' : 'text-amber-500'}`} />
                  )}

                  <div className="text-center">
                    <span className="text-xs font-bold text-zinc-200 block leading-tight">
                      +{finalAmount}
                    </span>
                    {d.itemIcon && (
                      <span className="text-[9px] text-amber-400 font-mono block leading-none truncate max-w-[48px]">
                        +ЛУТ
                      </span>
                    )}
                  </div>

                  {isClaimed && (
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-950 border border-emerald-500 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action button */}
          <button
            onClick={handleClaim}
            disabled={claimedToday || loading || !config.isEnabled}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>
              {!config.isEnabled
                ? 'Бонус временно отключен'
                : claimedToday
                ? 'Награда на сегодня уже получена'
                : `Забрать +${calculatedCredits} кредитов (День ${targetDay})`}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};
