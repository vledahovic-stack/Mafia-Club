export type TaskType = 'global' | 'onboarding' | 'personal' | 'clan';

export type TaskStatus = 'draft' | 'scheduled' | 'active' | 'completed';

export type RepeatCycle = 'none' | 'daily' | 'weekly' | 'monthly';

export type TaskActionType = 
  | 'play_matches' 
  | 'win_matches' 
  | 'play_role' 
  | 'survive_rounds' 
  | 'use_item' 
  | 'send_chat' 
  | 'invite_friend' 
  | 'play_with_clan_member';

export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  targetType: TaskActionType;
  targetCount: number;
  targetRole?: string;
  rewardCredits: number;
  rewardItemId?: string;
  rewardItemName?: string;
  rewardXp: number;
  clanPoints: number; // специальный клановый опыт/очки
  startsAt?: string;
  endsAt?: string;
  status: TaskStatus;
  isRepeatable: boolean;
  repeatCycle: RepeatCycle;
  onboardingMinRegistrationDate?: string;
  eventId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClanMilestone {
  stage: number;
  pointsRequired: number;
  rewardCredits: number;
  rewardItemId?: string;
  rewardItemName?: string;
  title: string;
  icon?: string;
  description?: string;
}

export interface EventDefinition {
  id: string;
  title: string;
  description: string;
  bannerUrl?: string;
  icon: string;
  type: 'general' | 'clan';
  startsAt: string;
  endsAt: string;
  status: TaskStatus;
  repeatCycle: RepeatCycle;
  taskIds: string[];
  tasks?: TaskDefinition[];
  clanMilestones?: ClanMilestone[];
  createdAt: string;
  updatedAt: string;
}

export interface UserTaskProgress {
  taskId: string;
  currentCount: number;
  targetCount: number;
  isCompleted: boolean;
  isClaimed: boolean;
  completedAt?: string;
  claimedAt?: string;
  task: TaskDefinition;
}

export interface EventsConfig {
  masterToggles: {
    global: boolean;
    onboarding: boolean;
    personal: boolean;
    clan: boolean;
  };
  personalRerollFreeDailyLimit: number;
  personalRerollCost: number;
  updatedAt?: string;
}

export interface PersonalTasksState {
  tasks: UserTaskProgress[];
  dateStr: string;
  rerollsUsed: number;
  freeRerollsRemaining: number;
  rerollCost: number;
  nextResetTimestamp: number;
}

export interface ClanEventStatus {
  event: EventDefinition;
  clanId: string;
  clanName: string;
  totalPoints: number;
  currentStage: number;
  maxStages: number;
  claimedStages: number[];
  myContribution: number;
  memberContributions: Record<string, number>;
  timeRemainingSeconds: number;
}
