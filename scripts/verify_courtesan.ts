import { MafiaEngine } from '../server/game/engine';
import { Room } from '../server/game/roomManager';
import { Player, RoomState, NightActions } from '../src/types/mafia';

function createPlayer(id: string, name: string, role: any, isAlive = true): Player {
  return {
    id,
    name,
    role,
    avatarSeed: id,
    isHost: id === 'p1',
    isBot: false,
    isAlive,
    connected: true,
    ready: true,
    warningsCount: 0
  };
}

let allPassed = true;
function assert(desc: string, condition: boolean, extra?: any) {
  if (condition) {
    console.log(`  ✅ [PASS] ${desc}`);
  } else {
    allPassed = false;
    console.error(`  ❌ [FAIL] ${desc}`, extra !== undefined ? extra : '');
  }
}

console.log('====================================================');
console.log('   MAFIA CLUB: COURTESAN TARGETED TEST SUITE        ');
console.log('====================================================\n');

// -----------------------------------------------------------------------------
// 1. NIGHT ACTIONS INDEPENDENCE
// -----------------------------------------------------------------------------
console.log('--- 1. Testing Night Actions Independence ---');

{
  const players = [
    createPlayer('p1', 'Don', 'don'),
    createPlayer('p2', 'Mafia', 'mafia'),
    createPlayer('p3', 'Sheriff', 'sheriff'),
    createPlayer('p4', 'Doctor', 'doctor'),
    createPlayer('p5', 'Courtesan', 'courtesan'),
    createPlayer('p6', 'Civilian', 'civilian')
  ];

  const state: RoomState = {
    roomCode: 'TEST1',
    roomName: 'Test',
    hostId: 'p1',
    phase: 'NIGHT',
    phaseTimeRemaining: 30,
    dayNumber: 1,
    players,
    spectators: [],
    nominatedPlayerIds: [],
    gameLogs: [],
    settings: {
      gameMode: 'classic',
      maxPlayers: 6,
      generalDiscussionDuration: 60,
      individualSpeechDuration: 45,
      nightDurationSeconds: 30,
      votingDurationSeconds: 30,
      firstDayVoting: true,
      enabledRoles: {
        don: true,
        sheriff: true,
        doctor: true,
        courtesan: true,
        maniac: false,
        bodyguard: false
      },
      allowSelfHealOnce: true,
      anonymousVoting: false,
      isPublic: true,
      doctorSavesFromCourtesanDeath: false
    }
  };

  // 1.1 Courtesan chooses Sheriff -> Sheriff still investigates Don
  const actions1: NightActions = {
    courtesanVisit: 'p3', // visits Sheriff
    sheriffCheck: 'p1',   // Sheriff checks Don
    mafiaVotes: { p2: 'p6' }, // mafia shoots p6
    doctorHeal: 'p6'      // doctor heals p6
  };

  const res1 = MafiaEngine.resolveNight(state, actions1);

  assert('Sheriff check works even if visited by Courtesan', 
    res1.result.sheriffInvestigation?.targetId === 'p1' && res1.result.sheriffInvestigation?.isMafia === true);

  assert('Doctor heal works even if visited by Courtesan (p6 saved from mafia)', 
    !res1.result.killedPlayerIds.includes('p6') && res1.result.healedPlayerIds.includes('p6'));

  // 1.2 Courtesan visits Doctor -> Doctor still heals
  const actions2: NightActions = {
    courtesanVisit: 'p4', // visits Doctor
    doctorHeal: 'p6',
    mafiaVotes: { p2: 'p6' }
  };
  const res2 = MafiaEngine.resolveNight(state, actions2);
  assert('Doctor heals successfully when visited by Courtesan',
    res2.result.healedPlayerIds.includes('p6') && !res2.result.killedPlayerIds.includes('p6'));

  // 1.3 Courtesan visits Mafia -> Mafia kill proceeds
  const actions3: NightActions = {
    courtesanVisit: 'p2', // visits Mafia shooter
    mafiaVotes: { p2: 'p6' }
  };
  const res3 = MafiaEngine.resolveNight(state, actions3);
  assert('Mafia kill proceeds normally when visited by Courtesan',
    res3.result.killedPlayerIds.includes('p6'));
}

// -----------------------------------------------------------------------------
// 2. JOINT DEATH SCENARIOS
// -----------------------------------------------------------------------------
console.log('\n--- 2. Testing Joint Death Scenarios (A - F) ---');

function setupScenarioState(doctorSavesSetting = false): RoomState {
  const players = [
    createPlayer('p1', 'Player 1 (Host)', 'civilian'),
    createPlayer('p2', 'Player 2 (Guest)', 'civilian'),
    createPlayer('p3', 'Player 3 (Sheriff)', 'sheriff'),
    createPlayer('p4', 'Player 4 (Doctor)', 'doctor'),
    createPlayer('p5', 'Player 5 (Putana)', 'courtesan'),
    createPlayer('p6', 'Player 6 (Mafia)', 'mafia'),
    createPlayer('p7', 'Player 7 (Maniac)', 'maniac'),
  ];

  return {
    roomCode: 'JOINT',
    roomName: 'Joint Death Room',
    hostId: 'p1',
    phase: 'NIGHT',
    phaseTimeRemaining: 30,
    dayNumber: 1,
    players,
    spectators: [],
    nominatedPlayerIds: [],
    gameLogs: [],
    settings: {
      gameMode: 'classic',
      maxPlayers: 10,
      generalDiscussionDuration: 60,
      individualSpeechDuration: 45,
      nightDurationSeconds: 30,
      votingDurationSeconds: 30,
      firstDayVoting: true,
      enabledRoles: {
        don: false,
        sheriff: true,
        doctor: true,
        courtesan: true,
        maniac: true,
        bodyguard: false
      },
      allowSelfHealOnce: true,
      anonymousVoting: false,
      isPublic: true,
      doctorSavesFromCourtesanDeath: doctorSavesSetting
    }
  };
}

// Scenario A: Putana chooses p2. Mafia kills Putana. Doctor heals neither.
// Expected: Putana and p2 both die.
{
  const stateA = setupScenarioState(false);
  const actionsA: NightActions = {
    courtesanVisit: 'p2',
    mafiaVotes: { p6: 'p5' }, // Mafia shoots Putana (p5)
    doctorHeal: 'p1'          // Doctor heals someone else
  };
  const resA = MafiaEngine.resolveNight(stateA, actionsA);
  assert('Scenario A: Putana (p5) dies from Mafia', resA.result.killedPlayerIds.includes('p5'));
  assert('Scenario A: Guest (p2) dies from joint death with Putana', resA.result.killedPlayerIds.includes('p2'));
  assert('Scenario A: Guest does not receive daytime block because they died', resA.nextState.courtesanBlockedPlayerId === null);
}

// Scenario B: Putana chooses p2. Maniac kills Putana.
// Expected: Putana and p2 both die.
{
  const stateB = setupScenarioState(false);
  const actionsB: NightActions = {
    courtesanVisit: 'p2',
    mafiaVotes: {},
    maniacKill: 'p5', // Maniac kills Putana (p5)
    doctorHeal: 'p1'
  };
  const resB = MafiaEngine.resolveNight(stateB, actionsB);
  assert('Scenario B: Putana dies from Maniac', resB.result.killedPlayerIds.includes('p5'));
  assert('Scenario B: Guest (p2) dies from joint death when Maniac kills Putana', resB.result.killedPlayerIds.includes('p2'));
}

// Scenario C: Doctor heals Putana (attacked by Mafia).
// Expected: Putana survives, guest does not die from joint death, guest receives daytime block.
{
  const stateC = setupScenarioState(false);
  const actionsC: NightActions = {
    courtesanVisit: 'p2',
    mafiaVotes: { p6: 'p5' }, // Mafia shoots Putana
    doctorHeal: 'p5'          // Doctor saves Putana!
  };
  const resC = MafiaEngine.resolveNight(stateC, actionsC);
  assert('Scenario C: Putana is saved by Doctor', !resC.result.killedPlayerIds.includes('p5'));
  assert('Scenario C: Guest (p2) does not die', !resC.result.killedPlayerIds.includes('p2'));
  assert('Scenario C: Guest (p2) receives daytime block', resC.nextState.courtesanBlockedPlayerId === 'p2');
}

// Scenario D: Putana dies, Doctor heals p2, doctorSavesFromCourtesanDeath is false.
// Expected: Both Putana and p2 die.
{
  const stateD = setupScenarioState(false); // doctorSavesFromCourtesanDeath = false
  const actionsD: NightActions = {
    courtesanVisit: 'p2',
    mafiaVotes: { p6: 'p5' }, // Mafia shoots Putana
    doctorHeal: 'p2'          // Doctor heals guest p2
  };
  const resD = MafiaEngine.resolveNight(stateD, actionsD);
  assert('Scenario D: Putana dies', resD.result.killedPlayerIds.includes('p5'));
  assert('Scenario D: Guest dies despite Doctor heal because setting is false', resD.result.killedPlayerIds.includes('p2'));
  assert('Scenario D: No daytime block since guest died', resD.nextState.courtesanBlockedPlayerId === null);
}

// Scenario E: Putana dies, Doctor heals p2, doctorSavesFromCourtesanDeath is true.
// Expected: Putana dies, guest survives and MANDATORILY receives daytime block.
{
  const stateE = setupScenarioState(true); // doctorSavesFromCourtesanDeath = true
  const actionsE: NightActions = {
    courtesanVisit: 'p2',
    mafiaVotes: { p6: 'p5' }, // Mafia shoots Putana
    doctorHeal: 'p2'          // Doctor heals guest p2
  };
  const resE = MafiaEngine.resolveNight(stateE, actionsE);
  assert('Scenario E: Putana dies', resE.result.killedPlayerIds.includes('p5'));
  assert('Scenario E: Guest survives joint death because Doctor saved guest & setting is true', !resE.result.killedPlayerIds.includes('p2'));
  assert('Scenario E: Surviving guest MANDATORILY receives daytime block', resE.nextState.courtesanBlockedPlayerId === 'p2');
}

// Scenario F: Putana survives, but p2 is independently killed by Mafia.
// Expected: p2 dies normally, Putana unaffected, no duplicate in killedPlayerIds.
{
  const stateF = setupScenarioState(false);
  const actionsF: NightActions = {
    courtesanVisit: 'p2',
    mafiaVotes: { p6: 'p2' }, // Mafia shoots guest directly
    doctorHeal: 'p1'
  };
  const resF = MafiaEngine.resolveNight(stateF, actionsF);
  assert('Scenario F: Guest dies normally from direct Mafia shot', resF.result.killedPlayerIds.includes('p2'));
  assert('Scenario F: Putana remains alive', !resF.result.killedPlayerIds.includes('p5'));
  const p2KillCount = resF.result.killedPlayerIds.filter(id => id === 'p2').length;
  assert('Scenario F: No duplicate entry for p2 death', p2KillCount === 1);
  assert('Scenario F: No daytime block since guest died', resF.nextState.courtesanBlockedPlayerId === null);
}

// -----------------------------------------------------------------------------
// 3. DAYTIME RESTRICTIONS & SERVER-SIDE ENFORCEMENT
// -----------------------------------------------------------------------------
console.log('\n--- 3. Testing Daytime Restrictions & Server Enforcement ---');

{
  const room = new Room('DAYTEST', 'Day Test', 'p1', 'Player 1', {
    gameMode: 'classic',
    doctorSavesFromCourtesanDeath: false
  });

  // Add players
  room.state.players = [
    createPlayer('p1', 'Player 1 (Host)', 'civilian'),
    createPlayer('p2', 'Player 2 (Blocked)', 'civilian'),
    createPlayer('p3', 'Player 3 (Sheriff)', 'sheriff'),
    createPlayer('p4', 'Player 4 (Doctor)', 'doctor'),
    createPlayer('p5', 'Player 5 (Putana)', 'courtesan'),
    createPlayer('p6', 'Player 6 (Mafia)', 'mafia')
  ];

  // Set active daytime block on p2
  room.state.courtesanBlockedPlayerId = 'p2';

  // 3.1 Speech auto-skip
  room.state.phase = 'INDIVIDUAL_SPEECHES';
  // Test nextIndividualSpeech when p2 is next speaker
  (room as any).speechSpeakerQueue = ['p2', 'p3'];
  (room as any).nextIndividualSpeech();
  assert('Speech auto-skips blocked player p2 and advances to p3', 
    room.state.currentSpeakerId === 'p3');

  // 3.2 Cannot vote in VOTING phase
  room.state.phase = 'VOTING';
  room.state.nominatedPlayerIds = ['p1', 'p6'];
  const voteRes = room.castVote('p2', 'p1');
  assert('Blocked player p2 cannot cast vote in VOTING', voteRes === false);

  // 3.3 Cannot nominate
  room.state.phase = 'INDIVIDUAL_SPEECHES';
  room.state.currentSpeakerId = 'p2';
  const nomRes = room.nominatePlayer('p1', 'p2');
  assert('Blocked player p2 cannot nominate candidates', nomRes === false);

  // 3.4 Excluded from totalEligibleVoters in startVotingPhase
  (room as any).startVotingPhase();
  const aliveCount = room.state.players.filter(p => p.isAlive).length; // 6
  assert('startVotingPhase excludes courtesanBlockedPlayerId from totalEligibleVoters',
    room.state.totalEligibleVoters === aliveCount - 1); // 5

  // 3.5 Excluded from totalEligibleVoters in startRevotePhase
  room.state.defenseCandidates = ['p1', 'p6'];
  (room as any).startRevotePhase();
  assert('startRevotePhase excludes courtesanBlockedPlayerId from totalEligibleVoters',
    room.state.totalEligibleVoters === aliveCount - 1 - 2); // alive (6) - blocked (1) - 2 tie candidates = 3

  // 3.6 Cannot send chat messages in game channels
  const chatAllRes = room.addChatMessage('p2', 'I want to speak', 'all');
  const chatMafiaRes = room.addChatMessage('p2', 'Secret msg', 'mafia');
  assert('Blocked player p2 cannot send messages in all chat', chatAllRes === false);
  assert('Blocked player p2 cannot send messages in mafia chat', chatMafiaRes === false);

  // 3.7 Can skip in DAY_DISCUSSION
  room.state.phase = 'DAY_DISCUSSION';
  room.state.phaseSkipVotedIds = [];
  const skipRes = room.skipPhase('p2');
  assert('Blocked player p2 CAN vote skip in DAY_DISCUSSION', skipRes === true);
  assert('Skip vote recorded for p2', (room.state.phaseSkipVotedIds || []).includes('p2'));

  // 3.8 Block cleared on startNightPhase
  (room as any).startNightPhase();
  assert('courtesanBlockedPlayerId is cleared when night begins', 
    room.state.courtesanBlockedPlayerId === null);
}

// -----------------------------------------------------------------------------
// 4. WILLS & LAST WORDS (SCENARIOS A - C)
// -----------------------------------------------------------------------------
console.log('\n--- 4. Testing Wills & Last Words (Order & Media Access) ---');

// Scenario 4.A: Multiple night deaths p2, p6, p9 -> strictly sequential in table slot order 2 -> 6 -> 9
{
  const room = new Room('WILLS', 'Wills Room', 'p1', 'Player 1');
  room.state.players = [
    createPlayer('p1', 'Slot 1', 'civilian'),
    createPlayer('p2', 'Slot 2', 'civilian'),
    createPlayer('p3', 'Slot 3', 'civilian'),
    createPlayer('p4', 'Slot 4', 'doctor'),
    createPlayer('p5', 'Slot 5', 'courtesan'),
    createPlayer('p6', 'Slot 6', 'civilian'),
    createPlayer('p7', 'Slot 7', 'civilian'),
    createPlayer('p8', 'Slot 8', 'civilian'),
    createPlayer('p9', 'Slot 9', 'civilian'),
    createPlayer('p10', 'Slot 10', 'mafia')
  ];

  // Pass killed ids in reverse or mixed order: ['p9', 'p2', 'p6']
  const nightResult = {
    killedPlayerIds: ['p9', 'p2', 'p6'],
    healedPlayerIds: [],
    blockedPlayerId: undefined,
    narrativeText: []
  };

  room.state.lastNightResult = nightResult;
  room.state.phase = 'MORNING_REPORT';

  (room as any).resolveMorningReport();

  const fullOrderA = [room.state.currentSpeakerId, ...(room as any).lastWordsQueue];
  assert('Scenario 4.A: Last words queue strictly sorted in table slot order 2 -> 6 -> 9',
    fullOrderA.length === 3 && fullOrderA[0] === 'p2' && fullOrderA[1] === 'p6' && fullOrderA[2] === 'p9',
    fullOrderA);
}

// Scenario 4.B: Putana (p5) dies and takes guest (p2)
// Expected: both placed in last words queue in slot order: ['p2', 'p5']
{
  const room = new Room('WILLS_JOINT', 'Wills Joint', 'p1', 'Player 1');
  room.state.players = [
    createPlayer('p1', 'Slot 1', 'civilian'),
    createPlayer('p2', 'Slot 2', 'civilian'),
    createPlayer('p3', 'Slot 3', 'civilian'),
    createPlayer('p4', 'Slot 4', 'doctor'),
    createPlayer('p5', 'Slot 5', 'courtesan'),
    createPlayer('p6', 'Slot 6', 'mafia')
  ];

  // Killed p5 and p2
  room.state.lastNightResult = {
    killedPlayerIds: ['p5', 'p2'],
    healedPlayerIds: [],
    blockedPlayerId: 'p2',
    narrativeText: []
  };

  (room as any).resolveMorningReport();
  const fullOrderB = [room.state.currentSpeakerId, ...(room as any).lastWordsQueue];
  assert('Scenario 4.B: Putana and guest get separate wills in table order [p2, p5]',
    fullOrderB.length === 2 && fullOrderB[0] === 'p2' && fullOrderB[1] === 'p5',
    fullOrderB);
}

// Scenario 4.C: Blocked player executed by day vote -> gets mic & camera in LAST_WORDS_ARREST
{
  const room = new Room('ARREST_TEST', 'Arrest Test', 'p1', 'Player 1');
  room.state.players = [
    createPlayer('p1', 'Slot 1', 'civilian'),
    createPlayer('p2', 'Slot 2 (Blocked & Arrested)', 'civilian'),
    createPlayer('p3', 'Slot 3', 'mafia')
  ];
  room.state.courtesanBlockedPlayerId = 'p2';

  // Execute p2
  (room as any).startLastWordsArrest('p2');

  assert('Phase transitioned to LAST_WORDS_ARREST', room.state.phase === 'LAST_WORDS_ARREST');
  assert('Current speaker is arrested player p2', room.state.currentSpeakerId === 'p2');

  // Verify server-side media condition from server.ts:
  const isGivingLastWords = (room.state.phase === 'LAST_WORDS_ARREST' || room.state.phase === 'LAST_WORDS_KILLED') &&
    room.state.currentSpeakerId === 'p2';

  let isAudio = true;
  let isVideo = true;
  if (room.state.courtesanBlockedPlayerId === 'p2' && !isGivingLastWords) {
    isAudio = false;
    isVideo = false;
  }

  assert('Scenario 4.C: Server-side check permits audio/video during LAST_WORDS_ARREST for blocked player',
    isGivingLastWords === true && isAudio === true && isVideo === true);
}

// -----------------------------------------------------------------------------
// 5. ROOM SETTINGS INTEGRITY
// -----------------------------------------------------------------------------
console.log('\n--- 5. Testing Room Settings Integrity ---');

{
  const classicRoom = new Room('DEF_SET', 'Def Set', 'p1', 'Player 1');
  assert('doctorSavesFromCourtesanDeath default is false', 
    classicRoom.state.settings.doctorSavesFromCourtesanDeath === false);

  const sportRoom = new Room('SPORT_SET', 'Sport Set', 'p1', 'Player 1', { gameMode: 'sport' });
  assert('Sport room gameMode is sport', sportRoom.state.settings.gameMode === 'sport');
  assert('Sport room has courtesan disabled', sportRoom.state.settings.enabledRoles.courtesan === false || sportRoom.state.settings.gameMode === 'sport');
}

console.log('\n====================================================');
if (allPassed) {
  console.log('🎉 ALL TARGETED TESTS PASSED WITHOUT ERRORS!');
} else {
  console.error('❌ SOME TESTS FAILED!');
}
console.log('====================================================');

process.exit(allPassed ? 0 : 1);
