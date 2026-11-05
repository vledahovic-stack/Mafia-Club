import assert from 'node:assert/strict';
import { Room } from '../server/game/roomManager';
import { MafiaEngine } from '../server/game/engine';

function addHumanPlayer(room: Room, id: string, name: string) {
  room.state.players.push({
    id,
    name,
    avatarSeed: name,
    isHost: false,
    isBot: false,
    isAlive: true,
    connected: true,
    ready: true,
    warningsCount: 0,
  });
}

function setupCityMafiaRoom(): Room {
  const room = new Room('DOC1', 'Doctor Verification Room', 'p1', 'Player 1', {
    gameMode: 'classic',
    enabledRoles: {
      don: true,
      sheriff: true,
      doctor: true,
      courtesan: true,
      maniac: false,
      bodyguard: false,
    },
  });

  addHumanPlayer(room, 'p2', 'Player 2');
  addHumanPlayer(room, 'p3', 'Player 3');
  addHumanPlayer(room, 'p4', 'Player 4');
  addHumanPlayer(room, 'p5', 'Player 5');
  addHumanPlayer(room, 'p6', 'Player 6');

  const started = room.startGame('p1');
  assert.equal(started, true, 'Game should start with 6 players');

  // Assign deterministic roles for testing
  const roles = ['civilian', 'doctor', 'mafia', 'don', 'sheriff', 'courtesan'] as const;
  room.state.players.forEach((p, idx) => {
    p.role = roles[idx];
    p.isAlive = true;
  });

  return room;
}

function enterNight(room: Room, dayNum: number) {
  room.state.dayNumber = dayNum;
  room.state.phase = 'NIGHT';
  room.state.phaseTimeRemaining = 30;
  room.state.nightActionsCompleted = [];
  room.state.phaseSkipVotedIds = [];
  (room as any).nightActions = { mafiaVotes: {} };
}

async function runTests() {
  console.log('=== Starting Doctor Mechanics Verification ===');

  // TEST 1–4: Cannot heal Player #1 two nights in a row; available again after a night
  {
    const room = setupCityMafiaRoom();

    // Night 1: Doctor (p2) heals Player #1 (p1), Mafia shoots Player #1 (p1)
    enterNight(room, 1);
    assert.equal(room.state.doctorLastHealedPlayerId, null, 'Initially doctorLastHealedPlayerId is null');

    const healNight1 = room.submitNightAction('p2', 'doctor_heal', 'p1');
    assert.equal(healNight1, true, 'Night 1: Doctor healing Player #1 must succeed');
    room.submitNightAction('p3', 'mafia_kill', 'p1');
    room.submitNightAction('p4', 'mafia_kill', 'p1');

    room.advancePhase(); // NIGHT -> MORNING_REPORT
    assert.deepEqual(room.state.lastNightResult?.healedPlayerIds, ['p1'], 'Night 1: p1 must be in healedPlayerIds');
    assert.equal(room.state.players.find(p => p.id === 'p1')?.isAlive, true, 'Night 1: p1 must survive Mafia shot due to Doctor heal');
    assert.equal(room.state.doctorLastHealedPlayerId, 'p1', 'After Night 1: doctorLastHealedPlayerId must be p1');

    // Verify client state privacy: Doctor sees doctorLastHealedPlayerId, Mafia/others see null during active match
    assert.equal(room.getClientState('p2').doctorLastHealedPlayerId, 'p1', 'Doctor client state must include doctorLastHealedPlayerId');
    assert.equal(room.getClientState('p3').doctorLastHealedPlayerId, null, 'Non-doctor client state must hide doctorLastHealedPlayerId during match');

    // Night 2: Doctor (p2) tries to heal Player #1 (p1) again -> MUST BE REJECTED
    enterNight(room, 2);
    const repeatHealNight2 = room.submitNightAction('p2', 'doctor_heal', 'p1');
    assert.equal(repeatHealNight2, false, 'Night 2: Doctor healing Player #1 a second night in a row must be rejected by submitNightAction');
    assert.equal(room.state.nightActionsCompleted?.includes('p2'), false, 'Rejected action must not mark night action completed');

    // Also verify engine-level defense if an invalid consecutive target were passed directly
    const engineCheck = MafiaEngine.resolveNight(room.state, {
      mafiaVotes: { p3: 'p1', p4: 'p1' },
      doctorHeal: 'p1',
    });
    assert.deepEqual(engineCheck.result.healedPlayerIds, [], 'Engine must also reject consecutive heal of the same player');
    assert.equal(engineCheck.result.killedPlayerIds.includes('p1'), true, 'Unhealed p1 would die if Doctor illegally targeted p1 twice');

    // Night 2: Doctor chooses a different target (Player #5) -> MUST SUCCEED
    const validHealNight2 = room.submitNightAction('p2', 'doctor_heal', 'p5');
    assert.equal(validHealNight2, true, 'Night 2: Doctor healing Player #5 must succeed');
    room.submitNightAction('p3', 'mafia_kill', 'p5');
    room.advancePhase(); // NIGHT -> MORNING_REPORT
    assert.deepEqual(room.state.lastNightResult?.healedPlayerIds, ['p5'], 'Night 2: p5 must be healed');
    assert.equal(room.state.doctorLastHealedPlayerId, 'p5', 'After Night 2: doctorLastHealedPlayerId must be p5');

    // Night 3: Player #1 (p1) is available again!
    enterNight(room, 3);
    const healP1Night3 = room.submitNightAction('p2', 'doctor_heal', 'p1');
    assert.equal(healP1Night3, true, 'Night 3: Player #1 must be available for healing again after one night');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.healedPlayerIds, ['p1'], 'Night 3: p1 must be healed again');

    room.destroy();
    console.log('✓ Test 1-4 passed: Consecutive-night restriction & cooldown recovery after 1 night');
  }

  // TEST 5: Self-heal rules (cannot self-heal two nights in a row, but can self-heal multiple times per match with no total limit)
  {
    const room = setupCityMafiaRoom();

    // Night 1: Doctor (p2) heals themselves (p2) #1
    enterNight(room, 1);
    assert.equal(room.submitNightAction('p2', 'doctor_heal', 'p2'), true, 'Night 1: Doctor self-heal #1 must succeed');
    room.submitNightAction('p3', 'mafia_kill', 'p2');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.healedPlayerIds, ['p2'], 'Night 1: Doctor must be healed');
    assert.equal(room.state.players.find(p => p.id === 'p2')?.isAlive, true, 'Night 1: Doctor survives Mafia attack');
    assert.equal(room.state.doctorLastHealedPlayerId, 'p2', 'After Night 1: doctorLastHealedPlayerId is p2');

    // Night 2: Doctor tries to heal themselves (p2) a second night in a row -> REJECTED
    enterNight(room, 2);
    assert.equal(room.submitNightAction('p2', 'doctor_heal', 'p2'), false, 'Night 2: Consecutive self-heal must be rejected');

    // Night 2: Doctor heals Player #1 instead -> SUCCEEDS
    assert.equal(room.submitNightAction('p2', 'doctor_heal', 'p1'), true, 'Night 2: Healing Player #1 succeeds');
    room.advancePhase();
    assert.equal(room.state.doctorLastHealedPlayerId, 'p1');

    // Night 3: Doctor heals themselves (p2) #2 -> SUCCEEDS
    enterNight(room, 3);
    assert.equal(room.submitNightAction('p2', 'doctor_heal', 'p2'), true, 'Night 3: Doctor self-heal #2 must succeed after 1 night');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.healedPlayerIds, ['p2']);
    assert.equal(room.state.doctorLastHealedPlayerId, 'p2');

    // Night 4: Doctor skips healing anyone -> doctorLastHealedPlayerId becomes null
    enterNight(room, 4);
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.healedPlayerIds, []);
    assert.equal(room.state.doctorLastHealedPlayerId, null, 'After skipping heal on Night 4, doctorLastHealedPlayerId resets to null');

    // Night 5: Doctor heals themselves (p2) #3 -> SUCCEEDS (no overall match limit on self-heals)
    enterNight(room, 5);
    assert.equal(room.submitNightAction('p2', 'doctor_heal', 'p2'), true, 'Night 5: Doctor self-heal #3 must succeed (no match limit)');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.healedPlayerIds, ['p2']);

    room.destroy();
    console.log('✓ Test 5 passed: Self-heal allowed multiple times per match (3+ times), never two nights in a row');
  }

  // TEST 6: Bot Doctor never picks the same target two nights in a row
  {
    const room = setupCityMafiaRoom();
    clearInterval((room as any).timerInterval);
    (room as any).timerInterval = null;
    const docPlayer = room.state.players.find(p => p.id === 'p2')!;
    docPlayer.isBot = true;
    // Keep only p1 and p2 alive so bot Doctor has only 2 alive players, forcing deterministic choice when one is on cooldown
    room.state.players.forEach(p => {
      p.isAlive = p.id === 'p1' || p.id === 'p2';
    });

    const origRandom = Math.random;
    Math.random = () => 0; // delay = 1500 + 0 = 1500ms
    try {
      room.state.doctorLastHealedPlayerId = 'p1';
      (room as any).startNightPhase();
      await new Promise(r => setTimeout(r, 1650));
      assert.equal((room as any).nightActions.doctorHeal, 'p2', 'When p1 was healed last night, bot Doctor must choose p2');

      room.state.doctorLastHealedPlayerId = 'p2';
      (room as any).startNightPhase();
      await new Promise(r => setTimeout(r, 1650));
      assert.equal((room as any).nightActions.doctorHeal, 'p1', 'When p2 was healed last night, bot Doctor must choose p1');
    } finally {
      Math.random = origRandom;
      room.destroy();
    }
    console.log('✓ Test 6 passed: Bot Doctor strictly respects consecutive-night restriction');
  }

  console.log('=== ALL DOCTOR MECHANICS TESTS PASSED ===');
}

runTests().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
