import React, { useEffect } from 'react';
import { Smartphone, Monitor, Share2, PlusSquare, MoreVertical, Download, X, ShieldCheck } from 'lucide-react';
import { sounds } from '../utils/audio';

export interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isIOS: boolean;
  isAndroid: boolean;
  isDesktop?: boolean;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  isIOS,
  isAndroid,
  isDesktop
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        sounds.playTick();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Инструкция по установке Mafia Club"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="skin-modal relative w-full max-w-sm rounded-2xl bg-[var(--skin-bg-modal)] border border-[var(--skin-border-card)] p-5 shadow-[var(--skin-shadow-modal)] text-left space-y-4"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            onClose();
          }}
          aria-label="Закрыть"
          className="absolute top-3.5 right-3.5 p-1 rounded-lg text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-subcard)] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-center justify-center text-[var(--skin-accent-primary)] shrink-0">
            {isDesktop ? <Monitor className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
          </div>
          <div className="min-w-0 pr-6">
            <h3 className="font-bold text-[var(--skin-text-primary)] text-sm leading-tight truncate">
              Установка «Мафия Онлайн»
            </h3>
            <p className="text-[11px] text-[var(--skin-text-muted)] mt-0.5 truncate">
              {isIOS ? 'Инструкция для iOS (Safari)' : isAndroid ? 'Инструкция для Android' : 'Инструкция для компьютера'}
            </p>
          </div>
        </div>

        {/* Platform-specific instructions */}
        <div className="space-y-2.5 text-xs text-[var(--skin-text-secondary)]">
          {isIOS ? (
            /* iOS Safari Instructions */
            <>
              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-[var(--skin-bg-card)] text-[var(--skin-accent-secondary)] shrink-0 mt-0.5">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--skin-text-primary)]">Шаг 1</div>
                  <div className="mt-0.5">В браузере Safari нажмите кнопку <b>«Поделиться»</b> (квадрат со стрелкой) в нижней панели.</div>
                </div>
              </div>

              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-[var(--skin-bg-card)] text-[var(--skin-accent-primary)] shrink-0 mt-0.5">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--skin-text-primary)]">Шаг 2</div>
                  <div className="mt-0.5">Пролистайте меню вниз и выберите <b>«На экран „Домой“»</b>.</div>
                </div>
              </div>

              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-[var(--skin-bg-card)] text-emerald-400 shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--skin-text-primary)]">Шаг 3</div>
                  <div className="mt-0.5">Нажмите <b>«Добавить»</b> в правом верхнем углу. Ярлык игры появится на рабочем столе.</div>
                </div>
              </div>
            </>
          ) : isAndroid ? (
            /* Android Browser Instructions (when automated prompt is unavailable) */
            <>
              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-[var(--skin-bg-card)] text-[var(--skin-accent-primary)] shrink-0 mt-0.5">
                  <MoreVertical className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--skin-text-primary)]">Шаг 1</div>
                  <div className="mt-0.5">Откройте меню браузера (нажмите на <b>три точки ⋮</b> в верхнем или нижнем углу).</div>
                </div>
              </div>

              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-[var(--skin-bg-card)] text-emerald-400 shrink-0 mt-0.5">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--skin-text-primary)]">Шаг 2</div>
                  <div className="mt-0.5">Выберите пункт <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>.</div>
                </div>
              </div>

              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-[var(--skin-bg-card)] text-teal-400 shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--skin-text-primary)]">Шаг 3</div>
                  <div className="mt-0.5">Подтвердите установку. Игра будет запускаться во весь экран без адресной строки.</div>
                </div>
              </div>
            </>
          ) : (
            /* Desktop Browser Instructions */
            <>
              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-[var(--skin-bg-card)] text-[var(--skin-accent-primary)] shrink-0 mt-0.5">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--skin-text-primary)]">Способ 1</div>
                  <div className="mt-0.5">Нажмите на значок установки <b>(компьютер со стрелкой)</b> в правой части адресной строки браузера.</div>
                </div>
              </div>

              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-[var(--skin-bg-card)] text-[var(--skin-accent-secondary)] shrink-0 mt-0.5">
                  <MoreVertical className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--skin-text-primary)]">Способ 2</div>
                  <div className="mt-0.5">Откройте меню браузера (<b>три точки ⋮</b> вверху справа) и выберите <b>«Установить Mafia Club»</b>.</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Confirm / Close Button */}
        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            onClose();
          }}
          className="skin-btn-primary w-full py-2.5 rounded-xl bg-[var(--skin-accent-primary)] hover:opacity-90 font-bold text-[var(--skin-bg-primary)] text-xs transition-colors shadow-md cursor-pointer"
        >
          Понятно
        </button>
      </div>
    </div>
  );
};
