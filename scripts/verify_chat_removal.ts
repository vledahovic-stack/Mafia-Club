import { Room } from '../server/game/roomManager';
import { Player, RoleId } from '../src/types/mafia';

function assert(description: string, condition: boolean) {
  if (!condition) {
    console.error(`❌ FAILED: ${description}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${description}`);
}

console.log('🧪 --- STARTING ACTIVE GAME CHAT REMOVAL VERIFICATION --- 🧪\n');

// Initialize room
const room = new Room('TEST01', 'Test Room', 'host_1', 'Host', {
  gameMode: 'classic',
  maxPlayers: 10,
  generalDiscussionDuration: 30,
  individualSpeechDuration: 45,
  votingDurationSeconds: 30,
  nightDurationSeconds: 30
});

// Add players directly to room.state.players
const createPlayer = (id: string, name: string, role?: RoleId): Player => ({
  id,
  name,
  avatarSeed: name,
  isHost: id === 'host_1',
  isBot: false,
  isAlive: true,
  connected: true,
  ready: true,
  warningsCount: 0,
  role
});

const p1 = room.state.players[0]; // host_1
p1.role = 'civilian';

room.state.players.push(
  createPlayer('p2', 'Alice', 'mafia'),
  createPlayer('p3', 'Bob', 'sheriff'),
  createPlayer('p4', 'Charlie', 'doctor')
);

// Add spectator
room.addSpectator({
  id: 'spec_1',
  name: 'Spectator Sam',
  avatarSeed: 'Spectator Sam',
  joinedAt: Date.now()
});

// TEST 1: LOBBY Phase - Text Chat Works Normally
console.log('\n--- SECTION 1: LOBBY Phase Chat Permitted ---');
assert('Phase is initially LOBBY', room.state.phase === 'LOBBY');

const lobbyMsg1 = room.addChatMessage(p1.id, 'Привет всем в лобби!', 'all');
assert('Player p1 can send chat in LOBBY', lobbyMsg1 === true);

const lobbyMsg2 = room.addChatMessage('p2', 'Готовы начинать?', 'all');
assert('Player p2 can send chat in LOBBY', lobbyMsg2 === true);

const lobbyMsg3 = room.addChatMessage('spec_1', 'Я буду смотреть', 'all');
assert('Spectator can send chat in LOBBY', lobbyMsg3 === true);

const initialChatCount = room.messages.filter(m => m.channel === 'all').length;
assert('3 lobby messages were stored in room.messages', initialChatCount === 3);

// TEST 2: Active Phases - All Player/Spectator Chat Rejected
console.log('\n--- SECTION 2: Active Match Phases Reject User Chat ---');

const activePhases = [
  'ROLE_REVEAL',
  'MAFIA_MEETING',
  'DAY_DISCUSSION',
  'INDIVIDUAL_SPEECHES',
  'VOTING',
  'DEFENSE_SPEECH',
  'REVOTE',
  'LAST_WORDS_ARREST',
  'NIGHT',
  'MORNING_REPORT',
  'LAST_WORDS_KILLED'
] as const;

for (const phase of activePhases) {
  room.state.phase = phase;
  if (phase === 'INDIVIDUAL_SPEECHES') {
    room.state.currentSpeakerId = p1.id;
  }

  // Attempt player chat in 'all'
  const resAll = room.addChatMessage(p1.id, `Test message during ${phase}`, 'all');
  assert(`Player p1 cannot send 'all' chat in ${phase}`, resAll === false);

  // Attempt mafia chat
  const resMafia = room.addChatMessage('p2', `Secret mafia msg during ${phase}`, 'mafia');
  assert(`Mafia player p2 cannot send 'mafia' chat in ${phase}`, resMafia === false);

  // Attempt dead chat
  const resDead = room.addChatMessage('p3', `Dead channel msg during ${phase}`, 'dead');
  assert(`Player cannot send 'dead' chat in ${phase}`, resDead === false);

  // Attempt spectator chat
  const resSpec = room.addChatMessage('spec_1', `Spectator msg during ${phase}`, 'all');
  assert(`Spectator cannot send chat in ${phase}`, resSpec === false);
}

// Check message count: no new user messages added
const activeChatCount = room.messages.filter(m => m.channel === 'all' && m.senderId !== 'system' && m.senderId !== 'SYSTEM').length;
assert('No user messages were added during active phases', activeChatCount === 3);

// TEST 3: Dead/Eliminated Player Rejected During Active Match
console.log('\n--- SECTION 3: Eliminated Player Chat Ban ---');
room.state.phase = 'DAY_DISCUSSION';
const p4 = room.state.players.find(p => p.id === 'p4')!;
p4.isAlive = false;

const deadMsgAll = room.addChatMessage('p4', 'Я выбыл, слушайте меня!', 'all');
assert('Dead player cannot send to all chat', deadMsgAll === false);

const deadMsgDead = room.addChatMessage('p4', 'Привет с кладбища', 'dead');
assert('Dead player cannot send to dead chat during active match', deadMsgDead === false);

// TEST 4: Official Protocol & System Messages Continue Working
console.log('\n--- SECTION 4: System Messages & Protocol Preserved ---');
const prevMsgCount = room.messages.length;

const sysMsg1 = room.addChatMessage('system', '☀️ День 1. Город просыпается.', 'system');
assert('System message via addChatMessage succeeds during active match', sysMsg1 === true);

(room as any).addLog('⚖️ Суд города приговорил преступника.');
const protocolLogs = room.messages.filter(m => m.channel === 'system' || m.senderId === 'system');
assert('addLog successfully creates protocol entry during active match', protocolLogs.length > 0);
assert('Total messages increased with system logs', room.messages.length > prevMsgCount);

// TEST 5: Return to LOBBY Re-enables Lobby Chat
console.log('\n--- SECTION 5: Returning to LOBBY Re-enables Chat ---');
room.state.phase = 'LOBBY';
p4.isAlive = true;

const postGameLobbyMsg = room.addChatMessage(p1.id, 'Отличная партия! Играем ещё?', 'all');
assert('Player p1 can chat again in LOBBY after match concludes', postGameLobbyMsg === true);

room.destroy();
console.log('\n🎉 ALL ACTIVE GAME CHAT REMOVAL TESTS PASSED SUCCESSFULLY! 🎉\n');
process.exit(0);
