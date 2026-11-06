import { useEffect, useState, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Module-level cache so beforeinstallprompt is never missed if fired prior to component mount
let capturedPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();

export function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  return Boolean(
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    (typeof document !== 'undefined' && document.referrer.includes('android-app://'))
  );
}

// Global window event listeners (active immediately on page load)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Prevent mini-infobar on mobile Chrome
    e.preventDefault();
    capturedPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((listener) => listener(capturedPrompt));
    console.log('[PWA] Событие beforeinstallprompt успешно перехвачено');
  });

  window.addEventListener('appinstalled', () => {
    capturedPrompt = null;
    promptListeners.forEach((listener) => listener(null));
    console.log('[PWA] Приложение успешно установлено на устройство (appinstalled)');
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => capturedPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkIsStandalone());
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isAndroid, setIsAndroid] = useState<boolean>(false);
  const [isDesktop, setIsDesktop] = useState<boolean>(false);

  useEffect(() => {
    // Initial standalone state
    setIsInstalled(checkIsStandalone());

    // Platform detection
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent.toLowerCase();
      const iosDevice = /iphone|ipad|ipod/.test(ua);
      const androidDevice = /android/.test(ua);
      setIsIOS(iosDevice);
      setIsAndroid(androidDevice);
      setIsDesktop(!iosDevice && !androidDevice);
    }

    // Subscribe to module-level prompt updates
    const handlePromptUpdate = (p: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(p);
    };
    promptListeners.add(handlePromptUpdate);

    // Sync any prompt captured between render and effect
    if (capturedPrompt && !deferredPrompt) {
      setDeferredPrompt(capturedPrompt);
    }

    // Media query listener for dynamic standalone changes
    const mql = window.matchMedia('(display-mode: standalone)');
    const handleMqlChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
      }
    };
    if (mql.addEventListener) {
      mql.addEventListener('change', handleMqlChange);
    }

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      capturedPrompt = null;
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      promptListeners.delete(handlePromptUpdate);
      if (mql.removeEventListener) {
        mql.removeEventListener('change', handleMqlChange);
      }
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [deferredPrompt]);

  const install = useCallback(async (): Promise<boolean> => {
    const promptToUse = deferredPrompt || capturedPrompt;
    if (!promptToUse) {
      console.warn('[PWA] Попытка установки без доступного beforeinstallprompt');
      return false;
    }

    try {
      await promptToUse.prompt();
      const { outcome } = await promptToUse.userChoice;
      console.log('[PWA] Результат диалога установки:', outcome);

      if (outcome === 'accepted') {
        capturedPrompt = null;
        setDeferredPrompt(null);
        setIsInstalled(true);
        return true;
      }
    } catch (err) {
      console.warn('[PWA] Ошибка выполнения prompt установки:', err);
    }

    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt || capturedPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    isDesktop,
    install,
    deferredPrompt: deferredPrompt || capturedPrompt,
  };
}
