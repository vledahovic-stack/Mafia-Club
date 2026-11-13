import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  UserCheck,
  UserMinus,
  UserX,
  Clock,
  Check,
  Loader2,
  Bot,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  User
} from 'lucide-react';
import { sounds } from '../utils/audio';

export type TableFriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

export interface TableTargetPlayer {
  id: string;
  name: string;
  avatarSeed?: string;
  clanTag?: string | null;
  isBot: boolean;
  isRegistered?: boolean;
  isHost?: boolean;
  connected?: boolean;
}

export interface TableFriendFeedback {
  playerId: string;
  type: 'success' | 'error';
  text: string;
}

export function useTableFriends(isLoggedIn: boolean, currentUserId?: string | null) {
  const [friendStatusMap, setFriendStatusMap] = useState<Record<string, TableFriendStatus>>({});
  const [blockedMap, setBlockedMap] = useState<Record<string, boolean>>({});
  const [loadingPlayerId, setLoadingPlayerId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<TableFriendFeedback | null>(null);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('mafia_auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }, []);

  const showFeedback = useCallback((playerId: string, type: 'success' | 'error', text: string) => {
    setFeedback({ playerId, type, text });
    setTimeout(() => {
      setFeedback(prev => (prev && prev.playerId === playerId && prev.text === text ? null : prev));
    }, 3500);
  }, []);

  const refreshFriends = useCallback(async () => {
    if (!isLoggedIn || !currentUserId) {
      setFriendStatusMap({});
      return;
    }
    const token = localStorage.getItem('mafia_auth_token');
    if (!token) return;

    try {
      const res = await fetch('/api/friends', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data.friends) ? data.friends : [];
      const nextMap: Record<string, TableFriendStatus> = {};
      for (const item of list) {
        if (item && typeof item.id === 'string' && item.status) {
          nextMap[item.id] = item.status as TableFriendStatus;
        }
      }
      setFriendStatusMap(nextMap);
    } catch {
      // Ignore transient network errors
    }
  }, [isLoggedIn, currentUserId]);

  const refreshBlocks = useCallback(async () => {
    if (!isLoggedIn || !currentUserId) {
      setBlockedMap({});
      return;
    }
    const token = localStorage.getItem('mafia_auth_token');
    if (!token) return;

    try {
      const res = await fetch('/api/friends/blocked', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data.blockedUsers) ? data.blockedUsers : [];
      const nextMap: Record<string, boolean> = {};
      for (const item of list) {
        if (item && typeof item.id === 'string') {
          nextMap[item.id] = true;
        }
      }
      setBlockedMap(nextMap);
    } catch {
      // Ignore transient network errors
    }
  }, [isLoggedIn, currentUserId]);

  useEffect(() => {
    refreshFriends();
    refreshBlocks();
  }, [refreshFriends, refreshBlocks]);

  useEffect(() => {
    const handleFriendsUpdated = () => {
      refreshFriends();
      refreshBlocks();
    };
    window.addEventListener('mafia_friends_updated', handleFriendsUpdated);
    return () => {
      window.removeEventListener('mafia_friends_updated', handleFriendsUpdated);
    };
  }, [refreshFriends, refreshBlocks]);

  const getFriendStatus = useCallback(
    (targetPlayerId: string): TableFriendStatus => {
      return friendStatusMap[targetPlayerId] || 'none';
    },
    [friendStatusMap]
  );

  const isPlayerBlocked = useCallback(
    (targetPlayerId: string): boolean => {
      return Boolean(blockedMap[targetPlayerId]);
    },
    [blockedMap]
  );

  const sendFriendRequestToPlayer = useCallback(
    async (targetPlayer: TableTargetPlayer) => {
      if (!isLoggedIn || !currentUserId) {
        showFeedback(targetPlayer.id, 'error', 'Войдите в аккаунт для добавления в друзья.');
        return false;
      }
      if (targetPlayer.id === currentUserId) {
        showFeedback(targetPlayer.id, 'error', 'Нельзя добавить в друзья самого себя.');
        return false;
      }
      if (targetPlayer.isBot || !targetPlayer.isRegistered) {
        showFeedback(targetPlayer.id, 'error', 'Добавление в друзья доступно только для зарегистрированных игроков.');
        return false;
      }
      if (blockedMap[targetPlayer.id]) {
        showFeedback(targetPlayer.id, 'error', 'Вы заблокировали этого пользователя. Сначала разблокируйте его в чёрном списке.');
        return false;
      }
      if (loadingPlayerId) return false;

      const currentStatus = getFriendStatus(targetPlayer.id);
      if (currentStatus === 'accepted') {
        showFeedback(targetPlayer.id, 'error', 'Этот игрок уже у вас в друзьях.');
        return false;
      }
      if (currentStatus === 'pending_sent') {
        showFeedback(targetPlayer.id, 'error', 'Заявка в друзья уже отправлена.');
        return false;
      }

      setLoadingPlayerId(targetPlayer.id);
      try {
        const res = await fetch('/api/friends/request', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            targetUserId: targetPlayer.id,
            targetIdentifier: targetPlayer.id
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Не удалось отправить заявку в друзья.');
        }

        const newStatus: TableFriendStatus =
          data.friend?.status === 'accepted' ? 'accepted' : 'pending_sent';

        setFriendStatusMap(prev => ({
          ...prev,
          [targetPlayer.id]: newStatus
        }));

        sounds.playTick();
        showFeedback(
          targetPlayer.id,
          'success',
          newStatus === 'accepted'
            ? `Вы теперь друзья с ${targetPlayer.name}!`
            : 'Заявка в друзья отправлена!'
        );
        refreshFriends();
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Ошибка отправки заявки.';
        showFeedback(targetPlayer.id, 'error', msg);
        refreshFriends();
        return false;
      } finally {
        setLoadingPlayerId(null);
      }
    },
    [isLoggedIn, currentUserId, loadingPlayerId, blockedMap, getFriendStatus, getAuthHeaders, showFeedback, refreshFriends]
  );

  const acceptFriendRequestFromPlayer = useCallback(
    async (targetPlayer: TableTargetPlayer) => {
      if (!isLoggedIn || !currentUserId) {
        showFeedback(targetPlayer.id, 'error', 'Войдите в аккаунт для принятия заявки.');
        return false;
      }
      if (targetPlayer.id === currentUserId || targetPlayer.isBot || !targetPlayer.isRegistered) {
        return false;
      }
      if (loadingPlayerId) return false;

      setLoadingPlayerId(targetPlayer.id);
      try {
        const res = await fetch('/api/friends/accept', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            targetUserId: targetPlayer.id
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Не удалось принять заявку в друзья.');
        }

        setFriendStatusMap(prev => ({
          ...prev,
          [targetPlayer.id]: 'accepted'
        }));

        sounds.playTick();
        showFeedback(targetPlayer.id, 'success', `Заявка принята! ${targetPlayer.name} в друзьях.`);
        refreshFriends();
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Ошибка принятия заявки.';
        showFeedback(targetPlayer.id, 'error', msg);
        refreshFriends();
        return false;
      } finally {
        setLoadingPlayerId(null);
      }
    },
    [isLoggedIn, currentUserId, loadingPlayerId, getAuthHeaders, showFeedback, refreshFriends]
  );

  const removeFriendFromPlayer = useCallback(
    async (targetPlayer: TableTargetPlayer) => {
      if (!isLoggedIn || !currentUserId) {
        showFeedback(targetPlayer.id, 'error', 'Войдите в аккаунт для удаления из друзей.');
        return false;
      }
      if (targetPlayer.id === currentUserId || targetPlayer.isBot || !targetPlayer.isRegistered) {
        return false;
      }
      if (loadingPlayerId) return false;

      setLoadingPlayerId(targetPlayer.id);
      try {
        const res = await fetch('/api/friends/remove', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            targetUserId: targetPlayer.id
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Не удалось удалить игрока из друзей.');
        }

        setFriendStatusMap(prev => {
          const next = { ...prev };
          delete next[targetPlayer.id];
          return next;
        });

        sounds.playTick();
        showFeedback(targetPlayer.id, 'success', data.message || `Игрок ${targetPlayer.name} удален из друзей.`);
        refreshFriends();
        window.dispatchEvent(
          new CustomEvent('mafia_friends_updated', {
            detail: { type: 'FRIEND_REMOVED', targetUserId: targetPlayer.id }
          })
        );
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Ошибка удаления из друзей.';
        showFeedback(targetPlayer.id, 'error', msg);
        refreshFriends();
        return false;
      } finally {
        setLoadingPlayerId(null);
      }
    },
    [isLoggedIn, currentUserId, loadingPlayerId, getAuthHeaders, showFeedback, refreshFriends]
  );

  const blockPlayer = useCallback(
    async (targetPlayer: TableTargetPlayer) => {
      if (!isLoggedIn || !currentUserId) {
        showFeedback(targetPlayer.id, 'error', 'Войдите в аккаунт для блокировки.');
        return false;
      }
      if (targetPlayer.id === currentUserId) {
        showFeedback(targetPlayer.id, 'error', 'Нельзя заблокировать самого себя.');
        return false;
      }
      if (targetPlayer.isBot || !targetPlayer.isRegistered) {
        showFeedback(targetPlayer.id, 'error', 'Блокировка доступна только для зарегистрированных игроков.');
        return false;
      }
      if (loadingPlayerId) return false;

      setLoadingPlayerId(targetPlayer.id);
      try {
        const res = await fetch('/api/friends/block', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            targetUserId: targetPlayer.id
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Не удалось заблокировать игрока.');
        }

        setBlockedMap(prev => ({
          ...prev,
          [targetPlayer.id]: true
        }));
        setFriendStatusMap(prev => {
          const next = { ...prev };
          delete next[targetPlayer.id];
          return next;
        });

        sounds.playTick();
        showFeedback(targetPlayer.id, 'success', data.message || `Игрок ${targetPlayer.name} добавлен в чёрный список.`);
        refreshFriends();
        refreshBlocks();
        window.dispatchEvent(
          new CustomEvent('mafia_friends_updated', {
            detail: { type: 'USER_BLOCKED', targetUserId: targetPlayer.id }
          })
        );
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Ошибка блокировки.';
        showFeedback(targetPlayer.id, 'error', msg);
        refreshFriends();
        refreshBlocks();
        return false;
      } finally {
        setLoadingPlayerId(null);
      }
    },
    [isLoggedIn, currentUserId, loadingPlayerId, getAuthHeaders, showFeedback, refreshFriends, refreshBlocks]
  );

  const unblockPlayer = useCallback(
    async (targetPlayer: TableTargetPlayer) => {
      if (!isLoggedIn || !currentUserId) {
        showFeedback(targetPlayer.id, 'error', 'Войдите в аккаунт для разблокировки.');
        return false;
      }
      if (targetPlayer.id === currentUserId || targetPlayer.isBot || !targetPlayer.isRegistered) {
        return false;
      }
      if (loadingPlayerId) return false;

      setLoadingPlayerId(targetPlayer.id);
      try {
        const res = await fetch('/api/friends/unblock', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            targetUserId: targetPlayer.id
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Не удалось разблокировать игрока.');
        }

        setBlockedMap(prev => {
          const next = { ...prev };
          delete next[targetPlayer.id];
          return next;
        });

        sounds.playTick();
        showFeedback(targetPlayer.id, 'success', data.message || `Игрок ${targetPlayer.name} разблокирован.`);
        refreshFriends();
        refreshBlocks();
        window.dispatchEvent(
          new CustomEvent('mafia_friends_updated', {
            detail: { type: 'USER_UNBLOCKED', targetUserId: targetPlayer.id }
          })
        );
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Ошибка разблокировки.';
        showFeedback(targetPlayer.id, 'error', msg);
        refreshFriends();
        refreshBlocks();
        return false;
      } finally {
        setLoadingPlayerId(null);
      }
    },
    [isLoggedIn, currentUserId, loadingPlayerId, getAuthHeaders, showFeedback, refreshFriends, refreshBlocks]
  );

  return {
    friendStatusMap,
    getFriendStatus,
    blockedMap,
    isPlayerBlocked,
    loadingPlayerId,
    feedback,
    refreshFriends,
    refreshBlocks,
    sendFriendRequestToPlayer,
    acceptFriendRequestFromPlayer,
    removeFriendFromPlayer,
    blockPlayer,
    unblockPlayer
  };
}

export interface PlayerTableContextMenuProps {
  targetPlayer: TableTargetPlayer;
  seatNumber?: number;
  myId: string;
  isLoggedIn: boolean;
  currentUserId?: string | null;
  friendStatus: TableFriendStatus;
  isBlocked?: boolean;
  isLoadingFriendAction: boolean;
  feedback?: TableFriendFeedback | null;
  onSendFriendRequest: (player: TableTargetPlayer) => void;
  onAcceptFriendRequest: (player: TableTargetPlayer) => void;
  onRemoveFriend?: (player: TableTargetPlayer) => void;
  onBlockPlayer?: (player: TableTargetPlayer) => void;
  onUnblockPlayer?: (player: TableTargetPlayer) => void;
  canKickPlayer?: boolean;
  onKickPlayer?: (player: TableTargetPlayer) => void;
  onViewProfile?: (player: TableTargetPlayer) => void;
  openUpward?: boolean;
  className?: string;
  /**
   * Extensible slot for additional context actions (e.g., Transfer Host, Kick / Cancel Kick, or existing in-game actions).
   */
  extraActions?: React.ReactNode;
}

export const PlayerTableContextMenu: React.FC<PlayerTableContextMenuProps> = ({
  targetPlayer,
  seatNumber,
  myId,
  isLoggedIn,
  currentUserId,
  friendStatus,
  isBlocked = false,
  isLoadingFriendAction,
  feedback,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onRemoveFriend,
  onBlockPlayer,
  onUnblockPlayer,
  canKickPlayer = false,
  onKickPlayer,
  onViewProfile,
  openUpward = false,
  className = '',
  extraActions
}) => {
  if (targetPlayer.id === myId) return null;

  const [isConfirmingRemove, setIsConfirmingRemove] = useState<boolean>(false);
  const [isConfirmingBlock, setIsConfirmingBlock] = useState<boolean>(false);
  const [isConfirmingUnblock, setIsConfirmingUnblock] = useState<boolean>(false);
  const [isConfirmingKick, setIsConfirmingKick] = useState<boolean>(false);

  // Reset confirmation state when selected player or block status changes
  useEffect(() => {
    setIsConfirmingRemove(false);
    setIsConfirmingBlock(false);
    setIsConfirmingUnblock(false);
    setIsConfirmingKick(false);
  }, [targetPlayer.id, isBlocked]);

  useEffect(() => {
    if (friendStatus !== 'accepted') {
      setIsConfirmingRemove(false);
    }
  }, [friendStatus]);

  const isViewerRegistered = Boolean(isLoggedIn && currentUserId);
  const isTargetRegistered = Boolean(!targetPlayer.isBot && targetPlayer.isRegistered);
  const showKickAction = Boolean(canKickPlayer && onKickPlayer && !targetPlayer.isBot && !targetPlayer.isHost);
  const showProfileAction = Boolean(onViewProfile && isTargetRegistered);
  const playerFeedback = feedback && feedback.playerId === targetPlayer.id ? feedback : null;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className={`absolute right-2 ${
        openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
      } z-50 w-56 bg-[var(--skin-bg-modal)] border border-[var(--skin-border-strong)] rounded-xl shadow-2xl p-1.5 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-100 select-none ${className}`}
    >
      {/* Header: Seat # + Name + Account Type */}
      <div className="px-2 py-1 border-b border-[var(--skin-border-subtle)] flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {typeof seatNumber === 'number' && (
            <span className="text-[10px] font-mono font-bold text-[var(--skin-text-accent)] shrink-0">
              #{seatNumber}
            </span>
          )}
          <span className="font-bold text-[var(--skin-text-primary)] truncate text-[11px]">
            {targetPlayer.name}
          </span>
        </div>
        <span
          className={`text-[9px] font-mono px-1.5 py-0.2 rounded border shrink-0 ${
            targetPlayer.isBot
              ? 'bg-zinc-900/90 border-zinc-700 text-zinc-400'
              : isTargetRegistered
              ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
              : 'bg-amber-950/60 border-amber-800/60 text-amber-300/90'
          }`}
        >
          {targetPlayer.isBot ? 'ИИ-Бот' : isTargetRegistered ? 'Аккаунт' : 'Гость'}
        </span>
      </div>

      {/* Action Section */}
      <div className="space-y-1">
        {showProfileAction && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              sounds.playTick();
              onViewProfile?.(targetPlayer);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg hover:bg-[var(--skin-bg-elevated)] bg-[var(--skin-bg-subcard)]/80 border border-[var(--skin-border-base)] hover:border-[var(--skin-border-accent)] text-[var(--skin-text-primary)] font-bold flex items-center gap-2 transition-colors text-[11px] cursor-pointer group"
          >
            <User className="w-3.5 h-3.5 shrink-0 text-[var(--skin-accent-primary)] group-hover:scale-110 transition-transform" />
            <span>Посмотреть профиль</span>
          </button>
        )}

        {targetPlayer.isBot ? (
          <div className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--skin-bg-subcard)]/60 text-[var(--skin-text-muted)] flex items-center gap-2 text-[11px] cursor-not-allowed">
            <Bot className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
            <span>Бота нельзя добавить в друзья</span>
          </div>
        ) : !isTargetRegistered ? (
          <div className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--skin-bg-subcard)]/60 text-[var(--skin-text-muted)] flex items-center gap-2 text-[11px] cursor-not-allowed">
            <UserX className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
            <span>{showKickAction ? 'Гость (профиль недоступен)' : 'Гость (действия недоступны)'}</span>
          </div>
        ) : !isViewerRegistered ? (
          <div className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--skin-bg-subcard)]/60 text-[var(--skin-text-muted)] flex items-center gap-2 text-[11px] cursor-not-allowed">
            <UserPlus className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
            <span>Войдите для взаимодействия</span>
          </div>
        ) : isBlocked ? (
          /* When player is blocked by current user */
          <div className="space-y-1">
            <div className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-700/60 text-zinc-400 font-medium flex items-center gap-2 text-[11px] cursor-default">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-rose-400" />
              <span className="truncate">В чёрном списке</span>
            </div>

            {isConfirmingUnblock ? (
              <div className="w-full p-1.5 rounded-lg bg-emerald-950/40 border border-emerald-700/60 space-y-1.5 animate-in fade-in duration-150">
                <div className="text-[10px] text-emerald-200 font-medium leading-tight">
                  Разблокировать игрока?
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isLoadingFriendAction}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnblockPlayer?.(targetPlayer);
                    }}
                    className="flex-1 py-1 px-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60"
                  >
                    {isLoadingFriendAction ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <span>Разблокировать</span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isLoadingFriendAction}
                    onClick={(e) => {
                      e.stopPropagation();
                      try { sounds.playTick(); } catch {}
                      setIsConfirmingUnblock(false);
                    }}
                    className="py-1 px-2 rounded-md border border-[var(--skin-border-base)] bg-[var(--skin-bg-subcard)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] text-[10px] font-semibold transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isLoadingFriendAction}
                onClick={(e) => {
                  e.stopPropagation();
                  try { sounds.playTick(); } catch {}
                  setIsConfirmingKick(false);
                  setIsConfirmingUnblock(true);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-emerald-950/40 bg-[var(--skin-bg-subcard)]/80 border border-[var(--skin-border-base)] hover:border-emerald-600/60 text-emerald-300 font-bold flex items-center gap-2 transition-colors text-[11px] cursor-pointer disabled:opacity-60 group"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>Разблокировать</span>
              </button>
            )}
          </div>
        ) : (
          /* When player is NOT blocked */
          <div className="space-y-1">
            {friendStatus === 'accepted' ? (
              isConfirmingRemove ? (
                <div className="w-full p-1.5 rounded-lg bg-rose-950/40 border border-rose-800/60 space-y-1.5 animate-in fade-in duration-150">
                  <div className="text-[10px] text-rose-200 font-medium leading-tight">
                    Удалить из друзей?
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isLoadingFriendAction}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onRemoveFriend) {
                          onRemoveFriend(targetPlayer);
                        }
                      }}
                      className="flex-1 py-1 px-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60"
                    >
                      {isLoadingFriendAction ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <span>Удалить</span>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isLoadingFriendAction}
                      onClick={(e) => {
                        e.stopPropagation();
                        try { sounds.playTick(); } catch {}
                        setIsConfirmingRemove(false);
                      }}
                      className="py-1 px-2 rounded-md border border-[var(--skin-border-base)] bg-[var(--skin-bg-subcard)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] text-[10px] font-semibold transition-colors cursor-pointer"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isLoadingFriendAction}
                  onClick={(e) => {
                    e.stopPropagation();
                    try { sounds.playTick(); } catch {}
                    setIsConfirmingBlock(false);
                    setIsConfirmingKick(false);
                    setIsConfirmingRemove(true);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-950/40 bg-[var(--skin-bg-subcard)]/80 border border-[var(--skin-border-base)] hover:border-rose-700/60 text-rose-300 font-bold flex items-center gap-2 transition-colors text-[11px] cursor-pointer disabled:opacity-60 group"
                >
                  <UserMinus className="w-3.5 h-3.5 shrink-0 text-rose-400 group-hover:scale-110 transition-transform" />
                  <span>Удалить из друзей</span>
                </button>
              )
            ) : friendStatus === 'pending_sent' ? (
              <div className="w-full px-2.5 py-1.5 rounded-lg bg-amber-950/50 border border-amber-700/50 text-amber-300 font-semibold flex items-center gap-2 text-[11px] cursor-default">
                <Clock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>Заявка отправлена</span>
              </div>
            ) : friendStatus === 'pending_received' ? (
              <button
                type="button"
                disabled={isLoadingFriendAction}
                onClick={(e) => {
                  e.stopPropagation();
                  onAcceptFriendRequest(targetPlayer);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/70 text-emerald-200 hover:text-white font-bold flex items-center gap-2 transition-colors text-[11px] cursor-pointer disabled:opacity-60"
              >
                {isLoadingFriendAction ? (
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-emerald-300" />
                ) : (
                  <UserCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                )}
                <span>Принять заявку</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isLoadingFriendAction}
                onClick={(e) => {
                  e.stopPropagation();
                  onSendFriendRequest(targetPlayer);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-[var(--skin-bg-elevated)] bg-[var(--skin-bg-subcard)]/80 border border-[var(--skin-border-base)] hover:border-[var(--skin-border-strong)] text-[var(--skin-text-primary)] font-bold flex items-center gap-2 transition-colors text-[11px] cursor-pointer disabled:opacity-60"
              >
                {isLoadingFriendAction ? (
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-[var(--skin-accent-primary)]" />
                ) : (
                  <UserPlus className="w-3.5 h-3.5 shrink-0 text-[var(--skin-accent-primary)]" />
                )}
                <span>Добавить в друзья</span>
              </button>
            )}

            {/* Block Player Action */}
            {isConfirmingBlock ? (
              <div className="w-full p-1.5 rounded-lg bg-rose-950/50 border border-rose-800/80 space-y-1.5 animate-in fade-in duration-150">
                <div className="text-[10px] text-rose-200 font-medium leading-tight">
                  Заблокировать игрока? Дружба будет прекращена, заявки отменены.
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isLoadingFriendAction}
                    onClick={(e) => {
                      e.stopPropagation();
                      onBlockPlayer?.(targetPlayer);
                    }}
                    className="flex-1 py-1 px-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60"
                  >
                    {isLoadingFriendAction ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <span>Заблокировать</span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isLoadingFriendAction}
                    onClick={(e) => {
                      e.stopPropagation();
                      try { sounds.playTick(); } catch {}
                      setIsConfirmingBlock(false);
                    }}
                    className="py-1 px-2 rounded-md border border-[var(--skin-border-base)] bg-[var(--skin-bg-subcard)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] text-[10px] font-semibold transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isLoadingFriendAction}
                onClick={(e) => {
                  e.stopPropagation();
                  try { sounds.playTick(); } catch {}
                  setIsConfirmingRemove(false);
                  setIsConfirmingKick(false);
                  setIsConfirmingBlock(true);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-950/30 bg-[var(--skin-bg-subcard)]/60 border border-[var(--skin-border-base)] hover:border-rose-800/60 text-zinc-400 hover:text-rose-300 font-medium flex items-center gap-2 transition-colors text-[11px] cursor-pointer disabled:opacity-60 group"
              >
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-zinc-500 group-hover:text-rose-400 group-hover:scale-110 transition-transform" />
                <span>Заблокировать</span>
              </button>
            )}
          </div>
        )}

        {/* Host Kick Player from Lobby Action */}
        {showKickAction && (
          <div className="pt-1 border-t border-[var(--skin-border-subtle)]">
            {isConfirmingKick ? (
              <div className="w-full p-1.5 rounded-lg bg-rose-950/50 border border-rose-800/80 space-y-1.5 animate-in fade-in duration-150">
                <div className="text-[10px] text-rose-200 font-medium leading-tight">
                  Исключить игрока из комнаты?
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      try { sounds.playTick(); } catch {}
                      setIsConfirmingKick(false);
                      onKickPlayer?.(targetPlayer);
                    }}
                    className="flex-1 py-1 px-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>Исключить</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      try { sounds.playTick(); } catch {}
                      setIsConfirmingKick(false);
                    }}
                    className="py-1 px-2 rounded-md border border-[var(--skin-border-base)] bg-[var(--skin-bg-subcard)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] text-[10px] font-semibold transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  try { sounds.playTick(); } catch {}
                  setIsConfirmingRemove(false);
                  setIsConfirmingBlock(false);
                  setIsConfirmingUnblock(false);
                  setIsConfirmingKick(true);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-950/40 bg-[var(--skin-bg-subcard)]/80 border border-[var(--skin-border-base)] hover:border-rose-700/70 text-rose-300 hover:text-rose-200 font-bold flex items-center gap-2 transition-colors text-[11px] cursor-pointer group"
              >
                <UserX className="w-3.5 h-3.5 shrink-0 text-rose-400 group-hover:scale-110 transition-transform" />
                <span>Исключить из комнаты</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inline feedback message (success / error) */}
      {playerFeedback && (
        <div
          className={`px-2 py-1 rounded-lg border text-[10px] flex items-center gap-1.5 ${
            playerFeedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-700/70 text-emerald-200'
              : 'bg-rose-950/80 border-rose-700/70 text-rose-200'
          }`}
        >
          {playerFeedback.type === 'success' ? (
            <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-3 h-3 shrink-0 text-rose-400" />
          )}
          <span className="leading-tight">{playerFeedback.text}</span>
        </div>
      )}

      {/* Extensible slot for additional actions (future stages 2–4 or in-game actions) */}
      {extraActions && (
        <div className="pt-1 border-t border-[var(--skin-border-subtle)] space-y-0.5">
          {extraActions}
        </div>
      )}
    </div>
  );
};
