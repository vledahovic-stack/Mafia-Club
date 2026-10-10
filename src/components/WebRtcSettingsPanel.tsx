import React, { useState, useEffect, useRef } from 'react';
import { 
  WebRtcSettings, 
  VideoResolution, 
  AVAILABLE_RESOLUTIONS, 
  AVAILABLE_FPS 
} from '../types/webrtc';
import { 
  Video, 
  VideoOff,
  Activity, 
  WifiOff, 
  VolumeX, 
  Mic,
  MicOff, 
  Check, 
  Info,
  Radio,
  Gauge,
  Sliders,
  Eye,
  Camera,
  AlertCircle
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { getVideoConstraints, safeGetUserMedia, formatMediaError } from '../utils/webrtcSettings';

interface WebRtcSettingsPanelProps {
  settings: WebRtcSettings;
  onUpdateSettings: (partial: Partial<WebRtcSettings>) => void;
}

export const WebRtcSettingsPanel: React.FC<WebRtcSettingsPanelProps> = ({
  settings,
  onUpdateSettings
}) => {
  // Live camera preview state inside settings modal
  const [isPreviewActive, setIsPreviewActive] = useState<boolean>(false);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // Start or stop live camera preview
  const togglePreview = async () => {
    sounds.playTick();
    if (isPreviewActive) {
      if (previewStream) {
        previewStream.getTracks().forEach(t => t.stop());
      }
      setPreviewStream(null);
      setIsPreviewActive(false);
      setPreviewError(null);
    } else {
      setPreviewError(null);
      try {
        const videoConstraints = getVideoConstraints(settings);
        const stream = await safeGetUserMedia({
          audio: false,
          video: videoConstraints
        });
        setPreviewStream(stream);
        setIsPreviewActive(true);
      } catch (err: any) {
        console.warn('Preview camera error:', err);
        setPreviewError(formatMediaError(err, 'camera'));
      }
    }
  };

  // Re-acquire preview stream if resolution/FPS changes while preview is active
  useEffect(() => {
    if (isPreviewActive && previewStream) {
      let isCancelled = false;
      const restart = async () => {
        try {
          previewStream.getTracks().forEach(t => t.stop());
          const videoConstraints = getVideoConstraints(settings);
          const newStream = await safeGetUserMedia({
            audio: false,
            video: videoConstraints
          });
          if (!isCancelled) {
            setPreviewStream(newStream);
          } else {
            newStream.getTracks().forEach(t => t.stop());
          }
        } catch (err: any) {
          if (!isCancelled) {
            setPreviewError(formatMediaError(err, 'camera'));
          }
        }
      };
      restart();
      return () => { isCancelled = true; };
    }
  }, [settings.resolution, settings.frameRate]);

  // Attach stream to video tag
  useEffect(() => {
    if (previewVideoRef.current && previewStream) {
      previewVideoRef.current.srcObject = previewStream;
      previewVideoRef.current.play().catch(() => {});
    }
  }, [previewStream]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (previewStream) {
        previewStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [previewStream]);

  return (
    <div className="space-y-5 text-left select-none">
      
      {/* Intro badge */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-950/40 to-purple-950/30 border border-indigo-850/50 flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-indigo-900/60 border border-indigo-700/60 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
          <Radio className="w-4 h-4 animate-pulse" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-bold text-white flex items-center gap-2">
            <span>Пиринговая связь WebRTC (P2P)</span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/40">
              Direct Peer-to-Peer
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Прямое шифрованное соединение между браузерами игроков. Аудио- и видеопотоки управляются независимо, а видеопоток автоматически заполняет контейнер места за столом.
          </p>
        </div>
      </div>

      {/* Live Camera Test Preview Card */}
      <div className="p-3.5 rounded-2xl bg-[#14151f] border border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-zinc-200">Тест веб-камеры и микрофона</span>
          </div>
          <button
            type="button"
            onClick={togglePreview}
            className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
              isPreviewActive
                ? 'bg-rose-950/70 border border-rose-800 text-rose-300 hover:bg-rose-900/80'
                : 'bg-sky-600/30 border border-sky-500/60 text-sky-300 hover:bg-sky-600/40'
            }`}
          >
            {isPreviewActive ? (
              <>
                <VideoOff className="w-3.5 h-3.5" />
                <span>Остановить тест</span>
              </>
            ) : (
              <>
                <Video className="w-3.5 h-3.5" />
                <span>Включить тест камеры</span>
              </>
            )}
          </button>
        </div>

        {isPreviewActive && (
          <div className="relative w-full aspect-[4/3] max-h-48 rounded-xl overflow-hidden bg-black/80 border border-zinc-700/80 flex items-center justify-center animate-in fade-in duration-200">
            <video
              ref={previewVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10 text-[10px] font-mono text-zinc-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{settings.resolution}</span>
              <span>•</span>
              <span>{settings.frameRate} FPS</span>
            </div>
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-sky-950/80 border border-sky-700/70 text-[9px] font-mono text-sky-300">
              Авто-масштабирование (cover)
            </div>
          </div>
        )}

        {previewError && (
          <div className="text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800/80 p-3 rounded-xl space-y-2 animate-in fade-in">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                {previewError}
              </div>
            </div>
            <button
              type="button"
              onClick={togglePreview}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-200 underline block"
            >
              Повторить попытку
            </button>
          </div>
        )}
      </div>

      {/* 1. Resolution Selection (160x120 up to 320x240 max) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
            <Video className="w-4 h-4 text-amber-500" />
            <span>Разрешение видео (от 160x120 до 320x240)</span>
          </label>
          <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-900/60">
            {settings.resolution}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {AVAILABLE_RESOLUTIONS.map(res => {
            const isSelected = settings.resolution === res.id;
            return (
              <button
                key={res.id}
                type="button"
                onClick={() => {
                  sounds.playTick();
                  onUpdateSettings({ resolution: res.id });
                }}
                className={`p-2 rounded-xl border text-left transition-all relative overflow-hidden ${
                  isSelected
                    ? 'bg-amber-950/50 border-amber-500 text-white shadow-sm ring-1 ring-amber-500/50'
                    : 'bg-[#151620] hover:bg-[#1b1d2a] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-zinc-200">{res.id}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <div className="text-[9px] text-zinc-400 mt-1 truncate">
                  {res.label.split('(')[1]?.replace(')', '') || res.aspectRatio}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-zinc-500 flex items-center gap-1">
          <Info className="w-3 h-3 text-zinc-400 shrink-0" />
          <span>Видеопоток автоматически масштабируется и заполняет контейнер места игрока без искажений.</span>
        </p>
      </div>

      {/* 2. Framerate (FPS) Selection (10 to 30) */}
      <div className="space-y-3 pt-2 border-t border-zinc-850">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Частота кадров (FPS: 10 – 30 кадров/сек)</span>
          </label>
          <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-900/60">
            {settings.frameRate} FPS
          </span>
        </div>

        {/* Range Slider from 10 to 30 FPS */}
        <div className="space-y-1.5 px-1">
          <input
            type="range"
            min={10}
            max={30}
            step={1}
            value={settings.frameRate}
            onChange={(e) => {
              const val = Number(e.target.value);
              onUpdateSettings({ frameRate: val });
            }}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
            <span>10 FPS (Мин.)</span>
            <span>20 FPS</span>
            <span>30 FPS (Макс.)</span>
          </div>
        </div>

        {/* Quick FPS Presets */}
        <div className="grid grid-cols-5 gap-2">
          {AVAILABLE_FPS.map(fps => {
            const isSelected = settings.frameRate === fps;
            return (
              <button
                key={fps}
                type="button"
                onClick={() => {
                  sounds.playTick();
                  onUpdateSettings({ frameRate: fps });
                }}
                className={`py-1.5 px-1 rounded-xl border text-center transition-all ${
                  isSelected
                    ? 'bg-emerald-950/50 border-emerald-500 text-emerald-300 font-bold shadow-sm'
                    : 'bg-[#151620] hover:bg-[#1b1d2a] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className="text-xs font-mono">{fps}</span>
                <span className="text-[8px] block text-zinc-500 font-mono">FPS</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Traffic Optimization & Weak Internet Controls */}
      <div className="space-y-2.5 pt-2 border-t border-zinc-850">
        <div className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 mb-2">
          <Gauge className="w-4 h-4 text-sky-400" />
          <span>Оптимизация для слабого интернета</span>
        </div>

        {/* Forced block incoming video */}
        <div className="p-3 rounded-xl bg-[#151620] border border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-white">Блокировать приём чужих видео</div>
              <div className="text-[10px] text-zinc-400">Скрывает входящее видео участников на вашей стороне (экономит ~85% трафика)</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              onUpdateSettings({ blockIncomingVideo: !settings.blockIncomingVideo });
            }}
            className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
              settings.blockIncomingVideo ? 'bg-amber-600' : 'bg-zinc-800'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
              settings.blockIncomingVideo ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {/* Forced block incoming audio */}
        <div className="p-3 rounded-xl bg-[#151620] border border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <VolumeX className="w-4 h-4 text-rose-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-white">Блокировать приём чужого звука</div>
              <div className="text-[10px] text-zinc-400">Принудительно заглушает звук всех остальных участников на вашей стороне</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              onUpdateSettings({ blockIncomingAudio: !settings.blockIncomingAudio });
            }}
            className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
              settings.blockIncomingAudio ? 'bg-rose-600' : 'bg-zinc-800'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
              settings.blockIncomingAudio ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {/* Default Startup Toggles */}
        <div className="p-3 rounded-xl bg-[#151620] border border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <MicOff className="w-4 h-4 text-zinc-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-white">Входить с выключенным микрофоном</div>
              <div className="text-[10px] text-zinc-400">Микрофон остаётся заглушен до вашего включения</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              onUpdateSettings({ startWithMicMuted: !settings.startWithMicMuted });
            }}
            className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
              settings.startWithMicMuted ? 'bg-indigo-600' : 'bg-zinc-800'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
              settings.startWithMicMuted ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-[#151620] border border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Video className="w-4 h-4 text-zinc-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-white">Входить с выключенной камерой</div>
              <div className="text-[10px] text-zinc-400">Камера не включается автоматически при входе в комнату</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              onUpdateSettings({ startWithCameraOff: !settings.startWithCameraOff });
            }}
            className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
              settings.startWithCameraOff ? 'bg-indigo-600' : 'bg-zinc-800'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
              settings.startWithCameraOff ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </div>

    </div>
  );
};
