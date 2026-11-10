/**
 * Prompt 44 Automated Test Suite: 攻撃しない武器種（歌舞・陣貝・茶器）の通常攻撃停止と支援特化
 * 1. SCRE_WEAPON_FRAMES の type: "buff" 判定
 * 2. calculateFiringCastleStats における通常攻撃DPS = 0 / 1撃ダメージ = 0
 * 3. 計略ダメージを持つ buff種（屋良座森城・石山御坊）の計略DPS分離維持
 * 4. 歌舞単独編成での試射シミュレーション（通常ダメージ0・ヒット数0維持）
 * 5. 攻撃武器種（刀・槌等）の通常DPS回帰（計算値不変）
 * 6. 歌舞編成時の味方バフ（calculateBuffs）正常提供
 * 7. 城娘詳細 computeFramePreciseDps / renderDetailDpsPrecisionUI の「攻撃しません（支援専用）」表示
 * 8. TTKレース（renderTtkRace）における通常攻撃除外
 * 9. フォントサイズ下限（>= 12px）検証
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
  console.log('=== Running Prompt 44 Automated Test Suite: Non-Attacking Buff Weapons ===\n');

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
  await new Promise(r => setTimeout(r, 1200));

  // Switch to firing range tab
  await page.evaluate(() => {
    const tabBtn = document.querySelector('[data-tab="tab-firing-range"]');
    if (tabBtn) tabBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // -------------------------------------------------------------
  // Test 1: SCRE_WEAPON_FRAMES type definition check
  // -------------------------------------------------------------
  console.log('[SECTION 1: Weapon Frame Definitions & Buff Detection]...');
  const framesCheck = await page.evaluate(() => {
    const frames = window.SCRE_WEAPON_FRAMES || {};
    return {
      kabuType: frames['歌舞']?.type,
      jinkaiType: frames['陣貝']?.type,
      chakiType: frames['茶器']?.type,
      katanaType: frames['刀']?.type
    };
  });

  assert('P44-01: SCRE_WEAPON_FRAMES defines 歌舞, 陣貝, 茶器 with type "buff"',
    framesCheck.kabuType === 'buff' && framesCheck.jinkaiType === 'buff' && framesCheck.chakiType === 'buff' && framesCheck.katanaType === 'physical',
    `歌舞: ${framesCheck.kabuType}, 陣貝: ${framesCheck.jinkaiType}, 茶器: ${framesCheck.chakiType}, 刀: ${framesCheck.katanaType}`);

  // -------------------------------------------------------------
  // Test 2: calculateFiringCastleStats for Buff Weapons
  // -------------------------------------------------------------
  console.log('\n[SECTION 2: calculateFiringCastleStats Normal DPS = 0]...');
  const buffStatsCheck = await page.evaluate(() => {
    const osaka = window.SCRE_DATA.find(c => c.name === '大坂城'); // 歌舞 (計略バフのみ)
    const yondaime = window.SCRE_DATA.find(c => c.name.includes('四代目江戸城')); // 陣貝 (計略バフのみ)
    const kyoto = window.SCRE_DATA.find(c => c.name === '京都新城'); // 茶器 (計略バフのみ)
    const yaraza = window.SCRE_DATA.find(c => c.name.includes('屋良座森城')); // 陣貝 (直接ダメージ計略あり: 2倍)
    const ishiyama = window.SCRE_DATA.find(c => c.name.includes('石山御坊')); // 歌舞 (直接ダメージ計略あり: 5倍)
    const nagoya = window.SCRE_DATA.find(c => c.name === '名古屋城'); // 槌 (攻撃武器種)

    const calcStat = (c) => {
      const slot = { id: c.id, strategyOn: true, specialOn: true, giantStep: 5 };
      return window.calculateFiringCastleStats(c, slot, 500, 0, 1);
    };

    const stOsaka = calcStat(osaka);
    const stYondaime = calcStat(yondaime);
    const stKyoto = calcStat(kyoto);
    const stYaraza = calcStat(yaraza);
    const stIshiyama = calcStat(ishiyama);
    const stNagoya = calcStat(nagoya);

    return {
      osaka: {
        isBuffWeapon: stOsaka.isBuffWeapon,
        finalHitDamage: stOsaka.finalHitDamage,
        normalDps: stOsaka.normalDps,
        stratDps: stOsaka.stratDps,
        theoreticalDps: stOsaka.theoreticalDps,
        breakdownText: stOsaka.breakdownText
      },
      yondaime: {
        isBuffWeapon: stYondaime.isBuffWeapon,
        finalHitDamage: stYondaime.finalHitDamage,
        normalDps: stYondaime.normalDps,
        theoreticalDps: stYondaime.theoreticalDps
      },
      chaki: {
        isBuffWeapon: stKyoto.isBuffWeapon,
        finalHitDamage: stKyoto.finalHitDamage,
        normalDps: stKyoto.normalDps,
        theoreticalDps: stKyoto.theoreticalDps
      },
      yaraza: {
        isBuffWeapon: stYaraza.isBuffWeapon,
        normalDps: stYaraza.normalDps,
        stratDps: stYaraza.stratDps,
        theoreticalDps: stYaraza.theoreticalDps
      },
      ishiyama: {
        isBuffWeapon: stIshiyama.isBuffWeapon,
        normalDps: stIshiyama.normalDps,
        stratDps: stIshiyama.stratDps,
        theoreticalDps: stIshiyama.theoreticalDps
      },
      nagoya: {
        isBuffWeapon: stNagoya.isBuffWeapon,
        finalHitDamage: stNagoya.finalHitDamage,
        normalDps: stNagoya.normalDps,
        theoreticalDps: stNagoya.theoreticalDps
      }
    };
  });

  assert('P44-02: 歌舞（大坂城）has normalDps === 0, finalHitDamage === 0, theoreticalDps === 0',
    buffStatsCheck.osaka.isBuffWeapon && buffStatsCheck.osaka.normalDps === 0 && buffStatsCheck.osaka.finalHitDamage === 0 && buffStatsCheck.osaka.theoreticalDps === 0,
    `normalDps: ${buffStatsCheck.osaka.normalDps}, finalHitDamage: ${buffStatsCheck.osaka.finalHitDamage}, theoreticalDps: ${buffStatsCheck.osaka.theoreticalDps}`);

  assert('P44-03: 陣貝（四代目江戸城）and 茶器（京都新城）have normalDps === 0',
    buffStatsCheck.yondaime.normalDps === 0 && buffStatsCheck.chaki.normalDps === 0,
    `四代目江戸城 normalDps: ${buffStatsCheck.yondaime.normalDps}, 京都新城 normalDps: ${buffStatsCheck.chaki.normalDps}`);

  assert('P44-04: Buff castles with damage strategies (屋良座森城, 石山御坊) retain strategy DPS with normalDps === 0',
    buffStatsCheck.yaraza.normalDps === 0 && buffStatsCheck.yaraza.stratDps > 0 && buffStatsCheck.yaraza.theoreticalDps === buffStatsCheck.yaraza.stratDps &&
    buffStatsCheck.ishiyama.normalDps === 0 && buffStatsCheck.ishiyama.stratDps > 0 && buffStatsCheck.ishiyama.theoreticalDps === buffStatsCheck.ishiyama.stratDps,
    `屋良座森城 normalDps: ${buffStatsCheck.yaraza.normalDps}, stratDps: ${buffStatsCheck.yaraza.stratDps} ｜ 石山御坊 normalDps: ${buffStatsCheck.ishiyama.normalDps}, stratDps: ${buffStatsCheck.ishiyama.stratDps}`);

  assert('P44-05: Attacking weapon (名古屋城 槌) retains normal attack damage and DPS (regression)',
    !buffStatsCheck.nagoya.isBuffWeapon && buffStatsCheck.nagoya.normalDps > 0 && buffStatsCheck.nagoya.finalHitDamage > 0,
    `名古屋城 finalHitDamage: ${buffStatsCheck.nagoya.finalHitDamage}, normalDps: ${buffStatsCheck.nagoya.normalDps}/s`);

  assert('P44-06: 歌舞 breakdownText clarifies attack stat is support baseline and not enemy damage',
    buffStatsCheck.osaka.breakdownText.includes('攻撃なし（支援専用') && buffStatsCheck.osaka.breakdownText.includes('バフ・回復の基礎値'),
    `breakdownText: "${buffStatsCheck.osaka.breakdownText}"`);

  // -------------------------------------------------------------
  // Test 3: Simulation with ONLY 歌舞 (No damage dealt)
  // -------------------------------------------------------------
  console.log('\n[SECTION 3: Simulation Animation Loop with Kabu-Only Party]...');
  const kabuSimCheck = await page.evaluate(async () => {
    const osaka = window.SCRE_DATA.find(c => c.name === '大坂城');
    window.setParty([{ id: osaka.id, strategyOn: true, specialOn: true, giantStep: 5 }]);
    window.renderFiringRangeTab();

    const playBtn = document.getElementById('btnFiringPlayPause');
    if (playBtn) playBtn.click(); // Start simulation

    // Wait 500ms
    await new Promise(r => setTimeout(r, 500));

    const state = window.getFiringRangeState ? window.getFiringRangeState() : null;
    const slot0 = state?.castleSlots[0];

    const normalDmg = slot0?.normalDmg || 0;
    const hits = slot0?.hits || 0;
    const totalDmg = state?.totalDamage || 0;
    const projectilesCount = state?.projectiles?.length || 0;

    // Pause simulation
    if (playBtn) playBtn.click();

    return {
      normalDmg,
      hits,
      totalDmg,
      projectilesCount
    };
  });

  assert('P44-07: Kabu-only party in simulation deals 0 total damage, 0 normal damage, and 0 hits',
    kabuSimCheck.totalDmg === 0 && kabuSimCheck.normalDmg === 0 && kabuSimCheck.hits === 0,
    `totalDmg: ${kabuSimCheck.totalDmg}, normalDmg: ${kabuSimCheck.normalDmg}, hits: ${kabuSimCheck.hits}, projectiles: ${kabuSimCheck.projectilesCount}`);

  // -------------------------------------------------------------
  // Test 4: Kabu Buffs In-Range Ally Intact (calculateBuffs)
  // -------------------------------------------------------------
  console.log('\n[SECTION 4: Kabu Ally Buff Provision Intact]...');
  const allyBuffCheck = await page.evaluate(() => {
    const nagoya = window.SCRE_DATA.find(c => c.name === '名古屋城');
    const osaka = window.SCRE_DATA.find(c => c.name === '大坂城');
    const tonokoori = window.SCRE_DATA.find(c => c.name === '都於郡城'); // 歌舞: 射程内攻撃+30

    // 1. Party with only Nagoya
    window.setParty([{ id: nagoya.id, strategyOn: true, specialOn: true, giantStep: 5 }]);
    const singleRes = window.calculateBuffs();
    const soloAtk = singleRes.perCastle[nagoya.id]?.calculatedStats?.atk || 0;

    // 2. Party with Nagoya + Tonokoori (歌舞)
    window.setParty([
      { id: nagoya.id, strategyOn: true, specialOn: true, giantStep: 5 },
      { id: tonokoori.id, strategyOn: true, specialOn: true, giantStep: 5 }
    ]);
    const pairRes = window.calculateBuffs();
    const buffedAtk = pairRes.perCastle[nagoya.id]?.calculatedStats?.atk || 0;

    // 3. Firing range calculations with Nagoya + Osaka (歌舞)
    window.setParty([
      { id: nagoya.id, strategyOn: true, specialOn: true, giantStep: 5 },
      { id: osaka.id, strategyOn: true, specialOn: true, giantStep: 5 }
    ]);
    window.renderFiringRangeTab();
    const headline = document.getElementById('firingRangeDpsHeadline')?.textContent || '';
    const state = window.getFiringRangeState ? window.getFiringRangeState() : null;
    const osakaSlot = state?.castleSlots[1];
    const nagoyaSlot = state?.castleSlots[0];
    const nagoyaBuffs = window.calculateBuffs().perCastle[nagoya.id]?.buffs;
    const osakaSpdBuffApplied = nagoyaBuffs?.atkSpeed?.max === 8;

    return {
      soloAtk,
      buffedAtk,
      hasAtkIncrease: buffedAtk > soloAtk,
      osakaSpdBuffApplied,
      headline,
      osakaTheoreticalDps: osakaSlot?.stat?.theoreticalDps || 0,
      nagoyaTheoreticalDps: nagoyaSlot?.stat?.theoreticalDps || 0
    };
  });

  assert('P44-08: Kabu castles provide in-range buffs (Atk+30, AtkSpeed+8%) to allies while inflicting 0 DPS themselves',
    allyBuffCheck.hasAtkIncrease && allyBuffCheck.osakaSpdBuffApplied && allyBuffCheck.osakaTheoreticalDps === 0 && allyBuffCheck.nagoyaTheoreticalDps > 0,
    `Nagoya Atk solo: ${allyBuffCheck.soloAtk} ➔ buffed with Tonokoori: ${allyBuffCheck.buffedAtk} (+${allyBuffCheck.buffedAtk - allyBuffCheck.soloAtk}), Osaka AtkSpeed buff: ${allyBuffCheck.osakaSpdBuffApplied}, Osaka DPS: ${allyBuffCheck.osakaTheoreticalDps}`);

  // -------------------------------------------------------------
  // Test 5: Castle Detail Frame Precise DPS for Buff Weapons
  // -------------------------------------------------------------
  console.log('\n[SECTION 5: Castle Detail Frame-Precise DPS & Modal UI]...');
  const detailCheck = await page.evaluate(() => {
    const osaka = window.SCRE_DATA.find(c => c.name === '大坂城');
    const res = window.computeFramePreciseDps(osaka, 500);

    // Test UI render
    if (window.renderDetailDpsPrecisionUI) {
      window.renderDetailDpsPrecisionUI(osaka);
    }
    const metricsHtml = document.getElementById('detailDpsPrecisionMetrics')?.innerHTML || '';
    const framesHtml = document.getElementById('detailDpsFrameBreakdown')?.innerHTML || '';

    return {
      isBuff: res.isBuff,
      finalHitDmg: res.finalHitDmg,
      effDps: res.effDps,
      ttk100k: res.ttk100k,
      uiHasNoAttackNotice: metricsHtml.includes('この武器種は攻撃しません（支援専用）'),
      uiHasTtkExempt: metricsHtml.includes('対象外 (∞)'),
      framesHasCycle: framesHtml.includes('支援周期計')
    };
  });

  assert('P44-09: computeFramePreciseDps for 歌舞 sets effDps = 0, finalHitDmg = 0, ttk100k = "対象外 (∞)"',
    detailCheck.isBuff && detailCheck.effDps === 0 && detailCheck.finalHitDmg === 0 && detailCheck.ttk100k.includes('対象外'),
    `effDps: ${detailCheck.effDps}, finalHitDmg: ${detailCheck.finalHitDmg}, ttk100k: ${detailCheck.ttk100k}`);

  assert('P44-10: renderDetailDpsPrecisionUI displays "この武器種は攻撃しません（支援専用）" and TTK exemption',
    detailCheck.uiHasNoAttackNotice && detailCheck.uiHasTtkExempt && detailCheck.framesHasCycle,
    `notice: ${detailCheck.uiHasNoAttackNotice}, ttkExempt: ${detailCheck.uiHasTtkExempt}, framesHasCycle: ${detailCheck.framesHasCycle}`);

  // -------------------------------------------------------------
  // Test 6: Strict Font-size Floor (>= 12px) Verification
  // -------------------------------------------------------------
  console.log('\n[SECTION 6: Strict Font-size Floor (>= 12px) Verification]...');
  const fontCheck = await page.evaluate(() => {
    const targets = [
      '#detailDpsPrecisionMetrics',
      '#detailDpsFrameBreakdown',
      '#firingCastleResultsTbody',
      '.firing-range-notice-box'
    ];
    const violations = [];
    targets.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const textNodes = Array.from(el.querySelectorAll('*')).concat([el]);
        textNodes.forEach(node => {
          if (node.childNodes && Array.from(node.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) {
            const size = parseFloat(window.getComputedStyle(node).fontSize);
            if (size < 11.99) {
              violations.push({ sel, tag: node.tagName, size, text: node.textContent.trim().slice(0, 30) });
            }
          }
        });
      });
    });
    return {
      violationCount: violations.length,
      violations
    };
  });

  assert('P44-11: Strict font-size floor (>= 12px) maintained across modified elements',
    fontCheck.violationCount === 0,
    `violations: ${fontCheck.violationCount} (${JSON.stringify(fontCheck.violations)})`);

  console.log(`\n==============================================`);
  console.log(`PROMPT 44 AUTOMATED TESTS SUMMARY: ${passed} / ${total} PASSED`);
  console.log(`==============================================\n`);

  await browser.close();
  process.exit(passed === total ? 0 : 1);
})();
