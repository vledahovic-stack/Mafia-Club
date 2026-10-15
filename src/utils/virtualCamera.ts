/**
 * Virtual / Demo Camera Stream Generator
 * Creates a compliant MediaStream with a video track using HTML5 Canvas captureStream.
 * Useful when the user doesn't have a physical webcam (NotFoundError),
 * or when browser permissions are denied (NotAllowedError) in sandboxes/VMs,
 * allowing full WebRTC peer-to-peer testing with real video tracks.
 */

export interface VirtualCameraOptions {
  width?: number;
  height?: number;
  fps?: number;
  playerName?: string;
  isSpeaker?: boolean;
}

export function createVirtualVideoStream(options: VirtualCameraOptions = {}): {
  stream: MediaStream;
  stop: () => void;
} {
  const width = options.width || 240;
  const height = options.height || 180;
  const fps = Math.max(10, Math.min(30, options.fps || 15));
  const playerName = options.playerName || 'Детектив';

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  let animFrameId: number | null = null;
  let startTime = Date.now();
  let scanY = 0;
  let frameCount = 0;

  function render() {
    if (!ctx) return;
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;
    frameCount++;

    // Background gradient (Dark Noir atmosphere)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0f111a');
    bgGrad.addColorStop(0.5, '#161926');
    bgGrad.addColorStop(1, '#090a10');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle spotlight
    const spotX = width * 0.5 + Math.sin(elapsed * 0.8) * (width * 0.15);
    const spotY = height * 0.45;
    const radial = ctx.createRadialGradient(spotX, spotY, 10, spotX, spotY, height * 0.65);
    radial.addColorStop(0, 'rgba(217, 119, 6, 0.18)');
    radial.addColorStop(0.6, 'rgba(99, 102, 241, 0.08)');
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);

    // Grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 20;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Noir silhouette / Gangster avatar in center
    const cx = width / 2;
    const cy = height * 0.52;
    const scale = Math.min(width, height) / 180;

    ctx.save();
    ctx.translate(cx, cy);

    // Fedora Hat
    ctx.fillStyle = '#1e2233';
    ctx.beginPath();
    ctx.ellipse(0, -26 * scale, 32 * scale, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2b3046';
    ctx.beginPath();
    ctx.moveTo(-16 * scale, -26 * scale);
    ctx.quadraticCurveTo(0, -48 * scale, 16 * scale, -26 * scale);
    ctx.closePath();
    ctx.fill();

    // Fedora ribbon
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-15 * scale, -28 * scale, 30 * scale, 3 * scale);

    // Head
    ctx.fillStyle = '#1a1d2b';
    ctx.beginPath();
    ctx.arc(0, -12 * scale, 14 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Sunglasses
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(-11 * scale, -15 * scale, 9 * scale, 5 * scale);
    ctx.fillRect(2 * scale, -15 * scale, 9 * scale, 5 * scale);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(-9 * scale, -14 * scale, 3 * scale, 2 * scale);
    ctx.fillRect(4 * scale, -14 * scale, 3 * scale, 2 * scale);

    // Coat & Collar
    ctx.fillStyle = '#181b28';
    ctx.beginPath();
    ctx.moveTo(-28 * scale, 30 * scale);
    ctx.lineTo(-14 * scale, 0);
    ctx.lineTo(0, 10 * scale);
    ctx.lineTo(14 * scale, 0);
    ctx.lineTo(28 * scale, 30 * scale);
    ctx.closePath();
    ctx.fill();

    // Tie
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(-3 * scale, 5 * scale);
    ctx.lineTo(3 * scale, 5 * scale);
    ctx.lineTo(4 * scale, 26 * scale);
    ctx.lineTo(0, 30 * scale);
    ctx.lineTo(-4 * scale, 26 * scale);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Animated scanning line
    scanY = (scanY + 1.2) % height;
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.fillRect(0, scanY, width, 2);

    // Live Watermark and Info
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(4, 4, width - 8, 16);

    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('LIVE REC', 8, 15);

    // Blinking REC dot
    if (Math.floor(elapsed * 2) % 2 === 0) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(58, 12, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#a1a1aa';
    ctx.textAlign = 'right';
    ctx.fillText(`${width}x${height} • ${fps} FPS`, width - 8, 15);
    ctx.textAlign = 'left';

    // Player name badge at bottom
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(4, height - 20, width - 8, 16);
    ctx.fillStyle = '#fbbf24';
    ctx.font = '10px sans-serif';
    ctx.fillText(`🕵️ ${playerName} (Виртуальная камера)`, 8, height - 8);

    // Timestamp
    const dateStr = new Date().toTimeString().split(' ')[0];
    ctx.textAlign = 'right';
    ctx.font = '9px monospace';
    ctx.fillStyle = '#71717a';
    ctx.fillText(dateStr, width - 8, height - 8);
    ctx.textAlign = 'left';

    animFrameId = requestAnimationFrame(render);
  }

  render();

  const stream = canvas.captureStream ? canvas.captureStream(fps) : (canvas as any).mozCaptureStream(fps);

  const stop = () => {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (stream) {
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    }
  };

  // Add cleanup to stream tracks
  stream.getTracks().forEach((track: MediaStreamTrack) => {
    const originalStop = track.stop.bind(track);
    track.stop = () => {
      stop();
      originalStop();
    };
  });

  return { stream, stop };
}
