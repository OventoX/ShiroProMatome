/**
 * test_prompt57.js
 * 
 * 城プロRE 第57弾 自動テストスイート
 * 第55弾レビュー指摘4件の修正（施設の負値効果・装備制限・旧セーブの固定武器・武器効果の未消費分）
 * 
 * - P57-01: 施設の負値効果（配気・初計短縮・再出撃短縮）の集計・表示・計算反映検証
 *   - 木祠（配気-2）単体装備で facilityCost = -2、配置気コスト表示と計算に反映されること
 *   - 木造鯱（初計-10%）単体装備で facilityStratInit = -10、初計短縮表示と初回計略タイミングに反映されること
 *   - 玄関ホール（再出撃-4%）単体装備で facilityRedeploy = -4、再出撃短縮「計算未反映（表示のみ）」が表示されること
 * - P57-02: 施設の地域制限および特殊制限（架空）の照合検証
 *   - 随神門（北海道・東北）が北海道・東北城娘のみ装備可、関東や近畿の城娘には装備不可となること
 *   - 冥界の門（架空）が実在城の城娘には装備不可、架空城娘には装備可となること
 *   - 施設モーダルの選択肢一覧にも装備制限が反映されること
 * - P57-03: 旧セーブ読込時の固定武器城娘へのデフォルト固定武器付与検証
 *   - weaponId が未設定（null / undefined）の旧セーブを読み込んでも固定武器城娘に武器が付与されること
 * - P57-04: 武器効果の未消費分（爆風範囲、射程+X%）の未反映フラグ検知と表示検証
 *   - 爆風範囲を持つ武器（散星[改]、南瓜王座砲[改]等）で hasUnmodeled = true となり「未反映の効果あり」が表示されること
 *   - 射程+X%を持つ武器（オーバー・ワールド[改]）で hasUnmodeled = true となり未反映表示されること
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
  console.log('=== Running Prompt 57 Automated Test Suite: Facilities Negatives, Restrictions, Fixed Weapons & Weapon Effects ===\n');

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
  // P57-01: 施設の負値効果（配気・初計短縮・再出撃短縮）検証
  // =========================================================================
  console.log('[P57-01: 施設の負値効果集計・表示・計算反映検証]...');
  const p57_01 = await page.evaluate(() => {
    const castle = window.SCRE_DATA.find(c => c.name === "名古屋城");
    const mokuShi = window.SCRE_FACILITIES.find(f => f.name === "木祠"); // cost: -2
    const shachi = window.SCRE_FACILITIES.find(f => f.name === "木造鯱"); // stratInit: -10
    const genkan = window.SCRE_FACILITIES.find(f => f.name === "玄関ホール"); // redeploy: -4

    // 1. 木祠単体装備
    const slotCost = { id: castle.id, giantStep: 5, strategyOn: true, specialOn: false, weaponId: null, facilityIds: [mokuShi.id] };
    const equipCost = window.__calculateEquipmentStats(slotCost, castle);

    window.setParty([slotCost]);
    window.setCurrentTerrain("");
    const buffsCost = window.calculateBuffs();
    const csCost = buffsCost.perCastle[castle.id].calculatedStats;

    // モーダルHTML生成
    window.__openEquipmentFacilityModal(0);
    const modalBody = document.getElementById("modalEquipBody");
    const modalCostText = modalBody ? modalBody.innerText : "";

    // 2. 木造鯱単体装備
    const slotStrat = { id: castle.id, giantStep: 5, strategyOn: true, specialOn: false, weaponId: null, facilityIds: [shachi.id] };
    const equipStrat = window.__calculateEquipmentStats(slotStrat, castle);

    window.setParty([slotStrat]);
    const buffsStrat = window.calculateBuffs();
    const csStrat = buffsStrat.perCastle[castle.id].calculatedStats;
    const firingStrat = window.calculateFiringCastleStats(castle, slotStrat, 0, 0, 1, new Set());

    window.__openEquipmentFacilityModal(0);
    const modalStratText = modalBody ? modalBody.innerText : "";

    // 3. 玄関ホール単体装備
    const slotRedeploy = { id: castle.id, giantStep: 5, strategyOn: true, specialOn: false, weaponId: null, facilityIds: [genkan.id] };
    const equipRedeploy = window.__calculateEquipmentStats(slotRedeploy, castle);

    window.setParty([slotRedeploy]);
    window.__openEquipmentFacilityModal(0);
    const modalRedeployText = modalBody ? modalBody.innerText : "";
    window.__closeEquipmentFacilityModal();

    return {
      baseCost: castle.cost || 10,
      equipCostVal: equipCost.facilityCost,
      calcDeployCost: csCost.deployCost,
      hasModalCostText: modalCostText.includes("配置気 -2"),
      equipStratVal: equipStrat.facilityStratInit,
      hasModalStratText: modalStratText.includes("初計短縮 -10%"),
      baseCooldown: castle.strategy.cooldown,
      calcInitialCooldown: csStrat.initialStratCooldown,
      firingInitialCooldown: firingStrat.strategyDamage?.initialCooldown,
      equipRedeployVal: equipRedeploy.facilityRedeploy,
      hasModalRedeployText: modalRedeployText.includes("再出撃短縮 -4%（計算未反映（表示のみ））")
    };
  });

  assert(
    'P57-01a: 木祠単体装備で配気-2が集計され、モーダルに「配置気 -2」と表示され、配置気コスト計算に反映されること',
    p57_01.equipCostVal === -2 &&
    p57_01.hasModalCostText === true &&
    p57_01.calcDeployCost === p57_01.baseCost - 2,
    `equipCost: ${p57_01.equipCostVal}, deployCost: ${p57_01.calcDeployCost} (base: ${p57_01.baseCost}), modal: ${p57_01.hasModalCostText}`
  );

  assert(
    'P57-01b: 木造鯱単体装備で初計-10%が集計され、モーダルに表示され、初回計略タイミング（30s -> 27s）に反映されること',
    p57_01.equipStratVal === -10 &&
    p57_01.hasModalStratText === true &&
    p57_01.calcInitialCooldown === 27 &&
    p57_01.firingInitialCooldown === 27,
    `equipStrat: ${p57_01.equipStratVal}, initCd: ${p57_01.calcInitialCooldown} (base: ${p57_01.baseCooldown}), modal: ${p57_01.hasModalStratText}`
  );

  assert(
    'P57-01c: 玄関ホール単体装備で再出撃-4%が集計され、モーダルに「再出撃短縮 -4%（計算未反映（表示のみ））」と表示されること',
    p57_01.equipRedeployVal === -4 &&
    p57_01.hasModalRedeployText === true,
    `equipRedeploy: ${p57_01.equipRedeployVal}, modalText: ${p57_01.hasModalRedeployText}`
  );

  // =========================================================================
  // P57-02: 施設の地域制限および特殊制限（架空）検証
  // =========================================================================
  console.log('\n[P57-02: 施設装備制限（地域・架空）検証]...');
  const p57_02 = await page.evaluate(() => {
    const zuishin = window.SCRE_FACILITIES.find(f => f.name === "随神門"); // regions: ["北海道・東北"]
    const meikai = window.SCRE_FACILITIES.find(f => f.name === "冥界の門"); // special: ["架空"]

    const hirosaki = window.SCRE_DATA.find(c => c.name === "弘前城"); // 青森県 (東北)
    const goryokaku = window.SCRE_DATA.find(c => c.name === "五稜郭"); // 北海道 (蝦夷)
    const edo = window.SCRE_DATA.find(c => c.name === "江戸城"); // 東京都 (関東)
    const osaka = window.SCRE_DATA.find(c => c.name === "大坂城"); // 大阪府 (近畿)
    const nagoya = window.SCRE_DATA.find(c => c.name === "名古屋城"); // 愛知県 (東海, 実在城)

    const camelot = window.SCRE_DATA.find(c => c.name === "キャメロット城"); // 架空城
    const ryugu = window.SCRE_DATA.find(c => c.name === "竜宮城"); // 架空城

    // 随神門（北海道・東北制限）
    const zuishinHirosaki = window.__isFacilityUsableByCastle(zuishin, hirosaki);
    const zuishinGoryokaku = window.__isFacilityUsableByCastle(zuishin, goryokaku);
    const zuishinEdo = window.__isFacilityUsableByCastle(zuishin, edo);
    const zuishinOsaka = window.__isFacilityUsableByCastle(zuishin, osaka);

    // 冥界の門（架空制限）
    const meikaiNagoya = window.__isFacilityUsableByCastle(meikai, nagoya);
    const meikaiOsaka = window.__isFacilityUsableByCastle(meikai, osaka);
    const meikaiCamelot = window.__isFacilityUsableByCastle(meikai, camelot);
    const meikaiRyugu = window.__isFacilityUsableByCastle(meikai, ryugu);

    // モーダル選択肢一覧での検証
    const edoFacs = window.__getAvailableFacilitiesForCastle(edo);
    const hirosakiFacs = window.__getAvailableFacilitiesForCastle(hirosaki);
    const nagoyaFacs = window.__getAvailableFacilitiesForCastle(nagoya);
    const camelotFacs = window.__getAvailableFacilitiesForCastle(camelot);

    return {
      zuishinHirosaki,
      zuishinGoryokaku,
      zuishinEdo,
      zuishinOsaka,
      meikaiNagoya,
      meikaiOsaka,
      meikaiCamelot,
      meikaiRyugu,
      edoHasZuishin: edoFacs.some(f => f.name === "随神門"),
      hirosakiHasZuishin: hirosakiFacs.some(f => f.name === "随神門"),
      nagoyaHasMeikai: nagoyaFacs.some(f => f.name === "冥界の門"),
      camelotHasMeikai: camelotFacs.some(f => f.name === "冥界の門")
    };
  });

  assert(
    'P57-02a: 随神門（地域: 北海道・東北）が北海道・東北以外の城娘には装備不可、北海道・東北城娘には装備可となること',
    p57_02.zuishinHirosaki === true &&
    p57_02.zuishinGoryokaku === true &&
    p57_02.zuishinEdo === false &&
    p57_02.zuishinOsaka === false &&
    p57_02.edoHasZuishin === false &&
    p57_02.hirosakiHasZuishin === true,
    `hirosaki: ${p57_02.zuishinHirosaki}, goryokaku: ${p57_02.zuishinGoryokaku}, edo: ${p57_02.zuishinEdo}, osaka: ${p57_02.zuishinOsaka}`
  );

  assert(
    'P57-02b: 冥界の門（特殊: 架空）が実在城の城娘には装備不可、架空城娘には装備可となること',
    p57_02.meikaiNagoya === false &&
    p57_02.meikaiOsaka === false &&
    p57_02.meikaiCamelot === true &&
    p57_02.meikaiRyugu === true &&
    p57_02.nagoyaHasMeikai === false &&
    p57_02.camelotHasMeikai === true,
    `nagoya: ${p57_02.meikaiNagoya}, osaka: ${p57_02.meikaiOsaka}, camelot: ${p57_02.meikaiCamelot}, ryugu: ${p57_02.meikaiRyugu}`
  );

  // =========================================================================
  // P57-03: 旧セーブ読込時の固定武器城娘へのデフォルト固定武器付与検証
  // =========================================================================
  console.log('\n[P57-03: 旧セーブ読込時の固定武器付与検証]...');
  const p57_03 = await page.evaluate(() => {
    // 歌舞城娘（大坂城）および鈴城娘（指月伏見城）
    const osaka = window.SCRE_DATA.find(c => c.name === "大坂城" && c.weapon === "歌舞");
    const shizuki = window.SCRE_DATA.find(c => c.name === "指月伏見城" && c.weapon === "鈴");

    // 旧形式セーブデータ（weaponId なし）
    const oldPartyRaw = [
      { id: osaka.id, giantStep: 5, strategyOn: true },
      { id: shizuki.id, giantStep: 5, strategyOn: true, weaponId: null }
    ];

    window.setParty(oldPartyRaw);
    const currentParty = window.getParty ? window.getParty() : [];

    const slot0 = currentParty[0];
    const slot1 = currentParty[1];

    const equip0 = window.__calculateEquipmentStats(slot0, osaka);
    const equip1 = window.__calculateEquipmentStats(slot1, shizuki);

    return {
      slot0WeaponId: slot0?.weaponId,
      slot1WeaponId: slot1?.weaponId,
      equip0WeaponName: equip0.weapon?.name,
      equip0WeaponAtk: equip0.weaponAtk,
      equip1WeaponName: equip1.weapon?.name,
      equip1WeaponAtk: equip1.weaponAtk
    };
  });

  assert(
    'P57-03: weaponId 未設定の旧セーブを読み込んでも固定武器城娘にデフォルト固定武器が付与されること',
    p57_03.equip0WeaponName !== null &&
    p57_03.equip0WeaponAtk > 0 &&
    p57_03.equip1WeaponName !== null &&
    p57_03.equip1WeaponAtk > 0,
    `osaka: [${p57_03.equip0WeaponName}] (+${p57_03.equip0WeaponAtk}), shizuki: [${p57_03.equip1WeaponName}] (+${p57_03.equip1WeaponAtk})`
  );

  // =========================================================================
  // P57-04: 武器効果の未消費分（爆風範囲、射程+X%）の未反映フラグ検知と表示検証
  // =========================================================================
  console.log('\n[P57-04: 武器効果のパース済み未消費分検知と表示検証]...');
  const p57_04 = await page.evaluate(() => {
    const wBlast1 = window.SCRE_WEAPONS.find(w => w.name === "散星[改]"); // 爆風範囲+10%
    const wBlast2 = window.SCRE_WEAPONS.find(w => w.name === "南瓜王座砲[改]"); // 爆風範囲+20% 爆風ダメージ+10%
    const wRangePerc = window.SCRE_WEAPONS.find(w => w.name === "オーバー・ワールド[改]"); // 配置時10秒間射程+50%
    const wFullyParsed = window.SCRE_WEAPONS.find(w => w.name === "桜花爛漫刀[改]"); // 攻撃速度+25% 射程+15 (完全パース)

    const parseBlast1 = window.__parseWeaponEffect(wBlast1);
    const parseBlast2 = window.__parseWeaponEffect(wBlast2);
    const parseRangePerc = window.__parseWeaponEffect(wRangePerc);
    const parseFull = window.__parseWeaponEffect(wFullyParsed);

    const cannonCastle = window.SCRE_DATA.find(c => c.weapon === "大砲");
    const statBlast = window.calculateFiringCastleStats(cannonCastle, { giantStep: 5, strategyOn: true, specialOn: true, weaponId: wBlast1.name }, 0, 0, 1, new Set());

    return {
      blast1Unmodeled: parseBlast1.hasUnmodeled,
      blast1Range: parseBlast1.blastRange,
      blast2Unmodeled: parseBlast2.hasUnmodeled,
      rangePercUnmodeled: parseRangePerc.hasUnmodeled,
      fullUnmodeled: parseFull.hasUnmodeled,
      hasBreakdownNotice: statBlast.breakdownText.includes("未反映の効果あり"),
      hasUnreflectedFlag: statBlast.unreflectedCheck?.hasUnreflected === true
    };
  });

  assert(
    'P57-04: 爆風範囲および時限射程+X%を持つ武器で hasUnmodeled = true となり、訓練場内訳および未反映フラグに反映されること',
    p57_04.blast1Unmodeled === true &&
    p57_04.blast1Range === 0.1 &&
    p57_04.blast2Unmodeled === true &&
    p57_04.rangePercUnmodeled === true &&
    p57_04.fullUnmodeled === false &&
    p57_04.hasBreakdownNotice === true &&
    p57_04.hasUnreflectedFlag === true,
    `blast1: ${p57_04.blast1Unmodeled}, blast2: ${p57_04.blast2Unmodeled}, rangePerc: ${p57_04.rangePercUnmodeled}, full: ${p57_04.fullUnmodeled}, breakdown: ${p57_04.hasBreakdownNotice}`
  );

  // =========================================================================
  // UIフォントサイズ下限（>= 12px）検証
  // =========================================================================
  console.log('\n[UIフォントサイズ検証: 12px下限]...');
  const fontCheck = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('.party-equip-control, .party-equip-control *, #modalEquipmentConfig, #modalEquipmentConfig *'));
    const violations = [];
    elements.forEach(el => {
      if (el.classList.contains('type-tag') || el.closest('.weapon-icon-badge')) return;
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
    return violations;
  });

  assert(
    'フォントサイズ下限（>= 12px）: 新設・更新された装備UIおよび施設モーダルに12px未満のフォントが存在しないこと',
    fontCheck.length === 0,
    `violations: ${JSON.stringify(fontCheck.slice(0, 3))}`
  );

  console.log('\n==============================================');
  console.log(`PROMPT 57 AUTOMATED TESTS SUMMARY: ${failedTests === 0 ? 'ALL PASSED' : 'SOME FAILED'}`);
  console.log(`PASSED: ${passedTests} / ${passedTests + failedTests}`);
  console.log('==============================================');

  await browser.close();

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
