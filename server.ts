import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { roomManager } from './server/game/roomManager';
import { userDb, isEmailAdmin, getAdminEmails } from './server/db/users';
import { shopDb, itemsDb } from './server/db/shop';
import { validateLootboxRuleConfig } from './server/db/items';
import { reportsDb } from './server/db/reports';
import { dailyBonusDb } from './server/db/dailyBonus';
import { clanDb } from './server/db/clans';
import { eventsDb } from './server/db/events';
import { auditLogsDb } from './server/db/auditLogs';
import { feedbackDb } from './server/db/feedback';
import { DEFAULT_NICKNAME_CHANGE_COST, NICKNAME_CHANGE_CERTIFICATE_ID } from './server/data/items';
import { calculateServerLevelInfo, getLevelFromXp } from './server/game/experience';
import { experienceDb } from './server/db/experience';
import { sendSystemTestEmail, sendCustomAdminEmail, isResendApiConfigured, isSmtpConfigured } from './server/utils/mailer';
import { mailDb, MailTransportType } from './server/db/mail';
import { initDatabase, getDatabaseConnectionInfo, SQLITE_DB_PATH, waitForDatabaseInit } from './server/db/database';

dotenv.config();

// Ensure LibSQL / Turso / SQLite database and all tables are initialized automatically on startup
const sqliteDb = initDatabase();
const dbInfo = getDatabaseConnectionInfo();
if (dbInfo.mode === 'turso') {
  console.log(`[Database] Connected to persistent Turso database: ${dbInfo.target}`);
} else {
  console.log(`[Database] Connected to local SQLite file: ${SQLITE_DB_PATH}`);
  if (process.env.RENDER || process.env.NODE_ENV === 'production') {
    console.warn(
      '[Database] WARNING: Running in production/Render without TURSO_DATABASE_URL! Local SQLite on Render Free is ephemeral — configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for persistent storage.'
    );
  }
}

const startupReadyPromise: Promise<void> = waitForDatabaseInit()
  .then(async () => {
    // 1. First ensure master item catalog and legacy chest/inventory migrations complete exclusively
    await shopDb.ensureSeed().catch(err => console.error('[Database] shopDb ensureSeed error:', err));

    // 2. Then seed dependent progression, daily bonus, event, and mail subsystems
    await Promise.all([
      experienceDb.ensureSeed().catch(err => console.error('[Database] experienceDb ensureSeed error:', err)),
      dailyBonusDb.ensureSeed().catch(err => console.error('[Database] dailyBonusDb ensureSeed error:', err)),
      eventsDb.ensureSeed().catch(err => console.error('[Database] eventsDb ensureSeed error:', err)),
      mailDb.ensureSeed().catch(err => console.error('[Database] mailDb ensureSeed error:', err))
    ]);
  })
  .catch((err: unknown) => console.error('[Database] Initialization error:', err));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Global user WebSocket tracking for online status & real-time invites
const userSockets = new Map<string, Set<WebSocket>>();

function trackUserSocket(userId: string, ws: WebSocket) {
  if (!userId) return;
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)!.add(ws);
}

function untrackUserSocket(userId: string | null, ws: WebSocket) {
  if (userId) {
    const sockets = userSockets.get(userId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        userSockets.delete(userId);
      }
    }
  } else {
    userSockets.forEach((sockets) => sockets.delete(ws));
  }
}

function notifyUser(userId: string, message: any) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    const data = JSON.stringify(message);
    sockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }
}

function getLiveStatusForUser(userId: string): {
  onlineStatus: 'online' | 'in_game' | 'in_lobby' | 'offline';
  currentRoomCode?: string | null;
  currentRoomName?: string | null;
} {
  try {
    const rooms = roomManager.getAllRoomsDetailed();
    for (const r of rooms) {
      const isPlayer = r.players && r.players.some((p: { id: string }) => p.id === userId);
      if (isPlayer) {
        const inGame = r.phase.toUpperCase() !== 'LOBBY';
        return {
          onlineStatus: inGame ? 'in_game' : 'in_lobby',
          currentRoomCode: r.roomCode,
          currentRoomName: r.roomName
        };
      }
    }
  } catch {
    // Continue
  }

  const sockets = userSockets.get(userId);
  if (sockets && sockets.size > 0) {
    return {
      onlineStatus: 'online',
      currentRoomCode: null,
      currentRoomName: null
    };
  }

  return {
    onlineStatus: 'offline',
    currentRoomCode: null,
    currentRoomName: null
  };
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/skins', express.static(path.resolve(__dirname, 'server/skins')));

// REST API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Readiness barrier: ensure database tables, catalog, and legacy chest/inventory migrations
// have completed before any API route can access or mutate player inventories.
app.use('/api', async (_req, _res, next) => {
  try {
    await startupReadyPromise;
  } catch {}
  next();
});

// AUTH REST API
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Укажите email и пароль.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов.' });
    }
    const user = await userDb.register(email, password, displayName || '');
    const { passwordHash, sessionToken, ...profile } = user;
    res.json({ user: profile, token: sessionToken });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка при регистрации';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Укажите email и пароль.' });
    }
    const user = await userDb.login(email, password);
    const { passwordHash, sessionToken, ...profile } = user;
    res.json({ user: profile, token: sessionToken });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка при авторизации';
    res.status(400).json({ error: msg });
  }
});

// Load Firebase applet config for secure server-side ID token verification
let firebaseConfig: any = {};
try {
  const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch (e) {
  console.warn('[Firebase] Config read warning in server.ts:', e);
}

interface VerifiedGoogleUser {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  emailVerified: boolean;
}

// In-memory cache for Google public x509 certificates (securetoken@system.gserviceaccount.com)
let cachedGoogleCerts: Record<string, string> | null = null;
let googleCertsExpiresAt = 0;

function base64UrlToBase64(base64Url: string): string {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return base64;
}

function parseJwtParts(token: string): {
  header: any;
  payload: any;
  headerPart: string;
  payloadPart: string;
  signaturePart: string;
} {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Некорректный формат токена (ожидается JWT с 3 секциями).');
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  let header: any;
  let payload: any;

  try {
    header = JSON.parse(Buffer.from(base64UrlToBase64(headerPart), 'base64').toString('utf8'));
  } catch {
    throw new Error('Не удалось разобрать заголовок токена.');
  }

  try {
    payload = JSON.parse(Buffer.from(base64UrlToBase64(payloadPart), 'base64').toString('utf8'));
  } catch {
    throw new Error('Не удалось разобрать полезную нагрузку токена.');
  }

  return { header, payload, headerPart, payloadPart, signaturePart };
}

async function getGooglePublicCertificates(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedGoogleCerts && now < googleCertsExpiresAt) {
    return cachedGoogleCerts;
  }

  const certsUrl = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
  const res = await fetch(certsUrl);
  if (!res.ok) {
    throw new Error(`Не удалось загрузить публичные сертификаты Google (${res.status}).`);
  }

  const certs = (await res.json()) as Record<string, string>;
  cachedGoogleCerts = certs;

  let maxAgeSec = 14400;
  const cacheControl = res.headers.get('cache-control');
  if (cacheControl) {
    const match = cacheControl.match(/max-age=(\d+)/i);
    if (match && match[1]) {
      maxAgeSec = Math.max(600, parseInt(match[1], 10));
    }
  }
  googleCertsExpiresAt = now + maxAgeSec * 1000;
  return certs;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedGoogleUser> {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Отсутствует или поврежден Firebase ID Token.');
  }

  const expectedProjectId = (process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || '').trim();
  if (!expectedProjectId) {
    throw new Error('На сервере не настроен идентификатор проекта Firebase (projectId).');
  }

  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;

  // 1. Parse and validate structure and strict project claims
  const { header, payload, headerPart, payloadPart, signaturePart } = parseJwtParts(idToken);

  if (header.alg !== 'RS256') {
    throw new Error(`Неподдерживаемый алгоритм подписи токена: ${header.alg}. Ожидается RS256.`);
  }
  if (!header.kid || typeof header.kid !== 'string') {
    throw new Error('Отсутствует идентификатор ключа подписи (kid).');
  }

  // Strict audience check: must strictly equal our Firebase project ID
  if (payload.aud !== expectedProjectId) {
    throw new Error(
      `ID Token принадлежит другому проекту (${payload.aud}). Доступ к проекту ${expectedProjectId} запрещён.`
    );
  }

  // Strict issuer check: must strictly equal https://securetoken.google.com/<projectId>
  if (payload.iss !== expectedIssuer) {
    throw new Error(
      `Некорректный издатель токена (${payload.iss}). Токен не является Firebase ID Token для ${expectedProjectId}.`
    );
  }

  // Expiration and temporal claims
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Срок действия Firebase ID Token истёк.');
  }
  if (typeof payload.iat === 'number' && payload.iat > nowSec + 300) {
    throw new Error('Время выпуска токена находится в будущем (рассинхронизация часов).');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('В токене отсутствует идентификатор пользователя (sub).');
  }

  const tokenEmail = (payload.email as string)?.toLowerCase()?.trim();
  if (!tokenEmail) {
    throw new Error('В токене отсутствует email пользователя.');
  }

  let verified: VerifiedGoogleUser | null = null;

  // 2. Primary Verification: Google Identity Toolkit REST API
  const apiKey = process.env.FIREBASE_API_KEY || firebaseConfig.apiKey;
  if (apiKey) {
    try {
      const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`;
      const res = await fetch(lookupUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });

      if (res.ok) {
        const data = await res.json();
        const user = data.users?.[0];
        if (user && user.localId === payload.sub) {
          verified = {
            uid: user.localId,
            email: (user.email || tokenEmail).toLowerCase().trim(),
            displayName: user.displayName || payload.name,
            photoUrl: user.photoUrl || payload.picture,
            emailVerified: user.emailVerified === true || payload.email_verified === true
          };
        }
      } else {
        const errData = await res.json().catch(() => null);
        const errMsg = errData?.error?.message || 'LOOKUP_FAILED';
        console.warn('[GoogleAuth] IdentityToolkit lookup rejected token:', errMsg);
      }
    } catch (err) {
      console.warn('[GoogleAuth] IdentityToolkit lookup network error:', err);
    }
  }

  // 3. Secondary Fallback Verification: Cryptographic verification using Google X.509 Securetoken Certificates
  if (!verified) {
    try {
      const certs = await getGooglePublicCertificates();
      const cert = certs[header.kid];
      if (!cert) {
        throw new Error(`Публичный сертификат Google для ключа kid="${header.kid}" не найден.`);
      }

      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(`${headerPart}.${payloadPart}`);
      const sigBuffer = Buffer.from(base64UrlToBase64(signaturePart), 'base64');
      const isValidSig = verifier.verify(cert, sigBuffer);

      if (!isValidSig) {
        throw new Error('Криптографическая подпись токена не совпадает с публичным ключом Google.');
      }

      verified = {
        uid: payload.sub,
        email: tokenEmail,
        displayName: payload.name,
        photoUrl: payload.picture,
        emailVerified: payload.email_verified === true || payload.email_verified === 'true'
      };
      console.log('[GoogleAuth] ✅ Токен успешно верифицирован через резервный криптографический механизм X.509.');
    } catch (fallbackErr) {
      console.warn('[GoogleAuth] Резервная проверка сертификата X.509 завершилась с ошибкой:', fallbackErr);
    }
  }

  if (!verified) {
    throw new Error('Подлинность Firebase ID Token не подтверждена. Вход отклонён.');
  }

  if (!verified.emailVerified) {
    throw new Error('Email учетной записи Google не подтвержден.');
  }

  return verified;
}

// REQUEST PASSWORD RESET CODE
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Укажите корректный email адрес.' });
    }

    const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').toString();
    await userDb.checkAndRecordIpRateLimit(clientIp, 'forgot_password', 5, 15);

    const result = await userDb.requestPasswordResetCode(email);
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка отправки кода восстановления';
    res.status(400).json({ error: msg });
  }
});

// CONFIRM PASSWORD RESET WITH VERIFICATION CODE
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, password, newPassword, code } = req.body;
    const targetPassword = password || newPassword;
    if (!email || !targetPassword) {
      return res.status(400).json({ error: 'Укажите email и новый пароль.' });
    }
    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ error: 'Требуется 6-значный код подтверждения владения аккаунтом.' });
    }
    if (targetPassword.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов.' });
    }
    const user = await userDb.confirmPasswordReset(email, code, targetPassword);
    const { passwordHash, sessionToken, ...profile } = user;

    await auditLogsDb.logAction({
      actionType: 'password_reset_success',
      adminEmail: 'security@mafia-club.com',
      adminName: 'Security Auth System',
      targetId: user.id,
      targetName: user.displayName,
      details: `Пароль пользователя ${user.displayName} (${user.email}) успешно обновлен по проверочному коду`,
      metadata: { userId: user.id, email: user.email }
    });

    res.json({ message: 'Пароль успешно обновлён', user: profile, token: sessionToken });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка сброса пароля';
    res.status(400).json({ error: msg });
  }
});

// GET MAIL CONFIGURATION (Admin only - returns safe status flags, never secrets)
app.get('/api/admin/mail/config', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user || (!user.isAdmin && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам' });
  }

  try {
    const config = await mailDb.getMailConfig();
    const resendConfigured = isResendApiConfigured();
    const smtpConfigured = isSmtpConfigured();

    res.json({
      transport: config.transport,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
      isResendApiConfigured: resendConfigured,
      isSmtpConfigured: smtpConfigured
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка получения настроек почты';
    res.status(500).json({ error: msg });
  }
});

// UPDATE MAIL CONFIGURATION (Admin only)
app.post('/api/admin/mail/config', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user || (!user.isAdmin && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам' });
  }

  try {
    const { transport } = req.body;
    if (transport !== 'resend_api' && transport !== 'smtp') {
      return res.status(400).json({ error: 'Недопустимый способ отправки. Выберите "resend_api" или "smtp".' });
    }

    const updated = await mailDb.setMailTransport(transport as MailTransportType, user.email);

    const transportLabel = transport === 'resend_api' ? 'Resend API (HTTPS)' : 'SMTP (Nodemailer)';
    await auditLogsDb.logAction({
      actionType: 'mail_config_update',
      adminEmail: user.email,
      adminName: user.displayName,
      details: `Способ отправки писем переключен на "${transportLabel}"`,
      metadata: { transport }
    }).catch(() => {});

    res.json({
      success: true,
      message: `Способ отправки успешно изменён на "${transportLabel}"`,
      transport: updated.transport,
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обновления настроек почты';
    res.status(500).json({ error: msg });
  }
});

// SEND TEST MAIL VIA CHOSEN OR SPECIFIC TRANSPORT (Admin only)
app.post('/api/admin/mail/test', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user || (!user.isAdmin && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам' });
  }

  try {
    const { toEmail, transport } = req.body;
    const targetEmail = (toEmail || user.email || 'vledahovic@gmail.com').toString().trim();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return res.status(400).json({ error: 'Укажите корректный email получателя' });
    }

    const transportOverride = (transport === 'resend_api' || transport === 'smtp') ? transport : undefined;
    const mailRes = await sendSystemTestEmail(targetEmail, transportOverride);

    if (!mailRes.sent) {
      return res.status(500).json({
        error: mailRes.error || mailRes.reason || 'Ошибка отправки тестового письма',
        transport: mailRes.transport
      });
    }

    const transportLabel = mailRes.transport === 'resend_api' ? 'Resend API (HTTPS)' : 'SMTP (Nodemailer)';
    res.json({
      success: true,
      message: `Тестовое письмо успешно отправлено через ${transportLabel} на ${targetEmail}`,
      transport: mailRes.transport,
      messageId: mailRes.messageId
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при отправке тестового письма';
    res.status(500).json({ error: msg });
  }
});

// SEND TEST SYSTEM EMAIL (Admin endpoint legacy alias)
app.post('/api/admin/send-test-email', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user || (!user.isAdmin && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам' });
  }

  try {
    const { toEmail, transport } = req.body;
    const targetEmail = (toEmail || user.email || 'vledahovic@gmail.com').toString().trim();
    if (!targetEmail) {
      return res.status(400).json({ error: 'Укажите email получателя' });
    }

    const transportOverride = (transport === 'resend_api' || transport === 'smtp') ? transport : undefined;
    const mailRes = await sendSystemTestEmail(targetEmail, transportOverride);
    if (!mailRes.sent) {
      return res.status(500).json({ error: mailRes.error || mailRes.reason || 'Ошибка отправки тестового письма' });
    }

    res.json({ success: true, message: `Тестовое письмо успешно отправлено на ${targetEmail}`, transport: mailRes.transport });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при отправке тестового письма';
    res.status(500).json({ error: msg });
  }
});

// GET MAIL TEMPLATES
app.get('/api/admin/mail/templates', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user || (!user.isAdmin && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам' });
  }

  try {
    const templates = await mailDb.getTemplates();
    res.json({ templates });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка получения шаблонов писем';
    res.status(500).json({ error: msg });
  }
});

// CREATE MAIL TEMPLATE
app.post('/api/admin/mail/templates', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user || (!user.isAdmin && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам' });
  }

  try {
    const { name, subject, bodyText } = req.body;
    const template = await mailDb.createTemplate(name || '', subject || '', bodyText || '');
    res.json({ template });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка создания шаблона';
    res.status(400).json({ error: msg });
  }
});

// UPDATE MAIL TEMPLATE
app.put('/api/admin/mail/templates/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user || (!user.isAdmin && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам' });
  }

  try {
    const { name, subject, bodyText } = req.body;
    const template = await mailDb.updateTemplate(req.params.id, name || '', subject || '', bodyText || '');
    res.json({ template });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обновления шаблона';
    res.status(400).json({ error: msg });
  }
});

// DELETE MAIL TEMPLATE
app.delete('/api/admin/mail/templates/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user || (!user.isAdmin && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам' });
  }

  try {
    await mailDb.deleteTemplate(req.params.id);
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка удаления шаблона';
    res.status(400).json({ error: msg });
  }
});

// GET MAIL HISTORY (Paginated)
app.get('/api/admin/mail/history', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user || (!user.isAdmin && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам' });
  }

  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '10', 10);
    const historyData = await mailDb.getHistory(page, limit);
    res.json(historyData);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки истории почтовых отправок';
    res.status(500).json({ error: msg });
  }
});

// SEND CUSTOM ADMIN MAIL
app.post('/api/admin/mail/send', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user || (!user.isAdmin && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам' });
  }

  try {
    const { recipientEmail, subject, bodyText, templateId } = req.body;

    const cleanEmail = (recipientEmail || '').toString().trim().toLowerCase();
    const cleanSubject = (subject || '').toString().trim();
    const cleanBody = (bodyText || '').toString().trim();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Укажите корректный email адрес получателя.' });
    }
    if (!cleanSubject || cleanSubject.length > 200) {
      return res.status(400).json({ error: 'Тема письма не должна быть пустой и превышать 200 символов.' });
    }
    if (!cleanBody || cleanBody.length > 10000) {
      return res.status(400).json({ error: 'Текст письма не должен быть пустым и превышать 10 000 символов.' });
    }

    // Rate Limit: max 5 emails per 10 minutes for this admin
    await mailDb.checkAndRecordAdminMailRateLimit(user.id, 5, 10);

    const activeTransport = await mailDb.getActiveTransport();
    const historyId = 'mail_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const sentAt = new Date().toISOString();

    // Record initial history entry as 'sending' with active transport
    await mailDb.createHistoryEntry({
      id: historyId,
      recipientEmail: cleanEmail,
      subject: cleanSubject,
      bodyText: cleanBody,
      templateId: templateId || null,
      status: 'sending',
      sentByAdminId: user.id,
      sentByAdminEmail: user.email,
      sentAt,
      transport: activeTransport
    });

    // Dispatch via sendCustomAdminEmail (uses activeTransport by default)
    const sendRes = await sendCustomAdminEmail(cleanEmail, cleanSubject, cleanBody);

    if (sendRes.sent) {
      await mailDb.updateHistoryStatus(historyId, 'smtp_accepted');

      const transportLabel = sendRes.transport === 'resend_api' ? 'Resend API (HTTPS)' : 'SMTP';
      await auditLogsDb.logAction({
        actionType: 'admin_mail_sent',
        adminEmail: user.email,
        adminName: user.displayName,
        targetName: cleanEmail,
        details: `Отправлено административное письмо на ${cleanEmail} (${transportLabel}): "${cleanSubject}"`,
        metadata: { recipientEmail: cleanEmail, subject: cleanSubject, historyId, transport: sendRes.transport }
      }).catch(() => {});

      return res.json({
        success: true,
        message: `Письмо успешно принято (${transportLabel}) для отправки на ${cleanEmail}`,
        historyId,
        transport: sendRes.transport
      });
    } else {
      const errMsg = sendRes.error || 'Ошибка отправки письма';
      await mailDb.updateHistoryStatus(historyId, 'send_failed', errMsg);

      return res.status(500).json({
        error: `Не удалось отправить письмо: ${errMsg}`,
        transport: sendRes.transport
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при отправке письма';
    res.status(400).json({ error: msg });
  }
});

// CHANGE PASSWORD FOR AUTHENTICATED USER
app.post('/api/auth/change-password', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Укажите текущий и новый пароль.' });
  }

  try {
    const updated = await userDb.changePassword(user.id, currentPassword, newPassword);
    const { passwordHash, sessionToken, ...profile } = updated;

    await auditLogsDb.logAction({
      actionType: 'password_change',
      adminEmail: user.email,
      adminName: user.displayName,
      targetId: user.id,
      targetName: user.displayName,
      details: `Пользователь ${user.displayName} сменил пароль учетной записи`,
      metadata: { userId: user.id }
    });

    res.json({ success: true, message: 'Пароль успешно изменен', user: profile, token: sessionToken });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка изменения пароля';
    res.status(400).json({ error: msg });
  }
});

// SECURE GOOGLE AUTH WITH FIREBASE ID TOKEN VERIFICATION
app.post('/api/auth/sync-google', async (req, res) => {
  try {
    const { idToken, displayName } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Требуется Firebase ID Token для подтверждения подлинности.' });
    }

    const verified = await verifyFirebaseIdToken(idToken);
    const user = await userDb.syncGoogleUser(verified.uid, verified.email, displayName || verified.displayName || '');
    const { passwordHash, sessionToken, ...profile } = user;

    res.json({ user: profile, token: sessionToken });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка авторизации через Google';
    res.status(401).json({ error: msg });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }
  res.json({ user });
});

// GET USER EXPERIENCE & LEVEL DETAILS
app.get('/api/user/experience', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }
  const levelInfo = calculateServerLevelInfo(user.xp || 0);
  res.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      xp: user.xp || 0,
      level: user.level || 1
    },
    levelInfo
  });
});

// CHANGE NICKNAME (Supports 250 credits or Certificate)
app.post('/api/user/change-name', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { displayName, useCertificate } = req.body;
  if (!displayName || typeof displayName !== 'string') {
    return res.status(400).json({ error: 'Укажите новое имя в игре.' });
  }

  try {
    const result = await userDb.changeDisplayName(user.id, displayName, !!useCertificate);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при смене никнейма';
    res.status(400).json({ error: msg });
  }
});

// CHANGE AVATAR (Supports 500 credits or Avatar Certificate)
app.post('/api/user/change-avatar', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { avatarSeed, useCertificate } = req.body;
  if (!avatarSeed || typeof avatarSeed !== 'string') {
    return res.status(400).json({ error: 'Укажите новый аватар.' });
  }

  try {
    const result = await userDb.changeAvatar(user.id, avatarSeed, !!useCertificate);
    res.json({
      ...result,
      message: result.certificateUsed 
        ? 'Аватар успешно изменён с помощью Сертификата!' 
        : `Аватар успешно изменён! Списано ${result.costCredits} кр.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при смене аватара';
    res.status(400).json({ error: msg });
  }
});

// BUY ITEM FROM SHOP
app.post('/api/user/buy-item', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { itemId } = req.body;
  if (!itemId) {
    return res.status(400).json({ error: 'Укажите ID предмета для покупки.' });
  }

  try {
    const result = await userDb.buyItem(user.id, itemId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при покупке предмета';
    res.status(400).json({ error: msg });
  }
});

// PAWN ITEM (SELL TO PAWNSHOP)
app.post('/api/user/pawn-item', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { itemId, inventoryEntryId } = req.body;
  if (!itemId) {
    return res.status(400).json({ error: 'Укажите ID предмета для сдачи в ломбард.' });
  }

  try {
    const result = await userDb.pawnItem(user.id, itemId, inventoryEntryId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при сдаче предмета в ломбард';
    res.status(400).json({ error: msg });
  }
});

// USE/ACTIVATE ITEM FROM INVENTORY
app.post('/api/user/use-item', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { itemId, inventoryEntryId, operationId } = req.body;
  if (!itemId) {
    return res.status(400).json({ error: 'Укажите ID предмета.' });
  }

  try {
    const result = await userDb.useItem(user.id, itemId, { inventoryEntryId, operationId });
    if (!result.idempotentReplay) {
      try {
        await eventsDb.trackAction(user.id, 'use_item', 1);
      } catch {}
    }
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при использовании предмета';
    res.status(400).json({ error: msg });
  }
});

// RECOVER / CHECK CONFIRMED LOOTBOX OPEN OPERATION BY OPERATION ID
app.get('/api/user/lootbox-operations/:operationId', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  try {
    const status = await userDb.getLootboxOpenOperation(user.id, req.params.operationId);
    res.json(status);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка проверки статуса операции открытия лутбокса';
    res.status(400).json({ error: msg });
  }
});

// GET ALL CUSTOM UI SKINS (Loaded dynamically from server/skins directory)
app.get('/api/skins', (req, res) => {
  try {
    const skinsDir = path.resolve(__dirname, 'server/skins');
    if (!fs.existsSync(skinsDir)) {
      return res.json({ skins: [] });
    }
    const entries = fs.readdirSync(skinsDir, { withFileTypes: true });
    const skins: any[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skinDir = path.join(skinsDir, entry.name);
        const manifestPath = path.join(skinDir, 'manifest.json');
        const themePath = path.join(skinDir, 'theme.json');
        const stylesPath = path.join(skinDir, 'styles.css');

        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const theme = fs.existsSync(themePath) ? JSON.parse(fs.readFileSync(themePath, 'utf8')) : null;
            skins.push({
              ...manifest,
              theme,
              hasStyles: fs.existsSync(stylesPath),
              cssUrl: `/skins/${entry.name}/styles.css`
            });
          } catch (e) {
            console.error(`[Skins] Error loading manifest for ${entry.name}:`, e);
          }
        }
      }
    }
    res.json({ skins });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки стилей интерфейса';
    res.status(500).json({ error: msg });
  }
});

// GET SPECIFIC SKIN DETAILS
app.get('/api/skins/:skinId', (req, res) => {
  const { skinId } = req.params;
  const skinDir = path.resolve(__dirname, 'server/skins', skinId);
  const manifestPath = path.join(skinDir, 'manifest.json');
  const themePath = path.join(skinDir, 'theme.json');

  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: 'Пакет стилей не найден' });
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const theme = fs.existsSync(themePath) ? JSON.parse(fs.readFileSync(themePath, 'utf8')) : null;
    res.json({
      ...manifest,
      theme,
      cssUrl: `/skins/${skinId}/styles.css`
    });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Ошибка чтения пакета стилей' });
  }
});

// GET SKIN CSS STYLESHEET DYNAMICALLY
app.get('/api/skins/:skinId/styles.css', (req, res) => {
  const { skinId } = req.params;
  const cssPath = path.resolve(__dirname, 'server/skins', skinId, 'styles.css');
  if (!fs.existsSync(cssPath)) {
    return res.status(404).send('/* Skin stylesheet not found */');
  }
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(cssPath);
});

// EQUIP CUSTOM UI SKIN (Validates item ownership in user inventory)
app.post('/api/user/equip-skin', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { skinId } = req.body;
  try {
    const result = await userDb.equipSkin(user.id, skinId);
    res.json({ success: true, user: result.user, equippedSkin: result.equippedSkin });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при смене стиля интерфейса';
    res.status(400).json({ error: msg });
  }
});

// GET USER GAME HISTORY & DETAILED STATS
app.get('/api/user/game-history', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  const targetUserId = req.query.userId as string;

  let userId: string | null = null;
  if (token) {
    const user = await userDb.getUserByToken(token);
    if (user) userId = user.id;
  }
  if (!userId && targetUserId) {
    userId = targetUserId;
  }

  if (!userId) {
    return res.status(401).json({ error: 'Требуется авторизация или указание ID пользователя.' });
  }

  try {
    const history = await userDb.getGameHistory(userId);
    res.json(history);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при загрузке истории игр';
    res.status(400).json({ error: msg });
  }
});

app.get('/api/user/:userId/history', async (req, res) => {
  const { userId } = req.params;
  try {
    const history = await userDb.getGameHistory(userId);
    res.json(history);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при загрузке истории игр';
    res.status(400).json({ error: msg });
  }
});

// GET USER EXPERIENCE & LEVEL PROGRESSION
app.get('/api/user/experience', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  const targetUserId = req.query.userId as string;

  let user = null;
  if (token) {
    user = await userDb.getUserByToken(token);
  }
  if (!user && targetUserId) {
    user = await userDb.getUserById(targetUserId);
  }

  if (!user) {
    return res.status(401).json({ error: 'Пользователь не найден или требуется авторизация.' });
  }

  const rawXp = typeof user.xp === 'number' ? user.xp : 0;
  const levelInfo = calculateServerLevelInfo(rawXp);
  const history = await userDb.getGameHistory(user.id);

  res.json({
    levelInfo,
    user: {
      id: user.id,
      displayName: user.displayName,
      xp: rawXp,
      level: levelInfo.level,
      title: levelInfo.title,
      badgeIcon: levelInfo.badgeIcon
    },
    recentMatches: (history?.matches || []).slice(0, 15)
  });
});

// EQUIP ROLE MASTERY BADGE / TITLE
app.post('/api/user/equip-mastery-badge', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { badgeTitle, flairTitle } = req.body;
  if (!badgeTitle) {
    return res.status(400).json({ error: 'Укажите название значка/титула' });
  }

  try {
    const updatedUser = await userDb.equipMasteryBadge(user.id, badgeTitle, flairTitle);
    res.json({
      success: true,
      message: `Значок «${badgeTitle}» успешно установлен в профиле!`,
      user: updatedUser
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при установке значка';
    res.status(400).json({ error: msg });
  }
});

// SELECT ROLE VIA ROLE CARD IN ROOM
app.post('/api/room/select-role', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  const { roomCode, playerId, roleId } = req.body;

  if (!roomCode || !playerId || !roleId) {
    return res.status(400).json({ error: 'Необходимо указать код комнаты, ID игрока и желаемую роль.' });
  }

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Комната не найдена.' });
  }

  const result = await room.selectPreferredRole(playerId, roleId, token);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  res.json(result);
});

// ================= FRIENDS & SOCIAL REST APIS =================

// Get friends list with live online status
app.get('/api/friends', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  try {
    const friends = await userDb.getFriends(user.id, getLiveStatusForUser);
    res.json({ friends });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при получении списка друзей';
    res.status(400).json({ error: msg });
  }
});

// Search players to add as friends
app.get('/api/friends/search', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const query = (req.query.q as string) || '';
  const results = await userDb.searchPlayers(query, user.id);
  res.json({ results });
});

// Send friend request
app.post('/api/friends/request', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetIdentifier } = req.body;
  if (!targetIdentifier) {
    return res.status(400).json({ error: 'Укажите никнейм или ID игрока.' });
  }

  try {
    const result = await userDb.sendFriendRequest(user.id, targetIdentifier);
    try {
      await eventsDb.trackAction(user.id, 'invite_friend', 1);
    } catch {}
    notifyUser(result.friend.id, {
      type: 'FRIEND_REQUEST_UPDATE',
      payload: {
        fromUserId: user.id,
        fromUserName: user.displayName,
        status: result.friend.status
      }
    });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка отправки запроса в друзья';
    res.status(400).json({ error: msg });
  }
});

// Accept friend request
app.post('/api/friends/accept', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: 'Укажите targetUserId' });
  }

  try {
    const result = await userDb.acceptFriendRequest(user.id, targetUserId);
    notifyUser(targetUserId, {
      type: 'FRIEND_REQUEST_ACCEPTED',
      payload: {
        friendId: user.id,
        friendName: user.displayName
      }
    });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка подтверждения дружбы';
    res.status(400).json({ error: msg });
  }
});

// Decline friend request
app.post('/api/friends/decline', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: 'Укажите targetUserId' });
  }

  try {
    const result = await userDb.declineFriendRequest(user.id, targetUserId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка отклонения запроса';
    res.status(400).json({ error: msg });
  }
});

// Remove friend
app.post('/api/friends/remove', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: 'Укажите targetUserId' });
  }

  try {
    const result = await userDb.removeFriend(user.id, targetUserId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка удаления из друзей';
    res.status(400).json({ error: msg });
  }
});

// Invite friend to game room
app.post('/api/friends/invite', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetUserId, roomCode, roomName, isPrivate } = req.body;
  if (!targetUserId || !roomCode) {
    return res.status(400).json({ error: 'Укажите targetUserId и roomCode' });
  }

  try {
    const invite = await userDb.createRoomInvite(user.id, targetUserId, roomCode, roomName, !!isPrivate);
    try {
      await eventsDb.trackAction(user.id, 'invite_friend', 1);
    } catch {}
    notifyUser(targetUserId, {
      type: 'ROOM_INVITE',
      payload: invite
    });
    res.json({
      success: true,
      invite,
      message: `Приглашение в комнату #${roomCode.toUpperCase()} успешно отправлено!`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка отправки приглашения';
    res.status(400).json({ error: msg });
  }
});

// Get pending room invites
app.get('/api/friends/invites', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const invites = await userDb.getPendingRoomInvites(user.id);
  res.json({ invites });
});

// Dismiss room invite
app.post('/api/friends/invites/dismiss', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { inviteId } = req.body;
  if (!inviteId) {
    return res.status(400).json({ error: 'Укажите inviteId' });
  }

  await userDb.dismissRoomInvite(user.id, inviteId);
  res.json({ success: true });
});

// ================= CLANS REST APIS =================
// List all clans
app.get('/api/clans', async (req, res) => {
  const search = req.query.search as string;
  const clans = await clanDb.getAllClans(search);
  res.json({ clans });
});

// Get My Clan
app.get('/api/clans/my', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const clan = await clanDb.getMyClan(user.id);
  res.json({ clan, inClan: !!clan });
});

// Get Clan by ID
app.get('/api/clans/:id', async (req, res) => {
  const clan = await clanDb.getClanById(req.params.id);
  if (!clan) {
    return res.status(404).json({ error: 'Клан не найден' });
  }
  res.json({ clan });
});

// Create Clan
app.post('/api/clans/create', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { name, tag, description, avatarIcon } = req.body;
  try {
    const result = await clanDb.createClan(user.id, { name, tag, description, avatarIcon });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка создания клана';
    res.status(400).json({ error: msg });
  }
});

// Join Clan
app.post('/api/clans/join', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { clanId } = req.body;
  if (!clanId) {
    return res.status(400).json({ error: 'Укажите ID клана' });
  }

  try {
    const result = await clanDb.joinClan(user.id, clanId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при вступлении в клан';
    res.status(400).json({ error: msg });
  }
});

// Leave Clan
app.post('/api/clans/leave', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  try {
    const result = await clanDb.leaveClan(user.id);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка выхода из клана';
    res.status(400).json({ error: msg });
  }
});

// Kick Member (Leader only)
app.post('/api/clans/kick', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: 'Укажите ID участника' });
  }

  try {
    const result = await clanDb.kickMember(user.id, targetUserId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка исключения участника';
    res.status(400).json({ error: msg });
  }
});

// CLAIM DAILY BONUS
app.post('/api/user/claim-daily-bonus', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  try {
    const result = await userDb.claimDailyBonus(user.id);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при получении бонуса';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/auth/profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { displayName } = req.body;
  if (!displayName || typeof displayName !== 'string') {
    return res.status(400).json({ error: 'Укажите новое имя в игре.' });
  }

  try {
    const changeRes = await userDb.changeDisplayName(user.id, displayName, false);
    const updated = changeRes.user;
    res.json({ user: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обновления профиля';
    res.status(400).json({ error: msg });
  }
});

// ADMIN HELPER MIDDLEWARE
async function requireAdmin(req: express.Request, res: express.Response): Promise<any> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return null;
  }
  const user = await userDb.getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Сессия недействительна' });
    return null;
  }
  const isAuthorizedAdmin = user.email?.toLowerCase().trim() === 'vledahovic@gmail.com' || isEmailAdmin(user.email) || user.isAdmin === true || user.role === 'admin';
  if (!isAuthorizedAdmin) {
    res.status(403).json({ error: `Доступ запрещён: требуются права администратора (${getAdminEmails().join(', ')})` });
    return null;
  }
  return user;
}

// ADMIN REST APIS
app.get('/api/admin/check', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  res.json({ isAdmin: true, user: admin });
});

app.get('/api/admin/stats', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const users = await userDb.getAllUsers();
  const rooms = roomManager.getAllRoomsDetailed();
  const totalCredits = users.reduce((acc, u) => acc + (u.credits || 0), 0);
  const totalGamesPlayed = users.reduce((acc, u) => acc + (u.stats?.gamesPlayed || 0), 0);

  res.json({
    totalUsers: users.length,
    totalCredits,
    totalGamesPlayed,
    activeRoomsCount: rooms.length,
    activePlayersInRooms: rooms.reduce((acc, r) => acc + r.playerCount, 0),
    bannedUsersCount: users.filter(u => u.isBanned).length,
    adminEmail: 'vledahovic@gmail.com'
  });
});

app.get('/api/admin/users', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  res.json({ users: await userDb.getAllUsers() });
});

app.post('/api/admin/users/credits', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { userId, amount, isSet } = req.body;
  if (!userId || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Укажите userId и числовое значение amount' });
  }

  try {
    const updated = await userDb.adminUpdateCredits(userId, amount, !!isSet);
    await auditLogsDb.logAction({
      actionType: 'credits_change',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: updated.id,
      targetName: updated.displayName,
      details: isSet 
        ? `Установка баланса кредитов игрока ${updated.displayName}: ${updated.credits} кр.` 
        : `Начисление кредитов игроку ${updated.displayName}: ${amount >= 0 ? '+' : ''}${amount} кр. (Баланс: ${updated.credits} кр.)`,
      metadata: { amount, isSet, newBalance: updated.credits }
    });
    res.json({ user: updated, message: `Баланс пользователя ${updated.displayName} обновлен: ${updated.credits} кр.` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка обновления баланса';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Adjust user experience (XP) and level
app.post('/api/admin/users/xp', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { userId, xp, addXp, isSet, reason } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Укажите userId' });
  }

  try {
    let updated;
    if (isSet && typeof xp === 'number') {
      const resData = await userDb.setUserXp(userId, xp);
      if (!resData) throw new Error('Пользователь не найден');
      updated = await userDb.getUserById(userId);
      await auditLogsDb.logAction({
        actionType: 'experience_update',
        adminId: admin.id,
        adminEmail: admin.email,
        adminName: admin.displayName,
        targetId: updated!.id,
        targetName: updated!.displayName,
        details: `Установка опыта игрока ${updated!.displayName}: ${updated!.xp} XP (Уровень: ${updated!.level})`,
        metadata: { xp, level: updated!.level, reason: reason || 'Установка администратором' }
      });
    } else if (typeof addXp === 'number') {
      const resData = await userDb.addXp(userId, addXp, reason || 'Начисление администратором');
      if (!resData) throw new Error('Пользователь не найден');
      updated = await userDb.getUserById(userId);
      await auditLogsDb.logAction({
        actionType: 'experience_update',
        adminId: admin.id,
        adminEmail: admin.email,
        adminName: admin.displayName,
        targetId: updated!.id,
        targetName: updated!.displayName,
        details: `Начисление опыта игроку ${updated!.displayName}: ${addXp >= 0 ? '+' : ''}${addXp} XP (Итого: ${updated!.xp} XP, Уровень: ${updated!.level})`,
        metadata: { addXp, totalXp: updated!.xp, level: updated!.level, reason }
      });
    } else {
      return res.status(400).json({ error: 'Укажите xp или addXp' });
    }

    res.json({
      success: true,
      user: updated,
      message: `Опыт игрока ${updated!.displayName} успешно обновлен: ${updated!.xp} XP (Уровень ${updated!.level})`
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка обновления опыта игрока';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/admin/users/give-item', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { userId, itemId, quantity } = req.body;
  if (!userId || !itemId) {
    return res.status(400).json({ error: 'Укажите userId и itemId' });
  }

  try {
    const qty = typeof quantity === 'number' && quantity > 0 ? quantity : 1;
    const updated = await userDb.adminGiveItem(userId, itemId, qty);
    await auditLogsDb.logAction({
      actionType: 'item_give',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: updated.id,
      targetName: updated.displayName,
      details: `Выдача предмета «${itemId}» (${qty} шт.) игроку ${updated.displayName}`,
      metadata: { itemId, quantity: qty }
    });
    res.json({ user: updated, message: `Предмет ${itemId} (${qty} шт.) успешно выдан пользователю ${updated.displayName}!` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка выдачи предмета';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/admin/users/toggle-ban', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Укажите userId' });
  }

  try {
    const updated = await userDb.adminToggleBan(userId);
    await auditLogsDb.logAction({
      actionType: 'user_ban',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: updated.id,
      targetName: updated.displayName,
      details: updated.isBanned 
        ? `Блокировка доступа пользователю «${updated.displayName}» (${updated.email})` 
        : `Разблокировка аккаунта пользователя «${updated.displayName}» (${updated.email})`,
      metadata: { isBanned: updated.isBanned, email: updated.email }
    });
    res.json({ 
      user: updated, 
      message: updated.isBanned 
        ? `Пользователь ${updated.displayName} успешно заблокирован.` 
        : `Пользователь ${updated.displayName} разблокирован.` 
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка изменения статуса блокировки';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/admin/users/role', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { userId, role, isAdmin } = req.body;
  if (!userId || !role) {
    return res.status(400).json({ error: 'Укажите userId и role (user, moderator, admin)' });
  }

  try {
    const prevUser = await userDb.getUserById(userId);
    const oldRole = prevUser?.role || 'user';
    const updated = await userDb.adminUpdateRole(userId, role, isAdmin);

    await auditLogsDb.logAction({
      actionType: 'role_change',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: updated.id,
      targetName: updated.displayName,
      details: `Изменение роли пользователя «${updated.displayName}» с «${oldRole}» на «${updated.role}» (Админ-права: ${updated.isAdmin ? 'Включены' : 'Выключены'})`,
      metadata: { oldRole, newRole: updated.role, isAdmin: updated.isAdmin, email: updated.email }
    });

    res.json({
      user: updated,
      message: `Роль пользователя ${updated.displayName} успешно изменена на «${updated.role}».`
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка изменения роли';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/admin/users/rating', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { userId, rating } = req.body;
  if (!userId || typeof rating !== 'number') {
    return res.status(400).json({ error: 'Укажите userId и числовой rating' });
  }

  try {
    const updated = await userDb.adminUpdateRating(userId, rating);
    await auditLogsDb.logAction({
      actionType: 'rating_change',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: updated.id,
      targetName: updated.displayName,
      details: `Изменение Elo рейтинга пользователя ${updated.displayName} на ${rating}`,
      metadata: { rating }
    });
    res.json({ user: updated, message: `Рейтинг пользователя ${updated.displayName} изменён на ${rating} Elo.` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка изменения рейтинга';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/admin/users/rename', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { userId, displayName } = req.body;
  if (!userId || !displayName) {
    return res.status(400).json({ error: 'Укажите userId и displayName' });
  }

  try {
    const prevUser = await userDb.getUserById(userId);
    const oldName = prevUser?.displayName || 'Игрок';
    const updated = await userDb.adminUpdateDisplayName(userId, displayName);
    await auditLogsDb.logAction({
      actionType: 'user_rename',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: updated.id,
      targetName: updated.displayName,
      details: `Принудительное переименование игрока «${oldName}» в «${updated.displayName}»`,
      metadata: { oldName, newName: updated.displayName }
    });
    res.json({ user: updated, message: `Никнейм пользователя успешно изменён на «${updated.displayName}».` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка изменения никнейма';
    res.status(400).json({ error: msg });
  }
});

app.get('/api/admin/rooms', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  res.json({ rooms: roomManager.getAllRoomsDetailed() });
});

app.post('/api/admin/rooms/close', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { roomCode } = req.body;
  if (!roomCode) {
    return res.status(400).json({ error: 'Укажите roomCode' });
  }

  const room = roomManager.getRoom(roomCode);
  const roomName = room?.state?.roomName || `Комната #${roomCode.toUpperCase()}`;
  const playersCount = room?.state?.players?.length || 0;

  roomManager.removeRoom(roomCode);

  await auditLogsDb.logAction({
    actionType: 'room_shutdown',
    adminId: admin.id,
    adminEmail: admin.email,
    adminName: admin.displayName,
    targetId: roomCode.toUpperCase(),
    targetName: roomName,
    details: `Принудительное закрытие игровой комнаты #${roomCode.toUpperCase()} («${roomName}») администратором`,
    metadata: { roomCode: roomCode.toUpperCase(), playersCount }
  });

  res.json({ success: true, message: `Комната #${roomCode.toUpperCase()} принудительно закрыта.` });
});

app.post('/api/admin/broadcast', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Укажите текст сообщения message' });
  }

  const sentCount = roomManager.broadcastSystemMessage(message);
  await auditLogsDb.logAction({
    actionType: 'broadcast',
    adminId: admin.id,
    adminEmail: admin.email,
    adminName: admin.displayName,
    targetName: 'Все активные комнаты',
    details: `Системное оповещение в ${sentCount} комнат: «${message.slice(0, 80)}${message.length > 80 ? '...' : ''}»`,
    metadata: { message, sentCount }
  });
  res.json({ success: true, sentRoomsCount: sentCount, message: `Оповещение успешно отправлено в ${sentCount} комнат.` });
});

// ================= AUDIT LOGS APIS =================
app.get('/api/admin/audit-logs', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  const actionType = (req.query.actionType as string) || 'all';
  const search = (req.query.search as string) || '';

  const logs = await auditLogsDb.getLogs({ limit, actionType, search });
  const stats = await auditLogsDb.getStats();

  res.json({ logs, stats });
});

app.post('/api/admin/audit-logs/clear', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  await auditLogsDb.clearLogs();
  await auditLogsDb.logAction({
    actionType: 'system',
    adminId: admin.id,
    adminEmail: admin.email,
    adminName: admin.displayName,
    details: 'Очистка журнала аудита администратором'
  });

  res.json({ success: true, message: 'Журнал аудита успешно очищен.' });
});

// ================= SHOP & ECONOMY MANAGEMENT APIS =================

// ================= UNIFIED GAME ITEMS CATALOG APIS =================

// PUBLIC: Get all items in the unified game catalog + runtime lootbox resources
app.get('/api/items', async (req, res) => {
  const [items, mediaAssets, soundDefaults, deletedReplacements] = await Promise.all([
    itemsDb.getAllItems(),
    itemsDb.getMediaAssets(),
    itemsDb.getSoundDefaults(),
    itemsDb.getDeletedItemReplacementsMap()
  ]);
  const itemsMap: Record<string, any> = {};
  for (const it of items) {
    itemsMap[it.id] = it;
  }
  const mediaAssetsMap: Record<string, any> = {};
  for (const ma of mediaAssets) {
    mediaAssetsMap[ma.id] = ma;
  }
  res.json({
    items,
    itemsMap,
    count: items.length,
    mediaAssets,
    mediaAssetsMap,
    soundDefaults,
    deletedReplacements,
    defaultNicknameChangeCost: DEFAULT_NICKNAME_CHANGE_COST,
    nicknameCertificateId: NICKNAME_CHANGE_CERTIFICATE_ID
  });
});

// PUBLIC: Get runtime lootbox media assets, sound defaults, and deleted item replacements for player opening UI
app.get('/api/lootboxes/runtime-resources', async (req, res) => {
  try {
    const [mediaAssets, soundDefaults, deletedReplacements] = await Promise.all([
      itemsDb.getMediaAssets(),
      itemsDb.getSoundDefaults(),
      itemsDb.getDeletedItemReplacementsMap()
    ]);
    const mediaAssetsMap: Record<string, any> = {};
    for (const ma of mediaAssets) {
      mediaAssetsMap[ma.id] = ma;
    }
    res.json({
      mediaAssets,
      mediaAssetsMap,
      soundDefaults,
      deletedReplacements
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки ресурсов лутбоксов';
    res.status(400).json({ error: msg });
  }
});

// PUBLIC: Serve a media asset (frame or sound) from persistent DB with immutable cache and security headers
app.get('/api/lootboxes/media/:assetId', async (req, res) => {
  try {
    const asset = await itemsDb.getMediaAssetById(req.params.assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Медиа-ресурс не найден.' });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    if (asset.sourceUrl.startsWith('data:')) {
      const match = asset.sourceUrl.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/i);
      if (match) {
        const mime = match[1].trim();
        const buf = Buffer.from(match[2].trim(), 'base64');
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', String(buf.byteLength));
        return res.send(buf);
      }
    }
    return res.redirect(asset.sourceUrl);
  } catch (err: unknown) {
    return res.status(400).json({ error: 'Ошибка чтения медиа-ресурса' });
  }
});

// PUBLIC: Get single item by ID
app.get('/api/items/:id', async (req, res) => {
  const item = await itemsDb.getItemById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Предмет не найден в каталоге.' });
  }
  res.json({ item });
});

// Public endpoint to get live items and settings for shop & pawnshop
app.get('/api/shop/items', async (req, res) => {
  res.json({
    items: await itemsDb.getAllItems(),
    shopItems: await itemsDb.getShopItems(),
    settings: await shopDb.getSettings()
  });
});

// ADMIN: Get full shop catalog and configuration
app.get('/api/admin/shop/items', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  res.json({
    items: await shopDb.getAllItems(),
    settings: await shopDb.getSettings()
  });
});

// ADMIN: Get unified items catalog with visibility counters and storage diagnostics
app.get('/api/admin/items/catalog', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const items = await itemsDb.getAllItems();
  const hiddenCount = items.filter(i => Boolean(i.adminHidden)).length;
  res.json({
    items,
    counts: {
      total: items.length,
      visible: items.length - hiddenCount,
      hidden: hiddenCount
    },
    storage: getDatabaseConnectionInfo()
  });
});

// ADMIN: Safe non-destructive restoration of any missing items from the 17 initial catalog items
app.post('/api/admin/items/restore-missing', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const result = await itemsDb.restoreMissingInitialItems();
    if (result.restoredIds.length > 0) {
      await auditLogsDb.logAction({
        actionType: 'shop_update',
        adminId: admin.id,
        adminEmail: admin.email,
        adminName: admin.displayName,
        targetId: 'catalog_restore',
        targetName: 'Каталог предметов',
        details: `Восстановлены недостающие базовые предметы каталога (${result.restoredIds.length} шт.): ${result.restoredIds.join(', ')}. Существующие записи (${result.skippedExistingIds.length} шт.) сохранены без изменений.`,
        metadata: {
          restoredIds: result.restoredIds,
          skippedExistingIds: result.skippedExistingIds
        }
      });
    }

    res.json({
      items: result.items,
      restoredIds: result.restoredIds,
      skippedExistingIds: result.skippedExistingIds,
      message:
        result.restoredIds.length > 0
          ? `Восстановлено недостающих предметов: ${result.restoredIds.length} шт. Существующие предметы (${result.skippedExistingIds.length} шт.) сохранены без изменений.`
          : 'Все 17 базовых предметов уже присутствуют в базе данных.'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка восстановления недостающих предметов каталога';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Toggle administrative visibility (adminHidden) for a single item in the catalog
app.post('/api/admin/items/visibility', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id, adminHidden } = req.body;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Укажите идентификатор предмета (id).' });
  }
  if (typeof adminHidden !== 'boolean') {
    return res.status(400).json({ error: 'Укажите корректное булево значение adminHidden.' });
  }

  try {
    const updated = await itemsDb.setAdminVisibility(id, adminHidden);
    const items = await itemsDb.getAllItems();
    await auditLogsDb.logAction({
      actionType: 'catalog_visibility',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: updated.id,
      targetName: updated.name,
      details: adminHidden
        ? `Предмет «${updated.name}» [${updated.id}] скрыт из административных списков выбора`
        : `Предмет «${updated.name}» [${updated.id}] возвращён в административные списки выбора`,
      metadata: { itemId: updated.id, adminHidden: Boolean(updated.adminHidden) }
    });

    res.json({
      item: updated,
      items,
      message: adminHidden
        ? `Предмет «${updated.name}» скрыт из списков выбора в разделах админ-панели.`
        : `Предмет «${updated.name}» снова доступен в списках выбора админ-панели.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка изменения видимости предмета';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Bulk update administrative visibility (adminHidden) for multiple items in the catalog
app.post('/api/admin/items/visibility/bulk', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { ids, adminHidden } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Выберите хотя бы один предмет для массовой операции.' });
  }
  if (typeof adminHidden !== 'boolean') {
    return res.status(400).json({ error: 'Укажите корректное булево значение adminHidden.' });
  }

  try {
    const updatedItems = await itemsDb.bulkSetAdminVisibility(ids, adminHidden);
    const items = await itemsDb.getAllItems();
    await auditLogsDb.logAction({
      actionType: 'catalog_visibility_bulk',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: `bulk_${updatedItems.length}`,
      targetName: `${updatedItems.length} предм.`,
      details: adminHidden
        ? `Массовое скрытие из административных списков выбора (${updatedItems.length} предм.): ${updatedItems.map(i => i.name).join(', ')}`
        : `Массовый показ в административных списках выбора (${updatedItems.length} предм.): ${updatedItems.map(i => i.name).join(', ')}`,
      metadata: { itemIds: updatedItems.map(i => i.id), adminHidden, count: updatedItems.length }
    });

    res.json({
      updatedCount: updatedItems.length,
      items,
      message: adminHidden
        ? `Скрыто предметов из административных списков выбора: ${updatedItems.length} шт.`
        : `Возвращено предметов в административные списки выбора: ${updatedItems.length} шт.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка массового изменения видимости предметов';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Update existing shop item (price, pawn value, discount, inShop, etc.)
app.post('/api/admin/shop/items/update', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id, updates } = req.body;
  if (!id || !updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Укажите id товара и объект updates.' });
  }

  try {
    const updated = await shopDb.updateItem(id, updates);
    res.json({
      item: updated,
      message: `Товар «${updated.name}» успешно обновлен.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обновления товара';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Create new item in shop
app.post('/api/admin/shop/items/create', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { item } = req.body;
  if (!item || typeof item !== 'object') {
    return res.status(400).json({ error: 'Укажите данные нового товара.' });
  }

  try {
    const created = await shopDb.createItem(item);
    res.json({
      item: created,
      message: `Новый товар «${created.name}» успешно добавлен в каталог магазина!`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка создания товара';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Delete custom item
app.post('/api/admin/shop/items/delete', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Укажите id товара для удаления.' });
  }

  try {
    await shopDb.deleteItem(id);
    res.json({
      success: true,
      message: `Товар успешно удален из каталога.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка удаления товара';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Update shop global settings (discount, banner, enabled)
app.post('/api/admin/shop/settings', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Укажите настройки магазина.' });
  }

  try {
    const updated = await shopDb.updateSettings(settings);
    res.json({
      settings: updated,
      message: `Настройки магазина успешно сохранены.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обновления настроек';
    res.status(400).json({ error: msg });
  }
});

// ================= ADMIN LOOTBOX CONSTRUCTOR REST APIS =================

// ADMIN: Get all lootboxes (category === 'chests'), catalog items, media assets, and sound defaults for constructor
app.get('/api/admin/lootboxes', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const [lootboxes, items, mediaAssets, soundDefaults, deletedReplacements] = await Promise.all([
      itemsDb.getAllLootboxes(),
      itemsDb.getAllItems(),
      itemsDb.getMediaAssets(),
      itemsDb.getSoundDefaults(),
      itemsDb.getDeletedItemReplacementsMap()
    ]);
    const catalogMap: Record<string, any> = {};
    for (const it of items) {
      catalogMap[it.id] = it;
    }

    const enrichedLootboxes = lootboxes.map(lb => {
      const validation = lb.lootboxConfig
        ? validateLootboxRuleConfig(lb.id, lb.lootboxConfig, catalogMap)
        : null;
      return {
        ...lb,
        computedProbabilitiesPercent: validation?.computedProbabilitiesPercent || [],
        emptyDropProbabilityPercent: validation?.emptyDropProbabilityPercent ?? 0,
        hasGuaranteedReward: validation?.hasGuaranteedReward ?? false
      };
    });

    const selectableItems = items.filter(i => !i.adminHidden);
    res.json({
      lootboxes: enrichedLootboxes,
      items,
      selectableItems,
      mediaAssets,
      soundDefaults,
      deletedReplacements,
      counts: {
        total: lootboxes.length,
        systemChests: lootboxes.filter(l => l.isCustomLootbox === false).length,
        customLootboxes: lootboxes.filter(l => l.isCustomLootbox === true).length
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки списка лутбоксов';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Get media assets (frames & sounds) and global sound defaults
app.get('/api/admin/lootboxes/media/list', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const assetType =
      req.query.assetType === 'image' || req.query.assetType === 'audio'
        ? req.query.assetType
        : undefined;
    const [mediaAssets, soundDefaults] = await Promise.all([
      itemsDb.getMediaAssets(assetType),
      itemsDb.getSoundDefaults()
    ]);
    res.json({
      mediaAssets,
      soundDefaults
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки медиа-библиотеки лутбоксов';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Upload a new animation frame or sound file to persistent database storage (`lootbox_media_assets`)
app.post('/api/admin/lootboxes/media/upload', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const result = await itemsDb.uploadMediaAsset({
      assetType: req.body?.assetType,
      title: req.body?.title,
      sourceUrl: req.body?.sourceUrl,
      mimeType: req.body?.mimeType,
      category: req.body?.category,
      targetRewardType: req.body?.targetRewardType,
      targetItemRarity: req.body?.targetItemRarity,
      durationMs: req.body?.durationMs,
      metadata: req.body?.metadata
    });

    await auditLogsDb.logAction({
      actionType: 'shop_update',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: result.asset.id,
      targetName: result.asset.title,
      details: result.reusedExisting
        ? `Повторно использован существующий ${result.asset.assetType === 'audio' ? 'звук' : 'кадр'} «${result.asset.title}» (${result.asset.category})`
        : `Загружен в библиотеку лутбоксов ${result.asset.assetType === 'audio' ? 'звук' : 'кадр'} «${result.asset.title}» (${result.asset.category}, ${Math.round(result.asset.byteSize / 1024)} КБ)`,
      metadata: {
        assetId: result.asset.id,
        assetType: result.asset.assetType,
        category: result.asset.category,
        reusedExisting: result.reusedExisting
      }
    });

    const mediaAssets = await itemsDb.getMediaAssets();
    res.json({
      asset: result.asset,
      reusedExisting: result.reusedExisting,
      mediaAssets,
      message: result.reusedExisting
        ? `Ресурс «${result.asset.title}» уже есть в библиотеке (SHA-256 совпал) и подключён без дублирования.`
        : `${result.asset.assetType === 'audio' ? 'Звук' : 'Кадр анимации'} «${result.asset.title}» успешно сохранён в библиотеку!`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки медиа-файла';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Update title or manual category of a media asset
app.put('/api/admin/lootboxes/media/:assetId', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const updated = await itemsDb.updateMediaAsset(req.params.assetId, {
      title: req.body?.title,
      category: req.body?.category
    });
    const mediaAssets = await itemsDb.getMediaAssets();
    res.json({
      asset: updated,
      mediaAssets,
      message: `Параметры ресурса «${updated.title}» успешно обновлены.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обновления медиа-ресурса';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Delete a media asset from library
app.delete('/api/admin/lootboxes/media/:assetId', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    await itemsDb.deleteMediaAsset(req.params.assetId);
    const [mediaAssets, soundDefaults] = await Promise.all([
      itemsDb.getMediaAssets(),
      itemsDb.getSoundDefaults()
    ]);
    res.json({
      success: true,
      mediaAssets,
      soundDefaults,
      message: 'Медиа-ресурс удалён из библиотеки.'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка удаления медиа-ресурса';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Set or clear global default sound for a reward category (`lootbox_sound_defaults`)
app.put('/api/admin/lootboxes/sounds/defaults', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { category, soundAssetId } = req.body || {};
  if (!category || typeof category !== 'string') {
    return res.status(400).json({ error: 'Укажите звуковую категорию (category).' });
  }

  try {
    const soundDefaults = await itemsDb.setSoundDefault(
      category as any,
      soundAssetId ? String(soundAssetId) : null
    );
    await auditLogsDb.logAction({
      actionType: 'shop_update',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: category,
      targetName: `Звук по умолчанию: ${category}`,
      details: soundAssetId
        ? `Назначен звук по умолчанию (${soundAssetId}) для категории «${category}»`
        : `Сброшен звук по умолчанию для категории «${category}»`,
      metadata: { category, soundAssetId: soundAssetId || null }
    });

    res.json({
      soundDefaults,
      message: soundAssetId
        ? `Звук по умолчанию для категории «${category}» сохранён.`
        : `Звук по умолчанию для категории «${category}» сброшен на стандартный синтезатор.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сохранения звука по умолчанию';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Get single lootbox configuration and computed probabilities
app.get('/api/admin/lootboxes/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const lootbox = await itemsDb.getLootboxById(req.params.id);
    if (!lootbox) {
      return res.status(404).json({ error: `Лутбокс с ID "${req.params.id}" не найден в каталоге.` });
    }
    const catalogMap = await itemsDb.getCatalogMap();
    const validation = lootbox.lootboxConfig
      ? validateLootboxRuleConfig(lootbox.id, lootbox.lootboxConfig, catalogMap)
      : null;

    res.json({
      lootbox,
      validation,
      computedProbabilitiesPercent: validation?.computedProbabilitiesPercent || [],
      emptyDropProbabilityPercent: validation?.emptyDropProbabilityPercent ?? 0,
      hasGuaranteedReward: validation?.hasGuaranteedReward ?? false
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки конфигурации лутбокса';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Create a new custom lootbox in the unified catalog
app.post('/api/admin/lootboxes', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const payload = req.body?.lootbox && typeof req.body.lootbox === 'object' ? req.body.lootbox : req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Укажите параметры создаваемого лутбокса.' });
  }

  try {
    const result = await itemsDb.createCustomLootbox(payload);
    await auditLogsDb.logAction({
      actionType: 'shop_update',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: result.item.id,
      targetName: result.item.name,
      details: `Создан пользовательский лутбокс «${result.item.name}» [${result.item.id}] (v${result.item.lootboxConfig?.version}, hash: ${result.item.lootboxConfig?.snapshotHash?.slice(0, 12)}...)`,
      metadata: {
        lootboxId: result.item.id,
        version: result.item.lootboxConfig?.version,
        snapshotHash: result.item.lootboxConfig?.snapshotHash
      }
    });

    const [lootboxes, items] = await Promise.all([
      itemsDb.getAllLootboxes(),
      itemsDb.getAllItems()
    ]);

    res.json({
      lootbox: result.item,
      validation: result.validation,
      lootboxes,
      items,
      message: `Лутбокс «${result.item.name}» успешно создан и добавлен в единый каталог предметов!`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка создания лутбокса';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Update existing lootbox metadata (and optionally rules/presentation)
app.put('/api/admin/lootboxes/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const updates = req.body?.updates && typeof req.body.updates === 'object' ? req.body.updates : req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Укажите обновляемые поля лутбокса.' });
  }

  try {
    const result = await itemsDb.updateLootbox(req.params.id, updates);
    await auditLogsDb.logAction({
      actionType: 'shop_update',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: result.item.id,
      targetName: result.item.name,
      details: `Обновлены параметры лутбокса «${result.item.name}» [${result.item.id}]`,
      metadata: {
        lootboxId: result.item.id,
        version: result.item.lootboxConfig?.version,
        snapshotHash: result.item.lootboxConfig?.snapshotHash
      }
    });

    const [lootboxes, items] = await Promise.all([
      itemsDb.getAllLootboxes(),
      itemsDb.getAllItems()
    ]);

    res.json({
      lootbox: result.item,
      validation: result.validation,
      lootboxes,
      items,
      message: `Лутбокс «${result.item.name}» успешно обновлён.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обновления лутбокса';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Delete a custom lootbox and register replacement in `deleted_item_replacements`
const handleDeleteCustomLootboxRoute = async (req: express.Request, res: express.Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const result = await itemsDb.deleteCustomLootbox(req.params.id, {
      replacementType: req.body?.replacementType,
      replacementItemId: req.body?.replacementItemId,
      replacementQty: req.body?.replacementQty,
      adminId: admin.id
    });

    await auditLogsDb.logAction({
      actionType: 'shop_update',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: result.deletedId,
      targetName: result.deletedName,
      details: `Удалён пользовательский лутбокс «${result.deletedName}» [${result.deletedId}] с назначением замены (${result.replacement.replacementType}: ${result.replacement.replacementItemId || 'credits'} x${result.replacement.replacementQty})`,
      metadata: result.replacement as any
    });

    const [lootboxes, items, deletedReplacements] = await Promise.all([
      itemsDb.getAllLootboxes(),
      itemsDb.getAllItems(),
      itemsDb.getDeletedItemReplacementsMap()
    ]);

    res.json({
      deletedId: result.deletedId,
      replacement: result.replacement,
      lootboxes,
      items,
      deletedReplacements,
      message: `Пользовательский лутбокс «${result.deletedName}» удалён из каталога. Для старых снимков назначена компенсация.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка удаления пользовательского лутбокса';
    res.status(400).json({ error: msg });
  }
};

app.delete('/api/admin/lootboxes/:id', handleDeleteCustomLootboxRoute);
app.post('/api/admin/lootboxes/:id/delete', handleDeleteCustomLootboxRoute);

// ADMIN: Save new drop rules (lootboxConfig) for a lootbox (increments version & recomputes SHA-256 snapshotHash)
app.put('/api/admin/lootboxes/:id/rules', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const configPayload =
    req.body?.lootboxConfig && typeof req.body.lootboxConfig === 'object'
      ? req.body.lootboxConfig
      : req.body;

  if (!configPayload || typeof configPayload !== 'object') {
    return res.status(400).json({ error: 'Укажите конфигурацию правил выпадения (lootboxConfig).' });
  }

  try {
    const result = await itemsDb.updateLootboxRules(req.params.id, configPayload);
    await auditLogsDb.logAction({
      actionType: 'shop_update',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: result.item.id,
      targetName: result.item.name,
      details: `Обновлены правила выпадения лутбокса «${result.item.name}» [${result.item.id}] -> v${result.item.lootboxConfig?.version} (SHA-256: ${result.item.lootboxConfig?.snapshotHash})`,
      metadata: {
        lootboxId: result.item.id,
        version: result.item.lootboxConfig?.version,
        snapshotHash: result.item.lootboxConfig?.snapshotHash,
        dropMode: result.item.lootboxConfig?.dropMode
      }
    });

    res.json({
      lootbox: result.item,
      validation: result.validation,
      message: `Правила выпадения для «${result.item.name}» сохранены (версия v${result.item.lootboxConfig?.version}). Ранее выданные игрокам экземпляры сохранили свои прежние снимки правил.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сохранения правил выпадения лутбокса';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Save visual/audio presentationConfig for a lootbox (does not change snapshotHash)
app.put('/api/admin/lootboxes/:id/presentation', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const presPayload =
    req.body?.presentationConfig && typeof req.body.presentationConfig === 'object'
      ? req.body.presentationConfig
      : req.body;

  try {
    const updated = await itemsDb.updateLootboxPresentation(req.params.id, presPayload);
    await auditLogsDb.logAction({
      actionType: 'shop_update',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: updated.id,
      targetName: updated.name,
      details: `Обновлено визуально-звуковое оформление лутбокса «${updated.name}» [${updated.id}]`,
      metadata: { lootboxId: updated.id }
    });

    res.json({
      lootbox: updated,
      message: `Визуально-звуковое оформление лутбокса «${updated.name}» сохранено.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сохранения визуально-звукового оформления';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Run pure server-side drop simulation for a lootbox without mutating any DB state
app.post('/api/admin/lootboxes/:id/simulate', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const iterations = req.body?.iterations !== undefined ? Number(req.body.iterations) : 1000;
    const lootboxConfig =
      req.body?.lootboxConfig && typeof req.body.lootboxConfig === 'object'
        ? req.body.lootboxConfig
        : undefined;

    const simulation = await itemsDb.simulateLootbox(req.params.id, {
      iterations,
      lootboxConfig,
      draftName: req.body?.draftName,
      draftRarity: req.body?.draftRarity
    });

    res.json({
      simulation,
      message: `Симуляция (${simulation.iterations} открытий) успешно выполнена.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка симуляции открытий лутбокса';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Reset shop to default catalog
app.post('/api/admin/shop/reset', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const defaultItems = await shopDb.resetToDefaults();
    res.json({
      items: defaultItems,
      settings: await shopDb.getSettings(),
      message: 'Каталог магазина успешно сброшен к исходным товарам по умолчанию.'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сброса магазина';
    res.status(400).json({ error: msg });
  }
});

// ================= REPORTS & MODERATION APIS =================

// Public endpoint to submit a player complaint
app.post('/api/reports/submit', async (req, res) => {
  const { reporterId, reporterName, targetPlayerId, targetPlayerName, roomCode, reason, reasonCategory, details } = req.body;

  if (!reporterId || !targetPlayerId || !reason) {
    return res.status(400).json({ error: 'Необходимо указать id заявителя, id нарушителя и причину жалобы.' });
  }

  // Attempt to find target user in DB for email/account info
  const targetUser = await userDb.getUserById(targetPlayerId);

  try {
    const report = await reportsDb.createReport({
      reporterId,
      reporterName: reporterName || 'Анонимный игрок',
      targetPlayerId,
      targetPlayerName: targetPlayerName || targetUser?.displayName || 'Игрок',
      targetPlayerEmail: targetUser?.email,
      roomCode: roomCode || 'LOBBY',
      reason,
      reasonCategory: reasonCategory || 'other',
      details: details || ''
    });

    res.json({
      success: true,
      report,
      message: 'Жалоба успешно отправлена администрации Города. Спасибо за поддержание порядка!'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при отправке жалобы';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Get all reports list
app.get('/api/admin/reports', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  res.json({
    reports: await reportsDb.getAllReports(),
    pendingCount: await reportsDb.getPendingCount()
  });
});

// ADMIN: Resolve report (ban, warn, dismiss, etc.)
app.post('/api/admin/reports/resolve', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { reportId, status, actionTaken, resolutionNote, banTargetPlayer } = req.body;
  if (!reportId || !status) {
    return res.status(400).json({ error: 'Укажите reportId и статус resolution.' });
  }

  try {
    const report = await reportsDb.resolveReport(reportId, status, actionTaken || 'none', resolutionNote);

    // If admin chose to ban the target player directly
    let userBanned = false;
    if (banTargetPlayer && report.targetPlayerId) {
      try {
        const target = await userDb.getUserById(report.targetPlayerId);
        if (target && !target.isBanned) {
          await userDb.adminToggleBan(report.targetPlayerId);
          userBanned = true;
        }
      } catch {
        // Continue
      }
    }

    await auditLogsDb.logAction({
      actionType: 'report_resolve',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: report.id,
      targetName: `Жалоба на ${report.targetPlayerName}`,
      details: `Обработка жалобы #${report.id.slice(-4)} на игрока ${report.targetPlayerName} (Статус: ${status}, Действие: ${actionTaken || 'none'}, Бан: ${userBanned ? 'Да' : 'Нет'})`,
      metadata: { reportId: report.id, status, actionTaken, userBanned, targetPlayerId: report.targetPlayerId }
    });

    res.json({
      report,
      userBanned,
      message: `Жалоба #${report.id.slice(-4)} успешно обработана (Статус: ${status}).`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обработки жалобы';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Delete report record
app.post('/api/admin/reports/delete', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { reportId } = req.body;
  if (!reportId) {
    return res.status(400).json({ error: 'Укажите reportId для удаления.' });
  }

  try {
    await reportsDb.deleteReport(reportId);
    res.json({ success: true, message: 'Запись жалобы удалена.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка удаления жалобы';
    res.status(400).json({ error: msg });
  }
});

// ================= FEEDBACK & BUG REPORT APIS =================

// User: Submit Feedback / Bug Report / Idea (with optional images)
app.post('/api/feedback', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация для отправки обращения.' });
  const user = await userDb.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Сессия недействительна' });

  const { type, title, description, images } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Укажите краткую тему обращения.' });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Опишите найденный баг или предложение.' });
  }

  try {
    const feedback = await feedbackDb.create({
      userId: user.id,
      userEmail: user.email,
      userName: user.displayName,
      userAvatarSeed: user.avatarSeed,
      type: type || 'bug',
      title: title.trim(),
      description: description.trim(),
      images: Array.isArray(images) ? images : []
    });

    res.json({
      success: true,
      feedback,
      message: 'Ваше обращение успешно передано администрации! Если оно окажется полезным, вы получите награду в кредитах.'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка отправки обращения';
    res.status(400).json({ error: msg });
  }
});

// User: Get my submitted feedbacks
app.get('/api/feedback/my', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация.' });
  const user = await userDb.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Сессия недействительна' });

  const feedbacks = await feedbackDb.getByUserId(user.id);
  res.json({ feedbacks });
});

// ADMIN: Get all feedbacks
app.get('/api/admin/feedbacks', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const feedbacks = await feedbackDb.getAll();
  const pendingCount = await feedbackDb.getPendingCount();
  res.json({ feedbacks, pendingCount });
});

// ADMIN: Process feedback & optionally grant credit reward
app.post('/api/admin/feedbacks/resolve', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { feedbackId, status, adminNote, rewardCredits } = req.body;
  if (!feedbackId || !status) {
    return res.status(400).json({ error: 'Укажите feedbackId и статус.' });
  }

  try {
    const current = await feedbackDb.getById(feedbackId);
    if (!current) {
      return res.status(404).json({ error: 'Обращение не найдено.' });
    }

    const rewardAmount = typeof rewardCredits === 'number' && rewardCredits > 0 ? Math.floor(rewardCredits) : 0;
    let targetUserUpdated = null;

    // If granting reward credits to the author
    if (rewardAmount > 0) {
      try {
        targetUserUpdated = await userDb.adminUpdateCredits(current.userId, rewardAmount, false);
      } catch (userErr) {
        console.warn('Could not award credits to user:', userErr);
      }
    }

    const updatedFeedback = await feedbackDb.updateStatus(
      feedbackId,
      status,
      adminNote,
      rewardAmount > 0 ? rewardAmount : undefined,
      admin.displayName
    );

    await auditLogsDb.logAction({
      actionType: 'feedback_resolve',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: current.id,
      targetName: `Обращение от ${current.userName}`,
      details: `Обработка отзыва #${current.id.slice(-4)}: ${status}. Награда: ${rewardAmount > 0 ? `+${rewardAmount} кр.` : 'без награды'}. Заметка: ${adminNote || 'нет'}`,
      metadata: { feedbackId: current.id, status, rewardAmount, authorId: current.userId }
    });

    res.json({
      success: true,
      feedback: updatedFeedback,
      targetUser: targetUserUpdated,
      rewardGiven: rewardAmount,
      message: rewardAmount > 0
        ? `Обращение одобрено! Пользователю ${current.userName} начислено +${rewardAmount} кр.`
        : `Статус обращения обновлен на «${status}».`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обработки обращения';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Delete feedback
app.post('/api/admin/feedbacks/delete', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { feedbackId } = req.body;
  if (!feedbackId) {
    return res.status(400).json({ error: 'Укажите feedbackId.' });
  }

  try {
    await feedbackDb.delete(feedbackId);
    res.json({ success: true, message: 'Обращение удалено.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка удаления обращения';
    res.status(400).json({ error: msg });
  }
});

// ================= DAILY BONUS MANAGEMENT APIS =================

// Public endpoint to get live daily bonus config and schedule
app.get('/api/daily-bonus/config', async (req, res) => {
  res.json({
    config: await dailyBonusDb.getConfig()
  });
});

// ADMIN: Get full daily bonus config, statistics, and claim history
app.get('/api/admin/daily-bonus', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const users = await userDb.getAllUsers();
  const activeStreaksCount = users.filter(u => typeof u.dailyBonusStreak === 'number' && u.dailyBonusStreak > 0).length;

  res.json({
    config: await dailyBonusDb.getConfig(),
    stats: await dailyBonusDb.getStats(users.length, activeStreaksCount)
  });
});

// ADMIN: Update daily bonus configuration (days, multiplier, isEnabled, banner, etc.)
app.post('/api/admin/daily-bonus/config', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { updates } = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Укажите объект updates с параметрами бонуса.' });
  }

  try {
    const updated = await dailyBonusDb.updateConfig(updates);
    res.json({
      config: updated,
      message: 'Настройки ежедневного бонуса успешно сохранены.'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сохранения настроек';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Apply preset
app.post('/api/admin/daily-bonus/preset', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { preset } = req.body;
  if (!preset || !['default', 'weekend_x2', 'generous', 'economy'].includes(preset)) {
    return res.status(400).json({ error: 'Укажите корректный пресет (default, weekend_x2, generous, economy).' });
  }

  try {
    const updated = await dailyBonusDb.applyPreset(preset);
    res.json({
      config: updated,
      message: `Пресет «${preset}» успешно применен к ежедневному бонусу!`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка применения пресета';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Reset daily bonus cooldown for a specific user
app.post('/api/admin/daily-bonus/reset-user', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Укажите userId игрока.' });
  }

  try {
    const updatedUser = await userDb.adminResetDailyBonusCooldown(userId);
    res.json({
      user: updatedUser,
      message: `Кулдаун бонуса для ${updatedUser.displayName} успешно сброшен. Игрок может забрать награду прямо сейчас!`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сброса кулдауна';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Reset daily bonus to default configuration
app.post('/api/admin/daily-bonus/reset-defaults', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const config = await dailyBonusDb.resetToDefaults();
    res.json({
      config,
      message: 'Конфигурация ежедневного бонуса сброшена к исходным значениям по умолчанию.'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сброса конфигурации';
    res.status(400).json({ error: msg });
  }
});

// ================= EXPERIENCE & PROGRESSION SYSTEM APIS =================

// Public: Get current dynamic experience config (milestones, rules, maxLevel, multiplier)
app.get('/api/experience/config', async (req, res) => {
  try {
    const config = await experienceDb.getConfig();
    res.json({ config });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки конфигурации шкалы опыта';
    res.status(500).json({ error: msg });
  }
});

// Admin: Get complete experience configuration, detailed stats, and distribution
app.get('/api/admin/experience', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const config = await experienceDb.getConfig(true);
    const users = await userDb.getAllUsers();
    const totalUsersWithXp = users.filter(u => (u.xp || 0) > 0).length;
    const totalXpDistributed = users.reduce((acc, u) => acc + (u.xp || 0), 0);
    const topPlayer = [...users].sort((a, b) => (b.xp || 0) - (a.xp || 0))[0];

    // Compute player level distribution
    const levelCounts: Record<number, number> = {};
    for (const u of users) {
      const lvl = u.level || 1;
      levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
    }

    res.json({
      config,
      stats: {
        totalUsers: users.length,
        totalUsersWithXp,
        totalXpDistributed,
        maxLevelConfigured: config.maxLevel,
        activeRulesCount: config.actionRules.length,
        milestonesCount: config.levelMilestones.length,
        levelCounts,
        topPlayer: topPlayer ? { name: topPlayer.displayName, xp: topPlayer.xp || 0, level: topPlayer.level || 1 } : null
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка получения данных опыта';
    res.status(500).json({ error: msg });
  }
});

// Admin: Update experience configuration (rules, milestones, maxLevel, multiplier, enabled)
app.post('/api/admin/experience/config', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const updated = await experienceDb.updateConfig(req.body);
    await auditLogsDb.logAction({
      actionType: 'experience_update',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      details: `Обновление шкалы опыта: Макс. ур. ${updated.maxLevel}, Множитель x${updated.globalMultiplier}, Правил: ${updated.actionRules.length}, Уровней: ${updated.levelMilestones.length}, Статус: ${updated.isEnabled ? 'ВКЛ' : 'ВЫКЛ'}`,
      metadata: { maxLevel: updated.maxLevel, globalMultiplier: updated.globalMultiplier, isEnabled: updated.isEnabled }
    });
    res.json({ success: true, config: updated, message: 'Параметры шкалы опыта успешно сохранены!' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сохранения шкалы опыта';
    res.status(400).json({ error: msg });
  }
});

// Admin: Reset experience config to default factory settings
app.post('/api/admin/experience/reset', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const config = await experienceDb.resetToDefaults();
    await auditLogsDb.logAction({
      actionType: 'experience_update',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      details: 'Сброс параметров шкалы опыта и наград за действия к заводским значениям по умолчанию',
      metadata: { action: 'reset_defaults' }
    });
    res.json({ success: true, config, message: 'Шкала опыта и награды успешно сброшены к значениям по умолчанию.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сброса шкалы опыта';
    res.status(400).json({ error: msg });
  }
});

// ================= EVENTS & QUESTS SYSTEM APIS =================

// Public / Player Config (Master Toggles)
app.get('/api/events/config', async (req, res) => {
  res.json({ config: await eventsDb.getConfig() });
});

// Admin: Update Config & Master Toggles
app.post('/api/admin/events/config', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const updated = await eventsDb.updateConfig(req.body);
  res.json({ success: true, config: updated });
});

// Admin: Task Archive
app.get('/api/admin/tasks/archive', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const filterType = req.query.type as any;
  const tasks = await eventsDb.getAllArchiveTasks(filterType);
  res.json({ tasks });
});

// Admin: Save / Create / Update Task in Archive
app.post('/api/admin/tasks', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const isUpdate = !!req.body.id;
    const task = await eventsDb.saveTask(req.body);
    await auditLogsDb.logAction({
      actionType: isUpdate ? 'task_update' : 'task_create',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: task.id,
      targetName: task.title,
      details: `${isUpdate ? 'Обновлена' : 'Создана'} задача «${task.title}» (Тип: ${task.type}, Цель: ${task.targetType} x${task.targetCount})`,
      metadata: { taskId: task.id, type: task.type, targetType: task.targetType, targetCount: task.targetCount }
    });
    res.json({ success: true, task });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сохранения задачи';
    res.status(400).json({ error: msg });
  }
});

// Admin: Clone Task in Archive
app.post('/api/admin/tasks/:id/clone', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const cloned = await eventsDb.cloneTask(req.params.id);
  if (!cloned) return res.status(404).json({ error: 'Задача не найдена' });
  await auditLogsDb.logAction({
    actionType: 'task_create',
    adminId: admin.id,
    adminEmail: admin.email,
    adminName: admin.displayName,
    targetId: cloned.id,
    targetName: cloned.title,
    details: `Клонирована задача «${cloned.title}» из #${req.params.id}`,
    metadata: { sourceTaskId: req.params.id, newTaskId: cloned.id }
  });
  res.json({ success: true, task: cloned });
});

// Admin: Delete Task in Archive
app.delete('/api/admin/tasks/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const ok = await eventsDb.deleteTask(req.params.id);
  if (ok) {
    await auditLogsDb.logAction({
      actionType: 'task_delete',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: req.params.id,
      targetName: `Задача #${req.params.id}`,
      details: `Удалена задача архива #${req.params.id}`,
      metadata: { taskId: req.params.id }
    });
  }
  res.json({ success: ok });
});

// Admin: Events list
app.get('/api/admin/events', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const events = await eventsDb.getAllEvents();
  res.json({ events });
});

// Admin: Save / Create / Update Event
app.post('/api/admin/events', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const isUpdate = !!req.body.id;
    const event = await eventsDb.saveEvent(req.body);
    await auditLogsDb.logAction({
      actionType: isUpdate ? 'event_update' : 'event_create',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: event.id,
      targetName: event.title,
      details: `${isUpdate ? 'Обновлен' : 'Создан'} ивент «${event.title}» (${event.type}, статус: ${event.status})`,
      metadata: { eventId: event.id, title: event.title, type: event.type, status: event.status, startsAt: event.startsAt, endsAt: event.endsAt }
    });
    res.json({ success: true, event });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сохранения ивента';
    res.status(400).json({ error: msg });
  }
});

// Admin: Delete Event
app.delete('/api/admin/events/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const ok = await eventsDb.deleteEvent(req.params.id);
  if (ok) {
    await auditLogsDb.logAction({
      actionType: 'event_delete',
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.displayName,
      targetId: req.params.id,
      targetName: `Ивент #${req.params.id}`,
      details: `Удален ивент #${req.params.id}`,
      metadata: { eventId: req.params.id }
    });
  }
  res.json({ success: ok });
});

// Player: Get All Available Tasks by 4 Categories + Active Events
app.get('/api/tasks/player', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  const user = token ? await userDb.getUserByToken(token) : null;
  const userId = user?.id;

  const config = await eventsDb.getConfig();
  const globalTasks = await eventsDb.getGlobalTasks(userId);
  const onboardingTasks = await eventsDb.getOnboardingTasks(userId);
  const personalState = userId ? await eventsDb.getPersonalTasksState(userId) : null;
  const clanTasks = userId ? await eventsDb.getClanTasks(userId) : [];
  const clanEventStatus = user?.clanId ? await eventsDb.getClanEventStatus(user.clanId, userId) : null;
  const allEvents = await eventsDb.getAllEvents();
  const activeEvents = allEvents.filter(e => e.status === 'active');

  res.json({
    config,
    global: globalTasks,
    onboarding: onboardingTasks,
    personal: personalState,
    clan: {
      tasks: clanTasks,
      status: clanEventStatus
    },
    activeEvents
  });
});

// Player: Claim Task Reward
app.post('/api/tasks/:id/claim', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Сессия недействительна' });

  try {
    const result = await eventsDb.claimTaskReward(user.id, req.params.id);
    const updatedUser = await userDb.getUserById(user.id);
    res.json({ ...result, user: updatedUser });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка получения награды';
    res.status(400).json({ error: msg });
  }
});

// Player: Reroll Personal Daily Task
app.post('/api/tasks/personal/:id/reroll', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Сессия недействительна' });

  try {
    const result = await eventsDb.rerollPersonalTask(user.id, req.params.id);
    const updatedUser = await userDb.getUserById(user.id);
    res.json({ ...result, user: updatedUser });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при замене задачи';
    res.status(400).json({ error: msg });
  }
});

// Player: Claim Clan Milestone Prize (WoT Blitz Style)
app.post('/api/clan-event/milestone/claim', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = await userDb.getUserByToken(token);
  if (!user || !user.clanId) return res.status(400).json({ error: 'Вы не состоите в клане' });

  const stage = Number(req.body.stage);
  if (!stage) return res.status(400).json({ error: 'Укажите номер этапа' });

  try {
    const result = await eventsDb.claimClanMilestone(user.clanId, user.id, stage);
    const updatedUser = await userDb.getUserById(user.id);
    const updatedClanStatus = await eventsDb.getClanEventStatus(user.clanId, user.id);
    res.json({ ...result, user: updatedUser, clanStatus: updatedClanStatus });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка получения награды за этап';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

app.get('/api/rooms', (req, res) => {
  res.json({ rooms: roomManager.getPublicRooms() });
});

// LOBBY STATS & CHAT (backed by SQLite lobby_chat table)
interface LobbyChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

app.get('/api/lobby/stats', (req, res) => {
  const rooms = roomManager.getPublicRooms();
  let inLobby = 0;
  let inGame = 0;

  rooms.forEach(r => {
    if (r.inGame) {
      inGame += r.playerCount;
    } else {
      inLobby += r.playerCount;
    }
  });

  // Include connected clients
  inLobby = Math.max(inLobby, wss.clients.size);

  res.json({ inLobby, inGame });
});

app.get('/api/lobby/chat', async (req, res) => {
  try {
    const resRows = await sqliteDb.execute(`
      SELECT id, sender_id as senderId, sender_name as senderName, text, created_at as timestamp
      FROM lobby_chat
      ORDER BY created_at ASC
      LIMIT 100
    `);
    res.json({ messages: resRows.rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения сообщений лобби' });
  }
});

app.post('/api/lobby/chat', async (req, res) => {
  const { senderId, senderName, text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Текст сообщения не может быть пустым' });
  }

  const msg: LobbyChatMessage = {
    id: 'msg_' + Math.random().toString(36).substring(2, 9),
    senderId: senderId || 'anon',
    senderName: senderName || 'Гость',
    text: text.trim().slice(0, 200),
    timestamp: Date.now()
  };

  try {
    await sqliteDb.batch([
      {
        sql: `
          INSERT INTO lobby_chat (id, sender_id, sender_name, text, created_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        args: [msg.id, msg.senderId, msg.senderName, msg.text, msg.timestamp]
      },
      {
        sql: `
          DELETE FROM lobby_chat
          WHERE id NOT IN (
            SELECT id FROM lobby_chat ORDER BY created_at DESC LIMIT 200
          )
        `
      }
    ]);
  } catch (err) {
    console.error('[LibSQL] Error inserting lobby chat message:', err);
  }

  // Broadcast to all connected WebSockets
  const payload = JSON.stringify({ type: 'LOBBY_CHAT', payload: msg });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });

  res.json({ message: msg });
});

app.post('/api/rooms', (req, res) => {
  const { hostId, hostName, roomName, settings } = req.body;
  if (!hostId || !hostName) {
    return res.status(400).json({ error: 'hostId and hostName are required' });
  }
  const room = roomManager.createRoom(roomName || `Комната ${hostName}`, hostId, hostName, settings);
  res.json({ roomCode: room.state.roomCode });
});

// WebSocket Handling
wss.on('connection', (ws: WebSocket) => {
  let currentRoomCode: string | null = null;
  let currentPlayerId: string | null = null;

  ws.on('message', async (raw: string) => {
    try {
      const data = JSON.parse(raw.toString());
      const { type, payload } = data;

      switch (type) {
        case 'INIT_USER': {
          const { userId } = payload || {};
          if (userId) {
            currentPlayerId = userId;
            trackUserSocket(userId, ws);
          }
          break;
        }

        case 'JOIN_ROOM': {
          const { roomCode, playerId, playerName } = payload;
          if (playerId) {
            currentPlayerId = playerId;
            trackUserSocket(playerId, ws);
          }
          const code = roomCode.toUpperCase().trim();
          let room = roomManager.getRoom(code);

          if (!room) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { message: `Комната ${code} не найдена` }
            }));
            return;
          }

          currentRoomCode = code;
          currentPlayerId = playerId;

          const userRec = await userDb.getUserById(playerId);

          // Check if player is already in room (reconnect)
          let existingPlayer = room.state.players.find(p => p.id === playerId);
          let existingSpectator = room.spectators.get(playerId);

          if (payload.asSpectator === true) {
            // Explicitly requested spectator mode
            if (existingPlayer) {
              room.becomeSpectatorFromPlayer(playerId);
            } else if (!existingSpectator) {
              room.addSpectator({
                id: playerId,
                name: playerName || 'Зритель',
                avatarSeed: playerName || 'Зритель',
                clanTag: userRec?.clanTag || null,
                clanName: userRec?.clanName || null,
                joinedAt: Date.now()
              });
            } else {
              existingSpectator.name = playerName || existingSpectator.name;
              if (userRec) {
                existingSpectator.clanTag = userRec.clanTag || null;
                existingSpectator.clanName = userRec.clanName || null;
              }
            }
          } else if (existingPlayer) {
            existingPlayer.connected = true;
            existingPlayer.name = playerName || existingPlayer.name;
            if (userRec) {
              existingPlayer.clanTag = userRec.clanTag || null;
              existingPlayer.clanName = userRec.clanName || null;
            }
          } else if (existingSpectator) {
            existingSpectator.name = playerName || existingSpectator.name;
            if (userRec) {
              existingSpectator.clanTag = userRec.clanTag || null;
              existingSpectator.clanName = userRec.clanName || null;
            }
          } else {
            // New participant joining
            // If game is in progress OR room is full, join as Spectator
            const shouldSpectate = room.state.phase !== 'LOBBY' || room.state.players.length >= room.state.settings.maxPlayers;

            if (shouldSpectate) {
              room.addSpectator({
                id: playerId,
                name: playerName || 'Зритель',
                avatarSeed: playerName || 'Зритель',
                clanTag: userRec?.clanTag || null,
                clanName: userRec?.clanName || null,
                joinedAt: Date.now()
              });
            } else {
              room.state.players.push({
                id: playerId,
                name: playerName,
                avatarSeed: playerName,
                isHost: false,
                isBot: false,
                isAlive: true,
                connected: true,
                ready: true,
                warningsCount: 0,
                clanTag: userRec?.clanTag || null,
                clanName: userRec?.clanName || null
              });
              room.addChatMessage('system', `Игрок ${playerName} вошёл в игру.`, 'system');
            }
          }

          room.sockets.set(playerId, ws);

          // Send current state and chat history
          ws.send(JSON.stringify({
            type: 'ROOM_STATE',
            payload: room.getClientState(playerId)
          }));
          room.broadcastChat();
          room.broadcastState();
          break;
        }

        case 'LEAVE_ROOM': {
          if (currentRoomCode && currentPlayerId) {
            const room = roomManager.getRoom(currentRoomCode);
            if (room) {
              const leavingId = currentPlayerId;
              room.sockets.delete(leavingId);
              if (room.isSpectator(leavingId)) {
                room.removeSpectator(leavingId);
              } else {
                room.removePlayer(leavingId);
              }
              const leaveMsg = JSON.stringify({
                type: 'SIGNAL_PEER_LEFT',
                payload: { peerId: leavingId }
              });
              room.sockets.forEach((targetWs) => {
                if (targetWs.readyState === WebSocket.OPEN) {
                  targetWs.send(leaveMsg);
                }
              });
            }
          }
          currentRoomCode = null;
          currentPlayerId = null;
          break;
        }

        case 'JOIN_AS_PLAYER': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            const success = room.becomePlayerFromSpectator(currentPlayerId, payload.playerName);
            if (!success) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Не удалось занять место за столом (мест нет или игра уже идёт).' }
              }));
            }
          }
          break;
        }

        case 'SWITCH_TO_SPECTATOR':
        case 'BECOME_SPECTATOR': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            const success = room.becomeSpectatorFromPlayer(currentPlayerId);
            if (!success) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Переход в зрители возможен только в лобби до старта игры.' }
              }));
            }
          }
          break;
        }

        case 'START_GAME': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            const success = room.startGame(currentPlayerId);
            if (!success) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Для старта игры необходимо минимум 4 игрока.' }
              }));
            }
          }
          break;
        }

        case 'STOP_GAME':
        case 'RESTART_GAME': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            room.restartGame(currentPlayerId);
          }
          break;
        }

        case 'ADD_BOT': {
          if (!currentRoomCode) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            room.addBot();
          }
          break;
        }

        case 'REMOVE_BOT': {
          if (!currentRoomCode) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && payload.botId) {
            room.removePlayer(payload.botId);
          }
          break;
        }

        case 'UPDATE_SETTINGS': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && room.state.hostId === currentPlayerId) {
            room.state.settings = { ...room.state.settings, ...payload.settings };
            room.broadcastState();
          }
          break;
        }

        case 'NOMINATE_PLAYER': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && !room.isSpectator(currentPlayerId)) {
            room.nominatePlayer(payload.nomineeId, currentPlayerId);
          }
          break;
        }

        case 'CAST_VOTE': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && !room.isSpectator(currentPlayerId)) {
            room.castVote(currentPlayerId, payload.targetId);
          }
          break;
        }

        case 'SUBMIT_NIGHT_ACTION': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && !room.isSpectator(currentPlayerId)) {
            room.submitNightAction(currentPlayerId, payload.actionType, payload.targetId);
          }
          break;
        }

        case 'SKIP_PHASE': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && !room.isSpectator(currentPlayerId)) {
            room.skipPhase(currentPlayerId);
          }
          break;
        }

        case 'SEND_CHAT': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && payload.text) {
            room.addChatMessage(currentPlayerId, payload.text, payload.channel || 'all');
          }
          break;
        }

        case 'SELECT_ROLE': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && payload.roleId && !room.isSpectator(currentPlayerId)) {
            const result = await room.selectPreferredRole(currentPlayerId, payload.roleId, payload.token);
            if (!result.success) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: result.message }
              }));
            }
          }
          break;
        }

        // WebRTC P2P Signaling
        case 'SIGNAL_READY': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            const msg = JSON.stringify({
              type: 'SIGNAL_PEER_READY',
              payload: {
                peerId: currentPlayerId,
                mediaState: payload?.mediaState || { isAudioEnabled: true, isVideoEnabled: true }
              }
            });
            room.sockets.forEach((targetWs, peerId) => {
              if (peerId !== currentPlayerId && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(msg);
              }
            });
          }
          break;
        }

        case 'SIGNAL_OFFER': {
          if (!currentRoomCode || !currentPlayerId) return;
          const { targetPeerId, sdp, callerMediaState } = payload || {};
          if (!targetPeerId || !sdp) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            const targetWs = room.sockets.get(targetPeerId);
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: 'SIGNAL_OFFER',
                payload: {
                  fromPeerId: currentPlayerId,
                  sdp,
                  callerMediaState
                }
              }));
            }
          }
          break;
        }

        case 'SIGNAL_ANSWER': {
          if (!currentRoomCode || !currentPlayerId) return;
          const { targetPeerId, sdp } = payload || {};
          if (!targetPeerId || !sdp) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            const targetWs = room.sockets.get(targetPeerId);
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: 'SIGNAL_ANSWER',
                payload: {
                  fromPeerId: currentPlayerId,
                  sdp
                }
              }));
            }
          }
          break;
        }

        case 'SIGNAL_ICE_CANDIDATE': {
          if (!currentRoomCode || !currentPlayerId) return;
          const { targetPeerId, candidate } = payload || {};
          if (!targetPeerId || !candidate) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            const targetWs = room.sockets.get(targetPeerId);
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: 'SIGNAL_ICE_CANDIDATE',
                payload: {
                  fromPeerId: currentPlayerId,
                  candidate
                }
              }));
            }
          }
          break;
        }

        case 'SIGNAL_MEDIA_STATE': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            const msg = JSON.stringify({
              type: 'SIGNAL_MEDIA_STATE',
              payload: {
                fromPeerId: currentPlayerId,
                isAudioEnabled: Boolean(payload?.isAudioEnabled),
                isVideoEnabled: Boolean(payload?.isVideoEnabled)
              }
            });
            room.sockets.forEach((targetWs, peerId) => {
              if (peerId !== currentPlayerId && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(msg);
              }
            });
          }
          break;
        }
      }
    } catch (e) {
      console.error('WebSocket message parsing error:', e);
    }
  });

  ws.on('close', () => {
    untrackUserSocket(currentPlayerId, ws);
    if (currentRoomCode && currentPlayerId) {
      const room = roomManager.getRoom(currentRoomCode);
      if (room) {
        room.sockets.delete(currentPlayerId);
        if (room.isSpectator(currentPlayerId)) {
          room.removeSpectator(currentPlayerId);
        } else {
          const player = room.state.players.find(p => p.id === currentPlayerId);
          if (player) {
            player.connected = false;
          }
        }
        const leaveMsg = JSON.stringify({
          type: 'SIGNAL_PEER_LEFT',
          payload: { peerId: currentPlayerId }
        });
        room.sockets.forEach((targetWs) => {
          if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(leaveMsg);
          }
        });
        room.broadcastState();
      }
    }
  });
});

// Vite middleware / production static serving
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Explicit static serving for PWA files & assets
app.use(express.static(path.resolve(__dirname, 'public'), { dotfiles: 'allow' }));

// Explicit PWA manifest routes
app.get('/manifest.webmanifest', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.sendFile(path.resolve(__dirname, 'public/manifest.webmanifest'));
});

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.sendFile(path.resolve(__dirname, 'public/manifest.json'));
});

// Explicit Android Digital Asset Links route for TWA / PWABuilder verification
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.sendFile(path.resolve(__dirname, 'public/.well-known/assetlinks.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  const swDist = path.resolve(__dirname, 'dist/sw.js');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(swDist)) {
    res.sendFile(swDist);
  } else {
    res.sendFile(path.resolve(__dirname, 'public/sw.js'));
  }
});

// Explicit Privacy Policy routes (/privacy and /privacy.html)
app.get(['/privacy', '/privacy.html'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const pubPrivacy = path.resolve(__dirname, 'public/privacy.html');
  if (fs.existsSync(pubPrivacy)) {
    return res.sendFile(pubPrivacy);
  }
  const distPrivacy = path.resolve(__dirname, 'dist/privacy.html');
  if (fs.existsSync(distPrivacy)) {
    return res.sendFile(distPrivacy);
  }
  res.status(404).send('Политика конфиденциальности не найдена');
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  await startupReadyPromise;

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
