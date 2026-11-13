import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateAvatarSelectedFile,
  validateAvatarNaturalDimensions,
  computeClampedSquareCrop,
  formatAvatarByteSize,
  resolveAvatarErrorMessage,
  MAX_CLIENT_AVATAR_BYTES
} from '../src/utils/avatarGalleryUi';
import { normalizeAndValidateSquareCrop } from '../server/db/avatars';

function runStage2Verification() {
  console.log('=== Mafia Club Stage 2: Personal Avatar Gallery UI Verification ===');

  // 1. Verify client file validation (JPEG, PNG, WebP up to 5 MB; SVG & >5MB rejected)
  assert.equal(
    validateAvatarSelectedFile({ name: 'photo.jpg', type: 'image/jpeg', size: 1024 * 500 }).valid,
    true
  );
  assert.equal(
    validateAvatarSelectedFile({ name: 'avatar.png', type: 'image/png', size: MAX_CLIENT_AVATAR_BYTES }).valid,
    true
  );
  assert.equal(
    validateAvatarSelectedFile({ name: 'portrait.webp', type: 'image/webp', size: 2048 }).valid,
    true
  );

  const svgCheck = validateAvatarSelectedFile({ name: 'vector.svg', type: 'image/svg+xml', size: 1024 });
  assert.equal(svgCheck.valid, false);
  assert.ok(svgCheck.error?.includes('SVG'));

  const disguisedSvgCheck = validateAvatarSelectedFile({ name: 'icon.svg', type: 'image/png', size: 1024 });
  assert.equal(disguisedSvgCheck.valid, false);

  const oversizedCheck = validateAvatarSelectedFile({
    name: 'huge.png',
    type: 'image/png',
    size: MAX_CLIENT_AVATAR_BYTES + 1
  });
  assert.equal(oversizedCheck.valid, false);
  assert.ok(oversizedCheck.error?.includes('5 МБ'));

  const gifCheck = validateAvatarSelectedFile({ name: 'anim.gif', type: 'image/gif', size: 4096 });
  assert.equal(gifCheck.valid, false);

  console.log('✓ [1/5] Client file format (JPEG/PNG/WebP), 5 MB limit, and SVG rejection verified');

  // 2. Verify natural dimension validation (32x32 .. 4096x4096)
  assert.equal(validateAvatarNaturalDimensions(32, 32).valid, true);
  assert.equal(validateAvatarNaturalDimensions(1920, 1080).valid, true);
  assert.equal(validateAvatarNaturalDimensions(4096, 4096).valid, true);
  assert.equal(validateAvatarNaturalDimensions(31, 256).valid, false);
  assert.equal(validateAvatarNaturalDimensions(4097, 512).valid, false);

  console.log('✓ [2/5] Natural pixel dimension bounds (32×32..4096×4096) verified');

  // 3. Verify square crop pan/zoom math & strict compatibility with server normalizeAndValidateSquareCrop
  const testResolutions = [
    [800, 600],
    [600, 1200],
    [256, 256],
    [32, 48],
    [3840, 2160]
  ];
  const testZooms = [1, 1.25, 2, 3.5, 4];
  const testOffsets = [-5000, -150, 0, 100, 300, 9999];

  for (const [w, h] of testResolutions) {
    for (const zoom of testZooms) {
      for (const ox of testOffsets) {
        for (const oy of testOffsets) {
          const clientCrop = computeClampedSquareCrop(w, h, {
            zoom,
            centerX: w / 2 + ox,
            centerY: h / 2 + oy
          });
          assert.ok(Number.isInteger(clientCrop.x));
          assert.ok(Number.isInteger(clientCrop.y));
          assert.ok(Number.isInteger(clientCrop.size));
          assert.ok(clientCrop.x >= 0 && clientCrop.y >= 0);
          assert.ok(clientCrop.x + clientCrop.size <= w);
          assert.ok(clientCrop.y + clientCrop.size <= h);

          // Ensure server validator accepts every crop produced by client cropper
          const serverValidated = normalizeAndValidateSquareCrop(clientCrop, w, h);
          assert.equal(serverValidated.left, clientCrop.x);
          assert.equal(serverValidated.top, clientCrop.y);
          assert.equal(serverValidated.size, clientCrop.size);
        }
      }
    }
  }

  console.log('✓ [3/5] Client/server square crop coordinate math across pan/zoom states verified');

  // 4. Verify error message mapping and byte size formatting
  assert.equal(formatAvatarByteSize(512), '512 Б');
  assert.equal(formatAvatarByteSize(24576), '24 КБ');
  assert.ok(
    resolveAvatarErrorMessage(409, 'CANNOT_DELETE_ACTIVE_AVATAR', undefined, 'err').includes('Активный аватар нельзя удалить')
  );
  assert.ok(
    resolveAvatarErrorMessage(409, 'AVATAR_GALLERY_LIMIT_REACHED', undefined, 'err').includes('лимит')
  );
  assert.ok(
    resolveAvatarErrorMessage(413, 'IMAGE_TOO_LARGE', undefined, 'err').includes('5 МБ')
  );
  assert.ok(
    resolveAvatarErrorMessage(403, 'AVATAR_FORBIDDEN', undefined, 'err').includes('Нет доступа')
  );

  console.log('✓ [4/5] Error code handling and byte size formatting verified');

  // 5. Verify UI component source constraints (no base64, no R2 key leakage, existing mechanics preserved)
  const gallerySource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/UserAvatarGallerySection.tsx'),
    'utf8'
  );
  const profileModalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/UserProfileModal.tsx'),
    'utf8'
  );

  assert.ok(!gallerySource.includes('toDataURL'), 'Must not use canvas.toDataURL / base64');
  assert.ok(!gallerySource.includes('readAsDataURL'), 'Must not use FileReader.readAsDataURL / base64');
  assert.ok(!gallerySource.includes('data:image/'), 'Must not embed base64 data URLs');
  assert.ok(gallerySource.includes('/api/user/avatars'), 'Must use existing Stage 1 /api/user/avatars API');
  assert.ok(gallerySource.includes('Мои аватары'), 'Must render "Мои аватары" section');
  assert.ok(gallerySource.includes('Загрузить изображение'), 'Must render "Загрузить изображение" button');
  assert.ok(
    gallerySource.includes('Сделать активным аватаром'),
    'Must render activation button for selected gallery image'
  );
  assert.ok(
    gallerySource.includes('Подтвердите смену аватара'),
    'Must show confirmation modal before deducting payment'
  );

  assert.ok(
    profileModalSource.includes('<UserAvatarGallerySection'),
    'UserProfileModal must render UserAvatarGallerySection inside avatar screen'
  );
  assert.ok(
    profileModalSource.includes('/api/user/change-avatar'),
    'UserProfileModal must preserve existing /api/user/change-avatar endpoint for standard emoji avatars'
  );
  assert.ok(
    profileModalSource.includes('DEFAULT_AVATAR_CHANGE_COST') &&
      profileModalSource.includes('AVATAR_CHANGE_CERTIFICATE_ID'),
    'UserProfileModal must preserve existing credit and certificate payment options'
  );

  console.log('✓ [5/5] UI component integration, zero-base64 rule, and preservation of existing avatar mechanics verified');
  console.log('=== ALL STAGE 2 AVATAR GALLERY UI CHECKS PASSED ===');
}

runStage2Verification();
