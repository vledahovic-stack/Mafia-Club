/**
 * Experience (XP) & Level Progression System for Mafia Online
 * Supports dynamic configuration from admin panel and server
 */

export type TierType = 'rookie' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'legend';

export interface LevelInfo {
  level: number;
  title: string;
  badgeIcon: string;
  tier: TierType;
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
  tier: TierType;
  perkDescription: string;
  color?: string;
  textColor?: string;
  bgGradient?: string;
  borderColor?: string;
  glowColor?: string;
}

export interface XpActionRule {
  id: string;
  name: string;
  category: 'game' | 'vote' | 'night' | 'defense' | 'custom';
  xp: number;
  icon: string;
  description: string;
  isCustom?: boolean;
}

export interface ExperienceConfig {
  id: string;
  isEnabled: boolean;
  globalMultiplier: number;
  maxLevel: number;
  actionRules: XpActionRule[];
  levelMilestones: XpMilestone[];
  updatedAt: string;
}

export const TIER_STYLE_PRESETS: Record<TierType, {
  label: string;
  color: string;
  textColor: string;
  bgGradient: string;
  borderColor: string;
  glowColor: string;
  badgeBg: string;
}> = {
  rookie: {
    label: 'Новичок',
    color: '#9ca3af',
    textColor: 'text-zinc-300',
    bgGradient: 'from-zinc-800 to-zinc-900',
    borderColor: 'border-zinc-700',
    glowColor: 'shadow-zinc-900/50',
    badgeBg: 'bg-zinc-850 border-zinc-700 text-zinc-300'
  },
  bronze: {
    label: 'Бронза',
    color: '#d97706',
    textColor: 'text-amber-400',
    bgGradient: 'from-amber-950/80 via-amber-900/60 to-zinc-900',
    borderColor: 'border-amber-700/70',
    glowColor: 'shadow-amber-950/50',
    badgeBg: 'bg-amber-950/80 border-amber-700 text-amber-300'
  },
  silver: {
    label: 'Серебро',
    color: '#38bdf8',
    textColor: 'text-sky-300',
    bgGradient: 'from-sky-950/80 via-cyan-950/60 to-zinc-900',
    borderColor: 'border-sky-600/70',
    glowColor: 'shadow-sky-950/50',
    badgeBg: 'bg-sky-950/80 border-sky-700 text-sky-300'
  },
  gold: {
    label: 'Золото',
    color: '#f59e0b',
    textColor: 'text-yellow-400',
    bgGradient: 'from-amber-950/90 via-yellow-950/70 to-zinc-900',
    borderColor: 'border-yellow-600/70',
    glowColor: 'shadow-yellow-950/50',
    badgeBg: 'bg-yellow-950/80 border-yellow-600 text-yellow-300'
  },
  platinum: {
    label: 'Платина',
    color: '#c084fc',
    textColor: 'text-purple-300',
    bgGradient: 'from-purple-950/90 via-fuchsia-950/70 to-zinc-900',
    borderColor: 'border-purple-600/70',
    glowColor: 'shadow-purple-950/50',
    badgeBg: 'bg-purple-950/80 border-purple-600 text-purple-300'
  },
  diamond: {
    label: 'Алмаз',
    color: '#06b6d4',
    textColor: 'text-cyan-300',
    bgGradient: 'from-cyan-950/90 via-blue-950/70 to-zinc-900',
    borderColor: 'border-cyan-500/70',
    glowColor: 'shadow-cyan-950/50',
    badgeBg: 'bg-cyan-950/80 border-cyan-600 text-cyan-300'
  },
  legend: {
    label: 'Легенда',
    color: '#fbbf24',
    textColor: 'text-yellow-200',
    bgGradient: 'from-yellow-950/95 via-red-950/80 to-zinc-900',
    borderColor: 'border-yellow-400',
    glowColor: 'shadow-yellow-950/90',
    badgeBg: 'bg-amber-900/90 border-amber-400 text-amber-200'
  }
};

export const DEFAULT_XP_ACTION_RULES: XpActionRule[] = [
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

export const DEFAULT_LEVEL_MILESTONES: XpMilestone[] = [
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
  { level: 11, title: 'Консильери Семьи', badgeIcon: '📜', requiredXp: 3250, tier: 'platinum', perkDescription: 'Личный титул «Советник» и значок в лобби' },
  { level: 12, title: 'Комиссар Города', badgeIcon: '⭐', requiredXp: 3850, tier: 'platinum', perkDescription: 'Платиновый ореол на столе и особые эмодзи' },
  { level: 13, title: 'Младший Босс', badgeIcon: '🎩', requiredXp: 4500, tier: 'platinum', perkDescription: 'Возможность создавать кланы со скидкой 50%' },
  { level: 14, title: 'Серый Кардинал', badgeIcon: '🎭', requiredXp: 5200, tier: 'diamond', perkDescription: 'Доступ к скрытому режиму инкогнито в профиле' },
  { level: 15, title: 'Криминальный Барон', badgeIcon: '🗡️', requiredXp: 5950, tier: 'diamond', perkDescription: 'Алмазный статус синдиката и лидерские перки' },
  { level: 16, title: 'Шеф Полиции', badgeIcon: '🛡️', requiredXp: 6750, tier: 'diamond', perkDescription: 'Уникальная рамка профиля «Щит Закона»' },
  { level: 17, title: 'Теневой Владыка', badgeIcon: '🌑', requiredXp: 7600, tier: 'diamond', perkDescription: 'Темная аура вокруг аватара в видеозвонке' },
  { level: 18, title: 'Глава Синдиката', badgeIcon: '💎', requiredXp: 8500, tier: 'legend', perkDescription: 'Легендарный знак мафиозного синдиката' },
  { level: 19, title: 'Крестный Отец', badgeIcon: '👑', requiredXp: 9450, tier: 'legend', perkDescription: 'Королевская корона над ником во всех комнатах' },
  { level: 20, title: 'Живая Легенда Города', badgeIcon: '🔥', requiredXp: 10450, tier: 'legend', perkDescription: 'Абсолютный авторитет и максимальный статус почета' }
];

// Active runtime config (synchronized from server)
let runtimeConfig: ExperienceConfig = {
  id: 'default',
  isEnabled: true,
  globalMultiplier: 1.0,
  maxLevel: 20,
  actionRules: [...DEFAULT_XP_ACTION_RULES],
  levelMilestones: [...DEFAULT_LEVEL_MILESTONES],
  updatedAt: new Date().toISOString()
};

// Export active arrays that mutate in place or can be read directly
export let XP_ACTION_RULES: XpActionRule[] = runtimeConfig.actionRules;
export let LEVEL_MILESTONES: XpMilestone[] = runtimeConfig.levelMilestones;

const configListeners = new Set<(config: ExperienceConfig) => void>();

export function getRuntimeExperienceConfig(): ExperienceConfig {
  return runtimeConfig;
}

export function setRuntimeExperienceConfig(config: Partial<ExperienceConfig>): ExperienceConfig {
  runtimeConfig = {
    ...runtimeConfig,
    ...config,
    actionRules: config.actionRules ? [...config.actionRules] : runtimeConfig.actionRules,
    levelMilestones: config.levelMilestones ? [...config.levelMilestones].sort((a, b) => a.level - b.level) : runtimeConfig.levelMilestones
  };
  XP_ACTION_RULES = runtimeConfig.actionRules;
  LEVEL_MILESTONES = runtimeConfig.levelMilestones;

  configListeners.forEach(listener => {
    try {
      listener(runtimeConfig);
    } catch (e) {
      console.error('[Experience] Listener error:', e);
    }
  });

  return runtimeConfig;
}

export function subscribeToExperienceConfig(listener: (config: ExperienceConfig) => void): () => void {
  configListeners.add(listener);
  try {
    listener(runtimeConfig);
  } catch (e) {
    console.error('[Experience] Initial listener error:', e);
  }
  return () => {
    configListeners.delete(listener);
  };
}

export async function fetchExperienceConfig(): Promise<ExperienceConfig> {
  try {
    const res = await fetch('/api/experience/config');
    if (res.ok) {
      const data = await res.json();
      if (data?.config) {
        return setRuntimeExperienceConfig(data.config);
      }
    }
  } catch (e) {
    console.warn('[Experience] Failed to fetch remote config, using defaults:', e);
  }
  return runtimeConfig;
}

export function getLevelMilestones(): XpMilestone[] {
  return runtimeConfig.levelMilestones || DEFAULT_LEVEL_MILESTONES;
}

export function getXpActionRules(): XpActionRule[] {
  return runtimeConfig.actionRules || DEFAULT_XP_ACTION_RULES;
}

// Calculate the total XP required to reach the start of a given level
export function getXpForLevelStart(level: number): number {
  const milestones = getLevelMilestones();
  const match = milestones.find(m => m.level === level);
  if (match) return match.requiredXp;

  if (level <= 1) return 0;
  return Math.round(25 * level * level + 25 * level - 50);
}

// Calculate the player's level from total lifetime XP based on active milestones
export function getLevelFromXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp || 0));
  const milestones = getLevelMilestones();

  if (!milestones || milestones.length === 0) return 1;

  let matchedLevel = milestones[0].level;
  for (const m of milestones) {
    if (safeXp >= m.requiredXp) {
      matchedLevel = m.level;
    } else {
      break;
    }
  }
  return Math.max(1, matchedLevel);
}

export function getTierConfig(level: number, tierOverride?: TierType): {
  title: string;
  badgeIcon: string;
  tier: TierType;
  color: string;
  textColor: string;
  bgGradient: string;
  borderColor: string;
  glowColor: string;
} {
  const milestones = getLevelMilestones();
  const found = milestones.find(m => m.level === level);
  const tier: TierType = tierOverride || found?.tier || (level >= 18 ? 'legend' : level >= 14 ? 'diamond' : level >= 11 ? 'platinum' : level >= 8 ? 'gold' : level >= 5 ? 'silver' : level >= 3 ? 'bronze' : 'rookie');
  const styles = TIER_STYLE_PRESETS[tier] || TIER_STYLE_PRESETS.rookie;

  return {
    title: found?.title || `Уровень ${level}`,
    badgeIcon: found?.badgeIcon || '🔰',
    tier,
    color: found?.color || styles.color,
    textColor: found?.textColor || styles.textColor,
    bgGradient: found?.bgGradient || styles.bgGradient,
    borderColor: found?.borderColor || styles.borderColor,
    glowColor: found?.glowColor || styles.glowColor
  };
}

// Compute comprehensive level progression info for any XP value
export function calculateLevelInfo(rawXp: number | undefined | null): LevelInfo {
  const totalXp = Math.max(0, Math.floor(rawXp || 0));
  const milestones = getLevelMilestones();

  if (milestones.length === 0) {
    const fallbackTier = TIER_STYLE_PRESETS.rookie;
    return {
      level: 1,
      title: 'Новичок города',
      badgeIcon: '🔰',
      tier: 'rookie',
      ...fallbackTier,
      currentLevelXp: 0,
      nextLevelXp: 100,
      xpInCurrentLevel: totalXp,
      xpNeededForNextLevel: 100,
      progressPercent: Math.min(100, Math.round((totalXp / 100) * 100)),
      totalXp,
      remainingXpToNextLevel: Math.max(0, 100 - totalXp)
    };
  }

  let currentIndex = 0;
  for (let i = 0; i < milestones.length; i++) {
    if (totalXp >= milestones[i].requiredXp) {
      currentIndex = i;
    } else {
      break;
    }
  }

  const currentMilestone = milestones[currentIndex];
  const isMaxLevel = currentIndex >= milestones.length - 1;
  const nextMilestone = isMaxLevel ? null : milestones[currentIndex + 1];

  const currentLevelXp = currentMilestone.requiredXp;
  const nextLevelXp = nextMilestone ? nextMilestone.requiredXp : currentLevelXp + 1000;
  const xpNeededForNextLevel = Math.max(1, nextLevelXp - currentLevelXp);
  const xpInCurrentLevel = isMaxLevel ? xpNeededForNextLevel : Math.max(0, totalXp - currentLevelXp);
  const remainingXpToNextLevel = isMaxLevel ? 0 : Math.max(0, nextLevelXp - totalXp);
  const progressPercent = isMaxLevel ? 100 : Math.min(100, Math.max(0, Math.round((xpInCurrentLevel / xpNeededForNextLevel) * 100)));

  const tier = currentMilestone.tier || 'rookie';
  const styles = TIER_STYLE_PRESETS[tier] || TIER_STYLE_PRESETS.rookie;

  return {
    level: currentMilestone.level,
    title: currentMilestone.title,
    badgeIcon: currentMilestone.badgeIcon,
    tier,
    color: currentMilestone.color || styles.color,
    textColor: currentMilestone.textColor || styles.textColor,
    bgGradient: currentMilestone.bgGradient || styles.bgGradient,
    borderColor: currentMilestone.borderColor || styles.borderColor,
    glowColor: currentMilestone.glowColor || styles.glowColor,
    currentLevelXp,
    nextLevelXp,
    xpInCurrentLevel,
    xpNeededForNextLevel,
    progressPercent,
    totalXp,
    remainingXpToNextLevel
  };
}

export type CurveFormulaType = 'polynomial' | 'linear' | 'exponential' | 'custom_step';

export interface CurveGeneratorOptions {
  formulaType: CurveFormulaType;
  maxLevel: number;
  baseXp?: number;
  incrementPerLevel?: number;
  growthRatePercent?: number;
  polyA?: number;
  polyB?: number;
  polyC?: number;
}

export const EXTENDED_MAFIA_TITLES: Array<{ title: string; badgeIcon: string; tier: TierType; perk: string }> = [
  { title: 'Новичок города', badgeIcon: '🔰', tier: 'rookie', perk: 'Доступ ко всем открытым столам' },
  { title: 'Уличный наблюдатель', badgeIcon: '👀', tier: 'rookie', perk: 'Подробная статистика по выживанию' },
  { title: 'Осведомитель', badgeIcon: '🗞️', tier: 'bronze', perk: 'Бронзовая рамка аватара' },
  { title: 'Подозрительный свидетель', badgeIcon: '🔦', tier: 'bronze', perk: '+5% бонус к кредитам за победу' },
  { title: 'Следственный агент', badgeIcon: '🕵️', tier: 'silver', perk: 'Серебряный бейдж в профиле' },
  { title: 'Опытный Детектив', badgeIcon: '🔍', tier: 'silver', perk: 'Увеличенный шанс выбора роли' },
  { title: 'Уличный Гангстер', badgeIcon: '🚬', tier: 'silver', perk: 'Уникальный титул «Гангстер»' },
  { title: 'Боевик Синдиката', badgeIcon: '🔫', tier: 'gold', perk: 'Золотой статус и анимация профиля' },
  { title: 'Капореджиме', badgeIcon: '👔', tier: 'gold', perk: 'Создание закрытых турнирных столов' },
  { title: 'Инспектор Полиции', badgeIcon: '⚖️', tier: 'gold', perk: 'Рубашка карт «Закон и Порядок»' },
  { title: 'Консильери Семьи', badgeIcon: '📜', tier: 'platinum', perk: 'Личный титул «Советник»' },
  { title: 'Комиссар Города', badgeIcon: '⭐', tier: 'platinum', perk: 'Платиновый ореол на столе' },
  { title: 'Младший Босс', badgeIcon: '🎩', tier: 'platinum', perk: 'Скидка 50% на создание клана' },
  { title: 'Серый Кардинал', badgeIcon: '🎭', tier: 'diamond', perk: 'Скрытый режим инкогнито' },
  { title: 'Криминальный Барон', badgeIcon: '🗡️', tier: 'diamond', perk: 'Алмазный статус синдиката' },
  { title: 'Шеф Полиции', badgeIcon: '🛡️', tier: 'diamond', perk: 'Рамка профиля «Щит Закона»' },
  { title: 'Теневой Владыка', badgeIcon: '🌑', tier: 'diamond', perk: 'Темная аура вокруг аватара' },
  { title: 'Глава Синдиката', badgeIcon: '💎', tier: 'legend', perk: 'Легендарный знак мафиозного синдиката' },
  { title: 'Крестный Отец', badgeIcon: '👑', tier: 'legend', perk: 'Королевская корона над ником' },
  { title: 'Живая Легенда Города', badgeIcon: '🔥', tier: 'legend', perk: 'Абсолютный авторитет и высший почет' },
  { title: 'Властелин Ночи', badgeIcon: '🌌', tier: 'legend', perk: 'Эксклюзивная ночная подсветка аватара' },
  { title: 'Истинный Доминант', badgeIcon: '⚡', tier: 'legend', perk: '+20% бонус ко всем кредитам в игре' },
  { title: 'Архитектор Синдиката', badgeIcon: '🏛️', tier: 'legend', perk: 'Право модерировать открытые столы' },
  { title: 'Гроссмейстер Города', badgeIcon: '♟️', tier: 'legend', perk: 'Значок золотого гроссмейстера' },
  { title: 'Призрак Мафии', badgeIcon: '👻', tier: 'legend', perk: 'Неуловимый статус в рейтинге' },
  { title: 'Император Теней', badgeIcon: '🦅', tier: 'legend', perk: 'Корона Императора во всех видеозвонках' },
  { title: 'Бессмертный Авторитет', badgeIcon: '🔱', tier: 'legend', perk: 'Трезубец верховного мафиозного босса' },
  { title: 'Верховный Судия', badgeIcon: '⚖️', tier: 'legend', perk: 'Право решающего голоса в спорных ситуациях' },
  { title: 'Повелитель Времени', badgeIcon: '⏳', tier: 'legend', perk: 'Анимированные песочные часы на таймере' },
  { title: 'Бог Подпольного Мира', badgeIcon: '🌟', tier: 'legend', perk: 'Максимальный статус в истории Mafia Online' }
];

export function generateMilestonesFromCurve(
  options: CurveGeneratorOptions,
  existingMilestones: XpMilestone[] = []
): XpMilestone[] {
  const { formulaType, maxLevel } = options;
  const count = Math.max(2, Math.min(100, Math.round(maxLevel)));
  const result: XpMilestone[] = [];

  let accumulatedXp = 0;

  for (let lvl = 1; lvl <= count; lvl++) {
    let reqXp = 0;

    if (lvl === 1) {
      reqXp = 0;
    } else if (formulaType === 'linear') {
      const step = options.incrementPerLevel || 200;
      accumulatedXp += step;
      reqXp = accumulatedXp;
    } else if (formulaType === 'polynomial') {
      const a = options.polyA ?? 25;
      const b = options.polyB ?? 25;
      const c = options.polyC ?? 50;
      reqXp = Math.round(a * lvl * lvl + b * lvl - c);
    } else if (formulaType === 'exponential') {
      const base = options.baseXp || 100;
      const rate = (options.growthRatePercent || 15) / 100;
      const step = Math.round(base * Math.pow(1 + rate, lvl - 2));
      accumulatedXp += step;
      reqXp = accumulatedXp;
    } else if (formulaType === 'custom_step') {
      const step = (options.baseXp || 100) + (lvl - 2) * (options.incrementPerLevel || 50);
      accumulatedXp += step;
      reqXp = accumulatedXp;
    }

    const existing = existingMilestones.find(m => m.level === lvl);
    const fallbackTemplate = EXTENDED_MAFIA_TITLES[lvl - 1] || {
      title: `Ранг Авторитета ${lvl}`,
      badgeIcon: lvl >= 25 ? '👑' : lvl >= 15 ? '💎' : lvl >= 10 ? '⭐' : '🔰',
      tier: (lvl >= 18 ? 'legend' : lvl >= 14 ? 'diamond' : lvl >= 11 ? 'platinum' : lvl >= 8 ? 'gold' : lvl >= 5 ? 'silver' : lvl >= 3 ? 'bronze' : 'rookie') as TierType,
      perk: `Особая привилегия ${lvl} ранга Города`
    };

    const tier = existing?.tier || fallbackTemplate.tier;
    const styles = TIER_STYLE_PRESETS[tier] || TIER_STYLE_PRESETS.rookie;

    result.push({
      level: lvl,
      title: existing?.title || fallbackTemplate.title,
      badgeIcon: existing?.badgeIcon || fallbackTemplate.badgeIcon,
      requiredXp: Math.max(0, reqXp),
      tier,
      perkDescription: existing?.perkDescription || fallbackTemplate.perk,
      color: existing?.color || styles.color,
      textColor: existing?.textColor || styles.textColor,
      bgGradient: existing?.bgGradient || styles.bgGradient,
      borderColor: existing?.borderColor || styles.borderColor,
      glowColor: existing?.glowColor || styles.glowColor
    });
  }

  return result.sort((a, b) => a.level - b.level);
}
