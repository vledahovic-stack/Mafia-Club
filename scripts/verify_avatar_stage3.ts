import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@libsql/client';
import {
  AvatarServiceError,
  UserAvatarService
} from '../server/db/avatars';
import {
  AVATAR_CHANGE_CERTIFICATE_ID,
  DEFAULT_AVATAR_CHANGE_COST
} from '../server/data/items';
import type { R2ObjectStorageAdapter } from '../server/utils/r2Storage';

class Stage3MockR2Storage implements R2ObjectStorageAdapter {
  public objects = new Map<string, { body: Buffer; contentType: string }>();
  public failNextHead = false;

  async putObject(params: { key: string; body: Buffer; contentType: string }) {
    this.objects.set(params.key, {
      body: Buffer.from(params.body),
      contentType: params.contentType
    });
    return {
      key: params.key,
      byteSize: params.body.length,
      etag: `"${crypto.createHash('md5').update(params.body).digest('hex')}"`
    };
  }

  async getObject(input: { key: string }) {
    const obj = this.objects.get(input.key);
    if (!obj) return null;
    return {
      body: Buffer.from(obj.body),
      contentType: obj.contentType,
      contentLength: obj.body.length
    };
  }

  async deleteObject(input: { key: string }) {
    const existed = this.objects.has(input.key);
    this.objects.delete(input.key);
    return {
      deleted: existed,
      notFound: !existed
    };
  }

  async headObject(input: { key: string }) {
    if (this.failNextHead) {
      this.failNextHead = false;
      throw new Error('Simulated R2 headObject network timeout');
    }
    const obj = this.objects.get(input.key);
    if (!obj) {
      return { exists: false };
    }
    return {
      exists: true,
      contentType: obj.contentType,
      contentLength: obj.body.length
    };
  }
}

async function runStage3Tests() {
  console.log('=== Mafia Club Stage 3: Custom Avatar Activation Verification ===');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mafia-avatar-stage3-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');
  const testDb = createClient({ url: `file:${dbPath}` });

  try {
    await testDb.batch([
      `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        avatar_seed TEXT NOT NULL DEFAULT '🕵️',
        active_avatar_id TEXT,
        credits INTEGER NOT NULL DEFAULT 1000,
        inventory TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT
      );`,
      `CREATE TABLE project_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );`,
      `CREATE TABLE user_avatars (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL DEFAULT 'image/webp',
        byte_size INTEGER NOT NULL,
        width INTEGER NOT NULL DEFAULT 256,
        height INTEGER NOT NULL DEFAULT 256,
        is_animated INTEGER NOT NULL DEFAULT 0,
        checksum_sha256 TEXT,
        status TEXT NOT NULL DEFAULT 'ready',
        cleanup_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );`,
      `INSERT INTO project_settings (key, value, updated_at, updated_by) VALUES ('avatar_gallery_limit', '20', datetime('now'), 'system_default');`,
      `INSERT INTO project_settings (key, value, updated_at, updated_by) VALUES ('avatar_allow_animated', 'false', datetime('now'), 'system_default');`,
      `INSERT INTO users (id, email, display_name, avatar_seed, active_avatar_id, credits, inventory, created_at)
       VALUES (
         'user_alice',
         'alice@example.com',
         'Alice',
         '🕵️',
         NULL,
         1200,
         '[{"id":"inv_cert_1","itemId":"${AVATAR_CHANGE_CERTIFICATE_ID}","quantity":1,"acquiredAt":"2026-01-01T00:00:00.000Z"}]',
         datetime('now')
       );`,
      `INSERT INTO users (id, email, display_name, avatar_seed, active_avatar_id, credits, inventory, created_at)
       VALUES (
         'user_bob',
         'bob@example.com',
         'Bob',
         '🎩',
         NULL,
         200,
         '[]',
         datetime('now')
       );`
    ]);

    const storage = new Stage3MockR2Storage();
    const service = new UserAvatarService({ db: testDb as any, storage });

    const samplePng1 = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 20, g: 120, b: 220, alpha: 1 } }
    })
      .png()
      .toBuffer();

    const samplePng2 = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 220, g: 80, b: 40, alpha: 1 } }
    })
      .png()
      .toBuffer();

    // Upload two avatars for Alice and one for Bob (uploading must remain 100% free)
    const aliceUp1 = await service.uploadUserAvatar({
      userId: 'user_alice',
      fileBuffer: samplePng1
    });
    const aliceUp2 = await service.uploadUserAvatar({
      userId: 'user_alice',
      fileBuffer: samplePng2
    });
    const bobUp1 = await service.uploadUserAvatar({
      userId: 'user_bob',
      fileBuffer: samplePng1
    });

    // Verify upload did not charge Alice or Bob
    const aliceInitialRow = await testDb.execute({
      sql: `SELECT credits, active_avatar_id, inventory FROM users WHERE id = 'user_alice'`,
      args: []
    });
    assert.equal(Number((aliceInitialRow.rows[0] as any).credits), 1200);
    assert.equal((aliceInitialRow.rows[0] as any).active_avatar_id, null);

    // 1. Test successful activation using credits (cost = 500 credits)
    const act1 = await service.activateUserAvatar({
      userId: 'user_alice',
      avatarId: aliceUp1.avatar.id,
      useCertificate: false,
      costCreditsOverride: DEFAULT_AVATAR_CHANGE_COST
    });
    assert.equal(act1.alreadyActive, false);
    assert.equal(act1.activeAvatarId, aliceUp1.avatar.id);
    assert.equal(act1.certificateUsed, false);
    assert.equal(act1.costCredits, 500);
    assert.equal(act1.credits, 700);
    assert.equal(act1.inventory.length, 1, 'Certificate must remain untouched when paying with credits');

    // Verify gallery list marks aliceUp1 as active
    const aliceGalleryAfter1 = await service.listUserAvatars('user_alice');
    assert.equal(aliceGalleryAfter1.activeAvatarId, aliceUp1.avatar.id);
    assert.equal(
      aliceGalleryAfter1.avatars.find((a) => a.id === aliceUp1.avatar.id)?.isActive,
      true
    );

    console.log('✓ [1/7] Successful activation with credits and gallery active state verified');

    // 2. Test repeat/concurrent activation of the ALREADY active image -> must NOT charge again
    const [repeatA, repeatB] = await Promise.all([
      service.activateUserAvatar({
        userId: 'user_alice',
        avatarId: aliceUp1.avatar.id,
        useCertificate: false,
        costCreditsOverride: 500
      }),
      service.activateUserAvatar({
        userId: 'user_alice',
        avatarId: aliceUp1.avatar.id,
        useCertificate: true,
        costCreditsOverride: 500
      })
    ]);
    assert.equal(repeatA.alreadyActive, true);
    assert.equal(repeatA.costCredits, 0);
    assert.equal(repeatA.certificateUsed, false);
    assert.equal(repeatB.alreadyActive, true);
    assert.equal(repeatB.costCredits, 0);
    assert.equal(repeatB.certificateUsed, false);
    assert.equal(repeatB.credits, 700, 'Credits must remain 700 on repeat activation');
    assert.equal(repeatB.inventory.length, 1, 'Certificate must remain 1 on repeat activation');

    // Also test concurrent activation of a NEW avatar (aliceUp2) with two simultaneous requests -> only 1 charge
    const [conc1, conc2] = await Promise.all([
      service.activateUserAvatar({
        userId: 'user_alice',
        avatarId: aliceUp2.avatar.id,
        useCertificate: false,
        costCreditsOverride: 500
      }),
      service.activateUserAvatar({
        userId: 'user_alice',
        avatarId: aliceUp2.avatar.id,
        useCertificate: false,
        costCreditsOverride: 500
      })
    ]);
    const totalChargedAcrossConcurrent = conc1.costCredits + conc2.costCredits;
    assert.equal(
      totalChargedAcrossConcurrent,
      500,
      'Concurrent duplicate requests for the same target avatar must charge only once'
    );
    assert.equal(conc2.credits, 200, 'Alice must have 200 credits left (700 - 500)');

    console.log('✓ [2/7] Repeat & concurrent activation protection (zero double-charging) verified');

    // 3. Test insufficient credits (Alice now has 200 credits, cost is 500)
    await assert.rejects(
      () =>
        service.activateUserAvatar({
          userId: 'user_alice',
          avatarId: aliceUp1.avatar.id,
          useCertificate: false,
          costCreditsOverride: 500
        }),
      (err: any) =>
        err instanceof AvatarServiceError &&
        err.statusCode === 400 &&
        err.code === 'INSUFFICIENT_CREDITS'
    );
    // Verify Alice still has 200 credits and aliceUp2 is still active
    const aliceAfterInsuff = await testDb.execute({
      sql: `SELECT credits, active_avatar_id FROM users WHERE id = 'user_alice'`,
      args: []
    });
    assert.equal(Number((aliceAfterInsuff.rows[0] as any).credits), 200);
    assert.equal(String((aliceAfterInsuff.rows[0] as any).active_avatar_id), aliceUp2.avatar.id);

    console.log('✓ [3/7] Insufficient credits rejection without balance or state loss verified');

    // 4. Test activation using Avatar Change Certificate (consumes 1 certificate, 0 credits)
    const certAct = await service.activateUserAvatar({
      userId: 'user_alice',
      avatarId: aliceUp1.avatar.id,
      useCertificate: true,
      costCreditsOverride: 500
    });
    assert.equal(certAct.alreadyActive, false);
    assert.equal(certAct.activeAvatarId, aliceUp1.avatar.id);
    assert.equal(certAct.certificateUsed, true);
    assert.equal(certAct.costCredits, 0);
    assert.equal(certAct.credits, 200, 'Credits must remain 200 when certificate is used');
    assert.equal(certAct.inventory.length, 0, 'Certificate must be consumed from inventory');

    // Attempting to use certificate again when inventory has 0 certificates must fail with CERTIFICATE_MISSING
    await assert.rejects(
      () =>
        service.activateUserAvatar({
          userId: 'user_alice',
          avatarId: aliceUp2.avatar.id,
          useCertificate: true,
          costCreditsOverride: 500
        }),
      (err: any) =>
        err instanceof AvatarServiceError &&
        err.statusCode === 400 &&
        err.code === 'CERTIFICATE_MISSING'
    );

    console.log('✓ [4/7] Certificate payment consumption and missing certificate rejection verified');

    // 5. Test attempting to activate another player's image (403 AVATAR_FORBIDDEN)
    // Give Bob 1000 credits and try to activate Alice's image
    await testDb.execute({
      sql: `UPDATE users SET credits = 1000 WHERE id = 'user_bob'`,
      args: []
    });

    await assert.rejects(
      () =>
        service.activateUserAvatar({
          userId: 'user_bob',
          avatarId: aliceUp1.avatar.id,
          useCertificate: false,
          costCreditsOverride: 500
        }),
      (err: any) =>
        err instanceof AvatarServiceError &&
        err.statusCode === 403 &&
        err.code === 'AVATAR_FORBIDDEN'
    );

    const bobAfterForbidden = await testDb.execute({
      sql: `SELECT credits, active_avatar_id FROM users WHERE id = 'user_bob'`,
      args: []
    });
    assert.equal(Number((bobAfterForbidden.rows[0] as any).credits), 1000, 'Bob must not lose credits on forbidden avatar');
    assert.equal((bobAfterForbidden.rows[0] as any).active_avatar_id, null);

    console.log('✓ [5/7] Foreign avatar activation blocked (403) without credit loss verified');

    // 6. Test R2 network failure (502 R2_VERIFY_FAILED) & missing R2 object (404 AVATAR_STORAGE_OBJECT_MISSING)
    storage.failNextHead = true;
    await assert.rejects(
      () =>
        service.activateUserAvatar({
          userId: 'user_bob',
          avatarId: bobUp1.avatar.id,
          useCertificate: false,
          costCreditsOverride: 500
        }),
      (err: any) =>
        err instanceof AvatarServiceError &&
        err.statusCode === 502 &&
        err.code === 'R2_VERIFY_FAILED'
    );

    const bobAfterR2Error = await testDb.execute({
      sql: `SELECT credits, active_avatar_id FROM users WHERE id = 'user_bob'`,
      args: []
    });
    assert.equal(Number((bobAfterR2Error.rows[0] as any).credits), 1000, 'Bob must not lose credits when R2 headObject fails');
    assert.equal((bobAfterR2Error.rows[0] as any).active_avatar_id, null);

    // Now remove Bob's object from R2 and test missing R2 object
    const bobAvatarRow = await testDb.execute({
      sql: `SELECT object_key FROM user_avatars WHERE id = ?`,
      args: [bobUp1.avatar.id]
    });
    const bobObjectKey = String((bobAvatarRow.rows[0] as any).object_key);
    const savedBobObj = storage.objects.get(bobObjectKey)!;
    storage.objects.delete(bobObjectKey);

    await assert.rejects(
      () =>
        service.activateUserAvatar({
          userId: 'user_bob',
          avatarId: bobUp1.avatar.id,
          useCertificate: false,
          costCreditsOverride: 500
        }),
      (err: any) =>
        err instanceof AvatarServiceError &&
        err.statusCode === 404 &&
        err.code === 'AVATAR_STORAGE_OBJECT_MISSING'
    );

    const bobAfterMissingObj = await testDb.execute({
      sql: `SELECT credits, active_avatar_id FROM users WHERE id = 'user_bob'`,
      args: []
    });
    assert.equal(Number((bobAfterMissingObj.rows[0] as any).credits), 1000, 'Bob must not lose credits when R2 object is missing');

    // Restore Bob's R2 object and activate it
    storage.objects.set(bobObjectKey, savedBobObj);
    const bobActOk = await service.activateUserAvatar({
      userId: 'user_bob',
      avatarId: bobUp1.avatar.id,
      useCertificate: false,
      costCreditsOverride: 500
    });
    assert.equal(bobActOk.activeAvatarId, bobUp1.avatar.id);
    assert.equal(bobActOk.credits, 500);

    console.log('✓ [6/7] R2 failure / missing R2 object rollback (zero payment loss) verified');

    // 7. Test switching back to standard emoji avatar resets active_avatar_id to NULL
    const bobSwitchBack = await service.switchToStandardAvatar({
      userId: 'user_bob',
      avatarSeed: '👑',
      useCertificate: false,
      costCreditsOverride: 500
    });
    assert.equal(bobSwitchBack.avatarSeed, '👑');
    assert.equal(bobSwitchBack.activeAvatarId, null);
    assert.equal(bobSwitchBack.costCredits, 500);
    assert.equal(bobSwitchBack.credits, 0);

    const bobRowAfterSwitch = await testDb.execute({
      sql: `SELECT avatar_seed, active_avatar_id, credits FROM users WHERE id = 'user_bob'`,
      args: []
    });
    assert.equal(String((bobRowAfterSwitch.rows[0] as any).avatar_seed), '👑');
    assert.equal((bobRowAfterSwitch.rows[0] as any).active_avatar_id, null, 'active_avatar_id must be NULL after switching to standard emoji avatar');
    assert.equal(Number((bobRowAfterSwitch.rows[0] as any).credits), 0);

    // And because bobUp1 is no longer active, Bob can now delete bobUp1 if desired
    const bobGalleryAfterReset = await service.listUserAvatars('user_bob');
    assert.equal(bobGalleryAfterReset.activeAvatarId, null);
    assert.equal(bobGalleryAfterReset.avatars[0].isActive, false);

    console.log('✓ [7/7] Switching back to standard emoji avatar resets active_avatar_id to NULL verified');
    console.log('=== ALL STAGE 3 AVATAR ACTIVATION TESTS PASSED ===');
  } finally {
    try {
      testDb.close();
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runStage3Tests().catch((err) => {
  console.error('Stage 3 verification failed:', err);
  process.exit(1);
});
