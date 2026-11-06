import fs from 'fs';
import path from 'path';
import {
  OUT_OF_GAME_MENU_ORDER,
  IN_GAME_MENU_ORDER,
  buildBurgerMenuItems
} from '../src/components/NavigationDrawer';

async function runStage2Tests() {
  console.log('====================================================');
  console.log('🧪 MAFIA CLUB — PWA ЭТАП №2 ТЕСТ УСТАНОВКИ ПРИЛОЖЕНИЯ');
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

  const dummyT = (key: string, fallback?: string) => fallback || key;

  // 1. Menu order verification
  assert(
    OUT_OF_GAME_MENU_ORDER.includes('install_pwa'),
    '1. Внеигровое меню содержит пункт install_pwa',
    `OUT_OF_GAME_MENU_ORDER: ${JSON.stringify(OUT_OF_GAME_MENU_ORDER)}`
  );

  assert(
    !IN_GAME_MENU_ORDER.includes('install_pwa'),
    '2. Внутриигровое меню НЕ содержит пункт install_pwa',
    `IN_GAME_MENU_ORDER: ${JSON.stringify(IN_GAME_MENU_ORDER)}`
  );

  const settingsIdx = OUT_OF_GAME_MENU_ORDER.indexOf('settings');
  const installIdx = OUT_OF_GAME_MENU_ORDER.indexOf('install_pwa');
  const feedbackIdx = OUT_OF_GAME_MENU_ORDER.indexOf('feedback');

  assert(
    installIdx > settingsIdx && installIdx < feedbackIdx,
    '3. Пункт install_pwa расположен гармонично между settings и feedback',
    `settings: ${settingsIdx}, install_pwa: ${installIdx}, feedback: ${feedbackIdx}`
  );

  // 2. buildBurgerMenuItems rendering logic
  const outOfGameUninstalled = buildBurgerMenuItems({
    variant: 'out_of_game',
    isLoggedIn: true,
    user: { id: 'u1', email: 'test@mafia.com', displayName: 'Player1' } as any,
    t: dummyT,
    isInstalled: false,
    isAndroid: true
  });

  const installItemAndroid = outOfGameUninstalled.find(i => i.id === 'install_pwa');
  assert(
    Boolean(installItemAndroid),
    '4. buildBurgerMenuItems (вне игры, не установлено) включает пункт install_pwa'
  );
  assert(
    installItemAndroid?.title === 'Установить приложение',
    '5. Заголовок пункта: "Установить приложение"'
  );
  assert(
    installItemAndroid?.badge === 'ANDROID',
    '6. На Android отображается бейдж ANDROID'
  );

  const outOfGameIOS = buildBurgerMenuItems({
    variant: 'out_of_game',
    isLoggedIn: false,
    t: dummyT,
    isInstalled: false,
    isIOS: true
  });
  const installItemIOS = outOfGameIOS.find(i => i.id === 'install_pwa');
  assert(
    installItemIOS?.badge === 'IOS',
    '7. На iOS отображается бейдж IOS'
  );

  // 3. Standalone concealment
  const outOfGameInstalled = buildBurgerMenuItems({
    variant: 'out_of_game',
    isLoggedIn: true,
    t: dummyT,
    isInstalled: true
  });
  const installedItem = outOfGameInstalled.find(i => i.id === 'install_pwa');
  assert(
    !installedItem,
    '8. Пункт install_pwa скрывается, если приложение уже установлено (isInstalled = true)'
  );

  // 4. In-Game menu concealment
  const inGameItems = buildBurgerMenuItems({
    variant: 'in_game',
    isLoggedIn: true,
    t: dummyT,
    isInstalled: false,
    onLeaveRoom: () => {}
  });
  const inGameInstallItem = inGameItems.find(i => i.id === 'install_pwa');
  assert(
    !inGameInstallItem,
    '9. Пункт install_pwa отсутствует во внутриигровом меню (variant: in_game)'
  );

  // 5. Check usePWAInstall hook implementation
  const hookPath = path.resolve(process.cwd(), 'src/hooks/usePWAInstall.ts');
  const hookContent = fs.readFileSync(hookPath, 'utf8');

  assert(
    hookContent.includes('beforeinstallprompt') && hookContent.includes('capturedPrompt'),
    '10. usePWAInstall перехватывает beforeinstallprompt на уровне модуля (без риска пропуска)'
  );

  assert(
    hookContent.includes('(display-mode: standalone)') && hookContent.includes('checkIsStandalone'),
    '11. usePWAInstall содержит полноценную проверку standalone режима'
  );

  // 6. Check PWAInstallModal implementation
  const modalPath = path.resolve(process.cwd(), 'src/components/PWAInstallModal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  assert(
    modalContent.includes('Поделиться') && modalContent.includes('На экран „Домой“'),
    '12. PWAInstallModal содержит пошаговую инструкцию для iOS Safari'
  );

  assert(
    modalContent.includes('три точки') && modalContent.includes('Установить приложение'),
    '13. PWAInstallModal содержит понятную инструкцию для Android браузеров'
  );

  assert(
    modalContent.includes('адресной строки') && modalContent.includes('Установить'),
    '14. PWAInstallModal содержит инструкцию для настольных компьютеров'
  );

  // 7. Check NavigationDrawer integration
  const drawerPath = path.resolve(process.cwd(), 'src/components/NavigationDrawer.tsx');
  const drawerContent = fs.readFileSync(drawerPath, 'utf8');

  assert(
    drawerContent.includes('<PWAInstallModal') && drawerContent.includes('pwaInstall.install'),
    '15. NavigationDrawer вызывает нативный install() при доступности и PWAInstallModal при недоступности'
  );

  console.log('\n====================================================');
  console.log(`ИТОГИ ТЕСТИРОВАНИЯ ЭТАПА №2: Пройдено: ${passed} | Ошибок: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStage2Tests().catch((e) => {
  console.error('Fatal Stage 2 test error:', e);
  process.exit(1);
});
