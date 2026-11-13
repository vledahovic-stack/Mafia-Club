import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import { WebSocket, WebSocketServer } from 'ws';

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
  throw new Error(`Isolated server did not become ready within ${timeoutMs}ms`);
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

async function runTests() {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const unitDbPath = path.join(os.tmpdir(), `mafia_del_stage4_unit_${stamp}.sqlite`);
  const httpDbPath = path.join(os.tmpdir(), `mafia_del_stage4_http_${stamp}.sqlite`);

  // Strictly isolate in-process DB singletons to temporary SQLite file
  process.env.LIBSQL_URL = `file:${unitDbPath}`;
  process.env.TURSO_DATABASE_URL = '';
  process.env.TURSO_AUTH_TOKEN = '';
  process.env.LIBSQL_AUTH_TOKEN = '';
  delete process.env.ENABLE_AUTOMATIC_ACCOUNT_PURGE;

  const {
    getDatabase,
    waitForDatabaseInit,
    getDatabaseConnectionInfo,
  } = await import('../server/db/database');
  const {
    userDb,
    ADMIN_EMAIL,
  } = await import('../server/db/users');
  const {
    accountDeletionDb,
    AccountDeletionError,
    MS_PER_DAY,
  } = await import('../server/db/accountDeletion');
  const {
    accountDeletionPurge,
    isAutomaticAccountPurgeEnabled,
    sanitizePurgeErrorMessage,
  } = await import('../server/db/accountDeletionPurge');
  const { clanDb } = await import('../server/db/clans');
  const { eventsDb } = await import('../server/db/events');
  const { promoDb } = await import('../server/db/promocodes');
  const { reportsDb } = await import('../server/db/reports');
  const { feedbackDb } = await import('../server/db/feedback');
  const { auditLogsDb } = await import('../server/db/auditLogs');
  const { visitorsDb } = await import('../server/db/visitors');
  const { notificationsDb } = await import('../server/db/notifications');
  const { roomManager } = await import('../server/game/roomManager');
  const { shopDb } = await import('../server/db/shop');
  const { experienceDb } = await import('../server/db/experience');
  const { dailyBonusDb } = await import('../server/db/dailyBonus');
  const { mailDb } = await import('../server/db/mail');
  const { loyaltyDb } = await import('../server/db/loyalty');
  const { premiumDb } = await import('../server/db/premium');

  let serverChild: ReturnType<typeof spawn> | null = null;
  let testWss: WebSocketServer | null = null;
  let httpServerForWs: import('http').Server | null = null;
  const openSockets: WebSocket[] = [];

  try {
    await waitForDatabaseInit();
    await shopDb.ensureSeed();
    await userDb.ensureAdminSeed();
    await experienceDb.ensureSeed();
    await dailyBonusDb.ensureSeed();
    await eventsDb.ensureSeed();
    await mailDb.ensureSeed();
    await loyaltyDb.ensureSeed();
    await premiumDb.ensureSeed();

    const db = getDatabase();
    const connInfo = getDatabaseConnectionInfo();
    assert.equal(connInfo.target.includes(unitDbPath), true, `Unexpected DB target: ${connInfo.target}`);

    const { LOYALTY_CREDITS_ITEM_ID } = await import('../server/data/items');

    const registerLocalUser = async (email: string, password: string, displayName: string) => {
      const reg = await userDb.register(email, password, displayName);
      return reg;
    };

    // =========================================================================
    // SCENARIO 18 (Part A): Scheduler strictly disabled by default
    // =========================================================================
    console.log('18A. Verifying automatic purge scheduler is strictly DISABLED by default...');
    assert.equal(isAutomaticAccountPurgeEnabled(), false);

    // =========================================================================
    // SCENARIO 1 & 21 & 22 & 2: Full physical deletion, PII absence, session invalidation, email re-registration
    // =========================================================================
    console.log('1, 2, 21, 22. Testing full physical deletion across all personal tables + re-registration...');
    const survivorEmail = `s4_survivor_${stamp}@test.local`;
    const survivor = await registerLocalUser(survivorEmail, 'PassSurv!123', 'SurvivorOne');
    const targetEmail = `s4_full_purge_${stamp}@test.local`;
    const targetName = `PurgeVictim_${stamp.slice(-4)}`;
    const targetUser = await registerLocalUser(targetEmail, 'PassVictim!123', targetName);
    const oldTargetId = targetUser.id;
    const oldTargetToken = targetUser.sessionToken!;
    const nowIso = new Date().toISOString();

    // Seed all personal tables for targetUser
    await db.execute({
      sql: `INSERT INTO email_verification_codes (id, user_id, email, code_hash, attempts_left, expires_at, created_at)
            VALUES (?, ?, ?, 'hash1', 5, ?, ?)`,
      args: [`evc_${stamp}`, oldTargetId, targetEmail, Date.now() + 600_000, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO password_reset_codes (id, user_id, email, code_hash, attempts_left, expires_at, created_at)
            VALUES (?, ?, ?, 'hash2', 5, ?, ?)`,
      args: [`prc_${stamp}`, oldTargetId, targetEmail, Date.now() + 600_000, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO ip_rate_limits (id, ip, action, created_at) VALUES (?, ?, 'account_deletion_reauth_fail', ?)`,
      args: [`iprl_${stamp}`, `127.0.0.1|${oldTargetId}`, Date.now()],
    });
    await db.execute({
      sql: `INSERT INTO user_friends (id, user_id, friend_id, status, created_at, updated_at)
            VALUES (?, ?, ?, 'accepted', ?, ?), (?, ?, ?, 'accepted', ?, ?)`,
      args: [
        `fr1_${stamp}`, oldTargetId, survivor.id, nowIso, nowIso,
        `fr2_${stamp}`, survivor.id, oldTargetId, nowIso, nowIso,
      ],
    });
    await db.execute({
      sql: `INSERT INTO user_blocks (id, user_id, blocked_user_id, created_at)
            VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
      args: [
        `blk1_${stamp}`, oldTargetId, survivor.id, nowIso,
        `blk2_${stamp}`, survivor.id, oldTargetId, nowIso,
      ],
    });
    await db.execute({
      sql: `INSERT INTO match_history (id, user_id, room_code, role, role_name, team, won, is_draw, survived, survival_seconds, rounds_survived, rating_change, credits_earned, xp_earned, played_at)
            VALUES (?, ?, 'RM01', 'citizen', 'Мирный', 'town', 1, 0, 1, 120, 3, 25, 50, 40, ?)`,
      args: [`mh_${stamp}`, oldTargetId, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO room_invites (id, from_user_id, from_user_name, to_user_id, room_code, room_name, is_private, created_at, expires_at)
            VALUES (?, ?, ?, ?, 'RM01', 'Test Room', 0, ?, ?)`,
      args: [`ri_${stamp}`, oldTargetId, targetName, survivor.id, nowIso, Date.now() + 60_000],
    });
    await notificationsDb.createNotification(survivor.id, {
      actorId: oldTargetId,
      type: 'friend_request',
      category: 'friends',
      title: 'Friend',
      message: 'Req',
    });
    await notificationsDb.createNotification(oldTargetId, {
      type: 'system',
      category: 'general',
      title: 'Welcome',
      message: 'Hi',
    });
    await db.execute({
      sql: `INSERT INTO user_premium_status (user_id, tier, activated_at, expires_at, source, updated_at)
            VALUES (?, 'gold', ?, ?, 'admin_test', ?)`,
      args: [oldTargetId, nowIso, new Date(Date.now() + 86400_000).toISOString(), nowIso],
    });
    await db.execute({
      sql: `INSERT INTO daily_bonus_claims (id, user_id, user_display_name, day, credits, claimed_at)
            VALUES (?, ?, ?, 1, 50, ?)`,
      args: [`dbc_${stamp}`, oldTargetId, targetName, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO user_task_progress (id, user_id, task_id, current_count, is_completed, is_claimed, created_at, updated_at)
            VALUES (?, ?, 't1', 1, 1, 1, ?, ?)`,
      args: [`utp_${stamp}`, oldTargetId, nowIso, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO user_personal_tasks (id, user_id, date_str, task_ids, rerolls_used, created_at, updated_at)
            VALUES (?, ?, '2026-11-13', '["t1"]', 0, ?, ?)`,
      args: [`upt_${stamp}`, oldTargetId, nowIso, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO lootbox_open_operations (operation_id, user_id, inventory_entry_id, lootbox_item_id, snapshot_hash, snapshot_version, rewards_json, response_payload_json, created_at)
            VALUES (?, ?, 'inv1', 'box1', 'hash', 1, '[]', '{}', ?)`,
      args: [`lbo_${stamp}`, oldTargetId, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO role_card_refunds (operation_key, user_id, room_code, created_at) VALUES (?, ?, 'RM01', ?)`,
      args: [`rcr_${stamp}`, oldTargetId, nowIso],
    });
    await db.execute({
      sql: `INSERT OR IGNORE INTO loyalty_bonus_claims (id, user_id, bonus_type, credits_granted, items_granted, status, claimed_at)
            VALUES (?, ?, 'email_verification', 100, '[]', 'granted', ?)`,
      args: [`lbc_${stamp}`, oldTargetId, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO campaign_claims (id, campaign_id, user_id, user_display_name, user_email, entitled_at)
            VALUES (?, 'camp_1', ?, ?, ?, ?)`,
      args: [`cc_${stamp}`, oldTargetId, targetName, targetEmail, nowIso],
    });
    await db.execute({
      sql: `INSERT OR IGNORE INTO user_daily_activity (id, user_id, date_msk, has_login, completed_matches, first_activity_at, updated_at)
            VALUES (?, ?, '2026-11-10', 1, 2, ?, ?)`,
      args: [`uda_${stamp}`, oldTargetId, nowIso, nowIso],
    });
    await feedbackDb.create({
      userId: oldTargetId,
      userEmail: targetEmail,
      userName: targetName,
      type: 'bug',
      title: 'Bug',
      description: `Bug from ${targetEmail}`,
    });
    await db.execute({
      sql: `INSERT INTO visitor_logs (id, visitor_key, session_key, is_authenticated, user_id, display_name, online_count, first_seen_at, last_seen_at, created_at)
            VALUES (?, ?, ?, 1, ?, ?, 1, ?, ?, ?)`,
      args: [`vis_${stamp}`, `vk_${stamp}`, `sk_${stamp}`, oldTargetId, targetName, nowIso, nowIso, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO admin_push_subscriptions (id, admin_user_id, admin_email, endpoint, p256dh, auth, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'k', 'a', ?, ?)`,
      args: [`aps_${stamp}`, oldTargetId, targetEmail, `https://push.test/${stamp}`, nowIso, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO economy_transactions (id, idempotency_key, user_id, operation_type, source_type, source_id, credits_delta, created_at)
            VALUES (?, ?, ?, 'grant', 'promo', 'p1', 100, ?)`,
      args: [`etx_${stamp}`, `idem_etx_${stamp}`, oldTargetId, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO mail_admin_rate_limits (id, admin_id, sent_at) VALUES (?, ?, ?)`,
      args: [`marl_${stamp}`, oldTargetId, Date.now()],
    });
    await db.execute({
      sql: `INSERT INTO mail_history (id, recipient_email, subject, body_text, status, sent_by_admin_id, sent_by_admin_email, sent_at)
            VALUES (?, ?, ?, ?, 'smtp_accepted', 'usr_7nmq32ex', ?, ?)`,
      args: [`mhst_${stamp}`, targetEmail, `Hello ${targetName}`, `Body for ${targetEmail} (${oldTargetId})`, ADMIN_EMAIL, nowIso],
    });
    await reportsDb.createReport({
      reporterId: survivor.id,
      reporterName: survivor.displayName,
      targetPlayerId: oldTargetId,
      targetPlayerName: targetName,
      targetPlayerEmail: targetEmail,
      roomCode: 'RM01',
      reason: 'Toxicity',
      reasonCategory: 'toxicity',
      details: `Target email was ${targetEmail} and id ${oldTargetId}`,
    });
    await auditLogsDb.logAction({
      actionType: 'credits_change',
      adminId: 'usr_7nmq32ex',
      adminEmail: ADMIN_EMAIL,
      adminName: 'Дон Влад',
      targetId: oldTargetId,
      targetName: targetName,
      details: `Выдано 100 кр игроку ${targetName} (${targetEmail})`,
      metadata: { targetUserId: oldTargetId, targetEmail },
    });

    // Also create a PRIOR cancelled deletion request for the SAME user to test Scenario #21 scrubbing historical rows too!
    const oldCancelledReq = await accountDeletionDb.createDeletionRequest({
      userId: oldTargetId,
      initiatorType: 'self',
      gracePeriodDays: 7,
      nowMs: Date.now() - 10_000,
    });
    await accountDeletionDb.cancelDeletionRequest({
      userId: oldTargetId,
      requestId: oldCancelledReq.id,
      cancelledByType: 'self',
      cancelledById: oldTargetId,
      nowMs: Date.now() - 5_000,
    });

    // Create active deletion request & purge
    const reqFull = await accountDeletionDb.createDeletionRequest({
      userId: oldTargetId,
      initiatorType: 'self',
      gracePeriodDays: 0,
      nowMs: Date.now(),
    });
    const purgeFullRes = await accountDeletionPurge.executeAccountPhysicalPurge({
      requestId: reqFull.id,
      nowMs: Date.now() + 100,
    });
    assert.equal(purgeFullRes.success, true);

    // Scenario 1 assertions: users + all personal tables are completely empty for oldTargetId
    const personalChecks: Array<[string, string, any[]]> = [
      ['users', 'SELECT COUNT(*) AS c FROM users WHERE id = ? OR LOWER(email) = LOWER(?)', [oldTargetId, targetEmail]],
      ['email_verification_codes', 'SELECT COUNT(*) AS c FROM email_verification_codes WHERE user_id = ? OR LOWER(email) = LOWER(?)', [oldTargetId, targetEmail]],
      ['password_reset_codes', 'SELECT COUNT(*) AS c FROM password_reset_codes WHERE user_id = ? OR LOWER(email) = LOWER(?)', [oldTargetId, targetEmail]],
      ['ip_rate_limits', 'SELECT COUNT(*) AS c FROM ip_rate_limits WHERE ip LIKE ?', [`%|${oldTargetId}`]],
      ['user_friends', 'SELECT COUNT(*) AS c FROM user_friends WHERE user_id = ? OR friend_id = ?', [oldTargetId, oldTargetId]],
      ['user_blocks', 'SELECT COUNT(*) AS c FROM user_blocks WHERE user_id = ? OR blocked_user_id = ?', [oldTargetId, oldTargetId]],
      ['match_history', 'SELECT COUNT(*) AS c FROM match_history WHERE user_id = ?', [oldTargetId]],
      ['room_invites', 'SELECT COUNT(*) AS c FROM room_invites WHERE from_user_id = ? OR to_user_id = ?', [oldTargetId, oldTargetId]],
      ['user_notifications', 'SELECT COUNT(*) AS c FROM user_notifications WHERE user_id = ? OR actor_id = ?', [oldTargetId, oldTargetId]],
      ['user_premium_status', 'SELECT COUNT(*) AS c FROM user_premium_status WHERE user_id = ?', [oldTargetId]],
      ['daily_bonus_claims', 'SELECT COUNT(*) AS c FROM daily_bonus_claims WHERE user_id = ?', [oldTargetId]],
      ['user_task_progress', 'SELECT COUNT(*) AS c FROM user_task_progress WHERE user_id = ?', [oldTargetId]],
      ['user_personal_tasks', 'SELECT COUNT(*) AS c FROM user_personal_tasks WHERE user_id = ?', [oldTargetId]],
      ['lootbox_open_operations', 'SELECT COUNT(*) AS c FROM lootbox_open_operations WHERE user_id = ?', [oldTargetId]],
      ['role_card_refunds', 'SELECT COUNT(*) AS c FROM role_card_refunds WHERE user_id = ?', [oldTargetId]],
      ['loyalty_bonus_claims', 'SELECT COUNT(*) AS c FROM loyalty_bonus_claims WHERE user_id = ?', [oldTargetId]],
      ['campaign_claims', 'SELECT COUNT(*) AS c FROM campaign_claims WHERE user_id = ?', [oldTargetId]],
      ['user_daily_activity', 'SELECT COUNT(*) AS c FROM user_daily_activity WHERE user_id = ?', [oldTargetId]],
      ['feedbacks', 'SELECT COUNT(*) AS c FROM feedbacks WHERE user_id = ?', [oldTargetId]],
      ['visitor_logs', 'SELECT COUNT(*) AS c FROM visitor_logs WHERE user_id = ?', [oldTargetId]],
      ['admin_push_subscriptions', 'SELECT COUNT(*) AS c FROM admin_push_subscriptions WHERE admin_user_id = ? OR LOWER(admin_email) = LOWER(?)', [oldTargetId, targetEmail]],
      ['economy_transactions', 'SELECT COUNT(*) AS c FROM economy_transactions WHERE user_id = ?', [oldTargetId]],
      ['mail_admin_rate_limits', 'SELECT COUNT(*) AS c FROM mail_admin_rate_limits WHERE admin_id = ?', [oldTargetId]],
    ];
    for (const [label, sql, args] of personalChecks) {
      const r = await db.execute({ sql, args });
      assert.equal(Number(r.rows[0]?.c || 0), 0, `Table ${label} still contains rows for purged user!`);
    }

    // Scenario 22 assertions: token & login rejected immediately
    assert.equal(await userDb.getUserByToken(oldTargetToken), null, 'Old sessionToken must no longer resolve');
    assert.equal(await userDb.getUserById(oldTargetId), null, 'Old userId must no longer resolve');
    await assert.rejects(() => userDb.login(targetEmail, 'PassVictim!123'), /Пользователь с таким email не найден/);

    // Scenario 21 partial check for audit_logs, reports, mail_history, account_deletion_requests
    const reqRowsCheck = await db.execute('SELECT * FROM account_deletion_requests');
    const repRowsCheck = await db.execute('SELECT * FROM reports');
    const mailRowsCheck = await db.execute('SELECT * FROM mail_history');
    const auditRowsCheck = await db.execute('SELECT * FROM audit_logs');
    for (const [tblName, rows] of [
      ['account_deletion_requests', reqRowsCheck.rows],
      ['reports', repRowsCheck.rows],
      ['mail_history', mailRowsCheck.rows],
      ['audit_logs', auditRowsCheck.rows],
    ] as const) {
      const serialized = JSON.stringify(rows);
      assert.equal(serialized.includes(oldTargetId), false, `${tblName} leaked old userId`);
      assert.equal(serialized.toLowerCase().includes(targetEmail.toLowerCase()), false, `${tblName} leaked old email`);
      assert.equal(serialized.includes(targetName), false, `${tblName} leaked old displayName`);
    }

    // Scenario 2 assertions: Re-registration with same email starts from scratch
    const reRegEmailUser = await registerLocalUser(targetEmail, 'NewPass!456', 'BrandNewName');
    assert.notEqual(reRegEmailUser.id, oldTargetId, 'Re-registered email must get a new user ID');
    assert.equal(reRegEmailUser.level, 1);
    assert.equal(reRegEmailUser.stats.gamesPlayed, 0);
    assert.equal(reRegEmailUser.isBanned, false);
    assert.equal((reRegEmailUser.credits ?? 0) <= 500, true);

    // =========================================================================
    // SCENARIO 3: Google Re-registration with same googleUid and email
    // =========================================================================
    console.log('3. Testing Google account purge & re-registration with same googleUid + email...');
    const googleEmail = `s4_google_${stamp}@test.local`;
    const fixedGoogleUid = `firebase_uid_${stamp}`;
    const googleUser1 = await userDb.syncGoogleUser(fixedGoogleUid, googleEmail, 'GooglePlayerOld');
    assert.notEqual(googleUser1.id, fixedGoogleUid, 'syncGoogleUser must NOT reuse googleUid as primary users.id');
    await db.execute({ sql: 'UPDATE users SET credits = 9999, level = 7 WHERE id = ?', args: [googleUser1.id] });
    const reqGoogle = await accountDeletionDb.createDeletionRequest({
      userId: googleUser1.id,
      initiatorType: 'self',
      gracePeriodDays: 0,
    });
    await accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqGoogle.id, allowBeforeDue: true });
    assert.equal(await userDb.getUserByToken(googleUser1.sessionToken!), null);

    // Re-register with the EXACT SAME googleUid & email
    const googleUser2 = await userDb.syncGoogleUser(fixedGoogleUid, googleEmail, 'GooglePlayerFresh');
    assert.notEqual(googleUser2.id, googleUser1.id, 'Re-registered Google user must get brand new user_ ID');
    assert.notEqual(googleUser2.id, fixedGoogleUid, 'Re-registered Google user must NOT reuse googleUid');
    assert.equal(googleUser2.credits, 0);
    assert.equal(googleUser2.level, 1);
    // Ensure original googleUid does not appear in retained rows
    const allAuditPostGoogle = JSON.stringify((await db.execute('SELECT * FROM audit_logs')).rows);
    assert.equal(allAuditPostGoogle.includes(fixedGoogleUid), false);
    assert.equal(allAuditPostGoogle.includes(googleUser1.id), false);

    // =========================================================================
    // SCENARIO 4: Main Admin Protection
    // =========================================================================
    console.log('4. Testing Main Admin deletion protection under forced/direct execution...');
    const adminRow = (await db.execute({ sql: 'SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1', args: [ADMIN_EMAIL] })).rows[0];
    assert.ok(adminRow?.id);
    const mainAdminId = String(adminRow.id);
    // Even if someone forcibly injects a due 'scheduled' row for Main Admin directly in DB:
    const forcedReqId = `adr_forced_${stamp}`;
    const pastIso = new Date(Date.now() - 86400_000).toISOString();
    await db.execute({
      sql: `INSERT INTO account_deletion_requests (
              id, user_id, initiator_type, initiated_by_admin_id, status, grace_period_days,
              created_at, grace_started_at, scheduled_purge_at, operation_token, version, updated_at
            ) VALUES (?, ?, 'admin', ?, 'scheduled', 0, ?, ?, ?, ?, 1, ?)`,
      args: [forcedReqId, mainAdminId, mainAdminId, pastIso, pastIso, pastIso, `delop_forced_${stamp}`, pastIso],
    });
    await assert.rejects(
      () => accountDeletionPurge.executeAccountPhysicalPurge({ requestId: forcedReqId, allowBeforeDue: true }),
      (err: any) => err instanceof AccountDeletionError && err.code === 'CANNOT_DELETE_MAIN_ADMIN'
    );
    const schedAdmin = await accountDeletionPurge.processDueDeletionRequests({ enableAutoPurgeOverride: true });
    assert.equal(schedAdmin.succeeded.includes(forcedReqId), false);
    assert.ok(await userDb.getUserById(mainAdminId), 'Main Admin MUST still exist in users');
    // Remove forced test row so later queries are clean
    await db.execute({ sql: 'DELETE FROM account_deletion_requests WHERE id = ?', args: [forcedReqId] });

    // =========================================================================
    // SCENARIO 5: Reject purge while in active match
    // =========================================================================
    console.log('5. Testing rejection/impossibility of purging user in active match...');
    const matchUser = await registerLocalUser(`s4_inmatch_${stamp}@test.local`, 'PassMatch!123', 'InMatchUser');
    const reqPendingMatch = await accountDeletionDb.createDeletionRequest({
      userId: matchUser.id,
      initiatorType: 'admin',
      initiatedByAdminId: mainAdminId,
      gracePeriodDays: 0,
      isInActiveMatch: true,
    });
    assert.equal(reqPendingMatch.status, 'pending_game_end');
    await assert.rejects(
      () => accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqPendingMatch.id, allowBeforeDue: true }),
      (err: any) => err instanceof AccountDeletionError && err.code === 'USER_IN_ACTIVE_MATCH'
    );
    // Transition match end, then simulate another active room in roomsSnapshot -> still blocked!
    await accountDeletionDb.transitionAfterGameEnd(matchUser.id, { requestId: reqPendingMatch.id });
    await assert.rejects(
      () =>
        accountDeletionPurge.executeAccountPhysicalPurge({
          requestId: reqPendingMatch.id,
          allowBeforeDue: true,
          roomsSnapshot: [{ roomCode: 'ACTV01', phase: 'DAY_DISCUSSION', hostId: survivor.id, players: [{ id: matchUser.id }] }],
        }),
      (err: any) => err instanceof AccountDeletionError && err.code === 'USER_IN_ACTIVE_MATCH'
    );
    assert.ok(await userDb.getUserById(matchUser.id), 'Player in active match MUST NOT be deleted');

    // =========================================================================
    // SCENARIO 6: Mutual removal of friends & blacklists for remaining users
    // =========================================================================
    console.log('6. Testing mutual friend/blacklist cleanup preserving remaining users other ties...');
    const fA = await registerLocalUser(`s4_fa_${stamp}@test.local`, 'PassFA!123', 'FriendA');
    const fB = await registerLocalUser(`s4_fb_${stamp}@test.local`, 'PassFB!123', 'FriendB');
    const fC = await registerLocalUser(`s4_fc_${stamp}@test.local`, 'PassFC!123', 'FriendC');
    const fD = await registerLocalUser(`s4_fd_${stamp}@test.local`, 'PassFD!123', 'BlockedD');
    await userDb.sendFriendRequest(fA.id, fB.id);
    await userDb.acceptFriendRequest(fB.id, fA.id);
    await userDb.sendFriendRequest(fB.id, fC.id);
    await userDb.acceptFriendRequest(fC.id, fB.id);
    await userDb.blockUser(fB.id, fA.id);
    await userDb.blockUser(fA.id, fB.id);
    await userDb.blockUser(fB.id, fD.id);

    const reqFA = await accountDeletionDb.createDeletionRequest({
      userId: fA.id,
      initiatorType: 'self',
      gracePeriodDays: 0,
    });
    await accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqFA.id, allowBeforeDue: true });

    const bFriends = await userDb.getFriends(fB.id);
    assert.equal(bFriends.some((f) => f.id === fA.id), false, 'Deleted friend must be removed');
    assert.equal(bFriends.some((f) => f.id === fC.id), true, 'Other friendships must remain');
    assert.equal(await userDb.isUserBlocked(fB.id, fA.id), false);
    assert.equal(await userDb.isUserBlocked(fB.id, fD.id), true, 'Other blocks must remain');

    // =========================================================================
    // SCENARIO 7: Clan disband when last member deleted + clan_event_progress cleanup
    // =========================================================================
    console.log('7. Testing clan disband & clan_event_progress deletion for last member...');
    const soloUser = await registerLocalUser(`s4_solo_${stamp}@test.local`, 'PassSolo!123', 'SoloLeader');
    const soloClan = await clanDb.createClan(soloUser.id, { name: `SoloClan_${stamp.slice(-4)}`, tag: `S${stamp.slice(-3)}`.toUpperCase() });
    await db.execute({
      sql: `INSERT INTO clan_event_progress (id, clan_id, event_id, total_clan_points, claimed_milestones, member_contributions, created_at, updated_at)
            VALUES (?, ?, 'ev_solo', 500, ?, ?, ?, ?)`,
      args: [`${soloClan.clan.id}_ev_solo`, soloClan.clan.id, JSON.stringify({ [soloUser.id]: [1] }), JSON.stringify({ [soloUser.id]: 500 }), nowIso, nowIso],
    });
    const reqSolo = await accountDeletionDb.createDeletionRequest({
      userId: soloUser.id,
      initiatorType: 'self',
      gracePeriodDays: 0,
    });
    const soloRes = await accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqSolo.id, allowBeforeDue: true });
    assert.equal(soloRes.clansDisbanded, 1);
    assert.equal(await clanDb.getClanById(soloClan.clan.id), null, 'Last-member clan must be disbanded');
    const soloProgRes = await db.execute({ sql: 'SELECT COUNT(*) AS c FROM clan_event_progress WHERE clan_id = ?', args: [soloClan.clan.id] });
    assert.equal(Number(soloProgRes.rows[0]?.c || 0), 0);

    // =========================================================================
    // SCENARIO 8 & 9: Deterministic leader handoff + regular member removal preserving clan stats
    // =========================================================================
    console.log('8 & 9. Testing deterministic clan leader handoff and regular member removal...');
    const clanLeader = await registerLocalUser(`s4_cl_${stamp}@test.local`, 'PassCL!123', 'ClanBoss');
    const clanMemberEarly = await registerLocalUser(`s4_cme_${stamp}@test.local`, 'PassCME!123', 'EarlyMember');
    const clanMemberLate = await registerLocalUser(`s4_cml_${stamp}@test.local`, 'PassCML!123', 'LateMember');
    const clanRegLeave = await registerLocalUser(`s4_cmr_${stamp}@test.local`, 'PassCMR!123', 'RegularMember');

    const teamClanRes = await clanDb.createClan(clanLeader.id, { name: `Syndicate_${stamp.slice(-4)}`, tag: `C${stamp.slice(-3)}`.toUpperCase() });
    const teamClanId = teamClanRes.clan.id;
    await clanDb.joinClan(clanMemberLate.id, teamClanId);
    await clanDb.joinClan(clanMemberEarly.id, teamClanId);
    await clanDb.joinClan(clanRegLeave.id, teamClanId);

    // Explicitly set deterministic joinedAt timestamps: EarlyMember joined earlier than LateMember despite array order!
    const clanAfterJoins = (await clanDb.getClanById(teamClanId))!;
    const mutatedMembers = clanAfterJoins.members.map((m) => {
      if (m.userId === clanLeader.id) return { ...m, joinedAt: '2026-01-01T00:00:00.000Z', rating: 1500 };
      if (m.userId === clanMemberLate.id) return { ...m, joinedAt: '2026-01-05T00:00:00.000Z', rating: 1300 };
      if (m.userId === clanMemberEarly.id) return { ...m, joinedAt: '2026-01-02T00:00:00.000Z', rating: 1400 };
      return { ...m, joinedAt: '2026-01-06T00:00:00.000Z', rating: 1200 };
    });
    await db.execute({ sql: 'UPDATE clans SET members = ? WHERE id = ?', args: [JSON.stringify(mutatedMembers), teamClanId] });
    await db.execute({
      sql: `INSERT INTO clan_event_progress (id, clan_id, event_id, total_clan_points, claimed_milestones, member_contributions, created_at, updated_at)
            VALUES (?, ?, 'ev_team', 900, ?, ?, ?, ?)`,
      args: [
        `${teamClanId}_ev_team`,
        teamClanId,
        JSON.stringify({ [clanLeader.id]: [1], [clanMemberEarly.id]: [1, 2], [clanRegLeave.id]: [1] }),
        JSON.stringify({ [clanLeader.id]: 300, [clanMemberEarly.id]: 400, [clanRegLeave.id]: 200 }),
        nowIso,
        nowIso,
      ],
    });

    // Scenario 9: Delete regular member first
    const reqReg = await accountDeletionDb.createDeletionRequest({
      userId: clanRegLeave.id,
      initiatorType: 'self',
      gracePeriodDays: 0,
    });
    await accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqReg.id, allowBeforeDue: true });
    const clanAfterReg = (await clanDb.getClanById(teamClanId))!;
    assert.equal(clanAfterReg.leaderId, clanLeader.id);
    assert.equal(clanAfterReg.memberCount, 3);
    assert.equal(clanAfterReg.totalRating, 1500 + 1300 + 1400);

    // Scenario 8: Delete leader -> EarlyMember MUST become leader deterministically!
    const reqBoss = await accountDeletionDb.createDeletionRequest({
      userId: clanLeader.id,
      initiatorType: 'self',
      gracePeriodDays: 0,
    });
    await accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqBoss.id, allowBeforeDue: true });
    const clanAfterBoss = (await clanDb.getClanById(teamClanId))!;
    assert.equal(clanAfterBoss.leaderId, clanMemberEarly.id, 'Earliest joined member must be promoted deterministically');
    assert.equal(clanAfterBoss.leaderName, clanMemberEarly.displayName);
    assert.equal(clanAfterBoss.memberCount, 2);
    assert.equal(clanAfterBoss.totalRating, 1300 + 1400);
    const updatedEarlyUser = (await userDb.getUserById(clanMemberEarly.id))!;
    assert.equal(updatedEarlyUser.clanRole, 'leader');

    // Verify clan_event_progress preserved total_clan_points and EarlyMember data, stripped deleted keys
    const teamProg = (await db.execute({ sql: 'SELECT * FROM clan_event_progress WHERE clan_id = ?', args: [teamClanId] })).rows[0];
    assert.equal(Number(teamProg.total_clan_points), 900);
    const teamContribs = JSON.parse(String(teamProg.member_contributions));
    const teamMilestones = JSON.parse(String(teamProg.claimed_milestones));
    assert.equal(teamContribs[clanLeader.id], undefined);
    assert.equal(teamContribs[clanRegLeave.id], undefined);
    assert.equal(teamContribs[clanMemberEarly.id], 400);
    assert.deepEqual(teamMilestones[clanMemberEarly.id], [1, 2]);

    // =========================================================================
    // SCENARIO 10: Lobby chat anonymization
    // =========================================================================
    console.log('10. Testing lobby_chat anonymization while keeping other messages intact...');
    const chatVictimEmail = `s4_chat_${stamp}@test.local`;
    const chatVictim = await registerLocalUser(chatVictimEmail, 'PassChat!123', 'ChatVictimName');
    await db.execute({
      sql: `INSERT INTO lobby_chat (id, sender_id, sender_name, text, created_at) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
      args: [
        `lc_del_${stamp}`, chatVictim.id, chatVictim.displayName, `Пишите мне на ${chatVictimEmail}!`, Date.now(),
        `lc_keep_${stamp}`, survivor.id, survivor.displayName, 'Привет всем в чате!', Date.now() + 1,
      ],
    });
    const reqChat = await accountDeletionDb.createDeletionRequest({
      userId: chatVictim.id,
      initiatorType: 'self',
      gracePeriodDays: 0,
    });
    await accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqChat.id, allowBeforeDue: true });
    const chatDelRow = (await db.execute({ sql: 'SELECT * FROM lobby_chat WHERE id = ?', args: [`lc_del_${stamp}`] })).rows[0];
    const chatKeepRow = (await db.execute({ sql: 'SELECT * FROM lobby_chat WHERE id = ?', args: [`lc_keep_${stamp}`] })).rows[0];
    assert.equal(chatDelRow.sender_id, 'deleted_player');
    assert.equal(chatDelRow.sender_name, 'Удалённый игрок');
    assert.equal(String(chatDelRow.text).includes(chatVictimEmail), false);
    assert.equal(chatKeepRow.sender_id, survivor.id);
    assert.equal(chatKeepRow.sender_name, survivor.displayName);
    assert.equal(chatKeepRow.text, 'Привет всем в чате!');

    // =========================================================================
    // SCENARIO 11 & 12: Partner program (invited player deletion + partner deletion)
    // =========================================================================
    console.log('11 & 12. Testing partner program player deletion & partner deletion...');
    const partnerOwnerEmail = `s4_partner_${stamp}@test.local`;
    const partnerOwner = await registerLocalUser(partnerOwnerEmail, 'PassPart!123', 'PartnerStar');
    const refCodeStr = `PART${stamp.slice(-4).toUpperCase()}`;
    const partnerRec = await promoDb.createPartnerWithReferralCode({
      userId: partnerOwner.id,
      note: 'VIP Partner',
      code: refCodeStr,
      playerRewards: [
        { id: 'pr1', itemId: LOYALTY_CREDITS_ITEM_ID, quantity: 100, grantMode: 'immediate', conditionLogic: 'AND', conditions: [] },
        { id: 'pr2', itemId: LOYALTY_CREDITS_ITEM_ID, quantity: 50, grantMode: 'conditional', conditionLogic: 'AND', conditions: [{ type: 'matches_completed', target: 5 }] },
      ],
      partnerRewards: [
        { id: 'ptr1', itemId: LOYALTY_CREDITS_ITEM_ID, quantity: 200, grantMode: 'immediate', conditionLogic: 'AND', conditions: [] },
      ],
      partnerRewardMode: 'on_full_completion',
      qualificationCriteria: { requiredActiveDays: 1, minMinutesPerDay: 1 },
    });

    const invitedPlayerEmail = `s4_inv_${stamp}@test.local`;
    const invitedPlayer = await registerLocalUser(invitedPlayerEmail, 'PassInv!123', 'InvitedPlayer');
    const invitedPlayer2 = await registerLocalUser(`s4_inv2_${stamp}@test.local`, 'PassInv2!123', 'InvitedPlayer2');
    await promoDb.activateCodeForUser({ userId: invitedPlayer.id, rawCode: refCodeStr, boundVia: 'profile' });
    await promoDb.activateCodeForUser({ userId: invitedPlayer2.id, rawCode: refCodeStr, boundVia: 'profile' });

    // Scenario 11: Delete invitedPlayer1 -> promo_activations scrubbed, stats preserved, user_partner_bindings deleted
    const reqInv1 = await accountDeletionDb.createDeletionRequest({
      userId: invitedPlayer.id,
      initiatorType: 'self',
      gracePeriodDays: 0,
    });
    await accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqInv1.id, allowBeforeDue: true });

    const reportAfterInvDel = await promoDb.getPartnerDetailedReport(partnerRec.id);
    assert.equal(reportAfterInvDel.activations.length, 2, 'Partner historical activations must still count both');
    const anonAct = reportAfterInvDel.activations.find((a) => a.userDeleted);
    assert.ok(anonAct);
    assert.equal(anonAct.userDisplayName.includes('Удалённый игрок'), true);
    assert.equal(anonAct.userDisplayName.includes('InvitedPlayer'), false);
    assert.notEqual(anonAct.userId, invitedPlayer.id);
    const invBindCount = await db.execute({ sql: 'SELECT COUNT(*) AS c FROM user_partner_bindings WHERE user_id = ?', args: [invitedPlayer.id] });
    assert.equal(Number(invBindCount.rows[0]?.c || 0), 0);
    const invObs = (await db.execute({ sql: `SELECT status, recipient_user_id FROM promo_reward_obligations WHERE recipient_type = 'player' AND activation_id = ?`, args: [anonAct.id] })).rows;
    assert.equal(invObs.some((o) => o.status === 'granted'), true);
    assert.equal(invObs.some((o) => o.status === 'cancelled_recipient_deleted'), true);
    assert.equal(invObs.every((o) => o.recipient_user_id !== invitedPlayer.id), true);

    // Scenario 12: Delete partnerOwner -> partner soft-deleted + scrubbed, invitedPlayer2 binding & obligations preserved!
    const reqPartner = await accountDeletionDb.createDeletionRequest({
      userId: partnerOwner.id,
      initiatorType: 'self',
      gracePeriodDays: 0,
    });
    const partnerPurgeRes = await accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqPartner.id, allowBeforeDue: true });
    assert.equal(partnerPurgeRes.wasPartner, true);

    const pRowCheck = (await db.execute({ sql: 'SELECT * FROM partners WHERE id = ?', args: [partnerRec.id] })).rows[0];
    assert.equal(Number(pRowCheck.is_deleted), 1);
    assert.equal(Number(pRowCheck.is_enabled), 0);
    assert.notEqual(pRowCheck.user_id, partnerOwner.id);
    assert.equal(pRowCheck.display_name_snapshot, 'Удалённый игрок');
    assert.equal(pRowCheck.email_snapshot, '');

    const inv2Binding = (await db.execute({ sql: 'SELECT * FROM user_partner_bindings WHERE user_id = ?', args: [invitedPlayer2.id] })).rows[0];
    assert.ok(inv2Binding, 'Invited player2 permanent binding must still remain after partner deletion');
    assert.notEqual(inv2Binding.partner_user_id, partnerOwner.id);
    const inv2PlayerObs = (await db.execute({ sql: `SELECT status FROM promo_reward_obligations WHERE user_id = ? AND recipient_type = 'player'`, args: [invitedPlayer2.id] })).rows;
    assert.equal(inv2PlayerObs.some((o) => o.status === 'pending'), true, 'Invited player2 pending obligations must stay intact');

    // =========================================================================
    // SCENARIO 13, 14, 15: Scheduler N-day vs not-due, 0-day immediate, cancelled never purged
    // =========================================================================
    console.log('13, 14, 15. Testing scheduler N-day due, not-yet-due skip, 0-day immediate, and cancelled skip...');
    const tBase = Date.now();
    const uDueN = await registerLocalUser(`s4_duen_${stamp}@test.local`, 'PassDueN!123', 'DueNUser');
    const uFutureN = await registerLocalUser(`s4_futn_${stamp}@test.local`, 'PassFutN!123', 'FutureNUser');
    const uZeroImm = await registerLocalUser(`s4_zero_${stamp}@test.local`, 'PassZero!123', 'ZeroUser');
    const uCancelled = await registerLocalUser(`s4_canc_${stamp}@test.local`, 'PassCanc!123', 'CancelledUser');

    const reqDueN = await accountDeletionDb.createDeletionRequest({ userId: uDueN.id, initiatorType: 'self', gracePeriodDays: 3, nowMs: tBase });
    const reqFutureN = await accountDeletionDb.createDeletionRequest({ userId: uFutureN.id, initiatorType: 'self', gracePeriodDays: 10, nowMs: tBase });
    const reqZeroImm = await accountDeletionDb.createDeletionRequest({ userId: uZeroImm.id, initiatorType: 'self', gracePeriodDays: 0, nowMs: tBase + 3 * MS_PER_DAY });
    const reqCancelled = await accountDeletionDb.createDeletionRequest({ userId: uCancelled.id, initiatorType: 'self', gracePeriodDays: 1, nowMs: tBase });
    await accountDeletionDb.cancelDeletionRequest({ userId: uCancelled.id, requestId: reqCancelled.id, cancelledByType: 'self', cancelledById: uCancelled.id, nowMs: tBase + 1000 });

    // Confirm default disabled run does nothing:
    const disabledSweep = await accountDeletionPurge.processDueDeletionRequests({ nowMs: tBase + 4 * MS_PER_DAY });
    assert.equal(disabledSweep.enabled, false);
    assert.equal(disabledSweep.succeeded.length, 0);
    assert.ok(await userDb.getUserById(uDueN.id));

    // Now run scheduler with explicit test override at tBase + 4 days:
    const sweepRes = await accountDeletionPurge.processDueDeletionRequests({
      nowMs: tBase + 4 * MS_PER_DAY,
      enableAutoPurgeOverride: true,
    });
    assert.equal(sweepRes.enabled, true);
    assert.equal(sweepRes.succeeded.includes(reqDueN.id), true, '3-day due request must be purged at +4 days');
    assert.equal(sweepRes.succeeded.includes(reqZeroImm.id), true, '0-day immediate request must be purged');
    assert.equal(sweepRes.succeeded.includes(reqFutureN.id), false, '10-day request must NOT be purged at +4 days');
    assert.equal(sweepRes.succeeded.includes(reqCancelled.id), false, 'Cancelled request must NEVER be purged');
    assert.equal(await userDb.getUserById(uDueN.id), null);
    assert.equal(await userDb.getUserById(uZeroImm.id), null);
    assert.ok(await userDb.getUserById(uFutureN.id), 'Not-yet-due user must stay alive');
    assert.ok(await userDb.getUserById(uCancelled.id), 'Cancelled user must stay alive');

    // =========================================================================
    // SCENARIO 16: Multi-worker / concurrent execution safety (strictly 1 winner)
    // =========================================================================
    console.log('16. Testing concurrent purge race safety (CAS single-winner)...');
    const concUser = await registerLocalUser(`s4_conc_${stamp}@test.local`, 'PassConc!123', 'ConcUser');
    const reqConc = await accountDeletionDb.createDeletionRequest({
      userId: concUser.id,
      initiatorType: 'self',
      gracePeriodDays: 0,
    });
    const concOutcomes = await Promise.allSettled([
      accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqConc.id, allowBeforeDue: true }),
      accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqConc.id, allowBeforeDue: true }),
      accountDeletionPurge.executeAccountPhysicalPurge({ requestId: reqConc.id, allowBeforeDue: true }),
    ]);
    const concFulfilled = concOutcomes.filter((r) => r.status === 'fulfilled');
    const concRejected = concOutcomes.filter((r) => r.status === 'rejected');
    assert.equal(concFulfilled.length, 1, 'Exactly ONE concurrent worker must succeed');
    assert.equal(concRejected.length, 2, 'Duplicate concurrent workers must fail cleanly');
    assert.equal(await userDb.getUserById(concUser.id), null);

    // =========================================================================
    // SCENARIO 19 & 17: Transaction Atomicity / Rollback + Stalled Processing Recovery & Error Sanitization
    // =========================================================================
    console.log('19 & 17. Testing mid-TX rollback atomicity, sanitized last_error, and stalled processing recovery...');
    const rollbackUserEmail = `s4_rb_${stamp}@test.local`;
    const rollbackUser = await registerLocalUser(rollbackUserEmail, 'PassRB!123', 'RollbackVictim');
    await db.execute({
      sql: `INSERT INTO user_friends (id, user_id, friend_id, status, created_at, updated_at) VALUES (?, ?, ?, 'accepted', ?, ?)`,
      args: [`fr_rb_${stamp}`, rollbackUser.id, survivor.id, nowIso, nowIso],
    });
    await db.execute({
      sql: `INSERT INTO match_history (id, user_id, room_code, role, role_name, team, won, is_draw, survived, survival_seconds, rounds_survived, rating_change, credits_earned, xp_earned, played_at)
            VALUES (?, ?, 'RM99', 'mafia', 'Мафия', 'mafia', 1, 0, 1, 100, 2, 15, 30, 20, ?)`,
      args: [`mh_rb_${stamp}`, rollbackUser.id, nowIso],
    });

    // Verify sanitizePurgeErrorMessage redacts all PII
    const redactedErr = sanitizePurgeErrorMessage(
      new Error(`DB fail for ${rollbackUserEmail} (${rollbackUser.id}) aka RollbackVictim`),
      { userId: rollbackUser.id, email: rollbackUserEmail, displayName: 'RollbackVictim' }
    );
    assert.equal(redactedErr.includes(rollbackUserEmail), false);
    assert.equal(redactedErr.includes(rollbackUser.id), false);
    assert.equal(redactedErr.includes('RollbackVictim'), false);

    const reqRb = await accountDeletionDb.createDeletionRequest({
      userId: rollbackUser.id,
      initiatorType: 'self',
      gracePeriodDays: 0,
    });

    // Simulate failure right before DELETE FROM users (Scenario 19)
    await assert.rejects(() =>
      accountDeletionPurge.executeAccountPhysicalPurge({
        requestId: reqRb.id,
        allowBeforeDue: true,
        simulateTxFailurePoint: 'before_users_delete',
      })
    );

    // Verify ZERO partial deletions occurred!
    assert.ok(await userDb.getUserById(rollbackUser.id), 'User MUST remain after rolled-back TX');
    assert.equal(
      Number((await db.execute({ sql: 'SELECT COUNT(*) AS c FROM user_friends WHERE user_id = ?', args: [rollbackUser.id] })).rows[0]?.c || 0),
      1,
      'user_friends MUST roll back cleanly'
    );
    assert.equal(
      Number((await db.execute({ sql: 'SELECT COUNT(*) AS c FROM match_history WHERE user_id = ?', args: [rollbackUser.id] })).rows[0]?.c || 0),
      1,
      'match_history MUST roll back cleanly'
    );

    const stalledRow = await accountDeletionDb.getRequestById(reqRb.id);
    assert.equal(stalledRow?.status, 'processing', 'Request stays in processing for recovery after failure');
    assert.equal(stalledRow?.retryCount, 1);
    assert.ok(stalledRow?.lastError);
    assert.ok(stalledRow?.nextRetryAt);
    assert.equal(stalledRow!.lastError!.includes(rollbackUserEmail), false);
    assert.equal(stalledRow!.lastError!.includes(rollbackUser.id), false);

    // Scenario 17: Simulate restart recovery once backoff window elapses
    const futureRecoveryMs = Date.parse(stalledRow!.nextRetryAt!) + 1000;
    const recoverySweep = await accountDeletionPurge.processDueDeletionRequests({
      nowMs: futureRecoveryMs,
      enableAutoPurgeOverride: true,
    });
    assert.equal(recoverySweep.succeeded.includes(reqRb.id), true, 'Stalled processing request must recover and finish cleanly');
    assert.equal(await userDb.getUserById(rollbackUser.id), null);

    // =========================================================================
    // SCENARIO 20: Post-commit WS / RoomManager / Visitors cleanup OUTSIDE SQL TX + retryability
    // =========================================================================
    console.log('20. Testing post-commit WS disconnect, RoomManager LOBBY/spectator cleanup & retry queue...');
    const wsUser = await registerLocalUser(`s4_ws_${stamp}@test.local`, 'PassWS!123', 'WsCleanupUser');
    const wsHost = await registerLocalUser(`s4_wsh_${stamp}@test.local`, 'PassWSH!123', 'WsHostUser');

    // Setup real WS server + client socket for wsUser
    httpServerForWs = (await import('node:http')).createServer();
    testWss = new WebSocketServer({ server: httpServerForWs });
    const wsPort = await getFreePort();
    await new Promise<void>((res) => httpServerForWs!.listen(wsPort, '127.0.0.1', () => res()));

    const serverSideSockets = new Map<string, Set<WebSocket>>();
    testWss.on('connection', (sock, req) => {
      const uid = new URL(req.url || '/', 'http://127.0.0.1').searchParams.get('uid') || '';
      if (!serverSideSockets.has(uid)) serverSideSockets.set(uid, new Set());
      serverSideSockets.get(uid)!.add(sock);
    });

    const clientWs = new WebSocket(`ws://127.0.0.1:${wsPort}/?uid=${encodeURIComponent(wsUser.id)}`);
    openSockets.push(clientWs);
    await new Promise<void>((res, rej) => {
      clientWs.on('open', () => res());
      clientWs.on('error', rej);
    });
    // Ensure server side registered the socket
    await new Promise((r) => setTimeout(r, 80));

    const clientEvents: Array<{ type: string; payload: any }> = [];
    const clientClosePromise = new Promise<{ code: number }>((res) => {
      clientWs.on('message', (buf) => {
        try {
          clientEvents.push(JSON.parse(buf.toString()));
        } catch {}
      });
      clientWs.on('close', (code) => res({ code }));
    });

    // Put wsUser in LOBBY room as seated player and in another room as spectator
    const lobbyRoom = roomManager.createRoom('Cleanup Lobby', wsHost.id, wsHost.displayName, { isPublic: true }, true);
    lobbyRoom.state.players.push({
      id: wsUser.id,
      name: wsUser.displayName,
      avatarSeed: wsUser.displayName,
      isHost: false,
      isBot: false,
      isRegistered: true,
      isAlive: true,
      connected: true,
      ready: true,
      warningsCount: 0,
    });
    const specRoom = roomManager.createRoom('Spec Lobby', wsHost.id, wsHost.displayName, { isPublic: true }, true);
    specRoom.addSpectator({
      id: wsUser.id,
      name: wsUser.displayName,
      avatarSeed: wsUser.displayName,
      isRegistered: true,
      joinedAt: Date.now(),
    });

    // Record visitor mapping for wsUser
    await visitorsDb.recordVisitorActivity({
      visitorKey: `vk_ws_${stamp}`,
      userToken: wsUser.sessionToken!,
      baseOnlineCount: 1,
    });

    // Register runtime hooks (simulating server.ts wiring)
    accountDeletionPurge.registerRuntimeHooks({
      getRoomsSnapshot: () => roomManager.getAllRoomsDetailed(),
      closeUserSessions: (uid) => {
        const set = serverSideSockets.get(uid);
        if (!set) return;
        set.forEach((s) => {
          if (s.readyState === WebSocket.OPEN) {
            s.send(JSON.stringify({ type: 'AUTH_REVOKED', payload: { code: 'ACCOUNT_DELETED' } }));
            s.close(4001, 'Account deleted');
          }
        });
        serverSideSockets.delete(uid);
      },
      cleanupUserFromRooms: (uid) => {
        roomManager.cleanupDeletedUser(uid);
      },
      cleanupVisitorPresence: (uid) => {
        visitorsDb.removeUserMapping(uid);
      },
    });

    const reqWs = await accountDeletionDb.createDeletionRequest({
      userId: wsUser.id,
      initiatorType: 'self',
      gracePeriodDays: 0,
    });

    // First simulate transient post-commit error in custom hook -> DB TX stays committed cleanly!
    const resPostFail = await accountDeletionPurge.executeAccountPhysicalPurge({
      requestId: reqWs.id,
      allowBeforeDue: true,
      postCommitHook: () => {
        throw new Error('Transient WS cleanup failure');
      },
    });
    assert.equal(resPostFail.success, true);
    assert.equal(resPostFail.postCommitSuccess, false);
    assert.equal(await userDb.getUserById(wsUser.id), null, 'Committed DB delete must persist despite post-commit failure');
    assert.equal(accountDeletionPurge.getPendingPostCommitCleanupUserIds().includes(wsUser.id), true);

    // Retry pending post-commit cleanup -> disconnects WS, clears LOBBY seat + spectator, clears visitor mapping!
    const flushRes = await accountDeletionPurge.flushPendingPostCommitCleanups();
    assert.equal(flushRes.succeeded.includes(wsUser.id), true);
    assert.equal(accountDeletionPurge.getPendingPostCommitCleanupUserIds().length, 0);

    const closeEv = await clientClosePromise;
    assert.equal(closeEv.code, 4001);
    assert.equal(clientEvents.some((e) => e.type === 'AUTH_REVOKED' && e.payload?.code === 'ACCOUNT_DELETED'), true);
    assert.equal(lobbyRoom.state.players.some((p) => p.id === wsUser.id), false, 'Removed from LOBBY room');
    assert.equal(specRoom.isSpectator(wsUser.id), false, 'Removed from spectator list');
    assert.equal(visitorsDb.consumeLoggedOutUserForVisitorKey(`vk_ws_${stamp}`), null, 'Visitor mapping cleared');

    lobbyRoom.closeRoom('Test cleanup');
    specRoom.closeRoom('Test cleanup');

    // =========================================================================
    // SCENARIO 18 (Part B): Live isolated server HTTP checks (auto-purge off + /api/admin/users/delete returns 503)
    // =========================================================================
    console.log('18B. Verifying live server HTTP safety flags (physicalDeletionEnabled: false, legacy delete 503)...');
    const httpPort = await getFreePort();
    const baseUrl = `http://127.0.0.1:${httpPort}`;
    const localTsx = path.resolve(process.cwd(), 'node_modules/.bin/tsx');
    serverChild = spawn(localTsx, ['server.ts'], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        PORT: String(httpPort),
        NODE_ENV: 'production',
        LIBSQL_URL: `file:${httpDbPath}`,
        TURSO_DATABASE_URL: '',
        TURSO_AUTH_TOKEN: '',
        LIBSQL_AUTH_TOKEN: '',
        ENABLE_AUTOMATIC_ACCOUNT_PURGE: '',
      },
      stdio: 'ignore',
    });
    await waitForServerReady(baseUrl);

    const httpDb = createClient({ url: `file:${httpDbPath}` });
    await httpDb.execute({ sql: "DELETE FROM ip_rate_limits WHERE action = 'register'" });
    const regHttp = await jsonFetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `s4_http_${stamp}@test.local`, password: 'PassHttp!123', displayName: 'HttpSafeUser' }),
    });
    assert.equal(regHttp.status, 200);
    const httpStatusRes = await jsonFetch(`${baseUrl}/api/account/deletion-status`, {
      headers: { Authorization: `Bearer ${regHttp.data.token}` },
    });
    assert.equal(httpStatusRes.status, 200);
    assert.equal(httpStatusRes.data.physicalDeletionEnabled, false, 'Live server MUST report physicalDeletionEnabled: false by default');

    const mainAdminEmail = (process.env.ADMIN_EMAIL || 'vledahovic@gmail.com').trim().toLowerCase();
    const mainAdminPassword = (process.env.ADMIN_PASSWORD || '123456').trim();
    const adminHttpLogin = await jsonFetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mainAdminEmail, password: mainAdminPassword }),
    });
    assert.equal(adminHttpLogin.status, 200);
    const legacyDeleteRes = await jsonFetch(`${baseUrl}/api/admin/users/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminHttpLogin.data.token}` },
      body: JSON.stringify({ userId: regHttp.data.user.id }),
    });
    assert.equal(legacyDeleteRes.status, 503);

    // Final global PII audit across ALL retained anonymized rows in unitDbPath
    const finalAnonChecks = [
      ...(await db.execute('SELECT * FROM account_deletion_requests')).rows,
      ...(await db.execute('SELECT * FROM promo_activations')).rows,
      ...(await db.execute('SELECT * FROM promo_reward_obligations')).rows,
      ...(await db.execute('SELECT * FROM lobby_chat')).rows,
      ...(await db.execute('SELECT * FROM audit_logs')).rows,
      ...(await db.execute('SELECT * FROM reports')).rows,
      ...(await db.execute('SELECT * FROM mail_history')).rows,
    ];
    const finalSerialized = JSON.stringify(finalAnonChecks);
    for (const secret of [
      oldTargetId,
      targetEmail,
      targetName,
      googleUser1.id,
      googleEmail,
      fixedGoogleUid,
      fA.id,
      soloUser.id,
      clanLeader.id,
      clanRegLeave.id,
      chatVictim.id,
      chatVictimEmail,
      invitedPlayer.id,
      invitedPlayerEmail,
      partnerOwner.id,
      partnerOwnerEmail,
      uDueN.id,
      uZeroImm.id,
      concUser.id,
      rollbackUser.id,
      rollbackUserEmail,
      wsUser.id,
    ]) {
      assert.equal(finalSerialized.includes(secret), false, `Retained anonymized table leaked identifier/PII: ${secret}`);
    }

    console.log('✅ All 22 Stage 4 account deletion & anonymization tests PASSED cleanly!');
  } finally {
    for (const sock of openSockets) {
      try { sock.terminate(); } catch {}
    }
    try { testWss?.close(); } catch {}
    try { httpServerForWs?.close(); } catch {}
    if (serverChild?.pid) {
      try { process.kill(-serverChild.pid, 'SIGKILL'); } catch {}
      try { serverChild.kill('SIGKILL'); } catch {}
    }
    cleanupSqliteFiles(unitDbPath);
    cleanupSqliteFiles(httpDbPath);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Stage 4 verification failed:', err);
    process.exit(1);
  });
