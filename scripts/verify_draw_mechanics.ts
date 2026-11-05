import assert from 'node:assert/strict';
import { MafiaEngine } from '../server/game/engine';
import { Room } from '../server/game/roomManager';
import { userDb } from '../server/db/users';
import { waitForDatabaseInit } from '../server/db/database';
import { NightActions, Player, RoleId, RoomSettings, RoomState } from '../src/types/mafia';

function createPlayer(id: string, name: string, role: RoleId, isAlive = true, isBot = true): Player {
  return {
    id,
    name,
    avatarSeed: name,
    isHost: id === 'p1',
    isBot,
    isAlive,
    role,
    connected: true,
    ready: true,
    warningsCount: 0,
  };
}

function createBaseSettings(gameMode: RoomSettings['gameMode'] = 'classic'): RoomSettings {
  return {
    gameMode,
    maxPlayers: 10,
    generalDiscussionDuration: 60,
    individualSpeechDuration: 30,
    nightDurationSeconds: 30,
    votingDurationSeconds: 30,
    firstDayVoting: false,
    enabledRoles: {
      don: true,
      sheriff: true,
      doctor: gameMode === 'classic',
      courtesan: gameMode === 'classic',
      maniac: gameMode === 'classic',
      bodyguard: false,
    },
    allowSelfHealOnce: true,
    doctorSavesFromCourtesanDeath: true,
    anonymousVoting: false,
    isPublic: true,
  };
}

async function runTests() {
  console.log('=== Проверка определения результата при гибели всех игроков (Ничья) ===\n');

  // 1. Базовая проверка checkWinner при 0 живых игроков
  {
    const deadPlayers: Player[] = [
      createPlayer('p1', 'Игрок 1', 'don', false),
      createPlayer('p2', 'Игрок 2', 'mafia', false),
      createPlayer('p3', 'Игрок 3', 'maniac', false),
      createPlayer('p4', 'Игрок 4', 'sheriff', false),
      createPlayer('p5', 'Игрок 5', 'civilian', false),
    ];

    const winner = MafiaEngine.checkWinner(deadPlayers);
    assert.equal(winner, 'draw', 'При 0 живых игроков checkWinner должен возвращать "draw", а не "civilians"');
    console.log('✅ Тест 1 пройден: При 0 живых игроков checkWinner возвращает "draw" до проверки победы мирных.');
  }

  // 2. Взаимное уничтожение последних живых игроков ночью (Мафия и Маньяк убивают друг друга)
  {
    const state: RoomState = {
      roomCode: 'DRAW01',
      roomName: 'Тест взаимной гибели',
      hostId: 'p1',
      phase: 'NIGHT',
      phaseTimeRemaining: 30,
      dayNumber: 3,
      players: [
        createPlayer('p1', 'Дон', 'don', true),
        createPlayer('p2', 'Маньяк', 'maniac', true),
        createPlayer('p3', 'Мирный 1', 'civilian', false),
        createPlayer('p4', 'Мирный 2', 'sheriff', false),
      ],
      settings: createBaseSettings('classic'),
      nominatedPlayerIds: [],
      gameLogs: [],
    };

    const actions: NightActions = {
      mafiaVotes: { p1: 'p2' },
      maniacKill: 'p1',
    };

    const { nextState, result } = MafiaEngine.resolveNight(state, actions);
    assert.equal(result.killedPlayerIds.includes('p1'), true, 'Дон должен погибнуть от руки Маньяка');
    assert.equal(result.killedPlayerIds.includes('p2'), true, 'Маньяк должен погибнуть от выстрела Дона');
    assert.equal(nextState.players!.filter(p => p.isAlive).length, 0, 'Живых игроков не должно остаться');

    const winner = MafiaEngine.checkWinner(nextState.players!);
    assert.equal(winner, 'draw', 'Партия должна завершиться ничьей ("draw")');
    console.log('✅ Тест 2 пройден: Взаимное ночное убийство Дона и Маньяка приводит к 0 живых и результату "draw".');
  }

  // 3. Гибель всех оставшихся игроков через механику совместной гибели с Путаной + выстрел Маньяка в комнате Room
  {
    const room = new Room('DRAW02', 'p1', 'Хост', 'Тест комнаты на ничью', createBaseSettings('classic'));
    const roomAny = room as any;
    roomAny.state.phase = 'NIGHT';
    roomAny.state.dayNumber = 2;
    roomAny.state.players = [
      createPlayer('p1', 'Мафия', 'mafia', true),
      createPlayer('p2', 'Маньяк', 'maniac', true),
      createPlayer('p3', 'Путана', 'courtesan', true),
      createPlayer('p4', 'Мирный', 'civilian', true),
    ];

    // Мафия стреляет в Путану (p3), которая пришла к Мирному (p4) -> гибнут p3 и p4.
    // Маньяк (p2) убивает Мафию (p1), но Путана? Нет, пусть:
    // Мафия (p1) стреляет в Путану (p3), Путана (p3) пришла к Маньяку (p2), а Маньяк (p2) не заблокирован?
    // Напомним: Путана блокирует клиента, поэтому если Путана пришла к мирному (p4), а Маньяк (p2) и Мафия (p1) только вдвоём:
    // Сделаем проще: в живых Мафия (p1), Путана (p2), Мирный (p3) — нет, тогда Мафия выживет.
    // Чтобы погибли ВСЕ: в живых Мафия (p1), Маньяк (p2), Путана (p3).
    // Путана (p3) посещает Мафию (p1) (у Мафии иммунитет к ночному блоку!).
    // Мафия (p1) стреляет в Маньяка (p2).
    // Маньяк (p2) убивает Путану (p3) -> Путана гибнет вместе с клиентом Мафией (p1)!
    roomAny.state.players = [
      createPlayer('p1', 'Мафия', 'mafia', true),
      createPlayer('p2', 'Маньяк', 'maniac', true),
      createPlayer('p3', 'Путана', 'courtesan', true),
      createPlayer('p4', 'Выбывший Мирный', 'civilian', false),
    ];
    roomAny.nightActions = {
      mafiaVotes: { p1: 'p2' },
      maniacKill: 'p3',
      courtesanBlock: 'p1',
    };

    roomAny.resolveNightPhase();

    assert.equal(roomAny.state.players.filter((p: Player) => p.isAlive).length, 0, 'В комнате не должно остаться живых игроков');
    assert.equal(roomAny.state.phase, 'GAME_OVER', 'Комната должна немедленно перейти в фазу GAME_OVER');
    assert.equal(roomAny.state.winner, 'draw', 'Победитель комнаты должен быть установлен в "draw"');

    room.destroy();
    console.log('✅ Тест 3 пройден: При гибели всех игроков в Room партия немедленно переходит в GAME_OVER со статусом "draw".');
  }

  // 4. Спортивный режим: проверка отсутствия живых игроков
  {
    const sportPlayers: Player[] = Array.from({ length: 10 }, (_, idx) =>
      createPlayer(
        `sp_${idx + 1}`,
        `Спорт Игрок ${idx + 1}`,
        idx === 0 ? 'don' : idx <= 2 ? 'mafia' : idx === 3 ? 'sheriff' : 'civilian',
        false
      )
    );
    assert.equal(MafiaEngine.checkWinner(sportPlayers), 'draw', 'В спортивном режиме при 0 живых также возвращается "draw"');
    console.log('✅ Тест 4 пройден: В спортивном режиме при 0 живых игроков возвращается "draw".');
  }

  // 5. Сохранение обычных условий победы при наличии живых игроков
  {
    // 5a. Победа мирных (жив 1 мирный, мафия и маньяк мертвы)
    const civiliansWinPlayers: Player[] = [
      createPlayer('p1', 'Дон', 'don', false),
      createPlayer('p2', 'Маньяк', 'maniac', false),
      createPlayer('p3', 'Мирный', 'civilian', true),
    ];
    assert.equal(MafiaEngine.checkWinner(civiliansWinPlayers), 'civilians', 'При наличии живого мирного и отсутствии мафии/маньяка побеждают мирные');

    // 5b. Победа Мафии (1 мафия и 1 мирный, маньяка нет)
    const mafiaWinPlayers: Player[] = [
      createPlayer('p1', 'Мафия', 'mafia', true),
      createPlayer('p2', 'Мирный', 'civilian', true),
      createPlayer('p3', 'Шериф', 'sheriff', false),
    ];
    assert.equal(MafiaEngine.checkWinner(mafiaWinPlayers), 'mafia', 'При равенстве мафии и мирных (без маньяка) побеждает мафия');

    // 5c. Победа Маньяка (1 маньяк и 1 мирный, мафии нет)
    const maniacWinPlayers: Player[] = [
      createPlayer('p1', 'Маньяк', 'maniac', true),
      createPlayer('p2', 'Мирный', 'civilian', true),
      createPlayer('p3', 'Дон', 'don', false),
    ];
    assert.equal(MafiaEngine.checkWinner(maniacWinPlayers), 'maniac', 'При 1 маньяке и 1 мирном (без мафии) побеждает маньяк');

    // 5d. Партия продолжается (1 мафия, 2 мирных)
    const ongoingPlayers: Player[] = [
      createPlayer('p1', 'Мафия', 'mafia', true),
      createPlayer('p2', 'Мирный 1', 'civilian', true),
      createPlayer('p3', 'Мирный 2', 'sheriff', true),
    ];
    assert.equal(MafiaEngine.checkWinner(ongoingPlayers), null, 'При перевесе мирных над мафией игра продолжается (null)');

    console.log('✅ Тест 5 пройден: Все обычные условия победы при наличии живых игроков полностью сохранены.');
  }

  // 6. Запись ничьей в историю матчей БД (не засчитывается как победа ни одной стороне)
  {
    await waitForDatabaseInit();
    const testEmail = `draw_test_${Date.now()}@example.com`;
    const reg = await userDb.register(testEmail, 'Pass123456!', 'ТестерНичьей');
    const userId = reg.id;

    const beforeUser = await userDb.getUserById(userId);
    assert.ok(beforeUser, 'Тестовый пользователь должен существовать');
    const initialRating = beforeUser.stats.rating;

    await userDb.recordGameResult(
      userId,
      false,
      'civilians',
      'sheriff',
      false,
      240,
      3,
      undefined,
      true // isDraw = true
    );

    const afterUser = await userDb.getUserById(userId);
    assert.ok(afterUser, 'Пользователь после записи матча должен существовать');
    assert.equal(afterUser.stats.gamesPlayed, 1, 'Сыгранная партия должна учитываться в gamesPlayed');
    assert.equal(afterUser.stats.gamesWon, 0, 'Ничья НЕ должна увеличивать gamesWon');
    assert.equal(afterUser.stats.civilianWins, 0, 'Ничья НЕ должна увеличивать civilianWins');
    assert.equal(afterUser.stats.mafiaWins, 0, 'Ничья НЕ должна увеличивать mafiaWins');
    assert.equal(afterUser.stats.rating, initialRating, 'При ничьей рейтинг не штрафуется и не начисляется как за победу');
    assert.equal(afterUser.stats.roleStats?.sheriff?.games, 1, 'Сыгранная партия по роли должна учитываться');
    assert.equal(afterUser.stats.roleStats?.sheriff?.wins, 0, 'Ничья НЕ должна засчитываться как победа в статистике роли');

    const history = await userDb.getGameHistory(userId);
    assert.equal(history.matches.length, 1, 'В истории должен быть записан 1 матч');
    assert.equal(history.matches[0].isDraw, true, 'Матч в истории должен иметь флаг isDraw = true');
    assert.equal(history.matches[0].won, false, 'Матч в истории должен иметь won = false');

    console.log('✅ Тест 6 пройден: Ничья корректно сохраняется в историю матчей (isDraw: true, won: false) и не засчитывается как победа.');
  }

  console.log('\n🎉 Все проверки механики ничьей при гибели всех игроков успешно пройдены!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Ошибка при выполнении тестов:', err);
  process.exit(1);
});
