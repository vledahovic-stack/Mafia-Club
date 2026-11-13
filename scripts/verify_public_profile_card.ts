import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { waitForDatabaseInit, getDatabase } from '../server/db/database';
import { userDb } from '../server/db/users';

const HTTP_BASE = 'http://localhost:3000';

async function createTestUser(prefix: string) {
  const suffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const email = `${prefix}_${suffix}@test.mafiaclub.local`;
  const displayName = `${prefix}_${suffix.slice(-5)}`;
  return userDb.register(email, 'TestPass123!', displayName);
}

async function main() {
  await waitForDatabaseInit();
  const db = getDatabase();
  const createdUserIds: string[] = [];

  try {
    console.log('--- Начало целевой проверки публичной карточки игрока ---');

    const viewer = await createTestUser('Viewer');
    const zeroGamesPlayer = await createTestUser('Rookie');
    const veteranPlayer = await createTestUser('Veteran');
    createdUserIds.push(viewer.id, zeroGamesPlayer.id, veteranPlayer.id);

    // Give veteranPlayer custom avatar, clan tag, and real match results
    await db.execute({
      sql: 'UPDATE users SET avatar_seed = ?, clan_tag = ?, clan_name = ? WHERE id = ?',
      args: ['🎭', 'MAF', 'Syndicate', veteranPlayer.id]
    });
    await userDb.recordGameResult(veteranPlayer.id, true, 'mafia', 'don', true, 360, 3);
    await userDb.recordGameResult(veteranPlayer.id, true, 'civilians', 'sheriff', true, 480, 4);
    await userDb.recordGameResult(veteranPlayer.id, false, 'civilians', 'citizen', false, 180, 2);
    // Expected for veteran: gamesPlayed=3, gamesWon=2, winRate=67, rating=1200 + 25 + 25 - 15 = 1235

    const veteranFull = await userDb.getUserById(veteranPlayer.id);
    assert.ok(veteranFull, 'Ветеран должен существовать в БД');

    // 1. Зарегистрированный участник может получить публичный профиль другого игрока
    const regRes = await fetch(`${HTTP_BASE}/api/users/${encodeURIComponent(veteranPlayer.id)}/public-profile`, {
      headers: {
        Authorization: `Bearer ${viewer.sessionToken}`
      }
    });
    assert.equal(regRes.status, 200, 'Зарегистрированный игрок должен получить 200 OK');
    const regData = await regRes.json();
    assert.ok(regData.profile, 'Ответ должен содержать объект profile');

    // 2. Гость (без токена) также может получить публичный профиль
    const guestRes = await fetch(`${HTTP_BASE}/api/users/${encodeURIComponent(veteranPlayer.id)}/public-profile`);
    assert.equal(guestRes.status, 200, 'Гость должен получить 200 OK');
    const guestData = await guestRes.json();
    assert.deepEqual(guestData.profile, regData.profile, 'Данные для гостя и зарегистрированного пользователя должны совпадать');
    console.log('[OK] 1 & 2. Зарегистрированный участник и гость получают публичный профиль.');

    // 4. Реальные показатели совпадают с БД
    const p = regData.profile;
    assert.equal(p.id, veteranPlayer.id);
    assert.equal(p.displayName, veteranPlayer.displayName);
    assert.equal(p.avatarSeed, '🎭');
    assert.equal(p.clanTag, 'MAF');
    assert.equal(p.level, veteranFull.level);
    assert.ok(p.rank && typeof p.rank.title === 'string' && p.rank.title.length > 0, 'Должен присутствовать ранг');
    assert.equal(p.stats.gamesPlayed, 3);
    assert.equal(p.stats.gamesWon, 2);
    assert.equal(p.stats.winRate, 67);
    assert.equal(p.stats.rating, 1235);
    console.log('[OK] 4. Показатели карточки точно соответствуют реальным данным БД.');

    // 5. При 0 сыгранных партий winRate === null (клиент отображает '—'), рейтинг сохраняется
    const rookieRes = await fetch(`${HTTP_BASE}/api/users/${encodeURIComponent(zeroGamesPlayer.id)}/public-profile`);
    assert.equal(rookieRes.status, 200);
    const rookieData = await rookieRes.json();
    assert.equal(rookieData.profile.stats.gamesPlayed, 0);
    assert.equal(rookieData.profile.stats.gamesWon, 0);
    assert.equal(rookieData.profile.stats.winRate, null, 'При 0 партий winRate должен быть null (на клиенте —)');
    assert.equal(rookieData.profile.stats.rating, 1200);
    console.log('[OK] 5. При 0 сыгранных партий winRate = null (клиент показывает «—»), рейтинг = 1200.');

    // 3. Гости, боты и отсутствующие/некорректные ID отклоняются корректно
    const guestTargetRes = await fetch(`${HTTP_BASE}/api/users/guest_123456/public-profile`);
    assert.equal(guestTargetRes.status, 400);
    const botTargetRes = await fetch(`${HTTP_BASE}/api/users/bot_1/public-profile`);
    assert.equal(botTargetRes.status, 400);
    const missingTargetRes = await fetch(`${HTTP_BASE}/api/users/nonexistent_user_999/public-profile`);
    assert.equal(missingTargetRes.status, 404);
    console.log('[OK] 3. Для гостей, ботов и несуществующих ID профиль не возвращается.');

    // 6. Безопасность: API возвращает строго разрешённые поля и не раскрывает приватные данные
    const allowedTopKeys = ['id', 'displayName', 'avatarSeed', 'clanTag', 'level', 'rank', 'stats'].sort();
    assert.deepEqual(Object.keys(p).sort(), allowedTopKeys, 'Допустимы только разрешённые ключи верхнего уровня');
    assert.deepEqual(Object.keys(p.rank).sort(), ['badgeIcon', 'tier', 'title']);
    assert.deepEqual(Object.keys(p.stats).sort(), ['gamesPlayed', 'gamesWon', 'rating', 'winRate']);

    const serialized = JSON.stringify(regData);
    for (const forbidden of [
      'email',
      'password',
      'sessionToken',
      'credits',
      'inventory',
      'matchHistory',
      'roleStats',
      'isAdmin',
      'dailyBonusStreak',
      'isEmailVerified',
      'totalSurvivalSeconds',
      veteranPlayer.email
    ]) {
      assert.equal(serialized.includes(forbidden), false, `В публичном ответе не должно быть ${forbidden}`);
    }
    assert.equal('xp' in p, false, 'XP не должен передаваться в публичной карточке');
    assert.equal('xp' in p.stats, false, 'XP не должен передаваться в stats публичной карточки');

    // Существующие защищённые маршруты остаются закрытыми для другого игрока и гостя
    const expOtherRes = await fetch(`${HTTP_BASE}/api/user/experience?userId=${encodeURIComponent(veteranPlayer.id)}`, {
      headers: { Authorization: `Bearer ${viewer.sessionToken}` }
    });
    assert.equal(expOtherRes.status, 403, 'Чужой /api/user/experience должен оставаться запрещённым (403)');
    const histOtherRes = await fetch(`${HTTP_BASE}/api/user/${encodeURIComponent(veteranPlayer.id)}/history`, {
      headers: { Authorization: `Bearer ${viewer.sessionToken}` }
    });
    assert.equal(histOtherRes.status, 403, 'Чужой /api/user/:userId/history должен оставаться запрещённым (403)');
    const histGuestRes = await fetch(`${HTTP_BASE}/api/user/${encodeURIComponent(veteranPlayer.id)}/history`);
    assert.equal(histGuestRes.status, 401, 'Гостевой запрос истории матчей должен оставаться запрещённым (401)');
    console.log('[OK] 6. API строго фильтрует поля, а защищённые маршруты остаются закрытыми.');

    // Проверка интеграции контекстного меню и модального окна в исходниках
    const menuSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/PlayerTableContextMenu.tsx'), 'utf8');
    const lobbySrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/LobbyView.tsx'), 'utf8');
    const inGameSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/InGameView.tsx'), 'utf8');
    const modalSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/PublicPlayerProfileModal.tsx'), 'utf8');

    assert.ok(menuSrc.includes('const showProfileAction = Boolean(onViewProfile && isTargetRegistered);'));
    assert.ok(menuSrc.includes('Посмотреть профиль'));
    assert.ok(lobbySrc.includes('PublicPlayerProfileModal') && lobbySrc.includes('onViewProfile='));
    const inGameOccurrences = (inGameSrc.match(/onViewProfile=/g) || []).length;
    assert.equal(inGameOccurrences, 3, 'Во всех 3 экземплярах PlayerTableContextMenu в InGameView должен быть подключён onViewProfile');
    assert.ok(inGameSrc.includes('PublicPlayerProfileModal'));
    assert.ok(modalSrc.includes('AbortController') && modalSrc.includes('requestSeqRef'));
    assert.ok(modalSrc.includes("winRate !== null") && modalSrc.includes("'—'"));
    assert.ok(modalSrc.includes('grid grid-cols-2'));
    console.log('[OK] 7, 8, 9. Интеграция контекстного меню, модального окна, отмены гонок запросов и 2x2 сетки подтверждена.');

    // Проверка rate limiter (после 60 запросов с одного IP должен вернуть 429)
    let got429 = false;
    for (let i = 0; i < 65; i++) {
      const rlRes = await fetch(`${HTTP_BASE}/api/users/${encodeURIComponent(veteranPlayer.id)}/public-profile`);
      if (rlRes.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.equal(got429, true, 'При злоупотреблении запросами должен срабатывать rate limit 429');
    console.log('[OK] Защита от злоупотреблений (rate limit 429) подтверждена.');

    console.log('--- ВСЕ ЦЕЛЕВЫЕ ПРОВЕРКИ ПУБЛИЧНОЙ КАРТОЧКИ ПРОЙДЕНЫ ---');
  } finally {
    for (const uid of createdUserIds) {
      await db.execute({ sql: 'DELETE FROM match_history WHERE user_id = ?', args: [uid] });
      await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [uid] });
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ОШИБКА ПРОВЕРКИ:', err);
    process.exit(1);
  });
