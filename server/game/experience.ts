/**
 * Server-side Experience & Level System
 */

export interface LevelInfo {
  level: number;
  title: string;
  badgeIcon: string;
  currentLevelXp: number;
  nextLevelXp: number;
  xpInCurrentLevel: number;
  xpNeededForNextLevel: number;
  progressPercent: number;
  totalXp: number;
  remainingXpToNextLevel: number;
}

export function getXpForLevelStart(level: number): number {
  if (level <= 1) return 0;
  return Math.round(25 * level * level + 25 * level - 50);
}

export function getLevelFromXp(xp: number): number {
  if (!xp || xp <= 0) return 1;
  const discriminant = 625 + 100 * (50 + xp);
  const calculatedLevel = Math.floor((-25 + Math.sqrt(discriminant)) / 50);
  return Math.max(1, calculatedLevel);
}

const LEVEL_TITLES: Record<number, { title: string; icon: string }> = {
  1: { title: 'Новичок города', icon: '🔰' },
  2: { title: 'Уличный наблюдатель', icon: '👀' },
  3: { title: 'Осведомитель', icon: '🗞️' },
  4: { title: 'Подозрительный свидетель', icon: '🔦' },
  5: { title: 'Следственный агент', icon: '🕵️' },
  6: { title: 'Опытный Детектив', icon: '🔍' },
  7: { title: 'Уличный Гангстер', icon: '🚬' },
  8: { title: 'Боевик Синдиката', icon: '🔫' },
  9: { title: 'Капореджиме', icon: '👔' },
  10: { title: 'Инспектор Полиции', icon: '⚖️' },
  11: { title: 'Консильери Семьи', icon: '📜' },
  12: { title: 'Комиссар Города', icon: '⭐' },
  13: { title: 'Младший Босс', icon: '🎩' },
  14: { title: 'Серый Кардинал', icon: '🎭' },
  15: { title: 'Криминальный Барон', icon: '🗡️' },
  16: { title: 'Шеф Полицейского Департамента', icon: '🛡️' },
  17: { title: 'Теневой Владыка', icon: '🌑' },
  18: { title: 'Глава Синдиката', icon: '💎' },
  19: { title: 'Крестный Отец', icon: '👑' },
  20: { title: 'Живая Легенда Города', icon: '🔥' }
};

export function getLevelTitle(level: number): { title: string; icon: string } {
  if (level >= 20) return LEVEL_TITLES[20];
  return LEVEL_TITLES[level] || LEVEL_TITLES[1];
}

export function calculateServerLevelInfo(rawXp: number | undefined | null): LevelInfo {
  const totalXp = Math.max(0, Math.floor(rawXp || 0));
  const level = getLevelFromXp(totalXp);
  const currentLevelXp = getXpForLevelStart(level);
  const nextLevelXp = getXpForLevelStart(level + 1);

  const xpNeededForNextLevel = Math.max(1, nextLevelXp - currentLevelXp);
  const xpInCurrentLevel = Math.max(0, totalXp - currentLevelXp);
  const remainingXpToNextLevel = Math.max(0, nextLevelXp - totalXp);

  const progressPercent = Math.min(100, Math.max(0, Math.round((xpInCurrentLevel / xpNeededForNextLevel) * 100)));
  const meta = getLevelTitle(level);

  return {
    level,
    title: meta.title,
    badgeIcon: meta.icon,
    currentLevelXp,
    nextLevelXp,
    xpInCurrentLevel,
    xpNeededForNextLevel,
    progressPercent,
    totalXp,
    remainingXpToNextLevel
  };
}
