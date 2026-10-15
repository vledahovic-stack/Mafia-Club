import React, { useEffect, useRef } from 'react';
import { RemotePeerInfo } from '../hooks/useWebRtc';

interface RemoteAudioItemProps {
  peer: RemotePeerInfo;
  isMuted: boolean;
}

const RemoteAudioItem: React.FC<RemoteAudioItemProps> = ({ peer, isMuted }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (el && peer.stream) {
      if (el.srcObject !== peer.stream) {
        el.srcObject = peer.stream;
      }
      el.play().catch(() => {
        // Autoplay may be deferred until user interacts with the page
      });
    }
  }, [peer.stream]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      muted={isMuted}
      className="hidden"
    />
  );
};

interface RemoteAudioRendererProps {
  remotePeers: Map<string, RemotePeerInfo>;
  blockIncomingAudio: boolean;
}

export const RemoteAudioRenderer: React.FC<RemoteAudioRendererProps> = ({
  remotePeers,
  blockIncomingAudio
}) => {
  const peerList = Array.from(remotePeers.values());

  return (
    <div className="hidden" aria-hidden="true">
      {peerList.map(peer => {
        const isMuted = blockIncomingAudio || !peer.mediaState.isAudioEnabled;
        return (
          <RemoteAudioItem
            key={peer.peerId}
            peer={peer}
            isMuted={isMuted}
          />
        );
      })}
    </div>
  );
};
