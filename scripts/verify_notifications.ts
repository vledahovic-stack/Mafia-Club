import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { getDatabase } from '../server/db/database';
import { notificationsDb } from '../server/db/notifications';
import { userDb } from '../server/db/users';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

interface WsEventCollector {
  ws: WebSocket;
  messages: any[];
  waitForMessage: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
  close: () => void;
}

function connectWsUser(token: string, userId: string): Promise<WsEventCollector> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const messages: any[] = [];

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        messages.push(parsed);
      } catch {}
    });

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'INIT_USER',
        payload: { token, userId }
      }));
      const collector: WsEventCollector = {
        ws,
        messages,
        waitForMessage: (predicate, timeoutMs = 3000) => {
          return new Promise((res, rej) => {
            // Check existing
            for (const m of messages) {
              if (predicate(m)) return res(m);
            }
            const timer = setTimeout(() => {
              ws.off('message', onMsg);
              rej(new Error(`Timed out waiting for WS message matching condition (${timeoutMs}ms)`));
            }, timeoutMs);

            const onMsg = (data: any) => {
              try {
                const parsed = JSON.parse(data.toString());
                if (predicate(parsed)) {
                  clearTimeout(timer);
                  ws.off('message', onMsg);
                  res(parsed);
                }
              } catch {}
            };
            ws.on('message', onMsg);
          });
        },
        close: () => {
          try { ws.close(); } catch {}
        }
      };
      resolve(collector);
    });

    ws.on('error', (err) => reject(err));
  });
}

async function runNotificationsTests() {
  console.log('=== Verifying Stage 2.2: Notifications API, WebSocket & Friends Integration ===\n');

  const db = getDatabase();
  const timestamp = Date.now();
  const testUserA = `usr_test_a_${timestamp}`;
  const testUserB = `usr_test_b_${timestamp}`;
  const testUserC = `usr_test_c_${timestamp}`;
  const tokenA = `tok_a_${timestamp}`;
  const tokenB = `tok_b_${timestamp}`;
  const tokenC = `tok_c_${timestamp}`;
  const nowIso = new Date().toISOString();

  // Helper to create test user with session token in database
  async function createTestUser(id: string, name: string, email: string, token: string) {
    await db.execute({
      sql: `INSERT OR REPLACE INTO users (
        id, email, display_name, avatar_seed, session_token, role, is_admin, is_banned,
        stats, inventory, is_email_verified, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'user', 0, 0, '{}', '[]', 1, ?, ?)`,
      args: [id, email, name, name, token, nowIso, nowIso]
    });
  }

  let wsA: WsEventCollector | null = null;
  let wsB: WsEventCollector | null = null;

  try {
    await createTestUser(testUserA, 'Алиса Тестер', `${testUserA}@test.com`, tokenA);
    await createTestUser(testUserB, 'Борис Тестер', `${testUserB}@test.com`, tokenB);
    await createTestUser(testUserC, 'Виктор Тестер', `${testUserC}@test.com`, tokenC);

    // -------------------------------------------------------------------------
    // Scenario 1: Protection of Pending Interactive Actions (Both Read & Unread)
    // -------------------------------------------------------------------------
    console.log('1. Testing protection of pending interactive notifications (both read & unread)...');
    // Test customLimit = 3
    // Create 1 read plain info notification
    const n_read_info = await notificationsDb.createNotification(testUserC, {
      type: 'info',
      title: 'Обычное прочитанное',
      message: 'Тест',
      customLimit: 100
    });
    await notificationsDb.markAsRead(testUserC, n_read_info.id);

    // Create 1 unread plain info notification
    const n_unread_info = await notificationsDb.createNotification(testUserC, {
      type: 'info',
      title: 'Обычное непрочитанное',
      message: 'Тест 2',
      customLimit: 100
    });

    // Create 1 read but STILL PENDING interactive notification
    const n_read_pending = await notificationsDb.createNotification(testUserC, {
      type: 'friend_request',
      title: 'Прочитанная заявка в друзья',
      message: 'Игрок ожидает ответа',
      isInteractive: true,
      actionState: 'pending',
      customLimit: 100
    });
    await notificationsDb.markAsRead(testUserC, n_read_pending.id);

    // Create 1 unread pending interactive notification
    const n_unread_pending = await notificationsDb.createNotification(testUserC, {
      type: 'friend_request',
      title: 'Непрочитанная заявка в друзья',
      message: 'Игрок ждет ответа',
      isInteractive: true,
      actionState: 'pending',
      customLimit: 100
    });

    // Currently User C has 4 notifications:
    // 1) n_read_info (read, plain)
    // 2) n_unread_info (unread, plain)
    // 3) n_read_pending (read, PENDING action)
    // 4) n_unread_pending (unread, PENDING action)
    // Target limit = 2. Excess = 2.
    // Pruning priority must delete:
    // - Phase 1: n_read_info (read plain). MUST NOT delete n_read_pending!
    // - Phase 2: n_unread_info (unread plain).
    // Remaining notifications (2): n_read_pending and n_unread_pending!
    const prunedCount = await notificationsDb.pruneUserNotifications(testUserC, 2);
    assert.equal(prunedCount, 2, 'Should prune exactly 2 excess notifications');

    const cList = await notificationsDb.getUserNotifications(testUserC);
    assert.equal(cList.total, 2, 'User C should now have 2 notifications');

    const checkReadPending = await notificationsDb.getNotificationById(testUserC, n_read_pending.id);
    const checkUnreadPending = await notificationsDb.getNotificationById(testUserC, n_unread_pending.id);
    assert.ok(checkReadPending, 'Read pending interactive notification MUST be preserved!');
    assert.ok(checkUnreadPending, 'Unread pending interactive notification MUST be preserved!');

    const checkReadInfo = await notificationsDb.getNotificationById(testUserC, n_read_info.id);
    const checkUnreadInfo = await notificationsDb.getNotificationById(testUserC, n_unread_info.id);
    assert.equal(checkReadInfo, null, 'Read plain info notification must be pruned');
    assert.equal(checkUnreadInfo, null, 'Unread plain info notification must be pruned');

    // Clean up User C test notifications from Scenario 1
    await db.execute({
      sql: 'DELETE FROM user_notifications WHERE user_id = ?',
      args: [testUserC]
    });
    console.log('✅ 1. Protection of pending interactive actions (regardless of is_read) verified.');

    // -------------------------------------------------------------------------
    // Scenario 2: Friend Request Notification Creation & Live WS Delivery
    // -------------------------------------------------------------------------
    console.log('2. Testing POST /api/friends/request and live WS delivery (NOTIFICATION_NEW)...');
    // Connect User B to WebSocket
    wsB = await connectWsUser(tokenB, testUserB);

    // User A sends friend request to User B via HTTP API
    const reqPromise = wsB.waitForMessage(m => m.type === 'NOTIFICATION_NEW');

    const sendRes = await fetch(`${BASE_URL}/api/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ targetUserId: testUserB })
    });
    const sendData = await sendRes.json();
    assert.equal(sendRes.status, 200, `Expected 200, got ${sendRes.status}: ${JSON.stringify(sendData)}`);
    assert.equal(sendData.success, true);
    assert.equal(sendData.friend?.status, 'pending_sent');

    // Verify WebSocket delivery to User B
    const wsNotifEvent = await reqPromise;
    assert.equal(wsNotifEvent.type, 'NOTIFICATION_NEW');
    assert.equal(wsNotifEvent.payload.notification.type, 'friend_request');
    assert.equal(wsNotifEvent.payload.notification.actorId, testUserA);
    assert.equal(wsNotifEvent.payload.notification.actionState, 'pending');
    assert.equal(wsNotifEvent.payload.unreadCount, 1);

    console.log('✅ 2. Friend request created notification and delivered via WebSocket in real-time.');

    // -------------------------------------------------------------------------
    // Scenario 3: Offline Recipient Persistence
    // -------------------------------------------------------------------------
    console.log('3. Testing offline recipient notification persistence in DB...');
    // User C is currently offline (no WS connection)
    // User A sends friend request to User C
    const sendToCRes = await fetch(`${BASE_URL}/api/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ targetUserId: testUserC })
    });
    const sendToCData = await sendToCRes.json();
    assert.equal(sendToCRes.status, 200);

    // Verify User C can fetch the notification via REST API
    const cFetchRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${tokenC}` }
    });
    const cFetchData = await cFetchRes.json();
    assert.equal(cFetchRes.status, 200);
    assert.equal(cFetchData.total, 1);
    assert.equal(cFetchData.notifications[0].type, 'friend_request');
    assert.equal(cFetchData.notifications[0].actorId, testUserA);
    assert.equal(cFetchData.notifications[0].actionState, 'pending');

    console.log('✅ 3. Offline recipient notification safely stored and retrievable via REST API.');

    // -------------------------------------------------------------------------
    // Scenario 4: Duplicate Request Prevention
    // -------------------------------------------------------------------------
    console.log('4. Testing duplicate request prevention...');
    const dupRes = await fetch(`${BASE_URL}/api/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ targetUserId: testUserB })
    });
    assert.equal(dupRes.status, 400, 'Duplicate friend request should return 400 error');

    // Confirm User B still has only 1 notification
    const bCountRes = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const bCountData = await bCountRes.json();
    assert.equal(bCountData.unreadCount, 1, 'Duplicate request must not increment unread count');

    console.log('✅ 4. Duplicate request prevention verified.');

    // -------------------------------------------------------------------------
    // Scenario 5: Unauthorized Access & Cross-Account Isolation
    // -------------------------------------------------------------------------
    console.log('5. Testing API authorization and cross-account isolation...');
    const bNotifsRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const bNotifsData = await bNotifsRes.json();
    const notifB = bNotifsData.notifications[0];
    assert.ok(notifB, 'User B notification must exist');

    // 1) Unauthenticated request
    const noAuthRes = await fetch(`${BASE_URL}/api/notifications`);
    assert.equal(noAuthRes.status, 401);

    // 2) User A trying to read User B's notification
    const crossReadRes = await fetch(`${BASE_URL}/api/notifications/${notifB.id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(crossReadRes.status, 404, 'User A should receive 404 for User B notification');

    // 3) User A trying to delete User B's notification
    const crossDeleteRes = await fetch(`${BASE_URL}/api/notifications/${notifB.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(crossDeleteRes.status, 404, 'User A cannot delete User B notification');

    // 4) User A trying to execute action on User B's notification
    const crossActionRes = await fetch(`${BASE_URL}/api/notifications/${notifB.id}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ action: 'accept' })
    });
    assert.equal(crossActionRes.status, 404, 'User A cannot execute action on User B notification');

    console.log('✅ 5. Full cross-account authorization isolation verified.');

    // -------------------------------------------------------------------------
    // Scenario 6: Accept Friend Request via Notifications API
    // -------------------------------------------------------------------------
    console.log('6. Testing accepting request via POST /api/notifications/:id/action...');
    // Connect User A to WebSocket to verify FRIEND_REQUEST_ACCEPTED delivery
    wsA = await connectWsUser(tokenA, testUserA);
    const wsAPromise = wsA.waitForMessage(m => m.type === 'FRIEND_REQUEST_ACCEPTED');
    const wsBPromise = wsB!.waitForMessage(m => m.type === 'NOTIFICATION_UPDATE');

    const acceptRes = await fetch(`${BASE_URL}/api/notifications/${notifB.id}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({ action: 'accept' })
    });
    const acceptData = await acceptRes.json();
    assert.equal(acceptRes.status, 200, `Expected 200, got: ${JSON.stringify(acceptData)}`);
    assert.equal(acceptData.success, true);
    assert.equal(acceptData.notification.actionState, 'accepted');
    assert.equal(acceptData.unreadCount, 0);

    // Verify WebSocket notifications
    const wsAEvent = await wsAPromise;
    assert.equal(wsAEvent.type, 'FRIEND_REQUEST_ACCEPTED');

    const wsBEvent = await wsBPromise;
    assert.equal(wsBEvent.type, 'NOTIFICATION_UPDATE');
    assert.equal(wsBEvent.payload.notification.actionState, 'accepted');

    // Verify friendship is established in database
    const acceptedFriendsA = (await userDb.getFriends(testUserA)).filter(f => f.status === 'accepted');
    assert.equal(acceptedFriendsA.length, 1);
    assert.equal(acceptedFriendsA[0].id, testUserB);

    const acceptedFriendsB = (await userDb.getFriends(testUserB)).filter(f => f.status === 'accepted');
    assert.equal(acceptedFriendsB.length, 1);
    assert.equal(acceptedFriendsB[0].id, testUserA);

    console.log('✅ 6. Request accepted via Notifications API with mutual friendship established.');

    // -------------------------------------------------------------------------
    // Scenario 7: Protection Against Re-processing
    // -------------------------------------------------------------------------
    console.log('7. Testing re-processing protection on already accepted notification...');
    const reAcceptRes = await fetch(`${BASE_URL}/api/notifications/${notifB.id}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({ action: 'accept' })
    });
    const reAcceptData = await reAcceptRes.json();
    assert.equal(reAcceptRes.status, 400);
    assert.equal(reAcceptData.alreadyProcessed, true);

    const reDeclineRes = await fetch(`${BASE_URL}/api/notifications/${notifB.id}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({ action: 'decline' })
    });
    const reDeclineData = await reDeclineRes.json();
    assert.equal(reDeclineRes.status, 400);
    assert.equal(reDeclineData.alreadyProcessed, true);

    console.log('✅ 7. Re-processing protection strictly enforced.');

    // -------------------------------------------------------------------------
    // Scenario 8: Decline Friend Request via Notifications API
    // -------------------------------------------------------------------------
    console.log('8. Testing declining request via Notifications API...');
    // User B sends request to User C
    await fetch(`${BASE_URL}/api/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({ targetUserId: testUserC })
    });

    const cNotifsRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${tokenC}` }
    });
    const cNotifsData = await cNotifsRes.json();
    const reqFromB = cNotifsData.notifications.find((n: any) => n.actorId === testUserB);
    assert.ok(reqFromB, 'Notification from User B must exist for User C');

    // User C declines the request
    const declineRes = await fetch(`${BASE_URL}/api/notifications/${reqFromB.id}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenC}`
      },
      body: JSON.stringify({ action: 'decline' })
    });
    const declineData = await declineRes.json();
    assert.equal(declineRes.status, 200);
    assert.equal(declineData.success, true);
    assert.equal(declineData.notification.actionState, 'declined');

    // Confirm no friendship created
    const friendsOfC = await userDb.getFriends(testUserC);
    const relWithB = friendsOfC.find(f => f.id === testUserB);
    assert.equal(relWithB, undefined, 'No friendship should exist after decline');

    console.log('✅ 8. Decline via Notifications API successfully removed request without creating friendship.');

    // -------------------------------------------------------------------------
    // Scenario 9: Syncing When Handling via Existing Friends API
    // -------------------------------------------------------------------------
    console.log('9. Testing notification sync when accepting/declining via /api/friends/*...');
    // User B sends another request to User C
    // First, verify User C does not have pending request
    await fetch(`${BASE_URL}/api/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({ targetUserId: testUserC })
    });

    // User C accepts via /api/friends/accept (e.g. from FriendsView or table context menu)
    const friendsAcceptRes = await fetch(`${BASE_URL}/api/friends/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenC}`
      },
      body: JSON.stringify({ targetUserId: testUserB })
    });
    assert.equal(friendsAcceptRes.status, 200);

    // Verify User C notification was automatically synced to 'accepted'
    const cSyncedNotifs = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${tokenC}` }
    });
    const cSyncedData = await cSyncedNotifs.json();
    const syncedNotif = cSyncedData.notifications.find((n: any) => n.actorId === testUserB && n.type === 'friend_request');
    assert.ok(syncedNotif);
    assert.equal(syncedNotif.actionState, 'accepted', 'Notification must be synced to accepted');

    console.log('✅ 9. Notification state automatically synchronized when accepting via Friends API.');

    // -------------------------------------------------------------------------
    // Scenario 10: Unread Count, Mark Read, Read All, and Deletions
    // -------------------------------------------------------------------------
    console.log('10. Testing mark read, read all, and delete endpoints...');
    // Create 2 info notifications for User A
    const nA1 = await notificationsDb.createNotification(testUserA, { type: 'info', title: 'Inf 1', message: 'M1' });
    const nA2 = await notificationsDb.createNotification(testUserA, { type: 'info', title: 'Inf 2', message: 'M2' });

    const aCountRes1 = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const aCountData1 = await aCountRes1.json();
    assert.equal(aCountData1.unreadCount, 2);

    // Mark single as read
    const markRes = await fetch(`${BASE_URL}/api/notifications/${nA1.id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const markData = await markRes.json();
    assert.equal(markData.success, true);
    assert.equal(markData.unreadCount, 1);

    // Mark all as read
    const readAllRes = await fetch(`${BASE_URL}/api/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const readAllData = await readAllRes.json();
    assert.equal(readAllData.success, true);
    assert.equal(readAllData.unreadCount, 0);

    // Delete single
    const delSingleRes = await fetch(`${BASE_URL}/api/notifications/${nA1.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const delSingleData = await delSingleRes.json();
    assert.equal(delSingleData.success, true);

    // Delete all read
    const delAllRes = await fetch(`${BASE_URL}/api/notifications/read-all`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const delAllData = await delAllRes.json();
    assert.equal(delAllData.success, true);
    assert.equal(delAllData.deletedCount, 1); // nA2 was read

    console.log('✅ 10. Mark read, read all, delete single, and deleteAllRead verified.');

    // -------------------------------------------------------------------------
    // Scenario 11: Removing Friend Does Not Revert Old Notifications
    // -------------------------------------------------------------------------
    console.log('11. Testing that removing friend does not revert old notifications to pending...');
    // User A and User B are friends. User A removes User B
    const removeFriendRes = await fetch(`${BASE_URL}/api/friends/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ targetUserId: testUserB })
    });
    assert.equal(removeFriendRes.status, 200);

    // Check User B's historical notification
    const bCheckNotifs = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const bCheckData = await bCheckNotifs.json();
    const historicalNotif = bCheckData.notifications.find((n: any) => n.id === notifB.id);
    assert.ok(historicalNotif);
    assert.equal(historicalNotif.actionState, 'accepted', 'Historical notification must NOT revert to pending');

    console.log('✅ 11. Friend removal preserved historical notification state.');

    console.log('\n================================================================');
    console.log('🎉 ALL 11 STAGE 2.2 NOTIFICATIONS INTEGRATION TESTS PASSED (100%)');
    console.log('================================================================');
  } finally {
    if (wsA) wsA.close();
    if (wsB) wsB.close();

    // Clean up test data
    try {
      await db.execute({
        sql: 'DELETE FROM user_notifications WHERE user_id IN (?, ?, ?) OR actor_id IN (?, ?, ?)',
        args: [testUserA, testUserB, testUserC, testUserA, testUserB, testUserC]
      });
      await db.execute({
        sql: 'DELETE FROM user_friends WHERE user_id IN (?, ?, ?) OR friend_id IN (?, ?, ?)',
        args: [testUserA, testUserB, testUserC, testUserA, testUserB, testUserC]
      });
      await db.execute({
        sql: 'DELETE FROM users WHERE id IN (?, ?, ?)',
        args: [testUserA, testUserB, testUserC]
      });
    } catch {}
  }
}

runNotificationsTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Stage 2.2 Notifications test failed:', err);
    process.exit(1);
  });
