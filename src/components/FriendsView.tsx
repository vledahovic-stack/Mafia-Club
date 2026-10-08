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
  Globe
} from 'lucide-react';
import { sounds } from '../utils/audio';

export interface FriendInfo {
  id: string;
  displayName: string;
  email: string;
  avatarSeed: string;
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

interface PlayerSearchResult {
  id: string;
  displayName: string;
  avatarSeed: string;
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
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  user,
  currentRoomCode,
  onJoinRoom,
  onCloseParentModal
}) => {
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'online' | 'pending'>('all');
  
  // Search & Add state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  
  // Action loading / feedback
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
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

  useEffect(() => {
    fetchFriends();
    const interval = setInterval(() => fetchFriends(true), 6000);
    return () => clearInterval(interval);
  }, [fetchFriends]);

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка отклонения';
      showNotification('error', msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Remove friend
  const handleRemoveFriend = async (targetUserId: string, friendName: string) => {
    if (!window.confirm(`Вы уверены, что хотите удалить ${friendName} из списка друзей?`)) {
      return;
    }

    setActionLoadingId(targetUserId);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка удаления';
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
      <div className="bg-[#151624] p-4 rounded-2xl border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-950/70 text-amber-400 border border-amber-800/60">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Поиск и добавление друзей
              </h3>
              <p className="text-[11px] text-zinc-400">
                Введите никнейм, ID или email игрока, чтобы отправить запрос в друзья
              </p>
            </div>
          </div>

          <button
            onClick={() => fetchFriends()}
            disabled={loading}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Обновить список"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>

        {/* Search input with live autocomplete */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSearchDropdown(true);
                }}
                placeholder="Поиск игрока (например, Лиса, usr_3f8...)"
                className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500 transition-colors"
              />
              {isSearching && (
                <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              )}
            </div>

            <button
              onClick={() => handleSendFriendRequest(searchQuery)}
              disabled={!searchQuery.trim() || actionLoadingId === searchQuery}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 shadow-sm shadow-amber-950/40"
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
            <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-[#181928] border border-amber-600/50 rounded-2xl shadow-2xl p-2 space-y-1 max-h-60 overflow-y-auto">
              <div className="px-2 py-1 text-[10px] font-bold uppercase text-zinc-400 border-b border-zinc-800 flex justify-between items-center">
                <span>Найденные жители Города</span>
                <button
                  onClick={() => setShowSearchDropdown(false)}
                  className="text-zinc-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {searchResults.map((player) => (
                <div
                  key={player.id}
                  className="p-2 rounded-xl hover:bg-zinc-800/80 flex items-center justify-between gap-2 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-amber-300 shrink-0">
                      {player.displayName[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">
                          {player.displayName}
                        </span>
                        {player.clanTag && (
                          <span className="px-1 py-0.2 rounded bg-amber-950 border border-amber-800 text-amber-300 text-[9px] font-mono font-bold">
                            [{player.clanTag}]
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400">
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

                  {player.friendStatus === 'accepted' ? (
                    <span className="px-2 py-1 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-[10px] font-bold flex items-center gap-1 shrink-0">
                      <UserCheck className="w-3 h-3" />
                      Друг
                    </span>
                  ) : player.friendStatus === 'pending_sent' ? (
                    <span className="px-2 py-1 rounded-lg bg-amber-950/80 border border-amber-800 text-amber-300 text-[10px] font-bold flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      Запрос
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSendFriendRequest(player.id)}
                      disabled={actionLoadingId === player.id}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold transition-colors shrink-0 flex items-center gap-1"
                    >
                      {actionLoadingId === player.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <UserPlus className="w-3 h-3" />
                      )}
                      <span>В друзья</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Incoming Requests Banner */}
      {incomingRequests.length > 0 && (
        <div className="p-3.5 bg-gradient-to-r from-amber-950/60 to-[#19182a] border border-amber-600/80 rounded-2xl space-y-2.5 shadow-lg shadow-amber-950/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Входящие запросы в друзья ({incomingRequests.length})
              </h4>
            </div>
            <span className="text-[10px] text-amber-400 font-mono">
              Требуется подтверждение
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {incomingRequests.map((req) => (
              <div
                key={req.id}
                className="p-2.5 rounded-xl bg-black/40 border border-amber-800/40 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-900/60 border border-amber-700/60 flex items-center justify-center text-xs font-bold text-amber-200 shrink-0">
                    {req.displayName[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {req.displayName}
                    </div>
                    <div className="text-[10px] text-zinc-400 flex items-center gap-1 font-mono">
                      <Trophy className="w-2.5 h-2.5 text-yellow-400" />
                      {req.rating} Elo
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleAcceptRequest(req.id)}
                    disabled={actionLoadingId === req.id}
                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
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
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
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
      <div className="flex items-center justify-between gap-2 flex-wrap border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filter === 'all'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            Все ({acceptedFriends.length})
          </button>

          <button
            onClick={() => setFilter('online')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filter === 'online'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>В сети ({onlineFriends.length})</span>
          </button>

          {outgoingRequests.length > 0 && (
            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filter === 'pending'
                  ? 'bg-amber-700 text-white shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              <Clock className="w-3 h-3 text-amber-400" />
              <span>Отправленные ({outgoingRequests.length})</span>
            </button>
          )}
        </div>

        <div className="text-[11px] text-zinc-400 font-mono">
          Друзей онлайн: <span className="text-emerald-400 font-bold">{onlineFriends.length}</span> из {acceptedFriends.length}
        </div>
      </div>

      {/* Friends Cards Grid */}
      {filter === 'pending' ? (
        // Outgoing pending requests view
        <div className="space-y-2">
          {outgoingRequests.map((out) => (
            <div
              key={out.id}
              className="p-3 rounded-2xl bg-[#141520] border border-zinc-800/80 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300">
                  {out.displayName[0]}
                </div>
                <div>
                  <div className="text-xs font-bold text-white">{out.displayName}</div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    Запрос отправлен • {out.rating} Elo
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDeclineRequest(out.id)}
                disabled={actionLoadingId === out.id}
                className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 text-xs font-medium transition-colors"
              >
                Отменить
              </button>
            </div>
          ))}
        </div>
      ) : filteredFriends.length === 0 ? (
        // Empty State
        <div className="p-8 text-center bg-[#141520] border border-zinc-800/80 rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-500 mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-white">
            {filter === 'online' ? 'Сейчас никого нет в сети' : 'Список друзей пока пуст'}
          </h4>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
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
                className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                  inGame 
                    ? 'bg-gradient-to-br from-[#1a1926] to-[#12131e] border-emerald-500/50 shadow-md shadow-emerald-950/20'
                    : inLobby
                    ? 'bg-[#151624] border-amber-600/40 shadow-sm'
                    : isOnline
                    ? 'bg-[#141522] border-sky-800/40'
                    : 'bg-[#12131d] border-zinc-800/70 opacity-80 hover:opacity-100'
                }`}
              >
                {/* Header: Avatar, Name, Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar with Status Dot */}
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-amber-300">
                        {friend.displayName[0]}
                      </div>
                      <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#141522] ${
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
                        <span className="text-xs font-bold text-white truncate max-w-[120px]">
                          {friend.displayName}
                        </span>
                        {friend.clanTag && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-950 border border-amber-800 text-amber-300 text-[9px] font-mono font-bold">
                            [{friend.clanTag}]
                          </span>
                        )}
                      </div>

                      {/* Title or Elo */}
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400 font-mono">
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
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 text-[10px]">
                        Не в сети
                      </span>
                    )}
                  </div>
                </div>

                {/* Room Info if Friend is Active in a Room */}
                {friend.currentRoomCode && (
                  <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 text-zinc-300 truncate">
                      <Gamepad2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">{friend.currentRoomName || 'Комната'}</span>
                      <span className="font-mono text-white bg-zinc-800 px-1 py-0.2 rounded text-[10px]">
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
                        className={`px-2 py-0.5 rounded-lg text-white font-bold text-[10px] transition-colors shrink-0 ${
                          inGame ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                      >
                        {inGame ? '👁️ Смотреть' : 'Войти'}
                      </button>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/60">
                  <div className="flex items-center gap-1.5">
                    {/* Invite to Game Room button */}
                    <button
                      onClick={() => {
                        setInviteTargetFriend(friend);
                        setCustomRoomCodeInput(currentRoomCode || '');
                        sounds.playTick();
                      }}
                      className="px-2.5 py-1 rounded-xl bg-amber-600/90 hover:bg-amber-600 text-white font-bold text-xs transition-colors flex items-center gap-1 shadow-sm"
                    >
                      <Send className="w-3 h-3" />
                      <span>Пригласить</span>
                    </button>
                  </div>

                  {/* Remove Friend button */}
                  <button
                    onClick={() => handleRemoveFriend(friend.id, friend.displayName)}
                    disabled={actionLoadingId === friend.id}
                    className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                    title="Удалить из друзей"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* INVITE TO ROOM MODAL / DIALOG */}
      {inviteTargetFriend && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#161726] border border-amber-600/70 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-950/80 text-amber-400 border border-amber-800/60">
                  <Gamepad2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Пригласить в комнату</h3>
                  <p className="text-[11px] text-zinc-400">
                    Игроку <span className="text-amber-400 font-bold">{inviteTargetFriend.displayName}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setInviteTargetFriend(null)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                  Код комнаты
                </label>
                <input
                  type="text"
                  value={customRoomCodeInput}
                  onChange={(e) => setCustomRoomCodeInput(e.target.value.toUpperCase())}
                  placeholder="Например, A49B"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs font-mono font-bold text-white uppercase placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                />
                {currentRoomCode && (
                  <button
                    type="button"
                    onClick={() => setCustomRoomCodeInput(currentRoomCode)}
                    className="text-[10px] text-amber-400 hover:underline mt-1 block font-mono"
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
                  className="rounded border-zinc-700 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="privateInvite" className="text-xs text-zinc-300 select-none flex items-center gap-1 cursor-pointer">
                  <Lock className="w-3 h-3 text-amber-400" />
                  Приватная игра (только по приглашению)
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleSendRoomInvite}
                disabled={actionLoadingId === inviteTargetFriend.id || !customRoomCodeInput.trim()}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-amber-950/40"
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
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition-colors"
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
