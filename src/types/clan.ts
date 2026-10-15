export interface ClanMember {
  userId: string;
  displayName: string;
  avatarSeed: string;
  role: 'leader' | 'member';
  joinedAt: string;
  rating: number;
}

export interface Clan {
  id: string;
  name: string;
  tag: string; // e.g. "DON", 2-6 chars
  description?: string;
  createdAt: string;
  leaderId: string;
  leaderName: string;
  memberCount: number;
  members: ClanMember[];
  totalRating: number;
  avatarIcon?: string;
}

export interface CreateClanPayload {
  name: string;
  tag: string;
  description?: string;
  avatarIcon?: string;
}
