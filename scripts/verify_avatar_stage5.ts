import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@libsql/client';
import {
  AvatarServiceError,
  DEFAULT_ALLOW_ANIMATED_AVATARS,
  DEFAULT_AVATAR_GALLERY_LIMIT,
  UserAvatarService,
  validateAdminAvatarProjectSettingsPayload
} from '../server/db/avatars';
import { isMainAdminEmail } from '../server/db/users';
import { isMainAdminUser } from '../src/utils/accountDeletionUi';
import { validateDraftGalleryLimitInput } from '../src/components/AdminProjectSettingsView';
import type { R2ObjectStorageAdapter } from '../server/utils/r2Storage';

class Stage5MockR2Storage implements R2ObjectStorageAdapter {
  public objects = new Map<string, { body: Buffer; contentType: string }>();

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
    const obj = this.objects.get(input.key);
    return {
      exists: Boolean(obj),
      contentType: obj?.contentType,
      contentLength: obj?.body.length
    };
  }
}

/**
 * Generates a minimal 2-frame animated WebP buffer using sharp for testing animated avatar policy.
 */
async function createTestAnimatedWebp(size = 64): Promise<Buffer> {
  const rawTwoFrames = Buffer.alloc(size * size * 2 * 4);
  for (let i = 0; i < size * size * 4; i += 4) {
    rawTwoFrames[i] = 220;
    rawTwoFrames[i + 1] = 50;
    rawTwoFrames[i + 2] = 50;
    rawTwoFrames[i + 3] = 255;
  }
  for (let i = size * size * 4; i < size * size * 2 * 4; i += 4) {
    rawTwoFrames[i] = 40;
    rawTwoFrames[i + 1] = 200;
    rawTwoFrames[i + 2] = 80;
    rawTwoFrames[i + 3] = 255;
  }
  return sharp(rawTwoFrames, {
    raw: { width: size, height: size * 2, channels: 4, pageHeight: size }
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
}

async function runStage5Verification() {
  console.log('=== Mafia Club Stage 5: Admin Project Settings Verification ===');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mafia-avatar-stage5-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');
  const testDb = createClient({ url: `file:${dbPath}` });
  const mockR2 = new Stage5MockR2Storage();
  const service = new UserAvatarService({ db: testDb, storage: mockR2 });

  try {
    // Bootstrap tables matching server/db/database.ts
    await testDb.execute(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_seed TEXT NOT NULL,
        active_avatar_id TEXT DEFAULT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await testDb.execute(`
      CREATE TABLE user_avatars (
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
        updated_at TEXT NOT NULL
      )
    `);

    await testDb.execute(`
      CREATE TABLE project_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      )
    `);

    const nowIso = new Date().toISOString();
    await testDb.execute({
      sql: `INSERT INTO project_settings (key, value, updated_at, updated_by) VALUES ('avatar_gallery_limit', '20', ?, 'system_default')`,
      args: [nowIso]
    });
    await testDb.execute({
      sql: `INSERT INTO project_settings (key, value, updated_at, updated_by) VALUES ('avatar_allow_animated', 'false', ?, 'system_default')`,
      args: [nowIso]
    });

    await testDb.execute({
      sql: `INSERT INTO users (id, email, password_hash, display_name, avatar_seed, active_avatar_id, created_at, updated_at)
            VALUES ('user_player1', 'player1@example.com', 'hash', 'Игрок 1', '🕵️‍♂️', NULL, ?, ?)`,
      args: [nowIso, nowIso]
    });

    // 1. Verify defaults and snapshot structure (and zero R2 secret exposure)
    const initialSnapshot = await service.getAdminAvatarProjectSettingsSnapshot();
    assert.equal(initialSnapshot.galleryLimit, DEFAULT_AVATAR_GALLERY_LIMIT);
    assert.equal(initialSnapshot.galleryLimit, 20);
    assert.equal(initialSnapshot.allowAnimatedAvatars, DEFAULT_ALLOW_ANIMATED_AVATARS);
    assert.equal(initialSnapshot.allowAnimatedAvatars, false);
    assert.equal(initialSnapshot.updatedBy, 'system_default');
    const serializedSnapshot = JSON.stringify(initialSnapshot);
    assert.equal(serializedSnapshot.includes('R2_SECRET_ACCESS_KEY'), false);
    assert.equal(serializedSnapshot.includes('R2_ACCESS_KEY_ID'), false);
    console.log('✓ [1/6] Default project_settings (20 & false) and snapshot safety verified');

    // 2. Verify server & client validation rules (positive integer & boolean)
    assert.deepEqual(
      validateAdminAvatarProjectSettingsPayload({ galleryLimit: 35, allowAnimatedAvatars: true }),
      { galleryLimit: 35, allowAnimatedAvatars: true }
    );
    assert.deepEqual(
      validateAdminAvatarProjectSettingsPayload({ avatars: { galleryLimit: '50', allowAnimatedAvatars: false } }),
      { galleryLimit: 50, allowAnimatedAvatars: false }
    );

    for (const invalidBody of [
      null,
      {},
      { galleryLimit: 0, allowAnimatedAvatars: false },
      { galleryLimit: -10, allowAnimatedAvatars: false },
      { galleryLimit: 12.5, allowAnimatedAvatars: false },
      { galleryLimit: '12.5', allowAnimatedAvatars: false },
      { galleryLimit: 'abc', allowAnimatedAvatars: false },
      { galleryLimit: 1001, allowAnimatedAvatars: false },
      { galleryLimit: 20, allowAnimatedAvatars: 'yes' },
      { galleryLimit: 20, allowAnimatedAvatars: 1 },
      { galleryLimit: 20 }
    ]) {
      assert.throws(
        () => validateAdminAvatarProjectSettingsPayload(invalidBody),
        (err: any) => err instanceof AvatarServiceError && err.statusCode === 400
      );
    }

    assert.equal(validateDraftGalleryLimitInput('20').valid, true);
    assert.equal(validateDraftGalleryLimitInput('0').valid, false);
    assert.equal(validateDraftGalleryLimitInput('-5').valid, false);
    assert.equal(validateDraftGalleryLimitInput('3.14').valid, false);
    assert.equal(validateDraftGalleryLimitInput('abc').valid, false);
    console.log('✓ [2/6] Server & UI input validation (positive integer & boolean) verified');

    // 3. Verify Main Admin access guard helpers
    assert.equal(isMainAdminEmail('vledahovic@gmail.com'), true);
    assert.equal(isMainAdminEmail('VLEDAHOVIC@GMAIL.COM '), true);
    assert.equal(isMainAdminEmail('other.admin@example.com'), false);
    assert.equal(isMainAdminEmail(''), false);
    assert.equal(isMainAdminUser({ email: 'vledahovic@gmail.com' }), true);
    assert.equal(isMainAdminUser({ email: 'secondary.admin@example.com' }), false);
    console.log('✓ [3/6] Main Admin exclusive access checks verified');

    // 4. Verify gallery limit update and non-deletion of existing user avatars when limit is lowered
    const staticWebp = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 40, g: 90, b: 200 }
      }
    })
      .webp()
      .toBuffer();

    await service.uploadUserAvatar({ userId: 'user_player1', fileBuffer: staticWebp });
    await service.uploadUserAvatar({ userId: 'user_player1', fileBuffer: staticWebp });
    await service.uploadUserAvatar({ userId: 'user_player1', fileBuffer: staticWebp });

    const beforeLimitChange = await service.listUserAvatars('user_player1');
    assert.equal(beforeLimitChange.count, 3);
    assert.equal(beforeLimitChange.maxLimit, 20);
    assert.equal(beforeLimitChange.remainingSlots, 17);

    // Lower limit to 2 while user_player1 already has 3 images
    await service.updateAvatarProjectSettings({ galleryLimit: 2 }, 'vledahovic@gmail.com');

    const afterLoweringLimit = await service.listUserAvatars('user_player1');
    assert.equal(afterLoweringLimit.count, 3, 'Existing 3 avatars must NOT be deleted when limit is lowered to 2');
    assert.equal(afterLoweringLimit.avatars.length, 3);
    assert.equal(afterLoweringLimit.maxLimit, 2);
    assert.equal(afterLoweringLimit.remainingSlots, 0);
    assert.equal(mockR2.objects.size, 3, 'All 3 R2 objects must remain untouched');

    // Subsequent upload must be blocked because count (3) >= new limit (2)
    await assert.rejects(
      () => service.uploadUserAvatar({ userId: 'user_player1', fileBuffer: staticWebp }),
      (err: any) =>
        err instanceof AvatarServiceError &&
        err.statusCode === 409 &&
        err.code === 'AVATAR_GALLERY_LIMIT_REACHED'
    );

    // Increase limit to 4 -> 4th upload now succeeds
    await service.updateAvatarProjectSettings({ galleryLimit: 4 }, 'vledahovic@gmail.com');
    const fourthUpload = await service.uploadUserAvatar({ userId: 'user_player1', fileBuffer: staticWebp });
    assert.equal(fourthUpload.count, 4);
    assert.equal(fourthUpload.maxLimit, 4);
    assert.equal(fourthUpload.remainingSlots, 0);
    console.log('✓ [4/6] Gallery limit enforcement & preservation of existing images when limit < count verified');

    // 5. Verify animated avatars toggle (`avatar_allow_animated`) and preservation of already uploaded images
    await service.updateAvatarProjectSettings({ galleryLimit: 20, allowAnimatedAvatars: false }, 'vledahovic@gmail.com');
    const animatedWebp = await createTestAnimatedWebp(64);

    // When disabled (default): animated WebP is rejected
    await assert.rejects(
      () => service.uploadUserAvatar({ userId: 'user_player1', fileBuffer: animatedWebp }),
      (err: any) =>
        err instanceof AvatarServiceError &&
        err.statusCode === 400 &&
        err.code === 'ANIMATED_AVATAR_DISABLED'
    );

    // Enable animated avatars in project_settings
    await service.updateAvatarProjectSettings({ allowAnimatedAvatars: true }, 'vledahovic@gmail.com');
    const animUploadRes = await service.uploadUserAvatar({
      userId: 'user_player1',
      fileBuffer: animatedWebp
    });
    assert.equal(animUploadRes.avatar.isAnimated, true);
    assert.equal(animUploadRes.avatar.width, 256);
    assert.equal(animUploadRes.avatar.height, 256);

    // Even when animated avatars are enabled, GIF and SVG remain rejected by the pipeline
    const fakeGifBuffer = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;', 'binary');
    await assert.rejects(
      () => service.uploadUserAvatar({ userId: 'user_player1', fileBuffer: fakeGifBuffer }),
      (err: any) =>
        err instanceof AvatarServiceError &&
        err.statusCode === 415 &&
        err.code === 'UNSUPPORTED_IMAGE_FORMAT'
    );

    // Disable animated avatars again -> existing animated avatar in gallery is untouched
    await service.updateAvatarProjectSettings({ allowAnimatedAvatars: false }, 'vledahovic@gmail.com');
    const listAfterDisablingAnim = await service.listUserAvatars('user_player1');
    const savedAnimItem = listAfterDisablingAnim.avatars.find((a) => a.id === animUploadRes.avatar.id);
    assert.ok(savedAnimItem, 'Previously uploaded animated avatar must remain in gallery after toggle is turned off');
    assert.equal(savedAnimItem.isAnimated, true);
    console.log('✓ [5/6] Animated avatar toggle & preservation of existing animated images verified');

    // 6. Verify project_settings rows in DB
    const dbRows = await testDb.execute(
      `SELECT key, value, updated_by FROM project_settings WHERE key IN ('avatar_gallery_limit', 'avatar_allow_animated')`
    );
    const map = new Map<string, { value: string; updatedBy: string }>();
    for (const r of dbRows.rows as any[]) {
      map.set(String(r.key), { value: String(r.value), updatedBy: String(r.updated_by) });
    }
    assert.equal(map.get('avatar_gallery_limit')?.value, '20');
    assert.equal(map.get('avatar_allow_animated')?.value, 'false');
    assert.equal(map.get('avatar_allow_animated')?.updatedBy, 'vledahovic@gmail.com');
    console.log('✓ [6/6] Persistent project_settings table state verified');

    console.log('=== ALL STAGE 5 PROJECT SETTINGS TESTS PASSED ===');
  } finally {
    try {
      testDb.close();
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runStage5Verification().catch((err) => {
  console.error('Stage 5 verification failed:', err);
  process.exit(1);
});
