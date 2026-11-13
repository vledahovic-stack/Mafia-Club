import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getDatabase, initDatabase } from '../server/db/database';
import { userDb } from '../server/db/users';
import { clanDb } from '../server/db/clans';
import { RoomManager } from '../server/game/roomManager';
import {
  isEligibleCustomAvatarUserId,
  resolvePlayerAvatarView,
} from '../src/utils/avatarGalleryUi';

async function runStage4Verification() {
  console.log('=== Stage 4 Unified Player Avatar Verification ===');

  await initDatabase();
  const db = getDatabase();

  // 1. Verify pure UI resolution logic (resolvePlayerAvatarView & isEligibleCustomAvatarUserId)
  console.log('1. Testing resolvePlayerAvatarView & eligibility rules...');
  assert.equal(isEligibleCustomAvatarUserId('user-uuid-123'), true);
  assert.equal(isEligibleCustomAvatarUserId('guest_999'), false);
  assert.equal(isEligibleCustomAvatarUserId('bot_1'), false);
  assert.equal(isEligibleCustomAvatarUserId('bot-alpha'), false);
  assert.equal(isEligibleCustomAvatarUserId('system'), false);
  assert.equal(isEligibleCustomAvatarUserId(null), false);
  assert.equal(isEligibleCustomAvatarUserId(''), false);

  // Active custom avatar with cache-busting version
  const customActive = resolvePlayerAvatarView({
    userId: 'user-101',
    avatarSeed: '🕵️‍♂️',
    displayName: 'Комиссар Каттани',
    activeAvatarId: 'avatar-abc-1',
    imageLoadFailed: false,
  });
  assert.equal(customActive.kind, 'image');
  assert.equal(customActive.imageUrl, '/api/users/user-101/avatar?v=avatar-abc-1');

  // Cache-busting URL changes when user activates a different gallery image
  const customActiveSecond = resolvePlayerAvatarView({
    userId: 'user-101',
    avatarSeed: '🕵️‍♂️',
    displayName: 'Комиссар Каттани',
    activeAvatarId: 'avatar-abc-2',
    imageLoadFailed: false,
  });
  assert.equal(customActiveSecond.kind, 'image');
  assert.equal(customActiveSecond.imageUrl, '/api/users/user-101/avatar?v=avatar-abc-2');
  assert.notEqual(customActive.imageUrl, customActiveSecond.imageUrl);

  // Explicit activeAvatarId === null (switched back to standard emoji) should NOT request /api/users/:id/avatar even if tryLoadByUserId is true
  const switchedToEmoji = resolvePlayerAvatarView({
    userId: 'user-101',
    avatarSeed: '🦊',
    displayName: 'Комиссар Каттани',
    activeAvatarId: null,
    tryLoadByUserId: true,
    imageLoadFailed: false,
  });
  assert.equal(switchedToEmoji.kind, 'emoji');
  assert.equal(switchedToEmoji.imageUrl, null);
  assert.equal(switchedToEmoji.text, '🦊');

  // Unknown activeAvatarId (undefined) + tryLoadByUserId=true -> attempts /api/users/:id/avatar
  const tryByUserId = resolvePlayerAvatarView({
    userId: 'user-101',
    avatarSeed: '🦊',
    displayName: 'Комиссар Каттани',
    activeAvatarId: undefined,
    tryLoadByUserId: true,
    imageLoadFailed: false,
  });
  assert.equal(tryByUserId.kind, 'image');
  assert.equal(tryByUserId.imageUrl, '/api/users/user-101/avatar');

  // Fallback when imageLoadFailed=true -> falls back to emoji if valid short emoji seed exists
  const fallbackToEmoji = resolvePlayerAvatarView({
    userId: 'user-101',
    avatarSeed: '🦊',
    displayName: 'Комиссар Каттани',
    activeAvatarId: 'avatar-abc-1',
    imageLoadFailed: true,
  });
  assert.equal(fallbackToEmoji.kind, 'emoji');
  assert.equal(fallbackToEmoji.text, '🦊');

  // Fallback when imageLoadFailed=true and no emoji seed -> 'initials' or 'gangster'
  const fallbackToInitials = resolvePlayerAvatarView({
    userId: 'user-101',
    avatarSeed: 'long_legacy_seed_string',
    displayName: 'Дон Корлеоне',
    activeAvatarId: 'avatar-abc-1',
    fallbackMode: 'initials',
    imageLoadFailed: true,
  });
  assert.equal(fallbackToInitials.kind, 'initials');
  assert.equal(fallbackToInitials.text, 'Д');

  const fallbackToGangster = resolvePlayerAvatarView({
    userId: 'user-101',
    avatarSeed: 'long_legacy_seed_string',
    displayName: 'Дон Корлеоне',
    activeAvatarId: 'avatar-abc-1',
    fallbackMode: 'gangster',
    imageLoadFailed: true,
  });
  assert.equal(fallbackToGangster.kind, 'gangster');

  // Guests and bots never load custom avatar URLs
  const guestView = resolvePlayerAvatarView({
    userId: 'guest_abc123',
    avatarSeed: '🎭',
    displayName: 'Гость',
    activeAvatarId: 'should-be-ignored',
    tryLoadByUserId: true,
  });
  assert.equal(guestView.kind, 'emoji');
  assert.equal(guestView.imageUrl, null);

  const botView = resolvePlayerAvatarView({
    userId: 'bot_1',
    avatarSeed: '',
    displayName: 'Бот Марко',
    tryLoadByUserId: true,
    fallbackMode: 'gangster',
  });
  assert.equal(botView.kind, 'gangster');
  assert.equal(botView.imageUrl, null);

  console.log('   ✓ Pure UI avatar resolution passed');

  // 2. Verify backend endpoints/data structures propagate activeAvatarId and avatarSeed
  console.log('2. Testing database & API data structures (profile, friends, invites, blocks, clans)...');
  const suffix = crypto.randomBytes(4).toString('hex');
  const userAId = `stage4-user-a-${suffix}`;
  const userBId = `stage4-user-b-${suffix}`;
  const avatarIdA = `stage4-avatar-a-${suffix}`;
  const clanId = `stage4-clan-${suffix}`;
  const nowIso = new Date().toISOString();

  try {
    await db.execute({
      sql: `
        INSERT INTO users (id, email, password_hash, display_name, avatar_seed, active_avatar_id, created_at, updated_at)
        VALUES (?, ?, 'hash', ?, ?, ?, ?, ?)
      `,
      args: [userAId, `s4a_${suffix}@test.local`, `ИгрокА_${suffix}`, '🦁', null, nowIso, nowIso],
    });

    await db.execute({
      sql: `
        INSERT INTO users (id, email, password_hash, display_name, avatar_seed, active_avatar_id, created_at, updated_at)
        VALUES (?, ?, 'hash', ?, ?, ?, ?, ?)
      `,
      args: [userBId, `s4b_${suffix}@test.local`, `ИгрокБ_${suffix}`, '🐺', null, nowIso, nowIso],
    });

    await db.execute({
      sql: `
        INSERT INTO user_avatars (id, user_id, object_key, mime_type, byte_size, width, height, status, created_at, updated_at)
        VALUES (?, ?, ?, 'image/webp', 12345, 256, 256, 'ready', ?, ?)
      `,
      args: [avatarIdA, userAId, `users/${userAId}/avatars/${avatarIdA}.webp`, nowIso, nowIso],
    });

    await db.execute({
      sql: `UPDATE users SET active_avatar_id = ? WHERE id = ?`,
      args: [avatarIdA, userAId],
    });

    // 2a. Public player profile
    const pubProfileA = await userDb.getPublicPlayerProfile(userAId);
    assert.ok(pubProfileA, 'Public profile A must exist');
    assert.equal(pubProfileA.activeAvatarId, avatarIdA);
    assert.equal(pubProfileA.avatarSeed, '🦁');

    // 2b. Search players
    const searchRes = await userDb.searchPlayers(suffix, userBId);
    const foundA = searchRes.find((u) => u.id === userAId);
    assert.ok(foundA, 'Search should find User A');
    assert.equal(foundA.activeAvatarId, avatarIdA);
    assert.equal(foundA.avatarSeed, '🦁');

    // 2c. Friend request & Friends list
    const reqRes = await userDb.sendFriendRequest(userAId, `ИгрокБ_${suffix}`);
    assert.equal(reqRes.success, true);

    const friendsPendingInB = await userDb.getFriends(userBId);
    const pendingFromA = friendsPendingInB.find((f) => f.id === userAId);
    assert.ok(pendingFromA, 'Incoming friend request from User A must appear in User B list');
    assert.equal(pendingFromA.activeAvatarId, avatarIdA);

    const acceptRes = await userDb.acceptFriendRequest(userBId, userAId);
    assert.equal(acceptRes.success, true);

    const friendsOfB = await userDb.getFriends(userBId);
    const friendAInB = friendsOfB.find((f) => f.id === userAId);
    assert.ok(friendAInB, 'User A must appear in User B friends list');
    assert.equal(friendAInB.activeAvatarId, avatarIdA);
    assert.equal(friendAInB.avatarSeed, '🦁');

    // 2d. Room invitations
    const invite = await userDb.createRoomInvite(userAId, userBId, 'RM42', 'Комната Тест', false);
    assert.equal(invite.fromUserActiveAvatarId, avatarIdA);
    assert.equal(invite.fromUserAvatar, '🦁');

    const pendingInvites = await userDb.getPendingRoomInvites(userBId);
    const foundInvite = pendingInvites.find((inv) => inv.id === invite.id);
    assert.ok(foundInvite, 'Pending invite must be returned');
    assert.equal(foundInvite.fromUserActiveAvatarId, avatarIdA);

    // 2e. Clans member enrichment
    const membersJson = JSON.stringify([
      {
        userId: userAId,
        displayName: `ИгрокА_${suffix}`,
        avatarSeed: '🦁',
        role: 'leader',
        joinedAt: nowIso,
        contributionPoints: 0,
      },
    ]);
    await db.execute({
      sql: `
        INSERT INTO clans (id, name, tag, description, avatar_url, rating, leader_id, leader_name, members, created_at, updated_at)
        VALUES (?, ?, ?, 'Test clan', '⚔️', 1000, ?, ?, ?, ?, ?)
      `,
      args: [clanId, `Clan_${suffix}`, suffix.slice(0, 4).toUpperCase(), userAId, `ИгрокА_${suffix}`, membersJson, nowIso, nowIso],
    });

    const clan = await clanDb.getClanById(clanId);
    assert.ok(clan, 'Clan must exist');
    const leaderMember = clan.members.find((m) => m.userId === userAId);
    assert.ok(leaderMember, 'Leader member must exist in clan');
    assert.equal(leaderMember.activeAvatarId, avatarIdA);
    assert.equal(leaderMember.avatarSeed, '🦁');

    // 2f. Blocked users list
    await userDb.blockUser(userBId, userAId);
    const blockedByB = await userDb.getBlockedUsers(userBId);
    const blockedA = blockedByB.find((b) => b.id === userAId);
    assert.ok(blockedA, 'Blocked User A must be returned');
    assert.equal(blockedA.activeAvatarId, avatarIdA);

    console.log('   ✓ Database & API data structures passed');

    // 3. Verify RoomManager state & live syncUserAvatar
    console.log('3. Testing RoomManager state propagation & live syncUserAvatar...');
    const roomManager = new RoomManager();
    const room = roomManager.createRoom('Тестовый стол', userBId, `ИгрокБ_${suffix}`, undefined, true);
    room.state.players[0].avatarSeed = '🐺';
    room.state.players[0].activeAvatarId = null;

    // Seat User A as non-host player with activeAvatarId
    room.state.players.push({
      id: userAId,
      name: `ИгрокА_${suffix}`,
      avatarSeed: '🦁',
      activeAvatarId: avatarIdA,
      isHost: false,
      isBot: false,
      isRegistered: true,
      isAlive: true,
      connected: true,
      ready: true,
      warningsCount: 0,
      clanTag: null,
      clanName: null,
    });

    const initialClientState = room.getClientState(userAId);
    const clientPlayerA = initialClientState.players.find((p) => p.id === userAId);
    assert.ok(clientPlayerA);
    assert.equal(clientPlayerA.avatarSeed, '🦁');
    assert.equal(clientPlayerA.activeAvatarId, avatarIdA);

    // Switch non-host player A -> spectator -> player preserves avatarSeed & activeAvatarId
    const toSpecOk = room.becomeSpectatorFromPlayer(userAId);
    assert.equal(toSpecOk, true);
    const specA = room.spectators.get(userAId);
    assert.ok(specA, 'Spectator A must exist');
    assert.equal(specA.avatarSeed, '🦁');
    assert.equal(specA.activeAvatarId, avatarIdA);

    const toPlayerOk = await room.becomePlayerFromSpectator(userAId, `ИгрокА_${suffix}`);
    assert.equal(toPlayerOk, true);
    const seatedA = room.state.players.find((p) => p.id === userAId);
    assert.ok(seatedA, 'Player A must be seated again');
    assert.equal(seatedA.avatarSeed, '🦁');
    assert.equal(seatedA.activeAvatarId, avatarIdA);

    // Live avatar update via syncUserAvatar (e.g. switching to standard emoji or new gallery image)
    let broadcastCalled = false;
    const origBroadcast = room.broadcastState.bind(room);
    room.broadcastState = () => {
      broadcastCalled = true;
      origBroadcast();
    };

    const updatedRooms = roomManager.syncUserAvatar(userAId, '🦊', null);
    assert.equal(updatedRooms, 1);
    assert.equal(broadcastCalled, true);

    const updatedSeatedA = room.state.players.find((p) => p.id === userAId);
    assert.ok(updatedSeatedA);
    assert.equal(updatedSeatedA.avatarSeed, '🦊');
    assert.equal(updatedSeatedA.activeAvatarId, null);

    roomManager.removeRoom(room.state.roomCode);
    console.log('   ✓ RoomManager live avatar sync passed');
  } finally {
    await db.execute({ sql: `DELETE FROM clans WHERE id = ?`, args: [clanId] });
    await db.execute({
      sql: `DELETE FROM room_invites WHERE from_user_id IN (?, ?) OR to_user_id IN (?, ?)`,
      args: [userAId, userBId, userAId, userBId],
    });
    await db.execute({
      sql: `DELETE FROM user_blocks WHERE user_id IN (?, ?) OR blocked_user_id IN (?, ?)`,
      args: [userAId, userBId, userAId, userBId],
    });
    await db.execute({
      sql: `DELETE FROM user_friends WHERE user_id IN (?, ?) OR friend_id IN (?, ?)`,
      args: [userAId, userBId, userAId, userBId],
    });
    await db.execute({
      sql: `DELETE FROM user_avatars WHERE user_id IN (?, ?)`,
      args: [userAId, userBId],
    });
    await db.execute({
      sql: `DELETE FROM users WHERE id IN (?, ?)`,
      args: [userAId, userBId],
    });
  }

  console.log('=== All Stage 4 checks passed successfully! ===');
}

runStage4Verification().catch((err) => {
  console.error('Stage 4 verification failed:', err);
  process.exit(1);
});
