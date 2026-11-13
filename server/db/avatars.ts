import crypto from 'crypto';
import type { Request } from 'express';
import sharp, { type Metadata as SharpMetadata } from 'sharp';
import type { Client } from '@libsql/client';
import { getDatabase } from './database';
import { accountDeletionDb } from './accountDeletion';
import { rewardMutex } from '../utils/asyncLock';
import { shopDb } from './shop';
import {
  DEFAULT_AVATAR_CHANGE_COST,
  AVATAR_CHANGE_CERTIFICATE_ID,
  type UserInventoryItem
} from '../data/items';
import {
  buildAvatarObjectKey,
  defaultR2StorageAdapter,
  isValidAvatarObjectKey,
  type R2ObjectStorageAdapter
} from '../utils/r2Storage';

export const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB strict limit
export const MIN_AVATAR_DIMENSION_PX = 32;
export const MAX_AVATAR_DIMENSION_PX = 4096;
export const MAX_AVATAR_TOTAL_PIXELS = 16_777_216; // 4096 * 4096
export const AVATAR_OUTPUT_SIZE_PX = 256;
export const MIN_AVATAR_CROP_SIZE_PX = 16;
export const DEFAULT_AVATAR_GALLERY_LIMIT = 20;
export const MIN_AVATAR_GALLERY_LIMIT = 1;
export const MAX_AVATAR_GALLERY_LIMIT = 1000;
export const DEFAULT_ALLOW_ANIMATED_AVATARS = false;
export const MAX_AVATAR_ANIMATED_FRAMES = 60;

export const PROJECT_SETTING_AVATAR_GALLERY_LIMIT = 'avatar_gallery_limit';
export const PROJECT_SETTING_AVATAR_ALLOW_ANIMATED = 'avatar_allow_animated';

export type AllowedInputAvatarFormat = 'jpeg' | 'png' | 'webp';

export interface AvatarCropInput {
  x?: number;
  y?: number;
  size?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

export interface ValidatedSquareCrop {
  left: number;
  top: number;
  size: number;
}

export interface AvatarProjectSettings {
  galleryLimit: number;
  allowAnimatedAvatars: boolean;
}

export interface AdminAvatarProjectSettingsSnapshot {
  galleryLimit: number;
  allowAnimatedAvatars: boolean;
  defaultGalleryLimit: number;
  defaultAllowAnimatedAvatars: boolean;
  minGalleryLimit: number;
  maxGalleryLimit: number;
  supportedStaticFormats: string[];
  supportedAnimatedFormats: string[];
  maxUploadBytes: number;
  minDimensionPx: number;
  maxDimensionPx: number;
  outputDimensionPx: number;
  maxAnimatedFrames: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface UserAvatarMetadataDto {
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

export interface UserAvatarListResult {
  avatars: UserAvatarMetadataDto[];
  count: number;
  maxLimit: number;
  remainingSlots: number;
  allowAnimatedAvatars: boolean;
  activeAvatarId: string | null;
}

export interface ProcessedAvatarResult {
  outputBuffer: Buffer;
  mimeType: 'image/webp';
  byteSize: number;
  width: number;
  height: number;
  isAnimated: boolean;
  detectedFormat: AllowedInputAvatarFormat;
  sourceWidth: number;
  sourceHeight: number;
  appliedCrop: ValidatedSquareCrop;
  checksumSha256: string;
}

export class AvatarServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AvatarServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

type DbClientLike = Pick<Client, 'execute'>;

/**
 * Inspects leading bytes of a buffer to detect whether it contains SVG, XML, HTML, or script markers.
 */
export function containsForbiddenSvgOrMarkupSignature(buffer: Buffer, claimedMimeOrName?: string): boolean {
  if (claimedMimeOrName) {
    const lowerClaim = claimedMimeOrName.toLowerCase();
    if (lowerClaim.includes('svg') || lowerClaim.endsWith('.svg') || lowerClaim.endsWith('.svgz')) {
      return true;
    }
  }

  const sampleLength = Math.min(buffer.length, 2048);
  const sampleText = buffer.subarray(0, sampleLength).toString('utf8').toLowerCase();
  if (
    sampleText.includes('<svg') ||
    sampleText.includes('<!doctype svg') ||
    sampleText.includes('http://www.w3.org/2000/svg') ||
    sampleText.includes('<?xml') ||
    sampleText.includes('<html') ||
    sampleText.includes('<script')
  ) {
    return true;
  }

  return false;
}

/**
 * Detects real image format from magic bytes at the start of the file buffer.
 * Returns null if the signature does not match JPEG, PNG, or WebP.
 */
export function detectImageMagicFormat(buffer: Buffer): AllowedInputAvatarFormat | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // WebP: "RIFF" (52 49 46 46) at 0..3 and "WEBP" (57 45 42 50) at 8..11
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }

  return null;
}

/**
 * Checks whether a WebP buffer has the animation flag set in its VP8X header or contains ANIM/ANMF chunks.
 */
function hasWebpAnimationChunk(buffer: Buffer): boolean {
  if (buffer.length < 21) return false;
  // Check VP8X chunk at byte 12..15
  const chunkFourCC = buffer.subarray(12, 16).toString('ascii');
  if (chunkFourCC === 'VP8X') {
    const flags = buffer[20];
    // Bit 1 (0x02) of VP8X flags indicates animation
    if ((flags & 0x02) !== 0) {
      return true;
    }
  }
  return false;
}

/**
 * Normalizes and validates optional square crop coordinates against the oriented source dimensions.
 * If no crop is provided, returns a centered square crop covering the largest square inside the image.
 */
export function normalizeAndValidateSquareCrop(
  cropInput: AvatarCropInput | null | undefined,
  sourceWidth: number,
  sourceHeight: number
): ValidatedSquareCrop {
  const maxSquareSize = Math.min(sourceWidth, sourceHeight);

  if (!cropInput || typeof cropInput !== 'object') {
    const size = maxSquareSize;
    const left = Math.floor((sourceWidth - size) / 2);
    const top = Math.floor((sourceHeight - size) / 2);
    return { left, top, size };
  }

  const rawLeft = cropInput.left !== undefined ? cropInput.left : cropInput.x;
  const rawTop = cropInput.top !== undefined ? cropInput.top : cropInput.y;
  const rawWidth = cropInput.width !== undefined ? cropInput.width : cropInput.size;
  const rawHeight = cropInput.height !== undefined ? cropInput.height : cropInput.size;

  // If all fields are undefined, fall back to centered square crop
  if (rawLeft === undefined && rawTop === undefined && rawWidth === undefined && rawHeight === undefined) {
    const size = maxSquareSize;
    const left = Math.floor((sourceWidth - size) / 2);
    const top = Math.floor((sourceHeight - size) / 2);
    return { left, top, size };
  }

  if (
    rawLeft === undefined ||
    rawTop === undefined ||
    rawWidth === undefined ||
    rawHeight === undefined ||
    typeof rawLeft !== 'number' ||
    typeof rawTop !== 'number' ||
    typeof rawWidth !== 'number' ||
    typeof rawHeight !== 'number' ||
    !Number.isFinite(rawLeft) ||
    !Number.isFinite(rawTop) ||
    !Number.isFinite(rawWidth) ||
    !Number.isFinite(rawHeight)
  ) {
    throw new AvatarServiceError(
      400,
      'INVALID_CROP_PARAMETERS',
      'Некорректные параметры кадрирования: требуются числовые координаты x, y и размер квадрата.'
    );
  }

  const left = Math.round(rawLeft);
  const top = Math.round(rawTop);
  const width = Math.round(rawWidth);
  const height = Math.round(rawHeight);

  if (Math.abs(rawLeft - left) > 1e-3 || Math.abs(rawTop - top) > 1e-3 || Math.abs(rawWidth - width) > 1e-3 || Math.abs(rawHeight - height) > 1e-3) {
    throw new AvatarServiceError(
      400,
      'INVALID_CROP_PARAMETERS',
      'Координаты и размер области кадрирования должны быть целыми числами в пикселях.'
    );
  }

  if (width !== height) {
    throw new AvatarServiceError(
      400,
      'NON_SQUARE_CROP',
      'Область кадрирования аватара должна быть строго квадратной (width === height).'
    );
  }

  const size = width;
  const minAllowedCrop = Math.min(MIN_AVATAR_CROP_SIZE_PX, maxSquareSize);

  if (size < minAllowedCrop) {
    throw new AvatarServiceError(
      400,
      'CROP_TOO_SMALL',
      `Размер области кадрирования слишком мал (минимум ${minAllowedCrop}×${minAllowedCrop} пикс.).`
    );
  }

  if (left < 0 || top < 0 || left + size > sourceWidth || top + size > sourceHeight) {
    throw new AvatarServiceError(
      400,
      'CROP_OUT_OF_BOUNDS',
      `Область кадрирования выходит за пределы изображения (${sourceWidth}×${sourceHeight} пикс.).`
    );
  }

  return { left, top, size };
}

/**
 * Validates raw uploaded image bytes by magic bytes and real sharp decode, enforces pixel/animation policies,
 * applies square crop, strips all metadata (EXIF/ICC/XMP), and converts to 256x256 WebP.
 */
export async function inspectAndProcessAvatarImage(
  fileBuffer: Buffer,
  options?: {
    claimedMimeType?: string;
    originalFilename?: string;
    crop?: AvatarCropInput | null;
    allowAnimatedAvatars?: boolean;
  }
): Promise<ProcessedAvatarResult> {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw new AvatarServiceError(400, 'EMPTY_IMAGE_FILE', 'Файл изображения пуст или не был передан.');
  }

  if (fileBuffer.length > MAX_AVATAR_UPLOAD_BYTES) {
    throw new AvatarServiceError(
      413,
      'IMAGE_TOO_LARGE',
      'Размер файла превышает максимально допустимые 5 МБ.'
    );
  }

  if (
    containsForbiddenSvgOrMarkupSignature(fileBuffer, options?.claimedMimeType) ||
    containsForbiddenSvgOrMarkupSignature(fileBuffer, options?.originalFilename)
  ) {
    throw new AvatarServiceError(
      415,
      'SVG_NOT_ALLOWED',
      'Формат SVG и векторная/HTML-разметка запрещены. Допустимы только растровые изображения JPEG, PNG или WebP.'
    );
  }

  const magicFormat = detectImageMagicFormat(fileBuffer);
  if (!magicFormat) {
    throw new AvatarServiceError(
      415,
      'UNSUPPORTED_IMAGE_FORMAT',
      'Неподдерживаемый формат файла. Разрешены только изображения JPEG, PNG и WebP.'
    );
  }

  let metadata: SharpMetadata;
  try {
    metadata = await sharp(fileBuffer, {
      limitInputPixels: MAX_AVATAR_TOTAL_PIXELS,
      failOn: 'error',
      sequentialRead: true
    }).metadata();
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('pixel limit') || msg.includes('input image exceeds')) {
      throw new AvatarServiceError(
        400,
        'IMAGE_DIMENSIONS_OUT_OF_RANGE',
        `Разрешение изображения превышает допустимый предел (${MAX_AVATAR_DIMENSION_PX}×${MAX_AVATAR_DIMENSION_PX} пикс.).`
      );
    }
    throw new AvatarServiceError(
      400,
      'CORRUPTED_OR_INVALID_IMAGE',
      'Файл повреждён или не является корректным изображением JPEG, PNG или WebP.'
    );
  }

  const decodedFormat = metadata.format;
  if (decodedFormat !== 'jpeg' && decodedFormat !== 'png' && decodedFormat !== 'webp') {
    throw new AvatarServiceError(
      415,
      'UNSUPPORTED_IMAGE_FORMAT',
      'Проверка содержимого не пройдена: разрешены только форматы JPEG, PNG и WebP.'
    );
  }

  if (decodedFormat !== magicFormat) {
    throw new AvatarServiceError(
      400,
      'IMAGE_FORMAT_MISMATCH',
      'Сигнатура файла не совпадает с внутренней структурой изображения.'
    );
  }

  const rawWidth = Number(metadata.width || 0);
  const rawHeight = Number(metadata.height || 0);
  // In animated WebP/multi-page images, sharp may report pageHeight for a single frame
  const frameHeight = Number(metadata.pageHeight || rawHeight);

  if (
    !Number.isFinite(rawWidth) ||
    !Number.isFinite(frameHeight) ||
    rawWidth < MIN_AVATAR_DIMENSION_PX ||
    frameHeight < MIN_AVATAR_DIMENSION_PX ||
    rawWidth > MAX_AVATAR_DIMENSION_PX ||
    frameHeight > MAX_AVATAR_DIMENSION_PX ||
    rawWidth * frameHeight > MAX_AVATAR_TOTAL_PIXELS
  ) {
    throw new AvatarServiceError(
      400,
      'IMAGE_DIMENSIONS_OUT_OF_RANGE',
      `Недопустимые размеры изображения (${rawWidth}×${frameHeight}). Допустимый диапазон: от ${MIN_AVATAR_DIMENSION_PX}×${MIN_AVATAR_DIMENSION_PX} до ${MAX_AVATAR_DIMENSION_PX}×${MAX_AVATAR_DIMENSION_PX} пикселей.`
    );
  }

  const pageCount = Number(metadata.pages || 1);
  const isAnimatedSource = pageCount > 1 || (decodedFormat === 'webp' && hasWebpAnimationChunk(fileBuffer));
  const allowAnimated = Boolean(options?.allowAnimatedAvatars);

  if (isAnimatedSource && !allowAnimated) {
    throw new AvatarServiceError(
      400,
      'ANIMATED_AVATAR_DISABLED',
      'Анимированные аватары сейчас отключены в настройках проекта. Пожалуйста, загрузите статичное изображение.'
    );
  }

  // Account for EXIF orientation (orientations 5, 6, 7, 8 swap width and height after .rotate())
  const orientation = Number(metadata.orientation || 1);
  const swapsDimensions = orientation >= 5 && orientation <= 8;
  const orientedWidth = swapsDimensions ? frameHeight : rawWidth;
  const orientedHeight = swapsDimensions ? rawWidth : frameHeight;

  const validatedCrop = normalizeAndValidateSquareCrop(options?.crop, orientedWidth, orientedHeight);

  let outputBuffer: Buffer;
  try {
    if (isAnimatedSource && allowAnimated) {
      if (pageCount > 60) {
        throw new AvatarServiceError(
          400,
          'ANIMATED_AVATAR_TOO_MANY_FRAMES',
          'Слишком много кадров в анимированном изображении (максимум 60 кадров).'
        );
      }
      outputBuffer = await sharp(fileBuffer, {
        animated: true,
        limitInputPixels: MAX_AVATAR_TOTAL_PIXELS,
        failOn: 'error'
      })
        .extract({
          left: validatedCrop.left,
          top: validatedCrop.top,
          width: validatedCrop.size,
          height: validatedCrop.size
        })
        .resize(AVATAR_OUTPUT_SIZE_PX, AVATAR_OUTPUT_SIZE_PX, {
          fit: 'cover',
          position: 'centre'
        })
        .webp({
          quality: 80,
          effort: 4
        })
        .toBuffer();
    } else {
      // Static pipeline: auto-rotate according to EXIF, extract square crop, resize to 256x256, encode as WebP.
      // By not calling .withMetadata(), sharp strips all EXIF, GPS, ICC, and XMP metadata.
      outputBuffer = await sharp(fileBuffer, {
        animated: false,
        limitInputPixels: MAX_AVATAR_TOTAL_PIXELS,
        failOn: 'error',
        sequentialRead: true
      })
        .rotate()
        .extract({
          left: validatedCrop.left,
          top: validatedCrop.top,
          width: validatedCrop.size,
          height: validatedCrop.size
        })
        .resize(AVATAR_OUTPUT_SIZE_PX, AVATAR_OUTPUT_SIZE_PX, {
          fit: 'cover',
          position: 'centre'
        })
        .webp({
          quality: 82,
          effort: 4
        })
        .toBuffer();
    }
  } catch (err) {
    if (err instanceof AvatarServiceError) {
      throw err;
    }
    throw new AvatarServiceError(
      400,
      'IMAGE_PROCESSING_FAILED',
      'Не удалось обработать изображение. Убедитесь, что файл не повреждён.'
    );
  }

  if (!outputBuffer || outputBuffer.length === 0) {
    throw new AvatarServiceError(500, 'EMPTY_PROCESSED_IMAGE', 'Ошибка конвертации изображения в WebP.');
  }

  const checksumSha256 = crypto.createHash('sha256').update(outputBuffer).digest('hex');

  return {
    outputBuffer,
    mimeType: 'image/webp',
    byteSize: outputBuffer.length,
    width: AVATAR_OUTPUT_SIZE_PX,
    height: AVATAR_OUTPUT_SIZE_PX,
    isAnimated: isAnimatedSource && allowAnimated,
    detectedFormat: decodedFormat,
    sourceWidth: orientedWidth,
    sourceHeight: orientedHeight,
    appliedCrop: validatedCrop,
    checksumSha256
  };
}

/**
 * Parses an incoming HTTP upload request (either multipart/form-data or raw binary body)
 * with a strict byte ceiling so oversized uploads are rejected immediately without buffering huge payloads.
 */
export interface ParsedAvatarUploadPayload {
  fileBuffer: Buffer;
  claimedMimeType?: string;
  originalFilename?: string;
  crop?: AvatarCropInput | null;
}

function parseCropFromFields(fields: Record<string, string | undefined>): AvatarCropInput | null {
  if (fields.crop) {
    try {
      const parsed = JSON.parse(fields.crop);
      if (parsed && typeof parsed === 'object') {
        return parsed as AvatarCropInput;
      }
    } catch {
      throw new AvatarServiceError(400, 'INVALID_CROP_JSON', 'Некорректный JSON в параметре crop.');
    }
  }

  const xRaw = fields.cropX ?? fields.x ?? fields.left;
  const yRaw = fields.cropY ?? fields.y ?? fields.top;
  const sizeRaw = fields.cropSize ?? fields.size;
  const widthRaw = fields.cropWidth ?? fields.width ?? sizeRaw;
  const heightRaw = fields.cropHeight ?? fields.height ?? sizeRaw;

  if (xRaw === undefined && yRaw === undefined && widthRaw === undefined && heightRaw === undefined) {
    return null;
  }

  return {
    left: xRaw !== undefined ? Number(xRaw) : undefined,
    top: yRaw !== undefined ? Number(yRaw) : undefined,
    width: widthRaw !== undefined ? Number(widthRaw) : undefined,
    height: heightRaw !== undefined ? Number(heightRaw) : undefined
  };
}

function parseMultipartFormDataBuffer(
  rawBody: Buffer,
  boundary: string
): ParsedAvatarUploadPayload {
  const boundaryBuffer = Buffer.from(`--${boundary}`, 'utf8');
  const doubleCrLf = Buffer.from('\r\n\r\n', 'utf8');

  const fields: Record<string, string | undefined> = {};
  let fileBuffer: Buffer | null = null;
  let claimedMimeType: string | undefined;
  let originalFilename: string | undefined;

  let cursor = rawBody.indexOf(boundaryBuffer);
  if (cursor === -1) {
    throw new AvatarServiceError(400, 'INVALID_MULTIPART_BODY', 'Некорректный формат multipart/form-data.');
  }

  while (cursor !== -1) {
    const partStart = cursor + boundaryBuffer.length;
    if (partStart + 2 <= rawBody.length && rawBody[partStart] === 0x2d && rawBody[partStart + 1] === 0x2d) {
      // Reached closing "--boundary--"
      break;
    }

    const nextBoundaryIndex = rawBody.indexOf(boundaryBuffer, partStart);
    if (nextBoundaryIndex === -1) {
      break;
    }

    // Strip leading \r\n after boundary and trailing \r\n before next boundary
    let sliceStart = partStart;
    if (rawBody[sliceStart] === 0x0d && rawBody[sliceStart + 1] === 0x0a) {
      sliceStart += 2;
    }
    let sliceEnd = nextBoundaryIndex;
    if (sliceEnd - 2 >= sliceStart && rawBody[sliceEnd - 2] === 0x0d && rawBody[sliceEnd - 1] === 0x0a) {
      sliceEnd -= 2;
    }

    const partBuffer = rawBody.subarray(sliceStart, sliceEnd);
    const headerEndIndex = partBuffer.indexOf(doubleCrLf);
    if (headerEndIndex !== -1) {
      const headerText = partBuffer.subarray(0, headerEndIndex).toString('utf8');
      const contentBuffer = partBuffer.subarray(headerEndIndex + 4);

      const nameMatch = headerText.match(/name="([^"]+)"/i);
      const filenameMatch = headerText.match(/filename="([^"]*)"/i);
      const contentTypeMatch = headerText.match(/content-type:\s*([^\r\n;]+)/i);

      const fieldName = nameMatch ? nameMatch[1] : '';
      if (filenameMatch || fieldName === 'avatar' || fieldName === 'file' || fieldName === 'image') {
        if (!fileBuffer) {
          fileBuffer = Buffer.from(contentBuffer);
          claimedMimeType = contentTypeMatch ? contentTypeMatch[1].trim() : undefined;
          originalFilename = filenameMatch ? filenameMatch[1] : undefined;
        }
      } else if (fieldName && contentBuffer.length <= 4096) {
        fields[fieldName] = contentBuffer.toString('utf8').trim();
      }
    }

    cursor = nextBoundaryIndex;
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    throw new AvatarServiceError(
      400,
      'MISSING_IMAGE_FILE',
      'Файл изображения не найден в запросе (ожидается поле avatar, file или image).'
    );
  }

  if (fileBuffer.length > MAX_AVATAR_UPLOAD_BYTES) {
    throw new AvatarServiceError(
      413,
      'IMAGE_TOO_LARGE',
      'Размер файла превышает максимально допустимые 5 МБ.'
    );
  }

  const crop = parseCropFromFields(fields);
  return {
    fileBuffer,
    claimedMimeType,
    originalFilename,
    crop
  };
}

async function readRequestStreamWithLimit(req: Request, maxBytes: number): Promise<Buffer> {
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    if (req.body.length > maxBytes) {
      throw new AvatarServiceError(
        413,
        'IMAGE_TOO_LARGE',
        'Размер файла превышает максимально допустимые 5 МБ.'
      );
    }
    return req.body;
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        settled = true;
        reject(
          new AvatarServiceError(
            413,
            'IMAGE_TOO_LARGE',
            'Размер файла превышает максимально допустимые 5 МБ.'
          )
        );
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

export async function parseAvatarUploadRequest(req: Request): Promise<ParsedAvatarUploadPayload> {
  const contentTypeHeader = String(req.headers['content-type'] || '').toLowerCase();

  if (contentTypeHeader.includes('application/json')) {
    throw new AvatarServiceError(
      415,
      'JSON_UPLOAD_NOT_SUPPORTED',
      'Передача изображений в JSON/base64 не поддерживается. Используйте multipart/form-data или бинарный поток.'
    );
  }

  // Allow up to 64 KB overhead for multipart headers/crop fields while strictly enforcing 5 MB on the file itself
  const maxStreamBytes = contentTypeHeader.startsWith('multipart/form-data')
    ? MAX_AVATAR_UPLOAD_BYTES + 64 * 1024
    : MAX_AVATAR_UPLOAD_BYTES;

  const rawBody = await readRequestStreamWithLimit(req, maxStreamBytes);

  if (contentTypeHeader.startsWith('multipart/form-data')) {
    const boundaryMatch = String(req.headers['content-type'] || '').match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : '';
    if (!boundary) {
      throw new AvatarServiceError(400, 'MISSING_MULTIPART_BOUNDARY', 'Отсутствует boundary в заголовке multipart/form-data.');
    }
    return parseMultipartFormDataBuffer(rawBody, boundary);
  }

  if (rawBody.length === 0) {
    throw new AvatarServiceError(400, 'EMPTY_IMAGE_FILE', 'Тело запроса пусто. Передайте файл изображения.');
  }

  if (rawBody.length > MAX_AVATAR_UPLOAD_BYTES) {
    throw new AvatarServiceError(413, 'IMAGE_TOO_LARGE', 'Размер файла превышает максимально допустимые 5 МБ.');
  }

  const queryFields: Record<string, string | undefined> = {
    crop: typeof req.query?.crop === 'string' ? req.query.crop : (typeof req.headers['x-avatar-crop'] === 'string' ? req.headers['x-avatar-crop'] : undefined),
    cropX: typeof req.query?.cropX === 'string' ? req.query.cropX : (typeof req.query?.x === 'string' ? req.query.x : undefined),
    cropY: typeof req.query?.cropY === 'string' ? req.query.cropY : (typeof req.query?.y === 'string' ? req.query.y : undefined),
    cropSize: typeof req.query?.cropSize === 'string' ? req.query.cropSize : (typeof req.query?.size === 'string' ? req.query.size : undefined),
    cropWidth: typeof req.query?.cropWidth === 'string' ? req.query.cropWidth : (typeof req.query?.width === 'string' ? req.query.width : undefined),
    cropHeight: typeof req.query?.cropHeight === 'string' ? req.query.cropHeight : (typeof req.query?.height === 'string' ? req.query.height : undefined)
  };

  const crop = parseCropFromFields(queryFields);
  const originalFilename = typeof req.headers['x-file-name'] === 'string' ? req.headers['x-file-name'] : undefined;

  return {
    fileBuffer: rawBody,
    claimedMimeType: contentTypeHeader.split(';')[0].trim() || undefined,
    originalFilename,
    crop
  };
}

/**
 * Helper to determine if a user's `avatar_seed` or `active_avatar_id` points to a specific gallery `avatarId`.
 */
export function resolveActiveGalleryAvatarId(
  activeAvatarIdColumn: string | null | undefined,
  avatarSeedColumn: string | null | undefined
): string | null {
  const trimmedActive = typeof activeAvatarIdColumn === 'string' ? activeAvatarIdColumn.trim() : '';
  if (trimmedActive) {
    return trimmedActive;
  }

  const trimmedSeed = typeof avatarSeedColumn === 'string' ? avatarSeedColumn.trim() : '';
  if (!trimmedSeed) {
    return null;
  }

  if (trimmedSeed.startsWith('custom_avatar:')) {
    const idPart = trimmedSeed.slice('custom_avatar:'.length).trim();
    return idPart || null;
  }

  // UUID v4 pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedSeed)) {
    return trimmedSeed.toLowerCase();
  }

  return null;
}

/**
 * Validates incoming admin payload for updating avatar project settings (`avatar_gallery_limit` and `avatar_allow_animated`).
 * Accepts either top-level `{ galleryLimit, allowAnimatedAvatars }` or nested `{ avatars: { galleryLimit, allowAnimatedAvatars } }`.
 */
export function validateAdminAvatarProjectSettingsPayload(payload: unknown): {
  galleryLimit: number;
  allowAnimatedAvatars: boolean;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AvatarServiceError(400, 'INVALID_SETTINGS_PAYLOAD', 'Некорректное тело запроса настроек проекта.');
  }

  const record = payload as Record<string, any>;
  const source =
    record.avatars && typeof record.avatars === 'object' && !Array.isArray(record.avatars)
      ? (record.avatars as Record<string, any>)
      : record;

  const rawLimit = source.galleryLimit ?? source.avatar_gallery_limit;
  let parsedLimit: number = NaN;

  if (typeof rawLimit === 'number') {
    parsedLimit = rawLimit;
  } else if (typeof rawLimit === 'string' && /^\d+$/.test(rawLimit.trim())) {
    parsedLimit = Number(rawLimit.trim());
  }

  if (
    !Number.isSafeInteger(parsedLimit) ||
    parsedLimit < MIN_AVATAR_GALLERY_LIMIT ||
    parsedLimit > MAX_AVATAR_GALLERY_LIMIT
  ) {
    throw new AvatarServiceError(
      400,
      'INVALID_GALLERY_LIMIT',
      `Лимит личной галереи должен быть положительным целым числом от ${MIN_AVATAR_GALLERY_LIMIT} до ${MAX_AVATAR_GALLERY_LIMIT}.`
    );
  }

  const rawAnimated = source.allowAnimatedAvatars ?? source.avatar_allow_animated;
  if (typeof rawAnimated !== 'boolean') {
    throw new AvatarServiceError(
      400,
      'INVALID_ALLOW_ANIMATED',
      'Параметр «Разрешить анимированные аватары» должен быть логическим значением (true или false).'
    );
  }

  return {
    galleryLimit: parsedLimit,
    allowAnimatedAvatars: rawAnimated
  };
}

export class UserAvatarService {
  private readonly customDb?: DbClientLike;
  private readonly storage: R2ObjectStorageAdapter;

  constructor(deps?: { db?: DbClientLike; storage?: R2ObjectStorageAdapter }) {
    this.customDb = deps?.db;
    this.storage = deps?.storage ?? defaultR2StorageAdapter;
  }

  private get db(): DbClientLike {
    return this.customDb ?? getDatabase();
  }

  /**
   * Reads configurable gallery limit and animated avatar toggle from `project_settings`.
   */
  async getAvatarProjectSettings(): Promise<AvatarProjectSettings> {
    let galleryLimit = DEFAULT_AVATAR_GALLERY_LIMIT;
    let allowAnimatedAvatars = DEFAULT_ALLOW_ANIMATED_AVATARS;

    try {
      const res = await this.db.execute({
        sql: `SELECT key, value FROM project_settings WHERE key IN (?, ?)`,
        args: [PROJECT_SETTING_AVATAR_GALLERY_LIMIT, PROJECT_SETTING_AVATAR_ALLOW_ANIMATED]
      });

      for (const row of res.rows as any[]) {
        const key = String(row.key || '');
        const val = String(row.value || '').trim();
        if (key === PROJECT_SETTING_AVATAR_GALLERY_LIMIT) {
          const parsedLimit = Number(val);
          if (
            Number.isSafeInteger(parsedLimit) &&
            parsedLimit >= MIN_AVATAR_GALLERY_LIMIT &&
            parsedLimit <= MAX_AVATAR_GALLERY_LIMIT
          ) {
            galleryLimit = parsedLimit;
          }
        } else if (key === PROJECT_SETTING_AVATAR_ALLOW_ANIMATED) {
          allowAnimatedAvatars = val.toLowerCase() === 'true' || val === '1';
        }
      }
    } catch {
      // Fallback to safe defaults if table/rows are not yet initialized
    }

    return { galleryLimit, allowAnimatedAvatars };
  }

  /**
   * Returns extended avatar project settings snapshot with metadata and pipeline bounds
   * for the Main Admin «Настройки проекта» section.
   */
  async getAdminAvatarProjectSettingsSnapshot(): Promise<AdminAvatarProjectSettingsSnapshot> {
    let galleryLimit = DEFAULT_AVATAR_GALLERY_LIMIT;
    let allowAnimatedAvatars = DEFAULT_ALLOW_ANIMATED_AVATARS;
    let updatedAt: string | null = null;
    let updatedBy: string | null = null;

    try {
      const res = await this.db.execute({
        sql: `SELECT key, value, updated_at, updated_by FROM project_settings WHERE key IN (?, ?)`,
        args: [PROJECT_SETTING_AVATAR_GALLERY_LIMIT, PROJECT_SETTING_AVATAR_ALLOW_ANIMATED]
      });

      for (const row of res.rows as any[]) {
        const key = String(row.key || '');
        const val = String(row.value || '').trim();
        const rowUpdatedAt = row.updated_at ? String(row.updated_at) : null;
        const rowUpdatedBy = row.updated_by ? String(row.updated_by) : null;

        if (rowUpdatedAt && (!updatedAt || rowUpdatedAt >= updatedAt)) {
          updatedAt = rowUpdatedAt;
          updatedBy = rowUpdatedBy;
        }

        if (key === PROJECT_SETTING_AVATAR_GALLERY_LIMIT) {
          const parsedLimit = Number(val);
          if (
            Number.isSafeInteger(parsedLimit) &&
            parsedLimit >= MIN_AVATAR_GALLERY_LIMIT &&
            parsedLimit <= MAX_AVATAR_GALLERY_LIMIT
          ) {
            galleryLimit = parsedLimit;
          }
        } else if (key === PROJECT_SETTING_AVATAR_ALLOW_ANIMATED) {
          allowAnimatedAvatars = val.toLowerCase() === 'true' || val === '1';
        }
      }
    } catch {
      // Fallback to safe defaults
    }

    return {
      galleryLimit,
      allowAnimatedAvatars,
      defaultGalleryLimit: DEFAULT_AVATAR_GALLERY_LIMIT,
      defaultAllowAnimatedAvatars: DEFAULT_ALLOW_ANIMATED_AVATARS,
      minGalleryLimit: MIN_AVATAR_GALLERY_LIMIT,
      maxGalleryLimit: MAX_AVATAR_GALLERY_LIMIT,
      supportedStaticFormats: ['JPEG', 'PNG', 'WebP'],
      supportedAnimatedFormats: ['Animated WebP (image/webp)'],
      maxUploadBytes: MAX_AVATAR_UPLOAD_BYTES,
      minDimensionPx: MIN_AVATAR_DIMENSION_PX,
      maxDimensionPx: MAX_AVATAR_DIMENSION_PX,
      outputDimensionPx: AVATAR_OUTPUT_SIZE_PX,
      maxAnimatedFrames: MAX_AVATAR_ANIMATED_FRAMES,
      updatedAt,
      updatedBy
    };
  }

  /**
   * Updates avatar project settings in `project_settings`.
   * Enforces strict positive integer validation for `galleryLimit` and strict boolean validation for `allowAnimatedAvatars`.
   */
  async updateAvatarProjectSettings(
    updates: { galleryLimit?: number; allowAnimatedAvatars?: boolean },
    updatedBy: string = 'admin'
  ): Promise<AvatarProjectSettings> {
    if (!updates || typeof updates !== 'object') {
      throw new AvatarServiceError(400, 'INVALID_SETTINGS_PAYLOAD', 'Некорректные данные настроек проекта.');
    }

    let validatedLimit: number | undefined;
    if (updates.galleryLimit !== undefined) {
      const rawLimit = updates.galleryLimit;
      if (
        typeof rawLimit !== 'number' ||
        !Number.isSafeInteger(rawLimit) ||
        rawLimit < MIN_AVATAR_GALLERY_LIMIT ||
        rawLimit > MAX_AVATAR_GALLERY_LIMIT
      ) {
        throw new AvatarServiceError(
          400,
          'INVALID_GALLERY_LIMIT',
          `Лимит личной галереи должен быть положительным целым числом от ${MIN_AVATAR_GALLERY_LIMIT} до ${MAX_AVATAR_GALLERY_LIMIT}.`
        );
      }
      validatedLimit = rawLimit;
    }

    let validatedAnimated: boolean | undefined;
    if (updates.allowAnimatedAvatars !== undefined) {
      if (typeof updates.allowAnimatedAvatars !== 'boolean') {
        throw new AvatarServiceError(
          400,
          'INVALID_ALLOW_ANIMATED',
          'Параметр «Разрешить анимированные аватары» должен быть логическим значением (true или false).'
        );
      }
      validatedAnimated = updates.allowAnimatedAvatars;
    }

    const nowIso = new Date().toISOString();

    if (validatedLimit !== undefined) {
      await this.db.execute({
        sql: `INSERT INTO project_settings (key, value, updated_at, updated_by)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        args: [PROJECT_SETTING_AVATAR_GALLERY_LIMIT, String(validatedLimit), nowIso, updatedBy]
      });
    }

    if (validatedAnimated !== undefined) {
      const allowStr = validatedAnimated ? 'true' : 'false';
      await this.db.execute({
        sql: `INSERT INTO project_settings (key, value, updated_at, updated_by)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        args: [PROJECT_SETTING_AVATAR_ALLOW_ANIMATED, allowStr, nowIso, updatedBy]
      });
    }

    return this.getAvatarProjectSettings();
  }

  private async getUserActiveGalleryAvatarId(userId: string): Promise<string | null> {
    const userRes = await this.db.execute({
      sql: `SELECT id, avatar_seed, active_avatar_id FROM users WHERE id = ? LIMIT 1`,
      args: [userId]
    });
    if (userRes.rows.length === 0) {
      throw new AvatarServiceError(404, 'USER_NOT_FOUND', 'Пользователь не найден.');
    }
    const row = userRes.rows[0] as any;
    const candidateId = resolveActiveGalleryAvatarId(
      row.active_avatar_id ? String(row.active_avatar_id) : null,
      row.avatar_seed ? String(row.avatar_seed) : null
    );
    if (!candidateId) {
      return null;
    }

    // Confirm that candidateId exists in user_avatars for this user
    const avatarRes = await this.db.execute({
      sql: `SELECT id FROM user_avatars WHERE id = ? AND user_id = ? AND status = 'ready' LIMIT 1`,
      args: [candidateId, userId]
    });
    if (avatarRes.rows.length === 0) {
      return null;
    }
    return String((avatarRes.rows[0] as any).id);
  }

  /**
   * Lists all ready images in the authenticated user's personal gallery.
   * Never returns binary data or base64 strings.
   */
  async listUserAvatars(userId: string): Promise<UserAvatarListResult> {
    const [settings, activeAvatarId, rowsRes] = await Promise.all([
      this.getAvatarProjectSettings(),
      this.getUserActiveGalleryAvatarId(userId),
      this.db.execute({
        sql: `SELECT id, user_id, mime_type, byte_size, width, height, is_animated, created_at
              FROM user_avatars
              WHERE user_id = ? AND status = 'ready'
              ORDER BY created_at DESC`,
        args: [userId]
      })
    ]);

    const avatars: UserAvatarMetadataDto[] = (rowsRes.rows as any[]).map((row) => {
      const id = String(row.id);
      return {
        id,
        userId: String(row.user_id),
        imageUrl: `/api/user/avatars/${encodeURIComponent(id)}/image`,
        mimeType: String(row.mime_type || 'image/webp'),
        byteSize: Number(row.byte_size || 0),
        width: Number(row.width || AVATAR_OUTPUT_SIZE_PX),
        height: Number(row.height || AVATAR_OUTPUT_SIZE_PX),
        isAnimated: Number(row.is_animated || 0) === 1,
        isActive: activeAvatarId === id,
        createdAt: String(row.created_at)
      };
    });

    const count = avatars.length;
    const maxLimit = settings.galleryLimit;
    const remainingSlots = Math.max(0, maxLimit - count);

    return {
      avatars,
      count,
      maxLimit,
      remainingSlots,
      allowAnimatedAvatars: settings.allowAnimatedAvatars,
      activeAvatarId
    };
  }

  /**
   * Validates, crops, converts to 256x256 WebP, uploads to private R2 (`avatars/<userId>/<uuid>.webp`),
   * and records metadata in `user_avatars`.
   * Does NOT deduct credits or certificates and does NOT change the user's active avatar.
   */
  async uploadUserAvatar(params: {
    userId: string;
    fileBuffer: Buffer;
    claimedMimeType?: string;
    originalFilename?: string;
    crop?: AvatarCropInput | null;
  }): Promise<{
    avatar: UserAvatarMetadataDto;
    count: number;
    maxLimit: number;
    remainingSlots: number;
  }> {
    const { userId, fileBuffer, claimedMimeType, originalFilename, crop } = params;

    // 1. Verify user exists
    const userRes = await this.db.execute({
      sql: `SELECT id FROM users WHERE id = ? LIMIT 1`,
      args: [userId]
    });
    if (userRes.rows.length === 0) {
      throw new AvatarServiceError(404, 'USER_NOT_FOUND', 'Пользователь не найден.');
    }

    // 2. Load project settings & enforce personal gallery limit before heavy processing
    const settings = await this.getAvatarProjectSettings();
    const countRes = await this.db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM user_avatars WHERE user_id = ? AND status = 'ready'`,
      args: [userId]
    });
    const currentCount = Number((countRes.rows[0] as any)?.cnt || 0);
    if (currentCount >= settings.galleryLimit) {
      throw new AvatarServiceError(
        409,
        'AVATAR_GALLERY_LIMIT_REACHED',
        `Достигнут лимит личной галереи (${settings.galleryLimit} изображений). Удалите неиспользуемый аватар перед загрузкой нового.`
      );
    }

    // 3. Validate binary signature, dimensions, animation policy, crop, and convert to 256x256 WebP
    const processed = await inspectAndProcessAvatarImage(fileBuffer, {
      claimedMimeType,
      originalFilename,
      crop,
      allowAnimatedAvatars: settings.allowAnimatedAvatars
    });

    // 4. Generate server-controlled UUID and R2 key `avatars/<userId>/<uuid>.webp`
    const avatarId = crypto.randomUUID();
    const objectKey = buildAvatarObjectKey(userId, avatarId);
    if (!isValidAvatarObjectKey(objectKey)) {
      throw new AvatarServiceError(500, 'INVALID_GENERATED_OBJECT_KEY', 'Ошибка формирования ключа хранения аватара.');
    }

    // 5. Re-verify gallery count right before storage write
    const recheckRes = await this.db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM user_avatars WHERE user_id = ? AND status = 'ready'`,
      args: [userId]
    });
    const latestCount = Number((recheckRes.rows[0] as any)?.cnt || 0);
    if (latestCount >= settings.galleryLimit) {
      throw new AvatarServiceError(
        409,
        'AVATAR_GALLERY_LIMIT_REACHED',
        `Достигнут лимит личной галереи (${settings.galleryLimit} изображений).`
      );
    }

    // 6. Upload WebP binary to private R2 bucket
    try {
      await this.storage.putObject({
        key: objectKey,
        body: processed.outputBuffer,
        contentType: processed.mimeType
      });
    } catch (err: any) {
      console.error('[Avatars] R2 putObject failed:', err?.message || err);
      throw new AvatarServiceError(
        502,
        'R2_UPLOAD_FAILED',
        'Не удалось сохранить изображение в защищённом хранилище. Попробуйте позже.'
      );
    }

    // 7. Insert metadata into LibSQL/Turso; if DB insert fails, clean up the R2 object immediately
    const nowIso = new Date().toISOString();
    try {
      await this.db.execute({
        sql: `INSERT INTO user_avatars (
                id, user_id, object_key, mime_type, byte_size, width, height,
                is_animated, checksum_sha256, status, cleanup_error, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', NULL, ?, ?)`,
        args: [
          avatarId,
          userId,
          objectKey,
          processed.mimeType,
          processed.byteSize,
          processed.width,
          processed.height,
          processed.isAnimated ? 1 : 0,
          processed.checksumSha256,
          nowIso,
          nowIso
        ]
      });
    } catch (dbErr: any) {
      console.error('[Avatars] DB insert failed after R2 upload; attempting compensating R2 delete:', dbErr?.message || dbErr);
      try {
        await this.storage.deleteObject({ key: objectKey });
      } catch (cleanupErr: any) {
        console.error('[Avatars] Compensating R2 delete failed for key:', objectKey, cleanupErr?.message || cleanupErr);
      }
      throw new AvatarServiceError(
        500,
        'AVATAR_METADATA_SAVE_FAILED',
        'Не удалось сохранить метаданные аватара в базе данных.'
      );
    }

    const activeAvatarId = await this.getUserActiveGalleryAvatarId(userId);
    const newCount = latestCount + 1;

    return {
      avatar: {
        id: avatarId,
        userId,
        imageUrl: `/api/user/avatars/${encodeURIComponent(avatarId)}/image`,
        mimeType: processed.mimeType,
        byteSize: processed.byteSize,
        width: processed.width,
        height: processed.height,
        isAnimated: processed.isAnimated,
        isActive: activeAvatarId === avatarId,
        createdAt: nowIso
      },
      count: newCount,
      maxLimit: settings.galleryLimit,
      remainingSlots: Math.max(0, settings.galleryLimit - newCount)
    };
  }

  /**
   * Fetches a single gallery item's binary image strictly for its owner.
   * Throws 403 Forbidden if another user tries to access someone else's personal gallery item.
   */
  async getOwnerAvatarBinary(
    requestingUserId: string,
    avatarId: string
  ): Promise<{
    body: Buffer;
    contentType: string;
    byteSize: number;
    etag: string;
    avatarId: string;
  }> {
    const cleanAvatarId = String(avatarId || '').trim();
    if (!cleanAvatarId) {
      throw new AvatarServiceError(400, 'INVALID_AVATAR_ID', 'Не указан идентификатор аватара.');
    }

    const res = await this.db.execute({
      sql: `SELECT id, user_id, object_key, mime_type, byte_size, checksum_sha256, status
            FROM user_avatars
            WHERE id = ?
            LIMIT 1`,
      args: [cleanAvatarId]
    });

    if (res.rows.length === 0) {
      throw new AvatarServiceError(404, 'AVATAR_NOT_FOUND', 'Аватар не найден в галерее.');
    }

    const row = res.rows[0] as any;
    if (String(row.user_id) !== String(requestingUserId)) {
      throw new AvatarServiceError(
        403,
        'AVATAR_FORBIDDEN',
        'Доступ к личной галерее другого игрока запрещён.'
      );
    }

    if (String(row.status) !== 'ready') {
      throw new AvatarServiceError(404, 'AVATAR_NOT_FOUND', 'Аватар недоступен или находится в процессе удаления.');
    }

    const objectKey = String(row.object_key);
    if (!isValidAvatarObjectKey(objectKey)) {
      throw new AvatarServiceError(500, 'INVALID_STORED_OBJECT_KEY', 'Некорректный ключ объекта в метаданных.');
    }

    try {
      const r2Obj = await this.storage.getObject({ key: objectKey });
      if (!r2Obj) {
        throw new Error('Object not found in R2');
      }
      const etag = row.checksum_sha256 ? `"${String(row.checksum_sha256)}"` : `"${cleanAvatarId}"`;
      return {
        body: r2Obj.body,
        contentType: String(row.mime_type || r2Obj.contentType || 'image/webp'),
        byteSize: r2Obj.body.length,
        etag,
        avatarId: cleanAvatarId
      };
    } catch (err: any) {
      console.error('[Avatars] Failed to read owner avatar from R2:', err?.message || err);
      throw new AvatarServiceError(
        404,
        'AVATAR_STORAGE_OBJECT_MISSING',
        'Изображение аватара не найдено в хранилище.'
      );
    }
  }

  /**
   * Serves the currently active custom avatar of `targetUserId` to other players via a controlled server route.
   * Respects account deletion profile hiding and never exposes non-active gallery items.
   */
  async getActiveAvatarBinaryForPlayer(
    targetUserId: string
  ): Promise<{
    body: Buffer;
    contentType: string;
    byteSize: number;
    etag: string;
    avatarId: string;
  }> {
    const cleanUserId = String(targetUserId || '').trim();
    if (!cleanUserId) {
      throw new AvatarServiceError(400, 'INVALID_USER_ID', 'Не указан идентификатор пользователя.');
    }

    const isHidden = await accountDeletionDb.isUserPublicProfileHidden(cleanUserId);
    if (isHidden) {
      throw new AvatarServiceError(404, 'ACTIVE_AVATAR_NOT_FOUND', 'Профиль пользователя скрыт или ожидает удаления.');
    }

    const activeAvatarId = await this.getUserActiveGalleryAvatarId(cleanUserId);
    if (!activeAvatarId) {
      throw new AvatarServiceError(
        404,
        'ACTIVE_CUSTOM_AVATAR_NOT_SET',
        'У пользователя не установлен активный пользовательский аватар из галереи.'
      );
    }

    const res = await this.db.execute({
      sql: `SELECT id, user_id, object_key, mime_type, byte_size, checksum_sha256, status
            FROM user_avatars
            WHERE id = ? AND user_id = ? AND status = 'ready'
            LIMIT 1`,
      args: [activeAvatarId, cleanUserId]
    });

    if (res.rows.length === 0) {
      throw new AvatarServiceError(404, 'ACTIVE_AVATAR_NOT_FOUND', 'Активный аватар не найден.');
    }

    const row = res.rows[0] as any;
    const objectKey = String(row.object_key);
    if (!isValidAvatarObjectKey(objectKey)) {
      throw new AvatarServiceError(500, 'INVALID_STORED_OBJECT_KEY', 'Некорректный ключ объекта активного аватара.');
    }

    try {
      const r2Obj = await this.storage.getObject({ key: objectKey });
      if (!r2Obj) {
        throw new Error('Object not found in R2');
      }
      const etag = row.checksum_sha256 ? `"${String(row.checksum_sha256)}"` : `"${activeAvatarId}"`;
      return {
        body: r2Obj.body,
        contentType: String(row.mime_type || r2Obj.contentType || 'image/webp'),
        byteSize: r2Obj.body.length,
        etag,
        avatarId: activeAvatarId
      };
    } catch (err: any) {
      console.error('[Avatars] Failed to read active avatar from R2:', err?.message || err);
      throw new AvatarServiceError(404, 'ACTIVE_AVATAR_STORAGE_MISSING', 'Файл активного аватара не найден в хранилище.');
    }
  }

  /**
   * Deletes an avatar from the owner's personal gallery and from R2 storage.
   * Strictly forbids deleting another user's avatar (403) or deleting the currently active avatar (409).
   * Handles partial failures between R2 and LibSQL so metadata and object storage remain consistent.
   */
  async deleteUserAvatar(
    requestingUserId: string,
    avatarId: string
  ): Promise<{
    deletedAvatarId: string;
    count: number;
    maxLimit: number;
    remainingSlots: number;
  }> {
    const cleanAvatarId = String(avatarId || '').trim();
    if (!cleanAvatarId) {
      throw new AvatarServiceError(400, 'INVALID_AVATAR_ID', 'Не указан идентификатор аватара.');
    }

    const res = await this.db.execute({
      sql: `SELECT id, user_id, object_key, status FROM user_avatars WHERE id = ? LIMIT 1`,
      args: [cleanAvatarId]
    });

    if (res.rows.length === 0) {
      throw new AvatarServiceError(404, 'AVATAR_NOT_FOUND', 'Аватар не найден в личной галерее.');
    }

    const row = res.rows[0] as any;
    if (String(row.user_id) !== String(requestingUserId)) {
      throw new AvatarServiceError(
        403,
        'AVATAR_FORBIDDEN',
        'Вы не можете удалить аватар другого пользователя.'
      );
    }

    // Check if this avatar is currently active for the user
    const activeAvatarId = await this.getUserActiveGalleryAvatarId(requestingUserId);
    if (activeAvatarId && activeAvatarId === cleanAvatarId) {
      throw new AvatarServiceError(
        409,
        'CANNOT_DELETE_ACTIVE_AVATAR',
        'Нельзя удалить текущий активный аватар. Сначала выберите другой аватар.'
      );
    }

    const objectKey = String(row.object_key);
    if (!isValidAvatarObjectKey(objectKey)) {
      throw new AvatarServiceError(500, 'INVALID_STORED_OBJECT_KEY', 'Некорректный ключ объекта в метаданных.');
    }

    const nowIso = new Date().toISOString();

    // Step 1: Delete object from R2 first. If R2 fails, keep the DB row and record the error so no orphan is created.
    try {
      await this.storage.deleteObject({ key: objectKey });
    } catch (r2Err: any) {
      const errMsg = String(r2Err?.message || 'R2 delete failed').slice(0, 500);
      try {
        await this.db.execute({
          sql: `UPDATE user_avatars SET cleanup_error = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
          args: [errMsg, nowIso, cleanAvatarId, requestingUserId]
        });
      } catch {}
      throw new AvatarServiceError(
        502,
        'R2_DELETE_FAILED',
        'Не удалось удалить файл аватара из облачного хранилища. Попробуйте повторить удаление позже.'
      );
    }

    // Step 2: Remove metadata row from DB. If DB DELETE fails after R2 delete, mark row as 'deleted_pending_db_cleanup'
    // so it no longer counts toward the user's gallery limit or shows in their gallery.
    try {
      await this.db.execute({
        sql: `DELETE FROM user_avatars WHERE id = ? AND user_id = ?`,
        args: [cleanAvatarId, requestingUserId]
      });
    } catch (dbErr: any) {
      const errMsg = String(dbErr?.message || 'DB delete failed after R2 delete').slice(0, 500);
      try {
        await this.db.execute({
          sql: `UPDATE user_avatars SET status = 'deleted_orphan_meta', cleanup_error = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
          args: [errMsg, nowIso, cleanAvatarId, requestingUserId]
        });
      } catch {}
      throw new AvatarServiceError(
        500,
        'AVATAR_METADATA_DELETE_FAILED',
        'Файл удалён из хранилища, но возникла ошибка при очистке записи в базе данных.'
      );
    }

    const [settings, countRes] = await Promise.all([
      this.getAvatarProjectSettings(),
      this.db.execute({
        sql: `SELECT COUNT(*) AS cnt FROM user_avatars WHERE user_id = ? AND status = 'ready'`,
        args: [requestingUserId]
      })
    ]);

    const remainingCount = Number((countRes.rows[0] as any)?.cnt || 0);

    return {
      deletedAvatarId: cleanAvatarId,
      count: remainingCount,
      maxLimit: settings.galleryLimit,
      remainingSlots: Math.max(0, settings.galleryLimit - remainingCount)
    };
  }

  /**
   * Stage 3: Atomically activates an uploaded image from the user's personal gallery.
   * Verifies ownership, 'ready' status, and physical object existence in R2 BEFORE deducting payment.
   * Prevents duplicate charges on repeated requests or already-active avatars.
   */
  async activateUserAvatar(params: {
    userId: string;
    avatarId: string;
    useCertificate: boolean;
    costCreditsOverride?: number;
  }): Promise<{
    alreadyActive: boolean;
    activeAvatarId: string;
    certificateUsed: boolean;
    costCredits: number;
    credits: number;
    inventory: UserInventoryItem[];
  }> {
    const cleanUserId = String(params.userId || '').trim();
    const cleanAvatarId = String(params.avatarId || '').trim();
    const useCertificate = Boolean(params.useCertificate);

    if (!cleanUserId) {
      throw new AvatarServiceError(400, 'INVALID_USER_ID', 'Не указан идентификатор пользователя.');
    }
    if (!cleanAvatarId) {
      throw new AvatarServiceError(400, 'INVALID_AVATAR_ID', 'Не указан идентификатор выбранного аватара.');
    }

    let avatarCost = DEFAULT_AVATAR_CHANGE_COST;
    if (typeof params.costCreditsOverride === 'number' && Number.isFinite(params.costCreditsOverride) && params.costCreditsOverride >= 0) {
      avatarCost = Math.round(params.costCreditsOverride);
    } else {
      try {
        const shopSettings = await shopDb.getSettings();
        if (typeof shopSettings.avatarChangeCost === 'number' && Number.isFinite(shopSettings.avatarChangeCost)) {
          avatarCost = shopSettings.avatarChangeCost;
        }
      } catch {
        avatarCost = DEFAULT_AVATAR_CHANGE_COST;
      }
    }

    return rewardMutex.runExclusive(`user:${cleanUserId}`, async () => {
      // 1. Load user record
      const userRes = await this.db.execute({
        sql: `SELECT id, avatar_seed, active_avatar_id, credits, inventory FROM users WHERE id = ? LIMIT 1`,
        args: [cleanUserId]
      });
      if (userRes.rows.length === 0) {
        throw new AvatarServiceError(404, 'USER_NOT_FOUND', 'Пользователь не найден.');
      }
      const userRow = userRes.rows[0] as any;
      const currentCredits = Number(userRow.credits ?? 0);
      let currentInventory: UserInventoryItem[] = [];
      try {
        currentInventory = typeof userRow.inventory === 'string'
          ? JSON.parse(userRow.inventory)
          : Array.isArray(userRow.inventory)
          ? structuredClone(userRow.inventory)
          : [];
        if (!Array.isArray(currentInventory)) currentInventory = [];
      } catch {
        currentInventory = [];
      }

      // 2. Load target avatar from user_avatars and verify ownership & ready status
      const avatarRes = await this.db.execute({
        sql: `SELECT id, user_id, object_key, status FROM user_avatars WHERE id = ? LIMIT 1`,
        args: [cleanAvatarId]
      });
      if (avatarRes.rows.length === 0) {
        throw new AvatarServiceError(404, 'AVATAR_NOT_FOUND', 'Изображение не найдено в личной галерее.');
      }

      const avatarRow = avatarRes.rows[0] as any;
      if (String(avatarRow.user_id) !== cleanUserId) {
        throw new AvatarServiceError(
          403,
          'AVATAR_FORBIDDEN',
          'Вы не можете активировать чужое изображение.'
        );
      }

      if (String(avatarRow.status) !== 'ready') {
        throw new AvatarServiceError(
          400,
          'AVATAR_NOT_READY',
          'Выбранное изображение недоступно или находится в процессе удаления.'
        );
      }

      const objectKey = String(avatarRow.object_key || '');
      if (!isValidAvatarObjectKey(objectKey)) {
        throw new AvatarServiceError(500, 'INVALID_STORED_OBJECT_KEY', 'Некорректный ключ объекта аватара.');
      }

      // 3. Verify that the image physically exists in R2 BEFORE any payment is deducted
      let headResult: { exists: boolean };
      try {
        headResult = await this.storage.headObject({ key: objectKey });
      } catch (r2Err: any) {
        console.error('[Avatars] R2 headObject verification failed during activation:', r2Err?.message || r2Err);
        throw new AvatarServiceError(
          502,
          'R2_VERIFY_FAILED',
          'Не удалось проверить наличие файла аватара в облачном хранилище. Оплата не списана, попробуйте позже.'
        );
      }

      if (!headResult || !headResult.exists) {
        throw new AvatarServiceError(
          404,
          'AVATAR_STORAGE_OBJECT_MISSING',
          'Файл изображения отсутствует в хранилище. Оплата не списана.'
        );
      }

      // 4. Idempotency / duplicate protection: if this image is already active, do NOT charge again
      const currentActiveId = userRow.active_avatar_id ? String(userRow.active_avatar_id).trim() : '';
      if (currentActiveId === cleanAvatarId) {
        return {
          alreadyActive: true,
          activeAvatarId: cleanAvatarId,
          certificateUsed: false,
          costCredits: 0,
          credits: currentCredits,
          inventory: currentInventory
        };
      }

      // 5. Compute payment (certificate OR credits)
      let certificateUsed = false;
      let costCredits = 0;
      let nextCredits = currentCredits;
      const nextInventory: UserInventoryItem[] = currentInventory.map((item) => ({ ...item }));

      if (useCertificate) {
        const certIndex = nextInventory.findIndex(
          (item) => item.itemId === AVATAR_CHANGE_CERTIFICATE_ID && Number(item.quantity) > 0
        );
        if (certIndex === -1) {
          throw new AvatarServiceError(
            400,
            'CERTIFICATE_MISSING',
            'В инвентаре отсутствует «Сертификат на смену аватара». Выберите оплату кредитами или приобретите сертификат в магазине.'
          );
        }
        nextInventory[certIndex].quantity -= 1;
        if (nextInventory[certIndex].quantity <= 0) {
          nextInventory.splice(certIndex, 1);
        }
        certificateUsed = true;
      } else {
        if (currentCredits < avatarCost) {
          throw new AvatarServiceError(
            400,
            'INSUFFICIENT_CREDITS',
            `Недостаточно кредитов. Требуется ${avatarCost} кр (у вас ${currentCredits} кр).`
          );
        }
        nextCredits = currentCredits - avatarCost;
        costCredits = avatarCost;
      }

      // 6. Atomically update active_avatar_id, credits, and inventory in a single guarded SQL statement
      const nowIso = new Date().toISOString();
      const updateRes = await this.db.execute({
        sql: `UPDATE users
              SET active_avatar_id = ?, credits = ?, inventory = ?, updated_at = ?
              WHERE id = ? AND COALESCE(active_avatar_id, '') = ? AND credits = ?`,
        args: [
          cleanAvatarId,
          nextCredits,
          JSON.stringify(nextInventory),
          nowIso,
          cleanUserId,
          currentActiveId,
          currentCredits
        ]
      });

      if (Number(updateRes.rowsAffected ?? 0) !== 1) {
        throw new AvatarServiceError(
          409,
          'AVATAR_CONCURRENT_MODIFICATION',
          'Состояние профиля изменилось параллельным запросом. Оплата не списана, повторите попытку.'
        );
      }

      return {
        alreadyActive: false,
        activeAvatarId: cleanAvatarId,
        certificateUsed,
        costCredits,
        credits: nextCredits,
        inventory: nextInventory
      };
    });
  }

  /**
   * Switches the user's avatar back to a standard emoji/text `avatarSeed`, resetting `active_avatar_id` to NULL
   * while applying the standard credit or certificate payment atomically.
   */
  async switchToStandardAvatar(params: {
    userId: string;
    avatarSeed: string;
    useCertificate: boolean;
    costCreditsOverride?: number;
  }): Promise<{
    avatarSeed: string;
    activeAvatarId: null;
    certificateUsed: boolean;
    costCredits: number;
    credits: number;
    inventory: UserInventoryItem[];
  }> {
    const cleanUserId = String(params.userId || '').trim();
    const cleanSeed = String(params.avatarSeed || '').trim();
    const useCertificate = Boolean(params.useCertificate);

    if (!cleanUserId) {
      throw new AvatarServiceError(400, 'INVALID_USER_ID', 'Не указан идентификатор пользователя.');
    }
    if (!cleanSeed) {
      throw new AvatarServiceError(400, 'INVALID_AVATAR_SEED', 'Укажите корректный аватар.');
    }

    let avatarCost = DEFAULT_AVATAR_CHANGE_COST;
    if (typeof params.costCreditsOverride === 'number' && Number.isFinite(params.costCreditsOverride) && params.costCreditsOverride >= 0) {
      avatarCost = Math.round(params.costCreditsOverride);
    } else {
      try {
        const shopSettings = await shopDb.getSettings();
        if (typeof shopSettings.avatarChangeCost === 'number' && Number.isFinite(shopSettings.avatarChangeCost)) {
          avatarCost = shopSettings.avatarChangeCost;
        }
      } catch {
        avatarCost = DEFAULT_AVATAR_CHANGE_COST;
      }
    }

    return rewardMutex.runExclusive(`user:${cleanUserId}`, async () => {
      const userRes = await this.db.execute({
        sql: `SELECT id, avatar_seed, active_avatar_id, credits, inventory FROM users WHERE id = ? LIMIT 1`,
        args: [cleanUserId]
      });
      if (userRes.rows.length === 0) {
        throw new AvatarServiceError(404, 'USER_NOT_FOUND', 'Пользователь не найден.');
      }

      const userRow = userRes.rows[0] as any;
      const currentCredits = Number(userRow.credits ?? 0);
      let currentInventory: UserInventoryItem[] = [];
      try {
        currentInventory = typeof userRow.inventory === 'string'
          ? JSON.parse(userRow.inventory)
          : Array.isArray(userRow.inventory)
          ? structuredClone(userRow.inventory)
          : [];
        if (!Array.isArray(currentInventory)) currentInventory = [];
      } catch {
        currentInventory = [];
      }

      let certificateUsed = false;
      let costCredits = 0;
      let nextCredits = currentCredits;
      const nextInventory: UserInventoryItem[] = currentInventory.map((item) => ({ ...item }));

      if (useCertificate) {
        const certIndex = nextInventory.findIndex(
          (item) => item.itemId === AVATAR_CHANGE_CERTIFICATE_ID && Number(item.quantity) > 0
        );
        if (certIndex === -1) {
          throw new AvatarServiceError(
            400,
            'CERTIFICATE_MISSING',
            'В инвентаре отсутствует «Сертификат на смену аватара».'
          );
        }
        nextInventory[certIndex].quantity -= 1;
        if (nextInventory[certIndex].quantity <= 0) {
          nextInventory.splice(certIndex, 1);
        }
        certificateUsed = true;
      } else {
        if (currentCredits < avatarCost) {
          throw new AvatarServiceError(
            400,
            'INSUFFICIENT_CREDITS',
            `Недостаточно кредитов. Требуется ${avatarCost} кр (у вас ${currentCredits} кр).`
          );
        }
        nextCredits = currentCredits - avatarCost;
        costCredits = avatarCost;
      }

      const nowIso = new Date().toISOString();
      await this.db.execute({
        sql: `UPDATE users SET avatar_seed = ?, active_avatar_id = NULL, credits = ?, inventory = ?, updated_at = ? WHERE id = ?`,
        args: [cleanSeed, nextCredits, JSON.stringify(nextInventory), nowIso, cleanUserId]
      });

      return {
        avatarSeed: cleanSeed,
        activeAvatarId: null,
        certificateUsed,
        costCredits,
        credits: nextCredits,
        inventory: nextInventory
      };
    });
  }
}

export const avatarDb = new UserAvatarService();

