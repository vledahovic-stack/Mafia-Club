import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import WebSocket from 'ws';

function cleanupSqliteFiles(dbFilePath: string) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const p = dbFilePath + suffix;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {}
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

async function waitForServerReady(baseUrl: string, timeoutMs = 25000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/rooms/public`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Isolated test server did not become ready within ${timeoutMs}ms`);
}

async function jsonFetch(
  url: string,
  options: RequestInit = {}
): Promise<{ status: number; data: any; raw: string }> {
  const res = await fetch(url, options);
  const raw = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return { status: res.status, data, raw };
}

function assertNoSensitiveKeys(obj: unknown, pathPrefix = 'root') {
  if (!obj || typeof obj !== 'object') return;
  const forbiddenKeys = new Set([
    'password',
    'passwordHash',
    'password_hash',
    'operationToken',
    'operation_token',
    'sessionToken',
    'session_token',
    'googleIdToken',
    'adminPassword',
  ]);
  if (Array.isArray(obj)) {
    obj.forEach((v, idx) => assertNoSensitiveKeys(v, `${pathPrefix}[${idx}]`));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    assert.ok(!forbiddenKeys.has(k), `Sensitive key "${k}" exposed at ${pathPrefix}.${k}`);
    assertNoSensitiveKeys(v, `${pathPrefix}.${k}`);
  }
}

async function startActiveRoomViaWs(
  wsBaseUrl: string,
  baseUrl: string,
  hostToken: string,
  hostId: string,
  hostName: string,
  guestPlayer: { token: string; id: string; name: string }
): Promise<{
  roomCode: string;
  hostWs: WebSocket;
  playerWs: WebSocket;
  getPhase: () => string;
  closeAll: () => void;
}> {
  const roomCreate = await jsonFetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${hostToken}`,
    },
    body: JSON.stringify({ roomName: 'Stage2 Active Match Test' }),
  });
  assert.equal(roomCreate.status, 200, `Room create failed: ${roomCreate.raw}`);
  const roomCode = roomCreate.data.roomCode;
  assert.ok(roomCode);

  let latestPhase = 'LOBBY';

  const connectWs = (id: string, name: string, token: string): Promise<WebSocket> =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(wsBaseUrl);
      const timer = setTimeout(() => reject(new Error(`WS join timeout for ${id}`)), 8000);
      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'JOIN_ROOM',
            payload: { roomCode, playerId: id, playerName: name, token },
          })
        );
      });
      ws.on('message', (buf) => {
        try {
          const msg = JSON.parse(buf.toString());
          if (msg.type === 'ROOM_STATE') {
            if (msg.payload?.phase) latestPhase = msg.payload.phase;
            clearTimeout(timer);
            resolve(ws);
          } else if (msg.type === 'ERROR') {
            clearTimeout(timer);
            reject(new Error(`WS ERROR: ${msg.payload?.message || JSON.stringify(msg)}`));
          }
        } catch {}
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

  const hostWs = await connectWs(hostId, hostName, hostToken);
  const playerWs = await connectWs(guestPlayer.id, guestPlayer.name, guestPlayer.token);

  hostWs.on('message', (buf) => {
    try {
      const msg = JSON.parse(buf.toString());
      if (msg.type === 'ROOM_STATE' && msg.payload?.phase) {
        latestPhase = msg.payload.phase;
      }
    } catch {}
  });

  // Add 3 bots so total >= 5 (min 4 required) and start the game
  for (let i = 0; i < 3; i++) {
    hostWs.send(JSON.stringify({ type: 'ADD_BOT', payload: {} }));
  }
  await new Promise((r) => setTimeout(r, 250));
  hostWs.send(JSON.stringify({ type: 'START_GAME', payload: {} }));

  const waitStart = Date.now();
  while (latestPhase === 'LOBBY' && Date.now() - waitStart < 5000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.notEqual(latestPhase, 'LOBBY', 'Match must transition out of LOBBY into active gameplay');

  return {
    roomCode,
    hostWs,
    playerWs,
    getPhase: () => latestPhase,
    closeAll: () => {
      try {
        hostWs.close();
      } catch {}
      try {
        playerWs.close();
      } catch {}
    },
  };
}

async function runTests() {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const httpDbPath = path.join(os.tmpdir(), `mafia_del_stage2_${stamp}.sqlite`);
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBaseUrl = `ws://127.0.0.1:${port}/ws`;
  const localTsx = path.resolve(process.cwd(), 'node_modules/.bin/tsx');

  let serverChild: ReturnType<typeof spawn> | null = null;
  let roomCleanup: (() => void) | null = null;

  try {
    serverChild = spawn(localTsx, ['server.ts'], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'production',
        LIBSQL_URL: `file:${httpDbPath}`,
        TURSO_DATABASE_URL: '',
        TURSO_AUTH_TOKEN: '',
        LIBSQL_AUTH_TOKEN: '',
      },
      stdio: 'ignore',
    });

    await waitForServerReady(baseUrl);
    const db = createClient({ url: `file:${httpDbPath}` });

    // Seed accounts via real auth endpoints (clear localhost register throttle in isolated test DB)
    const registerUser = async (email: string, password: string, displayName: string) => {
      await db.execute({ sql: "DELETE FROM ip_rate_limits WHERE action = 'register'" });
      const r = await jsonFetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      assert.equal(r.status, 200, `Register failed for ${email}: ${r.raw}`);
      return { id: r.data.user.id as string, token: r.data.token as string, email, password, displayName };
    };

    const userA = await registerUser(`user_a_${stamp}@test.local`, 'PassUserA!123', 'PlayerAlpha');
    const userB = await registerUser(`user_b_${stamp}@test.local`, 'PassUserB!123', 'PlayerBeta');
    const userZero = await registerUser(`user_zero_${stamp}@test.local`, 'PassZero!123', 'PlayerZero');
    const userMatch = await registerUser(`user_match_${stamp}@test.local`, 'PassMatch!123', 'PlayerInMatch');
    const userConc = await registerUser(`user_conc_${stamp}@test.local`, 'PassConc!123', 'PlayerConc');
    const userProc = await registerUser(`user_proc_${stamp}@test.local`, 'PassProc!123', 'PlayerProc');
    const adminSec1 = await registerUser(`admin_sec1_${stamp}@test.local`, 'SecAdmin1!999', 'AdminSecOne');
    const adminSec2 = await registerUser(`admin_sec2_${stamp}@test.local`, 'SecAdmin2!999', 'AdminSecTwo');

    // Login Main Admin
    const mainAdminEmail = (process.env.ADMIN_EMAIL || 'vledahovic@gmail.com').trim().toLowerCase();
    const mainAdminPassword = (process.env.ADMIN_PASSWORD || '123456').trim();
    const mainLogin = await jsonFetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mainAdminEmail, password: mainAdminPassword }),
    });
    assert.equal(mainLogin.status, 200, `Main admin login failed: ${mainLogin.raw}`);
    const mainAdmin = {
      id: mainLogin.data.user.id as string,
      token: mainLogin.data.token as string,
      email: mainAdminEmail,
      password: mainAdminPassword,
    };

    // Promote adminSec1 and adminSec2 to role 'admin' (without can_delete_accounts)
    for (const sec of [adminSec1, adminSec2]) {
      const promo = await jsonFetch(`${baseUrl}/api/admin/users/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mainAdmin.token}`,
        },
        body: JSON.stringify({ userId: sec.id, role: 'admin' }),
      });
      assert.equal(promo.status, 200, `Failed to promote ${sec.id}: ${promo.raw}`);
      assert.equal(promo.data.user.canDeleteAccounts, false);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Unauthenticated requests rejected (401)
    // -------------------------------------------------------------------------
    const unauthRoutes: Array<[string, string, any?]> = [
      ['GET', '/api/account/deletion-status'],
      ['POST', '/api/account/deletion-request', { gracePeriodDays: 3, password: 'x' }],
      ['POST', '/api/account/deletion-cancel', {}],
      ['POST', '/api/admin/users/deletion-permission', { userId: adminSec1.id, canDeleteAccounts: true }],
      ['GET', `/api/admin/users/${userA.id}/deletion-status`],
      ['POST', `/api/admin/users/${userA.id}/deletion-request`, { gracePeriodDays: 3, password: 'x' }],
      ['POST', `/api/admin/users/${userA.id}/deletion-cancel`, {}],
    ];
    for (const [method, endpoint, body] of unauthRoutes) {
      const r = await jsonFetch(`${baseUrl}${endpoint}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(r.status, 401, `Unauth ${method} ${endpoint} must return 401, got ${r.status}`);
    }
    console.log('✓ 3. Unauthenticated requests rejected (401) across all Stage 2 routes.');

    // -------------------------------------------------------------------------
    // TEST 1 & 11: Self-deletion request (0 days + >0 days) & self-cancel
    // -------------------------------------------------------------------------
    const statusBefore = await jsonFetch(`${baseUrl}/api/account/deletion-status`, {
      headers: { Authorization: `Bearer ${userZero.token}` },
    });
    assert.equal(statusBefore.status, 200);
    assert.equal(statusBefore.data.hasActiveRequest, false);
    assert.equal(statusBefore.data.physicalDeletionEnabled, false);
    assertNoSensitiveKeys(statusBefore.data);

    // Invalid grace period rejected
    const badDaysRes = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userZero.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: -3, password: userZero.password }),
    });
    assert.equal(badDaysRes.status, 400);

    // Valid immediate deletion (0 days)
    const selfZeroRes = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userZero.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 0, password: userZero.password }),
    });
    assert.equal(selfZeroRes.status, 201, `Self 0-day delete failed: ${selfZeroRes.raw}`);
    assert.equal(selfZeroRes.data.deletion.hasActiveRequest, true);
    assert.equal(selfZeroRes.data.deletion.status, 'scheduled');
    assert.equal(selfZeroRes.data.deletion.gracePeriodDays, 0);
    assert.equal(selfZeroRes.data.deletion.isImmediate, true);
    assert.equal(selfZeroRes.data.deletion.physicalDeletionEnabled, false);
    assertNoSensitiveKeys(selfZeroRes.data);

    // Cancel by owner
    const cancelSelfRes = await jsonFetch(`${baseUrl}/api/account/deletion-cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userZero.token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(cancelSelfRes.status, 200, `Self cancel failed: ${cancelSelfRes.raw}`);
    assert.equal(cancelSelfRes.data.deletion.hasActiveRequest, false);
    assert.equal(cancelSelfRes.data.deletion.status, 'cancelled');

    // Valid >0 day deletion request for userA (7 days)
    const self7Res = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 7, password: userA.password }),
    });
    assert.equal(self7Res.status, 201, `Self 7-day delete failed: ${self7Res.raw}`);
    assert.equal(self7Res.data.deletion.status, 'scheduled');
    assert.equal(self7Res.data.deletion.gracePeriodDays, 7);
    assert.equal(self7Res.data.deletion.isImmediate, false);
    assert.ok(self7Res.data.deletion.scheduledPurgeAt);
    console.log('✓ 1 & 11. Self-deletion requests (0 days and 7 days) and owner cancellation passed.');

    // -------------------------------------------------------------------------
    // TEST 2: Reject managing another user's account via self endpoints
    // -------------------------------------------------------------------------
    const foreignStatus = await jsonFetch(`${baseUrl}/api/account/deletion-status?userId=${userA.id}`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    assert.equal(foreignStatus.status, 403);

    const foreignReq = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ userId: userA.id, gracePeriodDays: 3, password: userB.password }),
    });
    assert.equal(foreignReq.status, 403);

    const foreignCancel = await jsonFetch(`${baseUrl}/api/account/deletion-cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ targetUserId: userA.id }),
    });
    assert.equal(foreignCancel.status, 403);
    console.log('✓ 2. Foreign user management attempts strictly blocked (403).');

    // -------------------------------------------------------------------------
    // TEST 6: Reject duplicate active deletion request (409)
    // -------------------------------------------------------------------------
    const dupRes = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 2, password: userA.password }),
    });
    assert.equal(dupRes.status, 409);
    assert.equal(dupRes.data.code, 'ACTIVE_DELETION_REQUEST_EXISTS');
    console.log('✓ 6. Duplicate active deletion request rejected (409).');

    // -------------------------------------------------------------------------
    // TEST 4: Wrong password, reauth failure rate-limit, and no default admin password bypass
    // -------------------------------------------------------------------------
    // 4a. Wrong password fails (401) and after 5 failures triggers 429
    for (let attempt = 1; attempt <= 5; attempt++) {
      const badPw = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userB.token}`,
        },
        body: JSON.stringify({ gracePeriodDays: 5, password: `WrongPass_${attempt}` }),
      });
      assert.equal(badPw.status, 401, `Attempt ${attempt} must return 401`);
    }
    const lockedRes = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 5, password: userB.password }),
    });
    assert.equal(lockedRes.status, 429, `6th attempt after 5 failures must return 429, got ${lockedRes.status}`);
    assert.equal(lockedRes.data.code, 'REAUTH_TOO_MANY_FAILURES');

    // 4b. Grant permission to adminSec2, then test that adminSec2 CANNOT confirm with DEFAULT_ADMIN_PASSWORD
    const grantSec2 = await jsonFetch(`${baseUrl}/api/admin/users/deletion-permission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mainAdmin.token}`,
      },
      body: JSON.stringify({ userId: adminSec2.id, canDeleteAccounts: true }),
    });
    assert.equal(grantSec2.status, 200);

    const bypassAttempt = await jsonFetch(`${baseUrl}/api/admin/users/${userZero.id}/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSec2.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 5, password: mainAdminPassword }),
    });
    assert.equal(bypassAttempt.status, 401, 'DEFAULT_ADMIN_PASSWORD must NOT bypass actor own password hash');
    assert.equal(bypassAttempt.data.code, 'INVALID_REAUTH_PASSWORD');
    console.log('✓ 4. Wrong password (401), rate-limit lockout (429), and zero default-password bypass passed.');

    // -------------------------------------------------------------------------
    // TEST 5: Local passwordless Google-only account cannot use empty/fake password or invalid Google ID token
    // -------------------------------------------------------------------------
    const googleOnlyId = `goog_only_${stamp}`;
    const googleOnlyToken = `tk_goog_test_${stamp}`;
    const nowIso = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO users (
              id, email, display_name, avatar_seed, password_hash, session_token,
              credits, xp, level, role, is_admin, can_delete_accounts, is_banned,
              is_email_verified, stats, inventory, created_at, updated_at
            ) VALUES (?, ?, ?, ?, NULL, ?, 0, 0, 1, 'user', 0, 0, 0, 1, '{}', '[]', ?, ?)`,
      args: [
        googleOnlyId,
        `goog_${stamp}@test.local`,
        'GoogleOnlyTester',
        'GoogleOnlyTester',
        googleOnlyToken,
        nowIso,
        nowIso,
      ],
    });

    // Missing credentials -> 400 REAUTH_REQUIRED
    const googNoCreds = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${googleOnlyToken}`,
      },
      body: JSON.stringify({ gracePeriodDays: 3 }),
    });
    assert.equal(googNoCreds.status, 400);
    assert.equal(googNoCreds.data.code, 'REAUTH_REQUIRED');

    // Sending password for passwordless Google account -> 400 NO_LOCAL_PASSWORD
    const googPwTry = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${googleOnlyToken}`,
      },
      body: JSON.stringify({ gracePeriodDays: 3, password: 'some_password' }),
    });
    assert.equal(googPwTry.status, 400);
    assert.equal(googPwTry.data.code, 'NO_LOCAL_PASSWORD');

    // Arbitrary/stale/forged googleIdToken rejected (401 GOOGLE_REAUTH_INVALID)
    const googFakeTok = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${googleOnlyToken}`,
      },
      body: JSON.stringify({ gracePeriodDays: 3, googleIdToken: 'header.payload.sig_invalid' }),
    });
    assert.equal(googFakeTok.status, 401);
    assert.equal(googFakeTok.data.code, 'GOOGLE_REAUTH_INVALID');
    console.log('✓ 5. Re-authentication guards for password & Google-only accounts passed.');

    // -------------------------------------------------------------------------
    // TEST 7 & 8 & 12: Active match behavior (self blocked 409, admin -> pending_game_end, admin cancel)
    // -------------------------------------------------------------------------
    const activeRoom = await startActiveRoomViaWs(
      wsBaseUrl,
      baseUrl,
      userConc.token,
      userConc.id,
      userConc.displayName,
      { token: userMatch.token, id: userMatch.id, name: userMatch.displayName }
    );
    roomCleanup = activeRoom.closeAll;

    // 7. Self deletion request blocked during active match
    const selfInMatch = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userMatch.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 3, password: userMatch.password }),
    });
    assert.equal(selfInMatch.status, 409, `Self delete in active match must return 409, got ${selfInMatch.status}`);
    assert.equal(selfInMatch.data.code, 'SELF_DELETE_FORBIDDEN_IN_ACTIVE_MATCH');

    // 8. Admin deletion request during active match succeeds with pending_game_end without stopping match
    const adminInMatch = await jsonFetch(`${baseUrl}/api/admin/users/${userMatch.id}/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSec2.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 5, password: adminSec2.password }),
    });
    assert.equal(adminInMatch.status, 201, `Admin delete during match failed: ${adminInMatch.raw}`);
    assert.equal(adminInMatch.data.deletion.status, 'pending_game_end');
    assert.equal(adminInMatch.data.deletion.isPendingGameEnd, true);
    assert.equal(adminInMatch.data.deletion.graceStartedAt, null);
    assert.equal(adminInMatch.data.deletion.scheduledPurgeAt, null);
    assert.notEqual(activeRoom.getPhase(), 'LOBBY', 'Active match must NOT be interrupted');

    // 12. Cancel pending_game_end request by authorized admin
    const adminCancelRes = await jsonFetch(`${baseUrl}/api/admin/users/${userMatch.id}/deletion-cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSec2.token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(adminCancelRes.status, 200, `Admin cancel failed: ${adminCancelRes.raw}`);
    assert.equal(adminCancelRes.data.deletion.status, 'cancelled');

    activeRoom.hostWs.send(JSON.stringify({ type: 'STOP_GAME', payload: {} }));
    await new Promise((r) => setTimeout(r, 250));
    activeRoom.hostWs.send(JSON.stringify({ type: 'LEAVE_ROOM', payload: {} }));
    activeRoom.playerWs.send(JSON.stringify({ type: 'LEAVE_ROOM', payload: {} }));
    await new Promise((r) => setTimeout(r, 150));
    activeRoom.closeAll();
    roomCleanup = null;
    console.log('✓ 7, 8 & 12. Active match guards (self 409, admin pending_game_end) & admin cancellation passed.');

    // -------------------------------------------------------------------------
    // TEST 9 & 10: Separate permission model, admin targets, and Main Admin protection
    // -------------------------------------------------------------------------
    // 9a. adminSec1 does NOT have canDeleteAccounts -> blocked (403)
    const sec1NoPermStatus = await jsonFetch(`${baseUrl}/api/admin/users/${userA.id}/deletion-status`, {
      headers: { Authorization: `Bearer ${adminSec1.token}` },
    });
    assert.equal(sec1NoPermStatus.status, 403);
    assert.equal(sec1NoPermStatus.data.code, 'DELETION_PERMISSION_REQUIRED');

    const sec1NoPermReq = await jsonFetch(`${baseUrl}/api/admin/users/${userZero.id}/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSec1.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 5, password: adminSec1.password }),
    });
    assert.equal(sec1NoPermReq.status, 403);

    // 9b. Regular user & non-Main Admin CANNOT call deletion-permission endpoint
    const sec2GrantAttempt = await jsonFetch(`${baseUrl}/api/admin/users/deletion-permission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSec2.token}`,
      },
      body: JSON.stringify({ userId: adminSec1.id, canDeleteAccounts: true }),
    });
    assert.equal(sec2GrantAttempt.status, 403);

    const userGrantAttempt = await jsonFetch(`${baseUrl}/api/admin/users/deletion-permission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userZero.token}`,
      },
      body: JSON.stringify({ userId: adminSec1.id, canDeleteAccounts: true }),
    });
    assert.equal(userGrantAttempt.status, 403);

    // 9c. Even WITH canDeleteAccounts, adminSec2 CANNOT delete another admin (adminSec1)
    const deleteOtherAdmin = await jsonFetch(`${baseUrl}/api/admin/users/${adminSec1.id}/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSec2.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 5, password: adminSec2.password }),
    });
    assert.equal(deleteOtherAdmin.status, 403);
    assert.equal(deleteOtherAdmin.data.code, 'ONLY_MAIN_ADMIN_CAN_DELETE_ADMIN');

    // 9d. Self-deletion via admin endpoint rejected
    const adminSelfViaAdminApi = await jsonFetch(`${baseUrl}/api/admin/users/${adminSec2.id}/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSec2.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 5, password: adminSec2.password }),
    });
    assert.equal(adminSelfViaAdminApi.status, 400);
    assert.equal(adminSelfViaAdminApi.data.code, 'USE_SELF_DELETION_FLOW');

    // 9e. Main Admin CAN request deletion of secondary admin (adminSec1)
    const mainDeletesSecAdmin = await jsonFetch(`${baseUrl}/api/admin/users/${adminSec1.id}/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mainAdmin.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 4, password: mainAdmin.password }),
    });
    assert.equal(mainDeletesSecAdmin.status, 201, `Main admin delete sec admin failed: ${mainDeletesSecAdmin.raw}`);

    // Clean up adminSec1 request so we can test demotion clearing canDeleteAccounts
    const mainCancelsSecAdmin = await jsonFetch(`${baseUrl}/api/admin/users/${adminSec1.id}/deletion-cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mainAdmin.token}` },
    });
    assert.equal(mainCancelsSecAdmin.status, 200);

    // 9f. Revoking permission & demoting admin clears canDeleteAccounts
    const revokeSec2 = await jsonFetch(`${baseUrl}/api/admin/users/deletion-permission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mainAdmin.token}`,
      },
      body: JSON.stringify({ userId: adminSec2.id, canDeleteAccounts: false }),
    });
    assert.equal(revokeSec2.status, 200);
    assert.equal(revokeSec2.data.user.canDeleteAccounts, false);

    const sec2AfterRevoke = await jsonFetch(`${baseUrl}/api/admin/users/${userZero.id}/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSec2.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 5, password: adminSec2.password }),
    });
    assert.equal(sec2AfterRevoke.status, 403);

    // Grant to adminSec1, then demote to user -> verify canDeleteAccounts automatically cleared
    await jsonFetch(`${baseUrl}/api/admin/users/deletion-permission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mainAdmin.token}`,
      },
      body: JSON.stringify({ userId: adminSec1.id, canDeleteAccounts: true }),
    });
    const demoteSec1 = await jsonFetch(`${baseUrl}/api/admin/users/role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mainAdmin.token}`,
      },
      body: JSON.stringify({ userId: adminSec1.id, role: 'user' }),
    });
    assert.equal(demoteSec1.status, 200);
    assert.equal(demoteSec1.data.user.canDeleteAccounts, false);

    // 10. Main Admin protected from both self-deletion and admin deletion
    const mainSelfDelete = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mainAdmin.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 3, password: mainAdmin.password }),
    });
    assert.equal(mainSelfDelete.status, 403);
    assert.equal(mainSelfDelete.data.code, 'MAIN_ADMIN_SELF_DELETE_FORBIDDEN');

    await jsonFetch(`${baseUrl}/api/admin/users/deletion-permission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mainAdmin.token}`,
      },
      body: JSON.stringify({ userId: adminSec2.id, canDeleteAccounts: true }),
    });
    const secDeletesMain = await jsonFetch(`${baseUrl}/api/admin/users/${mainAdmin.id}/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSec2.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 3, password: adminSec2.password }),
    });
    assert.equal(secDeletesMain.status, 403);
    assert.equal(secDeletesMain.data.code, 'CANNOT_DELETE_MAIN_ADMIN');
    console.log('✓ 9 & 10. Granular permission model, admin target rules, and Main Admin protection passed.');

    // -------------------------------------------------------------------------
    // TEST 13: Forbid cancelling processing & completed requests (self + admin)
    // -------------------------------------------------------------------------
    const procReq = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userProc.token}`,
      },
      body: JSON.stringify({ gracePeriodDays: 0, password: userProc.password }),
    });
    assert.equal(procReq.status, 201);

    await db.execute({
      sql: `UPDATE account_deletion_requests
            SET status = 'processing', processing_started_at = ?, version = version + 1, updated_at = ?
            WHERE user_id = ? AND status = 'scheduled'`,
      args: [new Date().toISOString(), new Date().toISOString(), userProc.id],
    });

    const cancelProcSelf = await jsonFetch(`${baseUrl}/api/account/deletion-cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userProc.token}` },
    });
    assert.equal(cancelProcSelf.status, 409);
    assert.equal(cancelProcSelf.data.code, 'CANNOT_CANCEL_PROCESSING_DELETION');

    const cancelProcAdmin = await jsonFetch(`${baseUrl}/api/admin/users/${userProc.id}/deletion-cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mainAdmin.token}` },
    });
    assert.equal(cancelProcAdmin.status, 409);
    assert.equal(cancelProcAdmin.data.code, 'CANNOT_CANCEL_PROCESSING_DELETION');

    await db.execute({
      sql: `UPDATE account_deletion_requests
            SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
            WHERE user_id = ? AND status = 'processing'`,
      args: [new Date().toISOString(), new Date().toISOString(), userProc.id],
    });
    const cancelCompletedAdmin = await jsonFetch(`${baseUrl}/api/admin/users/${userProc.id}/deletion-cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mainAdmin.token}` },
    });
    assert.equal(cancelCompletedAdmin.status, 409);
    assert.equal(cancelCompletedAdmin.data.code, 'CANNOT_CANCEL_COMPLETED_DELETION');
    console.log('✓ 13. Cancelling processing and completed requests forbidden (409).');

    // -------------------------------------------------------------------------
    // TEST 14: Concurrent request protection (parallel create & parallel cancel)
    // -------------------------------------------------------------------------
    await db.execute({ sql: "DELETE FROM ip_rate_limits WHERE action = 'account_deletion_reauth_req'" });
    const parallelCreates = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        jsonFetch(`${baseUrl}/api/account/deletion-request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userConc.token}`,
          },
          body: JSON.stringify({ gracePeriodDays: i + 1, password: userConc.password }),
        })
      )
    );
    const created201 = parallelCreates.filter((r) => r.status === 201);
    const conflict409 = parallelCreates.filter((r) => r.status === 409);
    assert.equal(created201.length, 1, `Expected exactly 1 201 from concurrent creates, got ${created201.length}`);
    assert.equal(conflict409.length, 4, `Expected 4 409 conflicts, got ${conflict409.length}`);
    assert.ok(
      conflict409.every((r) => r.data?.code === 'ACTIVE_DELETION_REQUEST_EXISTS'),
      'Concurrent create conflicts must return ACTIVE_DELETION_REQUEST_EXISTS'
    );

    const parallelCancels = await Promise.all([
      jsonFetch(`${baseUrl}/api/account/deletion-cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userConc.token}` },
      }),
      jsonFetch(`${baseUrl}/api/admin/users/${userConc.id}/deletion-cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${mainAdmin.token}` },
      }),
    ]);
    const cancel200 = parallelCancels.filter((r) => r.status === 200);
    const cancelFail = parallelCancels.filter((r) => r.status === 404 || r.status === 409);
    assert.equal(cancel200.length, 1, 'Exactly 1 concurrent cancel must succeed');
    assert.equal(cancelFail.length, 1, 'Second concurrent cancel must fail safely');
    console.log('✓ 14. Concurrent create and cancel protection passed.');

    // -------------------------------------------------------------------------
    // TEST 15: Legacy /api/admin/users/delete still 503, NO physical deletion, audit logs clean
    // -------------------------------------------------------------------------
    const legacyDeleteRes = await jsonFetch(`${baseUrl}/api/admin/users/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mainAdmin.token}`,
      },
      body: JSON.stringify({ userId: userA.id }),
    });
    assert.equal(legacyDeleteRes.status, 503);
    assert.equal(legacyDeleteRes.data.code, 'ACCOUNT_DELETION_TEMPORARILY_DISABLED');

    const userRowsRes = await db.execute({
      sql: 'SELECT id FROM users WHERE id IN (?, ?, ?, ?)',
      args: [userA.id, userZero.id, userProc.id, userConc.id],
    });
    assert.equal(userRowsRes.rows.length, 4, 'Stage 2 must NOT physically delete any user accounts');

    const auditRes = await jsonFetch(`${baseUrl}/api/admin/audit-logs?limit=50`, {
      headers: { Authorization: `Bearer ${mainAdmin.token}` },
    });
    assert.equal(auditRes.status, 200);
    const auditRaw = JSON.stringify(auditRes.data);
    for (const secret of [userA.password, userZero.password, adminSec2.password, mainAdmin.password, 'sig_invalid']) {
      assert.ok(!auditRaw.includes(secret), 'Audit logs must NEVER store plaintext passwords or tokens');
    }
    const actionTypes = new Set((auditRes.data.logs || []).map((l: any) => l.actionType));
    assert.ok(actionTypes.has('account_deletion_request'));
    assert.ok(actionTypes.has('account_deletion_cancel'));
    assert.ok(actionTypes.has('account_deletion_permission_change'));
    console.log('✓ 15. Legacy delete disabled (503), zero physical deletion, and clean audit logs verified.');

    console.log('\n🎉 ALL 15 STAGE 2 ACCOUNT DELETION TESTS PASSED!');
  } finally {
    if (roomCleanup) {
      try {
        roomCleanup();
      } catch {}
    }
    if (serverChild?.pid) {
      try {
        process.kill(-serverChild.pid, 'SIGKILL');
      } catch {
        try {
          serverChild.kill('SIGKILL');
        } catch {}
      }
    }
    cleanupSqliteFiles(httpDbPath);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Stage 2 verification failed:', err);
    process.exit(1);
  });
