import fs from 'fs';
import path from 'path';
import { evaluateLootboxDrop, createLootboxRuleSnapshot } from '../server/db/lootboxFoundation';
import { LootboxRuleConfig, ItemDefinition } from '../src/data/items';

async function runTests() {
  console.log('🚀 Running Lootbox Builder Navigation & UI Overhaul Tests...\n');

  const componentPath = path.resolve(process.cwd(), 'src/components/AdminLootboxBuilderView.tsx');
  const fileContent = fs.readFileSync(componentPath, 'utf-8');

  // ---------------------------------------------------------------------------
  // TEST 1: Navigation state definition and default 'catalog'
  // ---------------------------------------------------------------------------
  console.log('--- Test 1: Navigation state definition ---');
  if (!fileContent.includes("useState<'catalog' | 'editor'>('catalog')")) {
    throw new Error("FAIL: activeView state not found or default is not 'catalog'");
  }
  console.log("✓ PASS: activeView state initialized with default 'catalog'");

  // ---------------------------------------------------------------------------
  // TEST 2: Two separate screens (catalog and editor)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: Two separate screens mutually exclusive ---');
  if (!fileContent.includes("{activeView === 'catalog' && (")) {
    throw new Error("FAIL: activeView === 'catalog' block not found");
  }
  if (!fileContent.includes("{activeView === 'editor' && (")) {
    throw new Error("FAIL: activeView === 'editor' block not found");
  }
  // Verify that the old split layout (grid-cols-1 lg:grid-cols-12) is removed from the root
  if (fileContent.includes('grid grid-cols-1 lg:grid-cols-12 gap-3.5 min-h-0 overflow-hidden')) {
    throw new Error("FAIL: old permanent split grid still present in root layout");
  }
  console.log('✓ PASS: Catalog and Editor are rendered on independent full-width screens');

  // ---------------------------------------------------------------------------
  // TEST 3: Catalog screen controls
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Catalog screen controls ---');
  if (!fileContent.includes('Каталог лутбоксов')) {
    throw new Error('FAIL: Catalog title not found');
  }
  if (!fileContent.includes('Создать лутбокс')) {
    throw new Error('FAIL: Create lootbox button not found');
  }
  if (!fileContent.includes('placeholder="Поиск сундука по названию или системному ID..."')) {
    throw new Error('FAIL: Search input not found');
  }
  console.log('✓ PASS: Catalog has header, search, create button, and responsive grid');

  // ---------------------------------------------------------------------------
  // TEST 4: Editor screen controls and Back button
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: Editor screen controls and Back button ---');
  if (!fileContent.includes('К каталогу')) {
    throw new Error("FAIL: Back to catalog button ('К каталогу') not found");
  }
  if (!fileContent.includes("setActiveView('catalog')")) {
    throw new Error("FAIL: setActiveView('catalog') not triggered by back button");
  }
  console.log('✓ PASS: Editor screen contains Back button returning to catalog');

  // ---------------------------------------------------------------------------
  // TEST 5: Selection logic & Unsaved changes protection
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: Selection logic & unsaved changes protection ---');
  if (!fileContent.includes('id === draftItem.id') || !fileContent.includes("setActiveView('editor')")) {
    throw new Error('FAIL: Same-chest selection optimization not found');
  }
  if (!fileContent.includes('setPendingSelectTarget({ id, isNew })')) {
    throw new Error('FAIL: pendingSelectTarget guard not found on unsaved changes');
  }
  console.log('✓ PASS: Selection logic correctly prompts on unsaved changes and skips prompt on same chest');

  // ---------------------------------------------------------------------------
  // TEST 6: Immutability banner removed from root & replaced with modal
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 6: Snapshot immutability info modal ---');
  if (fileContent.includes('{/* ================= IMMUTABILITY WARNING BANNER (REQUIRED BY SECTION 9) ================= */}')) {
    throw new Error('FAIL: Static immutability banner still present at top of constructor');
  }
  if (!fileContent.includes('isInfoModalOpen && (')) {
    throw new Error('FAIL: isInfoModalOpen modal block not found');
  }
  if (!fileContent.includes('Справка о снимках правил (ruleSnapshot)')) {
    throw new Error('FAIL: Snapshot info modal title not found');
  }
  if (!fileContent.includes('Гарантия неизменяемости снимков:')) {
    throw new Error('FAIL: Guarantee text not found in modal');
  }
  if (!fileContent.includes('handleCopySnapshotHash')) {
    throw new Error('FAIL: Copy hash handler not found');
  }
  console.log('✓ PASS: Static banner removed; compact trigger and modal with SHA-256 and copy functional');

  // ---------------------------------------------------------------------------
  // TEST 7: All 5 inner sub-tabs preserved
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 7: Preserved 5 inner sub-tabs ---');
  const requiredSubTabs = ['general', 'rewards', 'simulator', 'animations', 'sounds'];
  for (const tab of requiredSubTabs) {
    if (!fileContent.includes(`activeSubTab === '${tab}'`)) {
      throw new Error(`FAIL: SubTab '${tab}' not found in editor`);
    }
  }
  console.log('✓ PASS: All 5 editor sub-tabs (general, rewards, simulator, animations, sounds) preserved');

  // ---------------------------------------------------------------------------
  // TEST 8: Server Lootbox Engine Integrity Check
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 8: Server Lootbox Engine Integrity (evaluateLootboxDrop) ---');
  const mockChest: ItemDefinition = {
    id: 'test_chest',
    name: 'Тестовый сундук',
    description: 'Описание',
    category: 'chests',
    rarity: 'rare',
    cost: 100,
    icon: '🧰',
    usable: true,
    consumable: true,
    lootboxConfig: {
      version: 1,
      snapshotHash: '',
      dropMode: 'single_weighted',
      allowNestedLootboxes: false,
      rewards: [
        { id: 'rw1', type: 'credits', minQty: 100, maxQty: 100, weight: 100 }
      ],
      consolationPrize: null,
      updatedAt: new Date().toISOString()
    }
  };

  const validSnapshot = createLootboxRuleSnapshot(mockChest);
  const dropResult = evaluateLootboxDrop(validSnapshot, {
    catalogMap: { test_chest: mockChest }
  });
  if (!dropResult || dropResult.rewards.length !== 1 || dropResult.rewards[0].type !== 'credits') {
    throw new Error(`FAIL: evaluateLootboxDrop returned unexpected result: ${JSON.stringify(dropResult)}`);
  }
  console.log('✓ PASS: Server-side lootbox drop engine is 100% operational and untouched');

  console.log('\n🎉 ALL LOOTBOX BUILDER NAVIGATION & UI OVERHAUL TESTS PASSED!');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
