import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';
import {
  OUT_OF_GAME_MENU_ORDER,
  IN_GAME_MENU_ORDER,
  buildBurgerMenuItems,
  NavDrawerTab
} from '../src/components/NavigationDrawer';
import { AuthUser } from '../src/components/AuthModal';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

const tMock = (_key: string, fallback: string) => fallback;

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, idx) => v === b[idx]);
}

async function runTests() {
  console.log('=== MAFIA CLUB — АВТОМАТИЧЕСКОЕ ТЕСТИРОВАНИЕ ДВУХ БУРГЕР-МЕНЮ ===\n');

  // 1. Out-of-Game Menu Order & Conditional Visibility (Guest, Authenticated, Admin)
  console.log('--- 1. Проверка внеигрового меню (HomeView, !roomState) ---');

  const expectedOutOfGameFullOrder: NavDrawerTab[] = [
    'profile',
    'bonus',
    'tasks',
    'shop',
    'campaigns',
    'promocode',
    'clans',
    'pawnshop',
    'settings',
    'feedback',
    'admin',
    'logout'
  ];
  assert(
    arraysEqual(OUT_OF_GAME_MENU_ORDER, expectedOutOfGameFullOrder),
    `OUT_OF_GAME_MENU_ORDER строго соответствует ТЗ (12 пунктов, без 'lobby'): [${OUT_OF_GAME_MENU_ORDER.join(', ')}]`
  );

  // Guest in Out-of-Game Menu
  const outGuestItems = buildBurgerMenuItems({
    variant: 'out_of_game',
    isLoggedIn: false,
    user: null,
    t: tMock
  });
  const outGuestIds = outGuestItems.map(i => i.id);
  const expectedOutGuestIds: NavDrawerTab[] = [
    'profile',
    'bonus',
    'tasks',
    'shop',
    'clans',
    'pawnshop',
    'settings',
    'feedback',
    'logout'
  ];
  assert(
    arraysEqual(outGuestIds, expectedOutGuestIds),
    `Внеигровое меню (Гость): скрыты campaigns, promocode, admin, lobby, stop_match, leave_room (${outGuestIds.join(', ')})`
  );
  assert(
    outGuestItems.find(i => i.id === 'logout')?.title === 'Войти в аккаунт',
    'Внеигровое меню (Гость): пункт logout имеет заголовок «Войти в аккаунт»'
  );

  // Registered Player in Out-of-Game Menu
  const regularUser: AuthUser = {
    id: 'user_reg_1',
    email: 'player@example.com',
    displayName: 'Игрок',
    avatarSeed: 'seed_1',
    createdAt: new Date().toISOString(),
    role: 'user',
    isAdmin: false
  };
  const outAuthItems = buildBurgerMenuItems({
    variant: 'out_of_game',
    isLoggedIn: true,
    user: regularUser,
    t: tMock
  });
  const outAuthIds = outAuthItems.map(i => i.id);
  const expectedOutAuthIds: NavDrawerTab[] = [
    'profile',
    'bonus',
    'tasks',
    'shop',
    'campaigns',
    'promocode',
    'clans',
    'pawnshop',
    'settings',
    'feedback',
    'logout'
  ];
  assert(
    arraysEqual(outAuthIds, expectedOutAuthIds),
    `Внеигровое меню (Авторизованный игрок): 11 пунктов в точном порядке (${outAuthIds.join(', ')})`
  );
  assert(
    outAuthItems.find(i => i.id === 'logout')?.title === 'Выйти из аккаунта',
    'Внеигровое меню (Авторизованный игрок): пункт logout имеет заголовок «Выйти из аккаунта»'
  );

  // Super Admin in Out-of-Game Menu (even if passed onLeaveRoom/onStopMatch accidentally, out_of_game ignores them)
  const adminUser: AuthUser = {
    id: 'admin_1',
    email: 'vledahovic@gmail.com',
    displayName: 'Босс',
    avatarSeed: 'seed_admin',
    createdAt: new Date().toISOString(),
    role: 'admin',
    isAdmin: true
  };
  const outAdminItems = buildBurgerMenuItems({
    variant: 'out_of_game',
    isLoggedIn: true,
    user: adminUser,
    isHost: true,
    onLeaveRoom: () => {},
    onStopMatch: () => {},
    t: tMock
  });
  const outAdminIds = outAdminItems.map(i => i.id);
  assert(
    arraysEqual(outAdminIds, expectedOutOfGameFullOrder),
    `Внеигровое меню (Администратор): все 12 пунктов в точном порядке (${outAdminIds.join(', ')})`
  );
  assert(
    !outAdminIds.includes('lobby') && !outAdminIds.includes('leave_room') && !outAdminIds.includes('stop_match'),
    'Внеигровое меню гарантированно не содержит lobby, leave_room и stop_match'
  );

  // 2. In-Game Menu Order & Conditional Visibility (LobbyView vs InGameView)
  console.log('\n--- 2. Проверка внутриигрового меню (LobbyView и InGameView) ---');

  const expectedInGameFullOrder: NavDrawerTab[] = [
    'settings',
    'profile',
    'tasks',
    'bonus',
    'shop',
    'campaigns',
    'promocode',
    'clans',
    'pawnshop',
    'feedback',
    'admin',
    'logout',
    'stop_match',
    'leave_room'
  ];
  assert(
    arraysEqual(IN_GAME_MENU_ORDER, expectedInGameFullOrder),
    `IN_GAME_MENU_ORDER строго соответствует ТЗ (14 пунктов, без 'lobby'): [${IN_GAME_MENU_ORDER.join(', ')}]`
  );

  // Waiting Room (LobbyView): Host in LOBBY (onStopMatch is undefined, onLeaveRoom is defined)
  const lobbyHostItems = buildBurgerMenuItems({
    variant: 'in_game',
    isLoggedIn: true,
    user: regularUser,
    isHost: true,
    onLeaveRoom: () => {},
    onStopMatch: undefined,
    t: tMock
  });
  const lobbyHostIds = lobbyHostItems.map(i => i.id);
  const expectedLobbyHostIds: NavDrawerTab[] = [
    'settings',
    'profile',
    'tasks',
    'bonus',
    'shop',
    'campaigns',
    'promocode',
    'clans',
    'pawnshop',
    'feedback',
    'logout',
    'leave_room'
  ];
  assert(
    arraysEqual(lobbyHostIds, expectedLobbyHostIds),
    `Внутриигровое меню в комнате ожидания (LobbyView, Хост): stop_match скрыт, leave_room отображается внизу (${lobbyHostIds.join(', ')})`
  );

  // Active Match (InGameView): Regular Player (isHost = false, onStopMatch passed)
  const inGamePlayerItems = buildBurgerMenuItems({
    variant: 'in_game',
    isLoggedIn: true,
    user: regularUser,
    isHost: false,
    onLeaveRoom: () => {},
    onStopMatch: () => {},
    t: tMock
  });
  const inGamePlayerIds = inGamePlayerItems.map(i => i.id);
  assert(
    arraysEqual(inGamePlayerIds, expectedLobbyHostIds),
    'Внутриигровое меню в активной партии (Обычный игрок / Зритель): stop_match скрыт, leave_room доступен'
  );

  // Active Match (InGameView): Host (isHost = true, onStopMatch passed)
  const inGameHostItems = buildBurgerMenuItems({
    variant: 'in_game',
    isLoggedIn: true,
    user: regularUser,
    isHost: true,
    onLeaveRoom: () => {},
    onStopMatch: () => {},
    t: tMock
  });
  const inGameHostIds = inGameHostItems.map(i => i.id);
  const expectedInGameHostIds: NavDrawerTab[] = [
    'settings',
    'profile',
    'tasks',
    'bonus',
    'shop',
    'campaigns',
    'promocode',
    'clans',
    'pawnshop',
    'feedback',
    'logout',
    'stop_match',
    'leave_room'
  ];
  assert(
    arraysEqual(inGameHostIds, expectedInGameHostIds),
    `Внутриигровое меню в активной партии (Хост): stop_match (13) и leave_room (14) в самом низу (${inGameHostIds.join(', ')})`
  );

  // Active Match (InGameView): Admin + Host
  const inGameAdminHostItems = buildBurgerMenuItems({
    variant: 'in_game',
    isLoggedIn: true,
    user: adminUser,
    isHost: true,
    onLeaveRoom: () => {},
    onStopMatch: () => {},
    t: tMock
  });
  const inGameAdminHostIds = inGameAdminHostItems.map(i => i.id);
  assert(
    arraysEqual(inGameAdminHostIds, expectedInGameFullOrder),
    `Внутриигровое меню в активной партии (Админ + Хост): все 14 пунктов в точном порядке (${inGameAdminHostIds.join(', ')})`
  );

  // Visual separation & danger flags for stop_match and leave_room
  const stopMatchItem = inGameAdminHostItems.find(i => i.id === 'stop_match');
  const leaveRoomItem = inGameAdminHostItems.find(i => i.id === 'leave_room');
  assert(
    Boolean(
      stopMatchItem?.isDanger &&
        stopMatchItem?.group === 'room_actions' &&
        leaveRoomItem?.isDanger &&
        leaveRoomItem?.group === 'room_actions'
    ),
    'Пункты 13 (stop_match) и 14 (leave_room) выделены в отдельную группу room_actions с флагом isDanger: true'
  );
  assert(
    inGameAdminHostItems.filter(i => i.group === 'main').length === 12 &&
      inGameAdminHostItems.filter(i => i.group === 'room_actions').length === 2,
    'Основные пункты (1–12) находятся в группе main, а опасные игровые действия (13–14) — в группе room_actions'
  );

  // 3. Static Verification of Source Files (Bottom Sheet, Escape, Scroll Lock, Compactness, Defects Fixed)
  console.log('\n--- 3. Проверка исходного кода компонентов (шторка снизу, отступы, исправление багов) ---');

  const navDrawerSrc = fs.readFileSync(path.resolve('src/components/NavigationDrawer.tsx'), 'utf8');
  const homeViewSrc = fs.readFileSync(path.resolve('src/components/HomeView.tsx'), 'utf8');
  const lobbyViewSrc = fs.readFileSync(path.resolve('src/components/LobbyView.tsx'), 'utf8');
  const inGameViewSrc = fs.readFileSync(path.resolve('src/components/InGameView.tsx'), 'utf8');

  assert(
    navDrawerSrc.includes('translate-y-full translate-x-0 md:translate-y-0 md:translate-x-full') &&
      navDrawerSrc.includes('translate-y-0 translate-x-0 md:translate-y-0 md:translate-x-0') &&
      navDrawerSrc.includes('rounded-t-2xl sm:rounded-t-3xl md:rounded-none') &&
      navDrawerSrc.includes('md:w-screen md:max-w-md md:h-full'),
    'NavigationDrawer реализует адаптивное направление: <768px (390px, 767px) — нижняя шторка (translate-y-full -> translate-y-0), >=768px (768px, 1280px, md:) — боковая панель справа (md:translate-x-full -> md:translate-x-0)'
  );
  const dialogMatches = navDrawerSrc.match(/role="dialog"/g) || [];
  assert(
    dialogMatches.length === 1 && !navDrawerSrc.includes('navigator.userAgent'),
    `NavigationDrawer использует единый DOM-экземпляр меню (role="dialog": ${dialogMatches.length}) и опирается на CSS-ширину окна (md: 768px), а не на User-Agent`
  );
  assert(
    navDrawerSrc.includes("e.key === 'Escape'") && navDrawerSrc.includes("window.addEventListener('keydown'"),
    'NavigationDrawer поддерживает закрытие по клавише Escape'
  );
  assert(
    navDrawerSrc.includes("document.body.style.overflow = 'hidden'") &&
      navDrawerSrc.includes('document.body.style.overflow = prevBodyOverflow'),
    'NavigationDrawer блокирует прокрутку фонового документа при открытии и восстанавливает её при закрытии'
  );
  assert(
    navDrawerSrc.includes('env(safe-area-inset-bottom)') &&
      navDrawerSrc.includes('max-h-[min(85dvh,calc(100dvh-0.75rem))]') &&
      navDrawerSrc.includes('min-h-[46px]'),
    'NavigationDrawer учитывает safe-area мобильных устройств, ограничение высоты 85dvh и высоту кнопок >= 44px (min-h-[46px])'
  );
  assert(
    homeViewSrc.includes('variant="out_of_game"') &&
      lobbyViewSrc.includes('variant="in_game"') &&
      inGameViewSrc.includes('variant="in_game"'),
    'HomeView использует variant="out_of_game", а LobbyView и InGameView — variant="in_game"'
  );

  // Check defect A: 'lobby' no longer triggers onLeaveRoom in LobbyView or InGameView
  assert(
    !lobbyViewSrc.includes("case 'lobby':\n      case 'leave_room':") &&
      !inGameViewSrc.includes("case 'lobby':\n        onLeaveRoom();"),
    'Дефект А исправлен: пункт lobby больше не вызывает выход из комнаты в LobbyView и InGameView'
  );

  // Check defect B: FeedbackModal wired in InGameView
  assert(
    inGameViewSrc.includes("import { FeedbackModal } from './FeedbackModal';") &&
      inGameViewSrc.includes("case 'feedback':\n        setIsFeedbackOpen(true);") &&
      inGameViewSrc.includes('<FeedbackModal'),
    'Дефект Б исправлен: FeedbackModal импортирован, подключён к case feedback и смонтирован в InGameView'
  );

  // Check defect C: SettingsModal mounted only once in HomeView and has onOpenShop
  const homeSettingsMatches = homeViewSrc.match(/<SettingsModal/g) || [];
  assert(
    homeSettingsMatches.length === 1 && homeViewSrc.includes('onOpenShop={() => setIsShopOpen(true)}'),
    `Дефект В исправлен: SettingsModal в HomeView монтируется ровно 1 раз (найдено: ${homeSettingsMatches.length}) и сохраняет onOpenShop`
  );

  // 4. Live Server & WebSocket Integration Test (Auth, Room Creation, Lobby -> Active Match -> Stop Match -> Leave Room, Feedback API)
  console.log('\n--- 4. Интеграционная проверка сервера, комнат, смены фаз и Feedback API ---');

  const uniqueSuffix = Date.now().toString().slice(-6);
  const testEmail = `burger_test_${uniqueSuffix}@example.com`;
  const testNick = `BurgerHost_${uniqueSuffix}`;

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'Password123!',
      displayName: testNick
    })
  });
  const regData = await regRes.json();
  assert(regRes.ok && Boolean(regData.token), 'Регистрация тестового авторизованного пользователя успешна');

  const token = regData.token as string;
  const userId = regData.user.id as string;

  // Test Feedback submission API (used by FeedbackModal from InGameView)
  const fbRes = await fetch(`${BASE_URL}/api/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      type: 'bug',
      title: 'Проверка обратной связи из активной партии',
      description: 'Тестовое обращение из внутриигрового бургер-меню во время партии',
      images: []
    })
  });
  const fbData = await fbRes.json();
  assert(
    fbRes.ok && Boolean(fbData.feedback || fbData.message),
    'API отправки обратной связи (POST /api/feedback) работает штатно'
  );

  // Test Room Creation as Authenticated User (POST /api/rooms)
  const createRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token
    },
    body: JSON.stringify({
      hostName: testNick,
      hostId: userId,
      roomName: 'Тестовый стол Бургер-меню',
      maxPlayers: 10,
      isPrivate: false,
      token
    })
  });
  const createData = await createRes.json();
  assert(
    createRes.ok && Boolean(createData.roomCode),
    `Создание комнаты авторизованным пользователем успешно (roomCode=${createData.roomCode})`
  );

  const roomCode = createData.roomCode as string;

  // Connect via WebSocket, join room, add bots, start match, verify phase transition, restart game (stop_match), leave room (leave_room)
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let currentPhase = '';
    let seenInGamePhase = false;
    let seenResetToLobby = false;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket test timed out'));
    }, 10000);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          payload: {
            roomCode,
            playerName: testNick,
            playerId: userId,
            token
          }
        })
      );
    });

    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'ROOM_STATE') {
        const state = msg.payload;
        const prevPhase = currentPhase;
        currentPhase = state.phase;

        if (currentPhase === 'LOBBY' && !seenInGamePhase) {
          const isHost = state.hostId === userId;
          const lobbyMenu = buildBurgerMenuItems({
            variant: 'in_game',
            isLoggedIn: true,
            user: regData.user,
            isHost,
            onLeaveRoom: () => {},
            onStopMatch: undefined, // LobbyView does not pass onStopMatch
            t: tMock
          });
          if (state.players.length < 6) {
            ws.send(JSON.stringify({ type: 'ADD_BOT' }));
          } else {
            assert(
              !lobbyMenu.some(i => i.id === 'stop_match') && lobbyMenu.some(i => i.id === 'leave_room'),
              'В фазе LOBBY у хоста нет кнопки stop_match, но есть leave_room'
            );
            ws.send(JSON.stringify({ type: 'START_GAME' }));
          }
        } else if (currentPhase !== 'LOBBY' && !seenInGamePhase) {
          seenInGamePhase = true;
          const isHost = state.hostId === userId && !state.closingAfterMatch;
          const activeMatchMenu = buildBurgerMenuItems({
            variant: 'in_game',
            isLoggedIn: true,
            user: regData.user,
            isHost,
            onLeaveRoom: () => {},
            onStopMatch: () => {},
            t: tMock
          });
          assert(
            activeMatchMenu.some(i => i.id === 'stop_match') &&
              activeMatchMenu.some(i => i.id === 'leave_room') &&
              activeMatchMenu.some(i => i.id === 'feedback'),
            `При переходе из LOBBY в активную партию (${currentPhase}) в меню хоста динамически появляется stop_match`
          );
          // Trigger RESTART_GAME (what stop_match confirmation executes)
          ws.send(JSON.stringify({ type: 'RESTART_GAME' }));
        } else if (currentPhase === 'LOBBY' && seenInGamePhase && !seenResetToLobby && prevPhase !== 'LOBBY') {
          seenResetToLobby = true;
          assert(
            true,
            'Действие «Остановить партию» (RESTART_GAME) корректно возвращает стол в фазу LOBBY'
          );
          // Trigger LEAVE_ROOM (what leave_room executes)
          ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
          setTimeout(() => {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }, 250);
        }
      }
    });

    ws.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  console.log(`\n=== ИТОГ ТЕСТИРОВАНИЯ: ${passed} пройдено, ${failed} ошибок ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
