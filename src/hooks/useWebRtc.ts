import { useState, useEffect, useRef, useCallback } from 'react';
import { WebRtcSettings, PeerMediaState, VideoResolution } from '../types/webrtc';
import { 
  loadWebRtcSettings, 
  saveWebRtcSettings, 
  getVideoConstraints,
  getAudioConstraints,
  getConstraintsFromSettings,
  safeGetUserMedia,
  formatMediaError
} from '../utils/webrtcSettings';

export interface RemotePeerInfo {
  peerId: string;
  stream: MediaStream;
  mediaState: PeerMediaState;
}

interface UseWebRtcProps {
  wsRef: React.MutableRefObject<WebSocket | null>;
  myPlayerId: string;
  roomCode?: string;
  isInsideRoom: boolean;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export function useWebRtc({ wsRef, myPlayerId, roomCode, isInsideRoom }: UseWebRtcProps) {
  const [settings, setSettings] = useState<WebRtcSettings>(loadWebRtcSettings);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeerInfo>>(new Map());
  
  const [isMicOn, setIsMicOn] = useState<boolean>(!settings.startWithMicMuted);
  const [isCameraOn, setIsCameraOn] = useState<boolean>(!settings.startWithCameraOff);
  const [isInitializingMedia, setIsInitializingMedia] = useState<boolean>(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [localSpeaking, setLocalSpeaking] = useState<boolean>(false);

  // References to keep track of connections without triggering frequent re-renders
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const peerMediaStatesRef = useRef<Map<string, PeerMediaState>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const settingsRef = useRef<WebRtcSettings>(settings);
  const isMicOnRef = useRef<boolean>(isMicOn);
  const isCameraOnRef = useRef<boolean>(isCameraOn);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    isMicOnRef.current = isMicOn;
  }, [isMicOn]);

  useEffect(() => {
    isCameraOnRef.current = isCameraOn;
  }, [isCameraOn]);

  // Sync settings when changed from external events (e.g. Profile or Settings modal)
  useEffect(() => {
    const handleSettingsChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as WebRtcSettings;
      if (detail) {
        setSettings(detail);
      }
    };
    window.addEventListener('webrtc_settings_changed', handleSettingsChanged);
    return () => window.removeEventListener('webrtc_settings_changed', handleSettingsChanged);
  }, []);

  // Update Settings Helper
  const updateSettings = useCallback((newPartial: Partial<WebRtcSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newPartial };
      saveWebRtcSettings(updated);
      return updated;
    });
  }, []);

  // Helper to send message over existing WebSocket
  const sendWs = useCallback((type: string, payload: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }, [wsRef]);

  // Broadcast current local mic/camera state to room peers
  const broadcastMediaState = useCallback((micEnabled: boolean, camEnabled: boolean) => {
    sendWs('SIGNAL_MEDIA_STATE', {
      isAudioEnabled: micEnabled,
      isVideoEnabled: camEnabled
    });
  }, [sendWs]);

  // Clean up a specific peer connection
  const closePeerConnection = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (e) {
        // Ignore
      }
      peerConnectionsRef.current.delete(peerId);
    }
    remoteStreamsRef.current.delete(peerId);
    peerMediaStatesRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);

    setRemotePeers(prev => {
      if (!prev.has(peerId)) return prev;
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  // Initialize local user media with current settings (resilient, independent audio and video)
  const initLocalMedia = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMediaError('Ваш браузер не поддерживает WebRTC медиаустройства.');
      return null;
    }

    setIsInitializingMedia(true);
    setMediaError(null);

    // Stop existing tracks if any
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }

    const stream = new MediaStream();
    let audioSuccess = false;
    let videoSuccess = false;
    let audioErrReason = '';
    let videoErrReason = '';

    // 1. Request microphone independently
    try {
      const audioStream = await safeGetUserMedia({
        audio: getAudioConstraints(),
        video: false
      });
      const audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMicOnRef.current && !settingsRef.current.dataSaverMode;
        stream.addTrack(audioTrack);
        audioSuccess = true;
      }
    } catch (aErr: any) {
      console.warn('Microphone acquisition error:', aErr);
      audioErrReason = formatMediaError(aErr, 'mic');
    }

    // 2. Request camera independently (if user has camera on and not in dataSaverMode)
    if (isCameraOnRef.current && !settingsRef.current.dataSaverMode) {
      try {
        const videoStream = await safeGetUserMedia({
          audio: false,
          video: getVideoConstraints(settingsRef.current)
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = true;
          stream.addTrack(videoTrack);
          videoSuccess = true;
        }
      } catch (vErr: any) {
        console.warn('Camera acquisition error in initLocalMedia:', vErr);
        videoErrReason = formatMediaError(vErr, 'camera');
        setIsCameraOn(false);
        isCameraOnRef.current = false;
      }
    }

    // Process whatever tracks succeeded
    if (stream.getTracks().length > 0) {
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Add or replace tracks in existing peer connections
      peerConnectionsRef.current.forEach((pc) => {
        const senders = pc.getSenders();
        stream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track && s.track.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track).catch(err => console.warn('Track replace error:', err));
          } else {
            try {
              pc.addTrack(track, stream);
            } catch (err) {
              console.warn('AddTrack error:', err);
            }
          }
        });
      });

      // Broadcast readiness
      sendWs('SIGNAL_READY', {
        mediaState: {
          isAudioEnabled: isMicOnRef.current && audioSuccess && !settingsRef.current.dataSaverMode,
          isVideoEnabled: isCameraOnRef.current && videoSuccess && !settingsRef.current.dataSaverMode
        }
      });

      if (videoErrReason && !videoSuccess) {
        setMediaError(videoErrReason);
      } else {
        setMediaError(null);
      }

      setIsInitializingMedia(false);
      return stream;
    } else {
      const combinedError = videoErrReason || audioErrReason || 'Не удалось получить доступ к микрофону и камере.';
      setMediaError(combinedError);
      setIsInitializingMedia(false);
      return null;
    }
  }, [sendWs]);

  // Create and configure a new RTCPeerConnection for target peer
  const createPeerConnection = useCallback((targetPeerId: string): RTCPeerConnection => {
    if (peerConnectionsRef.current.has(targetPeerId)) {
      return peerConnectionsRef.current.get(targetPeerId)!;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(targetPeerId, pc);

    const remoteStream = new MediaStream();
    remoteStreamsRef.current.set(targetPeerId, remoteStream);

    // Add local tracks to new connection if localStream is active
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWs('SIGNAL_ICE_CANDIDATE', {
          targetPeerId,
          candidate: event.candidate
        });
      }
    };

    // Remote Track received handler (Independent audio & video handling)
    pc.ontrack = (event) => {
      let stream = remoteStreamsRef.current.get(targetPeerId);
      if (!stream) {
        stream = new MediaStream();
        remoteStreamsRef.current.set(targetPeerId, stream);
      }

      // Add track if not already present
      if (!stream.getTracks().some(t => t.id === event.track.id)) {
        stream.addTrack(event.track);
      }

      // Independent handling of incoming video and audio:
      if (event.track.kind === 'video' && (settingsRef.current.blockIncomingVideo || settingsRef.current.dataSaverMode)) {
        event.track.enabled = false;
      }
      if (event.track.kind === 'audio' && settingsRef.current.blockIncomingAudio) {
        event.track.enabled = false;
      }

      // Notify state
      setRemotePeers(prev => {
        const next = new Map(prev);
        const currentMediaState = peerMediaStatesRef.current.get(targetPeerId) || {
          isAudioEnabled: stream ? stream.getAudioTracks().some(t => t.enabled) : true,
          isVideoEnabled: stream ? stream.getVideoTracks().some(t => t.enabled) : true
        };
        next.set(targetPeerId, {
          peerId: targetPeerId,
          stream: new MediaStream(stream.getTracks()),
          mediaState: currentMediaState
        });
        return next;
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        closePeerConnection(targetPeerId);
      }
    };

    return pc;
  }, [closePeerConnection, sendWs]);

  // Initiate an offer to target peer
  const initiateOffer = useCallback(async (targetPeerId: string) => {
    if (targetPeerId === myPlayerId) return;
    try {
      const pc = createPeerConnection(targetPeerId);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);

      sendWs('SIGNAL_OFFER', {
        targetPeerId,
        sdp: offer,
        callerMediaState: {
          isAudioEnabled: isMicOnRef.current && !settingsRef.current.dataSaverMode,
          isVideoEnabled: isCameraOnRef.current && !settingsRef.current.dataSaverMode
        }
      });
    } catch (err) {
      console.warn('Failed to initiate WebRTC offer to:', targetPeerId, err);
    }
  }, [createPeerConnection, myPlayerId, sendWs]);

  // Flush queued ICE candidates after remote description is set
  const processPendingCandidates = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const queue = pendingCandidatesRef.current.get(peerId);
    if (queue && queue.length > 0) {
      for (const cand of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('Queued ICE candidate error:', e);
        }
      }
      pendingCandidatesRef.current.delete(peerId);
    }
  }, []);

  // Handle incoming signaling message from WebSocket
  const handleSignalingMessage = useCallback(async (type: string, payload: any) => {
    switch (type) {
      case 'SIGNAL_PEER_READY': {
        const { peerId, mediaState } = payload || {};
        if (peerId && peerId !== myPlayerId) {
          if (mediaState) {
            peerMediaStatesRef.current.set(peerId, mediaState);
          }
          initiateOffer(peerId);
        }
        break;
      }

      case 'SIGNAL_OFFER': {
        const { fromPeerId, sdp, callerMediaState } = payload || {};
        if (!fromPeerId || !sdp || fromPeerId === myPlayerId) return;

        if (callerMediaState) {
          peerMediaStatesRef.current.set(fromPeerId, callerMediaState);
        }

        try {
          const pc = createPeerConnection(fromPeerId);

          if (pc.signalingState !== 'stable') {
            const isPolite = myPlayerId.localeCompare(fromPeerId) < 0;
            if (!isPolite) {
              return;
            }
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit),
              pc.setRemoteDescription(new RTCSessionDescription(sdp))
            ]);
          } else {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          }

          await processPendingCandidates(fromPeerId, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          sendWs('SIGNAL_ANSWER', {
            targetPeerId: fromPeerId,
            sdp: answer
          });
        } catch (err) {
          console.warn('Failed to handle incoming WebRTC offer from:', fromPeerId, err);
        }
        break;
      }

      case 'SIGNAL_ANSWER': {
        const { fromPeerId, sdp } = payload || {};
        if (!fromPeerId || !sdp) return;
        const pc = peerConnectionsRef.current.get(fromPeerId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            await processPendingCandidates(fromPeerId, pc);
          } catch (err) {
            console.warn('Failed to set remote description answer from:', fromPeerId, err);
          }
        }
        break;
      }

      case 'SIGNAL_ICE_CANDIDATE': {
        const { fromPeerId, candidate } = payload || {};
        if (!fromPeerId || !candidate) return;
        const pc = peerConnectionsRef.current.get(fromPeerId);
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.warn('Failed to add ICE candidate from:', fromPeerId, err);
          }
        } else {
          const currentQueue = pendingCandidatesRef.current.get(fromPeerId) || [];
          currentQueue.push(candidate);
          pendingCandidatesRef.current.set(fromPeerId, currentQueue);
        }
        break;
      }

      case 'SIGNAL_MEDIA_STATE': {
        const { fromPeerId, isAudioEnabled, isVideoEnabled } = payload || {};
        if (!fromPeerId) return;
        const updatedState: PeerMediaState = {
          isAudioEnabled: Boolean(isAudioEnabled),
          isVideoEnabled: Boolean(isVideoEnabled)
        };
        peerMediaStatesRef.current.set(fromPeerId, updatedState);

        setRemotePeers(prev => {
          const existing = prev.get(fromPeerId);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(fromPeerId, {
            ...existing,
            mediaState: updatedState
          });
          return next;
        });
        break;
      }

      case 'SIGNAL_PEER_LEFT': {
        const { peerId } = payload || {};
        if (peerId) {
          closePeerConnection(peerId);
        }
        break;
      }
    }
  }, [myPlayerId, createPeerConnection, initiateOffer, sendWs, closePeerConnection, processPendingCandidates]);

  // Attach signaling listener to the WebSocket
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !isInsideRoom) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type && data.type.startsWith('SIGNAL_')) {
          handleSignalingMessage(data.type, data.payload);
        }
      } catch (err) {
        // Fallthrough
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [wsRef, isInsideRoom, handleSignalingMessage]);

  // Speaking / Audio level detection for local user
  useEffect(() => {
    if (!localStream || !isMicOn) {
      setLocalSpeaking(false);
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack || !audioTrack.enabled) {
      setLocalSpeaking(false);
      return;
    }

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let animId: number | null = null;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source = audioContext.createMediaStreamSource(localStream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkVolume = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          setLocalSpeaking(average > 18);
          animId = requestAnimationFrame(checkVolume);
        };
        checkVolume();
      }
    } catch (e) {
      // AudioContext not supported
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (source) source.disconnect();
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
    };
  }, [localStream, isMicOn]);

  // When inside room and WebRTC is enabled, automatically start local media
  useEffect(() => {
    if (isInsideRoom && settings.enabled) {
      initLocalMedia();
    } else {
      // Clean up when leaving room
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
      peerConnectionsRef.current.forEach((pc) => {
        try { pc.close(); } catch (e) {}
      });
      peerConnectionsRef.current.clear();
      remoteStreamsRef.current.clear();
      peerMediaStatesRef.current.clear();
      pendingCandidatesRef.current.clear();
      setRemotePeers(new Map());
    }

    return () => {
      if (!isInsideRoom) {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
          localStreamRef.current = null;
        }
      }
    };
  }, [isInsideRoom, settings.enabled]);

  // Toggle local Microphone independently
  const toggleMic = useCallback(async () => {
    if (isMicOn) {
      // Mute microphone
      setIsMicOn(false);
      isMicOnRef.current = false;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      }
      broadcastMediaState(false, isCameraOnRef.current);
      return;
    }

    // Unmute microphone
    setMediaError(null);
    const existingAudio = localStreamRef.current?.getAudioTracks().find(t => t.readyState === 'live');
    if (existingAudio) {
      existingAudio.enabled = true;
      setIsMicOn(true);
      isMicOnRef.current = true;
      broadcastMediaState(true, isCameraOnRef.current);
      return;
    }

    // Acquire audio track if missing or ended
    try {
      const audioStream = await safeGetUserMedia({
        audio: getAudioConstraints(),
        video: false
      });
      const newAudioTrack = audioStream.getAudioTracks()[0];
      if (newAudioTrack) {
        newAudioTrack.enabled = true;
        if (!localStreamRef.current) {
          localStreamRef.current = new MediaStream();
        }
        localStreamRef.current.addTrack(newAudioTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

        peerConnectionsRef.current.forEach(pc => {
          const senders = pc.getSenders();
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            audioSender.replaceTrack(newAudioTrack).catch(e => console.warn(e));
          } else {
            try {
              pc.addTrack(newAudioTrack, localStreamRef.current!);
            } catch (e) {
              console.warn(e);
            }
          }
        });

        setIsMicOn(true);
        isMicOnRef.current = true;
        broadcastMediaState(true, isCameraOnRef.current);
      }
    } catch (err: any) {
      console.warn('Failed to start microphone on toggleMic:', err);
      setIsMicOn(false);
      isMicOnRef.current = false;
      setMediaError(formatMediaError(err, 'mic'));
    }
  }, [isMicOn, broadcastMediaState]);

  // Toggle local Camera independently (robust capture with fallback)
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      // Turn OFF camera: stop video tracks to turn off the webcam LED indicator
      setIsCameraOn(false);
      isCameraOnRef.current = false;
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => {
          track.enabled = false;
          track.stop();
          localStreamRef.current?.removeTrack(track);
        });
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
      broadcastMediaState(isMicOnRef.current, false);
      return;
    }

    // Turn ON camera
    setMediaError(null);
    try {
      const videoConstraints = getVideoConstraints(settingsRef.current);
      const videoStream = await safeGetUserMedia({
        audio: false,
        video: videoConstraints
      });

      const newVideoTrack = videoStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('Видеодорожка не найдена');
      }

      newVideoTrack.enabled = true;

      if (!localStreamRef.current) {
        localStreamRef.current = new MediaStream();
      } else {
        localStreamRef.current.getVideoTracks().forEach(t => {
          t.stop();
          localStreamRef.current?.removeTrack(t);
        });
      }

      localStreamRef.current.addTrack(newVideoTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

      // Add or replace track to all existing peer connections
      peerConnectionsRef.current.forEach(pc => {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(newVideoTrack).catch(e => console.warn('Replace track err:', e));
        } else {
          try {
            pc.addTrack(newVideoTrack, localStreamRef.current!);
          } catch (e) {
            console.warn('Add track err:', e);
          }
        }
      });

      setIsCameraOn(true);
      isCameraOnRef.current = true;
      setMediaError(null);
      broadcastMediaState(isMicOnRef.current, true);
    } catch (err: any) {
      console.warn('Failed to start camera on toggleCamera:', err);
      setIsCameraOn(false);
      isCameraOnRef.current = false;
      setMediaError(formatMediaError(err, 'camera'));
    }
  }, [isCameraOn, broadcastMediaState]);

  // Toggle Data Saver Mode (One click weak internet optimization)
  const toggleDataSaverMode = useCallback(() => {
    const nextMode = !settings.dataSaverMode;
    updateSettings({
      dataSaverMode: nextMode,
      blockIncomingVideo: nextMode
    });

    // Mute incoming video tracks immediately
    remoteStreamsRef.current.forEach(stream => {
      stream.getVideoTracks().forEach(track => {
        track.enabled = !nextMode;
      });
    });

    // Also disable local camera in data saver mode to save uplink bandwidth
    if (nextMode && isCameraOn) {
      setIsCameraOn(false);
      isCameraOnRef.current = false;
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => { 
          t.enabled = false;
          t.stop();
          localStreamRef.current?.removeTrack(t);
        });
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
      broadcastMediaState(isMicOnRef.current, false);
    }
  }, [settings.dataSaverMode, isCameraOn, updateSettings, broadcastMediaState]);

  // Toggle forced blocking of incoming remote videos (Weak internet optimization)
  const toggleBlockIncomingVideo = useCallback(() => {
    const nextVal = !settings.blockIncomingVideo;
    updateSettings({ blockIncomingVideo: nextVal });

    // Enable/disable remote video tracks
    remoteStreamsRef.current.forEach(stream => {
      stream.getVideoTracks().forEach(track => {
        track.enabled = !nextVal;
      });
    });
  }, [settings.blockIncomingVideo, updateSettings]);

  // Toggle forced blocking of incoming remote audio (Weak internet / silence optimization)
  const toggleBlockIncomingAudio = useCallback(() => {
    const nextVal = !settings.blockIncomingAudio;
    updateSettings({ blockIncomingAudio: nextVal });

    // Enable/disable remote audio tracks
    remoteStreamsRef.current.forEach(stream => {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !nextVal;
      });
    });
  }, [settings.blockIncomingAudio, updateSettings]);

  // Change resolution (160x120 up to 320x240)
  const setResolution = useCallback(async (newResolution: VideoResolution) => {
    updateSettings({ resolution: newResolution });
    if (localStreamRef.current && isCameraOn) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        const parts = newResolution.split('x');
        const targetWidth = parseInt(parts[0], 10) || 240;
        const targetHeight = parseInt(parts[1], 10) || 180;
        try {
          await videoTrack.applyConstraints({
            width: { ideal: targetWidth },
            height: { ideal: targetHeight }
          });
        } catch {
          // If applyConstraints fails, re-acquire track
          initLocalMedia();
        }
      }
    }
  }, [isCameraOn, initLocalMedia, updateSettings]);

  // Change FPS (10 to 30)
  const setFps = useCallback(async (newFps: number) => {
    const clamped = Math.max(10, Math.min(30, newFps));
    updateSettings({ frameRate: clamped });
    if (localStreamRef.current && isCameraOn) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({
            frameRate: { ideal: clamped }
          });
        } catch {
          // If applyConstraints fails, re-acquire track
          initLocalMedia();
        }
      }
    }
  }, [isCameraOn, initLocalMedia, updateSettings]);

  const clearMediaError = useCallback(() => {
    setMediaError(null);
  }, []);

  return {
    settings,
    updateSettings,
    localStream,
    remotePeers,
    isMicOn,
    isCameraOn,
    localSpeaking,
    isInitializingMedia,
    mediaError,
    clearMediaError,
    toggleMic,
    toggleCamera,
    toggleDataSaverMode,
    toggleBlockIncomingVideo,
    toggleBlockIncomingAudio,
    setResolution,
    setFps,
    initLocalMedia,
    handleSignalingMessage
  };
}
