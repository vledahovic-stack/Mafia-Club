export const MAX_CLIENT_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
export const MIN_CLIENT_AVATAR_DIMENSION = 32;
export const MAX_CLIENT_AVATAR_DIMENSION = 4096;
export const AVATAR_PREVIEW_TARGET_SIZE = 256;
export const MIN_CLIENT_CROP_SIZE = 16;

export const ALLOWED_CLIENT_AVATAR_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

export interface UserGalleryAvatarItem {
  id: string;
  userId: string;
  imageUrl: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  isAnimated: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface UserGalleryListResponse {
  avatars: UserGalleryAvatarItem[];
  count: number;
  maxLimit: number;
  remainingSlots: number;
  allowAnimatedAvatars: boolean;
  activeAvatarId: string | null;
}

export interface SquareCropPixels {
  x: number;
  y: number;
  size: number;
}

export interface CropPanZoomState {
  /** Zoom factor >= 1. At zoom = 1, the largest possible centered square is selected. */
  zoom: number;
  /** Normalized horizontal center offset in source pixels from the center of the image */
  centerX: number;
  /** Normalized vertical center offset in source pixels from the center of the image */
  centerY: number;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a user-selected File on the client before opening the crop editor.
 * Strictly allows JPEG, PNG, and WebP up to 5 MB and forbids SVG.
 */
export function validateAvatarSelectedFile(file: {
  name: string;
  type: string;
  size: number;
}): FileValidationResult {
  if (!file || file.size <= 0) {
    return {
      valid: false,
      error: 'Выбранный файл пуст. Пожалуйста, выберите корректное изображение.'
    };
  }

  const lowerName = (file.name || '').toLowerCase().trim();
  const lowerType = (file.type || '').toLowerCase().trim();

  if (
    lowerType.includes('svg') ||
    lowerName.endsWith('.svg') ||
    lowerName.endsWith('.svgz')
  ) {
    return {
      valid: false,
      error: 'Формат SVG запрещён. Пожалуйста, выберите изображение JPEG, PNG или WebP.'
    };
  }

  if (file.size > MAX_CLIENT_AVATAR_BYTES) {
    return {
      valid: false,
      error: 'Размер файла превышает максимально допустимые 5 МБ.'
    };
  }

  const hasValidMime = ALLOWED_CLIENT_AVATAR_MIMES.has(lowerType);
  const hasValidExt =
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp');

  if (!hasValidMime && !hasValidExt) {
    return {
      valid: false,
      error: 'Поддерживаются только изображения в форматах JPEG, PNG и WebP.'
    };
  }

  return { valid: true };
}

/**
 * Validates natural image dimensions after loading the image in the browser.
 */
export function validateAvatarNaturalDimensions(
  naturalWidth: number,
  naturalHeight: number
): FileValidationResult {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth < MIN_CLIENT_AVATAR_DIMENSION ||
    naturalHeight < MIN_CLIENT_AVATAR_DIMENSION
  ) {
    return {
      valid: false,
      error: `Изображение слишком маленькое (${naturalWidth}×${naturalHeight} пикс.). Минимальный размер — ${MIN_CLIENT_AVATAR_DIMENSION}×${MIN_CLIENT_AVATAR_DIMENSION} пикс.`
    };
  }

  if (
    naturalWidth > MAX_CLIENT_AVATAR_DIMENSION ||
    naturalHeight > MAX_CLIENT_AVATAR_DIMENSION ||
    naturalWidth * naturalHeight > MAX_CLIENT_AVATAR_DIMENSION * MAX_CLIENT_AVATAR_DIMENSION
  ) {
    return {
      valid: false,
      error: `Разрешение изображения (${naturalWidth}×${naturalHeight} пикс.) превышает допустимый предел ${MAX_CLIENT_AVATAR_DIMENSION}×${MAX_CLIENT_AVATAR_DIMENSION} пикс.`
    };
  }

  return { valid: true };
}

/**
 * Computes integer square crop coordinates `{ x, y, size }` guaranteed to fit within
 * `[0, sourceWidth]` and `[0, sourceHeight]` from the current pan/zoom state.
 */
export function computeClampedSquareCrop(
  sourceWidth: number,
  sourceHeight: number,
  state: CropPanZoomState
): SquareCropPixels {
  const maxSquareSize = Math.max(1, Math.floor(Math.min(sourceWidth, sourceHeight)));
  const minAllowedSize = Math.min(MIN_CLIENT_CROP_SIZE, maxSquareSize);

  const clampedZoom = Math.max(1, Math.min(8, Number.isFinite(state.zoom) ? state.zoom : 1));
  const rawSize = Math.round(maxSquareSize / clampedZoom);
  const size = Math.max(minAllowedSize, Math.min(maxSquareSize, rawSize));

  const halfSize = size / 2;
  const minCenterX = halfSize;
  const maxCenterX = sourceWidth - halfSize;
  const minCenterY = halfSize;
  const maxCenterY = sourceHeight - halfSize;

  const clampedCenterX = Math.max(
    minCenterX,
    Math.min(maxCenterX, Number.isFinite(state.centerX) ? state.centerX : sourceWidth / 2)
  );
  const clampedCenterY = Math.max(
    minCenterY,
    Math.min(maxCenterY, Number.isFinite(state.centerY) ? state.centerY : sourceHeight / 2)
  );

  let x = Math.round(clampedCenterX - halfSize);
  let y = Math.round(clampedCenterY - halfSize);

  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + size > sourceWidth) x = Math.max(0, sourceWidth - size);
  if (y + size > sourceHeight) y = Math.max(0, sourceHeight - size);

  return { x, y, size };
}

/**
 * Formats byte size into human-readable Russian string (Б / КБ / МБ).
 */
export function formatAvatarByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 КБ';
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} КБ`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} МБ`;
}

/**
 * Maps server error responses or network exceptions into clear user-facing Russian messages.
 */
export function resolveAvatarErrorMessage(
  status: number | undefined,
  code: string | undefined,
  serverMessage: string | undefined,
  fallback: string
): string {
  switch (code) {
    case 'AVATAR_GALLERY_LIMIT_REACHED':
      return serverMessage || 'Достигнут лимит личной галереи. Удалите неиспользуемое изображение, чтобы загрузить новое.';
    case 'IMAGE_TOO_LARGE':
      return 'Размер файла превышает максимально допустимые 5 МБ.';
    case 'SVG_NOT_ALLOWED':
      return 'Формат SVG запрещён. Пожалуйста, выберите изображение JPEG, PNG или WebP.';
    case 'UNSUPPORTED_IMAGE_FORMAT':
    case 'IMAGE_FORMAT_MISMATCH':
    case 'CORRUPTED_OR_INVALID_IMAGE':
      return serverMessage || 'Файл повреждён или имеет неподдерживаемый формат. Допустимы только JPEG, PNG и WebP.';
    case 'IMAGE_DIMENSIONS_OUT_OF_RANGE':
      return serverMessage || 'Недопустимое разрешение изображения (разрешено от 32×32 до 4096×4096 пикселей).';
    case 'ANIMATED_AVATAR_DISABLED':
      return 'Анимированные изображения сейчас отключены. Пожалуйста, выберите статичное изображение.';
    case 'CROP_OUT_OF_BOUNDS':
    case 'NON_SQUARE_CROP':
    case 'CROP_TOO_SMALL':
    case 'INVALID_CROP_PARAMETERS':
      return serverMessage || 'Некорректная область обрезки. Попробуйте центрировать изображение и повторить.';
    case 'CANNOT_DELETE_ACTIVE_AVATAR':
      return 'Активный аватар нельзя удалить. Сначала выберите другой аватар.';
    case 'INSUFFICIENT_CREDITS':
      return serverMessage || 'Недостаточно кредитов для смены аватара.';
    case 'CERTIFICATE_MISSING':
      return serverMessage || 'В вашем инвентаре нет «Сертификата на смену аватара». Выберите оплату кредитами или приобретите сертификат в магазине.';
    case 'R2_VERIFY_FAILED':
    case 'AVATAR_STORAGE_OBJECT_MISSING':
      return serverMessage || 'Не удалось подтвердить наличие файла аватара в хранилище. Оплата не списана.';
    case 'AVATAR_NOT_READY':
      return serverMessage || 'Выбранное изображение недоступно для активации.';
    case 'AVATAR_CONCURRENT_MODIFICATION':
      return serverMessage || 'Состояние профиля изменилось параллельным запросом. Оплата не списана, повторите попытку.';
    case 'AVATAR_FORBIDDEN':
      return 'Нет доступа к этому изображению.';
    case 'RATE_LIMITED':
      return 'Слишком много запросов. Пожалуйста, подождите немного и попробуйте снова.';
    case 'UNAUTHORIZED':
    case 'SESSION_INVALID':
      return 'Сессия истекла или требуется вход в аккаунт. Авторизуйтесь заново.';
    default:
      break;
  }

  if (status === 401) {
    return 'Сессия истекла или требуется авторизация.';
  }
  if (status === 403) {
    return serverMessage || 'Доступ к операции ограничен.';
  }
  if (status === 413) {
    return 'Размер файла превышает максимально допустимые 5 МБ.';
  }
  if (status === 429) {
    return 'Слишком много запросов. Пожалуйста, подождите немного.';
  }

  if (serverMessage && serverMessage.trim()) {
    return serverMessage.trim();
  }

  return fallback;
}

export interface PlayerAvatarResolutionInput {
  userId?: string | null;
  avatarSeed?: string | null;
  displayName?: string | null;
  activeAvatarId?: string | null;
  /**
   * When true, if `activeAvatarId` is undefined (not explicitly null),
   * attempts to load `/api/users/:userId/avatar` for registered user IDs.
   */
  tryLoadByUserId?: boolean;
  /**
   * Fallback mode when no custom image or short emoji seed is active.
   */
  fallbackMode?: 'initials' | 'gangster';
  /**
   * Whether the current custom image URL failed to load (`onError`).
   */
  imageLoadFailed?: boolean;
}

export interface PlayerAvatarResolutionResult {
  kind: 'image' | 'emoji' | 'initials' | 'gangster';
  imageUrl: string | null;
  text: string;
}

/**
   * Checks whether a user/player ID can have a server-stored custom avatar.
   * Guests (`guest_*`) and bots (`bot_*`) never have custom R2 avatars.
   */
export function isEligibleCustomAvatarUserId(userId?: string | null): boolean {
  const clean = typeof userId === 'string' ? userId.trim() : '';
  if (!clean) return false;
  if (
    clean.startsWith('guest_') ||
    clean.startsWith('bot_') ||
    clean.startsWith('bot-') ||
    clean === 'system' ||
    clean === 'SYSTEM'
  ) {
    return false;
  }
  return true;
}

/**
   * Pure deterministic resolver for unified player avatar rendering across Mafia Club.
   */
export function resolvePlayerAvatarView(
  input: PlayerAvatarResolutionInput
): PlayerAvatarResolutionResult {
  const cleanUserId = typeof input.userId === 'string' ? input.userId.trim() : '';
  const cleanSeed = typeof input.avatarSeed === 'string' ? input.avatarSeed.trim() : '';
  const cleanName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  const cleanActiveId =
    typeof input.activeAvatarId === 'string' && input.activeAvatarId.trim().length > 0
      ? input.activeAvatarId.trim()
      : null;

  const eligibleUser = isEligibleCustomAvatarUserId(cleanUserId);
  const shouldAttemptImage =
    eligibleUser &&
    !input.imageLoadFailed &&
    (Boolean(cleanActiveId) || (input.tryLoadByUserId === true && input.activeAvatarId === undefined));

  const imageUrl = shouldAttemptImage
    ? `/api/users/${encodeURIComponent(cleanUserId)}/avatar${
        cleanActiveId ? `?v=${encodeURIComponent(cleanActiveId)}` : ''
      }`
    : null;

  // Compute short emoji/symbol seed vs initial letter fallback
  const seedGlyphs = cleanSeed ? Array.from(cleanSeed) : [];
  const isShortCustomGlyph =
    seedGlyphs.length > 0 &&
    seedGlyphs.length <= 4 &&
    (!cleanName || cleanSeed !== cleanName);

  const initialSource = cleanName || cleanSeed || '?';
  const initialLetter = (Array.from(initialSource)[0] || '?').toUpperCase();

  if (imageUrl) {
    return {
      kind: 'image',
      imageUrl,
      text: isShortCustomGlyph ? cleanSeed : initialLetter
    };
  }

  if (isShortCustomGlyph) {
    return {
      kind: 'emoji',
      imageUrl: null,
      text: cleanSeed
    };
  }

  if (input.fallbackMode === 'gangster') {
    return {
      kind: 'gangster',
      imageUrl: null,
      text: initialLetter
    };
  }

  return {
    kind: 'initials',
    imageUrl: null,
    text: initialLetter
  };
}

