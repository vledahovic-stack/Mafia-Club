import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, WifiOff, VolumeX } from 'lucide-react';
import { GangsterIcon } from './GangsterIcon';

interface PlayerVideoCardProps {
  stream?: MediaStream | null;
  isLocal: boolean;
  playerName: string;
  isAlive: boolean;
  isAudioEnabled?: boolean;
  isVideoEnabled?: boolean;
  blockIncomingVideo?: boolean;
  blockIncomingAudio?: boolean;
  className?: string;
  avatarSeed?: string;
}

export const PlayerVideoCard: React.FC<PlayerVideoCardProps> = ({
  stream,
  isLocal,
  playerName,
  isAlive,
  isAudioEnabled = true,
  isVideoEnabled = true,
  blockIncomingVideo = false,
  blockIncomingAudio = false,
  className = '',
  avatarSeed
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Bind video stream
  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
    }
  }, [stream]);

  // Bind audio stream for remote peer
  useEffect(() => {
    if (!isLocal && audioRef.current && stream) {
      if (audioRef.current.srcObject !== stream) {
        audioRef.current.srcObject = stream;
      }
      audioRef.current.muted = blockIncomingAudio;
    }
  }, [stream, isLocal, blockIncomingAudio]);

  const shouldRenderVideo = Boolean(
    stream && 
    isVideoEnabled && 
    (!blockIncomingVideo || isLocal) &&
    isAlive
  );

  return (
    <div className={`relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-inner flex items-center justify-center ${className}`}>
      
      {/* Remote Audio element (invisible) */}
      {!isLocal && (
        <audio 
          ref={audioRef} 
          autoPlay 
          playsInline 
          muted={blockIncomingAudio} 
        />
      )}

      {/* Live Video Feed - Autoscale & cover full container */}
      {shouldRenderVideo ? (
        <div className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className={`w-full h-full object-cover transition-opacity duration-300 ${isLocal ? 'scale-x-[-1]' : ''}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
        </div>
      ) : (
        /* Fallback Avatar when camera is off or video is blocked */
        <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-gradient-to-b from-[#181a24] to-[#101118]">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-zinc-800/90 border border-zinc-700/80 flex items-center justify-center shadow-lg">
            <GangsterIcon size={36} className="w-9 h-9 drop-shadow-md" />
          </div>

          {blockIncomingVideo && !isLocal && (
            <div className="mt-1 px-1.5 py-0.5 rounded bg-zinc-950/80 border border-zinc-800 text-[9px] font-mono text-zinc-400 flex items-center gap-1">
              <WifiOff className="w-2.5 h-2.5 text-amber-500" />
              <span>Экономия трафика</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Status Badges Overlay */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10 pointer-events-none">
        {/* Mic Indicator */}
        <div 
          className={`px-1.5 py-0.5 rounded-md flex items-center gap-1 text-[9px] font-mono font-bold backdrop-blur-xs shadow-sm ${
            isAudioEnabled && (!blockIncomingAudio || isLocal)
              ? 'bg-black/60 text-emerald-400 border border-emerald-500/30'
              : 'bg-rose-950/80 text-rose-300 border border-rose-800/50'
          }`}
        >
          {isAudioEnabled && (!blockIncomingAudio || isLocal) ? (
            <Mic className="w-2.5 h-2.5" />
          ) : (
            <MicOff className="w-2.5 h-2.5 text-rose-400" />
          )}
        </div>

        {/* Camera Indicator */}
        <div 
          className={`px-1.5 py-0.5 rounded-md flex items-center gap-1 text-[9px] font-mono font-bold backdrop-blur-xs shadow-sm ${
            isVideoEnabled && (!blockIncomingVideo || isLocal)
              ? 'bg-black/60 text-sky-400 border border-sky-500/30'
              : 'bg-zinc-900/80 text-zinc-400 border border-zinc-700/50'
          }`}
        >
          {isVideoEnabled && (!blockIncomingVideo || isLocal) ? (
            <Video className="w-2.5 h-2.5" />
          ) : (
            <VideoOff className="w-2.5 h-2.5 text-zinc-400" />
          )}
        </div>
      </div>

      {/* Audio Muted Overlay Indicator */}
      {!isLocal && blockIncomingAudio && (
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-rose-950/90 text-rose-300 border border-rose-800/60 text-[9px] font-mono flex items-center gap-1">
          <VolumeX className="w-2.5 h-2.5" />
          <span>Звук выкл</span>
        </div>
      )}
    </div>
  );
};
