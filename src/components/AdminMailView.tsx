import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  FileText,
  History,
  Settings,
  Plus,
  Edit3,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  X,
  AlertTriangle,
  ArrowRight,
  Globe,
  Server,
  ShieldCheck
} from 'lucide-react';
import { sounds } from '../utils/audio';

export interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  createdAt: string;
  updatedAt: string;
}

export type MailHistoryStatus = 'sending' | 'smtp_accepted' | 'send_failed';

export type MailTransportType = 'resend_api' | 'smtp';

export interface MailConfig {
  transport: MailTransportType;
  updatedAt: string;
  updatedBy: string | null;
  isResendApiConfigured: boolean;
  isSmtpConfigured: boolean;
}

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
  transport?: MailTransportType | null;
}

interface AdminMailViewProps {
  token: string | null;
}

export const AdminMailView: React.FC<AdminMailViewProps> = ({ token }) => {
  const [activeSubTab, setActiveSubTab] = useState<'compose' | 'templates' | 'history' | 'settings'>('compose');

  // Templates State
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // History State
  const [historyEntries, setHistoryEntries] = useState<MailHistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<MailHistoryEntry | null>(null);

  // Compose State
  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [sendingMail, setSendingMail] = useState(false);
  const [composeNotice, setComposeNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSendConfirmModal, setShowSendConfirmModal] = useState(false);

  // Template Modal State (Create / Edit)
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MailTemplate | null>(null);
  const [tplFormName, setTplFormName] = useState('');
  const [tplFormSubject, setTplFormSubject] = useState('');
  const [tplFormBody, setTplFormBody] = useState('');
  const [tplFormError, setTplFormError] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Settings State
  const [mailConfig, setMailConfig] = useState<MailConfig | null>(null);
  const [selectedTransport, setSelectedTransport] = useState<MailTransportType>('smtp');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configNotice, setConfigNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testNotice, setTestNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load Mail Configuration
  const fetchConfig = async () => {
    if (!token) return;
    setLoadingConfig(true);
    try {
      const res = await fetch('/api/admin/mail/config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Не удалось загрузить настройки почты');
      const data = await res.json();
      setMailConfig(data);
      setSelectedTransport(data.transport || 'smtp');
    } catch (err: any) {
      console.error('Error fetching mail config:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  // Save Mail Configuration
  const handleSaveConfig = async () => {
    if (!token || savingConfig) return;
    setSavingConfig(true);
    setConfigNotice(null);
    try {
      const res = await fetch('/api/admin/mail/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ transport: selectedTransport })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка при сохранении конфигурации');
      sounds.playTick();
      setConfigNotice({
        type: 'success',
        message: data.message || `Способ отправки изменён на ${selectedTransport === 'resend_api' ? 'Resend API (HTTPS)' : 'SMTP'}`
      });
      if (mailConfig) {
        setMailConfig({
          ...mailConfig,
          transport: selectedTransport,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy
        });
      }
    } catch (err: any) {
      setConfigNotice({
        type: 'error',
        message: err.message || 'Не удалось сохранить настройки'
      });
    } finally {
      setSavingConfig(false);
    }
  };

  // Send Test Mail (with strict timeout)
  const handleSendTestMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || sendingTest) return;
    const clean = testEmail.trim();
    if (!clean) {
      setTestNotice({ type: 'error', message: 'Укажите email получателя для тестовой отправки' });
      return;
    }
    setSendingTest(true);
    setTestNotice(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch('/api/admin/mail/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ toEmail: clean, transport: selectedTransport }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка тестовой отправки');
      sounds.playTick();
      setTestNotice({
        type: 'success',
        message: data.message || `Тестовое письмо успешно отправлено на ${clean}`
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err.name === 'AbortError' || (err.message && err.message.includes('abort'));
      setTestNotice({
        type: 'error',
        message: isAbort ? 'Превышено время ожидания ответа сервера (12 сек).' : (err.message || 'Ошибка тестовой отправки')
      });
    } finally {
      setSendingTest(false);
    }
  };

  // Delete Template Confirmation Modal State
  const [deletingTemplate, setDeletingTemplate] = useState<MailTemplate | null>(null);
  const [deletingProcess, setDeletingProcess] = useState(false);

  // Load Templates
  const fetchTemplates = async () => {
    if (!token) return;
    setLoadingTemplates(true);
    try {
      const res = await fetch('/api/admin/mail/templates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Не удалось загрузить шаблоны писем');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err: any) {
      console.error('Error fetching mail templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Load History
  const fetchHistory = async (page: number = 1) => {
    if (!token) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/admin/mail/history?page=${page}&limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Не удалось загрузить историю почтовых отправок');
      const data = await res.json();
      setHistoryEntries(data.entries || []);
      setHistoryPage(data.page || 1);
      setHistoryTotalPages(data.totalPages || 1);
      setHistoryTotalCount(data.totalCount || 0);
    } catch (err: any) {
      console.error('Error fetching mail history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchConfig();
  }, [token]);

  useEffect(() => {
    if (activeSubTab === 'history') {
      fetchHistory(historyPage);
    } else if (activeSubTab === 'settings' || activeSubTab === 'compose') {
      fetchConfig();
    }
  }, [activeSubTab, historyPage, token]);

  // Handle Template Select in Compose Form
  const handleSelectTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    if (!tplId) return;
    const tpl = templates.find(t => t.id === tplId);
    if (tpl) {
      setSubject(tpl.subject);
      setBodyText(tpl.bodyText);
    }
  };

  // Handle Send Mail
  const handleConfirmSendMail = async () => {
    if (!token) return;
    setShowSendConfirmModal(false);
    setSendingMail(true);
    setComposeNotice(null);

    try {
      const res = await fetch('/api/admin/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim(),
          subject: subject.trim(),
          bodyText: bodyText.trim(),
          templateId: selectedTemplateId || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при отправке письма');
      }

      sounds.playTick();
      setComposeNotice({
        type: 'success',
        message: data.message || `Письмо успешно отправлено на адрес ${recipientEmail}`
      });

      // Clear compose fields
      setRecipientEmail('');
      setSubject('');
      setBodyText('');
      setSelectedTemplateId('');
    } catch (err: any) {
      setComposeNotice({
        type: 'error',
        message: err.message || 'Произошла ошибка при отправке письма'
      });
    } finally {
      setSendingMail(false);
    }
  };

  // Save Template (Create or Edit)
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setTplFormError(null);

    if (!tplFormName.trim()) {
      setTplFormError('Укажите название шаблона.');
      return;
    }
    if (!tplFormSubject.trim()) {
      setTplFormError('Укажите тему письма.');
      return;
    }
    if (!tplFormBody.trim()) {
      setTplFormError('Укажите текст письма.');
      return;
    }

    setSavingTemplate(true);
    try {
      const isEdit = Boolean(editingTemplate);
      const url = isEdit ? `/api/admin/mail/templates/${editingTemplate!.id}` : '/api/admin/mail/templates';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: tplFormName.trim(),
          subject: tplFormSubject.trim(),
          bodyText: tplFormBody.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при сохранении шаблона');
      }

      sounds.playTick();
      setShowTemplateModal(false);
      fetchTemplates();
    } catch (err: any) {
      setTplFormError(err.message || 'Ошибка сохранения шаблона');
    } finally {
      setSavingTemplate(false);
    }
  };

  // Open Edit Template Modal
  const handleOpenEditTemplate = (tpl: MailTemplate) => {
    setEditingTemplate(tpl);
    setTplFormName(tpl.name);
    setTplFormSubject(tpl.subject);
    setTplFormBody(tpl.bodyText);
    setTplFormError(null);
    setShowTemplateModal(true);
  };

  // Open Create Template Modal
  const handleOpenCreateTemplate = () => {
    setEditingTemplate(null);
    setTplFormName('');
    setTplFormSubject('');
    setTplFormBody('');
    setTplFormError(null);
    setShowTemplateModal(true);
  };

  // Delete Template
  const handleConfirmDeleteTemplate = async () => {
    if (!deletingTemplate || !token) return;
    setDeletingProcess(true);
    try {
      const res = await fetch(`/api/admin/mail/templates/${deletingTemplate.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка при удалении шаблона');
      }
      sounds.playTick();
      setDeletingTemplate(null);
      fetchTemplates();
    } catch (err: any) {
      alert(err.message || 'Не удалось удалить шаблон');
    } finally {
      setDeletingProcess(false);
    }
  };

  // Use Template in Compose
  const handleUseTemplate = (tpl: MailTemplate) => {
    setSelectedTemplateId(tpl.id);
    setSubject(tpl.subject);
    setBodyText(tpl.bodyText);
    setActiveSubTab('compose');
  };

  // Render Status Badge
  const renderStatusBadge = (status: MailHistoryStatus) => {
    switch (status) {
      case 'smtp_accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Принято SMTP-сервером
          </span>
        );
      case 'sending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/60 text-amber-400 border border-amber-800/60">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            Отправляется...
          </span>
        );
      case 'send_failed':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-950/60 text-rose-400 border border-rose-800/60">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            Ошибка отправки
          </span>
        );
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-4">
      {/* Sub-navigation Tabs Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 border-b border-zinc-800/80 pb-2.5 sm:pb-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 tracking-wide">
            <Mail className="w-5 h-5 text-orange-500" />
            <span>Управление почтой</span>
          </h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Отправка административных писем, управление библиотекой шаблонов и история отправок.
          </p>
        </div>

        {/* Sub-tabs switcher buttons */}
        <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800/80 self-stretch sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab('compose')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'compose'
                ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Написать</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('templates')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'templates'
                ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Шаблоны ({templates.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('history')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'history'
                ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>История</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('settings')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'settings'
                ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Настройки</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: COMPOSE MAIL */}
      {activeSubTab === 'compose' && (
        <div className="space-y-3.5">
          {composeNotice && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs animate-in fade-in duration-200 ${
                composeNotice.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
              }`}
            >
              {composeNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              )}
              <div className="flex-1 font-medium">{composeNotice.message}</div>
              <button
                type="button"
                onClick={() => setComposeNotice(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            {/* Form Column */}
            <div className="lg:col-span-8 bg-[#181a22] border border-zinc-800/80 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xl flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Новое сообщение
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                    Отправитель: Mafia Club &lt;support@mafiaclub.org&gt;
                  </span>
                  {mailConfig && (
                    <span
                      title="Активный способ отправки писем. Можно изменить во вкладке «Настройки»."
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                        mailConfig.transport === 'resend_api'
                          ? 'bg-indigo-950/70 text-indigo-300 border-indigo-800/60'
                          : 'bg-amber-950/70 text-amber-300 border-amber-800/60'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${mailConfig.transport === 'resend_api' ? 'bg-indigo-400' : 'bg-amber-400'}`} />
                      {mailConfig.transport === 'resend_api' ? 'Resend API' : 'SMTP'}
                    </span>
                  )}
                </div>
              </div>

              {/* Row 1: 2-Column Grid (Email + Template Selector) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Recipient Email */}
                <div>
                  <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                    Email получателя <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={recipientEmail}
                    onChange={e => setRecipientEmail(e.target.value)}
                    placeholder="player@example.com"
                    className="w-full bg-[#121319] border border-zinc-800 text-white rounded-lg px-3 py-1.5 sm:py-2 text-xs focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>

                {/* Saved Template Selector */}
                <div>
                  <label className="text-[11px] font-medium text-zinc-300 flex items-center justify-between mb-1">
                    <span>Выберите шаблон (опционально)</span>
                    {selectedTemplateId && (
                      <button
                        type="button"
                        onClick={() => setSelectedTemplateId('')}
                        className="text-[10px] text-zinc-400 hover:text-orange-400 underline cursor-pointer"
                      >
                        Сбросить
                      </button>
                    )}
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={e => handleSelectTemplate(e.target.value)}
                    className="w-full bg-[#121319] border border-zinc-800 text-white rounded-lg px-3 py-1.5 sm:py-2 text-xs focus:outline-none focus:border-orange-500 cursor-pointer"
                  >
                    <option value="">-- Написать вручную --</option>
                    {templates.map(tpl => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} — ({tpl.subject})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject Input */}
              <div>
                <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                  Тема письма <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Тема сообщения..."
                  className="w-full bg-[#121319] border border-zinc-800 text-white rounded-lg px-3 py-1.5 sm:py-2 text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Body Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-zinc-300">
                    Текст письма <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {bodyText.length} / 10000
                  </span>
                </div>
                <textarea
                  required
                  rows={4}
                  maxLength={10000}
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  placeholder="Введите текст сообщения..."
                  className="w-full bg-[#121319] border border-zinc-800 text-white rounded-lg p-3 text-xs focus:outline-none focus:border-orange-500 font-sans leading-relaxed min-h-[80px] max-h-[160px] overflow-y-auto resize-y"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(true)}
                  disabled={!subject.trim() && !bodyText.trim()}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>Предпросмотр</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!recipientEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
                      setComposeNotice({ type: 'error', message: 'Укажите корректный email получателя.' });
                      return;
                    }
                    if (!subject.trim()) {
                      setComposeNotice({ type: 'error', message: 'Укажите тему письма.' });
                      return;
                    }
                    if (!bodyText.trim()) {
                      setComposeNotice({ type: 'error', message: 'Укажите текст письма.' });
                      return;
                    }
                    setShowSendConfirmModal(true);
                  }}
                  disabled={sendingMail}
                  className="w-full sm:w-auto px-5 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold transition-all shadow-md shadow-orange-950/40 flex items-center justify-center gap-2 min-w-[150px] cursor-pointer"
                >
                  {sendingMail ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Отправить письмо</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Preview Sidebar */}
            <div className="lg:col-span-4 bg-[#181a22] border border-zinc-800/80 rounded-2xl p-3.5 space-y-3 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-amber-500" />
                  Быстрый макет письма
                </h3>

                {/* Branded Mail Preview Card */}
                <div className="bg-[#0f1015] border border-zinc-800 rounded-xl overflow-hidden shadow-inner text-xs">
                  <div className="bg-gradient-to-r from-[#2b170c] to-[#181a22] p-2.5 text-center border-b border-[#3f2214]">
                    <span className="font-extrabold text-orange-500 tracking-widest uppercase text-xs">
                      MAFIA CLUB
                    </span>
                    <p className="text-[9px] text-zinc-500 mt-0.5">ГОРОД ЗАСЫПАЕТ</p>
                  </div>
                  <div className="p-3 space-y-1.5">
                    <div className="font-semibold text-white text-xs border-b border-zinc-800/80 pb-1.5 truncate">
                      {subject.trim() || <span className="text-zinc-600 italic">Тема письма...</span>}
                    </div>
                    <div className="text-zinc-300 text-[10px] leading-relaxed whitespace-pre-wrap pt-0.5 max-h-[120px] overflow-y-auto">
                      {bodyText.trim() || <span className="text-zinc-600 italic">Текст сообщения...</span>}
                    </div>
                  </div>
                  <div className="bg-[#121319] p-1.5 text-center text-[9px] text-zinc-600 border-t border-zinc-800/80">
                    Официальное письмо от администрации Mafia Club
                  </div>
                </div>
              </div>

              <div className="bg-amber-950/20 border border-amber-900/40 p-2.5 rounded-xl text-[10px] text-amber-300/80 space-y-0.5">
                <div className="font-bold flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Правила рассылки:</span>
                </div>
                <p>Лимит отправки: не более 5 писем за 10 минут. Текст будет безопасно экранирован.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: TEMPLATES LIBRARY */}
      {activeSubTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400">
              Сохранённые шаблоны для быстрых ответов и регулярных системных писем.
            </p>
            <button
              type="button"
              onClick={handleOpenCreateTemplate}
              className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Создать шаблон</span>
            </button>
          </div>

          {loadingTemplates ? (
            <div className="py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-500 mb-2" />
              <p className="text-xs text-zinc-400">Загрузка библиотеки шаблонов...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center bg-[#181a22] border border-zinc-800/80 rounded-2xl">
              <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-300 font-bold mb-1">Шаблоны отсутствуют</p>
              <p className="text-xs text-zinc-500 mb-4">Создайте первый шаблон для быстрых ответов клиентам.</p>
              <button
                type="button"
                onClick={handleOpenCreateTemplate}
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold cursor-pointer"
              >
                Создать шаблон
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map(tpl => (
                <div
                  key={tpl.id}
                  className="bg-[#181a22] border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-zinc-700/80 transition-all shadow-lg"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-orange-500 shrink-0" />
                        <span>{tpl.name}</span>
                      </h3>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(tpl.updatedAt).toLocaleDateString('ru-RU')}
                      </span>
                    </div>

                    <div className="text-xs text-amber-400 font-medium truncate">
                      Тема: {tpl.subject}
                    </div>

                    <p className="text-xs text-zinc-400 line-clamp-3 whitespace-pre-wrap font-sans bg-[#121319] p-2.5 rounded-xl border border-zinc-800/60">
                      {tpl.bodyText}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditTemplate(tpl)}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Изменить</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingTemplate(tpl)}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950/60 text-zinc-300 hover:text-rose-400 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Удалить</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleUseTemplate(tpl)}
                      className="px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/40 font-bold flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <span>Использовать</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: HISTORY JOURNAL */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400">
              Журнал административных писем. Сохраняет точную версию текста на момент отправки.
            </p>
            <button
              type="button"
              onClick={() => fetchHistory(historyPage)}
              disabled={loadingHistory}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
              <span>Обновить</span>
            </button>
          </div>

          {loadingHistory ? (
            <div className="py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-500 mb-2" />
              <p className="text-xs text-zinc-400">Загрузка журнала отправок...</p>
            </div>
          ) : historyEntries.length === 0 ? (
            <div className="p-8 text-center bg-[#181a22] border border-zinc-800/80 rounded-2xl">
              <History className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-300 font-bold mb-1">История отправок пуста</p>
              <p className="text-xs text-zinc-500">
                После отправки первого административного письма запись появится в этом журнале.
              </p>
            </div>
          ) : (
            <div className="bg-[#181a22] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#121319] border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Дата и время</th>
                      <th className="py-3 px-4">Получатель</th>
                      <th className="py-3 px-4">Тема письма</th>
                      <th className="py-3 px-4">Способ</th>
                      <th className="py-3 px-4">Статус</th>
                      <th className="py-3 px-4 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {historyEntries.map(entry => (
                      <tr key={entry.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-zinc-400 whitespace-nowrap">
                          {new Date(entry.sentAt).toLocaleString('ru-RU')}
                        </td>
                        <td className="py-3 px-4 font-mono text-white font-medium whitespace-nowrap">
                          {entry.recipientEmail}
                        </td>
                        <td className="py-3 px-4 text-zinc-300 max-w-[220px] truncate">
                          {entry.subject}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {entry.transport === 'resend_api' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950/70 text-indigo-300 border border-indigo-800/60 font-mono">
                              Resend API
                            </span>
                          ) : entry.transport === 'smtp' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/70 text-amber-300 border border-amber-800/60 font-mono">
                              SMTP
                            </span>
                          ) : (
                            <span className="text-zinc-600 font-mono text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {renderStatusBadge(entry.status)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedHistoryEntry(entry)}
                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5 text-amber-400" />
                            <span>Детали</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              {historyTotalPages > 1 && (
                <div className="p-4 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400 bg-[#121319]">
                  <span>
                    Показано {(historyPage - 1) * 10 + 1} - {Math.min(historyPage * 10, historyTotalCount)} из {historyTotalCount} записей
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={historyPage <= 1}
                      onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-mono text-white font-bold">
                      {historyPage} / {historyTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={historyPage >= historyTotalPages}
                      onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 4: SETTINGS (Dual Transport: Resend API & SMTP) */}
      {activeSubTab === 'settings' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {configNotice && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs animate-in fade-in duration-200 ${
                configNotice.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
              }`}
            >
              {configNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              )}
              <div className="flex-1 font-medium">{configNotice.message}</div>
              <button
                type="button"
                onClick={() => setConfigNotice(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Transport Selection Card */}
          <div className="bg-[#181a22] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-orange-500" />
                  <span>Способ отправки писем</span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Выберите способ доставки для административных писем, кодов сброса пароля и системных сообщений.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {mailConfig?.updatedAt && (
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Обновлено: {new Date(mailConfig.updatedAt).toLocaleString('ru-RU')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={fetchConfig}
                  disabled={loadingConfig}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs cursor-pointer transition-colors"
                  title="Обновить статус"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingConfig ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Transport Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Option 1: Resend API (HTTPS) */}
              <div
                onClick={() => setSelectedTransport('resend_api')}
                className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                  selectedTransport === 'resend_api'
                    ? 'bg-gradient-to-br from-indigo-950/40 to-[#181a22] border-indigo-500/80 ring-1 ring-indigo-500/50 shadow-lg shadow-indigo-950/40'
                    : 'bg-[#121319] border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${selectedTransport === 'resend_api' ? 'bg-indigo-600/30 text-indigo-400' : 'bg-zinc-800 text-zinc-400'}`}>
                        <Globe className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                          <span>Resend API</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">HTTPS</span>
                        </h4>
                        <span className="text-[10px] text-zinc-400">Порт 443 (REST API)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {mailConfig?.isResendApiConfigured ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/70 text-emerald-400 border border-emerald-800/60">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          API-ключ настроен
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-950/70 text-rose-400 border border-rose-800/60">
                          <AlertCircle className="w-3 h-3 text-rose-400" />
                          API-ключ отсутствует
                        </span>
                      )}

                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        selectedTransport === 'resend_api'
                          ? 'border-indigo-500 bg-indigo-600'
                          : 'border-zinc-600'
                      }`}>
                        {selectedTransport === 'resend_api' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed mt-2">
                    Прямая отправка запросов через защищённый HTTPS REST API Resend.
                  </p>
                  <p className="text-[11px] text-amber-400/90 leading-relaxed mt-1 font-medium">
                    ⚡ Рекомендуется для бесплатного хостинга Render, где исходящие SMTP-порты (25, 465, 587) заблокированы платформой.
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                  <span>Таймаут: 10 сек</span>
                  <span>Лимит: 2 письма/сек</span>
                </div>
              </div>

              {/* Option 2: SMTP (Nodemailer) */}
              <div
                onClick={() => setSelectedTransport('smtp')}
                className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                  selectedTransport === 'smtp'
                    ? 'bg-gradient-to-br from-amber-950/30 to-[#181a22] border-amber-500/80 ring-1 ring-amber-500/50 shadow-lg shadow-amber-950/40'
                    : 'bg-[#121319] border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${selectedTransport === 'smtp' ? 'bg-amber-600/30 text-amber-400' : 'bg-zinc-800 text-zinc-400'}`}>
                        <Server className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                          <span>SMTP</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-900/60 text-amber-300 border border-amber-700/50">Nodemailer</span>
                        </h4>
                        <span className="text-[10px] text-zinc-400">Порты 465 / 587 (TCP)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {mailConfig?.isSmtpConfigured ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/70 text-emerald-400 border border-emerald-800/60">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          SMTP настроен
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-950/70 text-amber-400 border border-amber-800/60">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          SMTP настроен не полностью
                        </span>
                      )}

                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        selectedTransport === 'smtp'
                          ? 'border-amber-500 bg-amber-600'
                          : 'border-zinc-600'
                      }`}>
                        {selectedTransport === 'smtp' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed mt-2">
                    Традиционная отправка через почтовое соединение SMTP.
                  </p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed mt-1">
                    Подходит для локальной разработки (localhost), выделенных VPS/VDS серверов и хостингов с открытыми почтовыми портами.
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                  <span>Таймаут подключения: 8 сек</span>
                  <span>TLS: SSL/STARTTLS</span>
                </div>
              </div>
            </div>

            {/* Save Config Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-zinc-800/60">
              <div className="text-xs text-zinc-400">
                Текущий активный транспорт:{' '}
                <strong className="text-white font-mono">
                  {mailConfig?.transport === 'resend_api' ? 'Resend API (HTTPS)' : 'SMTP (Nodemailer)'}
                </strong>
                {selectedTransport !== mailConfig?.transport && (
                  <span className="text-amber-400 ml-2 font-medium">
                    (есть несохранённые изменения)
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={savingConfig || selectedTransport === mailConfig?.transport}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-40 text-white font-bold text-xs cursor-pointer shadow-lg shadow-orange-950/40 flex items-center justify-center gap-1.5 transition-all"
              >
                {savingConfig ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Сохранение...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Применить способ отправки</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Test Email Card */}
          <div className="bg-[#181a22] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3.5">
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-500" />
                <span>Проверочная отправка тестового письма</span>
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Отправьте одно проверочное сообщение на свой email для проверки работоспособности выбранного способа ({selectedTransport === 'resend_api' ? 'Resend API' : 'SMTP'}).
              </p>
            </div>

            {testNotice && (
              <div
                className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs animate-in fade-in duration-200 ${
                  testNotice.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                }`}
              >
                {testNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                )}
                <div className="flex-1 font-medium">{testNotice.message}</div>
                <button
                  type="button"
                  onClick={() => setTestNotice(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <form onSubmit={handleSendTestMail} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                type="email"
                required
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="flex-1 bg-[#121319] border border-zinc-800 text-white rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-orange-500 font-mono"
              />

              <button
                type="submit"
                disabled={sendingTest}
                className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
              >
                {sendingTest ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Отправка теста...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 text-orange-400" />
                    <span>Отправить тестовое письмо</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: PREVIEW MAIL */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[#181a22] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#121319]">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-500" />
                <span>Предпросмотр письма получателю</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="text-xs space-y-1 bg-[#121319] p-3 rounded-xl border border-zinc-800/80">
                <div><span className="text-zinc-500">От кого:</span> <span className="text-white font-medium">Mafia Club &lt;support@mafiaclub.org&gt;</span></div>
                <div><span className="text-zinc-500">Кому:</span> <span className="text-amber-400 font-mono font-medium">{recipientEmail || 'player@example.com'}</span></div>
                <div><span className="text-zinc-500">Тема:</span> <span className="text-white font-bold">{subject || '(Без темы)'}</span></div>
              </div>

              {/* Exact Styled Email Render */}
              <div className="bg-[#0f1015] border border-zinc-800 rounded-2xl overflow-hidden shadow-inner text-sm">
                <div className="bg-gradient-to-r from-[#2b170c] to-[#181a22] p-5 text-center border-b border-[#3f2214]">
                  <h1 className="margin-0 text-xl font-extrabold text-orange-500 tracking-widest uppercase">
                    MAFIA CLUB
                  </h1>
                  <p className="text-xs text-zinc-400 mt-1">ГОРОД ЗАСЫПАЕТ</p>
                </div>
                <div className="p-6 space-y-3">
                  <div className="text-white font-bold text-base border-b border-zinc-800 pb-3">
                    {subject || '(Без темы)'}
                  </div>
                  <div className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap font-sans py-2">
                    {bodyText || '(Текст сообщения отсутствует)'}
                  </div>
                </div>
                <div className="bg-[#121319] p-3 text-center text-xs text-zinc-500 border-t border-zinc-800">
                  Это официальное сообщение от администрации Mafia Club.
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800 flex justify-end bg-[#121319]">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs cursor-pointer"
              >
                Закрыть предпросмотр
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRM SEND MAIL */}
      {showSendConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-[#181a22] border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-800/60">
                <Send className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Подтверждение отправки</h3>
                <p className="text-xs text-zinc-400">Проверьте параметры перед отправкой</p>
              </div>
            </div>

            <div className="space-y-2 text-xs bg-[#121319] p-3.5 rounded-xl border border-zinc-800 font-sans">
              <div><span className="text-zinc-500">Получатель:</span> <span className="text-amber-400 font-mono font-bold block truncate">{recipientEmail}</span></div>
              <div className="pt-1"><span className="text-zinc-500">Тема:</span> <span className="text-white font-medium block truncate">{subject}</span></div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Вы уверены, что хотите отправить это сообщение? Изменить или отменить отправку после нажатия будет невозможно.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSendConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmSendMail}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs cursor-pointer shadow-lg shadow-orange-950/50 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Да, отправить</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CREATE / EDIT TEMPLATE */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl bg-[#181a22] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#121319]">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-orange-500" />
                <span>{editingTemplate ? 'Редактирование шаблона' : 'Создание нового шаблона'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-6 space-y-4 overflow-y-auto">
              {tplFormError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{tplFormError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Название шаблона <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={tplFormName}
                  onChange={e => setTplFormName(e.target.value)}
                  placeholder="Например: Приветствие игрока"
                  className="w-full bg-[#121319] border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Тема письма <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={tplFormSubject}
                  onChange={e => setTplFormSubject(e.target.value)}
                  placeholder="Тема сообщения по умолчанию..."
                  className="w-full bg-[#121319] border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Текст письма <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={8}
                  maxLength={10000}
                  value={tplFormBody}
                  onChange={e => setTplFormBody(e.target.value)}
                  placeholder="Текст сообщения по умолчанию..."
                  className="w-full bg-[#121319] border border-zinc-800 text-white rounded-xl p-4 text-sm focus:outline-none focus:border-orange-500 font-sans leading-relaxed resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={savingTemplate}
                  className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs cursor-pointer shadow-lg shadow-orange-950/40 flex items-center gap-1.5"
                >
                  {savingTemplate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Сохранить шаблон</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE TEMPLATE CONFIRMATION */}
      {deletingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-[#181a22] border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/60">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Удаление шаблона</h3>
                <p className="text-xs text-zinc-400">Подтвердите действие</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Вы уверены, что хотите удалить шаблон <strong className="text-white">«{deletingTemplate.name}»</strong>?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTemplate(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={deletingProcess}
                onClick={handleConfirmDeleteTemplate}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer shadow-lg shadow-rose-950/50 flex items-center gap-1.5"
              >
                {deletingProcess ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Удалить шаблон</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: VIEW HISTORY ENTRY DETAILS */}
      {selectedHistoryEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[#181a22] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#121319]">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-500" />
                <span>Детали отправленного письма</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedHistoryEntry(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-[#121319] p-3.5 rounded-xl border border-zinc-800">
                <div>
                  <span className="text-zinc-500 block">Получатель:</span>
                  <span className="text-amber-400 font-mono font-bold text-sm">{selectedHistoryEntry.recipientEmail}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Статус:</span>
                  <span className="mt-0.5 inline-block">{renderStatusBadge(selectedHistoryEntry.status)}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Дата и время:</span>
                  <span className="text-zinc-300 font-mono">{new Date(selectedHistoryEntry.sentAt).toLocaleString('ru-RU')}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Способ отправки:</span>
                  <span className="text-zinc-200 font-mono font-medium mt-0.5 inline-block">
                    {selectedHistoryEntry.transport === 'resend_api' ? (
                      <span className="text-indigo-400 font-bold">Resend API (HTTPS)</span>
                    ) : selectedHistoryEntry.transport === 'smtp' ? (
                      <span className="text-amber-400 font-bold">SMTP (Nodemailer)</span>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-zinc-800/60">
                  <span className="text-zinc-500 block">Отправитель (Админ):</span>
                  <span className="text-zinc-300 font-mono">{selectedHistoryEntry.sentByAdminEmail}</span>
                </div>
              </div>

              {selectedHistoryEntry.errorMessage && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-rose-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>Ошибка отправки:</span>
                  </div>
                  <p className="font-mono text-[11px]">{selectedHistoryEntry.errorMessage}</p>
                </div>
              )}

              <div>
                <span className="text-zinc-400 font-bold block mb-1">Тема сообщения:</span>
                <div className="bg-[#121319] border border-zinc-800 p-3 rounded-xl text-white font-bold text-sm">
                  {selectedHistoryEntry.subject}
                </div>
              </div>

              <div>
                <span className="text-zinc-400 font-bold block mb-1">Полный текст сообщения на момент отправки:</span>
                <div className="bg-[#121319] border border-zinc-800 p-4 rounded-xl text-zinc-200 leading-relaxed font-sans whitespace-pre-wrap">
                  {selectedHistoryEntry.bodyText}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800 flex justify-end bg-[#121319]">
              <button
                type="button"
                onClick={() => setSelectedHistoryEntry(null)}
                className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
