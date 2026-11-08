import fs from 'node:fs';
import path from 'node:path';
import * as webpush from 'web-push';
import { waitForDatabaseInit, execute, query, queryOne } from '../server/db/database.js';
import { visitorsDb } from '../server/db/visitors.js';
import { visitorWebPush, PushNotificationPayload } from '../server/utils/webPush.js';

const BASE_URL = 'http://localhost:3000';

async function runStage3Tests() {
  console.log('🚀 Running Stage 3 Web Push Infrastructure & Aggregation Tests (15 Suites)...\n');

  await waitForDatabaseInit();

  // Clean test tables before starting
  await execute('DELETE FROM visitor_logs');
  await execute('DELETE FROM admin_push_subscriptions');
  await execute("DELETE FROM project_settings WHERE key = 'visitor_push_notifications_enabled'");

  // Generate ephemeral in-memory VAPID keys strictly for test validation (never stored or printed)
  const ephemeralVapid = webpush.generateVAPIDKeys();

  const nowIso = new Date().toISOString();
  const regularUserId = 'usr_s3_regular';
  const moderatorUserId = 'usr_s3_moderator';
  const regularToken = 'tk_s3_reg_' + Date.now();
  const moderatorToken = 'tk_s3_mod_' + Date.now();

  await execute(
    `INSERT OR REPLACE INTO users (
      id, email, display_name, avatar_seed, session_token,
      credits, xp, level, role, is_admin, is_banned,
      daily_bonus_streak, is_email_verified, stats, inventory, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1000, 100, 1, 'user', 0, 0, 0, 1, '{}', '[]', ?, ?)`,
    [regularUserId, 's3.player@example.com', 'Игрок Денис', 'Игрок Денис', regularToken, nowIso, nowIso]
  );

  await execute(
    `INSERT OR REPLACE INTO users (
      id, email, display_name, avatar_seed, session_token,
      credits, xp, level, role, is_admin, is_banned,
      daily_bonus_streak, is_email_verified, stats, inventory, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 5000, 500, 5, 'admin', 1, 0, 0, 1, '{}', '[]', ?, ?)`,
    [moderatorUserId, 's3.moderator@example.com', 'Модератор Павел', 'Модератор Павел', moderatorToken, nowIso, nowIso]
  );

  const mainAdminRow = await queryOne<any>(
    "SELECT id, email, display_name, session_token FROM users WHERE LOWER(email) = 'vledahovic@gmail.com'"
  );
  if (!mainAdminRow) {
    throw new Error('FAIL: Main admin vledahovic@gmail.com not found');
  }
  let mainAdminToken = mainAdminRow.session_token;
  if (!mainAdminToken) {
    mainAdminToken = 'tk_s3_main_admin_' + Date.now();
    await execute('UPDATE users SET session_token = ? WHERE id = ?', [mainAdminToken, mainAdminRow.id]);
  }

  const mainAdminActor = {
    id: mainAdminRow.id,
    email: 'vledahovic@gmail.com',
    displayName: mainAdminRow.display_name || 'Дон Влад',
    role: 'admin',
    isAdmin: true
  };

  // Track delivered notifications in memory via mock transport
  const deliveredCalls: Array<{
    endpoint: string;
    payload: PushNotificationPayload;
  }> = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 12 (Early check): Behavior when VAPID keys are missing
    // -------------------------------------------------------------------------
    console.log('--- Test 12: Safe behavior when VAPID configuration is missing ---');
    visitorWebPush.setTestConfiguration({
      vapidOverride: null,
      aggregationWindowMs: 80,
      transport: async (sub, payloadStr) => {
        deliveredCalls.push({ endpoint: sub.endpoint, payload: JSON.parse(payloadStr) });
      }
    });

    const vapidMissingStatus = visitorWebPush.getVapidStatus();
    if (vapidMissingStatus.configured !== false || vapidMissingStatus.publicKey !== null) {
      throw new Error(`FAIL Test 12: Expected configured=false when VAPID missing, got ${JSON.stringify(vapidMissingStatus)}`);
    }

    // Even if toggle is enabled, missing VAPID must gracefully skip push and still save visitor log
    await visitorWebPush.setVisitorPushEnabled(true, mainAdminActor);
    const noVapidVisit = await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s3_novapid_1',
      sessionKey: 'ses_novapid_1',
      deviceSummary: 'Chrome / Android',
      baseOnlineCount: 2
    });
    if (!noVapidVisit.isNewVisit || !noVapidVisit.visitRecord) {
      throw new Error('FAIL Test 12: Visit was not recorded when VAPID missing');
    }
    const noVapidRow = await queryOne<any>("SELECT push_status FROM visitor_logs WHERE id = ?", [noVapidVisit.visitRecord.id]);
    if (noVapidRow?.push_status !== 'skipped') {
      throw new Error(`FAIL Test 12: Expected push_status='skipped' when VAPID missing, got ${noVapidRow?.push_status}`);
    }
    console.log('✓ PASS: Missing VAPID handled safely without errors; visit logged with push_status=skipped');

    // Now configure ephemeral test VAPID keys and reset toggle to default (false)
    await execute("DELETE FROM project_settings WHERE key = 'visitor_push_notifications_enabled'");
    visitorWebPush.setTestConfiguration({
      vapidOverride: {
        publicKey: ephemeralVapid.publicKey,
        privateKey: ephemeralVapid.privateKey,
        subject: 'mailto:vledahovic@gmail.com'
      },
      aggregationWindowMs: 80
    });
    // Reset cached enabled state by setting to false explicitly
    await visitorWebPush.setVisitorPushEnabled(false, mainAdminActor);

    // -------------------------------------------------------------------------
    // TEST 1: Subscription creation and deduplication on re-registration
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Subscription creation & re-registration deduplication ---');
    const subPhone1 = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-device-phone-1',
      keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        auth: 'tBHItJI5svbpez7KI4CCXg'
      }
    };

    const saved1 = await visitorWebPush.saveAdminSubscription(
      mainAdminActor,
      subPhone1,
      'Mozilla/5.0 (Linux; Android 14) Chrome/122.0',
      'Телефон Android (Основной)'
    );
    const saved1Dup = await visitorWebPush.saveAdminSubscription(
      mainAdminActor,
      {
        endpoint: subPhone1.endpoint,
        keys: {
          p256dh: subPhone1.keys.p256dh,
          auth: 'updatedAuthKey12345678'
        }
      },
      'Mozilla/5.0 (Linux; Android 14) Chrome/123.0',
      'Телефон Android (Обновлён)'
    );

    if (saved1.id !== saved1Dup.id) {
      throw new Error(`FAIL Test 1: Duplicate endpoint created a new row (${saved1.id} vs ${saved1Dup.id})`);
    }
    const subsAfterDup = await visitorWebPush.getAdminSubscriptions(mainAdminActor);
    if (subsAfterDup.length !== 1 || subsAfterDup[0].deviceLabel !== 'Телефон Android (Обновлён)') {
      throw new Error(`FAIL Test 1: Expected 1 updated subscription, got ${JSON.stringify(subsAfterDup)}`);
    }
    console.log('✓ PASS: Subscription created and re-registration deduplicated by endpoint');

    // -------------------------------------------------------------------------
    // TEST 2: Multiple devices for Main Administrator
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Multiple devices of Main Administrator ---');
    const subIphone2 = {
      endpoint: 'https://web.push.apple.com/test-device-iphone-2',
      keys: {
        p256dh: 'BIPUL12DLfytvTajnryr2PRdAgXS3HGKiLqndGcJGabyhHheJYlNGCeXl1dn18gSJ1W7A8u-Ts1XbjhazAkj7I9',
        auth: 'appleAuthKey9876543210'
      }
    };
    await visitorWebPush.saveAdminSubscription(
      mainAdminActor,
      subIphone2,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1',
      'iPhone PWA'
    );

    const allSubs = await visitorWebPush.getAdminSubscriptions(mainAdminActor);
    if (allSubs.length !== 2) {
      throw new Error(`FAIL Test 2: Expected 2 devices for Main Admin, got ${allSubs.length}`);
    }
    console.log('✓ PASS: Multiple devices (Android + iPhone) stored simultaneously for Main Administrator');

    // -------------------------------------------------------------------------
    // TEST 3: Access denied to other users and secondary admins (Service + HTTP API)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Access strictly denied to non-main admins and regular users ---');
    let modRejected = false;
    try {
      await visitorWebPush.saveAdminSubscription(
        { id: moderatorUserId, email: 's3.moderator@example.com', role: 'admin', isAdmin: true },
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/attacker-mod-sub',
          keys: { p256dh: subPhone1.keys.p256dh, auth: subPhone1.keys.auth }
        }
      );
    } catch (err: any) {
      if (err.message.includes('Доступ запрещён')) modRejected = true;
    }
    if (!modRejected) {
      throw new Error('FAIL Test 3: Moderator was able to register push subscription!');
    }

    // Verify HTTP API protection for regular player & moderator
    const regStatusRes = await fetch(`${BASE_URL}/api/admin/visitors/push/status`, {
      headers: { Authorization: `Bearer ${regularToken}` }
    });
    const modStatusRes = await fetch(`${BASE_URL}/api/admin/visitors/push/status`, {
      headers: { Authorization: `Bearer ${moderatorToken}` }
    });
    const modSubHttpRes = await fetch(`${BASE_URL}/api/admin/visitors/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${moderatorToken}`
      },
      body: JSON.stringify({ subscription: subPhone1 })
    });
    const modToggleHttpRes = await fetch(`${BASE_URL}/api/admin/visitors/push/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${moderatorToken}`
      },
      body: JSON.stringify({ enabled: true })
    });

    if (
      regStatusRes.status !== 403 ||
      modStatusRes.status !== 403 ||
      modSubHttpRes.status !== 403 ||
      modToggleHttpRes.status !== 403
    ) {
      throw new Error(
        `FAIL Test 3: Expected 403 on all non-main-admin HTTP push routes, got ${regStatusRes.status}, ${modStatusRes.status}, ${modSubHttpRes.status}, ${modToggleHttpRes.status}`
      );
    }
    console.log('✓ PASS: Regular players and secondary admins blocked at both service and HTTP layers (403)');

    // -------------------------------------------------------------------------
    // TEST 7 & 8: Disabled global toggle -> no push sent, log still saved, no backlog burst on enable
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7 & 8: Disabled global toggle & log preservation ---');
    deliveredCalls.length = 0;
    const isEnabledNow = await visitorWebPush.isVisitorPushEnabled();
    if (isEnabledNow !== false) {
      throw new Error('FAIL Test 7: Expected push notifications to be disabled (false)');
    }

    const disabledVisit = await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s3_while_off_1',
      sessionKey: 'ses_off_1',
      deviceSummary: 'Firefox / Windows',
      baseOnlineCount: 3
    });
    await new Promise((r) => setTimeout(r, 120));

    if (!disabledVisit.isNewVisit || !disabledVisit.visitRecord) {
      throw new Error('FAIL Test 8: Visit was not logged while push was disabled');
    }
    if (deliveredCalls.length !== 0) {
      throw new Error(`FAIL Test 7: Push was sent while global toggle was disabled! (${deliveredCalls.length})`);
    }
    const disabledVisitRow = await queryOne<any>("SELECT * FROM visitor_logs WHERE id = ?", [disabledVisit.visitRecord.id]);
    if (!disabledVisitRow || disabledVisitRow.push_status !== 'skipped') {
      throw new Error(`FAIL Test 8: Expected visit in DB with push_status='skipped', got ${JSON.stringify(disabledVisitRow)}`);
    }

    // Now enable global toggle -> must NOT send old visits accumulated while disabled!
    await visitorWebPush.setVisitorPushEnabled(true, mainAdminActor);
    await new Promise((r) => setTimeout(r, 120));
    if (deliveredCalls.length !== 0) {
      throw new Error('FAIL Test 7: Enabling push sent old visits accumulated while push was disabled!');
    }
    console.log('✓ PASS: When toggle is OFF, visits are logged to DB, 0 pushes sent, and enabling does not flush old visits');

    // -------------------------------------------------------------------------
    // TEST 4: Single notification sent to all Main Admin devices on new visit
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Single notification sent on new visit ---');
    deliveredCalls.length = 0;
    const singleVisit = await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s3_single_guest',
      sessionKey: 'ses_single_1',
      deviceSummary: 'Safari / iOS',
      baseOnlineCount: 4
    });

    if (!singleVisit.isNewVisit) {
      throw new Error('FAIL Test 4: Expected new visit');
    }

    // Wait for 80ms aggregation window to flush
    await new Promise((r) => setTimeout(r, 140));

    if (deliveredCalls.length !== 2) {
      throw new Error(`FAIL Test 4: Expected delivery to 2 registered admin devices, got ${deliveredCalls.length}`);
    }
    const p4 = deliveredCalls[0].payload;
    if (p4.title !== 'Новый посетитель Mafia Club' || !p4.body.includes('Гость') || !p4.body.includes('Онлайн:')) {
      throw new Error(`FAIL Test 4: Unexpected notification payload: ${JSON.stringify(p4)}`);
    }
    console.log(`✓ PASS: Single new visit delivered to both admin devices: "${p4.title} — ${p4.body}"`);

    // -------------------------------------------------------------------------
    // TEST 5: No repeat notification on F5 refresh or reconnect
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: No repeat notification on F5 refresh ---');
    deliveredCalls.length = 0;
    const f5Visit = await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s3_single_guest',
      sessionKey: 'ses_single_1',
      deviceSummary: 'Safari / iOS',
      baseOnlineCount: 4
    });
    await new Promise((r) => setTimeout(r, 140));

    if (f5Visit.isNewVisit || deliveredCalls.length !== 0) {
      throw new Error(`FAIL Test 5: F5 refresh triggered push notification! calls=${deliveredCalls.length}`);
    }
    console.log('✓ PASS: F5 refresh updates session without triggering duplicate push');

    // -------------------------------------------------------------------------
    // TEST 6: Main Administrator visit excluded from push
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Main Administrator visit excluded from push ---');
    deliveredCalls.length = 0;
    const adminVisit = await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s3_main_admin_visit',
      sessionKey: 'ses_admin_visit',
      userToken: mainAdminToken,
      baseOnlineCount: 5
    });
    await new Promise((r) => setTimeout(r, 140));

    if (adminVisit.status !== 'ignored_admin' || deliveredCalls.length !== 0) {
      throw new Error(`FAIL Test 6: Main admin visit was not ignored! ${JSON.stringify(adminVisit)}`);
    }
    console.log('✓ PASS: Main Administrator visit completely excluded from push and logs');

    // -------------------------------------------------------------------------
    // TEST 9: Aggregation of multiple visits & mid-window login identity upgrade
    // -------------------------------------------------------------------------
    console.log('\n--- Test 9: Aggregation of multiple visits & mid-window auth upgrade ---');
    deliveredCalls.length = 0;

    // 3 visitors arrive within the 80ms aggregation window;
    // Visitor A starts as guest and immediately logs in as 'Игрок Денис' within the same window!
    await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s3_burst_A',
      sessionKey: 'ses_burst_A',
      baseOnlineCount: 6
    });
    // Visitor A authenticates right away during the same period:
    await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s3_burst_A',
      sessionKey: 'ses_burst_A',
      userToken: regularToken,
      baseOnlineCount: 6
    });
    // Visitor B (Guest)
    await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s3_burst_B',
      sessionKey: 'ses_burst_B',
      baseOnlineCount: 7
    });
    // Visitor C (Guest)
    await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s3_burst_C',
      sessionKey: 'ses_burst_C',
      baseOnlineCount: 8
    });

    await new Promise((r) => setTimeout(r, 150));

    // Should have sent 1 aggregated notification per device (2 devices = 2 transport calls)
    if (deliveredCalls.length !== 2) {
      throw new Error(`FAIL Test 9: Expected 1 aggregated notification per device (2 total calls), got ${deliveredCalls.length}`);
    }
    const aggPayload = deliveredCalls[0].payload;
    if (
      aggPayload.title !== 'Новые посетители Mafia Club (+3)' ||
      !aggPayload.body.includes('Игрок Денис') ||
      !aggPayload.body.includes('Гость') ||
      aggPayload.data.count !== 3
    ) {
      throw new Error(`FAIL Test 9: Unexpected aggregated payload: ${JSON.stringify(aggPayload)}`);
    }
    console.log(`✓ PASS: 3 rapid visits combined into 1 message with upgraded auth nickname: "${aggPayload.title} — ${aggPayload.body}"`);

    // -------------------------------------------------------------------------
    // TEST 10: Invalid subscription (410 Gone) is automatically removed
    // -------------------------------------------------------------------------
    console.log('\n--- Test 10: Invalid subscription (410 Gone) is automatically removed ---');
    deliveredCalls.length = 0;
    visitorWebPush.setTestConfiguration({
      transport: async (sub, payloadStr) => {
        if (sub.endpoint.includes('apple.com')) {
          const err: any = new Error('Subscription expired or unsubscribed');
          err.statusCode = 410;
          throw err;
        }
        deliveredCalls.push({ endpoint: sub.endpoint, payload: JSON.parse(payloadStr) });
      }
    });

    await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s3_test_410',
      sessionKey: 'ses_410',
      baseOnlineCount: 3
    });
    await new Promise((r) => setTimeout(r, 150));

    const subsAfter410 = await visitorWebPush.getAdminSubscriptions(mainAdminActor);
    if (subsAfter410.length !== 1 || subsAfter410[0].endpoint !== subPhone1.endpoint) {
      throw new Error(`FAIL Test 10: Expected expired iPhone subscription to be removed, remaining: ${JSON.stringify(subsAfter410)}`);
    }
    console.log('✓ PASS: Expired subscription returning HTTP 410 Gone was automatically deleted');

    // -------------------------------------------------------------------------
    // TEST 11: Transient push service error (503) keeps subscription & records last_error
    // -------------------------------------------------------------------------
    console.log('\n--- Test 11: Transient push service failure (503) handled gracefully ---');
    visitorWebPush.setTestConfiguration({
      transport: async () => {
        const err: any = new Error('FCM temporarily unavailable');
        err.statusCode = 503;
        throw err;
      }
    });

    const visitDuring503 = await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s3_test_503',
      sessionKey: 'ses_503',
      baseOnlineCount: 4
    });
    await new Promise((r) => setTimeout(r, 150));

    if (!visitDuring503.isNewVisit || !visitDuring503.visitRecord) {
      throw new Error('FAIL Test 11: Visit registration failed during push 503 error');
    }
    const subsAfter503 = await visitorWebPush.getAdminSubscriptions(mainAdminActor);
    if (subsAfter503.length !== 1 || !subsAfter503[0].lastError?.includes('FCM temporarily unavailable')) {
      throw new Error(`FAIL Test 11: Expected subscription to be preserved with lastError, got ${JSON.stringify(subsAfter503)}`);
    }
    console.log('✓ PASS: Transient 503 error recorded in last_error; subscription and visit log preserved');

    // -------------------------------------------------------------------------
    // TEST 13: Safe behavior on server restart (no mass resend of stale pending visits)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 13: Safe startup recovery (no mass resend of old pending rows) ---');
    deliveredCalls.length = 0;
    visitorWebPush.setTestConfiguration({
      transport: async (sub, payloadStr) => {
        deliveredCalls.push({ endpoint: sub.endpoint, payload: JSON.parse(payloadStr) });
      }
    });

    const stale10mAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await execute(
      `INSERT INTO visitor_logs (
        id, visitor_key, session_key, is_authenticated, user_id, display_name,
        online_count, device_summary, first_seen_at, last_seen_at, created_at, push_status
      ) VALUES ('vis_stale_restart', 'key_stale_restart', 'ses_stale', 0, NULL, 'Гость', 1, 'Chrome', ?, ?, ?, 'pending')`,
      [stale10mAgo, stale10mAgo, stale10mAgo]
    );

    await visitorWebPush.recoverOnStartup();
    await new Promise((r) => setTimeout(r, 150));

    if (deliveredCalls.length !== 0) {
      throw new Error('FAIL Test 13: Stale pending visit was sent after server restart!');
    }
    const staleRow = await queryOne<any>("SELECT push_status FROM visitor_logs WHERE id = 'vis_stale_restart'");
    if (staleRow?.push_status !== 'skipped') {
      throw new Error(`FAIL Test 13: Expected stale pending visit to become 'skipped', got ${staleRow?.push_status}`);
    }
    console.log('✓ PASS: Startup recovery marks stale pending rows as skipped and prevents mass resend');

    // -------------------------------------------------------------------------
    // TEST 14 & 15: PWA Service Worker & Visitor Accounting Non-Regression
    // -------------------------------------------------------------------------
    console.log('\n--- Test 14 & 15: PWA Service Worker & Visitor Accounting Non-Regression ---');
    const swContent = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf-8');
    if (
      !swContent.includes("self.addEventListener('install'") ||
      !swContent.includes("self.addEventListener('activate'") ||
      !swContent.includes("self.addEventListener('fetch'") ||
      !swContent.includes("SKIP_WAITING") ||
      !swContent.includes("self.addEventListener('push'") ||
      !swContent.includes("self.addEventListener('notificationclick'")
    ) {
      throw new Error('FAIL Test 14: public/sw.js is missing required PWA or Push event handlers');
    }

    const totalLoggedVisits = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM visitor_logs');
    if ((totalLoggedVisits?.c || 0) < 7) {
      throw new Error(`FAIL Test 15: Expected at least 7 visitor log records preserved, got ${totalLoggedVisits?.c}`);
    }
    console.log('✓ PASS: PWA Service Worker and Visitor Accounting operate with zero regressions');

    console.log('\n🎉 ALL 15 STAGE 3 WEB PUSH INFRASTRUCTURE TESTS PASSED 100%!');
  } finally {
    // Restore clean state and reset test configuration
    visitorWebPush.setTestConfiguration({
      transport: null,
      aggregationWindowMs: 4000,
      vapidOverride: null
    });
    visitorWebPush.initVapidFromEnv();
    await execute('DELETE FROM visitor_logs');
    await execute('DELETE FROM admin_push_subscriptions');
    await execute("DELETE FROM project_settings WHERE key = 'visitor_push_notifications_enabled'");
    await execute('DELETE FROM users WHERE id IN (?, ?)', [regularUserId, moderatorUserId]);
    await execute("DELETE FROM audit_logs WHERE action_type LIKE 'visitor_push_%' AND created_at >= ?", [nowIso]);
  }
}

runStage3Tests().catch((err) => {
  console.error('\n❌ STAGE 3 TEST SUITE FAILED:', err);
  process.exit(1);
});
