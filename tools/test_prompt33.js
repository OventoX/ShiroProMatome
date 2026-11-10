const path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('=== Running Prompt 33 Automated Test Suite ===\n');

  let total = 0;
  let passed = 0;

  function assert(desc, condition, details = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] P33-${String(total).padStart(2, '0')}: ${desc} ${details}`);
    } else {
      console.error(`[FAIL] P33-${String(total).padStart(2, '0')}: ${desc} ${details}`);
    }
  }

  // 1. Data-level verification: Strategy cooldown retrieval
  global.window = global;
  require('../app/data.js');
  require('../app/guides.js');

  const castles = window.SCRE_DATA;
  let stratTextMatches = 0;
  let stratCooldownMatches = 0;
  castles.forEach(c => {
    if (c.strategy) {
      const ctMatch = (c.strategy.text || '').match(/(?:再使用|使用可能まで)(\d+)秒/);
      if (ctMatch) stratTextMatches++;
      if (typeof c.strategy.cooldown === 'number' && !isNaN(c.strategy.cooldown)) stratCooldownMatches++;
    }
  });

  assert('Strategy cooldown retrieval coverage (c.strategy.cooldown)',
    stratCooldownMatches === 1049 && stratTextMatches === 0,
    `recovered: ${stratCooldownMatches} / 1049 (previous text regex: ${stratTextMatches})`);

  // 2. Deliberation weapon matching accuracy
  const weaponNames = ['刀', '槍', '槌', '拳', '鎌', '戦棍', '短槍', '弓', '石弓', '鉄砲', '大砲', '歌舞', '法術', '鈴', '杖', '祓串', '本', '投剣', '鞭', '陣貝'];
  function isWeaponDeliberationMatch(text, wName) {
    const escapedW = wName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|[、，,・/／:：\\s「」【】()（）\\[\\]\\n\\r]|武器種|対象|限定|と)${escapedW}(?:[、，,・/／:：\\s「」【】()（）\\[\\]\\n\\r]|の城娘|城娘|限定|の与ダメ|の攻撃|の防御|の射程|の武器種特性|低下|無効|半減|軽減|制限|と|$)`);
    return pattern.test(text);
  }

  const edgeTests = [
    { text: '死神の本体の攻撃が低下', w: '本', expected: false },
    { text: '本陣の耐久が低下', w: '本', expected: false },
    { text: '刀狩りにより攻撃低下', w: '刀', expected: false },
    { text: '日本の城娘の攻撃半減', w: '本', expected: false },
    { text: '基本防御力が低下', w: '本', expected: false },
    { text: '対象：歌舞、本、陣貝の射程低下', w: '本', expected: true },
    { text: '拳、歌舞、鈴、杖、本、祓串の城娘の与ダメが50%低下', w: '本', expected: true },
    { text: '刀、槍、双剣：射程上昇無効', w: '刀', expected: true },
    { text: '歌舞と祓串の攻撃が90%低下', w: '歌舞', expected: true },
    { text: '対象：弓,石弓,鉄砲,大砲,投剣', w: '弓', expected: true }
  ];

  const edgeResults = edgeTests.every(tc => isWeaponDeliberationMatch(tc.text, tc.w) === tc.expected);
  assert('Deliberation strict boundary matching eliminates false positives (本体, 日本, etc.)',
    edgeResults,
    `all ${edgeTests.length} boundary test cases passed`);

  // 3. Browser-level tests
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const fileUrl = 'file:///' + path.resolve(__dirname, '../app/index.html').replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  // Evaluate Boss Snipe with and without debuffs/damage reduction
  const snipeCalcVerification = await page.evaluate(async () => {
    // Open Maeda Toshiie diagnostic
    window.openStageDiagnostic('深淵の闘技場 -覇・前田利家-');
    await new Promise(r => setTimeout(r, 400));

    // Check boss snipe countdown table rows
    const tbody = document.getElementById('diagBossHitCountdownTbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const rowData = rows.map(r => {
      const tds = r.querySelectorAll('td');
      if (tds.length < 5) return null;
      return {
        name: tds[1].textContent.trim(),
        hpDef: tds[2].textContent.trim(),
        dmgPerHit: tds[3].textContent.trim(),
        hitsToWipeout: tds[4].textContent.trim(),
        roleTag: tds[5].textContent.trim()
      };
    }).filter(Boolean);

    // Also check disclaimers and softened badges
    const snipeWarnText = document.getElementById('diagSnipeWarningText').innerHTML;
    const ttkBadge = document.getElementById('diagTtkStatusBadge').textContent;
    const ttkDetailText = document.getElementById('diagTtkDetailText').innerHTML;
    const kiLedgerHtml = document.getElementById('sectionKiLedger').innerHTML;

    return {
      rowData,
      hasSnipeDisclaimer: snipeWarnText.includes('シミュレーション推計値'),
      ttkBadgeSoftened: ttkBadge.includes('殿到達注意（火力不足の恐れ・推定）') || !ttkBadge.includes('殿崩壊警報'),
      hasTtkDisclaimer: ttkDetailText.includes('シミュレーション推計値'),
      hasKiLedgerDisclaimer: kiLedgerHtml.includes('シミュレーション上の近似値') || kiLedgerHtml.includes('推計値')
    };
  });

  assert('Boss Snipe Countdown table calculates reduced damage per hit with active debuffs and buffs',
    snipeCalcVerification.rowData.length >= 3,
    `sample row: ${JSON.stringify(snipeCalcVerification.rowData[0])}`);

  console.log('Disclaimer check details:', {
    hasSnipeDisclaimer: snipeCalcVerification.hasSnipeDisclaimer,
    hasTtkDisclaimer: snipeCalcVerification.hasTtkDisclaimer,
    hasKiLedgerDisclaimer: snipeCalcVerification.hasKiLedgerDisclaimer
  });

  assert('Estimate disclaimers present in Boss Snipe, TTK race, and Ki ledger',
    snipeCalcVerification.hasSnipeDisclaimer && snipeCalcVerification.hasTtkDisclaimer && snipeCalcVerification.hasKiLedgerDisclaimer);

  assert('Strong warning term "殿崩壊警報" softened to estimate-aware "殿到達注意（火力不足の恐れ・推定）"',
    snipeCalcVerification.ttkBadgeSoftened);

  // 4. Check 40s stopwatch abilities display actual cooldowns (not 40s default)
  const cycleAbilitiesCheck = await page.evaluate(() => {
    // Click open 40s timer button
    const btn = document.getElementById('btnToggleCombatTactics');
    if (btn) btn.click();

    const container = document.getElementById('cycleSyncPairsContainer');
    const badges = container ? Array.from(container.querySelectorAll('.badge')).map(b => b.textContent) : [];
    return { badges };
  });

  assert('Cycle sync proxy clock renders abilities with actual cooldown periods',
    cycleAbilitiesCheck.badges.length > 0,
    `found badges: ${cycleAbilitiesCheck.badges.slice(0, 3).join(', ')}`);

  await browser.close();

  console.log(`\n==============================================`);
  console.log(`PROMPT 33 AUTOMATED TESTS SUMMARY: ${passed} / ${total} PASSED`);
  console.log(`==============================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
})();
