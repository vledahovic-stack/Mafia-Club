import React from 'react';
import { Sparkles, RefreshCw, X } from 'lucide-react';

interface PWAUpdateBannerProps {
  updateAvailable: boolean;
  isUpdating: boolean;
  onApplyUpdate: () => void;
  onDismiss: () => void;
  isInRoom: boolean;
}

export const PWAUpdateBanner: React.FC<PWAUpdateBannerProps> = ({
  updateAvailable,
  isUpdating,
  onApplyUpdate,
  onDismiss,
  isInRoom,
}) => {
  // STRICT RULE: Never render update banner if player is inside an active room (lobby or game)
  if (!updateAvailable || isInRoom) {
    return null;
  }

  return (
    <aside
      role="region"
      aria-label="Уведомление об обновлении Mafia Club"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="flex items-center justify-between gap-3 p-3 sm:px-4 sm:py-3 rounded-2xl bg-[#12131e]/95 border border-amber-500/50 shadow-[0_10px_35px_rgba(0,0,0,0.8),0_0_20px_rgba(245,158,11,0.2)] backdrop-blur-md text-amber-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-400">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 tracking-wide uppercase">
              <span>Доступна новая версия</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
            </div>
            <p className="text-[11px] text-zinc-300 truncate">
              Обновление готово к установке
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isUpdating}
            onClick={onApplyUpdate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-zinc-950 font-semibold text-xs transition shadow-md disabled:opacity-50"
          >
            {isUpdating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Установка...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Обновить</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Закрыть уведомление об обновлении"
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition"
            title="Отложить"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
