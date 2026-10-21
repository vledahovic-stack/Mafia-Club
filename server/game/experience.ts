/**
 * Server-side Experience & Level System
 * Integrated with dynamic experienceDb configuration
 */
import { experienceDb, LevelInfo, XpMilestoneConfig, XpActionRuleConfig } from '../db/experience';

export type { LevelInfo, XpMilestoneConfig, XpActionRuleConfig };

export function getXpForLevelStart(level: number): number {
  const config = experienceDb['cachedConfig'];
  if (config && config.levelMilestones) {
    const found = config.levelMilestones.find(m => m.level === level);
    if (found) return found.requiredXp;
  }
  if (level <= 1) return 0;
  return Math.round(25 * level * level + 25 * level - 50);
}

export function getLevelFromXp(xp: number): number {
  return experienceDb.getLevelFromXp(xp);
}

export function getLevelTitle(level: number): { title: string; icon: string } {
  const config = experienceDb['cachedConfig'];
  if (config && config.levelMilestones) {
    const found = config.levelMilestones.find(m => m.level === level);
    if (found) return { title: found.title, icon: found.badgeIcon };
  }
  return { title: `Уровень ${level}`, icon: '🔰' };
}

export function calculateServerLevelInfo(rawXp: number | undefined | null): LevelInfo {
  return experienceDb.calculateLevelInfo(rawXp);
}
