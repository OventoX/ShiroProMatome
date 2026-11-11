/**
 * tools/test_prompt58.js
 * Automated Verification Suite for Prompt 58:
 * 1. P58-01: ［無疆］江戸城 特殊能力「モード型」監査とベンチマーク検証
 *    - 通常直撃1撃 38,647 (第54弾ベンチマーク維持)
 *    - 特殊1コンボ 基本値 127,194 (通常時, DPS 2,120/s)
 *    - 特殊1コンボ 耐久80%以下時 152,629 (約152,634, DPS 2,544/s)
 *    - 射程1.3倍が特殊発動中のみ適用されること (698 -> 892)
 *    - 未反映チェックに耐久80%以下条件が注記されること
 * 2. P58-02: 特殊ON/OFF切り替えによる特殊DPS・実況累計の増減検証
 *    - 特殊ONで specialDamage / dps > 0、OFFで null / 0
 *    - 実況シミュレーションで特殊攻撃が加算されること
 * 3. P58-03: 地形一致バッジのツールチップ出撃地形切り替え検証
 *    - 出撃地形=地獄で「合戦ステータス1.3倍」
 *    - 出撃地形=平(または他通常地形)で「合戦ステータス1.25倍」
 *    - 出撃地形未指定時「合戦ステータス1.25倍」
 * 4. P58-04: UIフォントサイズ（>= 12px）検証
 */

const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HTML_PATH = 'file:///' + path.resolve(__dirname, '../app/index.html').replace(/\\/g, '/');

function assert(desc, condition, details = '') {
  if (condition) {
    console.log(`[PASS] ${desc}${details ? '  ' + details : ''}`);
  } else {
    console.error(`[FAIL] ${desc}${details ? '  ' + details : ''}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('=== Running Prompt 58 Automated Test Suite ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`Browser console error: ${msg.text()}`);
    }
  });

  await page.goto(HTML_PATH, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-container', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));

  // =========================================================================
  // P58-01: ［無疆］江戸城 特殊能力「モード型」監査とベンチマーク検証
  // =========================================================================
  console.log('[P58-01: ［無疆］江戸城 特殊能力「モード型」監査とベンチマーク検証]...');
  const p58_01 = await page.evaluate(() => {
    const cEdo = window.SCRE_DATA.find(c => c.name.includes('［無疆］江戸城'));
    window.setParty([{ id: cEdo.id, giantStep: 5, strategyOn: true, specialOn: false, weaponId: null, facilityIds: [] }]);
    window.setCurrentTerrain("");
    window.renderFiringRangeTab();

    // 1) 特殊OFF (第54弾ベンチマーク基準: 防御500の的)
    const statOff = window.calculateFiringCastleStats(cEdo, { giantStep: 5, strategyOn: true, specialOn: false, weaponId: null, facilityIds: [] }, 500, 0, 1, new Set());

    // 2) 特殊ON (モード発動中: 射程1.3倍, 防御無視, 4連撃+追撃2倍コンボ)
    window.setParty([{ id: cEdo.id, giantStep: 5, strategyOn: true, specialOn: true, weaponId: null, facilityIds: [] }]);
    const statOn = window.calculateFiringCastleStats(cEdo, { giantStep: 5, strategyOn: true, specialOn: true, weaponId: null, facilityIds: [] }, 500, 0, 1, new Set());

    // 3) 未反映チェック
    const unreflected = window.checkCastleUnreflectedEffects(cEdo, true, true);

    return {
      // 特殊OFF
      offAtk: statOff.finalAtk,
      offHitDamage: statOff.finalHitDamage,
      offRange: statOff.effectiveRange,
      offSpecial: statOff.specialDamage,
      // 特殊ON
      onAtk: statOn.finalAtk,
      onHitDamage: statOn.finalHitDamage,
      onRange: statOn.effectiveRange,
      onDefIgnore: statOn.effectiveIgnore,
      onSpecialDamage: statOn.specialDamage?.totalDamage,
      onSpecialDps: statOn.specialDamage?.dps,
      onSpecialUnder80: statOn.specialDamage?.totalDamageUnder80,
      onSpecialDpsUnder80: statOn.specialDamage?.dpsUnder80,
      breakdownText: statOn.breakdownText,
      // 未反映
      unreflectedReasons: unreflected.reasons
    };
  });

  // P58-01a: 特殊OFF時の通常直撃1撃が 38,647 (第54弾ベンチマーク) と完全一致すること
  assert(
    'P58-01a: 特殊OFF時の通常直撃1撃が38,647（第54弾ベンチマーク）と完全一致すること',
    p58_01.offHitDamage === 38647 && p58_01.offAtk === 6424 && p58_01.offSpecial === null,
    `offHitDamage: ${p58_01.offHitDamage} (exp 38647), offAtk: ${p58_01.offAtk}`
  );

  // P58-01b: 射程1.3倍が特殊発動中のみ適用され、特殊OFF時は適用されないこと
  assert(
    'P58-01b: 射程1.3倍が特殊発動中のみ適用されること（OFF時698 -> ON時892）',
    p58_01.offRange === 698 && p58_01.onRange === 892,
    `offRange: ${p58_01.offRange}, onRange: ${p58_01.onRange}`
  );

  // P58-01c: 特殊1コンボが通常時127,194（DPS 2,120/s）、80%以下時152,629（約152,634, DPS 2,544/s）となること
  assert(
    'P58-01c: 特殊1コンボが通常時127,194（DPS 2,120/s）、耐久80%以下時152,629（約152,634, DPS 2,544/s）となること',
    p58_01.onSpecialDamage === 127194 &&
    p58_01.onSpecialDps === 2120 &&
    p58_01.onSpecialUnder80 === 152629 &&
    p58_01.onSpecialDpsUnder80 === 2544,
    `totalDamage: ${p58_01.onSpecialDamage} (exp 127194), under80: ${p58_01.onSpecialUnder80} (exp 152629)`
  );

  // P58-01d: 内訳表示に特殊1コンボおよび耐久80%以下の表記が含まれること
  assert(
    'P58-01d: 訓練場内訳に特殊1コンボおよび「耐久80%以下の敵: 1コンボ約152,629」が含まれること',
    p58_01.breakdownText.includes('1回計127,194') && p58_01.breakdownText.includes('耐久80%以下の敵: 1コンボ約152,629'),
    `breakdownText: ${p58_01.breakdownText}`
  );

  // P58-01e: 未反映チェックに耐久80%以下条件が注記されること
  const hasUnreflectedUnder80 = p58_01.unreflectedReasons.some(r => r.includes('耐久80%以下'));
  assert(
    'P58-01e: 未反映チェックに「特殊能力: 耐久80%以下の敵に与えるダメージ1.2倍（通常時未反映・注記参照）」が含まれること',
    hasUnreflectedUnder80,
    `reasons: ${JSON.stringify(p58_01.unreflectedReasons)}`
  );

  // =========================================================================
  // P58-02: 特殊ON/OFF切り替えによる特殊DPS・実況累計の増減検証
  // =========================================================================
  console.log('\n[P58-02: 特殊ON/OFF切り替えによる特殊DPS・実況累計の増減検証]...');
  const p58_02 = await page.evaluate(async () => {
    const cEdo = window.SCRE_DATA.find(c => c.name.includes('［無疆］江戸城'));

    // 1) 特殊ONで実況試射
    window.setParty([{ id: cEdo.id, giantStep: 5, strategyOn: true, specialOn: true, weaponId: null, facilityIds: [] }]);
    window.renderFiringRangeTab();
    window.resetFiringSimulation();

    const stateOn = window.getFiringRangeState();
    stateOn.isInfiniteHp = true;
    stateOn.targetDef = 500;
    stateOn.targetRed = 0;
    stateOn.targetCount = 1;

    const statOn = window.calculateFiringCastleStats(cEdo, { giantStep: 5, strategyOn: true, specialOn: true, weaponId: null, facilityIds: [] }, 500, 0, 1, new Set());
    const onDps = statOn.specialDamage?.dps || 0;

    // Simulate 60 seconds
    window.stepFiringSimulation(60.0, 0.05);

    const totalDmgOn = stateOn.totalDamage;
    const specialDmgOn = stateOn.castleSlots[0]?.specialDmg || 0;
    const specialCountOn = stateOn.castleSlots[0]?.specialCount || 0;

    // 2) 特殊OFFで実況試射
    window.setParty([{ id: cEdo.id, giantStep: 5, strategyOn: true, specialOn: false, weaponId: null, facilityIds: [] }]);
    window.renderFiringRangeTab();
    window.resetFiringSimulation();

    const stateOff = window.getFiringRangeState();
    stateOff.isInfiniteHp = true;
    stateOff.targetDef = 500;
    stateOff.targetRed = 0;
    stateOff.targetCount = 1;

    const statOff = window.calculateFiringCastleStats(cEdo, { giantStep: 5, strategyOn: true, specialOn: false, weaponId: null, facilityIds: [] }, 500, 0, 1, new Set());
    const offDps = statOff.specialDamage?.dps || 0;

    window.stepFiringSimulation(60.0, 0.05);

    const totalDmgOff = stateOff.totalDamage;
    const specialDmgOff = stateOff.castleSlots[0]?.specialDmg || 0;
    const specialCountOff = stateOff.castleSlots[0]?.specialCount || 0;

    return {
      onDps,
      offDps,
      totalDmgOn,
      totalDmgOff,
      specialDmgOn,
      specialDmgOff,
      specialCountOn,
      specialCountOff
    };
  });

  assert(
    'P58-02a: 特殊ONで specialDamage.dps = 2,120、特殊OFFで 0 となること',
    p58_02.onDps === 2120 && p58_02.offDps === 0,
    `onDps: ${p58_02.onDps}, offDps: ${p58_02.offDps}`
  );

  assert(
    'P58-02b: 実況シミュレーションで特殊ON時に特殊ダメージ（127,194）が加算され、OFF時には加算されないこと',
    p58_02.specialCountOn >= 1 && p58_02.specialDmgOn === 127194 && p58_02.specialCountOff === 0 && p58_02.specialDmgOff === 0,
    `specialDmgOn: ${p58_02.specialDmgOn} (count: ${p58_02.specialCountOn}), specialDmgOff: ${p58_02.specialDmgOff} (count: ${p58_02.specialCountOff})`
  );

  assert(
    'P58-02c: 実況累計ダメージが特殊ON時 > 特殊OFF時となること',
    p58_02.totalDmgOn > p58_02.totalDmgOff,
    `totalDmgOn: ${p58_02.totalDmgOn}, totalDmgOff: ${p58_02.totalDmgOff}, diff: ${p58_02.totalDmgOn - p58_02.totalDmgOff}`
  );

  // =========================================================================
  // P58-03: 地形一致バッジのツールチップ出撃地形切り替え検証
  // =========================================================================
  console.log('\n[P58-03: 地形一致バッジのツールチップ出撃地形切り替え検証]...');
  const p58_03 = await page.evaluate(() => {
    // 1) 出撃地形＝地獄
    const cHell = window.SCRE_DATA.find(c => c.attributes && c.attributes.includes("地獄"));
    window.setCurrentTerrain("地獄");
    window.setParty([{ id: cHell.id, giantStep: 5, strategyOn: true, specialOn: false }]);
    window.renderDashboard();
    const badgeHell = document.querySelector(".party-card .badge[title*='出撃地形一致']");
    const titleHell = badgeHell ? badgeHell.getAttribute("title") : "";

    // 2) 出撃地形＝平
    const cPlain = window.SCRE_DATA.find(c => c.attributes && c.attributes.includes("平"));
    window.setCurrentTerrain("平");
    window.setParty([{ id: cPlain.id, giantStep: 5, strategyOn: true, specialOn: false }]);
    window.renderDashboard();
    const badgePlain = document.querySelector(".party-card .badge[title*='出撃地形一致']");
    const titlePlain = badgePlain ? badgePlain.getAttribute("title") : "";

    // 3) 出撃地形＝未指定 ("")
    window.setCurrentTerrain("");
    window.setParty([{ id: cPlain.id, giantStep: 5, strategyOn: true, specialOn: false }]);
    window.renderDashboard();
    const badgeNone = document.querySelector(".party-card .badge[title*='出撃地形一致']");

    return {
      titleHell,
      has13Hell: titleHell.includes("1.3倍"),
      titlePlain,
      has125Plain: titlePlain.includes("1.25倍"),
      badgeNoneExists: Boolean(badgeNone)
    };
  });

  assert(
    'P58-03a: 出撃地形＝地獄のとき、一致バッジのツールチップに「合戦ステータス1.3倍」が含まれること',
    p58_03.has13Hell === true,
    `titleHell: "${p58_03.titleHell}"`
  );

  assert(
    'P58-03b: 出撃地形＝平のとき、一致バッジのツールチップに「合戦ステータス1.25倍」が含まれること',
    p58_03.has125Plain === true,
    `titlePlain: "${p58_03.titlePlain}"`
  );

  assert(
    'P58-03c: 出撃地形＝未指定のときは一致バッジが表示されないこと',
    p58_03.badgeNoneExists === false,
    `badgeNoneExists: ${p58_03.badgeNoneExists}`
  );

  // =========================================================================
  // P58-04: UIフォントサイズ（>= 12px）検証
  // =========================================================================
  console.log('\n[P58-04: UIフォントサイズ（>= 12px）検証]...');
  const p58_04 = await page.evaluate(() => {
    // 新設・更新されたUI要素および装備UIを検査（既存の9.5pxバッジ類・サブインフォは除外）
    const elements = Array.from(document.querySelectorAll('.party-equip-control, .party-equip-control *, #modalEquipmentConfig, #modalEquipmentConfig *, .firing-note, .firing-note *'));
    const violations = [];
    elements.forEach(el => {
      if (el.classList.contains('badge') || el.classList.contains('challenge-violation-tag') || el.classList.contains('type-tag') || el.closest('.weapon-icon-badge')) return;
      const computed = window.getComputedStyle(el);
      const fs = parseFloat(computed.fontSize);
      if (fs < 11.9 && el.textContent.trim().length > 0 && computed.display !== 'none' && computed.visibility !== 'hidden') {
        violations.push({
          tag: el.tagName,
          class: el.className,
          fontSize: computed.fontSize,
          text: el.textContent.trim().slice(0, 30)
        });
      }
    });

    return { violations };
  });

  assert(
    'P58-04: 新設・更新されたUI要素に12px未満のフォントサイズが存在しないこと',
    p58_04.violations.length === 0,
    `violations: ${JSON.stringify(p58_04.violations.slice(0, 3))}`
  );

  console.log('\n==============================================');
  console.log('PROMPT 58 AUTOMATED TESTS SUMMARY');
  console.log('==============================================');

  await browser.close();
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
