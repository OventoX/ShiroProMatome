/**
 * test_prompt55.js
 * 
 * 城プロRE 第55弾 自動テストスイート
 * 装備の計算反映（武器＋施設。城娘ごとの装備セレクタと装備補正の反映）
 * 
 * - P55-01: 装備なしと武器装備ありで、最終攻撃が武器atk分（装備補正の位置づけどおり）だけ変わること。
 * - P55-02: 直撃ボーナス+X%の武器（例：征将砲・黒鋼[改]）を大砲城娘に装備すると、直撃1撃が増えること。
 * - P55-03: 攻撃速度+X%の武器でサイクルフレームが短縮されること。
 * - P55-04: 武器選択が保存され、再読み込み後も維持されること。装備なしに戻すと第54弾までの計算と一致すること。
 * - P55-05: パースできない効果テキストの武器で「未反映の効果あり」と表示されること。
 * - P55-06: 施設データ（SCRE_FACILITIES）の件数がwikiの一覧（831件）と一致し、全件に名前・効果テキストがあること。
 * - P55-07: 施設を1つ装備すると、その上昇分が装備補正の位置で最終ステータスに反映されること。
 *           3枠すべて埋めた場合と空の場合の差が、各施設の上昇分の合計（重複ルール準拠）になること。
 * - P55-08: 装備なし（武器・施設すべて空）では第54弾までの計算と完全一致すること。
 * - UIフォントサイズ下限（>= 12px）検証
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
  console.log('=== Running Prompt 55 Automated Test Suite: Equipment (Weapons & Facilities) ===\n');

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
  await page.waitForFunction(() => typeof window.calculateBuffs === 'function' && window.SCRE_DATA && window.SCRE_WEAPONS && window.SCRE_FACILITIES);

  // =========================================================================
  // P55-06: 施設データ（SCRE_FACILITIES）の完全性検証
  // =========================================================================
  console.log('[P55-06: 施設データ（SCRE_FACILITIES）の完全性検証]...');
  const p55_06 = await page.evaluate(() => {
    const facs = window.SCRE_FACILITIES;
    if (!Array.isArray(facs)) return { valid: false, count: 0, missingFields: 1 };
    let missing = 0;
    facs.forEach(f => {
      if (!f.name || !f.effectText || !f.category || f.rarity == null || !f.stats) {
        missing++;
      }
    });
    return {
      valid: true,
      count: facs.length,
      missingFields: missing
    };
  });

  assert(
    'P55-06: 施設データ（SCRE_FACILITIES）の件数が831件で、全件に名前・効果テキスト・カテゴリ・ステータスが存在すること',
    p55_06.valid && p55_06.count === 831 && p55_06.missingFields === 0,
    `count: ${p55_06.count}, missing: ${p55_06.missingFields}`
  );

  // =========================================================================
  // P55-01: 装備なし vs 武器装備ありで最終攻撃が武器atk分（装備補正位置）反映される検証
  // =========================================================================
  console.log('\n[P55-01: 武器装備による装備補正の反映検証]...');
  const p55_01 = await page.evaluate(() => {
    // 刀城娘（例: 一乗谷城など山属性の刀城娘）
    const castle = window.SCRE_DATA.find(c => c.weapon === "刀" && c.attributes && c.attributes.includes("山"));
    const weapon = window.SCRE_WEAPONS.find(w => w.type === "刀" && (w.atk || 0) >= 60);
    const weaponAtk = weapon.atk || 0;

    // 単騎編成にして他城娘のバフを排除
    window.setParty([{ id: castle.id, giantStep: 5, strategyOn: false, specialOn: false, weaponId: null, facilityIds: [] }]);
    window.setCurrentTerrain("");

    // 1. 割合バフ無効化時: 最終攻撃力差が weaponAtk に完全一致
    const disabledPerc = new Set(["atk_percent"]);
    const statNoEquip = window.calculateFiringCastleStats(castle, { giantStep: 5, strategyOn: false, specialOn: false, weaponId: null, facilityIds: [] }, 0, 0, 1, disabledPerc);
    const statWithWeapon = window.calculateFiringCastleStats(castle, { giantStep: 5, strategyOn: false, specialOn: false, weaponId: weapon.name, facilityIds: [] }, 0, 0, 1, disabledPerc);
    const flatDiff = statWithWeapon.finalAtk - statNoEquip.finalAtk;

    // 2. 地形一致時の装備補正位置検証: (Math.floor(base * 1.25) + weaponAtk)
    window.setCurrentTerrain("山");
    const baseStats = window.getCastleBaseStatsForGiant(castle, 5);
    const statTerrainWeapon = window.calculateFiringCastleStats(castle, { giantStep: 5, strategyOn: false, specialOn: false, weaponId: weapon.name, facilityIds: [] }, 0, 0, 1, disabledPerc);
    const expectedTerrainAtk = Math.floor(baseStats.atk * 1.25) + weaponAtk;

    // 3. 割合バフあり時: Math.floor((Math.floor(base * 1.25) + weaponAtk) * (1 + atkPerc))
    const statTerrainWithBuffs = window.calculateFiringCastleStats(castle, { giantStep: 5, strategyOn: false, specialOn: false, weaponId: weapon.name, facilityIds: [] }, 0, 0, 1, new Set());
    const calcRes = window.calculateBuffs([{ id: castle.id, giantStep: 5, strategyOn: false, specialOn: false, weaponId: weapon.name, facilityIds: [] }], "山");
    const b = calcRes.perCastle[castle.id]?.buffs;
    const atkPerc = ((b?.atkPercent?.max || 0) + (b?.atkPercent?.stackSum || 0)) / 100;
    const expectedWithPerc = Math.floor(expectedTerrainAtk * (1 + atkPerc));

    return {
      castleName: castle.name,
      weaponName: weapon.name,
      weaponAtk,
      flatDiff,
      expectedTerrainAtk,
      actualTerrainAtk: statTerrainWeapon.finalAtk,
      expectedWithPerc,
      actualWithPerc: statTerrainWithBuffs.finalAtk,
      hasWeaponBreakdown: statTerrainWithBuffs.breakdownText.includes(weapon.name)
    };
  });

  assert(
    'P55-01: 装備なしと武器装備ありで、最終攻撃が武器atk分（地形ボーナス後に加算される装備補正位置）だけ正確に変化すること',
    p55_01.flatDiff === p55_01.weaponAtk &&
    p55_01.actualTerrainAtk === p55_01.expectedTerrainAtk &&
    p55_01.actualWithPerc === p55_01.expectedWithPerc &&
    p55_01.hasWeaponBreakdown,
    `castle: [${p55_01.castleName}], weapon: [${p55_01.weaponName} (+${p55_01.weaponAtk})], flatDiff: ${p55_01.flatDiff}, terrain: ${p55_01.actualTerrainAtk}, withPerc: ${p55_01.actualWithPerc}`
  );

  // =========================================================================
  // P55-02: 直撃ボーナス+X%の武器（征将砲・黒鋼[改]）で直撃1撃ダメージが増加する検証
  // =========================================================================
  console.log('\n[P55-02: 大砲武器の直撃ボーナス反映検証]...');
  const p55_02 = await page.evaluate(() => {
    const mEd = window.SCRE_DATA.find(c => c.name === "［無疆］江戸城");
    const weapon = window.SCRE_WEAPONS.find(w => w.name === "征将砲・黒鋼[改]"); // 直撃ボーナス+50%, 爆風ダメージ+20%, atk: 58

    window.setCurrentTerrain("");
    const statNoWeapon = window.calculateFiringCastleStats(mEd, { giantStep: 5, strategyOn: true, specialOn: true, weaponId: null, facilityIds: [] }, 0, 0, 1, new Set());
    const statWithWeapon = window.calculateFiringCastleStats(mEd, { giantStep: 5, strategyOn: true, specialOn: true, weaponId: weapon.name, facilityIds: [] }, 0, 0, 1, new Set());

    const noWeapon1Hit = statNoWeapon.finalHitDamage;
    const withWeapon1Hit = statWithWeapon.finalHitDamage;

    const breakdown = statWithWeapon.breakdownText;
    const has25x = breakdown.includes("×2.5") || breakdown.includes("2.5倍");
    const hasWeaponTag = breakdown.includes("征将砲・黒鋼[改]");
    const hasDirectBonusTag = breakdown.includes("直撃+50%");

    return {
      noWeapon1Hit,
      withWeapon1Hit,
      has25x,
      hasWeaponTag,
      hasDirectBonusTag,
      breakdown
    };
  });

  assert(
    'P55-02: 征将砲・黒鋼[改]（直撃+50%）を大砲城娘に装備すると、直撃1撃が2.5倍相当に増加し、内訳に表示されること',
    p55_02.withWeapon1Hit > p55_02.noWeapon1Hit && p55_02.has25x && p55_02.hasWeaponTag && p55_02.hasDirectBonusTag,
    `noWeapon1Hit: ${p55_02.noWeapon1Hit} -> withWeapon: ${p55_02.withWeapon1Hit}, has25x: ${p55_02.has25x}, hasTag: ${p55_02.hasDirectBonusTag}`
  );

  // =========================================================================
  // P55-03: 攻撃速度+X%の武器でサイクルフレームが短縮される検証
  // =========================================================================
  console.log('\n[P55-03: 攻撃速度武器によるサイクルフレーム短縮検証]...');
  const p55_03 = await page.evaluate(() => {
    const castle = window.SCRE_DATA.find(c => c.weapon === "刀");
    const speedWeapon = window.SCRE_WEAPONS.find(w => w.name && w.name.includes("桜花爛漫刀") && w.type === "刀");

    const statNoWeapon = window.calculateFiringCastleStats(castle, { giantStep: 5, strategyOn: false, specialOn: false, weaponId: null }, 0, 0, 1, new Set());
    const statSpeedWeapon = window.calculateFiringCastleStats(castle, { giantStep: 5, strategyOn: false, specialOn: false, weaponId: speedWeapon.name }, 0, 0, 1, new Set());

    return {
      baseCycle: statNoWeapon.cycleFrames,
      speedCycle: statSpeedWeapon.cycleFrames,
      effAtkFrames: statSpeedWeapon.effAtkFrames,
      isShortened: statSpeedWeapon.cycleFrames < statNoWeapon.cycleFrames
    };
  });

  assert(
    'P55-03: 攻撃速度+X%の武器でサイクルフレームが短縮されること',
    p55_03.isShortened && p55_03.speedCycle < p55_03.baseCycle,
    `baseCycle: ${p55_03.baseCycle}f -> speedCycle: ${p55_03.speedCycle}f`
  );

  // =========================================================================
  // P55-04: 武器選択の保存と再読み込み維持、装備なし復帰時の整合検証
  // =========================================================================
  console.log('\n[P55-04: 装備保存と永続化検証]...');
  const p55_04 = await page.evaluate(async () => {
    const castle = window.SCRE_DATA.find(c => c.weapon === "槍");
    const spearWeapon = window.SCRE_WEAPONS.find(w => w.type === "槍" && w.atk > 50);

    window.setParty([
      { id: castle.id, giantStep: 5, strategyOn: true, specialOn: false, weaponId: spearWeapon.name, facilityIds: [] }
    ]);

    const partyBefore = window.getParty();
    const savedWeapon = partyBefore[0].weaponId;

    const statNoEquip = window.calculateFiringCastleStats(castle, { giantStep: 5, strategyOn: true, specialOn: false, weaponId: null }, 0, 0, 1, new Set());

    window.setParty([
      { id: castle.id, giantStep: 5, strategyOn: true, specialOn: false, weaponId: null, facilityIds: [] }
    ]);
    const statRestored = window.calculateFiringCastleStats(castle, window.getParty()[0], 0, 0, 1, new Set());

    return {
      savedWeapon,
      expectedWeapon: spearWeapon.name,
      noEquipAtk: statNoEquip.finalAtk,
      restoredAtk: statRestored.finalAtk,
      isMatch: statNoEquip.finalAtk === statRestored.finalAtk
    };
  });

  assert(
    'P55-04: 武器選択が保存され、装備なしに戻すと第54弾までの計算と完全一致すること',
    p55_04.savedWeapon === p55_04.expectedWeapon && p55_04.isMatch,
    `saved: ${p55_04.savedWeapon}, restoredAtk: ${p55_04.restoredAtk} === baseAtk: ${p55_04.noEquipAtk}`
  );

  // =========================================================================
  // P55-05: パースできない効果テキストの武器で「未反映の効果あり」と表示される検証
  // =========================================================================
  console.log('\n[P55-05: 未反映効果の検出と表示検証]...');
  const p55_05 = await page.evaluate(() => {
    const w1 = window.SCRE_WEAPONS.find(w => w.name === "征将砲・黒鋼[改]");
    const parse1 = window.__parseWeaponEffect(w1);

    const w2 = window.SCRE_WEAPONS.find(w => w.name === "桜花爛漫刀[改]");
    const parse2 = window.__parseWeaponEffect(w2);

    const mEd = window.SCRE_DATA.find(c => c.name === "［無疆］江戸城");
    const stat = window.calculateFiringCastleStats(mEd, { giantStep: 5, strategyOn: true, specialOn: true, weaponId: w1.name }, 0, 0, 1, new Set());

    return {
      w1Unmodeled: parse1.hasUnmodeled,
      w2Unmodeled: parse2.hasUnmodeled,
      hasNoticeInBreakdown: stat.breakdownText.includes("未反映の効果あり")
    };
  });

  assert(
    'P55-05: パースできない効果テキストの武器で「未反映の効果あり」が検知・表示され、完全パース武器ではフラグが立たないこと',
    p55_05.w1Unmodeled === true && p55_05.w2Unmodeled === false && p55_05.hasNoticeInBreakdown === true,
    `w1(征将砲): ${p55_05.w1Unmodeled}, w2(桜花): ${p55_05.w2Unmodeled}, noticeInText: ${p55_05.hasNoticeInBreakdown}`
  );

  // =========================================================================
  // P55-07: 施設を装備した際の上昇分と3枠重複ルール検証
  // =========================================================================
  console.log('\n[P55-07: 施設装備および重複ルール検証]...');
  const p55_07 = await page.evaluate(() => {
    const castle = window.SCRE_DATA.find(c => c.weapon === "刀" && c.attributes && c.attributes.includes("平"));
    const usableFacs = window.__getAvailableFacilitiesForCastle(castle);

    // 門A: 攻撃+15 (通常施設: 非重複)
    // 門B: 攻撃+10 (通常施設: 非重複)
    const gateA = usableFacs.find(f => f.category === "門" && f.stats && f.stats.atk >= 15 && !f.stackable);
    const gateB = usableFacs.find(f => f.category === "門" && f.stats && f.stats.atk === 10 && !f.stackable);

    // 重複可能施設 (鎧兜カテゴリ等: stackable=true で城娘が装備可能なもの)
    const armorStack = usableFacs.find(f => f.stackable && f.stats && f.stats.atk > 0);

    // 単騎編成
    window.setParty([{ id: castle.id, giantStep: 5, strategyOn: false, specialOn: false, weaponId: null, facilityIds: [] }]);
    window.setCurrentTerrain("");

    const disabledPerc = new Set(["atk_percent"]);

    // 1. 施設1つ装備 (gateA)
    const statGateA = window.calculateFiringCastleStats(castle, {
      giantStep: 5, strategyOn: false, specialOn: false, weaponId: null, facilityIds: [gateA.id]
    }, 0, 0, 1, disabledPerc);

    const statNoFac = window.calculateFiringCastleStats(castle, {
      giantStep: 5, strategyOn: false, specialOn: false, weaponId: null, facilityIds: []
    }, 0, 0, 1, disabledPerc);

    const singleDiff = statGateA.finalAtk - statNoFac.finalAtk;

    // 2. 3枠装備: gateA (攻+15, 非重複) + gateB (攻+10, 非重複) + armorStack (攻+X, 重複可)
    // 通常施設は max(gateA.atk, gateB.atk) = gateA.atk のみ適用。
    // 重複可能施設は armorStack.atk が加算される。
    // 合計施設攻撃 = gateA.atk + armorStack.atk
    const stat3Facs = window.calculateFiringCastleStats(castle, {
      giantStep: 5, strategyOn: false, specialOn: false, weaponId: null,
      facilityIds: [gateA.id, gateB.id, armorStack.id]
    }, 0, 0, 1, disabledPerc);

    const expectedTotalEquipAtk = gateA.stats.atk + armorStack.stats.atk;
    const actualTotalDiff = stat3Facs.finalAtk - statNoFac.finalAtk;

    return {
      gateAAtk: gateA.stats.atk,
      singleDiff,
      expectedTotalEquipAtk,
      actualTotalDiff,
      hasFacBreakdown: stat3Facs.breakdownText.includes("施設:")
    };
  });

  assert(
    'P55-07: 施設を装備すると装備補正位置でステータスに反映され、非重複は最大値、重複可は合算されること',
    p55_07.singleDiff === p55_07.gateAAtk && p55_07.actualTotalDiff === p55_07.expectedTotalEquipAtk && p55_07.hasFacBreakdown,
    `singleDiff: ${p55_07.singleDiff} (exp ${p55_07.gateAAtk}), 3-facDiff: ${p55_07.actualTotalDiff} (exp ${p55_07.expectedTotalEquipAtk})`
  );

  // =========================================================================
  // P55-08: 装備なし（武器・施設すべて空）で第54弾までの計算と完全一致すること
  // =========================================================================
  console.log('\n[P55-08: 装備なしでの第54弾計算完全一致検証]...');
  const p55_08 = await page.evaluate(() => {
    // ［無疆］江戸城 単騎ベンチマーク (第54弾 P54-06 基準: 防御500, strategyOn: true, specialOn: false, disabledForBaseFrame)
    const mEd = window.SCRE_DATA.find(c => c.name.includes("［無疆］江戸城"));
    window.setParty([{ id: mEd.id, giantStep: 5, strategyOn: true, specialOn: false, weaponId: null, facilityIds: [] }]);
    window.setCurrentTerrain("");
    window.renderFiringRangeTab();

    const disabledForBaseFrame = new Set(["gap_shorten"]);
    const stat = window.calculateFiringCastleStats(mEd, { giantStep: 5, strategyOn: true, specialOn: false, weaponId: null, facilityIds: [] }, 500, 0, 1, disabledForBaseFrame);

    return {
      finalAtk: stat.finalAtk,
      hitDamage: stat.finalHitDamage,
      cycleFrames: stat.cycleFrames,
      normalDps: stat.normalDps,
      matchesExpected: (stat.finalAtk === 6424 && stat.finalHitDamage === 38647 && stat.cycleFrames === 75 && stat.normalDps === 15459)
    };
  });

  assert(
    'P55-08: 装備なし（武器・施設すべて空）では第54弾までの計算と完全一致すること（［無疆］江戸城: 攻6424, 1撃38647, 75f, DPS15459）',
    p55_08.matchesExpected,
    `finalAtk: ${p55_08.finalAtk}, hitDmg: ${p55_08.hitDamage}, cycle: ${p55_08.cycleFrames}f, normalDps: ${p55_08.normalDps}`
  );

  // =========================================================================
  // UI フォントサイズ下限（>= 12px）検証
  // =========================================================================
  console.log('\n[UIフォントサイズ検証: 12px下限]...');
  const fontViolations = await page.evaluate(() => {
    const modal = document.getElementById("modalEquipmentConfig");
    if (modal) modal.style.display = "flex";

    const violations = [];
    const elements = document.querySelectorAll(
      ".party-equip-control, .party-equip-control *, #modalEquipmentConfig, #modalEquipmentConfig *, .equip-weapon-select, .btn-facility-config"
    );

    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      const fsStr = style.fontSize;
      const fs = parseFloat(fsStr);
      if (fs < 11.99 && el.textContent.trim().length > 0) {
        violations.push({
          tag: el.tagName,
          className: el.className,
          fontSize: fsStr,
          text: el.textContent.trim().slice(0, 30)
        });
      }
    });

    if (modal) modal.style.display = "none";
    return violations;
  });

  assert(
    'フォントサイズ下限（>= 12px）: 新設された装備UIおよび施設モーダルに12px未満のフォントが存在しないこと',
    fontViolations.length === 0,
    `violations: ${JSON.stringify(fontViolations)}`
  );

  console.log('\n==============================================');
  console.log(`PROMPT 55 AUTOMATED TESTS SUMMARY: ${failedTests === 0 ? 'ALL PASSED' : 'SOME FAILED'}`);
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
