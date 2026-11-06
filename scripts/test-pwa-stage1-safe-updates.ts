import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 MAFIA CLUB — PWA ЭТАП №1 ТЕСТ БЕЗОПАСНЫХ ОБНОВЛЕНИЙ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (details) console.error(`   👉 Details: ${details}`);
      failed++;
    }
  }

  // 1. Check public/sw.js
  const publicSwPath = path.resolve(process.cwd(), 'public/sw.js');
  const publicSw = fs.readFileSync(publicSwPath, 'utf8');

  assert(
    !publicSw.includes('self.skipWaiting()') || publicSw.includes("event.data.type === 'SKIP_WAITING'"),
    'PWA-02: public/sw.js не содержит автоматического skipWaiting()',
    'Обнаружен вызов self.skipWaiting() без условия SKIP_WAITING'
  );

  assert(
    !publicSw.includes('self.clients.claim()'),
    'PWA-02: public/sw.js не вызывает агрессивный self.clients.claim() при установке'
  );

  assert(
    publicSw.includes("event.data.type === 'SKIP_WAITING'") && publicSw.includes('self.skipWaiting()'),
    'PWA-02: public/sw.js ожидает явное сообщение SKIP_WAITING от клиента'
  );

  assert(
    publicSw.includes("request.mode === 'navigate'") && publicSw.includes('/index.html'),
    'PWA-03: public/sw.js возвращает закэшированный index.html для навигации вместо мгновенного offline.html'
  );

  assert(
    publicSw.includes("pathname.startsWith('/api/')"),
    'PWA-03/04: public/sw.js явно пропускает /api/ запросы мимо кэша'
  );

  // 2. Check vite.config.ts Workbox configuration
  const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
  const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');

  assert(
    viteConfig.includes("registerType: 'prompt'"),
    'PWA-04: vite.config.ts использует registerType: prompt для безопасных обновлений'
  );

  assert(
    viteConfig.includes('skipWaiting: false'),
    'PWA-02/04: Workbox config имеет skipWaiting: false'
  );

  assert(
    viteConfig.includes('clientsClaim: false'),
    'PWA-02/04: Workbox config имеет clientsClaim: false'
  );

  assert(
    viteConfig.includes("navigateFallback: '/index.html'"),
    'PWA-03/04: Workbox config использует /index.html как navigateFallback'
  );

  // 3. Check dist/sw.js if built
  const distSwPath = path.resolve(process.cwd(), 'dist/sw.js');
  if (fs.existsSync(distSwPath)) {
    const distSw = fs.readFileSync(distSwPath, 'utf8');

    assert(
      distSw.includes('SKIP_WAITING') && distSw.includes('skipWaiting'),
      'PWA-04: dist/sw.js обрабатывает событие SKIP_WAITING'
    );

    assert(
      distSw.includes('/index.html'),
      'PWA-04: dist/sw.js прекэширует и навигирует на /index.html'
    );
  } else {
    console.warn('⚠️ [SKIP] dist/sw.js еще не скомпилирован');
  }

  // 4. Check client safety in usePWAUpdate and App.tsx
  const updateHookPath = path.resolve(process.cwd(), 'src/hooks/usePWAUpdate.ts');
  const updateHook = fs.readFileSync(updateHookPath, 'utf8');

  assert(
    updateHook.includes('if (isInRoom)') && updateHook.includes("type: 'SKIP_WAITING'"),
    'PWA-02: usePWAUpdate блокирует принудительное обновление во время нахождения в комнате'
  );

  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert(
    appContent.includes('usePWAUpdate(isInsideRoom)'),
    'PWA-02: App.tsx передает флаг нахождения в комнате (isInsideRoom) в хук обновления'
  );

  assert(
    appContent.includes('<PWAUpdateBanner'),
    'PWA-02: App.tsx монтирует PWAUpdateBanner для уведомления игрока'
  );

  const mainPath = path.resolve(process.cwd(), 'src/main.tsx');
  const mainContent = fs.readFileSync(mainPath, 'utf8');

  assert(
    mainContent.includes('__MAFIA_IN_ROOM__') && mainContent.includes('ChunkLoadError'),
    'PWA-02/04: main.tsx содержит защиту от ChunkLoadError с учетом статуса активной комнаты'
  );

  // 5. Check HTTP headers on localhost:3000
  try {
    const swRes = await fetch('http://localhost:3000/sw.js');
    const cc = swRes.headers.get('cache-control') || '';
    const swAllowed = swRes.headers.get('service-worker-allowed') || '';

    assert(
      cc.includes('no-cache') && cc.includes('no-store'),
      'PWA-05: /sw.js отдает Cache-Control: no-cache, no-store, must-revalidate',
      `Actual Cache-Control: "${cc}"`
    );

    assert(
      swAllowed === '/',
      'PWA-05: /sw.js отдает Service-Worker-Allowed: /',
      `Actual Service-Worker-Allowed: "${swAllowed}"`
    );

    const indexRes = await fetch('http://localhost:3000/');
    const indexCc = indexRes.headers.get('cache-control') || '';

    assert(
      indexCc.includes('no-cache'),
      'PWA-05: / (index.html) отдает Cache-Control: no-cache',
      `Actual Cache-Control: "${indexCc}"`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(false, 'PWA-05: Проверка сетевых заголовков локального сервера', msg);
  }

  console.log('\n====================================================');
  console.log(`ИТОГИ ТЕСТИРОВАНИЯ: Пройдено: ${passed} | Ошибок: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
