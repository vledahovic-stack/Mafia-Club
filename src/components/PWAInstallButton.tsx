import React, { useState } from 'react';
import { Download, Smartphone, Share2, PlusSquare, X, Check, ShieldCheck } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { sounds } from '../utils/audio';

interface PWAInstallButtonProps {
  variant?: 'header_pill' | 'banner' | 'modal_item';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header_pill',
  className = ''
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState<boolean>(false);
  const [justInstalled, setJustInstalled] = useState<boolean>(false);

  // If already running inside installed standalone PWA / TWA, hide the button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    sounds.playTick();
    if (isInstallable) {
      const success = await install();
      if (success) {
        setJustInstalled(true);
        setTimeout(() => setJustInstalled(false), 3000);
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      // Fallback for browsers that don't trigger beforeinstallprompt directly
      setShowIOSModal(true);
    }
  };

  // 1. Variant: Header Pill (Compact button in top nav)
  if (variant === 'header_pill') {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          title={isAndroid ? 'Установить Android приложение (TWA/PWA)' : 'Установить приложение на устройство'}
          className={`skin-btn-secondary flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 ${
            isAndroid
              ? 'bg-gradient-to-r from-emerald-950/80 to-teal-950/80 border border-emerald-600/70 text-emerald-300 hover:text-white hover:border-emerald-500 shadow-emerald-950/30'
              : 'bg-[var(--skin-bg-subcard)] hover:bg-[var(--skin-bg-card)] border border-[var(--skin-border-accent)] text-[var(--skin-accent-primary)] hover:border-[var(--skin-accent-primary)] shadow-md'
          } ${className}`}
        >
          {justInstalled ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Установлено</span>
            </>
          ) : (
            <>
              <Smartphone className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
              <span className="hidden sm:inline">Установить</span>
              <span className="sm:hidden">PWA</span>
            </>
          )}
        </button>

        {/* Guided Installation Modal (for iOS or fallback) */}
        {showIOSModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="skin-modal relative w-full max-w-sm rounded-2xl bg-[var(--skin-bg-modal)] border border-[var(--skin-border-card)] p-5 shadow-2xl text-left space-y-4">
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="absolute top-3.5 right-3.5 p-1 rounded-lg text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-subcard)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-center justify-center text-[var(--skin-accent-primary)] shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--skin-text-primary)] text-sm">Установка «Мафия Онлайн»</h3>
                  <p className="text-[11px] text-[var(--skin-text-muted)]">PWA / Android TWA приложение</p>
                </div>
              </div>

              <div className="space-y-2.5 text-xs text-[var(--skin-text-secondary)]">
                {isIOS ? (
                  <>
                    <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-start gap-2.5">
                      <div className="p-1.5 rounded-lg bg-[var(--skin-bg-card)] text-[var(--skin-accent-secondary)] shrink-0">
                        <Share2 className="w-4 h-4" />
                      </div>
                      <div>
                        <b>Шаг 1:</b> В браузере Safari нажмите кнопку <b>«Поделиться»</b> в нижней панели.
                      </div>
                    </div>
                    <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-start gap-2.5">
                      <div className="p-1.5 rounded-lg bg-[var(--skin-bg-card)] text-[var(--skin-accent-primary)] shrink-0">
                        <PlusSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <b>Шаг 2:</b> Пролистайте вниз и выберите <b>«На экран „Домой“»</b>.
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[var(--skin-text-secondary)] leading-relaxed">
                      Приложение полностью готово к автономной работе и обёртке в Android (TWA) через <b>PWABuilder</b>.
                    </p>
                    <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Поддерживается установка в Google Play / TWA APK, автономный кэш и быстрый запуск.</span>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="skin-btn-primary w-full py-2.5 rounded-xl bg-[var(--skin-accent-primary)] hover:opacity-90 font-bold text-[var(--skin-bg-primary)] text-xs transition-colors shadow-md"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // 2. Variant: Banner (e.g., inside settings modal or profile)
  return (
    <div className={`skin-card p-3 rounded-xl bg-[var(--skin-bg-card)] border border-[var(--skin-border-card)] flex items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2.5">
        <Smartphone className="w-5 h-5 text-[var(--skin-accent-primary)] shrink-0" />
        <div>
          <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5">
            <span>Установить «Мафия Онлайн»</span>
            <span className="text-[9px] font-mono text-[var(--skin-accent-primary)] bg-[var(--skin-bg-subcard)] px-1.5 py-0.2 rounded border border-[var(--skin-border-base)]">
              PWA / TWA
            </span>
          </div>
          <p className="text-[10px] text-[var(--skin-text-muted)]">Быстрый запуск с рабочего стола без рамок браузера</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleInstallClick}
        className="skin-btn-primary px-3 py-1.5 rounded-xl bg-[var(--skin-accent-primary)] hover:opacity-90 text-[var(--skin-bg-primary)] text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shrink-0 active:scale-95"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Установить</span>
      </button>
    </div>
  );
};
