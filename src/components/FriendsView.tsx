import React, { useState, useEffect, useCallback } from 'react';
import { AuthUser } from './AuthModal';
import { 
  Users, 
  UserPlus, 
  UserCheck, 
  UserX, 
  Search, 
  Gamepad2, 
  Trophy, 
  Shield, 
  Radio, 
  Clock, 
  Check, 
  X, 
  Loader2, 
  Send, 
  Sparkles,
  ExternalLink,
  Trash2,
  RefreshCw,
  Lock,
  Globe,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { PlayerAvatar } from './PlayerAvatar';

export interface FriendInfo {
  id: string;
  displayName: string;
  email: string;
  avatarSeed: string;
  activeAvatarId?: string | null;
  clanTag?: string | null;
  clanName?: string | null;
  rating: number;
  gamesPlayed: number;
  gamesWon: number;
  status: 'accepted' | 'pending_sent' | 'pending_received';
  title?: string;
  addedAt: string;
  onlineStatus: 'online' | 'in_game' | 'in_lobby' | 'offline';
  currentRoomCode?: string | null;
  currentRoomName?: string | null;
}

export interface BlockedUserInfo {
  id: string;
  displayName: string;
  avatarSeed: string;
  activeAvatarId?: string | null;
  clanTag?: string | null;
  clanName?: string | null;
  rating?: number;
  blockedAt: string;
}

interface PlayerSearchResult {
  id: string;
  displayName: string;
  avatarSeed: string;
  activeAvatarId?: string | null;
  rating: number;
  clanTag?: string | null;
  title?: string;
  friendStatus?: 'accepted' | 'pending_sent' | 'pending_received';
}

interface FriendsViewProps {
  user: AuthUser;
  currentRoomCode?: string | null;
  onJoinRoom?: (roomCode: string, asSpectator?: boolean) => void;
  onCloseParentModal?: () => void;
  onFriendsChanged?: () => void;
}

function formatBlockedDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    return 'Заблокирован: ' + d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  user,
  currentRoomCode,
  onJoinRoom,
  onCloseParentModal,
  onFriendsChanged
}) => {
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'online' | 'pending' | 'blocked'>('all');
  
  // Search & Add state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  
  // Action loading / feedback
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmUnblockId, setConfirmUnblockId] = useState<string | null>(null);
  const [confirmBlockPlayer, setConfirmBlockPlayer] = useState<PlayerSearchResult | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Invite modal state
  const [inviteTargetFriend, setInviteTargetFriend] = useState<FriendInfo | null>(null);
  const [customRoomCodeInput, setCustomRoomCodeInput] = useState(currentRoomCode || '');
  const [isPrivateInvite, setIsPrivateInvite] = useState(true);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('mafia_auth_token');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchFriends = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch('/api/friends', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
      }
    } catch {
      // Quiet fail
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const fetchBlockedUsers = useCallback(async (quiet = false) => {
    try {
      const res = await fetch('/api/friends/blocked', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers(data.blockedUsers || []);
      }
    } catch {
      // Quiet fail
    }
  }, []);

  useEffect(() => {
    fetchFriends();
    fetchBlockedUsers();
    const interval = setInterval(() => {
      fetchFriends(true);
      fetchBlockedUsers(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [fetchFriends, fetchBlockedUsers]);

  useEffect(() => {
    const handleFriendsUpdated = () => {
      fetchFriends(true);
      fetchBlockedUsers(true);
    };
    window.addEventListener('mafia_friends_updated', handleFriendsUpdated);
    return () => {
      window.removeEventListener('mafia_friends_updated', handleFriendsUpdated);
    };
  }, [fetchFriends, fetchBlockedUsers]);

  // Global search for players
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    const clean = query.trim();
    if (!clean || clean.length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    setIsSearching(true);
    setShowSearchDropdown(true);
    try {
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(clean)}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Send friend request
  const handleSendFriendRequest = async (targetIdentifier: string) => {
    setActionLoadingId(targetIdentifier);
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ targetIdentifier })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setSearchQuery('');
      setShowSearchDropdown(false);
      fetchFriends(true);
      onFriendsChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка отправки запроса';
      showNotification('error', msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Accept friend request
  const handleAcceptRequest = async (targetUserId: string) => {
    setActionLoadingId(targetUserId);
    try {
      const res = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ targetUserId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      fetchFriends(true);
      onFriendsChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка подтверждения';
      showNotification('error', msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Decline friend request
  const handleDeclineRequest = async (targetUserId: string) => {
    setActionLoadingId(targetUserId);
    try {
      const res = await fetch('/api/friends/decline', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ targetUserId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      fetchFriends(true);
      onFriendsChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка отклонения';
      showNotification('error', msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Remove friend
  const handleRemoveFriend = async (targetUserId: string) => {
    setActionLoadingId(targetUserId);
    setConfirmRemoveId(null);
    try {
      const res = await fetch('/api/friends/remove', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ targetUserId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      fetchFriends(true);
      onFriendsChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка удаления';
      showNotification('error', msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Block user
  const handleBlockUser = async (targetUserId: string, targetName?: string) => {
    setActionLoadingId(targetUserId);
    setConfirmBlockPlayer(null);
    try {
      const res = await fetch('/api/friends/block', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ targetUserId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message || `Игрок ${targetName || ''} добавлен в чёрный список.`);
      fetchFriends(true);
      fetchBlockedUsers(true);
      onFriendsChanged?.();
      window.dispatchEvent(
        new CustomEvent('mafia_friends_updated', {
          detail: { type: 'USER_BLOCKED', targetUserId }
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка блокировки';
      showNotification('error', msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Unblock user
  const handleUnblockUser = async (targetUserId: string, targetName?: string) => {
    setActionLoadingId(targetUserId);
    setConfirmUnblockId(null);
    try {
      const res = await fetch('/api/friends/unblock', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ targetUserId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message || `Игрок ${targetName || ''} удалён из чёрного списка.`);
      fetchFriends(true);
      fetchBlockedUsers(true);
      onFriendsChanged?.();
      window.dispatchEvent(
        new CustomEvent('mafia_friends_updated', {
          detail: { type: 'USER_UNBLOCKED', targetUserId }
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка разблокировки';
      showNotification('error', msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Send game room invite
  const handleSendRoomInvite = async () => {
    if (!inviteTargetFriend) return;
    const roomCode = (customRoomCodeInput || currentRoomCode || '').trim().toUpperCase();
    if (!roomCode) {
      showNotification('error', 'Укажите код комнаты для приглашения.');
      return;
    }

    setActionLoadingId(inviteTargetFriend.id);
    try {
      const res = await fetch('/api/friends/invite', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          targetUserId: inviteTargetFriend.id,
          roomCode,
          roomName: `Комната #${roomCode}`,
          isPrivate: isPrivateInvite
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message || `Приглашение отправлено ${inviteTargetFriend.displayName}!`);
      setInviteTargetFriend(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка отправки приглашения';
      showNotification('error', msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Categorize friends
  const acceptedFriends = friends.filter(f => f.status === 'accepted');
  const incomingRequests = friends.filter(f => f.status === 'pending_received');
  const outgoingRequests = friends.filter(f => f.status === 'pending_sent');

  const onlineFriends = acceptedFriends.filter(f => f.onlineStatus !== 'offline');

  const filteredFriends = acceptedFriends.filter(f => {
    if (filter === 'online') return f.onlineStatus !== 'offline';
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Feedback Toast */}
      {feedback && (
        <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border animate-in fade-in duration-200 ${
          feedback.type === 'success'
            ? 'bg-emerald-950/70 border-emerald-600/80 text-emerald-300'
            : 'bg-rose-950/70 border-rose-600/80 text-rose-300'
        }`}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="p-1 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Controls: Search & Add Friend */}
      <div className="skin-card p-4 rounded-2xl border space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              style={{
                backgroundColor: 'var(--skin-bg-subcard)',
                borderColor: 'var(--skin-border-accent)'
              }}
              className="p-2 rounded-xl text-[var(--skin-accent-primary)] border"
            >
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[var(--skin-text-primary)] uppercase tracking-wider">
                Поиск и добавление друзей
              </h3>
              <p className="text-[11px] text-[var(--skin-text-secondary)]">
                Введите никнейм, ID или email игрока, чтобы отправить запрос в друзья
              </p>
            </div>
          </div>

          <button
            onClick={() => fetchFriends()}
            disabled={loading}
            className="skin-btn-secondary p-1.5 rounded-lg border transition-colors cursor-pointer"
            title="Обновить список"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[var(--skin-accent-primary)]' : ''}`} />
          </button>
        </div>

        {/* Search input with live autocomplete */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--skin-text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSearchDropdown(true);
                }}
                placeholder="Поиск игрока (например, Лиса, usr_3f8...)"
                className="skin-input w-full pl-9 pr-3 py-2 border rounded-xl text-xs transition-colors"
              />
              {isSearching && (
                <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-[var(--skin-text-secondary)]" />
              )}
            </div>

            <button
              onClick={() => handleSendFriendRequest(searchQuery)}
              disabled={!searchQuery.trim() || actionLoadingId === searchQuery}
              style={{
                background: 'var(--skin-btn-primary-bg)',
                color: 'var(--skin-btn-primary-text)'
              }}
              className="px-4 py-2 disabled:opacity-50 rounded-xl text-xs font-bold transition-all hover:brightness-110 flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
            >
              {actionLoadingId === searchQuery ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              <span>Добавить</span>
            </button>
          </div>

          {/* Search Dropdown Results */}
          {showSearchDropdown && searchResults.length > 0 && (
            <div
              style={{
                backgroundColor: 'var(--skin-bg-modal)',
                borderColor: 'var(--skin-border-accent)',
                boxShadow: 'var(--skin-shadow-modal)'
              }}
              className="absolute left-0 right-0 top-full mt-1.5 z-30 border rounded-2xl p-2 space-y-1 max-h-60 overflow-y-auto"
            >
              <div className="px-2 py-1 text-[10px] font-bold uppercase text-[var(--skin-text-secondary)] border-b border-[var(--skin-border-subtle)] flex justify-between items-center">
                <span>Найденные жители Города</span>
                <button
                  onClick={() => setShowSearchDropdown(false)}
                  className="text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {searchResults.map((player) => {
                const isBlocked = blockedUsers.some(b => b.id === player.id);
                return (
                  <div
                    key={player.id}
                    className="p-2 rounded-xl hover:bg-[var(--skin-bg-subcard)] flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-center justify-center text-xs font-bold text-[var(--skin-accent-primary)] shrink-0 overflow-hidden">
                        <PlayerAvatar
                          userId={player.id}
                          avatarSeed={player.avatarSeed}
                          displayName={player.displayName}
                          activeAvatarId={player.activeAvatarId}
                          tryLoadByUserId
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-[var(--skin-text-primary)] truncate">
                            {player.displayName}
                          </span>
                          {player.clanTag && (
                            <span className="px-1 py-0.2 rounded bg-amber-950 border border-amber-800 text-amber-300 text-[9px] font-mono font-bold">
                              [{player.clanTag}]
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--skin-text-secondary)]">
                          <span className="flex items-center gap-0.5 text-yellow-400 font-mono">
                            <Trophy className="w-2.5 h-2.5" />
                            {player.rating} Elo
                          </span>
                          {player.title && (
                            <span className="text-purple-400 truncate">
                              {player.title}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isBlocked ? (
                        <>
                          <span className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-400 text-[10px] font-bold flex items-center gap-1 shrink-0">
                            <ShieldAlert className="w-3 h-3 text-rose-400" />
                            В чёрном списке
                          </span>
                          <button
                            onClick={() => handleUnblockUser(player.id, player.displayName)}
                            disabled={actionLoadingId === player.id}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors shrink-0 flex items-center gap-1 cursor-pointer disabled:opacity-60"
                          >
                            {actionLoadingId === player.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3 h-3" />
                            )}
                            <span>Разблокировать</span>
                          </button>
                        </>
                      ) : player.friendStatus === 'accepted' ? (
                        <>
                          <span className="px-2 py-1 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-[10px] font-bold flex items-center gap-1 shrink-0">
                            <UserCheck className="w-3 h-3" />
                            Друг
                          </span>
                          <button
                            onClick={() => {
                              setShowSearchDropdown(false);
                              setConfirmBlockPlayer(player);
                            }}
                            disabled={actionLoadingId === player.id}
                            className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0"
                            title="Заблокировать игрока"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : player.friendStatus === 'pending_sent' ? (
                        <>
                          <span className="px-2 py-1 rounded-lg bg-amber-950/80 border border-amber-800 text-amber-300 text-[10px] font-bold flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3" />
                            Запрос
                          </span>
                          <button
                            onClick={() => {
                              setShowSearchDropdown(false);
                              setConfirmBlockPlayer(player);
                            }}
                            disabled={actionLoadingId === player.id}
                            className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0"
                            title="Заблокировать игрока"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : player.friendStatus === 'pending_received' ? (
                        <>
                          <button
                            onClick={() => {
                              setShowSearchDropdown(false);
                              setSearchQuery('');
                              handleAcceptRequest(player.id);
                            }}
                            disabled={actionLoadingId === player.id}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors shrink-0 flex items-center gap-1 cursor-pointer disabled:opacity-60"
                          >
                            {actionLoadingId === player.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            <span>Принять</span>
                          </button>
                          <button
                            onClick={() => {
                              setShowSearchDropdown(false);
                              setConfirmBlockPlayer(player);
                            }}
                            disabled={actionLoadingId === player.id}
                            className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0"
                            title="Заблокировать игрока"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleSendFriendRequest(player.id)}
                            disabled={actionLoadingId === player.id}
                            style={{
                              background: 'var(--skin-btn-primary-bg)',
                              color: 'var(--skin-btn-primary-text)'
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all hover:brightness-110 shrink-0 flex items-center gap-1 cursor-pointer disabled:opacity-60"
                          >
                            {actionLoadingId === player.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <UserPlus className="w-3 h-3" />
                            )}
                            <span>В друзья</span>
                          </button>
                          <button
                            onClick={() => {
                              setShowSearchDropdown(false);
                              setConfirmBlockPlayer(player);
                            }}
                            disabled={actionLoadingId === player.id}
                            className="p-1.5 rounded-lg border border-[var(--skin-border-base)] bg-[var(--skin-bg-subcard)] text-[var(--skin-text-muted)] hover:text-rose-400 hover:border-rose-700/60 transition-colors cursor-pointer shrink-0"
                            title="Заблокировать игрока"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Incoming Requests Banner */}
      {incomingRequests.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--skin-bg-card)',
            borderColor: 'var(--skin-border-accent)',
            boxShadow: 'var(--skin-shadow-card)'
          }}
          className="p-3.5 border rounded-2xl space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              <h4 className="text-xs font-bold text-[var(--skin-accent-primary)] uppercase tracking-wider">
                Входящие запросы в друзья ({incomingRequests.length})
              </h4>
            </div>
            <span className="text-[10px] text-[var(--skin-accent-primary)] font-mono">
              Требуется подтверждение
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {incomingRequests.map((req) => (
              <div
                key={req.id}
                className="skin-subcard p-2.5 rounded-xl border flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-accent)] flex items-center justify-center text-xs font-bold text-[var(--skin-accent-primary)] shrink-0 overflow-hidden">
                    <PlayerAvatar
                      userId={req.id}
                      avatarSeed={req.avatarSeed}
                      displayName={req.displayName}
                      activeAvatarId={req.activeAvatarId}
                      tryLoadByUserId
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--skin-text-primary)] truncate">
                      {req.displayName}
                    </div>
                    <div className="text-[10px] text-[var(--skin-text-secondary)] flex items-center gap-1 font-mono">
                      <Trophy className="w-2.5 h-2.5 text-yellow-400" />
                      {req.rating} Elo
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleAcceptRequest(req.id)}
                    disabled={actionLoadingId === req.id}
                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                    title="Принять дружбу"
                  >
                    {actionLoadingId === req.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeclineRequest(req.id)}
                    disabled={actionLoadingId === req.id}
                    className="skin-btn-secondary p-1.5 rounded-lg border transition-colors cursor-pointer"
                    title="Отклонить"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs & Summary */}
      <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[var(--skin-border-subtle)] pb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('all')}
            style={
              filter === 'all'
                ? {
                    background: 'var(--skin-btn-primary-bg)',
                    color: 'var(--skin-btn-primary-text)'
                  }
                : {
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: 'var(--skin-border-base)',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer"
          >
            Все ({acceptedFriends.length})
          </button>

          <button
            onClick={() => setFilter('online')}
            style={
              filter !== 'online'
                ? {
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: 'var(--skin-border-base)',
                    color: 'var(--skin-text-secondary)'
                  }
                : undefined
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              filter === 'online'
                ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                : 'hover:text-[var(--skin-text-primary)]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>В сети ({onlineFriends.length})</span>
          </button>

          {outgoingRequests.length > 0 && (
            <button
              onClick={() => setFilter('pending')}
              style={
                filter === 'pending'
                  ? {
                      background: 'var(--skin-btn-primary-bg)',
                      color: 'var(--skin-btn-primary-text)'
                    }
                  : {
                      backgroundColor: 'var(--skin-bg-subcard)',
                      borderColor: 'var(--skin-border-base)',
                      color: 'var(--skin-text-secondary)'
                    }
              }
              className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Clock className="w-3 h-3 text-amber-400" />
              <span>Отправленные ({outgoingRequests.length})</span>
            </button>
          )}

          <button
            onClick={() => setFilter('blocked')}
            style={
              filter === 'blocked'
                ? {
                    background: 'linear-gradient(135deg, rgba(136, 19, 55, 0.9) 0%, rgba(76, 5, 25, 0.9) 100%)',
                    color: '#ffe4e6',
                    borderColor: '#9f1239'
                  }
                : {
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: 'var(--skin-border-base)',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              filter === 'blocked'
                ? 'shadow-sm text-rose-100 border-rose-800'
                : 'hover:text-[var(--skin-text-primary)]'
            }`}
          >
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            <span>Чёрный список ({blockedUsers.length})</span>
          </button>
        </div>

        <div className="text-[11px] text-[var(--skin-text-secondary)] font-mono">
          Друзей онлайн: <span className="text-emerald-400 font-bold">{onlineFriends.length}</span> из {acceptedFriends.length}
        </div>
      </div>

      {/* Friends Cards Grid */}
      {filter === 'blocked' ? (
        // Blacklist view
        blockedUsers.length === 0 ? (
          <div className="skin-card p-8 text-center border rounded-2xl space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-center justify-center text-[var(--skin-text-muted)] mx-auto">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <h4 className="text-sm font-bold text-[var(--skin-text-primary)]">
              Чёрный список пуст
            </h4>
            <p className="text-xs text-[var(--skin-text-secondary)] max-w-sm mx-auto leading-relaxed">
              Вы не заблокировали ни одного жителя Города. Здесь будут отображаться заблокированные игроки.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {blockedUsers.map((blocked) => (
              <div
                key={blocked.id}
                style={{ backgroundColor: 'var(--skin-bg-card)' }}
                className="p-3.5 rounded-2xl border border-[var(--skin-border-base)] hover:border-zinc-700 transition-all flex flex-col justify-between gap-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-center justify-center text-sm font-bold text-zinc-400 shrink-0 overflow-hidden">
                      <PlayerAvatar
                        userId={blocked.id}
                        avatarSeed={blocked.avatarSeed}
                        displayName={blocked.displayName}
                        activeAvatarId={blocked.activeAvatarId}
                        tryLoadByUserId
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-[var(--skin-text-primary)] truncate max-w-[130px]">
                          {blocked.displayName}
                        </span>
                        {blocked.clanTag && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-950 border border-amber-800 text-amber-300 text-[9px] font-mono font-bold">
                            [{blocked.clanTag}]
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--skin-text-secondary)] font-mono">
                        {typeof blocked.rating === 'number' && (
                          <span className="text-yellow-400 font-bold flex items-center gap-0.5">
                            <Trophy className="w-2.5 h-2.5" />
                            {blocked.rating} Elo
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-400 text-[10px] font-medium shrink-0">
                    <ShieldAlert className="w-2.5 h-2.5 text-rose-400" />
                    Заблокирован
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--skin-border-subtle)] text-[11px]">
                  <div className="text-[10px] text-[var(--skin-text-muted)] font-mono truncate">
                    {formatBlockedDate(blocked.blockedAt)}
                  </div>

                  {confirmUnblockId === blocked.id ? (
                    <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                      <button
                        onClick={() => handleUnblockUser(blocked.id, blocked.displayName)}
                        disabled={actionLoadingId === blocked.id}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1"
                      >
                        {actionLoadingId === blocked.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <span>Разблокировать</span>
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmUnblockId(null)}
                        className="px-2 py-1 rounded-lg border border-[var(--skin-border-base)] bg-[var(--skin-bg-subcard)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        setConfirmUnblockId(blocked.id);
                      }}
                      disabled={actionLoadingId === blocked.id}
                      className="px-2.5 py-1 rounded-xl border border-[var(--skin-border-base)] hover:border-emerald-600/70 bg-[var(--skin-bg-subcard)] hover:bg-emerald-950/30 text-emerald-300 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Разблокировать</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : filter === 'pending' ? (
        // Outgoing pending requests view
        <div className="space-y-2">
          {outgoingRequests.map((out) => (
            <div
              key={out.id}
              className="skin-card p-3 rounded-2xl border flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-center justify-center text-xs font-bold text-[var(--skin-text-primary)] overflow-hidden shrink-0">
                  <PlayerAvatar
                    userId={out.id}
                    avatarSeed={out.avatarSeed}
                    displayName={out.displayName}
                    activeAvatarId={out.activeAvatarId}
                    tryLoadByUserId
                  />
                </div>
                <div>
                  <div className="text-xs font-bold text-[var(--skin-text-primary)]">{out.displayName}</div>
                  <div className="text-[10px] text-[var(--skin-text-secondary)] font-mono">
                    Запрос отправлен • {out.rating} Elo
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDeclineRequest(out.id)}
                disabled={actionLoadingId === out.id}
                className="skin-btn-secondary px-2.5 py-1 rounded-xl border hover:text-rose-400 text-xs font-medium transition-colors cursor-pointer"
              >
                Отменить
              </button>
            </div>
          ))}
        </div>
      ) : filteredFriends.length === 0 ? (
        // Empty State
        <div className="skin-card p-8 text-center border rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-center justify-center text-[var(--skin-text-muted)] mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-[var(--skin-text-primary)]">
            {filter === 'online' ? 'Сейчас никого нет в сети' : 'Список друзей пока пуст'}
          </h4>
          <p className="text-xs text-[var(--skin-text-secondary)] max-w-sm mx-auto leading-relaxed">
            {filter === 'online'
              ? 'Ваши друзья сейчас отдыхают от городских баталий. Переключите фильтр на «Все», чтобы увидеть полный список.'
              : 'Найдите знакомых игроков через строку поиска выше или приглашайте соратников после завершения матчей!'}
          </p>
        </div>
      ) : (
        // Friends List
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredFriends.map((friend) => {
            const isOnline = friend.onlineStatus !== 'offline';
            const inGame = friend.onlineStatus === 'in_game';
            const inLobby = friend.onlineStatus === 'in_lobby';
            const winRate = friend.gamesPlayed > 0 
              ? Math.round((friend.gamesWon / friend.gamesPlayed) * 100) 
              : 0;

            return (
              <div
                key={friend.id}
                style={{
                  backgroundColor: 'var(--skin-bg-card)'
                }}
                className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                  inGame 
                    ? 'border-emerald-500/50 shadow-md shadow-emerald-950/20'
                    : inLobby
                    ? 'border-amber-600/40 shadow-sm'
                    : isOnline
                    ? 'border-sky-800/40'
                    : 'border-[var(--skin-border-base)] opacity-80 hover:opacity-100'
                }`}
              >
                {/* Header: Avatar, Name, Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar with Status Dot */}
                    <div className="relative shrink-0">
                      <div className="cyber-avatar-ring w-10 h-10 rounded-2xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-center justify-center text-sm font-bold text-[var(--skin-accent-primary)] overflow-hidden">
                        <PlayerAvatar
                          userId={friend.id}
                          avatarSeed={friend.avatarSeed}
                          displayName={friend.displayName}
                          activeAvatarId={friend.activeAvatarId}
                          tryLoadByUserId
                        />
                      </div>
                      <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[var(--skin-bg-card)] ${
                        inGame 
                          ? 'bg-emerald-400 animate-pulse' 
                          : inLobby 
                          ? 'bg-amber-400' 
                          : isOnline 
                          ? 'bg-sky-400' 
                          : 'bg-zinc-600'
                      }`} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-[var(--skin-text-primary)] truncate max-w-[120px]">
                          {friend.displayName}
                        </span>
                        {friend.clanTag && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-950 border border-amber-800 text-amber-300 text-[9px] font-mono font-bold">
                            [{friend.clanTag}]
                          </span>
                        )}
                      </div>

                      {/* Title or Elo */}
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--skin-text-secondary)] font-mono">
                        <span className="text-yellow-400 font-bold flex items-center gap-0.5">
                          <Trophy className="w-2.5 h-2.5" />
                          {friend.rating} Elo
                        </span>
                        <span>•</span>
                        <span>{winRate}% побед</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Label Pill */}
                  <div className="shrink-0 text-right">
                    {inGame ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 text-[10px] font-bold">
                        <Radio className="w-2.5 h-2.5 animate-spin" />
                        В игре
                      </span>
                    ) : inLobby ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-950/80 border border-amber-700/80 text-amber-300 text-[10px] font-bold">
                        В лобби
                      </span>
                    ) : isOnline ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-950/80 border border-sky-800/80 text-sky-300 text-[10px] font-bold">
                        В сети
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-muted)] text-[10px]">
                        Не в сети
                      </span>
                    )}
                  </div>
                </div>

                {/* Room Info if Friend is Active in a Room */}
                {friend.currentRoomCode && (
                  <div className="skin-subcard p-2 rounded-xl border flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 text-[var(--skin-text-secondary)] truncate">
                      <Gamepad2 className="w-3.5 h-3.5 text-[var(--skin-accent-primary)] shrink-0" />
                      <span className="truncate">{friend.currentRoomName || 'Комната'}</span>
                      <span className="font-mono text-[var(--skin-text-primary)] bg-[var(--skin-bg-elevated)] px-1 py-0.2 rounded text-[10px]">
                        #{friend.currentRoomCode}
                      </span>
                    </div>

                    {onJoinRoom && (
                      <button
                        onClick={() => {
                          sounds.playTick();
                          if (onCloseParentModal) onCloseParentModal();
                          onJoinRoom(friend.currentRoomCode!, inGame);
                        }}
                        className={`px-2 py-0.5 rounded-lg text-white font-bold text-[10px] transition-colors shrink-0 cursor-pointer ${
                          inGame ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                      >
                        {inGame ? '👁️ Смотреть' : 'Войти'}
                      </button>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--skin-border-subtle)]">
                  <div className="flex items-center gap-1.5">
                    {/* Invite to Game Room button */}
                    <button
                      onClick={() => {
                        setInviteTargetFriend(friend);
                        setCustomRoomCodeInput(currentRoomCode || '');
                        sounds.playTick();
                      }}
                      style={{
                        background: 'var(--skin-btn-primary-bg)',
                        color: 'var(--skin-btn-primary-text)'
                      }}
                      className="px-2.5 py-1 rounded-xl font-bold text-xs transition-all hover:brightness-110 flex items-center gap-1 shadow-sm cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      <span>Пригласить</span>
                    </button>
                  </div>

                  {/* Remove Friend button / inline confirmation */}
                  {confirmRemoveId === friend.id ? (
                    <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                      <button
                        onClick={() => handleRemoveFriend(friend.id)}
                        disabled={actionLoadingId === friend.id}
                        className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        Удалить
                      </button>
                      <button
                        onClick={() => setConfirmRemoveId(null)}
                        className="px-2 py-1 rounded-lg border border-[var(--skin-border-base)] bg-[var(--skin-bg-subcard)] text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        sounds.playTick();
                        setConfirmRemoveId(friend.id);
                      }}
                      disabled={actionLoadingId === friend.id}
                      className="p-1 rounded-lg text-[var(--skin-text-muted)] hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
                      title="Удалить из друзей"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* INVITE TO ROOM MODAL / DIALOG */}
      {inviteTargetFriend && (
        <div
          style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
          className="fixed inset-0 z-50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="skin-modal w-full max-w-sm border rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  style={{
                    backgroundColor: 'var(--skin-bg-subcard)',
                    borderColor: 'var(--skin-border-accent)'
                  }}
                  className="p-2 rounded-xl text-[var(--skin-accent-primary)] border"
                >
                  <Gamepad2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--skin-text-primary)]">Пригласить в комнату</h3>
                  <p className="text-[11px] text-[var(--skin-text-secondary)]">
                    Игроку <span className="text-[var(--skin-accent-primary)] font-bold">{inviteTargetFriend.displayName}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setInviteTargetFriend(null)}
                className="p-1 text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-[var(--skin-text-secondary)] block mb-1">
                  Код комнаты
                </label>
                <input
                  type="text"
                  value={customRoomCodeInput}
                  onChange={(e) => setCustomRoomCodeInput(e.target.value.toUpperCase())}
                  placeholder="Например, A49B"
                  className="skin-input w-full px-3 py-2 border rounded-xl text-xs font-mono font-bold uppercase"
                />
                {currentRoomCode && (
                  <button
                    type="button"
                    onClick={() => setCustomRoomCodeInput(currentRoomCode)}
                    className="text-[10px] text-[var(--skin-accent-primary)] hover:underline mt-1 block font-mono cursor-pointer"
                  >
                    Использовать мою текущую комнату (#{currentRoomCode})
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="privateInvite"
                  checked={isPrivateInvite}
                  onChange={(e) => setIsPrivateInvite(e.target.checked)}
                  className="rounded border-[var(--skin-border-base)] text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="privateInvite" className="text-xs text-[var(--skin-text-secondary)] select-none flex items-center gap-1 cursor-pointer">
                  <Lock className="w-3 h-3 text-[var(--skin-accent-primary)]" />
                  Приватная игра (только по приглашению)
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleSendRoomInvite}
                disabled={actionLoadingId === inviteTargetFriend.id || !customRoomCodeInput.trim()}
                style={{
                  background: 'var(--skin-btn-primary-bg)',
                  color: 'var(--skin-btn-primary-text)'
                }}
                className="flex-1 py-2.5 rounded-xl disabled:opacity-50 font-bold text-xs transition-all hover:brightness-110 flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
              >
                {actionLoadingId === inviteTargetFriend.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Отправить приглашение</span>
              </button>

              <button
                onClick={() => setInviteTargetFriend(null)}
                className="skin-btn-secondary px-4 py-2.5 rounded-xl border font-semibold text-xs transition-colors cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM BLOCK MODAL */}
      {confirmBlockPlayer && (
        <div
          style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
          className="fixed inset-0 z-50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="skin-modal w-full max-w-sm border border-rose-800/80 rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-950/80 border border-rose-700 text-rose-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--skin-text-primary)]">Заблокировать игрока?</h3>
                <p className="text-xs text-rose-300 font-semibold">
                  {confirmBlockPlayer.displayName}
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--skin-text-secondary)] leading-relaxed">
              Вы уверены, что хотите заблокировать этого игрока? Существующая дружба будет прекращена, а все ожидающие заявки — отменены.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => handleBlockUser(confirmBlockPlayer.id, confirmBlockPlayer.displayName)}
                disabled={actionLoadingId === confirmBlockPlayer.id}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-lg"
              >
                {actionLoadingId === confirmBlockPlayer.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldAlert className="w-4 h-4" />
                )}
                <span>Заблокировать</span>
              </button>
              <button
                onClick={() => setConfirmBlockPlayer(null)}
                className="skin-btn-secondary px-4 py-2.5 rounded-xl border font-semibold text-xs transition-colors cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
