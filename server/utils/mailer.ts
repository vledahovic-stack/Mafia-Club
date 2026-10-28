import nodemailer from 'nodemailer';

export interface MailerResult {
  sent: boolean;
  reason?: string;
  error?: string;
}

export function isSmtpConfigured(): boolean {
  const pass = (process.env.SMTP_PASS || process.env.RESEND_API_KEY || '').trim();
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    pass
  );
}

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

function getCleanFromHeader(): string {
  const rawFrom = (process.env.SMTP_FROM || 'Mafia Club <support@mafiaclub.org>').trim();
  return rawFrom.replace(/\\"/g, '"').replace(/^"/, '').replace(/"$/, '');
}

export async function sendPasswordResetEmail(
  toEmail: string,
  code: string,
  displayName?: string
): Promise<MailerResult> {
  const cleanEmail = toEmail.trim().toLowerCase();

  if (!isSmtpConfigured()) {
    console.warn(
      `[Mailer] ⚠️ Почтовый сервер SMTP не настроен в переменных окружения (.env). ` +
      `Письмо на ${cleanEmail} не может быть отправлено через интернет без SMTP_HOST, SMTP_USER, SMTP_PASS.`
    );
    console.log(`[Mailer] ℹ️ Запрос сброса пароля зарегистрирован для ${cleanEmail} (SMTP не подключен).`);
    return {
      sent: false,
      reason: 'SMTP_NOT_CONFIGURED'
    };
  }

  try {
    const host = process.env.SMTP_HOST!;
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER!;
    const pass = (process.env.SMTP_PASS || process.env.RESEND_API_KEY || '').trim();
    const from = getCleanFromHeader();

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false'
      }
    });

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
                Здравствуйте, <strong>${name}</strong>!<br>
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

    await transporter.sendMail({
      from,
      to: cleanEmail,
      subject: `Mafia Club — Код сброса пароля: ${code}`,
      text: textContent,
      html: htmlContent
    });

    console.log(`[Mailer] ✅ Письмо с кодом сброса пароля успешно отправлено на ${cleanEmail}`);
    return { sent: true };
  } catch (err: unknown) {
    const rawErrorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Mailer] ❌ Ошибка отправки письма на ${cleanEmail}:`, rawErrorMsg);
    return {
      sent: false,
      reason: 'SMTP_SEND_FAILED',
      error: 'Ошибка при отправке письма через почтовый сервер.'
    };
  }
}

export async function sendSystemTestEmail(
  toEmail: string
): Promise<MailerResult> {
  const cleanEmail = toEmail.trim().toLowerCase();

  if (!isSmtpConfigured()) {
    return {
      sent: false,
      reason: 'SMTP_NOT_CONFIGURED'
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
      tls: {
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false'
      }
    });

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
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #181a22; border: 1px solid #27272a; border-radius: 16px; overflow: hidden;">
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
                Почтовая система Mafia Club успешно настроена и подключена к Resend SMTP.
              </p>
              <div style="background-color: #0d0e12; border: 1px solid #3f2214; border-radius: 8px; padding: 15px; margin: 20px 0; font-size: 13px; color: #22c55e;">
                ✅ Статус: Подключение и отправка писем функционируют нормально.
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

    const textContent = `MAFIA CLUB — Проверка почтовой системы\n\nЗдравствуйте!\n\nПочтовая система Mafia Club успешно настроена и подключена к Resend SMTP.\nСтатус: Подключение и отправка функционируют штатно.`;

    await transporter.sendMail({
      from,
      to: cleanEmail,
      subject: `Mafia Club — Успешное подключение почтовой системы Resend`,
      text: textContent,
      html: htmlContent
    });

    console.log(`[Mailer] ✅ Контрольное тестовое письмо отправлено на ${cleanEmail}`);
    return { sent: true };
  } catch (err: unknown) {
    const rawErrorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Mailer] ❌ Ошибка отправки тестового письма на ${cleanEmail}:`, rawErrorMsg);
    return {
      sent: false,
      reason: 'SMTP_SEND_FAILED',
      error: rawErrorMsg
    };
  }
}

export function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendCustomAdminEmail(
  toEmail: string,
  subject: string,
  bodyText: string
): Promise<MailerResult> {
  const cleanEmail = toEmail.trim().toLowerCase();
  const cleanSubject = (subject || '').trim();
  const cleanBodyText = (bodyText || '').trim();

  if (!isSmtpConfigured()) {
    return {
      sent: false,
      reason: 'SMTP_NOT_CONFIGURED',
      error: 'Почтовый сервер SMTP не настроен в .env'
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
      tls: {
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false'
      }
    });

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

    await transporter.sendMail({
      from,
      to: cleanEmail,
      subject: cleanSubject,
      text: cleanBodyText,
      html: htmlContent
    });

    console.log(`[Mailer] ✅ Административное письмо успешно отправлено на ${cleanEmail}`);
    return { sent: true };
  } catch (err: unknown) {
    const rawErrorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Mailer] ❌ Ошибка отправки админ-письма на ${cleanEmail}:`, rawErrorMsg);
    return {
      sent: false,
      reason: 'SMTP_SEND_FAILED',
      error: 'Ошибка почтового сервера при отправке сообщения'
    };
  }
}
