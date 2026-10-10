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
  X
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
  onClearMediaError?: () => void;
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
  onClearMediaError,
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
              ? 'bg-sky-600/25 hover:bg-sky-600/35 border border-sky-500/50 text-sky-300'
              : 'bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-400'
          }`}
        >
          {isCameraOn ? (
            <>
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              <Video className="w-3.5 h-3.5" />
              <span>Камера</span>
            </>
          ) : (
            <>
              <VideoOff className="w-3.5 h-3.5" />
              <span>Камера выкл</span>
            </>
          )}
        </button>
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
        <div className="w-full mt-2 p-2.5 rounded-xl bg-amber-950/70 border border-amber-800/80 text-amber-200 text-xs flex items-start justify-between gap-2 shadow-lg animate-in fade-in duration-150">
          <div className="flex items-start gap-2 flex-1">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="leading-relaxed">
              <span>{mediaError}</span>
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
      )}
    </div>
  );
};
