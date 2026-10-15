#!/usr/bin/env bash
set -e

SOURCE_IMG="$1"
if [ -z "$SOURCE_IMG" ] || [ ! -f "$SOURCE_IMG" ]; then
  echo "Usage: $0 <path-to-source-image>"
  exit 1
fi

echo "Processing $SOURCE_IMG into app icons..."

mkdir -p public/icons

# 1. 512x512 standard
convert "$SOURCE_IMG" -resize 512x512! public/pwa-512x512.png
cp public/pwa-512x512.png public/icons/pwa-512x512.png

# 2. 192x192 standard
convert "$SOURCE_IMG" -resize 192x192! public/pwa-192x192.png
cp public/pwa-192x192.png public/icons/pwa-192x192.png

# 3. Maskable 512x512 (with safe zone padding on dark background)
convert "$SOURCE_IMG" -resize 410x410 -gravity center -background "#0d0e15" -extent 512x512 public/pwa-maskable-512x512.png
cp public/pwa-maskable-512x512.png public/icons/pwa-maskable-512x512.png

# 4. Maskable 192x192
convert "$SOURCE_IMG" -resize 154x154 -gravity center -background "#0d0e15" -extent 192x192 public/pwa-maskable-192x192.png
cp public/pwa-maskable-192x192.png public/icons/pwa-maskable-192x192.png

# 5. Apple Touch Icon (180x180)
convert "$SOURCE_IMG" -resize 180x180! public/apple-touch-icon.png
cp public/apple-touch-icon.png public/icons/apple-touch-icon.png

# 6. Favicon 32x32
convert "$SOURCE_IMG" -resize 32x32! public/favicon-32x32.png
cp public/favicon-32x32.png public/icons/favicon-32x32.png

# 7. Favicon.ico multi-resolution
convert "$SOURCE_IMG" -define icon:auto-resize=64,48,32,16 public/favicon.ico
cp public/favicon.ico public/icons/favicon.ico

echo "All icons successfully generated in public/ and public/icons/!"
