import { initDatabase, waitForDatabaseInit, getDatabase } from '../server/db/database';
import { userDb } from '../server/db/users';
import { premiumDb } from '../server/db/premium';
import { dailyBonusDb } from '../server/db/dailyBonus';
import { itemsDb } from '../server/db/items';

async function runDailyBonusIntegrationTests() {
  console.log('--- STARTING PREMIUM DAILY BONUS INTEGRATION TESTS (STAGE 2) ---');

  initDatabase();
  await waitForDatabaseInit();
  const db = getDatabase();
  await premiumDb.ensureSeed();
  await dailyBonusDb.ensureSeed();
  await itemsDb.ensureSeed();

  const cleanupUserIds: string[] = [];

  async function createTestUser(prefix: string, streak: number = 0, credits: number = 100): Promise<string> {
    const id = `test_${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    await db.execute({
      sql: `
        INSERT INTO users (id, email, display_name, avatar_seed, credits, daily_bonus_streak, inventory, created_at, updated_at)
        VALUES (?, ?, ?, 'seed1', ?, ?, '[]', ?, ?)
      `,
      args: [id, `${id}@test.local`, `Player_${prefix}`, credits, streak, nowIso, nowIso]
    });
    cleanupUserIds.push(id);
    return id;
  }

  async function setTestUserPremium(userId: string, tier: 'bronze' | 'silver' | 'gold', hoursFromNow: number = 24) {
    const now = Date.now();
    const expiresAt = new Date(now + hoursFromNow * 3600 * 1000).toISOString();
    const activatedAt = new Date(now).toISOString();
    await db.execute({
      sql: `
        INSERT INTO user_premium_status (user_id, tier, activated_at, expires_at, source, certificate_id, updated_at)
        VALUES (?, ?, ?, ?, 'admin', 'test_cert', ?)
        ON CONFLICT(user_id) DO UPDATE SET
          tier = excluded.tier,
          activated_at = excluded.activated_at,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `,
      args: [userId, tier, activatedAt, expiresAt, activatedAt]
    });
  }

  try {
    // Ensure standard chest exists for tests (e.g. 'chest_novice')
    const noviceChest = await itemsDb.getItemById('chest_novice');
    if (!noviceChest) {
      throw new Error('Required item chest_novice not found in itemsDb!');
    }

    // Configure initial tiers for tests:
    // Bronze: doubleCredits = true, dailyLootbox = false
    // Silver: doubleCredits = false, dailyLootbox = true, lootboxItemId = 'chest_novice'
    // Gold: doubleCredits = true, dailyLootbox = true, lootboxItemId = 'chest_novice'
    await premiumDb.updateConfig({
      bronze: { doubleDailyBonusCredits: true, dailyLootboxEnabled: false, dailyLootboxItemId: null },
      silver: { doubleDailyBonusCredits: false, dailyLootboxEnabled: true, dailyLootboxItemId: 'chest_novice' },
      gold: { doubleDailyBonusCredits: true, dailyLootboxEnabled: true, dailyLootboxItemId: 'chest_novice' }
    }, 'test_runner');

    const config = await dailyBonusDb.getConfig();
    const day1BaseCredits = Math.round((config.days[0]?.credits || 50) * config.multiplier);
    console.log(`✓ Daily bonus config loaded. Day 1 base credits = ${day1BaseCredits}`);

    // TEST 1: User without Premium gets normal reward
    console.log('\n--- TEST 1: User WITHOUT Premium ---');
    const u1Id = await createTestUser('no_prem');
    const res1 = await userDb.claimDailyBonus(u1Id);
    if (res1.rewardCredits !== day1BaseCredits) {
      throw new Error(`Expected normal credits ${day1BaseCredits}, got ${res1.rewardCredits}`);
    }
    if (res1.isPremiumDoubled !== false) {
      throw new Error(`Expected isPremiumDoubled false, got ${res1.isPremiumDoubled}`);
    }
    if (res1.premiumLootboxItem !== undefined) {
      throw new Error(`Expected no premiumLootboxItem, got ${JSON.stringify(res1.premiumLootboxItem)}`);
    }
    if (res1.user.inventory.length !== 0) {
      throw new Error(`Expected empty inventory on day 1, got ${res1.user.inventory.length}`);
    }
    console.log(`✓ Test 1 passed: Normal player got ${res1.rewardCredits} credits, 0 lootboxes, streak ${res1.claimedDay}.`);

    // TEST 2: Bronze gets doubled credits, 0 lootboxes
    console.log('\n--- TEST 2: Bronze Tier ---');
    const u2Id = await createTestUser('bronze');
    await setTestUserPremium(u2Id, 'bronze', 24);
    const res2 = await userDb.claimDailyBonus(u2Id);
    const expectedBronzeCredits = day1BaseCredits * 2;
    if (res2.rewardCredits !== expectedBronzeCredits) {
      throw new Error(`Expected Bronze credits ${expectedBronzeCredits}, got ${res2.rewardCredits}`);
    }
    if (res2.isPremiumDoubled !== true) {
      throw new Error(`Expected isPremiumDoubled true, got ${res2.isPremiumDoubled}`);
    }
    if (res2.premiumLootboxItem !== undefined) {
      throw new Error('Bronze should NOT receive a lootbox when disabled in config!');
    }
    if (res2.user.inventory.length !== 0) {
      throw new Error('Bronze inventory should have 0 items on day 1!');
    }
    console.log(`✓ Test 2 passed: Bronze got ${res2.rewardCredits} credits (doubled), 0 lootboxes.`);

    // TEST 3: Silver gets normal credits and 1 lootbox
    console.log('\n--- TEST 3: Silver Tier ---');
    const u3Id = await createTestUser('silver');
    await setTestUserPremium(u3Id, 'silver', 24);
    const res3 = await userDb.claimDailyBonus(u3Id);
    if (res3.rewardCredits !== day1BaseCredits) {
      throw new Error(`Expected Silver credits ${day1BaseCredits}, got ${res3.rewardCredits}`);
    }
    if (res3.isPremiumDoubled === true) {
      throw new Error('Silver should NOT have doubled credits with default config!');
    }
    if (!res3.premiumLootboxItem || res3.premiumLootboxItem.id !== 'chest_novice') {
      throw new Error(`Expected Silver to receive chest_novice, got ${res3.premiumLootboxItem?.id}`);
    }
    if (res3.user.inventory.length !== 1 || res3.user.inventory[0].itemId !== 'chest_novice') {
      throw new Error('Silver inventory must contain exactly 1 chest_novice!');
    }
    console.log(`✓ Test 3 passed: Silver got ${res3.rewardCredits} credits (normal) and 1 chest_novice.`);

    // TEST 4: Gold gets doubled credits and 1 lootbox
    console.log('\n--- TEST 4: Gold Tier ---');
    const u4Id = await createTestUser('gold');
    await setTestUserPremium(u4Id, 'gold', 24);
    const res4 = await userDb.claimDailyBonus(u4Id);
    const expectedGoldCredits = day1BaseCredits * 2;
    if (res4.rewardCredits !== expectedGoldCredits) {
      throw new Error(`Expected Gold credits ${expectedGoldCredits}, got ${res4.rewardCredits}`);
    }
    if (res4.isPremiumDoubled !== true) {
      throw new Error('Gold should have isPremiumDoubled = true!');
    }
    if (!res4.premiumLootboxItem || res4.premiumLootboxItem.id !== 'chest_novice') {
      throw new Error(`Expected Gold to receive chest_novice, got ${res4.premiumLootboxItem?.id}`);
    }
    if (res4.user.inventory.length !== 1 || res4.user.inventory[0].itemId !== 'chest_novice') {
      throw new Error('Gold inventory must contain exactly 1 chest_novice!');
    }
    console.log(`✓ Test 4 passed: Gold got ${res4.rewardCredits} credits (doubled) and 1 chest_novice.`);

    // TEST 5: Independent flags control behavior (e.g. Bronze with dailyLootboxEnabled = true)
    console.log('\n--- TEST 5: Independent Tier Flags ---');
    await premiumDb.updateConfig({
      bronze: { doubleDailyBonusCredits: false, dailyLootboxEnabled: true, dailyLootboxItemId: 'chest_novice' }
    }, 'test_runner');
    const u5Id = await createTestUser('custom_bronze');
    await setTestUserPremium(u5Id, 'bronze', 24);
    const res5 = await userDb.claimDailyBonus(u5Id);
    if (res5.rewardCredits !== day1BaseCredits) {
      throw new Error(`Custom Bronze should NOT double credits when flag is false! Got: ${res5.rewardCredits}`);
    }
    if (!res5.premiumLootboxItem || res5.user.inventory.length !== 1) {
      throw new Error('Custom Bronze should have received lootbox because flag is true!');
    }
    console.log('✓ Test 5 passed: Custom Bronze behavior is strictly governed by config flags, not tier name.');

    // Reset config back to standard
    await premiumDb.updateConfig({
      bronze: { doubleDailyBonusCredits: true, dailyLootboxEnabled: false, dailyLootboxItemId: null }
    }, 'test_runner');

    // TEST 6: When dailyLootboxItemId = null or non-existent, other rewards work normally
    console.log('\n--- TEST 6: dailyLootboxItemId is null or non-existent ---');
    await premiumDb.updateConfig({
      silver: { doubleDailyBonusCredits: false, dailyLootboxEnabled: true, dailyLootboxItemId: null }
    }, 'test_runner');
    const u6Id = await createTestUser('null_lb');
    await setTestUserPremium(u6Id, 'silver', 24);
    const res6 = await userDb.claimDailyBonus(u6Id);
    if (res6.rewardCredits !== day1BaseCredits) {
      throw new Error(`Expected normal credits ${day1BaseCredits}, got ${res6.rewardCredits}`);
    }
    if (res6.premiumLootboxItem !== undefined) {
      throw new Error('Lootbox should be skipped when dailyLootboxItemId is null!');
    }
    if (res6.user.inventory.length !== 0) {
      throw new Error('Inventory should be empty when lootbox is skipped!');
    }
    console.log('✓ Test 6 passed: dailyLootboxItemId = null safely skips lootbox and grants normal credits.');

    // Restore Silver
    await premiumDb.updateConfig({
      silver: { doubleDailyBonusCredits: false, dailyLootboxEnabled: true, dailyLootboxItemId: 'chest_novice' }
    }, 'test_runner');

    // TEST 7: Day 7 standard item is NEVER doubled
    console.log('\n--- TEST 7: Day 7 standard item is NOT doubled ---');
    const u7Id = await createTestUser('day7_gold', 6); // streak 6 -> targetDay 7
    await setTestUserPremium(u7Id, 'gold', 24);
    const res7 = await userDb.claimDailyBonus(u7Id);
    if (res7.claimedDay !== 7) {
      throw new Error(`Expected target day 7, got ${res7.claimedDay}`);
    }
    const day7BaseCredits = Math.round((config.days[6]?.credits || 500) * config.multiplier);
    const expectedDay7Credits = day7BaseCredits * 2;
    if (res7.rewardCredits !== expectedDay7Credits) {
      throw new Error(`Expected doubled day 7 credits ${expectedDay7Credits}, got ${res7.rewardCredits}`);
    }
    if (!res7.bonusItem) {
      throw new Error('Day 7 standard bonusItem should be granted!');
    }
    if (!res7.premiumLootboxItem) {
      throw new Error('Day 7 Gold premiumLootboxItem should be granted!');
    }
    // Check inventory: 1 standard item + 1 premium lootbox item
    const totalChestsInInv = res7.user.inventory.reduce((sum, item) => sum + item.quantity, 0);
    if (totalChestsInInv !== 2) {
      throw new Error(`Expected exactly 2 total items in inventory (1 day7 + 1 premium lootbox), got ${totalChestsInInv}`);
    }
    console.log(`✓ Test 7 passed: Day 7 item was granted strictly in 1 quantity, not doubled; Gold granted 2 items total (1 regular + 1 premium lootbox).`);

    // TEST 8: Expired Premium gives NO benefits
    console.log('\n--- TEST 8: Expired Premium ---');
    const u8Id = await createTestUser('expired_prem');
    await setTestUserPremium(u8Id, 'gold', -2); // expired 2 hours ago
    const res8 = await userDb.claimDailyBonus(u8Id);
    if (res8.rewardCredits !== day1BaseCredits) {
      throw new Error(`Expired premium received doubled credits! Got ${res8.rewardCredits}, expected ${day1BaseCredits}`);
    }
    if (res8.premiumLootboxItem !== undefined) {
      throw new Error('Expired premium received a premium lootbox!');
    }
    console.log('✓ Test 8 passed: Expired Premium received exactly standard rewards, 0 perks.');

    // TEST 9: Activating Premium AFTER claiming does NOT allow re-claim or re-calculation
    console.log('\n--- TEST 9: Activating Premium after claim ---');
    const u9Id = await createTestUser('late_act');
    const res9 = await userDb.claimDailyBonus(u9Id);
    const initialCredits = res9.user.credits;

    // Activate Gold premium AFTER claiming
    await setTestUserPremium(u9Id, 'gold', 24);

    // Attempt second claim
    let threwDuplicateError = false;
    try {
      await userDb.claimDailyBonus(u9Id);
    } catch (err: any) {
      threwDuplicateError = true;
      if (!err.message.includes('уже получили награду')) {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
    }
    if (!threwDuplicateError) {
      throw new Error('Subsequent claim on same day must be rejected!');
    }
    // Verify credits in DB did not change
    const u9After = await userDb.getUserById(u9Id);
    if (u9After?.credits !== initialCredits) {
      throw new Error(`Credits changed after failed claim! Old: ${initialCredits}, New: ${u9After?.credits}`);
    }
    console.log('✓ Test 9 passed: Late Premium activation does not permit re-claiming or retroactive recalculation.');

    // TEST 10: Concurrent parallel requests do not create duplicate rewards
    console.log('\n--- TEST 10: Concurrent parallel requests ---');
    const u10Id = await createTestUser('parallel_user');
    await setTestUserPremium(u10Id, 'gold', 24);

    const parallelResults = await Promise.allSettled([
      userDb.claimDailyBonus(u10Id),
      userDb.claimDailyBonus(u10Id),
      userDb.claimDailyBonus(u10Id)
    ]);

    const fulfilled = parallelResults.filter(r => r.status === 'fulfilled');
    const rejected = parallelResults.filter(r => r.status === 'rejected');

    if (fulfilled.length !== 1) {
      throw new Error(`Expected exactly 1 parallel claim to succeed, got ${fulfilled.length}!`);
    }
    if (rejected.length !== 2) {
      throw new Error(`Expected 2 parallel claims to be rejected, got ${rejected.length}!`);
    }
    const u10Final = await userDb.getUserById(u10Id);
    if (u10Final?.dailyBonusStreak !== 1) {
      throw new Error(`Expected streak 1, got ${u10Final?.dailyBonusStreak}`);
    }
    console.log(`✓ Test 10 passed: Exactly 1 concurrent request succeeded, 2 were blocked by mutex/optimistic locking.`);

    // TEST 11: Granted lootboxes receive valid immutable rule snapshots
    console.log('\n--- TEST 11: Lootbox ruleSnapshot validity ---');
    const grantedSlot = res4.user.inventory.find(i => i.itemId === 'chest_novice');
    if (!grantedSlot || !grantedSlot.ruleSnapshot) {
      throw new Error('Granted lootbox is missing ruleSnapshot!');
    }
    if (!grantedSlot.ruleSnapshot.snapshotHash || grantedSlot.ruleSnapshot.snapshotHash.length !== 64) {
      throw new Error(`Invalid SHA-256 snapshotHash: ${grantedSlot.ruleSnapshot.snapshotHash}`);
    }
    if (!Array.isArray(grantedSlot.ruleSnapshot.rewards) || grantedSlot.ruleSnapshot.rewards.length === 0) {
      throw new Error('Lootbox snapshot rewards array is empty!');
    }
    console.log(`✓ Test 11 passed: Lootbox has valid 64-char SHA-256 snapshotHash (${grantedSlot.ruleSnapshot.snapshotHash.substring(0, 12)}...) and intact rewards.`);

    // TEST 12: Streak progression without regressions
    console.log('\n--- TEST 12: Streak progression ---');
    const u12Id = await createTestUser('streak_user', 3);
    const res12 = await userDb.claimDailyBonus(u12Id);
    if (res12.claimedDay !== 4) {
      throw new Error(`Expected streak to advance from 3 to 4, got ${res12.claimedDay}`);
    }
    const u12InDb = await userDb.getUserById(u12Id);
    if (u12InDb?.dailyBonusStreak !== 4) {
      throw new Error(`Expected DB dailyBonusStreak 4, got ${u12InDb?.dailyBonusStreak}`);
    }
    console.log('✓ Test 12 passed: Streak advanced smoothly from 3 to 4 in memory and DB.');

    console.log('\n======================================================');
    console.log('🎉 ALL 12 INTEGRATION TESTS PASSED WITHOUT ERRORS!');
    console.log('======================================================\n');
  } finally {
    // Cleanup test users from DB
    console.log('Cleaning up test users...');
    for (const id of cleanupUserIds) {
      try {
        await db.execute({ sql: 'DELETE FROM user_premium_status WHERE user_id = ?', args: [id] });
        await db.execute({ sql: 'DELETE FROM daily_bonus_claims WHERE user_id = ?', args: [id] });
        await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });
      } catch {}
    }
    // Reset config back to default
    await premiumDb.resetToDefaults('test_runner_cleanup');
    console.log('✓ Test users cleaned up and default configs restored.');
  }
}

runDailyBonusIntegrationTests().catch(err => {
  console.error('INTEGRATION TEST RUNNER FAILED:', err);
  process.exit(1);
});
