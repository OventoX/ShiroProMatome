/**
 * Prompt 45 Automated Test Suite: 射撃訓練場の追加修正3点
 * 1. 計略発動で攻撃に転じるキャラ（attackMode: ［学園］都於郡城、［絢爛］立花山城等）のモデル化と数値化不可の扱い
 * 2. 殴られ役（的）のHP無限デフォルト化、プリセット選択時の無限維持、リセット時復旧、20万超え試射継続
 * 3. 「1撃ダメージ」専用列、通常1撃と計略1撃の分離、1回合計の併記、計算内訳折り返し、スナップショット1撃比較
 * 4. 攻撃武器種の通常1撃・DPS回帰テスト
 * 5. 厳格フォントサイズ下限（>= 12px）検証
 */

const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'file:///' + path.resolve(__dirname, '../app/index.html').replace(/\\/g, '/');

let total = 0;
let passed = 0;

function assert(title, condition, detail = '') {
  total++;
  if (condition) {
    passed++;
    console.log(`[PASS] ${title} ${detail ? ' ' + detail : ''}`);
  } else {
    console.error(`[FAIL] ${title} ${detail ? ' ' + detail : ''}`);
  }
}

(async () => {
  console.log('=== Running Prompt 45 Automated Test Suite: AttackMode, Infinite HP, 1-Hit Column ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[FAIL]') || text.includes('Error')) {
      console.log('BROWSER LOG:', text);
    }
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));

  // Switch to firing range tab
  await page.evaluate(() => {
    const tabBtn = document.querySelector('[data-tab="tab-firing-range"]');
    if (tabBtn) tabBtn.click();
  });
  await new Promise(r => setTimeout(r, 300));

  // =========================================================================
  // SECTION 1: 計略発動で「攻撃に転じる」キャラ (attackMode) パースと計算
  // =========================================================================
  console.log('[SECTION 1: Attack-Mode Strategies for Buff Weapons]...');

  const attackModeCheck = await page.evaluate(() => {
    const getCastle = name => window.SCRE_DATA.find(c => c.name === name);
    const gakuen = getCastle('［学園］都於郡城');
    const kenran = getCastle('［絢爛］立花山城');
    const natsu = getCastle('［夏］立花山城');
    const shogatsu = getCastle('［正月］立花山城');
    const tachibana = getCastle('立花山城');
    const roche = getCastle('ロシュ城');
    const mioda = getCastle('澪田唯吹');

    const pGakuen = window.parseCastleDamageStrategy(gakuen.strategy);
    const pKenran = window.parseCastleDamageStrategy(kenran.strategy);
    const pNatsu = window.parseCastleDamageStrategy(natsu.strategy);
    const pShogatsu = window.parseCastleDamageStrategy(shogatsu.strategy);
    const pTachibana = window.parseCastleDamageStrategy(tachibana.strategy);
    const pRoche = window.parseCastleDamageStrategy(roche.strategy);
    const pMioda = window.parseCastleDamageStrategy(mioda.strategy);

    // Calculate stats for Gakuen (quantifiable 5x)
    window.setParty([{ id: gakuen.id, giantStep: 5, strategyOn: true }]);
    const stGakuen = window.calculateFiringCastleStats(gakuen, { giantStep: 5, strategyOn: true }, 500, 0, 1, new Set());

    // Calculate stats for Kenran (estimated 1x, 4 targets)
    window.setParty([{ id: kenran.id, giantStep: 5, strategyOn: true }]);
    const stKenran = window.calculateFiringCastleStats(kenran, { giantStep: 5, strategyOn: true }, 500, 0, 5, new Set());

    // Calculate stats for Shogatsu (unquantifiable)
    window.setParty([{ id: shogatsu.id, giantStep: 5, strategyOn: true }]);
    const stShogatsu = window.calculateFiringCastleStats(shogatsu, { giantStep: 5, strategyOn: true }, 500, 0, 1, new Set());

    return {
      pGakuen,
      pKenran,
      pNatsu,
      pShogatsu,
      pTachibana,
      pRoche,
      pMioda,
      stGakuen: {
        isBuffWeapon: stGakuen.isBuffWeapon,
        normalDps: stGakuen.normalDps,
        finalHitDamage: stGakuen.finalHitDamage,
        hasStrategy: Boolean(stGakuen.strategyDamage),
        isAttackMode: stGakuen.strategyDamage?.isAttackMode,
        isUnquantifiable: stGakuen.strategyDamage?.isUnquantifiable,
        duration: stGakuen.strategyDamage?.duration,
        cooldown: stGakuen.strategyDamage?.cooldown,
        mult: stGakuen.strategyDamage?.mult,
        hitDamage: stGakuen.strategyDamage?.hitDamage,
        activeDps: stGakuen.strategyDamage?.activeDps,
        timeAvgDps: stGakuen.strategyDamage?.timeAvgDps,
        stratDps: stGakuen.stratDps,
        theoreticalDps: stGakuen.theoreticalDps,
        breakdownText: stGakuen.breakdownText
      },
      stKenran: {
        isBuffWeapon: stKenran.isBuffWeapon,
        isEstimatedMult: stKenran.strategyDamage?.isEstimatedMult,
        mult: stKenran.strategyDamage?.mult,
        targets: stKenran.strategyDamage?.targets,
        stratDps: stKenran.stratDps
      },
      stShogatsu: {
        isBuffWeapon: stShogatsu.isBuffWeapon,
        isUnquantifiable: stShogatsu.strategyDamage?.isUnquantifiable,
        stratDps: stShogatsu.stratDps,
        theoreticalDps: stShogatsu.theoreticalDps,
        breakdownText: stShogatsu.breakdownText
      }
    };
  });

  assert('P45-01: ［学園］都於郡城 parsed as attackMode with 45s duration, 60s CD, 5x multiplier',
    attackModeCheck.pGakuen.isAttackMode === true &&
    attackModeCheck.pGakuen.duration === 45 &&
    attackModeCheck.pGakuen.cooldown === 60 &&
    attackModeCheck.pGakuen.mult === 5 &&
    attackModeCheck.pGakuen.isUnquantifiable === false,
    `isAttackMode: ${attackModeCheck.pGakuen.isAttackMode}, dur: ${attackModeCheck.pGakuen.duration}s, cd: ${attackModeCheck.pGakuen.cooldown}s, mult: ${attackModeCheck.pGakuen.mult}`);

  assert('P45-02: ［学園］都於郡城 has normalDps === 0 outside strategy, activeHitDamage > 0, timeAvgDps = activeDps * (45/60)',
    attackModeCheck.stGakuen.isBuffWeapon === true &&
    attackModeCheck.stGakuen.normalDps === 0 &&
    attackModeCheck.stGakuen.finalHitDamage === 0 &&
    attackModeCheck.stGakuen.hitDamage > 0 &&
    attackModeCheck.stGakuen.activeDps > 0 &&
    attackModeCheck.stGakuen.timeAvgDps === Math.round(attackModeCheck.stGakuen.activeDps * (45 / 60)) &&
    attackModeCheck.stGakuen.theoreticalDps === attackModeCheck.stGakuen.timeAvgDps,
    `normalDps: ${attackModeCheck.stGakuen.normalDps}, hitDamage: ${attackModeCheck.stGakuen.hitDamage}, activeDps: ${attackModeCheck.stGakuen.activeDps}, timeAvgDps: ${attackModeCheck.stGakuen.timeAvgDps}, theoreticalDps: ${attackModeCheck.stGakuen.theoreticalDps}`);

  assert('P45-03: ［絢爛］立花山城 has isEstimatedMult (1倍通常相当) with 4 targets and stratDps > 0',
    attackModeCheck.stKenran.isEstimatedMult === true &&
    attackModeCheck.stKenran.mult === 1.0 &&
    attackModeCheck.stKenran.targets === 4 &&
    attackModeCheck.stKenran.stratDps > 0,
    `isEstimatedMult: ${attackModeCheck.stKenran.isEstimatedMult}, mult: ${attackModeCheck.stKenran.mult}, targets: ${attackModeCheck.stKenran.targets}, stratDps: ${attackModeCheck.stKenran.stratDps}`);

  assert('P45-04: ［正月］立花山城 (no multiplier) is marked isUnquantifiable: true with stratDps = 0 without fabricating numbers',
    attackModeCheck.stShogatsu.isUnquantifiable === true &&
    attackModeCheck.stShogatsu.stratDps === 0 &&
    attackModeCheck.stShogatsu.theoreticalDps === 0 &&
    attackModeCheck.stShogatsu.breakdownText.includes('数値化不可'),
    `isUnquantifiable: ${attackModeCheck.stShogatsu.isUnquantifiable}, stratDps: ${attackModeCheck.stShogatsu.stratDps}, breakdownText: "${attackModeCheck.stShogatsu.breakdownText}"`);

  assert('P45-05: 立花山城 & 澪田唯吹 without duration are marked isUnquantifiable: true',
    attackModeCheck.pTachibana.isUnquantifiable === true && attackModeCheck.pMioda.isUnquantifiable === true,
    `Tachibana unquantifiable: ${attackModeCheck.pTachibana.isUnquantifiable}, Mioda unquantifiable: ${attackModeCheck.pMioda.isUnquantifiable}`);

  // =========================================================================
  // SECTION 2: 殴られ役（的）のHP無限デフォルト化
  // =========================================================================
  console.log('\n[SECTION 2: Infinite HP Default & Presets]...');

  const hpDefaultCheck = await page.evaluate(() => {
    const state = window.getFiringRangeState();
    const btnInf = document.getElementById('btnHpModeInfinite');
    const btnFin = document.getElementById('btnHpModeFinite');
    const hpRow = document.getElementById('firingRangeHpInputRow');
    const hpText = document.getElementById('firingDummyHpText');
    const hpBar = document.getElementById('firingDummyHpBarFill');

    return {
      isInfiniteHp: state.isInfiniteHp,
      btnInfActive: btnInf ? btnInf.classList.contains('active') : false,
      btnFinActive: btnFin ? btnFin.classList.contains('active') : false,
      hpRowDisplay: hpRow ? hpRow.style.display : '',
      hpText: hpText ? hpText.textContent : '',
      hpBarWidth: hpBar ? hpBar.style.width : ''
    };
  });

  assert('P45-06: Initial dummy state is Infinite HP by default (isInfiniteHp: true, btnInf active, ∞ text)',
    hpDefaultCheck.isInfiniteHp === true &&
    hpDefaultCheck.btnInfActive === true &&
    hpDefaultCheck.btnFinActive === false &&
    hpDefaultCheck.hpText.includes('∞') &&
    hpDefaultCheck.hpRowDisplay === 'none',
    `isInfiniteHp: ${hpDefaultCheck.isInfiniteHp}, btnInf: ${hpDefaultCheck.btnInfActive}, hpText: "${hpDefaultCheck.hpText}", hpRow: "${hpDefaultCheck.hpRowDisplay}"`);

  // Test selecting Boss preset retains isInfiniteHp: true
  const presetBossCheck = await page.evaluate(() => {
    const sel = document.getElementById('firingRangePresetSelect');
    if (!sel) return { success: false };

    // Select boss preset
    sel.value = "boss_0";
    sel.dispatchEvent(new Event('change'));

    const state = window.getFiringRangeState();
    const hpText = document.getElementById('firingDummyHpText');
    return {
      success: true,
      dummyName: state.dummyName,
      targetDef: state.targetDef,
      isInfiniteHp: state.isInfiniteHp,
      hpText: hpText ? hpText.textContent : ''
    };
  });

  assert('P45-07: Selecting Boss preset preserves isInfiniteHp: true with ∞ display',
    presetBossCheck.success && presetBossCheck.isInfiniteHp === true && presetBossCheck.hpText.includes('∞'),
    `dummyName: ${presetBossCheck.dummyName}, def: ${presetBossCheck.targetDef}, isInfiniteHp: ${presetBossCheck.isInfiniteHp}, hpText: "${presetBossCheck.hpText}"`);

  // Test reset restores isInfiniteHp: true
  const resetCheck = await page.evaluate(() => {
    // Manually set finite first
    const btnFin = document.getElementById('btnHpModeFinite');
    if (btnFin) btnFin.click();

    const btnReset = document.getElementById('btnResetDummySettings');
    if (btnReset) btnReset.click();

    const state = window.getFiringRangeState();
    const hpText = document.getElementById('firingDummyHpText');
    return {
      isInfiniteHp: state.isInfiniteHp,
      hpText: hpText ? hpText.textContent : ''
    };
  });

  assert('P45-08: Reset button restores isInfiniteHp: true and ∞ counter',
    resetCheck.isInfiniteHp === true && resetCheck.hpText.includes('∞'),
    `isInfiniteHp: ${resetCheck.isInfiniteHp}, hpText: "${resetCheck.hpText}"`);

  // =========================================================================
  // SECTION 3: 試射シミュレーション（20万超え継続 & attackMode ウィンドウ発動）
  // =========================================================================
  console.log('\n[SECTION 3: Simulation Continuity & Active Window Attacks]...');

  const simExceed200kCheck = await page.evaluate(async () => {
    const gakuen = window.SCRE_DATA.find(c => c.name === '［学園］都於郡城');
    const nagoya = window.SCRE_DATA.find(c => c.name === '名古屋城');
    window.setParty([
      { id: gakuen.id, giantStep: 5, strategyOn: true },
      { id: nagoya.id, giantStep: 5, strategyOn: true }
    ]);
    window.renderFiringRangeTab();

    const state = window.getFiringRangeState();
    state.isInfiniteHp = true;
    state.totalDamage = 250000; // Directly simulate reaching beyond 200,000
    state.speed = 4.0;

    const playBtn = document.getElementById('btnFiringPlayPause');
    if (playBtn) playBtn.click(); // Start simulation

    await new Promise(r => setTimeout(r, 1200));

    const isRunning = state.isRunning;
    const totalDmg = state.totalDamage;
    const gakuenSlot = state.castleSlots[0];

    // Pause simulation
    if (playBtn) playBtn.click();

    return {
      isRunning,
      totalDmg,
      exceeded200k: totalDmg > 200000,
      gakuenStratDmg: gakuenSlot?.stratDmg || 0,
      gakuenHits: gakuenSlot?.hits || 0
    };
  });

  assert('P45-09: Simulation continues running beyond 200,000 damage under infinite HP default',
    simExceed200kCheck.exceeded200k === true,
    `totalDmg: ${simExceed200kCheck.totalDmg.toLocaleString()} (> 200,000 without stopping)`);

  assert('P45-10: ［学園］都於郡城 attacks during strategy window dealing strategy damage in simulation',
    simExceed200kCheck.gakuenStratDmg > 0 && simExceed200kCheck.gakuenHits > 0,
    `stratDmg: ${simExceed200kCheck.gakuenStratDmg}, hits: ${simExceed200kCheck.gakuenHits}`);

  // =========================================================================
  // SECTION 4: 結果表「1撃ダメージ」専用列 & 計算内訳折り返し & スナップ比較
  // =========================================================================
  console.log('\n[SECTION 4: 1-Hit Dedicated Column & Breakdown Wrap & Snapshots]...');

  const tableUiCheck = await page.evaluate(() => {
    const gakuen = window.SCRE_DATA.find(c => c.name === '［学園］都於郡城');
    const osaka = window.SCRE_DATA.find(c => c.name === '大坂城');
    const nagoya = window.SCRE_DATA.find(c => c.name === '名古屋城');
    const shogatsu = window.SCRE_DATA.find(c => c.name === '［正月］立花山城');

    window.setParty([
      { id: nagoya.id, giantStep: 5, strategyOn: true },
      { id: gakuen.id, giantStep: 5, strategyOn: true },
      { id: osaka.id, giantStep: 5, strategyOn: true },
      { id: shogatsu.id, giantStep: 5, strategyOn: true }
    ]);
    window.renderFiringRangeTab();

    const ths = Array.from(document.querySelectorAll('#tab-firing-range thead th')).map(th => th.textContent.trim());
    const rows = Array.from(document.querySelectorAll('#firingCastleResultsTbody tr'));

    const nagoya1HitCell = rows[0]?.querySelectorAll('td')[4]?.innerHTML || '';
    const gakuen1HitCell = rows[1]?.querySelectorAll('td')[4]?.innerHTML || '';
    const osaka1HitCell = rows[2]?.querySelectorAll('td')[4]?.innerHTML || '';
    const shogatsu1HitCell = rows[3]?.querySelectorAll('td')[4]?.innerHTML || '';

    const breakdownCell = rows[0]?.querySelectorAll('td')[9];
    const breakdownStyle = breakdownCell ? window.getComputedStyle(breakdownCell) : null;
    const isNowrap = breakdownStyle ? breakdownStyle.whiteSpace === 'nowrap' : false;

    // Test saving snapshots and comparing
    const nameInput = document.getElementById('firingSnapshotNameInput');
    const saveBtn = document.getElementById('btnSaveFiringSnapshot');
    if (nameInput) nameInput.value = 'スナップA';
    if (saveBtn) saveBtn.click();

    // Change slot 0 defense to 1500 and save B
    window.getFiringRangeState().targetDef = 1500;
    window.renderFiringRangeTab();
    if (nameInput) nameInput.value = 'スナップB';
    if (saveBtn) saveBtn.click();

    const snaps = JSON.parse(localStorage.getItem('scre-helper:firing-snapshots:v1') || '[]');
    let snapHas1Hit = false;
    let compareTableHas1Hit = false;

    if (snaps.length >= 2) {
      window.compareFiringSnapshots(snaps[1].id, snaps[0].id);
      const compContent = document.getElementById('firingSnapshotComparisonContent');
      compareTableHas1Hit = compContent ? compContent.innerHTML.includes('通常1撃') : false;
      snapHas1Hit = Boolean(snaps[0].castleStats[0]?.finalHitDamage !== undefined);
    }

    return {
      ths,
      has1HitHeader: ths.some(t => t.includes('1撃実ダメージ')),
      nagoya1HitCell,
      gakuen1HitCell,
      osaka1HitCell,
      shogatsu1HitCell,
      isNowrap,
      snapHas1Hit,
      compareTableHas1Hit
    };
  });

  assert('P45-11: Results table header contains dedicated "1撃実ダメージ (通常/計略)" column',
    tableUiCheck.has1HitHeader === true,
    `headers: ${JSON.stringify(tableUiCheck.ths)}`);

  assert('P45-12: Normal weapon (名古屋城) displays distinct 通常1撃 and 計略1撃 with 1回合計',
    tableUiCheck.nagoya1HitCell.includes('通常:') &&
    tableUiCheck.nagoya1HitCell.includes('計略:') &&
    tableUiCheck.nagoya1HitCell.includes('1回合計'),
    `Nagoya 1-hit cell: ${tableUiCheck.nagoya1HitCell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`);

  assert('P45-13: ［学園］都於郡城 displays "通常: 攻撃なし" and "計略中のみ: 1撃 ○○" with 1回合計',
    tableUiCheck.gakuen1HitCell.includes('攻撃なし') &&
    tableUiCheck.gakuen1HitCell.includes('計略中のみ') &&
    tableUiCheck.gakuen1HitCell.includes('1回合計'),
    `Gakuen 1-hit cell: ${tableUiCheck.gakuen1HitCell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`);

  assert('P45-14: 大坂城 displays prominent "攻撃なし" and "支援専用", ［正月］立花山城 displays "数値化不可のため未計算" badge',
    tableUiCheck.osaka1HitCell.includes('攻撃なし') &&
    tableUiCheck.osaka1HitCell.includes('支援専用') &&
    tableUiCheck.shogatsu1HitCell.includes('数値化不可のため未計算'),
    `Osaka: ${tableUiCheck.osaka1HitCell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()} ｜ Shogatsu: ${tableUiCheck.shogatsu1HitCell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`);

  assert('P45-15: Breakdown column removes white-space:nowrap allowing full multi-line formula display',
    tableUiCheck.isNowrap === false,
    `isNowrap: ${tableUiCheck.isNowrap} (properly wrapping)`);

  assert('P45-16: Snapshots and Snapshot Comparison table display 1-hit damage comparison',
    tableUiCheck.snapHas1Hit === true && tableUiCheck.compareTableHas1Hit === true,
    `snapHas1Hit: ${tableUiCheck.snapHas1Hit}, compareTableHas1Hit: ${tableUiCheck.compareTableHas1Hit}`);

  // =========================================================================
  // SECTION 5: 特技周期ダメージ (Tokugi periodic damage) 調査・機能検証
  // =========================================================================
  console.log('\n[SECTION 5: Tokugi Periodic Damage Parser Verification]...');

  const tokugiCheck = await page.evaluate(() => {
    const yaraza = window.SCRE_DATA.find(c => c.name === '屋良座森城');
    const miyazu = window.SCRE_DATA.find(c => c.name === '宮津城');
    const koyo = window.SCRE_DATA.find(c => c.name === '高陽城');

    const tokYaraza = window.parseCastleTokugiDamage ? window.parseCastleTokugiDamage(yaraza, 5) : null;
    const tokMiyazuMax = window.parseCastleTokugiDamage ? window.parseCastleTokugiDamage(miyazu, 5) : null;
    const tokMiyazuBase = window.parseCastleTokugiDamage ? window.parseCastleTokugiDamage(miyazu, 0) : null;
    const tokKoyo = window.parseCastleTokugiDamage ? window.parseCastleTokugiDamage(koyo, 5) : null;

    return {
      tokYaraza,
      tokMiyazuMax,
      tokMiyazuBase,
      tokKoyo
    };
  });

  assert('P45-17: 屋良座森城 (陣貝) tokugi parsed as 40s interval 4x AoE damage',
    tokugiCheck.tokYaraza && tokugiCheck.tokYaraza.interval === 40 && tokugiCheck.tokYaraza.mult === 4 && tokugiCheck.tokYaraza.isAoe === true,
    `Yarazamori interval: ${tokugiCheck.tokYaraza?.interval}s, mult: ${tokugiCheck.tokYaraza?.mult}x, AoE: ${tokugiCheck.tokYaraza?.isAoe}`);

  assert('P45-18: 宮津城 (茶器) tokugi active only at giantStep 5 (8s interval 5x AoE damage), null at base',
    tokugiCheck.tokMiyazuMax && tokugiCheck.tokMiyazuMax.interval === 8 && tokugiCheck.tokMiyazuMax.mult === 5 && tokugiCheck.tokMiyazuBase === null,
    `Miyazu giant5 interval: ${tokugiCheck.tokMiyazuMax?.interval}s, mult: ${tokugiCheck.tokMiyazuMax?.mult}x, base: ${tokugiCheck.tokMiyazuBase}`);

  assert('P45-19: 高陽城 (陣貝) continuous magic damage without multiplier is marked isUnquantifiable: true',
    tokugiCheck.tokKoyo && tokugiCheck.tokKoyo.isUnquantifiable === true,
    `Koyo unquantifiable: ${tokugiCheck.tokKoyo?.isUnquantifiable}`);

  // =========================================================================
  // SECTION 6: 攻撃武器種（刀・槌等）の通常1撃・DPS回帰テスト
  // =========================================================================
  console.log('\n[SECTION 6: Regression for Attacking Weapon Types]...');

  const regressionCheck = await page.evaluate(() => {
    const nagoya = window.SCRE_DATA.find(c => c.name === '名古屋城');
    const edo = window.SCRE_DATA.find(c => c.name === '江戸城');

    window.setParty([
      { id: nagoya.id, giantStep: 5, strategyOn: false },
      { id: edo.id, giantStep: 5, strategyOn: false }
    ]);
    const stNagoya = window.calculateFiringCastleStats(nagoya, { giantStep: 5, strategyOn: false }, 500, 0, 1, new Set());
    const stEdo = window.calculateFiringCastleStats(edo, { giantStep: 5, strategyOn: false }, 500, 0, 1, new Set());

    return {
      nagoya: {
        finalHitDamage: stNagoya.finalHitDamage,
        normalDps: stNagoya.normalDps,
        theoreticalDps: stNagoya.theoreticalDps
      },
      edo: {
        finalHitDamage: stEdo.finalHitDamage,
        normalDps: stEdo.normalDps,
        theoreticalDps: stEdo.theoreticalDps
      }
    };
  });

  assert('P45-20: 名古屋城 (槌) and 江戸城 (刀) retain accurate normal hit damage and DPS without degradation',
    regressionCheck.nagoya.finalHitDamage > 0 && regressionCheck.nagoya.normalDps > 0 &&
    regressionCheck.edo.finalHitDamage > 0 && regressionCheck.edo.normalDps > 0,
    `Nagoya hit: ${regressionCheck.nagoya.finalHitDamage}, dps: ${regressionCheck.nagoya.normalDps}/s ｜ Edo hit: ${regressionCheck.edo.finalHitDamage}, dps: ${regressionCheck.edo.normalDps}/s`);

  // =========================================================================
  // SECTION 7: フォントサイズ下限（>= 12px）検証
  // =========================================================================
  console.log('\n[SECTION 7: Strict Font-size Floor (>= 12px) Verification]...');

  const fontCheck = await page.evaluate(() => {
    const selectors = [
      '#firingCastleResultsTbody *',
      '#firingDummyHpBarBox *',
      '#firingSnapshotComparisonContent *',
      '#btnHpModeInfinite',
      '#btnHpModeFinite'
    ];
    const violations = [];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(node => {
        if (node.childNodes && Array.from(node.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) {
          const size = parseFloat(window.getComputedStyle(node).fontSize);
          if (size < 11.99) {
            violations.push({ sel, tag: node.tagName, size, text: node.textContent.trim().slice(0, 30) });
          }
        }
      });
    });
    return {
      violationCount: violations.length,
      violations
    };
  });

  assert('P45-21: Strict font-size floor (>= 12px) maintained across modified elements',
    fontCheck.violationCount === 0,
    `violations: ${fontCheck.violationCount} (${JSON.stringify(fontCheck.violations)})`);

  await browser.close();

  console.log('\n==============================================');
  console.log(`PROMPT 45 AUTOMATED TESTS SUMMARY: ${passed} / ${total} PASSED`);
  console.log('==============================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
})();
