import { getDatabase, sanitizeArgs } from './database';

export interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  createdAt: string;
  updatedAt: string;
}

export type MailHistoryStatus = 'sending' | 'smtp_accepted' | 'send_failed';

export interface MailHistoryEntry {
  id: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  templateId: string | null;
  status: MailHistoryStatus;
  errorMessage: string | null;
  sentByAdminId: string;
  sentByAdminEmail: string;
  sentAt: string;
}

export class MailDatabase {
  private get db() {
    return getDatabase();
  }

  public async ensureSeed(): Promise<void> {
    try {
      // Check if migration flag exists in system_migrations
      const migrationRes = await this.db.execute({
        sql: 'SELECT id FROM system_migrations WHERE id = ?',
        args: ['seed_mail_templates_v1']
      });

      if (migrationRes.rows.length > 0) {
        // Already seeded once. Never re-seed or duplicate templates!
        return;
      }

      const now = new Date().toISOString();
      const initialTemplates = [
        {
          id: 'tpl_test_01',
          name: 'Тестовое письмо',
          subject: 'Mafia Club — Тестовая проверка почтовой системы',
          bodyText: 'Здравствуйте!\n\nЭто тестовое письмо от администрации Mafia Club для проверки работы почтового модуля.\n\nС уважением,\nКоманда Mafia Club'
        },
        {
          id: 'tpl_welcome_02',
          name: 'Приветствие',
          subject: 'Mafia Club — Добро пожаловать в Город!',
          bodyText: 'Приветствуем тебя в Mafia Club!\n\nРады видеть тебя среди наших игроков. Присоединяйся к играм, собирай уникальные предметы и побеждай вместе с кланом.\n\nУдачи в Городе!'
        },
        {
          id: 'tpl_support_03',
          name: 'Ответ на обращение',
          subject: 'Mafia Club — Ответ службы поддержки',
          bodyText: 'Здравствуйте!\n\nМы получили ваше обращение в службу поддержки Mafia Club. Наша команда изучает вопрос и предоставит ответ в ближайшее время.\n\nСпасибо за обращение!'
        },
        {
          id: 'tpl_gratitude_04',
          name: 'Благодарность игроку',
          subject: 'Mafia Club — Благодарность за участие',
          bodyText: 'Здравствуйте!\n\nАдминистрация Mafia Club выражает вам искреннюю благодарность за активное участие в жизни проекта и вклад в развитие нашего игрового сообщества.\n\nЖелаем удачи в следующих партиях!'
        }
      ];

      for (const tpl of initialTemplates) {
        await this.db.execute({
          sql: `
            INSERT OR IGNORE INTO mail_templates (id, name, subject, body_text, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          args: sanitizeArgs([tpl.id, tpl.name, tpl.subject, tpl.bodyText, now, now])
        });
      }

      // Record migration flag
      await this.db.execute({
        sql: 'INSERT INTO system_migrations (id, applied_at, details) VALUES (?, ?, ?)',
        args: ['seed_mail_templates_v1', now, 'Seeded 4 initial mail templates']
      });

      console.log('[MailDb] ✅ Initial mail templates seeded successfully.');
    } catch (err) {
      console.error('[MailDb] Failed to seed initial mail templates:', err);
    }
  }

  public async getTemplates(): Promise<MailTemplate[]> {
    const res = await this.db.execute({
      sql: 'SELECT * FROM mail_templates ORDER BY updated_at DESC'
    });

    return res.rows.map(row => ({
      id: row.id as string,
      name: row.name as string,
      subject: row.subject as string,
      bodyText: row.body_text as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    }));
  }

  public async getTemplateById(id: string): Promise<MailTemplate | null> {
    const res = await this.db.execute({
      sql: 'SELECT * FROM mail_templates WHERE id = ?',
      args: [id]
    });

    const row = res.rows[0];
    if (!row) return null;

    return {
      id: row.id as string,
      name: row.name as string,
      subject: row.subject as string,
      bodyText: row.body_text as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    };
  }

  public async createTemplate(name: string, subject: string, bodyText: string): Promise<MailTemplate> {
    const cleanName = name.trim();
    const cleanSubject = subject.trim();
    const cleanBody = bodyText.trim();

    if (!cleanName || cleanName.length > 100) {
      throw new Error('Укажите название шаблона (не более 100 символов).');
    }
    if (!cleanSubject || cleanSubject.length > 200) {
      throw new Error('Укажите тему письма (не более 200 символов).');
    }
    if (!cleanBody || cleanBody.length > 10000) {
      throw new Error('Укажите текст письма (не более 10 000 символов).');
    }

    const id = 'tpl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    await this.db.execute({
      sql: `
        INSERT INTO mail_templates (id, name, subject, body_text, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([id, cleanName, cleanSubject, cleanBody, now, now])
    });

    return {
      id,
      name: cleanName,
      subject: cleanSubject,
      bodyText: cleanBody,
      createdAt: now,
      updatedAt: now
    };
  }

  public async updateTemplate(id: string, name: string, subject: string, bodyText: string): Promise<MailTemplate> {
    const cleanName = name.trim();
    const cleanSubject = subject.trim();
    const cleanBody = bodyText.trim();

    if (!cleanName || cleanName.length > 100) {
      throw new Error('Укажите название шаблона (не более 100 символов).');
    }
    if (!cleanSubject || cleanSubject.length > 200) {
      throw new Error('Укажите тему письма (не более 200 символов).');
    }
    if (!cleanBody || cleanBody.length > 10000) {
      throw new Error('Укажите текст письма (не более 10 000 символов).');
    }

    const existing = await this.getTemplateById(id);
    if (!existing) {
      throw new Error('Шаблон не найден.');
    }

    const now = new Date().toISOString();

    await this.db.execute({
      sql: `
        UPDATE mail_templates SET
          name = ?,
          subject = ?,
          body_text = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: sanitizeArgs([cleanName, cleanSubject, cleanBody, now, id])
    });

    return {
      id,
      name: cleanName,
      subject: cleanSubject,
      bodyText: cleanBody,
      createdAt: existing.createdAt,
      updatedAt: now
    };
  }

  public async deleteTemplate(id: string): Promise<void> {
    const existing = await this.getTemplateById(id);
    if (!existing) {
      throw new Error('Шаблон не найден.');
    }

    await this.db.execute({
      sql: 'DELETE FROM mail_templates WHERE id = ?',
      args: [id]
    });
  }

  public async checkAndRecordAdminMailRateLimit(adminId: string, maxLimit: number = 5, windowMinutes: number = 10): Promise<void> {
    const now = Date.now();
    const windowStart = now - windowMinutes * 60 * 1000;

    // Periodic cleanup older than 1 hour
    if (Math.random() < 0.2) {
      await this.db.execute({
        sql: 'DELETE FROM mail_admin_rate_limits WHERE sent_at < ?',
        args: [now - 60 * 60 * 1000]
      }).catch(() => {});
    }

    // Insert record first
    const recordId = 'mrl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    await this.db.execute({
      sql: 'INSERT INTO mail_admin_rate_limits (id, admin_id, sent_at) VALUES (?, ?, ?)',
      args: [recordId, adminId, now]
    });

    // Check rank of this insertion in window
    const countRes = await this.db.execute({
      sql: `SELECT COUNT(*) as rank FROM mail_admin_rate_limits 
            WHERE admin_id = ? AND sent_at >= ? 
            AND rowid <= (SELECT rowid FROM mail_admin_rate_limits WHERE id = ?)`,
      args: [adminId, windowStart, recordId]
    });
    const rank = Number(countRes.rows[0]?.rank || 0);

    if (rank > maxLimit) {
      throw new Error(`Превышен лимит отправки писем (не более ${maxLimit} писем за ${windowMinutes} минут). Пожалуйста, подождите.`);
    }
  }

  public async createHistoryEntry(data: {
    id: string;
    recipientEmail: string;
    subject: string;
    bodyText: string;
    templateId?: string | null;
    status: MailHistoryStatus;
    errorMessage?: string | null;
    sentByAdminId: string;
    sentByAdminEmail: string;
    sentAt: string;
  }): Promise<MailHistoryEntry> {
    await this.db.execute({
      sql: `
        INSERT INTO mail_history (
          id, recipient_email, subject, body_text, template_id, status, error_message, sent_by_admin_id, sent_by_admin_email, sent_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([
        data.id,
        data.recipientEmail.trim().toLowerCase(),
        data.subject.trim(),
        data.bodyText.trim(),
        data.templateId || null,
        data.status,
        data.errorMessage || null,
        data.sentByAdminId,
        data.sentByAdminEmail,
        data.sentAt
      ])
    });

    return {
      id: data.id,
      recipientEmail: data.recipientEmail.trim().toLowerCase(),
      subject: data.subject.trim(),
      bodyText: data.bodyText.trim(),
      templateId: data.templateId || null,
      status: data.status,
      errorMessage: data.errorMessage || null,
      sentByAdminId: data.sentByAdminId,
      sentByAdminEmail: data.sentByAdminEmail,
      sentAt: data.sentAt
    };
  }

  public async updateHistoryStatus(id: string, status: MailHistoryStatus, errorMessage?: string | null): Promise<void> {
    await this.db.execute({
      sql: 'UPDATE mail_history SET status = ?, error_message = ? WHERE id = ?',
      args: sanitizeArgs([status, errorMessage || null, id])
    });
  }

  public async getHistory(page: number = 1, limit: number = 10): Promise<{
    entries: MailHistoryEntry[];
    totalCount: number;
    totalPages: number;
    page: number;
    limit: number;
  }> {
    const validPage = Math.max(1, page);
    const validLimit = Math.min(50, Math.max(1, limit));
    const offset = (validPage - 1) * validLimit;

    const countRes = await this.db.execute('SELECT COUNT(*) as total FROM mail_history');
    const totalCount = Number(countRes.rows[0]?.total || 0);
    const totalPages = Math.ceil(totalCount / validLimit) || 1;

    const res = await this.db.execute({
      sql: 'SELECT * FROM mail_history ORDER BY sent_at DESC LIMIT ? OFFSET ?',
      args: [validLimit, offset]
    });

    const entries: MailHistoryEntry[] = res.rows.map(row => ({
      id: row.id as string,
      recipientEmail: row.recipient_email as string,
      subject: row.subject as string,
      bodyText: row.body_text as string,
      templateId: row.template_id as string | null,
      status: row.status as MailHistoryStatus,
      errorMessage: row.error_message as string | null,
      sentByAdminId: row.sent_by_admin_id as string,
      sentByAdminEmail: row.sent_by_admin_email as string,
      sentAt: row.sent_at as string
    }));

    return {
      entries,
      totalCount,
      totalPages,
      page: validPage,
      limit: validLimit
    };
  }
}

export const mailDb = new MailDatabase();
