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

