import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// 512x512 Ultra-crisp SVG vector based on the uploaded Mafia Club icon design
const masterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Vignette -->
    <radialGradient id="bgGrad" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="#1e2029" />
      <stop offset="60%" stop-color="#0b0c10" />
      <stop offset="100%" stop-color="#040406" />
    </radialGradient>

    <!-- Metal / Silver Text Gradient -->
    <linearGradient id="silverText" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="25%" stop-color="#e2e8f0" />
      <stop offset="55%" stop-color="#94a3b8" />
      <stop offset="80%" stop-color="#cbd5e1" />
      <stop offset="100%" stop-color="#64748b" />
    </linearGradient>

    <!-- Red Accent Gradient -->
    <linearGradient id="redText" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#f87171" />
      <stop offset="40%" stop-color="#ef4444" />
      <stop offset="100%" stop-color="#991b1b" />
    </linearGradient>

    <!-- Rim Light Gradient for Silhouette -->
    <linearGradient id="rimLight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#94a3b8" stop-opacity="0.8" />
      <stop offset="50%" stop-color="#475569" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0" />
    </linearGradient>

    <!-- Shirt Collar Gradient -->
    <linearGradient id="shirtGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#cbd5e1" />
    </linearGradient>

    <!-- Tie Shadow -->
    <linearGradient id="tieGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#090a0f" />
    </linearGradient>

    <!-- Drop Shadow Filter -->
    <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.85"/>
    </filter>

    <filter id="textGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.9"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" rx="0" fill="url(#bgGrad)" />

  <!-- Subtle Inner Textured Border -->
  <rect x="8" y="8" width="496" height="496" rx="4" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="2" />

  <!-- Main Mobster Silhouette Group -->
  <g filter="url(#dropShadow)" transform="translate(0, -10)">
    <!-- Fedora Crown Shading -->
    <path d="M 195 155 Q 210 130 256 130 Q 302 130 317 155 Q 325 185 305 198 L 207 198 Q 187 185 195 155 Z" fill="#151720" />
    <path d="M 215 142 C 230 135 282 135 297 142 C 310 160 305 190 300 196 L 212 196 C 207 190 202 160 215 142 Z" fill="#0b0c10" />

    <!-- Fedora Ribbon Band -->
    <path d="M 207 192 L 305 192 L 308 206 L 204 206 Z" fill="#2d3142" />
    <path d="M 207 195 L 305 195 L 307 203 L 205 203 Z" fill="#181a24" />

    <!-- Fedora Brim -->
    <path d="M 168 206 C 210 196 302 196 344 206 C 362 210 320 226 256 226 C 192 226 150 210 168 206 Z" fill="#1f2330" />
    <path d="M 172 208 C 210 200 302 200 340 208 C 325 220 285 225 256 225 C 227 225 187 220 172 208 Z" fill="#0d0e14" />
    <!-- Brim Edge Highlight Rim -->
    <path d="M 168 206 C 210 196 302 196 344 206" fill="none" stroke="url(#rimLight)" stroke-width="2.5" />

    <!-- Shadowed Head & Jawline -->
    <path d="M 212 215 L 300 215 L 292 258 C 285 282 270 298 256 300 C 242 298 227 282 220 258 Z" fill="#07080b" />
    <!-- Ear/Cheek Shadow Contrast -->
    <path d="M 222 230 C 235 250 245 268 256 268 C 267 268 277 250 290 230 Z" fill="#030305" opacity="0.8" />

    <!-- White Collar / Dress Shirt -->
    <polygon points="230,285 256,335 240,310 222,290" fill="url(#shirtGrad)" />
    <polygon points="282,285 256,335 272,310 290,290" fill="url(#shirtGrad)" />

    <!-- Neck Tie -->
    <polygon points="250,302 262,302 265,315 256,375 247,315" fill="url(#tieGrad)" />
    <polygon points="252,302 260,302 262,312 256,370 250,312" fill="#0b0f19" />

    <!-- Suit Coat & Shoulders -->
    <path d="M 158 350 C 185 310 220 290 230 285 L 246 355 L 256 375 L 266 355 L 282 285 C 292 290 327 310 354 350 C 375 380 390 410 395 430 L 117 430 C 122 410 137 380 158 350 Z" fill="#12141d" />

    <!-- Lapels -->
    <!-- Left Lapel -->
    <path d="M 230 285 L 185 330 L 210 375 L 246 355 Z" fill="#1a1d2a" />
    <path d="M 230 285 L 190 328 L 212 370 L 246 355 Z" fill="#0d0e15" />

    <!-- Right Lapel -->
    <path d="M 282 285 L 327 330 L 302 375 L 266 355 Z" fill="#1a1d2a" />
    <path d="M 282 285 L 322 328 L 300 370 L 266 355 Z" fill="#0d0e15" />

    <!-- Suit Shoulder Highlight Rims -->
    <path d="M 158 350 C 185 310 220 290 230 285" fill="none" stroke="url(#rimLight)" stroke-width="2" />
    <path d="M 354 350 C 327 310 292 290 282 285" fill="none" stroke="url(#rimLight)" stroke-width="1.5" />
  </g>

  <!-- Typography Group -->
  <g filter="url(#textGlow)">
    <!-- MAFIA Title -->
    <text x="256" y="420" 
          text-anchor="middle" 
          font-family="Georgia, 'Times New Roman', 'Playfair Display', serif" 
          font-weight="900" 
          font-size="64" 
          letter-spacing="5" 
          fill="url(#silverText)"
          stroke="#000000"
          stroke-width="2">MAFIA</text>

    <!-- Decorative Red Wing Underlines -->
    <path d="M 105 448 L 175 448 L 165 451 L 105 448 Z" fill="url(#redText)" />
    <line x1="110" y1="448" x2="175" y2="448" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" />
    
    <path d="M 407 448 L 337 448 L 347 451 L 407 448 Z" fill="url(#redText)" />
    <line x1="402" y1="448" x2="337" y2="448" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" />

    <!-- CLUB Subtitle -->
    <text x="256" y="456" 
          text-anchor="middle" 
          font-family="Georgia, 'Times New Roman', serif" 
          font-weight="800" 
          font-size="22" 
          letter-spacing="8" 
          fill="url(#redText)">CLUB</text>
  </g>
</svg>
`;

async function generateIcons() {
  console.log('Generating app icons from master SVG vector...');

  const rootDir = process.cwd();
  const publicDir = path.join(rootDir, 'public');
  const iconsDir = path.join(publicDir, 'icons');

  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  // Save master SVG to /public/icons/icon.svg
  fs.writeFileSync(path.join(iconsDir, 'icon.svg'), masterSvg);
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), masterSvg);

  const svgBuffer = Buffer.from(masterSvg);

  // 1. PWA 512x512 Icon
  await sharp(svgBuffer)
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  
  await sharp(svgBuffer)
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'pwa-512x512.png'));

  // 2. PWA 192x192 Icon
  await sharp(svgBuffer)
    .resize(192, 192)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  await sharp(svgBuffer)
    .resize(192, 192)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'pwa-192x192.png'));

  // 3. Apple Touch Icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  await sharp(svgBuffer)
    .resize(180, 180)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'apple-touch-icon.png'));

  // 4. Favicon 32x32 & favicon.png
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));

  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(iconsDir, 'favicon-32x32.png'));

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));

  // Copy 32x32 to favicon.ico for browser compatibility
  await sharp(svgBuffer)
    .resize(32, 32)
    .toFormat('png')
    .toFile(path.join(publicDir, 'favicon.ico'));

  // 5. Maskable Icons (10% padded safe-zone)
  const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="#040406"/>
    <g transform="translate(51, 51) scale(0.8)">
      ${masterSvg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')}
    </g>
  </svg>`;

  const maskableBuffer = Buffer.from(maskableSvg);

  await sharp(maskableBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  await sharp(maskableBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'pwa-maskable-512x512.png'));

  await sharp(maskableBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-192x192.png'));

  await sharp(maskableBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, 'pwa-maskable-192x192.png'));

  console.log('All app icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
