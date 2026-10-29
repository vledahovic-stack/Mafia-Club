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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none animate-in fade-in duration-200">
      <div
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative z-10 w-full max-w-md bg-[#12131c] border border-zinc-800/90 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-850 bg-[#151622] flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-950/70 border border-amber-600/60 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-amber-500 block">
                БОНУСЫ КЛУБА
              </span>
              <h2 className="text-lg sm:text-xl font-sans font-bold text-white tracking-tight">
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
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4 font-sans">
          <p className="text-xs text-zinc-400 leading-relaxed">
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
                className="w-full px-4 py-3 rounded-xl bg-black/60 border border-zinc-700/90 focus:border-amber-500 text-amber-300 font-mono font-bold text-sm uppercase tracking-wider placeholder:text-zinc-600 placeholder:normal-case placeholder:tracking-normal focus:outline-none transition-colors"
              />
              {codeInput && !activating && (
                <button
                  type="button"
                  onClick={() => setCodeInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                  title="Очистить"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={activating || !codeInput.trim()}
              className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-orange-950/40 flex items-center justify-center gap-2 cursor-pointer"
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
        <div className="px-5 sm:px-6 py-3.5 bg-[#101119] border-t border-zinc-850 flex items-center justify-between gap-2">
          {onOpenProfilePromocodes ? (
            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                onClose();
                onOpenProfilePromocodes();
              }}
              className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>История и отложенные награды</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-[11px] text-zinc-500 font-mono">MAFIA CLUB</span>
          )}

          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 hover:text-white transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
