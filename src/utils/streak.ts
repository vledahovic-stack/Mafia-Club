import { AuthUser } from '../components/AuthModal';

export interface DayReward {
  day: number;
  credits: number;
  icon: string;
  title: string;
  isSpecial?: boolean;
  itemName?: string;
  itemIcon?: string;
  bonusPercent: number; // Percentage increase compared to Day 1
}

export const STREAK_DAYS_CONFIG: DayReward[] = [
  { day: 1, credits: 50, icon: '🪙', title: 'День 1', bonusPercent: 0 },
  { day: 2, credits: 75, icon: '🪙', title: 'День 2', bonusPercent: 50 },
  { day: 3, credits: 100, icon: '💰', title: 'День 3', bonusPercent: 100 },
  { day: 4, credits: 150, icon: '💰', title: 'День 4', bonusPercent: 200 },
  { day: 5, credits: 200, icon: '💎', title: 'День 5', bonusPercent: 300 },
  { day: 6, credits: 300, icon: '💎', title: 'День 6', bonusPercent: 500 },
  { 
    day: 7, 
    credits: 500, 
    icon: '👑', 
    title: 'День 7', 
    isSpecial: true, 
    itemName: 'Сертификат смены никнейма',
    itemIcon: '📜',
    bonusPercent: 900 
  }
];

export interface DailyStreakState {
  streak: number; // 1 to 7
  claimedToday: boolean;
  canClaimToday: boolean;
  targetDay: number; // Day to claim today (1 to 7)
  nextDay: number; // Day to claim tomorrow
  todayRewardCredits: number;
  nextRewardCredits: number;
  streakBonusPercent: number;
  daysToGrandPrize: number;
  isGrandPrizeToday: boolean;
}

export function calculateDailyStreak(user: AuthUser | null | undefined, multiplier: number = 1.0): DailyStreakState {
  if (!user) {
    const defaultReward = Math.round(50 * multiplier);
    return {
      streak: 0,
      claimedToday: false,
      canClaimToday: false,
      targetDay: 1,
      nextDay: 2,
      todayRewardCredits: defaultReward,
      nextRewardCredits: Math.round(75 * multiplier),
      streakBonusPercent: 0,
      daysToGrandPrize: 6,
      isGrandPrizeToday: false
    };
  }

  const now = new Date();
  const todayStr = now.toDateString();
  const lastClaimDateStr = user.lastDailyBonusClaim ? new Date(user.lastDailyBonusClaim).toDateString() : null;
  const claimedToday = lastClaimDateStr === todayStr;

  const userStreak = typeof user.dailyBonusStreak === 'number' && user.dailyBonusStreak > 0 
    ? user.dailyBonusStreak 
    : 0;

  let targetDay = 1;
  let activeStreak = userStreak;

  if (claimedToday) {
    activeStreak = userStreak > 0 ? userStreak : 1;
    targetDay = activeStreak;
  } else if (user.lastDailyBonusClaim) {
    const lastClaim = new Date(user.lastDailyBonusClaim);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const diffDays = Math.floor((now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60 * 24));
    
    // If claimed yesterday, current target is next streak day
    if (lastClaim.toDateString() === yesterday.toDateString() || diffDays <= 1) {
      targetDay = (userStreak % 7) + 1;
      activeStreak = userStreak;
    } else {
      // Streak lapsed
      targetDay = 1;
      activeStreak = 0;
    }
  } else {
    // Brand new user
    targetDay = 1;
    activeStreak = 0;
  }

  const nextDay = (targetDay % 7) + 1;
  const targetConfig = STREAK_DAYS_CONFIG.find(d => d.day === targetDay) || STREAK_DAYS_CONFIG[0];
  const nextConfig = STREAK_DAYS_CONFIG.find(d => d.day === nextDay) || STREAK_DAYS_CONFIG[1];

  const todayRewardCredits = Math.round(targetConfig.credits * multiplier);
  const nextRewardCredits = Math.round(nextConfig.credits * multiplier);

  const daysToGrandPrize = Math.max(0, 7 - targetDay);
  const isGrandPrizeToday = targetDay === 7;

  return {
    streak: claimedToday ? activeStreak : (activeStreak > 0 ? activeStreak : 0),
    claimedToday,
    canClaimToday: !claimedToday,
    targetDay,
    nextDay,
    todayRewardCredits,
    nextRewardCredits,
    streakBonusPercent: targetConfig.bonusPercent,
    daysToGrandPrize,
    isGrandPrizeToday
  };
}
