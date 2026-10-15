export type MasteryTier = 'locked' | 'novice' | 'adept' | 'expert' | 'master' | 'grandmaster';

export interface MasteryTierConfig {
  id: MasteryTier;
  level: number;
  name: string;
  nameRu: string;
  minGames: number;
  minWinRate: number; // percentage (0-100)
  badgeFrame: string;
  bgGradient: string;
  borderColor: string;
  textColor: string;
  glowColor: string;
  icon: string;
}

export const MASTERY_TIERS: Record<MasteryTier, MasteryTierConfig> = {
  locked: {
    id: 'locked',
    level: 0,
    name: 'Unranked',
    nameRu: 'Не открыто',
    minGames: 0,
    minWinRate: 0,
    badgeFrame: 'border-zinc-800 bg-zinc-950/60',
    bgGradient: 'from-zinc-950/80 to-zinc-900/60',
    borderColor: 'border-zinc-800',
    textColor: 'text-zinc-500',
    glowColor: 'shadow-none',
    icon: '🔒'
  },
  novice: {
    id: 'novice',
    level: 1,
    name: 'Novice',
    nameRu: 'Новичок',
    minGames: 1,
    minWinRate: 0,
    badgeFrame: 'border-slate-700 bg-slate-900/80',
    bgGradient: 'from-slate-950 via-slate-900 to-zinc-900',
    borderColor: 'border-slate-600',
    textColor: 'text-slate-300',
    glowColor: 'shadow-slate-950/50',
    icon: '🥉'
  },
  adept: {
    id: 'adept',
    level: 2,
    name: 'Adept',
    nameRu: 'Адепт',
    minGames: 3,
    minWinRate: 45,
    badgeFrame: 'border-sky-700 bg-sky-950/60',
    bgGradient: 'from-sky-950/80 via-indigo-950/60 to-zinc-900',
    borderColor: 'border-sky-600/70',
    textColor: 'text-sky-300',
    glowColor: 'shadow-sky-950/50',
    icon: '🥈'
  },
  expert: {
    id: 'expert',
    level: 3,
    name: 'Expert',
    nameRu: 'Эксперт',
    minGames: 5,
    minWinRate: 55,
    badgeFrame: 'border-purple-600 bg-purple-950/70',
    bgGradient: 'from-purple-950/80 via-violet-950/70 to-zinc-900',
    borderColor: 'border-purple-500/80',
    textColor: 'text-purple-300',
    glowColor: 'shadow-purple-950/70',
    icon: '🥇'
  },
  master: {
    id: 'master',
    level: 4,
    name: 'Master',
    nameRu: 'Мастер',
    minGames: 8,
    minWinRate: 65,
    badgeFrame: 'border-amber-500 bg-amber-950/80 ring-1 ring-amber-500/40',
    bgGradient: 'from-amber-950/90 via-orange-950/80 to-[#121118]',
    borderColor: 'border-amber-400',
    textColor: 'text-amber-300',
    glowColor: 'shadow-amber-900/60 shadow-lg',
    icon: '👑'
  },
  grandmaster: {
    id: 'grandmaster',
    level: 5,
    name: 'Grandmaster',
    nameRu: 'Грандмастер',
    minGames: 15,
    minWinRate: 75,
    badgeFrame: 'border-rose-500 bg-gradient-to-br from-rose-950 via-amber-950 to-purple-950 ring-2 ring-rose-400/60 shadow-xl',
    bgGradient: 'from-rose-950/90 via-amber-950/80 to-purple-950/90',
    borderColor: 'border-rose-400',
    textColor: 'text-rose-200',
    glowColor: 'shadow-rose-900/80 shadow-2xl',
    icon: '🔥'
  }
};

export interface RoleMasteryInfo {
  roleId: string;
  roleName: string;
  team: 'civilians' | 'mafia' | 'maniac';
  icon: string;
  color: string;
  masterBadgeTitle: string; // e.g. "Master Sheriff" / "Мастер Шериф"
  masterBadgeTitleRu: string;
  flairTitle: string; // e.g. "Гроза Синдиката"
  description: string;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  survivedCount: number;
  masteryPoints: number;
  currentTier: MasteryTierConfig;
  nextTier: MasteryTierConfig | null;
  progressToNextTier: {
    gamesNeeded: number;
    winRateNeeded: number;
    hasGamesMet: boolean;
    hasWinRateMet: boolean;
    percentCompleted: number;
  };
  isMasterOrAbove: boolean;
}

export const ROLE_MASTERY_REGISTRY: Record<string, {
  roleName: string;
  team: 'civilians' | 'mafia' | 'maniac';
  icon: string;
  color: string;
  masterBadgeTitle: string;
  masterBadgeTitleRu: string;
  flairTitle: string;
  description: string;
}> = {
  sheriff: {
    roleName: 'Шериф',
    team: 'civilians',
    icon: '⭐',
    color: '#38bdf8',
    masterBadgeTitle: 'Master Sheriff',
    masterBadgeTitleRu: 'Мастер Шериф',
    flairTitle: 'Гроза Синдиката',
    description: 'Мастер ночных расследований и разоблачения криминала на дневном суде.'
  },
  mafia: {
    roleName: 'Мафия',
    team: 'mafia',
    icon: '🕶️',
    color: '#f43f5e',
    masterBadgeTitle: 'Master Mafia',
    masterBadgeTitleRu: 'Мастер Мафия',
    flairTitle: 'Теневой Стратег',
    description: 'Виртуоз скрытого устранения и искусной маскировки среди честных граждан.'
  },
  don: {
    roleName: 'Дон Мафии',
    team: 'mafia',
    icon: '👑',
    color: '#e11d48',
    masterBadgeTitle: 'Master Don',
    masterBadgeTitleRu: 'Мастер Дон',
    flairTitle: 'Крестный Отец',
    description: 'Лидер преступного синдиката с безупречным чутьем на поиск шерифа города.'
  },
  doctor: {
    roleName: 'Доктор',
    team: 'civilians',
    icon: '💉',
    color: '#34d399',
    masterBadgeTitle: 'Master Doctor',
    masterBadgeTitleRu: 'Мастер Доктор',
    flairTitle: 'Ангел-Хранитель',
    description: 'Спаситель жизней, предугадывающий ночные выстрелы мафии и спасающий стол.'
  },
  citizen: {
    roleName: 'Мирный житель',
    team: 'civilians',
    icon: '👤',
    color: '#94a3b8',
    masterBadgeTitle: 'Master Civilian',
    masterBadgeTitleRu: 'Мастер Гражданин',
    flairTitle: 'Голос Истины',
    description: 'Опора города, находящая нестыковки в речах мафии и ведущая суд к победе.'
  },
  civilian: {
    roleName: 'Мирный житель',
    team: 'civilians',
    icon: '👤',
    color: '#94a3b8',
    masterBadgeTitle: 'Master Civilian',
    masterBadgeTitleRu: 'Мастер Гражданин',
    flairTitle: 'Голос Истины',
    description: 'Опора города, находящая нестыковки в речах мафии и ведущая суд к победе.'
  },
  courtesan: {
    roleName: 'Красотка',
    team: 'civilians',
    icon: '💋',
    color: '#ec4899',
    masterBadgeTitle: 'Master Courtesan',
    masterBadgeTitleRu: 'Мастер Красотка',
    flairTitle: 'Роковая Искусительница',
    description: 'Мастерица ночного обольщения, блокирующая ночные ходы опаснейших врагов.'
  },
  maniac: {
    roleName: 'Маньяк',
    team: 'maniac',
    icon: '🔪',
    color: '#a855f7',
    masterBadgeTitle: 'Master Maniac',
    masterBadgeTitleRu: 'Мастер Маньяк',
    flairTitle: 'Ночной Жнец',
    description: 'Одиночный ночной хищник, играющий против всех и побеждающий в одиночку.'
  },
  bodyguard: {
    roleName: 'Телохранитель',
    team: 'civilians',
    icon: '🛡️',
    color: '#f59e0b',
    masterBadgeTitle: 'Master Bodyguard',
    masterBadgeTitleRu: 'Мастер Телохранитель',
    flairTitle: 'Непробиваемый Щит',
    description: 'Верный защитник, готовый принять пулю за невинного жителя города.'
  }
};

export function calculateTier(games: number, winRate: number): MasteryTierConfig {
  if (games >= MASTERY_TIERS.grandmaster.minGames && winRate >= MASTERY_TIERS.grandmaster.minWinRate) {
    return MASTERY_TIERS.grandmaster;
  }
  if (games >= MASTERY_TIERS.master.minGames && winRate >= MASTERY_TIERS.master.minWinRate) {
    return MASTERY_TIERS.master;
  }
  if (games >= MASTERY_TIERS.expert.minGames && winRate >= MASTERY_TIERS.expert.minWinRate) {
    return MASTERY_TIERS.expert;
  }
  if (games >= MASTERY_TIERS.adept.minGames && winRate >= MASTERY_TIERS.adept.minWinRate) {
    return MASTERY_TIERS.adept;
  }
  if (games >= MASTERY_TIERS.novice.minGames) {
    return MASTERY_TIERS.novice;
  }
  return MASTERY_TIERS.locked;
}

export function getNextTier(current: MasteryTier): MasteryTierConfig | null {
  switch (current) {
    case 'locked': return MASTERY_TIERS.novice;
    case 'novice': return MASTERY_TIERS.adept;
    case 'adept': return MASTERY_TIERS.expert;
    case 'expert': return MASTERY_TIERS.master;
    case 'master': return MASTERY_TIERS.grandmaster;
    case 'grandmaster': return null;
  }
}

export function calculateSingleRoleMastery(
  roleKey: string,
  stats?: { games?: number; wins?: number; survivedCount?: number; totalSurvivalSeconds?: number }
): RoleMasteryInfo {
  const normKey = roleKey === 'civilian' ? 'citizen' : roleKey;
  const config = ROLE_MASTERY_REGISTRY[normKey] || {
    roleName: roleKey,
    team: 'civilians',
    icon: '🎭',
    color: '#94a3b8',
    masterBadgeTitle: `Master ${roleKey}`,
    masterBadgeTitleRu: `Мастер ${roleKey}`,
    flairTitle: 'Опытный Игрок',
    description: 'Специалист роли в партии Мафии.'
  };

  const games = stats?.games || 0;
  const wins = stats?.wins || 0;
  const survivedCount = stats?.survivedCount || 0;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
  const masteryPoints = (games * 10) + (wins * 35) + (winRate * 2);

  const currentTier = calculateTier(games, winRate);
  const nextTier = getNextTier(currentTier.id);

  let gamesNeeded = 0;
  let winRateNeeded = 0;
  let hasGamesMet = true;
  let hasWinRateMet = true;
  let percentCompleted = 100;

  if (nextTier) {
    gamesNeeded = Math.max(0, nextTier.minGames - games);
    winRateNeeded = Math.max(0, nextTier.minWinRate - winRate);
    hasGamesMet = games >= nextTier.minGames;
    hasWinRateMet = winRate >= nextTier.minWinRate;

    const gameProgress = Math.min(1, games / nextTier.minGames);
    const winRateProgress = nextTier.minWinRate > 0 ? Math.min(1, winRate / nextTier.minWinRate) : 1;
    percentCompleted = Math.round(((gameProgress * 0.5) + (winRateProgress * 0.5)) * 100);
  }

  return {
    roleId: normKey,
    roleName: config.roleName,
    team: config.team,
    icon: config.icon,
    color: config.color,
    masterBadgeTitle: config.masterBadgeTitle,
    masterBadgeTitleRu: config.masterBadgeTitleRu,
    flairTitle: config.flairTitle,
    description: config.description,
    gamesPlayed: games,
    gamesWon: wins,
    winRate,
    survivedCount,
    masteryPoints,
    currentTier,
    nextTier,
    progressToNextTier: {
      gamesNeeded,
      winRateNeeded,
      hasGamesMet,
      hasWinRateMet,
      percentCompleted
    },
    isMasterOrAbove: currentTier.id === 'master' || currentTier.id === 'grandmaster'
  };
}

export function getUserAllRolesMastery(user?: { stats?: { roleStats?: Record<string, any> }; matchHistory?: any[] } | null): RoleMasteryInfo[] {
  const standardRoles = ['sheriff', 'mafia', 'don', 'doctor', 'citizen', 'courtesan', 'maniac', 'bodyguard'];
  const userRoleStats: Record<string, { games: number; wins: number; survivedCount: number }> = {};

  standardRoles.forEach(r => {
    userRoleStats[r] = { games: 0, wins: 0, survivedCount: 0 };
  });

  if (user?.stats?.roleStats) {
    Object.entries(user.stats.roleStats).forEach(([k, v]) => {
      const norm = k === 'civilian' ? 'citizen' : k;
      if (!userRoleStats[norm]) {
        userRoleStats[norm] = { games: 0, wins: 0, survivedCount: 0 };
      }
      userRoleStats[norm].games += v.games || 0;
      userRoleStats[norm].wins += v.wins || 0;
      userRoleStats[norm].survivedCount += v.survivedCount || 0;
    });
  }

  if (user?.matchHistory && (!user.stats?.roleStats || Object.keys(user.stats.roleStats).length === 0)) {
    user.matchHistory.forEach(m => {
      const rawRole = m.role || (m.team === 'mafia' ? 'mafia' : 'citizen');
      const norm = rawRole === 'civilian' ? 'citizen' : rawRole;
      if (!userRoleStats[norm]) {
        userRoleStats[norm] = { games: 0, wins: 0, survivedCount: 0 };
      }
      userRoleStats[norm].games++;
      if (m.won) userRoleStats[norm].wins++;
      if (m.survived) userRoleStats[norm].survivedCount++;
    });
  }

  return standardRoles.map(roleKey => {
    return calculateSingleRoleMastery(roleKey, userRoleStats[roleKey]);
  });
}

export function getUserMasterySummary(user?: { stats?: { roleStats?: Record<string, any> }; matchHistory?: any[] } | null) {
  const allMastery = getUserAllRolesMastery(user);
  const totalMasteryPoints = allMastery.reduce((acc, m) => acc + m.masteryPoints, 0);
  const masteredRoles = allMastery.filter(m => m.isMasterOrAbove);
  const grandmasterRoles = allMastery.filter(m => m.currentTier.id === 'grandmaster');
  
  // Find highest tier achieved
  let highestTierLevel = 0;
  let topMasteryRole = allMastery[0];

  allMastery.forEach(m => {
    if (m.currentTier.level > highestTierLevel || (m.currentTier.level === highestTierLevel && m.masteryPoints > topMasteryRole.masteryPoints)) {
      highestTierLevel = m.currentTier.level;
      topMasteryRole = m;
    }
  });

  return {
    allMastery,
    totalMasteryPoints,
    masteredCount: masteredRoles.length,
    grandmasterCount: grandmasterRoles.length,
    masteredRoles,
    grandmasterRoles,
    topRole: topMasteryRole,
    highestTier: topMasteryRole.currentTier
  };
}
