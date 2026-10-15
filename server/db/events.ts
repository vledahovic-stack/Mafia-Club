import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from './database';
import { 
  TaskDefinition, 
  TaskType, 
  TaskStatus, 
  TaskActionType, 
  RepeatCycle, 
  EventDefinition, 
  ClanMilestone, 
  EventsConfig, 
  UserTaskProgress,
  PersonalTasksState,
  ClanEventStatus
} from '../../src/types/events';
import { userDb } from './users';
import { clanDb } from './clans';

export class EventsDatabase {
  private get db(): DatabaseSync {
    return getDatabase();
  }

  constructor() {
    this.ensureSeed();
  }

  // ================= 1. CONFIG & MASTER TOGGLES =================
  public getConfig(): EventsConfig {
    const row = this.db.prepare("SELECT * FROM events_and_tasks_config WHERE id = 'default'").get() as any;
    if (!row) {
      const defConfig: EventsConfig = {
        masterToggles: {
          global: true,
          onboarding: true,
          personal: true,
          clan: true
        },
        personalRerollFreeDailyLimit: 1,
        personalRerollCost: 50,
        updatedAt: new Date().toISOString()
      };
      this.db.prepare(`
        INSERT INTO events_and_tasks_config (id, master_toggles, personal_reroll_free_daily_limit, personal_reroll_cost, updated_at)
        VALUES ('default', ?, ?, ?, ?)
      `).run(
        JSON.stringify(defConfig.masterToggles),
        defConfig.personalRerollFreeDailyLimit,
        defConfig.personalRerollCost,
        defConfig.updatedAt!
      );
      return defConfig;
    }

    try {
      return {
        masterToggles: JSON.parse(row.master_toggles),
        personalRerollFreeDailyLimit: Number(row.personal_reroll_free_daily_limit || 1),
        personalRerollCost: Number(row.personal_reroll_cost || 50),
        updatedAt: row.updated_at
      };
    } catch {
      return {
        masterToggles: { global: true, onboarding: true, personal: true, clan: true },
        personalRerollFreeDailyLimit: 1,
        personalRerollCost: 50
      };
    }
  }

  public updateConfig(updates: Partial<EventsConfig>): EventsConfig {
    const current = this.getConfig();
    const updated: EventsConfig = {
      masterToggles: { ...current.masterToggles, ...(updates.masterToggles || {}) },
      personalRerollFreeDailyLimit: typeof updates.personalRerollFreeDailyLimit === 'number' ? updates.personalRerollFreeDailyLimit : current.personalRerollFreeDailyLimit,
      personalRerollCost: typeof updates.personalRerollCost === 'number' ? updates.personalRerollCost : current.personalRerollCost,
      updatedAt: new Date().toISOString()
    };

    this.db.prepare(`
      INSERT OR REPLACE INTO events_and_tasks_config (id, master_toggles, personal_reroll_free_daily_limit, personal_reroll_cost, updated_at)
      VALUES ('default', ?, ?, ?, ?)
    `).run(
      JSON.stringify(updated.masterToggles),
      updated.personalRerollFreeDailyLimit,
      updated.personalRerollCost,
      updated.updatedAt!
    );

    return updated;
  }

  // ================= 2. TASK ARCHIVE (CRUD & STATUSES) =================
  private rowToTask(r: any): TaskDefinition {
    // Auto calculate status based on timelines if active
    let calculatedStatus = r.status as TaskStatus;
    const now = Date.now();
    if (r.status !== 'draft') {
      const starts = r.starts_at ? new Date(r.starts_at).getTime() : 0;
      const ends = r.ends_at ? new Date(r.ends_at).getTime() : Infinity;

      if (starts > 0 && starts > now) {
        calculatedStatus = 'scheduled';
      } else if (ends < now) {
        calculatedStatus = 'completed';
      } else {
        calculatedStatus = 'active';
      }
    }

    return {
      id: r.id,
      title: r.title,
      description: r.description,
      type: r.type as TaskType,
      targetType: r.target_type as TaskActionType,
      targetCount: Number(r.target_count),
      targetRole: r.target_role || undefined,
      rewardCredits: Number(r.reward_credits || 0),
      rewardItemId: r.reward_item_id || undefined,
      rewardItemName: r.reward_item_name || undefined,
      rewardXp: Number(r.reward_xp || 0),
      clanPoints: Number(r.clan_points || 0),
      startsAt: r.starts_at || undefined,
      endsAt: r.ends_at || undefined,
      status: calculatedStatus,
      isRepeatable: Boolean(r.is_repeatable),
      repeatCycle: (r.repeat_cycle as RepeatCycle) || 'none',
      onboardingMinRegistrationDate: r.onboarding_min_reg_date || undefined,
      eventId: r.event_id || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  public getAllArchiveTasks(filterType?: TaskType): TaskDefinition[] {
    let rows: any[];
    if (filterType) {
      rows = this.db.prepare('SELECT * FROM task_archive WHERE type = ? ORDER BY created_at DESC').all(filterType);
    } else {
      rows = this.db.prepare('SELECT * FROM task_archive ORDER BY created_at DESC').all();
    }
    return rows.map(r => this.rowToTask(r));
  }

  public getTaskById(id: string): TaskDefinition | null {
    if (!id) return null;
    const row = this.db.prepare('SELECT * FROM task_archive WHERE id = ?').get(id);
    if (!row) return null;
    return this.rowToTask(row);
  }

  public saveTask(task: Partial<TaskDefinition> & { title: string; description: string; type: TaskType; targetType: TaskActionType; targetCount: number }): TaskDefinition {
    const id = task.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const existing = task.id ? this.getTaskById(task.id) : null;

    const finalTask: TaskDefinition = {
      id,
      title: task.title.trim(),
      description: task.description.trim(),
      type: task.type,
      targetType: task.targetType,
      targetCount: Math.max(1, Number(task.targetCount || 1)),
      targetRole: task.targetRole || undefined,
      rewardCredits: Math.max(0, Number(task.rewardCredits || 0)),
      rewardItemId: task.rewardItemId || undefined,
      rewardItemName: task.rewardItemName || undefined,
      rewardXp: Math.max(0, Number(task.rewardXp || 0)),
      clanPoints: task.type === 'clan' ? Math.max(0, Number(task.clanPoints || 25)) : 0,
      startsAt: task.startsAt || undefined,
      endsAt: task.endsAt || undefined,
      status: task.status || 'active',
      isRepeatable: Boolean(task.isRepeatable),
      repeatCycle: task.repeatCycle || 'none',
      onboardingMinRegistrationDate: task.onboardingMinRegistrationDate || (task.type === 'onboarding' ? now : undefined),
      eventId: task.eventId || undefined,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    this.db.prepare(`
      INSERT OR REPLACE INTO task_archive (
        id, title, description, type, target_type, target_count, target_role,
        reward_credits, reward_item_id, reward_item_name, reward_xp, clan_points,
        starts_at, ends_at, status, is_repeatable, repeat_cycle, onboarding_min_reg_date,
        event_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      finalTask.id,
      finalTask.title,
      finalTask.description,
      finalTask.type,
      finalTask.targetType,
      finalTask.targetCount,
      finalTask.targetRole || null,
      finalTask.rewardCredits,
      finalTask.rewardItemId || null,
      finalTask.rewardItemName || null,
      finalTask.rewardXp,
      finalTask.clanPoints,
      finalTask.startsAt || null,
      finalTask.endsAt || null,
      finalTask.status,
      finalTask.isRepeatable ? 1 : 0,
      finalTask.repeatCycle,
      finalTask.onboardingMinRegistrationDate || null,
      finalTask.eventId || null,
      finalTask.createdAt,
      finalTask.updatedAt
    );

    return finalTask;
  }

  public deleteTask(id: string): boolean {
    const res = this.db.prepare('DELETE FROM task_archive WHERE id = ?').run(id);
    return res.changes > 0;
  }

  public cloneTask(id: string): TaskDefinition | null {
    const orig = this.getTaskById(id);
    if (!orig) return null;
    const cloned: Partial<TaskDefinition> = {
      ...orig,
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: `${orig.title} (Копия)`,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return this.saveTask(cloned as any);
  }

  // ================= 3. EVENTS CONSTRUCTOR (CRUD) =================
  private rowToEvent(r: any): EventDefinition {
    let taskIds: string[] = [];
    let clanMilestones: ClanMilestone[] = [];
    try {
      taskIds = typeof r.task_ids === 'string' ? JSON.parse(r.task_ids) : r.task_ids || [];
    } catch { taskIds = []; }
    try {
      clanMilestones = typeof r.clan_milestones === 'string' ? JSON.parse(r.clan_milestones) : r.clan_milestones || [];
    } catch { clanMilestones = []; }

    let calculatedStatus = r.status as TaskStatus;
    const now = Date.now();
    if (r.status !== 'draft') {
      const starts = new Date(r.starts_at).getTime();
      const ends = new Date(r.ends_at).getTime();
      if (starts > now) {
        calculatedStatus = 'scheduled';
      } else if (ends < now) {
        calculatedStatus = 'completed';
      } else {
        calculatedStatus = 'active';
      }
    }

    return {
      id: r.id,
      title: r.title,
      description: r.description,
      bannerUrl: r.banner_url || undefined,
      icon: r.icon || '🎉',
      type: r.type as 'general' | 'clan',
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      status: calculatedStatus,
      repeatCycle: (r.repeat_cycle as RepeatCycle) || 'none',
      taskIds,
      clanMilestones,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  public getAllEvents(): EventDefinition[] {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY starts_at DESC').all() as any[];
    return rows.map(r => this.rowToEvent(r));
  }

  public getEventById(id: string): EventDefinition | null {
    if (!id) return null;
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!row) return null;
    const ev = this.rowToEvent(row);
    // Attach tasks from archive
    if (ev.taskIds && ev.taskIds.length > 0) {
      ev.tasks = ev.taskIds.map(tid => this.getTaskById(tid)).filter(Boolean) as TaskDefinition[];
    }
    return ev;
  }

  public getActiveClanEvent(): EventDefinition | null {
    const events = this.getAllEvents();
    const active = events.find(e => e.type === 'clan' && e.status === 'active');
    if (active) {
      active.tasks = active.taskIds.map(tid => this.getTaskById(tid)).filter(Boolean) as TaskDefinition[];
      return active;
    }
    return null;
  }

  public saveEvent(event: Partial<EventDefinition> & { title: string; description: string; type: 'general' | 'clan'; startsAt: string; endsAt: string }): EventDefinition {
    const id = event.id || `event_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const existing = event.id ? this.getEventById(event.id) : null;

    const finalEvent: EventDefinition = {
      id,
      title: event.title.trim(),
      description: event.description.trim(),
      bannerUrl: event.bannerUrl || undefined,
      icon: event.icon || (event.type === 'clan' ? '🛡️' : '🎉'),
      type: event.type,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status: event.status || 'active',
      repeatCycle: event.repeatCycle || 'none',
      taskIds: event.taskIds || [],
      clanMilestones: event.clanMilestones || [],
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    this.db.prepare(`
      INSERT OR REPLACE INTO events (
        id, title, description, banner_url, icon, type, starts_at, ends_at,
        status, repeat_cycle, task_ids, clan_milestones, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      finalEvent.id,
      finalEvent.title,
      finalEvent.description,
      finalEvent.bannerUrl || null,
      finalEvent.icon,
      finalEvent.type,
      finalEvent.startsAt,
      finalEvent.endsAt,
      finalEvent.status,
      finalEvent.repeatCycle,
      JSON.stringify(finalEvent.taskIds),
      JSON.stringify(finalEvent.clanMilestones || []),
      finalEvent.createdAt,
      finalEvent.updatedAt
    );

    // Update event_id for attached tasks
    if (finalEvent.taskIds.length > 0) {
      for (const tid of finalEvent.taskIds) {
        this.db.prepare('UPDATE task_archive SET event_id = ? WHERE id = ?').run(finalEvent.id, tid);
      }
    }

    return finalEvent;
  }

  public deleteEvent(id: string): boolean {
    const res = this.db.prepare('DELETE FROM events WHERE id = ?').run(id);
    return res.changes > 0;
  }

  // ================= 4. PLAYER TASK PROGRESS & USER APIS =================
  private getUserProgressForTask(userId: string, task: TaskDefinition, assignedDate?: string): UserTaskProgress {
    let progressRow: any;
    if (assignedDate) {
      progressRow = this.db.prepare('SELECT * FROM user_task_progress WHERE user_id = ? AND task_id = ? AND assigned_date = ?').get(userId, task.id, assignedDate);
    } else {
      progressRow = this.db.prepare('SELECT * FROM user_task_progress WHERE user_id = ? AND task_id = ?').get(userId, task.id);
    }

    const currentCount = progressRow ? Number(progressRow.current_count) : 0;
    const isCompleted = progressRow ? Boolean(progressRow.is_completed) : currentCount >= task.targetCount;
    const isClaimed = progressRow ? Boolean(progressRow.is_claimed) : false;

    return {
      taskId: task.id,
      currentCount: Math.min(task.targetCount, currentCount),
      targetCount: task.targetCount,
      isCompleted,
      isClaimed,
      completedAt: progressRow?.completed_at || undefined,
      claimedAt: progressRow?.claimed_at || undefined,
      task
    };
  }

  // A. Global Tasks
  public getGlobalTasks(userId?: string): UserTaskProgress[] {
    const config = this.getConfig();
    if (!config.masterToggles.global) return [];

    const tasks = this.getAllArchiveTasks('global').filter(t => t.status === 'active');
    if (!userId) {
      return tasks.map(t => ({
        taskId: t.id,
        currentCount: 0,
        targetCount: t.targetCount,
        isCompleted: false,
        isClaimed: false,
        task: t
      }));
    }

    return tasks.map(t => this.getUserProgressForTask(userId, t));
  }

  // B. Onboarding Tasks (Only for players registered after task activation/startsAt)
  public getOnboardingTasks(userId?: string): UserTaskProgress[] {
    const config = this.getConfig();
    if (!config.masterToggles.onboarding) return [];

    const tasks = this.getAllArchiveTasks('onboarding').filter(t => t.status === 'active');
    if (!userId) return [];

    const user = userDb.getUserById(userId);
    if (!user) return [];

    const userCreatedAt = new Date(user.createdAt).getTime();

    // Filter tasks: Available ONLY if user registered after task onboarding_min_reg_date
    const eligibleTasks = tasks.filter(t => {
      const minDate = t.onboardingMinRegistrationDate || t.startsAt || t.createdAt;
      const minTime = new Date(minDate).getTime();
      return userCreatedAt >= minTime - 5000; // allow small skew
    });

    return eligibleTasks.map(t => this.getUserProgressForTask(userId, t));
  }

  // C. Personal Daily Tasks (Random 3 tasks pool + Reroll)
  public getPersonalTasksState(userId: string): PersonalTasksState {
    const config = this.getConfig();
    const dateStr = new Date().toISOString().slice(0, 10);
    const pool = this.getAllArchiveTasks('personal').filter(t => t.status === 'active');

    // Calculate next midnight reset
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const nextResetTimestamp = tomorrow.getTime();

    if (!config.masterToggles.personal || pool.length === 0) {
      return {
        tasks: [],
        dateStr,
        rerollsUsed: 0,
        freeRerollsRemaining: 0,
        rerollCost: config.personalRerollCost,
        nextResetTimestamp
      };
    }

    let personalRow = this.db.prepare('SELECT * FROM user_personal_tasks WHERE user_id = ? AND date_str = ?').get(userId, dateStr) as any;

    if (!personalRow) {
      // Pick 3 unique random tasks from pool
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const chosen = shuffled.slice(0, 3).map(t => t.id);

      const id = `${userId}_${dateStr}`;
      this.db.prepare(`
        INSERT INTO user_personal_tasks (id, user_id, date_str, task_ids, rerolls_used, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run(id, userId, dateStr, JSON.stringify(chosen), new Date().toISOString(), new Date().toISOString());

      personalRow = { task_ids: JSON.stringify(chosen), rerolls_used: 0 };
    }

    let taskIds: string[] = [];
    try {
      taskIds = JSON.parse(personalRow.task_ids);
    } catch {
      taskIds = [];
    }

    const rerollsUsed = Number(personalRow.rerolls_used || 0);
    const freeRemaining = Math.max(0, config.personalRerollFreeDailyLimit - rerollsUsed);

    const taskObjs = taskIds.map(tid => pool.find(p => p.id === tid)).filter(Boolean) as TaskDefinition[];
    const tasksProgress = taskObjs.map(t => this.getUserProgressForTask(userId, t, dateStr));

    return {
      tasks: tasksProgress,
      dateStr,
      rerollsUsed,
      freeRerollsRemaining: freeRemaining,
      rerollCost: config.personalRerollCost,
      nextResetTimestamp
    };
  }

  public rerollPersonalTask(userId: string, taskId: string): { success: boolean; newTask?: UserTaskProgress; remainingCredits?: number; message: string } {
    const config = this.getConfig();
    const dateStr = new Date().toISOString().slice(0, 10);
    const personalRow = this.db.prepare('SELECT * FROM user_personal_tasks WHERE user_id = ? AND date_str = ?').get(userId, dateStr) as any;
    if (!personalRow) {
      throw new Error('Персональные задачи на сегодня не найдены.');
    }

    let taskIds: string[] = JSON.parse(personalRow.task_ids);
    if (!taskIds.includes(taskId)) {
      throw new Error('Указанная задача отсутствует в вашем ежедневном списке.');
    }

    const rerollsUsed = Number(personalRow.rerolls_used || 0);
    const isFree = rerollsUsed < config.personalRerollFreeDailyLimit;

    // Check credits if paid reroll
    const user = userDb.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    if (!isFree) {
      if (user.credits < config.personalRerollCost) {
        throw new Error(`Недостаточно кредитов для реролла. Требуется ${config.personalRerollCost} кр.`);
      }
      userDb.updateCredits(userId, -config.personalRerollCost);
    }

    // Pick new replacement task from personal pool not already in taskIds
    const pool = this.getAllArchiveTasks('personal').filter(t => t.status === 'active' && !taskIds.includes(t.id));
    const replacement = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

    if (!replacement) {
      throw new Error('В архиве нет других доступных личных задач для замены.');
    }

    taskIds = taskIds.map(id => id === taskId ? replacement.id : id);

    this.db.prepare(`
      UPDATE user_personal_tasks SET
        task_ids = ?,
        rerolls_used = rerolls_used + 1,
        updated_at = ?
      WHERE user_id = ? AND date_str = ?
    `).run(JSON.stringify(taskIds), new Date().toISOString(), userId, dateStr);

    const newProgress = this.getUserProgressForTask(userId, replacement, dateStr);

    return {
      success: true,
      newTask: newProgress,
      remainingCredits: user.credits - (isFree ? 0 : config.personalRerollCost),
      message: isFree ? 'Задача бесплатно заменена!' : `Задача заменена за ${config.personalRerollCost} кр.`
    };
  }

  // D. Clan Tasks & WoT Blitz Style Milestones
  public getClanTasks(userId: string): UserTaskProgress[] {
    const config = this.getConfig();
    if (!config.masterToggles.clan) return [];

    const user = userDb.getUserById(userId);
    if (!user || !user.clanId) return [];

    const activeClanEvent = this.getActiveClanEvent();
    let tasks: TaskDefinition[] = [];

    if (activeClanEvent && activeClanEvent.tasks) {
      tasks = activeClanEvent.tasks;
    } else {
      tasks = this.getAllArchiveTasks('clan').filter(t => t.status === 'active');
    }

    return tasks.map(t => this.getUserProgressForTask(userId, t));
  }

  public getClanEventStatus(clanId: string, userId?: string): ClanEventStatus | null {
    const activeEvent = this.getActiveClanEvent();
    if (!activeEvent) return null;

    const clan = clanDb.getClanById(clanId);
    if (!clan) return null;

    const progressRow = this.db.prepare('SELECT * FROM clan_event_progress WHERE clan_id = ? AND event_id = ?').get(clanId, activeEvent.id) as any;

    let totalPoints = 0;
    let claimedMilestones: Record<string, number[]> = {};
    let memberContributions: Record<string, number> = {};

    if (progressRow) {
      totalPoints = Number(progressRow.total_clan_points || 0);
      try { claimedMilestones = JSON.parse(progressRow.claimed_milestones || '{}'); } catch {}
      try { memberContributions = JSON.parse(progressRow.member_contributions || '{}'); } catch {}
    }

    const milestones = activeEvent.clanMilestones || [];
    let currentStage = 0;
    for (const m of milestones) {
      if (totalPoints >= m.pointsRequired) {
        currentStage = Math.max(currentStage, m.stage);
      }
    }

    const myClaimedStages = userId && claimedMilestones[userId] ? claimedMilestones[userId] : [];
    const myContribution = userId && memberContributions[userId] ? memberContributions[userId] : 0;
    const ends = new Date(activeEvent.endsAt).getTime();
    const timeRemainingSeconds = Math.max(0, Math.floor((ends - Date.now()) / 1000));

    return {
      event: activeEvent,
      clanId,
      clanName: clan.name,
      totalPoints,
      currentStage,
      maxStages: milestones.length,
      claimedStages: myClaimedStages,
      myContribution,
      memberContributions,
      timeRemainingSeconds
    };
  }

  // Claim Task Reward (Credits, Item, XP, Clan Points)
  public claimTaskReward(userId: string, taskId: string): { success: boolean; creditsAdded: number; itemAdded?: string; xpAdded: number; clanPointsAdded: number; message: string } {
    const task = this.getTaskById(taskId);
    if (!task) throw new Error('Задача не найдена.');

    const user = userDb.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден.');

    const dateStr = task.type === 'personal' ? new Date().toISOString().slice(0, 10) : undefined;
    const progress = this.getUserProgressForTask(userId, task, dateStr);

    if (!progress.isCompleted) {
      throw new Error('Задача ещё не выполнена.');
    }
    if (progress.isClaimed) {
      throw new Error('Награда за эту задачу уже получена.');
    }

    const now = new Date().toISOString();
    const progressId = dateStr ? `${userId}_${taskId}_${dateStr}` : `${userId}_${taskId}`;

    // Mark claimed in DB
    this.db.prepare(`
      INSERT OR REPLACE INTO user_task_progress (
        id, user_id, task_id, current_count, is_completed, is_claimed, completed_at, claimed_at, assigned_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, 1, COALESCE((SELECT completed_at FROM user_task_progress WHERE id = ?), ?), ?, ?, COALESCE((SELECT created_at FROM user_task_progress WHERE id = ?), ?), ?)
    `).run(
      progressId,
      userId,
      taskId,
      task.targetCount,
      progressId,
      now,
      now,
      dateStr || null,
      progressId,
      now,
      now
    );

    // 1. Give credits
    if (task.rewardCredits > 0) {
      userDb.updateCredits(userId, task.rewardCredits);
    }

    // 2. Give XP
    if (task.rewardXp > 0) {
      userDb.addXp(userId, task.rewardXp, `Награда за задачу: ${task.title}`);
    }

    // 3. Give Item to inventory
    let itemGrantedName: string | undefined;
    if (task.rewardItemId) {
      userDb.addItemToInventory(userId, task.rewardItemId);
      itemGrantedName = task.rewardItemName || task.rewardItemId;
    }

    // 4. Give Clan Points if clan task
    let clanPointsAdded = 0;
    if (task.type === 'clan' && task.clanPoints > 0 && user.clanId) {
      clanPointsAdded = task.clanPoints;
      this.addClanPoints(user.clanId, userId, task.clanPoints);
    }

    return {
      success: true,
      creditsAdded: task.rewardCredits,
      itemAdded: itemGrantedName,
      xpAdded: task.rewardXp,
      clanPointsAdded,
      message: `Награда успешно получена: +${task.rewardCredits} кр, +${task.rewardXp} XP${itemGrantedName ? `, предмет «${itemGrantedName}»` : ''}${clanPointsAdded > 0 ? `, +${clanPointsAdded} очков клана` : ''}!`
    };
  }

  // Claim Clan Milestone Stage Prize (WoT Blitz Style)
  public claimClanMilestone(clanId: string, userId: string, stage: number): { success: boolean; creditsAdded: number; itemAdded?: string; message: string } {
    const clanStatus = this.getClanEventStatus(clanId, userId);
    if (!clanStatus) throw new Error('Активный клановый ивент не найден.');

    if (stage > clanStatus.currentStage) {
      throw new Error(`Этап ${stage} ещё не разблокирован вашим кланом. Наберите больше очков!`);
    }

    if (clanStatus.claimedStages.includes(stage)) {
      throw new Error(`Награда за этап ${stage} уже получена.`);
    }

    const milestone = clanStatus.event.clanMilestones?.find(m => m.stage === stage);
    if (!milestone) throw new Error('Этап не найден.');

    const newClaimed = [...clanStatus.claimedStages, stage];

    // Read full claimed map
    const progressRow = this.db.prepare('SELECT claimed_milestones FROM clan_event_progress WHERE clan_id = ? AND event_id = ?').get(clanId, clanStatus.event.id) as any;
    let fullMap: Record<string, number[]> = {};
    try { fullMap = JSON.parse(progressRow?.claimed_milestones || '{}'); } catch {}
    fullMap[userId] = newClaimed;

    this.db.prepare(`
      UPDATE clan_event_progress SET
        claimed_milestones = ?,
        updated_at = ?
      WHERE clan_id = ? AND event_id = ?
    `).run(JSON.stringify(fullMap), new Date().toISOString(), clanId, clanStatus.event.id);

    // Grant rewards to user
    if (milestone.rewardCredits > 0) {
      userDb.updateCredits(userId, milestone.rewardCredits);
    }
    if (milestone.rewardItemId) {
      userDb.addItemToInventory(userId, milestone.rewardItemId);
    }

    return {
      success: true,
      creditsAdded: milestone.rewardCredits,
      itemAdded: milestone.rewardItemName || milestone.rewardItemId,
      message: `Награда за Этап ${stage} получена: +${milestone.rewardCredits} кр${milestone.rewardItemName ? `, «${milestone.rewardItemName}»` : ''}!`
    };
  }

  private addClanPoints(clanId: string, userId: string, points: number) {
    const activeEvent = this.getActiveClanEvent();
    if (!activeEvent) return;

    const row = this.db.prepare('SELECT * FROM clan_event_progress WHERE clan_id = ? AND event_id = ?').get(clanId, activeEvent.id) as any;
    const now = new Date().toISOString();

    if (!row) {
      const id = `${clanId}_${activeEvent.id}`;
      const contribs: Record<string, number> = { [userId]: points };
      this.db.prepare(`
        INSERT INTO clan_event_progress (id, clan_id, event_id, total_clan_points, claimed_milestones, member_contributions, created_at, updated_at)
        VALUES (?, ?, ?, ?, '{}', ?, ?, ?)
      `).run(id, clanId, activeEvent.id, points, JSON.stringify(contribs), now, now);
    } else {
      let contribs: Record<string, number> = {};
      try { contribs = JSON.parse(row.member_contributions || '{}'); } catch {}
      contribs[userId] = (contribs[userId] || 0) + points;

      this.db.prepare(`
        UPDATE clan_event_progress SET
          total_clan_points = total_clan_points + ?,
          member_contributions = ?,
          updated_at = ?
        WHERE clan_id = ? AND event_id = ?
      `).run(points, JSON.stringify(contribs), now, clanId, activeEvent.id);
    }
  }

  // ================= 5. AUTOMATIC PROGRESS TRACKING =================
  public trackAction(
    userId: string,
    actionType: TaskActionType,
    count: number = 1,
    metadata?: { role?: string; won?: boolean; clanId?: string; hasClanMate?: boolean }
  ) {
    if (!userId) return;

    const now = new Date().toISOString();
    const dateStr = now.slice(0, 10);
    const user = userDb.getUserById(userId);
    if (!user) return;

    // Gather all active tasks for user
    const tasksToTrack: Array<{ task: TaskDefinition; dateStr?: string }> = [];

    // Global tasks
    this.getGlobalTasks(userId).forEach(p => {
      if (!p.isCompleted) tasksToTrack.push({ task: p.task });
    });

    // Onboarding tasks
    this.getOnboardingTasks(userId).forEach(p => {
      if (!p.isCompleted) tasksToTrack.push({ task: p.task });
    });

    // Personal tasks
    this.getPersonalTasksState(userId).tasks.forEach(p => {
      if (!p.isCompleted) tasksToTrack.push({ task: p.task, dateStr });
    });

    // Clan tasks
    if (user.clanId) {
      this.getClanTasks(userId).forEach(p => {
        if (!p.isCompleted) tasksToTrack.push({ task: p.task });
      });
    }

    for (const item of tasksToTrack) {
      const task = item.task;
      if (task.targetType !== actionType) continue;

      // Filter check (e.g. targetRole)
      if (task.targetRole && metadata?.role && task.targetRole !== metadata.role) {
        continue;
      }

      // If action is play_with_clan_member, check metadata
      if (actionType === 'play_with_clan_member' && !metadata?.hasClanMate) {
        continue;
      }

      // Update progress in DB
      const progressId = item.dateStr ? `${userId}_${task.id}_${item.dateStr}` : `${userId}_${task.id}`;
      const existing = this.db.prepare('SELECT current_count FROM user_task_progress WHERE id = ?').get(progressId) as any;
      const current = existing ? Number(existing.current_count) : 0;
      const nextCount = Math.min(task.targetCount, current + count);
      const isCompleted = nextCount >= task.targetCount ? 1 : 0;

      this.db.prepare(`
        INSERT OR REPLACE INTO user_task_progress (
          id, user_id, task_id, current_count, is_completed, is_claimed, completed_at, claimed_at, assigned_date, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          COALESCE((SELECT is_claimed FROM user_task_progress WHERE id = ?), 0),
          CASE WHEN ? = 1 THEN COALESCE((SELECT completed_at FROM user_task_progress WHERE id = ?), ?) ELSE NULL END,
          (SELECT claimed_at FROM user_task_progress WHERE id = ?),
          ?,
          COALESCE((SELECT created_at FROM user_task_progress WHERE id = ?), ?),
          ?
        )
      `).run(
        progressId,
        userId,
        task.id,
        nextCount,
        isCompleted,
        progressId,
        isCompleted,
        progressId,
        now,
        progressId,
        item.dateStr || null,
        progressId,
        now,
        now
      );
    }
  }

  // ================= 6. INITIAL SEEDING =================
  private ensureSeed() {
    this.getConfig(); // ensures events_and_tasks_config row

    const taskCount = (this.db.prepare('SELECT COUNT(*) as count FROM task_archive').get() as { count: number })?.count || 0;
    if (taskCount === 0) {
      const now = new Date().toISOString();
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // 1. GLOBAL TASKS
      const globalTasks: Array<Partial<TaskDefinition>> = [
        {
          id: 'task_global_1',
          title: 'Крещение огнём',
          description: 'Сыграйте 3 партии в Городе за любым столом',
          type: 'global',
          targetType: 'play_matches',
          targetCount: 3,
          rewardCredits: 200,
          rewardXp: 150,
          startsAt: now,
          endsAt: in30Days,
          status: 'active'
        },
        {
          id: 'task_global_2',
          title: 'Закон и порядок',
          description: 'Одержите 2 победы мирными жителями',
          type: 'global',
          targetType: 'win_matches',
          targetCount: 2,
          rewardCredits: 350,
          rewardItemId: 'chest_novice',
          rewardItemName: 'Сундук Мафиози',
          rewardXp: 200,
          startsAt: now,
          endsAt: in30Days,
          status: 'active'
        },
        {
          id: 'task_global_3',
          title: 'Ночной каратель',
          description: 'Победите в матче за мафию, дона или маньяка',
          type: 'global',
          targetType: 'win_matches',
          targetCount: 1,
          rewardCredits: 300,
          rewardItemId: 'card_role_select',
          rewardItemName: 'Карточка выбора роли',
          rewardXp: 180,
          startsAt: now,
          endsAt: in30Days,
          status: 'active'
        },
        {
          id: 'task_global_4',
          title: 'Железная выдержка',
          description: 'Суммарно переживите 10 игровых раундов',
          type: 'global',
          targetType: 'survive_rounds',
          targetCount: 10,
          rewardCredits: 250,
          rewardXp: 120,
          startsAt: now,
          endsAt: in30Days,
          status: 'active'
        }
      ];

      // 2. ONBOARDING TASKS
      const onboardingTasks: Array<Partial<TaskDefinition>> = [
        {
          id: 'task_onboarding_1',
          title: 'Первый шаг в Город',
          description: 'Сыграйте свою первую полную партию в Mafia Online',
          type: 'onboarding',
          targetType: 'play_matches',
          targetCount: 1,
          rewardCredits: 200,
          rewardItemId: 'cert_name_change',
          rewardItemName: 'Сертификат смены никнейма',
          rewardXp: 120,
          onboardingMinRegistrationDate: '2026-01-01T00:00:00.000Z',
          status: 'active'
        },
        {
          id: 'task_onboarding_2',
          title: 'Голос на городском суде',
          description: 'Напишите сообщение в чат во время дневного собрания жителей',
          type: 'onboarding',
          targetType: 'send_chat',
          targetCount: 1,
          rewardCredits: 100,
          rewardXp: 60,
          onboardingMinRegistrationDate: '2026-01-01T00:00:00.000Z',
          status: 'active'
        },
        {
          id: 'task_onboarding_3',
          title: 'Арсенал Синдиката',
          description: 'Примените любой предмет или карту из инвентаря',
          type: 'onboarding',
          targetType: 'use_item',
          targetCount: 1,
          rewardCredits: 150,
          rewardItemId: 'card_role_select',
          rewardItemName: 'Карточка выбора роли',
          rewardXp: 100,
          onboardingMinRegistrationDate: '2026-01-01T00:00:00.000Z',
          status: 'active'
        }
      ];

      // 3. PERSONAL DAILY TASKS
      const personalTasks: Array<Partial<TaskDefinition>> = [
        {
          id: 'task_personal_1',
          title: 'Уличный патруль',
          description: 'Сыграйте 2 партии за любым столом',
          type: 'personal',
          targetType: 'play_matches',
          targetCount: 2,
          rewardCredits: 120,
          rewardXp: 90,
          status: 'active'
        },
        {
          id: 'task_personal_2',
          title: 'Триумф стратегии',
          description: 'Одержите победу в 1 партии',
          type: 'personal',
          targetType: 'win_matches',
          targetCount: 1,
          rewardCredits: 160,
          rewardXp: 120,
          status: 'active'
        },
        {
          id: 'task_personal_3',
          title: 'Следственный эксперимент',
          description: 'Сыграйте партию за активную роль (Шериф, Дон, Доктор или Красотка)',
          type: 'personal',
          targetType: 'play_matches',
          targetCount: 1,
          rewardCredits: 130,
          rewardXp: 100,
          status: 'active'
        },
        {
          id: 'task_personal_4',
          title: 'Оратор Города',
          description: 'Отправьте 5 сообщений в игровом чате за день',
          type: 'personal',
          targetType: 'send_chat',
          targetCount: 5,
          rewardCredits: 100,
          rewardXp: 70,
          status: 'active'
        },
        {
          id: 'task_personal_5',
          title: 'Крепкий орешек',
          description: 'Переживите не менее 6 раундов за сегодня',
          type: 'personal',
          targetType: 'survive_rounds',
          targetCount: 6,
          rewardCredits: 140,
          rewardXp: 110,
          status: 'active'
        },
        {
          id: 'task_personal_6',
          title: 'Тайный визит',
          description: 'Используйте любой предмет или свиток в игре',
          type: 'personal',
          targetType: 'use_item',
          targetCount: 1,
          rewardCredits: 110,
          rewardXp: 80,
          status: 'active'
        }
      ];

      // 4. CLAN TASKS (с двойной наградой и очками клана)
      const clanTasks: Array<Partial<TaskDefinition>> = [
        {
          id: 'task_clan_1',
          title: 'Братство по оружию',
          description: 'Сыграйте партию вместе с соклановцем за одним игровым столом',
          type: 'clan',
          targetType: 'play_with_clan_member',
          targetCount: 1,
          rewardCredits: 200,
          rewardXp: 150,
          clanPoints: 35,
          status: 'active'
        },
        {
          id: 'task_clan_2',
          title: 'Охота Синдиката',
          description: 'Одержите 2 победы в партиях',
          type: 'clan',
          targetType: 'win_matches',
          targetCount: 2,
          rewardCredits: 250,
          rewardItemId: 'chest_novice',
          rewardItemName: 'Сундук Мафиози',
          rewardXp: 200,
          clanPoints: 50,
          status: 'active'
        },
        {
          id: 'task_clan_3',
          title: 'Тотальное доминирование',
          description: 'Сыграйте 4 матча за клан',
          type: 'clan',
          targetType: 'play_matches',
          targetCount: 4,
          rewardCredits: 300,
          rewardXp: 220,
          clanPoints: 60,
          status: 'active'
        },
        {
          id: 'task_clan_4',
          title: 'Семья не сдаётся',
          description: 'Переживите суммарно 12 раундов',
          type: 'clan',
          targetType: 'survive_rounds',
          targetCount: 12,
          rewardCredits: 220,
          rewardXp: 160,
          clanPoints: 40,
          status: 'active'
        }
      ];

      for (const t of [...globalTasks, ...onboardingTasks, ...personalTasks, ...clanTasks]) {
        this.saveTask(t as any);
      }

      // Seed Active Clan Event (WoT Blitz Style with 8 Stages)
      const clanMilestones: ClanMilestone[] = [
        { stage: 1, pointsRequired: 50, rewardCredits: 250, title: 'Бронзовый аванс', icon: '🥉', description: '250 кр в казну каждого бойца' },
        { stage: 2, pointsRequired: 120, rewardCredits: 500, rewardItemId: 'chest_novice', rewardItemName: 'Сундук Мафиози', title: 'Оружейный схрон', icon: '📦', description: '500 кр + Сундук Мафиози' },
        { stage: 3, pointsRequired: 220, rewardCredits: 800, rewardItemId: 'card_role_select', rewardItemName: 'Карточка выбора роли', title: 'Ордер Синдиката', icon: '🎴', description: '800 кр + Заказ роли' },
        { stage: 4, pointsRequired: 350, rewardCredits: 1200, rewardItemId: 'chest_novice', rewardItemName: 'Золотой сундук', title: 'Сейф Магистрата', icon: '💼', description: '1200 кр + Ценные трофеи' },
        { stage: 5, pointsRequired: 500, rewardCredits: 1600, rewardItemId: 'cert_name_change', rewardItemName: 'Сертификат смены ника', title: 'Новое имя', icon: '📜', description: '1600 кр + Гербовый сертификат' },
        { stage: 6, pointsRequired: 700, rewardCredits: 2200, rewardItemId: 'card_role_select', rewardItemName: '2х Карты роли', title: 'Контроль квартала', icon: '💎', description: '2200 кр + 2 Карты роли' },
        { stage: 7, pointsRequired: 950, rewardCredits: 3000, title: 'Власть Синдиката', icon: '⭐', description: '3000 кр + Клановый авторитет' },
        { stage: 8, pointsRequired: 1300, rewardCredits: 5000, rewardItemId: 'card_role_select', rewardItemName: 'Легендарный пак', title: 'Крестный Отец Города', icon: '👑', description: '5000 кр + Полный триумф клана' }
      ];

      this.saveEvent({
        id: 'event_clan_current',
        title: 'Битва Синдикатов: Неделя Власти',
        description: 'Выполняйте клановые задачи, зарабатывайте специальные очки клана и открывайте этапы наград для всех участников семьи!',
        icon: '🛡️',
        type: 'clan',
        startsAt: now,
        endsAt: in7Days,
        status: 'active',
        repeatCycle: 'weekly',
        taskIds: ['task_clan_1', 'task_clan_2', 'task_clan_3', 'task_clan_4'],
        clanMilestones
      });

      // Seed Active General Event
      this.saveEvent({
        id: 'event_general_autumn',
        title: 'Осенний Синдикат: Война за Районы',
        description: 'Сезонное общегородское событие для всех жителей. Выполняйте цепочку общих задач и забирайте ценные призы!',
        icon: '🍂',
        type: 'general',
        startsAt: now,
        endsAt: in30Days,
        status: 'active',
        repeatCycle: 'monthly',
        taskIds: ['task_global_1', 'task_global_2', 'task_global_3', 'task_global_4']
      });

      console.log('[SQLite] Successfully seeded events and task archive.');
    }
  }
}

export const eventsDb = new EventsDatabase();
