import nodemailer from 'nodemailer';

export interface MailerResult {
  sent: boolean;
  reason?: string;
  error?: string;
  devCode?: string;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
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
    console.log(`[Mailer] 🔑 Проверочный код для ${cleanEmail}: [ ${code} ]`);
    return {
      sent: false,
      reason: 'SMTP_NOT_CONFIGURED',
      devCode: code
    };
  }

  try {
    const host = process.env.SMTP_HOST!;
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER!;
    const pass = process.env.SMTP_PASS!;
    const from = process.env.SMTP_FROM || `"Mafia Club" <${user}>`;

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
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Mailer] ❌ Ошибка отправки письма на ${cleanEmail}:`, errorMsg);
    return {
      sent: false,
      reason: 'SMTP_SEND_FAILED',
      error: errorMsg,
      devCode: code
    };
  }
}
