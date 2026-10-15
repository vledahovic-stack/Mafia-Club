import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, Skull, WifiOff } from 'lucide-react';
import { GangsterIcon } from './GangsterIcon';
import { RemotePeerInfo } from '../hooks/useWebRtc';

interface PlayerVideoSlotProps {
  playerId: string;
  isMe: boolean;
  isAlive: boolean;
  isSpeaker?: boolean;
  isSpotlight?: boolean;
  fillCard?: boolean;
  compactFill?: boolean;
  localStream: MediaStream | null;
  isLocalCameraOn: boolean;
  isLocalMicOn: boolean;
  isLocalSpeaking?: boolean;
  remotePeer?: RemotePeerInfo;
  blockIncomingVideo: boolean;
  dataSaverMode: boolean;
  onToggleMic?: () => void;
  onToggleCamera?: () => void;
  className?: string;
}

export const PlayerVideoSlot: React.FC<PlayerVideoSlotProps> = ({
  playerId,
  isMe,
  isAlive,
  isSpeaker,
  isSpotlight = false,
  fillCard = false,
  compactFill = false,
  localStream,
  isLocalCameraOn,
  isLocalMicOn,
  isLocalSpeaking,
  remotePeer,
  blockIncomingVideo,
  dataSaverMode,
  onToggleMic,
  onToggleCamera,
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const hasRemoteVideo = Boolean(
    remotePeer &&
    remotePeer.stream &&
    remotePeer.mediaState.isVideoEnabled &&
    !blockIncomingVideo &&
    !dataSaverMode &&
    remotePeer.stream.getVideoTracks().length > 0
  );

  const showVideo = isMe ? (isLocalCameraOn && localStream && localStream.getVideoTracks().length > 0) : hasRemoteVideo;
  const activeStream = isMe ? localStream : remotePeer?.stream;

  const isAudioActive = isMe
    ? isLocalMicOn
    : Boolean(remotePeer?.mediaState.isAudioEnabled);

  // Attach stream to video element
  const videoTrackId = activeStream?.getVideoTracks()[0]?.id;

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && showVideo && activeStream) {
      videoEl.srcObject = activeStream;
      videoEl.play().catch(() => {
        // Handled silently
      });
    }
  }, [showVideo, activeStream, videoTrackId]);

  return (
    <div className={`relative w-full overflow-hidden bg-black/60 shadow-inner flex items-center justify-center transition-all ${
      fillCard
        ? 'w-full h-full rounded-none border-0'
        : isSpotlight 
        ? 'aspect-video min-h-[130px] max-h-[220px] rounded-xl border border-zinc-800/80' 
        : 'aspect-[4/3] sm:aspect-[16/11] min-h-[56px] max-h-[96px] rounded-lg border border-zinc-800/80'
    } ${
      !fillCard && isSpeaker ? 'ring-2 ring-amber-500/80 border-amber-500 shadow-amber-950/40' : ''
    } ${className}`}>
      {showVideo ? (
        <>
          {/* Real Live Scaled Video Element - Fills container completely */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={true} // Local and remote videos muted here; remote audio handled independently
            className={`w-full h-full object-cover transition-all duration-500 ${
              isMe ? '-scale-x-100' : ''
            } ${!isAlive ? 'grayscale contrast-125 opacity-40' : ''}`}
          />

          {/* Top-left Audio Status Badge */}
          <div className={`absolute z-10 flex items-center gap-0.5 bg-black/70 backdrop-blur-md px-1 py-0.5 rounded border border-white/10 text-[8px] font-mono ${
            compactFill ? 'top-6 left-1' : fillCard ? 'top-10 left-2' : 'top-1 left-1'
          }`}>
            {isAudioActive ? (
              <span className="flex items-center gap-0.5 text-emerald-400">
                <Mic className={isSpotlight || fillCard ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
                <span className={`w-1 h-1 rounded-full bg-emerald-400 ${isSpeaker || isLocalSpeaking ? 'animate-ping' : 'animate-pulse'}`} />
              </span>
            ) : (
              <span className="flex items-center text-rose-400">
                <MicOff className={isSpotlight || fillCard ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
              </span>
            )}
          </div>

          {/* Top-right WebRTC Camera Indicator Badge */}
          <div className={`absolute z-10 flex items-center gap-0.5 bg-black/70 backdrop-blur-md px-1 py-0.5 rounded border border-white/10 text-[8px] font-mono text-sky-400 ${
            compactFill ? 'top-6 right-1' : fillCard ? 'top-10 right-2' : 'top-1 right-1'
          }`}>
            <Video className={isSpotlight || fillCard ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
            <span className="text-[7px] uppercase tracking-wider">{isMe ? 'ВЫ' : 'LIVE'}</span>
          </div>
        </>
      ) : (
        /* Noir Gangster Avatar Fallback when camera is off or blocked */
        <div className="relative w-full h-full flex flex-col items-center justify-center p-1 bg-gradient-to-b from-[#14151e] to-[#0d0e14]">
          <div className={`flex items-center justify-center border shadow-inner transition-all duration-500 ${
            compactFill
              ? 'w-8 h-8 sm:w-10 sm:h-10 rounded-xl'
              : fillCard
              ? 'w-16 h-16 sm:w-20 sm:h-20 rounded-2xl'
              : isSpotlight
              ? 'w-14 h-14 sm:w-16 sm:h-16 rounded-2xl'
              : 'w-7 h-7 sm:w-8 sm:h-8 rounded-full'
          } ${
            !isAlive
              ? 'bg-zinc-950 border-rose-900/60 text-zinc-500 opacity-60 grayscale'
              : isSpeaker
              ? 'bg-amber-950 border-amber-600 text-amber-200'
              : 'bg-zinc-800 border-zinc-700 text-zinc-200'
          }`}>
            <GangsterIcon 
              size={compactFill ? 22 : fillCard ? 42 : isSpotlight ? 36 : 20} 
              className={`${compactFill ? 'w-5 h-5 sm:w-6 sm:h-6' : fillCard ? 'w-10 h-10 sm:w-12 sm:h-12' : isSpotlight ? 'w-8 h-8 sm:w-9 sm:h-9' : 'w-4 h-4 sm:w-5 sm:h-5'} ${!isAlive ? 'opacity-30' : ''}`} 
            />
          </div>

          {/* Notice if incoming video was intentionally blocked by player */}
          {!isMe && (blockIncomingVideo || dataSaverMode) && remotePeer?.mediaState.isVideoEnabled && (
            <div className="absolute bottom-1 px-1 py-0.5 rounded bg-zinc-900/90 border border-zinc-750 text-[7px] text-zinc-400 font-mono flex items-center gap-1">
              <WifiOff className="w-2 h-2 text-amber-400" />
              <span>Видео</span>
            </div>
          )}

          {/* Status indicators */}
          <div className={`absolute flex items-center gap-0.5 ${
            compactFill ? 'top-6 left-1' : fillCard ? 'top-10 left-2' : 'top-1 left-1'
          }`}>
            {isAudioActive ? (
              <span className="p-0.5 rounded bg-black/70 text-emerald-400 border border-white/10" title="Микрофон включен">
                <Mic className={isSpotlight || fillCard ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
              </span>
            ) : (
              <span className="p-0.5 rounded bg-black/70 text-zinc-500 border border-white/10" title="Микрофон выключен">
                <MicOff className={isSpotlight || fillCard ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
              </span>
            )}
          </div>
        </div>
      )}

      {/* Interactive Controls Overlay for local user (Mic & Camera toggles) */}
      {isMe && isAlive && (onToggleMic || onToggleCamera) && (
        <div className={`absolute z-20 flex items-center gap-0.5 bg-black/80 backdrop-blur-md p-0.5 rounded border border-zinc-700/80 shadow ${
          compactFill ? 'bottom-6 right-1' : fillCard ? 'bottom-2 right-2' : 'bottom-1 right-1'
        }`}>
          {onToggleMic && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMic();
              }}
              title={isLocalMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
              className={`p-0.5 rounded transition-all ${
                isLocalMicOn
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-600/70 hover:bg-emerald-900'
                  : 'bg-rose-950/80 text-rose-400 border border-rose-600/70 hover:bg-rose-900'
              }`}
            >
              {isLocalMicOn ? <Mic className="w-2.5 h-2.5" /> : <MicOff className="w-2.5 h-2.5" />}
            </button>
          )}

          {onToggleCamera && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCamera();
              }}
              title={isLocalCameraOn ? 'Выключить камеру' : 'Включить камеру'}
              className={`p-0.5 rounded transition-all ${
                isLocalCameraOn
                  ? 'bg-sky-950/80 text-sky-400 border border-sky-600/70 hover:bg-sky-900'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {isLocalCameraOn ? <Video className="w-2.5 h-2.5" /> : <VideoOff className="w-2.5 h-2.5" />}
            </button>
          )}
        </div>
      )}

      {/* Cross-out overlay if player is dead */}
      {!isAlive && (
        <div className="absolute inset-0 rounded-lg flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-[1px]">
          <svg className="w-full h-full text-rose-600 drop-shadow-[0_0_4px_rgba(225,29,72,0.9)] opacity-85" viewBox="0 0 100 80" preserveAspectRatio="none">
            <line x1="8" y1="8" x2="92" y2="72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <line x1="92" y1="8" x2="8" y2="72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-rose-950 border border-rose-600 flex items-center justify-center shadow">
            <Skull className="w-2.5 h-2.5 text-rose-300" />
          </div>
        </div>
      )}
    </div>
  );
};
