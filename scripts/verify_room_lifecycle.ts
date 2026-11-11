import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { Room, roomManager } from '../server/game/roomManager';
import { RoleId } from '../src/types/mafia';

function createMockSocket(): { ws: WebSocket; sentMessages: any[] } {
  const sentMessages: any[] = [];
  const mock = {
    readyState: WebSocket.OPEN,
    send(data: string) {
      try {
        sentMessages.push(JSON.parse(data));
      } catch {
        sentMessages.push(data);
      }
    }
  };
  return { ws: mock as unknown as WebSocket, sentMessages };
}

function addHumanPlayer(room: Room, id: string, name: string, connected = true) {
  room.state.players.push({
    id,
    name,
    avatarSeed: name,
    isHost: false,
    isBot: false,
    isAlive: true,
    connected,
    ready: true,
    warningsCount: 0
  });
  if (connected) {
    const { ws, sentMessages } = createMockSocket();
    room.sockets.set(id, ws);
    return { ws, sentMessages };
  }
  return { ws: null, sentMessages: [] };
}

async function runTests() {
  console.log('=== Verifying Room Lifecycle Rules ===');

  // Verify default constants
  assert.equal(Room.DEFAULT_HOST_DISCONNECT_TIMEOUT_MS, 5 * 60 * 1000, 'Host disconnect timeout must be 5 minutes (300000 ms)');
  assert.equal(Room.DEFAULT_POST_MATCH_CLOSE_DELAY_MS, 10 * 1000, 'Post-match close delay must be 10 seconds (10000 ms)');
  console.log('✅ 0. Default timeout constants verified (5 min disconnect, 10 sec post-match).');

  // ---------------------------------------------------------------------------
  // 1. Voluntary host exit from LOBBY without prior host transfer
  // ---------------------------------------------------------------------------
  {
    const room = roomManager.createRoom('Lobby Exit Test', 'host1', 'Host One');
    const code = room.state.roomCode;
    const hostMock = createMockSocket();
    room.sockets.set('host1', hostMock.ws);

    const p2Mock = addHumanPlayer(room, 'p2', 'Player Two');
    const specMock = createMockSocket();
    room.addSpectator({
      id: 'spec1',
      name: 'Spectator One',
      avatarSeed: 'Spectator One',
      joinedAt: Date.now()
    });
    room.sockets.set('spec1', specMock.ws);

    // Host voluntarily leaves in LOBBY
    room.sockets.delete('host1');
    room.removePlayer('host1');

    assert.equal(room.isClosed, true, 'Room must close immediately when host voluntarily leaves LOBBY');
    assert.equal(roomManager.getRoom(code), undefined, 'Closed room must be removed from roomManager');
    assert.equal(room.state.players.length, 0, 'All players must be cleared from closed room');
    assert.equal(room.spectators.size, 0, 'All spectators must be cleared from closed room');
    assert.equal(
      p2Mock.sentMessages.some(m => m.type === 'ROOM_CLOSED'),
      true,
      'Connected player must receive ROOM_CLOSED eviction event'
    );
    assert.equal(
      specMock.sentMessages.some(m => m.type === 'ROOM_CLOSED'),
      true,
      'Connected spectator must receive ROOM_CLOSED eviction event'
    );
    console.log('✅ 1. Voluntary host exit from LOBBY immediately closes room and evicts players & spectators.');
  }

  // ---------------------------------------------------------------------------
  // 2. Voluntary host exit during active match -> match continues -> 10s auto-close
  // ---------------------------------------------------------------------------
  {
    const room = roomManager.createRoom('Active Match Host Exit', 'host1', 'Host One');
    const code = room.state.roomCode;
    room.postMatchCloseDelayMs = 80; // Fast timer for test execution (default 10000ms verified above)

    const hostMock = createMockSocket();
    room.sockets.set('host1', hostMock.ws);
    const p2Mock = addHumanPlayer(room, 'p2', 'Player Two');
    const p3Mock = addHumanPlayer(room, 'p3', 'Player Three');
    const p4Mock = addHumanPlayer(room, 'p4', 'Player Four');
    const p5Mock = addHumanPlayer(room, 'p5', 'Player Five');
    const specMock = createMockSocket();
    room.addSpectator({
      id: 'spec1',
      name: 'Spectator One',
      avatarSeed: 'Spectator One',
      joinedAt: Date.now()
    });
    room.sockets.set('spec1', specMock.ws);

    assert.equal(room.startGame('host1'), true, 'Host starts game');

    // Set deterministic roles so host leaving doesn't immediately end match
    const assignRole = (id: string, role: RoleId) => {
      const p = room.state.players.find(x => x.id === id);
      if (p) p.role = role;
    };
    assignRole('host1', 'civilian');
    assignRole('p2', 'mafia');
    assignRole('p3', 'sheriff');
    assignRole('p4', 'doctor');
    assignRole('p5', 'civilian');

    // Advance from ROLE_REVEAL to DAY_DISCUSSION
    room.advancePhase();
    assert.equal(room.state.phase, 'DAY_DISCUSSION', 'Match is in DAY_DISCUSSION');

    // Host voluntarily leaves during active match
    room.sockets.delete('host1');
    room.removePlayer('host1');

    assert.equal(room.isClosed, false, 'Room must NOT close immediately when host leaves during active match');
    assert.equal(room.state.phase, 'DAY_DISCUSSION', 'Match must NOT be interrupted when host leaves');
    assert.equal(room.state.hostId, '', 'hostId must be cleared (no auto-host assignment)');
    assert.equal(room.state.players.some(p => p.isHost), false, 'No remaining player may be auto-assigned as host');
    assert.equal(room.state.closingAfterMatch, true, 'Room must be marked closingAfterMatch = true');

    // Remaining players continue playing normally: advance to INDIVIDUAL_SPEECHES -> nominate p2 (mafia) -> vote p2 out -> civilians win!
    room.advancePhase(); // -> INDIVIDUAL_SPEECHES
    assert.equal(room.state.phase, 'INDIVIDUAL_SPEECHES');
    const currentSpeaker = room.state.currentSpeakerId!;
    const nomTarget = currentSpeaker === 'p2' ? 'p3' : 'p2';
    assert.equal(room.nominatePlayer(nomTarget, currentSpeaker), true, 'Nominations must work normally after host left');

    // Advance through remaining speeches to VOTING
    while (room.state.phase === 'INDIVIDUAL_SPEECHES') {
      room.advancePhase();
    }
    assert.equal(room.state.phase, 'VOTING', 'Match transitions to VOTING normally');

    // Force p2 (mafia) to be nominated and voted out so civilians win
    if (!room.state.nominatedPlayerIds.includes('p2')) {
      room.state.nominatedPlayerIds = ['p2'];
    }
    room.castVote('p3', 'p2');
    room.castVote('p4', 'p2');
    room.castVote('p5', 'p2');
    room.castVote('p2', 'skip');

    // Resolve voting -> LAST_WORDS_ARREST for p2 -> resolveLastWordsArrest -> GAME_OVER
    if ((room.state.phase as string) !== 'LAST_WORDS_ARREST') {
      room.advancePhase();
    }
    assert.equal(room.state.phase, 'LAST_WORDS_ARREST', 'Eliminated player gets LAST_WORDS_ARREST');
    room.advancePhase(); // -> resolves arrest, detects civilians win -> endGame('civilians')

    assert.equal(room.state.phase, 'GAME_OVER', 'Match reaches GAME_OVER naturally');
    assert.equal(room.state.winner, 'civilians', 'Civilians win');
    assert.equal(room.isClosed, false, 'Room stays open during post-match 10s window to show GameOverModal');
    assert.equal(room.state.closingAfterMatch, true, 'closingAfterMatch remains true in GAME_OVER');

    // Verify starting a next match is impossible
    assert.equal(room.restartGame('p3', true), false, 'Cannot restart match when closingAfterMatch is true');
    assert.equal(room.startGame('p3'), false, 'Cannot start match when closingAfterMatch is true');

    // Wait for post-match close timer to fire
    await new Promise(r => setTimeout(r, 150));

    assert.equal(room.isClosed, true, 'Room must automatically close after post-match timer expires');
    assert.equal(roomManager.getRoom(code), undefined, 'Room must be removed from roomManager after post-match close');
    assert.equal(p3Mock.sentMessages.some(m => m.type === 'ROOM_CLOSED'), true, 'Remaining players must receive ROOM_CLOSED');
    assert.equal(specMock.sentMessages.some(m => m.type === 'ROOM_CLOSED'), true, 'Remaining spectators must receive ROOM_CLOSED');
    console.log('✅ 2. Voluntary host exit during active match continues match to completion, blocks restart, and auto-closes room after post-match delay.');
  }

  // ---------------------------------------------------------------------------
  // 3. Voluntary host transfer in LOBBY and Active Match (including to eliminated player)
  // ---------------------------------------------------------------------------
  {
    const room = roomManager.createRoom('Transfer Test', 'host1', 'Host One');
    const code = room.state.roomCode;
    const hostMock = createMockSocket();
    room.sockets.set('host1', hostMock.ws);
    addHumanPlayer(room, 'p2', 'Player Two', true);
    addHumanPlayer(room, 'p3', 'Player Three', true);
    addHumanPlayer(room, 'p4', 'Player Four', false); // Disconnected player
    room.addBot(); // Bot player
    const botPlayer = room.state.players.find(p => p.isBot)!;
    room.addSpectator({
      id: 'spec1',
      name: 'Spectator One',
      avatarSeed: 'Spectator One',
      joinedAt: Date.now()
    });

    // Validation checks
    assert.equal(room.transferHost('host1', 'host1').success, false, 'Cannot transfer host to self');
    assert.equal(room.transferHost('host1', 'spec1').success, false, 'Cannot transfer host to spectator');
    assert.equal(room.transferHost('host1', botPlayer.id).success, false, 'Cannot transfer host to bot');
    assert.equal(room.transferHost('host1', 'p4').success, false, 'Cannot transfer host to disconnected player');
    assert.equal(room.transferHost('p2', 'p3').success, false, 'Non-host cannot transfer host');

    // Host cannot switch to spectator in LOBBY without transferring host first
    assert.equal(room.becomeSpectatorFromPlayer('host1'), false, 'Host cannot switch to spectator without transferring host first');

    // Valid transfer in LOBBY: host1 -> p2
    const transfer1 = room.transferHost('host1', 'p2');
    assert.equal(transfer1.success, true, 'Host transfer to connected human player in LOBBY must succeed');
    assert.equal(room.state.hostId, 'p2');
    assert.equal(room.state.players.find(p => p.id === 'p2')?.isHost, true);
    assert.equal(room.state.players.find(p => p.id === 'host1')?.isHost, false);

    // Reconnect p4 so all 4 human players are connected, then start game as new host p2
    room.handlePlayerReconnect('p4');
    assert.equal(room.startGame('host1'), false, 'Former host cannot start game');
    assert.equal(room.startGame('p2'), true, 'New host p2 can start game');

    // Eliminate p3 during match, then transfer host from p2 to eliminated player p3
    const p3 = room.state.players.find(p => p.id === 'p3')!;
    p3.isAlive = false;
    room.advancePhase(); // -> DAY_DISCUSSION
    const phaseBefore = room.state.phase;
    const timeBefore = room.state.phaseTimeRemaining;

    const transferToDead = room.transferHost('p2', 'p3');
    assert.equal(transferToDead.success, true, 'Host transfer to eliminated connected human player during active match must succeed');
    assert.equal(room.state.hostId, 'p3', 'p3 is now host');
    assert.equal(p3.isHost, true, 'p3 has isHost = true');
    assert.equal(p3.isAlive, false, 'p3 MUST remain eliminated (isAlive = false)');
    assert.equal(room.state.phase, phaseBefore, 'Phase must not change on host transfer');
    assert.equal(room.state.phaseTimeRemaining, timeBefore, 'Timer must not reset on host transfer');

    // Verify eliminated host p3 CANNOT perform alive player actions
    assert.equal(room.skipPhase('p3'), false, 'Eliminated host cannot skip day discussion');
    room.state.phase = 'INDIVIDUAL_SPEECHES';
    room.state.currentSpeakerId = 'p2';
    assert.equal(room.nominatePlayer('host1', 'p3'), false, 'Eliminated host cannot nominate players');
    room.state.phase = 'VOTING';
    room.state.nominatedPlayerIds = ['host1'];
    assert.equal(room.castVote('p3', 'host1'), false, 'Eliminated host cannot vote');
    room.state.phase = 'NIGHT';
    p3.role = 'mafia';
    assert.equal(room.submitNightAction('p3', 'mafia', 'host1'), false, 'Eliminated host cannot perform night actions');

    // Former host p2 leaves voluntarily during active match after having transferred host to p3
    room.removePlayer('p2');
    assert.equal(room.state.closingAfterMatch, false, 'Room must NOT be marked closingAfterMatch when former host leaves after transferring host');
    assert.equal(room.state.hostId, 'p3', 'p3 remains host');

    // Eliminated host p3 retains administrative host rights (can stop/restart match to LOBBY)
    assert.equal(room.restartGame('p3', false), true, 'Eliminated host retains administrative right to restart/stop game');
    assert.equal(room.state.phase, 'LOBBY');

    roomManager.removeRoom(code);
    console.log('✅ 3 & 4. Voluntary host transfer in LOBBY and active match (including eliminated host restrictions) verified.');
  }

  // ---------------------------------------------------------------------------
  // 4. Host connection loss (5-minute grace timer) + Reconnect cancels timer
  // ---------------------------------------------------------------------------
  {
    const room = roomManager.createRoom('Disconnect Reconnect Test', 'host1', 'Host One');
    const code = room.state.roomCode;
    room.hostDisconnectTimeoutMs = 120; // Fast grace timer for test

    const hostMock = createMockSocket();
    room.sockets.set('host1', hostMock.ws);
    const p2Mock = addHumanPlayer(room, 'p2', 'Player Two');

    // Host loses connection (network drop, NOT voluntary leave)
    room.handlePlayerDisconnect('host1');

    const hostPlayer = room.state.players.find(p => p.id === 'host1')!;
    assert.equal(hostPlayer.connected, false, 'Host marked connected = false on disconnect');
    assert.equal(room.state.hostId, 'host1', 'Host is NOT auto-transferred on disconnect');
    assert.equal(room.isClosed, false, 'Room is preserved during grace period');

    // Wait 50ms (< 120ms), then host reconnects
    await new Promise(r => setTimeout(r, 50));
    assert.equal(room.handlePlayerReconnect('host1', 'Host One'), true, 'Host reconnects within grace period');
    assert.equal(hostPlayer.connected, true, 'Host marked connected = true after reconnect');

    // Wait 120ms more (past original 120ms deadline) to ensure stale timer does NOT close room
    await new Promise(r => setTimeout(r, 120));
    assert.equal(room.isClosed, false, 'Stale disconnect timer must NOT close room after host reconnected');
    assert.equal(roomManager.getRoom(code), room, 'Room remains active in roomManager');

    // Now host loses connection again and does NOT return within grace period
    room.handlePlayerDisconnect('host1');
    await new Promise(r => setTimeout(r, 180));

    assert.equal(room.isClosed, true, 'Room must close when host does not reconnect within grace period');
    assert.equal(roomManager.getRoom(code), undefined, 'Room removed from roomManager after grace period expiry');
    assert.equal(p2Mock.sentMessages.some(m => m.type === 'ROOM_CLOSED'), true, 'Other connected players evicted when host disconnect timer expires');
    console.log('✅ 5. Host connection loss grace timer, reconnect cancellation, and expiry closure verified.');
  }

  // ---------------------------------------------------------------------------
  // 5. All players lose connection during active match -> state preserved -> host reconnects
  // ---------------------------------------------------------------------------
  {
    const room = roomManager.createRoom('All Disconnect Test', 'host1', 'Host One');
    const code = room.state.roomCode;
    room.hostDisconnectTimeoutMs = 150;

    const hostMock = createMockSocket();
    room.sockets.set('host1', hostMock.ws);
    addHumanPlayer(room, 'p2', 'Player Two');
    addHumanPlayer(room, 'p3', 'Player Three');
    addHumanPlayer(room, 'p4', 'Player Four');

    assert.equal(room.startGame('host1'), true);
    room.advancePhase(); // -> DAY_DISCUSSION
    const savedRoles = new Map(room.state.players.map(p => [p.id, p.role]));

    // All players lose connection
    room.handlePlayerDisconnect('host1');
    room.handlePlayerDisconnect('p2');
    room.handlePlayerDisconnect('p3');
    room.handlePlayerDisconnect('p4');

    assert.equal(room.isClosed, false, 'Room preserved when all players lose connection');
    assert.equal(room.state.players.length, 4, 'Disconnected players stay in state.players');
    assert.equal(room.spectators.size, 0, 'Disconnected players are NEVER converted to spectators');
    assert.equal(room.state.phase, 'DAY_DISCUSSION', 'Match phase preserved');

    // Host and players reconnect within grace period
    await new Promise(r => setTimeout(r, 50));
    assert.equal(room.handlePlayerReconnect('host1'), true);
    assert.equal(room.handlePlayerReconnect('p2'), true);
    for (const p of room.state.players) {
      assert.equal(p.role, savedRoles.get(p.id), 'Player roles preserved across disconnect/reconnect');
    }

    await new Promise(r => setTimeout(r, 150));
    assert.equal(room.isClosed, false, 'Room continues operating after host reconnected');

    roomManager.removeRoom(code);
    console.log('✅ 6. All-players disconnect preservation and recovery verified.');
  }

  // ---------------------------------------------------------------------------
  // 6. REMOVE_BOT security validation (Stage 0 vulnerability fix)
  // ---------------------------------------------------------------------------
  {
    const room = roomManager.createRoom('Remove Bot Security Test', 'host1', 'Host One');
    const code = room.state.roomCode;
    const hostActiveMock = createMockSocket();
    const hostStaleMock = createMockSocket();
    room.sockets.set('host1', hostActiveMock.ws);

    const p2Mock = addHumanPlayer(room, 'p2', 'Player Two', true);
    const p3Mock = addHumanPlayer(room, 'p3', 'Player Three', true);

    assert.equal(room.addBot(), true, 'Bot 1 added');
    assert.equal(room.addBot(), true, 'Bot 2 added');
    const bots = room.state.players.filter(p => p.isBot);
    assert.equal(bots.length, 2, 'Two bots exist in room');
    const bot1 = bots[0];
    const bot2 = bots[1];

    // Helper simulating the exact server.ts REMOVE_BOT WebSocket handler + room.removeBot
    const handleRemoveBotWs = (
      ws: WebSocket,
      currentRoomCode: string | null,
      currentPlayerId: string | null,
      payload: { botId?: any }
    ): boolean => {
      if (!currentRoomCode || !currentPlayerId) return false;
      const targetRoom = roomManager.getRoom(currentRoomCode);
      if (!targetRoom || targetRoom.isClosed || targetRoom.state.closingAfterMatch) return false;
      if (targetRoom.sockets.get(currentPlayerId) !== ws) return false;

      const requester = targetRoom.state.players.find(p => p.id === currentPlayerId);
      const isRequesterHost = targetRoom.state.hostId === currentPlayerId && Boolean(requester?.isHost);
      if (!isRequesterHost) return false;

      if (targetRoom.state.phase !== 'LOBBY') return false;
      if (!payload?.botId || typeof payload.botId !== 'string') return false;

      const targetPlayer = targetRoom.state.players.find(p => p.id === payload.botId);
      if (!targetPlayer || targetPlayer.isBot !== true) return false;

      return targetRoom.removeBot(currentPlayerId, payload.botId);
    };

    const snapshotIds = () => room.state.players.map(p => p.id).join(',');

    // Scenario 2: Regular non-host player tries to remove a bot -> rejected
    const beforeNonHost = snapshotIds();
    assert.equal(handleRemoveBotWs(p2Mock.ws!, code, 'p2', { botId: bot1.id }), false, 'Non-host WS REMOVE_BOT must be rejected');
    assert.equal(room.removeBot('p2', bot1.id), false, 'Non-host room.removeBot must be rejected');
    assert.equal(snapshotIds(), beforeNonHost, 'Players list unchanged after non-host attempt');

    // Scenario 3: Host passes a live human player ID to REMOVE_BOT -> rejected
    const beforeHumanTarget = snapshotIds();
    assert.equal(handleRemoveBotWs(hostActiveMock.ws, code, 'host1', { botId: 'p2' }), false, 'Removing live player via REMOVE_BOT must be rejected');
    assert.equal(room.removeBot('host1', 'p2'), false, 'room.removeBot with live player ID must be rejected');
    assert.equal(room.removeBot('host1', 'host1'), false, 'room.removeBot with host own ID must be rejected');
    assert.equal(snapshotIds(), beforeHumanTarget, 'Live players untouched after REMOVE_BOT attempt with human ID');

    // Scenario 5: Request contains non-existent ID -> rejected
    const beforeNonExistent = snapshotIds();
    assert.equal(handleRemoveBotWs(hostActiveMock.ws, code, 'host1', { botId: 'bot_nonexistent_999' }), false, 'Non-existent botId must be rejected');
    assert.equal(room.removeBot('host1', 'bot_nonexistent_999'), false, 'room.removeBot with non-existent ID must be rejected');
    assert.equal(handleRemoveBotWs(hostActiveMock.ws, code, 'host1', { botId: '' }), false, 'Empty botId must be rejected');
    assert.equal(snapshotIds(), beforeNonExistent, 'Players list unchanged after non-existent ID attempt');

    // Scenario 6: Request sent from stale or invalid socket connection -> rejected
    const beforeStaleSocket = snapshotIds();
    assert.equal(handleRemoveBotWs(hostStaleMock.ws, code, 'host1', { botId: bot1.id }), false, 'Stale socket for host1 must be rejected');
    assert.equal(handleRemoveBotWs(hostActiveMock.ws, 'INVALID_ROOM', 'host1', { botId: bot1.id }), false, 'Invalid room code must be rejected');
    assert.equal(handleRemoveBotWs(hostActiveMock.ws, null, 'host1', { botId: bot1.id }), false, 'Null room code must be rejected');
    assert.equal(snapshotIds(), beforeStaleSocket, 'Players list unchanged after stale/invalid socket attempt');

    // Scenario 1: Active host removes a real bot in LOBBY -> succeeds
    assert.equal(handleRemoveBotWs(hostActiveMock.ws, code, 'host1', { botId: bot1.id }), true, 'Active host removes bot1 in LOBBY');
    assert.equal(room.state.players.some(p => p.id === bot1.id), false, 'bot1 removed from state.players');
    assert.equal(room.state.players.some(p => p.id === bot2.id), true, 'bot2 still present');
    assert.equal(room.state.players.length, 4, '3 humans + 1 remaining bot = 4 players');

    // Scenario 7: After host transfer, former host tries to remove a bot -> rejected
    const transferRes = room.transferHost('host1', 'p2');
    assert.equal(transferRes.success, true, 'Host transferred from host1 to p2');
    const beforeFormerHost = snapshotIds();
    assert.equal(handleRemoveBotWs(hostActiveMock.ws, code, 'host1', { botId: bot2.id }), false, 'Former host WS REMOVE_BOT must be rejected');
    assert.equal(room.removeBot('host1', bot2.id), false, 'Former host room.removeBot must be rejected');
    assert.equal(snapshotIds(), beforeFormerHost, 'Players list unchanged after former host attempt');

    // Scenario 4 & 8: Current host (p2) tries to remove a bot during an active match -> rejected, match state unchanged
    assert.equal(room.startGame('p2'), true, 'New host p2 starts game with 4 players (3 humans + bot2)');
    assert.equal(room.state.phase, 'ROLE_REVEAL', 'Game is in ROLE_REVEAL');
    const rolesSnapshot = room.state.players.map(p => `${p.id}:${p.role}:${p.isAlive}`).join('|');

    assert.equal(handleRemoveBotWs(p2Mock.ws!, code, 'p2', { botId: bot2.id }), false, 'Host cannot remove bot in ROLE_REVEAL');
    assert.equal(room.removeBot('p2', bot2.id), false, 'room.removeBot rejected in ROLE_REVEAL');

    room.advancePhase(); // -> DAY_DISCUSSION
    assert.equal(room.state.phase, 'DAY_DISCUSSION', 'Game is in DAY_DISCUSSION');
    const dayTimeBefore = room.state.phaseTimeRemaining;
    assert.equal(handleRemoveBotWs(p2Mock.ws!, code, 'p2', { botId: bot2.id }), false, 'Host cannot remove bot in DAY_DISCUSSION');
    assert.equal(room.removeBot('p2', bot2.id), false, 'room.removeBot rejected in DAY_DISCUSSION');

    // Verify Scenario 8: participant list, roles, alive status, and phase remain completely unchanged
    assert.equal(room.state.players.length, 4, 'All 4 participants remain in active match');
    assert.equal(room.state.players.some(p => p.id === bot2.id), true, 'bot2 still in active match');
    assert.equal(room.state.players.map(p => `${p.id}:${p.role}:${p.isAlive}`).join('|'), rolesSnapshot, 'Roles and alive state unchanged');
    assert.equal(room.state.phase, 'DAY_DISCUSSION', 'Phase unchanged');
    assert.equal(room.state.phaseTimeRemaining, dayTimeBefore, 'Timer unchanged');

    // Also verify closed room rejects removeBot
    room.restartGame('p2', false);
    assert.equal(room.state.phase, 'LOBBY');
    room.closeRoom('Test cleanup');
    assert.equal(room.removeBot('p2', bot2.id), false, 'Closed room rejects removeBot');
    assert.equal(handleRemoveBotWs(p2Mock.ws!, code, 'p2', { botId: bot2.id }), false, 'Closed room rejects WS REMOVE_BOT');

    console.log('✅ 7. All 8 REMOVE_BOT security validation scenarios verified.');
  }

  // ---------------------------------------------------------------------------
  // 7. Stage 1: Table Friends Integration & Server-Verified isRegistered Flag
  // ---------------------------------------------------------------------------
  {
    const { userDb } = await import('../server/db/users');
    const { getDatabase, waitForDatabaseInit } = await import('../server/db/database');
    await waitForDatabaseInit();
    const db = getDatabase();

    const testSuffix = Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const u1Id = `usr_test_f1_${testSuffix}`;
    const u2Id = `usr_test_f2_${testSuffix}`;
    const u1Name = `ТестИгрок1_${testSuffix}`;
    const u2Name = `ТестИгрок2_${testSuffix}`;
    const nowIso = new Date().toISOString();

    try {
      await db.batch([
        {
          sql: `INSERT INTO users (id, email, display_name, password_hash, avatar_seed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [u1Id, `f1_${testSuffix}@example.com`, u1Name, 'hash', u1Name, nowIso, nowIso]
        },
        {
          sql: `INSERT INTO users (id, email, display_name, password_hash, avatar_seed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [u2Id, `f2_${testSuffix}@example.com`, u2Name, 'hash', u2Name, nowIso, nowIso]
        }
      ]);

      // 7.1 Verify server-authoritative isRegistered in Room, getClientState, spectator transition, and distributeRoles
      const room = roomManager.createRoom('Friends Table Test', u1Id, u1Name, undefined, true);
      const code = room.state.roomCode;

      // Registered player 2 joins
      room.state.players.push({
        id: u2Id,
        name: u2Name,
        avatarSeed: u2Name,
        isHost: false,
        isBot: false,
        isRegistered: true,
        isAlive: true,
        connected: true,
        ready: true,
        warningsCount: 0
      });

      // Guest player joins (with 'user_...' prefix that looks like a user id, but isRegistered: false)
      room.state.players.push({
        id: 'user_guest_spoof_123',
        name: u2Name, // Even spoofing u2's display name!
        avatarSeed: 'guest',
        isHost: false,
        isBot: false,
        isRegistered: false,
        isAlive: true,
        connected: true,
        ready: true,
        warningsCount: 0
      });

      // Bot joins
      room.addBot();

      const clientState = room.getClientState(u1Id);
      const hostInClient = clientState.players.find(p => p.id === u1Id)!;
      const regInClient = clientState.players.find(p => p.id === u2Id)!;
      const guestInClient = clientState.players.find(p => p.id === 'user_guest_spoof_123')!;
      const botInClient = clientState.players.find(p => p.isBot)!;

      assert.equal(hostInClient.isRegistered, true, 'Host created by registered user has isRegistered = true');
      assert.equal(regInClient.isRegistered, true, 'Verified registered player has isRegistered = true');
      assert.equal(guestInClient.isRegistered, false, 'Guest player has isRegistered = false regardless of ID prefix or name');
      assert.equal(botInClient.isRegistered, false, 'Bot has isRegistered = false');

      // 7.2 Cannot add self to friends
      await assert.rejects(
        () => userDb.sendFriendRequest(u1Id, u1Id, { strictById: true }),
        /самого себя/,
        'Self friend request must be rejected'
      );

      // 7.3 Guest and Bot IDs cannot be added via strictById
      await assert.rejects(
        () => userDb.sendFriendRequest(u1Id, guestInClient.id, { strictById: true }),
        /не найден/,
        'Guest ID must be rejected by sendFriendRequest'
      );
      await assert.rejects(
        () => userDb.sendFriendRequest(u1Id, botInClient.id, { strictById: true }),
        /не найден/,
        'Bot ID must be rejected by sendFriendRequest'
      );
      // Even passing a registered player's displayName with strictById: true must be rejected (must use permanent account ID)
      await assert.rejects(
        () => userDb.sendFriendRequest(u1Id, u2Name, { strictById: true }),
        /не найден/,
        'strictById must require permanent account ID and reject displayName lookup'
      );

      // 7.4 Registered player u1 sends friend request to registered player u2 by permanent ID
      const reqRes = await userDb.sendFriendRequest(u1Id, u2Id, { strictById: true });
      assert.equal(reqRes.success, true, 'Friend request from u1 to u2 succeeds');
      assert.equal(reqRes.friend.status, 'pending_sent', 'Status for sender u1 is pending_sent');

      const u1FriendsAfterSend = await userDb.getFriends(u1Id);
      const u2FriendsAfterSend = await userDb.getFriends(u2Id);
      assert.equal(u1FriendsAfterSend.find(f => f.id === u2Id)?.status, 'pending_sent', 'u1 sees pending_sent');
      assert.equal(u2FriendsAfterSend.find(f => f.id === u1Id)?.status, 'pending_received', 'u2 sees pending_received');

      // 7.5 Duplicate friend request from u1 to u2 is rejected and creates no duplicates
      await assert.rejects(
        () => userDb.sendFriendRequest(u1Id, u2Id, { strictById: true }),
        /уже отправлен/,
        'Duplicate friend request must be rejected'
      );
      const u1FriendsAfterDup = await userDb.getFriends(u1Id);
      assert.equal(u1FriendsAfterDup.filter(f => f.id === u2Id).length, 1, 'No duplicate friend entries created');

      // 7.6 Recipient u2 accepts incoming friend request from u1
      const accRes = await userDb.acceptFriendRequest(u2Id, u1Id);
      assert.equal(accRes.success, true, 'u2 accepts friend request from u1');
      assert.equal(accRes.friend.status, 'accepted', 'Status becomes accepted');

      const u1FriendsFinal = await userDb.getFriends(u1Id);
      const u2FriendsFinal = await userDb.getFriends(u2Id);
      assert.equal(u1FriendsFinal.find(f => f.id === u2Id)?.status, 'accepted', 'u1 sees accepted friendship');
      assert.equal(u2FriendsFinal.find(f => f.id === u1Id)?.status, 'accepted', 'u2 sees accepted friendship');

      // 7.7 Sending request when already friends is rejected
      await assert.rejects(
        () => userDb.sendFriendRequest(u1Id, u2Id, { strictById: true }),
        /уже в вашем списке друзей/,
        'Request when already friends must be rejected'
      );

      roomManager.removeRoom(code);
      console.log('✅ 8. Stage 1 table friends integration & server-verified isRegistered checks passed.');
    } finally {
      await db.batch([
        { sql: 'DELETE FROM user_friends WHERE user_id IN (?, ?) OR friend_id IN (?, ?)', args: [u1Id, u2Id, u1Id, u2Id] },
        { sql: 'DELETE FROM users WHERE id IN (?, ?)', args: [u1Id, u2Id] }
      ]);
    }
  }

  console.log('=== ALL ROOM LIFECYCLE TESTS PASSED ===');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
