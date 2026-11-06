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
        waitFor: (predicate: (msg: any) => boolean, timeoutMs = 4000) => {
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

async function runSecurityAudit() {
  console.log('=== STARTING TARGETED TOKEN SECURITY AUDIT ===\n');

  const createdUserIds: string[] = [];
  const openClients: WsClient[] = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test User
    // -------------------------------------------------------------------------
    const email = `audit_sec_${Date.now()}@example.com`;
    const password = 'StrongPassword123!';
    const regRes = await jsonRequest('/api/auth/register', {
      method: 'POST',
      body: { email, password, displayName: 'SecAuditUser' }
    });
    assert.equal(regRes.status, 200, 'Registration failed');
    const user = regRes.data.user;
    createdUserIds.push(user.id);
    console.log(`[SETUP] Registered audit user: ${user.id}`);

    // Login from Device 1
    const login1 = await jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    assert.equal(login1.status, 200);
    const token1 = login1.data.token;
    assert.ok(token1, 'Token 1 must exist');
    console.log('[SETUP] Device 1 logged in.');

    // -------------------------------------------------------------------------
    // TEST 1: Channel Precedence & Conflict Tests in extractAuthToken
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Channel Precedence & Conflict Verification ---');

    // Case 1A: Authorization header valid + Cookie invalid -> Authorization must win
    const res1A = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token1}`,
        'Cookie': 'mafia_auth_token=invalid_stale_token_xyz'
      },
      body: { roomName: 'Test 1A Room', hostId: user.id }
    });
    assert.equal(res1A.status, 200, `Valid Authorization must override invalid Cookie: ${res1A.status}`);
    console.log('✅ TEST 1A: Valid Authorization header successfully overrides stale Cookie.');

    // Case 1B: Authorization header invalid + Cookie valid -> Authorization takes precedence, fails with 401
    const res1B = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer invalid_forged_token',
        'Cookie': `mafia_auth_token=${token1}`
      },
      body: { roomName: 'Test 1B Room', hostId: user.id }
    });
    assert.equal(res1B.status, 401, 'Invalid Authorization header must NOT silently fall back to Cookie');
    console.log('✅ TEST 1B: Invalid Authorization header is strictly rejected and cannot be bypassed via Cookie.');

    // Case 1C: X-Auth-Token works when Authorization header is absent (Cloud Run GFE resilience)
    const res1C = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: {
        'X-Auth-Token': token1
      },
      body: { roomName: 'Test 1C Room', hostId: user.id }
    });
    assert.equal(res1C.status, 200, 'X-Auth-Token must succeed when Authorization header absent');
    console.log('✅ TEST 1C: X-Auth-Token works cleanly as fallback channel.');

    // Case 1D: Body token works when headers absent
    const res1D = await jsonRequest('/api/rooms', {
      method: 'POST',
      body: { roomName: 'Test 1D Room', hostId: user.id, token: token1 }
    });
    assert.equal(res1D.status, 200, 'Body token works when headers absent');
    console.log('✅ TEST 1D: Body token functions correctly.');

    // -------------------------------------------------------------------------
    // TEST 2: Multi-Device Session Rotation & Revocation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Multi-Device Session Rotation & Revocation ---');

    // Connect Device 1 to WebSocket
    const clientDev1 = await createWsClient();
    openClients.push(clientDev1);
    clientDev1.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: res1A.data.roomCode,
        playerId: user.id,
        playerName: user.displayName,
        token: token1
      }
    });
    const dev1State = await clientDev1.waitFor(m => m.type === 'ROOM_STATE');
    assert.ok(dev1State, 'Device 1 must receive ROOM_STATE');
    console.log('Device 1 connected to room WebSocket.');

    // Device 2 logs in with same credentials
    const login2 = await jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    assert.equal(login2.status, 200);
    const token2 = login2.data.token;
    assert.notEqual(token1, token2, 'New session must issue new token');
    console.log('Device 2 logged in (session rotated).');

    // Verify Device 1's WebSocket received AUTH_REVOKED
    const revokedMsg = await clientDev1.waitFor(m => m.type === 'AUTH_REVOKED');
    assert.ok(revokedMsg, 'Device 1 must receive AUTH_REVOKED upon Device 2 login');
    assert.equal(revokedMsg.payload.code, 'SESSION_REVOKED');
    console.log('✅ TEST 2A: Device 1 WebSocket instantly received AUTH_REVOKED on second device login.');

    // Verify token1 is completely revoked in DB
    const checkDbUserOldToken = await userDb.getUserByToken(token1);
    assert.equal(checkDbUserOldToken, null, 'Revoked token1 must return null from getUserByToken');
    const checkDbUserNewToken = await userDb.getUserByToken(token2);
    assert.ok(checkDbUserNewToken, 'Current token2 must resolve to user');
    console.log('✅ TEST 2B: Database verified: old token is null, new token is active.');

    // -------------------------------------------------------------------------
    // TEST 3: Stale Device 1 Attempting Actions
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Stale Device 1 Restricted Actions ---');

    // 3A: Device 1 attempts /api/auth/me with old token -> must return 401
    const meRes = await jsonRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert.equal(meRes.status, 401, 'Old token must return 401 on /api/auth/me');
    console.log('✅ TEST 3A: Stale token on /api/auth/me returned 401.');

    // 3B: Device 1 attempts to create room with old token -> must return 401
    const createOldRes = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: { roomName: 'Stale Attempt Room', hostId: user.id, token: token1 }
    });
    assert.equal(createOldRes.status, 401, 'Old token on create room must return 401');
    console.log('✅ TEST 3B: Stale token on create room returned 401.');

    // 3C: Device 1 attempts to create room without token using registered hostId -> must return 401
    const spoofHostRes = await jsonRequest('/api/rooms', {
      method: 'POST',
      body: { roomName: 'Spoof Attempt Room', hostId: user.id, hostName: 'Impersonator' }
    });
    assert.equal(spoofHostRes.status, 401, 'Creating room with registered hostId without token must return 401');
    console.log('✅ TEST 3C: Creating room using registered hostId without token returned 401.');

    // 3D: Device 1 attempts to join room WebSocket using registered hostId with old token -> AUTH_REVOKED / closed
    const clientDev1Retry = await createWsClient();
    openClients.push(clientDev1Retry);
    clientDev1Retry.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: res1A.data.roomCode,
        playerId: user.id,
        playerName: 'Attacker Impersonator',
        token: token1
      }
    });
    const retryMsg = await clientDev1Retry.waitFor(m => m.type === 'AUTH_REVOKED' || m.type === 'ERROR');
    assert.ok(retryMsg, 'Must reject stale socket connection');
    console.log(`✅ TEST 3D: Device 1 re-join attempt rejected with ${retryMsg.type}.`);

    // 3E: Device 1 transitions to guest mode with guest ID -> succeeds
    const guestId = `guest_test_${Date.now()}`;
    const guestCreate = await jsonRequest('/api/rooms', {
      method: 'POST',
      body: { roomName: 'Guest Normal Room', hostId: guestId, hostName: 'Гость' }
    });
    assert.equal(guestCreate.status, 200, 'Legitimate guest must be able to create room');
    console.log('✅ TEST 3E: Device 1 transitioning to guest mode can create rooms cleanly.');

    // -------------------------------------------------------------------------
    // TEST 4: Device 2 Continues Without Restrictions
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Device 2 Active Authorization ---');
    const dev2Create = await jsonRequest('/api/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
      body: { roomName: 'Device 2 Room', hostId: user.id, token: token2 }
    });
    assert.equal(dev2Create.status, 200, 'Device 2 must create room');
    const dev2RoomCode = dev2Create.data.roomCode;

    const clientDev2 = await createWsClient();
    openClients.push(clientDev2);
    clientDev2.send({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: dev2RoomCode,
        playerId: user.id,
        playerName: user.displayName,
        token: token2
      }
    });
    const dev2State = await clientDev2.waitFor(m => m.type === 'ROOM_STATE');
    assert.equal(dev2State.payload.hostId, user.id, 'Device 2 must be host');
    console.log('✅ TEST 4: Device 2 operating with zero restrictions.');

    // -------------------------------------------------------------------------
    // TEST 5: Data Leakage Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Secret Data Leakage Verification ---');
    const profileRes = await jsonRequest('/api/user/profile', {
      headers: { Authorization: `Bearer ${token2}` }
    });
    const rawProfile = JSON.stringify(profileRes.data);
    assert.equal(rawProfile.includes('passwordHash'), false, 'Profile must not contain passwordHash');
    assert.equal(rawProfile.includes('sessionToken'), false, 'Profile must not contain sessionToken');

    const expRes = await jsonRequest('/api/user/experience', {
      headers: { Authorization: `Bearer ${token2}` }
    });
    const rawExp = JSON.stringify(expRes.data);
    assert.equal(rawExp.includes('passwordHash'), false, 'Experience must not contain passwordHash');
    assert.equal(rawExp.includes('sessionToken'), false, 'Experience must not contain sessionToken');

    const wsStateRaw = JSON.stringify(dev2State);
    assert.equal(wsStateRaw.includes('passwordHash'), false, 'WS state must not contain passwordHash');
    assert.equal(wsStateRaw.includes('sessionToken'), false, 'WS state must not contain sessionToken');
    console.log('✅ TEST 5: Verified zero secrets leaked in HTTP responses or WebSocket broadcasts.');

    console.log('\n=== ALL TARGETED SECURITY AUDIT CHECKS PASSED ===');
  } finally {
    for (const c of openClients) {
      c.close();
    }
    console.log('\n[CLEANUP] Deleting audit test accounts...');
    for (const uid of createdUserIds) {
      try {
        await userDb.adminDeleteUser(uid);
        console.log(`[CLEANUP] Deleted audit user ${uid}`);
      } catch (e) {
        console.error('Failed to cleanup user:', e);
      }
    }
  }
}

runSecurityAudit().then(() => {
  console.log('\n✅ SECURITY AUDIT SCRIPT EXITED WITH CODE 0');
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ SECURITY AUDIT SCRIPT FAILED:', err);
  process.exit(1);
});
