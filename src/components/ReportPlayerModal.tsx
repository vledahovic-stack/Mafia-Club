import React, { useState } from 'react';
import { 
  X, 
  Flag, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  ShieldAlert, 
  MessageSquare, 
  Ban, 
  Send,
  UserX,
  FileWarning
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { GangsterIcon } from './GangsterIcon';

export interface ReportPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPlayer: {
    id: string;
    name: string;
  } | null;
  reporter: {
    id: string;
    name: string;
  } | null;
  roomCode?: string;
  onReportSubmitted?: () => void;
}

type ReasonCategory = 'toxicity' | 'throwing' | 'spam' | 'inappropriate_name' | 'other';

const REPORT_CATEGORIES: { id: ReasonCategory; label: string; icon: string; desc: string }[] = [
  {
    id: 'toxicity',
    label: 'Оскорбления и токсичность',
    icon: '🤬',
    desc: 'Нецензурная брань, унижения, угрозы или провокации в чате'
  },
  {
    id: 'throwing',
    label: 'Руининг и намеренный слив',
    icon: '🛑',
    desc: 'Раскрытие ролей своей команды, афк, саботаж голосования'
  },
  {
    id: 'spam',
    label: 'Спам и флуд в чате',
    icon: '📢',
    desc: 'Массовая отправка бессмысленных сообщений, реклама'
  },
  {
    id: 'inappropriate_name',
    label: 'Неподобающий никнейм',
    icon: '📛',
    desc: 'Оскорбительное или запрещённое имя игрока'
  },
  {
    id: 'other',
    label: 'Другое нарушение',
    icon: '⚠️',
    desc: 'Любое иное нарушение правил честной игры синдиката'
  }
];

export const ReportPlayerModal: React.FC<ReportPlayerModalProps> = ({
  isOpen,
  onClose,
  targetPlayer,
  reporter,
  roomCode = 'LOBBY',
  onReportSubmitted
}) => {
  const [category, setCategory] = useState<ReasonCategory>('toxicity');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen || !targetPlayer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPlayer) return;

    const selectedCat = REPORT_CATEGORIES.find(c => c.id === category);
    const reasonTitle = selectedCat ? selectedCat.label : 'Нарушение правил';

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/reports/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reporterId: reporter?.id || 'anon_' + Date.now(),
          reporterName: reporter?.name || 'Игрок',
          targetPlayerId: targetPlayer.id,
          targetPlayerName: targetPlayer.name,
          roomCode,
          reason: reasonTitle,
          reasonCategory: category,
          details: details.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось отправить жалобу');
      }

      sounds.playTick();
      setIsSuccess(true);
      if (onReportSubmitted) {
        onReportSubmitted();
      }

      setTimeout(() => {
        setIsSuccess(false);
        setDetails('');
        onClose();
      }, 2200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка отправки жалобы';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs select-none">
      <div className="w-full max-w-lg bg-[#111218] border border-rose-900/60 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#161318] border-b border-rose-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-rose-400">
            <div className="w-8 h-8 rounded-xl bg-rose-950/80 border border-rose-800/80 flex items-center justify-center">
              <Flag className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                Подать жалобу на игрока
              </h3>
              <p className="text-[10px] text-zinc-400 font-mono">
                Комната #{roomCode.toUpperCase()}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playTick();
              onClose();
            }}
            className="w-7 h-7 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {isSuccess ? (
          <div className="p-8 text-center space-y-3.5">
            <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-600 flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-950/40 animate-in zoom-in-75">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h4 className="text-base font-bold text-white uppercase tracking-wide">
              Жалоба успешно передана модераторам
            </h4>
            <p className="text-xs text-zinc-300 max-w-sm mx-auto leading-relaxed">
              Администрация Города проверит действия игрока <span className="text-amber-400 font-bold">«{targetPlayer.name}»</span> и примет необходимые меры. Спасибо за поддержание порядка!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            
            {/* Target Player Card */}
            <div className="p-3 rounded-xl bg-[#18151b] border border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                  <GangsterIcon size={26} className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 uppercase font-mono block">Нарушитель:</span>
                  <span className="text-sm font-bold text-white">{targetPlayer.name}</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-zinc-500 font-mono">ID: {targetPlayer.id.slice(0, 10)}</span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Category Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block">
                Категория нарушения:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REPORT_CATEGORIES.map(cat => {
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        sounds.playTick();
                        setCategory(cat.id);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                        isSelected
                          ? 'bg-rose-950/50 border-rose-500 text-white ring-1 ring-rose-500/40'
                          : 'bg-[#14151e] hover:bg-[#1a1b26] border-zinc-800 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <span className="text-lg shrink-0">{cat.icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">{cat.label}</div>
                        <div className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">{cat.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Details Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                  Подробности инцидента (необязательно):
                </label>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {details.length}/300
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={300}
                placeholder="Опишите, что именно произошло (например: вскрыл роли в чате, оскорбил шерифа)..."
                value={details}
                onChange={e => setDetails(e.target.value)}
                className="w-full bg-[#14151e] border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-rose-500 font-sans"
              />
            </div>

            {/* Notice */}
            <div className="text-[10px] text-zinc-400 bg-[#14151e] border border-zinc-850 p-2.5 rounded-xl flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                Все жалобы фиксируются в журнале безопасности и рассматриваются администратором в панели модерации. За ложные доносы предусмотрен штраф.
              </span>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  sounds.playTick();
                  onClose();
                }}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition-colors"
              >
                Отмена
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-rose-950/40 flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Отправка...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Отправить жалобу</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
