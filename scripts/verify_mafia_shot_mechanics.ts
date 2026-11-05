import assert from 'node:assert/strict';
import { Room } from '../server/game/roomManager';
import { MafiaEngine } from '../server/game/engine';
import { RoleId, RoomSettings } from '../src/types/mafia';

function createConfiguredRoom(gameMode: RoomSettings['gameMode'], rolesMap: Record<string, RoleId>): Room {
  const playerIds = Object.keys(rolesMap);
  const hostId = playerIds[0];
  const room = new Room('SHOT1', 'Mafia Shot Verification', hostId, `Player ${hostId}`, {
    gameMode,
    enabledRoles: {
      don: true,
      sheriff: true,
      doctor: gameMode === 'classic',
      courtesan: gameMode === 'classic',
      maniac: false,
      bodyguard: gameMode === 'classic',
    },
  });

  // Stop heartbeat interval so tests control phase transitions deterministically
  clearInterval((room as any).timerInterval);
  (room as any).timerInterval = null;

  for (let i = 1; i < playerIds.length; i++) {
    const pid = playerIds[i];
    room.state.players.push({
      id: pid,
      name: `Player ${pid}`,
      avatarSeed: pid,
      isHost: false,
      isBot: false,
      isAlive: true,
      connected: true,
      ready: true,
      warningsCount: 0,
    });
  }

  room.startGame(hostId);

  room.state.players.forEach(p => {
    p.role = rolesMap[p.id];
    p.isAlive = true;
  });

  return room;
}

function enterNight(room: Room, dayNum = 1) {
  room.state.dayNumber = dayNum;
  room.state.phase = 'NIGHT';
  room.state.phaseTimeRemaining = 30;
  room.state.nightActionsCompleted = [];
  room.state.phaseSkipVotedIds = [];
  (room as any).nightActions = { mafiaVotes: {} };
}

async function runTests() {
  console.log('=== Starting Mafia Night Shot Mechanics Verification ===');

  const standardRoles: Record<string, RoleId> = {
    c1: 'civilian',
    c2: 'civilian',
    doc: 'doctor',
    sh: 'sheriff',
    don: 'don',
    m1: 'mafia',
    m2: 'mafia',
  };

  // =========================================================================
  // 1. SPORT MAFIA ('sport')
  // =========================================================================
  {
    // 1A: All living mafia (Don + m1 + m2) choose the same target (c1) -> HIT
    const room = createConfiguredRoom('sport', standardRoles);
    enterNight(room);
    room.submitNightAction('don', 'mafia_kill', 'c1');
    room.submitNightAction('m1', 'mafia_kill', 'c1');
    room.submitNightAction('m2', 'mafia_kill', 'c1');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, ['c1'], 'Sport 1A: Unanimous choice by all living mafia must kill c1');
    room.destroy();
  }

  {
    // 1B: One regular mafia skips (Don + m1 choose c1, m2 skips) -> MISS
    const room = createConfiguredRoom('sport', standardRoles);
    enterNight(room);
    room.submitNightAction('don', 'mafia_kill', 'c1');
    room.submitNightAction('m1', 'mafia_kill', 'c1');
    // m2 does not submit
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, [], 'Sport 1B: If one regular mafia skips, shot must miss');
    room.destroy();
  }

  {
    // 1C: Don skips (m1 + m2 choose c1, Don skips) -> MISS
    const room = createConfiguredRoom('sport', standardRoles);
    enterNight(room);
    room.submitNightAction('m1', 'mafia_kill', 'c1');
    room.submitNightAction('m2', 'mafia_kill', 'c1');
    // Don does not submit
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, [], 'Sport 1C: If Don skips, shot must miss');
    room.destroy();
  }

  {
    // 1D: Different targets (Don chooses c1, m1 + m2 choose c2) -> MISS (no Don priority and no majority in Sport mode)
    const room = createConfiguredRoom('sport', standardRoles);
    enterNight(room);
    room.submitNightAction('don', 'mafia_kill', 'c1');
    room.submitNightAction('m1', 'mafia_kill', 'c2');
    room.submitNightAction('m2', 'mafia_kill', 'c2');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, [], 'Sport 1D: Disagreement (Don c1 vs m1+m2 c2) must result in a miss');
    room.destroy();
  }

  {
    // 1E: Different targets (Don + m1 choose c1, m2 chooses c2) -> MISS
    const room = createConfiguredRoom('sport', standardRoles);
    enterNight(room);
    room.submitNightAction('don', 'mafia_kill', 'c1');
    room.submitNightAction('m1', 'mafia_kill', 'c1');
    room.submitNightAction('m2', 'mafia_kill', 'c2');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, [], 'Sport 1E: Disagreement (Don+m1 c1 vs m2 c2) must result in a miss');
    room.destroy();
  }

  {
    // 1F: Dead mafia member (m2 is dead): living Don + m1 choose c1 -> HIT
    const room = createConfiguredRoom('sport', standardRoles);
    room.state.players.find(p => p.id === 'm2')!.isAlive = false;
    enterNight(room);
    room.submitNightAction('don', 'mafia_kill', 'c1');
    room.submitNightAction('m1', 'mafia_kill', 'c1');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, ['c1'], 'Sport 1F: All LIVING mafia choosing c1 must kill c1 even when m2 is dead');
    room.destroy();
  }

  console.log('✓ Sport Mafia tests (1A–1F) passed');

  // =========================================================================
  // 2. CITY MAFIA ('classic')
  // =========================================================================
  {
    // 2A: Don chooses c1, m1 and m2 both choose c2 -> Don's target (c1) wins regardless of other mafia votes
    const room = createConfiguredRoom('classic', standardRoles);
    enterNight(room);
    room.submitNightAction('don', 'mafia_kill', 'c1');
    room.submitNightAction('m1', 'mafia_kill', 'c2');
    room.submitNightAction('m2', 'mafia_kill', 'c2');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, ['c1'], 'City 2A: Don choice (c1) must override m1+m2 votes for c2');
    room.destroy();
  }

  {
    // 2B: Don chooses c1, m1 and m2 skip -> Don's target (c1) is shot
    const room = createConfiguredRoom('classic', standardRoles);
    enterNight(room);
    room.submitNightAction('don', 'mafia_kill', 'c1');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, ['c1'], 'City 2B: Don choice (c1) alone must kill c1 when m1 and m2 skip');
    room.destroy();
  }

  {
    // 2C: Don skips, m1 and m2 both choose c2 -> Shot hits c2
    const room = createConfiguredRoom('classic', standardRoles);
    enterNight(room);
    room.submitNightAction('m1', 'mafia_kill', 'c2');
    room.submitNightAction('m2', 'mafia_kill', 'c2');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, ['c2'], 'City 2C: When Don skips and m1+m2 both choose c2, c2 must be killed');
    room.destroy();
  }

  {
    // 2D: Don skips, m1 chooses c2, m2 skips -> Even a single voting regular mafia executes the shot
    const room = createConfiguredRoom('classic', standardRoles);
    enterNight(room);
    room.submitNightAction('m1', 'mafia_kill', 'c2');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, ['c2'], 'City 2D: Single voting regular mafia (m1 -> c2) when Don and m2 skip must kill c2');
    room.destroy();
  }

  {
    // 2E: Don skips, m1 chooses c1, m2 chooses c2 -> Different targets among voting regular mafia -> MISS
    const room = createConfiguredRoom('classic', standardRoles);
    enterNight(room);
    room.submitNightAction('m1', 'mafia_kill', 'c1');
    room.submitNightAction('m2', 'mafia_kill', 'c2');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, [], 'City 2E: When Don skips and m1/m2 pick different targets, shot must miss');
    room.destroy();
  }

  {
    // 2F: Don is dead, 3 regular mafia: m1 + m2 choose c1, m3 chooses c2 -> Different targets (no majority vote) -> MISS
    const room = createConfiguredRoom('classic', {
      ...standardRoles,
      m3: 'mafia',
    });
    room.state.players.find(p => p.id === 'don')!.isAlive = false;
    enterNight(room);
    room.submitNightAction('m1', 'mafia_kill', 'c1');
    room.submitNightAction('m2', 'mafia_kill', 'c1');
    room.submitNightAction('m3', 'mafia_kill', 'c2');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, [], 'City 2F: When Don is dead and regular mafia split 2 vs 1, shot must miss (no majority)');
    room.destroy();
  }

  {
    // 2G: Don is dead, m1 chooses c1, m2 skips -> Shot hits c1
    const room = createConfiguredRoom('classic', standardRoles);
    room.state.players.find(p => p.id === 'don')!.isAlive = false;
    enterNight(room);
    room.submitNightAction('m1', 'mafia_kill', 'c1');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, ['c1'], 'City 2G: When Don is dead and only m1 votes c1 (m2 skips), c1 must be killed');
    room.destroy();
  }

  {
    // 2H: Don and all regular mafia skip -> No shot
    const room = createConfiguredRoom('classic', standardRoles);
    enterNight(room);
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, [], 'City 2H: When nobody in mafia votes, no shot occurs');
    room.destroy();
  }

  console.log('✓ City Mafia tests (2A–2H) passed');

  // =========================================================================
  // 3. DOCTOR PROTECTION & BOT COORDINATION
  // =========================================================================
  {
    // 3A: Doctor saves Don's chosen target in City Mafia
    const room = createConfiguredRoom('classic', standardRoles);
    enterNight(room);
    room.submitNightAction('don', 'mafia_kill', 'c1');
    room.submitNightAction('doc', 'doctor_heal', 'c1');
    room.advancePhase();
    assert.deepEqual(room.state.lastNightResult?.killedPlayerIds, [], '3A: Doctor must save Don target c1');
    assert.deepEqual(room.state.lastNightResult?.healedPlayerIds, ['c1']);
    room.destroy();
  }

  {
    // 3B: Bot Mafia members coordinate on the same target in Sport Mafia so shot succeeds
    const room = createConfiguredRoom('sport', standardRoles);
    room.state.players.forEach(p => {
      if (p.role === 'don' || p.role === 'mafia') {
        p.isBot = true;
      }
    });

    const origRandom = Math.random;
    Math.random = () => 0;
    try {
      (room as any).startNightPhase();
      await new Promise(r => setTimeout(r, 1650));
      const target = MafiaEngine.resolveMafiaKillTarget(room.state, (room as any).nightActions);
      assert.equal(Boolean(target), true, '3B: Bot Mafia in Sport mode must coordinate on a single valid target');
    } finally {
      Math.random = origRandom;
      room.destroy();
    }
  }

  console.log('✓ Protection & Bot coordination tests (3A–3B) passed');
  console.log('=== ALL MAFIA SHOT MECHANICS TESTS PASSED ===');
}

runTests().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
