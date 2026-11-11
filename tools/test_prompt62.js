/**
 * Prompt 62 Automated Test Suite
 * 対抗策ファインダーの拡張（既存「対策コンシェルジュ」の監査と拡充）
 * - P62-01: 監査対象の全カテゴリがUIのカテゴリ一覧（対策コンシェルジュ & 効果タグ辞典）に存在する
 * - P62-02: 各カテゴリで少なくとも1体の対抗城娘が抽出され、実測件数と一致する
 * - P62-03: 抽出された城娘が、表示された対抗手段（特技／計略／特殊能力名）を実際に所持している（data.jsと照合）、かつ特技/計略・常時/発動時のみを区別表示している
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
    console.log(`[PASS] ${title}${detail ? ' — ' + detail : ''}`);
  } else {
    console.error(`[FAIL] ${title}${detail ? ' — ' + detail : ''}`);
  }
}

(async () => {
  console.log('=== Running Prompt 62 Automated Test Suite ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', d => d.dismiss());
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR:', msg.text());
    }
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  const EXPECTED_CONCIERGE_CATEGORIES = [
    '飛行',
    '高防御',
    '物理軽減',
    '潜伏・隠密',
    '足止め無効',
    '状態異常付与',
    '状態異常対策',
    '状態異常無効',
    '射程減少審議',
    '計略消費気増加審議',
    '術反射',
    '割合ダメージ',
    '能力低下無効審議'
  ];

  // -------------------------------------------------------------------------
  // P62-01: 監査対象の全カテゴリがUIのカテゴリ一覧に存在する
  // -------------------------------------------------------------------------
  const p62_01 = await page.evaluate((expectedTraits) => {
    const btns = Array.from(document.querySelectorAll('#counterTraitBtns .counter-trait-btn'));
    const uiTraits = btns.map(b => b.dataset.trait);
    const defKeys = Object.keys(window.SCRE_COUNTER_TRAIT_DEFS || {});
    const missingInUi = expectedTraits.filter(t => !uiTraits.includes(t));
    const missingInDefs = expectedTraits.filter(t => !defKeys.includes(t));

    const tagChips = Array.from(document.querySelectorAll('#tagDictCloudContainer .tag-dict-chip')).map(c => c.dataset.tag);
    const addedTags = ['対空・飛行特効', '隠密解除・看破', '計略消費気軽減', '敵被ダメ上昇'];
    const missingTags = addedTags.filter(t => !tagChips.includes(t));

    return {
      uiTraitCount: uiTraits.length,
      defKeyCount: defKeys.length,
      missingInUi,
      missingInDefs,
      tagChipCount: tagChips.length,
      missingTags
    };
  }, EXPECTED_CONCIERGE_CATEGORIES);

  assert(
    'P62-01: 監査対象の全13カテゴリが対策コンシェルジュUIボタン・定義に存在し、効果タグ逆引き辞典にも追加タグが存在する',
    p62_01.missingInUi.length === 0 && p62_01.missingInDefs.length === 0 && p62_01.missingTags.length === 0,
    `UIボタン数=${p62_01.uiTraitCount}, 定義数=${p62_01.defKeyCount}, タグ辞典数=${p62_01.tagChipCount}`
  );

  // -------------------------------------------------------------------------
  // P62-02: 各カテゴリで少なくとも1体の対抗城娘が抽出される
  // -------------------------------------------------------------------------
  const p62_02 = await page.evaluate((expectedTraits) => {
    const counts = {};
    const samples = {};
    for (const tr of expectedTraits) {
      const res = window.findCounterCastles(new Set([tr]));
      counts[tr] = res.length;
      samples[tr] = res[0] ? { name: res[0].castle.name, reason: res[0].matchedReasons[0].reason } : null;
    }

    const tagCounts = {};
    const rules = window.SCRE_EFFECT_TAG_RULES || [];
    rules.forEach(r => tagCounts[r.tag] = 0);
    window.SCRE_DATA.forEach(c => {
      const tags = window.extractCastleEffectTags(c);
      tags.forEach(t => { if (tagCounts[t] !== undefined) tagCounts[t]++; });
    });

    return { counts, samples, tagCounts };
  }, EXPECTED_CONCIERGE_CATEGORIES);

  const zeroTraitCategories = EXPECTED_CONCIERGE_CATEGORIES.filter(tr => (p62_02.counts[tr] || 0) < 1);
  assert(
    'P62-02: 全13カテゴリそれぞれで少なくとも1体以上の対抗城娘が実データから抽出される',
    zeroTraitCategories.length === 0 &&
      p62_02.counts['飛行'] === 104 &&
      p62_02.counts['潜伏・隠密'] === 7 &&
      p62_02.counts['状態異常付与'] === 48 &&
      p62_02.counts['状態異常対策'] === 29 &&
      p62_02.counts['射程減少審議'] === 514 &&
      p62_02.counts['計略消費気増加審議'] === 137,
    `飛行=${p62_02.counts['飛行']}件, 高防御=${p62_02.counts['高防御']}件, 潜伏・隠密=${p62_02.counts['潜伏・隠密']}件, 足止め無効=${p62_02.counts['足止め無効']}件, 状態異常付与=${p62_02.counts['状態異常付与']}件, 状態異常対策=${p62_02.counts['状態異常対策']}件, 射程減少審議=${p62_02.counts['射程減少審議']}件, 計略消費気増加審議=${p62_02.counts['計略消費気増加審議']}件`
  );

  // -------------------------------------------------------------------------
  // P62-03: 抽出された城娘が、表示された対抗手段（特技／計略名）を実際に所持している（data.jsと照合）
  // -------------------------------------------------------------------------
  const p62_03 = await page.evaluate((expectedTraits) => {
    let checkedCount = 0;
    const mismatches = [];
    const formatViolations = [];

    function castleOwnsAbility(c, rawAbilityName, cleanName) {
      const allRawNames = [];
      if (c.skill && c.skill.name) allRawNames.push(c.skill.name);
      if (c.allSkills) c.allSkills.forEach(s => { if (s && s.name) allRawNames.push(s.name); });
      if (c.strategy && c.strategy.name) allRawNames.push(c.strategy.name);
      if (c.allStrategies) c.allStrategies.forEach(s => { if (s && s.name) allRawNames.push(s.name); });
      if (c.special && c.special.name) allRawNames.push(c.special.name);
      if (c.allSpecials) c.allSpecials.forEach(s => { if (s && s.name) allRawNames.push(s.name); });

      return allRawNames.some(n => n === rawAbilityName || (cleanName && n.includes(cleanName)));
    }

    for (const tr of expectedTraits) {
      const results = window.findCounterCastles(new Set([tr]));
      for (const item of results) {
        const c = item.castle;
        for (const r of item.matchedReasons) {
          checkedCount++;
          if (!castleOwnsAbility(c, r.rawAbilityName, r.abilityName)) {
            mismatches.push({ castle: c.name, trait: tr, abilityName: r.abilityName, rawAbilityName: r.rawAbilityName });
          }
          const validSource = ['特技', '計略', '特殊能力', '武器種特性'].includes(r.sourceType);
          const validTiming = ['常時', '常時(条件/巨大化)', '発動時のみ'].includes(r.timing);
          const hasFormattedReason = r.reason.includes(r.abilityName) && (r.reason.includes('常時') || r.reason.includes('発動時のみ'));
          if (!validSource || !validTiming || !hasFormattedReason) {
            formatViolations.push({ castle: c.name, trait: tr, reason: r.reason, sourceType: r.sourceType, timing: r.timing });
          }
        }
      }
    }

    // Also verify DOM rendering when clicking a new category button (e.g., 潜伏・隠密)
    const allBtns = Array.from(document.querySelectorAll('#counterTraitBtns .counter-trait-btn'));
    allBtns.forEach(b => {
      if (b.classList.contains('active')) b.click();
    });
    const stealthBtn = document.getElementById('btnTraitStealth');
    if (stealthBtn) stealthBtn.click();

    const domCards = Array.from(document.querySelectorAll('#counterConciergeResults .counter-concierge-card'));
    const firstCardText = domCards[0] ? domCards[0].textContent.replace(/\s+/g, ' ').trim() : '';

    return {
      checkedCount,
      mismatches: mismatches.slice(0, 5),
      mismatchCount: mismatches.length,
      formatViolations: formatViolations.slice(0, 5),
      formatViolationCount: formatViolations.length,
      domCardCount: domCards.length,
      firstCardText
    };
  }, EXPECTED_CONCIERGE_CATEGORIES);

  assert(
    'P62-03: 抽出された全城娘が表示された特技／計略／特殊能力名を実際にdata.js上で所持しており、特技/計略・常時/発動時のみを区別表示している',
    p62_03.checkedCount > 3000 &&
      p62_03.mismatchCount === 0 &&
      p62_03.formatViolationCount === 0 &&
      p62_03.domCardCount === 7 &&
      p62_03.firstCardText.includes('［潜伏・隠密］') === false && // badge uses [潜伏・隠密]
      p62_03.firstCardText.includes('[潜伏・隠密]'),
    `照合総数=${p62_03.checkedCount}件, 不一致=${p62_03.mismatchCount}件, 形式違反=${p62_03.formatViolationCount}件, 潜伏・隠密DOM表示=${p62_03.domCardCount}件 (先頭: "${p62_03.firstCardText.slice(0, 75)}...")`
  );

  await browser.close();

  console.log('\n==============================================');
  console.log(`PROMPT 62 AUTOMATED TESTS SUMMARY: ${passed} / ${total} PASSED`);
  console.log('==============================================\n');

  if (passed !== total) {
    process.exit(1);
  }
})();
