import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { SkinProvider } from './context/SkinContext';

// Register Service Worker for PWA & Android TWA
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('[PWA] Service Worker успешно зарегистрирован:', registration.scope);
      })
      .catch((error) => {
        console.warn('[PWA] Ошибка регистрации Service Worker:', error);
      });
  });

  // Global protection against ChunkLoadError / dynamic import failure during rolling updates
  window.addEventListener('error', (event) => {
    if (
      event.message &&
      /Loading chunk [\d]+ failed|Failed to fetch dynamically imported module/i.test(event.message)
    ) {
      console.warn('[PWA] Dynamic chunk load failure intercepted:', event.message);
      if (!(window as unknown as { __MAFIA_IN_ROOM__?: boolean }).__MAFIA_IN_ROOM__) {
        window.location.reload();
      }
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || '');
    if (/Loading chunk [\d]+ failed|Failed to fetch dynamically imported module/i.test(reason)) {
      console.warn('[PWA] Dynamic chunk rejection intercepted:', reason);
      if (!(window as unknown as { __MAFIA_IN_ROOM__?: boolean }).__MAFIA_IN_ROOM__) {
        window.location.reload();
      }
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <SkinProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </SkinProvider>
  </ThemeProvider>
);

