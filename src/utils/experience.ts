/**
 * Experience (XP) & Level Progression System for Mafia Online
 * 
 * Progression Formula:
 * Start of Level L requires: totalXp(L) = 25 * L^2 + 25 * L - 50
 * - Level 1: 0 XP
 * - Level 2: 100 XP (+100)
 * - Level 3: 250 XP (+150)
 * - Level 4: 450 XP (+200)
 * - Level 5: 700 XP (+250)
 * - Level 6: 1,000 XP (+300)
 * - Level 7: 1,350 XP (+350)
 * - Level 8: 1,750 XP (+400)
 * - Level 9: 2,200 XP (+450)
 * - Level 10: 2,700 XP (+500)
 * - Level 15: 5,950 XP
 * - Level 20: 10,450 XP
 */

export interface LevelInfo {
  level: number;
  title: string;
  badgeIcon: string;
  tier: 'rookie' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'legend';
  color: string;
  textColor: string;
  bgGradient: string;
  borderColor: string;
  glowColor: string;
  currentLevelXp: number; // XP threshold where this level begins
  nextLevelXp: number; // XP threshold to reach next level
  xpInCurrentLevel: number; // XP earned towards next level
  xpNeededForNextLevel: number; // Total XP required for this level bracket
  progressPercent: number; // 0 to 100%
  totalXp: number; // Lifetime total XP
  remainingXpToNextLevel: number;
}

export interface XpMilestone {
  level: number;
  title: string;
  badgeIcon: string;
  requiredXp: number;
  tier: 'rookie' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'legend';
  perkDescription: string;
}

// Calculate the total XP required to reach the start of a given level
export function getXpForLevelStart(level: number): number {
  if (level <= 1) return 0;
  return Math.round(25 * level * level + 25 * level - 50);
}

// Calculate the player's level from total lifetime XP
export function getLevelFromXp(xp: number): number {
  if (!xp || xp <= 0) return 1;
  // Invert 25*L^2 + 25*L - (50 + xp) = 0
  // L = (-25 + sqrt(625 - 4*25*(-50 - xp))) / 50
  // L = (-25 + sqrt(625 + 100*(50 + xp))) / 50
  const discriminant = 625 + 100 * (50 + xp);
  const calculatedLevel = Math.floor((-25 + Math.sqrt(discriminant)) / 50);
  return Math.max(1, calculatedLevel);
}

// Titles and config per level brackets
interface LevelTierConfig {
  title: string;
  badgeIcon: string;
  tier: 'rookie' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'legend';
  color: string;
  textColor: string;
  bgGradient: string;
  borderColor: string;
  glowColor: string;
}

const LEVEL_TIERS: Record<number, LevelTierConfig> = {
  1: {
    title: 'Новичок города',
    badgeIcon: '🔰',
    tier: 'rookie',
    color: '#9ca3af',
    textColor: 'text-zinc-300',
    bgGradient: 'from-zinc-800 to-zinc-900',
    borderColor: 'border-zinc-700',
    glowColor: 'shadow-zinc-900/50'
  },
  2: {
    title: 'Уличный наблюдатель',
    badgeIcon: '👀',
    tier: 'rookie',
    color: '#a1a1aa',
    textColor: 'text-zinc-200',
    bgGradient: 'from-zinc-750 to-zinc-850',
    borderColor: 'border-zinc-650',
    glowColor: 'shadow-zinc-800/50'
  },
  3: {
    title: 'Осведомитель',
    badgeIcon: '🗞️',
    tier: 'bronze',
    color: '#d97706',
    textColor: 'text-amber-400',
    bgGradient: 'from-amber-950/80 via-amber-900/60 to-zinc-900',
    borderColor: 'border-amber-700/70',
    glowColor: 'shadow-amber-950/50'
  },
  4: {
    title: 'Подозрительный свидетель',
    badgeIcon: '🔦',
    tier: 'bronze',
    color: '#f59e0b',
    textColor: 'text-amber-300',
    bgGradient: 'from-amber-950/90 via-orange-950/70 to-zinc-900',
    borderColor: 'border-amber-600/70',
    glowColor: 'shadow-amber-900/50'
  },
  5: {
    title: 'Следственный агент',
    badgeIcon: '🕵️',
    tier: 'silver',
    color: '#38bdf8',
    textColor: 'text-sky-300',
    bgGradient: 'from-sky-950/80 via-cyan-950/60 to-zinc-900',
    borderColor: 'border-sky-600/70',
    glowColor: 'shadow-sky-950/50'
  },
  6: {
    title: 'Опытный Детектив',
    badgeIcon: '🔍',
    tier: 'silver',
    color: '#0ea5e9',
    textColor: 'text-sky-400',
    bgGradient: 'from-sky-950/90 via-indigo-950/70 to-zinc-900',
    borderColor: 'border-sky-500/70',
    glowColor: 'shadow-sky-900/50'
  },
  7: {
    title: 'Уличный Гангстер',
    badgeIcon: '🚬',
    tier: 'silver',
    color: '#818cf8',
    textColor: 'text-indigo-300',
    bgGradient: 'from-indigo-950/80 via-violet-950/60 to-zinc-900',
    borderColor: 'border-indigo-600/70',
    glowColor: 'shadow-indigo-950/50'
  },
  8: {
    title: 'Боевик Синдиката',
    badgeIcon: '🔫',
    tier: 'gold',
    color: '#f97316',
    textColor: 'text-orange-400',
    bgGradient: 'from-orange-950/80 via-amber-950/60 to-zinc-900',
    borderColor: 'border-orange-600/70',
    glowColor: 'shadow-orange-950/50'
  },
  9: {
    title: 'Капореджиме',
    badgeIcon: '👔',
    tier: 'gold',
    color: '#eab308',
    textColor: 'text-yellow-400',
    bgGradient: 'from-amber-950/90 via-yellow-950/70 to-zinc-900',
    borderColor: 'border-yellow-600/70',
    glowColor: 'shadow-yellow-950/50'
  },
  10: {
    title: 'Инспектор Полиции',
    badgeIcon: '⚖️',
    tier: 'gold',
    color: '#10b981',
    textColor: 'text-emerald-300',
    bgGradient: 'from-emerald-950/90 via-teal-950/70 to-zinc-900',
    borderColor: 'border-emerald-600/70',
    glowColor: 'shadow-emerald-950/50'
  },
  11: {
    title: 'Консильери Семьи',
    badgeIcon: '📜',
    tier: 'platinum',
    color: '#c084fc',
    textColor: 'text-purple-300',
    bgGradient: 'from-purple-950/90 via-fuchsia-950/70 to-zinc-900',
    borderColor: 'border-purple-600/70',
    glowColor: 'shadow-purple-950/50'
  },
  12: {
    title: 'Комиссар Города',
    badgeIcon: '⭐',
    tier: 'platinum',
    color: '#a855f7',
    textColor: 'text-purple-400',
    bgGradient: 'from-purple-950/95 via-indigo-950/70 to-zinc-900',
    borderColor: 'border-purple-500/70',
    glowColor: 'shadow-purple-900/50'
  },
  13: {
    title: 'Младший Босс',
    badgeIcon: '🎩',
    tier: 'platinum',
    color: '#ec4899',
    textColor: 'text-pink-300',
    bgGradient: 'from-pink-950/90 via-rose-950/70 to-zinc-900',
    borderColor: 'border-pink-600/70',
    glowColor: 'shadow-pink-950/50'
  },
  14: {
    title: 'Серый Кардинал',
    badgeIcon: '🎭',
    tier: 'diamond',
    color: '#06b6d4',
    textColor: 'text-cyan-300',
    bgGradient: 'from-cyan-950/90 via-blue-950/70 to-zinc-900',
    borderColor: 'border-cyan-500/70',
    glowColor: 'shadow-cyan-950/50'
  },
  15: {
    title: 'Криминальный Барон',
    badgeIcon: '🗡️',
    tier: 'diamond',
    color: '#f43f5e',
    textColor: 'text-rose-400',
    bgGradient: 'from-rose-950/90 via-red-950/70 to-zinc-900',
    borderColor: 'border-rose-600/70',
    glowColor: 'shadow-rose-950/50'
  },
  16: {
    title: 'Шеф Полицейского Департамента',
    badgeIcon: '🛡️',
    tier: 'diamond',
    color: '#14b8a6',
    textColor: 'text-teal-300',
    bgGradient: 'from-teal-950/90 via-emerald-950/70 to-zinc-900',
    borderColor: 'border-teal-500/70',
    glowColor: 'shadow-teal-950/50'
  },
  17: {
    title: 'Теневой Владыка',
    badgeIcon: '🌑',
    tier: 'diamond',
    color: '#6366f1',
    textColor: 'text-indigo-300',
    bgGradient: 'from-indigo-950/90 via-purple-950/70 to-zinc-900',
    borderColor: 'border-indigo-500/70',
    glowColor: 'shadow-indigo-900/50'
  },
  18: {
    title: 'Глава Синдиката',
    badgeIcon: '💎',
    tier: 'legend',
    color: '#e11d48',
    textColor: 'text-rose-300',
    bgGradient: 'from-rose-950/95 via-amber-950/80 to-zinc-900',
    borderColor: 'border-rose-500/80',
    glowColor: 'shadow-rose-950/70'
  },
  19: {
    title: 'Крестный Отец',
    badgeIcon: '👑',
    tier: 'legend',
    color: '#f59e0b',
    textColor: 'text-amber-300',
    bgGradient: 'from-amber-950/95 via-yellow-900/80 to-zinc-900',
    borderColor: 'border-amber-400/80',
    glowColor: 'shadow-amber-950/80'
  },
  20: {
    title: 'Живая Легенда Города',
    badgeIcon: '🔥',
    tier: 'legend',
    color: '#fbbf24',
    textColor: 'text-yellow-200',
    bgGradient: 'from-yellow-950/95 via-red-950/80 to-zinc-900',
    borderColor: 'border-yellow-400',
    glowColor: 'shadow-yellow-950/90'
  }
};

export function getTierConfig(level: number): LevelTierConfig {
  if (level >= 20) return LEVEL_TIERS[20];
  return LEVEL_TIERS[level] || LEVEL_TIERS[1];
}

// Compute comprehensive level progression info for any XP value
export function calculateLevelInfo(rawXp: number | undefined | null): LevelInfo {
  const totalXp = Math.max(0, Math.floor(rawXp || 0));
  const level = getLevelFromXp(totalXp);
  const currentLevelXp = getXpForLevelStart(level);
  const nextLevelXp = getXpForLevelStart(level + 1);

  const xpNeededForNextLevel = Math.max(1, nextLevelXp - currentLevelXp);
  const xpInCurrentLevel = Math.max(0, totalXp - currentLevelXp);
  const remainingXpToNextLevel = Math.max(0, nextLevelXp - totalXp);

  const progressPercent = Math.min(100, Math.max(0, Math.round((xpInCurrentLevel / xpNeededForNextLevel) * 100)));
  const tierConfig = getTierConfig(level);

  return {
    level,
    title: tierConfig.title,
    badgeIcon: tierConfig.badgeIcon,
    tier: tierConfig.tier,
    color: tierConfig.color,
    textColor: tierConfig.textColor,
    bgGradient: tierConfig.bgGradient,
    borderColor: tierConfig.borderColor,
    glowColor: tierConfig.glowColor,
    currentLevelXp,
    nextLevelXp,
    xpInCurrentLevel,
    xpNeededForNextLevel,
    progressPercent,
    totalXp,
    remainingXpToNextLevel
  };
}

// XP Rewards Guide for In-Game Actions
export interface XpActionRule {
  id: string;
  name: string;
  category: 'game' | 'vote' | 'night' | 'defense';
  xp: number;
  icon: string;
  description: string;
}

export const XP_ACTION_RULES: XpActionRule[] = [
  {
    id: 'win',
    name: 'Победа в матче',
    category: 'game',
    xp: 120,
    icon: '🏆',
    description: 'Команда игрока одержала победу в партии'
  },
  {
    id: 'participation',
    name: 'Участие в игре',
    category: 'game',
    xp: 50,
    icon: '🎮',
    description: 'Завершение полной игровой сессии за столом'
  },
  {
    id: 'survival',
    name: 'Выживание до конца',
    category: 'game',
    xp: 40,
    icon: '❤️',
    description: 'Игрок остался живым к моменту окончания игры'
  },
  {
    id: 'day_survived',
    name: 'Пережитый день',
    category: 'defense',
    xp: 15,
    icon: '☀️',
    description: 'Каждый успешно пережитый дневной раунд'
  },
  {
    id: 'sheriff_found_mafia',
    name: 'Шериф: поимка мафии',
    category: 'night',
    xp: 45,
    icon: '🕵️',
    description: 'Шериф раскрыл члена мафии или Дона в ночной проверке'
  },
  {
    id: 'doctor_heal_saved',
    name: 'Доктор: спасение жизни',
    category: 'night',
    xp: 60,
    icon: '💉',
    description: 'Доктор исцелил цель, на которую было совершено ночное нападение'
  },
  {
    id: 'don_found_sheriff',
    name: 'Дон: вычисление шерифа',
    category: 'night',
    xp: 45,
    icon: '🕶️',
    description: 'Дон мафии успешно нашел настоящего Шерифа города'
  },
  {
    id: 'mafia_kill_success',
    name: 'Мафия: ночной отстрел',
    category: 'night',
    xp: 25,
    icon: '🔫',
    description: 'Координация и успешная ночная ликвидация соперника'
  },
  {
    id: 'courtesan_blocked',
    name: 'Красотка: блок роли',
    category: 'night',
    xp: 35,
    icon: '💋',
    description: 'Красотка нейтрализовала ночную способность ключевой роли'
  },
  {
    id: 'bodyguard_protected',
    name: 'Телохранитель: защита',
    category: 'night',
    xp: 60,
    icon: '🛡️',
    description: 'Телохранитель успешно прикрыл цель от гибели'
  },
  {
    id: 'accurate_vote_mafia',
    name: 'Точный голос против мафии',
    category: 'vote',
    xp: 30,
    icon: '⚖️',
    description: 'Голосование за игрока мафии/маньяка, которого признали виновным'
  },
  {
    id: 'successful_nomination',
    name: 'Успешное обвинение',
    category: 'vote',
    xp: 20,
    icon: '👉',
    description: 'Выдвижение кандидата, оказавшегося членом мафии'
  },
  {
    id: 'defense_survived',
    name: 'Оправдание на суде',
    category: 'defense',
    xp: 25,
    icon: '🗣️',
    description: 'Успешная защита своей невиновности при равенстве голосов'
  }
];

// Progression milestones roadmap for the profile progression tab
export const LEVEL_MILESTONES: XpMilestone[] = [
  { level: 1, title: 'Новичок города', badgeIcon: '🔰', requiredXp: 0, tier: 'rookie', perkDescription: 'Доступ ко всем открытым столам и базовым ролям' },
  { level: 2, title: 'Уличный наблюдатель', badgeIcon: '👀', requiredXp: 100, tier: 'rookie', perkDescription: 'Открытие подробной статистики по выживанию' },
  { level: 3, title: 'Осведомитель', badgeIcon: '🗞️', requiredXp: 250, tier: 'bronze', perkDescription: 'Бронзовая рамка аватара в чате стола' },
  { level: 4, title: 'Подозрительный свидетель', badgeIcon: '🔦', requiredXp: 450, tier: 'bronze', perkDescription: '+5% бонус к кредитам за победу' },
  { level: 5, title: 'Следственный агент', badgeIcon: '🕵️', requiredXp: 700, tier: 'silver', perkDescription: 'Серебряный бейдж в профиле игрока' },
  { level: 6, title: 'Опытный Детектив', badgeIcon: '🔍', requiredXp: 1000, tier: 'silver', perkDescription: 'Увеличенный шанс выбора роли с картами' },
  { level: 7, title: 'Уличный Гангстер', badgeIcon: '🚬', requiredXp: 1350, tier: 'silver', perkDescription: 'Уникальный титул «Гангстер» в синдикатах' },
  { level: 8, title: 'Боевик Синдиката', badgeIcon: '🔫', requiredXp: 1750, tier: 'gold', perkDescription: 'Золотой статус профиля и анимация прогресса' },
  { level: 9, title: 'Капореджиме', badgeIcon: '👔', requiredXp: 2200, tier: 'gold', perkDescription: 'Право создания закрытых турнирных столов' },
  { level: 10, title: 'Инспектор Полиции', badgeIcon: '⚖️', requiredXp: 2700, tier: 'gold', perkDescription: 'Эксклюзивная рубашка карт «Закон и Порядок»' },
  { level: 12, title: 'Комиссар Города', badgeIcon: '⭐', requiredXp: 3850, tier: 'platinum', perkDescription: 'Платиновый ореол на столе и особые эмодзи' },
  { level: 15, title: 'Криминальный Барон', badgeIcon: '🗡️', requiredXp: 5950, tier: 'diamond', perkDescription: 'Алмазный статус синдиката и лидерские перки' },
  { level: 19, title: 'Крестный Отец', badgeIcon: '👑', requiredXp: 9450, tier: 'legend', perkDescription: 'Королевская корона над ником во всех комнатах' },
  { level: 20, title: 'Живая Легенда Города', badgeIcon: '🔥', requiredXp: 10450, tier: 'legend', perkDescription: 'Абсолютный авторитет и максимальный статус почета' }
];
