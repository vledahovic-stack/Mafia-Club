export type VideoResolution = 
  | '160x120'
  | '176x144'
  | '200x150'
  | '240x160'
  | '240x180'
  | '256x144'
  | '320x180'
  | '320x240';

export interface ResolutionConfig {
  id: VideoResolution;
  label: string;
  width: number;
  height: number;
  aspectRatio: string;
  trafficCategory: 'ultra-low' | 'low' | 'medium' | 'standard';
}

export const AVAILABLE_RESOLUTIONS: ResolutionConfig[] = [
  { id: '160x120', label: '160x120 (QQVGA • Мин.)', width: 160, height: 120, aspectRatio: '4:3', trafficCategory: 'ultra-low' },
  { id: '176x144', label: '176x144 (QCIF • Низкое)', width: 176, height: 144, aspectRatio: '11:9', trafficCategory: 'ultra-low' },
  { id: '200x150', label: '200x150 (Компактное)', width: 200, height: 150, aspectRatio: '4:3', trafficCategory: 'low' },
  { id: '240x160', label: '240x160 (3:2 Формат)', width: 240, height: 160, aspectRatio: '3:2', trafficCategory: 'low' },
  { id: '240x180', label: '240x180 (Сбалансированное)', width: 240, height: 180, aspectRatio: '4:3', trafficCategory: 'low' },
  { id: '256x144', label: '256x144 (144p Широкоэкран.)', width: 256, height: 144, aspectRatio: '16:9', trafficCategory: 'low' },
  { id: '320x180', label: '320x180 (180p Широкоэкран.)', width: 320, height: 180, aspectRatio: '16:9', trafficCategory: 'medium' },
  { id: '320x240', label: '320x240 (QVGA • Макс.)', width: 320, height: 240, aspectRatio: '4:3', trafficCategory: 'standard' },
];

export const AVAILABLE_FPS: number[] = [10, 15, 20, 24, 30];

export interface WebRtcSettings {
  enabled: boolean;
  resolution: VideoResolution;
  frameRate: number; // 10 to 30
  blockIncomingVideo: boolean; // Принудительно отключить приём видео других участников
  blockIncomingAudio: boolean; // Принудительно отключить приём аудио других участников
  dataSaverMode: boolean; // Режим максимальной экономии трафика
  startWithMicMuted: boolean;
  startWithCameraOff: boolean;
}

export interface PeerMediaState {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSpeaking?: boolean;
}
