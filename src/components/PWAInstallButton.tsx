import React, { useState } from 'react';
import { Download, Smartphone, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { sounds } from '../utils/audio';
import { PWAInstallModal } from './PWAInstallModal';

export { PWAInstallModal };

export interface PWAInstallButtonProps {
  variant?: 'header_pill' | 'banner' | 'modal_item';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header_pill',
  className = ''
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isDesktop, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
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
    } else {
      setShowGuideModal(true);
    }
  };

  // 1. Variant: Header Pill (Compact button)
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

        <PWAInstallModal
          isOpen={showGuideModal}
          onClose={() => setShowGuideModal(false)}
          isIOS={isIOS}
          isAndroid={isAndroid}
          isDesktop={isDesktop}
        />
      </>
    );
  }

  // 2. Variant: Banner (e.g. inside settings or profile)
  return (
    <>
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
          className="skin-btn-primary px-3 py-1.5 rounded-xl bg-[var(--skin-accent-primary)] hover:opacity-90 text-[var(--skin-bg-primary)] text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shrink-0 active:scale-95 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Установить</span>
        </button>
      </div>

      <PWAInstallModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        isIOS={isIOS}
        isAndroid={isAndroid}
        isDesktop={isDesktop}
      />
    </>
  );
};
