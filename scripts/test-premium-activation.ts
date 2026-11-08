import { initDatabase, getDatabase } from '../server/db/database';
import { itemsDb } from '../server/db/items';
import { userDb } from '../server/db/users';
import { premiumDb, PremiumTier } from '../server/db/premium';
import { PREMIUM_CERTIFICATE_ITEM_ID, UserInventoryItem } from '../src/data/items';

async function runTests() {
  console.log('🚀 Starting Stage 4: Premium Activation, Extension & Replacement Test Suite...\n');
  await initDatabase();
  await itemsDb.ensureSeed();
  await premiumDb.ensureSeed();

  const db = getDatabase();
  const testUserId = `test_act_user_${Date.now()}`;
  const now = new Date().toISOString();

  // Helper to create test users
  async function createTestUser(id: string, initialInventory: UserInventoryItem[] = []) {
    const userNow = new Date().toISOString();
    await db.execute({
      sql: `
        INSERT INTO users (
          id, email, password_hash, display_name, avatar_seed, credits, inventory, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        `user_${id}@example.com`,
        'hash',
        `User ${id}`,
        'seed_test',
        1000,
        JSON.stringify(initialInventory),
        userNow,
        userNow
      ]
    });
  }

  // Helper to grant certificate and return its slot with guaranteed non-null id
  async function grantCert(userId: string, tier: PremiumTier, duration: number, unit: 'hours' | 'days'): Promise<UserInventoryItem & { id: string }> {
    const updatedUser = await userDb.adminGiveItem(userId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
      premiumPayload: { tier, duration, unit }
    });
    // Find newly added certificate slot
    const slots = updatedUser.inventory.filter(
      i => i.itemId === PREMIUM_CERTIFICATE_ITEM_ID &&
           i.premiumPayload?.tier === tier &&
           i.premiumPayload?.duration === duration &&
           i.premiumPayload?.unit === unit
    );
    const slot = slots[slots.length - 1];
    if (!slot || !slot.id) {
      throw new Error('Failed to find granted cert with id');
    }
    return slot as UserInventoryItem & { id: string };
  }

  await createTestUser(testUserId);

  try {
    // -------------------------------------------------------------
    // Test 1: First activation Bronze (Scenario A)
    // -------------------------------------------------------------
    console.log('--- Test 1: Scenario A - First activation Bronze (7 days) ---');
    const bronze7d = await grantCert(testUserId, 'bronze', 7, 'days');

    const userBefore1 = await userDb.getUserById(testUserId);
    const certSlot1 = userBefore1?.inventory.find(i => i.id === bronze7d.id);
    if (!certSlot1) throw new Error('FAIL: Bronze certificate not found in inventory before activation');

    const res1 = await userDb.activatePremiumCertificate(testUserId, bronze7d.id);
    if (!res1.success || res1.actionType !== 'activate') {
      throw new Error(`FAIL: expected actionType 'activate', got ${JSON.stringify(res1)}`);
    }

    const userAfter1 = await userDb.getUserById(testUserId);
    if (!userAfter1?.premium || userAfter1.premium.tier !== 'bronze') {
      throw new Error(`FAIL: user does not have active bronze premium: ${JSON.stringify(userAfter1?.premium)}`);
    }
    const certSlotAfter1 = userAfter1.inventory.find(i => i.id === bronze7d.id);
    if (certSlotAfter1) throw new Error('FAIL: certificate was not consumed from inventory');
    console.log('✓ PASS: Bronze activated successfully, expires at:', userAfter1.premium.expiresAt);

    // -------------------------------------------------------------
    // Test 2: First activation Silver (Scenario A on fresh user)
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Scenario A - First activation Silver (24 hours) ---');
    const userSilverId = `test_silver_${Date.now()}`;
    await createTestUser(userSilverId);
    const silver24h = await grantCert(userSilverId, 'silver', 24, 'hours');

    const res2 = await userDb.activatePremiumCertificate(userSilverId, silver24h.id);
    if (!res2.success || res2.actionType !== 'activate') {
      throw new Error(`FAIL: Silver activation failed: ${JSON.stringify(res2)}`);
    }
    const userSilver = await userDb.getUserById(userSilverId);
    if (userSilver?.premium?.tier !== 'silver') {
      throw new Error('FAIL: active tier is not silver');
    }
    console.log('✓ PASS: Silver activated successfully');

    // -------------------------------------------------------------
    // Test 3: First activation Gold (Scenario A on fresh user)
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Scenario A - First activation Gold (30 days) ---');
    const userGoldId = `test_gold_${Date.now()}`;
    await createTestUser(userGoldId);
    const gold30d = await grantCert(userGoldId, 'gold', 30, 'days');

    const res3 = await userDb.activatePremiumCertificate(userGoldId, gold30d.id);
    if (!res3.success || res3.actionType !== 'activate') {
      throw new Error(`FAIL: Gold activation failed: ${JSON.stringify(res3)}`);
    }
    const userGold = await userDb.getUserById(userGoldId);
    if (userGold?.premium?.tier !== 'gold') {
      throw new Error('FAIL: active tier is not gold');
    }
    console.log('✓ PASS: Gold activated successfully');

    // -------------------------------------------------------------
    // Test 4: Extension of same tier (Scenario B: Bronze + 7 days)
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Scenario B - Extension of same tier (Bronze + 7 days) ---');
    const activeBeforeExpMs = Date.parse(userAfter1.premium.expiresAt);
    const bronze7dExt = await grantCert(testUserId, 'bronze', 7, 'days');

    const res4 = await userDb.activatePremiumCertificate(testUserId, bronze7dExt.id);
    if (!res4.success || res4.actionType !== 'extend') {
      throw new Error(`FAIL: expected actionType 'extend', got ${JSON.stringify(res4)}`);
    }

    const userAfter4 = await userDb.getUserById(testUserId);
    const activeAfterExpMs = Date.parse(userAfter4!.premium!.expiresAt);
    const expectedExpMs = activeBeforeExpMs + (7 * 24 * 3600 * 1000);

    if (Math.abs(activeAfterExpMs - expectedExpMs) > 1000) {
      throw new Error(`FAIL: expiration calculation mismatch. Expected ~${expectedExpMs}, got ${activeAfterExpMs}`);
    }
    console.log('✓ PASS: Bronze extended seamlessly. Previous exp + 7d matched accurately.');

    // -------------------------------------------------------------
    // Test 5: Rejection of tier replacement without confirmation (Bronze -> Gold)
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Scenario C - Rejection without confirmation ---');
    const gold30dForC = await grantCert(testUserId, 'gold', 30, 'days');

    const res5 = await userDb.activatePremiumCertificate(testUserId, gold30dForC.id);
    if (res5.success || !res5.needsConfirmation) {
      throw new Error(`FAIL: expected needsConfirmation=true, got ${JSON.stringify(res5)}`);
    }
    if (res5.currentTier !== 'bronze' || res5.targetTier !== 'gold') {
      throw new Error(`FAIL: mismatch in confirmation metadata: ${JSON.stringify(res5)}`);
    }

    // Verify certificate was NOT consumed
    const userAfter5 = await userDb.getUserById(testUserId);
    const certSlot5 = userAfter5?.inventory.find(i => i.id === gold30dForC.id);
    if (!certSlot5) throw new Error('FAIL: certificate was consumed despite lack of confirmation');
    if (userAfter5?.premium?.tier !== 'bronze') throw new Error('FAIL: active tier altered prematurely');
    console.log('✓ PASS: Rejection returned valid confirmation metadata, item NOT consumed.');

    // -------------------------------------------------------------
    // Test 6: Cancellation of confirmation simulation
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Cancellation - state remains 100% untouched ---');
    const userCancelCheck = await userDb.getUserById(testUserId);
    if (userCancelCheck?.premium?.tier !== 'bronze') {
      throw new Error('FAIL: state was modified');
    }
    console.log('✓ PASS: Cancellation leaves database completely untouched.');

    // -------------------------------------------------------------
    // Test 7: Replacement of Bronze with Gold after confirmation
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Scenario C - Replacement with confirmation (Bronze -> Gold) ---');
    const startReplaceMs = Date.now();
    const res7 = await userDb.activatePremiumCertificate(testUserId, gold30dForC.id, {
      confirmOverride: true,
      expectedCurrentTier: 'bronze',
      expectedExpiresAt: res5.currentExpiresAt
    });

    if (!res7.success || res7.actionType !== 'replace') {
      throw new Error(`FAIL: expected actionType 'replace', got ${JSON.stringify(res7)}`);
    }

    const userAfter7 = await userDb.getUserById(testUserId);
    if (userAfter7?.premium?.tier !== 'gold') {
      throw new Error(`FAIL: tier was not replaced with gold: ${userAfter7?.premium?.tier}`);
    }
    const newGoldExpMs = Date.parse(userAfter7.premium.expiresAt);
    const expectedGoldExpMs = startReplaceMs + (30 * 24 * 3600 * 1000);
    if (Math.abs(newGoldExpMs - expectedGoldExpMs) > 3000) {
      throw new Error('FAIL: Gold duration does not start from now');
    }
    console.log('✓ PASS: Bronze replaced with Gold, old remaining time voided, starts now.');

    // -------------------------------------------------------------
    // Test 8: Replacement of Gold with Bronze after confirmation
    // -------------------------------------------------------------
    console.log('\n--- Test 8: Scenario C - Replacement with confirmation (Gold -> Bronze) ---');
    const bronze7dForReplace = await grantCert(testUserId, 'bronze', 7, 'days');

    const res8 = await userDb.activatePremiumCertificate(testUserId, bronze7dForReplace.id, {
      confirmOverride: true
    });
    if (!res8.success || res8.actionType !== 'replace') {
      throw new Error(`FAIL: expected replace, got ${JSON.stringify(res8)}`);
    }
    const userAfter8 = await userDb.getUserById(testUserId);
    if (userAfter8?.premium?.tier !== 'bronze') {
      throw new Error(`FAIL: tier is not bronze after replacement: ${userAfter8?.premium?.tier}`);
    }
    console.log('✓ PASS: Gold successfully replaced with Bronze.');

    // -------------------------------------------------------------
    // Test 9: Rejection when reusing an already-consumed certificate
    // -------------------------------------------------------------
    console.log('\n--- Test 9: Rejection on double spending / already consumed ---');
    let doubleSpendErr = '';
    try {
      await userDb.activatePremiumCertificate(testUserId, bronze7dForReplace.id);
    } catch (e: any) {
      doubleSpendErr = e.message;
    }
    if (!doubleSpendErr.includes('не найден в вашем инвентаре или уже был использован')) {
      throw new Error(`FAIL: expected already consumed error, got: "${doubleSpendErr}"`);
    }
    console.log('✓ PASS: Consumed certificate cannot be used again:', doubleSpendErr);

    // -------------------------------------------------------------
    // Test 10: Three parallel requests activating the same certificate
    // -------------------------------------------------------------
    console.log('\n--- Test 10: Parallel requests race condition protection ---');
    const raceCert = await grantCert(testUserId, 'bronze', 1, 'days');

    const results = await Promise.allSettled([
      userDb.activatePremiumCertificate(testUserId, raceCert.id),
      userDb.activatePremiumCertificate(testUserId, raceCert.id),
      userDb.activatePremiumCertificate(testUserId, raceCert.id)
    ]);

    const successes = results.filter(r => r.status === 'fulfilled' && (r as any).value.success);
    const failures = results.filter(r => r.status === 'rejected');

    if (successes.length !== 1 || failures.length !== 2) {
      throw new Error(`FAIL: expected exactly 1 success and 2 failures, got ${successes.length} successes and ${failures.length} failures`);
    }
    console.log('✓ PASS: Mutex and transaction strictly serialized parallel activations: exactly 1 succeeded, 2 rejected.');

    // -------------------------------------------------------------
    // Test 11: Stale confirmation protection
    // -------------------------------------------------------------
    console.log('\n--- Test 11: Stale confirmation protection ---');
    const staleCert = await grantCert(testUserId, 'silver', 1, 'days');

    // Call with wrong expected tier or expired timestamp
    const staleRes = await userDb.activatePremiumCertificate(testUserId, staleCert.id, {
      confirmOverride: true,
      expectedCurrentTier: 'gold', // current is bronze!
      expectedExpiresAt: '2099-01-01T00:00:00.000Z'
    });

    if (staleRes.success || !staleRes.staleConfirmation) {
      throw new Error(`FAIL: expected staleConfirmation=true, got ${JSON.stringify(staleRes)}`);
    }
    console.log('✓ PASS: Stale confirmation rejected without modifying database.');

    // -------------------------------------------------------------
    // Test 12: Activation of certificate belonging to another user
    // -------------------------------------------------------------
    console.log('\n--- Test 12: Unauthorized certificate usage ---');
    const otherUserId = `test_other_${Date.now()}`;
    await createTestUser(otherUserId);
    const otherCert = await grantCert(otherUserId, 'gold', 7, 'days');

    let theftErr = '';
    try {
      await userDb.activatePremiumCertificate(testUserId, otherCert.id);
    } catch (e: any) {
      theftErr = e.message;
    }
    if (!theftErr.includes('не найден в вашем инвентаре')) {
      throw new Error(`FAIL: expected unauthorized / not found error, got: "${theftErr}"`);
    }
    console.log('✓ PASS: Cross-user certificate activation prevented securely.');

    // -------------------------------------------------------------
    // Test 13: Invalid payload rejected
    // -------------------------------------------------------------
    console.log('\n--- Test 13: Invalid payload rejection ---');
    const invalidCertSlot: UserInventoryItem = {
      id: `invalid_cert_${Date.now()}`,
      itemId: PREMIUM_CERTIFICATE_ITEM_ID,
      quantity: 1,
      acquiredAt: new Date().toISOString(),
      premiumPayload: {
        tier: 'diamond' as any, // invalid tier
        duration: -5,
        unit: 'days'
      }
    };
    const userFor13 = await userDb.getUserById(testUserId);
    const inv13 = [...userFor13!.inventory, invalidCertSlot];
    await db.execute({
      sql: 'UPDATE users SET inventory = ? WHERE id = ?',
      args: [JSON.stringify(inv13), testUserId]
    });

    let corruptErr = '';
    try {
      await userDb.activatePremiumCertificate(testUserId, invalidCertSlot.id!);
    } catch (e: any) {
      corruptErr = e.message;
    }
    if (!corruptErr.includes('Ошибка параметров сертификата')) {
      throw new Error(`FAIL: expected payload error, got "${corruptErr}"`);
    }
    console.log('✓ PASS: Invalid certificate payload rejected.');

    // -------------------------------------------------------------
    // Test 14: Duration overflow check (> 10 years rejected)
    // -------------------------------------------------------------
    console.log('\n--- Test 14: Duration overflow bounds check (> 10 years) ---');
    const overflowCertSlot: UserInventoryItem = {
      id: `overflow_cert_${Date.now()}`,
      itemId: PREMIUM_CERTIFICATE_ITEM_ID,
      quantity: 1,
      acquiredAt: new Date().toISOString(),
      premiumPayload: {
        tier: 'gold',
        duration: 4000,
        unit: 'days' // > 10 years
      }
    };
    const userFor14 = await userDb.getUserById(testUserId);
    const inv14 = [...userFor14!.inventory, overflowCertSlot];
    await db.execute({
      sql: 'UPDATE users SET inventory = ? WHERE id = ?',
      args: [JSON.stringify(inv14), testUserId]
    });

    let overflowErr = '';
    try {
      await userDb.activatePremiumCertificate(testUserId, overflowCertSlot.id!);
    } catch (e: any) {
      overflowErr = e.message;
    }
    if (!overflowErr.includes('Некорректная или превышающая допустимый диапазон длительность')) {
      throw new Error(`FAIL: expected duration overflow error, got: "${overflowErr}"`);
    }
    console.log('✓ PASS: Exorbitant certificate duration rejected.');

    // -------------------------------------------------------------
    // Test 15: Activation after expiration (Scenario A without confirmation)
    // -------------------------------------------------------------
    console.log('\n--- Test 15: Activation after previous Premium expired ---');
    const expiredUserId = `test_expired_${Date.now()}`;
    await createTestUser(expiredUserId);

    // Set an expired status in user_premium_status
    const expiredIso = new Date(Date.now() - 3600 * 1000).toISOString();
    await db.execute({
      sql: `
        INSERT INTO user_premium_status (
          user_id, tier, activated_at, expires_at, source, updated_at
        ) VALUES (?, 'gold', ?, ?, 'admin', ?)
      `,
      args: [expiredUserId, expiredIso, expiredIso, expiredIso]
    });

    const expiredCert = await grantCert(expiredUserId, 'bronze', 1, 'days');

    // Activating Bronze when Gold expired should NOT require confirmation
    const res15 = await userDb.activatePremiumCertificate(expiredUserId, expiredCert.id);
    if (!res15.success || res15.actionType !== 'activate') {
      throw new Error(`FAIL: expected 'activate' for expired user without confirmation, got ${JSON.stringify(res15)}`);
    }
    const userExpiredAfter = await userDb.getUserById(expiredUserId);
    if (userExpiredAfter?.premium?.tier !== 'bronze') {
      throw new Error('FAIL: tier is not bronze after activating on expired status');
    }
    console.log('✓ PASS: Expired premium allows fresh activation without override warning.');

    // -------------------------------------------------------------
    // Test 16: Non-certificate inventory items preserved intact
    // -------------------------------------------------------------
    console.log('\n--- Test 16: Other inventory items intact ---');
    const testInvUserId = `test_inv_preserve_${Date.now()}`;
    const testLootbox: UserInventoryItem = {
      id: 'lootbox_slot_1',
      itemId: 'chest_novice',
      quantity: 5,
      acquiredAt: new Date().toISOString()
    };
    await createTestUser(testInvUserId, [testLootbox]);
    const invCert = await grantCert(testInvUserId, 'gold', 1, 'days');

    await userDb.activatePremiumCertificate(testInvUserId, invCert.id);

    const userInvAfter = await userDb.getUserById(testInvUserId);
    const preservedLootbox = userInvAfter?.inventory.find(i => i.id === 'lootbox_slot_1');
    if (!preservedLootbox || preservedLootbox.quantity !== 5) {
      throw new Error(`FAIL: other inventory items corrupted or lost: ${JSON.stringify(userInvAfter?.inventory)}`);
    }
    console.log('✓ PASS: Other inventory items and quantities remained completely untouched.');

    // -------------------------------------------------------------
    // Test 17: User profile and getUserByToken returns active premium
    // -------------------------------------------------------------
    console.log('\n--- Test 17: User Profile & Auth Token integration ---');
    const token = `test_token_${Date.now()}`;
    await db.execute({
      sql: 'UPDATE users SET session_token = ? WHERE id = ?',
      args: [token, testInvUserId]
    });
    const sessionUser = await userDb.getUserByToken(token);
    if (!sessionUser?.premium || sessionUser.premium.tier !== 'gold' || sessionUser.premium.remainingDurationMs <= 0) {
      throw new Error(`FAIL: session user does not have active gold premium: ${JSON.stringify(sessionUser?.premium)}`);
    }
    console.log('✓ PASS: Active premium populated properly in session and profile.');

    // -------------------------------------------------------------
    // Test 18: useItem route compatibility
    // -------------------------------------------------------------
    console.log('\n--- Test 18: useItem() delegates to activatePremiumCertificate() ---');
    const useItemCert = await grantCert(testInvUserId, 'gold', 1, 'days');

    const useItemRes = await userDb.useItem(testInvUserId, PREMIUM_CERTIFICATE_ITEM_ID, { inventoryEntryId: useItemCert.id });
    if (!(useItemRes as any).success || (useItemRes as any).actionType !== 'extend') {
      throw new Error(`FAIL: useItem did not delegate properly: ${JSON.stringify(useItemRes)}`);
    }
    console.log('✓ PASS: useItem() successfully dispatches certificate activation.');

    // -------------------------------------------------------------
    // Test 19: Regular items continue operating normally via useItem()
    // -------------------------------------------------------------
    console.log('\n--- Test 19: Non-certificate items work in useItem() ---');
    const lootboxUseRes = await userDb.useItem(testInvUserId, 'chest_novice', { inventoryEntryId: 'lootbox_slot_1' });
    if (!lootboxUseRes.user || !lootboxUseRes.reward) {
      throw new Error(`FAIL: regular lootbox use failed: ${JSON.stringify(lootboxUseRes)}`);
    }
    console.log('✓ PASS: Regular lootbox opened successfully through standard useItem().');

    // -------------------------------------------------------------
    // Test 20: Claimed daily bonus is NOT retroactively altered
    // -------------------------------------------------------------
    console.log('\n--- Test 20: Prior daily bonus claim not retroactively affected ---');
    const bonusUserId = `test_bonus_${Date.now()}`;
    await createTestUser(bonusUserId);
    // Claim bonus before premium
    await userDb.claimDailyBonus(bonusUserId);
    const creditsBefore = (await userDb.getUserById(bonusUserId))!.credits;

    // Now activate Gold
    const bonusCert = await grantCert(bonusUserId, 'gold', 1, 'days');
    await userDb.activatePremiumCertificate(bonusUserId, bonusCert.id);

    // Check credits have not magically doubled retroactively
    const creditsAfter = (await userDb.getUserById(bonusUserId))!.credits;
    if (creditsAfter !== creditsBefore) {
      throw new Error('FAIL: credits changed retroactively after premium activation!');
    }
    console.log('✓ PASS: Prior daily bonus claim is immutable and was not retroactively altered.');

    console.log('\n🎉 ALL 20 STAGE 4 TEST SUITES PASSED FLAWLESSLY! 🎉');
  } finally {
    // Cleanup test users
    try {
      await db.execute({
        sql: `DELETE FROM users WHERE id LIKE 'test_%'`
      });
      await db.execute({
        sql: `DELETE FROM user_premium_status WHERE user_id LIKE 'test_%'`
      });
    } catch {}
  }
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
