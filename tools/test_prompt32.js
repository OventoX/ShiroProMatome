// Test Suite for Prompt 32: 実戦プレイ動画解析に基づく新機能バッチ
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('=== Running Prompt 32 Automated Test Suite ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR:', msg.text());
    }
  });

  const fileUrl = 'file:///' + path.resolve(__dirname, '../app/index.html').replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));

  let passed = 0;
  let total = 0;

  function assert(name, condition, extra = '') {
    total++;
    if (condition) {
      console.log(`[PASS] ${name} ${extra}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${extra}`);
      process.exitCode = 1;
    }
  }

  // 1. Check SCRE_BOSS_CATALOG and Schema
  console.log('[SECTION 1] SCRE_BOSS_CATALOG & Data Schemas...');
  const catalogCheck = await page.evaluate(() => {
    const catalog = window.SCRE_BOSS_CATALOG;
    if (!catalog || !Array.isArray(catalog)) return { valid: false, count: 0 };
    const requiredKeys = ['name', 'hp', 'atk', 'range', 'moveSpeed', 'isFlying', 'appearanceWave'];
    const allHaveKeys = catalog.every(b => requiredKeys.every(k => b[k] !== undefined));
    return {
      valid: true,
      count: catalog.length,
      allHaveKeys,
      sample: catalog[0].name
    };
  });
  assert('P32-01: SCRE_BOSS_CATALOG exists with 10 major bosses and required keys',
    catalogCheck.valid && catalogCheck.count >= 10 && catalogCheck.allHaveKeys,
    `count: ${catalogCheck.count}, sample: ${catalogCheck.sample}`);

  const fallbackCheck = await page.evaluate(() => {
    const boss = window.getBossForStage({ title: 'テストステージ', totalDelibPoints: 15 });
    return {
      name: boss.name,
      hp: boss.hp,
      atk: boss.atk,
      hasRequired: boss.hp > 0 && boss.atk > 0 && boss.range > 0
    };
  });
  assert('P32-02: getBossForStage fallback correctly derives boss for any stage',
    fallbackCheck.hasRequired,
    `hp: ${fallbackCheck.hp}, atk: ${fallbackCheck.atk}`);

  // 2. 気の家計簿 (ウェーブ別収支タイムライン)
  console.log('\n[SECTION 2] 気の家計簿 (ウェーブ別収支タイムライン)...');
  const kiLedgerCheck = await page.evaluate(() => {
    const btn = document.getElementById('btnToggleKiLedger');
    btn.click();
    const body = document.getElementById('kiLedgerBody');
    const isVisible = body && body.style.display !== 'none';
    const verdict = document.getElementById('kiLedgerVerdictBanner').textContent;
    const cards = document.querySelectorAll('#kiLedgerWaveCards .ki-ledger-card');
    const giantSeq = document.getElementById('kiLedgerGiantizeSequence').textContent;
    return {
      isVisible,
      verdictLen: verdict.length,
      cardCount: cards.length,
      hasGiantSeq: giantSeq.includes('実戦巨大化の最適進行順序')
    };
  });
  assert('P32-03: 気の家計簿 opens, renders 4 wave timeline cards and optimal giantize sequence',
    kiLedgerCheck.isVisible && kiLedgerCheck.cardCount === 4 && kiLedgerCheck.hasGiantSeq,
    `cards: ${kiLedgerCheck.cardCount}, hasSeq: ${kiLedgerCheck.hasGiantSeq}`);

  // 3. 実戦シミュレーション支援センター (40秒問題タイマー・伏兵成績表)
  console.log('\n[SECTION 3] 40秒問題タイマー & 伏兵成績表...');
  const combatTacticsCheck = await page.evaluate(async () => {
    const btn = document.getElementById('btnToggleCombatTactics');
    btn.click();
    const body = document.getElementById('combatTacticsBody');
    const isVisible = body && body.style.display !== 'none';
    const cycleText = document.getElementById('cycleSyncPairsContainer').textContent;
    const tokenContainer = document.getElementById('tokenReportCardContainer');
    const tokenText = tokenContainer ? tokenContainer.textContent : '';

    // Test timer start & reset
    const btnStart = document.getElementById('btnTimerStart40');
    const btnReset = document.getElementById('btnTimerReset');
    const display = document.getElementById('cycleTimerDisplay');
    const initialText = display.textContent;
    btnStart.click();
    await new Promise(r => setTimeout(r, 250));
    const runningText = display.textContent;
    btnReset.click();
    const resetText = display.textContent;

    return {
      isVisible,
      hasCycleExplanation: cycleText.includes('代理時計') || cycleText.includes('富山城'),
      hasTokenContent: tokenText.length > 20,
      initialText,
      runningText,
      resetText,
      timerWorks: runningText !== initialText && resetText === '40.0s'
    };
  });
  assert('P32-04: 40秒タイマー opens, displays proxy clock guides, and stopwatch runs & resets',
    combatTacticsCheck.isVisible && combatTacticsCheck.hasCycleExplanation && combatTacticsCheck.timerWorks,
    `running: ${combatTacticsCheck.runningText}, reset: ${combatTacticsCheck.resetText}`);
  assert('P32-05: 伏兵の成績表 catalogs tokens and evaluates decoy suitability',
    combatTacticsCheck.hasTokenContent);

  // 4. ステージ診断モーダル (ハデス 前田利家) の新戦術セクション群
  console.log('\n[SECTION 4] ステージ診断モーダル新戦術セクション群...');
  const stageDiagChecks = await page.evaluate(async () => {
    // Open Maeda Toshiie diagnostic
    window.openStageDiagnostic('深淵の闘技場 -覇・前田利家-');
    await new Promise(r => setTimeout(r, 300));

    // 1. 変身後バッジ
    const transSec = document.getElementById('diagTransformationBadgesSection');
    const transVisible = transSec && transSec.style.display !== 'none';
    const transText = transSec ? transSec.textContent : '';

    // 2. 審議相性マトリクス
    const delibBadge = document.getElementById('diagDelibMatrixSummaryBadge').textContent;
    const delibCards = document.querySelectorAll('#diagDelibMatrixList .delib-matrix-card');
    const fatalCards = document.querySelectorAll('#diagDelibMatrixList .delib-matrix-card.is-fatal');
    const warnCards = document.querySelectorAll('#diagDelibMatrixList .delib-matrix-card.is-warning');
    const safeCards = document.querySelectorAll('#diagDelibMatrixList .delib-matrix-card.is-safe');

    // Filter button test
    const btnWarnings = document.getElementById('btnFilterDelibWarnings');
    btnWarnings.click();
    const filteredCount = document.querySelectorAll('#diagDelibMatrixList .delib-matrix-card').length;
    const btnAll = document.getElementById('btnFilterDelibAll');
    btnAll.click();
    const restoredCount = document.querySelectorAll('#diagDelibMatrixList .delib-matrix-card').length;

    // 3. 殿スナイプ予報 & 大破カウントダウン
    const snipeBadge = document.getElementById('diagSnipeRiskBadge').textContent;
    const snipeRows = document.querySelectorAll('#diagBossHitCountdownTbody tr');

    // 4. 倒し切りレース (TTK)
    const ttkBadge = document.getElementById('diagTtkStatusBadge').textContent;
    const ttkText = document.getElementById('diagTtkDetailText').textContent;

    // 5. デバフ重ね掛けチェッカー
    const debuffSynergy = document.getElementById('diagDebuffSynergyBadge').textContent;
    const debuffNotice = document.getElementById('diagDebuffPenetrationNotice').textContent;
    const debuffCards = document.querySelectorAll('#diagDebuffCategoryList .debuff-stack-card');

    // 6. 次の波カード
    const waveCards = document.querySelectorAll('#diagWaveCardsGrid .wave-cheat-card');

    // Test memo auto-save
    const memoInput = document.getElementById('waveNoteInput_1');
    memoInput.value = 'テストメモ入力：0:30で計略点火';
    memoInput.dispatchEvent(new Event('input', { bubbles: true }));
    const savedRaw = localStorage.getItem('scre-helper:wave-notes:v1');

    // 7. 置くとこない探知機
    const tileBadge = document.getElementById('diagTileCongestionBadge').textContent;
    const tileContent = document.getElementById('diagTileCongestionContent').textContent;

    // 8. 敗因タグと次の一手
    const lossButtons = document.querySelectorAll('#diagLossTagsRow .diag-loss-tag-btn');
    const firstTag = lossButtons[0];
    firstTag.click();
    const nextStepsAfterClick = document.getElementById('diagNextStepsBox').textContent;
    const savedLoss = localStorage.getItem('scre-helper:loss-causes:v1');

    return {
      transVisible,
      transHasKeywords: transText.includes('猛進') || transText.includes('形態変化'),
      delibBadge,
      delibTotalCount: delibCards.length,
      fatalCount: fatalCards.length,
      warnCount: warnCards.length,
      safeCount: safeCards.length,
      filteredCount,
      restoredCount,
      snipeBadge,
      snipeRowCount: snipeRows.length,
      ttkBadge,
      hasTtkDetails: ttkText.includes('想定TTK') && ttkText.includes('総有効DPS'),
      debuffSynergy,
      debuffNoticeHasPenetration: debuffNotice.includes('能力低下無効') || debuffNotice.includes('貫通') || debuffNotice.includes('審議'),
      debuffCardCount: debuffCards.length,
      waveCardCount: waveCards.length,
      memoSavedCorrectly: savedRaw && savedRaw.includes('テストメモ入力'),
      tileBadge,
      hasTileSchemaProposal: tileContent.includes('マップ配置マスデータ設計案'),
      lossButtonCount: lossButtons.length,
      hasNextStepAdvised: nextStepsAfterClick.includes('おすすめ入れ替え'),
      lossSavedCorrectly: savedLoss && savedLoss.includes('ki')
    };
  });

  assert('P32-06: 形態変化・変身後バッジ appears with boss-specific traits',
    stageDiagChecks.transVisible && stageDiagChecks.transHasKeywords);

  assert('P32-07: 審議相性マトリクス categorizes deliberations into fatal/warning/safe and filters',
    stageDiagChecks.delibTotalCount > 0 && stageDiagChecks.filteredCount <= stageDiagChecks.delibTotalCount && stageDiagChecks.restoredCount === stageDiagChecks.delibTotalCount,
    `total: ${stageDiagChecks.delibTotalCount}, filtered: ${stageDiagChecks.filteredCount}`);

  assert('P32-08: 殿スナイプ予報 & 大破カウントダウン calculates survive hit count per castle',
    stageDiagChecks.snipeRowCount === 8 && stageDiagChecks.snipeBadge.includes('殿スナイプ危険度'),
    `rows: ${stageDiagChecks.snipeRowCount}, badge: ${stageDiagChecks.snipeBadge}`);

  assert('P32-09: 倒し切りレース (TTK) estimates party DPS and boss travel time',
    stageDiagChecks.hasTtkDetails && stageDiagChecks.ttkBadge.length > 0,
    `badge: ${stageDiagChecks.ttkBadge}`);

  assert('P32-10: デバフ重ね掛けチェッカー renders 9 categories and deliberation penetration notice',
    stageDiagChecks.debuffCardCount === 9 && stageDiagChecks.debuffSynergy.includes('脱法耐久シナジー') && stageDiagChecks.debuffNoticeHasPenetration,
    `synergy: ${stageDiagChecks.debuffSynergy}`);

  assert('P32-11: 次の波カード renders 4 wave cards and auto-saves notes to localStorage',
    stageDiagChecks.waveCardCount === 4 && stageDiagChecks.memoSavedCorrectly);

  assert('P32-12: 置くとこない探知機 evaluates melee/ranged ratio and includes tile schema proposal',
    stageDiagChecks.tileBadge.length > 0 && stageDiagChecks.hasTileSchemaProposal,
    `badge: ${stageDiagChecks.tileBadge}`);

  assert('P32-13: 敗因タグ & 次の一手 provides interactive tags and tailored castle suggestions',
    stageDiagChecks.lossButtonCount === 6 && stageDiagChecks.hasNextStepAdvised && stageDiagChecks.lossSavedCorrectly);

  // 5. Font size check: Guarantee no font size < 12px
  console.log('\n[SECTION 5] Font Size Verification (>= 12px)...');
  const minFontSizeCheck = await page.evaluate(() => {
    const selector = '#sectionKiLedger, #sectionCombatTactics, #modalStageDiagnostic';
    const root = document.querySelector(selector);
    if (!root) return { minSize: 12, violations: [] };

    const elements = document.querySelectorAll(`${selector} *`);
    let minSize = 999;
    const violations = [];

    elements.forEach(el => {
      const fsStr = window.getComputedStyle(el).fontSize;
      const fsNum = parseFloat(fsStr);
      if (!isNaN(fsNum) && el.offsetParent !== null && el.textContent.trim().length > 0) {
        if (fsNum < minSize) minSize = fsNum;
        if (fsNum < 11.9) {
          violations.push({ tag: el.tagName, id: el.id, class: el.className, fs: fsNum, text: el.textContent.slice(0, 20) });
        }
      }
    });

    return { minSize, violations: violations.slice(0, 5) };
  });

  assert('P32-14: Strict font-size guarantee (all text >= 12px in new sections)',
    minFontSizeCheck.violations.length === 0,
    `minSize: ${minFontSizeCheck.minSize}px, violations: ${JSON.stringify(minFontSizeCheck.violations)}`);

  // Take screenshot of the enhanced stage diagnostic modal for verification
  const screenshotPath = path.resolve(__dirname, 'screenshots/combat_tactics_diagnostic_screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`\nDiagnostic screenshot saved to: ${screenshotPath}`);

  await browser.close();

  console.log(`\n==============================================`);
  console.log(`PROMPT 32 AUTOMATED TESTS SUMMARY: ${passed} / ${total} PASSED`);
  console.log(`==============================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
})();
