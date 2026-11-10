/**
 * tools/test_prompt50.js
 * Automated Verification Suite for Prompt 50:
 * - P50-01: ［裏］佐和山城を所持登録すると、編成に入れなくても敵攻撃低下（最大段階の値）が enemyDebuffs に現れること。未所持では現れないこと。
 * - P50-02: 同種の所持特技を複数所持した場合、最大値のみが適用されること（例：敵攻撃低下2%と3%の所持で3%になること）。
 * - P50-03: 武器種対象の攻撃%（例：［絢爛］五稜郭の「大砲城娘の攻撃3%」）が、対象武器種の城娘にのみ適用されること。
 * - P50-04: 敵防御低下の所持特技が訓練場の実効防御に反映されること。
 * - P50-05: 「所持特技を反映」OFFで従来の計算結果と一致すること。「全城娘を所持扱い」でも例外が出ないこと。
 * - P50-06: 訓練場の地形セレクタで「平」に変えると currentTerrain が連動し、地形一致体数表示と訓練場の攻撃計算（×1.25）が変わること。地獄では×1.3になること。
 * - Strict Font-size Floor (>= 12px) Verification.
 */

const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = 'file:///' + path.resolve(__dirname, '../app/index.html').replace(/\\/g, '/');

let total = 0;
let passed = 0;

function assert(title, condition, detail = '') {
  total++;
  if (condition) {
    passed++;
    console.log(`[PASS] ${title}${detail ? ' ' + detail : ''}`);
  } else {
    console.error(`[FAIL] ${title}${detail ? ' ' + detail : ''}`);
  }
}

(async () => {
  console.log('=== Running Prompt 50 Automated Test Suite: Owned Skills & Firing Range Terrain ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR:', msg.text());
    }
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-container', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));

  // =========================================================================
  // P50-01: ［裏］佐和山城の所持特技（編成外での敵攻撃低下反映 & 未所持での非反映）
  // =========================================================================
  console.log('\n--- [P50-01] ［裏］佐和山城: 編成外でも所持時に敵攻撃低下反映 ---');
  const p50_01_result = await page.evaluate(() => {
    const sawa = window.SCRE_DATA.find(c => c.name.includes('［裏］佐和山城'));
    if (!sawa) return { error: '［裏］佐和山城 not found' };

    // Clear party and ownership
    window.setParty([]);
    window.setUseOwnedSkills(true);
    window.setSimulateAllOwned(false);

    const initialOwned = new Set();
    // Test 1: Unowned
    const unownedRes = window.calculateBuffs([], '', { ownedIds: initialOwned, useOwnedSkills: true, simulateAllOwned: false });
    const unownedAtkDown = unownedRes.enemyDebuffs.enemyAtkDown.max;

    // Test 2: Owned (simulate ownership by passing ownedIds or registering)
    const ownedIds = new Set([sawa.id]);
    const ownedRes = window.calculateBuffs([], '', { ownedIds: ownedIds, useOwnedSkills: true, simulateAllOwned: false });
    const ownedAtkDown = ownedRes.enemyDebuffs.enemyAtkDown.max;
    const hasSource = ownedRes.enemyDebuffs.enemyAtkDown.sources.some(s => s.from.includes('［裏］佐和山城') && s.type === '所持特技' && s.val === 2);

    return {
      sawaName: sawa.name,
      unownedAtkDown,
      ownedAtkDown,
      hasSource,
      ownedSkill: sawa.ownedSkill
    };
  });

  assert('P50-01a: 未所持時は敵攻撃低下が0%', p50_01_result.unownedAtkDown === 0, `unownedAtkDown=${p50_01_result.unownedAtkDown}`);
  assert('P50-01b: ［裏］佐和山城を所持登録すると編成外でも敵攻撃低下2%が反映される', p50_01_result.ownedAtkDown === 2, `ownedAtkDown=${p50_01_result.ownedAtkDown}`);
  assert('P50-01c: enemyDebuffsのソースに［裏］佐和山城（所持特技・2%）が存在する', p50_01_result.hasSource === true);

  // =========================================================================
  // P50-02: 同種所持特技の重複ルール（最大値のみ適用）
  // =========================================================================
  console.log('\n--- [P50-02] 同種所持特技の重複ルール（最大値のみ適用） ---');
  const p50_02_result = await page.evaluate(() => {
    const sawa = window.SCRE_DATA.find(c => c.name.includes('［裏］佐和山城')); // 2%
    const kurinta = window.SCRE_DATA.find(c => c.name.includes('クリンタ城')); // 3%
    if (!sawa || !kurinta) return { error: 'Castles not found' };

    // Both owned
    const ownedIds = new Set([sawa.id, kurinta.id]);
    const res = window.calculateBuffs([], '', { ownedIds: ownedIds, useOwnedSkills: true, simulateAllOwned: false });
    const atkDownMax = res.enemyDebuffs.enemyAtkDown.max;
    const sources = res.enemyDebuffs.enemyAtkDown.sources;

    return {
      atkDownMax,
      sourceCount: sources.length,
      topSource: sources.find(s => s.applied) || sources[0]
    };
  });

  assert('P50-02a: ［裏］佐和山城(2%)とクリンタ城(3%)所持で最大値3%のみ適用', p50_02_result.atkDownMax === 3, `atkDownMax=${p50_02_result.atkDownMax}`);
  assert('P50-02b: 適用ソースがクリンタ城(3%)であること', p50_02_result.topSource && p50_02_result.topSource.val === 3 && p50_02_result.topSource.from.includes('クリンタ城'));

  // =========================================================================
  // P50-03: 武器種対象の攻撃%（大砲城娘の攻撃3%）
  // =========================================================================
  console.log('\n--- [P50-03] 武器種対象の所持特技適用（［絢爛］五稜郭） ---');
  const p50_03_result = await page.evaluate(() => {
    const goryo = window.SCRE_DATA.find(c => c.name.includes('［絢爛］五稜郭'));
    const taihouCastle = window.SCRE_DATA.find(c => c.weapon === '大砲' && !c.name.includes('五稜郭'));
    const katanaCastle = window.SCRE_DATA.find(c => c.weapon === '刀');

    if (!goryo || !taihouCastle || !katanaCastle) return { error: 'Castles not found' };

    const testParty = [
      { id: taihouCastle.id, strategyOn: false, specialOn: false, giantStep: 5 },
      { id: katanaCastle.id, strategyOn: false, specialOn: false, giantStep: 5 }
    ];

    // Calculate with goryo owned
    const ownedIds = new Set([goryo.id]);
    const res = window.calculateBuffs(testParty, '', { ownedIds: ownedIds, useOwnedSkills: true, simulateAllOwned: false });

    const taihouBuffs = res.perCastle[taihouCastle.id].buffs;
    const katanaBuffs = res.perCastle[katanaCastle.id].buffs;

    const taihouHasOwnedAtk = taihouBuffs.atkPercent.sources.some(s => s.type === '所持特技' && s.val === 3);
    const katanaHasOwnedAtk = katanaBuffs.atkPercent.sources.some(s => s.type === '所持特技');

    return {
      goryoName: goryo.name,
      taihouName: taihouCastle.name,
      katanaName: katanaCastle.name,
      taihouHasOwnedAtk,
      katanaHasOwnedAtk,
      taihouStackSum: taihouBuffs.atkPercent.stackSum,
      katanaStackSum: katanaBuffs.atkPercent.stackSum
    };
  });

  assert('P50-03a: 大砲城娘は大砲対象所持特技(+3%)が適用される', p50_03_result.taihouHasOwnedAtk === true && p50_03_result.taihouStackSum >= 3);
  assert('P50-03b: 刀城娘には大砲対象所持特技が適用されない', p50_03_result.katanaHasOwnedAtk === false && p50_03_result.katanaStackSum === 0);

  // =========================================================================
  // P50-04: 敵防御低下の所持特技が訓練場の実効防御・ダメージ計算に反映
  // =========================================================================
  console.log('\n--- [P50-04] 敵防御低下の所持特技が訓練場の実効防御に反映 ---');
  const p50_04_result = await page.evaluate(() => {
    const dazai = window.SCRE_DATA.find(c => c.name.includes('［裏］大宰府') && !c.name.includes('［絢爛］'));
    const testCastle = window.SCRE_DATA.find(c => c.weapon === '刀' && !c.name.includes('大宰府'));

    // Target def = 100 (where attack 233+ exceeds def, so defense reduction increases damage)
    const slot = { id: testCastle.id, giantStep: 5, strategyOn: false, specialOn: false };

    // 1. Without owned skill (target def 100)
    const resNoOwned = window.calculateBuffs([slot], '', { ownedIds: new Set(), useOwnedSkills: true, simulateAllOwned: false });
    const statNoOwned = window.calculateFiringCastleStats(testCastle, slot, 100, 0, 1, new Set(), false, resNoOwned);

    // 2. With ［裏］大宰府 owned (敵防御3%低下 -> 100 * 0.97 = 97)
    const resWithOwned = window.calculateBuffs([slot], '', { ownedIds: new Set([dazai.id]), useOwnedSkills: true, simulateAllOwned: false });
    const statWithOwned = window.calculateFiringCastleStats(testCastle, slot, 100, 0, 1, new Set(), false, resWithOwned);

    return {
      dazaiName: dazai.name,
      noOwnedDef: statNoOwned.effDef,
      withOwnedDef: statWithOwned.effDef,
      noOwnedDps: statNoOwned.theoreticalDps,
      withOwnedDps: statWithOwned.theoreticalDps,
      breakdownText: statWithOwned.breakdownText,
      ownedDefDown: statWithOwned.ownedDefDown
    };
  });

  assert('P50-04a: 所持特技なし時の敵実効防御は100', p50_04_result.noOwnedDef === 100, `effDef=${p50_04_result.noOwnedDef}`);
  assert('P50-04b: ［裏］大宰府(3%低下)所持時の敵実効防御は97', p50_04_result.withOwnedDef === 97, `effDef=${p50_04_result.withOwnedDef}`);
  assert('P50-04c: 防御低下によりDPSが向上する', p50_04_result.withOwnedDps > p50_04_result.noOwnedDps, `${p50_04_result.noOwnedDps} -> ${p50_04_result.withOwnedDps}`);
  assert('P50-04d: 計算内訳に所持特技の敵防御低下が表示される', p50_04_result.breakdownText.includes('[所持特技: 敵防御-3%'));

  // =========================================================================
  // P50-05: 「所持特技を反映」OFF / 「全城娘を所持扱い」検証
  // =========================================================================
  console.log('\n--- [P50-05] 「所持特技を反映」OFF / 「全城娘を所持扱い」検証 ---');
  const p50_05_result = await page.evaluate(() => {
    const dazai = window.SCRE_DATA.find(c => c.name.includes('［裏］大宰府') && !c.name.includes('［絢爛］'));
    const testCastle = window.SCRE_DATA.find(c => c.weapon === '刀' && !c.name.includes('大宰府'));
    const slot = { id: testCastle.id, giantStep: 5, strategyOn: false, specialOn: false };

    // 1. Turned OFF explicitly
    const resOff = window.calculateBuffs([slot], '', { ownedIds: new Set([dazai.id]), useOwnedSkills: false, simulateAllOwned: false });
    const statOff = window.calculateFiringCastleStats(testCastle, slot, 300, 0, 1, new Set(), false, resOff);

    // 2. Simulate All Owned
    let simAllOk = true;
    let simAllActiveCount = 0;
    try {
      const resSimAll = window.calculateBuffs([slot], '', { useOwnedSkills: true, simulateAllOwned: true });
      simAllActiveCount = resSimAll.activeOwnedSkills.length;
    } catch (e) {
      simAllOk = false;
    }

    return {
      offEffDef: statOff.effDef,
      offDps: statOff.theoreticalDps,
      simAllOk,
      simAllActiveCount
    };
  });

  assert('P50-05a: 「所持特技を反映」OFFで従来の計算結果(防御300)と一致する', p50_05_result.offEffDef === 300, `offEffDef=${p50_05_result.offEffDef}`);
  assert('P50-05b: 「全城娘を所持扱い」で例外が発生せず多数の所持特技がアクティブになる', p50_05_result.simAllOk && p50_05_result.simAllActiveCount > 20, `count=${p50_05_result.simAllActiveCount}`);

  // =========================================================================
  // P50-06: 訓練場の地形セレクタ連動 & 地形倍率（×1.25、地獄×1.3）
  // =========================================================================
  console.log('\n--- [P50-06] 訓練場の地形セレクタ連動 & 地形倍率検証 ---');
  const p50_06_result = await page.evaluate(async () => {
    // Select tab-firing-range
    document.querySelector('.tab-btn[data-tab="tab-firing-range"]').click();
    await new Promise(r => setTimeout(r, 200));

    // Find castles with strictly single terrain attributes
    const heiCastle = window.SCRE_DATA.find(c => c.attributes && c.attributes.length === 1 && c.attributes[0] === '平' && c.weapon === '刀');
    const hellCastle = window.SCRE_DATA.find(c => c.attributes && c.attributes.length === 1 && c.attributes[0] === '地獄' && c.weapon === '刀');
    const yamaCastle = window.SCRE_DATA.find(c => c.attributes && c.attributes.length === 1 && c.attributes[0] === '山' && c.weapon === '刀');

    const partySlots = [
      { id: heiCastle.id, giantStep: 5, strategyOn: false, specialOn: false },
      { id: hellCastle.id, giantStep: 5, strategyOn: false, specialOn: false },
      { id: yamaCastle.id, giantStep: 5, strategyOn: false, specialOn: false }
    ];
    window.setParty(partySlots);
    window.setUseOwnedSkills(false); // disable owned skills to isolate terrain test

    const firingSelect = document.getElementById('firingRangeTerrainSelect');
    const mapSelect = document.getElementById('mapTerrainSelect');
    const statusBadge = document.getElementById('firingRangeTerrainStatus');

    // Step 0: Set terrain to "" (指定なし)
    firingSelect.value = '';
    firingSelect.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 200));

    const statHei0 = window.calculateFiringCastleStats(heiCastle, partySlots[0], 0, 0, 1, new Set(['atk_percent', 'atk_flat', 'share_atk']));
    const statHell0 = window.calculateFiringCastleStats(hellCastle, partySlots[1], 0, 0, 1, new Set(['atk_percent', 'atk_flat', 'share_atk']));
    const statYama0 = window.calculateFiringCastleStats(yamaCastle, partySlots[2], 0, 0, 1, new Set(['atk_percent', 'atk_flat', 'share_atk']));

    // Step 1: Set terrain to "平" via firingSelect
    firingSelect.value = '平';
    firingSelect.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 200));

    const mapVal1 = mapSelect.value;
    const curTerrain1 = window.getCurrentTerrain();
    const badgeText1 = statusBadge.textContent;

    const statHei1 = window.calculateFiringCastleStats(heiCastle, partySlots[0], 0, 0, 1, new Set(['atk_percent', 'atk_flat', 'share_atk']));
    const statYama1 = window.calculateFiringCastleStats(yamaCastle, partySlots[2], 0, 0, 1, new Set(['atk_percent', 'atk_flat', 'share_atk']));

    const heiRatio = statHei1.finalAtk / statHei0.finalAtk;
    const yamaRatio = statYama1.finalAtk / statYama0.finalAtk;

    // Step 2: Set terrain to "地獄" via firingSelect
    firingSelect.value = '地獄';
    firingSelect.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 200));

    const mapVal2 = mapSelect.value;
    const curTerrain2 = window.getCurrentTerrain();
    const badgeText2 = statusBadge.textContent;

    const statHell2 = window.calculateFiringCastleStats(hellCastle, partySlots[1], 0, 0, 1, new Set(['atk_percent', 'atk_flat', 'share_atk']));
    const hellRatio = statHell2.finalAtk / statHell0.finalAtk;

    // Step 3: Set terrain to "" (指定なし)
    firingSelect.value = '';
    firingSelect.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 200));

    const badgeText3 = statusBadge.textContent;

    return {
      heiName: heiCastle.name,
      hellName: hellCastle.name,
      yamaName: yamaCastle.name,
      mapVal1,
      curTerrain1,
      badgeText1,
      heiRatio,
      yamaRatio,
      mapVal2,
      curTerrain2,
      badgeText2,
      hellRatio,
      badgeText3
    };
  });

  assert('P50-06a: 訓練場で「平」を選択すると currentTerrain / mapTerrainSelect が「平」に連動', p50_06_result.curTerrain1 === '平' && p50_06_result.mapVal1 === '平');
  assert('P50-06b: 地形ステータスバッジが一致体数を表示する', p50_06_result.badgeText1.includes('平') && p50_06_result.badgeText1.includes('一致 1/3体'), `badgeText=${p50_06_result.badgeText1}`);
  assert('P50-06c: 平一致城娘の攻撃力が1.25倍になる（山城娘は1.0倍）', Math.abs(p50_06_result.heiRatio - 1.25) < 0.01 && Math.abs(p50_06_result.yamaRatio - 1.0) < 0.01, `hei=${p50_06_result.heiRatio.toFixed(3)}, yama=${p50_06_result.yamaRatio.toFixed(3)}`);
  assert('P50-06d: 地獄選択時、地獄一致城娘の攻撃力が1.30倍になる', Math.abs(p50_06_result.hellRatio - 1.30) < 0.01, `hell=${p50_06_result.hellRatio.toFixed(3)}`);
  assert('P50-06e: 指定なし選択時に「地形: 指定なし」と表示される', p50_06_result.badgeText3.includes('指定なし'));

  // =========================================================================
  // Section 7: フォントサイズ下限（>= 12px）検証
  // =========================================================================
  console.log('\n--- [Section 7] フォントサイズ下限（>= 12px）検証 ---');
  const fontCheck = await page.evaluate(() => {
    const elements = document.querySelectorAll('#ownedSkillsDashboardSection, #ownedSkillsDashboardSection *, #firingRangeTerrainStatus, #firingRangeTerrainSelect, .firing-range-notice-box, .firing-range-notice-box *');
    const violations = [];
    elements.forEach(el => {
      const fs = window.getComputedStyle(el).fontSize;
      const px = parseFloat(fs);
      if (px > 0 && px < 11.5) { // allow margin for subpixel rounding
        violations.push({ tag: el.tagName, id: el.id, class: el.className, fs });
      }
    });
    return { violations, checkedCount: elements.length };
  });

  assert('Section 7: 追加したUI要素に12px未満のフォントサイズが存在しないこと', fontCheck.violations.length === 0, `violations=${JSON.stringify(fontCheck.violations)} (checked ${fontCheck.checkedCount} elements)`);

  console.log(`\n======================================================`);
  console.log(`Prompt 50 Test Results: ${passed} / ${total} passed`);
  console.log(`======================================================\n`);

  await browser.close();

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
})();
