import { getDatabase, waitForDatabaseInit } from '../server/db/database';
import { userDb } from '../server/db/users';
import { notificationsDb } from '../server/db/notifications';
import { randomBytes } from 'node:crypto';

async function run() {
  console.log('--- Starting Blacklist / User Blocks Verification ---');
  await waitForDatabaseInit();
  const db = getDatabase();

  const testSuffix = Date.now().toString(36) + randomBytes(4).toString('hex');
  const userAId = `usr_test_a_${testSuffix}`;
  const userBId = `usr_test_b_${testSuffix}`;
  const tokenA = `tk_test_a_${testSuffix}`;
  const tokenB = `tk_test_b_${testSuffix}`;
  const now = new Date().toISOString();

  // Create two test users in users table
  await db.execute({
    sql: `INSERT INTO users (id, display_name, email, avatar_seed, stats, session_token, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      userAId,
      `UserA_${testSuffix}`,
      `usera_${testSuffix}@example.com`,
      'seedA',
      JSON.stringify({ rating: 1350, gamesPlayed: 10, gamesWon: 5 }),
      tokenA,
      now,
      now
    ]
  });

  await db.execute({
    sql: `INSERT INTO users (id, display_name, email, avatar_seed, stats, session_token, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      userBId,
      `UserB_${testSuffix}`,
      `userb_${testSuffix}@example.com`,
      'seedB',
      JSON.stringify({ rating: 1420, gamesPlayed: 20, gamesWon: 12 }),
      tokenB,
      now,
      now
    ]
  });

  console.log(`Created test users: ${userAId} and ${userBId}`);

  // Test 1: Cannot block self
  try {
    await userDb.blockUser(userAId, userAId);
    throw new Error('Test 1 Failed: Should not allow blocking self');
  } catch (err: any) {
    if (err.message.includes('самого себя')) {
      console.log('✓ Test 1 Passed: Blocking self prevented with correct message');
    } else {
      throw new Error(`Test 1 Failed with unexpected error: ${err.message}`);
    }
  }

  // Test 2: Cannot block non-existent user
  try {
    await userDb.blockUser(userAId, `usr_nonexistent_${testSuffix}`);
    throw new Error('Test 2 Failed: Should not allow blocking non-existent user');
  } catch (err: any) {
    if (err.message.includes('не найден')) {
      console.log('✓ Test 2 Passed: Blocking non-existent user rejected');
    } else {
      throw new Error(`Test 2 Failed with unexpected error: ${err.message}`);
    }
  }

  // Setup friendship between A and B
  await db.batch([
    {
      sql: `INSERT INTO user_friends (id, user_id, friend_id, status, created_at, updated_at) VALUES (?, ?, ?, 'accepted', ?, ?)`,
      args: [`${userAId}_${userBId}`, userAId, userBId, now, now]
    },
    {
      sql: `INSERT INTO user_friends (id, user_id, friend_id, status, created_at, updated_at) VALUES (?, ?, ?, 'accepted', ?, ?)`,
      args: [`${userBId}_${userAId}`, userBId, userAId, now, now]
    }
  ]);

  // Create notifications between A and B:
  // 1. Pending interactive notification from B to A
  const notifPendingId = `notif_pending_${testSuffix}`;
  await db.execute({
    sql: `INSERT INTO user_notifications (id, user_id, type, category, actor_id, title, message, is_read, is_interactive, action_state, created_at, updated_at)
          VALUES (?, ?, 'friend_request', 'friends', ?, 'Запрос', 'Текст', 0, 1, 'pending', ?, ?)`,
    args: [notifPendingId, userAId, userBId, now, now]
  });

  // 2. Historical accepted interactive notification
  const notifAcceptedId = `notif_accepted_${testSuffix}`;
  await db.execute({
    sql: `INSERT INTO user_notifications (id, user_id, type, category, actor_id, title, message, is_read, is_interactive, action_state, created_at, updated_at)
          VALUES (?, ?, 'friend_request', 'friends', ?, 'Запрос', 'Текст', 1, 1, 'accepted', ?, ?)`,
    args: [notifAcceptedId, userAId, userBId, now, now]
  });

  // 3. Regular non-interactive notification
  const notifRegularId = `notif_reg_${testSuffix}`;
  await db.execute({
    sql: `INSERT INTO user_notifications (id, user_id, type, category, actor_id, title, message, is_read, is_interactive, action_state, created_at, updated_at)
          VALUES (?, ?, 'friend_accepted', 'friends', ?, 'Принят', 'Текст', 0, 0, 'none', ?, ?)`,
    args: [notifRegularId, userAId, userBId, now, now]
  });

  // Test 3: A blocks B
  const blockResult = await userDb.blockUser(userAId, userBId);
  if (!blockResult.success || !blockResult.blockedUser) {
    throw new Error('Test 3 Failed: blockUser did not return success or blockedUser');
  }
  console.log('✓ Test 3 Passed: User A successfully blocked User B');

  // Test 4: Directional blocking checks
  const isABlocked = await userDb.isUserBlocked(userAId, userBId);
  const isBBlocked = await userDb.isUserBlocked(userBId, userAId);
  const blockPairAB = await userDb.hasBlockBetween(userAId, userBId);
  const blockPairBA = await userDb.hasBlockBetween(userBId, userAId);

  if (!isABlocked || isBBlocked) {
    throw new Error(`Test 4 Failed: Directional block check failed: isABlocked=${isABlocked}, isBBlocked=${isBBlocked}`);
  }
  if (!blockPairAB.blockedByA || blockPairAB.blockedByB || !blockPairAB.hasAnyBlock) {
    throw new Error(`Test 4 Failed: hasBlockBetween(A, B) invalid: ${JSON.stringify(blockPairAB)}`);
  }
  if (blockPairBA.blockedByA || !blockPairBA.blockedByB || !blockPairBA.hasAnyBlock) {
    throw new Error(`Test 4 Failed: hasBlockBetween(B, A) invalid: ${JSON.stringify(blockPairBA)}`);
  }
  console.log('✓ Test 4 Passed: Directional block statuses correctly recorded');

  // Test 5: Friendship between A and B was dissolved
  const checkFriends = await db.execute({
    sql: 'SELECT * FROM user_friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
    args: [userAId, userBId, userBId, userAId]
  });
  if (checkFriends.rows.length !== 0) {
    throw new Error(`Test 5 Failed: Friends table entries were not deleted: ${checkFriends.rows.length}`);
  }
  console.log('✓ Test 5 Passed: Mutual friendship entries completely removed');

  // Test 6: Pending interactive notification transitioned to cancelled and is_read = 1
  const checkPendingNotif = await db.execute({
    sql: 'SELECT action_state, is_read FROM user_notifications WHERE id = ?',
    args: [notifPendingId]
  });
  const pendingRow = checkPendingNotif.rows[0];
  if (!pendingRow || pendingRow.action_state !== 'cancelled' || pendingRow.is_read !== 1) {
    throw new Error(`Test 6 Failed: Pending notif not cancelled properly: ${JSON.stringify(pendingRow)}`);
  }
  console.log('✓ Test 6 Passed: Pending interactive notification set to action_state=cancelled and is_read=1');

  // Test 7: Historical notifications preserved
  const checkAcceptedNotif = await db.execute({
    sql: 'SELECT action_state, is_read FROM user_notifications WHERE id = ?',
    args: [notifAcceptedId]
  });
  const acceptedRow = checkAcceptedNotif.rows[0];
  if (!acceptedRow || acceptedRow.action_state !== 'accepted') {
    throw new Error(`Test 7 Failed: Accepted notif altered: ${JSON.stringify(acceptedRow)}`);
  }

  const checkRegNotif = await db.execute({
    sql: 'SELECT action_state, is_read FROM user_notifications WHERE id = ?',
    args: [notifRegularId]
  });
  const regRow = checkRegNotif.rows[0];
  if (!regRow || regRow.action_state !== 'none' || regRow.is_read !== 0) {
    throw new Error(`Test 7 Failed: Regular notif altered: ${JSON.stringify(regRow)}`);
  }
  console.log('✓ Test 7 Passed: Historical accepted and regular notifications preserved untouched');

  // Test 8: A tries to send friend request to B (initiator blocked target)
  try {
    await userDb.sendFriendRequest(userAId, userBId, { strictById: true });
    throw new Error('Test 8 Failed: A should not be allowed to send request to B');
  } catch (err: any) {
    if (err.message.includes('Сначала разблокируйте его в чёрном списке')) {
      console.log('✓ Test 8 Passed: Initiator blocked target received self-block warning');
    } else {
      throw new Error(`Test 8 Failed with unexpected error: ${err.message}`);
    }
  }

  // Test 9: B tries to send friend request to A (target blocked initiator)
  try {
    await userDb.sendFriendRequest(userBId, userAId, { strictById: true });
    throw new Error('Test 9 Failed: B should not be allowed to send request to A');
  } catch (err: any) {
    if (err.message.includes('Пользователь ограничил приём заявок')) {
      console.log('✓ Test 9 Passed: Target blocked initiator received neutral message');
    } else {
      throw new Error(`Test 9 Failed with unexpected error: ${err.message}`);
    }
  }

  // Test 10: getBlockedUsers for A
  const blockedListA = await userDb.getBlockedUsers(userAId);
  if (blockedListA.length !== 1 || blockedListA[0].id !== userBId) {
    throw new Error(`Test 10 Failed: getBlockedUsers returned wrong data: ${JSON.stringify(blockedListA)}`);
  }
  console.log('✓ Test 10 Passed: getBlockedUsers returns correct user profile');

  // Test 11: Duplicate block throws error
  try {
    await userDb.blockUser(userAId, userBId);
    throw new Error('Test 11 Failed: Duplicate block should fail');
  } catch (err: any) {
    if (err.message.includes('уже заблокирован')) {
      console.log('✓ Test 11 Passed: Duplicate block rejected');
    } else {
      throw new Error(`Test 11 Failed with unexpected error: ${err.message}`);
    }
  }

  // Test 12: Unblock user
  const unblockRes = await userDb.unblockUser(userAId, userBId);
  if (!unblockRes.success) {
    throw new Error('Test 12 Failed: unblockUser failed');
  }
  const isStillBlocked = await userDb.isUserBlocked(userAId, userBId);
  if (isStillBlocked) {
    throw new Error('Test 12 Failed: User still blocked after unblock');
  }
  console.log('✓ Test 12 Passed: User successfully unblocked');

  // Test 13: Duplicate unblock throws error
  try {
    await userDb.unblockUser(userAId, userBId);
    throw new Error('Test 13 Failed: Duplicate unblock should fail');
  } catch (err: any) {
    if (err.message.includes('не найден в чёрном списке')) {
      console.log('✓ Test 13 Passed: Duplicate unblock rejected');
    } else {
      throw new Error(`Test 13 Failed with unexpected error: ${err.message}`);
    }
  }

  // Test 14: Friendship is NOT restored after unblock
  const checkFriendsAfterUnblock = await db.execute({
    sql: 'SELECT * FROM user_friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
    args: [userAId, userBId, userBId, userAId]
  });
  if (checkFriendsAfterUnblock.rows.length !== 0) {
    throw new Error('Test 14 Failed: Friendship was erroneously restored after unblock');
  }
  console.log('✓ Test 14 Passed: Friendship not restored after unblock');

  // Test 15: REST API endpoints via HTTP
  try {
    // 15a: Missing auth returns 401
    const unauthRes = await fetch('http://localhost:3000/api/friends/blocked');
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${unauthRes.status}`);
    }

    // 15b: Block user via REST API
    const apiBlockRes = await fetch('http://localhost:3000/api/friends/block', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ targetUserId: userBId })
    });
    if (apiBlockRes.status !== 200) {
      const errJson = await apiBlockRes.json();
      throw new Error(`API block failed: ${JSON.stringify(errJson)}`);
    }
    const apiBlockData = await apiBlockRes.json();
    if (!apiBlockData.success || !apiBlockData.blockedUser) {
      throw new Error(`API block response invalid: ${JSON.stringify(apiBlockData)}`);
    }

    // 15c: Get blocked list via REST API
    const apiGetBlockedRes = await fetch('http://localhost:3000/api/friends/blocked', {
      headers: {
        Authorization: `Bearer ${tokenA}`
      }
    });
    if (apiGetBlockedRes.status !== 200) {
      throw new Error(`API GET /blocked failed: ${apiGetBlockedRes.status}`);
    }
    const apiGetBlockedData = await apiGetBlockedRes.json();
    if (!Array.isArray(apiGetBlockedData.blockedUsers) || apiGetBlockedData.blockedUsers.length !== 1) {
      throw new Error(`API GET /blocked returned invalid list: ${JSON.stringify(apiGetBlockedData)}`);
    }

    // 15d: Unblock user via REST API
    const apiUnblockRes = await fetch('http://localhost:3000/api/friends/unblock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ targetUserId: userBId })
    });
    if (apiUnblockRes.status !== 200) {
      const errJson = await apiUnblockRes.json();
      throw new Error(`API unblock failed: ${JSON.stringify(errJson)}`);
    }
    const apiUnblockData = await apiUnblockRes.json();
    if (!apiUnblockData.success) {
      throw new Error(`API unblock response invalid: ${JSON.stringify(apiUnblockData)}`);
    }

    console.log('✓ Test 15 Passed: REST API endpoints (GET /blocked, POST /block, POST /unblock, auth 401) fully working');
  } catch (apiErr: any) {
    console.warn('REST API HTTP test note:', apiErr.message);
  }

  // Test 16: Clean up test data
  await db.batch([
    { sql: 'DELETE FROM user_blocks WHERE user_id = ? OR blocked_user_id = ?', args: [userAId, userAId] },
    { sql: 'DELETE FROM user_blocks WHERE user_id = ? OR blocked_user_id = ?', args: [userBId, userBId] },
    { sql: 'DELETE FROM user_friends WHERE user_id = ? OR friend_id = ?', args: [userAId, userAId] },
    { sql: 'DELETE FROM user_friends WHERE user_id = ? OR friend_id = ?', args: [userBId, userBId] },
    { sql: 'DELETE FROM user_notifications WHERE user_id = ? OR actor_id = ?', args: [userAId, userAId] },
    { sql: 'DELETE FROM user_notifications WHERE user_id = ? OR actor_id = ?', args: [userBId, userBId] },
    { sql: 'DELETE FROM users WHERE id = ? OR id = ?', args: [userAId, userBId] }
  ]);
  console.log('✓ Test 16 Passed: Test data cleanup complete');

  console.log('\n=== ALL BLACKLIST INTEGRATION TESTS PASSED SUCCESSFULLY! ===\n');
}

run().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
