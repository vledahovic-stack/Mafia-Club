import React from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Wifi, 
  WifiOff, 
  Volume2, 
  VolumeX, 
  Settings, 
  AlertCircle,
  Radio,
  X,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { WebRtcSettings, VideoResolution } from '../types/webrtc';
import { sounds } from '../utils/audio';

interface WebRtcControlsBarProps {
  isMicOn: boolean;
  isCameraOn: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  settings: WebRtcSettings;
  onToggleDataSaver: () => void;
  onToggleBlockVideo: () => void;
  onToggleBlockAudio: () => void;
  onOpenSettings: () => void;
  mediaError?: string | null;
  mediaErrorCode?: 'NotAllowedError' | 'NotFoundError' | 'NotReadableError' | 'OverconstrainedError' | 'Unknown' | null;
  onClearMediaError?: () => void;
  isVirtualCamera?: boolean;
  onEnableVirtualCamera?: () => void;
  className?: string;
}

export const WebRtcControlsBar: React.FC<WebRtcControlsBarProps> = ({
  isMicOn,
  isCameraOn,
  onToggleMic,
  onToggleCamera,
  settings,
  onToggleDataSaver,
  onToggleBlockVideo,
  onToggleBlockAudio,
  onOpenSettings,
  mediaError,
  mediaErrorCode,
  onClearMediaError,
  isVirtualCamera,
  onEnableVirtualCamera,
  className = ''
}) => {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-[#12131b]/95 border border-zinc-800/90 shadow-xl backdrop-blur-md ${className}`}>
      
      {/* Left: Device Toggles (Mic & Camera) */}
      <div className="flex items-center gap-1.5">
        
        {/* Microphone Toggle */}
        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            onToggleMic();
          }}
          title={isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 ${
            isMicOn
              ? 'bg-emerald-600/25 hover:bg-emerald-600/35 border border-emerald-500/50 text-emerald-300'
              : 'bg-rose-950/60 hover:bg-rose-950/80 border border-rose-800/60 text-rose-300'
          }`}
        >
          {isMicOn ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <Mic className="w-3.5 h-3.5" />
              <span>Микрофон</span>
            </>
          ) : (
            <>
              <MicOff className="w-3.5 h-3.5" />
              <span>Микр. выкл</span>
            </>
          )}
        </button>

        {/* Camera Toggle */}
        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            onToggleCamera();
          }}
          title={isCameraOn ? 'Выключить камеру' : 'Включить камеру'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 ${
            isCameraOn
              ? isVirtualCamera
                ? 'bg-purple-600/25 hover:bg-purple-600/35 border border-purple-500/60 text-purple-300'
                : 'bg-sky-600/25 hover:bg-sky-600/35 border border-sky-500/50 text-sky-300'
              : 'bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-400'
          }`}
        >
          {isCameraOn ? (
            <>
              <span className={`w-2 h-2 rounded-full ${isVirtualCamera ? 'bg-purple-400' : 'bg-sky-400'} animate-pulse`} />
              <Video className="w-3.5 h-3.5" />
              <span>{isVirtualCamera ? 'Демо-камера' : 'Камера'}</span>
            </>
          ) : (
            <>
              <VideoOff className="w-3.5 h-3.5" />
              <span>Камера выкл</span>
            </>
          )}
        </button>

        {/* Quick fallback virtual camera button when camera is off */}
        {!isCameraOn && onEnableVirtualCamera && (
          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              onEnableVirtualCamera();
            }}
            title="Включить виртуальную демо-камеру без физического устройства"
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-purple-950/50 hover:bg-purple-900/60 border border-purple-800/60 text-purple-300 transition-all shadow-sm active:scale-95"
          >
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Демо-видео</span>
          </button>
        )}
      </div>

      {/* Middle: Weak Internet / Traffic Optimization Controls */}
      <div className="flex items-center gap-1.5">
        
        {/* Data Saver Mode Toggle */}
        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            onToggleDataSaver();
          }}
          title={settings.dataSaverMode ? 'Режим экономии трафика включён' : 'Включить режим экономии трафика для слабого интернета'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
            settings.dataSaverMode
              ? 'bg-amber-950/60 border-amber-600/70 text-amber-300'
              : 'bg-zinc-900/80 hover:bg-zinc-850 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {settings.dataSaverMode ? (
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Wifi className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">Экономия трафика</span>
          {settings.dataSaverMode && (
            <span className="text-[10px] font-mono font-bold bg-amber-500/20 px-1 rounded text-amber-300">ВКЛ</span>
          )}
        </button>

        {/* Block Incoming Video (Client-side optimization) */}
        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            onToggleBlockVideo();
          }}
          title={settings.blockIncomingVideo ? 'Чужое видео скрыто (экономия трафика)' : 'Скрыть входящие видео участников'}
          className={`p-1.5 rounded-xl border text-xs transition-colors ${
            settings.blockIncomingVideo
              ? 'bg-rose-950/60 border-rose-800 text-rose-300'
              : 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {settings.blockIncomingVideo ? (
            <VideoOff className="w-3.5 h-3.5" />
          ) : (
            <Video className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Block Incoming Audio (Mute all remote) */}
        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            onToggleBlockAudio();
          }}
          title={settings.blockIncomingAudio ? 'Входящий звук заглушен' : 'Заглушить звук всех участников'}
          className={`p-1.5 rounded-xl border text-xs transition-colors ${
            settings.blockIncomingAudio
              ? 'bg-rose-950/60 border-rose-800 text-rose-300'
              : 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {settings.blockIncomingAudio ? (
            <VolumeX className="w-3.5 h-3.5" />
          ) : (
            <Volume2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Right: Resolution indicator & Settings shortcut */}
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-1 rounded-lg border border-zinc-800/80">
          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span>WebRTC P2P</span>
          <span>•</span>
          <span className="text-zinc-300 font-bold">{settings.resolution}</span>
          <span>•</span>
          <span>{settings.frameRate} FPS</span>
        </div>

        <button
          type="button"
          onClick={() => {
            sounds.playTick();
            onOpenSettings();
          }}
          title="Настройки видеосвязи WebRTC"
          className="p-1.5 rounded-xl bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 text-zinc-300 hover:text-white transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Error alert toast if permission issue occurred */}
      {mediaError && (
        <div className="w-full mt-2 p-2.5 rounded-xl bg-amber-950/80 border border-amber-800/90 text-amber-200 text-xs space-y-2 shadow-lg animate-in fade-in duration-150">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="leading-relaxed space-y-1">
                <span className="font-semibold">{mediaError}</span>
                {mediaErrorCode === 'NotAllowedError' && (
                  <p className="text-[10px] text-zinc-300 bg-black/40 p-1.5 rounded border border-amber-900/40">
                    💡 <b>Инструкция:</b> Нажмите на значок 🔒 (замок) или 📷 (камера) в строке браузера слева от адреса сайта, переключите «Камера» в положение «Разрешить» и нажмите кнопку «Повторить запрос».
                  </p>
                )}
                {mediaErrorCode === 'NotFoundError' && (
                  <p className="text-[10px] text-zinc-300 bg-black/40 p-1.5 rounded border border-amber-900/40">
                    💡 <b>Инструкция:</b> Веб-камера не обнаружена на компьютере. Вы можете включить демо-камеру прямо сейчас, чтобы ваш слот отображал стилизованное видео с аватаром.
                  </p>
                )}
              </div>
            </div>
            {onClearMediaError && (
              <button
                type="button"
                onClick={onClearMediaError}
                className="p-1 rounded-lg text-amber-400 hover:text-white hover:bg-amber-900/60 transition-colors shrink-0"
                title="Закрыть уведомление"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action buttons inside error toast */}
          <div className="flex items-center gap-2 pt-1.5 border-t border-amber-900/60 flex-wrap">
            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                onToggleCamera();
              }}
              className="px-2 py-1 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/60 text-amber-200 text-xs font-bold flex items-center gap-1 transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Повторить запрос</span>
            </button>
            {onEnableVirtualCamera && (
              <button
                type="button"
                onClick={() => {
                  sounds.playTick();
                  onEnableVirtualCamera();
                }}
                className="px-2 py-1 rounded-lg bg-purple-900/40 hover:bg-purple-900/60 border border-purple-700/60 text-purple-200 text-xs font-bold flex items-center gap-1 transition-all"
              >
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span>Включить демо-камеру</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                onOpenSettings();
              }}
              className="px-2 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1 transition-all ml-auto"
            >
              <Settings className="w-3 h-3" />
              <span>Настройки</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
