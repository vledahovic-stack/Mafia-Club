import path from 'path';
import { createClient, Client } from '@libsql/client';
import { initDatabase, getDatabase, SQLITE_DB_PATH, sanitizeArgs } from '../server/db/database';
import { itemsDb } from '../server/db/items';
import { userDb } from '../server/db/users';
import { premiumDb, validateCertificatePayload, calculateDurationMs, isValidTier } from '../server/db/premium';
import { PREMIUM_CERTIFICATE_ITEM_ID, UserInventoryItem } from '../src/data/items';

/**
 * Stage 5 Section 1: Targeted safety check of Stage 4 across independent client connections.
 * Tests concurrency and database-level atomicity using separate LibSQL client instances
 * connecting to the same SQLite database file, explicitly bypassing the Node.js in-process mutex.
 */
async function runMultiConnectionConcurrencyTests() {
  console.log('🚀 Running Multi-Connection Concurrency & Atomicity Tests (Stage 5 Section 1)...\n');
  await initDatabase();
  await itemsDb.ensureSeed();
  await premiumDb.ensureSeed();

  const rawTursoUrl = (process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || '').trim();
  const rawAuthToken = (process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '').trim();
  const dbUrl = rawTursoUrl || `file:${SQLITE_DB_PATH}`;

  console.log(`Connecting independent LibSQL clients to: ${dbUrl}`);

  // Create 3 completely independent LibSQL clients
  const clientA = createClient({ url: dbUrl, authToken: rawAuthToken || undefined });
  const clientB = createClient({ url: dbUrl, authToken: rawAuthToken || undefined });
  const clientC = createClient({ url: dbUrl, authToken: rawAuthToken || undefined });

  const testUserId = `test_multiconn_user_${Date.now()}`;
  const nowIso = new Date().toISOString();

  // Create test user using master db
  const masterDb = getDatabase();
  await masterDb.execute({
    sql: `
      INSERT INTO users (
        id, email, password_hash, display_name, avatar_seed, credits, inventory, created_at, updated_at
      ) VALUES (?, ?, 'hash', 'MultiConn Test User', 'seed_test', 5000, '[]', ?, ?)
    `,
    args: [testUserId, `${testUserId}@example.com`, nowIso, nowIso]
  });

  // Helper simulating atomic activation directly over a specific connection client (bypassing in-process mutex)
  // Incorporates standard SQLite exponential backoff on SQLITE_BUSY / database lock contention
  async function activateOnClient(
    client: Client,
    userId: string,
    certEntryId: string,
    options?: { confirmOverride?: boolean }
  ): Promise<{ success: boolean; actionType?: string; expiresAt?: string; needsConfirmation?: boolean }> {
    for (let attempt = 0; attempt < 12; attempt++) {
      let tx: any = null;
      try {
        tx = await client.transaction('write');

        const userRes = await tx.execute({
          sql: 'SELECT id, inventory FROM users WHERE id = ?',
          args: [userId]
        });
        const userRow = userRes.rows[0];
        if (!userRow) throw new Error('Пользователь не найден.');

        let inventory: UserInventoryItem[] = [];
        try {
          inventory = JSON.parse(String(userRow.inventory || '[]')) || [];
        } catch {
          inventory = [];
        }

        const slotIndex = inventory.findIndex(
          slot =>
            slot.id === certEntryId &&
            (slot.itemId === PREMIUM_CERTIFICATE_ITEM_ID || Boolean(slot.premiumPayload)) &&
            (slot.quantity || 0) > 0
        );

        if (slotIndex === -1) {
          throw new Error('Указанный экземпляр сертификата не найден в вашем инвентаре или уже был использован.');
        }

        const targetSlot = inventory[slotIndex];
        const validation = validateCertificatePayload(targetSlot.premiumPayload);
        if (!validation.valid || !validation.normalized) {
          throw new Error(`Ошибка параметров сертификата: ${validation.error}`);
        }

        const certPayload = validation.normalized;
        const certDurationMs = calculateDurationMs(certPayload.duration, certPayload.unit);

        // Fetch current status
        const statusRes = await tx.execute({
          sql: 'SELECT * FROM user_premium_status WHERE user_id = ?',
          args: [userId]
        });
        const statusRow = statusRes.rows[0];

        const nowMs = Date.now();
        const currentNowIso = new Date(nowMs).toISOString();

        let currentActiveTier: string | null = null;
        let currentExpiresAtMs = 0;
        let currentActivatedAtIso: string | null = null;

        if (statusRow) {
          const rawExpIso = String(statusRow.expires_at || '');
          const rawExpMs = Date.parse(rawExpIso);
          const rawTier = String(statusRow.tier || '').toLowerCase();

          if (isValidTier(rawTier) && Number.isFinite(rawExpMs) && rawExpMs > nowMs) {
            currentActiveTier = rawTier;
            currentExpiresAtMs = rawExpMs;
            currentActivatedAtIso = String(statusRow.activated_at || currentNowIso);
          }
        }

        let newActivatedAtIso: string;
        let newExpiresAtMs: number;
        let newExpiresAtIso: string;
        let actionType: string;

        if (!currentActiveTier) {
          actionType = 'activate';
          newActivatedAtIso = currentNowIso;
          newExpiresAtMs = nowMs + certDurationMs;
          newExpiresAtIso = new Date(newExpiresAtMs).toISOString();
        } else if (currentActiveTier === certPayload.tier) {
          actionType = 'extend';
          newActivatedAtIso = currentActivatedAtIso || currentNowIso;
          newExpiresAtMs = currentExpiresAtMs + certDurationMs;
          newExpiresAtIso = new Date(newExpiresAtMs).toISOString();
        } else {
          if (!options?.confirmOverride) {
            await tx.rollback();
            return {
              success: false,
              needsConfirmation: true
            };
          }
          actionType = 'replace';
          newActivatedAtIso = currentNowIso;
          newExpiresAtMs = nowMs + certDurationMs;
          newExpiresAtIso = new Date(newExpiresAtMs).toISOString();
        }

        // Consume certificate
        if (targetSlot.quantity > 1) {
          targetSlot.quantity -= 1;
        } else {
          inventory.splice(slotIndex, 1);
        }

        await tx.execute({
          sql: 'UPDATE users SET inventory = ?, updated_at = ? WHERE id = ?',
          args: sanitizeArgs([JSON.stringify(inventory), currentNowIso, userId])
        });

        await tx.execute({
          sql: `
            INSERT INTO user_premium_status (
              user_id, tier, activated_at, expires_at, source, certificate_id, updated_at
            ) VALUES (?, ?, ?, ?, 'certificate', ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              tier = excluded.tier,
              activated_at = excluded.activated_at,
              expires_at = excluded.expires_at,
              source = excluded.source,
              certificate_id = excluded.certificate_id,
              updated_at = excluded.updated_at
          `,
          args: sanitizeArgs([
            userId,
            certPayload.tier,
            newActivatedAtIso,
            newExpiresAtIso,
            certEntryId,
            currentNowIso
          ])
        });

        await tx.commit();
        return { success: true, actionType, expiresAt: newExpiresAtIso };
      } catch (err: any) {
        if (tx && !tx.closed) {
          try { await tx.rollback(); } catch {}
        }
        const isBusy = err.code === 'SQLITE_BUSY' ||
                       err.extendedCode === 'SQLITE_BUSY_SNAPSHOT' ||
                       String(err.message).includes('database is locked') ||
                       String(err.message).includes('SQLITE_BUSY');
        if (isBusy && attempt < 11) {
          try { await client.execute('ROLLBACK'); } catch {}
          try { await client.execute('SELECT 1'); } catch {}
          await new Promise(r => setTimeout(r, 60 * Math.pow(1.4, attempt) + Math.floor(Math.random() * 40)));
          continue;
        }
        throw err;
      } finally {
        if (tx && !tx.closed) tx.close();
      }
    }
    throw new Error('Не удалось зафиксировать транзакцию после допустимого количества повторов.');
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Single Certificate Repeated Concurrent Activation via Independent Clients
    // -------------------------------------------------------------
    console.log('--- Test 1: Repeat activation of single certificate across 3 independent clients ---');
    const uAfterGive1 = await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
      premiumPayload: { tier: 'bronze', duration: 7, unit: 'days' }
    });
    const certSlot1 = uAfterGive1.inventory.find(i => i.premiumPayload?.tier === 'bronze');
    const certId1 = certSlot1!.id!;

    // Send simultaneous requests from 3 independent LibSQL client connections
    const results1 = await Promise.allSettled([
      activateOnClient(clientA, testUserId, certId1),
      activateOnClient(clientB, testUserId, certId1),
      activateOnClient(clientC, testUserId, certId1)
    ]);

    const successes1 = results1.filter(r => r.status === 'fulfilled' && (r as any).value.success);
    const failures1 = results1.filter(r => r.status === 'rejected');

    console.log(`Results: ${successes1.length} succeeded, ${failures1.length} rejected`);
    if (successes1.length !== 1 || failures1.length !== 2) {
      throw new Error(`FAIL: expected exactly 1 success and 2 failures across independent connections, got ${successes1.length} successes and ${failures1.length} failures`);
    }

    // Verify DB state
    const userCheck1 = await userDb.getUserById(testUserId);
    const remainingSlot1 = userCheck1?.inventory.find(i => i.id === certId1);
    if (remainingSlot1) throw new Error('FAIL: certificate still in inventory after multi-client race');
    if (userCheck1?.premium?.tier !== 'bronze') throw new Error('FAIL: active tier is not bronze');
    console.log('✓ PASS: Database write transactions strictly serialize across independent connections. Exactly 1 succeeded, certificate consumed exactly once.\n');

    // -------------------------------------------------------------
    // Test 2: Concurrent Use of Different Certificates by One Player
    // -------------------------------------------------------------
    console.log('--- Test 2: Simultaneous activation of different certificates by one player ---');
    // Give 2 separate Bronze certificates
    await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
      premiumPayload: { tier: 'bronze', duration: 7, unit: 'days' }
    });
    await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
      premiumPayload: { tier: 'bronze', duration: 3, unit: 'days' }
    });

    const uAfterGive2 = await userDb.getUserById(testUserId);
    const bronzeCerts = uAfterGive2!.inventory.filter(i => i.itemId === PREMIUM_CERTIFICATE_ITEM_ID);
    if (bronzeCerts.length < 2) throw new Error('FAIL: could not find 2 bronze certs');

    const certA = bronzeCerts[0].id!;
    const certB = bronzeCerts[1].id!;

    const expBeforeMs = Date.parse(uAfterGive2!.premium!.expiresAt);

    // Concurrently activate certA on clientA and certB on clientB
    const results2 = await Promise.allSettled([
      activateOnClient(clientA, testUserId, certA),
      activateOnClient(clientB, testUserId, certB)
    ]);

    for (const r of results2) {
      if (r.status === 'rejected') {
        console.error('Test 2 rejection detail:', r.reason);
        throw new Error(`FAIL: both independent certificates should succeed: ${r.reason.message}`);
      }
    }

    const uAfterBoth = await userDb.getUserById(testUserId);
    const expAfterMs = Date.parse(uAfterBoth!.premium!.expiresAt);
    const expectedAddedMs = (7 + 3) * 24 * 3600 * 1000;
    const diffMs = Math.abs(expAfterMs - (expBeforeMs + expectedAddedMs));

    if (diffMs > 3000) {
      throw new Error(`FAIL: total duration after both extensions should be +10 days. Expected ~${expBeforeMs + expectedAddedMs}, got ${expAfterMs}`);
    }

    // Both certificates must be consumed
    const certsLeft = uAfterBoth!.inventory.filter(i => i.id === certA || i.id === certB);
    if (certsLeft.length > 0) {
      throw new Error('FAIL: one of the certificates was not consumed');
    }
    console.log('✓ PASS: Simultaneous independent certificates both successfully extended duration cumulatively (+10 days).\n');

    // -------------------------------------------------------------
    // Test 3: Concurrent Extension vs Replacement
    // -------------------------------------------------------------
    console.log('--- Test 3: Concurrent Extension vs Replacement ---');
    // Give 1 Bronze (same tier extension) and 1 Gold (replacement)
    await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
      premiumPayload: { tier: 'bronze', duration: 2, unit: 'days' }
    });
    await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
      premiumPayload: { tier: 'gold', duration: 30, unit: 'days' }
    });

    const uAfterGive3 = await userDb.getUserById(testUserId);
    const certBronzeExt = uAfterGive3!.inventory.find(i => i.premiumPayload?.tier === 'bronze')!.id!;
    const certGoldRep = uAfterGive3!.inventory.find(i => i.premiumPayload?.tier === 'gold')!.id!;

    // Client A sends Bronze (extension), Client B sends Gold with confirmOverride: true
    const results3 = await Promise.allSettled([
      activateOnClient(clientA, testUserId, certBronzeExt),
      activateOnClient(clientB, testUserId, certGoldRep, { confirmOverride: true })
    ]);

    // Both should complete safely in sequence without corrupting database state
    for (const r of results3) {
      if (r.status === 'rejected') {
        throw new Error(`FAIL: unexpected failure in concurrent extension vs replacement: ${r.reason.message}`);
      }
    }

    const uAfterSeq = await userDb.getUserById(testUserId);
    if (uAfterSeq?.premium?.tier !== 'gold' && uAfterSeq?.premium?.tier !== 'bronze') {
      throw new Error('FAIL: invalid tier after concurrent extension and replacement');
    }
    console.log(`✓ PASS: Concurrent extension vs replacement executed with transaction integrity. Final tier: ${uAfterSeq?.premium?.tier}\n`);

    // -------------------------------------------------------------
    // Test 4: Rollback on Simulated DB Error in user_premium_status
    // -------------------------------------------------------------
    console.log('--- Test 4: Rollback integrity on premium write error ---');
    await userDb.adminGiveItem(testUserId, PREMIUM_CERTIFICATE_ITEM_ID, 1, {
      premiumPayload: { tier: 'silver', duration: 5, unit: 'days' }
    });
    const uBeforeRollback = await userDb.getUserById(testUserId);
    const silverCertId = uBeforeRollback!.inventory.find(i => i.premiumPayload?.tier === 'silver')!.id!;
    const inventoryBeforeCount = uBeforeRollback!.inventory.length;

    // Simulate transaction failure after inventory update but during status update
    let rollbackCaught = false;
    const txFail = await clientA.transaction('write');
    try {
      // 1. Consume from inventory
      const uRes = await txFail.execute({
        sql: 'SELECT inventory FROM users WHERE id = ?',
        args: [testUserId]
      });
      const inv: UserInventoryItem[] = JSON.parse(String(uRes.rows[0].inventory));
      const sIdx = inv.findIndex(i => i.id === silverCertId);
      inv.splice(sIdx, 1);
      await txFail.execute({
        sql: 'UPDATE users SET inventory = ? WHERE id = ?',
        args: [JSON.stringify(inv), testUserId]
      });

      // 2. Synthesize an error during user_premium_status write (invalid table or syntax)
      await txFail.execute('INSERT INTO non_existent_table_syntax_error VALUES (1, 2, 3)');
      await txFail.commit();
    } catch (err) {
      rollbackCaught = true;
      if (!txFail.closed) {
        try { await txFail.rollback(); } catch {}
      }
    } finally {
      if (!txFail.closed) txFail.close();
    }

    if (!rollbackCaught) {
      throw new Error('FAIL: synthetic error did not throw');
    }

    // Verify inventory was completely restored by tx.rollback()
    const uAfterRollback = await userDb.getUserById(testUserId);
    const restoredSlot = uAfterRollback!.inventory.find(i => i.id === silverCertId);
    if (!restoredSlot) {
      throw new Error('FAIL: inventory update was NOT rolled back when premium write failed!');
    }
    if (uAfterRollback!.inventory.length !== inventoryBeforeCount) {
      throw new Error('FAIL: inventory count mismatch after rollback');
    }
    console.log('✓ PASS: Transaction rollback fully restored inventory when status write errored.\n');

    console.log('🎉 ALL MULTI-CONNECTION CONCURRENCY TESTS PASSED FLAWLESSLY! 🎉');
  } finally {
    // Close independent clients
    clientA.close();
    clientB.close();
    clientC.close();

    // Clean up test user
    try {
      await masterDb.execute({
        sql: `DELETE FROM users WHERE id LIKE 'test_multiconn_%'`
      });
      await masterDb.execute({
        sql: `DELETE FROM user_premium_status WHERE user_id LIKE 'test_multiconn_%'`
      });
    } catch {}
  }
}

runMultiConnectionConcurrencyTests().catch(err => {
  console.error('❌ Multi-connection test failed:', err);
  process.exit(1);
});
