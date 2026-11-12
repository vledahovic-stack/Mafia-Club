export type NotificationCategory = 'friends' | 'rewards' | 'system' | 'general';

export type NotificationFilter = 'all' | 'unread' | NotificationCategory;

export type NotificationType =
  | 'friend_request'
  | 'room_invite'
  | 'reward'
  | 'system_alert'
  | 'info'
  | string;

export type NotificationActionState =
  | 'none'
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired';

export interface UserNotification {
  id: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  actorId?: string | null;
  title: string;
  message: string;
  data?: Record<string, any> | null;
  isRead: boolean;
  isInteractive: boolean;
  actionState: NotificationActionState;
  eventKey?: string | null;
  createdAt: string;
  updatedAt: string;
  readAt?: string | null;
}

export interface GetNotificationsResponse {
  notifications: UserNotification[];
  total: number;
  unreadCount: number;
}
