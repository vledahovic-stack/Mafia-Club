import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import { waitForDatabaseInit, getDatabase } from '../server/db/database';
import { userDb } from '../server/db/users';

const HTTP_BASE = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

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
          rej(
            new Error(
              `Timeout waiting for WS message. Received: ${JSON.stringify(
                messages.map((m) => ({ type: m.type, payload: m.payload }))
              )}`
            )
          );
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
  const openSockets: WebSocket[] = [];

  try {
    console.log('--- Начало автоматического тестирования ограничения входа по чёрному списку ведущего ---');

    const hostA = await createTestUser('HostA');
    const playerB = await createTestUser('PlayerB');
    const playerC = await createTestUser('PlayerC');
    const spectatorD = await createTestUser('SpectatorD');
    const hostE = await createTestUser('HostE');
    createdUserIds.push(hostA.id, playerB.id, playerC.id, spectatorD.id, hostE.id);

    // Create room via HTTP API with hostA
    const createRoomRes = await fetch(`${HTTP_BASE}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostA.sessionToken}`
      },
      body: JSON.stringify({
        hostId: hostA.id,
        hostName: hostA.displayName,
        roomName: 'Тестовая комната ЧС',
        settings: { maxPlayers: 8 },
        token: hostA.sessionToken
      })
    });
    assert.equal(createRoomRes.status, 200, 'Комната должна создаваться через HTTP API');
    const { roomCode } = await createRoomRes.json();
    assert.ok(roomCode, 'Должен вернуться код комнаты');

    const hostClient = await connectWs();
    openSockets.push(hostClient.ws);

    hostClient.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: hostA.id,
          playerName: hostA.displayName,
          token: hostA.sessionToken
        }
      })
    );
    await hostClient.waitForMessage((m) => m.type === 'ROOM_STATE');

    // Host A blocks Player B
    await userDb.blockUser(hostA.id, playerB.id);
    assert.equal(await userDb.isUserBlocked(hostA.id, playerB.id), true);

    // 1. Ведущий заблокировал игрока — новый вход за стол запрещён
    const clientB1 = await connectWs();
    openSockets.push(clientB1.ws);
    clientB1.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: playerB.id,
          playerName: playerB.displayName,
          token: playerB.sessionToken,
          asSpectator: false
        }
      })
    );
    const errB1 = await clientB1.waitForMessage((m) => m.type === 'ERROR');
    assert.equal(errB1.payload?.code, 'ROOM_ENTRY_RESTRICTED');
    assert.equal(errB1.payload?.message, 'Вход в эту комнату ограничен владельцем');
    assert.equal(
      clientB1.messages.some((m) => m.type === 'ROOM_STATE'),
      false,
      'Заблокированный игрок не должен получать ROOM_STATE'
    );
    console.log('[OK] 1. Ведущий заблокировал игрока — новый вход за стол запрещён.');

    // 11. Отказ во входе не оставляет некорректной привязки WebSocket
    hostClient.messages.length = 0;
    clientB1.ws.send(
      JSON.stringify({
        type: 'SEND_CHAT',
        payload: { text: 'Не должен попасть в чат комнаты' }
      })
    );
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(
      hostClient.messages.some(
        (m) =>
          m.type === 'CHAT_UPDATE' &&
          Array.isArray(m.payload) &&
          m.payload.some((c: any) => c.text === 'Не должен попасть в чат комнаты')
      ),
      false,
      'Отклонённый сокет не должен быть привязан к комнате и не должен отправлять чат'
    );
    clientB1.ws.close();
    console.log('[OK] 11. Отказ во входе не оставляет некорректной привязки WebSocket.');

    // 2. Новый вход заблокированного игрока зрителем запрещён
    const clientB2 = await connectWs();
    openSockets.push(clientB2.ws);
    clientB2.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: playerB.id,
          playerName: playerB.displayName,
          token: playerB.sessionToken,
          asSpectator: true
        }
      })
    );
    const errB2 = await clientB2.waitForMessage((m) => m.type === 'ERROR');
    assert.equal(errB2.payload?.code, 'ROOM_ENTRY_RESTRICTED');
    assert.equal(errB2.payload?.message, 'Вход в эту комнату ограничен владельцем');
    clientB2.ws.close();
    console.log('[OK] 2. Новый вход заблокированного игрока зрителем запрещён.');

    // 3. Обратная блокировка не препятствует входу (Player C блокирует Host A, но Host A не блокировал Player C)
    await userDb.blockUser(playerC.id, hostA.id);
    assert.equal(await userDb.isUserBlocked(playerC.id, hostA.id), true);
    assert.equal(await userDb.isUserBlocked(hostA.id, playerC.id), false);

    const clientC = await connectWs();
    openSockets.push(clientC.ws);
    clientC.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: playerC.id,
          playerName: playerC.displayName,
          token: playerC.sessionToken
        }
      })
    );
    const stateC = await clientC.waitForMessage((m) => m.type === 'ROOM_STATE');
    assert.ok(
      stateC.payload.players.some((p: any) => p.id === playerC.id),
      'Игрок С, заблокировавший ведущего А, должен успешно войти в комнату А'
    );
    console.log('[OK] 3. Обратная блокировка не препятствует входу.');

    // 4. Гость может входить по прежним правилам
    const guestClient = await connectWs();
    openSockets.push(guestClient.ws);
    const guestId = `guest_bl_${Date.now()}`;
    guestClient.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: guestId,
          playerName: 'ГостьПроверка'
        }
      })
    );
    const guestState = await guestClient.waitForMessage((m) => m.type === 'ROOM_STATE');
    assert.ok(
      guestState.payload.players.some((p: any) => p.id === guestId),
      'Гость должен беспрепятственно входить по прежним правилам'
    );
    console.log('[OK] 4. Гость может входить по прежним правилам.');

    // 5. Переподключение уже находящегося в комнате игрока разрешено (даже после добавления в ЧС)
    await userDb.blockUser(hostA.id, playerC.id);
    assert.equal(await userDb.isUserBlocked(hostA.id, playerC.id), true);

    // Игрок С всё ещё в комнате (не удалён автоматически)
    clientC.ws.close();
    await new Promise((r) => setTimeout(r, 200));

    const clientCReconnect = await connectWs();
    openSockets.push(clientCReconnect.ws);
    clientCReconnect.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: playerC.id,
          playerName: playerC.displayName,
          token: playerC.sessionToken
        }
      })
    );
    const stateCReconnect = await clientCReconnect.waitForMessage(
      (m) => m.type === 'ROOM_STATE' && m.payload.players.some((p: any) => p.id === playerC.id && p.connected)
    );
    assert.ok(stateCReconnect, 'Уже находящийся в комнате игрок должен успешно переподключаться после блокировки');
    console.log('[OK] 5. Переподключение уже находящегося в комнате игрока разрешено.');

    // 6. Переподключение зрителя разрешено
    const specClient = await connectWs();
    openSockets.push(specClient.ws);
    specClient.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: spectatorD.id,
          playerName: spectatorD.displayName,
          token: spectatorD.sessionToken,
          asSpectator: true
        }
      })
    );
    await specClient.waitForMessage((m) => m.type === 'ROOM_STATE' && m.payload.isSpectator === true);

    // Host A blocks Spectator D while Spectator D is already in the room
    await userDb.blockUser(hostA.id, spectatorD.id);

    const specClientReconnect = await connectWs();
    openSockets.push(specClientReconnect.ws);
    specClientReconnect.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: spectatorD.id,
          playerName: spectatorD.displayName,
          token: spectatorD.sessionToken,
          asSpectator: false
        }
      })
    );
    const specStateReconnect = await specClientReconnect.waitForMessage(
      (m) => m.type === 'ROOM_STATE' && m.payload.isSpectator === true
    );
    assert.ok(specStateReconnect, 'Уже находящийся в комнате зритель должен успешно переподключаться после блокировки');
    console.log('[OK] 6. Переподключение зрителя разрешено.');

    // 8. После добровольного выхода (или исключения ведущим) и нового входа блокировка применяется
    specClientReconnect.ws.send(JSON.stringify({ type: 'LEAVE_ROOM', payload: {} }));
    await new Promise((r) => setTimeout(r, 200));

    const specClientNewJoin = await connectWs();
    openSockets.push(specClientNewJoin.ws);
    specClientNewJoin.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: spectatorD.id,
          playerName: spectatorD.displayName,
          token: spectatorD.sessionToken,
          asSpectator: true
        }
      })
    );
    const errSpecAfterLeave = await specClientNewJoin.waitForMessage((m) => m.type === 'ERROR');
    assert.equal(errSpecAfterLeave.payload?.code, 'ROOM_ENTRY_RESTRICTED');
    specClientNewJoin.ws.close();

    // Также проверяем: исключение игрока С ведущим (KICK_PLAYER) -> повторный вход блокируется
    clientCReconnect.messages.length = 0;
    hostClient.ws.send(
      JSON.stringify({
        type: 'KICK_PLAYER',
        payload: { targetPlayerId: playerC.id }
      })
    );
    const kickedMsgC = await clientCReconnect.waitForMessage((m) => m.type === 'KICKED_FROM_ROOM');
    assert.equal(kickedMsgC.payload?.roomCode, roomCode);

    const clientCAfterKick = await connectWs();
    openSockets.push(clientCAfterKick.ws);
    clientCAfterKick.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: playerC.id,
          playerName: playerC.displayName,
          token: playerC.sessionToken
        }
      })
    );
    const errCAfterKick = await clientCAfterKick.waitForMessage((m) => m.type === 'ERROR');
    assert.equal(errCAfterKick.payload?.code, 'ROOM_ENTRY_RESTRICTED');
    clientCAfterKick.ws.close();
    console.log('[OK] 8 & 13. После добровольного выхода или KICK_PLAYER новый вход блокируется, KICK_PLAYER работает штатно.');

    // 9. После разблокировки вход разрешён
    await userDb.unblockUser(hostA.id, playerB.id);
    assert.equal(await userDb.isUserBlocked(hostA.id, playerB.id), false);

    const clientBUnblocked = await connectWs();
    openSockets.push(clientBUnblocked.ws);
    clientBUnblocked.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: playerB.id,
          playerName: playerB.displayName,
          token: playerB.sessionToken
        }
      })
    );
    const stateBUnblocked = await clientBUnblocked.waitForMessage(
      (m) => m.type === 'ROOM_STATE' && m.payload.players.some((p: any) => p.id === playerB.id)
    );
    assert.ok(stateBUnblocked, 'После разблокировки игрок Б должен успешно войти в комнату');
    console.log('[OK] 9. После разблокировки вход разрешён.');

    // 10. После передачи прав ведущего используется чёрный список нового ведущего
    // Подключаем игрока HostE в комнату
    const clientE = await connectWs();
    openSockets.push(clientE.ws);
    clientE.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: hostE.id,
          playerName: hostE.displayName,
          token: hostE.sessionToken
        }
      })
    );
    await clientE.waitForMessage((m) => m.type === 'ROOM_STATE' && m.payload.players.some((p: any) => p.id === hostE.id));

    // На момент до передачи прав: HostA блокировал PlayerC, но HostE НЕ блокировал PlayerC.
    // Зато HostE блокирует SpectatorD, а HostA разблокирует SpectatorD.
    await userDb.unblockUser(hostA.id, spectatorD.id);
    await userDb.blockUser(hostE.id, spectatorD.id);

    // HostA передаёт права ведущего игроку HostE
    hostClient.ws.send(
      JSON.stringify({
        type: 'TRANSFER_HOST',
        payload: { targetPlayerId: hostE.id }
      })
    );
    await hostClient.waitForMessage((m) => m.type === 'ROOM_STATE' && m.payload.hostId === hostE.id);

    // Теперь PlayerC (в ЧС старого ведущего HostA, но НЕ в ЧС нового ведущего HostE) может войти!
    const clientCNewHost = await connectWs();
    openSockets.push(clientCNewHost.ws);
    clientCNewHost.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: playerC.id,
          playerName: playerC.displayName,
          token: playerC.sessionToken
        }
      })
    );
    const stateCNewHost = await clientCNewHost.waitForMessage(
      (m) => m.type === 'ROOM_STATE' && m.payload.players.some((p: any) => p.id === playerC.id)
    );
    assert.ok(stateCNewHost, 'Игрок из ЧС прежнего ведущего должен войти, если он не в ЧС нового ведущего');

    // А SpectatorD (в ЧС нового ведущего HostE) НЕ может войти!
    const specBlockedByNewHost = await connectWs();
    openSockets.push(specBlockedByNewHost.ws);
    specBlockedByNewHost.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: spectatorD.id,
          playerName: spectatorD.displayName,
          token: spectatorD.sessionToken
        }
      })
    );
    const errSpecNewHost = await specBlockedByNewHost.waitForMessage((m) => m.type === 'ERROR');
    assert.equal(errSpecNewHost.payload?.code, 'ROOM_ENTRY_RESTRICTED');
    specBlockedByNewHost.ws.close();
    console.log('[OK] 10. После передачи прав ведущего используется чёрный список нового ведущего.');

    // 7. Блокировка во время активной партии не исключает игрока и не препятствует восстановлению соединения
    // Добавим ботов до минимума для старта игры и запустим партию от имени нового ведущего HostE
    for (let i = 0; i < 3; i++) {
      clientE.ws.send(JSON.stringify({ type: 'ADD_BOT', payload: {} }));
    }
    await clientE.waitForMessage((m) => m.type === 'ROOM_STATE' && m.payload.players.length >= 6);

    clientE.ws.send(JSON.stringify({ type: 'START_GAME', payload: {} }));
    await clientE.waitForMessage((m) => m.type === 'ROOM_STATE' && m.payload.phase !== 'LOBBY');

    // Во время активной партии ведущий HostE добавляет PlayerB в чёрный список
    await userDb.blockUser(hostE.id, playerB.id);
    assert.equal(await userDb.isUserBlocked(hostE.id, playerB.id), true);

    // Игрок PlayerB разрывает соединение и переподключается во время активной партии
    clientBUnblocked.ws.close();
    await new Promise((r) => setTimeout(r, 200));

    const clientBActiveReconnect = await connectWs();
    openSockets.push(clientBActiveReconnect.ws);
    clientBActiveReconnect.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomCode,
          playerId: playerB.id,
          playerName: playerB.displayName,
          token: playerB.sessionToken
        }
      })
    );
    const stateBActive = await clientBActiveReconnect.waitForMessage(
      (m) =>
        m.type === 'ROOM_STATE' &&
        m.payload.phase !== 'LOBBY' &&
        m.payload.players.some((p: any) => p.id === playerB.id && p.connected)
    );
    assert.ok(stateBActive, 'Блокировка во время активной партии не исключает игрока и позволяет переподключиться');
    console.log('[OK] 7. Блокировка во время активной партии не исключает игрока и не препятствует восстановлению соединения.');

    // 12. Проверка клиентского обработчика в src/App.tsx (сброс roomCodeRef, таймера переподключения и URL)
    const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.ok(
      appSource.includes("data.payload?.code === 'ROOM_ENTRY_RESTRICTED'") &&
        appSource.includes('roomCodeRef.current = null;') &&
        appSource.includes('clearTimeout(reconnectTimeoutRef.current);') &&
        appSource.includes("window.history.pushState({}, '', window.location.pathname);"),
      'Клиент src/App.tsx должен сбрасывать roomCodeRef.current, отменять таймер переподключения и очищать URL при ROOM_ENTRY_RESTRICTED'
    );
    console.log('[OK] 12. Клиентский обработчик ROOM_ENTRY_RESTRICTED корректно отменяет автопереподключение и очищает URL.');

    console.log('--- ВСЕ 13 ТЕСТОВЫХ СЦЕНАРИЕВ ЧЁРНОГО СПИСКА ВЕДУЩЕГО УСПЕШНО ПРОЙДЕНЫ ---');
  } finally {
    for (const s of openSockets) {
      try {
        s.close();
      } catch {}
    }
    for (const uid of createdUserIds) {
      await db.execute({ sql: 'DELETE FROM user_blocks WHERE user_id = ? OR blocked_user_id = ?', args: [uid, uid] });
      await db.execute({ sql: 'DELETE FROM role_card_refunds WHERE user_id = ?', args: [uid] });
      await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [uid] });
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ТЕСТ ПРОВАЛЕН:', err);
    process.exit(1);
  });
