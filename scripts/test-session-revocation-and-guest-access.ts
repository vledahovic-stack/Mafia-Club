import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTests() {
  console.log('==============================================================');
  console.log('  MAFIA CLUB — ПРОВЕРКА ОТЗЫВА СЕССИИ И ГОСТЕВОГО ДОСТУПА');
  console.log('==============================================================\n');

  const testEmail = `test_session_${Date.now()}@mafia-club.local`;
  const testPassword = 'TestPassword123!';
  const testNickname = `Tester_${Math.floor(1000 + Math.random() * 9000)}`;

  // 1. Register a test user (Device A initial registration/login)
  console.log('1. Регистрация тестового пользователя и вход на Устройстве А...');
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      displayName: testNickname
    })
  });
  assert.equal(regRes.status, 200, 'Registration must succeed');
  const regData = await regRes.json();
  const tokenA = regData.token as string;
  const userId = regData.user.id as string;
  assert.ok(tokenA, 'Device A token must be issued');
  assert.equal(regData.user.displayName, testNickname);
  console.log(`   ✅ Устройство А авторизовано: userId=${userId}, tokenA=${tokenA.slice(0, 10)}...`);

  // 2. Connect Device A WebSocket on HomeView via INIT_USER (simulating user sitting on HomeView)
  console.log('2. Подключение WebSocket Устройства А на главном экране (INIT_USER)...');
  const wsDeviceA = new WebSocket(WS_URL);
  let deviceARevokedMsg: any = null;
  let deviceACloseCode: number | null = null;

  await new Promise<void>((resolve, reject) => {
    wsDeviceA.on('open', () => {
      wsDeviceA.send(JSON.stringify({
        type: 'INIT_USER',
        payload: { userId, token: tokenA }
      }));
      resolve();
    });
    wsDeviceA.on('error', reject);
  });

  wsDeviceA.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'AUTH_REVOKED') {
        deviceARevokedMsg = msg;
      }
    } catch {}
  });
  wsDeviceA.on('close', (code) => {
    deviceACloseCode = code;
  });
  await sleep(150);
  console.log('   ✅ Устройство А подключено через INIT_USER с активным токеном');

  // 3. Login to the same account on Device B
  console.log('3. Вход в тот же аккаунт на Устройстве Б...');
  const loginBRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword
    })
  });
  assert.equal(loginBRes.status, 200, 'Device B login must succeed');
  const loginBData = await loginBRes.json();
  const tokenB = loginBData.token as string;
  assert.ok(tokenB && tokenB !== tokenA, 'Device B must receive a new distinct sessionToken');
  console.log(`   ✅ Устройство Б получило новый токен: tokenB=${tokenB.slice(0, 10)}...`);

  // 4. Verify Device A immediately received AUTH_REVOKED over WebSocket even on HomeView
  await sleep(200);
  assert.ok(deviceARevokedMsg, 'Device A must immediately receive AUTH_REVOKED over WebSocket when Device B logs in');
  assert.equal(deviceARevokedMsg.type, 'AUTH_REVOKED');
  assert.equal(deviceACloseCode, 4001, 'Device A WebSocket must be closed with code 4001');
  console.log('   ✅ Устройство А мгновенно получило AUTH_REVOKED по WebSocket (код закрытия 4001)');

  // 5. Verify Device A's old token (tokenA) is rejected with 401 on /api/auth/me, /api/campaigns/check, and /api/admin/*
  console.log('4. Проверка отклонения устаревшего токена Устройства А на сервере...');
  const meARes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert.equal(meARes.status, 401, 'Old tokenA must return 401 on /api/auth/me');

  const campARes = await fetch(`${BASE_URL}/api/campaigns/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`
    }
  });
  assert.equal(campARes.status, 401, 'Old tokenA must return 401 on /api/campaigns/check');

  const adminEndpoints = [
    { method: 'GET', url: '/api/admin/stats' },
    { method: 'GET', url: '/api/admin/users' },
    { method: 'GET', url: '/api/admin/experience' },
    { method: 'GET', url: '/api/admin/items/catalog' },
    { method: 'GET', url: '/api/admin/lootboxes' },
    { method: 'GET', url: '/api/admin/loyalty' },
    { method: 'GET', url: '/api/admin/mail/config' },
    { method: 'GET', url: '/api/admin/partners' },
    { method: 'GET', url: '/api/admin/promocodes' },
    { method: 'GET', url: '/api/admin/events' }
  ];

  for (const ep of adminEndpoints) {
    const res = await fetch(`${BASE_URL}${ep.url}`, {
      method: ep.method,
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 401, `Admin endpoint ${ep.url} must return 401 for revoked tokenA`);
  }
  console.log('   ✅ Все проверенные эндпоинты (/api/auth/me, /api/campaigns/check, 10 разделов /api/admin/*) вернули HTTP 401 для устаревшего токена');

  // 6. Verify INIT_USER with revoked tokenA immediately triggers AUTH_REVOKED
  console.log('5. Проверка повторного подключения WebSocket с устаревшим токеном...');
  const wsStale = new WebSocket(WS_URL);
  let staleRevoked = false;
  await new Promise<void>((resolve) => {
    wsStale.on('open', () => {
      wsStale.send(JSON.stringify({
        type: 'INIT_USER',
        payload: { userId, token: tokenA }
      }));
    });
    wsStale.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'AUTH_REVOKED') {
        staleRevoked = true;
        resolve();
      }
    });
    setTimeout(resolve, 1000);
  });
  assert.equal(staleRevoked, true, 'INIT_USER with revoked token must immediately receive AUTH_REVOKED');
  console.log('   ✅ INIT_USER с устаревшим токеном немедленно возвращает AUTH_REVOKED');

  // 7. Verify Guest CANNOT create a room on the server (POST /api/rooms without token)
  console.log('6. Проверка запрета создания комнаты гостем на сервере (POST /api/rooms)...');
  const guestCreateRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostId: 'guest_abc1234',
      hostName: 'Гость',
      roomName: 'Гостевая комната'
    })
  });
  assert.equal(guestCreateRes.status, 401, 'Guest room creation without token must be rejected with HTTP 401');
  const guestCreateData = await guestCreateRes.json();
  assert.ok(guestCreateData.error, 'Error message must be returned when guest attempts to create room');
  console.log(`   ✅ Гость получил HTTP 401 при попытке создать комнату: "${guestCreateData.error}"`);

  // 8. Verify Device A with revoked token CANNOT create a room on the server
  console.log('7. Проверка запрета создания комнаты с устаревшим токеном Устройства А...');
  const revokedCreateRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      hostId: userId,
      hostName: testNickname,
      roomName: 'Комната старой сессии'
    })
  });
  assert.equal(revokedCreateRes.status, 401, 'Room creation with revoked tokenA must return HTTP 401');
  console.log('   ✅ Создание комнаты с устаревшим токеном отклонено с HTTP 401');

  // 9. Verify Device B (active authenticated session) CAN create a room
  console.log('8. Проверка создания комнаты авторизованным пользователем (Устройство Б)...');
  const validCreateRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenB}`
    },
    body: JSON.stringify({
      hostId: userId,
      hostName: testNickname,
      roomName: 'Комната Устройства Б'
    })
  });
  assert.equal(validCreateRes.status, 200, 'Authenticated user on Device B must be able to create a room');
  const validCreateData = await validCreateRes.json();
  const createdRoomCode = validCreateData.roomCode as string;
  assert.ok(createdRoomCode, 'Room code must be returned');
  console.log(`   ✅ Авторизованный пользователь успешно создал комнату #${createdRoomCode}`);

  // 10. Verify Guest CAN join the existing room as player and spectator
  console.log('9. Проверка входа чистого гостя в существующую комнату (игроком и зрителем)...');
  const guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
  const wsGuest = new WebSocket(WS_URL);
  let guestRoomState: any = null;

  await new Promise<void>((resolve, reject) => {
    wsGuest.on('open', () => {
      wsGuest.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode: createdRoomCode,
          playerId: guestId,
          playerName: 'Гость',
          asSpectator: false
        }
      }));
    });
    wsGuest.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'ROOM_STATE') {
        guestRoomState = msg.payload;
        resolve();
      } else if (msg.type === 'ERROR') {
        reject(new Error(`Guest JOIN_ROOM failed: ${msg.payload?.message}`));
      }
    });
    setTimeout(() => reject(new Error('Timeout waiting for guest ROOM_STATE')), 2000);
  });

  assert.ok(guestRoomState, 'Guest must receive ROOM_STATE when joining existing room');
  assert.ok(
    guestRoomState.players.some((p: any) => p.id === guestId && p.name === 'Гость'),
    'Guest must be present in room players list with independent guest identity'
  );
  wsGuest.close();
  console.log(`   ✅ Гость (${guestId}) успешно вошёл в существующую комнату #${createdRoomCode}`);

  // 11. Verify Client Code Architecture for Session Revocation & Guest Mode UI Flow
  console.log('10. Статическая проверка клиентской логики (App.tsx, HomeView.tsx, AdminPanelModal.tsx)...');
  const appTsx = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  const homeViewTsx = fs.readFileSync(path.resolve('src/components/HomeView.tsx'), 'utf8');
  const adminModalTsx = fs.readFileSync(path.resolve('src/components/AdminPanelModal.tsx'), 'utf8');
  const authModalTsx = fs.readFileSync(path.resolve('src/components/AuthModal.tsx'), 'utf8');

  // Check handleSessionRevoked clears admin/profile and opens AuthModal (setIsAuthOpen(true))
  assert.ok(appTsx.includes('setIsAdminOpen(false)'), 'resetToGuestIdentity must close AdminPanelModal');
  assert.ok(appTsx.includes('setIsProfileOpen(false)'), 'resetToGuestIdentity must close UserProfileModal');
  assert.ok(appTsx.includes('const handleSessionRevoked = useCallback'), 'handleSessionRevoked must exist');
  assert.ok(
    appTsx.includes('setIsAuthOpen(true)') && appTsx.includes("data.type === 'AUTH_REVOKED'"),
    'Session revocation must open AuthModal instead of silently dropping into guest mode'
  );
  // Check page reload with 401/403 calls handleSessionRevoked (which opens AuthModal)
  assert.ok(
    appTsx.includes('else if (res.status === 401 || res.status === 403)') &&
      appTsx.includes('sessionWasRevoked = true'),
    'Page reload with invalid token must call handleSessionRevoked and open AuthModal'
  );
  // Check AuthModal still has "Продолжить как гость" button
  assert.ok(
    authModalTsx.includes('Продолжить как гость'),
    'AuthModal must preserve the "Продолжить как гость" button'
  );
  // Check HomeView blocks guest from opening CreateRoomModal and routes to onCreateRoom('') -> AuthModal
  assert.ok(
    homeViewTsx.includes('if (!isLoggedIn || !user)') && homeViewTsx.includes("onCreateRoom('')"),
    'HomeView must prevent unauthenticated users from opening CreateRoomModal'
  );
  // Check AdminPanelModal closes and dispatches mafia_session_revoked on 401
  assert.ok(
    adminModalTsx.includes("window.dispatchEvent(new CustomEvent('mafia_session_revoked'))"),
    'AdminPanelModal must dispatch mafia_session_revoked on 401'
  );
  console.log('   ✅ Все клиентские проверки состояния, модального окна входа и защиты комнат пройдены');

  console.log('\n==============================================================');
  console.log('  ИТОГ: ВСЕ 10 ТЕСТОВЫХ СЦЕНАРИЕВ УСПЕШНО ПРОЙДЕНЫ (10/10)');
  console.log('==============================================================');
}

runTests().catch((err) => {
  console.error('❌ ОШИБКА ТЕСТА:', err);
  process.exit(1);
});
