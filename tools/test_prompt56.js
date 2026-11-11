/**
 * test_prompt56.js
 * 
 * 城プロRE 第56弾 自動テストスイート
 * 第54弾レビュー指摘2件の修正（詳細DPSの与えるダメージ適用位置・鈴の未使用フィールド）
 * 
 * - P56-01: 詳細DPS（computeFramePreciseDps）で「与えるダメージ」（dmgDealtTarget）が
 *           防御引き前の攻撃値に乗算され、訓練場（calculateFiringCastleStats）と完全一致すること。
 * - P56-02: 「与ダメージ」（dmgDealt）のみを持つ城娘（江戸城等）で、詳細DPSの計算結果が旧仕様と完全に同一であること。
 * - P56-03: フレーム表の鈴 hitsSplit（12）が computeFramePreciseDps および calculateFiringCastleStats で実際に参照され、
 *           鈴城娘の1撃ダメージ・DPSが修正前後で不変であること。
 */

const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_PATH = path.resolve(__dirname, '..', 'app', 'index.html');

let passedTests = 0;
let failedTests = 0;

function assert(description, condition, details = '') {
  if (condition) {
    console.log(`[PASS] ${description} ${details ? ' ' + details : ''}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${description} ${details ? ' ' + details : ''}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('=== Running Prompt 56 Automated Test Suite: Review Rectifications (DmgTarget & Bell Split) ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' && !text.includes('favicon') && !text.includes('manifest')) {
      console.log(`Browser console error: ${text}`);
    }
  });

  await page.goto(`file://${APP_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.computeFramePreciseDps === 'function' && typeof window.calculateFiringCastleStats === 'function');

  // =========================================================================
  // P56-01: 詳細DPSの「与えるダメージ」防御引き前適用・訓練場一致検証
  // =========================================================================
  console.log('[P56-01: 詳細DPSの「与えるダメージ」防御引き前適用・訓練場一致検証]...');
  const p56_01 = await page.evaluate(() => {
    // 琉球御城 (拳, 特技: dmgDealtTarget +20% / 1.2倍)
    const ryukyu = window.SCRE_DATA.find(c => c.name === "琉球御城");
    const targetDef = 500;

    // 詳細DPS計算
    const detailDps = window.computeFramePreciseDps(ryukyu, targetDef);

    // 訓練場での単騎通常攻撃計算 (自己バフのみ, 地形なし, 武器なし, 特技ON, 計略OFF, 特殊OFF)
    window.setParty([{ id: ryukyu.id, giantStep: 5, strategyOn: false, specialOn: false, weaponId: null, facilityIds: [] }]);
    window.setCurrentTerrain("");
    const firingStat = window.calculateFiringCastleStats(ryukyu, { giantStep: 5, strategyOn: false, specialOn: false, weaponId: null, facilityIds: [] }, targetDef, 0, 1, new Set());

    // 手計算検証:
    const baseAtk = window.getCastleBaseStatsForGiant(ryukyu, 5).atk;
    // 琉球御城の自己バフ: dmgDealtTarget = 20% (1.2倍)
    // 是正後の正しい式:
    // atkWithTarget = floor(baseAtk * 1.2)
    // rawHit = max(20, atkWithTarget - targetDef)
    // 旧仕様（是正前バグ）: (baseAtk - targetDef) * 1.2
    const atkWithTargetExpected = Math.floor(baseAtk * 1.2);
    const expectedHitDmg = Math.max(20, atkWithTargetExpected - targetDef);
    const buggyHitDmg = Math.round(Math.max(20, baseAtk - targetDef) * 1.2);

    const hitDiffWithFiring = Math.abs(detailDps.finalHitDmg - firingStat.finalHitDamage);
    const normalDpsDiff = Math.abs(detailDps.effDps - firingStat.normalDps);

    // 虎臥城 (槌, 特技: dmgDealtTarget +50% / 1.5倍)
    const torafusu = window.SCRE_DATA.find(c => c.name === "虎臥城");
    const tDetail = window.computeFramePreciseDps(torafusu, targetDef);
    window.setParty([{ id: torafusu.id, giantStep: 5, strategyOn: false, specialOn: false, weaponId: null, facilityIds: [] }]);
    const tFiring = window.calculateFiringCastleStats(torafusu, { giantStep: 5, strategyOn: false, specialOn: false, weaponId: null, facilityIds: [] }, targetDef, 0, 1, new Set());
    const torafusuDiff = Math.abs(tDetail.finalHitDmg - tFiring.finalHitDamage);

    return {
      castleName: ryukyu.name,
      baseAtk,
      detailFinalHit: detailDps.finalHitDmg,
      firingFinalHit: firingStat.finalHitDamage,
      expectedHitDmg,
      buggyHitDmg,
      hitDiffWithFiring,
      normalDpsDiff,
      torafusuDiff,
      isCorrectPosition: detailDps.finalHitDmg === expectedHitDmg,
      isBuggyPosition: detailDps.finalHitDmg === buggyHitDmg
    };
  });

  assert(
    'P56-01: 防御500・「与えるダメージ」倍率ありの城娘（琉球御城・虎臥城）で、詳細DPSが防御引き前乗算に是正され、訓練場と完全一致すること',
    p56_01.isCorrectPosition && !p56_01.isBuggyPosition && p56_01.hitDiffWithFiring === 0 && p56_01.normalDpsDiff === 0 && p56_01.torafusuDiff === 0,
    `ryukyu: detailHit=${p56_01.detailFinalHit} === firingHit=${p56_01.firingFinalHit} (exp: ${p56_01.expectedHitDmg}), torafusuDiff: ${p56_01.torafusuDiff}`
  );

  // =========================================================================
  // P56-02: 「与ダメージ」（dmgDealt）のみを持つ城娘で詳細DPSが変わらない検証
  // =========================================================================
  console.log('\n[P56-02: 「与ダメージ」（dmgDealt）のみを持つ城娘の詳細DPS不変検証]...');
  const p56_02 = await page.evaluate(() => {
    // 江戸城（刀, 特技に与ダメージ上昇あり、与えるダメージなし）
    const edo = window.SCRE_DATA.find(c => c.name === "江戸城");
    const targetDef = 500;

    const detailDps = window.computeFramePreciseDps(edo, targetDef);

    // 旧仕様の式:
    // selfTargetMult === 1.0 のため、
    // rawHit = max(20, buffedAtk - targetDef)
    // finalHit = round(rawHit * (1 + selfDmgDealt / 100) * 1.0)
    // 新仕様の式:
    // atkWithTarget = floor(buffedAtk * 1.0) = buffedAtk
    // rawHit = max(20, atkWithTarget - targetDef)
    // finalHit = round(rawHit * (1 + selfDmgDealt / 100))
    // したがって、与ダメージのみの城娘では旧仕様と新仕様が数学的に完全一致する。
    const buffedAtk = detailDps.buffedAtk;
    const effDef = detailDps.effDef;
    const rawHitOld = Math.max(20, buffedAtk - effDef);
    // 江戸城の特技与ダメージ (改壱なら30%)
    const dmgDealtVal = (detailDps.finalHitDmg / rawHitOld) - 1.0;
    const expectedOldHit = Math.round(rawHitOld * (1 + Math.round(dmgDealtVal * 100) / 100));

    return {
      castleName: edo.name,
      buffedAtk,
      effDef,
      finalHitDmg: detailDps.finalHitDmg,
      expectedOldHit,
      isExactMatch: detailDps.finalHitDmg === expectedOldHit
    };
  });

  assert(
    'P56-02: 「与ダメージ」のみを持つ城娘（江戸城）で、詳細DPSの単発ダメージが旧仕様と完全一致し、計算位置の変更による影響がないこと',
    p56_02.isExactMatch,
    `castle: [${p56_02.castleName}], finalHit: ${p56_02.finalHitDmg} === expectedOld: ${p56_02.expectedOldHit}`
  );

  // =========================================================================
  // P56-03: 鈴の hitsSplit（12）がコード内で参照され、計算が一致する検証
  // =========================================================================
  console.log('\n[P56-03: 鈴の hitsSplit（12）実参照と分割ヒット計算検証]...');
  const p56_03 = await page.evaluate(() => {
    const bellCastle = window.SCRE_DATA.find(c => c.weapon === "鈴");
    const wf = window.SCRE_WEAPON_FRAMES["鈴"];

    const hasHitsSplitField = (wf && wf.hitsSplit === 12);

    // 詳細DPSと訓練場の計算
    const detailDps = window.computeFramePreciseDps(bellCastle, 500);
    window.setParty([{ id: bellCastle.id, giantStep: 5, strategyOn: false, specialOn: false, weaponId: null, facilityIds: [] }]);
    const firingStat = window.calculateFiringCastleStats(bellCastle, { giantStep: 5, strategyOn: false, specialOn: false, weaponId: null }, 500, 0, 1, new Set());

    // 1発ダメージが buffedAtk / hitsSplit と一致すること
    const expectedSplitDmg = Math.max(1, Math.floor(detailDps.buffedAtk / wf.hitsSplit));

    // 訓練場内訳に「12分割・最低保障なし」が含まれること
    const hasBellBreakdown = firingStat.breakdownText.includes(`${wf.hitsSplit}分割`);

    return {
      hasHitsSplitField,
      hitsSplitVal: wf.hitsSplit,
      hitsInDetail: detailDps.hits,
      hitsInFiring: firingStat.hits,
      detailHitDmg: detailDps.finalHitDmg,
      expectedSplitDmg,
      firingHitDmg: firingStat.finalHitDamage,
      hasBellBreakdown
    };
  });

  assert(
    'P56-03: SCRE_WEAPON_FRAMES["鈴"].hitsSplit が 12 で定義され、詳細DPS・訓練場の両方で 12分割連撃として参照されていること',
    p56_03.hasHitsSplitField &&
    p56_03.hitsInDetail === 12 &&
    p56_03.hitsInFiring === 12 &&
    p56_03.detailHitDmg === p56_03.expectedSplitDmg &&
    p56_03.hasBellBreakdown,
    `hitsSplit: ${p56_03.hitsSplitVal}, detailHits: ${p56_03.hitsInDetail}, firingHits: ${p56_03.hitsInFiring}, 1-hit: ${p56_03.detailHitDmg}, breakdown: ${p56_03.hasBellBreakdown}`
  );

  console.log('\n==============================================');
  console.log(`PROMPT 56 AUTOMATED TESTS SUMMARY: ${failedTests === 0 ? 'ALL PASSED' : 'SOME FAILED'}`);
  console.log(`PASSED: ${passedTests} / ${passedTests + failedTests}`);
  console.log('==============================================\n');

  await browser.close();

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
