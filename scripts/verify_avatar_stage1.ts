import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@libsql/client';
import {
  AvatarServiceError,
  UserAvatarService,
  inspectAndProcessAvatarImage
} from '../server/db/avatars';
import {
  isValidAvatarObjectKey,
  type R2ObjectStorageAdapter
} from '../server/utils/r2Storage';

class InMemoryR2Storage implements R2ObjectStorageAdapter {
  public objects = new Map<string, { body: Buffer; contentType: string }>();
  public failNextPut = false;
  public failNextDelete = false;

  async putObject(params: { key: string; body: Buffer; contentType: string; cacheControl?: string }) {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error('Simulated R2 putObject network failure');
    }
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
    if (!obj) {
      return null;
    }
    return {
      body: Buffer.from(obj.body),
      contentType: obj.contentType,
      contentLength: obj.body.length
    };
  }

  async deleteObject(input: { key: string }) {
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw new Error('Simulated R2 deleteObject failure');
    }
    const existed = this.objects.has(input.key);
    this.objects.delete(input.key);
    return {
      deleted: existed,
      notFound: !existed
    };
  }

  async headObject(input: { key: string }) {
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

async function runTests() {
  console.log('=== Mafia Club Stage 1: User Avatar & Personal Gallery Verification ===');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mafia-avatar-stage1-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');
  const testDb = createClient({ url: `file:${dbPath}` });

  try {
    // Bootstrap isolated test tables matching server/db/database.ts
    await testDb.batch([
      `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        avatar_seed TEXT NOT NULL DEFAULT '🕵️',
        active_avatar_id TEXT,
        credits INTEGER NOT NULL DEFAULT 1000,
        created_at TEXT NOT NULL
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
      `INSERT INTO users (id, email, display_name, avatar_seed, active_avatar_id, credits, created_at)
       VALUES ('user_alice', 'alice@example.com', 'Alice', '🕵️', NULL, 1500, datetime('now'));`,
      `INSERT INTO users (id, email, display_name, avatar_seed, active_avatar_id, credits, created_at)
       VALUES ('user_bob', 'bob@example.com', 'Bob', '🎩', NULL, 800, datetime('now'));`
    ]);

    const storage = new InMemoryR2Storage();
    const service = new UserAvatarService({ db: testDb as any, storage });

    // Generate synthetic test images using sharp
    const validPng = await sharp({
      create: { width: 400, height: 300, channels: 4, background: { r: 30, g: 120, b: 220, alpha: 1 } }
    })
      .png()
      .toBuffer();

    const validJpegWithExif = await sharp({
      create: { width: 512, height: 512, channels: 3, background: { r: 200, g: 50, b: 80 } }
    })
      .withMetadata({
        exif: {
          IFD0: {
            Copyright: 'SecretCameraExifData',
            Software: 'HiddenCameraApp'
          }
        }
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    const validWebp = await sharp({
      create: { width: 320, height: 320, channels: 4, background: { r: 40, g: 180, b: 100, alpha: 1 } }
    })
      .webp()
      .toBuffer();

    // 1. Test valid uploads (JPEG, PNG, WebP), conversion to 256x256 WebP, EXIF stripping, R2 key format, and zero credit deduction
    const uploadJpegRes = await service.uploadUserAvatar({
      userId: 'user_alice',
      fileBuffer: validJpegWithExif,
      claimedMimeType: 'image/jpeg',
      originalFilename: '../../evil_name.jpg'
    });

    assert.equal(uploadJpegRes.avatar.mimeType, 'image/webp');
    assert.equal(uploadJpegRes.avatar.width, 256);
    assert.equal(uploadJpegRes.avatar.height, 256);
    assert.equal(uploadJpegRes.avatar.isAnimated, false);
    assert.equal(uploadJpegRes.count, 1);
    assert.equal(uploadJpegRes.maxLimit, 20);

    // Verify credits and existing emoji avatar_seed were NOT touched
    const aliceRowRes = await testDb.execute({
      sql: `SELECT credits, avatar_seed FROM users WHERE id = 'user_alice'`,
      args: []
    });
    assert.equal(Number((aliceRowRes.rows[0] as any).credits), 1500, 'Upload must not deduct user credits');
    assert.equal(String((aliceRowRes.rows[0] as any).avatar_seed), '🕵️', 'Upload must preserve existing emoji avatar');

    // Verify R2 key strictly matches avatars/<userId>/<uuid>.webp and does not contain original filename
    const storedKeys = Array.from(storage.objects.keys());
    assert.equal(storedKeys.length, 1);
    assert.ok(isValidAvatarObjectKey(storedKeys[0]), `Key must match strict pattern: ${storedKeys[0]}`);
    assert.ok(storedKeys[0].startsWith('avatars/user_alice/'));
    assert.ok(!storedKeys[0].includes('evil_name'));

    // Verify stored WebP dimensions and that EXIF metadata was stripped
    const storedBuffer = storage.objects.get(storedKeys[0])!.body;
    const outputMeta = await sharp(storedBuffer).metadata();
    assert.equal(outputMeta.format, 'webp');
    assert.equal(outputMeta.width, 256);
    assert.equal(outputMeta.height, 256);
    assert.equal(outputMeta.exif, undefined, 'EXIF metadata must be stripped from stored WebP');
    assert.ok(!storedBuffer.toString('utf8').includes('SecretCameraExifData'), 'EXIF text must not remain in binary');

    console.log('✓ [1/8] JPEG/PNG/WebP conversion to 256x256 WebP, EXIF stripping, R2 key format, and zero credit deduction verified');

    // 2. Test square crop validation (valid crop vs out-of-bounds vs non-square)
    const uploadCroppedPng = await service.uploadUserAvatar({
      userId: 'user_alice',
      fileBuffer: validPng, // 400x300
      crop: { x: 50, y: 20, size: 200 }
    });
    assert.equal(uploadCroppedPng.avatar.width, 256);
    assert.equal(uploadCroppedPng.avatar.height, 256);

    await assert.rejects(
      () =>
        service.uploadUserAvatar({
          userId: 'user_alice',
          fileBuffer: validPng, // 400x300
          crop: { x: 250, y: 100, size: 200 } // 250 + 200 = 450 > 400
        }),
      (err: any) => err instanceof AvatarServiceError && err.code === 'CROP_OUT_OF_BOUNDS'
    );

    await assert.rejects(
      () =>
        service.uploadUserAvatar({
          userId: 'user_alice',
          fileBuffer: validPng,
          crop: { left: 10, top: 10, width: 120, height: 100 } // non-square
        }),
      (err: any) => err instanceof AvatarServiceError && err.code === 'NON_SQUARE_CROP'
    );

    console.log('✓ [2/8] Optional square crop and server-side bounds validation verified');

    // 3. Test security rejections: SVG, fake MIME/extension, oversized (> 5 MB), too small (< 32px), and animated images
    const svgBuffer = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><script>alert(1)</script></svg>`,
      'utf8'
    );
    await assert.rejects(
      () =>
        service.uploadUserAvatar({
          userId: 'user_alice',
          fileBuffer: svgBuffer,
          claimedMimeType: 'image/png',
          originalFilename: 'innocent.png'
        }),
      (err: any) => err instanceof AvatarServiceError && err.code === 'SVG_NOT_ALLOWED'
    );

    const randomTextRenamedAsJpg = Buffer.from('NOT_AN_IMAGE_AT_ALL_1234567890', 'utf8');
    await assert.rejects(
      () =>
        service.uploadUserAvatar({
          userId: 'user_alice',
          fileBuffer: randomTextRenamedAsJpg,
          claimedMimeType: 'image/jpeg',
          originalFilename: 'photo.jpg'
        }),
      (err: any) => err instanceof AvatarServiceError && err.code === 'UNSUPPORTED_IMAGE_FORMAT'
    );

    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 10, 0xff);
    await assert.rejects(
      () =>
        service.uploadUserAvatar({
          userId: 'user_alice',
          fileBuffer: oversizedBuffer,
          claimedMimeType: 'image/jpeg'
        }),
      (err: any) => err instanceof AvatarServiceError && err.code === 'IMAGE_TOO_LARGE' && err.statusCode === 413
    );

    const tinyPng = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
    })
      .png()
      .toBuffer();
    await assert.rejects(
      () =>
        service.uploadUserAvatar({
          userId: 'user_alice',
          fileBuffer: tinyPng
        }),
      (err: any) => err instanceof AvatarServiceError && err.code === 'IMAGE_DIMENSIONS_OUT_OF_RANGE'
    );

    console.log('✓ [3/8] SVG, fake extension/MIME, >5MB size limit, and pixel dimension limits verified');

    // Create a genuine 2-frame (64x64 each, total 64x128) animated WebP using sharp raw pageHeight
    const rawTwoFrames = Buffer.alloc(64 * 128 * 4);
    for (let i = 0; i < 64 * 64 * 4; i += 4) {
      rawTwoFrames[i] = 220;
      rawTwoFrames[i + 1] = 40;
      rawTwoFrames[i + 2] = 40;
      rawTwoFrames[i + 3] = 255;
    }
    for (let i = 64 * 64 * 4; i < 64 * 128 * 4; i += 4) {
      rawTwoFrames[i] = 40;
      rawTwoFrames[i + 1] = 200;
      rawTwoFrames[i + 2] = 80;
      rawTwoFrames[i + 3] = 255;
    }
    const stripBuffer = await sharp(rawTwoFrames, {
      raw: { width: 64, height: 128, channels: 4, pageHeight: 64 }
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();

    await assert.rejects(
      () =>
        service.uploadUserAvatar({
          userId: 'user_alice',
          fileBuffer: stripBuffer
        }),
      (err: any) => err instanceof AvatarServiceError && err.code === 'ANIMATED_AVATAR_DISABLED'
    );

    // Enable animated avatars in project settings and verify architecture supports it without rewrite
    await service.updateAvatarProjectSettings({ allowAnimatedAvatars: true }, 'test_admin');
    const animatedUploadRes = await service.uploadUserAvatar({
      userId: 'user_alice',
      fileBuffer: stripBuffer
    });
    assert.equal(animatedUploadRes.avatar.isAnimated, true);
    // Reset back to default (false)
    await service.updateAvatarProjectSettings({ allowAnimatedAvatars: false }, 'test_admin');

    console.log('✓ [4/8] Animated avatar rejection by default and configurable project setting toggle verified');

    // 5. Test owner-only personal gallery access (list, get binary, delete) vs other player (403 Forbidden)
    const aliceList = await service.listUserAvatars('user_alice');
    assert.equal(aliceList.count, 3);
    assert.equal(aliceList.maxLimit, 20);
    // Ensure no base64 data is leaked in JSON list
    const serializedList = JSON.stringify(aliceList);
    assert.ok(!serializedList.includes('data:image/'), 'Gallery list must never contain base64 image data');

    const bobList = await service.listUserAvatars('user_bob');
    assert.equal(bobList.count, 0, 'Bob must not see Alice gallery items');

    const targetAvatarId = uploadJpegRes.avatar.id;
    const ownerBinary = await service.getOwnerAvatarBinary('user_alice', targetAvatarId);
    assert.equal(ownerBinary.contentType, 'image/webp');
    assert.ok(ownerBinary.body.length > 0);

    await assert.rejects(
      () => service.getOwnerAvatarBinary('user_bob', targetAvatarId),
      (err: any) => err instanceof AvatarServiceError && err.statusCode === 403 && err.code === 'AVATAR_FORBIDDEN'
    );

    await assert.rejects(
      () => service.deleteUserAvatar('user_bob', targetAvatarId),
      (err: any) => err instanceof AvatarServiceError && err.statusCode === 403 && err.code === 'AVATAR_FORBIDDEN'
    );

    console.log('✓ [5/8] Owner-only gallery isolation (403 for non-owners) and zero base64 in JSON verified');

    // 6. Test active avatar serving to other players and protection against deleting active avatar
    // Before setting an active custom avatar, getActiveAvatarBinaryForPlayer returns 404
    await assert.rejects(
      () => service.getActiveAvatarBinaryForPlayer('user_alice'),
      (err: any) => err instanceof AvatarServiceError && err.statusCode === 404
    );

    // Mark targetAvatarId as Alice's active avatar
    await testDb.execute({
      sql: `UPDATE users SET active_avatar_id = ? WHERE id = 'user_alice'`,
      args: [targetAvatarId]
    });

    // Now other players can view ONLY Alice's active avatar via controlled route
    const publicActiveBinary = await service.getActiveAvatarBinaryForPlayer('user_alice');
    assert.equal(publicActiveBinary.avatarId, targetAvatarId);
    assert.equal(publicActiveBinary.contentType, 'image/webp');
    assert.equal(publicActiveBinary.body.length, ownerBinary.body.length);

    // Attempting to delete the currently active avatar must fail with 409 CANNOT_DELETE_ACTIVE_AVATAR
    await assert.rejects(
      () => service.deleteUserAvatar('user_alice', targetAvatarId),
      (err: any) =>
        err instanceof AvatarServiceError &&
        err.statusCode === 409 &&
        err.code === 'CANNOT_DELETE_ACTIVE_AVATAR'
    );

    console.log('✓ [6/8] Controlled active avatar serving and active avatar deletion lock (409) verified');

    // 7. Test deleting non-active avatar + partial error handling between R2 and DB
    const nonActiveId = uploadCroppedPng.avatar.id;

    // Simulate R2 delete failure -> DB metadata must be preserved with cleanup_error recorded
    storage.failNextDelete = true;
    await assert.rejects(
      () => service.deleteUserAvatar('user_alice', nonActiveId),
      (err: any) => err instanceof AvatarServiceError && err.statusCode === 502 && err.code === 'R2_DELETE_FAILED'
    );
    const stillInDb = await testDb.execute({
      sql: `SELECT status, cleanup_error FROM user_avatars WHERE id = ?`,
      args: [nonActiveId]
    });
    assert.equal(stillInDb.rows.length, 1, 'DB row must be preserved when R2 delete fails');
    assert.ok(String((stillInDb.rows[0] as any).cleanup_error).includes('Simulated R2 deleteObject failure'));

    // Now allow R2 delete to succeed -> removed from both R2 and DB
    const deleteRes = await service.deleteUserAvatar('user_alice', nonActiveId);
    assert.equal(deleteRes.deletedAvatarId, nonActiveId);
    assert.equal(deleteRes.count, 2);

    const afterDeleteDb = await testDb.execute({
      sql: `SELECT id FROM user_avatars WHERE id = ?`,
      args: [nonActiveId]
    });
    assert.equal(afterDeleteDb.rows.length, 0, 'DB row must be deleted after successful R2 delete');

    console.log('✓ [7/8] Non-active avatar deletion and R2/DB partial error consistency verified');

    // 8. Test personal gallery limit (default 20, configurable via project_settings)
    await service.updateAvatarProjectSettings({ galleryLimit: 3 }, 'test_admin');
    // Alice currently has 2 avatars; 3rd should succeed, 4th should be rejected with 409 AVATAR_GALLERY_LIMIT_REACHED
    await service.uploadUserAvatar({
      userId: 'user_alice',
      fileBuffer: validWebp
    });

    await assert.rejects(
      () =>
        service.uploadUserAvatar({
          userId: 'user_alice',
          fileBuffer: validWebp
        }),
      (err: any) =>
        err instanceof AvatarServiceError &&
        err.statusCode === 409 &&
        err.code === 'AVATAR_GALLERY_LIMIT_REACHED'
    );

    // Restore default limit of 20
    const restoredSettings = await service.updateAvatarProjectSettings({ galleryLimit: 20 }, 'test_admin');
    assert.equal(restoredSettings.galleryLimit, 20);
    assert.equal(restoredSettings.allowAnimatedAvatars, false);

    console.log('✓ [8/8] Personal gallery limit enforcement and configurable project_settings verified');
    console.log('=== ALL STAGE 1 AVATAR & GALLERY TESTS PASSED ===');
  } finally {
    try {
      testDb.close();
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('Stage 1 verification failed:', err);
  process.exit(1);
});
