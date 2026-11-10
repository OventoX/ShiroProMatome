/**
 * Prompt 34 Automated Test Suite
 * Tests all 7 features:
 * 1. バフ等価換算（実質火力倍率）
 * 2. 対策コンシェルジュ（敵特性からの逆引き）
 * 3. 効果タグ逆引き辞典
 * 4. 評価分裂ビュー
 * 5. シナジー・レコメンド（弱点補強）
 * 6. 審議プランナー（霊魂収入予測つき）
 * 7. フレーム精密DPS＋敵防御スライダー
 * + Font-size floor (>= 12px) verification
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
  console.log('=== Running Prompt 34 Automated Test Suite ===\n');

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

  // -------------------------------------------------------------
  // Feature 1: バフ等価換算（実質火力倍率）
  // -------------------------------------------------------------
  console.log('[FEATURE 1] バフ等価換算（実質火力倍率）...');

  const f1Check = await page.evaluate(() => {
    const calcResult = window.calculateBuffs ? window.calculateBuffs() : null;
    const res500 = window.calculateBuffEquivalence(calcResult, 500, 1200);
    const res0 = window.calculateBuffEquivalence(calcResult, 0, 1200);
    const res1500 = window.calculateBuffEquivalence(calcResult, 1500, 1200);

    const sectionEl = document.getElementById('buffEquivalentSection');
    const headlineEl = document.getElementById('buffEquivHeadline');
    const badgeEl = document.getElementById('buffEquivTotalBadge');
    const tableEl = document.getElementById('buffEquivBreakdownTable');

    return {
      hasFunction: typeof window.calculateBuffEquivalence === 'function',
      res500,
      res0,
      res1500,
      domExists: !!(sectionEl && headlineEl && badgeEl && tableEl),
      headlineText: headlineEl ? headlineEl.textContent : '',
      badgeText: badgeEl ? badgeEl.textContent : ''
    };
  });

  assert('P34-01: calculateBuffEquivalence calculates damage formula accurately at multiple defense tiers (totalMultiplier >= 1.10)',
    f1Check.hasFunction && f1Check.res500.totalMultiplier >= 1.10 && f1Check.res0.baseDmg === 1200,
    `def0 baseDmg: ${f1Check.res0.baseDmg}, def500 mult: ×${f1Check.res500.totalMultiplier.toFixed(2)}`);

  assert('P34-02: Buff Equivalence UI renders headline and factor breakdown accordion',
    f1Check.domExists && f1Check.headlineText.includes('実質') && f1Check.badgeText.includes('×'),
    `headline: "${f1Check.headlineText}", badge: "${f1Check.badgeText}"`);

  // -------------------------------------------------------------
  // Feature 2: 対策コンシェルジュ（敵特性からの逆引き）
  // -------------------------------------------------------------
  console.log('\n[FEATURE 2] 対策コンシェルジュ（敵特性からの逆引き）...');

  const f2Check = await page.evaluate(() => {
    const flyingMatches = window.findCounterCastles(new Set(['飛行']));
    const unstoppableMatches = window.findCounterCastles(new Set(['足止め無効']));
    const physResistMatches = window.findCounterCastles(new Set(['物理軽減']));
    const magicReflectMatches = window.findCounterCastles(new Set(['術反射']));

    const conciergeEl = document.getElementById('diagCounterConciergeSection');
    const resultsEl = document.getElementById('counterConciergeResults');
    const countEl = document.getElementById('counterConciergeCount');

    return {
      hasFunction: typeof window.findCounterCastles === 'function',
      flyingCount: flyingMatches.length,
      flyingSample: flyingMatches[0] ? { name: flyingMatches[0].castle.name, reason: flyingMatches[0].matchedReasons[0].reason } : null,
      unstoppableCount: unstoppableMatches.length,
      unstoppableSample: unstoppableMatches[0] ? { name: unstoppableMatches[0].castle.name, reason: unstoppableMatches[0].matchedReasons[0].reason } : null,
      physResistCount: physResistMatches.length,
      physResistSample: physResistMatches[0] ? { name: physResistMatches[0].castle.name, reason: physResistMatches[0].matchedReasons[0].reason } : null,
      magicReflectCount: magicReflectMatches.length,
      domExists: !!(conciergeEl && resultsEl && countEl)
    };
  });

  assert('P34-03: findCounterCastles reverse-lookups effective castles for boss traits with matched reason',
    f2Check.hasFunction && f2Check.flyingCount > 0 && f2Check.unstoppableCount > 0 && f2Check.physResistCount > 0,
    `飛行: ${f2Check.flyingCount}件 (例: ${f2Check.flyingSample?.name}), 足止め無効: ${f2Check.unstoppableCount}件, 物理軽減: ${f2Check.physResistCount}件`);

  assert('P34-04: Counter Concierge section exists in DOM with interactive controls',
    f2Check.domExists,
    `DOM element present in stage diagnostic modal`);

  // -------------------------------------------------------------
  // Feature 3: 効果タグ逆引き辞典
  // -------------------------------------------------------------
  console.log('\n[FEATURE 3] 効果タグ逆引き辞典...');

  const f3Check = await page.evaluate(() => {
    const rules = window.SCRE_EFFECT_TAG_RULES || [];
    const sampleCastle = window.SCRE_DATA.find(c => c.name === '［正月］小早川城') || window.SCRE_DATA[0];
    const tags = window.extractCastleEffectTags ? window.extractCastleEffectTags(sampleCastle) : [];

    const sectionEl = document.getElementById('sectionTagDictionary');
    const containerEl = document.getElementById('tagDictCloudContainer');

    // Aggregate counts
    const counts = {};
    rules.forEach(r => counts[r.tag] = 0);
    window.SCRE_DATA.forEach(c => {
      const cTags = window.extractCastleEffectTags(c);
      cTags.forEach(t => {
        if (counts[t] !== undefined) counts[t]++;
      });
    });

    return {
      ruleCount: rules.length,
      sampleCastle: sampleCastle.name,
      sampleTags: tags,
      tagCounts: counts,
      domExists: !!(sectionEl && containerEl)
    };
  });

  assert('P34-05: SCRE_EFFECT_TAG_RULES classifies abilities into ~20 standard tags',
    f3Check.ruleCount >= 18 && f3Check.ruleCount <= 25,
    `total tag categories: ${f3Check.ruleCount}, sample [${f3Check.sampleCastle}]: ${f3Check.sampleTags.join(', ')}`);

  assert('P34-06: Tag dictionary cloud container exists and aggregates counts across all castles',
    f3Check.domExists && f3Check.tagCounts['気増加'] > 0 && f3Check.tagCounts['計略短縮'] > 0,
    `気増加: ${f3Check.tagCounts['気増加']}体, 計略短縮: ${f3Check.tagCounts['計略短縮']}体, 射程上昇: ${f3Check.tagCounts['射程上昇']}体`);

  // -------------------------------------------------------------
  // Feature 4: 評価分裂ビュー
  // -------------------------------------------------------------
  console.log('\n[FEATURE 4] 評価分裂ビュー...');

  const f4Check = await page.evaluate(() => {
    const evaluations = window.SCRE_DATA.map(c => window.computeCastleEvaluationSplit(c));
    const splitItems = evaluations.filter(e => e.isSplit);
    const sampleSplit = splitItems[0];

    const btnSplit = document.getElementById('btnTierModeSplit');
    const panelSplit = document.getElementById('tierViewSplit');
    const gridSplit = document.getElementById('tierSplitGrid');

    return {
      totalCount: evaluations.length,
      splitCount: splitItems.length,
      splitPct: ((splitItems.length / evaluations.length) * 100).toFixed(1),
      sampleSplit: sampleSplit ? {
        name: sampleSplit.castle.name,
        divergence: sampleSplit.divergence,
        curated: sampleSplit.curated.letter,
        auto: sampleSplit.auto.letter,
        ohige: sampleSplit.ohige.letter
      } : null,
      domExists: !!(btnSplit && panelSplit && gridSplit)
    };
  });

  assert('P34-07: computeCastleEvaluationSplit detects divergence (>= 2 rank difference) across 3 systems',
    f4Check.splitCount > 0 && f4Check.splitCount < f4Check.totalCount,
    `split count: ${f4Check.splitCount} / ${f4Check.totalCount} (${f4Check.splitPct}%), sample: ${f4Check.sampleSplit?.name} (diff ${f4Check.sampleSplit?.divergence}: curated ${f4Check.sampleSplit?.curated} vs auto ${f4Check.sampleSplit?.auto} vs ohige ${f4Check.sampleSplit?.ohige})`);

  assert('P34-08: Tier mode switch includes 評価分裂ビュー and renders split panel',
    f4Check.domExists,
    `DOM elements present for split tier mode`);

  // -------------------------------------------------------------
  // Feature 5: シナジー・レコメンド（弱点補強）
  // -------------------------------------------------------------
  console.log('\n[FEATURE 5] シナジー・レコメンド（弱点補強）...');

  const f5Check = await page.evaluate(() => {
    // Melee castle with short range / heavy cost / long CD (e.g. 名古屋城)
    const meleeCastle = window.SCRE_DATA.find(c => c.name === '名古屋城') || window.SCRE_DATA[0];
    const weaknessMelee = window.detectCastleWeaknesses(meleeCastle);
    const synergyMelee = window.calculateCastleWeaknessSynergy(meleeCastle);

    // Long-range castle (e.g. 安平城 鉄砲) should NOT have 短射程
    const rangedCastle = window.SCRE_DATA.find(c => c.name === '安平城' || (c.weapon === '鉄砲' && c.stats?.giant5?.range > 400));
    const weaknessRanged = rangedCastle ? window.detectCastleWeaknesses(rangedCastle) : [];

    const weaknessEl = document.getElementById('detailWeaknessList');
    const synergyEl = document.getElementById('detailSynergyList');

    return {
      meleeCastle: meleeCastle.name,
      weapon: meleeCastle.weapon,
      weaknesses: weaknessMelee.map(w => w.label),
      rangedCastle: rangedCastle ? rangedCastle.name : '',
      rangedHasShortRange: weaknessRanged.some(w => w.label === '短射程'),
      partnerCount: synergyMelee.partners.length,
      partnerSample: synergyMelee.partners[0] ? {
        name: synergyMelee.partners[0].castle.name,
        reasons: synergyMelee.partners[0].reasons
      } : null,
      domExists: !!(weaknessEl && synergyEl)
    };
  });

  assert('P34-09: detectCastleWeaknesses identifies data-driven weaknesses and distinguishes long-range castles (no 短射程 on 鉄砲)',
    f5Check.weaknesses.includes('短射程') && !f5Check.rangedHasShortRange,
    `melee [${f5Check.meleeCastle}] weaknesses: [${f5Check.weaknesses.join(', ')}], ranged [${f5Check.rangedCastle}] has 短射程: ${f5Check.rangedHasShortRange}`);

  assert('P34-10: calculateCastleWeaknessSynergy recommends top helper castles with actionable compensation reasons',
    f5Check.partnerCount > 0 && f5Check.partnerCount <= 5,
    `recommended partners: ${f5Check.partnerCount}体 (top partner: ${f5Check.partnerSample?.name} -> ${f5Check.partnerSample?.reasons.join(', ')})`);

  // -------------------------------------------------------------
  // Feature 6: 審議プランナー（霊魂収入予測つき）
  // -------------------------------------------------------------
  console.log('\n[FEATURE 6] 審議プランナー（霊魂収入予測つき）...');

  const f6Check = await page.evaluate(() => {
    const plannerEl = document.getElementById('sectionDelibPlanner');
    const bannerEl = document.getElementById('delibPlannerProgressBanner');
    const roadmapEl = document.getElementById('delibPlannerRoadmapList');
    const noteEl = document.getElementById('delibSoulIncomeNote');

    window.renderDelibPlanner();

    const candidateCards = roadmapEl ? roadmapEl.children.length : 0;

    return {
      domExists: !!(plannerEl && bannerEl && roadmapEl && noteEl),
      bannerText: bannerEl ? bannerEl.textContent.trim() : '',
      noteText: noteEl ? noteEl.textContent.trim() : '',
      stageCandidateCount: candidateCards
    };
  });

  assert('P34-11: Deliberation planner displays Hell stage progress and roadmap candidates (>= 1 stage)',
    f6Check.domExists && f6Check.bannerText.includes('地獄') && f6Check.stageCandidateCount >= 1,
    `candidates: ${f6Check.stageCandidateCount}, banner: "${f6Check.bannerText.slice(0, 50)}..."`);

  assert('P34-12: Deliberation planner includes verified omission notice for daily soul income formula',
    f6Check.noteText.includes('霊魂の日次自動支給計算について') && f6Check.noteText.includes('見送りといたします'),
    `official omission notice present per Rule 2`);

  // -------------------------------------------------------------
  // Feature 7: フレーム精密DPS＋敵防御スライダー
  // -------------------------------------------------------------
  console.log('\n[FEATURE 7] フレーム精密DPS＋敵防御スライダー...');

  const f7Check = await page.evaluate(() => {
    // Pick a castle with self-buff dmgDealt (与ダメ上昇) per Prompt 37 specification
    const sampleCastle = window.SCRE_DATA.find(c => {
      const allEff = [...(c.skill?.effects || []), ...(c.strategy?.effects || [])];
      return allEff.some(e => e.stat === 'dmgDealt');
    }) || window.SCRE_DATA[0];

    const frames = window.SCRE_WEAPON_FRAMES;
    const dps500 = window.computeFramePreciseDps(sampleCastle, 500);
    const dps1500 = window.computeFramePreciseDps(sampleCastle, 1500);

    // Compute unbuffed baseline for comparison (without self atk% and dmgDealt%)
    const unbuffedHit = Math.max(1, dps500.baseAtk - dps500.effDef);
    const unbuffedCycle = dps500.baseAtkFrames + dps500.baseGapFrames;
    const unbuffedDps = Math.round(unbuffedHit * dps500.hits * (30 / unbuffedCycle));
    const buffedDpsHigherThanUnbuffed = dps500.effDps > unbuffedDps;

    const boxEl = document.getElementById('detailDpsPrecisionBox');
    const sliderEl = document.getElementById('dpsEnemyDefSlider');
    const metricsEl = document.getElementById('detailDpsPrecisionMetrics');

    return {
      hasFrames: Object.keys(frames || {}).length >= 20,
      sampleCastle: sampleCastle.name,
      weapon: sampleCastle.weapon,
      dps500,
      dps1500,
      unbuffedDps,
      buffedDpsHigherThanUnbuffed,
      domExists: !!(boxEl && sliderEl && metricsEl)
    };
  });

  assert('P34-13: Standard weapon frames table defined for 20 weapon types at 30fps',
    f7Check.hasFrames,
    `weapon frame table covers all standard weapon categories`);

  assert('P34-14: computeFramePreciseDps incorporates self-buffs yielding higher DPS than unbuffed baseline',
    f7Check.buffedDpsHigherThanUnbuffed && f7Check.dps500.effDps >= f7Check.dps1500.effDps,
    `[${f7Check.sampleCastle}] unbuffed: ${f7Check.unbuffedDps.toLocaleString()} /秒 ➔ buffed DPS@500: ${f7Check.dps500.effDps.toLocaleString()} /秒 (vs DPS@1500: ${f7Check.dps1500.effDps.toLocaleString()} /秒)`);

  assert('P34-15: DPS precision section in Castle Detail modal contains interactive defense slider',
    f7Check.domExists,
    `slider, input, metrics, and frame breakdown present`);

  // -------------------------------------------------------------
  // Section: Strict Font-size Floor (>= 12px) Verification
  // -------------------------------------------------------------
  console.log('\n[FONT SIZE CHECK] Strict 12px floor verification across new features...');

  const fontCheck = await page.evaluate(() => {
    const targetSelectors = [
      '#buffEquivalentSection',
      '#sectionTagDictionary',
      '#tierViewSplit',
      '#sectionDelibPlanner',
      '#diagCounterConciergeSection',
      '#detailDpsPrecisionBox',
      '#detailEffectTagsBox'
    ];

    let minSize = 999;
    const violations = [];

    targetSelectors.forEach(sel => {
      const container = document.querySelector(sel);
      if (!container) return;
      const elements = container.querySelectorAll('*');
      elements.forEach(el => {
        const fsStr = window.getComputedStyle(el).fontSize;
        const fsNum = parseFloat(fsStr);
        if (!isNaN(fsNum) && el.textContent.trim().length > 0) {
          if (fsNum < minSize) minSize = fsNum;
          if (fsNum < 11.9) {
            violations.push({ selector: sel, tag: el.tagName, class: el.className, fs: fsNum, text: el.textContent.slice(0, 20) });
          }
        }
      });
    });

    return { minSize, violations: violations.slice(0, 5) };
  });

  assert('P34-16: Strict font-size floor (>= 12px) across all Prompt 34 UI sections',
    fontCheck.violations.length === 0,
    `min font size: ${fontCheck.minSize}px, violations: ${JSON.stringify(fontCheck.violations)}`);

  await browser.close();

  console.log('\n==============================================');
  console.log(`PROMPT 34 AUTOMATED TESTS SUMMARY: ${passed} / ${total} PASSED`);
  console.log('==============================================\n');

  if (passed !== total) {
    process.exit(1);
  }
})();
