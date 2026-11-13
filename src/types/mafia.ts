export type RoleId = 
  | 'civilian'      // Мирный житель
  | 'mafia'         // Мафия
  | 'don'           // Дон Мафии
  | 'sheriff'       // Шериф / Комиссар Катани
  | 'doctor'        // Доктор
  | 'courtesan'     // Куртизанка / Путана
  | 'maniac'        // Маньяк (одиночка)
  | 'bodyguard';    // Телохранитель

export type Team = 'civilians' | 'mafia' | 'maniac';
export type GameWinner = Team | 'draw';

export interface RoleDefinition {
  id: RoleId;
  name: string;
  team: Team;
  nightPriority: number; // Order in which actions resolve
  description: string;
  actionPrompt?: string;
  winCondition?: string;
  objective?: string;
  specialAbilities?: string[];
  tips?: string[];
  nightAction: boolean;
  color: string;
  icon: string;
}

export type GamePhase = 
  | 'LOBBY'
  | 'ROLE_REVEAL'
  | 'MAFIA_MEETING'
  | 'DAY_DISCUSSION'
  | 'INDIVIDUAL_SPEECHES'
  | 'VOTING'
  | 'DEFENSE_SPEECH'
  | 'REVOTE'
  | 'LAST_WORDS_ARREST'
  | 'NIGHT'
  | 'MORNING_REPORT'
  | 'LAST_WORDS_KILLED'
  | 'GAME_OVER';

export interface Player {
  id: string;
  name: string;
  avatarSeed: string;
  isHost: boolean;
  isBot: boolean;
  isRegistered?: boolean;            // Достоверный серверный признак зарегистрированного аккаунта
  isAlive: boolean;
  role?: RoleId;
  preferredRole?: RoleId | null;     // Роль, выбранная через карточку выбора роли
  hasUsedRoleCard?: boolean;         // Использовал ли карточку выбора роли в лобби
  roleCardUsageKey?: string | null;  // Идентификатор активации карточки выбора роли в лобби (для идемпотентного возврата)
  clanTag?: string | null;           // Тег клана [TAG]
  clanName?: string | null;          // Название клана
  connected: boolean;
  ready: boolean;
  notes?: string;
  votedFor?: string | null; // playerId or 'skip' or null
  nominatedBy?: string | null;
  warningsCount: number;
}

export interface NightActions {
  mafiaVotes: Record<string, string>; // mafiaPlayerId -> targetPlayerId
  donCheck?: string; // playerId target
  sheriffCheck?: string; // playerId target
  doctorHeal?: string; // playerId target
  courtesanBlock?: string; // playerId target
  courtesanVisit?: string; // alias for courtesanBlock
  maniacKill?: string; // playerId target
  bodyguardProtect?: string; // playerId target
}

export interface NightResult {
  killedPlayerIds: string[];
  healedPlayerIds: string[];
  blockedPlayerId?: string;
  sheriffInvestigation?: {
    targetId: string;
    isMafia: boolean;
  };
  donInvestigation?: {
    targetId: string;
    isSheriff: boolean;
  };
  narrativeText: string[];
}

export interface Spectator {
  id: string;
  name: string;
  avatarSeed?: string;
  isRegistered?: boolean;
  clanTag?: string | null;
  clanName?: string | null;
  joinedAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  channel: 'all' | 'mafia' | 'dead' | 'system';
  text: string;
  timestamp: number;
  isSystem?: boolean;
  isSpectator?: boolean;
  clanTag?: string | null;
}

export interface RoomSettings {
  gameMode: 'classic' | 'sport';
  maxPlayers: number;
  generalDiscussionDuration: number;
  individualSpeechDuration: number;
  nightDurationSeconds: number;
  votingDurationSeconds: number;
  firstDayVoting: boolean;
  enabledRoles: {
    don: boolean;
    sheriff: boolean;
    doctor: boolean;
    courtesan: boolean;
    maniac: boolean;
    bodyguard: boolean;
  };
  allowSelfHealOnce: boolean;
  doctorSavesFromCourtesanDeath: boolean; // «Доктор спасает от совместной гибели с Путаной»
  anonymousVoting: boolean;
  isPublic: boolean;
}

export interface RoomState {
  roomCode: string;
  roomName: string;
  hostId: string;
  phase: GamePhase;
  phaseTimeRemaining: number;
  dayNumber: number;
  players: Player[];
  spectators?: Spectator[];
  spectatorCount?: number;
  settings: RoomSettings;
  winner?: GameWinner | null;
  nominatedPlayerIds: string[];
  currentSpeakerId?: string | null;
  courtesanBlockedPlayerId?: string | null; // ID игрока, получившего дневную блокировку от Путаны
  doctorLastHealedPlayerId?: string | null; // ID игрока, которого Доктор лечил прошлой ночью
  defenseCandidates?: string[];
  tieVotersExcluded?: string[];
  phaseSkipVotedIds?: string[];
  lastWordsQueue?: string[];
  playerOnDefenseId?: string | null;
  lastNightResult?: NightResult;
  lastEliminatedPlayer?: {
    player: Player;
    reason: 'vote' | 'mafia' | 'maniac';
  } | null;
  gameLogs: string[];
  votesCastCount?: number;
  totalEligibleVoters?: number;
  currentSpeakerHasNominated?: boolean;
  nightActionsCompleted?: string[];
  totalNightActiveRoles?: number;
  nightSkipVotesCount?: number;
  closingAfterMatch?: boolean;
  closingCountdownSeconds?: number | null;
}

// Client-view of room state (hides secret roles unless game over or spectating dead)
export interface ClientRoomState extends Omit<RoomState, 'players'> {
  players: (Omit<Player, 'role'> & { role?: RoleId })[];
  spectators?: Spectator[];
  spectatorCount?: number;
  isSpectator?: boolean;
  myRole?: RoleId;
  myTeammates?: { id: string; name: string; role: RoleId }[];
  sheriffLastCheckResult?: { targetId: string; isMafia: boolean } | null;
  donLastCheckResult?: { targetId: string; isSheriff: boolean } | null;
  sheriffCurrentCheckResult?: { targetId: string; isMafia: boolean } | null;
  donCurrentCheckResult?: { targetId: string; isSheriff: boolean } | null;
  sessionXp?: number;
  sessionXpAwards?: Array<{ reason: string; xp: number; timestamp: number }>;
  gameOverReward?: { 
    xpEarned: number; 
    totalXp: number; 
    oldLevel: number; 
    newLevel: number; 
    leveledUp: boolean; 
    awards: Array<{ reason: string; xp: number }>;
  } | null;
}

export interface PublicRoomSummary {
  roomCode: string;
  roomName: string;
  playerCount: number;
  maxPlayers: number;
  inGame: boolean;
  hostName: string;
}

export type PublicRoomsStatus = 'loading' | 'loaded' | 'error';

export type {
  PremiumTier,
  PremiumTierConfig,
  PremiumConfig,
  PremiumCertificatePayload,
  UserPremiumStatus,
  ActiveUserPremium
} from '../data/items';
export { PREMIUM_CERTIFICATE_ITEM_ID } from '../data/items';
