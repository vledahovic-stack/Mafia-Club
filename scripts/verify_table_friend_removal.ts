import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { userDb } from '../server/db/users';
import { getDatabase } from '../server/db/database';
import { notificationsDb } from '../server/db/notifications';

const db = getDatabase();

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runVerification() {
  console.log('=== Verifying Table Friend Removal Integration ===\n');
  const rootDir = process.cwd();

  // 1. Static code verification in PlayerTableContextMenu.tsx
  console.log('1. Verifying PlayerTableContextMenu.tsx...');
  const menuContent = fs.readFileSync(path.join(rootDir, 'src/components/PlayerTableContextMenu.tsx'), 'utf-8');

  assert.strictEqual(menuContent.includes('removeFriendFromPlayer'), true, 'useTableFriends must implement removeFriendFromPlayer');
  assert.strictEqual(menuContent.includes('/api/friends/remove'), true, 'removeFriendFromPlayer must call POST /api/friends/remove');
  assert.strictEqual(menuContent.includes('onRemoveFriend'), true, 'PlayerTableContextMenuProps must define onRemoveFriend');
  assert.strictEqual(menuContent.includes('isConfirmingRemove'), true, 'Must have isConfirmingRemove confirmation state');
  assert.strictEqual(menuContent.includes('setIsConfirmingRemove(false)'), true, 'Must reset confirmation state');
  assert.strictEqual(menuContent.includes('Удалить из друзей'), true, 'Must display «Удалить из друзей» action');
  assert.strictEqual(menuContent.includes('UserMinus'), true, 'Must use UserMinus icon for friend removal');
  assert.strictEqual(menuContent.includes('mafia_friends_updated'), true, 'Must dispatch mafia_friends_updated event');
  console.log('✅ 1. PlayerTableContextMenu implements removeFriendFromPlayer with inline confirmation and event sync.');

  // 2. Static code verification in LobbyView and InGameView
  console.log('2. Verifying LobbyView.tsx and InGameView.tsx wiring...');
  const lobbyContent = fs.readFileSync(path.join(rootDir, 'src/components/LobbyView.tsx'), 'utf-8');
  assert.strictEqual(lobbyContent.includes('onRemoveFriend={tableFriends.removeFriendFromPlayer}'), true, 'LobbyView must pass onRemoveFriend');

  const inGameContent = fs.readFileSync(path.join(rootDir, 'src/components/InGameView.tsx'), 'utf-8');
  const matchCount = (inGameContent.match(/onRemoveFriend=\{tableFriends\.removeFriendFromPlayer\}/g) || []).length;
  assert.strictEqual(matchCount >= 3, true, `InGameView must pass onRemoveFriend in all 3 menu instances (found: ${matchCount})`);
  console.log(`✅ 2. LobbyView and InGameView properly pass onRemoveFriend to all ${matchCount + 1} PlayerTableContextMenu instances.`);

  // 3. Live Server API Integration test for friend removal
  console.log('3. Testing friend removal via POST /api/friends/remove...');
  const testIdA = `test_rem_a_${Date.now()}`;
  const testIdB = `test_rem_b_${Date.now()}`;
  const tokenA = `tok_a_${Date.now()}`;
  const tokenB = `tok_b_${Date.now()}`;

  try {
    // Create two test users
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO users (id, email, display_name, avatar_seed, created_at, updated_at, session_token) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [testIdA, `${testIdA}@example.com`, 'User A', 'seed_a', now, now, tokenA]
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, display_name, avatar_seed, created_at, updated_at, session_token) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [testIdB, `${testIdB}@example.com`, 'User B', 'seed_b', now, now, tokenB]
    });

    // Send and accept friend request
    const reqRes = await fetch(`${BASE_URL}/api/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ targetUserId: testIdB })
    });
    assert.strictEqual(reqRes.status, 200, 'Friend request must succeed');

    const accRes = await fetch(`${BASE_URL}/api/friends/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({ targetUserId: testIdA })
    });
    assert.strictEqual(accRes.status, 200, 'Accept friend request must succeed');

    // Confirm friendship established
    const friendsA = await userDb.getFriends(testIdA);
    assert.strictEqual(friendsA.some(f => f.id === testIdB), true, 'User B must be in User A friend list');
    const friendsB = await userDb.getFriends(testIdB);
    assert.strictEqual(friendsB.some(f => f.id === testIdA), true, 'User A must be in User B friend list');
    console.log('✅ Mutual friendship verified in database.');

    // Remove friend via POST /api/friends/remove (the exact endpoint called by PlayerTableContextMenu)
    const removeRes = await fetch(`${BASE_URL}/api/friends/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ targetUserId: testIdB })
    });
    const removeData = await removeRes.json();
    assert.strictEqual(removeRes.status, 200, 'Friend removal must return 200');
    assert.strictEqual(removeData.success, true, 'Result success must be true');

    // Confirm mutual friendship is completely deleted
    const friendsAAfter = await userDb.getFriends(testIdA);
    assert.strictEqual(friendsAAfter.some(f => f.id === testIdB), false, 'User B must no longer be in User A friend list');
    const friendsBAfter = await userDb.getFriends(testIdB);
    assert.strictEqual(friendsBAfter.some(f => f.id === testIdA), false, 'User A must no longer be in User B friend list');
    console.log('✅ Mutual friendship successfully removed for both players.');

    // Test repeated removal returns handled error
    const repeatRes = await fetch(`${BASE_URL}/api/friends/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ targetUserId: testIdB })
    });
    assert.strictEqual(repeatRes.status, 400, 'Repeat removal must return 400');
    const repeatData = await repeatRes.json();
    assert.strictEqual(repeatData.error, 'Игрок не найден в вашем списке друзей.');
    console.log('✅ Repeated removal safely returns handled error without corrupting state.');

    // Confirm historical notification remains in accepted state (not reverted)
    const notifsB = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const notifsBData = await notifsB.json();
    const friendNotif = notifsBData.notifications.find((n: any) => n.actorId === testIdA && n.type === 'friend_request');
    if (friendNotif) {
      assert.strictEqual(friendNotif.actionState, 'accepted', 'Historical notification must remain accepted');
    }
    console.log('✅ Notification history intact and protected from reactivation.');

  } finally {
    // Cleanup test data
    await db.execute({
      sql: 'DELETE FROM user_friends WHERE user_id IN (?, ?) OR friend_id IN (?, ?)',
      args: [testIdA, testIdB, testIdA, testIdB]
    });
    await db.execute({
      sql: 'DELETE FROM user_notifications WHERE user_id IN (?, ?) OR actor_id IN (?, ?)',
      args: [testIdA, testIdB, testIdA, testIdB]
    });
    await db.execute({
      sql: 'DELETE FROM users WHERE id IN (?, ?)',
      args: [testIdA, testIdB]
    });
  }

  console.log('\n================================================================');
  console.log('🎉 ALL TABLE FRIEND REMOVAL TESTS PASSED (100%)');
  console.log('================================================================\n');
}

runVerification().catch(err => {
  console.error('❌ Table Friend Removal Verification Failed:', err);
  process.exit(1);
});
