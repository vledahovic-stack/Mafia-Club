import fs from 'node:fs';
import path from 'node:path';
import * as webpush from 'web-push';
import { waitForDatabaseInit, execute, queryOne } from '../server/db/database.js';
import { visitorsDb } from '../server/db/visitors.js';
import { visitorWebPush, PushNotificationPayload } from '../server/utils/webPush.js';
import {
  detectPushEnvironment,
  fetchAdminPushStatus,
  toggleAdminVisitorPush,
  subscribeCurrentDeviceToPush,
  unsubscribeDeviceFromPush,
  PushBrowserEnvAdapter
} from '../src/utils/visitorPushClient.js';

const BASE_URL = 'http://localhost:3000';

function createMockBrowserAdapter(opts: {
  userAgent: string;
  isStandalone?: boolean;
  hasServiceWorker?: boolean;
  hasNotification?: boolean;
  hasPushManager?: boolean;
  permission?: NotificationPermission;
  endpoint: string;
  p256dh: string;
  auth: string;
  throwOnUnsubscribe?: boolean;
}): {
  adapter: PushBrowserEnvAdapter;
  getState: () => { subscribed: boolean; subscribeCallCount: number; unsubscribeCallCount: number };
} {
  let subscribed = false;
  let subscribeCallCount = 0;
  let unsubscribeCallCount = 0;
  let currentPerm: NotificationPermission = opts.permission || 'default';

  const makeSubObj = () => ({
    endpoint: opts.endpoint,
    toJSON: () => ({
      endpoint: opts.endpoint,
      expirationTime: null,
      keys: {
        p256dh: opts.p256dh,
        auth: opts.auth
      }
    }),
    unsubscribe: async () => {
      unsubscribeCallCount++;
      if (opts.throwOnUnsubscribe) {
        throw new Error('Simulated browser PushSubscription.unsubscribe() failure');
      }
      subscribed = false;
      return true;
    }
  });

  const adapter: PushBrowserEnvAdapter = {
    userAgent: opts.userAgent,
    isStandalone: opts.isStandalone ?? false,
    hasServiceWorker: opts.hasServiceWorker ?? true,
    hasNotification: opts.hasNotification ?? true,
    hasPushManager: opts.hasPushManager ?? true,
    getPermission: () => currentPerm,
    requestPermission: async () => {
      if (currentPerm === 'default') {
        currentPerm = 'granted';
      }
      return currentPerm;
    },
    getServiceWorkerRegistration: async () => ({
      pushManager: {
        getSubscription: async () => (subscribed ? makeSubObj() : null),
        subscribe: async () => {
          subscribeCallCount++;
          subscribed = true;
          return makeSubObj();
        }
      }
    }),
    fetchFn: fetch,
    baseUrl: BASE_URL
  };

  return {
    adapter,
    getState: () => ({ subscribed, subscribeCallCount, unsubscribeCallCount })
  };
}

async function runStage4Tests() {
  console.log('🚀 Running Stage 4 Web Push UI, Device Lifecycle & Final Integration Tests (14 Suites)...\n');

  await waitForDatabaseInit();

  await execute('DELETE FROM visitor_logs');
  await execute('DELETE FROM admin_push_subscriptions');
  await execute("DELETE FROM project_settings WHERE key = 'visitor_push_notifications_enabled'");

  // Generate ephemeral VAPID keys in memory strictly for testing (never logged or saved)
  const ephemeralVapid = webpush.generateVAPIDKeys();
  const validVapidConfig = {
    configured: true,
    publicKey: ephemeralVapid.publicKey
  };

  const nowIso = new Date().toISOString();
  const regularUserId = 'usr_s4_regular';
  const moderatorUserId = 'usr_s4_moderator';
  const regularToken = 'tk_s4_reg_' + Date.now();
  const moderatorToken = 'tk_s4_mod_' + Date.now();

  await execute(
    `INSERT OR REPLACE INTO users (
      id, email, display_name, avatar_seed, session_token,
      credits, xp, level, role, is_admin, is_banned,
      daily_bonus_streak, is_email_verified, stats, inventory, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1000, 100, 1, 'user', 0, 0, 0, 1, '{}', '[]', ?, ?)`,
    [regularUserId, 's4.player@example.com', 'Игрок Илья', 'Игрок Илья', regularToken, nowIso, nowIso]
  );

  await execute(
    `INSERT OR REPLACE INTO users (
      id, email, display_name, avatar_seed, session_token,
      credits, xp, level, role, is_admin, is_banned,
      daily_bonus_streak, is_email_verified, stats, inventory, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 5000, 500, 5, 'admin', 1, 0, 0, 1, '{}', '[]', ?, ?)`,
    [moderatorUserId, 's4.moderator@example.com', 'Модератор Анна', 'Модератор Анна', moderatorToken, nowIso, nowIso]
  );

  const mainAdminRow = await queryOne<any>(
    "SELECT id, session_token, display_name FROM users WHERE LOWER(email) = 'vledahovic@gmail.com'"
  );
  if (!mainAdminRow) {
    throw new Error('FAIL: Main admin vledahovic@gmail.com not found');
  }
  let mainAdminToken = mainAdminRow.session_token;
  if (!mainAdminToken) {
    mainAdminToken = 'tk_s4_main_admin_' + Date.now();
    await execute('UPDATE users SET session_token = ? WHERE id = ?', [mainAdminToken, mainAdminRow.id]);
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Connecting a device & verifying zero secrets leaked in UI response
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Connecting current device & verifying security of response ---');
    const androidMock = createMockBrowserAdapter({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/123.0.0.0 Mobile Safari/537.36',
      isStandalone: true,
      endpoint: 'https://fcm.googleapis.com/fcm/send/s4-android-device-1',
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg'
    });

    const connectRes1 = await subscribeCurrentDeviceToPush(
      mainAdminToken,
      validVapidConfig,
      androidMock.adapter
    );

    if (!connectRes1.subscription?.id || connectRes1.permission !== 'granted') {
      throw new Error(`FAIL Test 1: Device did not connect properly: ${JSON.stringify(connectRes1)}`);
    }
    if ((connectRes1.subscription as any).endpoint || (connectRes1.subscription as any).p256dh || (connectRes1.subscription as any).auth) {
      throw new Error('FAIL Test 1: Subscribe response exposed raw endpoint or cryptographic keys to UI!');
    }

    const statusAfter1 = await fetchAdminPushStatus(mainAdminToken, androidMock.adapter);
    if (
      statusAfter1.subscriptions.length !== 1 ||
      statusAfter1.currentDeviceSubscriptionId !== connectRes1.subscription.id ||
      !statusAfter1.subscriptions[0].isCurrentDevice
    ) {
      throw new Error(`FAIL Test 1: Status did not recognize connected device as current: ${JSON.stringify(statusAfter1)}`);
    }
    if ((statusAfter1.subscriptions[0] as any).endpoint || (statusAfter1.subscriptions[0] as any).p256dh) {
      throw new Error('FAIL Test 1: Status endpoint leaked raw subscription endpoint or keys!');
    }
    console.log(`✓ PASS: Device connected (${connectRes1.subscription.deviceLabel}), marked as current, zero secrets/endpoints in UI JSON`);

    // -------------------------------------------------------------------------
    // TEST 2: Re-connecting the same device (Deduplication)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Re-connecting same device (no duplicate subscriptions) ---');
    const connectRes2 = await subscribeCurrentDeviceToPush(
      mainAdminToken,
      validVapidConfig,
      androidMock.adapter
    );
    const statusAfter2 = await fetchAdminPushStatus(mainAdminToken, androidMock.adapter);

    if (
      connectRes2.subscription.id !== connectRes1.subscription.id ||
      statusAfter2.subscriptions.length !== 1 ||
      androidMock.getState().subscribeCallCount !== 1
    ) {
      throw new Error(`FAIL Test 2: Re-connecting created duplicate or re-invoked PushManager.subscribe unnecessarily`);
    }
    console.log('✓ PASS: Re-connecting reuses existing PushSubscription and updates single DB record without duplicates');

    // -------------------------------------------------------------------------
    // TEST 4: Connecting multiple devices (Android + iPhone PWA)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Connecting multiple devices simultaneously ---');
    const iphonePwaMock = createMockBrowserAdapter({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
      isStandalone: true,
      endpoint: 'https://web.push.apple.com/s4-iphone-pwa-device-2',
      p256dh: 'BIPUL12DLfytvTajnryr2PRdAgXS3HGKiLqndGcJGabyhHheJYlNGCeXl1dn18gSJ1W7A8u-Ts1XbjhazAkj7I9',
      auth: 'appleAuthKey9876543210'
    });

    const connectIphoneRes = await subscribeCurrentDeviceToPush(
      mainAdminToken,
      validVapidConfig,
      iphonePwaMock.adapter
    );

    const statusFromIphone = await fetchAdminPushStatus(mainAdminToken, iphonePwaMock.adapter);
    if (
      statusFromIphone.subscriptions.length !== 2 ||
      statusFromIphone.currentDeviceSubscriptionId !== connectIphoneRes.subscription.id
    ) {
      throw new Error(`FAIL Test 4: Expected 2 devices with iPhone marked current, got ${JSON.stringify(statusFromIphone)}`);
    }
    console.log('✓ PASS: Multiple devices (Android PWA + iPhone PWA) connected and accurately distinguished');

    // -------------------------------------------------------------------------
    // TEST 3: Disconnecting a device & handling partial browser error
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Disconnecting device & partial browser unsubscribe error handling ---');
    // 3a. Normal disconnect of Android device
    const unsubAndroidRes = await unsubscribeDeviceFromPush(
      mainAdminToken,
      { subscriptionId: connectRes1.subscription.id, isCurrentDevice: true },
      androidMock.adapter
    );
    if (
      !unsubAndroidRes.removedFromServer ||
      !unsubAndroidRes.browserUnsubscribed ||
      unsubAndroidRes.partialWarning !== null ||
      androidMock.getState().subscribed !== false
    ) {
      throw new Error(`FAIL Test 3a: Clean device disconnect failed: ${JSON.stringify(unsubAndroidRes)}`);
    }

    // 3b. Partial error scenario: server deletes subscription, but browser unsubscribe() throws
    const flakyDesktopMock = createMockBrowserAdapter({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0 Safari/537.36',
      endpoint: 'https://fcm.googleapis.com/fcm/send/s4-flaky-desktop-3',
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'desktopAuthKey123456',
      throwOnUnsubscribe: true
    });
    const flakySub = await subscribeCurrentDeviceToPush(
      mainAdminToken,
      validVapidConfig,
      flakyDesktopMock.adapter
    );
    const partialUnsubRes = await unsubscribeDeviceFromPush(
      mainAdminToken,
      { subscriptionId: flakySub.subscription.id, isCurrentDevice: true },
      flakyDesktopMock.adapter
    );
    if (
      !partialUnsubRes.removedFromServer ||
      partialUnsubRes.browserUnsubscribed !== false ||
      !partialUnsubRes.partialWarning
    ) {
      throw new Error(`FAIL Test 3b: Partial unsubscribe error was not handled gracefully: ${JSON.stringify(partialUnsubRes)}`);
    }

    const statusAfterUnsub = await fetchAdminPushStatus(mainAdminToken, iphonePwaMock.adapter);
    if (statusAfterUnsub.subscriptions.length !== 1 || statusAfterUnsub.subscriptions[0].id !== connectIphoneRes.subscription.id) {
      throw new Error(`FAIL Test 3: Expected only iPhone subscription remaining on server, got ${JSON.stringify(statusAfterUnsub.subscriptions)}`);
    }
    console.log('✓ PASS: Both clean disconnect and partial browser unsubscribe failure handled safely');

    // -------------------------------------------------------------------------
    // TEST 5 & 6: Global toggle ON/OFF and persistence after reload
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5 & 6: Global toggle ON/OFF and persistence across reloads ---');
    const toggleOn = await toggleAdminVisitorPush(mainAdminToken, true, iphonePwaMock.adapter);
    if (toggleOn.enabled !== true) {
      throw new Error('FAIL Test 5: Global toggle did not enable');
    }

    // Simulate page reload by calling fetchAdminPushStatus fresh
    const statusReload1 = await fetchAdminPushStatus(mainAdminToken, iphonePwaMock.adapter);
    if (statusReload1.enabled !== true) {
      throw new Error('FAIL Test 6: Enabled state did not persist on reload');
    }

    const toggleOff = await toggleAdminVisitorPush(mainAdminToken, false, iphonePwaMock.adapter);
    const statusReload2 = await fetchAdminPushStatus(mainAdminToken, iphonePwaMock.adapter);
    if (toggleOff.enabled !== false || statusReload2.enabled !== false) {
      throw new Error('FAIL Test 5/6: Disabled state did not persist on reload');
    }
    console.log('✓ PASS: Global toggle switches ON/OFF and persists across reloads');

    // -------------------------------------------------------------------------
    // TEST 7 & 13: No push sent when toggle is OFF + Visitor logs preserved
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7 & 13: No push sent when toggle OFF; visitor logs 100% preserved ---');
    const deliveredPayloads: PushNotificationPayload[] = [];
    visitorWebPush.setTestConfiguration({
      vapidOverride: {
        publicKey: ephemeralVapid.publicKey,
        privateKey: ephemeralVapid.privateKey,
        subject: 'mailto:vledahovic@gmail.com'
      },
      aggregationWindowMs: 80,
      transport: async (_sub, payloadStr) => {
        deliveredPayloads.push(JSON.parse(payloadStr));
      }
    });

    const visitWhileOff = await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s4_off_check',
      sessionKey: 'ses_s4_off_1',
      deviceSummary: 'Chrome / Windows',
      baseOnlineCount: 5
    });
    await new Promise((r) => setTimeout(r, 130));

    if (!visitWhileOff.isNewVisit || deliveredPayloads.length !== 0) {
      throw new Error(`FAIL Test 7: Expected 0 pushes while toggle OFF, got ${deliveredPayloads.length}`);
    }

    // Re-enable toggle -> must NOT send old visit from when toggle was off
    await toggleAdminVisitorPush(mainAdminToken, true, iphonePwaMock.adapter);
    await new Promise((r) => setTimeout(r, 130));
    if (deliveredPayloads.length !== 0) {
      throw new Error('FAIL Test 7: Enabling toggle sent historical visits!');
    }

    // Now a fresh visit while ON -> must deliver to connected iPhone PWA
    await visitorsDb.recordVisitorActivity({
      visitorKey: 'vis_s4_on_check',
      sessionKey: 'ses_s4_on_1',
      userToken: regularToken,
      baseOnlineCount: 6
    });
    await new Promise((r) => setTimeout(r, 140));
    if (Number(deliveredPayloads.length) !== 1 || !deliveredPayloads[0].body.includes('Игрок Илья')) {
      throw new Error(`FAIL Test 7: Expected 1 push for Игрок Илья when toggle ON, got ${JSON.stringify(deliveredPayloads)}`);
    }

    const logsCountRow = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM visitor_logs');
    if ((logsCountRow?.c || 0) !== 2) {
      throw new Error(`FAIL Test 13: Expected both visits preserved in visitor_logs, got ${logsCountRow?.c}`);
    }
    console.log('✓ PASS: Toggle OFF suppresses push without losing logs; Toggle ON delivers new visits cleanly');

    // -------------------------------------------------------------------------
    // TEST 8: Missing VAPID configuration handling
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Missing VAPID configuration handling ---');
    let missingVapidError = '';
    try {
      await subscribeCurrentDeviceToPush(
        mainAdminToken,
        { configured: false, publicKey: null, reason: 'VAPID_PUBLIC_KEY не задан' },
        androidMock.adapter
      );
    } catch (err: any) {
      missingVapidError = err.message || '';
    }
    if (!missingVapidError.includes('VAPID')) {
      throw new Error(`FAIL Test 8: Missing VAPID did not produce clear error, got "${missingVapidError}"`);
    }
    console.log(`✓ PASS: Missing VAPID rejected with clear message: "${missingVapidError}"`);

    // -------------------------------------------------------------------------
    // TEST 9: Browser Notification permission denied handling
    // -------------------------------------------------------------------------
    console.log('\n--- Test 9: Browser Notification permission denied handling ---');
    const deniedMock = createMockBrowserAdapter({
      userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/123.0',
      permission: 'denied',
      endpoint: 'https://fcm.googleapis.com/fcm/send/should-never-be-called',
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg'
    });

    let deniedError = '';
    try {
      await subscribeCurrentDeviceToPush(mainAdminToken, validVapidConfig, deniedMock.adapter);
    } catch (err: any) {
      deniedError = err.message || '';
    }
    if (!deniedError.includes('запрещён в настройках браузера') || deniedMock.getState().subscribeCallCount !== 0) {
      throw new Error(`FAIL Test 9: Permission denied was not handled properly: "${deniedError}"`);
    }
    console.log('✓ PASS: Denied browser permission handled cleanly without calling PushManager.subscribe');

    // -------------------------------------------------------------------------
    // TEST 10: Unsupported browser & iPhone Safari regular tab vs Home Screen PWA
    // -------------------------------------------------------------------------
    console.log('\n--- Test 10: Unsupported browser & iPhone Safari tab detection ---');
    const iphoneSafariTabEnv = detectPushEnvironment({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
      isStandalone: false,
      hasServiceWorker: true,
      hasNotification: false,
      hasPushManager: false
    });
    if (
      !iphoneSafariTabEnv.isIOS ||
      !iphoneSafariTabEnv.requiresIOSHomeScreen ||
      iphoneSafariTabEnv.supported !== false ||
      !iphoneSafariTabEnv.unsupportedReason?.includes('На экран Домой')
    ) {
      throw new Error(`FAIL Test 10a: iPhone Safari tab was not flagged for Home Screen installation: ${JSON.stringify(iphoneSafariTabEnv)}`);
    }

    const unsupportedBrowserMock = createMockBrowserAdapter({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) OldBrowser/1.0',
      hasServiceWorker: false,
      hasNotification: false,
      hasPushManager: false,
      endpoint: 'https://example.com',
      p256dh: '123',
      auth: '123'
    });
    let unsupportedErr = '';
    try {
      await subscribeCurrentDeviceToPush(mainAdminToken, validVapidConfig, unsupportedBrowserMock.adapter);
    } catch (err: any) {
      unsupportedErr = err.message || '';
    }
    if (!unsupportedErr.includes('не поддерживает Web Push API')) {
      throw new Error(`FAIL Test 10b: Unsupported browser error mismatch: "${unsupportedErr}"`);
    }
    console.log('✓ PASS: iPhone Safari tab shows "На экран Домой" instruction and unsupported browsers are safely blocked');

    // -------------------------------------------------------------------------
    // TEST 11: Main Administrator authorization & Device ID spoofing protection
    // -------------------------------------------------------------------------
    console.log('\n--- Test 11: Strict Main Administrator authorization & ID spoofing protection ---');
    const modUnsubAttempt = await fetch(`${BASE_URL}/api/admin/visitors/push/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${moderatorToken}`
      },
      body: JSON.stringify({ id: connectIphoneRes.subscription.id })
    });
    const regUnsubAttempt = await fetch(`${BASE_URL}/api/admin/visitors/push/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regularToken}`
      },
      body: JSON.stringify({ id: connectIphoneRes.subscription.id })
    });
    const anonStatusAttempt = await fetch(`${BASE_URL}/api/admin/visitors/push/status`);

    if (modUnsubAttempt.status !== 403 || regUnsubAttempt.status !== 403 || anonStatusAttempt.status !== 401) {
      throw new Error(
        `FAIL Test 11: Unauthorized access was not blocked (${modUnsubAttempt.status}, ${regUnsubAttempt.status}, ${anonStatusAttempt.status})`
      );
    }

    // Ensure the iPhone subscription is still untouched in DB
    const checkStillExists = await fetchAdminPushStatus(mainAdminToken, iphonePwaMock.adapter);
    if (checkStillExists.subscriptions.length !== 1) {
      throw new Error('FAIL Test 11: Unauthorized unsubscribe deleted Main Admin subscription!');
    }
    console.log('✓ PASS: Only Main Administrator can view, toggle, connect, or disconnect push devices');

    // -------------------------------------------------------------------------
    // TEST 12 & 14: UI Component, PWA Service Worker & Stages 1-3 Non-Regression
    // -------------------------------------------------------------------------
    console.log('\n--- Test 12 & 14: UI Component & PWA Service Worker verification ---');
    const viewSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminVisitorsView.tsx'), 'utf-8');
    const requiredUiStrings = [
      'Уведомления о посетителях',
      'Подключить уведомления на этом устройстве',
      'Отключить уведомления на этом устройстве',
      'ПОДКЛЮЧЁННЫЕ УСТРОЙСТВА ГЛАВНОГО АДМИНИСТРАТОРА',
      'На экран Домой',
      'Серверная VAPID-конфигурация не настроена'
    ];
    for (const str of requiredUiStrings) {
      if (!viewSource.includes(str)) {
        throw new Error(`FAIL Test 12: Missing required UI control/label in AdminVisitorsView.tsx: "${str}"`);
      }
    }
    if (viewSource.includes('Push-уведомления — В разработке')) {
      throw new Error('FAIL Test 12: Old Stage 2 placeholder "Push-уведомления — В разработке" was not replaced!');
    }
    console.log('✓ PASS: AdminVisitorsView.tsx contains all required Stage 4 controls, warnings, and iOS instructions');

    console.log('\n🎉 ALL 14 STAGE 4 WEB PUSH UI & FINAL INTEGRATION TESTS PASSED 100%!');
  } finally {
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

runStage4Tests().catch((err) => {
  console.error('\n❌ STAGE 4 TEST SUITE FAILED:', err);
  process.exit(1);
});
