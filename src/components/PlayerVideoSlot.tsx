import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, Skull, WifiOff } from 'lucide-react';
import { GangsterIcon } from './GangsterIcon';
import { RemotePeerInfo } from '../hooks/useWebRtc';

interface PlayerVideoSlotProps {
  playerId: string;
  isMe: boolean;
  isAlive: boolean;
  isSpeaker?: boolean;
  localStream: MediaStream | null;
  isLocalCameraOn: boolean;
  isLocalMicOn: boolean;
  isLocalSpeaking?: boolean;
  remotePeer?: RemotePeerInfo;
  blockIncomingVideo: boolean;
  dataSaverMode: boolean;
  className?: string;
}

export const PlayerVideoSlot: React.FC<PlayerVideoSlotProps> = ({
  playerId,
  isMe,
  isAlive,
  isSpeaker,
  localStream,
  isLocalCameraOn,
  isLocalMicOn,
  isLocalSpeaking,
  remotePeer,
  blockIncomingVideo,
  dataSaverMode,
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
    <div className={`relative w-full aspect-[4/3] min-h-[92px] max-h-[140px] rounded-xl overflow-hidden bg-black/60 border border-zinc-800/80 shadow-inner flex items-center justify-center transition-all ${className} ${
      isSpeaker ? 'ring-2 ring-amber-500/70 border-amber-500 shadow-amber-950/40' : ''
    }`}>
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
          <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-white/10 text-[9px] font-mono">
            {isAudioActive ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <Mic className="w-2.5 h-2.5" />
                <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${isSpeaker || isLocalSpeaking ? 'animate-ping' : 'animate-pulse'}`} />
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-400">
                <MicOff className="w-2.5 h-2.5" />
              </span>
            )}
          </div>

          {/* Top-right WebRTC Camera Indicator Badge */}
          <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-white/10 text-[9px] font-mono text-sky-400">
            <Video className="w-2.5 h-2.5" />
            <span className="text-[8px] uppercase tracking-wider">{isMe ? 'ВЫ' : 'LIVE'}</span>
          </div>
        </>
      ) : (
        /* Noir Gangster Avatar Fallback when camera is off or blocked */
        <div className="relative w-full h-full flex flex-col items-center justify-center p-2 bg-gradient-to-b from-[#14151e] to-[#0d0e14]">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center border shadow-inner transition-all duration-500 ${
            !isAlive
              ? 'bg-zinc-950 border-rose-900/60 text-zinc-500 opacity-60 grayscale'
              : isSpeaker
              ? 'bg-amber-950 border-amber-600 text-amber-200'
              : 'bg-zinc-800 border-zinc-700 text-zinc-200'
          }`}>
            <GangsterIcon size={28} className={`w-7 h-7 ${!isAlive ? 'opacity-30' : ''}`} />
          </div>

          {/* Notice if incoming video was intentionally blocked by player */}
          {!isMe && (blockIncomingVideo || dataSaverMode) && remotePeer?.mediaState.isVideoEnabled && (
            <div className="absolute bottom-1 px-1.5 py-0.5 rounded bg-zinc-900/90 border border-zinc-750 text-[8px] text-zinc-400 font-mono flex items-center gap-1">
              <WifiOff className="w-2.5 h-2.5 text-amber-400" />
              <span>Видео скрыто</span>
            </div>
          )}

          {/* Status indicators */}
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
            {isAudioActive ? (
              <span className="p-1 rounded bg-black/60 text-emerald-400 border border-white/10" title="Микрофон включен">
                <Mic className="w-2.5 h-2.5" />
              </span>
            ) : (
              <span className="p-1 rounded bg-black/60 text-zinc-500 border border-white/10" title="Микрофон выключен">
                <MicOff className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
        </div>
      )}

      {/* Cross-out overlay if player is dead */}
      {!isAlive && (
        <div className="absolute inset-0 rounded-xl flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-[1px]">
          <svg className="w-full h-full text-rose-600 drop-shadow-[0_0_4px_rgba(225,29,72,0.9)] opacity-85" viewBox="0 0 100 80" preserveAspectRatio="none">
            <line x1="8" y1="8" x2="92" y2="72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <line x1="92" y1="8" x2="8" y2="72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <div className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-rose-950 border border-rose-600 flex items-center justify-center shadow">
            <Skull className="w-3 h-3 text-rose-300" />
          </div>
        </div>
      )}
    </div>
  );
};
