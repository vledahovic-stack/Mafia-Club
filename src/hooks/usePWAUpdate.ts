import { useEffect, useState, useCallback, useRef } from 'react';

export interface PWAUpdateState {
  updateAvailable: boolean;
  isUpdating: boolean;
  applyUpdate: () => void;
  dismissUpdate: () => void;
  isDismissed: boolean;
}

export function usePWAUpdate(isInRoom: boolean = false): PWAUpdateState {
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let isMounted = true;

    const onServiceWorkerFound = (registration: ServiceWorkerRegistration) => {
      // 1. If there is already a waiting worker (downloaded earlier)
      if (registration.waiting) {
        waitingWorkerRef.current = registration.waiting;
        if (isMounted) {
          setUpdateAvailable(true);
        }
      }

      // 2. Listen for newly installing worker
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          // If the new worker has installed and there is an existing active controller
          if (
            installingWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            waitingWorkerRef.current = installingWorker;
            if (isMounted) {
              setUpdateAvailable(true);
              console.log('[PWA Update] Доступна новая версия Mafia Club (ожидает применения)');
            }
          }
        });
      });
    };

    // Check existing registration
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      onServiceWorkerFound(reg);
    });

    // Handle controller change (reloads page when new worker takes over)
    let refreshing = false;
    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        console.log('[PWA Update] Service Worker обновлён. Перезагрузка приложения...');
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Periodic check for SW updates when user is active (on window focus / visibility change)
    const checkForUpdates = () => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          reg.update().catch((err) => {
            console.debug('[PWA Update] Check update error:', err);
          });
        }
      });
    };

    window.addEventListener('focus', checkForUpdates);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    });

    return () => {
      isMounted = false;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      window.removeEventListener('focus', checkForUpdates);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    // Safety check: Never reload if player is inside an active room
    if (isInRoom) {
      console.warn('[PWA Update] Обновление отложено: игрок находится внутри комнаты');
      return;
    }

    setIsUpdating(true);

    if (waitingWorkerRef.current) {
      console.log('[PWA Update] Отправка SKIP_WAITING ожидающему Service Worker');
      waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // Fallback: check all registrations
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
          // If no waiting worker was found, just reload to fetch latest assets
          window.location.reload();
        }
      });
    }

    // Fallback reload timeout in case controllerchange event does not trigger
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  }, [isInRoom]);

  const dismissUpdate = useCallback(() => {
    setIsDismissed(true);
  }, []);

  return {
    updateAvailable: updateAvailable && !isDismissed,
    isUpdating,
    applyUpdate,
    dismissUpdate,
    isDismissed,
  };
}
