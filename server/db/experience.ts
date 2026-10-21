import { getDatabase, sanitizeArgs } from './database';
import { Client } from '@libsql/client';

export type TierType = 'rookie' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'legend';

export interface XpMilestoneConfig {
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

export interface XpActionRuleConfig {
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
  actionRules: XpActionRuleConfig[];
  levelMilestones: XpMilestoneConfig[];
  updatedAt: string;
}

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
  currentLevelXp: number;
  nextLevelXp: number;
  xpInCurrentLevel: number;
  xpNeededForNextLevel: number;
  progressPercent: number;
  totalXp: number;
  remainingXpToNextLevel: number;
}

export const DEFAULT_ACTION_RULES: XpActionRuleConfig[] = [
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

export const DEFAULT_LEVEL_MILESTONES: XpMilestoneConfig[] = [
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

export const TIER_STYLE_PRESETS: Record<TierType, {
  color: string;
  textColor: string;
  bgGradient: string;
  borderColor: string;
  glowColor: string;
}> = {
  rookie: {
    color: '#9ca3af',
    textColor: 'text-zinc-300',
    bgGradient: 'from-zinc-800 to-zinc-900',
    borderColor: 'border-zinc-700',
    glowColor: 'shadow-zinc-900/50'
  },
  bronze: {
    color: '#d97706',
    textColor: 'text-amber-400',
    bgGradient: 'from-amber-950/80 via-amber-900/60 to-zinc-900',
    borderColor: 'border-amber-700/70',
    glowColor: 'shadow-amber-950/50'
  },
  silver: {
    color: '#38bdf8',
    textColor: 'text-sky-300',
    bgGradient: 'from-sky-950/80 via-cyan-950/60 to-zinc-900',
    borderColor: 'border-sky-600/70',
    glowColor: 'shadow-sky-950/50'
  },
  gold: {
    color: '#f59e0b',
    textColor: 'text-yellow-400',
    bgGradient: 'from-amber-950/90 via-yellow-950/70 to-zinc-900',
    borderColor: 'border-yellow-600/70',
    glowColor: 'shadow-yellow-950/50'
  },
  platinum: {
    color: '#c084fc',
    textColor: 'text-purple-300',
    bgGradient: 'from-purple-950/90 via-fuchsia-950/70 to-zinc-900',
    borderColor: 'border-purple-600/70',
    glowColor: 'shadow-purple-950/50'
  },
  diamond: {
    color: '#06b6d4',
    textColor: 'text-cyan-300',
    bgGradient: 'from-cyan-950/90 via-blue-950/70 to-zinc-900',
    borderColor: 'border-cyan-500/70',
    glowColor: 'shadow-cyan-950/50'
  },
  legend: {
    color: '#fbbf24',
    textColor: 'text-yellow-200',
    bgGradient: 'from-yellow-950/95 via-red-950/80 to-zinc-900',
    borderColor: 'border-yellow-400',
    glowColor: 'shadow-yellow-950/90'
  }
};

export class ExperienceDatabase {
  private get db(): Client {
    return getDatabase();
  }

  private cachedConfig: ExperienceConfig | null = null;

  public async ensureSeed(): Promise<void> {
    try {
      const res = await this.db.execute("SELECT * FROM experience_config WHERE id = 'default'");
      if (!res.rows[0]) {
        await this.db.execute({
          sql: `
            INSERT INTO experience_config (
              id, is_enabled, global_multiplier, max_level, action_rules, level_milestones, updated_at
            ) VALUES ('default', 1, 1.0, 20, ?, ?, ?)
          `,
          args: sanitizeArgs([
            JSON.stringify(DEFAULT_ACTION_RULES),
            JSON.stringify(DEFAULT_LEVEL_MILESTONES),
            new Date().toISOString()
          ])
        });
        console.log('[SQLite] Seeded default experience_config table');
      }
      await this.getConfig(true);
    } catch (err) {
      console.error('[ExperienceDb] ensureSeed error:', err);
    }
  }

  public async getConfig(forceRefresh = false): Promise<ExperienceConfig> {
    if (this.cachedConfig && !forceRefresh) {
      return this.cachedConfig;
    }

    try {
      const res = await this.db.execute("SELECT * FROM experience_config WHERE id = 'default'");
      const row = res.rows[0];
      if (row) {
        let actionRules: XpActionRuleConfig[] = DEFAULT_ACTION_RULES;
        let levelMilestones: XpMilestoneConfig[] = DEFAULT_LEVEL_MILESTONES;
        try {
          if (row.action_rules) actionRules = JSON.parse(row.action_rules as string);
        } catch (e) {
          console.warn('[ExperienceDb] Failed to parse action_rules JSON');
        }
        try {
          if (row.level_milestones) levelMilestones = JSON.parse(row.level_milestones as string);
        } catch (e) {
          console.warn('[ExperienceDb] Failed to parse level_milestones JSON');
        }

        this.cachedConfig = {
          id: 'default',
          isEnabled: Number(row.is_enabled ?? 1) === 1,
          globalMultiplier: Number(row.global_multiplier ?? 1.0),
          maxLevel: Number(row.max_level ?? 20),
          actionRules,
          levelMilestones: levelMilestones.sort((a, b) => a.level - b.level),
          updatedAt: (row.updated_at as string) || new Date().toISOString()
        };
        return this.cachedConfig;
      }
    } catch (e) {
      console.error('[ExperienceDb] getConfig error, falling back to defaults:', e);
    }

    const fallback: ExperienceConfig = {
      id: 'default',
      isEnabled: true,
      globalMultiplier: 1.0,
      maxLevel: 20,
      actionRules: DEFAULT_ACTION_RULES,
      levelMilestones: DEFAULT_LEVEL_MILESTONES,
      updatedAt: new Date().toISOString()
    };
    this.cachedConfig = fallback;
    return fallback;
  }

  public async updateConfig(patch: Partial<ExperienceConfig>): Promise<ExperienceConfig> {
    const current = await this.getConfig(true);

    const isEnabled = patch.isEnabled !== undefined ? (patch.isEnabled ? 1 : 0) : (current.isEnabled ? 1 : 0);
    const globalMultiplier = typeof patch.globalMultiplier === 'number' ? Math.max(0.1, patch.globalMultiplier) : current.globalMultiplier;
    const maxLevel = typeof patch.maxLevel === 'number' ? Math.max(1, patch.maxLevel) : current.maxLevel;
    
    let actionRules = current.actionRules;
    if (Array.isArray(patch.actionRules)) {
      actionRules = patch.actionRules.map(r => ({
        id: String(r.id || '').trim().toLowerCase().replace(/\s+/g, '_'),
        name: String(r.name || 'Действие').trim(),
        category: r.category || 'custom',
        xp: Math.max(0, Math.round(Number(r.xp || 0))),
        icon: r.icon || '⭐',
        description: String(r.description || '').trim(),
        isCustom: Boolean(r.isCustom)
      }));
    }

    let levelMilestones = current.levelMilestones;
    if (Array.isArray(patch.levelMilestones)) {
      levelMilestones = patch.levelMilestones.map(m => {
        const tier = m.tier || 'rookie';
        const styles = TIER_STYLE_PRESETS[tier] || TIER_STYLE_PRESETS.rookie;
        return {
          level: Math.max(1, Math.round(Number(m.level || 1))),
          title: String(m.title || `Уровень ${m.level}`).trim(),
          badgeIcon: m.badgeIcon || '🔰',
          requiredXp: Math.max(0, Math.round(Number(m.requiredXp || 0))),
          tier,
          perkDescription: String(m.perkDescription || 'Новый ранг в Городе').trim(),
          color: m.color || styles.color,
          textColor: m.textColor || styles.textColor,
          bgGradient: m.bgGradient || styles.bgGradient,
          borderColor: m.borderColor || styles.borderColor,
          glowColor: m.glowColor || styles.glowColor
        };
      }).sort((a, b) => a.level - b.level);
    }

    const updatedAt = new Date().toISOString();

    await this.db.execute({
      sql: `
        INSERT OR REPLACE INTO experience_config (
          id, is_enabled, global_multiplier, max_level, action_rules, level_milestones, updated_at
        ) VALUES ('default', ?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([
        isEnabled,
        globalMultiplier,
        maxLevel,
        JSON.stringify(actionRules),
        JSON.stringify(levelMilestones),
        updatedAt
      ])
    });

    this.cachedConfig = {
      id: 'default',
      isEnabled: isEnabled === 1,
      globalMultiplier,
      maxLevel,
      actionRules,
      levelMilestones,
      updatedAt
    };

    return this.cachedConfig;
  }

  public async resetToDefaults(): Promise<ExperienceConfig> {
    const updatedAt = new Date().toISOString();
    await this.db.execute({
      sql: `
        INSERT OR REPLACE INTO experience_config (
          id, is_enabled, global_multiplier, max_level, action_rules, level_milestones, updated_at
        ) VALUES ('default', 1, 1.0, 20, ?, ?, ?)
      `,
      args: sanitizeArgs([
        JSON.stringify(DEFAULT_ACTION_RULES),
        JSON.stringify(DEFAULT_LEVEL_MILESTONES),
        updatedAt
      ])
    });

    this.cachedConfig = {
      id: 'default',
      isEnabled: true,
      globalMultiplier: 1.0,
      maxLevel: 20,
      actionRules: DEFAULT_ACTION_RULES,
      levelMilestones: DEFAULT_LEVEL_MILESTONES,
      updatedAt
    };

    return this.cachedConfig;
  }

  /**
   * Determine user level from lifetime total XP based on milestones
   */
  public getLevelFromXp(xp: number, milestones?: XpMilestoneConfig[]): number {
    const list = milestones && milestones.length > 0 ? milestones : (this.cachedConfig?.levelMilestones || DEFAULT_LEVEL_MILESTONES);
    const sorted = [...list].sort((a, b) => a.level - b.level);
    if (sorted.length === 0) return 1;

    const safeXp = Math.max(0, xp || 0);
    let matchedLevel = sorted[0].level;

    for (const m of sorted) {
      if (safeXp >= m.requiredXp) {
        matchedLevel = m.level;
      } else {
        break;
      }
    }

    return matchedLevel;
  }

  /**
   * Calculate complete progress breakdown for a given total XP
   */
  public calculateLevelInfo(rawXp: number | undefined | null, config?: ExperienceConfig): LevelInfo {
    const activeConfig = config || this.cachedConfig || {
      id: 'default',
      isEnabled: true,
      globalMultiplier: 1.0,
      maxLevel: 20,
      actionRules: DEFAULT_ACTION_RULES,
      levelMilestones: DEFAULT_LEVEL_MILESTONES,
      updatedAt: ''
    };

    const milestones = [...activeConfig.levelMilestones].sort((a, b) => a.level - b.level);
    const totalXp = Math.max(0, Math.floor(rawXp || 0));

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

  /**
   * Helper to fetch XP reward for a specific game action
   */
  public getActionXp(actionId: string, fallbackXp = 25): number {
    const config = this.cachedConfig;
    if (!config || !config.isEnabled) return fallbackXp;
    const rule = config.actionRules.find(r => r.id === actionId);
    const baseXp = rule ? rule.xp : fallbackXp;
    return Math.round(baseXp * config.globalMultiplier);
  }
}

export const experienceDb = new ExperienceDatabase();
