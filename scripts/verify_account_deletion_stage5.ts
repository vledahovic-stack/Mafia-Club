import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import WebSocket from 'ws';

import {
  canUserManageAccountDeletions,
  computePredictedPurgeDate,
  formatDeletionDateTime,
  getDeletionStatusBadgeMeta,
  isAdminAccountUser,
  isMainAdminUser,
  resolveAccountDeletionErrorMessage,
} from '../src/utils/accountDeletionUi';
import { TRANSLATIONS } from '../src/utils/i18n';

const MAIN_ADMIN_EMAIL = 'vledahovic@gmail.com';

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
    await new Promise(r => setTimeout(r, 250));
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
  const forbidden = new Set([
    'password',
    'passwordHash',
    'password_hash',
    'googleIdToken',
    'operationToken',
    'operation_token',
    'sessionToken',
    'session_token',
  ]);
  if (Array.isArray(obj)) {
    obj.forEach((v, idx) => assertNoSensitiveKeys(v, `${pathPrefix}[${idx}]`));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    assert.ok(!forbidden.has(k), `Sensitive key "${k}" exposed at ${pathPrefix}.${k}`);
    assertNoSensitiveKeys(v, `${pathPrefix}.${k}`);
  }
}

function connectWsAndWait(
  wsBaseUrl: string,
  firstMessage: object
): Promise<{
  ws: WebSocket;
  waitForEvent: (type: string, predicate?: (payload: any) => boolean, timeoutMs?: number) => Promise<any>;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsBaseUrl);
    const events: Array<{ type: string; payload: any }> = [];
    const timer = setTimeout(() => reject(new Error('WS open timeout')), 8000);

    ws.on('open', () => {
      clearTimeout(timer);
      ws.send(JSON.stringify(firstMessage));
      resolve({
        ws,
        waitForEvent: (type: string, predicate?: (payload: any) => boolean, timeoutMs = 6000) => {
          const hit = events.find(e => e.type === type && (!predicate || predicate(e.payload)));
          if (hit) return Promise.resolve(hit.payload);
          return new Promise((resEv, rejEv) => {
            const evTimer = setTimeout(() => rejEv(new Error(`Timeout waiting for WS ${type}`)), timeoutMs);
            const listener = (buf: WebSocket.RawData) => {
              try {
                const parsed = JSON.parse(buf.toString());
                if (parsed.type === type && (!predicate || predicate(parsed.payload))) {
                  clearTimeout(evTimer);
                  ws.off('message', listener);
                  resEv(parsed.payload);
                }
              } catch {}
            };
            ws.on('message', listener);
          });
        },
      });
    });

    ws.on('message', buf => {
      try {
        const parsed = JSON.parse(buf.toString());
        events.push({ type: parsed.type, payload: parsed.payload });
      } catch {}
    });

    ws.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runUiUnitChecks() {
  console.log('1) Checking Stage 5 UI helpers & RU/UK/EN i18n coverage...');

  // Permission & identity helpers
  assert.equal(isMainAdminUser({ email: MAIN_ADMIN_EMAIL }), true);
  assert.equal(isMainAdminUser({ email: 'VLEDAHOVIC@GMAIL.COM ' }), true);
  assert.equal(isMainAdminUser({ email: 'other@example.com' }), false);

  assert.equal(isAdminAccountUser({ email: 'a@test.com', isAdmin: true, role: 'user' }), true);
  assert.equal(isAdminAccountUser({ email: 'a@test.com', isAdmin: false, role: 'admin' }), true);
  assert.equal(isAdminAccountUser({ email: 'a@test.com', isAdmin: false, role: 'user' }), false);

  assert.equal(canUserManageAccountDeletions({ email: MAIN_ADMIN_EMAIL, isAdmin: true, role: 'admin', canDeleteAccounts: false }), true);
  assert.equal(canUserManageAccountDeletions({ email: 'sub@test.com', isAdmin: true, role: 'admin', canDeleteAccounts: false }), false);
  assert.equal(canUserManageAccountDeletions({ email: 'sub@test.com', isAdmin: true, role: 'admin', canDeleteAccounts: true }), true);
  assert.equal(canUserManageAccountDeletions({ email: 'mod@test.com', isAdmin: false, role: 'user', canDeleteAccounts: true }), false);

  // Predicted date calculation
  const baseMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const plus7 = computePredictedPurgeDate(7, baseMs);
  assert.equal(plus7.getTime() - baseMs, 7 * 24 * 60 * 60 * 1000);
  assert.ok(formatDeletionDateTime(plus7, 'ru').length > 4);
  assert.ok(formatDeletionDateTime(plus7, 'uk').length > 4);
  assert.ok(formatDeletionDateTime(plus7, 'en').length > 4);

  // Badge states
  const ruT = (key: string, fb: string) => (TRANSLATIONS.ru as Record<string, string>)[key] || fb;
  assert.equal(getDeletionStatusBadgeMeta(null, ruT).kind, 'normal');
  assert.equal(getDeletionStatusBadgeMeta(null, ruT).label, 'Обычный аккаунт');
  assert.equal(
    getDeletionStatusBadgeMeta({ hasActiveRequest: true, status: 'pending_game_end' } as any, ruT).label,
    'Ожидает завершения партии'
  );
  assert.equal(
    getDeletionStatusBadgeMeta({ hasActiveRequest: true, status: 'scheduled' } as any, ruT).label,
    'Ожидает удаления'
  );
  assert.equal(
    getDeletionStatusBadgeMeta({ hasActiveRequest: true, status: 'processing' } as any, ruT).label,
    'Выполняется удаление'
  );

  // Error mapping
  assert.equal(
    resolveAccountDeletionErrorMessage({ code: 'INVALID_REAUTH_PASSWORD' }, ruT),
    'Неверный пароль подтверждения.'
  );
  assert.equal(
    resolveAccountDeletionErrorMessage({ code: 'GOOGLE_REAUTH_STALE' }, ruT),
    'Срок подтверждения Google истёк. Пройдите повторную проверку Google.'
  );
  assert.equal(
    resolveAccountDeletionErrorMessage({ code: 'SELF_DELETE_FORBIDDEN_IN_ACTIVE_MATCH' }, ruT),
    'Удалить аккаунт можно после завершения текущей партии'
  );

  // Translation keys parity across ru, uk, en
  const ruDeletionKeys = Object.keys(TRANSLATIONS.ru).filter(
    k => k.startsWith('deletion.') || k.startsWith('admin_deletion.')
  );
  assert.ok(ruDeletionKeys.length >= 45, `Expected >=45 deletion i18n keys, got ${ruDeletionKeys.length}`);
  for (const key of ruDeletionKeys) {
    assert.ok((TRANSLATIONS.uk as Record<string, string>)[key], `Missing UK key: ${key}`);
    assert.ok((TRANSLATIONS.en as Record<string, string>)[key], `Missing EN key: ${key}`);
  }
  console.log('   OK: UI helpers and RU/UK/EN i18n keys passed.');
}

async function runIsolatedServerFlows() {
  console.log('2) Starting isolated Stage 5 test server with temp SQLite DB...');
  const tempDbPath = path.join(os.tmpdir(), `mafia_stage5_verify_${Date.now()}_${process.pid}.sqlite`);
  cleanupSqliteFiles(tempDbPath);

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBaseUrl = `ws://127.0.0.1:${port}/ws`;
  const localTsx = path.resolve(process.cwd(), 'node_modules/.bin/tsx');

  const serverProc = spawn(localTsx, ['server.ts'], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      LIBSQL_URL: `file:${tempDbPath}`,
      TURSO_DATABASE_URL: '',
      TURSO_AUTH_TOKEN: '',
      LIBSQL_AUTH_TOKEN: '',
      ENABLE_AUTOMATIC_ACCOUNT_PURGE: 'false',
    },
    stdio: 'ignore',
  });

  const db = createClient({ url: `file:${tempDbPath}` });

  try {
    await waitForServerReady(baseUrl);

    const registerUser = async (email: string, password: string, displayName: string) => {
      await db.execute({ sql: "DELETE FROM ip_rate_limits WHERE action = 'register'" });
      const reg = await jsonFetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      assert.equal(reg.status, 200, `Register failed for ${email}: ${reg.raw}`);
      return {
        token: reg.data.token as string,
        user: reg.data.user as { id: string; email: string; displayName: string },
        password,
      };
    };

    const mainAdminEmail = (process.env.ADMIN_EMAIL || MAIN_ADMIN_EMAIL).trim().toLowerCase();
    const mainAdminPassword = (process.env.ADMIN_PASSWORD || '123456').trim();
    const mainLogin = await jsonFetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mainAdminEmail, password: mainAdminPassword }),
    });
    assert.equal(mainLogin.status, 200, `Main admin login failed: ${mainLogin.raw}`);
    const mainAdmin = {
      token: mainLogin.data.token as string,
      user: mainLogin.data.user as { id: string; email: string; displayName: string },
      password: mainAdminPassword,
    };

    const subAdmin = await registerUser('subadmin_stage5@test.local', 'SubAdminPass!23', 'SubAdminUI');
    const otherAdmin = await registerUser('otheradmin_stage5@test.local', 'OtherAdminPass!23', 'OtherAdminUI');
    const playerOne = await registerUser('player1_stage5@test.local', 'PlayerOnePass!23', 'PlayerOneUI');
    const playerTwo = await registerUser('player2_stage5@test.local', 'PlayerTwoPass!23', 'PlayerTwoUI');
    const matchHost = await registerUser('matchhost_stage5@test.local', 'HostPass!23', 'MatchHostUI');
    const matchGuest = await registerUser('matchguest_stage5@test.local', 'GuestPass!23', 'MatchGuestUI');

    // Verify physicalDeletionEnabled defaults to false
    const meCheck = await jsonFetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${playerOne.token}` },
    });
    assert.equal(meCheck.status, 200);
    assert.equal(meCheck.data.user.deletionState?.physicalDeletionEnabled, false);

    // Promote subAdmin and otherAdmin via Main Admin (verify canDeleteAccounts is NOT auto-granted!)
    for (const target of [subAdmin, otherAdmin]) {
      const roleRes = await jsonFetch(`${baseUrl}/api/admin/users/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mainAdmin.token}` },
        body: JSON.stringify({ userId: target.user.id, role: 'admin', isAdmin: true }),
      });
      assert.equal(roleRes.status, 200, `Promote failed: ${roleRes.raw}`);
      assert.equal(roleRes.data.user.canDeleteAccounts, false, 'Admin promotion must NOT auto-grant canDeleteAccounts');
    }

    // Check GET /api/admin/users enrichment
    const usersListRes = await jsonFetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${mainAdmin.token}` },
    });
    assert.equal(usersListRes.status, 200);
    assert.equal(usersListRes.data.physicalDeletionEnabled, false);
    assertNoSensitiveKeys(usersListRes.data);
    const listedP1 = usersListRes.data.users.find((u: any) => u.id === playerOne.user.id);
    assert.equal(listedP1.inActiveMatch, false);
    assert.equal(listedP1.deletionState?.hasActiveRequest, false);

    // 3) Permission checks: subAdmin without canDeleteAccounts cannot delete playerOne
    console.log('3) Verifying deletion permission delegation & protection boundaries...');
    const deniedAdminDel = await jsonFetch(`${baseUrl}/api/admin/users/${playerOne.user.id}/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${subAdmin.token}` },
      body: JSON.stringify({ gracePeriodDays: 7, password: subAdmin.password }),
    });
    assert.equal(deniedAdminDel.status, 403);
    assert.equal(deniedAdminDel.data.code, 'DELETION_PERMISSION_REQUIRED');

    // Non-main admin cannot grant deletion permission
    const nonMainGrant = await jsonFetch(`${baseUrl}/api/admin/users/deletion-permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherAdmin.token}` },
      body: JSON.stringify({ userId: subAdmin.user.id, canDeleteAccounts: true }),
    });
    assert.equal(nonMainGrant.status, 403);

    // Cannot grant deletion permission to non-admin player
    const grantPlayerErr = await jsonFetch(`${baseUrl}/api/admin/users/deletion-permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mainAdmin.token}` },
      body: JSON.stringify({ userId: playerOne.user.id, canDeleteAccounts: true }),
    });
    assert.equal(grantPlayerErr.status, 400);

    // Main admin grants canDeleteAccounts to subAdmin
    const grantRes = await jsonFetch(`${baseUrl}/api/admin/users/deletion-permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mainAdmin.token}` },
      body: JSON.stringify({ userId: subAdmin.user.id, canDeleteAccounts: true }),
    });
    assert.equal(grantRes.status, 200);
    assert.equal(grantRes.data.user.canDeleteAccounts, true);

    // Delegated subAdmin still cannot delete another admin (otherAdmin) or Main Admin
    const delOtherAdmin = await jsonFetch(`${baseUrl}/api/admin/users/${otherAdmin.user.id}/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${subAdmin.token}` },
      body: JSON.stringify({ gracePeriodDays: 7, password: subAdmin.password }),
    });
    assert.equal(delOtherAdmin.status, 403);
    assert.equal(delOtherAdmin.data.code, 'ONLY_MAIN_ADMIN_CAN_DELETE_ADMIN');

    const delMainAdmin = await jsonFetch(`${baseUrl}/api/admin/users/${mainAdmin.user.id}/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${subAdmin.token}` },
      body: JSON.stringify({ gracePeriodDays: 7, password: subAdmin.password }),
    });
    assert.equal(delMainAdmin.status, 403);
    assert.equal(delMainAdmin.data.code, 'CANNOT_DELETE_MAIN_ADMIN');

    // Main Admin CAN self-protect check
    const mainSelfDel = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mainAdmin.token}` },
      body: JSON.stringify({ gracePeriodDays: 7, password: mainAdmin.password }),
    });
    assert.equal(mainSelfDel.status, 403);
    assert.equal(mainSelfDel.data.code, 'MAIN_ADMIN_SELF_DELETE_FORBIDDEN');

    // Demoting subAdmin to 'user' automatically resets canDeleteAccounts = false
    const demoteRes = await jsonFetch(`${baseUrl}/api/admin/users/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mainAdmin.token}` },
      body: JSON.stringify({ userId: subAdmin.user.id, role: 'user', isAdmin: false }),
    });
    assert.equal(demoteRes.status, 200);
    assert.equal(demoteRes.data.user.canDeleteAccounts, false);

    // Re-promote & re-grant for next check
    await jsonFetch(`${baseUrl}/api/admin/users/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mainAdmin.token}` },
      body: JSON.stringify({ userId: subAdmin.user.id, role: 'admin', isAdmin: true }),
    });
    await jsonFetch(`${baseUrl}/api/admin/users/deletion-permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mainAdmin.token}` },
      body: JSON.stringify({ userId: subAdmin.user.id, canDeleteAccounts: true }),
    });

    // 4) Negative re-auth & Self-deletion -> Restricted -> Live WS -> Cancel
    console.log('4) Verifying self-deletion re-auth errors, restricted mode, WS sync & cancel...');
    const wrongPassRes = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerOne.token}` },
      body: JSON.stringify({ gracePeriodDays: 7, password: 'WrongPassword!' }),
    });
    assert.equal(wrongPassRes.status, 401);
    assert.equal(wrongPassRes.data.code, 'INVALID_REAUTH_PASSWORD');

    const badGoogleRes = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerOne.token}` },
      body: JSON.stringify({ gracePeriodDays: 7, googleIdToken: 'stale.invalid.token' }),
    });
    assert.ok(badGoogleRes.status >= 400 && badGoogleRes.status < 500, `Expected 4xx for bad Google token, got ${badGoogleRes.status}`);

    const p1Conn = await connectWsAndWait(wsBaseUrl, {
      type: 'INIT_USER',
      payload: { userId: playerOne.user.id, token: playerOne.token },
    });

    const selfDelRes = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerOne.token}` },
      body: JSON.stringify({ gracePeriodDays: 14, password: playerOne.password }),
    });
    assert.equal(selfDelRes.status, 201, `Self deletion failed: ${selfDelRes.raw}`);
    assert.equal(selfDelRes.data.deletion.status, 'scheduled');
    assert.equal(selfDelRes.data.deletion.isRestricted, true);
    assert.equal(selfDelRes.data.deletion.physicalDeletionEnabled, false);
    assertNoSensitiveKeys(selfDelRes.data);

    const wsRestrictedEv = await p1Conn.waitForEvent(
      'ACCOUNT_DELETION_STATE_CHANGED',
      p => p?.deletion?.isRestricted === true && p?.user?.deletionState?.status === 'scheduled'
    );
    assert.equal(wsRestrictedEv.deletion.status, 'scheduled');
    assert.equal(wsRestrictedEv.user.deletionState.physicalDeletionEnabled, false);

    // Verify public profile of playerOne hides account / deletion metadata (returns 404 to non-admin players)
    const publicProfile = await jsonFetch(`${baseUrl}/api/users/${playerOne.user.id}/public-profile`, {
      headers: { Authorization: `Bearer ${playerTwo.token}` },
    });
    assert.equal(publicProfile.status, 404);
    assert.equal((publicProfile.data as any)?.deletionState, undefined);

    // Restricted account cannot create rooms
    const blockedRoomCreate = await jsonFetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerOne.token}` },
      body: JSON.stringify({ roomName: 'Blocked' }),
    });
    assert.equal(blockedRoomCreate.status, 403);

    // Cancel deletion -> immediate recovery
    const selfCancelRes = await jsonFetch(`${baseUrl}/api/account/deletion-cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerOne.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(selfCancelRes.status, 200);
    assert.equal(selfCancelRes.data.deletion.hasActiveRequest, false);
    assert.equal(selfCancelRes.data.deletion.isRestricted, false);
    p1Conn.ws.close();

    // 5) Active Match behavior: LOBBY allows self-deletion vs active match blocks self-deletion & queues admin deletion as pending_game_end
    console.log('5) Verifying LOBBY vs active match behaviors for self and delegated admin...');
    const createRoom = await jsonFetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${matchHost.token}` },
      body: JSON.stringify({ roomName: 'Stage5 Match Room' }),
    });
    assert.equal(createRoom.status, 200);
    const roomCode = createRoom.data.roomCode as string;

    const hostWsConn = await connectWsAndWait(wsBaseUrl, {
      type: 'JOIN_ROOM',
      payload: { roomCode, playerId: matchHost.user.id, playerName: matchHost.user.displayName, token: matchHost.token },
    });
    await hostWsConn.waitForEvent('ROOM_STATE', p => p?.phase === 'LOBBY');

    const guestWsConn = await connectWsAndWait(wsBaseUrl, {
      type: 'JOIN_ROOM',
      payload: { roomCode, playerId: matchGuest.user.id, playerName: matchGuest.user.displayName, token: matchGuest.token },
    });
    await guestWsConn.waitForEvent('ROOM_STATE', p => Array.isArray(p?.players) && p.players.length >= 2);

    // Add 4 bots so room reaches min 6 players and can START_GAME
    for (let i = 0; i < 4; i++) {
      hostWsConn.ws.send(JSON.stringify({ type: 'ADD_BOT', payload: {} }));
      await new Promise(r => setTimeout(r, 80));
    }

    // In LOBBY, matchGuest deletion status says inActiveMatch: false
    const lobbyStatus = await jsonFetch(`${baseUrl}/api/account/deletion-status`, {
      headers: { Authorization: `Bearer ${matchGuest.token}` },
    });
    assert.equal(lobbyStatus.status, 200);
    assert.equal(lobbyStatus.data.inActiveMatch, false);

    // Start match
    hostWsConn.ws.send(JSON.stringify({ type: 'START_GAME', payload: {} }));
    await hostWsConn.waitForEvent('ROOM_STATE', p => p?.phase && p.phase !== 'LOBBY', 8000);

    // Active match self-deletion is blocked
    const activeMatchSelfDel = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${matchGuest.token}` },
      body: JSON.stringify({ gracePeriodDays: 7, password: matchGuest.password }),
    });
    assert.equal(activeMatchSelfDel.status, 409);
    assert.equal(activeMatchSelfDel.data.code, 'SELF_DELETE_FORBIDDEN_IN_ACTIVE_MATCH');

    // Admin deletion-status sees inActiveMatch: true
    const adminGuestStatus = await jsonFetch(`${baseUrl}/api/admin/users/${matchGuest.user.id}/deletion-status`, {
      headers: { Authorization: `Bearer ${subAdmin.token}` },
    });
    assert.equal(adminGuestStatus.status, 200);
    assert.equal(adminGuestStatus.data.inActiveMatch, true);

    // Delegated admin requests deletion of active match player -> pending_game_end without interrupting match
    const adminPendingDel = await jsonFetch(`${baseUrl}/api/admin/users/${matchGuest.user.id}/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${subAdmin.token}` },
      body: JSON.stringify({ gracePeriodDays: 7, password: subAdmin.password }),
    });
    assert.equal(adminPendingDel.status, 201, `Admin pending_game_end request failed: ${adminPendingDel.raw}`);
    assert.equal(adminPendingDel.data.deletion.status, 'pending_game_end');
    assert.equal(adminPendingDel.data.deletion.isRestricted, false);
    assert.equal(adminPendingDel.data.deletion.scheduledPurgeAt, null);

    // Admin users list shows pending_game_end badge status and inActiveMatch
    const adminListCheck = await jsonFetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${subAdmin.token}` },
    });
    assert.equal(adminListCheck.status, 200);
    const listedGuest = adminListCheck.data.users.find((u: any) => u.id === matchGuest.user.id);
    assert.equal(listedGuest.inActiveMatch, true);
    assert.equal(listedGuest.deletionState.status, 'pending_game_end');

    // Cancel pending_game_end by admin
    const adminCancelPending = await jsonFetch(`${baseUrl}/api/admin/users/${matchGuest.user.id}/deletion-cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${subAdmin.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(adminCancelPending.status, 200);
    assert.equal(adminCancelPending.data.deletion.hasActiveRequest, false);

    hostWsConn.ws.close();
    guestWsConn.ws.close();

    // Ensure isolated temp DB only contains test + legacy seeded records
    const rowCount = await db.execute('SELECT COUNT(*) AS cnt FROM users');
    assert.ok(Number(rowCount.rows[0].cnt) >= 7);

    console.log('ALL STAGE 5 VERIFICATION CHECKS PASSED!');
  } catch (err) {
    console.error('Stage 5 verification failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      db.close();
    } catch {}
    if (serverProc.pid) {
      try {
        process.kill(-serverProc.pid, 'SIGTERM');
      } catch {}
    }
    await new Promise(r => setTimeout(r, 300));
    cleanupSqliteFiles(tempDbPath);
  }
}

async function main() {
  await runUiUnitChecks();
  await runIsolatedServerFlows();
}

main();
