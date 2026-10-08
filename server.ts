import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { roomManager } from './server/game/roomManager';
import { userDb } from './server/db/users';
import { shopDb } from './server/db/shop';
import { reportsDb } from './server/db/reports';
import { dailyBonusDb } from './server/db/dailyBonus';
import { clanDb } from './server/db/clans';
import { eventsDb } from './server/db/events';
import { ALL_GAME_ITEMS, DEFAULT_NICKNAME_CHANGE_COST, NICKNAME_CHANGE_CERTIFICATE_ID } from './server/data/items';
import { calculateServerLevelInfo, getLevelFromXp } from './server/game/experience';
import { initDatabase, SQLITE_DB_PATH } from './server/db/database';

dotenv.config();

// Ensure SQLite database and all tables are initialized automatically on startup
const sqliteDb = initDatabase();
console.log('[SQLite] Connected to database at:', SQLITE_DB_PATH);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Global user WebSocket tracking for online status & real-time invites
const userSockets = new Map<string, Set<WebSocket>>();

function trackUserSocket(userId: string, ws: WebSocket) {
  if (!userId) return;
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)!.add(ws);
}

function untrackUserSocket(userId: string | null, ws: WebSocket) {
  if (userId) {
    const sockets = userSockets.get(userId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        userSockets.delete(userId);
      }
    }
  } else {
    userSockets.forEach((sockets) => sockets.delete(ws));
  }
}

function notifyUser(userId: string, message: any) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    const data = JSON.stringify(message);
    sockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }
}

function getLiveStatusForUser(userId: string): {
  onlineStatus: 'online' | 'in_game' | 'in_lobby' | 'offline';
  currentRoomCode?: string | null;
  currentRoomName?: string | null;
} {
  try {
    const rooms = roomManager.getAllRoomsDetailed();
    for (const r of rooms) {
      const isPlayer = r.players && r.players.some((p: { id: string }) => p.id === userId);
      if (isPlayer) {
        const inGame = r.phase.toUpperCase() !== 'LOBBY';
        return {
          onlineStatus: inGame ? 'in_game' : 'in_lobby',
          currentRoomCode: r.roomCode,
          currentRoomName: r.roomName
        };
      }
    }
  } catch {
    // Continue
  }

  const sockets = userSockets.get(userId);
  if (sockets && sockets.size > 0) {
    return {
      onlineStatus: 'online',
      currentRoomCode: null,
      currentRoomName: null
    };
  }

  return {
    onlineStatus: 'offline',
    currentRoomCode: null,
    currentRoomName: null
  };
}

app.use(express.json());

// REST API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// AUTH REST API
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Укажите email и пароль.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов.' });
    }
    const user = await userDb.register(email, password, displayName || '');
    const { passwordHash, sessionToken, ...profile } = user;
    res.json({ user: profile, token: sessionToken });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка при регистрации';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Укажите email и пароль.' });
    }
    const user = await userDb.login(email, password);
    const { passwordHash, sessionToken, ...profile } = user;
    res.json({ user: profile, token: sessionToken });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка при авторизации';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/auth/sync-google', async (req, res) => {
  try {
    const { uid, email, displayName } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email обязателен' });
    }
    const user = await userDb.syncGoogleUser(uid, email, displayName);
    const { passwordHash, sessionToken, ...profile } = user;
    res.json({ user: profile, token: sessionToken });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка синхронизации Google аккаунта';
    res.status(400).json({ error: msg });
  }
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }
  res.json({ user });
});

// GET USER EXPERIENCE & LEVEL DETAILS
app.get('/api/user/experience', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }
  const levelInfo = calculateServerLevelInfo(user.xp || 0);
  res.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      xp: user.xp || 0,
      level: user.level || 1
    },
    levelInfo
  });
});

// GET ITEM CATALOG
app.get('/api/items', (req, res) => {
  res.json({
    items: Object.values(ALL_GAME_ITEMS),
    defaultNicknameChangeCost: DEFAULT_NICKNAME_CHANGE_COST,
    nicknameCertificateId: NICKNAME_CHANGE_CERTIFICATE_ID
  });
});

// CHANGE NICKNAME (Supports 250 credits or Certificate)
app.post('/api/user/change-name', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { displayName, useCertificate } = req.body;
  if (!displayName || typeof displayName !== 'string') {
    return res.status(400).json({ error: 'Укажите новое имя в игре.' });
  }

  try {
    const result = userDb.changeDisplayName(user.id, displayName, !!useCertificate);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при смене никнейма';
    res.status(400).json({ error: msg });
  }
});

// BUY ITEM FROM SHOP
app.post('/api/user/buy-item', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { itemId } = req.body;
  if (!itemId) {
    return res.status(400).json({ error: 'Укажите ID предмета для покупки.' });
  }

  try {
    const result = userDb.buyItem(user.id, itemId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при покупке предмета';
    res.status(400).json({ error: msg });
  }
});

// PAWN ITEM (SELL TO PAWNSHOP)
app.post('/api/user/pawn-item', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { itemId } = req.body;
  if (!itemId) {
    return res.status(400).json({ error: 'Укажите ID предмета для сдачи в ломбард.' });
  }

  try {
    const result = userDb.pawnItem(user.id, itemId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при сдаче предмета в ломбард';
    res.status(400).json({ error: msg });
  }
});

// USE/ACTIVATE ITEM FROM INVENTORY
app.post('/api/user/use-item', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { itemId } = req.body;
  if (!itemId) {
    return res.status(400).json({ error: 'Укажите ID предмета.' });
  }

  try {
    const result = userDb.useItem(user.id, itemId);
    try {
      eventsDb.trackAction(user.id, 'use_item', 1);
    } catch {}
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при использовании предмета';
    res.status(400).json({ error: msg });
  }
});

// GET USER GAME HISTORY & DETAILED STATS
app.get('/api/user/game-history', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  const targetUserId = req.query.userId as string;

  let userId: string | null = null;
  if (token) {
    const user = userDb.getUserByToken(token);
    if (user) userId = user.id;
  }
  if (!userId && targetUserId) {
    userId = targetUserId;
  }

  if (!userId) {
    return res.status(401).json({ error: 'Требуется авторизация или указание ID пользователя.' });
  }

  try {
    const history = userDb.getGameHistory(userId);
    res.json(history);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при загрузке истории игр';
    res.status(400).json({ error: msg });
  }
});

app.get('/api/user/:userId/history', (req, res) => {
  const { userId } = req.params;
  try {
    const history = userDb.getGameHistory(userId);
    res.json(history);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при загрузке истории игр';
    res.status(400).json({ error: msg });
  }
});

// GET USER EXPERIENCE & LEVEL PROGRESSION
app.get('/api/user/experience', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  const targetUserId = req.query.userId as string;

  let user = null;
  if (token) {
    user = userDb.getUserByToken(token);
  }
  if (!user && targetUserId) {
    user = userDb.getUserById(targetUserId);
  }

  if (!user) {
    return res.status(401).json({ error: 'Пользователь не найден или требуется авторизация.' });
  }

  const rawXp = typeof user.xp === 'number' ? user.xp : 0;
  const levelInfo = calculateServerLevelInfo(rawXp);

  res.json({
    levelInfo,
    user: {
      id: user.id,
      displayName: user.displayName,
      xp: rawXp,
      level: levelInfo.level,
      title: levelInfo.title,
      badgeIcon: levelInfo.badgeIcon
    },
    recentMatches: (user.matchHistory || []).slice(0, 15)
  });
});

// EQUIP ROLE MASTERY BADGE / TITLE
app.post('/api/user/equip-mastery-badge', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { badgeTitle, flairTitle } = req.body;
  if (!badgeTitle) {
    return res.status(400).json({ error: 'Укажите название значка/титула' });
  }

  try {
    const updatedUser = userDb.equipMasteryBadge(user.id, badgeTitle, flairTitle);
    res.json({
      success: true,
      message: `Значок «${badgeTitle}» успешно установлен в профиле!`,
      user: updatedUser
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при установке значка';
    res.status(400).json({ error: msg });
  }
});

// SELECT ROLE VIA ROLE CARD IN ROOM
app.post('/api/room/select-role', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  const { roomCode, playerId, roleId } = req.body;

  if (!roomCode || !playerId || !roleId) {
    return res.status(400).json({ error: 'Необходимо указать код комнаты, ID игрока и желаемую роль.' });
  }

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Комната не найдена.' });
  }

  const result = room.selectPreferredRole(playerId, roleId, token);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  res.json(result);
});

// ================= FRIENDS & SOCIAL REST APIS =================

// Get friends list with live online status
app.get('/api/friends', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  try {
    const friends = userDb.getFriends(user.id, getLiveStatusForUser);
    res.json({ friends });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при получении списка друзей';
    res.status(400).json({ error: msg });
  }
});

// Search players to add as friends
app.get('/api/friends/search', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const query = (req.query.q as string) || '';
  const results = userDb.searchPlayers(query, user.id);
  res.json({ results });
});

// Send friend request
app.post('/api/friends/request', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetIdentifier } = req.body;
  if (!targetIdentifier) {
    return res.status(400).json({ error: 'Укажите никнейм или ID игрока.' });
  }

  try {
    const result = userDb.sendFriendRequest(user.id, targetIdentifier);
    try {
      eventsDb.trackAction(user.id, 'invite_friend', 1);
    } catch {}
    notifyUser(result.friend.id, {
      type: 'FRIEND_REQUEST_UPDATE',
      payload: {
        fromUserId: user.id,
        fromUserName: user.displayName,
        status: result.friend.status
      }
    });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка отправки запроса в друзья';
    res.status(400).json({ error: msg });
  }
});

// Accept friend request
app.post('/api/friends/accept', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: 'Укажите targetUserId' });
  }

  try {
    const result = userDb.acceptFriendRequest(user.id, targetUserId);
    notifyUser(targetUserId, {
      type: 'FRIEND_REQUEST_ACCEPTED',
      payload: {
        friendId: user.id,
        friendName: user.displayName
      }
    });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка подтверждения дружбы';
    res.status(400).json({ error: msg });
  }
});

// Decline friend request
app.post('/api/friends/decline', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: 'Укажите targetUserId' });
  }

  try {
    const result = userDb.declineFriendRequest(user.id, targetUserId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка отклонения запроса';
    res.status(400).json({ error: msg });
  }
});

// Remove friend
app.post('/api/friends/remove', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: 'Укажите targetUserId' });
  }

  try {
    const result = userDb.removeFriend(user.id, targetUserId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка удаления из друзей';
    res.status(400).json({ error: msg });
  }
});

// Invite friend to game room
app.post('/api/friends/invite', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetUserId, roomCode, roomName, isPrivate } = req.body;
  if (!targetUserId || !roomCode) {
    return res.status(400).json({ error: 'Укажите targetUserId и roomCode' });
  }

  try {
    const invite = userDb.createRoomInvite(user.id, targetUserId, roomCode, roomName, !!isPrivate);
    try {
      eventsDb.trackAction(user.id, 'invite_friend', 1);
    } catch {}
    notifyUser(targetUserId, {
      type: 'ROOM_INVITE',
      payload: invite
    });
    res.json({
      success: true,
      invite,
      message: `Приглашение в комнату #${roomCode.toUpperCase()} успешно отправлено!`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка отправки приглашения';
    res.status(400).json({ error: msg });
  }
});

// Get pending room invites
app.get('/api/friends/invites', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const invites = userDb.getPendingRoomInvites(user.id);
  res.json({ invites });
});

// Dismiss room invite
app.post('/api/friends/invites/dismiss', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { inviteId } = req.body;
  if (!inviteId) {
    return res.status(400).json({ error: 'Укажите inviteId' });
  }

  userDb.dismissRoomInvite(user.id, inviteId);
  res.json({ success: true });
});

// ================= CLANS REST APIS =================
// List all clans
app.get('/api/clans', (req, res) => {
  const search = req.query.search as string;
  const clans = clanDb.getAllClans(search);
  res.json({ clans });
});

// Get My Clan
app.get('/api/clans/my', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const clan = clanDb.getMyClan(user.id);
  res.json({ clan, inClan: !!clan });
});

// Get Clan by ID
app.get('/api/clans/:id', (req, res) => {
  const clan = clanDb.getClanById(req.params.id);
  if (!clan) {
    return res.status(404).json({ error: 'Клан не найден' });
  }
  res.json({ clan });
});

// Create Clan
app.post('/api/clans/create', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { name, tag, description, avatarIcon } = req.body;
  try {
    const result = clanDb.createClan(user.id, { name, tag, description, avatarIcon });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка создания клана';
    res.status(400).json({ error: msg });
  }
});

// Join Clan
app.post('/api/clans/join', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { clanId } = req.body;
  if (!clanId) {
    return res.status(400).json({ error: 'Укажите ID клана' });
  }

  try {
    const result = clanDb.joinClan(user.id, clanId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при вступлении в клан';
    res.status(400).json({ error: msg });
  }
});

// Leave Clan
app.post('/api/clans/leave', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  try {
    const result = clanDb.leaveClan(user.id);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка выхода из клана';
    res.status(400).json({ error: msg });
  }
});

// Kick Member (Leader only)
app.post('/api/clans/kick', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: 'Укажите ID участника' });
  }

  try {
    const result = clanDb.kickMember(user.id, targetUserId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка исключения участника';
    res.status(400).json({ error: msg });
  }
});

// CLAIM DAILY BONUS
app.post('/api/user/claim-daily-bonus', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  try {
    const result = userDb.claimDailyBonus(user.id);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при получении бонуса';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/auth/profile', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const { displayName } = req.body;
  if (!displayName || typeof displayName !== 'string') {
    return res.status(400).json({ error: 'Укажите новое имя в игре.' });
  }

  try {
    const updated = userDb.changeDisplayName(user.id, displayName, false).user;
    res.json({ user: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обновления профиля';
    res.status(400).json({ error: msg });
  }
});

// ADMIN HELPER MIDDLEWARE
function requireAdmin(req: express.Request, res: express.Response): any {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return null;
  }
  const user = userDb.getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Сессия недействительна' });
    return null;
  }
  const isAuthorizedAdmin = user.email.toLowerCase() === 'vledahovic@gmail.com' || user.isAdmin === true || user.role === 'admin';
  if (!isAuthorizedAdmin) {
    res.status(403).json({ error: 'Доступ запрещён: требуются права администратора (vledahovic@gmail.com)' });
    return null;
  }
  return user;
}

// ADMIN REST APIS
app.get('/api/admin/check', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  res.json({ isAdmin: true, user: admin });
});

app.get('/api/admin/stats', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const users = userDb.getAllUsers();
  const rooms = roomManager.getAllRoomsDetailed();
  const totalCredits = users.reduce((acc, u) => acc + (u.credits || 0), 0);
  const totalGamesPlayed = users.reduce((acc, u) => acc + (u.stats?.gamesPlayed || 0), 0);

  res.json({
    totalUsers: users.length,
    totalCredits,
    totalGamesPlayed,
    activeRoomsCount: rooms.length,
    activePlayersInRooms: rooms.reduce((acc, r) => acc + r.playerCount, 0),
    bannedUsersCount: users.filter(u => u.isBanned).length,
    adminEmail: 'vledahovic@gmail.com'
  });
});

app.get('/api/admin/users', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  res.json({ users: userDb.getAllUsers() });
});

app.post('/api/admin/users/credits', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { userId, amount, isSet } = req.body;
  if (!userId || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Укажите userId и числовое значение amount' });
  }

  try {
    const updated = userDb.adminUpdateCredits(userId, amount, !!isSet);
    res.json({ user: updated, message: `Баланс пользователя ${updated.displayName} обновлен: ${updated.credits} кр.` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка обновления баланса';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/admin/users/give-item', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { userId, itemId, quantity } = req.body;
  if (!userId || !itemId) {
    return res.status(400).json({ error: 'Укажите userId и itemId' });
  }

  try {
    const qty = typeof quantity === 'number' && quantity > 0 ? quantity : 1;
    const updated = userDb.adminGiveItem(userId, itemId, qty);
    res.json({ user: updated, message: `Предмет ${itemId} (${qty} шт.) успешно выдан пользователю ${updated.displayName}!` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка выдачи предмета';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/admin/users/toggle-ban', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Укажите userId' });
  }

  try {
    const updated = userDb.adminToggleBan(userId);
    res.json({ 
      user: updated, 
      message: updated.isBanned 
        ? `Пользователь ${updated.displayName} успешно заблокирован.` 
        : `Пользователь ${updated.displayName} разблокирован.` 
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка изменения статуса блокировки';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/admin/users/rating', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { userId, rating } = req.body;
  if (!userId || typeof rating !== 'number') {
    return res.status(400).json({ error: 'Укажите userId и числовой rating' });
  }

  try {
    const updated = userDb.adminUpdateRating(userId, rating);
    res.json({ user: updated, message: `Рейтинг пользователя ${updated.displayName} изменён на ${rating} Elo.` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка изменения рейтинга';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/admin/users/rename', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { userId, displayName } = req.body;
  if (!userId || !displayName) {
    return res.status(400).json({ error: 'Укажите userId и displayName' });
  }

  try {
    const updated = userDb.adminUpdateDisplayName(userId, displayName);
    res.json({ user: updated, message: `Никнейм пользователя успешно изменён на «${updated.displayName}».` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка изменения никнейма';
    res.status(400).json({ error: msg });
  }
});

app.get('/api/admin/rooms', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  res.json({ rooms: roomManager.getAllRoomsDetailed() });
});

app.post('/api/admin/rooms/close', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { roomCode } = req.body;
  if (!roomCode) {
    return res.status(400).json({ error: 'Укажите roomCode' });
  }

  roomManager.removeRoom(roomCode);
  res.json({ success: true, message: `Комната #${roomCode.toUpperCase()} принудительно закрыта.` });
});

app.post('/api/admin/broadcast', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Укажите текст сообщения message' });
  }

  const sentCount = roomManager.broadcastSystemMessage(message);
  res.json({ success: true, sentRoomsCount: sentCount, message: `Оповещение успешно отправлено в ${sentCount} комнат.` });
});

// ================= SHOP & ECONOMY MANAGEMENT APIS =================

// Public endpoint to get live items and settings for shop & pawnshop
app.get('/api/shop/items', (req, res) => {
  res.json({
    items: shopDb.getAllItems(),
    shopItems: shopDb.getShopItems(),
    settings: shopDb.getSettings()
  });
});

// ADMIN: Get full shop catalog and configuration
app.get('/api/admin/shop/items', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  res.json({
    items: shopDb.getAllItems(),
    settings: shopDb.getSettings()
  });
});

// ADMIN: Update existing shop item (price, pawn value, discount, inShop, etc.)
app.post('/api/admin/shop/items/update', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { id, updates } = req.body;
  if (!id || !updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Укажите id товара и объект updates.' });
  }

  try {
    const updated = shopDb.updateItem(id, updates);
    res.json({
      item: updated,
      message: `Товар «${updated.name}» успешно обновлен.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обновления товара';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Create new item in shop
app.post('/api/admin/shop/items/create', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { item } = req.body;
  if (!item || typeof item !== 'object') {
    return res.status(400).json({ error: 'Укажите данные нового товара.' });
  }

  try {
    const created = shopDb.createItem(item);
    res.json({
      item: created,
      message: `Новый товар «${created.name}» успешно добавлен в каталог магазина!`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка создания товара';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Delete custom item
app.post('/api/admin/shop/items/delete', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Укажите id товара для удаления.' });
  }

  try {
    shopDb.deleteItem(id);
    res.json({
      success: true,
      message: `Товар успешно удален из каталога.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка удаления товара';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Update shop global settings (discount, banner, enabled)
app.post('/api/admin/shop/settings', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Укажите настройки магазина.' });
  }

  try {
    const updated = shopDb.updateSettings(settings);
    res.json({
      settings: updated,
      message: `Настройки магазина успешно сохранены.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обновления настроек';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Reset shop to default catalog
app.post('/api/admin/shop/reset', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const defaultItems = shopDb.resetToDefaults();
    res.json({
      items: defaultItems,
      settings: shopDb.getSettings(),
      message: 'Каталог магазина успешно сброшен к исходным товарам по умолчанию.'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сброса магазина';
    res.status(400).json({ error: msg });
  }
});

// ================= REPORTS & MODERATION APIS =================

// Public endpoint to submit a player complaint
app.post('/api/reports/submit', (req, res) => {
  const { reporterId, reporterName, targetPlayerId, targetPlayerName, roomCode, reason, reasonCategory, details } = req.body;

  if (!reporterId || !targetPlayerId || !reason) {
    return res.status(400).json({ error: 'Необходимо указать id заявителя, id нарушителя и причину жалобы.' });
  }

  // Attempt to find target user in DB for email/account info
  const targetUser = userDb.getUserById(targetPlayerId);

  try {
    const report = reportsDb.createReport({
      reporterId,
      reporterName: reporterName || 'Анонимный игрок',
      targetPlayerId,
      targetPlayerName: targetPlayerName || targetUser?.displayName || 'Игрок',
      targetPlayerEmail: targetUser?.email,
      roomCode: roomCode || 'LOBBY',
      reason,
      reasonCategory: reasonCategory || 'other',
      details: details || ''
    });

    res.json({
      success: true,
      report,
      message: 'Жалоба успешно отправлена администрации Города. Спасибо за поддержание порядка!'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при отправке жалобы';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Get all reports list
app.get('/api/admin/reports', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  res.json({
    reports: reportsDb.getAllReports(),
    pendingCount: reportsDb.getPendingCount()
  });
});

// ADMIN: Resolve report (ban, warn, dismiss, etc.)
app.post('/api/admin/reports/resolve', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { reportId, status, actionTaken, resolutionNote, banTargetPlayer } = req.body;
  if (!reportId || !status) {
    return res.status(400).json({ error: 'Укажите reportId и статус resolution.' });
  }

  try {
    const report = reportsDb.resolveReport(reportId, status, actionTaken || 'none', resolutionNote);

    // If admin chose to ban the target player directly
    let userBanned = false;
    if (banTargetPlayer && report.targetPlayerId) {
      try {
        const target = userDb.getUserById(report.targetPlayerId);
        if (target && !target.isBanned) {
          userDb.adminToggleBan(report.targetPlayerId);
          userBanned = true;
        }
      } catch {
        // Continue
      }
    }

    res.json({
      report,
      userBanned,
      message: `Жалоба #${report.id.slice(-4)} успешно обработана (Статус: ${status}).`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обработки жалобы';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Delete report record
app.post('/api/admin/reports/delete', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { reportId } = req.body;
  if (!reportId) {
    return res.status(400).json({ error: 'Укажите reportId для удаления.' });
  }

  try {
    reportsDb.deleteReport(reportId);
    res.json({ success: true, message: 'Запись жалобы удалена.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка удаления жалобы';
    res.status(400).json({ error: msg });
  }
});

// ================= DAILY BONUS MANAGEMENT APIS =================

// Public endpoint to get live daily bonus config and schedule
app.get('/api/daily-bonus/config', (req, res) => {
  res.json({
    config: dailyBonusDb.getConfig()
  });
});

// ADMIN: Get full daily bonus config, statistics, and claim history
app.get('/api/admin/daily-bonus', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const users = userDb.getAllUsers();
  const activeStreaksCount = users.filter(u => typeof u.dailyBonusStreak === 'number' && u.dailyBonusStreak > 0).length;

  res.json({
    config: dailyBonusDb.getConfig(),
    stats: dailyBonusDb.getStats(users.length, activeStreaksCount)
  });
});

// ADMIN: Update daily bonus configuration (days, multiplier, isEnabled, banner, etc.)
app.post('/api/admin/daily-bonus/config', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { updates } = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Укажите объект updates с параметрами бонуса.' });
  }

  try {
    const updated = dailyBonusDb.updateConfig(updates);
    res.json({
      config: updated,
      message: 'Настройки ежедневного бонуса успешно сохранены.'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сохранения настроек';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Apply preset
app.post('/api/admin/daily-bonus/preset', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { preset } = req.body;
  if (!preset || !['default', 'weekend_x2', 'generous', 'economy'].includes(preset)) {
    return res.status(400).json({ error: 'Укажите корректный пресет (default, weekend_x2, generous, economy).' });
  }

  try {
    const updated = dailyBonusDb.applyPreset(preset);
    res.json({
      config: updated,
      message: `Пресет «${preset}» успешно применен к ежедневному бонусу!`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка применения пресета';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Reset daily bonus cooldown for a specific user
app.post('/api/admin/daily-bonus/reset-user', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Укажите userId игрока.' });
  }

  try {
    const updatedUser = userDb.adminResetDailyBonusCooldown(userId);
    res.json({
      user: updatedUser,
      message: `Кулдаун бонуса для ${updatedUser.displayName} успешно сброшен. Игрок может забрать награду прямо сейчас!`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сброса кулдауна';
    res.status(400).json({ error: msg });
  }
});

// ADMIN: Reset daily bonus to default configuration
app.post('/api/admin/daily-bonus/reset-defaults', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const config = dailyBonusDb.resetToDefaults();
    res.json({
      config,
      message: 'Конфигурация ежедневного бонуса сброшена к исходным значениям по умолчанию.'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сброса конфигурации';
    res.status(400).json({ error: msg });
  }
});

// ================= EVENTS & QUESTS SYSTEM APIS =================

// Public / Player Config (Master Toggles)
app.get('/api/events/config', (req, res) => {
  res.json({ config: eventsDb.getConfig() });
});

// Admin: Update Config & Master Toggles
app.post('/api/admin/events/config', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const updated = eventsDb.updateConfig(req.body);
  res.json({ success: true, config: updated });
});

// Admin: Task Archive
app.get('/api/admin/tasks/archive', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const filterType = req.query.type as any;
  const tasks = eventsDb.getAllArchiveTasks(filterType);
  res.json({ tasks });
});

// Admin: Save / Create / Update Task in Archive
app.post('/api/admin/tasks', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  try {
    const task = eventsDb.saveTask(req.body);
    res.json({ success: true, task });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сохранения задачи';
    res.status(400).json({ error: msg });
  }
});

// Admin: Clone Task in Archive
app.post('/api/admin/tasks/:id/clone', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const cloned = eventsDb.cloneTask(req.params.id);
  if (!cloned) return res.status(404).json({ error: 'Задача не найдена' });
  res.json({ success: true, task: cloned });
});

// Admin: Delete Task in Archive
app.delete('/api/admin/tasks/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const ok = eventsDb.deleteTask(req.params.id);
  res.json({ success: ok });
});

// Admin: Events list
app.get('/api/admin/events', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const events = eventsDb.getAllEvents();
  res.json({ events });
});

// Admin: Save / Create / Update Event
app.post('/api/admin/events', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  try {
    const event = eventsDb.saveEvent(req.body);
    res.json({ success: true, event });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сохранения ивента';
    res.status(400).json({ error: msg });
  }
});

// Admin: Delete Event
app.delete('/api/admin/events/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const ok = eventsDb.deleteEvent(req.params.id);
  res.json({ success: ok });
});

// Player: Get All Available Tasks by 4 Categories + Active Events
app.get('/api/tasks/player', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  const user = token ? userDb.getUserByToken(token) : null;
  const userId = user?.id;

  const config = eventsDb.getConfig();
  const globalTasks = eventsDb.getGlobalTasks(userId);
  const onboardingTasks = eventsDb.getOnboardingTasks(userId);
  const personalState = userId ? eventsDb.getPersonalTasksState(userId) : null;
  const clanTasks = userId ? eventsDb.getClanTasks(userId) : [];
  const clanEventStatus = user?.clanId ? eventsDb.getClanEventStatus(user.clanId, userId) : null;
  const activeEvents = eventsDb.getAllEvents().filter(e => e.status === 'active');

  res.json({
    config,
    global: globalTasks,
    onboarding: onboardingTasks,
    personal: personalState,
    clan: {
      tasks: clanTasks,
      status: clanEventStatus
    },
    activeEvents
  });
});

// Player: Claim Task Reward
app.post('/api/tasks/:id/claim', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = userDb.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Сессия недействительна' });

  try {
    const result = eventsDb.claimTaskReward(user.id, req.params.id);
    const updatedUser = userDb.getUserById(user.id);
    res.json({ ...result, user: updatedUser });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка получения награды';
    res.status(400).json({ error: msg });
  }
});

// Player: Reroll Personal Daily Task
app.post('/api/tasks/personal/:id/reroll', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = userDb.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Сессия недействительна' });

  try {
    const result = eventsDb.rerollPersonalTask(user.id, req.params.id);
    const updatedUser = userDb.getUserById(user.id);
    res.json({ ...result, user: updatedUser });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при замене задачи';
    res.status(400).json({ error: msg });
  }
});

// Player: Claim Clan Milestone Prize (WoT Blitz Style)
app.post('/api/clan-event/milestone/claim', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = userDb.getUserByToken(token);
  if (!user || !user.clanId) return res.status(400).json({ error: 'Вы не состоите в клане' });

  const stage = Number(req.body.stage);
  if (!stage) return res.status(400).json({ error: 'Укажите номер этапа' });

  try {
    const result = eventsDb.claimClanMilestone(user.clanId, user.id, stage);
    const updatedUser = userDb.getUserById(user.id);
    const updatedClanStatus = eventsDb.getClanEventStatus(user.clanId, user.id);
    res.json({ ...result, user: updatedUser, clanStatus: updatedClanStatus });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка получения награды за этап';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

app.get('/api/rooms', (req, res) => {
  res.json({ rooms: roomManager.getPublicRooms() });
});

// LOBBY STATS & CHAT (backed by SQLite lobby_chat table)
interface LobbyChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

app.get('/api/lobby/stats', (req, res) => {
  const rooms = roomManager.getPublicRooms();
  let inLobby = 0;
  let inGame = 0;

  rooms.forEach(r => {
    if (r.inGame) {
      inGame += r.playerCount;
    } else {
      inLobby += r.playerCount;
    }
  });

  // Include connected clients
  inLobby = Math.max(inLobby, wss.clients.size);

  res.json({ inLobby, inGame });
});

app.get('/api/lobby/chat', (req, res) => {
  try {
    const rows = sqliteDb.prepare(`
      SELECT id, sender_id as senderId, sender_name as senderName, text, created_at as timestamp
      FROM lobby_chat
      ORDER BY created_at ASC
      LIMIT 100
    `).all() as any[];
    res.json({ messages: rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения сообщений лобби' });
  }
});

app.post('/api/lobby/chat', (req, res) => {
  const { senderId, senderName, text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Текст сообщения не может быть пустым' });
  }

  const msg: LobbyChatMessage = {
    id: 'msg_' + Math.random().toString(36).substring(2, 9),
    senderId: senderId || 'anon',
    senderName: senderName || 'Гость',
    text: text.trim().slice(0, 200),
    timestamp: Date.now()
  };

  try {
    sqliteDb.prepare(`
      INSERT INTO lobby_chat (id, sender_id, sender_name, text, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(msg.id, msg.senderId, msg.senderName, msg.text, msg.timestamp);

    // Keep table bounded
    sqliteDb.prepare(`
      DELETE FROM lobby_chat
      WHERE id NOT IN (
        SELECT id FROM lobby_chat ORDER BY created_at DESC LIMIT 200
      )
    `).run();
  } catch (err) {
    console.error('[SQLite] Error inserting lobby chat message:', err);
  }

  // Broadcast to all connected WebSockets
  const payload = JSON.stringify({ type: 'LOBBY_CHAT', payload: msg });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });

  res.json({ message: msg });
});

app.post('/api/rooms', (req, res) => {
  const { hostId, hostName, roomName, settings } = req.body;
  if (!hostId || !hostName) {
    return res.status(400).json({ error: 'hostId and hostName are required' });
  }
  const room = roomManager.createRoom(roomName || `Комната ${hostName}`, hostId, hostName, settings);
  res.json({ roomCode: room.state.roomCode });
});

// WebSocket Handling
wss.on('connection', (ws: WebSocket) => {
  let currentRoomCode: string | null = null;
  let currentPlayerId: string | null = null;

  ws.on('message', (raw: string) => {
    try {
      const data = JSON.parse(raw.toString());
      const { type, payload } = data;

      switch (type) {
        case 'INIT_USER': {
          const { userId } = payload || {};
          if (userId) {
            currentPlayerId = userId;
            trackUserSocket(userId, ws);
          }
          break;
        }

        case 'JOIN_ROOM': {
          const { roomCode, playerId, playerName } = payload;
          if (playerId) {
            currentPlayerId = playerId;
            trackUserSocket(playerId, ws);
          }
          const code = roomCode.toUpperCase().trim();
          let room = roomManager.getRoom(code);

          if (!room) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { message: `Комната ${code} не найдена` }
            }));
            return;
          }

          currentRoomCode = code;
          currentPlayerId = playerId;

          const userRec = userDb.getUserById(playerId);

          // Check if player is already in room (reconnect)
          let existingPlayer = room.state.players.find(p => p.id === playerId);
          let existingSpectator = room.spectators.get(playerId);

          if (payload.asSpectator === true) {
            // Explicitly requested spectator mode
            if (existingPlayer) {
              room.becomeSpectatorFromPlayer(playerId);
            } else if (!existingSpectator) {
              room.addSpectator({
                id: playerId,
                name: playerName || 'Зритель',
                avatarSeed: playerName || 'Зритель',
                clanTag: userRec?.clanTag || null,
                clanName: userRec?.clanName || null,
                joinedAt: Date.now()
              });
            } else {
              existingSpectator.name = playerName || existingSpectator.name;
              if (userRec) {
                existingSpectator.clanTag = userRec.clanTag || null;
                existingSpectator.clanName = userRec.clanName || null;
              }
            }
          } else if (existingPlayer) {
            existingPlayer.connected = true;
            existingPlayer.name = playerName || existingPlayer.name;
            if (userRec) {
              existingPlayer.clanTag = userRec.clanTag || null;
              existingPlayer.clanName = userRec.clanName || null;
            }
          } else if (existingSpectator) {
            existingSpectator.name = playerName || existingSpectator.name;
            if (userRec) {
              existingSpectator.clanTag = userRec.clanTag || null;
              existingSpectator.clanName = userRec.clanName || null;
            }
          } else {
            // New participant joining
            // If game is in progress OR room is full, join as Spectator
            const shouldSpectate = room.state.phase !== 'LOBBY' || room.state.players.length >= room.state.settings.maxPlayers;

            if (shouldSpectate) {
              room.addSpectator({
                id: playerId,
                name: playerName || 'Зритель',
                avatarSeed: playerName || 'Зритель',
                clanTag: userRec?.clanTag || null,
                clanName: userRec?.clanName || null,
                joinedAt: Date.now()
              });
            } else {
              room.state.players.push({
                id: playerId,
                name: playerName,
                avatarSeed: playerName,
                isHost: false,
                isBot: false,
                isAlive: true,
                connected: true,
                ready: true,
                warningsCount: 0,
                clanTag: userRec?.clanTag || null,
                clanName: userRec?.clanName || null
              });
              room.addChatMessage('system', `Игрок ${playerName} вошёл в игру.`, 'system');
            }
          }

          room.sockets.set(playerId, ws);

          // Send current state and chat history
          ws.send(JSON.stringify({
            type: 'ROOM_STATE',
            payload: room.getClientState(playerId)
          }));
          room.broadcastChat();
          room.broadcastState();
          break;
        }

        case 'LEAVE_ROOM': {
          if (currentRoomCode && currentPlayerId) {
            const room = roomManager.getRoom(currentRoomCode);
            if (room) {
              room.sockets.delete(currentPlayerId);
              if (room.isSpectator(currentPlayerId)) {
                room.removeSpectator(currentPlayerId);
              } else {
                room.removePlayer(currentPlayerId);
              }
            }
          }
          currentRoomCode = null;
          currentPlayerId = null;
          break;
        }

        case 'JOIN_AS_PLAYER': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            const success = room.becomePlayerFromSpectator(currentPlayerId, payload.playerName);
            if (!success) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Не удалось занять место за столом (мест нет или игра уже идёт).' }
              }));
            }
          }
          break;
        }

        case 'SWITCH_TO_SPECTATOR':
        case 'BECOME_SPECTATOR': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            const success = room.becomeSpectatorFromPlayer(currentPlayerId);
            if (!success) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Переход в зрители возможен только в лобби до старта игры.' }
              }));
            }
          }
          break;
        }

        case 'START_GAME': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            const success = room.startGame(currentPlayerId);
            if (!success) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Для старта игры необходимо минимум 4 игрока.' }
              }));
            }
          }
          break;
        }

        case 'STOP_GAME':
        case 'RESTART_GAME': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            room.restartGame(currentPlayerId);
          }
          break;
        }

        case 'ADD_BOT': {
          if (!currentRoomCode) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room) {
            room.addBot();
          }
          break;
        }

        case 'REMOVE_BOT': {
          if (!currentRoomCode) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && payload.botId) {
            room.removePlayer(payload.botId);
          }
          break;
        }

        case 'UPDATE_SETTINGS': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && room.state.hostId === currentPlayerId) {
            room.state.settings = { ...room.state.settings, ...payload.settings };
            room.broadcastState();
          }
          break;
        }

        case 'NOMINATE_PLAYER': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && !room.isSpectator(currentPlayerId)) {
            room.nominatePlayer(payload.nomineeId, currentPlayerId);
          }
          break;
        }

        case 'CAST_VOTE': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && !room.isSpectator(currentPlayerId)) {
            room.castVote(currentPlayerId, payload.targetId);
          }
          break;
        }

        case 'SUBMIT_NIGHT_ACTION': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && !room.isSpectator(currentPlayerId)) {
            room.submitNightAction(currentPlayerId, payload.actionType, payload.targetId);
          }
          break;
        }

        case 'SKIP_PHASE': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && !room.isSpectator(currentPlayerId)) {
            room.skipPhase(currentPlayerId);
          }
          break;
        }

        case 'SEND_CHAT': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && payload.text) {
            room.addChatMessage(currentPlayerId, payload.text, payload.channel || 'all');
          }
          break;
        }

        case 'SELECT_ROLE': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = roomManager.getRoom(currentRoomCode);
          if (room && payload.roleId && !room.isSpectator(currentPlayerId)) {
            const result = room.selectPreferredRole(currentPlayerId, payload.roleId, payload.token);
            if (!result.success) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: result.message }
              }));
            }
          }
          break;
        }
      }
    } catch (e) {
      console.error('WebSocket message parsing error:', e);
    }
  });

  ws.on('close', () => {
    untrackUserSocket(currentPlayerId, ws);
    if (currentRoomCode && currentPlayerId) {
      const room = roomManager.getRoom(currentRoomCode);
      if (room) {
        room.sockets.delete(currentPlayerId);
        if (room.isSpectator(currentPlayerId)) {
          room.removeSpectator(currentPlayerId);
        } else {
          const player = room.state.players.find(p => p.id === currentPlayerId);
          if (player) {
            player.connected = false;
          }
        }
        room.broadcastState();
      }
    }
  });
});

// Vite middleware / production static serving
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
