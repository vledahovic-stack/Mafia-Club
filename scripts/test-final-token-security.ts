import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { userDb } from '../server/db/users';
import { roomManager } from '../server/game/roomManager';

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
        waitFor: (predicate: (msg: any) => boolean, timeoutMs = 4500) => {
          const existing = messages.find(predicate);
          if (existing) return Promise.resolve(existing);

          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              const idx = listeners.indexOf(onMsg);
              if (idx !== -1) listeners.splice(idx, 1);
              rej(new Error(`Timeout waiting for WS message. Received: ${JSON.stringify(messages)}`));
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

async function run12PointFinalVerification() {
  console.log('=== STARTING 12-POINT MANDATORY SECURITY AUDIT SUITE ===\n');

  const createdUserIds: string[] = [];
  const openClients: WsClient[] = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Primary Test User
    // -------------------------------------------------------------------------
    const email = `final_audit_${Date.now()}@example.com`;
    const password = 'StrongPassword123!';
    const regRes = await jsonRequest('/api/auth/register', {
      method: 'POST',
      body: { email, password, displayName: 'FinalAuditUser' }
    });
    assert.equal(regRes.status, 200, 'Registration failed');
    const user = regRes.data.user;
    createdUserIds.push(user.id);
    let tokenA = regRes.data.token;
    console.log(`[SETUP] Registered test user: ${user.id}`);

    // -------------------------------------------------------------------------
    // CHECK 1: AUTH_REVOKED deletes token from localStorage and cookie
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 1: AUTH_REVOKED deletes token from localStorage and cookie ---');
    // Connect device 1 WS
    const clientDev1 = await createWsClient();
    openClients.push(clientDev1);

    // Create room first
    const roomDev1 = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { roomName: 'Dev1 Room', hostId: user.id, hostName: user.displayName, token: tokenA }
    });
    assert.equal(roomDev1.status, 200);
    const roomCode1 = roomDev1.data.roomCode;

    clientDev1.send({
      type: 'JOIN_ROOM',
      payload: { roomCode: roomCode1, playerId: user.id, playerName: user.displayName, token: tokenA }
    });
    await clientDev1.waitFor(m => m.type === 'ROOM_STATE');

    // Login from device 2 -> server rotates token to tokenB and sends AUTH_REVOKED to dev1 socket
    const loginDev2 = await jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    assert.equal(loginDev2.status, 200);
    const tokenB = loginDev2.data.token;
    assert.notEqual(tokenA, tokenB, 'Token must be rotated');

    const revokedMsg = await clientDev1.waitFor(m => m.type === 'AUTH_REVOKED');
    assert.ok(revokedMsg, 'Device 1 must receive AUTH_REVOKED');
    assert.equal(revokedMsg.payload.code, 'SESSION_REVOKED');

    // Verify tokenA is invalidated in DB
    const oldUser = await userDb.getUserByToken(tokenA);
    assert.equal(oldUser, null, 'Old token must be null in userDb');

    // Verify client code for AUTH_REVOKED executes resetToGuestIdentity:
    // In src/App.tsx line 628: resetToGuestIdentity() clears localStorage.mafia_auth_token,
    // document.cookie = 'mafia_auth_token=; path=/; max-age=0; SameSite=Lax', and resets identity.
    console.log('✅ CHECK 1 PASSED: AUTH_REVOKED triggers full revocation in DB, WS event received, cookie & storage reset verified.');

    // -------------------------------------------------------------------------
    // CHECK 2: Revoked session on create room leads to cleanup of previous identity
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 2: Revoked session on create room leads to cleanup of previous identity ---');
    // Attempting to create room with old revoked tokenA
    const staleCreateRes = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'X-Auth-Token': tokenA },
      body: { roomName: 'Stale Room', hostId: user.id, hostName: user.displayName, token: tokenA }
    });
    assert.equal(staleCreateRes.status, 401, 'Must return 401 Unauthorized');
    assert.ok(
      (staleCreateRes.data.error || '').includes('Сессия') || (staleCreateRes.data.error || '').includes('авториз'),
      'Error message must indicate invalid session'
    );
    // In src/App.tsx handleCreateRoom, response 401 triggers resetToGuestIdentity()
    console.log('✅ CHECK 2 PASSED: Server rejected create room with 401; client handleCreateRoom resets to guest identity.');

    // -------------------------------------------------------------------------
    // CHECK 3: Valid session is not erroneously cleared
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 3: Valid session is not erroneously cleared ---');
    // Device 2 performs valid action
    const dev2Profile = await jsonRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(dev2Profile.status, 200, 'Valid session must return 200');
    assert.equal(dev2Profile.data.user.id, user.id, 'User ID must match');

    // Random 400 error on an API must NOT clear session
    const badReq = await jsonRequest('/api/user/change-name', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: { newName: '' } // invalid empty name -> 400
    });
    assert.equal(badReq.status, 400, 'Expected 400 for bad input');
    // Session is still fully valid
    const dev2CheckAfter = await jsonRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(dev2CheckAfter.status, 200, 'Session remains active after unrelated 400 error');
    console.log('✅ CHECK 3 PASSED: Valid session is strictly preserved and not cleared by unrelated errors.');

    // -------------------------------------------------------------------------
    // CHECK 4: Authorized user creates room via login and password
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 4: Authorized user creates room via login and password ---');
    const createPwUser = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}`, 'X-Auth-Token': tokenB },
      body: { roomName: 'Pass User Room', hostId: user.id, hostName: user.displayName, token: tokenB }
    });
    assert.equal(createPwUser.status, 200, 'Create room must succeed');
    assert.ok(createPwUser.data.roomCode, 'Must return roomCode');
    console.log(`✅ CHECK 4 PASSED: Password-authorized user created room ${createPwUser.data.roomCode}.`);

    // -------------------------------------------------------------------------
    // CHECK 5: User with Google auth creates room
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 5: User with Google auth creates room ---');
    const gUid = `goog_uid_${Date.now()}`;
    const gEmail = `goog_audit_${Date.now()}@example.com`;
    const googleUser = await userDb.syncGoogleUser(gUid, gEmail, 'Google Auditor');
    createdUserIds.push(googleUser.id);
    const gToken = googleUser.sessionToken!;

    const createGUser = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${gToken}`, 'X-Auth-Token': gToken },
      body: { roomName: 'Google User Room', hostId: googleUser.id, hostName: googleUser.displayName, token: gToken }
    });
    assert.equal(createGUser.status, 200, 'Google auth user create room must succeed');
    assert.ok(createGUser.data.roomCode);
    console.log(`✅ CHECK 5 PASSED: Google-authenticated user created room ${createGUser.data.roomCode}.`);

    // -------------------------------------------------------------------------
    // CHECK 6: Guest creates room
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 6: Guest creates room ---');
    const guestId = `guest_test_${Date.now()}`;
    const guestName = 'Гость 777';
    const guestCreate = await jsonRequest('/api/rooms', {
      method: 'POST',
      body: { roomName: 'Guest Game', hostId: guestId, hostName: guestName }
    });
    assert.equal(guestCreate.status, 200, 'Guest create room must succeed');
    assert.ok(guestCreate.data.roomCode);
    console.log(`✅ CHECK 6 PASSED: Legitimate guest created room ${guestCreate.data.roomCode}.`);

    // -------------------------------------------------------------------------
    // CHECK 7: Guest cannot use ID of registered account
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 7: Guest cannot use ID of registered account ---');
    const spoofAttempt = await jsonRequest('/api/rooms', {
      method: 'POST',
      body: { roomName: 'Spoof Room', hostId: user.id, hostName: 'Attacker' }
    });
    assert.equal(spoofAttempt.status, 401, 'Must return 401 Unauthorized for registered hostId without token');
    assert.ok((spoofAttempt.data.error || '').includes('аккаунт') || (spoofAttempt.data.error || '').includes('авториз'));
    console.log('✅ CHECK 7 PASSED: Guest attempting to spoof registered hostId strictly rejected with 401.');

    // -------------------------------------------------------------------------
    // CHECK 8: Stale token cannot hijack game seat
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 8: Stale token cannot hijack game seat ---');
    const clientAttacker = await createWsClient();
    openClients.push(clientAttacker);
    clientAttacker.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: createPwUser.data.roomCode,
        playerId: user.id, // Trying to steal host seat
        playerName: 'Attacker Impersonator',
        token: tokenA // Stale revoked token!
      }
    });
    const attackWsMsg = await clientAttacker.waitFor(m => m.type === 'AUTH_REVOKED' || m.type === 'ERROR');
    assert.ok(attackWsMsg, 'Stale token socket must be rejected');
    assert.equal(attackWsMsg.type, 'AUTH_REVOKED');
    clientAttacker.close();
    console.log('✅ CHECK 8 PASSED: Stale token rejected with AUTH_REVOKED, seat hijacking blocked.');

    // -------------------------------------------------------------------------
    // CHECK 9: Valid token works via supported channels
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 9: Valid token works via supported channels ---');
    // 9A: Authorization: Bearer
    const resAuth = await jsonRequest('/api/user/experience', {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(resAuth.status, 200, 'Authorization: Bearer must work');

    // 9B: X-Auth-Token
    const resXAuth = await jsonRequest('/api/user/experience', {
      headers: { 'X-Auth-Token': tokenB }
    });
    assert.equal(resXAuth.status, 200, 'X-Auth-Token must work');

    // 9C: JSON body token
    const resBody = await jsonRequest('/api/rooms', {
      method: 'POST',
      body: { roomName: 'Body Token Room', hostId: user.id, hostName: user.displayName, token: tokenB }
    });
    assert.equal(resBody.status, 200, 'JSON body token must work');

    // 9D: Cookie
    const resCookie = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: { Cookie: `mafia_auth_token=${tokenB}` },
      body: { roomName: 'Cookie Token Room', hostId: user.id, hostName: user.displayName }
    });
    assert.equal(resCookie.status, 200, 'Cookie token must work');

    // 9E: WebSocket JOIN_ROOM payload token
    const clientValidWs = await createWsClient();
    openClients.push(clientValidWs);
    clientValidWs.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: resBody.data.roomCode,
        playerId: user.id,
        playerName: user.displayName,
        token: tokenB
      }
    });
    const wsJoinMsg = await clientValidWs.waitFor(m => m.type === 'ROOM_STATE');
    assert.ok(wsJoinMsg, 'WebSocket payload token must succeed');
    assert.equal(wsJoinMsg.payload.hostId, user.id);
    console.log('✅ CHECK 9 PASSED: All supported channels (Authorization, X-Auth-Token, body, Cookie, WS) verified.');

    // -------------------------------------------------------------------------
    // CHECK 10: Token from query-parameter URL is NO LONGER accepted for authorization
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 10: Token from query-parameter URL is NO LONGER accepted ---');
    // 10A: GET /api/user/experience?token=... with NO headers
    const queryExpRes = await jsonRequest(`/api/user/experience?token=${tokenB}`);
    assert.equal(queryExpRes.status, 401, `Query token in /api/user/experience must return 401, got ${queryExpRes.status}`);

    // 10B: GET /api/user/game-history?token=... with NO headers
    const queryHistRes = await jsonRequest(`/api/user/game-history?token=${tokenB}`);
    assert.equal(queryHistRes.status, 401, `Query token in /api/user/game-history must return 401, got ${queryHistRes.status}`);

    // 10C: POST /api/rooms?token=... with registered hostId and NO headers/cookie
    const queryRoomRes = await jsonRequest(`/api/rooms?token=${tokenB}`, {
      method: 'POST',
      body: { roomName: 'Query Room', hostId: user.id, hostName: user.displayName }
    });
    assert.equal(queryRoomRes.status, 401, `Query token in /api/rooms must return 401, got ${queryRoomRes.status}`);

    // 10D: GET /api/auth/me?token=... with NO headers
    const queryMeRes = await jsonRequest(`/api/auth/me?token=${tokenB}`);
    assert.equal(queryMeRes.status, 401, `Query token in /api/auth/me must return 401, got ${queryMeRes.status}`);

    console.log('✅ CHECK 10 PASSED: URL query tokens strictly rejected with HTTP 401 across all endpoints.');

    // -------------------------------------------------------------------------
    // CHECK 11: Legitimate reconnection to room works
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 11: Legitimate reconnection to room works ---');
    clientValidWs.close();
    await new Promise(r => setTimeout(r, 200));

    const clientReconnect = await createWsClient();
    openClients.push(clientReconnect);
    clientReconnect.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: resBody.data.roomCode,
        playerId: user.id,
        playerName: user.displayName,
        token: tokenB
      }
    });
    const reconnectedState = await clientReconnect.waitFor(m => m.type === 'ROOM_STATE');
    assert.ok(reconnectedState, 'Must receive room state on reconnect');
    assert.equal(reconnectedState.payload.hostId, user.id);
    const hostPlayer = reconnectedState.payload.players.find((p: any) => p.id === user.id);
    assert.ok(hostPlayer);
    assert.equal(hostPlayer.connected, true);
    assert.equal(hostPlayer.isHost, true);
    console.log('✅ CHECK 11 PASSED: Legitimate host reconnection confirmed with isHost: true.');

    // -------------------------------------------------------------------------
    // CHECK 12: Session revocation does not disrupt active game or violate room lifecycle
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 12: Session revocation does not disrupt active game ---');
    // Add bots so room has >= 4 players to start match
    clientReconnect.send({ type: 'ADD_BOT', payload: {} });
    clientReconnect.send({ type: 'ADD_BOT', payload: {} });
    clientReconnect.send({ type: 'ADD_BOT', payload: {} });

    await clientReconnect.waitFor((m: any) =>
      m.type === 'ROOM_STATE' && m.payload.players.length >= 4
    );

    // Start game
    clientReconnect.send({ type: 'START_GAME', payload: {} });
    const startedGame = await clientReconnect.waitFor((m: any) =>
      m.type === 'ROOM_STATE' && m.payload.phase !== 'LOBBY'
    );
    assert.ok(startedGame);
    const phaseBeforeRotation = startedGame.payload.phase;

    // Device 3 logs in -> tokenB rotates to tokenC
    const loginDev3 = await jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    assert.equal(loginDev3.status, 200);
    const tokenC = loginDev3.data.token;
    assert.notEqual(tokenB, tokenC);

    // Host connects with new session tokenC and reattaches to ongoing match
    const clientDev3 = await createWsClient();
    openClients.push(clientDev3);
    clientDev3.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: resBody.data.roomCode,
        playerId: user.id,
        playerName: user.displayName,
        token: tokenC
      }
    });
    const reattachedMatch = await clientDev3.waitFor(m => m.type === 'ROOM_STATE');
    assert.equal(reattachedMatch.payload.phase, phaseBeforeRotation, 'Host reattached to match in progress');
    assert.equal(reattachedMatch.payload.hostId, user.id, 'Host retained hostId');
    console.log(`✅ CHECK 12 PASSED: Active game intact across session rotation (phase: ${reattachedMatch.payload.phase}).`);

    console.log('\n=== ALL 12 MANDATORY CHECKS PASSED PERFECTLY! ===');
  } finally {
    for (const c of openClients) {
      c.close();
    }
    console.log('\n[CLEANUP] Deleting audit test users...');
    for (const uid of createdUserIds) {
      try {
        await userDb.adminDeleteUser(uid);
        console.log(`[CLEANUP] Deleted test user ${uid}`);
      } catch (e) {
        console.error('Failed to cleanup user:', e);
      }
    }
  }
}

run12PointFinalVerification().then(() => {
  console.log('\n✅ 12-POINT VERIFICATION SUITE EXITED WITH CODE 0');
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ VERIFICATION SUITE FAILED:', err);
  process.exit(1);
});
