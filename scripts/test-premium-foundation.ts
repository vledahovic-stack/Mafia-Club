import { initDatabase, waitForDatabaseInit, getDatabase } from '../server/db/database';
import {
  premiumDb,
  isValidTier,
  validateTierConfig,
  validateCertificatePayload,
  calculateDurationMs,
  getRemainingDurationMs,
  DEFAULT_PREMIUM_TIER_CONFIGS,
  PREMIUM_CERTIFICATE_ITEM_ID
} from '../server/db/premium';

async function runTests() {
  console.log('--- STARTING PREMIUM ACCOUNT STAGE 1 TESTS ---');

  // 1. Initialize Database
  initDatabase();
  await waitForDatabaseInit();
  const db = getDatabase();
  console.log('✓ Database initialized successfully.');

  // 2. Verify Table Existence
  const tablesRes = await db.execute(`
    SELECT name FROM sqlite_master WHERE type='table' AND name IN ('premium_config', 'user_premium_status')
  `);
  const foundTables = tablesRes.rows.map(r => String(r.name));
  if (!foundTables.includes('premium_config') || !foundTables.includes('user_premium_status')) {
    throw new Error(`Tables not found! Found: ${JSON.stringify(foundTables)}`);
  }
  console.log('✓ Tables premium_config and user_premium_status verified in schema.');

  // 3. Test Seeding & Idempotency
  await premiumDb.ensureSeed();
  const config1 = await premiumDb.getConfig();
  console.log('✓ Seeded initial config:', {
    bronze: config1.bronze,
    silver: config1.silver,
    gold: config1.gold
  });

  // Verify default perks
  if (config1.bronze.doubleDailyBonusCredits !== true || config1.bronze.dailyLootboxEnabled !== false) {
    throw new Error('Bronze initial config mismatch!');
  }
  if (config1.silver.doubleDailyBonusCredits !== false || config1.silver.dailyLootboxEnabled !== true) {
    throw new Error('Silver initial config mismatch!');
  }
  if (config1.gold.doubleDailyBonusCredits !== true || config1.gold.dailyLootboxEnabled !== true) {
    throw new Error('Gold initial config mismatch!');
  }
  console.log('✓ Default tier perks verified: Bronze (x2 credits), Silver (1 lootbox), Gold (x2 credits + 1 lootbox).');

  // 4. Repeated ensureSeed() does NOT overwrite user-modified config
  await premiumDb.updateConfig({
    bronze: { doubleDailyBonusCredits: true, dailyLootboxEnabled: true, dailyLootboxItemId: 'chest_novice' }
  }, 'test_admin');

  await premiumDb.ensureSeed(); // Second seed call
  const configAfterSecondSeed = await premiumDb.getConfig();
  if (configAfterSecondSeed.bronze.dailyLootboxEnabled !== true || configAfterSecondSeed.bronze.dailyLootboxItemId !== 'chest_novice') {
    throw new Error('Repeated ensureSeed overwrote modified config!');
  }
  console.log('✓ Repeated ensureSeed() is strictly idempotent and preserved existing config.');

  // Reset back to defaults
  await premiumDb.resetToDefaults('test_cleanup');
  const defaultReset = await premiumDb.getConfig();
  if (defaultReset.bronze.dailyLootboxEnabled !== false) {
    throw new Error('Reset to defaults failed!');
  }
  console.log('✓ Reset to defaults verified.');

  // 5. Test Tier Independence
  await premiumDb.updateConfig({
    silver: { dailyLootboxItemId: 'chest_silver_special' }
  }, 'test_admin');
  const configAfterSilverUpdate = await premiumDb.getConfig();
  if (configAfterSilverUpdate.bronze.dailyLootboxItemId !== null) {
    throw new Error('Updating Silver leaked into Bronze config!');
  }
  if (configAfterSilverUpdate.gold.dailyLootboxItemId !== null) {
    throw new Error('Updating Silver leaked into Gold config!');
  }
  if (configAfterSilverUpdate.silver.dailyLootboxItemId !== 'chest_silver_special') {
    throw new Error('Silver update failed!');
  }
  console.log('✓ Tier independence verified (updates to Silver did not affect Bronze or Gold).');

  // Clean up config
  await premiumDb.resetToDefaults('test_cleanup');

  // 6. Test UTC Timestamps and Active / Expired / Absent Premium Status
  const testUserId = 'test_user_prem_' + Date.now();
  const now = Date.now();
  const futureIso = new Date(now + 3600 * 1000 * 24).toISOString(); // +24 hours
  const pastIso = new Date(now - 3600 * 1000).toISOString();        // -1 hour

  // 6a. Absent premium
  const absentPrem = await premiumDb.getActiveUserPremium(testUserId, now);
  if (absentPrem !== null) {
    throw new Error('Absent user should have null premium!');
  }
  console.log('✓ Absent premium returns null.');

  // 6b. Active premium (insert test user into users table first to satisfy foreign key)
  await db.execute({
    sql: `
      INSERT INTO users (id, email, display_name, avatar_seed, credits, created_at, updated_at)
      VALUES (?, ?, 'Test Player', 'seed1', 250, ?, ?)
    `,
    args: [testUserId, `${testUserId}@test.local`, new Date(now).toISOString(), new Date(now).toISOString()]
  });

  await db.execute({
    sql: `
      INSERT INTO user_premium_status (user_id, tier, activated_at, expires_at, source, certificate_id, updated_at)
      VALUES (?, 'gold', ?, ?, 'admin', 'test_cert_1', ?)
    `,
    args: [testUserId, new Date(now).toISOString(), futureIso, new Date(now).toISOString()]
  });

  const activePrem = await premiumDb.getActiveUserPremium(testUserId, now);
  if (!activePrem || activePrem.tier !== 'gold') {
    throw new Error('Active premium lookup failed!');
  }
  if (activePrem.remainingDurationMs <= 0 || activePrem.remainingDurationMs > 3600 * 1000 * 24) {
    throw new Error(`Unexpected remaining duration: ${activePrem.remainingDurationMs}`);
  }
  if (!activePrem.config.doubleDailyBonusCredits || !activePrem.config.dailyLootboxEnabled) {
    throw new Error('Active premium tier config not attached properly!');
  }
  console.log('✓ Active user premium verified (Gold tier, remaining time ~24h, config attached).');

  // 6c. Expired premium
  await db.execute({
    sql: `UPDATE user_premium_status SET expires_at = ? WHERE user_id = ?`,
    args: [pastIso, testUserId]
  });

  const expiredPrem = await premiumDb.getActiveUserPremium(testUserId, now);
  if (expiredPrem !== null) {
    throw new Error('Expired premium should return null!');
  }
  const rawRecord = await premiumDb.getUserPremiumRecord(testUserId);
  if (!rawRecord || rawRecord.tier !== 'gold') {
    throw new Error('Raw record inspection should still return historical record!');
  }
  console.log('✓ Expired premium returns null for active status, while raw record remains accessible.');

  // Clean up test user status and test user
  await db.execute({
    sql: 'DELETE FROM user_premium_status WHERE user_id = ?',
    args: [testUserId]
  });
  await db.execute({
    sql: 'DELETE FROM users WHERE id = ?',
    args: [testUserId]
  });
  console.log('✓ Test user record cleaned up.');

  // 7. Test Validation Helpers
  if (!isValidTier('bronze') || !isValidTier('silver') || !isValidTier('gold')) {
    throw new Error('isValidTier failed for valid tiers!');
  }
  if (isValidTier('diamond') || isValidTier('') || isValidTier(null) || isValidTier(123)) {
    throw new Error('isValidTier accepted invalid tier!');
  }
  console.log('✓ Tier validation helper (isValidTier) verified.');

  // Certificate payload validation
  const validPayload = validateCertificatePayload({ tier: 'bronze', duration: 7, unit: 'days' });
  if (!validPayload.valid || validPayload.normalized?.duration !== 7) {
    throw new Error('Valid payload rejected!');
  }

  const invalidTier = validateCertificatePayload({ tier: 'vip', duration: 7, unit: 'days' });
  if (invalidTier.valid) throw new Error('Invalid tier accepted in payload!');

  const invalidDurationZero = validateCertificatePayload({ tier: 'silver', duration: 0, unit: 'days' });
  if (invalidDurationZero.valid) throw new Error('Duration 0 accepted!');

  const invalidDurationFloat = validateCertificatePayload({ tier: 'silver', duration: 2.5, unit: 'days' });
  if (invalidDurationFloat.valid) throw new Error('Float duration accepted!');

  const invalidUnit = validateCertificatePayload({ tier: 'gold', duration: 10, unit: 'weeks' });
  if (invalidUnit.valid) throw new Error('Invalid unit "weeks" accepted!');

  console.log('✓ Certificate payload validation strictly enforces positive integer duration and valid units.');

  // Duration calculations
  const msHours = calculateDurationMs(12, 'hours');
  if (msHours !== 12 * 3600 * 1000) throw new Error('Hours calculation incorrect!');
  const msDays = calculateDurationMs(3, 'days');
  if (msDays !== 3 * 24 * 3600 * 1000) throw new Error('Days calculation incorrect!');
  console.log('✓ Duration in milliseconds calculations verified.');

  const remaining = getRemainingDurationMs(new Date(Date.now() + 5000).toISOString());
  if (remaining <= 0 || remaining > 5000) throw new Error('Remaining duration calculation incorrect!');
  const expiredRemaining = getRemainingDurationMs(new Date(Date.now() - 5000).toISOString());
  if (expiredRemaining !== 0) throw new Error('Expired remaining duration should be 0!');
  console.log('✓ Remaining duration calculation verified.');

  // Constant check
  if (PREMIUM_CERTIFICATE_ITEM_ID !== 'cert_premium') {
    throw new Error('PREMIUM_CERTIFICATE_ITEM_ID mismatch!');
  }
  console.log('✓ PREMIUM_CERTIFICATE_ITEM_ID verified ("cert_premium").');

  console.log('--- ALL TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('TEST RUNNER FAILED:', err);
  process.exit(1);
});
