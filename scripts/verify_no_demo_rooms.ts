import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPublicRoomsLoader, parsePublicRoomsResponse } from '../src/utils/publicRooms';
import { TRANSLATIONS } from '../src/utils/i18n';
import type { PublicRoomSummary, PublicRoomsStatus } from '../src/types/mafia';

const ROOT = process.cwd();

async function runVerification() {
  console.log('=== Verifying Demo Rooms Removal & Room List States ===\n');

  // 1. Live server GET /api/rooms check
  console.log('1. Checking live GET /api/rooms...');
  const res = await fetch('http://localhost:3000/api/rooms');
  assert.equal(res.status, 200, 'GET /api/rooms must return HTTP 200');
  const livePayload = await res.json();
  const parsedLive = parsePublicRoomsResponse(livePayload);
  assert.ok(parsedLive !== null, 'Live /api/rooms payload must pass parsePublicRoomsResponse');
  console.log(`   PASS: Live /api/rooms returned valid structure (${parsedLive.length} real rooms)`);

  // 2. Unit checks for parsePublicRoomsResponse
  console.log('2. Checking parsePublicRoomsResponse validation...');
  assert.deepEqual(parsePublicRoomsResponse({ rooms: [] }), []);
  const sampleRealRoom: PublicRoomSummary = {
    roomCode: '901',
    roomName: 'Тайный стол',
    playerCount: 2,
    maxPlayers: 8,
    inGame: false,
    hostName: 'Ведущий'
  };
  assert.deepEqual(parsePublicRoomsResponse({ rooms: [sampleRealRoom] }), [sampleRealRoom]);
  assert.equal(parsePublicRoomsResponse(null), null);
  assert.equal(parsePublicRoomsResponse({}), null);
  assert.equal(parsePublicRoomsResponse({ rooms: null }), null);
  assert.equal(parsePublicRoomsResponse({ rooms: [{ roomCode: '' }] }), null);
  assert.equal(parsePublicRoomsResponse('<html>502 Bad Gateway</html>'), null);
  console.log('   PASS: parsePublicRoomsResponse validates valid & rejects malformed payloads');

  // 3. Concurrency & overlapping requests test (stale request must not overwrite newer response)
  console.log('3. Checking overlapping requests & error retention via createPublicRoomsLoader...');
  {
    const loader = createPublicRoomsLoader();
    let roomsState: PublicRoomSummary[] = [];
    let statusState: PublicRoomsStatus = 'loading';

    let resolveFirst!: (val: Response) => void;
    let resolveSecond!: (val: Response) => void;
    let callIndex = 0;

    const fakeFetch = (() => {
      callIndex += 1;
      if (callIndex === 1) {
        return new Promise<Response>(r => {
          resolveFirst = r;
        });
      }
      if (callIndex === 2) {
        return new Promise<Response>(r => {
          resolveSecond = r;
        });
      }
      if (callIndex === 3) {
        return Promise.reject(new Error('Network down'));
      }
      return Promise.resolve(new Response(JSON.stringify({ rooms: [] }), { status: 200 }));
    }) as unknown as typeof fetch;

    const p1 = loader({
      fetchImpl: fakeFetch,
      onSuccess: rooms => {
        roomsState = rooms;
        statusState = 'loaded';
      },
      onError: () => {
        statusState = 'error';
      }
    });

    const p2 = loader({
      fetchImpl: fakeFetch,
      onSuccess: rooms => {
        roomsState = rooms;
        statusState = 'loaded';
      },
      onError: () => {
        statusState = 'error';
      }
    });

    // Request #2 resolves FIRST with a real room
    resolveSecond(new Response(JSON.stringify({ rooms: [sampleRealRoom] }), { status: 200 }));
    const res2 = await p2;
    assert.equal(res2, 'loaded');
    assert.deepEqual(roomsState, [sampleRealRoom]);
    assert.equal(statusState, 'loaded');

    // Request #1 resolves LATE with empty list (or error) — MUST BE IGNORED
    resolveFirst(new Response(JSON.stringify({ rooms: [] }), { status: 200 }));
    const res1 = await p1;
    assert.equal(res1, 'stale');
    assert.deepEqual(roomsState, [sampleRealRoom], 'Stale response must NOT overwrite newer rooms');
    assert.equal(statusState, 'loaded', 'Stale response must NOT overwrite newer status');

    // Request #3 fails — must keep previously loaded real rooms and set status = 'error'
    const res3 = await loader({
      fetchImpl: fakeFetch,
      onSuccess: rooms => {
        roomsState = rooms;
        statusState = 'loaded';
      },
      onError: () => {
        statusState = 'error';
      }
    });
    assert.equal(res3, 'error');
    assert.deepEqual(roomsState, [sampleRealRoom], 'Transient refresh failure must preserve previously loaded rooms');
    assert.equal(statusState, 'error');

    // Request #4 succeeds with { rooms: [] } — retry recovers to 'loaded' and empties list
    const res4 = await loader({
      fetchImpl: fakeFetch,
      onSuccess: rooms => {
        roomsState = rooms;
        statusState = 'loaded';
      },
      onError: () => {
        statusState = 'error';
      }
    });
    assert.equal(res4, 'loaded');
    assert.deepEqual(roomsState, []);
    assert.equal(statusState, 'loaded');
  }
  console.log('   PASS: Concurrency guard, error retention, and retry recovery verified');

  // 4. Static / bundle checks (no hardcoded fake hosts or demo rooms 430-432, placeholder 429 kept)
  console.log('4. Checking source & production bundle for absence of demo rooms...');
  const homeViewSrc = fs.readFileSync(path.join(ROOT, 'src/components/HomeView.tsx'), 'utf8');
  for (const forbidden of ['Виктор', 'Елена', 'Дмитрий', 'Михаил', "'430'", "'431'", "'432'"]) {
    assert.equal(homeViewSrc.includes(forbidden), false, `HomeView.tsx must not contain ${forbidden}`);
  }
  assert.equal(homeViewSrc.includes('КОД: НАПР. 429'), true, 'Manual code placeholder 429 must be preserved');

  const distAssetsDir = path.join(ROOT, 'dist/assets');
  const jsFiles = fs.readdirSync(distAssetsDir).filter(f => f.endsWith('.js'));
  assert.ok(jsFiles.length > 0, 'Production build assets must exist in dist/assets');
  const combinedBundle = jsFiles.map(f => fs.readFileSync(path.join(distAssetsDir, f), 'utf8')).join('\n');
  for (const forbidden of ['hostName:"Виктор"', 'hostName:"Елена"', 'hostName:"Дмитрий"', 'hostName:"Михаил"']) {
    assert.equal(combinedBundle.includes(forbidden), false, `Production bundle must not contain ${forbidden}`);
  }
  console.log('   PASS: Demo rooms completely absent in source and production bundle');

  // 5. Localization check (ru, uk, en)
  console.log('5. Checking i18n keys for ru, uk, en...');
  const requiredKeys = [
    'home.rooms_loading',
    'home.rooms_empty_title',
    'home.rooms_empty_hint',
    'home.rooms_error',
    'home.rooms_refresh_error',
    'home.rooms_retry'
  ];
  for (const lang of ['ru', 'uk', 'en'] as const) {
    for (const key of requiredKeys) {
      assert.ok(
        typeof TRANSLATIONS[lang][key] === 'string' && TRANSLATIONS[lang][key].trim().length > 0,
        `Missing translation "${key}" for language "${lang}"`
      );
    }
  }
  console.log('   PASS: All required room-state translation keys exist in ru, uk, en');

  // 6. Render HomeView across all states (loading, empty, real rooms, error, stale warning)
  console.log('6. Rendering HomeView across loading / empty / error / real rooms / stale-warning states...');
  const tmpOut = path.join(ROOT, '.tmp-homeview-ssr.mjs');
  try {
    await esbuild.build({
      entryPoints: [path.join(ROOT, 'src/components/HomeView.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: tmpOut,
      external: ['react', 'react-dom', 'lucide-react'],
      loader: {
        '.jpg': 'dataurl',
        '.png': 'dataurl',
        '.webp': 'dataurl',
        '.svg': 'dataurl'
      },
      define: {
        'import.meta.env': '{}'
      }
    });

    // Minimal browser globals for SSR rendering
    (globalThis as unknown as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };
    (globalThis as unknown as { window?: unknown }).window = {
      location: { pathname: '/', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {}
      }),
      navigator: { userAgent: 'node' }
    };

    const [{ HomeView }, { LanguageProvider }, { SkinProvider }] = await Promise.all([
      import(tmpOut),
      import('../src/context/LanguageContext'),
      import('../src/context/SkinContext')
    ]);

    const renderHome = (publicRooms: PublicRoomSummary[], roomsStatus: PublicRoomsStatus) => {
      return renderToStaticMarkup(
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(
            SkinProvider,
            null,
            React.createElement(HomeView, {
              playerName: 'Тестер',
              playerId: 'user_test123',
              isLoggedIn: false,
              soundEnabled: false,
              user: null,
              onToggleSound: () => {},
              onUpdatePlayerName: () => {},
              onCreateRoom: () => {},
              onJoinRoom: () => {},
              publicRooms,
              roomsStatus,
              isRefreshingRooms: false,
              onRefreshRooms: () => {},
              onOpenRules: () => {},
              onOpenProfile: () => {},
              onOpenAuth: () => {},
              onLogout: () => {}
            })
          )
        )
      );
    };

    // State A: Loading
    const loadingHtml = renderHome([], 'loading');
    assert.ok(loadingHtml.includes('data-testid="rooms-loading-state"'), 'Loading state must render');
    assert.ok(loadingHtml.includes('Загрузка комнат…'), 'Loading text must be rendered');
    assert.equal(loadingHtml.includes('Пока нет доступных комнат'), false, 'Loading must not show empty state');
    assert.equal(loadingHtml.includes('Комната №430'), false, 'Loading must not show demo rooms');

    // State B: Confirmed empty ({ rooms: [] })
    const emptyHtml = renderHome([], 'loaded');
    assert.ok(emptyHtml.includes('data-testid="rooms-empty-state"'), 'Empty state must render');
    assert.ok(emptyHtml.includes('Пока нет доступных комнат'), 'Empty title must be rendered');
    assert.ok(
      emptyHtml.includes('Создайте комнату и пригласите друзей, чтобы начать игру'),
      'Empty hint must be rendered'
    );
    assert.equal(emptyHtml.includes('Комната №429'), false, 'Empty state must not show demo room 429');
    assert.equal(emptyHtml.includes('Комната №430'), false, 'Empty state must not show demo room 430');
    assert.ok(emptyHtml.includes('+ Создать комнату'), 'Create room button must remain intact');
    assert.ok(emptyHtml.includes('home-online-counters'), 'Online counters must remain intact');
    assert.ok(emptyHtml.includes('Ввести код комнаты вручную'), 'Manual code toggle must remain intact');
    assert.ok(emptyHtml.includes('Общий чат'), 'Global chat button must remain intact');
    assert.ok(emptyHtml.includes('Игровые комнаты') && emptyHtml.includes('Об игре'), 'Mobile tabs must remain intact');

    // State C: Error without prior rooms
    const errorHtml = renderHome([], 'error');
    assert.ok(errorHtml.includes('data-testid="rooms-error-state"'), 'Error state must render');
    assert.ok(errorHtml.includes('Не удалось загрузить список комнат'), 'Error text must be rendered');
    assert.ok(errorHtml.includes('Повторить'), 'Retry button must be rendered');
    assert.equal(errorHtml.includes('Пока нет доступных комнат'), false, 'Error must not show false empty state');
    assert.equal(errorHtml.includes('Комната №430'), false, 'Error must not show demo rooms');

    // State D: Real rooms
    const realHtml = renderHome([sampleRealRoom], 'loaded');
    assert.ok(realHtml.includes('Тайный стол'), 'Real room must render');
    assert.ok(realHtml.includes('2/8 игроков'), 'Real room player count must render');
    assert.equal(realHtml.includes('rooms-empty-state'), false);
    assert.equal(realHtml.includes('rooms-error-state'), false);
    assert.equal(realHtml.includes('rooms-stale-warning'), false);
    assert.equal(realHtml.includes('Комната №430'), false);

    // State E: Refresh error while previously loaded real rooms exist
    const staleHtml = renderHome([sampleRealRoom], 'error');
    assert.ok(staleHtml.includes('Тайный стол'), 'Previously loaded real rooms must stay visible on transient refresh error');
    assert.ok(staleHtml.includes('data-testid="rooms-stale-warning"'), 'Stale warning banner must be shown');
    assert.ok(staleHtml.includes('Повторить'), 'Retry button must be present in stale warning');
    assert.equal(staleHtml.includes('rooms-empty-state'), false);

    console.log('   PASS: All 5 UI states rendered cleanly and preserved surrounding HomeView controls');
  } finally {
    if (fs.existsSync(tmpOut)) {
      fs.unlinkSync(tmpOut);
    }
  }

  // 7. Verify App.tsx wiring
  console.log('7. Checking App.tsx polling and retry wiring...');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
  assert.ok(appSrc.includes("useState<PublicRoomsStatus>('loading')"), 'Initial roomsStatus must be loading');
  assert.ok(appSrc.includes('createPublicRoomsLoader'), 'App.tsx must use createPublicRoomsLoader');
  assert.ok(appSrc.includes('5000'), '5-second polling interval must remain intact');
  assert.ok(appSrc.includes('fetchPublicRooms({ manual: true })'), 'Manual retry must invoke fetchPublicRooms');
  console.log('   PASS: App.tsx polling and retry checks passed');

  console.log('\n✅ ALL VERIFICATION CHECKS PASSED!');
}

runVerification().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
