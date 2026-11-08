import { waitForDatabaseInit, execute, queryOne } from '../server/db/database.js';
import { visitorsDb, GUEST_ONLINE_PRESENCE_MS } from '../server/db/visitors.js';

const BASE_URL = 'http://localhost:3000';

async function runOnlineCounterTests() {
  console.log('🚀 Running Online Counter Diagnostic & Verification Tests...\n');

  await waitForDatabaseInit();
  await execute('DELETE FROM visitor_logs');

  const nowIso = new Date().toISOString();
  const playerUserId = 'usr_online_test_1';
  const playerToken = 'tk_online_player_' + Date.now();

  await execute(
    `INSERT OR REPLACE INTO users (
      id, email, display_name, avatar_seed, session_token,
      credits, xp, level, role, is_admin, is_banned,
      daily_bonus_streak, is_email_verified, stats, inventory, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1000, 100, 1, 'user', 0, 0, 0, 1, '{}', '[]', ?, ?)`,
    [playerUserId, 'online.player@example.com', 'Игрок Роман', 'Игрок Роман', playerToken, nowIso, nowIso]
  );

  const mainAdminRow = await queryOne<any>(
    "SELECT id, session_token FROM users WHERE LOWER(email) = 'vledahovic@gmail.com'"
  );
  if (!mainAdminRow) {
    throw new Error('FAIL: Main admin vledahovic@gmail.com not found');
  }
  let mainAdminToken = mainAdminRow.session_token;
  if (!mainAdminToken) {
    mainAdminToken = 'tk_online_admin_' + Date.now();
    await execute('UPDATE users SET session_token = ? WHERE id = ?', [mainAdminToken, mainAdminRow.id]);
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Exact Production Scenario (Main Admin + 1 Guest Browser = 2 Online, NOT 3)
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Main Admin (initially guest, then logged in) + 1 Guest Browser = 2 Online ---');
    const adminBrowserKey = 'vkey_admin_browser_01';
    const guestComputerKey = 'vkey_guest_computer_02';

    // Step 1a: Main Admin browser opens site before logging in (sends guest ping)
    await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorKey: adminBrowserKey, sessionKey: 'ses_admin_1' })
    });

    // Step 1b: Main Admin logs in on the same browser and sends authenticated ping
    const adminPingRes = await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mainAdminToken}`
      },
      body: JSON.stringify({ visitorKey: adminBrowserKey, sessionKey: 'ses_admin_1' })
    });
    const adminPingData = await adminPingRes.json();
    if (adminPingData.status !== 'ignored_admin') {
      throw new Error(`FAIL Test 1: Expected ignored_admin for Main Admin, got ${JSON.stringify(adminPingData)}`);
    }

    // Step 1c: Guest browser on computer opens the site
    await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorKey: guestComputerKey, sessionKey: 'ses_guest_comp_1' })
    });

    // Step 1d: Main Admin checks /api/admin/visitors
    const statsRes1 = await fetch(`${BASE_URL}/api/admin/visitors`, {
      headers: { Authorization: `Bearer ${mainAdminToken}` }
    });
    const statsData1 = await statsRes1.json();

    if (
      statsData1.stats?.activeOnlineSnapshot !== 2 ||
      statsData1.stats?.activeGuestsCount !== 1
    ) {
      throw new Error(
        `FAIL Test 1: Expected activeOnlineSnapshot=2 and activeGuestsCount=1, got ${JSON.stringify(statsData1.stats)}`
      );
    }
    console.log(
      `✓ PASS: Main Admin + 1 Guest Browser shows Online = ${statsData1.stats.activeOnlineSnapshot} (Guests: ${statsData1.stats.activeGuestsCount}, TodayVisits: ${statsData1.stats.todayVisits})`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Multiple Tabs in Same Browser Do Not Inflate Online Count
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Multiple tabs of Guest or Main Admin do not inflate online count ---');
    for (let tab = 2; tab <= 5; tab++) {
      await fetch(`${BASE_URL}/api/visitors/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorKey: guestComputerKey, sessionKey: `ses_guest_tab_${tab}` })
      });
      await fetch(`${BASE_URL}/api/visitors/ping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mainAdminToken}`
        },
        body: JSON.stringify({ visitorKey: adminBrowserKey, sessionKey: `ses_admin_tab_${tab}` })
      });
    }

    const statsRes2 = await fetch(`${BASE_URL}/api/admin/visitors`, {
      headers: { Authorization: `Bearer ${mainAdminToken}` }
    });
    const statsData2 = await statsRes2.json();
    if (statsData2.stats?.activeOnlineSnapshot !== 2 || statsData2.stats?.activeGuestsCount !== 1) {
      throw new Error(`FAIL Test 2: Multiple tabs inflated online count: ${JSON.stringify(statsData2.stats)}`);
    }
    console.log('✓ PASS: 5 open tabs for Guest and Main Admin keep Online strictly at 2');

    // -------------------------------------------------------------------------
    // TEST 3: Guest -> Authenticated Player Transition (No Double Counting)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Guest transitions to Authenticated Player without double-counting ---');
    const thirdBrowserKey = 'vkey_player_browser_03';

    // Opens as guest first -> Online becomes 3 (Main Admin + Guest 1 + Guest 2)
    await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorKey: thirdBrowserKey, sessionKey: 'ses_p3' })
    });

    const beforeLoginStats = await (
      await fetch(`${BASE_URL}/api/admin/visitors`, {
        headers: { Authorization: `Bearer ${mainAdminToken}` }
      })
    ).json();
    if (beforeLoginStats.stats?.activeOnlineSnapshot !== 3 || beforeLoginStats.stats?.activeGuestsCount !== 2) {
      throw new Error(`FAIL Test 3a: Expected Online=3 (2 guests) before login, got ${JSON.stringify(beforeLoginStats.stats)}`);
    }

    // Now logs in as 'Игрок Роман' on the same browser -> Online MUST stay 3 (2 auth + 1 guest), NOT 4!
    await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerToken}`
      },
      body: JSON.stringify({ visitorKey: thirdBrowserKey, sessionKey: 'ses_p3' })
    });

    const afterLoginStats = await (
      await fetch(`${BASE_URL}/api/admin/visitors`, {
        headers: { Authorization: `Bearer ${mainAdminToken}` }
      })
    ).json();
    if (afterLoginStats.stats?.activeOnlineSnapshot !== 3 || afterLoginStats.stats?.activeGuestsCount !== 1) {
      throw new Error(`FAIL Test 3b: Double-counted after guest->login! Got ${JSON.stringify(afterLoginStats.stats)}`);
    }
    console.log('✓ PASS: Guest logging in as player keeps Online = 3 (activeGuests moved from 2 to 1)');

    // -------------------------------------------------------------------------
    // TEST 4: Authenticated Player -> Logout -> Guest Transition (No Double Counting)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Authenticated player logs out and becomes Guest without double-counting ---');
    await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${playerToken}` }
    });

    // Browser now pings as Guest again
    await fetch(`${BASE_URL}/api/visitors/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorKey: thirdBrowserKey, sessionKey: 'ses_p3_after_logout' })
    });

    const afterLogoutStats = await (
      await fetch(`${BASE_URL}/api/admin/visitors`, {
        headers: { Authorization: `Bearer ${mainAdminToken}` }
      })
    ).json();
    if (afterLogoutStats.stats?.activeOnlineSnapshot !== 3 || afterLogoutStats.stats?.activeGuestsCount !== 2) {
      throw new Error(`FAIL Test 4: Double-counted after logout->guest! Got ${JSON.stringify(afterLogoutStats.stats)}`);
    }
    console.log('✓ PASS: Player logging out removes user presence immediately; Online stays 3 (1 admin + 2 guests)');

    // -------------------------------------------------------------------------
    // TEST 5: Immediate Pruning of Expired Guest Activity (> 5 minutes)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Immediate pruning of expired guest activity (> 5 minutes) ---');
    visitorsDb.clearGuestPresence();
    visitorsDb.updateGuestPresenceAndCalculateOnline('vkey_unit_fresh', true, 1);
    visitorsDb.updateGuestPresenceAndCalculateOnline('vkey_unit_stale', true, 1);

    // Simulate time advancing past GUEST_ONLINE_PRESENCE_MS (5 minutes) for stale check
    const futureMs = Date.now() + GUEST_ONLINE_PRESENCE_MS + 1000;
    const remainingAfterExpiry = visitorsDb.pruneAndCountActiveGuests(futureMs);
    if (remainingAfterExpiry !== 0) {
      throw new Error(`FAIL Test 5: Expected 0 active guests after 5-minute window expired, got ${remainingAfterExpiry}`);
    }
    console.log('✓ PASS: Expired guest presence entries are immediately pruned after 5-minute timeout');

    console.log('\n🎉 ALL 5 ONLINE COUNTER DIAGNOSTIC & DEDUPLICATION TESTS PASSED 100%!');
  } finally {
    visitorsDb.clearGuestPresence();
    await execute('DELETE FROM visitor_logs');
    await execute('DELETE FROM users WHERE id = ?', [playerUserId]);
  }
}

runOnlineCounterTests().catch((err) => {
  console.error('\n❌ ONLINE COUNTER TEST FAILED:', err);
  process.exit(1);
});
