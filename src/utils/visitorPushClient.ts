export interface AdminPushDeviceItem {
  id: string;
  deviceLabel: string;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  isCurrentDevice?: boolean;
}

export interface AdminPushStatusResponse {
  enabled: boolean;
  vapid: {
    configured: boolean;
    publicKey: string | null;
    reason?: string;
  };
  currentDeviceSubscriptionId: string | null;
  subscriptions: AdminPushDeviceItem[];
}

export interface BrowserPushEnvironment {
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  hasServiceWorker: boolean;
  hasNotification: boolean;
  hasPushManager: boolean;
  permission: NotificationPermission | 'unsupported';
  requiresIOSHomeScreen: boolean;
  supported: boolean;
  deviceLabel: string;
  unsupportedReason: string | null;
}

export interface PushBrowserEnvAdapter {
  userAgent?: string;
  maxTouchPoints?: number;
  isStandalone?: boolean;
  hasServiceWorker?: boolean;
  hasNotification?: boolean;
  hasPushManager?: boolean;
  getPermission?: () => NotificationPermission;
  requestPermission?: () => Promise<NotificationPermission>;
  getServiceWorkerRegistration?: () => Promise<{
    pushManager?: {
      getSubscription: () => Promise<{
        endpoint: string;
        toJSON: () => {
          endpoint?: string;
          expirationTime?: number | null;
          keys?: Record<string, string>;
        };
        unsubscribe: () => Promise<boolean>;
      } | null>;
      subscribe: (options: {
        userVisibleOnly: boolean;
        applicationServerKey: Uint8Array;
      }) => Promise<{
        endpoint: string;
        toJSON: () => {
          endpoint?: string;
          expirationTime?: number | null;
          keys?: Record<string, string>;
        };
        unsubscribe: () => Promise<boolean>;
      }>;
    };
  } | null>;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}

/**
 * Converts a URL-safe base64 VAPID public key into a Uint8Array for PushManager.subscribe.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const clean = (base64String || '').trim();
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');

  let rawData = '';
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    rawData = window.atob(base64);
  } else {
    rawData = Buffer.from(base64, 'base64').toString('binary');
  }

  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Generates a human-friendly browser & platform label without exposing raw tokens or identifiers.
 */
export function detectClientDeviceLabel(userAgent?: string, isStandalone?: boolean): string {
  const ua = (
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  ).trim();

  let browser = 'Браузер';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/YaBrowser/i.test(ua)) browser = 'Яндекс.Браузер';
  else if (/Firefox\/|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/CriOS\//i.test(ua)) browser = 'Chrome';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  let os = 'Устройство';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  const standaloneSuffix = isStandalone ? ' (PWA)' : '';
  return `${browser} · ${os}${standaloneSuffix}`;
}

/**
 * Inspects current browser / device capabilities for Web Push notifications,
 * including special handling for iPhone Safari tabs vs Home Screen PWA.
 */
export function detectPushEnvironment(adapter?: PushBrowserEnvAdapter): BrowserPushEnvironment {
  const ua =
    adapter?.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  const maxTouchPoints =
    adapter?.maxTouchPoints ??
    (typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0);

  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);

  const isStandalone =
    adapter?.isStandalone ??
    (typeof window !== 'undefined'
      ? (typeof window.matchMedia === 'function' &&
          window.matchMedia('(display-mode: standalone)').matches) ||
        Boolean(( typeof navigator !== 'undefined' && (navigator as any).standalone))
      : false);

  const hasServiceWorker =
    adapter?.hasServiceWorker ??
    (typeof navigator !== 'undefined' && 'serviceWorker' in navigator);
  const hasNotification =
    adapter?.hasNotification ??
    (typeof window !== 'undefined' && 'Notification' in window);
  const hasPushManager =
    adapter?.hasPushManager ??
    (typeof window !== 'undefined' && 'PushManager' in window);

  let permission: NotificationPermission | 'unsupported' = 'unsupported';
  if (adapter?.getPermission) {
    permission = adapter.getPermission();
  } else if (hasNotification && typeof Notification !== 'undefined') {
    permission = Notification.permission;
  }

  const requiresIOSHomeScreen = isIOS && !isStandalone;
  const supported =
    hasServiceWorker &&
    hasNotification &&
    hasPushManager &&
    !requiresIOSHomeScreen;

  let unsupportedReason: string | null = null;
  if (requiresIOSHomeScreen) {
    unsupportedReason =
      'На iPhone и iPad push-уведомления работают только в установленном веб-приложении. Нажмите кнопку «Поделиться» в Safari и выберите «На экран Домой», затем откройте Mafia Club с главного экрана.';
  } else if (!hasServiceWorker || !hasNotification || !hasPushManager) {
    unsupportedReason =
      'Текущий браузер или режим просмотра не поддерживает Web Push API (Service Worker / PushManager). Используйте Chrome на Android/ПК или установленное на экран «Домой» приложение в iOS 16.4+.';
  }

  return {
    isIOS,
    isAndroid,
    isStandalone,
    hasServiceWorker,
    hasNotification,
    hasPushManager,
    permission,
    requiresIOSHomeScreen,
    supported,
    deviceLabel: detectClientDeviceLabel(ua, isStandalone),
    unsupportedReason
  };
}

async function defaultGetSwRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing as any;
  }
  const registered = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return registered as any;
}

/**
 * Safely reads the current browser PushSubscription endpoint (if any) without requesting permissions.
 */
export async function getCurrentBrowserPushEndpoint(
  adapter?: PushBrowserEnvAdapter
): Promise<string | null> {
  try {
    const env = detectPushEnvironment(adapter);
    if (!env.hasServiceWorker || !env.hasPushManager) {
      return null;
    }
    const getReg = adapter?.getServiceWorkerRegistration || defaultGetSwRegistration;
    const reg = await getReg();
    if (!reg || !reg.pushManager) {
      return null;
    }
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint ? String(sub.endpoint).trim() : null;
  } catch {
    return null;
  }
}

/**
 * Loads the current Web Push configuration, global toggle state, and device list from the server.
 */
export async function fetchAdminPushStatus(
  token: string,
  adapter?: PushBrowserEnvAdapter
): Promise<AdminPushStatusResponse> {
  const fetchFn = adapter?.fetchFn || fetch;
  const baseUrl = adapter?.baseUrl || '';
  const localEndpoint = await getCurrentBrowserPushEndpoint(adapter);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`
  };
  if (localEndpoint) {
    headers['X-Push-Endpoint'] = localEndpoint;
  }

  const res = await fetchFn(`${baseUrl}/api/admin/visitors/push/status`, {
    method: 'GET',
    headers
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Не удалось загрузить настройки Web Push');
  }

  return {
    enabled: Boolean(data.enabled),
    vapid: {
      configured: Boolean(data.vapid?.configured),
      publicKey: data.vapid?.publicKey || null,
      reason: data.vapid?.reason
    },
    currentDeviceSubscriptionId: data.currentDeviceSubscriptionId || null,
    subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : []
  };
}

/**
 * Toggles the global setting `visitor_push_notifications_enabled`.
 */
export async function toggleAdminVisitorPush(
  token: string,
  enabled: boolean,
  adapter?: PushBrowserEnvAdapter
): Promise<{ enabled: boolean; message: string }> {
  const fetchFn = adapter?.fetchFn || fetch;
  const baseUrl = adapter?.baseUrl || '';

  const res = await fetchFn(`${baseUrl}/api/admin/visitors/push/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ enabled })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Не удалось изменить статус уведомлений');
  }

  return {
    enabled: Boolean(data.enabled),
    message:
      data.message ||
      (data.enabled
        ? 'Push-уведомления о новых посетителях включены'
        : 'Push-уведомления о новых посетителях выключены')
  };
}

/**
 * Connects the current browser/device to Web Push notifications following the 6-step security flow:
 * 1. Check ServiceWorker, Notification, and PushManager support (+ iOS Home Screen requirement).
 * 2. Verify server public VAPID key availability.
 * 3. Request Notification permission directly upon user button click.
 * 4. Reuse existing or create a new PushSubscription.
 * 5. Register the subscription with the protected Main Admin backend API.
 * 6. Return success only after server confirmation.
 */
export async function subscribeCurrentDeviceToPush(
  token: string,
  vapidConfig: { configured: boolean; publicKey: string | null; reason?: string },
  adapter?: PushBrowserEnvAdapter
): Promise<{
  subscription: AdminPushDeviceItem;
  permission: NotificationPermission;
  message: string;
}> {
  // 1. Check browser support
  const env = detectPushEnvironment(adapter);
  if (!env.supported) {
    throw new Error(
      env.unsupportedReason ||
        'Это устройство или браузер не поддерживает Web Push уведомления.'
    );
  }

  // 2. Check public VAPID key
  if (!vapidConfig?.configured || !vapidConfig?.publicKey) {
    throw new Error(
      vapidConfig?.reason ||
        'Серверная VAPID-конфигурация не настроена. Задайте VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY в окружении сервера.'
    );
  }

  // 3. Request user permission directly from click handler
  const requestPerm =
    adapter?.requestPermission ||
    (async () => {
      if (typeof Notification === 'undefined') return 'denied' as NotificationPermission;
      if (Notification.permission === 'granted') return 'granted';
      return await Notification.requestPermission();
    });

  const permission = await requestPerm();
  if (permission === 'denied') {
    throw new Error(
      'Доступ к уведомлениям запрещён в настройках браузера. Разрешите уведомления для Mafia Club в настройках сайта и попробуйте снова.'
    );
  }
  if (permission !== 'granted') {
    throw new Error(
      'Запрос разрешения на показ уведомлений был отклонён или закрыт без подтверждения.'
    );
  }

  // 4. Obtain Service Worker registration and get or create PushSubscription
  const getReg = adapter?.getServiceWorkerRegistration || defaultGetSwRegistration;
  const registration = await getReg();
  if (!registration || !registration.pushManager) {
    throw new Error('Не удалось инициализировать Service Worker или PushManager браузера.');
  }

  let browserSub = await registration.pushManager.getSubscription();
  if (!browserSub) {
    const appServerKey = urlBase64ToUint8Array(vapidConfig.publicKey);
    browserSub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey
    });
  }

  const subJson = browserSub.toJSON();
  if (!subJson?.endpoint || !subJson?.keys?.p256dh || !subJson?.keys?.auth) {
    throw new Error('Браузер вернул неполные данные PushSubscription (отсутствуют ключи шифрования).');
  }

  // 5. Register with protected backend API
  const fetchFn = adapter?.fetchFn || fetch;
  const baseUrl = adapter?.baseUrl || '';

  const res = await fetchFn(`${baseUrl}/api/admin/visitors/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      subscription: {
        endpoint: subJson.endpoint,
        expirationTime: subJson.expirationTime ?? null,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth
        }
      },
      deviceLabel: env.deviceLabel
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || !data.subscription) {
    throw new Error(data.error || 'Сервер не подтвердил сохранение push-подписки.');
  }

  // 6. Confirmed by server
  return {
    subscription: data.subscription,
    permission,
    message: data.message || 'Уведомления успешно подключены на этом устройстве'
  };
}

/**
 * Safely disconnects either the current device or a selected device from the device list.
 * Handles partial failures (e.g., server record deleted, but browser unsubscribe() threw an error).
 */
export async function unsubscribeDeviceFromPush(
  token: string,
  options: {
    subscriptionId?: string | null;
    isCurrentDevice?: boolean;
  },
  adapter?: PushBrowserEnvAdapter
): Promise<{
  removedFromServer: boolean;
  browserUnsubscribed: boolean;
  partialWarning: string | null;
  message: string;
}> {
  const fetchFn = adapter?.fetchFn || fetch;
  const baseUrl = adapter?.baseUrl || '';
  const isCurrent = Boolean(options.isCurrentDevice);

  let localEndpoint: string | null = null;
  let localSubObj: {
    endpoint: string;
    unsubscribe: () => Promise<boolean>;
  } | null = null;

  if (isCurrent) {
    try {
      const getReg = adapter?.getServiceWorkerRegistration || defaultGetSwRegistration;
      const reg = await getReg();
      if (reg?.pushManager) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          localSubObj = sub;
          localEndpoint = sub.endpoint;
        }
      }
    } catch {
      // Continue with server removal by subscriptionId
    }
  }

  const targetIdOrEndpoint = (options.subscriptionId || localEndpoint || '').trim();
  if (!targetIdOrEndpoint) {
    throw new Error('Не найден идентификатор подписки для отключения.');
  }

  const res = await fetchFn(`${baseUrl}/api/admin/visitors/push/unsubscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      id: options.subscriptionId || undefined,
      endpoint: !options.subscriptionId && localEndpoint ? localEndpoint : undefined
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Не удалось удалить подписку устройства на сервере');
  }

  const removedFromServer = Boolean(data.removed);
  let browserUnsubscribed = false;
  let partialWarning: string | null = null;

  if (isCurrent && localSubObj) {
    try {
      browserUnsubscribed = await localSubObj.unsubscribe();
    } catch (browserErr: any) {
      partialWarning =
        'Подписка удалена на сервере (push-уведомления приходить не будут), но локальная отписка браузера завершилась с предупреждением.';
    }
  }

  return {
    removedFromServer,
    browserUnsubscribed,
    partialWarning,
    message:
      partialWarning ||
      data.message ||
      (isCurrent
        ? 'Уведомления на этом устройстве отключены'
        : 'Устройство успешно отключено от уведомлений')
  };
}
