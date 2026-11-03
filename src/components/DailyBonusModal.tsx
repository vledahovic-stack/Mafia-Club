import React, { useState, useEffect } from 'react';
import { X, Gift, Sparkles, Check, Coins, Loader2, Zap, AlertCircle } from 'lucide-react';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';
import {
  getClientProjectTimezone,
  isSameCalendarDayInTimezone,
  getCalendarDaysDiffInTimezone,
} from '../utils/timezone';

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
  const projectTz = getClientProjectTimezone();
  const now = new Date();

  // Check if claimed today in project timezone
  const claimedToday = user?.lastDailyBonusClaim
    ? isSameCalendarDayInTimezone(user.lastDailyBonusClaim, now, projectTz)
    : false;

  // Determine current streak day (1 to 7)
  const currentStreak = typeof user?.dailyBonusStreak === 'number' && user.dailyBonusStreak > 0
    ? user.dailyBonusStreak
    : 1;

  // Active day to highlight
  let targetDay = currentStreak;
  if (!claimedToday && user?.lastDailyBonusClaim) {
    const lastClaim = new Date(user.lastDailyBonusClaim);
    const diffCalendarDays = getCalendarDaysDiffInTimezone(now, lastClaim, projectTz);
    const diffHours = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
    if (diffCalendarDays <= 1 || diffHours <= 48) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs select-none overflow-x-hidden">
      <div className="w-full max-w-xl skin-modal bg-[var(--skin-bg-modal)] border border-[var(--skin-border-card)] rounded-2xl shadow-[var(--skin-shadow-modal)] overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--skin-border-base)] skin-header bg-[var(--skin-bg-header)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-700/60 flex items-center justify-center text-amber-400">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[var(--skin-text-primary)] uppercase tracking-wider">
                  Ежедневный бонус
                </h3>
                {multiplier > 1 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500 text-zinc-950 font-black text-[10px] font-mono tracking-tight flex items-center gap-0.5 animate-pulse">
                    <Zap className="w-3 h-3 fill-current" />
                    x{multiplier} АКЦИЯ
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--skin-text-muted)]">
                {config.bannerMessage || 'Заходите каждый день и получайте золотые кредиты Города'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-subcard)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto min-h-0 flex-1 text-[var(--skin-text-primary)]">
          
          {/* Disabled Notice if turned off */}
          {!config.isEnabled && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>Выдача ежедневных бонусов временно приостановлена администрацией.</span>
            </div>
          )}

          {/* Balance & Multiplier display */}
          <div className="flex items-center justify-between p-3.5 rounded-xl skin-subcard bg-[var(--skin-bg-card)] border border-[var(--skin-border-base)]">
            <div>
              <span className="text-[11px] text-[var(--skin-text-muted)] uppercase tracking-wider block font-mono">Ваш баланс:</span>
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-sm">
                <Coins className="w-4 h-4" />
                <span>{userCredits} кредитов</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-[var(--skin-text-muted)] uppercase tracking-wider block font-mono">Серия входов:</span>
              <span className="text-xs font-bold text-[var(--skin-text-primary)]">
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
                      ? 'bg-[var(--skin-bg-card)] border-[var(--skin-border-accent)] shadow-md ring-1 ring-[var(--skin-border-accent)] scale-105 z-10'
                      : isClaimed
                      ? 'bg-[var(--skin-bg-subcard)]/60 border-[var(--skin-border-base)] opacity-60'
                      : d.isSpecial
                      ? 'skin-subcard bg-[var(--skin-bg-card)] border border-[var(--skin-border-accent)] text-amber-300'
                      : 'skin-subcard bg-[var(--skin-bg-card)] border border-[var(--skin-border-base)] text-[var(--skin-text-secondary)]'
                  }`}
                >
                  <span className="text-[10px] font-mono text-[var(--skin-text-muted)] font-bold">
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
                    <span className="text-xs font-bold text-[var(--skin-text-primary)] block leading-tight">
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
            className="skin-btn-primary w-full py-3.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
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
