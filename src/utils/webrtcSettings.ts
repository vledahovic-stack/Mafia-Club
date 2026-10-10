import { WebRtcSettings, VideoResolution } from '../types/webrtc';

const STORAGE_KEY = 'mafia_webrtc_settings_v1';

export const DEFAULT_WEBRTC_SETTINGS: WebRtcSettings = {
  enabled: true,
  resolution: '240x180',
  frameRate: 15,
  blockIncomingVideo: false,
  blockIncomingAudio: false,
  dataSaverMode: false,
  startWithMicMuted: false,
  startWithCameraOff: false,
  virtualCameraFallback: true
};

export function loadWebRtcSettings(): WebRtcSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_WEBRTC_SETTINGS;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WEBRTC_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_WEBRTC_SETTINGS,
      ...parsed,
      // clamp frameRate between 10 and 30
      frameRate: Math.max(10, Math.min(30, Number(parsed.frameRate) || 15)),
      virtualCameraFallback: parsed.virtualCameraFallback !== undefined ? Boolean(parsed.virtualCameraFallback) : true
    };
  } catch {
    return DEFAULT_WEBRTC_SETTINGS;
  }
}

export function saveWebRtcSettings(settings: WebRtcSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('webrtc_settings_changed', { detail: settings }));
  } catch (err) {
    console.error('Failed to save WebRTC settings:', err);
  }
}

/**
 * Returns safe video constraints using 'ideal' values rather than strict 'max' / 'min'.
 * Strict 'max' constraints cause OverconstrainedError on many webcams and drivers.
 */
export function getVideoConstraints(settings: WebRtcSettings): MediaTrackConstraints {
  const parts = settings.resolution.split('x');
  const targetWidth = parseInt(parts[0], 10) || 240;
  const targetHeight = parseInt(parts[1], 10) || 180;
  const fps = Math.max(10, Math.min(30, Number(settings.frameRate) || 15));

  return {
    width: { ideal: targetWidth },
    height: { ideal: targetHeight },
    frameRate: { ideal: fps }
  };
}

export function getAudioConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };
}

export function getConstraintsFromSettings(settings: WebRtcSettings): MediaStreamConstraints {
  return {
    audio: getAudioConstraints(),
    video: getVideoConstraints(settings)
  };
}

/**
 * Friendly Russian error messages with clear instructions for the user.
 */
export function formatMediaError(err: any, device: 'camera' | 'mic' | 'both' = 'both'): string {
  if (!err) return 'Неизвестная ошибка медиаустройств.';
  
  const errName = err.name || '';
  const errMsg = err.message || '';

  if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
    if (device === 'camera') {
      return 'Доступ к камере заблокирован в браузере (NotAllowedError). Разрешите камеру: нажмите на значок замка или камеры слева в адресной строке и переключите на «Разрешить».';
    }
    if (device === 'mic') {
      return 'Доступ к микрофону заблокирован в браузере (NotAllowedError). Разрешите микрофон в адресной строке браузера.';
    }
    return 'Доступ к устройствам заблокирован (NotAllowedError). Разрешите доступ к камере и микрофону в адресной строке браузера.';
  }

  if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
    if (device === 'camera') {
      return 'Веб-камера не обнаружена на компьютере (NotFoundError). Проверьте подключение камеры или используйте виртуальную тестовую камеру.';
    }
    if (device === 'mic') {
      return 'Микрофон не обнаружен (NotFoundError). Подключите аудиоустройство или гарнитуру.';
    }
    return 'Медиаустройства не найдены на вашем компьютере (NotFoundError).';
  }

  if (errName === 'NotReadableError' || errName === 'TrackStartError') {
    return 'Камера уже используется другим приложением (NotReadableError). Закройте другие программы (Zoom, OBS, Discord или другую вкладку).';
  }

  if (errName === 'OverconstrainedError') {
    return 'Выбранный формат видео не поддерживается веб-камерой (OverconstrainedError).';
  }

  if (errName === 'TypeError') {
    return 'Некорректные параметры медиаустройств.';
  }

  return errMsg ? `Ошибка доступа: ${errMsg}` : 'Не удалось получить доступ к камере или микрофону.';
}

/**
 * Robustly requests user media with progressive fallbacks to prevent OverconstrainedError or driver failures.
 */
export async function safeGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
  if (!nav) {
    const err = new Error('Среда не поддерживает MediaDevices');
    err.name = 'NotFoundError';
    throw err;
  }

  // Ensure mediaDevices API exists with legacy fallback
  if (!nav.mediaDevices || !nav.mediaDevices.getUserMedia) {
    const legacyGetUserMedia = nav.getUserMedia || nav.webkitGetUserMedia || nav.mozGetUserMedia || nav.msGetUserMedia;
    if (legacyGetUserMedia) {
      return new Promise((resolve, reject) => {
        legacyGetUserMedia.call(nav, constraints, resolve, reject);
      });
    }
    const err = new Error('Браузер не поддерживает getUserMedia');
    err.name = 'NotFoundError';
    throw err;
  }

  try {
    return await nav.mediaDevices.getUserMedia(constraints);
  } catch (err: any) {
    const errName = err?.name || '';
    // If permission was denied or device not found, throw immediately
    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
      throw err;
    }

    // If constraint failed, retry with unconstrained video
    if (constraints.video && typeof constraints.video === 'object') {
      try {
        return await nav.mediaDevices.getUserMedia({
          ...constraints,
          video: true
        });
      } catch (relaxedErr) {
        throw relaxedErr;
      }
    }
    throw err;
  }
}

