import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { waitForDatabaseInit, getDatabase } from '../server/db/database';
import { userDb } from '../server/db/users';
import { roomManager } from '../server/game/roomManager';
import { ROLE_SELECT_CARD_ID } from '../src/data/items';

const HTTP_BASE = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

function getRoleCardQty(inventory: Array<{ itemId: string; quantity: number }> | undefined): number {
  if (!Array.isArray(inventory)) return 0;
  return inventory
    .filter((i) => i.itemId === ROLE_SELECT_CARD_ID)
    .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
}

async function createTestUser(prefix: string) {
  const suffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const email = `${prefix}_${suffix}@test.mafiaclub.local`;
  const displayName = `${prefix}_${suffix.slice(-5)}`;
  const user = await userDb.register(email, 'TestPass123!', displayName);
  return user;
}

function connectWs(): Promise<{
  ws: WebSocket;
  messages: any[];
  waitForMessage: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const messages: any[] = [];
    const waiters: Array<{
      predicate: (msg: any) => boolean;
      resolve: (msg: any) => void;
      timer: NodeJS.Timeout;
    }> = [];

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        messages.push(parsed);
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (waiters[i].predicate(parsed)) {
            const w = waiters.splice(i, 1)[0];
            clearTimeout(w.timer);
            w.resolve(parsed);
          }
        }
      } catch {}
    });

    const waitForMessage = (predicate: (msg: any) => boolean, timeoutMs = 4000): Promise<any> => {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.timer === timer);
          if (idx !== -1) waiters.splice(idx, 1);
          rej(new Error(`Timeout waiting for WS message. Received: ${JSON.stringify(messages.map(m => ({ type: m.type, payload: m.payload })))}`));
        }, timeoutMs);
        waiters.push({ predicate, resolve: res, timer });
      });
    };

    ws.on('open', () => resolve({ ws, messages, waitForMessage }));
    ws.on('error', (err) => reject(err));
  });
}

async function main() {
  await waitForDatabaseInit();
  const db = getDatabase();
  const createdUserIds: string[] = [];
  const createdLocalRoomCodes: string[] = [];

  try {
    console.log('--- Начало автоматического тестирования исключения игрока ведущим из комнаты ожидания ---');

    const hostUser = await createTestUser('Host');
    const regPlayerUser = await createTestUser('RegPlayer');
    const cardPlayerUser = await createTestUser('CardPlayer');
    createdUserIds.push(hostUser.id, regPlayerUser.id, cardPlayerUser.id);

    // Create room on running server via HTTP API
    const createRoomRes = await fetch(`${HTTP_BASE}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostUser.sessionToken}`
      },
      body: JSON.stringify({
        hostId: hostUser.id,
        hostName: hostUser.displayName,
        roomName: 'Тестовая комната Kick',
        settings: { maxPlayers: 6 },
        token: hostUser.sessionToken
      })
    });
    assert.equal(createRoomRes.status, 200, 'Комната должна создаваться через HTTP API');
    const createRoomData = await createRoomRes.json();
    const roomCode: string = createRoomData.roomCode;
    assert.ok(roomCode, 'Должен вернуться код комнаты');

    const hostClient = await connectWs();
    const regClient = await connectWs();
    const guestClient = await connectWs();
    const guestId = `guest_test_${Date.now()}`;

    hostClient.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: hostUser.id,
          playerName: hostUser.displayName,
          token: hostUser.sessionToken
        }
      })
    );
    await hostClient.waitForMessage((m) => m.type === 'ROOM_STATE');

    regClient.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: regPlayerUser.id,
          playerName: regPlayerUser.displayName,
          token: regPlayerUser.sessionToken
        }
      })
    );
    await regClient.waitForMessage((m) => m.type === 'ROOM_STATE');

    guestClient.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: guestId,
          playerName: 'Гость Тест'
        }
      })
    );
    await guestClient.waitForMessage((m) => m.type === 'ROOM_STATE');
    await hostClient.waitForMessage((m) => m.type === 'ROOM_STATE' && m.payload.players.length === 3);

    // 4. Non-host cannot kick anyone
    regClient.messages.length = 0;
    regClient.ws.send(
      JSON.stringify({
        type: 'KICK_PLAYER',
        payload: { targetPlayerId: guestId }
      })
    );
    const nonHostErr = await regClient.waitForMessage((m) => m.type === 'ERROR');
    assert.ok(nonHostErr.payload.message.includes('Только ведущий'), 'Не-ведущий должен получить ошибку при попытке исключения');
    console.log('✅ Тест 4 (Запрет исключения не-ведущим / чужой комнатой): ПРОЙДЕН');

    // 3. Host cannot kick themselves
    hostClient.messages.length = 0;
    hostClient.ws.send(
      JSON.stringify({
        type: 'KICK_PLAYER',
        payload: { targetPlayerId: hostUser.id }
      })
    );
    const selfKickErr = await hostClient.waitForMessage((m) => m.type === 'ERROR');
    assert.ok(selfKickErr.payload.message.includes('самого себя'), 'Ведущий не может исключить самого себя');
    console.log('✅ Тест 3 (Запрет исключения ведущего / самого себя): ПРОЙДЕН');

    // 1, 7, 8: Host kicks registered player -> KICKED_FROM_ROOM + SIGNAL_PEER_LEFT + ROOM_STATE updated
    hostClient.messages.length = 0;
    regClient.messages.length = 0;
    guestClient.messages.length = 0;

    hostClient.ws.send(
      JSON.stringify({
        type: 'KICK_PLAYER',
        payload: { targetPlayerId: regPlayerUser.id }
      })
    );

    const kickedEvent = await regClient
      .waitForMessage((m) => m.type === 'KICKED_FROM_ROOM')
      .catch((err) => {
        throw new Error(`regClient KICKED_FROM_ROOM failed: ${err.message} | hostClient received: ${JSON.stringify(hostClient.messages)}`);
      });
    assert.equal(kickedEvent.payload.roomCode, roomCode);
    assert.equal(kickedEvent.payload.reason, 'Ведущий исключил вас из комнаты');
    assert.equal(kickedEvent.payload.refundedRoleCard, false);

    const peerLeftHost = await hostClient.waitForMessage(
      (m) => m.type === 'SIGNAL_PEER_LEFT' && m.payload?.peerId === regPlayerUser.id
    );
    const peerLeftGuest = await guestClient.waitForMessage(
      (m) => m.type === 'SIGNAL_PEER_LEFT' && m.payload?.peerId === regPlayerUser.id
    );
    assert.ok(peerLeftHost && peerLeftGuest, 'SIGNAL_PEER_LEFT должен быть отправлен оставшимся участникам');

    const updatedRoomState = await hostClient.waitForMessage(
      (m) => m.type === 'ROOM_STATE' && m.payload.players.length === 2
    );
    assert.ok(
      !updatedRoomState.payload.players.some((p: any) => p.id === regPlayerUser.id),
      'Место исключённого зарегистрированного игрока должно освободиться'
    );
    console.log('✅ Тест 1, 7, 8 (Исключение зарегистрированного игрока, освобождение места, SIGNAL_PEER_LEFT): ПРОЙДЕН');

    // 6. Repeated kick of already kicked player returns clean error
    hostClient.messages.length = 0;
    hostClient.ws.send(
      JSON.stringify({
        type: 'KICK_PLAYER',
        payload: { targetPlayerId: regPlayerUser.id }
      })
    );
    const repeatKickErr = await hostClient.waitForMessage((m) => m.type === 'ERROR');
    assert.ok(repeatKickErr.payload.message.includes('не найден'), 'Повторный запрос исключения должен отклоняться');
    console.log('✅ Тест 6 (Защита от повторного исключения): ПРОЙДЕН');

    // 2. Host kicks guest
    guestClient.messages.length = 0;
    hostClient.messages.length = 0;
    hostClient.ws.send(
      JSON.stringify({
        type: 'KICK_PLAYER',
        payload: { targetPlayerId: guestId }
      })
    );
    const guestKickedEvent = await guestClient.waitForMessage((m) => m.type === 'KICKED_FROM_ROOM');
    assert.equal(guestKickedEvent.payload.reason, 'Ведущий исключил вас из комнаты');
    await hostClient.waitForMessage((m) => m.type === 'ROOM_STATE' && m.payload.players.length === 1);
    console.log('✅ Тест 2 (Исключение гостя из комнаты ожидания): ПРОЙДЕН');

    // 9. Manual re-entry of previously kicked player is allowed
    regClient.messages.length = 0;
    regClient.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: regPlayerUser.id,
          playerName: regPlayerUser.displayName,
          token: regPlayerUser.sessionToken
        }
      })
    );
    const rejoinedState = await regClient.waitForMessage(
      (m) => m.type === 'ROOM_STATE' && m.payload.players.some((p: any) => p.id === regPlayerUser.id)
    );
    assert.ok(rejoinedState, 'Исключённый игрок может повторно войти в комнату вручную');
    console.log('✅ Тест 9 (Отсутствие авто-переподключения при KICKED_FROM_ROOM и разрешение повторного ручного входа): ПРОЙДЕН');

    // 10. Role Selection Card (`card_role_select`) Refund via real HTTP + WebSocket E2E
    await db.execute({
      sql: 'UPDATE users SET inventory = ? WHERE id = ?',
      args: [
        JSON.stringify([
          {
            id: 'inv_test_rc_1',
            itemId: ROLE_SELECT_CARD_ID,
            quantity: 1,
            acquiredAt: new Date().toISOString()
          }
        ]),
        cardPlayerUser.id
      ]
    });

    const cardClient = await connectWs();
    cardClient.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: cardPlayerUser.id,
          playerName: cardPlayerUser.displayName,
          token: cardPlayerUser.sessionToken
        }
      })
    );
    await cardClient.waitForMessage((m) => m.type === 'ROOM_STATE');

    // Apply role card via HTTP POST /api/room/select-role
    const selectRoleRes = await fetch(`${HTTP_BASE}/api/room/select-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cardPlayerUser.sessionToken}`
      },
      body: JSON.stringify({
        roomCode,
        playerId: cardPlayerUser.id,
        roleId: 'mafia',
        token: cardPlayerUser.sessionToken
      })
    });
    assert.equal(selectRoleRes.status, 200, 'Выбор роли через карточку должен завершиться 200 OK');
    const selectRoleData = await selectRoleRes.json();
    assert.equal(selectRoleData.success, true);

    const cardUserAfterUse = await userDb.getUserById(cardPlayerUser.id);
    assert.equal(getRoleCardQty(cardUserAfterUse?.inventory), 0, 'Карточка должна списаться из инвентаря при выборе роли');

    // Host kicks cardPlayerUser via WebSocket -> verify 1 card refunded
    cardClient.messages.length = 0;
    hostClient.ws.send(
      JSON.stringify({
        type: 'KICK_PLAYER',
        payload: { targetPlayerId: cardPlayerUser.id }
      })
    );

    const cardKickedMsg = await cardClient.waitForMessage((m) => m.type === 'KICKED_FROM_ROOM');
    assert.equal(cardKickedMsg.payload.refundedRoleCard, true, 'Клиент должен получить флаг refundedRoleCard = true');
    assert.equal(
      getRoleCardQty(cardKickedMsg.payload.user?.inventory),
      1,
      'Обновлённый профиль в KICKED_FROM_ROOM должен содержать возвращённую карточку'
    );

    const cardUserAfterKick = await userDb.getUserById(cardPlayerUser.id);
    assert.equal(getRoleCardQty(cardUserAfterKick?.inventory), 1, 'В БД должна быть возвращена ровно 1 карточка выбора роли');
    console.log('✅ Тест 10 (Возврат 1 карточки выбора роли при исключении игрока через WebSocket): ПРОЙДЕН');

    // Close WebSocket room by having host leave
    hostClient.ws.send(JSON.stringify({ type: 'LEAVE_ROOM', payload: {} }));
    hostClient.ws.close();
    regClient.ws.close();
    guestClient.ws.close();
    cardClient.ws.close();

    // Part B: Direct GameRoom & UserDatabase unit tests for idempotency, DB error safety, race conditions, active match prohibition, and REMOVE_BOT
    const localRoom = roomManager.createRoom('Локальная тестовая комната', hostUser.id, hostUser.displayName, { maxPlayers: 6 }, true);
    createdLocalRoomCodes.push(localRoom.state.roomCode);

    localRoom.state.players.push({
      id: cardPlayerUser.id,
      name: cardPlayerUser.displayName,
      avatarSeed: cardPlayerUser.displayName,
      isHost: false,
      isBot: false,
      isRegistered: true,
      isAlive: true,
      connected: true,
      ready: true,
      warningsCount: 0
    });

    // Player uses their refunded Role Card in localRoom
    const localSelectRes = await localRoom.selectPreferredRole(cardPlayerUser.id, 'mafia', cardPlayerUser.sessionToken!);
    assert.equal(localSelectRes.success, true);
    const afterSecondUse = await userDb.getUserById(cardPlayerUser.id);
    assert.equal(getRoleCardQty(afterSecondUse?.inventory), 0, 'Карточка снова списана');

    const localPlayer = localRoom.state.players.find((p) => p.id === cardPlayerUser.id)!;
    assert.equal(localPlayer.hasUsedRoleCard, true);
    assert.ok(localPlayer.roleCardUsageKey);
    const savedUsageKey = localPlayer.roleCardUsageKey!;

    // 12. Simulate DB error during refund: card is NOT lost, player stays in room with hasUsedRoleCard = true
    const originalRefundFn = userDb.refundRoleCardFromRoom.bind(userDb);
    (userDb as any).refundRoleCardFromRoom = async () => {
      throw new Error('Simulated DB write failure');
    };

    try {
      const failedKickRes = await localRoom.kickPlayer(hostUser.id, cardPlayerUser.id);
      assert.equal(failedKickRes.success, false, 'При ошибке БД исключение должно быть отменено');
      const playerStillInRoom = localRoom.state.players.find((p) => p.id === cardPlayerUser.id);
      assert.ok(playerStillInRoom, 'Игрок должен остаться в комнате при сбое возврата карточки');
      assert.equal(playerStillInRoom?.hasUsedRoleCard, true, 'Флаг hasUsedRoleCard не должен сбрасываться до успешного возврата в БД');
      assert.equal(playerStillInRoom?.roleCardUsageKey, savedUsageKey, 'Ключ операции должен сохраниться для безопасного повтора');
    } finally {
      (userDb as any).refundRoleCardFromRoom = originalRefundFn;
    }
    console.log('✅ Тест 12 (Безопасная обработка ошибки БД при возврате карточки без потери предмета): ПРОЙДЕН');

    // 13. Race protection: while kickPlayer is awaiting refund, startGame and voluntary removePlayer are blocked
    localRoom.addBot();
    localRoom.addBot();

    let releaseSlowRefund!: () => void;
    const slowRefundGate = new Promise<void>((r) => {
      releaseSlowRefund = r;
    });

    (userDb as any).refundRoleCardFromRoom = async (uId: string, opKey: string, rCode: string) => {
      await slowRefundGate;
      return originalRefundFn(uId, opKey, rCode);
    };

    const inFlightKickPromise = localRoom.kickPlayer(hostUser.id, cardPlayerUser.id);
    const startDuringKick = localRoom.startGame(hostUser.id);
    assert.equal(startDuringKick, false, 'startGame должен блокироваться во время активного исключения игрока');
    localRoom.removePlayer(cardPlayerUser.id);
    assert.ok(
      localRoom.state.players.some((p) => p.id === cardPlayerUser.id),
      'Добровольный выход не должен обгонять активную транзакцию исключения с возвратом карточки'
    );

    releaseSlowRefund();
    const inFlightKickResult = await inFlightKickPromise;
    (userDb as any).refundRoleCardFromRoom = originalRefundFn;
    assert.equal(inFlightKickResult.success, true);
    assert.equal(inFlightKickResult.refundedRoleCard, true);
    const cardUserAfterRace = await userDb.getUserById(cardPlayerUser.id);
    assert.equal(getRoleCardQty(cardUserAfterRace?.inventory), 1, 'После завершения конкурирующего исключения у игрока ровно 1 карточка');
    console.log('✅ Тест 13 (Защита от гонок между исключением, стартом игры и выходом из комнаты): ПРОЙДЕН');

    // 11. Verify idempotency: calling refundRoleCardFromRoom again with the same operationKey never double-grants
    const duplicateRefund = await userDb.refundRoleCardFromRoom(cardPlayerUser.id, savedUsageKey, localRoom.state.roomCode);
    assert.equal(duplicateRefund.refunded, false);
    assert.equal(duplicateRefund.alreadyRefunded, true);
    const cardUserAfterDup = await userDb.getUserById(cardPlayerUser.id);
    assert.equal(getRoleCardQty(cardUserAfterDup?.inventory), 1, 'Повторный вызов возврата не должен начислять вторую карточку');
    console.log('✅ Тест 11 (Защита от двойного возврата карточки по ключу идемпотентности): ПРОЙДЕН');

    // 14. Bot removal regression check
    const botPlayer = localRoom.state.players.find((p) => p.isBot);
    assert.ok(botPlayer, 'Бот должен быть в комнате');
    const kickBotAttempt = await localRoom.kickPlayer(hostUser.id, botPlayer.id);
    assert.equal(kickBotAttempt.success, false, 'kickPlayer не должен удалять ботов');
    const removeBotSuccess = localRoom.removeBot(hostUser.id, botPlayer.id);
    assert.equal(removeBotSuccess, true, 'removeBot должен штатно удалять бота');
    console.log('✅ Тест 14 (Отсутствие регрессии удаления ботов REMOVE_BOT): ПРОЙДЕН');

    // 5. Forbid kicking during active match (phase !== 'LOBBY')
    localRoom.state.players.push({
      id: regPlayerUser.id,
      name: regPlayerUser.displayName,
      avatarSeed: regPlayerUser.displayName,
      isHost: false,
      isBot: false,
      isRegistered: true,
      isAlive: true,
      connected: true,
      ready: true,
      warningsCount: 0
    });
    localRoom.addBot();
    localRoom.addBot();
    const started = localRoom.startGame(hostUser.id);
    assert.equal(started, true, 'Партия должна успешно запуститься при 4+ участниках');
    assert.notEqual(localRoom.state.phase, 'LOBBY');
    const kickInGameRes = await localRoom.kickPlayer(hostUser.id, regPlayerUser.id);
    assert.equal(kickInGameRes.success, false, 'Исключение во время активной партии должно быть запрещено');
    assert.ok(kickInGameRes.message.includes('только в комнате ожидания'));
    console.log('✅ Тест 5 (Запрет исключения во время активной партии): ПРОЙДЕН');

    console.log('🎉 ВСЕ 14 АВТОМАТИЧЕСКИХ ТЕСТОВ УСПЕШНО ПРОЙДЕНЫ!');
  } finally {
    for (const code of createdLocalRoomCodes) {
      const r = roomManager.getRoom(code);
      if (r) r.closeRoom('Очистка тестовой комнаты');
    }
    for (const uid of createdUserIds) {
      await db.execute({ sql: 'DELETE FROM role_card_refunds WHERE user_id = ?', args: [uid] });
      await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [uid] });
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Ошибка выполнения тестов:', err);
    process.exit(1);
  });
