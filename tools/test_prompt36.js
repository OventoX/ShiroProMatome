/**
 * Prompt 36 Automated Test Suite: 射撃訓練場（ダメージバフ検証レンジ）
 *
 * Verifies:
 * 1. DOM Elements Existence & ID integrity (all required IDs in tab-firing-range)
 * 2. Presets & Boss Catalog Integration
 * 3. Attack Interval & Weapon Frame Calculations
 * 4. 1-Hit Damage & Calculation Breakdown Formula
 * 5. 8-Member Party Simulation & Mathematical Invariant (Sum of DPS == Total DPS)
 * 6. Monotonic Decrease on Raising Defense (0 -> 500 -> 1500 -> 3000)
 * 7. Monotonic Decrease on Disabling Active Buffs
 * 8. Snapshot Save & Side-by-Side Comparison
 * 9. Strict Font Size Floor (>= 12px) Verification
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
  console.log('=== Running Prompt 36 Automated Test Suite: 射撃訓練場 ===\n');

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
  // Test 1: DOM Elements Existence & ID Integrity
  // -------------------------------------------------------------
  console.log('[TEST 1] DOM Elements & Navigation...');

  const domCheck = await page.evaluate(() => {
    const requiredIds = [
      "firingRangePartyStatus", "firingRangeDpsHeadline", "btnResetDummySettings",
      "firingRangePresetSelect", "firingRangeDefValText", "firingRangeDefSlider", "firingRangeDefInput",
      "btnHpModeInfinite", "btnHpModeFinite", "firingRangeHpInputRow", "firingRangeHpInput",
      "firingRangeRedValText", "firingRangeRedSlider", "firingRangeRedInput", "firingRangeDurationModeBox",
      "firingSnapshotNameInput", "btnSaveFiringSnapshot", "firingSnapshotListContainer",
      "firingTimerDisplay", "firingTotalDmgDisplay", "firingCurrentDpsDisplay",
      "btnFiringPlayPause", "btnFiringReset",
      "firingStageCanvasContainer", "firingStageCanvas", "firingDamagePopupLayer",
      "firingDummyHpBarBox", "firingDummyNameDisplay", "firingDummyHpText", "firingDummyHpBarFill",
      "firingCastleResultsTbody", "firingBuffContributionList", "firingTimelineSvg",
      "firingSnapshotComparisonBox", "btnCloseSnapshotComparison", "firingSnapshotComparisonContent"
    ];

    const missingIds = requiredIds.filter(id => !document.getElementById(id));
    const tabEl = document.getElementById("tab-firing-range");
    const tabBtn = document.querySelector('[data-tab="tab-firing-range"]');

    return {
      tabExists: !!tabEl,
      tabBtnExists: !!tabBtn,
      tabActive: tabEl ? tabEl.classList.contains("active") : false,
      missingIds,
      totalChecked: requiredIds.length
    };
  });

  assert('P36-01: Firing range tab and all required DOM elements exist',
    domCheck.tabExists && domCheck.tabBtnExists && domCheck.tabActive && domCheck.missingIds.length === 0,
    `missing: ${domCheck.missingIds.join(', ') || 'none (all ' + domCheck.totalChecked + ' found)'}`);

  // -------------------------------------------------------------
  // Test 2: Presets & Boss Catalog Integration
  // -------------------------------------------------------------
  console.log('\n[TEST 2] Presets & Boss Catalog Integration...');

  const presetCheck = await page.evaluate(() => {
    const sel = document.getElementById("firingRangePresetSelect");
    const options = Array.from(sel ? sel.options : []).map(o => ({ value: o.value, text: o.text }));

    const hasDef0 = options.some(o => o.value === "def0");
    const hasDef500 = options.some(o => o.value === "def500");
    const hasDef1500 = options.some(o => o.value === "def1500");
    const hasDef3000 = options.some(o => o.value === "def3000");
    const hasBossCatalog = options.some(o => o.value.startsWith("boss_"));

    // Test selecting a preset
    if (sel) {
      sel.value = "def1500";
      sel.dispatchEvent(new Event("change"));
    }

    const defVal = document.getElementById("firingRangeDefInput") ? document.getElementById("firingRangeDefInput").value : null;

    return {
      optionCount: options.length,
      hasDef0,
      hasDef500,
      hasDef1500,
      hasDef3000,
      hasBossCatalog,
      defAfterSelect: defVal
    };
  });

  assert('P36-02: Presets load standard tiers and Boss Catalog with change handling',
    presetCheck.hasDef0 && presetCheck.hasDef500 && presetCheck.hasDef1500 && presetCheck.hasDef3000 &&
    presetCheck.hasBossCatalog && presetCheck.defAfterSelect === "1500",
    `options: ${presetCheck.optionCount}, selected def: ${presetCheck.defAfterSelect}`);

  // -------------------------------------------------------------
  // Test 3: Attack Interval & Weapon Frame Calculations
  // -------------------------------------------------------------
  console.log('\n[TEST 3] Attack Interval & Weapon Frame Calculations...');

  const frameCheck = await page.evaluate(() => {
    const frames = window.SCRE_WEAPON_FRAMES;
    if (!frames) return { ok: false, reason: "SCRE_WEAPON_FRAMES missing" };

    const sampleKatana = window.getWeaponFrameData("刀");
    const sampleYari = window.getWeaponFrameData("槍");
    const sampleUnknown = window.getWeaponFrameData("未知武器");

    // Test formula calculation
    // Base Katana (Prompt 54: wiki実測値): atk=19, gap=22, total=41 (旧43)
    // AtkSpeed +50%: atk = Math.max(1, Math.round(19 / 1.5)) = 13
    // GapShorten 30%: gap = Math.max(0, Math.round(22 * 0.7)) = 15
    // Cycle = 13 + 15 = 28 frames (旧29)
    // Rate = 30 / 28 = 1.071/s
    const calcSample = window.computeWeaponEffectiveFrames("刀", 50, 30);

    return {
      ok: true,
      weaponCount: Object.keys(frames).length,
      sampleKatana,
      sampleYari,
      sampleUnknown,
      calcSample
    };
  });

  assert('P36-03: Attack intervals and effective frame calculations per 30fps formula',
    frameCheck.ok &&
    frameCheck.weaponCount >= 20 &&
    frameCheck.sampleKatana.total === 41 && // Prompt 54: wiki実測値(19+22=41)
    frameCheck.sampleUnknown.isEstimate === true &&
    frameCheck.calcSample.cycleFrames === 28, // Prompt 54: wiki実測値(13+15=28)
    `weapons: ${frameCheck.weaponCount}, katana cycle @ buff: ${frameCheck.calcSample ? frameCheck.calcSample.cycleFrames : 'err'}f`);

  // -------------------------------------------------------------
  // Test 4: 1-Hit Damage & Calculation Breakdown Formula
  // -------------------------------------------------------------
  console.log('\n[TEST 4] 1-Hit Damage & Breakdown Formula...');

  const dmgCheck = await page.evaluate(() => {
    // Single hit: Math.floor(Math.max(atk * 0.1, atk * mult - def) * postDmg * (1 - red))
    // atk=1000, mult=1.5, def=500, postDmg=1.2, red=0
    // effAtk = 1500 - 500 = 1000 (>= 1000 * 0.1 = 100)
    // final = Math.floor(1000 * 1.2 * 1) = 1200
    const hitRes = window.calculateSingleHitDamage({
      atk: 1000,
      targetMult: 1.5,
      postDmgMult: 1.2,
      defIgnore: false,
      targetDef: 500,
      damageReduction: 0,
      immuneDefIgnore: false
    });

    // With defIgnore:
    // effAtk = 1500 - 0 = 1500
    // final = Math.floor(1500 * 1.2) = 1800
    const hitIgnore = window.calculateSingleHitDamage({
      atk: 1000,
      targetMult: 1.5,
      postDmgMult: 1.2,
      defIgnore: true,
      targetDef: 500,
      damageReduction: 0,
      immuneDefIgnore: false
    });

    return {
      hitRes,
      hitIgnore
    };
  });

  assert('P36-04: Single-hit damage respects floor, defense reduction, and defense ignore',
    dmgCheck.hitRes.damage === 1200 && dmgCheck.hitIgnore.damage === 1800 && dmgCheck.hitRes.breakdown.includes("1,200"),
    `normal dmg: ${dmgCheck.hitRes.damage}, defIgnore dmg: ${dmgCheck.hitIgnore.damage}, formula: "${dmgCheck.hitRes.breakdown}"`);

  // -------------------------------------------------------------
  // Test 5: 8-Member Party Simulation & Mathematical Invariant
  // -------------------------------------------------------------
  console.log('\n[TEST 5] 8-Member Party Simulation & Sum of DPS Invariant...');

  const partyCheck = await page.evaluate(() => {
    // Set target to DEF 500, HP infinite
    const defInput = document.getElementById("firingRangeDefInput");
    if (defInput) {
      defInput.value = 500;
      defInput.dispatchEvent(new Event("change"));
    }

    const state = window.getFiringRangeState ? window.getFiringRangeState() : null;
    const tableBody = document.getElementById("firingCastleResultsTbody");
    const rows = tableBody ? tableBody.querySelectorAll("tr") : [];

    // Sum of individual castle theoretical DPS from state
    const slotDpsSum = state && state.castleSlots ? state.castleSlots.reduce((sum, s) => sum + (s.stat ? s.stat.theoreticalDps : 0), 0) : 0;
    const headlineText = document.getElementById("firingRangeDpsHeadline")?.textContent || "";
    const totalDpsMatch = headlineText.match(/(\d[\d,]*)/);
    const parsedTotalDps = totalDpsMatch ? parseInt(totalDpsMatch[1].replace(/,/g, ''), 10) : 0;
    const diff = Math.abs(slotDpsSum - parsedTotalDps);

    return {
      hasState: !!state,
      slotCount: state && state.castleSlots ? state.castleSlots.length : 0,
      renderedRows: rows.length,
      slotDpsSum,
      parsedTotalDps,
      headlineText,
      diff
    };
  });

  assert('P36-05: 8-Member Party Table renders and Sum of Slot DPS equals Total Party DPS',
    partyCheck.hasState && partyCheck.slotCount === 8 && partyCheck.renderedRows === 8 && partyCheck.diff <= 1,
    `slots: ${partyCheck.slotCount}, slotSum: ${partyCheck.slotDpsSum.toFixed(0)}, headlineDps: ${partyCheck.parsedTotalDps.toFixed(0)}, diff: ${partyCheck.diff}`);

  // -------------------------------------------------------------
  // Test 6: Monotonic Decrease on Raising Defense
  // -------------------------------------------------------------
  console.log('\n[TEST 6] Monotonic Decrease on Raising Defense...');

  const defScalingCheck = await page.evaluate(() => {
    // Disable defIgnore to observe defense scaling across 0, 500, 1500, 3000
    const results = [0, 500, 1500, 3000].map(def => {
      return window.computePartyFiringDps({
        targetDef: def,
        damageReduction: 0,
        targetCount: 1,
        disabledBuffs: new Set(["defIgnore", "def_ignore"]),
        immuneDefIgnore: true
      });
    });

    const isMonotonic = results[0].totalDps >= results[1].totalDps &&
                        results[1].totalDps >= results[2].totalDps &&
                        results[2].totalDps >= results[3].totalDps &&
                        results[0].totalDps > results[3].totalDps;

    return {
      dps0: results[0].totalDps,
      dps500: results[1].totalDps,
      dps1500: results[2].totalDps,
      dps3000: results[3].totalDps,
      isMonotonic
    };
  });

  assert('P36-06: DPS decreases monotonically as defense increases (0 -> 500 -> 1500 -> 3000)',
    defScalingCheck.isMonotonic,
    `DEF 0: ${defScalingCheck.dps0.toFixed(0)}, DEF 500: ${defScalingCheck.dps500.toFixed(0)}, DEF 1500: ${defScalingCheck.dps1500.toFixed(0)}, DEF 3000: ${defScalingCheck.dps3000.toFixed(0)}`);

  // -------------------------------------------------------------
  // Test 7: Monotonic Decrease on Disabling Active Buffs
  // -------------------------------------------------------------
  console.log('\n[TEST 7] Buff Contribution Toggles & Monotonic Impact...');

  const buffCheck = await page.evaluate(() => {
    // Base with all buffs
    const baseRes = window.computePartyFiringDps({
      targetDef: 500,
      damageReduction: 0,
      targetCount: 1,
      disabledBuffs: new Set(),
      immuneDefIgnore: true
    });

    // Disable dmg_dealt_target
    const noDmgMult = window.computePartyFiringDps({
      targetDef: 500,
      damageReduction: 0,
      targetCount: 1,
      disabledBuffs: new Set(["dmg_dealt_target"]),
      immuneDefIgnore: true
    });

    // Disable gap_shorten
    const noGap = window.computePartyFiringDps({
      targetDef: 500,
      damageReduction: 0,
      targetCount: 1,
      disabledBuffs: new Set(["gap_shorten"]),
      immuneDefIgnore: true
    });

    // Disable atk_speed
    const noSpd = window.computePartyFiringDps({
      targetDef: 500,
      damageReduction: 0,
      targetCount: 1,
      disabledBuffs: new Set(["atk_speed"]),
      immuneDefIgnore: true
    });

    // Prompt 38: Verify atk_percent disable on an atk% buffed party (e.g. 姫路城 [atkPercent 35%])
    const atkParty = [{ id: "姫路城", strategyOn: true, specialOn: true }];
    const baseAtkDps = window.computePartyFiringDps({ party: atkParty, targetDef: 0, disabledBuffs: new Set() }).totalDps;
    const noAtkPercDps = window.computePartyFiringDps({ party: atkParty, targetDef: 0, disabledBuffs: new Set(["atk_percent"]) }).totalDps;
    const atkPercDropped = noAtkPercDps < baseAtkDps;

    const buffListEl = document.getElementById("firingBuffContributionList");
    const buffCards = buffListEl ? buffListEl.querySelectorAll(".firing-buff-card") : [];

    return {
      baseDps: baseRes.totalDps,
      noDmgMultDps: noDmgMult.totalDps,
      noGapDps: noGap.totalDps,
      noSpdDps: noSpd.totalDps,
      dmgMultDropped: noDmgMult.totalDps < baseRes.totalDps,
      gapDropped: noGap.totalDps < baseRes.totalDps,
      spdDropped: noSpd.totalDps < baseRes.totalDps,
      baseAtkDps,
      noAtkPercDps,
      atkPercDropped,
      cardCount: buffCards.length
    };
  });

  assert('P36-07: Disabling active buffs individually decreases DPS monotonically with UI toggles present (including atk_percent)',
    buffCheck.dmgMultDropped && buffCheck.gapDropped && buffCheck.spdDropped && buffCheck.atkPercDropped && buffCheck.cardCount > 0,
    `base: ${buffCheck.baseDps.toFixed(0)}, noDmgMult: ${buffCheck.noDmgMultDps.toFixed(0)}, noGap: ${buffCheck.noGapDps.toFixed(0)}, noSpd: ${buffCheck.noSpdDps.toFixed(0)}, atkPercDrop: ${buffCheck.baseAtkDps}➔${buffCheck.noAtkPercDps}, cards: ${buffCheck.cardCount}`);

  // -------------------------------------------------------------
  // Test 8: Snapshot Save & Side-by-Side Comparison
  // -------------------------------------------------------------
  console.log('\n[TEST 8] Snapshot Save & Side-by-Side Comparison...');

  const snapshotCheck = await page.evaluate(() => {
    // Clear test snapshots
    localStorage.removeItem("scre-helper:firing-snapshots:v1");

    // Save snapshot 1: DEF 500
    const titleInput = document.getElementById("firingSnapshotNameInput");
    const saveBtn = document.getElementById("btnSaveFiringSnapshot");
    if (titleInput && saveBtn) {
      titleInput.value = "スナップショットA（通常）";
      saveBtn.click();
    }

    // Change DEF to 1500 and save snapshot 2
    const defInput = document.getElementById("firingRangeDefInput");
    if (defInput && titleInput && saveBtn) {
      defInput.value = 1500;
      defInput.dispatchEvent(new Event("change"));
      titleInput.value = "スナップショットB（高防御）";
      saveBtn.click();
    }

    // Compare snapshots
    const compBtn = document.getElementById("btnCompareSnapshots");
    if (compBtn) compBtn.click();

    const outputBox = document.getElementById("firingSnapshotComparisonBox");
    const content = document.getElementById("firingSnapshotComparisonContent");
    const tableEl = content ? content.querySelector(".firing-comparison-table") : null;
    const rawSnapshots = JSON.parse(localStorage.getItem("scre-helper:firing-snapshots:v1") || "[]");

    return {
      snapshotCount: rawSnapshots.length,
      boxVisible: outputBox ? outputBox.style.display !== "none" : false,
      hasTable: !!tableEl,
      contentHtml: content ? content.innerHTML.slice(0, 150) : ""
    };
  });

  assert('P36-08: Snapshots save to localStorage and compare view renders diff table',
    snapshotCheck.snapshotCount >= 2 && snapshotCheck.boxVisible && snapshotCheck.hasTable,
    `saved: ${snapshotCheck.snapshotCount}, visible: ${snapshotCheck.boxVisible}, table: ${snapshotCheck.hasTable}`);

  // -------------------------------------------------------------
  // Test 9: Strict Font Size Floor (>= 12px) Verification
  // -------------------------------------------------------------
  console.log('\n[TEST 9] Strict Font-size Floor (>= 12px)...');

  const fontCheck = await page.evaluate(() => {
    const tabEl = document.getElementById("tab-firing-range");
    if (!tabEl) return { ok: false, reason: "tab missing" };

    const elements = tabEl.querySelectorAll("*");
    const violations = [];
    let minSize = 999;

    elements.forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (['script', 'style', 'svg', 'path', 'g', 'defs', 'canvas'].includes(tag)) return;
      const text = el.textContent ? el.textContent.trim() : "";
      if (!text) return; // skip empty containers

      const style = window.getComputedStyle(el);
      const fs = parseFloat(style.fontSize);
      if (!isNaN(fs)) {
        if (fs < minSize) minSize = fs;
        if (fs < 11.99) { // allow 0.01 margin for float precision
          violations.push({
            tag,
            id: el.id,
            className: el.className,
            fontSize: style.fontSize,
            text: text.slice(0, 30)
          });
        }
      }
    });

    return {
      totalElementsChecked: elements.length,
      minSize,
      violations: violations.slice(0, 5)
    };
  });

  assert('P36-09: Strict font-size floor (>= 12px) across all Firing Range elements',
    fontCheck.violations && fontCheck.violations.length === 0,
    `min size: ${fontCheck.minSize}px, violations: ${JSON.stringify(fontCheck.violations)}`);

  // -------------------------------------------------------------
  // Test 10: 鼓舞（shareAtk）DPS 反映回帰テスト (Prompt 38)
  // -------------------------------------------------------------
  console.log('\n[TEST 10] 鼓舞（shareAtk）DPS 反映回帰テスト...');

  const shareCheck = await page.evaluate(() => {
    const duat = window.SCRE_DATA.find(x => x.name === 'ドゥアト');
    const nagoya = window.SCRE_DATA.find(x => x.name === '名古屋城');
    const shareParty = [
      { id: 'ドゥアト', strategyOn: true, specialOn: true },
      { id: '名古屋城', strategyOn: false, specialOn: false }
    ];

    const withShare = window.computePartyFiringDps({ party: shareParty, targetDef: 500, disabledBuffs: new Set() });
    const noShare = window.computePartyFiringDps({ party: shareParty, targetDef: 500, disabledBuffs: new Set(['share_atk']) });

    const calcData = window.calculateBuffs(shareParty);
    const stWithShare = window.calculateFiringCastleStats(nagoya, shareParty[1], 500, 0, 1, new Set(), false, calcData);
    const stNoShare = window.calculateFiringCastleStats(nagoya, shareParty[1], 500, 0, 1, new Set(['share_atk']), false, calcData);

    return {
      withShareDps: withShare.totalDps,
      noShareDps: noShare.totalDps,
      dpsIncreased: withShare.totalDps > noShare.totalDps,
      nagoyaAtkWithShare: stWithShare.finalAtk,
      nagoyaAtkNoShare: stNoShare.finalAtk,
      atkIncreased: stWithShare.finalAtk > stNoShare.finalAtk
    };
  });

  assert('P36-10: 鼓舞（shareAtk）が攻撃力および射撃訓練場DPSに正常に反映される',
    shareCheck.dpsIncreased && shareCheck.atkIncreased,
    `Nagoya Atk: ${shareCheck.nagoyaAtkNoShare} ➔ ${shareCheck.nagoyaAtkWithShare} (+${shareCheck.nagoyaAtkWithShare - shareCheck.nagoyaAtkNoShare}), Party DPS: ${shareCheck.noShareDps} ➔ ${shareCheck.withShareDps}`);

  // -------------------------------------------------------------
  // Test 11: 地獄地形ボーナス 1.3倍 回帰テスト (Prompt 38)
  // -------------------------------------------------------------
  console.log('\n[TEST 11] 地獄地形ボーナス 1.3倍 回帰テスト...');

  const hellCheck = await page.evaluate(() => {
    const enma = window.SCRE_DATA.find(x => x.name === '閻魔庁');
    const customParty = [{ id: '閻魔庁', strategyOn: false, specialOn: false }];

    const calcNoTerrain = window.calculateBuffs(customParty, '');
    const stNoTerrain = window.calculateFiringCastleStats(enma, customParty[0], 0, 0, 1, new Set(), false, calcNoTerrain);

    const calcHell = window.calculateBuffs(customParty, '地獄');
    const stHell = window.calculateFiringCastleStats(enma, customParty[0], 0, 0, 1, new Set(), false, calcHell);

    const expectedHellAtk = Math.floor(stNoTerrain.finalAtk * 1.3);
    const expectedPlainAtk = Math.floor(stNoTerrain.finalAtk * 1.25);
    const isExact130 = stHell.finalAtk === expectedHellAtk;
    const isHigherThan125 = stHell.finalAtk > expectedPlainAtk;

    return {
      name: enma.name,
      baseAtk: stNoTerrain.finalAtk,
      hellAtk: stHell.finalAtk,
      expectedHellAtk,
      expectedPlainAtk,
      isExact130,
      isHigherThan125
    };
  });

  assert('P36-11: 地獄地形で一致する城娘の攻撃力が通常地形(1.25倍)ではなく1.3倍で計算される',
    hellCheck.isExact130 && hellCheck.isHigherThan125,
    `[${hellCheck.name}] Base: ${hellCheck.baseAtk} ➔ Hell: ${hellCheck.hellAtk} (1.3x exact = ${hellCheck.expectedHellAtk}, 1.25x would be ${hellCheck.expectedPlainAtk})`);

  console.log('\n======================================================');
  console.log(`PROMPT 36 AUTOMATED TESTS SUMMARY: ${passed} / ${total} PASSED`);
  console.log('======================================================\n');

  await browser.close();
  process.exit(total === passed ? 0 : 1);
})();
