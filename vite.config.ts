import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon.svg',
          'offline.html',
          'icons/*.png',
          'screenshots/*.png'
        ],
        manifest: {
          id: '/',
          name: 'Мафия Онлайн: Город Засыпает',
          short_name: 'Мафия Онлайн',
          description: 'Полноценная многопользовательская онлайн-платформа для игры в классическую и городскую Мафию с комнатами, ролями, голосованием и звуковой атмосферой.',
          theme_color: '#0d0e15',
          background_color: '#0d0e15',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui', 'window-controls-overlay'],
          orientation: 'any',
          start_url: '/',
          scope: '/',
          lang: 'ru',
          dir: 'ltr',
          categories: ['games', 'entertainment', 'social'],
          prefer_related_applications: false,
          icons: [
            {
              src: '/icons/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/pwa-maskable-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: '/icons/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: '/icons/apple-touch-icon.png',
              sizes: '180x180',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            }
          ],
          screenshots: [
            {
              src: '/screenshots/screenshot-narrow.png',
              sizes: '720x1280',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Игровой стол и карточки игроков в мобильном приложении'
            },
            {
              src: '/screenshots/screenshot-wide.png',
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Полноэкранный вид игрового стола и чата на планшете и ПК'
            }
          ],
          shortcuts: [
            {
              name: 'Быстрая игра',
              short_name: 'Играть',
              description: 'Присоединиться к публичной комнате',
              url: '/?action=quick_play',
              icons: [{ src: '/icons/pwa-192x192.png', sizes: '192x192' }]
            },
            {
              name: 'Создать комнату',
              short_name: 'Создать',
              description: 'Создать новую игровую комнату',
              url: '/?action=create_room',
              icons: [{ src: '/icons/pwa-192x192.png', sizes: '192x192' }]
            }
          ]
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB for bundled assets
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
          navigateFallback: '/offline.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      })
    ],
    build: {
      chunkSizeWarningLimit: 3000,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

