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
  startWithCameraOff: false
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
      frameRate: Math.max(10, Math.min(30, Number(parsed.frameRate) || 15))
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
      return 'Доступ к камере заблокирован в браузере. Разрешите камеру в настройках сайта (значок замка или камеры слева в адресной строке) и нажмите снова.';
    }
    if (device === 'mic') {
      return 'Доступ к микрофону заблокирован в браузере. Разрешите микрофон в адресной строке и нажмите снова.';
    }
    return 'Доступ к камере/микрофону заблокирован. Разрешите доступ в настройках браузера (значок замка в адресной строке).';
  }

  if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
    if (device === 'camera') {
      return 'Веб-камера не обнаружена на вашем компьютере. Подключите камеру и повторите попытку.';
    }
    return 'Медиаустройства (камера или микрофон) не найдены на вашем устройстве.';
  }

  if (errName === 'NotReadableError' || errName === 'TrackStartError') {
    return 'Камера или микрофон уже заняты другим приложением (Zoom, OBS, Discord или другая вкладка браузера). Освободите устройство и повторите.';
  }

  if (errName === 'OverconstrainedError') {
    return 'Выбранный формат видео не поддерживается веб-камерой. Автоматически переключаем на поддерживаемый режим.';
  }

  if (errName === 'TypeError') {
    return 'Некорректные параметры медиаустройств в браузере.';
  }

  return errMsg ? `Ошибка доступа: ${errMsg}` : 'Не удалось получить доступ к камере или микрофону.';
}

/**
 * Robustly requests user media with progressive fallbacks to prevent OverconstrainedError or driver failures.
 */
export async function safeGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('WebRTC не поддерживается данным браузером');
  }

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err: any) {
    console.warn('Initial safeGetUserMedia failed with specified constraints, trying relaxed constraints:', err);
    
    // If video was requested with specific constraints, fallback to { video: true }
    if (constraints.video && typeof constraints.video === 'object') {
      try {
        return await navigator.mediaDevices.getUserMedia({
          ...constraints,
          video: true
        });
      } catch (videoRelaxedErr) {
        console.warn('Relaxed video: true also failed:', videoRelaxedErr);
        throw videoRelaxedErr;
      }
    }
    throw err;
  }
}
