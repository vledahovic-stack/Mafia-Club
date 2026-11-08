import { initDatabase, getDatabase } from '../server/db/database';
import { itemsDb, PREMIUM_CERTIFICATE_ITEM_DEF } from '../server/db/items';
import { userDb } from '../server/db/users';
import { premiumDb, validateCertificatePayload } from '../server/db/premium';
import { PREMIUM_CERTIFICATE_ITEM_ID, UserInventoryItem } from '../src/data/items';
import {
  formatPremiumCertificateTitle,
  formatRussianHours,
  formatRussianDays
} from '../src/components/PlayerInventoryScreen';

async function runTests() {
  console.log('🚀 Starting Stage 3: Premium Certificates Test Suite...\n');
  await initDatabase();
  await itemsDb.ensureSeed();
  await premiumDb.ensureSeed();

  const db = getDatabase();
  const testUserId = `test_cert_user_${Date.now()}`;
  const now = new Date().toISOString();

  // Insert a test user into users table to avoid foreign key errors
  await db.execute({
    sql: `
      INSERT INTO users (
        id, email, password_hash, display_name, avatar_seed, credits, inventory, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      testUserId,
      `user_${testUserId}@example.com`,
      'hash',
      'Test Cert User',
      'seed_test',
      1000,
      '[]',
      now,
      now
    ]
  });

  try {
    // -------------------------------------------------------------
    // Test 1: Check cert_premium registration in shop_items
    // -------------------------------------------------------------
    console.log('--- Test 1: cert_premium in shop_items catalog ---');
    const catalogItem = await itemsDb.getItemById(PREMIUM_CERTIFICATE_ITEM_ID);
    if (!catalogItem) {
      throw new Error('FAIL: cert_premium was not found in catalog');
    }
    if (catalogItem.name !== 'Премиум-сертификат' || catalogItem.category !== 'certificates') {
      throw new Error(`FAIL: unexpected name or category: ${catalogItem.name}, ${catalogItem.category}`);
    }
    if (catalogItem.cost !== 0 || catalogItem.inShop !== false) {
      throw new Error(`FAIL: unexpected cost or inShop: cost=${catalogItem.cost}, inShop=${catalogItem.inShop}`);
    }
    console.log('✓ PASS: cert_premium registered correctly in catalog:', catalogItem.name, catalogItem.id);

    // -------------------------------------------------------------
    // Test 2: Idempotency of ensureSeed()
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Idempotency of ensureSeed() ---');
    await itemsDb.ensureSeed();
    await itemsDb.ensureSeed();
    const countRes = await db.execute({
      sql: 'SELECT COUNT(*) as cnt FROM shop_items WHERE id = ?',
      args: [PREMIUM_CERTIFICATE_ITEM_ID]
    });
    const cnt = Number(countRes.rows[0].cnt);
    if (cnt !== 1) {
      throw new Error(`FAIL: expected exactly 1 item in DB, found ${cnt}`);
    }
    console.log('✓ PASS: ensureSeed() is strictly idempotent');

    // -------------------------------------------------------------
    // Test 3: Title formatters test
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Formatting certificate titles ---');
    const tBronze7d = formatPremiumCertificateTitle({ tier: 'bronze', duration: 7, unit: 'days' });
    const tSilver24h = formatPremiumCertificateTitle({ tier: 'silver', duration: 24, unit: 'hours' });
    const tGold30d = formatPremiumCertificateTitle({ tier: 'gold', duration: 30, unit: 'days' });
    const tBronze1d = formatPremiumCertificateTitle({ tier: 'bronze', duration: 1, unit: 'days' });
    const tSilver1h = formatPremiumCertificateTitle({ tier: 'silver', duration: 1, unit: 'hours' });

    if (tBronze7d !== 'Premium Bronze — 7 дней') throw new Error(`FAIL: expected "Premium Bronze — 7 дней", got "${tBronze7d}"`);
    if (tSilver24h !== 'Premium Silver — 24 часа') throw new Error(`FAIL: expected "Premium Silver — 24 часа", got "${tSilver24h}"`);
    if (tGold30d !== 'Premium Gold — 30 дней') throw new Error(`FAIL: expected "Premium Gold — 30 дней", got "${tGold30d}"`);
    if (tBronze1d !== 'Premium Bronze — 1 день') throw new Error(`FAIL: expected "Premium Bronze — 1 день", got "${tBronze1d}"`);
    if (tSilver1h !== 'Premium Silver — 1 час') throw new Error(`FAIL: expected "Premium Silver — 1 час", got "${tSilver1h}"`);
    console.log('✓ PASS: Russian pluralization and title formatting are 100% accurate:', {
      tBronze7d,
      tSilver24h,
      tGold30d,
      tBronze1d,
      tSilver1h
    });

    // -------------------------------------------------------------
    // Test 4: Grant Bronze 7 days
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Grant Bronze 7 days ---');
    let user = await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
      premiumPayload: { tier: 'bronze', duration: 7, unit: 'days' }
    });
    let certs = user.inventory.filter(i => i.itemId === PREMIUM_CERTIFICATE_ITEM_ID);
    if (certs.length !== 1 || !certs[0].premiumPayload) {
      throw new Error('FAIL: Bronze 7 days cert was not stored properly');
    }
    if (certs[0].premiumPayload.tier !== 'bronze' || certs[0].premiumPayload.duration !== 7 || certs[0].premiumPayload.unit !== 'days') {
      throw new Error('FAIL: invalid premiumPayload in granted slot');
    }
    console.log('✓ PASS: Bronze 7 days granted with slot id:', certs[0].id);

    // -------------------------------------------------------------
    // Test 5: Grant Silver 24 hours
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Grant Silver 24 hours ---');
    user = await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
      premiumPayload: { tier: 'silver', duration: 24, unit: 'hours' }
    });
    certs = user.inventory.filter(i => i.itemId === PREMIUM_CERTIFICATE_ITEM_ID);
    if (certs.length !== 2) {
      throw new Error(`FAIL: expected 2 certs, got ${certs.length}`);
    }
    console.log('✓ PASS: Silver 24 hours added as separate slot. Total certs:', certs.length);

    // -------------------------------------------------------------
    // Test 6: Grant two identical Gold 7 days -> 2 separate slots, NEVER merged!
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Grant two identical Gold 7 days (independent slots) ---');
    user = await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
      premiumPayload: { tier: 'gold', duration: 7, unit: 'days' }
    });
    user = await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
      premiumPayload: { tier: 'gold', duration: 7, unit: 'days' }
    });
    certs = user.inventory.filter(i => i.itemId === PREMIUM_CERTIFICATE_ITEM_ID);
    if (certs.length !== 4) {
      throw new Error(`FAIL: expected 4 certs in inventory, got ${certs.length}`);
    }
    const goldCerts = certs.filter(i => i.premiumPayload?.tier === 'gold' && i.premiumPayload?.duration === 7);
    if (goldCerts.length !== 2) {
      throw new Error(`FAIL: expected exactly 2 separate Gold 7 days certs, got ${goldCerts.length}`);
    }
    if (goldCerts[0].id === goldCerts[1].id) {
      throw new Error('FAIL: identical gold certs have the same slot id!');
    }
    if (goldCerts[0].quantity !== 1 || goldCerts[1].quantity !== 1) {
      throw new Error(`FAIL: cert quantity should be 1, got ${goldCerts[0].quantity} and ${goldCerts[1].quantity}`);
    }
    console.log('✓ PASS: Two identical Gold 7 days certs stored as 2 independent slots with unique IDs:', {
      id1: goldCerts[0].id,
      id2: goldCerts[1].id
    });

    // -------------------------------------------------------------
    // Test 7: Reload from DB and verify serialization
    // -------------------------------------------------------------
    console.log('\n--- Test 7: DB reload & JSON deserialization ---');
    const freshUser = await userDb.getUserById(testUserId);
    const reloadedCerts = freshUser!.inventory.filter(i => i.itemId === PREMIUM_CERTIFICATE_ITEM_ID);
    if (reloadedCerts.length !== 4) {
      throw new Error('FAIL: reloaded certs count mismatch');
    }
    for (const c of reloadedCerts) {
      if (!c.id || !c.premiumPayload || !c.premiumPayload.tier || !c.premiumPayload.duration || !c.premiumPayload.unit) {
        throw new Error('FAIL: corrupted payload after DB reload');
      }
    }
    console.log('✓ PASS: Database reload preserves all fields and structure');

    // -------------------------------------------------------------
    // Test 8: No automatic activation upon receiving certificate
    // -------------------------------------------------------------
    console.log('\n--- Test 8: No automatic activation ---');
    const activePrem = await premiumDb.getActiveUserPremium(testUserId);
    if (activePrem !== null) {
      throw new Error('FAIL: user has active premium despite only possessing certificates');
    }
    console.log('✓ PASS: getActiveUserPremium returns null (no auto-activation)');

    // -------------------------------------------------------------
    // Test 9: userDb.useItem on cert_premium is blocked
    // -------------------------------------------------------------
    console.log('\n--- Test 9: userDb.useItem activates certificate (Stage 4) ---');
    const actRes = await userDb.useItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, {
      inventoryEntryId: goldCerts[0].id
    });
    if (!actRes.user || !(actRes as any).success) {
      throw new Error(`FAIL: useItem failed to activate certificate: ${JSON.stringify(actRes)}`);
    }
    console.log('✓ PASS: Certificate activated successfully in Stage 4:', actRes.resultMessage);

    // -------------------------------------------------------------
    // Test 10: Regular items keep merging by itemId
    // -------------------------------------------------------------
    console.log('\n--- Test 10: Regular items still merge into existing stacks ---');
    user = await userDb.adminGiveItem(testUserId, 'card_role_select', 2);
    user = await userDb.adminGiveItem(testUserId, 'card_role_select', 3);
    const roleCards = user.inventory.filter(i => i.itemId === 'card_role_select');
    if (roleCards.length !== 1 || roleCards[0].quantity !== 5) {
      throw new Error(`FAIL: regular items did not merge properly: count=${roleCards.length}, qty=${roleCards[0]?.quantity}`);
    }
    console.log('✓ PASS: Regular items merge correctly by itemId (quantity = 5)');

    // -------------------------------------------------------------
    // Test 11: Lootboxes still create immutable ruleSnapshots
    // -------------------------------------------------------------
    console.log('\n--- Test 11: Lootboxes still have immutable snapshots ---');
    user = await userDb.adminGiveItem(testUserId, 'chest_novice', 1);
    const chests = user.inventory.filter(i => i.itemId === 'chest_novice');
    if (chests.length !== 1 || !chests[0].ruleSnapshot || !chests[0].ruleSnapshot.snapshotHash) {
      throw new Error('FAIL: chest_novice missing ruleSnapshot');
    }
    console.log('✓ PASS: Lootboxes keep immutable ruleSnapshot intact');

    // -------------------------------------------------------------
    // Test 12: Invalid certificate payloads are rejected
    // -------------------------------------------------------------
    console.log('\n--- Test 12: Validation and rejection of invalid payloads ---');
    let rejected1 = false;
    try {
      await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1);
    } catch (e: any) {
      rejected1 = true;
    }
    if (!rejected1) throw new Error('FAIL: allowed cert without payload');

    let rejected2 = false;
    try {
      await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
        premiumPayload: { tier: 'diamond' as any, duration: 10, unit: 'days' }
      });
    } catch (e: any) {
      rejected2 = true;
    }
    if (!rejected2) throw new Error('FAIL: allowed cert with invalid tier "diamond"');

    let rejected3 = false;
    try {
      await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
        premiumPayload: { tier: 'gold', duration: -5, unit: 'days' }
      });
    } catch (e: any) {
      rejected3 = true;
    }
    if (!rejected3) throw new Error('FAIL: allowed cert with negative duration');

    let rejected4 = false;
    try {
      await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
        premiumPayload: { tier: 'gold', duration: 1, unit: 'months' as any }
      });
    } catch (e: any) {
      rejected4 = true;
    }
    if (!rejected4) throw new Error('FAIL: allowed cert with unit "months"');
    console.log('✓ PASS: All 4 invalid payloads strictly rejected');

    console.log('\n======================================================');
    console.log('🎉 ALL 12 VERIFICATION SUITES PASSED WITH 100% SUCCESS!');
    console.log('======================================================\n');
  } finally {
    // Cleanup test user
    await db.execute({
      sql: 'DELETE FROM users WHERE id = ?',
      args: [testUserId]
    });
  }
}

runTests().catch(err => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
