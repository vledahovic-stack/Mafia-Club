import React, { useState, useEffect } from 'react';
import { X, Ticket, Sparkles, Loader2, CheckCircle2, AlertCircle, Gift, ArrowRight } from 'lucide-react';
import { AuthUser } from './AuthModal';
import { sounds } from '../utils/audio';

interface PromoCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: AuthUser | null;
  onUpdateUser?: (updatedUser: AuthUser) => void;
  onOpenProfilePromocodes?: () => void;
}

export const PromoCodeModal: React.FC<PromoCodeModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onOpenProfilePromocodes,
}) => {
  const [codeInput, setCodeInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    immediatelyGranted?: Array<{ itemId: string; itemTitle: string; quantity: number }>;
    pendingObligationsCount?: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen || !user) return null;

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = codeInput.trim().toUpperCase();
    if (!clean) {
      setFeedback({
        type: 'error',
        text: 'Введите промокод или реферальный код партнёра.',
      });
      return;
    }

    setActivating(true);
    setFeedback(null);

    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/promocodes/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code: clean }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'error',
          text: data.error || 'Не удалось активировать промокод.',
        });
        return;
      }

      sounds.playTick();
      setCodeInput('');
      setFeedback({
        type: 'success',
        text: data.result?.message || data.message || 'Промокод успешно активирован!',
        immediatelyGranted: data.result?.immediatelyGranted || [],
        pendingObligationsCount: data.result?.pendingObligationsCount || 0,
      });

      if (data.user && onUpdateUser) {
        onUpdateUser(data.user);
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка соединения с сервером.',
      });
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs select-none animate-in fade-in duration-200">
      <div
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative z-10 w-full max-w-md skin-modal bg-[var(--skin-bg-modal)] border border-[var(--skin-border-card)] rounded-3xl shadow-[var(--skin-shadow-modal)] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[var(--skin-border-base)] skin-header bg-[var(--skin-bg-header)] flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-950/70 border border-amber-600/60 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-amber-500 block">
                БОНУСЫ КЛУБА
              </span>
              <h2 className="text-lg sm:text-xl font-sans font-bold text-[var(--skin-text-primary)] tracking-tight">
                Активировать промокод
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              onClose();
            }}
            className="p-2 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4 font-sans">
          <p className="text-xs text-[var(--skin-text-secondary)] leading-relaxed">
            Введите промокод акции или реферальный код партнёра Mafia Club для получения игровых наград, кредитов и предметов в инвентарь.
          </p>

          <form onSubmit={handleActivate} className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="Введите промокод (например: MAFIA2026)"
                disabled={activating}
                autoFocus
                className="w-full px-4 py-3 rounded-xl skin-input bg-[var(--skin-bg-card)] border border-[var(--skin-border-base)] focus:border-[var(--skin-border-accent)] text-[var(--skin-text-primary)] font-mono font-bold text-sm uppercase tracking-wider placeholder:text-[var(--skin-text-muted)] placeholder:normal-case placeholder:tracking-normal focus:outline-none transition-colors"
              />
              {codeInput && !activating && (
                <button
                  type="button"
                  onClick={() => setCodeInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] p-1 cursor-pointer"
                  title="Очистить"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={activating || !codeInput.trim()}
              className="skin-btn-primary w-full py-3 px-5 rounded-xl disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              {activating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Проверка кода...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Активировать</span>
                </>
              )}
            </button>
          </form>

          {/* Result / Feedback Banner */}
          {feedback && (
            <div
              className={`p-4 rounded-2xl border text-xs space-y-2.5 animate-in fade-in duration-150 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/45 border-emerald-700/70 text-emerald-200'
                  : 'bg-rose-950/45 border-rose-700/70 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2.5 font-bold leading-snug">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{feedback.text}</span>
              </div>

              {feedback.immediatelyGranted && feedback.immediatelyGranted.length > 0 && (
                <div className="pt-2.5 border-t border-emerald-800/50 space-y-1.5">
                  <div className="text-[11px] text-emerald-300 font-bold flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Полученные награды:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {feedback.immediatelyGranted.map((r, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-900/50 border border-emerald-600/60 text-emerald-100 font-mono text-xs font-bold"
                      >
                        <span>🎁</span>
                        <span>{r.itemTitle}</span>
                        <span className="text-amber-300">×{r.quantity}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(feedback.pendingObligationsCount ?? 0) > 0 && (
                <div className="pt-2 border-t border-emerald-800/50">
                  <div className="text-[11px] text-amber-300 font-bold leading-relaxed">
                    Отложенных наград в прогрессе: {feedback.pendingObligationsCount} шт. (будут начислены автоматически после выполнения условий).
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 bg-[var(--skin-bg-header)] border-t border-[var(--skin-border-base)] flex items-center justify-between gap-2">
          {onOpenProfilePromocodes ? (
            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                onClose();
                onOpenProfilePromocodes();
              }}
              className="text-[11px] font-semibold text-[var(--skin-accent-primary)] hover:opacity-80 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>История и отложенные награды</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-[11px] text-[var(--skin-text-muted)] font-mono">MAFIA CLUB</span>
          )}

          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              onClose();
            }}
            className="skin-btn-secondary px-4 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
