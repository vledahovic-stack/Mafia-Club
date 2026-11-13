import { randomBytes, randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

export const R2_ENV_VAR_NAMES = [
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_ENDPOINT',
  'R2_BUCKET_NAME',
] as const;

export type R2EnvVarName = (typeof R2_ENV_VAR_NAMES)[number];

const DEFAULT_STEP_TIMEOUT_MS = 10_000;

export interface R2ConfigStatus {
  configured: boolean;
  missingVars: R2EnvVarName[];
}

export interface R2SmokeTestStepStatus {
  configChecked: boolean;
  putOk: boolean;
  getOk: boolean;
  contentVerified: boolean;
  deleteAttempted: boolean;
  deleteOk: boolean;
  confirmGone404: boolean;
}

export interface R2SmokeTestResult {
  ok: boolean;
  code?: 'CONFIG_MISSING' | 'SMOKE_TEST_ALREADY_RUNNING' | 'SMOKE_TEST_FAILED';
  objectKey: string | null;
  steps: R2SmokeTestStepStatus;
  durationMs: number;
  error?: string;
  deleteError?: string;
}

interface ResolvedR2Config {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucketName: string;
}

let isSmokeTestRunning = false;

export function isR2SmokeTestInProgress(): boolean {
  return isSmokeTestRunning;
}

/**
 * Checks whether all required R2 environment variables are set (non-empty)
 * without exposing any values.
 */
export function getR2ConfigStatus(env: NodeJS.ProcessEnv = process.env): R2ConfigStatus {
  const missingVars: R2EnvVarName[] = [];
  for (const key of R2_ENV_VAR_NAMES) {
    const val = typeof env[key] === 'string' ? env[key]!.trim() : '';
    if (!val) {
      missingVars.push(key);
    }
  }
  return {
    configured: missingVars.length === 0,
    missingVars,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes the R2 S3 endpoint URL and strips a trailing `/<bucketName>` path if present.
 */
function normalizeR2Endpoint(rawEndpoint: string, bucketName: string): string {
  const trimmed = rawEndpoint.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Некорректный формат URL в переменной окружения R2_ENDPOINT.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('R2_ENDPOINT должен использовать протокол https://.');
  }

  // Strip accidental trailing /<bucketName> from endpoint path
  const cleanBucket = bucketName.trim().replace(/^\/+|\/+$/g, '');
  let pathname = parsed.pathname.replace(/\/+$/, '');
  if (cleanBucket && pathname === `/${cleanBucket}`) {
    pathname = '';
  }

  return `${parsed.protocol}//${parsed.host}${pathname}`;
}

function resolveR2Config(env: NodeJS.ProcessEnv = process.env): ResolvedR2Config {
  const status = getR2ConfigStatus(env);
  if (!status.configured) {
    throw new Error(
      `Отсутствуют обязательные переменные окружения R2: ${status.missingVars.join(', ')}`
    );
  }

  const accessKeyId = env.R2_ACCESS_KEY_ID!.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY!.trim();
  const bucketName = env.R2_BUCKET_NAME!.trim();
  const endpoint = normalizeR2Endpoint(env.R2_ENDPOINT!, bucketName);

  return {
    accessKeyId,
    secretAccessKey,
    endpoint,
    bucketName,
  };
}

/**
 * Creates a fresh S3Client configured for Cloudflare R2 (`region: 'auto'`).
 */
export function createR2S3Client(config: ResolvedR2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * Scrubs any sensitive credentials, endpoints, headers, or query signatures from error messages.
 */
export function sanitizeR2Error(err: unknown, env: NodeJS.ProcessEnv = process.env): string {
  if (!err) return 'Неизвестная ошибка R2';

  const anyErr = err as any;
  const isAbort =
    anyErr?.name === 'AbortError' ||
    anyErr?.name === 'TimeoutError' ||
    anyErr?.code === 'ABORT_ERR';

  if (isAbort) {
    return 'Превышено время ожидания ответа от хранилища R2 (timeout).';
  }

  const httpStatus =
    typeof anyErr?.$metadata?.httpStatusCode === 'number'
      ? ` [HTTP ${anyErr.$metadata.httpStatusCode}]`
      : '';
  const errCode =
    typeof anyErr?.Code === 'string'
      ? anyErr.Code
      : typeof anyErr?.name === 'string' && anyErr.name !== 'Error'
      ? anyErr.name
      : '';

  let rawMessage =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Ошибка операции R2';

  // Redact any configured env var values if they ever appear in error text
  for (const varName of R2_ENV_VAR_NAMES) {
    const secretVal = typeof env[varName] === 'string' ? env[varName]!.trim() : '';
    if (secretVal.length >= 3) {
      rawMessage = rawMessage.replace(new RegExp(escapeRegExp(secretVal), 'gi'), '[REDACTED]');
    }
  }

  // Redact URLs, Authorization headers, and X-Amz-* query parameters
  rawMessage = rawMessage
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(/X-Amz-[A-Za-z0-9_-]+=[^&\s"'<>]+/gi, 'X-Amz-REDACTED')
    .replace(/Authorization\s*:\s*[^\r\n"'<>]+/gi, 'Authorization: [REDACTED]');

  const prefix = errCode ? `${errCode}${httpStatus}: ` : httpStatus ? `${httpStatus.trim()}: ` : '';
  return `${prefix}${rawMessage}`.slice(0, 280);
}

async function sendWithTimeout<TOutput>(
  client: S3Client,
  command: any,
  timeoutMs: number = DEFAULT_STEP_TIMEOUT_MS
): Promise<TOutput> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return (await client.send(command, { abortSignal: controller.signal })) as TOutput;
  } finally {
    clearTimeout(timer);
  }
}

function isS3NotFoundError(err: unknown): boolean {
  const anyErr = err as any;
  const statusCode = anyErr?.$metadata?.httpStatusCode;
  const name = String(anyErr?.name || '');
  const code = String(anyErr?.Code || anyErr?.code || '');
  return (
    statusCode === 404 ||
    name === 'NotFound' ||
    name === 'NoSuchKey' ||
    code === 'NotFound' ||
    code === 'NoSuchKey'
  );
}

export interface RunR2SmokeTestOptions {
  stepTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  clientFactory?: (config: ResolvedR2Config) => S3Client;
}

/**
 * Executes a strictly isolated, server-only R2 smoke test:
 * 1. PUT a temporary diagnostic text object under `_diagnostics/`
 * 2. GET the object and verify exact byte/string content match
 * 3. DELETE the temporary object inside a `finally` block
 * 4. HEAD the object after deletion to confirm 404 NotFound
 */
export async function runR2SmokeTest(
  options: RunR2SmokeTestOptions = {}
): Promise<R2SmokeTestResult> {
  const startMs = Date.now();
  const env = options.env ?? process.env;
  const stepTimeoutMs = options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;

  const steps: R2SmokeTestStepStatus = {
    configChecked: false,
    putOk: false,
    getOk: false,
    contentVerified: false,
    deleteAttempted: false,
    deleteOk: false,
    confirmGone404: false,
  };

  if (isSmokeTestRunning) {
    return {
      ok: false,
      code: 'SMOKE_TEST_ALREADY_RUNNING',
      objectKey: null,
      steps,
      durationMs: Date.now() - startMs,
      error: 'Диагностический тест R2 уже выполняется. Дождитесь завершения текущей проверки.',
    };
  }

  const configStatus = getR2ConfigStatus(env);
  if (!configStatus.configured) {
    return {
      ok: false,
      code: 'CONFIG_MISSING',
      objectKey: null,
      steps,
      durationMs: Date.now() - startMs,
      error: `Не заданы переменные окружения R2: ${configStatus.missingVars.join(', ')}`,
    };
  }

  isSmokeTestRunning = true;
  const objectKey = `_diagnostics/r2-smoke-${Date.now()}-${randomBytes(8).toString('hex')}.txt`;
  const expectedContent = `mafia-club-r2-smoke-test:${randomUUID()}:${new Date().toISOString()}`;

  let client: S3Client | null = null;
  let config: ResolvedR2Config | null = null;
  let putAttempted = false;
  let primaryError: string | undefined;
  let deleteError: string | undefined;

  try {
    try {
      config = resolveR2Config(env);
      steps.configChecked = true;
      client = options.clientFactory
        ? options.clientFactory(config)
        : createR2S3Client(config);

      // 1. PUT temporary diagnostic object
      putAttempted = true;
      await sendWithTimeout(
        client,
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: objectKey,
          Body: Buffer.from(expectedContent, 'utf8'),
          ContentType: 'text/plain; charset=utf-8',
        }),
        stepTimeoutMs
      );
      steps.putOk = true;

      // 2. GET temporary object and verify exact content
      const getRes: any = await sendWithTimeout(
        client,
        new GetObjectCommand({
          Bucket: config.bucketName,
          Key: objectKey,
        }),
        stepTimeoutMs
      );
      steps.getOk = true;

      const actualContent =
        getRes?.Body && typeof getRes.Body.transformToString === 'function'
          ? await getRes.Body.transformToString('utf-8')
          : '';

      if (actualContent !== expectedContent) {
        throw new Error(
          `Несовпадение содержимого при проверке чтения (ожидалось ${expectedContent.length} байт, получено ${actualContent.length} байт).`
        );
      }
      steps.contentVerified = true;
    } catch (err) {
      primaryError = sanitizeR2Error(err, env);
    } finally {
      // 3. Always attempt DELETE if PUT was initiated
      if (putAttempted && client && config) {
        steps.deleteAttempted = true;
        try {
          await sendWithTimeout(
            client,
            new DeleteObjectCommand({
              Bucket: config.bucketName,
              Key: objectKey,
            }),
            stepTimeoutMs
          );
          steps.deleteOk = true;
        } catch (delErr) {
          deleteError = sanitizeR2Error(delErr, env);
        }
      }
    }

    // 4. HEAD after DELETE to confirm object is absent (404)
    if (steps.deleteOk && client && config) {
      try {
        await sendWithTimeout(
          client,
          new HeadObjectCommand({
            Bucket: config.bucketName,
            Key: objectKey,
          }),
          stepTimeoutMs
        );
        // If HEAD succeeded without throwing, the object still exists
        const stillExistsMsg = 'Объект всё ещё доступен по HEAD после выполнения DELETE.';
        primaryError = primaryError ? `${primaryError}; ${stillExistsMsg}` : stillExistsMsg;
      } catch (headErr) {
        if (isS3NotFoundError(headErr)) {
          steps.confirmGone404 = true;
        } else {
          const headErrMsg = `Ошибка проверки отсутствия объекта (HEAD): ${sanitizeR2Error(headErr, env)}`;
          primaryError = primaryError ? `${primaryError}; ${headErrMsg}` : headErrMsg;
        }
      }
    }

    const allPassed =
      steps.configChecked &&
      steps.putOk &&
      steps.getOk &&
      steps.contentVerified &&
      steps.deleteOk &&
      steps.confirmGone404 &&
      !primaryError &&
      !deleteError;

    return {
      ok: allPassed,
      ...(allPassed ? {} : { code: 'SMOKE_TEST_FAILED' as const }),
      objectKey,
      steps,
      durationMs: Date.now() - startMs,
      ...(primaryError ? { error: primaryError } : {}),
      ...(deleteError ? { deleteError } : {}),
    };
  } finally {
    if (client) {
      try {
        client.destroy();
      } catch {}
    }
    isSmokeTestRunning = false;
  }
}
