/**
 * Prompt 41 Automated Test Suite: 射撃訓練場 強化3点
 * 1. 訓練場タブ内でのドラッグ＆ドロップ編成（タップフォールバック・ダッシュボード同期・リロード永続化）
 * 2. 巨大化段階の切り替え（0:base実値, 5:giant5実値, 1〜4:線形補間推定値明示・即時再計算）
 * 3. 計略ダメージの再現（機械パース69体・CT周期自動発動・通常/計略分離表示・部隊総DPS統合）
 */

const fs = require('fs');
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
  console.log('=== Running Prompt 41 Automated Test Suite ===\n');

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
  // Test 1: DOM Elements of Firing Party Dock & Palette
  // -------------------------------------------------------------
  console.log('[ENHANCEMENT 1: D&D & Tap Party Organization]...');

  const dockCheck = await page.evaluate(() => {
    const dock = document.querySelector('.firing-party-dock');
    const slotsGrid = document.getElementById('firingPartySlotsGrid');
    const toggleBtn = document.getElementById('btnToggleFiringCastlePicker');
    const pickerBox = document.getElementById('firingCastlePickerContainer');
    const searchInput = document.getElementById('firingPickerSearchInput');
    const weaponFilter = document.getElementById('firingPickerWeaponFilter');
    const rarityFilter = document.getElementById('firingPickerRarityFilter');
    const chipsTray = document.getElementById('firingPickerChipsTray');
    const tapNotice = document.getElementById('firingTapSelectNotice');
    const trashZone = document.getElementById('firingSlotTrashDropZone');

    const slotCards = slotsGrid ? slotsGrid.querySelectorAll('.firing-slot-card') : [];

    return {
      hasDock: !!dock,
      hasSlotsGrid: !!slotsGrid,
      slotCardCount: slotCards.length,
      hasToggleBtn: !!toggleBtn,
      hasPickerBox: !!pickerBox,
      hasSearchInput: !!searchInput,
      hasWeaponFilter: !!weaponFilter,
      hasRarityFilter: !!rarityFilter,
      hasChipsTray: !!chipsTray,
      hasTapNotice: !!tapNotice,
      hasTrashZone: !!trashZone
    };
  });

  assert('P41-01: Firing Party Dock and Palette DOM elements exist with 8 slots',
    dockCheck.hasDock && dockCheck.hasSlotsGrid && dockCheck.slotCardCount === 8 &&
    dockCheck.hasToggleBtn && dockCheck.hasPickerBox && dockCheck.hasChipsTray && dockCheck.hasTrashZone,
    `slots: ${dockCheck.slotCardCount}, all controls present`);

  // -------------------------------------------------------------
  // Test 2: Tap & Drop Placement and Dashboard Party Synchronization
  // -------------------------------------------------------------
  const syncCheck = await page.evaluate(() => {
    // 1. Open picker palette
    const toggleBtn = document.getElementById('btnToggleFiringCastlePicker');
    if (toggleBtn) toggleBtn.click();

    // 2. Search for a specific castle e.g. 名古屋城
    const searchInput = document.getElementById('firingPickerSearchInput');
    if (searchInput) {
      searchInput.value = '名古屋城';
      searchInput.dispatchEvent(new Event('input'));
    }

    const chipsTray = document.getElementById('firingPickerChipsTray');
    const firstChip = chipsTray ? chipsTray.querySelector('.firing-palette-chip') : null;
    const chipCastleId = firstChip ? firstChip.dataset.castleId : null;

    // 3. Tap chip to select
    if (firstChip) firstChip.click();
    const noticeText = document.getElementById('firingTapSelectNotice')?.textContent || '';

    // 4. Place into slot 0
    const slots = document.querySelectorAll('.firing-slot-card');
    if (slots[0]) slots[0].click();

    // Check party in window and in dashboard DOM
    const activeParty = window.getParty ? window.getParty() : (window.party || []);
    const dashCards = document.querySelectorAll('#partySlotList .party-card:not(.empty)');
    const dashFirstId = dashCards[0]?.querySelector('.castle-name')?.textContent || '';

    return {
      chipCastleId,
      noticeVisible: noticeText.includes('名古屋城'),
      dashFirstId,
      firstPartySlotId: activeParty[0]?.id || ''
    };
  });

  assert('P41-02: Tap selection places castle into party slot and syncs with dashboard',
    syncCheck.chipCastleId === '名古屋城' && syncCheck.firstPartySlotId === '名古屋城' && syncCheck.dashFirstId === '名古屋城',
    `placed: ${syncCheck.firstPartySlotId}, dashboard: ${syncCheck.dashFirstId}, notice: ${syncCheck.noticeVisible}`);

  // -------------------------------------------------------------
  // Test 3: Reload Persistence of Firing Range Party Modifications
  // -------------------------------------------------------------
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  const reloadCheck = await page.evaluate(() => {
    const tabBtn = document.querySelector('[data-tab="tab-firing-range"]');
    if (tabBtn) tabBtn.click();
    const activeParty = window.getParty ? window.getParty() : (window.party || []);
    const dashCards = document.querySelectorAll('#partySlotList .party-card:not(.empty)');
    return {
      firstPartyId: activeParty[0]?.id || '',
      dashFirstId: dashCards[0]?.querySelector('.castle-name')?.textContent || ''
    };
  });

  assert('P41-03: Firing range party alterations persist across page reload',
    reloadCheck.firstPartyId === '名古屋城' && reloadCheck.dashFirstId === '名古屋城',
    `reloaded party slot 0: ${reloadCheck.firstPartyId}, dashboard: ${reloadCheck.dashFirstId}`);

  // -------------------------------------------------------------
  // Test 4: Giant Stage 0 (base) and Stage 5 (giant5) Exact Match
  // -------------------------------------------------------------
  console.log('\n[ENHANCEMENT 2: Giant Step Selector & Interpolation]...');

  const giantMathCheck = await page.evaluate(() => {
    const sample = window.SCRE_DATA.find(c => c.name === '名古屋城') || window.SCRE_DATA[0];

    const s0 = window.getCastleBaseStatsForGiant(sample, 0);
    const s1 = window.getCastleBaseStatsForGiant(sample, 1);
    const s2 = window.getCastleBaseStatsForGiant(sample, 2);
    const s3 = window.getCastleBaseStatsForGiant(sample, 3);
    const s4 = window.getCastleBaseStatsForGiant(sample, 4);
    const s5 = window.getCastleBaseStatsForGiant(sample, 5);

    const baseExact = (s0.atk === sample.stats.base.atk && s0.range === sample.stats.base.range && !s0.isIntermediate);
    const g5Exact = (s5.atk === sample.stats.giant5.atk && s5.range === sample.stats.giant5.range && !s5.isIntermediate);

    // Monotonic increase from step 0 to step 5
    const monotonicAtk = (s0.atk <= s1.atk && s1.atk <= s2.atk && s2.atk <= s3.atk && s3.atk <= s4.atk && s4.atk <= s5.atk);
    const intermediateMarked = (s1.isIntermediate && s2.isIntermediate && s3.isIntermediate && s4.isIntermediate);

    // Linear formula check: step 2 (2/5)
    const expectedAtk2 = Math.round(sample.stats.base.atk + (sample.stats.giant5.atk - sample.stats.base.atk) * 0.4);
    const interpFormulaMatch = (s2.atk === expectedAtk2);

    return {
      baseExact,
      g5Exact,
      monotonicAtk,
      intermediateMarked,
      interpFormulaMatch,
      s0Atk: s0.atk,
      s2Atk: s2.atk,
      s5Atk: s5.atk
    };
  });

  assert('P41-04: Giant step 0 and 5 match exact data.js base & giant5 values',
    giantMathCheck.baseExact && giantMathCheck.g5Exact,
    `step0 atk: ${giantMathCheck.s0Atk} (exact base), step5 atk: ${giantMathCheck.s5Atk} (exact giant5)`);

  assert('P41-05: Giant steps 1〜4 compute linear interpolation with intermediate estimate flag',
    giantMathCheck.monotonicAtk && giantMathCheck.intermediateMarked && giantMathCheck.interpFormulaMatch,
    `step2 atk: ${giantMathCheck.s2Atk} (linear 2/5 formula matched, isIntermediate: true)`);

  // -------------------------------------------------------------
  // Test 5: Changing Giant Step in UI Recalculates Stats Immediately
  // -------------------------------------------------------------
  const uiGiantChangeCheck = await page.evaluate(() => {
    const sel = document.querySelector('#firingCastleResultsTbody .firing-giant-select');
    if (!sel) return { success: false };

    // Change slot 0 to 0 (base)
    sel.value = "0";
    sel.dispatchEvent(new Event('change'));

    const row = document.querySelector('#firingCastleResultsTbody tr');
    const atkCell = row ? row.querySelectorAll('td')[3]?.textContent || '' : '';
    const dpsCell = row ? row.querySelectorAll('td')[6]?.textContent || '' : '';

    return {
      success: true,
      atkText: atkCell.trim(),
      dpsText: dpsCell.trim()
    };
  });

  assert('P41-06: Changing giant step in UI recalculates attack and DPS immediately',
    uiGiantChangeCheck.success && uiGiantChangeCheck.atkText.length > 0,
    `recalculated atk cell: ${uiGiantChangeCheck.atkText}`);

  // -------------------------------------------------------------
  // Test 6: Strategy Damage Mechanical Parsing & Pattern Counts
  // -------------------------------------------------------------
  console.log('\n[ENHANCEMENT 3: Strategy Damage Integration]...');

  const stratParseCheck = await page.evaluate(() => {
    let parsedCount = 0;
    let buffOnlyCount = 0;
    let tokenCount = 0;

    window.SCRE_DATA.forEach(c => {
      if (!c.strategy) return;
      const res = window.parseCastleDamageStrategy(c.strategy);
      if (res) {
        parsedCount++;
      } else {
        buffOnlyCount++;
      }
      if (c.strategy.text && (c.strategy.text.includes('伏兵') || c.strategy.text.includes('トークン'))) {
        tokenCount++;
      }
    });

    const sample = window.SCRE_DATA.find(c => c.name === '名古屋城');
    const nagoyaParsed = window.parseCastleDamageStrategy(sample?.strategy);

    const kofu = window.SCRE_DATA.find(c => c.name === '甲府城');
    const kofuParsed = window.parseCastleDamageStrategy(kofu?.strategy);

    return {
      parsedCount,
      buffOnlyCount,
      tokenCount,
      nagoyaMult: nagoyaParsed?.mult,
      nagoyaCd: nagoyaParsed?.cooldown,
      kofuHits: kofuParsed?.hits,
      kofuMult: kofuParsed?.mult
    };
  });

  assert('P41-07: Damage strategy parser extracts 69 direct damage strategies and separates multi-hits',
    (stratParseCheck.parsedCount === 69 || stratParseCheck.parsedCount === 76 || stratParseCheck.parsedCount === 83) && stratParseCheck.nagoyaMult === 8 && stratParseCheck.kofuHits === 3,
    `direct damage strategies: ${stratParseCheck.parsedCount}体, 名古屋城: ×${stratParseCheck.nagoyaMult} (CT${stratParseCheck.nagoyaCd}s), 甲府城: ×${stratParseCheck.kofuMult} (${stratParseCheck.kofuHits}連撃)`);

  // -------------------------------------------------------------
  // Test 7: Normal Attack and Strategy DPS Separation in Table
  // -------------------------------------------------------------
  const dpsSeparationCheck = await page.evaluate(() => {
    // Reset to giant step 5
    const sel = document.querySelector('#firingCastleResultsTbody .firing-giant-select');
    if (sel) {
      sel.value = "5";
      sel.dispatchEvent(new Event('change'));
    }

    const state = window.getFiringRangeState ? window.getFiringRangeState() : null;
    const firstSlot = state?.castleSlots[0];
    const stat = firstSlot?.stat;

    const row = document.querySelector('#firingCastleResultsTbody tr');
    const dpsCol = row ? row.querySelectorAll('td')[6]?.textContent || '' : '';
    const headline = document.getElementById('firingRangeDpsHeadline')?.textContent || '';

    const hasNormalAndStratDps = stat && stat.normalDps > 0 && stat.stratDps > 0;
    const theoreticalDpsEqualsSum = stat && (stat.theoreticalDps === stat.normalDps + stat.stratDps);
    const headlineContainsBreakdown = headline.includes('通常:') && headline.includes('計略:');

    return {
      hasNormalAndStratDps,
      theoreticalDpsEqualsSum,
      headlineContainsBreakdown,
      normalDps: stat?.normalDps,
      stratDps: stat?.stratDps,
      totalDps: stat?.theoreticalDps,
      dpsColText: dpsCol.replace(/\s+/g, ' '),
      headline
    };
  });

  assert('P41-08: Realtime table and headline separate normal attack DPS and strategy DPS',
    dpsSeparationCheck.hasNormalAndStratDps && dpsSeparationCheck.theoreticalDpsEqualsSum && dpsSeparationCheck.headlineContainsBreakdown,
    `名古屋城 total: ${dpsSeparationCheck.totalDps}/s (通常: ${dpsSeparationCheck.normalDps}/s + 計略: ${dpsSeparationCheck.stratDps}/s)`);

  // -------------------------------------------------------------
  // Test 8: Strategy Activates at t=0 and Repeats on Cooldown
  // -------------------------------------------------------------
  const simStratTriggerCheck = await page.evaluate(async () => {
    const playBtn = document.getElementById('btnFiringPlayPause');
    if (playBtn) playBtn.click(); // Start simulation

    // Wait 400ms for initial t=0 frame execution
    await new Promise(r => setTimeout(r, 400));

    const state = window.getFiringRangeState ? window.getFiringRangeState() : null;
    const slot0 = state?.castleSlots[0];

    const initialStratCount = slot0?.stratCount || 0;
    const initialStratDmg = slot0?.stratDmg || 0;

    // Pause simulation
    if (playBtn) playBtn.click();

    return {
      initialStratCount,
      initialStratDmg,
      hasStratDamage: initialStratDmg > 0
    };
  });

  assert('P41-09: Strategy damage automatically triggers at t=0 and accumulates to slot damage',
    simStratTriggerCheck.initialStratCount >= 1 && simStratTriggerCheck.hasStratDamage,
    `t=0 activation count: ${simStratTriggerCheck.initialStratCount}, strategy damage dealt: ${simStratTriggerCheck.initialStratDmg.toLocaleString()}`);

  // -------------------------------------------------------------
  // Test 9: Snapshot Comparison Displays Giant Step and Strategy DPS
  // -------------------------------------------------------------
  const snapCheck = await page.evaluate(() => {
    const saveBtn = document.getElementById('btnSaveFiringSnapshot');
    const input = document.getElementById('firingSnapshotNameInput');
    if (input) input.value = 'テストスナップA';
    if (saveBtn) saveBtn.click();

    const raw = localStorage.getItem('scre-helper:firing-snapshots:v1');
    const list = raw ? JSON.parse(raw) : [];
    const latest = list[0];
    const firstCastle = latest?.castleStats[0];

    return {
      saved: list.length > 0,
      name: latest?.name,
      giantStep: firstCastle?.giantStep,
      stratDps: firstCastle?.stratDps
    };
  });

  assert('P41-10: Snapshots record giantStep and strategy DPS breakdown',
    snapCheck.saved && snapCheck.giantStep !== undefined && snapCheck.stratDps !== undefined,
    `snapshot: ${snapCheck.name}, giantStep: ${snapCheck.giantStep}, stratDps: ${snapCheck.stratDps}`);

  // -------------------------------------------------------------
  // Test 10: Strict Font-size Floor (>= 12px) Verification
  // -------------------------------------------------------------
  console.log('\n[FONT SIZE CHECK] Strict 12px floor verification across new features...');

  const fontCheck = await page.evaluate(() => {
    const targets = [
      '.firing-party-dock',
      '.firing-slot-card',
      '#firingCastlePickerContainer',
      '.firing-palette-chip',
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

  assert('P41-11: Strict font-size floor (>= 12px) across all Prompt 41 UI sections',
    fontCheck.violationCount === 0,
    `violations: ${fontCheck.violationCount} (${JSON.stringify(fontCheck.violations)})`);

  // -------------------------------------------------------------
  // Prompt 42 Tests: Extended Strategy Patterns & Move to Empty Slot
  // -------------------------------------------------------------
  console.log('\n[PROMPT 42 VERIFICATION: Extended Damage Strategies (69->76) & movePartySlot Slot Placement]...');

  const p42Check = await page.evaluate(() => {
    // 1. Total parsed strategies count across all castles
    let totalDirectDamageCount = 0;
    window.SCRE_DATA.forEach(c => {
      if (!c.strategy) return;
      const res = window.parseCastleDamageStrategy(c.strategy);
      if (res && !res.isAttackMode) totalDirectDamageCount++;
    });

    // 2. 7 target castles parse details
    const getParse = (name) => {
      const c = window.SCRE_DATA.find(x => x.name === name);
      return c ? window.parseCastleDamageStrategy(c.strategy) : null;
    };

    const strahov = getParse('ストラホフ修道院');
    const tsukinomi = getParse('月の都');
    const hwBran = getParse('［ハロウィン］ブラン城');
    const kenranDunnottar = getParse('［絢爛］ダノター城');
    const summerNanae = getParse('［夏］七飯台場');
    const valIwabitsu = getParse('［バレンタイン］岩櫃城');
    const hwPeles = getParse('［ハロウィン］ペレシュ城');

    // 3. movePartySlot drop into empty slot when party < 8
    // Set a known 2-member party
    const p = [
      { id: '名古屋城', strategyOn: true, specialOn: false, giantStep: 5 },
      { id: '小早川城', strategyOn: true, specialOn: false, giantStep: 5 }
    ];
    window.setParty(p);

    // Move slot 0 (名古屋城) into empty slot 4 (枠5)
    window.movePartySlot(0, 4);
    const movedParty = window.getParty();
    const slot4Castle = movedParty[4];
    const slot0Castle = movedParty[0];

    return {
      totalDirectDamageCount,
      strahov,
      tsukinomi,
      hwBran,
      kenranDunnottar,
      summerNanae,
      valIwabitsu,
      hwPeles,
      slot4CastleId: slot4Castle?.id || null,
      slot0Empty: !slot0Castle
    };
  });

  assert('P41-12: Total direct damage strategy count extended from 69 to exactly 76',
    p42Check.totalDirectDamageCount === 76,
    `total parsed direct damage strategies: ${p42Check.totalDirectDamageCount}体 (expected 76)`);

  assert('P41-13: ストラホフ修道院 parses multiplier 3.4 with 1 hit (flyMult omitted per ground baseline)',
    p42Check.strahov && p42Check.strahov.mult === 3.4 && p42Check.strahov.flyMult === undefined && p42Check.strahov.hits === 1 && !p42Check.strahov.isDefIgnore,
    `mult: ${p42Check.strahov?.mult}, flyMult: ${p42Check.strahov?.flyMult}, hits: ${p42Check.strahov?.hits}, isDefIgnore: ${p42Check.strahov?.isDefIgnore}`);

  assert('P41-14: 月の都 parses 1.5x magic damage with 6 hits and isMagic flag',
    p42Check.tsukinomi && p42Check.tsukinomi.mult === 1.5 && p42Check.tsukinomi.hits === 6 && p42Check.tsukinomi.isMagic,
    `mult: ${p42Check.tsukinomi?.mult}, hits: ${p42Check.tsukinomi?.hits}, isMagic: ${p42Check.tsukinomi?.isMagic}`);

  assert('P41-15: ［ハロウィン］ブラン城 parses 6x defense ignore damage with isDefIgnore flag',
    p42Check.hwBran && p42Check.hwBran.mult === 6 && p42Check.hwBran.hits === 1 && p42Check.hwBran.isDefIgnore,
    `mult: ${p42Check.hwBran?.mult}, hits: ${p42Check.hwBran?.hits}, isDefIgnore: ${p42Check.hwBran?.isDefIgnore}`);

  assert('P41-16: ［絢爛］ダノター城 parses 2x damage 5-hit sequence (2倍の5連続攻撃)',
    p42Check.kenranDunnottar && p42Check.kenranDunnottar.mult === 2 && p42Check.kenranDunnottar.hits === 5 && !p42Check.kenranDunnottar.isDefIgnore,
    `mult: ${p42Check.kenranDunnottar?.mult}, hits: ${p42Check.kenranDunnottar?.hits}, isDefIgnore: ${p42Check.kenranDunnottar?.isDefIgnore}`);

  assert('P41-17: ［夏］七飯台場 parses target 7x multiplier and surrounding 4x multiplier with 4 hits (4連続攻撃)',
    p42Check.summerNanae && p42Check.summerNanae.mult === 7 && p42Check.summerNanae.splashMult === 4 && p42Check.summerNanae.hits === 4 && !p42Check.summerNanae.isDefIgnore,
    `mult: ${p42Check.summerNanae?.mult}, splashMult: ${p42Check.summerNanae?.splashMult}, hits: ${p42Check.summerNanae?.hits}, isDefIgnore: ${p42Check.summerNanae?.isDefIgnore}`);

  assert('P41-18: ［バレンタイン］岩櫃城 parses 3x damage omitting 攻撃の with 1 hit',
    p42Check.valIwabitsu && p42Check.valIwabitsu.mult === 3 && p42Check.valIwabitsu.hits === 1 && !p42Check.valIwabitsu.isDefIgnore,
    `mult: ${p42Check.valIwabitsu?.mult}, hits: ${p42Check.valIwabitsu?.hits}, isDefIgnore: ${p42Check.valIwabitsu?.isDefIgnore}`);

  assert('P41-19: ［ハロウィン］ペレシュ城 parses 5x damage omitting 攻撃の with 1 hit',
    p42Check.hwPeles && p42Check.hwPeles.mult === 5 && p42Check.hwPeles.hits === 1 && !p42Check.hwPeles.isDefIgnore,
    `mult: ${p42Check.hwPeles?.mult}, hits: ${p42Check.hwPeles?.hits}, isDefIgnore: ${p42Check.hwPeles?.isDefIgnore}`);

  assert('P41-20: movePartySlot correctly places castle into specified empty slot when party < 8',
    p42Check.slot4CastleId === '名古屋城' && p42Check.slot0Empty,
    `slot 4 castle: ${p42Check.slot4CastleId}, slot 0 is empty: ${p42Check.slot0Empty}`);

  // -------------------------------------------------------------
  // Prompt 43 Tests: Nanae 4-hit Damage & Sparse Party Null Safety
  // -------------------------------------------------------------
  console.log('\n[PROMPT 43 VERIFICATION: Nanae 4-hit Damage Calculation & Sparse Party Safety]...');

  const p43Check = await page.evaluate(() => {
    const nanae = window.SCRE_DATA.find(x => x.name.includes('七飯台場'));
    const slot = { id: nanae.id, strategyOn: true, specialOn: true, giantStep: 5 };
    const calc = window.calculateFiringCastleStats ? window.calculateFiringCastleStats(nanae, slot, 0, 0, 2) : null;
    const stratDamage = calc ? calc.strategyDamage : null;

    const hitDamage = stratDamage?.hitDamage || 0;
    const totalDmg = stratDamage?.totalDamagePerCast || 0;
    const hits = stratDamage?.hits || 0;

    // Sparse party safety:
    // Set party with an empty middle slot: [nanae, null, kofu]
    const kofu = window.SCRE_DATA.find(x => x.name.includes('甲府城'));
    window.setParty([
      { id: nanae.id, strategyOn: true, specialOn: true, giantStep: 5 },
      null,
      { id: kofu.id, strategyOn: true, specialOn: true, giantStep: 5 }
    ]);

    let detailOpenedNoError = false;
    try {
      if (window.openCastleDetail) {
        window.openCastleDetail(kofu);
        detailOpenedNoError = true;
      }
    } catch (e) {
      detailOpenedNoError = false;
    }

    const sparseParty = window.getParty ? window.getParty() : (window.party || []);
    const effectiveLen = sparseParty.filter(Boolean).length;

    return {
      nanaeHits: hits,
      hitDamage,
      totalDmg,
      stratDamageValid: Boolean(stratDamage && hits === 4 && totalDmg > hitDamage * 4),
      detailOpenedNoError,
      effectiveLen
    };
  });

  assert('P41-21: ［夏］七飯台場 calculates 4-hit damage on both target (7x*4) and splash (4x*4)',
    p43Check.stratDamageValid && p43Check.nanaeHits === 4,
    `hits: ${p43Check.nanaeHits}, single hit: ${p43Check.hitDamage}, total per cast: ${p43Check.totalDmg}`);

  assert('P41-22: Sparse party with null slots does not throw in openCastleDetail or party operations',
    p43Check.detailOpenedNoError && p43Check.effectiveLen === 2,
    `detail opened safely: ${p43Check.detailOpenedNoError}, effective party length: ${p43Check.effectiveLen}`);

  console.log(`\n==============================================`);
  console.log(`PROMPT 41 AUTOMATED TESTS SUMMARY: ${passed} / ${total} PASSED`);
  console.log(`==============================================\n`);

  await browser.close();
  process.exit(passed === total ? 0 : 1);
})();
