export type FeedbackType = 'bug' | 'idea' | 'improvement' | 'other';
export type FeedbackStatus = 'pending' | 'reviewed' | 'rewarded' | 'declined' | 'fixed';

export interface FeedbackRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userAvatarSeed?: string;
  type: FeedbackType;
  title: string;
  description: string;
  images: string[]; // Base64 data URLs or image URLs
  status: FeedbackStatus;
  adminNote?: string;
  rewardCredits?: number;
  rewardedAt?: string;
  rewardedByAdminName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeedbackPayload {
  type: FeedbackType;
  title: string;
  description: string;
  images?: string[];
}
