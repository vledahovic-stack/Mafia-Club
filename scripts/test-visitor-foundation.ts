import { waitForDatabaseInit, execute, query, queryOne } from '../server/db/database.js';
import { visitorsDb, VisitorLogRecord, VISITOR_ACTIVITY_WINDOW_MS } from '../server/db/visitors.js';
import { userDb } from '../server/db/users.js';

async function runTests() {
  console.log('🚀 Running Visitor Notifications & Logs Foundation Tests (Phase 1)...\n');

  await waitForDatabaseInit();

  // Clean test slate for visitor_logs
  await execute("DELETE FROM visitor_logs WHERE visitor_key LIKE 'test_vis_%'");

  // Ensure test registered user exists
  const testUserId = 'test_usr_alex_phase1';
  const testUserEmail = 'alex.test@example.com';
  const existingUser = await userDb.getUserById(testUserId);
  if (!existingUser) {
    const nowIso = new Date().toISOString();
    await execute(
      `INSERT OR IGNORE INTO users (
        id, email, display_name, avatar_seed, credits, xp, level, role, is_admin, is_banned,
        daily_bonus_streak, is_email_verified, stats, inventory, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testUserId,
        testUserEmail,
        'Алекс Смирнов',
        'Алекс Смирнов',
        1000,
        500,
        2,
        'user',
        0,
        0,
        1,
        1,
        JSON.stringify({ gamesPlayed: 5, gamesWon: 2 }),
        JSON.stringify([]),
        nowIso,
        nowIso
      ]
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Register First Visit
  // ---------------------------------------------------------------------------
  console.log('--- Test 1: Register First Visit ---');
  const res1 = await visitorsDb.recordVisitorActivity({
    visitorKey: 'test_vis_1',
    sessionKey: 'ses_1',
    deviceSummary: 'Chrome / Linux',
    baseOnlineCount: 3
  });

  if (!res1.isNewVisit || res1.status !== 'new_visit' || !res1.shouldNotifyPush) {
    throw new Error(`FAIL: Expected res1 to be new_visit, got ${JSON.stringify(res1)}`);
  }
  if (!res1.visitRecord || res1.visitRecord.displayName !== 'Гость' || res1.visitRecord.isAuthenticated) {
    throw new Error(`FAIL: Expected guest record, got ${JSON.stringify(res1.visitRecord)}`);
  }
  console.log('✓ PASS: First visit registered as new_visit with guest identity and push enabled');

  // ---------------------------------------------------------------------------
  // TEST 2: Page Refresh (Within 30 minutes)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: Page Refresh (Within 30 minutes) ---');
  const res2 = await visitorsDb.recordVisitorActivity({
    visitorKey: 'test_vis_1',
    sessionKey: 'ses_1',
    deviceSummary: 'Chrome / Linux',
    baseOnlineCount: 4
  });

  if (res2.isNewVisit || res2.status !== 'session_updated' || res2.shouldNotifyPush) {
    throw new Error(`FAIL: Expected page refresh to update session without new visit, got ${JSON.stringify(res2)}`);
  }
  if (res2.visitRecord?.id !== res1.visitRecord?.id) {
    throw new Error(`FAIL: Expected same record id, got ${res2.visitRecord?.id} vs ${res1.visitRecord?.id}`);
  }
  const rowsVis1 = await query('SELECT * FROM visitor_logs WHERE visitor_key = ?', ['test_vis_1']);
  if (rowsVis1.length !== 1) {
    throw new Error(`FAIL: Expected 1 record for test_vis_1, found ${rowsVis1.length}`);
  }
  console.log('✓ PASS: Page refresh updated last_seen_at without creating a duplicate record');

  // ---------------------------------------------------------------------------
  // TEST 3: Multiple Tabs in Same Browser
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Multiple Tabs in Same Browser ---');
  const res3 = await visitorsDb.recordVisitorActivity({
    visitorKey: 'test_vis_1',
    sessionKey: 'ses_tab_2',
    deviceSummary: 'Chrome / Linux',
    baseOnlineCount: 4
  });

  if (res3.isNewVisit || res3.status !== 'session_updated') {
    throw new Error(`FAIL: Expected multiple tabs with same visitorKey to reuse session, got ${JSON.stringify(res3)}`);
  }
  const rowsVis1AfterTab = await query('SELECT * FROM visitor_logs WHERE visitor_key = ?', ['test_vis_1']);
  if (rowsVis1AfterTab.length !== 1) {
    throw new Error(`FAIL: Expected still 1 record after tab 2, found ${rowsVis1AfterTab.length}`);
  }
  console.log('✓ PASS: Multiple tabs sharing same visitorKey do not duplicate visits');

  // ---------------------------------------------------------------------------
  // TEST 4: Two Independent Guest Browsers
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: Two Independent Guest Browsers ---');
  const res4 = await visitorsDb.recordVisitorActivity({
    visitorKey: 'test_vis_2',
    sessionKey: 'ses_guest_2',
    deviceSummary: 'Safari / iOS',
    baseOnlineCount: 5
  });

  if (!res4.isNewVisit || res4.status !== 'new_visit') {
    throw new Error(`FAIL: Expected independent guest 2 to register as new_visit, got ${JSON.stringify(res4)}`);
  }
  if (res4.visitRecord?.visitorKey !== 'test_vis_2') {
    throw new Error(`FAIL: Expected visitorKey test_vis_2, got ${res4.visitRecord?.visitorKey}`);
  }
  const distinctGuests = await query("SELECT DISTINCT visitor_key FROM visitor_logs WHERE visitor_key IN ('test_vis_1', 'test_vis_2')");
  if (distinctGuests.length !== 2) {
    throw new Error(`FAIL: Expected 2 distinct guest keys, found ${distinctGuests.length}`);
  }
  console.log('✓ PASS: Independent guests are recorded separately and never merged');

  // ---------------------------------------------------------------------------
  // TEST 5: Authenticated User
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: Authenticated User ---');
  const res5 = await visitorsDb.recordVisitorActivity({
    visitorKey: 'test_vis_alex',
    sessionKey: 'ses_alex',
    userId: testUserId,
    userEmail: testUserEmail,
    deviceSummary: 'Firefox / Windows',
    baseOnlineCount: 5
  });

  if (!res5.isNewVisit || !res5.visitRecord?.isAuthenticated || res5.visitRecord.userId !== testUserId) {
    throw new Error(`FAIL: Expected verified authenticated user, got ${JSON.stringify(res5)}`);
  }
  if (res5.visitRecord.displayName !== 'Алекс Смирнов') {
    throw new Error(`FAIL: Expected displayName 'Алекс Смирнов', got '${res5.visitRecord.displayName}'`);
  }
  console.log('✓ PASS: Authenticated user correctly resolved with server-side identity and username');

  // ---------------------------------------------------------------------------
  // TEST 6: Exclusion of Main Administrator
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 6: Exclusion of Main Administrator (vledahovic@gmail.com) ---');
  const resAdmin = await visitorsDb.recordVisitorActivity({
    visitorKey: 'test_vis_admin',
    sessionKey: 'ses_admin',
    userEmail: 'vledahovic@gmail.com',
    deviceSummary: 'Mobile Safari / iOS'
  });

  if (resAdmin.status !== 'ignored_admin' || resAdmin.isNewVisit || resAdmin.shouldNotifyPush || resAdmin.visitRecord !== null) {
    throw new Error(`FAIL: Expected main admin to be completely ignored, got ${JSON.stringify(resAdmin)}`);
  }
  const adminRecords = await query('SELECT * FROM visitor_logs WHERE visitor_key = ?', ['test_vis_admin']);
  if (adminRecords.length !== 0) {
    throw new Error(`FAIL: Main admin visit was written to visitor_logs! Found ${adminRecords.length} rows`);
  }
  console.log('✓ PASS: Main Administrator visits are strictly ignored (no DB log, no push trigger)');

  // ---------------------------------------------------------------------------
  // TEST 7: 30-Minute Inactivity Window Expiry
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 7: 30-Minute Inactivity Window Expiry ---');
  // Backdate test_vis_1's last_seen_at to 35 minutes ago
  const expiredTime = new Date(Date.now() - 35 * 60 * 1000).toISOString();
  await execute('UPDATE visitor_logs SET last_seen_at = ? WHERE visitor_key = ?', [expiredTime, 'test_vis_1']);

  const res7 = await visitorsDb.recordVisitorActivity({
    visitorKey: 'test_vis_1',
    sessionKey: 'ses_1_new_window',
    deviceSummary: 'Chrome / Linux',
    baseOnlineCount: 2
  });

  if (!res7.isNewVisit || res7.status !== 'new_visit' || !res7.shouldNotifyPush) {
    throw new Error(`FAIL: Expected new visit after 30-minute window expired, got ${JSON.stringify(res7)}`);
  }
  const rowsVis1AfterExpiry = await query('SELECT * FROM visitor_logs WHERE visitor_key = ?', ['test_vis_1']);
  if (rowsVis1AfterExpiry.length !== 2) {
    throw new Error(`FAIL: Expected 2 separate visit records for test_vis_1 after window expiry, found ${rowsVis1AfterExpiry.length}`);
  }
  console.log('✓ PASS: After 30 minutes of inactivity, a new visit is initiated cleanly');

  // ---------------------------------------------------------------------------
  // TEST 8: Concurrent Requests (Atomic Serialization)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 8: Concurrent Requests (Atomic Serialization) ---');
  const concurrentKey = 'test_vis_concurrent';
  const promises = Array.from({ length: 8 }).map((_, i) =>
    visitorsDb.recordVisitorActivity({
      visitorKey: concurrentKey,
      sessionKey: `ses_conc_${i}`,
      deviceSummary: 'Edge / Windows',
      baseOnlineCount: 3
    })
  );

  const results = await Promise.all(promises);
  const newVisitCount = results.filter(r => r.isNewVisit && r.status === 'new_visit').length;
  const sessionUpdatedCount = results.filter(r => !r.isNewVisit && r.status === 'session_updated').length;

  if (newVisitCount !== 1) {
    throw new Error(`FAIL: Expected exactly 1 new_visit among concurrent requests, got ${newVisitCount}`);
  }
  if (sessionUpdatedCount !== 7) {
    throw new Error(`FAIL: Expected 7 session_updated among concurrent requests, got ${sessionUpdatedCount}`);
  }
  const concurrentRows = await query('SELECT * FROM visitor_logs WHERE visitor_key = ?', [concurrentKey]);
  if (concurrentRows.length !== 1) {
    throw new Error(`FAIL: Expected exactly 1 row in DB for concurrent visitor, found ${concurrentRows.length}`);
  }
  console.log('✓ PASS: Concurrent requests handled atomically: 1 new_visit, 7 session_updated, 0 duplicates');

  // ---------------------------------------------------------------------------
  // TEST 9 & 10: Automatic 7-Day Cleanup and Retention of Recent Logs
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 9 & 10: Automatic 7-Day Cleanup ---');
  const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8 days old
  const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days old

  await execute(
    `INSERT INTO visitor_logs (
      id, visitor_key, session_key, is_authenticated, user_id, display_name,
      online_count, device_summary, first_seen_at, last_seen_at, created_at
    ) VALUES (?, ?, ?, 0, NULL, 'Гость', 1, 'Test', ?, ?, ?)`,
    ['vis_old_8d', 'test_vis_old', 'ses_old', oldDate, oldDate, oldDate]
  );

  await execute(
    `INSERT INTO visitor_logs (
      id, visitor_key, session_key, is_authenticated, user_id, display_name,
      online_count, device_summary, first_seen_at, last_seen_at, created_at
    ) VALUES (?, ?, ?, 0, NULL, 'Гость', 1, 'Test', ?, ?, ?)`,
    ['vis_recent_2d', 'test_vis_recent', 'ses_rec', recentDate, recentDate, recentDate]
  );

  const cleanupRes = await visitorsDb.cleanupOldVisitorLogs(7);
  if (cleanupRes.deletedCount < 1) {
    throw new Error(`FAIL: Expected cleanup to delete at least 1 record, got ${cleanupRes.deletedCount}`);
  }

  const oldCheck = await queryOne("SELECT id FROM visitor_logs WHERE id = 'vis_old_8d'");
  if (oldCheck) {
    throw new Error('FAIL: Record older than 7 days was NOT deleted!');
  }
  const recentCheck = await queryOne("SELECT id FROM visitor_logs WHERE id = 'vis_recent_2d'");
  if (!recentCheck) {
    throw new Error('FAIL: Record 2 days old was mistakenly deleted!');
  }
  console.log('✓ PASS: Records older than 7 days automatically purged, while recent logs are preserved');

  // ---------------------------------------------------------------------------
  // TEST 11 & 12: Manual Cleanup Permission Restrictions
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 11 & 12: Manual Cleanup & Strict Role Protection ---');
  // Attempt 1: Regular user
  let regularBlocked = false;
  try {
    await visitorsDb.clearVisitorLogs({
      id: 'regular_user_1',
      email: 'regular@example.com',
      displayName: 'Обычный игрок'
    });
  } catch (err: any) {
    if (err.message.includes('Доступ запрещён')) {
      regularBlocked = true;
    }
  }
  if (!regularBlocked) {
    throw new Error('FAIL: Regular user was able to clear visitor logs!');
  }

  // Attempt 2: Other administrator (not main admin)
  let subAdminBlocked = false;
  try {
    await visitorsDb.clearVisitorLogs({
      id: 'sub_admin_1',
      email: 'subadmin@example.com',
      displayName: 'Младший Модератор',
      role: 'admin',
      isAdmin: true
    });
  } catch (err: any) {
    if (err.message.includes('Доступ запрещён')) {
      subAdminBlocked = true;
    }
  }
  if (!subAdminBlocked) {
    throw new Error('FAIL: Secondary admin was able to clear visitor logs!');
  }

  // Attempt 3: Main Administrator (vledahovic@gmail.com)
  const mainAdminClearRes = await visitorsDb.clearVisitorLogs({
    id: 'usr_main_admin',
    email: 'vledahovic@gmail.com',
    displayName: 'Дон Влад'
  });

  if (mainAdminClearRes.deletedCount < 1) {
    throw new Error(`FAIL: Expected main admin clear to delete records, got ${mainAdminClearRes.deletedCount}`);
  }

  const countAfterClear = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM visitor_logs');
  if ((countAfterClear?.count || 0) !== 0) {
    throw new Error(`FAIL: visitor_logs table not empty after clear! count = ${countAfterClear?.count}`);
  }

  // Verify audit log record created
  const auditRow = await queryOne<any>(
    "SELECT * FROM audit_logs WHERE action_type = 'visitor_logs_clear' ORDER BY created_at DESC LIMIT 1"
  );
  if (!auditRow || !auditRow.admin_email.includes('vledahovic@gmail.com')) {
    throw new Error(`FAIL: Expected audit log entry for visitor_logs_clear, found ${JSON.stringify(auditRow)}`);
  }
  console.log('✓ PASS: Manual clearing strictly limited to Main Administrator, and audit_log record generated');

  // ---------------------------------------------------------------------------
  // TEST 13: Integrity Check of Unrelated Subsystems
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 13: Non-interference with Core Systems ---');
  const userCount = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  const itemsCount = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM shop_items');
  const auditLogsCount = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM audit_logs');

  if (!userCount || userCount.count < 1) throw new Error('FAIL: Users table damaged!');
  if (!itemsCount || itemsCount.count < 1) throw new Error('FAIL: Shop items damaged!');
  if (!auditLogsCount || auditLogsCount.count < 1) throw new Error('FAIL: Audit logs damaged!');

  console.log(`✓ PASS: Core subsystems 100% intact (Users: ${userCount.count}, Items: ${itemsCount.count}, AuditLogs: ${auditLogsCount.count})`);

  console.log('\n🎉 ALL 13 VISITOR FOUNDATION & LOGGING TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUNNER FAILED:', err);
  process.exit(1);
});
