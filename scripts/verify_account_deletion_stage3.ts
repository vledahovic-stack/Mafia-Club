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

function connectPresenceWs(
  wsBaseUrl: string,
  userId: string,
  token: string
): Promise<{
  ws: WebSocket;
  events: Array<{ type: string; payload: any }>;
  waitForEvent: (type: string, predicate?: (payload: any) => boolean, timeoutMs?: number) => Promise<any>;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsBaseUrl);
    const events: Array<{ type: string; payload: any }> = [];
    const timer = setTimeout(() => reject(new Error(`WS connect timeout for ${userId}`)), 8000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'INIT_USER', payload: { userId, token } }));
      clearTimeout(timer);
      resolve({
        ws,
        events,
        waitForEvent: (type: string, predicate?: (payload: any) => boolean, timeoutMs = 6000) => {
          const existing = events.find((e) => e.type === type && (!predicate || predicate(e.payload)));
          if (existing) return Promise.resolve(existing.payload);
          return new Promise((resEv, rejEv) => {
            const evTimer = setTimeout(() => {
              rejEv(new Error(`Timed out waiting for WS event ${type}`));
            }, timeoutMs);
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

    ws.on('message', (buf) => {
      try {
        const parsed = JSON.parse(buf.toString());
        events.push({ type: parsed.type, payload: parsed.payload });
      } catch {}
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function joinRoomWs(
  wsBaseUrl: string,
  roomCode: string,
  playerId: string,
  playerName: string,
  token: string,
  asSpectator = false
): Promise<{
  ws: WebSocket;
  events: Array<{ type: string; payload: any }>;
  waitForEvent: (type: string, predicate?: (payload: any) => boolean, timeoutMs?: number) => Promise<any>;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsBaseUrl);
    const events: Array<{ type: string; payload: any }> = [];
    const timer = setTimeout(() => reject(new Error(`WS JOIN_ROOM timeout for ${playerId}`)), 8000);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          payload: { roomCode, playerId, playerName, token, asSpectator },
        })
      );
    });

    ws.on('message', (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        events.push({ type: msg.type, payload: msg.payload });
        if (msg.type === 'ROOM_STATE') {
          clearTimeout(timer);
          resolve({
            ws,
            events,
            waitForEvent: (type: string, predicate?: (payload: any) => boolean, timeoutMs = 6000) => {
              const existing = events.find((e) => e.type === type && (!predicate || predicate(e.payload)));
              if (existing) return Promise.resolve(existing.payload);
              return new Promise((resEv, rejEv) => {
                const evTimer = setTimeout(
                  () => rejEv(new Error(`Timed out waiting for WS event ${type}`)),
                  timeoutMs
                );
                const listener = (b: WebSocket.RawData) => {
                  try {
                    const p = JSON.parse(b.toString());
                    if (p.type === type && (!predicate || predicate(p.payload))) {
                      clearTimeout(evTimer);
                      ws.off('message', listener);
                      resEv(p.payload);
                    }
                  } catch {}
                };
                ws.on('message', listener);
              });
            },
          });
        } else if (msg.type === 'ERROR') {
          clearTimeout(timer);
          try {
            ws.close();
          } catch {}
          const err: any = new Error(msg.payload?.message || 'WS ERROR');
          err.code = msg.payload?.code;
          reject(err);
        }
      } catch {}
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runTests() {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const httpDbPath = path.join(os.tmpdir(), `mafia_del_stage3_http_${stamp}.sqlite`);
  const unitDbPath = path.join(os.tmpdir(), `mafia_del_stage3_unit_${stamp}.sqlite`);
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBaseUrl = `ws://127.0.0.1:${port}/ws`;
  const localTsx = path.resolve(process.cwd(), 'node_modules/.bin/tsx');

  let serverChild: ReturnType<typeof spawn> | null = null;
  const openSockets: WebSocket[] = [];

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

    const userA = await registerUser(`s3_alpha_${stamp}@test.local`, 'PassAlpha!123', 'Stage3Alpha');
    const userB = await registerUser(`s3_beta_${stamp}@test.local`, 'PassBeta!123', 'Stage3Beta');
    const userC = await registerUser(`s3_gamma_${stamp}@test.local`, 'PassGamma!123', 'Stage3Gamma');
    const userInMatch = await registerUser(`s3_match_${stamp}@test.local`, 'PassMatch!123', 'Stage3Match');
    const userNormal = await registerUser(`s3_norm_${stamp}@test.local`, 'PassNorm!123', 'Stage3Normal');

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
      password: mainAdminPassword,
    };

    // Give userA credits, XP, and active Premium so we can verify preservation after cancel
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 14 * 86400 * 1000).toISOString();
    await db.execute({
      sql: `UPDATE users SET credits = 5000, xp = 1250, level = 5 WHERE id = ?`,
      args: [userA.id],
    });
    await db.execute({
      sql: `INSERT OR REPLACE INTO user_premium_status (user_id, tier, activated_at, expires_at, source, certificate_id, updated_at)
            VALUES (?, 'gold', ?, ?, 'admin_test', NULL, ?)`,
      args: [userA.id, nowIso, expiresIso, nowIso],
    });
    await db.execute({
      sql: `UPDATE users SET credits = 5000 WHERE id IN (?, ?)`,
      args: [userB.id, userNormal.id],
    });

    // Establish accepted friendship userA <-> userB before deletion
    const frReq = await jsonFetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ targetUserId: userB.id }),
    });
    assert.equal(frReq.status, 200, `Friend request failed: ${frReq.raw}`);
    const frAcc = await jsonFetch(`${baseUrl}/api/friends/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userB.token}` },
      body: JSON.stringify({ targetUserId: userA.id }),
    });
    assert.equal(frAcc.status, 200, `Friend accept failed: ${frAcc.raw}`);

    // Create Clan led by userA and joined by userB BEFORE deletion
    const clanCreate = await jsonFetch(`${baseUrl}/api/clans/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ name: `Syndicate ${stamp.slice(-4)}`, tag: 'S3T', description: 'Test clan' }),
    });
    assert.equal(clanCreate.status, 200, `Clan create failed: ${clanCreate.raw}`);
    const clanId = clanCreate.data.clan.id as string;

    const clanJoin = await jsonFetch(`${baseUrl}/api/clans/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userB.token}` },
      body: JSON.stringify({ clanId }),
    });
    assert.equal(clanJoin.status, 200, `Clan join failed: ${clanJoin.raw}`);

    // Connect presence WS for userA to verify real-time ACCOUNT_DELETION_STATE_CHANGED
    const presenceA = await connectPresenceWs(wsBaseUrl, userA.id, userA.token);
    openSockets.push(presenceA.ws);

    console.log('1. Testing self deletion -> scheduled mode + WS real-time sync + non-destruction...');
    const delReq = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ gracePeriodDays: 7, password: userA.password }),
    });
    assert.equal(delReq.status, 201, `Self deletion request failed: ${delReq.raw}`);
    assert.equal(delReq.data.deletion.status, 'scheduled');
    assert.equal(delReq.data.deletion.isRestricted, true);

    const wsScheduledEv = await presenceA.waitForEvent(
      'ACCOUNT_DELETION_STATE_CHANGED',
      (p) => p?.deletion?.status === 'scheduled' && p?.deletion?.isRestricted === true
    );
    assert.equal(wsScheduledEv.user.id, userA.id);
    assert.equal(wsScheduledEv.user.deletionState.status, 'scheduled');

    // Login & /api/auth/me must still succeed in scheduled mode and expose deletionState
    const meScheduled = await jsonFetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    assert.equal(meScheduled.status, 200);
    assert.equal(meScheduled.data.user.deletionState.status, 'scheduled');
    assert.equal(meScheduled.data.user.deletionState.isRestricted, true);
    assert.equal(meScheduled.data.user.deletionState.canCancel, true);
    assert.equal(meScheduled.data.user.credits, 5000);
    assert.equal(meScheduled.data.user.xp, 1250);
    assert.equal(meScheduled.data.user.premium.tier, 'gold');

    console.log('2. Testing global REST & WS restrictions in scheduled mode...');
    const roomResBlocked = await jsonFetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ roomName: 'Forbidden Room' }),
    });
    assert.equal(roomResBlocked.status, 403);
    assert.equal(roomResBlocked.data.code, 'ACCOUNT_SCHEDULED_FOR_DELETION');

    const buyBlocked = await jsonFetch(`${baseUrl}/api/user/buy-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ itemId: 'cert_rename' }),
    });
    assert.equal(buyBlocked.status, 403);
    assert.equal(buyBlocked.data.code, 'ACCOUNT_SCHEDULED_FOR_DELETION');

    const pawnBlocked = await jsonFetch(`${baseUrl}/api/user/pawn-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ itemId: 'cert_rename' }),
    });
    assert.equal(pawnBlocked.status, 403);

    const bonusBlocked = await jsonFetch(`${baseUrl}/api/user/claim-daily-bonus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(bonusBlocked.status, 403);

    const promoBlocked = await jsonFetch(`${baseUrl}/api/promocodes/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ code: 'TESTCODE' }),
    });
    assert.equal(promoBlocked.status, 403);

    const renameBlocked = await jsonFetch(`${baseUrl}/api/user/change-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ displayName: 'NewBlockedName' }),
    });
    assert.equal(renameBlocked.status, 403);

    const friendReqBlocked = await jsonFetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ targetUserId: userC.id }),
    });
    assert.equal(friendReqBlocked.status, 403);

    const clanLeaveBlocked = await jsonFetch(`${baseUrl}/api/clans/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(clanLeaveBlocked.status, 403);

    const lobbyChatBlocked = await jsonFetch(`${baseUrl}/api/lobby/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ senderId: userA.id, senderName: userA.displayName, text: 'Blocked msg' }),
    });
    assert.equal(lobbyChatBlocked.status, 403);

    // Also test normal player creating a room & scheduled user trying to join via WS
    const normRoom = await jsonFetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userNormal.token}` },
      body: JSON.stringify({ roomName: 'Normal Room' }),
    });
    assert.equal(normRoom.status, 200);
    const normRoomCode = normRoom.data.roomCode as string;
    const normRoomWs = await joinRoomWs(wsBaseUrl, normRoomCode, userNormal.id, userNormal.displayName, userNormal.token);
    openSockets.push(normRoomWs.ws);

    await assert.rejects(
      () => joinRoomWs(wsBaseUrl, normRoomCode, userA.id, userA.displayName, userA.token),
      (err: any) => err && err.code === 'ACCOUNT_SCHEDULED_FOR_DELETION'
    );

    // Test WS action restriction when a player is already seated in LOBBY and admin puts them into scheduled mode
    const userCWs = await joinRoomWs(wsBaseUrl, normRoomCode, userC.id, userC.displayName, userC.token);
    openSockets.push(userCWs.ws);
    const adminSchedC = await jsonFetch(`${baseUrl}/api/admin/users/${userC.id}/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mainAdmin.token}` },
      body: JSON.stringify({ gracePeriodDays: 3, password: mainAdmin.password }),
    });
    assert.equal(adminSchedC.status, 201);
    assert.equal(adminSchedC.data.deletion.status, 'scheduled');

    userCWs.ws.send(JSON.stringify({ type: 'SEND_CHAT', payload: { text: 'Should fail in lobby' } }));
    const wsErrC = await userCWs.waitForEvent('ERROR', (p) => p?.code === 'ACCOUNT_SCHEDULED_FOR_DELETION');
    assert.equal(wsErrC.code, 'ACCOUNT_SCHEDULED_FOR_DELETION');
    // LEAVE_ROOM must still be allowed and not return an error
    userCWs.ws.send(JSON.stringify({ type: 'LEAVE_ROOM', payload: {} }));

    console.log('3. Testing public profile hiding & search exclusion while preserving friendships...');
    const hiddenProfileRes = await jsonFetch(`${baseUrl}/api/users/${userA.id}/public-profile`);
    assert.equal(hiddenProfileRes.status, 404);
    assert.equal(hiddenProfileRes.data.code, 'PUBLIC_PROFILE_UNAVAILABLE');

    const searchHidden = await jsonFetch(`${baseUrl}/api/friends/search?q=Stage3Alpha`, {
      headers: { Authorization: `Bearer ${userNormal.token}` },
    });
    assert.equal(searchHidden.status, 200);
    assert.equal(
      searchHidden.data.results.some((r: any) => r.id === userA.id),
      false,
      'Scheduled account must be excluded from player search'
    );

    // Friendship row must still exist in DB (Stage 3 never purges relationships)
    const frRowCheck = await db.execute({
      sql: `SELECT status FROM user_friends WHERE user_id = ? AND friend_id = ?`,
      args: [userB.id, userA.id],
    });
    assert.equal(frRowCheck.rows[0]?.status, 'accepted');

    // Sending friend request TO hidden scheduled user must be blocked
    const reqToHidden = await jsonFetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userNormal.token}` },
      body: JSON.stringify({ targetUserId: userA.id }),
    });
    assert.equal(reqToHidden.status, 400);

    console.log('4. Testing conditional clan leadership transfer (allowed ONLY while leader)...');
    const transferRes = await jsonFetch(`${baseUrl}/api/clans/transfer-leadership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ newLeaderUserId: userB.id }),
    });
    assert.equal(transferRes.status, 200, `Clan transfer failed: ${transferRes.raw}`);
    assert.equal(transferRes.data.user.clanRole, 'member');
    assert.equal(transferRes.data.clan.leaderId, userB.id);

    // Subsequent call after becoming member must be rejected with 403
    const transferAgainRes = await jsonFetch(`${baseUrl}/api/clans/transfer-leadership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ newLeaderUserId: userB.id }),
    });
    assert.equal(transferAgainRes.status, 403);
    assert.equal(transferAgainRes.data.code, 'CLAN_LEADER_ONLY');

    console.log('5. Testing 0-day conversion without physical purge + cancellation restoration...');
    const zeroConvertRes = await jsonFetch(`${baseUrl}/api/account/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ gracePeriodDays: 0, password: userA.password }),
    });
    assert.equal(zeroConvertRes.status, 200, `0-day conversion failed: ${zeroConvertRes.raw}`);
    assert.equal(zeroConvertRes.data.deletion.status, 'scheduled');
    assert.equal(zeroConvertRes.data.deletion.gracePeriodDays, 0);
    assert.equal(zeroConvertRes.data.deletion.isImmediate, true);

    // Ensure user row is STILL present and NOT physically deleted
    const dbUserCheck = await db.execute({ sql: `SELECT id, email, credits, xp FROM users WHERE id = ?`, args: [userA.id] });
    assert.equal(dbUserCheck.rows.length, 1);
    assert.equal(Number(dbUserCheck.rows[0].credits), 5000);

    // Cancel deletion and confirm full restoration + WS update + profile visible again
    const cancelRes = await jsonFetch(`${baseUrl}/api/account/deletion-cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(cancelRes.status, 200, `Cancel failed: ${cancelRes.raw}`);
    assert.equal(cancelRes.data.deletion.status, 'cancelled');
    assert.equal(cancelRes.data.deletion.hasActiveRequest, false);

    const wsCancelEv = await presenceA.waitForEvent(
      'ACCOUNT_DELETION_STATE_CHANGED',
      (p) => p?.deletion?.hasActiveRequest === false && p?.deletion?.isRestricted === false
    );
    assert.equal(wsCancelEv.user.credits, 5000);
    assert.equal(wsCancelEv.user.premium.tier, 'gold');

    // Public profile & search & room creation must be unlocked immediately
    const restoredProfile = await jsonFetch(`${baseUrl}/api/users/${userA.id}/public-profile`);
    assert.equal(restoredProfile.status, 200);
    assert.equal(restoredProfile.data.profile.displayName, 'Stage3Alpha');

    const restoredSearch = await jsonFetch(`${baseUrl}/api/friends/search?q=Stage3Alpha`, {
      headers: { Authorization: `Bearer ${userNormal.token}` },
    });
    assert.equal(restoredSearch.status, 200);
    assert.equal(restoredSearch.data.results.some((r: any) => r.id === userA.id), true);

    console.log('6. Testing active match deferral (pending_game_end) & early STOP_GAME transition via WS...');
    const matchRoom = await jsonFetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userNormal.token}` },
      body: JSON.stringify({ roomName: 'Match Transition Room' }),
    });
    assert.equal(matchRoom.status, 200);
    const matchCode = matchRoom.data.roomCode as string;
    const hostWsObj = await joinRoomWs(wsBaseUrl, matchCode, userNormal.id, userNormal.displayName, userNormal.token);
    const matchUserWsObj = await joinRoomWs(wsBaseUrl, matchCode, userInMatch.id, userInMatch.displayName, userInMatch.token);
    openSockets.push(hostWsObj.ws, matchUserWsObj.ws);

    for (let i = 0; i < 3; i++) {
      hostWsObj.ws.send(JSON.stringify({ type: 'ADD_BOT', payload: {} }));
    }
    await new Promise((r) => setTimeout(r, 250));
    hostWsObj.ws.send(JSON.stringify({ type: 'START_GAME', payload: {} }));
    await hostWsObj.waitForEvent('ROOM_STATE', (p) => p?.phase && p.phase !== 'LOBBY');

    // Admin requests deletion for userInMatch while active match is running -> pending_game_end
    const adminPendingRes = await jsonFetch(`${baseUrl}/api/admin/users/${userInMatch.id}/deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mainAdmin.token}` },
      body: JSON.stringify({ gracePeriodDays: 5, password: mainAdmin.password }),
    });
    assert.equal(adminPendingRes.status, 201, `Admin pending_game_end failed: ${adminPendingRes.raw}`);
    assert.equal(adminPendingRes.data.deletion.status, 'pending_game_end');
    assert.equal(adminPendingRes.data.deletion.isRestricted, false);
    assert.equal(adminPendingRes.data.deletion.graceStartedAt, null);
    assert.equal(adminPendingRes.data.deletion.scheduledPurgeAt, null);

    // Public profile still visible while pending_game_end
    const pendingProfile = await jsonFetch(`${baseUrl}/api/users/${userInMatch.id}/public-profile`);
    assert.equal(pendingProfile.status, 200);

    // Host stops the match -> should automatically transition userInMatch to scheduled & emit WS event
    hostWsObj.ws.send(JSON.stringify({ type: 'STOP_GAME', payload: {} }));
    const wsAfterStop = await matchUserWsObj.waitForEvent(
      'ACCOUNT_DELETION_STATE_CHANGED',
      (p) => p?.deletion?.status === 'scheduled' && p?.deletion?.isRestricted === true
    );
    assert.ok(wsAfterStop.deletion.graceStartedAt, 'graceStartedAt must be populated after match end');
    assert.ok(wsAfterStop.deletion.scheduledPurgeAt, 'scheduledPurgeAt must be populated after match end');

    // Clean up HTTP server before running isolated RoomManager / startup-recovery unit verification
    if (serverChild?.pid) {
      try {
        process.kill(-serverChild.pid, 'SIGTERM');
      } catch {}
      serverChild = null;
    }
    openSockets.forEach((s) => {
      try {
        s.close();
      } catch {}
    });

    console.log('7. Testing normal endGame stats-before-transition, idempotency, and startup reconciliation in isolated unit DB...');
    process.env.LIBSQL_URL = `file:${unitDbPath}`;
    process.env.TURSO_DATABASE_URL = '';
    process.env.TURSO_AUTH_TOKEN = '';
    process.env.LIBSQL_AUTH_TOKEN = '';

    const { initDatabase, waitForDatabaseInit, getDatabase } = await import('../server/db/database');
    const { userDb } = await import('../server/db/users');
    const { accountDeletionDb } = await import('../server/db/accountDeletion');
    const { roomManager } = await import('../server/game/roomManager');

    initDatabase();
    await waitForDatabaseInit();
    const udb = getDatabase();

    const adminRec = await userDb.register(`u_adm_${stamp}@test.local`, 'Pass123!@#', 'UnitAdmin');
    const u1 = await userDb.register(`u_1_${stamp}@test.local`, 'Pass123!@#', 'UnitPlayer1');
    const u2 = await userDb.register(`u_2_${stamp}@test.local`, 'Pass123!@#', 'UnitPlayer2');
    const u3 = await userDb.register(`u_3_${stamp}@test.local`, 'Pass123!@#', 'UnitPlayer3');

    const unitRoom = roomManager.createRoom('Unit EndGame Room', u1.id, u1.displayName, {}, true);
    unitRoom.state.players.push(
      { id: u2.id, name: u2.displayName, avatarSeed: u2.displayName, isHost: false, isBot: false, isRegistered: true, isAlive: true, connected: true, ready: true, warningsCount: 0 },
      { id: u3.id, name: u3.displayName, avatarSeed: u3.displayName, isHost: false, isBot: false, isRegistered: true, isAlive: true, connected: true, ready: true, warningsCount: 0 }
    );
    unitRoom.addBot();
    assert.equal(unitRoom.startGame(u1.id), true);

    // Put u1 into pending_game_end while match is active
    const pendU1 = await accountDeletionDb.createDeletionRequest({
      userId: u1.id,
      initiatorType: 'admin',
      initiatedByAdminId: adminRec.id,
      gracePeriodDays: 4,
      isInActiveMatch: true,
    });
    assert.equal(pendU1.status, 'pending_game_end');

    // Trigger normal endGame
    (unitRoom as any).endGame('civilians');
    const waitStatsPromise = (unitRoom as any).activeEndGameStatsPromise as Promise<void> | null;
    if (waitStatsPromise) {
      await waitStatsPromise;
    }
    await new Promise((r) => setTimeout(r, 150));

    // Verify match_history & stats were recorded BEFORE transition completed
    const histAfterEnd = await userDb.getGameHistory(u1.id);
    assert.equal(histAfterEnd.matches.length, 1, 'Normal endGame must record match_history before transitioning');
    const stateAfterEnd = await accountDeletionDb.getAccountDeletionState(u1.id);
    assert.equal(stateAfterEnd.status, 'scheduled');
    assert.ok(stateAfterEnd.request?.graceStartedAt);
    const firstGraceStart = stateAfterEnd.request?.graceStartedAt;

    // Closing room afterwards must be idempotent (graceStartedAt unchanged)
    unitRoom.closeRoom('Test room closed');
    await new Promise((r) => setTimeout(r, 100));
    const stateAfterClose = await accountDeletionDb.getAccountDeletionState(u1.id);
    assert.equal(stateAfterClose.status, 'scheduled');
    assert.equal(stateAfterClose.request?.graceStartedAt, firstGraceStart);

    // Test conservative startup reconciliation:
    // Case A: match_history exists at/after request creation -> safe to transition
    const uHist = await userDb.register(`u_hist_${stamp}@test.local`, 'Pass123!@#', 'UnitHist');
    const reqHist = await accountDeletionDb.createDeletionRequest({
      userId: uHist.id,
      initiatorType: 'admin',
      initiatedByAdminId: adminRec.id,
      gracePeriodDays: 2,
      isInActiveMatch: true,
      nowMs: Date.now() - 5000,
    });
    await udb.execute({
      sql: `INSERT INTO match_history (id, user_id, played_at, role, role_name, team, won, is_draw, survived, survival_seconds, rounds_survived, rating_change, credits_earned)
            VALUES (?, ?, ?, 'civilian', 'Мирный житель', 'civilians', 1, 0, 1, 60, 1, 20, 50)`,
      args: [`mh_${stamp}`, uHist.id, new Date().toISOString()],
    });

    // Case B: missing room & no match_history (crash scenario) -> must NOT blindly transition
    const uCrash = await userDb.register(`u_crash_${stamp}@test.local`, 'Pass123!@#', 'UnitCrash');
    const reqCrash = await accountDeletionDb.createDeletionRequest({
      userId: uCrash.id,
      initiatorType: 'admin',
      initiatedByAdminId: adminRec.id,
      gracePeriodDays: 2,
      isInActiveMatch: true,
    });

    // Clear unitRoom from memory so reconciliation runs against DB
    const reconcileRes = await accountDeletionDb.reconcilePendingGameEndRequestsOnStartup([]);
    assert.ok(
      reconcileRes.transitioned.some((r) => r.id === reqHist.id),
      'Persisted match_history evidence must transition pending_game_end -> scheduled'
    );
    assert.ok(
      reconcileRes.unresolved.some((r) => r.requestId === reqCrash.id),
      'Missing room with no match_history must stay unresolved/pending_game_end'
    );
    const crashState = await accountDeletionDb.getAccountDeletionState(uCrash.id);
    assert.equal(crashState.status, 'pending_game_end');

    console.log('✅ All Stage 3 verification assertions passed!');
  } finally {
    openSockets.forEach((s) => {
      try {
        s.close();
      } catch {}
    });
    if (serverChild?.pid) {
      try {
        process.kill(-serverChild.pid, 'SIGTERM');
      } catch {}
    }
    cleanupSqliteFiles(httpDbPath);
    cleanupSqliteFiles(unitDbPath);
  }
}

runTests().catch((err) => {
  console.error('❌ Stage 3 verification failed:', err);
  process.exit(1);
});
