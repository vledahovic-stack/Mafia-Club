import nodemailer from 'nodemailer';
import { mailDb, MailTransportType } from '../db/mail';

export interface MailerResult {
  sent: boolean;
  transport?: MailTransportType;
  messageId?: string;
  reason?: string;
  error?: string;
}

export interface SendMailOptions {
  toEmail: string;
  subject: string;
  html: string;
  text: string;
  transportOverride?: MailTransportType;
}

/**
 * Returns the effective Resend API key from environment variables.
 * Checks RESEND_API_KEY first, falls back to SMTP_PASS if it looks like a Resend key.
 */
export function getResendApiKey(): string {
  const directKey = (process.env.RESEND_API_KEY || '').trim();
  if (directKey && !directKey.includes('placeholder')) {
    return directKey;
  }
  const smtpPass = (process.env.SMTP_PASS || '').trim();
  if (smtpPass && smtpPass.startsWith('re_') && !smtpPass.includes('placeholder')) {
    return smtpPass;
  }
  return directKey || smtpPass;
}

/**
 * Checks whether Resend API (HTTPS) is properly configured with a real API key.
 */
export function isResendApiConfigured(): boolean {
  const key = getResendApiKey();
  return Boolean(key && key.startsWith('re_') && !key.includes('placeholder'));
}

/**
 * Checks whether SMTP parameters are set in the environment.
 */
export function isSmtpConfigured(): boolean {
  const pass = (process.env.SMTP_PASS || process.env.RESEND_API_KEY || '').trim();
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    pass &&
    !pass.includes('placeholder')
  );
}

/**
 * Normalizes From header from SMTP_FROM or default.
 */
export function getCleanFromHeader(): string {
  const rawFrom = (process.env.SMTP_FROM || 'Mafia Club <support@mafiaclub.org>').trim();
  return rawFrom.replace(/\\"/g, '"').replace(/^"/, '').replace(/"$/, '');
}

/**
 * Verifies SMTP connection credentials using Nodemailer with an 8-second timeout.
 */
export async function verifySmtpConnection(): Promise<{ success: boolean; error?: string }> {
  if (!isSmtpConfigured()) {
    return { success: false, error: 'SMTP_NOT_CONFIGURED' };
  }
  const pass = (process.env.SMTP_PASS || process.env.RESEND_API_KEY || '').trim();
  if (!pass || pass.includes('placeholder')) {
    return { success: false, error: 'SMTP_PASS_IS_PLACEHOLDER' };
  }
  try {
    const host = process.env.SMTP_HOST!;
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER || 'resend';

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      tls: {
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false'
      }
    });

    await transporter.verify();
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

/**
 * HTML escaper for safe insertion into email templates.
 */
export function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sends an email via official Resend REST API over HTTPS (port 443).
 * Ideal for hosting environments like Render Free where outbound SMTP ports (25, 465, 587) are blocked.
 */
export async function sendViaResendApi(options: {
  toEmail: string;
  subject: string;
  html: string;
  text: string;
}): Promise<MailerResult> {
  const cleanEmail = options.toEmail.trim().toLowerCase();
  const apiKey = getResendApiKey();

  if (!apiKey || !apiKey.startsWith('re_') || apiKey.includes('placeholder')) {
    console.warn(`[Mailer-ResendAPI] ⚠️ API-ключ Resend не настроен в .env для отправки на ${cleanEmail}`);
    return {
      sent: false,
      transport: 'resend_api',
      reason: 'RESEND_API_KEY_NOT_CONFIGURED',
      error: 'API-ключ Resend не настроен в переменных окружения (.env).'
    };
  }

  const from = getCleanFromHeader();

  try {
    const payload = {
      from,
      to: [cleanEmail],
      subject: options.subject,
      html: options.html,
      text: options.text
    };

    console.log(`[Mailer-ResendAPI] 🚀 Отправка письма через HTTPS Resend API на ${cleanEmail} (Тема: "${options.subject}")...`);

    // Strict 10-second timeout to avoid long hangs
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    let resData: any = null;
    try {
      resData = await response.json();
    } catch {
      resData = null;
    }

    if (!response.ok) {
      const errMsg = (resData && (resData.message || resData.error || resData.name)) || `HTTP ${response.status} ${response.statusText}`;
      console.error(`[Mailer-ResendAPI] ❌ Ошибка ответа Resend API (${response.status}):`, errMsg);
      return {
        sent: false,
        transport: 'resend_api',
        reason: 'RESEND_API_ERROR',
        error: `Resend API: ${errMsg}`
      };
    }

    const messageId = resData?.id || `resend_${Date.now()}`;
    console.log(`[Mailer-ResendAPI] ✅ Письмо успешно отправлено через Resend API на ${cleanEmail} (ID: ${messageId})`);

    return {
      sent: true,
      transport: 'resend_api',
      messageId
    };
  } catch (err: unknown) {
    const rawErrorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Mailer-ResendAPI] ❌ Сетевая ошибка при вызове Resend API на ${cleanEmail}:`, rawErrorMsg);

    const isTimeout = rawErrorMsg.includes('aborted') || rawErrorMsg.includes('timeout') || rawErrorMsg.includes('Timeout');
    const userFriendlyError = isTimeout
      ? 'Превышено время ожидания ответа от Resend API (10 сек).'
      : `Ошибка сетевого подключения к Resend API: ${rawErrorMsg}`;

    return {
      sent: false,
      transport: 'resend_api',
      reason: isTimeout ? 'RESEND_API_TIMEOUT' : 'RESEND_API_NETWORK_ERROR',
      error: userFriendlyError
    };
  }
}

/**
 * Sends an email via Nodemailer SMTP.
 * Suitable for environments permitting outbound TCP connections on ports 465/587.
 */
export async function sendViaSmtp(options: {
  toEmail: string;
  subject: string;
  html: string;
  text: string;
}): Promise<MailerResult> {
  const cleanEmail = options.toEmail.trim().toLowerCase();

  if (!isSmtpConfigured()) {
    console.warn(`[Mailer-SMTP] ⚠️ Почтовый сервер SMTP не настроен в .env для отправки на ${cleanEmail}`);
    return {
      sent: false,
      transport: 'smtp',
      reason: 'SMTP_NOT_CONFIGURED',
      error: 'Параметры SMTP не настроены в переменных окружения (.env).'
    };
  }

  try {
    const host = process.env.SMTP_HOST!;
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER!;
    const pass = (process.env.SMTP_PASS || process.env.RESEND_API_KEY || '').trim();
    const from = getCleanFromHeader();

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      tls: {
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false'
      }
    });

    console.log(`[Mailer-SMTP] 🚀 Отправка письма через SMTP (${host}:${port}) на ${cleanEmail}...`);

    const info = await transporter.sendMail({
      from,
      to: cleanEmail,
      subject: options.subject,
      text: options.text,
      html: options.html
    });

    console.log(`[Mailer-SMTP] ✅ Письмо успешно отправлено через SMTP на ${cleanEmail} (ID: ${info.messageId})`);

    return {
      sent: true,
      transport: 'smtp',
      messageId: info.messageId
    };
  } catch (err: unknown) {
    const rawErrorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Mailer-SMTP] ❌ Ошибка SMTP-отправки на ${cleanEmail}:`, rawErrorMsg);

    const isTimeout =
      rawErrorMsg.includes('Connection timeout') ||
      rawErrorMsg.includes('ETIMEDOUT') ||
      rawErrorMsg.includes('timeout') ||
      rawErrorMsg.includes('ECONNREFUSED');

    const friendlyError = isTimeout
      ? 'Таймаут подключения к SMTP-серверу (исходящие порты могут быть заблокированы хостингом). Рекомендуется переключиться на Resend API.'
      : `Ошибка SMTP: ${rawErrorMsg}`;

    return {
      sent: false,
      transport: 'smtp',
      reason: isTimeout ? 'SMTP_TIMEOUT' : 'SMTP_SEND_FAILED',
      error: friendlyError
    };
  }
}

/**
 * Unified dispatch router.
 * Reads the active transport from database ('resend_api' | 'smtp') or accepts an override.
 * Strictly avoids automatic failover/retry between transports to prevent duplicate sends.
 */
export async function sendUnifiedMail(options: SendMailOptions): Promise<MailerResult> {
  const chosenTransport: MailTransportType = options.transportOverride || await mailDb.getActiveTransport();

  console.log(`[Mailer] 📨 Выбран способ отправки: [${chosenTransport.toUpperCase()}] для адреса ${options.toEmail}`);

  if (chosenTransport === 'resend_api') {
    return await sendViaResendApi({
      toEmail: options.toEmail,
      subject: options.subject,
      html: options.html,
      text: options.text
    });
  } else {
    return await sendViaSmtp({
      toEmail: options.toEmail,
      subject: options.subject,
      html: options.html,
      text: options.text
    });
  }
}

/**
 * Password reset email template and dispatch.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  code: string,
  displayName?: string,
  transportOverride?: MailTransportType
): Promise<MailerResult> {
  const cleanEmail = toEmail.trim().toLowerCase();
  const name = displayName || 'Игрок';

  const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Код сброса пароля</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f1015; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e4e4e7;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f1015; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #181a22; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #2b170c 0%, #181a22 100%); padding: 30px 25px; text-align: center; border-bottom: 1px solid #3f2214;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #f97316; letter-spacing: 2px; text-transform: uppercase;">
                MAFIA CLUB
              </h1>
              <p style="margin: 6px 0 0; font-size: 13px; color: #a1a1aa; letter-spacing: 0.5px;">
                ГОРОД ЗАСЫПАЕТ
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 30px 30px 20px;">
              <h2 style="margin: 0 0 14px; font-size: 18px; color: #ffffff; font-weight: 600;">
                Восстановление доступа
              </h2>
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #d4d4d8;">
                Здравствуйте, <strong>${escapeHtml(name)}</strong>!<br>
                Мы получили запрос на сброс пароля для вашей учётной записи в Mafia Club. Используйте этот проверочный код в приложении:
              </p>

              <!-- Code Box -->
              <div style="background-color: #0d0e12; border: 2px dashed #ea580c; border-radius: 12px; padding: 20px; text-align: center; margin: 25px 0;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #fb923c; display: inline-block;">
                  ${code}
                </span>
                <p style="margin: 10px 0 0; font-size: 12px; color: #a1a1aa;">
                  Код действителен в течение <strong>15 минут</strong>
                </p>
              </div>

              <p style="margin: 0 0 15px; font-size: 13px; line-height: 1.5; color: #a1a1aa;">
                Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо. Ваш аккаунт остаётся в безопасности.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #121319; border-top: 1px solid #27272a; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #71717a;">
                Это автоматическое системное сообщение Mafia Club. Пожалуйста, не отвечайте на него.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const textContent = `MAFIA CLUB — Восстановление доступа\n\nЗдравствуйте, ${name}!\n\nВаш проверочный код для сброса пароля: ${code}\n\nКод действителен 15 минут.\nЕсли вы не запрашивали сброс пароля, проигнорируйте это письмо.`;

  return await sendUnifiedMail({
    toEmail: cleanEmail,
    subject: `Mafia Club — Код сброса пароля: ${code}`,
    html: htmlContent,
    text: textContent,
    transportOverride
  });
}

/**
 * System test email dispatch for diagnostics and admin verification.
 */
export async function sendSystemTestEmail(
  toEmail: string,
  transportOverride?: MailTransportType
): Promise<MailerResult> {
  const cleanEmail = toEmail.trim().toLowerCase();
  const activeTransport = transportOverride || await mailDb.getActiveTransport();
  const transportName = activeTransport === 'resend_api' ? 'Resend API (HTTPS)' : 'SMTP (Nodemailer)';

  const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Тестовое сообщение Mafia Club</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f1015; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #e4e4e7;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f1015; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #181a22; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
          <tr>
            <td style="background: linear-gradient(135deg, #2b170c 0%, #181a22 100%); padding: 30px 25px; text-align: center; border-bottom: 1px solid #3f2214;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #f97316; letter-spacing: 2px;">MAFIA CLUB</h1>
              <p style="margin: 6px 0 0; font-size: 13px; color: #a1a1aa;">ГОРОД ЗАСЫПАЕТ</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 14px; font-size: 18px; color: #ffffff;">Тестовая проверка почтовой системы</h2>
              <p style="margin: 0 0 15px; font-size: 14px; line-height: 1.6; color: #d4d4d8;">
                Почтовая система Mafia Club успешно настроена и функционирует в штатном режиме.
              </p>
              <div style="background-color: #0d0e12; border: 1px solid #3f2214; border-radius: 8px; padding: 15px; margin: 20px 0; font-size: 13px; color: #22c55e;">
                ✅ Способ отправки: <strong>${transportName}</strong><br>
                ✅ Статус: Сообщение успешно доставлено.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const textContent = `MAFIA CLUB — Проверка почтовой системы\n\nЗдравствуйте!\n\nПочтовая система Mafia Club успешно настроена.\nСпособ отправки: ${transportName}\nСтатус: Подключение и отправка функционируют штатно.`;

  return await sendUnifiedMail({
    toEmail: cleanEmail,
    subject: `Mafia Club — Тестовая проверка почтовой системы (${transportName})`,
    html: htmlContent,
    text: textContent,
    transportOverride: activeTransport
  });
}

/**
 * Custom email dispatch from admin panel.
 */
export async function sendCustomAdminEmail(
  toEmail: string,
  subject: string,
  bodyText: string,
  transportOverride?: MailTransportType
): Promise<MailerResult> {
  const cleanEmail = toEmail.trim().toLowerCase();
  const cleanSubject = (subject || '').trim();
  const cleanBodyText = (bodyText || '').trim();

  const escapedSubject = escapeHtml(cleanSubject);
  const escapedBodyHtml = escapeHtml(cleanBodyText).replace(/\r?\n/g, '<br>');

  const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedSubject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f1015; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e4e4e7;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f1015; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #181a22; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #2b170c 0%, #181a22 100%); padding: 30px 25px; text-align: center; border-bottom: 1px solid #3f2214;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #f97316; letter-spacing: 2px; text-transform: uppercase;">
                MAFIA CLUB
              </h1>
              <p style="margin: 6px 0 0; font-size: 13px; color: #a1a1aa; letter-spacing: 0.5px;">
                ГОРОД ЗАСЫПАЕТ
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 30px 30px 25px;">
              <div style="font-size: 15px; line-height: 1.7; color: #e4e4e7; font-weight: 400;">
                ${escapedBodyHtml}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #121319; border-top: 1px solid #27272a; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #71717a;">
                Это официальное сообщение от администрации Mafia Club.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return await sendUnifiedMail({
    toEmail: cleanEmail,
    subject: cleanSubject,
    html: htmlContent,
    text: cleanBodyText,
    transportOverride
  });
}
