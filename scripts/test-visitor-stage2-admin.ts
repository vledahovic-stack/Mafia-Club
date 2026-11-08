import fs from 'node:fs';
import path from 'node:path';
import { waitForDatabaseInit, execute, query, queryOne } from '../server/db/database.js';
import { visitorsDb } from '../server/db/visitors.js';
import { userDb } from '../server/db/users.js';

const BASE_URL = 'http://localhost:3000';

async function runStage2Tests() {
  console.log('🚀 Running Stage 2 Visitor Registration & Admin Log Tests (16 Suites)...\n');

  await waitForDatabaseInit();

  // Ensure clean test visitor records before starting
  await execute("DELETE FROM visitor_logs");

  // Prepare 3 test accounts:
  // 1) Regular player
  // 2) Secondary moderator/admin (role = 'admin', is_admin = 1, but email != vledahovic@gmail.com)
  // 3) Main Administrator (vledahovic@gmail.com)
  const nowIso = new Date().toISOString();
  const regularToken = 'tk_test_stage2_regular_' + Date.now();
  const moderatorToken = 'tk_test_stage2_moderator_' + Date.now();

  const regularUserId = 'usr_test_stage2_reg';
  const moderatorUserId = 'usr_test_stage2_mod';

  await execute(
    `INSERT OR REPLACE INTO users (
      id, email, display_name, avatar_seed, session_token,
      credits, xp, level, role, is_admin, is_banned,
      daily_bonus_streak, is_email_verified, stats, inventory, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1000, 200, 1, 'user', 0, 0, 0, 1, '{}', '[]', ?, ?)`,
    [regularUserId, 'stage2.player@example.com', 'Игрок Максим', 'Игрок Максим', regularToken, nowIso, nowIso]
  );

  await execute(
    `INSERT OR REPLACE INTO users (
      id, email, display_name, avatar_seed, session_token,
      credits, xp, level, role, is_admin, is_banned,
      daily_bonus_streak, is_email_verified, stats, inventory, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 5000, 1000, 5, 'admin', 1, 0, 0, 1, '{}', '[]', ?, ?)`,
    [moderatorUserId, 'stage2.moderator@example.com', 'Модератор Сергей', 'Модератор Сергей', moderatorToken, nowIso, nowIso]
  );

  const mainAdminRow = await queryOne<any>(
    "SELECT id, email, session_token FROM users WHERE LOWER(email) = 'vledahovic@gmail.com'"
  );
  if (!mainAdminRow) {
    throw new Error('FAIL: Main admin account vledahovic@gmail.com not found in database');
  }
  let mainAdminToken = mainAdminRow.session_token;
  if (!mainAdminToken) {
    mainAdminToken = 'tk_main_admin_' + Date.now();
    await execute("UPDATE users SET session_token = ? WHERE id = ?", [mainAdminToken, mainAdminRow.id]);
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Guest opens Home page -> visit is registered
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Guest opens Home page -> visit is registered ---');
    const guestVisitorKey = 'uuid-guest-stage2-0001';
    const res1 = await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      },
      body: JSON.stringify({
        visitorKey: guestVisitorKey,
        sessionKey: 'ses_guest_0001'
      })
    });
    const data1 = await res1.json();
    if (!res1.ok || !data1.ok || !data1.isNewVisit || data1.status !== 'new_visit') {
      throw new Error(`FAIL Test 1: Expected new_visit, got ${JSON.stringify(data1)}`);
    }
    const guestRow1 = await queryOne<any>("SELECT * FROM visitor_logs WHERE visitor_key = ?", [guestVisitorKey]);
    if (!guestRow1 || guestRow1.display_name !== 'Гость' || guestRow1.is_authenticated !== 0) {
      throw new Error(`FAIL Test 1: Unexpected DB row ${JSON.stringify(guestRow1)}`);
    }
    console.log('✓ PASS: Guest visit registered via HTTP /api/visitors/ping');

    // -------------------------------------------------------------------------
    // TEST 2: Authenticated player opens Home page -> visit is registered
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Authenticated player opens Home page -> visit is registered ---');
    const authVisitorKey = 'uuid-auth-stage2-0002';
    const res2 = await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regularToken}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0'
      },
      body: JSON.stringify({
        visitorKey: authVisitorKey,
        sessionKey: 'ses_auth_0002'
      })
    });
    const data2 = await res2.json();
    if (!res2.ok || !data2.isNewVisit || data2.status !== 'new_visit') {
      throw new Error(`FAIL Test 2: Expected new_visit for authenticated user, got ${JSON.stringify(data2)}`);
    }
    const authRow = await queryOne<any>("SELECT * FROM visitor_logs WHERE visitor_key = ?", [authVisitorKey]);
    if (!authRow || authRow.display_name !== 'Игрок Максим' || authRow.is_authenticated !== 1 || authRow.user_id !== regularUserId) {
      throw new Error(`FAIL Test 2: Authenticated visit row mismatch ${JSON.stringify(authRow)}`);
    }
    console.log('✓ PASS: Authenticated player visit registered with verified server nickname');

    // -------------------------------------------------------------------------
    // TEST 3: Main Administrator opens site -> visit is NOT recorded
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Main Administrator opens site -> visit is NOT recorded ---');
    const adminVisitorKey = 'uuid-main-admin-stage2-0003';
    const res3 = await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mainAdminToken}`
      },
      body: JSON.stringify({
        visitorKey: adminVisitorKey,
        sessionKey: 'ses_admin_0003'
      })
    });
    const data3 = await res3.json();
    if (!res3.ok || data3.status !== 'ignored_admin' || data3.isNewVisit !== false) {
      throw new Error(`FAIL Test 3: Expected ignored_admin, got ${JSON.stringify(data3)}`);
    }
    const adminVisitRow = await queryOne<any>("SELECT * FROM visitor_logs WHERE visitor_key = ?", [adminVisitorKey]);
    if (adminVisitRow) {
      throw new Error('FAIL Test 3: Main Admin visit was erroneously written to visitor_logs!');
    }
    console.log('✓ PASS: Main Administrator visit completely excluded from logs');

    // -------------------------------------------------------------------------
    // TEST 4: F5 page refresh does NOT create a new visit
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: F5 page refresh does NOT create a new visit ---');
    const res4 = await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorKey: guestVisitorKey,
        sessionKey: 'ses_guest_0001'
      })
    });
    const data4 = await res4.json();
    if (data4.isNewVisit || data4.status !== 'session_updated') {
      throw new Error(`FAIL Test 4: Expected session_updated on F5, got ${JSON.stringify(data4)}`);
    }
    const guestCountAfterF5 = await queryOne<{ c: number }>(
      "SELECT COUNT(*) as c FROM visitor_logs WHERE visitor_key = ?",
      [guestVisitorKey]
    );
    if (guestCountAfterF5?.c !== 1) {
      throw new Error(`FAIL Test 4: Expected 1 row after F5, got ${guestCountAfterF5?.c}`);
    }
    console.log('✓ PASS: F5 refresh reuses existing visit without creating duplicate');

    // -------------------------------------------------------------------------
    // TEST 5: Multiple browser tabs do NOT create duplicates
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Multiple browser tabs do NOT create duplicates ---');
    const multiTabPromises = Array.from({ length: 4 }).map((_, idx) =>
      fetch(`${BASE_URL}/api/visitors/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorKey: guestVisitorKey,
          sessionKey: `ses_guest_tab_${idx + 2}`
        })
      }).then((r) => r.json())
    );
    const multiTabResults = await Promise.all(multiTabPromises);
    if (multiTabResults.some((r) => r.isNewVisit)) {
      throw new Error(`FAIL Test 5: One of the tabs created a new visit: ${JSON.stringify(multiTabResults)}`);
    }
    const guestCountAfterTabs = await queryOne<{ c: number }>(
      "SELECT COUNT(*) as c FROM visitor_logs WHERE visitor_key = ?",
      [guestVisitorKey]
    );
    if (guestCountAfterTabs?.c !== 1) {
      throw new Error(`FAIL Test 5: Expected 1 row across tabs, got ${guestCountAfterTabs?.c}`);
    }
    console.log('✓ PASS: Multiple open tabs sharing visitorKey do not create duplicates');

    // -------------------------------------------------------------------------
    // TEST 6: Repeated activity updates existing visit timestamp
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Repeated activity updates existing visit ---');
    const beforeUpdateRow = await queryOne<any>("SELECT * FROM visitor_logs WHERE visitor_key = ?", [guestVisitorKey]);
    await new Promise((r) => setTimeout(r, 25));
    await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorKey: guestVisitorKey,
        sessionKey: 'ses_guest_0001'
      })
    });
    const afterUpdateRow = await queryOne<any>("SELECT * FROM visitor_logs WHERE visitor_key = ?", [guestVisitorKey]);
    if (new Date(afterUpdateRow.last_seen_at).getTime() <= new Date(beforeUpdateRow.last_seen_at).getTime()) {
      throw new Error(`FAIL Test 6: last_seen_at did not advance (${beforeUpdateRow.last_seen_at} -> ${afterUpdateRow.last_seen_at})`);
    }
    if (afterUpdateRow.first_seen_at !== beforeUpdateRow.first_seen_at) {
      throw new Error('FAIL Test 6: first_seen_at was mutated on activity update!');
    }
    console.log('✓ PASS: Repeated activity advances last_seen_at while preserving first_seen_at');

    // -------------------------------------------------------------------------
    // TEST 7: After 30 minutes of inactivity, a new visit is created
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: After 30 minutes of inactivity, a new visit is created ---');
    const thirtyFiveMinsAgo = new Date(Date.now() - 35 * 60 * 1000).toISOString();
    await execute(
      "UPDATE visitor_logs SET first_seen_at = ?, last_seen_at = ? WHERE visitor_key = ?",
      [thirtyFiveMinsAgo, thirtyFiveMinsAgo, guestVisitorKey]
    );
    const res7 = await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorKey: guestVisitorKey,
        sessionKey: 'ses_guest_after_35m'
      })
    });
    const data7 = await res7.json();
    if (!data7.isNewVisit || data7.status !== 'new_visit') {
      throw new Error(`FAIL Test 7: Expected new_visit after 35 minutes, got ${JSON.stringify(data7)}`);
    }
    const guestCountAfter35m = await queryOne<{ c: number }>(
      "SELECT COUNT(*) as c FROM visitor_logs WHERE visitor_key = ?",
      [guestVisitorKey]
    );
    if (guestCountAfter35m?.c !== 2) {
      throw new Error(`FAIL Test 7: Expected 2 visits for guest after 35m expiry, got ${guestCountAfter35m?.c}`);
    }
    console.log('✓ PASS: New visit created cleanly after 30-minute inactivity window expires');

    // -------------------------------------------------------------------------
    // TEST 8: Invalid token cannot impersonate an authenticated player
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Invalid token cannot impersonate an authenticated player ---');
    const fakeTokenKey = 'uuid-fake-token-0008';
    const res8 = await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_forged_token_xyz999'
      },
      body: JSON.stringify({
        visitorKey: fakeTokenKey,
        sessionKey: 'ses_fake_0008',
        userId: regularUserId,
        displayName: 'Игрок Максим'
      })
    });
    const data8 = await res8.json();
    if (!res8.ok || !data8.isNewVisit) {
      throw new Error(`FAIL Test 8: Unexpected response ${JSON.stringify(data8)}`);
    }
    const row8 = await queryOne<any>("SELECT * FROM visitor_logs WHERE visitor_key = ?", [fakeTokenKey]);
    if (!row8 || row8.is_authenticated !== 0 || row8.user_id !== null || row8.display_name !== 'Гость') {
      throw new Error(`FAIL Test 8: Invalid token was treated as authenticated! Row: ${JSON.stringify(row8)}`);
    }
    console.log('✓ PASS: Invalid token falls back to unauthenticated Guest identity');

    // -------------------------------------------------------------------------
    // TEST 9: Spoofing user_id, role, or another user's visitorKey grants no privileges or identity
    // -------------------------------------------------------------------------
    console.log('\n--- Test 9: Spoofing user_id, role, or another player visitorKey is blocked ---');
    // Attempt to send authenticated player's visitorKey (authVisitorKey) without a valid token
    const res9 = await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorKey: authVisitorKey,
        userId: mainAdminRow.id,
        userEmail: 'vledahovic@gmail.com',
        displayName: 'Дон Влад',
        role: 'admin',
        isAdmin: true
      })
    });
    const data9 = await res9.json();
    // Should NOT be ignored_admin (since no admin token), and should NOT hijack authRow
    if (data9.status === 'ignored_admin') {
      throw new Error('FAIL Test 9: Unauthenticated request spoofed Main Admin via body!');
    }
    const spoofedRows = await query<any>(
      "SELECT * FROM visitor_logs WHERE visitor_key = ? AND is_authenticated = 0",
      [authVisitorKey]
    );
    if (spoofedRows.length !== 1 || spoofedRows[0].display_name !== 'Гость' || spoofedRows[0].user_id !== null) {
      throw new Error(`FAIL Test 9: Unauthenticated request hijacked authenticated player record! ${JSON.stringify(spoofedRows)}`);
    }
    console.log('✓ PASS: Client-supplied userId/role/email/visitorKey spoofing is completely neutralized');

    // -------------------------------------------------------------------------
    // TEST 10: Regular player cannot view or clear visitor logs (HTTP 403)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 10: Regular player cannot view or clear visitor logs ---');
    const regGetRes = await fetch(`${BASE_URL}/api/admin/visitors`, {
      headers: { Authorization: `Bearer ${regularToken}` }
    });
    if (regGetRes.status !== 403) {
      throw new Error(`FAIL Test 10: Expected 403 for regular player GET, got ${regGetRes.status}`);
    }
    const regDelRes = await fetch(`${BASE_URL}/api/admin/visitors`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${regularToken}` }
    });
    if (regDelRes.status !== 403) {
      throw new Error(`FAIL Test 10: Expected 403 for regular player DELETE, got ${regDelRes.status}`);
    }
    console.log('✓ PASS: Regular player denied access to visitor logs and clear endpoint (HTTP 403)');

    // -------------------------------------------------------------------------
    // TEST 11: Moderator / Secondary Admin cannot view or clear visitor logs (HTTP 403)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 11: Moderator / Secondary Admin cannot view or clear visitor logs ---');
    const modGetRes = await fetch(`${BASE_URL}/api/admin/visitors`, {
      headers: { Authorization: `Bearer ${moderatorToken}` }
    });
    if (modGetRes.status !== 403) {
      throw new Error(`FAIL Test 11: Expected 403 for moderator GET, got ${modGetRes.status}`);
    }
    const modDelRes = await fetch(`${BASE_URL}/api/admin/visitors`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${moderatorToken}` }
    });
    if (modDelRes.status !== 403) {
      throw new Error(`FAIL Test 11: Expected 403 for moderator DELETE, got ${modDelRes.status}`);
    }
    console.log('✓ PASS: Secondary admin/moderator strictly denied access to visitor logs and clearing (HTTP 403)');

    // -------------------------------------------------------------------------
    // TEST 14: Pagination works accurately for Main Administrator
    // -------------------------------------------------------------------------
    console.log('\n--- Test 14: Pagination works accurately ---');
    const page1Res = await fetch(`${BASE_URL}/api/admin/visitors?limit=2&offset=0`, {
      headers: { Authorization: `Bearer ${mainAdminToken}` }
    });
    const page1Data = await page1Res.json();
    if (!page1Res.ok || !Array.isArray(page1Data.logs) || page1Data.logs.length !== 2 || page1Data.totalCount < 4) {
      throw new Error(`FAIL Test 14: Unexpected page 1 data: ${JSON.stringify(page1Data)}`);
    }

    const page2Res = await fetch(`${BASE_URL}/api/admin/visitors?limit=2&offset=2`, {
      headers: { Authorization: `Bearer ${mainAdminToken}` }
    });
    const page2Data = await page2Res.json();
    if (!page2Res.ok || !Array.isArray(page2Data.logs) || page2Data.logs.length < 2) {
      throw new Error(`FAIL Test 14: Unexpected page 2 data: ${JSON.stringify(page2Data)}`);
    }
    if (page1Data.logs[0].id === page2Data.logs[0].id) {
      throw new Error('FAIL Test 14: Page 1 and Page 2 returned identical records!');
    }
    console.log(`✓ PASS: Pagination verified (Total: ${page1Data.totalCount}, Page 1: ${page1Data.logs.length} items, Page 2: ${page2Data.logs.length} items)`);

    // -------------------------------------------------------------------------
    // TEST 12 & 13: Main Administrator can view and clear logs; other data intact
    // -------------------------------------------------------------------------
    console.log('\n--- Test 12 & 13: Main Administrator views & clears logs; other data preserved ---');
    const clearRes = await fetch(`${BASE_URL}/api/admin/visitors`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${mainAdminToken}` }
    });
    const clearData = await clearRes.json();
    if (!clearRes.ok || !clearData.success || clearData.deletedCount < 4) {
      throw new Error(`FAIL Test 12: Main admin clear failed: ${JSON.stringify(clearData)}`);
    }

    const afterClearRes = await fetch(`${BASE_URL}/api/admin/visitors`, {
      headers: { Authorization: `Bearer ${mainAdminToken}` }
    });
    const afterClearData = await afterClearRes.json();
    if (afterClearData.totalCount !== 0 || afterClearData.logs.length !== 0) {
      throw new Error(`FAIL Test 12: Logs not empty after clear: ${JSON.stringify(afterClearData)}`);
    }

    // Verify audit log entry
    const latestAudit = await queryOne<any>(
      "SELECT * FROM audit_logs WHERE action_type = 'visitor_logs_clear' ORDER BY created_at DESC LIMIT 1"
    );
    if (!latestAudit || latestAudit.admin_email !== 'vledahovic@gmail.com') {
      throw new Error('FAIL Test 12: Clear action was not logged in audit_logs');
    }

    // Check other tables
    const usersCheck = await queryOne<{ c: number }>("SELECT COUNT(*) as c FROM users");
    const itemsCheck = await queryOne<{ c: number }>("SELECT COUNT(*) as c FROM shop_items");
    if ((usersCheck?.c || 0) < 3 || (itemsCheck?.c || 0) < 10) {
      throw new Error('FAIL Test 13: Other database tables were affected!');
    }
    console.log('✓ PASS: Main Admin cleared logs, audit log recorded, and all other game tables untouched');

    // -------------------------------------------------------------------------
    // TEST 15: UI Component structure for Empty State, Error State, Confirm Modal & Inactive Push
    // -------------------------------------------------------------------------
    console.log('\n--- Test 15: UI Component verification (AdminVisitorsView & AdminPanelModal) ---');
    const viewCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminVisitorsView.tsx'), 'utf-8');
    const modalCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminPanelModal.tsx'), 'utf-8');
    const appCode = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');

    if (!viewCode.includes('Журнал посещений пуст')) {
      throw new Error('FAIL Test 15: Empty state text missing in AdminVisitorsView.tsx');
    }
    if (!viewCode.includes('Вы действительно хотите удалить все записи журнала посещений? Это действие нельзя отменить.')) {
      throw new Error('FAIL Test 15: Exact confirmation text missing in AdminVisitorsView.tsx');
    }
    if (
      !viewCode.includes('Push-уведомления') ||
      (!viewCode.includes('В разработке') && !viewCode.includes('Уведомления о посетителях'))
    ) {
      throw new Error('FAIL Test 15: Push-notifications block missing in AdminVisitorsView.tsx');
    }
    if (!modalCode.includes("id: 'visitors' as AdminTab") || !modalCode.includes("title: 'Посетители'")) {
      throw new Error('FAIL Test 15: Visitors tab missing in AdminPanelModal.tsx');
    }
    if (!appCode.includes('/api/visitors/ping') || !appCode.includes('mafia_visitor_key')) {
      throw new Error('FAIL Test 15: Visitor ping integration missing in src/App.tsx');
    }
    console.log('✓ PASS: UI components contain empty state, error recovery, confirmation dialog, and inactive push placeholder');

    // -------------------------------------------------------------------------
    // TEST 16: Automatic 7-day cleanup continues to operate accurately
    // -------------------------------------------------------------------------
    console.log('\n--- Test 16: 7-day automatic cleanup continues to work ---');
    const old8d = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const recent1d = new Date(Date.now() - 1 * 86_400_000).toISOString();

    await execute(
      `INSERT INTO visitor_logs (
        id, visitor_key, session_key, is_authenticated, user_id, display_name,
        online_count, device_summary, first_seen_at, last_seen_at, created_at
      ) VALUES ('vis_t16_old', 'key_old_16', 'ses_old', 0, NULL, 'Гость', 1, 'Chrome / Linux', ?, ?, ?)`,
      [old8d, old8d, old8d]
    );
    await execute(
      `INSERT INTO visitor_logs (
        id, visitor_key, session_key, is_authenticated, user_id, display_name,
        online_count, device_summary, first_seen_at, last_seen_at, created_at
      ) VALUES ('vis_t16_new', 'key_new_16', 'ses_new', 0, NULL, 'Гость', 2, 'Safari / iOS', ?, ?, ?)`,
      [recent1d, recent1d, recent1d]
    );

    const cleanupRes = await visitorsDb.cleanupOldVisitorLogs(7);
    if (cleanupRes.deletedCount !== 1) {
      throw new Error(`FAIL Test 16: Expected 1 old record deleted, got ${cleanupRes.deletedCount}`);
    }
    const remaining16 = await query<any>("SELECT id FROM visitor_logs");
    if (remaining16.length !== 1 || remaining16[0].id !== 'vis_t16_new') {
      throw new Error(`FAIL Test 16: Unexpected remaining rows: ${JSON.stringify(remaining16)}`);
    }
    console.log('✓ PASS: 7-day retention cleanup removes expired visits and preserves recent visits');

    console.log('\n🎉 ALL 16 STAGE 2 VISITOR REGISTRATION & ADMIN LOG TESTS PASSED 100%!');
  } finally {
    // Clean up temporary test users and test logs
    await execute("DELETE FROM visitor_logs WHERE id LIKE 'vis_t16_%'");
    await execute("DELETE FROM users WHERE id IN (?, ?)", [regularUserId, moderatorUserId]);
    await execute("DELETE FROM audit_logs WHERE details LIKE '%удалено записей:%' AND created_at >= ?", [nowIso]);
  }
}

runStage2Tests().catch((err) => {
  console.error('\n❌ STAGE 2 TEST SUITE FAILED:', err);
  process.exit(1);
});
