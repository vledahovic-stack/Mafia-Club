const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  let c = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  }
  return (c ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(width, height, getPixel) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bit per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowLen = 1 + width * 4;
  const rawData = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    rawData[y * rowLen] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const idx = y * rowLen + 1 + x * 4;
      rawData[idx] = r;
      rawData[idx + 1] = g;
      rawData[idx + 2] = b;
      rawData[idx + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([header, makeChunk('IHDR', ihdr), idat, iend]);
}

// Generate icon pixel
function getMafiaIconPixel(x, y, width, height, isMaskable = false) {
  const cx = width / 2;
  const cy = height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxRadius = width / 2;

  // Background radial gradient: dark noir #0d0e15 to #1a1c2b
  const normDist = dist / maxRadius;
  let bgR = Math.round(13 + (26 - 13) * normDist);
  let bgG = Math.round(14 + (28 - 14) * normDist);
  let bgB = Math.round(21 + (43 - 21) * normDist);

  // Outer golden circular accent (only for non-maskable or inside safe-zone)
  const ringRadius = isMaskable ? width * 0.38 : width * 0.46;
  const ringThickness = Math.max(2, width * 0.015);
  const isRing = Math.abs(dist - ringRadius) < ringThickness;

  // Mafia Gangster character coordinates relative to center
  const scale = (isMaskable ? 0.72 : 0.88) * (width / 512);
  const mx = dx / scale;
  const my = dy / scale;

  // 1. Fedora Brim: ellipse centered at y = -35, rx = 160, ry = 36
  const brimDx = mx;
  const brimDy = (my - (-35));
  const isBrim = (brimDx * brimDx) / (165 * 165) + (brimDy * brimDy) / (38 * 38) <= 1;

  // 2. Fedora Crown: polygon/oval from y = -140 to y = -35, width ~150
  const isCrown = (my >= -150 && my <= -32 && Math.abs(mx) <= (75 - (my + 150) * 0.12));

  // 3. Fedora Ribbon: band from y = -52 to y = -35
  const isRibbon = isCrown && (my >= -55 && my <= -36);

  // 4. Head: circle at y = 0, radius = 62
  const headDist = Math.sqrt(mx * mx + (my - 5) * (my - 5));
  const isHead = headDist <= 62;

  // 5. Sunglasses: two rounded rectangles at y = -5 to y = 18, x from -55 to -10 and 10 to 55
  const isLeftGlass = (mx >= -56 && mx <= -10 && my >= -5 && my <= 16);
  const isRightGlass = (mx >= 10 && mx <= 56 && my >= -5 && my <= 16);
  const isGlassBridge = (mx >= -12 && mx <= 12 && my >= 2 && my <= 8);
  const isGlasses = isLeftGlass || isRightGlass || isGlassBridge;
  const isGlassGlare = (isLeftGlass && mx >= -45 && mx <= -25 && my >= -2 && my <= 4) ||
                       (isRightGlass && mx >= 22 && mx <= 42 && my >= -2 && my <= 4);

  // 6. Trench Coat & Shoulders: y from 50 to 220, trapezoid
  const isCoat = (my >= 50 && my <= 210 && Math.abs(mx) <= (55 + (my - 50) * 0.75));

  // 7. White Shirt Collar: V-neck
  const isShirt = isCoat && (my >= 50 && my <= 140 && Math.abs(mx) <= (18 + (140 - my) * 0.15));

  // 8. Red Mafia Tie: V-shape from y = 70 to y = 195
  const isTie = isCoat && (my >= 72 && my <= 195 && Math.abs(mx) <= Math.max(3, 16 - Math.abs(my - 140) * 0.12));
  const isTieKnot = isCoat && (my >= 62 && my <= 76 && Math.abs(mx) <= 12);

  // Combine layers from top to bottom
  if (isGlasses) {
    if (isGlassGlare) return [255, 255, 255, 255];
    return [15, 15, 20, 255];
  }
  if (isTie || isTieKnot) {
    return [220, 38, 38, 255]; // Red #dc2626
  }
  if (isShirt) {
    return [240, 240, 245, 255]; // Clean crisp shirt #f0f0f5
  }
  if (isRibbon) {
    return [217, 119, 6, 255]; // Golden Amber #d97706
  }
  if (isCrown || isBrim) {
    return [28, 32, 48, 255]; // Dark fedora #1c2030
  }
  if (isHead) {
    return [210, 160, 120, 255]; // Skin tone
  }
  if (isCoat) {
    return [24, 27, 40, 255]; // Dark noir coat #181b28
  }
  if (isRing) {
    return [217, 119, 6, 220]; // Golden ring #d97706
  }

  // Background
  return [bgR, bgG, bgB, 255];
}

// Generate Screenshot Mockups for PWABuilder
function getMobileScreenshotPixel(x, y, width, height) {
  const normY = y / height;
  const normX = x / width;

  // Header bar (y < 8%)
  if (normY < 0.08) {
    return [18, 20, 30, 255];
  }

  // Phase banner (0.08 <= y < 0.16)
  if (normY >= 0.08 && normY < 0.16) {
    if (normX >= 0.08 && normX <= 0.92 && normY >= 0.095 && normY <= 0.145) {
      return [217, 119, 6, 230]; // Golden header
    }
    return [14, 15, 22, 255];
  }

  // Cards table area
  // Grid of player cards (3 rows, 2 cols)
  const isInsideCard = (
    ((normX >= 0.06 && normX <= 0.47) || (normX >= 0.53 && normX <= 0.94)) &&
    ((normY >= 0.18 && normY <= 0.38) || (normY >= 0.41 && normY <= 0.61) || (normY >= 0.64 && normY <= 0.84))
  );

  if (isInsideCard) {
    // Card border
    return [30, 34, 52, 255];
  }

  // Bottom action bar (y > 0.88)
  if (normY >= 0.88) {
    return [20, 22, 34, 255];
  }

  // Background noir felt table
  return [13, 14, 21, 255];
}

function getDesktopScreenshotPixel(x, y, width, height) {
  const normY = y / height;
  const normX = x / width;

  // Top navigation header
  if (normY < 0.1) {
    return [18, 20, 30, 255];
  }

  // Left sidebar (chat / event log)
  if (normX < 0.25) {
    return [15, 17, 26, 255];
  }

  // Right sidebar (roles / vote counts)
  if (normX > 0.78) {
    return [15, 17, 26, 255];
  }

  // Center circular game table
  const cx = 0.515 * width;
  const cy = 0.55 * height;
  const dx = (x - cx) / (width * 0.24);
  const dy = (y - cy) / (height * 0.35);
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1.0) {
    if (dist > 0.92) return [217, 119, 6, 220]; // Table border
    return [20, 24, 38, 255]; // Table felt
  }

  return [13, 14, 21, 255];
}

// Ensure directories exist
const publicDir = path.resolve(__dirname, '../public');
const iconsDir = path.resolve(publicDir, 'icons');
const screenshotsDir = path.resolve(publicDir, 'screenshots');

[publicDir, iconsDir, screenshotsDir].forEach(d => {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
});

console.log('Generating PWA Icons & Assets for PWABuilder...');

// 1. Generate PWA Icons
const sizes = [
  { file: 'pwa-192x192.png', size: 192, maskable: false },
  { file: 'pwa-512x512.png', size: 512, maskable: false },
  { file: 'pwa-maskable-512x512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
  { file: 'favicon-32x32.png', size: 32, maskable: false }
];

sizes.forEach(({ file, size, maskable }) => {
  const pngBuf = createPng(size, size, (x, y, w, h) => getMafiaIconPixel(x, y, w, h, maskable));
  fs.writeFileSync(path.resolve(iconsDir, file), pngBuf);
  // Also copy 192, 512, apple-touch-icon, and favicon to public root for immediate compatibility
  fs.writeFileSync(path.resolve(publicDir, file), pngBuf);
  console.log(`✓ Generated ${file} (${size}x${size}, maskable: ${maskable})`);
});

// Also write favicon.ico from 32x32 PNG
fs.writeFileSync(path.resolve(publicDir, 'favicon.ico'), fs.readFileSync(path.resolve(iconsDir, 'favicon-32x32.png')));
fs.writeFileSync(path.resolve(iconsDir, 'favicon.ico'), fs.readFileSync(path.resolve(iconsDir, 'favicon-32x32.png')));
console.log('✓ Generated favicon.ico');

// 2. Generate Brand SVG icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1e2233" />
      <stop offset="100%" stop-color="#0d0e15" />
    </radialGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Background circle with gold border -->
  <circle cx="256" cy="256" r="244" fill="url(#bgGrad)" stroke="url(#goldGrad)" stroke-width="8" />
  <circle cx="256" cy="256" r="230" fill="none" stroke="#d97706" stroke-width="1.5" stroke-dasharray="8 6" opacity="0.6"/>

  <g filter="url(#shadow)" transform="translate(256, 260) scale(1.1)">
    <!-- Trench Coat -->
    <path d="M-90,130 L-45,35 L0,45 L45,35 L90,130 Z" fill="#181b28" stroke="#12131b" stroke-width="3" />
    
    <!-- Crisp Shirt Collar -->
    <polygon points="-26,38 26,38 0,110" fill="#f4f4f5" />
    
    <!-- Red Silk Tie -->
    <polygon points="-12,50 12,50 18,125 0,155 -18,125" fill="#dc2626" />
    <polygon points="-10,44 10,44 6,56 -6,56" fill="#991b1b" />

    <!-- Head / Face -->
    <ellipse cx="0" cy="-15" rx="52" ry="58" fill="#d4a373" />
    
    <!-- Fedora Brim -->
    <ellipse cx="0" cy="-60" rx="140" ry="32" fill="#1c2030" />
    <ellipse cx="0" cy="-59" rx="136" ry="29" fill="none" stroke="#2a3045" stroke-width="2" />
    
    <!-- Fedora Crown -->
    <path d="M-68,-60 C-72,-135 -45,-155 0,-150 C45,-155 72,-135 68,-60 Z" fill="#24293d" />
    
    <!-- Gold Ribbon -->
    <path d="M-68,-60 C-40,-66 40,-66 68,-60 L67,-74 C40,-80 -40,-80 -67,-74 Z" fill="url(#goldGrad)" />
    
    <!-- Dark Sunglasses -->
    <rect x="-48" y="-28" width="40" height="24" rx="4" fill="#090a0f" />
    <rect x="8" y="-28" width="40" height="24" rx="4" fill="#090a0f" />
    <rect x="-10" y="-20" width="20" height="6" fill="#090a0f" />
    <!-- Glasses Glare -->
    <polygon points="-42,-24 -28,-24 -38,-10 -46,-10" fill="#ffffff" opacity="0.45" />
    <polygon points="14,-24 28,-24 18,-10 10,-10" fill="#ffffff" opacity="0.45" />
  </g>
</svg>`;

fs.writeFileSync(path.resolve(iconsDir, 'icon.svg'), svgContent);
fs.writeFileSync(path.resolve(publicDir, 'icon.svg'), svgContent);
console.log('✓ Generated icon.svg in public/ and public/icons/');

// 3. Generate Screenshots for PWABuilder (Narrow and Wide)
const narrowScreenshot = createPng(720, 1280, getMobileScreenshotPixel);
fs.writeFileSync(path.resolve(screenshotsDir, 'screenshot-narrow.png'), narrowScreenshot);
console.log('✓ Generated screenshot-narrow.png (720x1280, mobile portrait)');

const wideScreenshot = createPng(1280, 720, getDesktopScreenshotPixel);
fs.writeFileSync(path.resolve(screenshotsDir, 'screenshot-wide.png'), wideScreenshot);
console.log('✓ Generated screenshot-wide.png (1280x720, desktop wide)');

// 4. Generate Web App Manifests (both .webmanifest and .json)
const manifestData = {
  id: "/",
  name: "Мафия Онлайн: Город Засыпает",
  short_name: "Мафия Онлайн",
  description: "Полноценная многопользовательская онлайн-платформа для игры в классическую и городскую Мафию с комнатами, ролями, голосованием и звуковой атмосферой.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#0d0e15",
  theme_color: "#0d0e15",
  lang: "ru",
  dir: "ltr",
  categories: ["games", "entertainment", "social"],
  prefer_related_applications: false,
  icons: [
    {
      src: "/icons/pwa-192x192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any"
    },
    {
      src: "/icons/pwa-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any"
    },
    {
      src: "/icons/pwa-maskable-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable"
    },
    {
      src: "/icons/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
      purpose: "any"
    }
  ],
  screenshots: [
    {
      src: "/screenshots/screenshot-narrow.png",
      sizes: "720x1280",
      type: "image/png",
      form_factor: "narrow",
      label: "Игровой стол и карточки игроков в мобильном приложении"
    },
    {
      src: "/screenshots/screenshot-wide.png",
      sizes: "1280x720",
      type: "image/png",
      form_factor: "wide",
      label: "Полноэкранный вид игрового стола и чата на планшете и ПК"
    }
  ],
  shortcuts: [
    {
      name: "Быстрая игра",
      short_name: "Играть",
      description: "Присоединиться к публичной комнате",
      url: "/?action=quick_play",
      icons: [{ src: "/icons/pwa-192x192.png", sizes: "192x192" }]
    },
    {
      name: "Создать комнату",
      short_name: "Создать",
      description: "Создать новую игровую комнату",
      url: "/?action=create_room",
      icons: [{ src: "/icons/pwa-192x192.png", sizes: "192x192" }]
    }
  ]
};

const manifestJson = JSON.stringify(manifestData, null, 2);
fs.writeFileSync(path.resolve(publicDir, 'manifest.webmanifest'), manifestJson);
fs.writeFileSync(path.resolve(publicDir, 'manifest.json'), manifestJson);
console.log('✓ Generated manifest.webmanifest and manifest.json in public/');

// 5. Offline Fallback HTML (PWABuilder offline verification)
const offlineHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Мафия Онлайн — Автономный режим</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #0d0e15;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .badge {
      background: rgba(217, 119, 6, 0.2);
      border: 1px solid #d97706;
      color: #fbbf24;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 26px;
      margin: 0 0 12px;
      color: #ffffff;
    }
    p {
      color: #a1a1aa;
      font-size: 15px;
      line-height: 1.6;
      max-width: 440px;
      margin: 0 0 28px;
    }
    .btn {
      background: #d97706;
      color: #ffffff;
      border: none;
      padding: 12px 28px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(217, 119, 6, 0.4);
      transition: background 0.2s;
    }
    .btn:hover {
      background: #b45309;
    }
  </style>
</head>
<body>
  <div class="badge">📡 Нет подключения к интернету</div>
  <h1>Город Засыпает...</h1>
  <p>Для игры в многопользовательскую Мафию и синхронизации с другими участниками требуется подключение к сети. Проверьте интернет и нажмите кнопку ниже.</p>
  <button class="btn" onclick="window.location.reload()">Повторить подключение</button>
</body>
</html>`;

fs.writeFileSync(path.resolve(publicDir, 'offline.html'), offlineHtml);
console.log('✓ Generated offline.html in public/');

console.log('All PWA assets successfully generated!');
