import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { userDb } from '../server/db/users';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

async function jsonRequest(endpoint: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
} = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data };
}

interface WsClient {
  ws: WebSocket;
  messages: any[];
  waitFor: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
  send: (msg: any) => void;
  close: () => void;
}

function createWsClient(): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const messages: any[] = [];
    const listeners: Array<(msg: any) => void> = [];

    ws.on('open', () => {
      resolve({
        ws,
        messages,
        send: (msg: any) => ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)),
        close: () => {
          try { ws.close(); } catch {}
        },
        waitFor: (predicate: (msg: any) => boolean, timeoutMs = 5000) => {
          // Check already received messages
          const existing = messages.find(predicate);
          if (existing) return Promise.resolve(existing);

          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              const idx = listeners.indexOf(onMsg);
              if (idx !== -1) listeners.splice(idx, 1);
              rej(new Error(`Timeout waiting for message matching predicate after ${timeoutMs}ms. Received: ${JSON.stringify(messages)}`));
            }, timeoutMs);

            const onMsg = (m: any) => {
              if (predicate(m)) {
                clearTimeout(timer);
                const idx = listeners.indexOf(onMsg);
                if (idx !== -1) listeners.splice(idx, 1);
                res(m);
              }
            };
            listeners.push(onMsg);
          });
        }
      });
    });

    ws.on('message', (raw: any) => {
      try {
        const parsed = JSON.parse(raw.toString());
        messages.push(parsed);
        for (const l of [...listeners]) l(parsed);
      } catch {
        messages.push(raw.toString());
      }
    });

    ws.on('error', (err) => reject(err));
  });
}

async function runAll14Checks() {
  console.log('=== STARTING 14-POINT REGRESSION TEST SUITE FOR STAGE 5 ===\n');

  const createdUserIds: string[] = [];
  const openClients: WsClient[] = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test User 1
    // -------------------------------------------------------------------------
    const user1Email = `test_stage5_host_${Date.now()}@example.com`;
    const user1Password = 'StrongPass123!';
    const user1Name = 'Stage5Host';

    const regRes = await jsonRequest('/api/auth/register', {
      method: 'POST',
      body: { email: user1Email, password: user1Password, displayName: user1Name }
    });
    assert.equal(regRes.status, 200, `User registration failed: ${JSON.stringify(regRes.data)}`);
    const user1 = regRes.data.user;
    let user1TokenA = regRes.data.token;
    createdUserIds.push(user1.id);
    console.log(`[SETUP] Registered test user 1: ${user1.id} (${user1.email})`);

    // -------------------------------------------------------------------------
    // CHECK 1: Auth via login/password -> create room -> HTTP 200 success
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 1: Auth via login/password -> create room -> HTTP 200 ---');
    const loginRes = await jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: user1Email, password: user1Password }
    });
    assert.equal(loginRes.status, 200, 'Login must succeed');
    user1TokenA = loginRes.data.token;
    assert.ok(user1TokenA, 'Login must return session token');

    const createRes1 = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1TokenA}`,
        'X-Auth-Token': user1TokenA
      },
      body: {
        roomName: 'Check 1 Room',
        hostId: user1.id,
        hostName: user1.displayName,
        maxPlayers: 10,
        isPrivate: false,
        token: user1TokenA
      }
    });

    assert.equal(createRes1.status, 200, `Create room must return 200, got: ${createRes1.status} ${JSON.stringify(createRes1.data)}`);
    assert.ok(createRes1.data.roomCode, 'Response must include roomCode');
    const roomCode1 = createRes1.data.roomCode;
    console.log(`✅ CHECK 1 PASSED: Room ${roomCode1} created successfully by password-authenticated host.`);

    // -------------------------------------------------------------------------
    // CHECK 2: Auth via Google sync -> create room -> HTTP 200 success
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 2: Auth via Google sync -> create room -> HTTP 200 ---');
    const googleId = `g_stage5_${Date.now()}`;
    const googleEmail = `google_stage5_${Date.now()}@example.com`;
    const googleUser = await userDb.syncGoogleUser(
      googleId,
      googleEmail,
      'Google Player'
    );
    const googleToken = googleUser.sessionToken!;
    createdUserIds.push(googleUser.id);
    assert.ok(googleToken, 'Google sync must return token');
    console.log(`[SETUP] Synced Google test user: ${googleUser.id} (${googleUser.email})`);

    const createGoogleRes = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleToken}`,
        'X-Auth-Token': googleToken
      },
      body: {
        roomName: 'Google Host Room',
        hostId: googleUser.id,
        hostName: googleUser.displayName,
        maxPlayers: 10,
        isPrivate: false,
        token: googleToken
      }
    });
    assert.equal(createGoogleRes.status, 200, `Create room with Google auth must return 200: ${JSON.stringify(createGoogleRes.data)}`);
    const roomCodeGoogle = createGoogleRes.data.roomCode;
    console.log(`✅ CHECK 2 PASSED: Room ${roomCodeGoogle} created successfully by Google-authenticated host.`);

    // -------------------------------------------------------------------------
    // CHECK 3: WebSocket connection of the authorized room creator (JOIN_ROOM)
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 3: WebSocket connection of the authorized room creator ---');
    const clientHost1 = await createWsClient();
    openClients.push(clientHost1);

    clientHost1.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: roomCode1,
        playerId: user1.id,
        playerName: user1.displayName,
        token: user1TokenA
      }
    });

    const roomStateMsg1 = await clientHost1.waitFor(m => m.type === 'ROOM_STATE');
    assert.ok(roomStateMsg1, 'Must receive ROOM_STATE');
    assert.equal(roomStateMsg1.payload.roomCode, roomCode1, 'Room code in state must match');
    console.log(`✅ CHECK 3 PASSED: Host connected via WebSocket and received ROOM_STATE for room ${roomCode1}.`);

    // -------------------------------------------------------------------------
    // CHECK 4: Confirmation of host status (isHost === true, hostId === user.id)
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 4: Confirmation of host status ---');
    const statePayload = roomStateMsg1.payload;
    assert.equal(statePayload.hostId, user1.id, 'roomState.hostId must match user1.id');
    const hostPlayerInRoom = statePayload.players.find((p: any) => p.id === user1.id);
    assert.ok(hostPlayerInRoom, 'Host must be in room state players');
    assert.equal(hostPlayerInRoom.isHost, true, 'hostPlayerInRoom.isHost must be true');
    console.log('✅ CHECK 4 PASSED: Host status confirmed in room state (isHost === true, hostId === user.id).');

    // -------------------------------------------------------------------------
    // CHECK 5: Execution of an authorized host action (ADD_BOT / UPDATE_SETTINGS)
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 5: Execution of an authorized host action ---');
    clientHost1.send({
      type: 'ADD_BOT',
      payload: {}
    });

    const botStateMsg = await clientHost1.waitFor((m: any) =>
      m.type === 'ROOM_STATE' && m.payload.players.some((p: any) => p.isBot)
    );
    const botPlayer = botStateMsg.payload.players.find((p: any) => p.isBot);
    assert.ok(botPlayer, 'Bot player must be present in room.state.players');
    console.log(`✅ CHECK 5 PASSED: Host action ADD_BOT succeeded, bot ${botPlayer.name} added.`);

    // -------------------------------------------------------------------------
    // CHECK 6: Creation of room by legitimate guest without account ID -> HTTP 200
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 6: Creation of room by legitimate guest without account ID ---');
    const guestId = `guest_${Date.now()}`;
    const guestCreateRes = await jsonRequest('/api/rooms', {
      method: 'POST',
      body: {
        roomName: 'Guest Room',
        hostId: guestId,
        hostName: 'Guest Player',
        maxPlayers: 10,
        isPrivate: false
      }
    });
    assert.equal(guestCreateRes.status, 200, `Guest create room must succeed: ${JSON.stringify(guestCreateRes.data)}`);
    const guestRoomCode = guestCreateRes.data.roomCode;
    console.log(`✅ CHECK 6 PASSED: Legitimate guest created room ${guestRoomCode}.`);

    // -------------------------------------------------------------------------
    // CHECK 7: Rejection when guest attempts to create room using registered hostId without token -> HTTP 401
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 7: Rejection of guest using registered hostId without token ---');
    const spoofRes = await jsonRequest('/api/rooms', {
      method: 'POST',
      body: {
        roomName: 'Spoof Room',
        hostId: user1.id, // registered user ID!
        hostName: user1.displayName,
        maxPlayers: 10,
        isPrivate: false
        // No token
      }
    });
    assert.equal(spoofRes.status, 401, `Must return 401 Unauthorized, got: ${spoofRes.status}`);
    assert.ok(
      (spoofRes.data?.error || '').includes('аккаунт') || (spoofRes.data?.error || '').includes('авториз'),
      `Error message must mention account/authorization, got: ${JSON.stringify(spoofRes.data)}`
    );
    console.log('✅ CHECK 7 PASSED: Unauthenticated creation attempt with registered hostId rejected with HTTP 401.');

    // -------------------------------------------------------------------------
    // CHECK 8: Rejection when creating room with an invalid/forged token -> HTTP 401
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 8: Rejection with invalid/forged token ---');
    const forgedRes = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer forged_token_invalid_12345',
        'X-Auth-Token': 'forged_token_invalid_12345'
      },
      body: {
        roomName: 'Forged Token Room',
        hostId: user1.id,
        hostName: user1.displayName,
        maxPlayers: 10,
        isPrivate: false,
        token: 'forged_token_invalid_12345'
      }
    });
    assert.equal(forgedRes.status, 401, `Must return 401 for forged token, got: ${forgedRes.status}`);
    console.log('✅ CHECK 8 PASSED: Forged token rejected with HTTP 401.');

    // -------------------------------------------------------------------------
    // CHECK 9: Rejection when creating room with a stale rotated token after relogin -> HTTP 401
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 9: Stale rotated token rejected after relogin ---');
    // Login user 1 again -> rotates session token to user1TokenB
    const reloginRes = await jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: user1Email, password: user1Password }
    });
    assert.equal(reloginRes.status, 200);
    const user1TokenB = reloginRes.data.token;
    assert.notEqual(user1TokenA, user1TokenB, 'New login must generate fresh token');

    const staleRes = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1TokenA}`,
        'X-Auth-Token': user1TokenA
      },
      body: {
        roomName: 'Stale Room',
        hostId: user1.id,
        hostName: user1.displayName,
        maxPlayers: 10,
        isPrivate: false,
        token: user1TokenA
      }
    });
    assert.equal(staleRes.status, 401, `Stale token must be rejected with 401, got: ${staleRes.status}`);
    console.log('✅ CHECK 9 PASSED: Stale token from old session rejected with HTTP 401.');

    // -------------------------------------------------------------------------
    // CHECK 10: Second legitimate player joins the room cleanly
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 10: Second legitimate player joins room cleanly ---');
    const p2Id = `player2_${Date.now()}`;
    const clientPlayer2 = await createWsClient();
    openClients.push(clientPlayer2);

    clientPlayer2.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: roomCode1,
        playerId: p2Id,
        playerName: 'Player Two'
      }
    });

    const p2State = await clientPlayer2.waitFor((m: any) =>
      m.type === 'ROOM_STATE' && m.payload.players.some((p: any) => p.id === p2Id)
    );
    assert.ok(p2State, 'Player 2 must receive ROOM_STATE');
    const p2InRoom = p2State.payload.players.find((p: any) => p.id === p2Id);
    assert.ok(p2InRoom, 'Player 2 must be present in room.state.players');
    assert.equal(p2InRoom.isHost, false, 'Player 2 must not be host');
    console.log(`✅ CHECK 10 PASSED: Player 2 joined room ${roomCode1} cleanly.`);

    // -------------------------------------------------------------------------
    // CHECK 11: Seat hijacking protection from old device / unauthenticated socket
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 11: Seat hijacking protection from unauthenticated socket ---');
    const clientAttacker = await createWsClient();
    openClients.push(clientAttacker);

    clientAttacker.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: roomCode1,
        playerId: user1.id, // trying to steal host seat
        playerName: 'Attacker Fake Host',
        token: user1TokenA // stale token!
      }
    });

    const attackerMsg = await clientAttacker.waitFor((m: any) =>
      m.type === 'ERROR' || m.type === 'AUTH_REVOKED'
    );
    assert.ok(
      attackerMsg.type === 'ERROR' || attackerMsg.type === 'AUTH_REVOKED',
      `Attacker should receive ERROR or AUTH_REVOKED, got: ${JSON.stringify(attackerMsg)}`
    );
    clientAttacker.close();
    console.log(`✅ CHECK 11 PASSED: Seat hijacking attempt thwarted, received ${attackerMsg.type}.`);

    // -------------------------------------------------------------------------
    // CHECK 12: Legitimate host reconnect after connection drop
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 12: Legitimate host reconnect after connection drop ---');
    clientHost1.close();
    await new Promise(r => setTimeout(r, 200));

    // Host reconnects with active fresh token user1TokenB
    const clientHostReconnect = await createWsClient();
    openClients.push(clientHostReconnect);

    clientHostReconnect.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: roomCode1,
        playerId: user1.id,
        playerName: user1.displayName,
        token: user1TokenB
      }
    });

    const hostReconnectState = await clientHostReconnect.waitFor((m: any) =>
      m.type === 'ROOM_STATE' && m.payload.hostId === user1.id
    );
    assert.ok(hostReconnectState, 'Host must receive ROOM_STATE on reconnect');
    const reconnectedHost = hostReconnectState.payload.players.find((p: any) => p.id === user1.id);
    assert.ok(reconnectedHost, 'Host must exist in players');
    assert.equal(reconnectedHost.connected, true, 'Host must be marked connected: true');
    assert.equal(reconnectedHost.isHost, true, 'Host must retain isHost: true');
    console.log('✅ CHECK 12 PASSED: Legitimate host successfully reconnected with current session token.');

    // -------------------------------------------------------------------------
    // CHECK 13: Preservation of active match during session change
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 13: Preservation of active match during session change ---');
    // Add bots so room has >= 4 players
    clientHostReconnect.send({
      type: 'ADD_BOT',
      payload: {}
    });
    clientHostReconnect.send({
      type: 'ADD_BOT',
      payload: {}
    });
    clientHostReconnect.send({
      type: 'ADD_BOT',
      payload: {}
    });

    await clientHostReconnect.waitFor((m: any) =>
      m.type === 'ROOM_STATE' && m.payload.players.length >= 4
    );

    // Start game as host
    clientHostReconnect.send({
      type: 'START_GAME',
      payload: {}
    });

    const gameStartedState = await clientHostReconnect.waitFor((m: any) =>
      m.type === 'ROOM_STATE' && m.payload.phase !== 'LOBBY'
    );
    assert.ok(gameStartedState, 'Game must start and leave LOBBY phase');
    const phaseBefore = gameStartedState.payload.phase;

    // Simulate session change: user logs in again -> gets user1TokenC
    const reloginRes2 = await jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: user1Email, password: user1Password }
    });
    assert.equal(reloginRes2.status, 200);
    const user1TokenC = reloginRes2.data.token;

    // Disconnect host and reconnect with new session token user1TokenC
    clientHostReconnect.close();
    await new Promise(r => setTimeout(r, 200));

    const clientHostNewSession = await createWsClient();
    openClients.push(clientHostNewSession);

    clientHostNewSession.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: roomCode1,
        playerId: user1.id,
        playerName: user1.displayName,
        token: user1TokenC
      }
    });

    const reattachedState = await clientHostNewSession.waitFor((m: any) =>
      m.type === 'ROOM_STATE' && m.payload.roomCode === roomCode1
    );
    assert.ok(reattachedState, 'Host must receive ROOM_STATE on reattach');
    assert.notEqual(reattachedState.payload.phase, 'LOBBY', 'Game phase must be preserved, not reset to LOBBY');
    console.log(`✅ CHECK 13 PASSED: Active match preserved across session rotation and reconnect (phase: ${reattachedState.payload.phase}).`);

    // -------------------------------------------------------------------------
    // CHECK 14: Verification that no sensitive secrets leak in responses
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 14: Sensitive secrets leak verification ---');
    const profileRes = await jsonRequest('/api/user/profile', {
      headers: {
        'Authorization': `Bearer ${user1TokenC}`,
        'X-Auth-Token': user1TokenC
      }
    });
    assert.equal(profileRes.status, 200, 'Profile fetch must succeed');
    const profileJson = JSON.stringify(profileRes.data);
    assert.equal(profileJson.includes('passwordHash'), false, 'profile must not contain passwordHash');
    assert.equal(profileJson.includes('sessionToken'), false, 'profile must not contain sessionToken');
    assert.equal(profileJson.includes('password_hash'), false, 'profile must not contain password_hash');
    assert.equal(profileJson.includes('session_token'), false, 'profile must not contain session_token');

    // Experience endpoint
    const expRes = await jsonRequest('/api/user/experience', {
      headers: {
        'Authorization': `Bearer ${user1TokenC}`,
        'X-Auth-Token': user1TokenC
      }
    });
    assert.equal(expRes.status, 200, 'Experience fetch must succeed');
    const expJson = JSON.stringify(expRes.data);
    assert.equal(expJson.includes('passwordHash'), false, 'experience must not contain passwordHash');
    assert.equal(expJson.includes('sessionToken'), false, 'experience must not contain sessionToken');

    // Room response
    const roomJson = JSON.stringify(createRes1.data);
    assert.equal(roomJson.includes('passwordHash'), false, 'rooms response must not contain passwordHash');
    assert.equal(roomJson.includes('sessionToken'), false, 'rooms response must not contain sessionToken');

    console.log('✅ CHECK 14 PASSED: Zero secret leaks in profile, experience, or room responses.');

    console.log('\n=== ALL 14 CHECKS PASSED PERFECTLY! ===');

  } finally {
    // Cleanup sockets
    for (const cl of openClients) {
      cl.close();
    }
    // Cleanup users
    console.log('\n[CLEANUP] Deleting test accounts...');
    for (const uid of createdUserIds) {
      try {
        await userDb.adminDeleteUser(uid);
        console.log(`[CLEANUP] Deleted test user ${uid}`);
      } catch (e) {
        console.error(`Failed to delete user ${uid}:`, e);
      }
    }
  }
}

runAll14Checks().then(() => {
  console.log('\n✅ TEST RUN COMPLETED WITH EXIT CODE 0');
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
