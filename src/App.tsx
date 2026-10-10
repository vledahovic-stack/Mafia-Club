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
import { UserProfileModal } from './components/UserProfileModal';
import { NavigationDrawer, NavDrawerTab } from './components/NavigationDrawer';
import { ShopModal } from './components/ShopModal';
import { PawnshopModal } from './components/PawnshopModal';
import { DailyBonusModal } from './components/DailyBonusModal';
import { SettingsModal } from './components/SettingsModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { ClansModal } from './components/ClansModal';
import { EventsModal } from './components/EventsModal';
import { useWebRtc } from './hooks/useWebRtc';
import { RemoteAudioRenderer } from './components/RemoteAudioRenderer';
import { OfflineIndicator } from './components/OfflineIndicator';
import { sounds } from './utils/audio';
import { getLevelFromXp } from './utils/experience';
import { AlertCircle, Volume2, VolumeX, X, Sparkles } from 'lucide-react';
import noirLobbyBg from './assets/images/noir_mafia_lobby_bg_1791204529068.jpg';

export default function App() {
  // Authentication & Player persistence
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [liveXpToast, setLiveXpToast] = useState<{ id: number; xp: number; reason: string } | null>(null);

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
  const [roomState, setRoomState] = useState<ClientRoomState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  const [isNotebookOpen, setIsNotebookOpen] = useState<boolean>(false);
  const [profileInitialTab, setProfileInitialTab] = useState<'inventory' | 'experience' | 'friends' | 'mastery' | 'history' | 'stats' | 'nickname' | 'catalog' | 'streak' | 'webrtc'>('inventory');

  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isClansOpen, setIsClansOpen] = useState<boolean>(false);
  const [isTasksOpen, setIsTasksOpen] = useState<boolean>(false);
  const [tasksDefaultTab, setTasksDefaultTab] = useState<'global' | 'onboarding' | 'personal' | 'clan'>('global');

  const handleInGameNavTab = (tab: NavDrawerTab) => {
    setIsInGameNavOpen(false);
    switch (tab) {
      case 'lobby':
        handleLeaveRoom();
        break;
      case 'profile':
        if (user) {
          setIsProfileOpen(true);
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

  // Check saved session on mount
  useEffect(() => {
    const token = localStorage.getItem('mafia_auth_token');
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.user) {
            setUser(data.user);
            setPlayerName(data.user.displayName);
            setPlayerId(data.user.id);
          }
        })
        .catch(() => {
          // Continue as guest
        });
    }
  }, []);

  const handleAuthSuccess = (authUser: AuthUser, token?: string) => {
    setUser(authUser);
    setPlayerName(authUser.displayName);
    setPlayerId(authUser.id);
    localStorage.setItem('mafia_player_name', authUser.displayName);
    localStorage.setItem('mafia_player_id', authUser.id);
    if (token) {
      localStorage.setItem('mafia_auth_token', token);
    }
    setIsAuthOpen(false);
  };

  const handleUpdateUser = (updatedUser: AuthUser) => {
    setUser(updatedUser);
    setPlayerName(updatedUser.displayName);
    localStorage.setItem('mafia_player_name', updatedUser.displayName);
  };

  const handleLogout = () => {
    localStorage.removeItem('mafia_auth_token');
    setUser(null);
    setIsProfileOpen(false);
    setIsAuthOpen(true);
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

  // Check URL room code on initial mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      connectWebSocket(roomFromUrl.toUpperCase());
    }
  }, []);

  // WebSocket connection & messaging
  const connectWebSocket = useCallback((roomCode: string, asSpectator?: boolean) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Send JOIN_ROOM on existing socket
      wsRef.current.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: { roomCode, playerId, playerName, asSpectator }
      }));
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: { roomCode, playerId, playerName, asSpectator }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type && data.type.startsWith('SIGNAL_')) {
          webRtcRef.current?.handleSignalingMessage(data.type, data.payload);
          return;
        }
        if (data.type === 'ROOM_STATE') {
          const newState = data.payload as ClientRoomState;
          
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
        } else if (data.type === 'CHAT_HISTORY') {
          setChatMessages(data.payload as ChatMessage[]);
        } else if (data.type === 'ROOM_INVITE') {
          setActiveRoomInvite(data.payload);
          sounds.playTick();
        } else if (data.type === 'ERROR') {
          setErrorMessage(data.payload.message);
          setTimeout(() => setErrorMessage(null), 4000);
        }
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = () => {
      // If we are currently in a room, attempt auto-reconnect
      if (roomState?.roomCode) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket(roomState.roomCode);
        }, 2000);
      }
    };

    wsRef.current = ws;
  }, [playerId, playerName, roomState?.roomCode]);

  // Clean up
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Send message over WebSocket
  const sendWs = (type: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type,
        payload: { ...payload, roomCode: roomState?.roomCode, playerId }
      }));
    }
  };

  // ACTIONS
  const handleCreateRoom = async (roomName: string, settings?: Partial<RoomSettings>) => {
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: playerId, hostName: playerName, roomName, settings })
      });
      if (res.ok) {
        const data = await res.json();
        // Update URL
        const newUrl = `${window.location.pathname}?room=${data.roomCode}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
        connectWebSocket(data.roomCode);
      }
    } catch (e) {
      setErrorMessage('Не удалось создать комнату. Проверьте соединение.');
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
  const isHost = roomState?.hostId === playerId;

  return (
    <div className="min-h-screen bg-[#08090c] text-zinc-100 flex flex-col selection:bg-rose-900 selection:text-white">
      {/* Error Toast Notification */}
      {errorMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-red-950/95 border border-red-700 text-red-200 text-xs shadow-2xl flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Quick Sound Toggle Toast HUD */}
      {soundToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-2xl bg-[#141522]/95 border border-zinc-700/80 text-white text-xs shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
            soundToast.enabled ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
          }`}>
            {soundToast.enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-bold flex items-center gap-1.5">
              <span>{soundToast.enabled ? 'Звук включен' : 'Звук выключен'}</span>
              <kbd className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px] text-zinc-400">M</kbd>
            </div>
            <p className="text-[10px] text-zinc-400">Горячая клавиша: Нажмите [M] для переключения</p>
          </div>
        </div>
      )}

      {/* Offline Mode Indicator for PWA */}
      <OfflineIndicator />

      {/* Main Content Area */}
      {!roomState ? (
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
          onOpenProfile={() => setIsProfileOpen(true)}
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
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenAdmin={() => setIsAdminOpen(true)}
          onToggleSound={() => setSoundEnabled(prev => !prev)}
          onSendMessage={handleSendChatMessage}
          onLogout={handleLogout}
          onJoinAsPlayer={handleJoinAsPlayer}
          onSwitchToSpectator={handleSwitchToSpectator}
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
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenAdmin={() => setIsAdminOpen(true)}
          onLeaveRoom={handleLeaveRoom}
          onStopGame={handleRestartGame}
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
          roomCode={roomState.roomCode}
          gameOverReward={roomState.gameOverReward}
          currentUser={user}
          onOpenProfile={() => setIsProfileOpen(true)}
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
          currentRoomCode={roomState?.roomCode}
          onJoinRoom={(code, asSpectator) => {
            setIsProfileOpen(false);
            handleJoinRoom(code, asSpectator);
          }}
        />
      )}

      {/* Real-time Friend Room Invite Popup Toast */}
      {activeRoomInvite && (
        <div className="fixed top-4 right-4 z-50 max-w-sm w-full bg-[#171828] border border-amber-500/80 rounded-2xl p-4 shadow-2xl shadow-black/80 animate-in slide-in-from-top-4 duration-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-950 border border-amber-600/80 flex items-center justify-center text-sm font-bold text-amber-300 shrink-0">
              {activeRoomInvite.fromUserName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Приглашение в игру!
                </h4>
                <button
                  onClick={() => setActiveRoomInvite(null)}
                  className="text-zinc-500 hover:text-white p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-zinc-300 mt-1 leading-snug">
                <span className="text-amber-400 font-bold">{activeRoomInvite.fromUserName}</span> приглашает вас в {activeRoomInvite.isPrivate ? 'приватную' : ''} комнату <span className="font-mono text-white bg-black/50 px-1 py-0.5 rounded font-bold">#{activeRoomInvite.roomCode}</span>
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => {
                    sounds.playTick();
                    connectWebSocket(activeRoomInvite.roomCode);
                    setActiveRoomInvite(null);
                  }}
                  className="flex-1 py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-md shadow-amber-950/40 transition-colors"
                >
                  Войти в игру
                </button>
                <button
                  onClick={() => setActiveRoomInvite(null)}
                  className="py-1.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
                >
                  Отклонить
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

      {/* Admin Panel Modal (Strictly protected for vledahovic@gmail.com) */}
      <AdminPanelModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        user={user}
        onUpdateCurrentUser={handleUpdateUser}
      />

      {/* Real-time In-Game XP Toast Notification */}
      {liveXpToast && (
        <aside
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="fixed top-16 right-4 sm:right-6 z-50 pointer-events-none animate-in slide-in-from-top-3 fade-in duration-300"
        >
          <div className="px-3.5 py-2.5 rounded-2xl bg-[#131422]/95 border border-amber-500/70 shadow-2xl shadow-amber-950/70 backdrop-blur-md flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 text-white font-mono font-black text-xs flex items-center justify-center shadow-inner shrink-0">
              +{liveXpToast.xp}
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-spin" />
                <span>Получен опыт!</span>
              </div>
              <div className="text-[11px] text-amber-300 font-medium max-w-[220px] truncate">
                {liveXpToast.reason}
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
