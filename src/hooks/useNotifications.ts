import { useState, useEffect, useCallback, useRef } from 'react';
import { AuthUser } from '../components/AuthModal';
import { UserNotification, NotificationFilter, GetNotificationsResponse } from '../types/notifications';
import { sounds } from '../utils/audio';

interface UseNotificationsProps {
  user?: AuthUser | null;
  soundEnabled?: boolean;
  isMatchActive?: boolean;
}

export function useNotifications({
  user,
  soundEnabled = true,
  isMatchActive = false
}: UseNotificationsProps) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [latestIncomingToast, setLatestIncomingToast] = useState<UserNotification | null>(null);
  const [hasNewAnimation, setHasNewAnimation] = useState<boolean>(false);

  const filterRef = useRef<NotificationFilter>(filter);
  filterRef.current = filter;

  const userRef = useRef<string | null>(user?.id || null);
  const isMatchActiveRef = useRef<boolean>(isMatchActive);
  isMatchActiveRef.current = isMatchActive;
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mafia_auth_token') : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }, []);

  // Initial and filtered notifications fetch
  const fetchNotifications = useCallback(
    async (refresh: boolean = true, targetFilter?: NotificationFilter) => {
      if (!user) {
        setNotifications([]);
        setUnreadCount(0);
        setTotal(0);
        return;
      }

      const activeFilter = targetFilter !== undefined ? targetFilter : filterRef.current;
      if (refresh) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const offset = refresh ? 0 : notifications.length;
        const limit = 20;
        const queryParams = new URLSearchParams({
          limit: String(limit),
          offset: String(offset)
        });

        if (activeFilter === 'unread') {
          queryParams.set('unreadOnly', 'true');
        } else if (activeFilter !== 'all') {
          queryParams.set('category', activeFilter);
        }

        const res = await fetch(`/api/notifications?${queryParams.toString()}`, {
          headers: getAuthHeaders()
        });

        if (!res.ok) {
          throw new Error('Не удалось загрузить уведомления');
        }

        const data: GetNotificationsResponse = await res.json();

        setNotifications(prev => (refresh ? data.notifications : [...prev, ...data.notifications]));
        setTotal(data.total);
        setUnreadCount(data.unreadCount);
      } catch (err) {
        console.error('[useNotifications] fetch error:', err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [user, getAuthHeaders, notifications.length]
  );

  // Quick unread count check
  const refreshUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await fetch('/api/notifications/unread-count', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(Number(data.unreadCount || 0));
      }
    } catch {}
  }, [user, getAuthHeaders]);

  // Load more paginated notifications
  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || notifications.length >= total) return;
    await fetchNotifications(false);
  }, [isLoading, isLoadingMore, notifications.length, total, fetchNotifications]);

  // Mark single as read
  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!user) return;
      try {
        const res = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications(prev =>
            prev.map(n =>
              n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
            )
          );
          if (typeof data.unreadCount === 'number') {
            setUnreadCount(data.unreadCount);
          } else {
            setUnreadCount(c => Math.max(0, c - 1));
          }
        }
      } catch (err) {
        console.error('[useNotifications] markAsRead error:', err);
      }
    },
    [user, getAuthHeaders]
  );

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
        );
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('[useNotifications] markAllAsRead error:', err);
    }
  }, [user, getAuthHeaders]);

  // Delete single notification
  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (!user) return;
      try {
        const res = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications(prev => prev.filter(n => n.id !== notificationId));
          setTotal(t => Math.max(0, t - 1));
          if (typeof data.unreadCount === 'number') {
            setUnreadCount(data.unreadCount);
          }
        }
      } catch (err) {
        console.error('[useNotifications] deleteNotification error:', err);
      }
    },
    [user, getAuthHeaders]
  );

  // Delete all read notifications
  const deleteAllRead = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        // Remove read notifications, preserving protected pending interactive actions
        setNotifications(prev =>
          prev.filter(n => !n.isRead || (n.isInteractive && n.actionState === 'pending'))
        );
        setTotal(t => Math.max(0, t - (data.deletedCount || 0)));
        if (typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch (err) {
      console.error('[useNotifications] deleteAllRead error:', err);
    }
  }, [user, getAuthHeaders]);

  // Execute interactive action (e.g. friend request accept / decline)
  const executeAction = useCallback(
    async (
      notificationId: string,
      action: 'accept' | 'decline'
    ): Promise<{ success: boolean; error?: string }> => {
      if (!user) return { success: false, error: 'Требуется авторизация' };

      try {
        const res = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/action`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ action })
        });
        const data = await res.json();

        if (!res.ok) {
          // If already processed, update state in list
          if (data.alreadyProcessed && data.actionState) {
            setNotifications(prev =>
              prev.map(n =>
                n.id === notificationId
                  ? { ...n, actionState: data.actionState, isRead: true }
                  : n
              )
            );
          }
          return { success: false, error: data.error || 'Ошибка выполнения действия' };
        }

        const newState = action === 'accept' ? 'accepted' : 'declined';
        setNotifications(prev =>
          prev.map(n =>
            n.id === notificationId
              ? {
                  ...n,
                  actionState: newState,
                  isRead: true,
                  updatedAt: new Date().toISOString()
                }
              : n
          )
        );

        if (typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }

        // Notify other components (FriendsView, TableContextMenu) that friendship changed
        window.dispatchEvent(
          new CustomEvent('mafia_friends_updated', {
            detail: { type: 'FRIEND_REQUEST_PROCESSED', action, notificationId }
          })
        );

        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Ошибка выполнения действия';
        return { success: false, error: msg };
      }
    },
    [user, getAuthHeaders]
  );

  // Change category filter
  const changeFilter = useCallback(
    (newFilter: NotificationFilter) => {
      setFilter(newFilter);
      fetchNotifications(true, newFilter);
    },
    [fetchNotifications]
  );

  // Dismiss popup toast
  const dismissToast = useCallback(() => {
    setLatestIncomingToast(null);
  }, []);

  // Account change and cleanup effect
  useEffect(() => {
    const currentId = user?.id || null;
    if (userRef.current !== currentId) {
      userRef.current = currentId;
      setNotifications([]);
      setUnreadCount(0);
      setTotal(0);
      setLatestIncomingToast(null);
      setFilter('all');

      if (currentId) {
        fetchNotifications(true, 'all');
      }
    }
  }, [user?.id, fetchNotifications]);

  // Initial fetch on mount if logged in
  useEffect(() => {
    if (user?.id) {
      fetchNotifications(true);
      refreshUnreadCount();
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // WebSocket event listener
  useEffect(() => {
    const handleWsNotification = (e: Event) => {
      const customEvent = e as CustomEvent;
      const data = customEvent.detail;
      if (!data) return;

      if (data.type === 'NOTIFICATION_NEW') {
        const newNotif = data.payload?.notification as UserNotification;
        if (!newNotif) return;

        setUnreadCount(data.payload?.unreadCount ?? (c => c + 1));
        setTotal(t => t + 1);

        // Bell shake animation
        setHasNewAnimation(true);
        setTimeout(() => setHasNewAnimation(false), 1200);

        // Sound effect (if sound enabled)
        if (soundEnabledRef.current) {
          try {
            sounds.playTick();
          } catch {}
        }

        // HUD toast (ONLY when NOT in active match to avoid obstructing critical game UI)
        if (!isMatchActiveRef.current) {
          setLatestIncomingToast(newNotif);
        }

        // Prepend to list if matches filter
        setNotifications(prev => {
          if (prev.some(n => n.id === newNotif.id)) {
            return prev.map(n => (n.id === newNotif.id ? newNotif : n));
          }
          const curFilter = filterRef.current;
          if (curFilter === 'all' || curFilter === 'unread' || curFilter === newNotif.category) {
            return [newNotif, ...prev];
          }
          return prev;
        });
      } else if (data.type === 'NOTIFICATION_UPDATE') {
        const updated = data.payload?.notification as UserNotification;
        if (updated) {
          setNotifications(prev =>
            prev.map(n => (n.id === updated.id ? { ...n, ...updated } : n))
          );
        }
        if (typeof data.payload?.unreadCount === 'number') {
          setUnreadCount(data.payload.unreadCount);
        }
      } else if (data.type === 'NOTIFICATION_BADGE_UPDATE') {
        if (typeof data.payload?.unreadCount === 'number') {
          setUnreadCount(data.payload.unreadCount);
        }
      }
    };

    window.addEventListener('mafia_notification_event', handleWsNotification);
    return () => {
      window.removeEventListener('mafia_notification_event', handleWsNotification);
    };
  }, []);

  // Auto-dismiss HUD toast after 5s
  useEffect(() => {
    if (!latestIncomingToast) return;
    const timer = setTimeout(() => {
      setLatestIncomingToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [latestIncomingToast]);

  return {
    notifications,
    unreadCount,
    total,
    isLoading,
    isLoadingMore,
    hasMore: notifications.length < total,
    filter,
    setFilter: changeFilter,
    hasNewAnimation,
    latestIncomingToast,
    dismissToast,
    fetchNotifications,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllRead,
    executeAction
  };
}
