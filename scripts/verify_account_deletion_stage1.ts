import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function cleanupSqliteFiles(dbFilePath: string) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const p = dbFilePath + suffix;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {}
  }
}

async function waitForServerReady(baseUrl: string, timeoutMs = 20000): Promise<void> {
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

async function runTests() {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const unitDbPath = path.join(os.tmpdir(), `mafia_del_stage1_unit_${stamp}.sqlite`);
  const httpDbPath = path.join(os.tmpdir(), `mafia_del_stage1_http_${stamp}.sqlite`);

  // Force isolated LibSQL file BEFORE importing database module
  process.env.TURSO_DATABASE_URL = '';
  process.env.TURSO_AUTH_TOKEN = '';
  process.env.LIBSQL_AUTH_TOKEN = '';
  process.env.LIBSQL_URL = `file:${unitDbPath}`;

  let serverChild: ReturnType<typeof spawn> | null = null;

  try {
    const {
      initDatabase,
      waitForDatabaseInit,
      getDatabase,
      getDatabaseConnectionInfo,
    } = await import('../server/db/database');
    const {
      AccountDeletionDatabase,
      AccountDeletionError,
      MS_PER_DAY,
      detectUserActiveMatchFromRooms,
      evaluateAccountActionPermission,
      isValidStatusTransition,
      validateGracePeriodDays,
      computeScheduledPurgeAt,
    } = await import('../server/db/accountDeletion');

    initDatabase();
    await waitForDatabaseInit();

    const connInfo = getDatabaseConnectionInfo();
    assert.ok(connInfo.target.startsWith('file:'), `Expected file: target, got ${connInfo.target}`);
    assert.ok(connInfo.target.includes(unitDbPath), `Expected isolated test DB, got ${connInfo.target}`);

    const db = getDatabase();
    const deletionDb = new AccountDeletionDatabase(db);

    // Seed isolated test users inside temp DB
    const nowIso = new Date().toISOString();
    const testUsers = ['u_self_1', 'u_zero_1', 'u_match_1', 'u_conc_1', 'u_cancel_1', 'u_trans_1'];
    for (const uid of testUsers) {
      await db.execute({
        sql: `INSERT INTO users (
                id, email, display_name, avatar_seed, password_hash, credits, xp, level,
                role, is_admin, is_banned, stats, inventory, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 'hash_dummy', 250, 0, 1, 'user', 0, 0, '{}', '[]', ?, ?)`,
        args: [uid, `${uid}@test.local`, `Player_${uid}`, uid, nowIso, nowIso],
      });
    }

    // Verify schema & partial unique index exist
    const schemaCheck = await db.execute(
      `SELECT name, type FROM sqlite_master
       WHERE name IN ('account_deletion_requests', 'idx_account_del_one_active_per_user')`
    );
    assert.equal(schemaCheck.rows.length, 2, 'Table account_deletion_requests and unique active index must exist');
    console.log('✓ 0. Isolated test DB initialized and schema verified.');

    // -------------------------------------------------------------------------
    // TEST 1: Create valid deletion request & UTC timestamp storage
    // -------------------------------------------------------------------------
    const t0 = Date.UTC(2026, 10, 13, 12, 0, 0); // 2026-11-13T12:00:00.000Z
    const req1 = await deletionDb.createDeletionRequest({
      userId: 'u_self_1',
      initiatorType: 'self',
      gracePeriodDays: 7,
      isInActiveMatch: false,
      nowMs: t0,
    });
    assert.ok(req1.id.startsWith('adr_'));
    assert.ok(req1.operationToken.startsWith('delop_'));
    assert.equal(req1.userId, 'u_self_1');
    assert.equal(req1.initiatorType, 'self');
    assert.equal(req1.initiatedByAdminId, null);
    assert.equal(req1.status, 'scheduled');
    assert.equal(req1.gracePeriodDays, 7);
    assert.equal(req1.createdAt, '2026-11-13T12:00:00.000Z');
    assert.equal(req1.graceStartedAt, '2026-11-13T12:00:00.000Z');
    assert.equal(req1.scheduledPurgeAt, '2026-11-20T12:00:00.000Z');
    assert.equal(req1.version, 1);

    // Ensure no PII columns exist on account_deletion_requests
    const colInfo = await db.execute('PRAGMA table_info(account_deletion_requests)');
    const colNames = colInfo.rows.map((r: any) => String(r.name));
    for (const forbidden of ['email', 'display_name', 'password', 'password_hash', 'google_uid']) {
      assert.ok(!colNames.includes(forbidden), `Table must not contain PII/secret column: ${forbidden}`);
    }
    console.log('✓ 1. Valid request creation, UTC timestamps, and no-PII schema passed.');

    // -------------------------------------------------------------------------
    // TEST 2: Reject negative or invalid gracePeriodDays
    // -------------------------------------------------------------------------
    for (const invalidDays of [-1, -100, 1.5, NaN, Infinity, -Infinity, 99999]) {
      assert.throws(() => validateGracePeriodDays(invalidDays as number), AccountDeletionError);
      await assert.rejects(
        () =>
          deletionDb.createDeletionRequest({
            userId: 'u_zero_1',
            initiatorType: 'self',
            gracePeriodDays: invalidDays as number,
          }),
        (err: any) => err instanceof AccountDeletionError && err.code === 'INVALID_GRACE_PERIOD'
      );
    }
    console.log('✓ 2. Invalid/negative grace periods rejected.');

    // -------------------------------------------------------------------------
    // TEST 3: Immediate deletion with zero wait (gracePeriodDays = 0)
    // -------------------------------------------------------------------------
    const tZero = Date.UTC(2026, 10, 13, 15, 30, 0);
    const reqZero = await deletionDb.createDeletionRequest({
      userId: 'u_zero_1',
      initiatorType: 'self',
      gracePeriodDays: 0,
      nowMs: tZero,
    });
    assert.equal(reqZero.status, 'scheduled');
    assert.equal(reqZero.gracePeriodDays, 0);
    assert.equal(reqZero.graceStartedAt, reqZero.scheduledPurgeAt);

    const zeroSummary = await deletionDb.getAccountDeletionState('u_zero_1', tZero);
    assert.equal(zeroSummary.isImmediate, true);
    assert.equal(zeroSummary.isDueForPurge, true);
    assert.equal(zeroSummary.remainingMs, 0);

    // Due immediately without needing allowBeforeDue
    const reqZeroProcessing = await deletionDb.beginProcessingRequest(reqZero.id, { nowMs: tZero });
    assert.equal(reqZeroProcessing.status, 'processing');
    assert.equal(reqZeroProcessing.processingStartedAt, new Date(tZero).toISOString());
    // Real user row MUST still exist in Stage 1
    const zeroUserStillExists = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: ['u_zero_1'] });
    assert.equal(zeroUserStillExists.rows.length, 1, 'Stage 1 must NOT delete real user records');
    console.log('✓ 3. Immediate deletion with 0-day grace period passed.');

    // -------------------------------------------------------------------------
    // TEST 4: Prevent two concurrent active requests for the same user
    // -------------------------------------------------------------------------
    await assert.rejects(
      () =>
        deletionDb.createDeletionRequest({
          userId: 'u_self_1',
          initiatorType: 'admin',
          initiatedByAdminId: 'admin_1',
          gracePeriodDays: 3,
        }),
      (err: any) => err instanceof AccountDeletionError && err.code === 'ACTIVE_DELETION_REQUEST_EXISTS'
    );

    // Also verify DB-level partial unique index directly blocks duplicate active rows
    await assert.rejects(() =>
      db.execute({
        sql: `INSERT INTO account_deletion_requests (
                id, user_id, initiator_type, status, grace_period_days, created_at, operation_token, version, updated_at
              ) VALUES ('adr_dup_direct', 'u_self_1', 'self', 'scheduled', 5, ?, 'delop_dup_direct', 1, ?)`,
        args: [nowIso, nowIso],
      })
    );
    console.log('✓ 4. Duplicate active requests rejected at both service and DB index levels.');

    // -------------------------------------------------------------------------
    // TEST 5 & 9: Valid/invalid transitions + exact grace calculation after game end
    // -------------------------------------------------------------------------
    // 5a. Self request forbidden during active match
    const activeRooms = [
      {
        roomCode: 'ABC123',
        phase: 'DAY_DISCUSSION',
        hostId: 'other_host',
        players: [{ id: 'u_match_1', isBot: false }],
      },
    ];
    const matchInfo = detectUserActiveMatchFromRooms('u_match_1', activeRooms);
    assert.equal(matchInfo.inActiveMatch, true);
    assert.equal(matchInfo.roomCode, 'ABC123');

    await assert.rejects(
      () =>
        deletionDb.createDeletionRequest({
          userId: 'u_match_1',
          initiatorType: 'self',
          gracePeriodDays: 5,
          isInActiveMatch: matchInfo.inActiveMatch,
        }),
      (err: any) => err instanceof AccountDeletionError && err.code === 'SELF_DELETE_FORBIDDEN_IN_ACTIVE_MATCH'
    );

    // 5b. Admin request during active match enters pending_game_end with no countdown yet
    const tMatchStart = Date.UTC(2026, 10, 13, 10, 0, 0);
    const reqPendingMatch = await deletionDb.createDeletionRequest({
      userId: 'u_match_1',
      initiatorType: 'admin',
      initiatedByAdminId: 'admin_root',
      gracePeriodDays: 5,
      isInActiveMatch: true,
      nowMs: tMatchStart,
    });
    assert.equal(reqPendingMatch.status, 'pending_game_end');
    assert.equal(reqPendingMatch.graceStartedAt, null);
    assert.equal(reqPendingMatch.scheduledPurgeAt, null);

    // During pending_game_end, normal gameplay actions remain allowed
    const permInGame = await deletionDb.checkUserActionAllowed('u_match_1', 'match_join');
    assert.equal(permInGame.allowed, true);

    // Countdown begins ONLY when game ends (3 hours later)
    const tMatchEnd = tMatchStart + 3 * 3600 * 1000;
    const reqScheduledAfterMatch = await deletionDb.transitionAfterGameEnd('u_match_1', { nowMs: tMatchEnd });
    assert.equal(reqScheduledAfterMatch.status, 'scheduled');
    assert.equal(reqScheduledAfterMatch.graceStartedAt, new Date(tMatchEnd).toISOString());
    assert.equal(
      reqScheduledAfterMatch.scheduledPurgeAt,
      computeScheduledPurgeAt(tMatchEnd, 5)
    );
    assert.equal(
      new Date(reqScheduledAfterMatch.scheduledPurgeAt!).getTime() - tMatchEnd,
      5 * MS_PER_DAY
    );

    // Cannot begin processing before grace expires
    await assert.rejects(
      () => deletionDb.beginProcessingRequest(reqScheduledAfterMatch.id, { nowMs: tMatchEnd + MS_PER_DAY }),
      (err: any) => err instanceof AccountDeletionError && err.code === 'GRACE_PERIOD_NOT_EXPIRED'
    );

    // Can begin processing once grace expires, then mark completed (scrubbing user_id)
    const tPurgeReady = tMatchEnd + 5 * MS_PER_DAY;
    const reqProc = await deletionDb.beginProcessingRequest(reqScheduledAfterMatch.id, { nowMs: tPurgeReady });
    assert.equal(reqProc.status, 'processing');

    const reqDone = await deletionDb.markRequestCompleted(reqProc.id, tPurgeReady + 5000);
    assert.equal(reqDone.status, 'completed');
    assert.equal(reqDone.userId, `deleted:${reqDone.operationToken}`);
    assert.equal(reqDone.initiatedByAdminId, null);
    assert.ok(reqDone.completedAt);

    // Invalid transition checks
    assert.equal(isValidStatusTransition('cancelled', 'scheduled'), false);
    assert.equal(isValidStatusTransition('completed', 'cancelled'), false);
    assert.equal(isValidStatusTransition('scheduled', 'completed'), false);
    assert.equal(isValidStatusTransition('pending_game_end', 'processing'), true);

    // Verify pending_game_end -> processing directly on 0-day immediate admin delete after game end
    const reqImmediateMatch = await deletionDb.createDeletionRequest({
      userId: 'u_trans_1',
      initiatorType: 'admin',
      initiatedByAdminId: 'admin_root',
      gracePeriodDays: 0,
      isInActiveMatch: true,
      nowMs: tMatchStart,
    });
    assert.equal(reqImmediateMatch.status, 'pending_game_end');
    const reqImmediateProc = await deletionDb.transitionAfterGameEnd('u_trans_1', {
      startImmediateProcessing: true,
      nowMs: tMatchEnd,
    });
    assert.equal(reqImmediateProc.status, 'processing');
    console.log('✓ 5 & 9. State transitions and exact UTC grace calculations passed.');

    // -------------------------------------------------------------------------
    // TEST 6 & 7: Cancel scheduled request & forbid cancelling processing/completed
    // -------------------------------------------------------------------------
    const tCancelCreate = Date.UTC(2026, 10, 13, 18, 0, 0);
    const reqCancelable = await deletionDb.createDeletionRequest({
      userId: 'u_cancel_1',
      initiatorType: 'self',
      gracePeriodDays: 3,
      nowMs: tCancelCreate,
    });
    assert.equal(reqCancelable.status, 'scheduled');

    // Also verify restricted-account checks while scheduled
    for (const blockedAction of [
      'room_create',
      'room_join',
      'match_join',
      'shop_purchase',
      'pawnshop_sell',
      'reward_claim',
      'item_use',
      'balance_or_stats_change',
      'social_action',
      'public_profile_view',
    ] as const) {
      const check = await deletionDb.checkUserActionAllowed('u_cancel_1', blockedAction);
      assert.equal(check.allowed, false, `Action ${blockedAction} must be blocked in scheduled`);
    }
    assert.equal(await deletionDb.isUserPublicProfileHidden('u_cancel_1'), true);

    for (const allowedAction of [
      'auth_login',
      'self_restricted_profile_view',
      'deletion_status_view',
      'deletion_cancel',
      'deletion_confirm_immediate',
      'clan_transfer_leadership',
    ] as const) {
      const check = await deletionDb.checkUserActionAllowed('u_cancel_1', allowedAction);
      assert.equal(check.allowed, true, `Action ${allowedAction} must be allowed in scheduled`);
    }

    const cancelledReq = await deletionDb.cancelDeletionRequest({
      userId: 'u_cancel_1',
      cancelledByType: 'self',
      nowMs: tCancelCreate + 60000,
    });
    assert.equal(cancelledReq.status, 'cancelled');
    assert.equal(cancelledReq.cancelledByType, 'self');
    assert.equal(cancelledReq.cancelledById, 'u_cancel_1');
    assert.ok(cancelledReq.cancelledAt);

    // Restrictions lifted after cancel
    assert.equal((await deletionDb.checkUserActionAllowed('u_cancel_1', 'room_create')).allowed, true);
    assert.equal(await deletionDb.isUserPublicProfileHidden('u_cancel_1'), false);

    // Can create a new request after previous one was cancelled
    const recreated = await deletionDb.createDeletionRequest({
      userId: 'u_cancel_1',
      initiatorType: 'self',
      gracePeriodDays: 14,
      nowMs: tCancelCreate + 120000,
    });
    assert.equal(recreated.status, 'scheduled');

    // Forbid cancelling processing request (reqZeroProcessing / reqImmediateProc)
    await assert.rejects(
      () =>
        deletionDb.cancelDeletionRequest({
          userId: 'u_zero_1',
          cancelledByType: 'self',
        }),
      (err: any) => err instanceof AccountDeletionError && err.code === 'CANNOT_CANCEL_PROCESSING_DELETION'
    );

    // Forbid cancelling completed request (reqDone)
    await assert.rejects(
      () =>
        deletionDb.cancelDeletionRequest({
          userId: reqDone.userId,
          requestId: reqDone.id,
          cancelledByType: 'admin',
          cancelledById: 'admin_root',
        }),
      (err: any) => err instanceof AccountDeletionError && err.code === 'CANNOT_CANCEL_COMPLETED_DELETION'
    );
    // Double check pure evaluator for terminal state
    assert.equal(evaluateAccountActionPermission('processing', 'deletion_cancel').allowed, false);
    console.log('✓ 6 & 7. Cancellation, restricted-account rules, and processing/completed cancel guards passed.');

    // -------------------------------------------------------------------------
    // TEST 8: Concurrency protection (parallel create & parallel cancel/process)
    // -------------------------------------------------------------------------
    const concurrentCreates = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        deletionDb.createDeletionRequest({
          userId: 'u_conc_1',
          initiatorType: 'self',
          gracePeriodDays: i + 1,
        })
      )
    );
    const createdCount = concurrentCreates.filter((r) => r.status === 'fulfilled').length;
    const conflictCount = concurrentCreates.filter(
      (r) =>
        r.status === 'rejected' &&
        r.reason instanceof AccountDeletionError &&
        r.reason.code === 'ACTIVE_DELETION_REQUEST_EXISTS'
    ).length;
    assert.equal(createdCount, 1, 'Exactly 1 concurrent create must succeed');
    assert.equal(conflictCount, 5, 'Remaining 5 concurrent creates must fail safely');

    const concReq = (concurrentCreates.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>).value;

    // Parallel cancel vs beginProcessing on the same due request
    const [cancelOutcome, procOutcome] = await Promise.allSettled([
      deletionDb.cancelDeletionRequest({ userId: 'u_conc_1', cancelledByType: 'self' }),
      deletionDb.beginProcessingRequest(concReq.id, { allowBeforeDue: true }),
    ]);
    const succeededOps = [cancelOutcome, procOutcome].filter((r) => r.status === 'fulfilled').length;
    assert.equal(succeededOps, 1, 'Exactly one of concurrent cancel/beginProcessing must win');
    console.log('✓ 8. Concurrency & race protection passed.');

    // -------------------------------------------------------------------------
    // TEST 10: HTTP route POST /api/admin/users/delete disabled in isolated server
    // -------------------------------------------------------------------------
    const net = await import('node:net');
    const isolatedPort: number = await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const addr = probe.address();
        const p = typeof addr === 'object' && addr ? addr.port : 0;
        probe.close(() => resolve(p));
      });
      probe.on('error', reject);
    });
    const baseUrl = `http://127.0.0.1:${isolatedPort}`;
    const localTsx = path.resolve(process.cwd(), 'node_modules/.bin/tsx');
    serverChild = spawn(localTsx, ['server.ts'], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        PORT: String(isolatedPort),
        NODE_ENV: 'production',
        LIBSQL_URL: `file:${httpDbPath}`,
        TURSO_DATABASE_URL: '',
        TURSO_AUTH_TOKEN: '',
        LIBSQL_AUTH_TOKEN: '',
      },
      stdio: 'ignore',
    });

    await waitForServerReady(baseUrl);

    // 10a. Unauthenticated request blocked with 401
    const unauthRes = await fetch(`${baseUrl}/api/admin/users/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'usr_7nmq32ex' }),
    });
    assert.equal(unauthRes.status, 401);

    // 10b. Register a temporary user and login as seeded default admin in isolated HTTP DB
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `victim_http_${stamp}@test.local`,
        password: 'password123',
        displayName: 'VictimHTTP',
      }),
    });
    const regBodyText = await regRes.text();
    assert.equal(regRes.status, 200, `Register failed (${regRes.status}): ${regBodyText}`);
    const regJson: any = JSON.parse(regBodyText);
    const victimId = regJson.user.id;

    const adminEmail = (process.env.ADMIN_EMAIL || 'vledahovic@gmail.com').trim().toLowerCase();
    const adminPass = (process.env.ADMIN_PASSWORD || '123456').trim();
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPass }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson: any = await loginRes.json();
    const adminToken = loginJson.token;
    assert.ok(adminToken);

    // 10c. Authenticated admin calling legacy delete route gets 503 and user is NOT deleted
    const delRes = await fetch(`${baseUrl}/api/admin/users/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ userId: victimId }),
    });
    assert.equal(delRes.status, 503, `Expected 503 from disabled legacy delete route, got ${delRes.status}`);
    const delJson: any = await delRes.json();
    assert.equal(delJson.code, 'ACCOUNT_DELETION_TEMPORARILY_DISABLED');

    // 10d. Other admin functions continue working and victim user still exists
    const usersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(usersRes.status, 200);
    const usersJson: any = await usersRes.json();
    assert.ok(
      Array.isArray(usersJson.users) && usersJson.users.some((u: any) => u.id === victimId),
      'Target user must still exist after calling disabled legacy delete route'
    );

    const statsRes = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(statsRes.status, 200);
    console.log('✓ 10. Legacy HTTP /api/admin/users/delete disabled (503) & other admin APIs verified.');

    console.log('\n🎉 ALL STAGE 1 ACCOUNT DELETION TESTS PASSED!');
  } finally {
    if (serverChild?.pid) {
      try {
        process.kill(-serverChild.pid, 'SIGKILL');
      } catch {
        try {
          serverChild.kill('SIGKILL');
        } catch {}
      }
    }
    cleanupSqliteFiles(unitDbPath);
    cleanupSqliteFiles(httpDbPath);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  });
