import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ClientRoomState, ChatMessage, PublicRoomSummary, RoleId, RoomSettings } from './types/mafia';
import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { LobbyView } from './components/LobbyView';
import { RoleRevealView } from './components/RoleRevealView';
import { NightPhaseView } from './components/NightPhaseView';
import { MorningReportModal } from './components/MorningReportModal';
import { GameTable } from './components/GameTable';
import { ChatPanel } from './components/ChatPanel';
import { InGameView } from './components/InGameView';
import { GameOverModal } from './components/GameOverModal';
import { DetectiveNotebook } from './components/DetectiveNotebook';
import { RulesModal } from './components/RulesModal';
import { AuthModal, AuthUser } from './components/AuthModal';
import { UserProfileModal, ProfileTab } from './components/UserProfileModal';
import { NavigationDrawer, NavDrawerTab } from './components/NavigationDrawer';
import { ShopModal } from './components/ShopModal';
import { PawnshopModal } from './components/PawnshopModal';
import { DailyBonusModal } from './components/DailyBonusModal';
import { SettingsModal } from './components/SettingsModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { ClansModal } from './components/ClansModal';
import { EventsModal } from './components/EventsModal';
import { FeedbackModal } from './components/FeedbackModal';
import { PromoCodeModal } from './components/PromoCodeModal';
import { CampaignGiftNotificationModal } from './components/CampaignGiftNotificationModal';
import { CampaignClaimRecord } from './components/AdminCampaignsSubView';
import { useWebRtc } from './hooks/useWebRtc';
import { RemoteAudioRenderer } from './components/RemoteAudioRenderer';
import { OfflineIndicator } from './components/OfflineIndicator';
import { LoadingScreen } from './components/LoadingScreen';
import { sounds } from './utils/audio';
import { getLevelFromXp, fetchExperienceConfig } from './utils/experience';
import { AlertCircle, Volume2, VolumeX, X, Sparkles } from 'lucide-react';
import noirLobbyBg from './assets/images/noir_mafia_lobby_bg_1791204529068.jpg';
import { useLanguage } from './context/LanguageContext';
import { useSkin } from './context/SkinContext';
import { syncItemsCatalog } from './data/items';
import { fetchClientProjectTimezone } from './utils/timezone';

export default function App() {
  const { t } = useLanguage();
  // Authentication & Player persistence
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [liveXpToast, setLiveXpToast] = useState<{ id: number; xp: number; reason: string } | null>(null);
  const [unnotifiedCampaignClaims, setUnnotifiedCampaignClaims] = useState<CampaignClaimRecord[]>([]);

  const enqueueCampaignClaims = useCallback((claims: CampaignClaimRecord[]) => {
    if (!Array.isArray(claims) || claims.length === 0) return;
    setUnnotifiedCampaignClaims(prev => {
      const map = new Map(prev.map(c => [c.id, c]));
      claims.forEach(c => map.set(c.id, c));
      return Array.from(map.values());
    });
  }, []);

  const { activeSkin, equipSkin } = useSkin();

  // Sync user profile equipped skin when logged in
  useEffect(() => {
    if (user?.equippedCosmetics?.uiSkin) {
      if (activeSkin !== user.equippedCosmetics.uiSkin) {
        equipSkin(user.equippedCosmetics.uiSkin, user);
      }
    }
  }, [user?.equippedCosmetics?.uiSkin, activeSkin, equipSkin, user]);

  const [playerId, setPlayerId] = useState<string>(() => {
    let id = localStorage.getItem('mafia_player_id');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('mafia_player_id', id);
    }
    return id;
  });

  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('mafia_player_name') || 'Горожанин #' + Math.floor(100 + Math.random() * 900);
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const val = localStorage.getItem('mafia_sound_enabled');
    return val !== null ? val === 'true' : true;
  });

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingStatus, setLoadingStatus] = useState<string>('Подключение к Городу...');
  const [loadingSubStatus, setLoadingSubStatus] = useState<string>('Проверка пропуска и синхронизация игровых комнат');
  const [roomState, setRoomState] = useState<ClientRoomState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  const [isNotebookOpen, setIsNotebookOpen] = useState<boolean>(false);
  const [profileInitialTab, setProfileInitialTab] = useState<ProfileTab>('main');

  // WebSocket & latest session refs (prevent stale closures in ws handlers)
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const playerIdRef = useRef<string>(playerId);
  const playerNameRef = useRef<string>(playerName);
  const initDoneRef = useRef<boolean>(false);

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  useEffect(() => {
    roomCodeRef.current = roomState?.roomCode || roomCodeRef.current;
  }, [roomState?.roomCode]);

  // WebRTC Peer-to-Peer Audio & Video Connection
  const isInsideRoom = Boolean(roomState && roomState.roomCode);
  const webRtc = useWebRtc({
    wsRef,
    myPlayerId: playerId,
    roomCode: roomState?.roomCode,
    isInsideRoom
  });

  const webRtcRef = useRef(webRtc);
  useEffect(() => {
    webRtcRef.current = webRtc;
  }, [webRtc]);

  const handleOpenWebRtcSettings = useCallback(() => {
    if (user) {
      setProfileInitialTab('webrtc');
      setIsProfileOpen(true);
    } else {
      setIsSettingsOpen(true);
    }
  }, [user]);

  // In-game slide drawer and modal states
  const [isInGameNavOpen, setIsInGameNavOpen] = useState<boolean>(false);
  const [isShopOpen, setIsShopOpen] = useState<boolean>(false);
  const [isPawnshopOpen, setIsPawnshopOpen] = useState<boolean>(false);
  const [isBonusOpen, setIsBonusOpen] = useState<boolean>(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isClansOpen, setIsClansOpen] = useState<boolean>(false);
  const [isTasksOpen, setIsTasksOpen] = useState<boolean>(false);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState<boolean>(false);
  const [tasksDefaultTab, setTasksDefaultTab] = useState<'global' | 'onboarding' | 'personal' | 'clan'>('global');

  const handleInGameNavTab = (tab: NavDrawerTab) => {
    setIsInGameNavOpen(false);
    switch (tab) {
      case 'lobby':
        handleLeaveRoom();
        break;
      case 'profile':
        if (user) {
          setProfileInitialTab('main');
          setIsProfileOpen(true);
        } else {
          setIsAuthOpen(true);
        }
        break;
      case 'promocode':
        if (user) {
          setIsPromoModalOpen(true);
        } else {
          setIsAuthOpen(true);
        }
        break;
      case 'tasks':
        setTasksDefaultTab('global');
        setIsTasksOpen(true);
        break;
      case 'clans':
        setIsClansOpen(true);
        break;
      case 'shop':
        setIsShopOpen(true);
        break;
      case 'pawnshop':
        setIsPawnshopOpen(true);
        break;
      case 'bonus':
        setIsBonusOpen(true);
        break;
      case 'feedback':
        setIsFeedbackOpen(true);
        break;
      case 'settings':
        setIsSettingsOpen(true);
        break;
      case 'admin':
        setIsAdminOpen(true);
        break;
      case 'logout':
        if (user) {
          handleLogout();
        } else {
          setIsAuthOpen(true);
        }
        break;
    }
  };

  // Preserve active UI skin in user.equippedCosmetics when server responses omit uiSkin
  // (since UI skin selection is persisted via SkinContext / localStorage and users table has no equipped_ui_skin column)
  const syncUserUiSkin = useCallback((incomingUser: AuthUser, prevUser?: AuthUser | null): AuthUser => {
    if (!incomingUser) return incomingUser;
    const explicitSkin = incomingUser.equippedCosmetics?.uiSkin;
    if (explicitSkin) {
      return incomingUser;
    }
    let storedSkin: string | null = null;
    try {
      storedSkin = localStorage.getItem('mafia_equipped_ui_skin');
    } catch {
      storedSkin = null;
    }
    const candidateSkin =
      storedSkin && storedSkin !== 'default'
        ? storedSkin
        : prevUser?.equippedCosmetics?.uiSkin && prevUser.equippedCosmetics.uiSkin !== 'default'
        ? prevUser.equippedCosmetics.uiSkin
        : undefined;

    if (!candidateSkin || storedSkin === 'default') {
      return incomingUser;
    }

    const isSuperAdmin = incomingUser.email?.toLowerCase() === 'vledahovic@gmail.com';
    const ownsSkin = Boolean(
      isSuperAdmin ||
        incomingUser.inventory?.some(
          item => (item.itemId === `skin_${candidateSkin}` || item.itemId === candidateSkin) && item.quantity > 0
        )
    );

    if (!ownsSkin) {
      return incomingUser;
    }

    return {
      ...incomingUser,
      equippedCosmetics: {
        ...incomingUser.equippedCosmetics,
        uiSkin: candidateSkin
      }
    };
  }, []);

  const handleAuthSuccess = (authUser: AuthUser, token?: string) => {
    setUser(prev => syncUserUiSkin(authUser, prev));
    setPlayerName(authUser.displayName);
    setPlayerId(authUser.id);
    localStorage.setItem('mafia_player_name', authUser.displayName);
    localStorage.setItem('mafia_player_id', authUser.id);
    if (token) {
      localStorage.setItem('mafia_auth_token', token);
    }
    if ((authUser as any)?.unnotifiedCampaignClaims) {
      enqueueCampaignClaims((authUser as any).unnotifiedCampaignClaims);
    }
    setIsAuthOpen(false);
  };

  const handleUpdateUser = (updatedUser: AuthUser) => {
    setUser(prev => syncUserUiSkin(updatedUser, prev));
    setPlayerName(updatedUser.displayName);
    localStorage.setItem('mafia_player_name', updatedUser.displayName);
  };

  const PENDING_LOGOUT_KEY = 'mafia_pending_logout';
  const PENDING_LOGOUT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes max lifespan, never indefinite

  const flushPendingLogout = useCallback(() => {
    try {
      const raw = localStorage.getItem(PENDING_LOGOUT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.token || !parsed.expiresAt) {
        localStorage.removeItem(PENDING_LOGOUT_KEY);
        return;
      }
      // Check if expired
      if (Date.now() > parsed.expiresAt) {
        localStorage.removeItem(PENDING_LOGOUT_KEY);
        return;
      }
      // Guard against revoking a newly established active session after re-login
      const currentActiveToken = localStorage.getItem('mafia_auth_token');
      if (currentActiveToken && currentActiveToken === parsed.token) {
        localStorage.removeItem(PENDING_LOGOUT_KEY);
        return;
      }
      // Stale token revocation on server
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${parsed.token}` }
      })
        .then(() => {
          localStorage.removeItem(PENDING_LOGOUT_KEY);
        })
        .catch(() => {
          // Keep until next online event or max age
        });
    } catch {
      localStorage.removeItem(PENDING_LOGOUT_KEY);
    }
  }, []);

  useEffect(() => {
    flushPendingLogout();
    window.addEventListener('online', flushPendingLogout);
    return () => {
      window.removeEventListener('online', flushPendingLogout);
    };
  }, [flushPendingLogout]);

  const handleLogout = () => {
    const token = localStorage.getItem('mafia_auth_token');
    // Immediately clear active token from localStorage
    localStorage.removeItem('mafia_auth_token');
    setUser(null);

    // Reset guest identity so guest mode NEVER retains previous user's ID or name
    const guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
    const guestName = 'Гость';
    localStorage.setItem('mafia_player_id', guestId);
    localStorage.setItem('mafia_player_name', guestName);
    setPlayerId(guestId);
    setPlayerName(guestName);
    playerIdRef.current = guestId;
    playerNameRef.current = guestName;

    setIsProfileOpen(false);
    setIsAuthOpen(true);

    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
        .then(res => {
          if (res.ok) {
            localStorage.removeItem(PENDING_LOGOUT_KEY);
          } else {
            const pending = { token, expiresAt: Date.now() + PENDING_LOGOUT_MAX_AGE_MS };
            localStorage.setItem(PENDING_LOGOUT_KEY, JSON.stringify(pending));
          }
        })
        .catch(() => {
          // Network error: do not falsely assume server confirmed revocation.
          // Store short-lived pending record (max 5 minutes) and attach online event listener.
          const pending = { token, expiresAt: Date.now() + PENDING_LOGOUT_MAX_AGE_MS };
          localStorage.setItem(PENDING_LOGOUT_KEY, JSON.stringify(pending));
          window.addEventListener('online', flushPendingLogout, { once: true });
        });
    }
  };

  // Sound sync & Global shortcut toast
  const [soundToast, setSoundToast] = useState<{ enabled: boolean; timestamp: number } | null>(null);

  // Real-time friend room invite state
  const [activeRoomInvite, setActiveRoomInvite] = useState<{
    id: string;
    fromUserId: string;
    fromUserName: string;
    fromUserAvatar: string;
    roomCode: string;
    roomName: string;
    isPrivate: boolean;
  } | null>(null);

  useEffect(() => {
    sounds.setEnabled(soundEnabled);
    localStorage.setItem('mafia_sound_enabled', String(soundEnabled));
  }, [soundEnabled]);

  // Global keyboard shortcut 'M' (or Cyrillic 'Ь' / 'ь') for toggling sound accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing inside input elements or contenteditable
      const target = e.target as HTMLElement | null;
      if (
        target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox'
        )
      ) {
        return;
      }

      // Ignore if modifier keys are pressed (Ctrl, Cmd, Alt)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
        e.preventDefault();
        setSoundEnabled(prev => {
          const next = !prev;
          if (next) {
            sounds.playTick();
          }
          setSoundToast({ enabled: next, timestamp: Date.now() });
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!soundToast) return;
    const timer = setTimeout(() => {
      setSoundToast(null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [soundToast]);

  // Persist name
  const handleUpdatePlayerName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('mafia_player_name', name);
  };

  // Fetch public rooms
  const fetchPublicRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/rooms');
      if (res.ok) {
        const data = await res.json();
        setPublicRooms(data.rooms || []);
      }
    } catch {
      // Ignore network errors in polling
    }
  }, []);

  useEffect(() => {
    fetchPublicRooms();
    const interval = setInterval(fetchPublicRooms, 5000);
    return () => clearInterval(interval);
  }, [fetchPublicRooms]);

  // Periodic user presence & gift campaign check (every 15s when authenticated)
  useEffect(() => {
    if (!user) return;
    const checkCampaigns = async () => {
      const token = localStorage.getItem('mafia_auth_token');
      if (!token) return;
      try {
        const res = await fetch('/api/campaigns/check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(prev => syncUserUiSkin(prev ? { ...prev, ...data.user } : data.user, prev));
          }
          if (data.unnotifiedClaims && data.unnotifiedClaims.length > 0) {
            enqueueCampaignClaims(data.unnotifiedClaims);
          }
        }
      } catch {}
    };

    const interval = setInterval(checkCampaigns, 15000);
    return () => clearInterval(interval);
  }, [user, enqueueCampaignClaims, syncUserUiSkin]);

  // WebSocket connection & messaging
  const connectWebSocket = useCallback((roomCode: string, asSpectator?: boolean, customPlayerId?: string, customPlayerName?: string) => {
    const normalizedCode = roomCode.trim().toUpperCase();
    const activePlayerId = customPlayerId || playerIdRef.current || playerId;
    const activePlayerName = customPlayerName || playerNameRef.current || playerName;
    roomCodeRef.current = normalizedCode;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const activeToken = localStorage.getItem('mafia_auth_token') || undefined;
    const joinMsg = JSON.stringify({
      type: 'JOIN_ROOM',
      payload: { roomCode: normalizedCode, playerId: activePlayerId, playerName: activePlayerName, asSpectator, token: activeToken }
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Send JOIN_ROOM on existing socket
      wsRef.current.send(joinMsg);
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      // Avoid opening a duplicate socket while already connecting
      const pendingWs = wsRef.current;
      pendingWs.addEventListener('open', () => {
        if (pendingWs.readyState === WebSocket.OPEN) {
          pendingWs.send(joinMsg);
        }
      }, { once: true });
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(joinMsg);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type && data.type.startsWith('SIGNAL_')) {
          webRtcRef.current?.handleSignalingMessage(data.type, data.payload);
          return;
        }
        if (data.type === 'ROOM_STATE') {
          setIsLoading(false);
          const newState = data.payload as ClientRoomState;
          if (newState?.roomCode) {
            roomCodeRef.current = newState.roomCode;
          }
          
          if (newState.gameOverReward) {
            setUser(prev => prev ? {
              ...prev,
              xp: newState.gameOverReward!.totalXp,
              level: newState.gameOverReward!.newLevel
            } : null);
          }

          // Play atmospheric phase transition sounds
          setRoomState(prevState => {
            if (prevState && prevState.phase !== newState.phase) {
              if (newState.phase === 'NIGHT') {
                sounds.playNightBell();
              } else if (newState.phase === 'MORNING_REPORT') {
                sounds.playMorningChime();
              } else if (newState.phase === 'VOTING') {
                sounds.playGavel();
              }
            }
            return newState;
          });
        } else if (data.type === 'XP_EARNED') {
          const { xp, reason } = data.payload;
          const toastId = Date.now();
          setLiveXpToast({ id: toastId, xp, reason });
          sounds.playTick();
          setUser(prev => {
            if (!prev) return null;
            const newXp = (prev.xp || 0) + xp;
            return {
              ...prev,
              xp: newXp,
              level: getLevelFromXp(newXp)
            };
          });
          setTimeout(() => {
            setLiveXpToast(cur => cur?.id === toastId ? null : cur);
          }, 3500);
        } else if (data.type === 'GAME_OVER_REWARDS') {
          const { totalXp, newLevel } = data.payload;
          setUser(prev => prev ? {
            ...prev,
            xp: totalXp,
            level: newLevel
          } : null);
          setRoomState(prev => prev ? {
            ...prev,
            gameOverReward: data.payload
          } : null);
        } else if (data.type === 'CHAT_HISTORY') {
          setChatMessages(data.payload as ChatMessage[]);
        } else if (data.type === 'ROOM_INVITE') {
          setActiveRoomInvite(data.payload);
          sounds.playTick();
        } else if (data.type === 'CAMPAIGN_GIFT_GRANTED') {
          const { claims, newlyGrantedClaims, user: updatedUser } = data.payload || {};
          if (updatedUser) {
            setUser(prev => syncUserUiSkin(prev ? { ...prev, ...updatedUser } : updatedUser, prev));
          }
          enqueueCampaignClaims(claims || newlyGrantedClaims || []);
          sounds.playLootboxReward('reward_credits');
        } else if (data.type === 'AUTH_REVOKED') {
          roomCodeRef.current = null;
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
          localStorage.removeItem('mafia_auth_token');
          setUser(null);
          const guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
          const guestName = 'Гость';
          localStorage.setItem('mafia_player_id', guestId);
          localStorage.setItem('mafia_player_name', guestName);
          setPlayerId(guestId);
          setPlayerName(guestName);
          playerIdRef.current = guestId;
          playerNameRef.current = guestName;
          setIsLoading(false);
          setRoomState(null);
          setErrorMessage(data.payload?.message || 'Сессия завершена: выполнен вход с другого устройства.');
          setTimeout(() => setErrorMessage(null), 5000);
          fetchPublicRooms();
        } else if (data.type === 'DISPLACED') {
          roomCodeRef.current = null;
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
          setErrorMessage(data.payload?.message || 'Подключение перехвачено новым сеансом.');
          setTimeout(() => setErrorMessage(null), 5000);
        } else if (data.type === 'ROOM_CLOSED') {
          roomCodeRef.current = null;
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
          setIsLoading(false);
          setRoomState(null);
          setChatMessages([]);
          window.history.pushState({}, '', window.location.pathname);
          const closeReason = data.payload?.reason || 'Комната закрыта.';
          setErrorMessage(closeReason);
          setTimeout(() => setErrorMessage(null), 4500);
          fetchPublicRooms();
        } else if (data.type === 'ERROR') {
          setIsLoading(false);
          setErrorMessage(data.payload.message);
          setTimeout(() => setErrorMessage(null), 4000);
        }
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      // If we are currently in a room, attempt auto-reconnect using ref (avoids stale closure)
      const activeCode = roomCodeRef.current;
      if (activeCode) {
        reconnectTimeoutRef.current = setTimeout(() => {
          if (roomCodeRef.current) {
            connectWebSocket(roomCodeRef.current, false, playerIdRef.current, playerNameRef.current);
          }
        }, 1500);
      }
    };

    wsRef.current = ws;
  }, [playerId, playerName, enqueueCampaignClaims, syncUserUiSkin]);

  // Initial authentication check & room data loading with loading screen (runs once on boot)
  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    let isCancelled = false;
    const startTime = Date.now();

    const initApp = async () => {
      flushPendingLogout();
      fetchClientProjectTimezone().catch(() => {});
      fetchExperienceConfig().catch(() => {});
      fetch('/api/items')
        .then(r => r.json())
        .then(data => {
          if (data.items && Array.isArray(data.items)) {
            syncItemsCatalog(data.items);
          }
        })
        .catch(() => {});

      const token = localStorage.getItem('mafia_auth_token');
      const params = new URLSearchParams(window.location.search);
      const roomFromUrl = params.get('room');

      let currentId = playerIdRef.current;
      let currentName = playerNameRef.current;

      // 1. Verify user authentication session if token exists
      if (token) {
        if (!isCancelled) {
          setLoadingStatus('Проверка пропуска в клуб...');
          setLoadingSubStatus('Синхронизация учетной записи и инвентаря');
        }
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.user) {
              setUser(prev => syncUserUiSkin(data.user, prev));
              setPlayerName(data.user.displayName);
              setPlayerId(data.user.id);
              playerIdRef.current = data.user.id;
              playerNameRef.current = data.user.displayName;
              localStorage.setItem('mafia_player_id', data.user.id);
              localStorage.setItem('mafia_player_name', data.user.displayName);
              currentId = data.user.id;
              currentName = data.user.displayName;
              if (data.unnotifiedCampaignClaims) {
                enqueueCampaignClaims(data.unnotifiedCampaignClaims);
              }
            }
          } else if (res.status === 401 || res.status === 403) {
            // Expired or invalidated session: reset identity to guest mode
            localStorage.removeItem('mafia_auth_token');
            setUser(null);
            const guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
            const guestName = 'Гость';
            localStorage.setItem('mafia_player_id', guestId);
            localStorage.setItem('mafia_player_name', guestName);
            setPlayerId(guestId);
            setPlayerName(guestName);
            playerIdRef.current = guestId;
            playerNameRef.current = guestName;
            currentId = guestId;
            currentName = guestName;
          }
        } catch {
          // Continue as guest
        }
      }

      // 2. Load room data
      if (roomFromUrl) {
        const code = roomFromUrl.toUpperCase();
        if (!isCancelled) {
          setLoadingStatus(`Подключение к комнате #${code}...`);
          setLoadingSubStatus('Получение данных игрового стола и правил');
        }
        connectWebSocket(code, false, currentId, currentName);

        // Wait for WebSocket connection or incoming room state
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN || isCancelled) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 1500);
        });
      } else {
        if (!isCancelled) {
          setLoadingStatus('Загрузка списка игровых залов...');
          setLoadingSubStatus('Поиск активных комнат и игроков онлайн');
        }
        await fetchPublicRooms();
      }

      // Smooth visual transition: minimum display time to prevent flickering
      const elapsed = Date.now() - startTime;
      const minDuration = 650;
      if (elapsed < minDuration) {
        await new Promise(r => setTimeout(r, minDuration - elapsed));
      }

      if (!isCancelled) {
        setIsLoading(false);
      }
    };

    // Safety timeout: Never stay stuck on loading longer than 3 seconds
    const safetyTimer = setTimeout(() => {
      if (!isCancelled) {
        setIsLoading(false);
      }
    }, 3000);

    initApp();

    return () => {
      isCancelled = true;
      clearTimeout(safetyTimer);
    };
  }, [fetchPublicRooms, connectWebSocket, enqueueCampaignClaims]);

  // Clean up
  useEffect(() => {
    return () => {
      roomCodeRef.current = null;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Send message over WebSocket (with automatic reconnect & queue if socket dropped)
  const sendWs = (type: string, payload: Record<string, unknown> = {}) => {
    const activeRoomCode = roomState?.roomCode || roomCodeRef.current;
    const activePlayerId = playerId || playerIdRef.current;
    const activeToken = localStorage.getItem('mafia_auth_token') || undefined;
    const messageStr = JSON.stringify({
      type,
      payload: { ...payload, roomCode: activeRoomCode, playerId: activePlayerId, token: activeToken }
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(messageStr);
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      const pendingWs = wsRef.current;
      pendingWs.addEventListener('open', () => {
        if (pendingWs.readyState === WebSocket.OPEN) {
          pendingWs.send(messageStr);
        }
      }, { once: true });
      return;
    }

    if (activeRoomCode && type !== 'LEAVE_ROOM') {
      connectWebSocket(activeRoomCode, false, activePlayerId, playerNameRef.current);
      const reconnectedWs = wsRef.current as WebSocket | null;
      if (reconnectedWs) {
        reconnectedWs.addEventListener('open', () => {
          if (reconnectedWs.readyState === WebSocket.OPEN) {
            reconnectedWs.send(messageStr);
          }
        }, { once: true });
      }
    }
  };

  // ACTIONS
  const handleCreateRoom = async (roomName: string, settings?: Partial<RoomSettings>) => {
    try {
      const token = localStorage.getItem('mafia_auth_token') || undefined;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers,
        body: JSON.stringify({ hostId: playerId, hostName: playerName, roomName, settings, token })
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.roomCode) {
          // Update URL
          const newUrl = `${window.location.pathname}?room=${data.roomCode}`;
          window.history.pushState({ path: newUrl }, '', newUrl);
          connectWebSocket(data.roomCode);
        } else {
          setErrorMessage('Не удалось создать комнату');
          setTimeout(() => setErrorMessage(null), 4000);
        }
      } else {
        const errData = await res.json().catch(() => null);
        const msg =
          (typeof errData?.error === 'string' && errData.error.trim()) ||
          (typeof errData?.message === 'string' && errData.message.trim()) ||
          'Не удалось создать комнату';
        setErrorMessage(msg);
        setTimeout(() => setErrorMessage(null), 4000);
      }
    } catch (e) {
      setErrorMessage('Не удалось создать комнату. Проверьте соединение.');
      setTimeout(() => setErrorMessage(null), 4000);
    }
  };

  const handleJoinRoom = (roomCode: string, asSpectator?: boolean) => {
    const code = roomCode.trim().toUpperCase();
    const newUrl = `${window.location.pathname}?room=${code}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
    connectWebSocket(code, asSpectator);
  };

  const handleJoinAsPlayer = () => {
    sendWs('JOIN_AS_PLAYER', { playerName });
  };

  const handleSwitchToSpectator = () => {
    sendWs('SWITCH_TO_SPECTATOR');
  };

  const handleLeaveRoom = () => {
    sendWs('LEAVE_ROOM');
    roomCodeRef.current = null;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setRoomState(null);
    setChatMessages([]);
    window.history.pushState({}, '', window.location.pathname);
    fetchPublicRooms();
  };

  const handleStartGame = () => {
    sendWs('START_GAME');
  };

  const handleRestartGame = () => {
    sendWs('RESTART_GAME');
  };

  const handleAddBot = () => {
    sendWs('ADD_BOT');
  };

  const handleRemoveBot = (botId: string) => {
    sendWs('REMOVE_BOT', { botId });
  };

  const handleUpdateSettings = (settings: Partial<RoomSettings>) => {
    sendWs('UPDATE_SETTINGS', { settings });
  };

  const handleTransferHost = (targetPlayerId: string) => {
    sendWs('TRANSFER_HOST', { targetPlayerId });
  };

  const handleNominatePlayer = (nomineeId: string) => {
    sendWs('NOMINATE_PLAYER', { nomineeId });
  };

  const handleVotePlayer = (targetId: string | 'skip') => {
    sendWs('CAST_VOTE', { targetId });
  };

  const handleSubmitNightAction = (actionType: string, targetId: string) => {
    sendWs('SUBMIT_NIGHT_ACTION', { actionType, targetId });
  };

  const handleSkipPhase = () => {
    sendWs('SKIP_PHASE');
  };

  const handleSendChatMessage = (text: string, channel: ChatMessage['channel'] = 'all') => {
    sendWs('SEND_CHAT', { text, channel });
  };

  const myPlayer = roomState?.players.find(p => p.id === playerId);
  const isAlive = myPlayer?.isAlive ?? true;
  const isHost = Boolean(roomState && (roomState.hostId === playerId || myPlayer?.isHost));

  return (
    <div className="min-h-screen bg-[var(--skin-bg-canvas)] text-[var(--skin-text-primary)] flex flex-col selection:bg-rose-900 selection:text-white">
      {/* Error Toast Notification */}
      {errorMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-red-950/95 border border-red-700 text-red-200 text-xs shadow-2xl flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Quick Sound Toggle Toast HUD */}
      {soundToast && (
        <div className="skin-modal fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-2xl bg-[var(--skin-bg-modal)] border border-[var(--skin-border-strong)] text-[var(--skin-text-primary)] text-xs shadow-[var(--skin-shadow-modal)] backdrop-blur-md flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
            soundToast.enabled ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60' : 'bg-[var(--skin-bg-subcard)] text-[var(--skin-text-muted)] border border-[var(--skin-border-base)]'
          }`}>
            {soundToast.enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-bold flex items-center gap-1.5">
              <span>{soundToast.enabled ? 'Звук включен' : 'Звук выключен'}</span>
              <kbd className="px-1.5 py-0.2 rounded bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-strong)] font-mono text-[10px] text-[var(--skin-text-secondary)]">M</kbd>
            </div>
            <p className="text-[10px] text-[var(--skin-text-muted)]">Горячая клавиша: Нажмите [M] для переключения</p>
          </div>
        </div>
      )}

      {/* Offline Mode Indicator for PWA */}
      <OfflineIndicator />

      {/* Main Content Area */}
      {isLoading ? (
        <LoadingScreen
          message={loadingStatus}
          subMessage={loadingSubStatus}
        />
      ) : !roomState ? (
        /* HOME VIEW - FULLSCREEN NOIR LOBBY */
        <HomeView
          playerName={playerName}
          playerId={playerId}
          isLoggedIn={!!user}
          soundEnabled={soundEnabled}
          user={user}
          onUpdateUser={handleUpdateUser}
          onToggleSound={() => setSoundEnabled(prev => !prev)}
          onUpdatePlayerName={handleUpdatePlayerName}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          publicRooms={publicRooms}
          onRefreshRooms={fetchPublicRooms}
          onOpenRules={() => setIsRulesOpen(true)}
          onOpenProfile={(tab) => {
            setProfileInitialTab(tab === 'inventory' || tab === 'promocodes' ? tab : 'main');
            setIsProfileOpen(true);
          }}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenAdmin={() => setIsAdminOpen(true)}
          onLogout={handleLogout}
        />
      ) : roomState.phase === 'LOBBY' ? (
        /* ROOM LOBBY VIEW - FULLSCREEN NOIR DESK */
        <LobbyView
          roomState={roomState}
          myId={playerId}
          playerName={playerName}
          isLoggedIn={!!user}
          soundEnabled={soundEnabled}
          user={user}
          onUpdateUser={handleUpdateUser}
          chatMessages={chatMessages}
          onStartGame={handleStartGame}
          onAddBot={handleAddBot}
          onRemoveBot={handleRemoveBot}
          onUpdateSettings={handleUpdateSettings}
          onLeaveRoom={handleLeaveRoom}
          onOpenRules={() => setIsRulesOpen(true)}
          onOpenProfile={(tab) => {
            setProfileInitialTab(tab === 'inventory' || tab === 'promocodes' ? tab : 'main');
            setIsProfileOpen(true);
          }}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenAdmin={() => setIsAdminOpen(true)}
          onToggleSound={() => setSoundEnabled(prev => !prev)}
          onSendMessage={handleSendChatMessage}
          onLogout={handleLogout}
          onJoinAsPlayer={handleJoinAsPlayer}
          onSwitchToSpectator={handleSwitchToSpectator}
          onTransferHost={handleTransferHost}
          webRtc={webRtc}
          onOpenWebRtcSettings={handleOpenWebRtcSettings}
        />
      ) : (
        /* IN-GAME VIEW - IDENTICAL CENTRAL CONSOLE TO LOBBY AND CREATED ROOM */
        <InGameView
          roomState={roomState}
          myId={playerId}
          playerName={playerName}
          user={user}
          onUpdateUser={handleUpdateUser}
          soundEnabled={soundEnabled}
          chatMessages={chatMessages}
          isLoggedIn={!!user}
          onNominatePlayer={handleNominatePlayer}
          onVotePlayer={handleVotePlayer}
          onSubmitNightAction={handleSubmitNightAction}
          onSkipPhase={handleSkipPhase}
          onSendMessage={handleSendChatMessage}
          onToggleSound={() => setSoundEnabled(prev => !prev)}
          onOpenRules={() => setIsRulesOpen(true)}
          onOpenNotebook={() => setIsNotebookOpen(true)}
          onOpenProfile={(tab) => {
            setProfileInitialTab(tab === 'inventory' || tab === 'promocodes' ? tab : 'main');
            setIsProfileOpen(true);
          }}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenAdmin={() => setIsAdminOpen(true)}
          onLeaveRoom={handleLeaveRoom}
          onStopGame={handleRestartGame}
          onTransferHost={handleTransferHost}
          onLogout={handleLogout}
          webRtc={webRtc}
          onOpenWebRtcSettings={handleOpenWebRtcSettings}
        />
      )}

      {/* Modals & Dialogs */}
      {/* Independent WebRTC Peer Audio Elements (Plays audio separately from video) */}
      <RemoteAudioRenderer
        remotePeers={webRtc.remotePeers}
        blockIncomingAudio={webRtc.settings.blockIncomingAudio}
      />

      {roomState?.phase === 'MORNING_REPORT' && (
        <MorningReportModal
          dayNumber={roomState.dayNumber}
          lastNightResult={roomState.lastNightResult}
          players={roomState.players}
          timeRemaining={roomState.phaseTimeRemaining}
          myRole={roomState.myRole}
          sheriffLastCheckResult={roomState.sheriffLastCheckResult}
          donLastCheckResult={roomState.donLastCheckResult}
        />
      )}

      {roomState?.phase === 'GAME_OVER' && (
        <GameOverModal
          winner={roomState.winner}
          players={roomState.players}
          isHost={isHost}
          onRestart={handleRestartGame}
          onLeaveRoom={handleLeaveRoom}
          roomCode={roomState.roomCode}
          gameOverReward={roomState.gameOverReward}
          closingAfterMatch={roomState.closingAfterMatch}
          closingCountdownSeconds={roomState.closingCountdownSeconds}
          currentUser={user}
          onOpenProfile={() => {
            setProfileInitialTab('main');
            setIsProfileOpen(true);
          }}
        />
      )}

      <RulesModal
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
      />

      {roomState && (
        <DetectiveNotebook
          isOpen={isNotebookOpen}
          onClose={() => setIsNotebookOpen(false)}
          players={roomState.players}
          roomCode={roomState.roomCode}
        />
      )}

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* User Profile Modal */}
      {user && (
        <UserProfileModal
          user={user}
          isOpen={isProfileOpen}
          initialTab={profileInitialTab}
          onClose={() => setIsProfileOpen(false)}
          onLogout={handleLogout}
          onUpdateUser={handleUpdateUser}
          onOpenAdmin={() => setIsAdminOpen(true)}
          onOpenBonus={() => setIsBonusOpen(true)}
          onOpenShop={() => setIsShopOpen(true)}
          onOpenTasks={() => {
            setIsProfileOpen(false);
            setTasksDefaultTab('global');
            setIsTasksOpen(true);
          }}
          onOpenFeedback={() => {
            setIsProfileOpen(false);
            setIsFeedbackOpen(true);
          }}
          currentRoomCode={roomState?.roomCode}
          onJoinRoom={(code, asSpectator) => {
            setIsProfileOpen(false);
            handleJoinRoom(code, asSpectator);
          }}
        />
      )}

      {/* Real-time Friend Room Invite Popup Toast */}
      {activeRoomInvite && (
        <div className="skin-modal fixed top-4 right-4 z-50 max-w-sm w-full bg-[var(--skin-bg-modal)] border border-[var(--skin-border-accent)] rounded-[var(--skin-radius-modal)] p-4 shadow-[var(--skin-shadow-modal)] animate-in slide-in-from-top-4 duration-200">
          <div className="flex items-start gap-3">
            <div className="cyber-avatar-ring w-10 h-10 rounded-2xl bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-accent)] flex items-center justify-center text-sm font-bold text-[var(--skin-accent-primary)] shrink-0">
              {activeRoomInvite.fromUserName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[var(--skin-text-primary)] uppercase tracking-wider">
                  Приглашение в игру!
                </h4>
                <button
                  onClick={() => setActiveRoomInvite(null)}
                  className="text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-[var(--skin-text-secondary)] mt-1 leading-snug">
                <span className="text-[var(--skin-accent-secondary)] font-bold">{activeRoomInvite.fromUserName}</span> приглашает вас в {activeRoomInvite.isPrivate ? 'приватную' : ''} комнату <span className="font-mono text-[var(--skin-text-primary)] bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] px-1 py-0.5 rounded font-bold">#{activeRoomInvite.roomCode}</span>
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => {
                    sounds.playTick();
                    connectWebSocket(activeRoomInvite.roomCode);
                    setActiveRoomInvite(null);
                  }}
                  className="cyber-room-join-btn skin-btn-join flex-1 py-1.5 px-3 rounded-xl text-[var(--skin-btn-join-text)] font-bold text-xs shadow-md transition-colors"
                >
                  {t('home.join', 'Войти в игру')}
                </button>
                <button
                  onClick={() => setActiveRoomInvite(null)}
                  className="skin-btn-secondary py-1.5 px-3 rounded-xl bg-[var(--skin-btn-secondary-bg)] hover:bg-[var(--skin-bg-elevated)] border border-[var(--skin-btn-secondary-border)] text-[var(--skin-btn-secondary-text)] text-xs font-semibold transition-colors"
                >
                  {t('common.cancel', 'Отклонить')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Bonus Modal */}
      <DailyBonusModal
        isOpen={isBonusOpen}
        onClose={() => setIsBonusOpen(false)}
        user={user}
        onUpdateUser={handleUpdateUser}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      {/* Promo Code Activation Modal */}
      <PromoCodeModal
        isOpen={isPromoModalOpen}
        onClose={() => setIsPromoModalOpen(false)}
        user={user}
        onUpdateUser={handleUpdateUser}
        onOpenProfilePromocodes={() => {
          setProfileInitialTab('promocodes');
          setIsProfileOpen(true);
        }}
      />

      {/* Clans & Syndicates Modal */}
      <ClansModal
        isOpen={isClansOpen}
        onClose={() => setIsClansOpen(false)}
        user={user}
        onUpdateUser={handleUpdateUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenClanTasks={() => {
          setIsClansOpen(false);
          setTasksDefaultTab('clan');
          setIsTasksOpen(true);
        }}
      />

      {/* Events & Tasks Modal */}
      <EventsModal
        isOpen={isTasksOpen}
        onClose={() => setIsTasksOpen(false)}
        user={user}
        onUpdateUser={handleUpdateUser}
        onOpenClans={() => {
          setIsTasksOpen(false);
          setIsClansOpen(true);
        }}
        onOpenAuth={() => setIsAuthOpen(true)}
        defaultTab={tasksDefaultTab}
      />

      {/* Feedback & Bug Reporting Modal */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onUpdateUser={handleUpdateUser}
      />

      {/* Admin Panel Modal (Strictly protected for vledahovic@gmail.com) */}
      <AdminPanelModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        user={user}
        onUpdateCurrentUser={handleUpdateUser}
      />

      {/* Settings Modal (Language, Sound, Rules, WebRTC, Skins) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(prev => !prev)}
        onOpenRules={() => setIsRulesOpen(true)}
        user={user}
        onOpenShop={() => setIsShopOpen(true)}
        onUpdateUser={handleUpdateUser}
      />

      {/* Real-time In-Game XP Toast Notification */}
      {liveXpToast && (
        <aside
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="fixed top-16 right-4 sm:right-6 z-50 pointer-events-none animate-in slide-in-from-top-3 fade-in duration-300"
        >
          <div className="skin-modal px-3.5 py-2.5 rounded-2xl bg-[var(--skin-bg-modal)] border border-[var(--skin-border-accent)] shadow-2xl backdrop-blur-md flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 text-white font-mono font-black text-xs flex items-center justify-center shadow-inner shrink-0">
              +{liveXpToast.xp}
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-spin" />
                <span>{t('profile.tab_experience', 'Получен опыт!')}</span>
              </div>
              <div className="text-[11px] text-amber-300 font-medium max-w-[220px] truncate">
                {liveXpToast.reason}
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Campaign Gift Notification Modal (Deferred during active matches and Game Over modal to avoid blocking controls) */}
      {!Boolean(roomState && roomState.phase && roomState.phase !== 'LOBBY') && unnotifiedCampaignClaims.length > 0 && (
        <CampaignGiftNotificationModal
          claim={unnotifiedCampaignClaims[0]}
          onClose={async (claimId) => {
            setUnnotifiedCampaignClaims(prev => prev.filter(c => c.id !== claimId));
            const token = localStorage.getItem('mafia_auth_token');
            if (token) {
              await fetch('/api/campaigns/ack', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ claimIds: [claimId] })
              }).catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
}
