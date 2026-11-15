/**
 * Prompt 65 Automated Test Suite
 * 第65弾: 対抗策ファインダー過剰修正の是正（特殊能力防御無視の復帰）＋第63弾指摘2件
 * - P65-01: 高防御372体・物理軽減384体の実測件数完全一致
 * - P65-02: ［無疆］江戸城・［漆磊］広島城が含まれ、［裏］淀城・淀城のみが正しく除外されていること
 * - P65-03: 能力低下無効審議（36体）の絞り込み維持
 * - P65-04: 計略ループ・稼働率チェッカーにおける射程内等の対象限定短縮注記の表示
 * - P65-05: ペテルゴフ宮殿の実データ（消費気5）とテストコメントの整合性確認
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
  console.log('=== Running Prompt 65 Automated Test Suite ===\n');

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

  // -------------------------------------------------------------------------
  // P65-01 & P65-02: 高防御372体・物理軽減384体、特殊能力防御無視復帰（江戸城・広島城等）、淀城除外
  // -------------------------------------------------------------------------
  const p65_counters = await page.evaluate(() => {
    const highDef = window.findCounterCastles(new Set(['高防御']));
    const physResist = window.findCounterCastles(new Set(['物理軽減']));
    const abilityImmune = window.findCounterCastles(new Set(['能力低下無効審議']));

    const highDefNames = new Set(highDef.map(x => x.castle.name));
    const physResistNames = new Set(physResist.map(x => x.castle.name));

    // 特殊能力に「敵の防御を無視」を持つ16体が復帰していること
    const target16 = [
      '［絢爛］アラゴネーゼ城', '蓉城', '城塞都市ロンディニウム', '京都新城',
      '［裏］熊本城', '黄金郷エル・ドラード', '［獅聖］ガイヤール城', '韮山城',
      '虎牢関', '［無疆］江戸城', '［漆磊］広島城', '［死氷の黒衣］シバルバー',
      '【レイス娘】ダルシー', '杣山城', '勝連城', '［命護］尼崎城'
    ];
    const target16AllInHighDef = target16.every(n => highDefNames.has(n));
    const target16AllInPhysResist = target16.every(n => physResistNames.has(n));

    // 除外されるべき城娘（被ダメ軽減のみ）
    const yodoInHighDef = highDefNames.has('淀城');
    const yodoInPhysResist = physResistNames.has('淀城');
    const uraYodoInHighDef = highDefNames.has('［裏］淀城');
    const uraYodoInPhysResist = physResistNames.has('［裏］淀城');

    const hiroshimaCastle = window.SCRE_DATA.find(c => c.name === '［漆磊］広島城');
    const hiroshimaTags = hiroshimaCastle ? window.extractCastleEffectTags(hiroshimaCastle) : [];

    return {
      highDefCount: highDef.length,
      physResistCount: physResist.length,
      abilityImmuneCount: abilityImmune.length,
      target16AllInHighDef,
      target16AllInPhysResist,
      edoInHighDef: highDefNames.has('［無疆］江戸城'),
      edoInPhysResist: physResistNames.has('［無疆］江戸城'),
      hiroshimaInHighDef: highDefNames.has('［漆磊］広島城'),
      hiroshimaInPhysResist: physResistNames.has('［漆磊］広島城'),
      hiroshimaHasDefIgnoreTag: hiroshimaTags.includes('防御無視'),
      yodoInHighDef,
      yodoInPhysResist,
      uraYodoInHighDef,
      uraYodoInPhysResist
    };
  });

  assert(
    'P65-01: 高防御対策が372体、物理軽減対策が384体と完全一致すること',
    p65_counters.highDefCount === 372 && p65_counters.physResistCount === 384,
    `実測: 高防御=${p65_counters.highDefCount}体 (期待372), 物理軽減=${p65_counters.physResistCount}体 (期待384)`
  );

  assert(
    'P65-02: ［無疆］江戸城・［漆磊］広島城を含む特殊能力防御無視16体が全て含まれ、淀城・［裏］淀城のみが正しく除外されていること',
    p65_counters.target16AllInHighDef && p65_counters.target16AllInPhysResist &&
      p65_counters.edoInHighDef && p65_counters.hiroshimaInHighDef &&
      p65_counters.hiroshimaHasDefIgnoreTag &&
      !p65_counters.yodoInHighDef && !p65_counters.yodoInPhysResist &&
      !p65_counters.uraYodoInHighDef && !p65_counters.uraYodoInPhysResist,
    `特殊能力16体高防御=${p65_counters.target16AllInHighDef}, 物理軽減=${p65_counters.target16AllInPhysResist}, 江戸城=${p65_counters.edoInHighDef}, 広島城=${p65_counters.hiroshimaInHighDef}(タグ=${p65_counters.hiroshimaHasDefIgnoreTag}), 淀城=${p65_counters.yodoInHighDef}, ［裏］淀城=${p65_counters.uraYodoInHighDef}`
  );

  assert(
    'P65-03: 能力低下無効審議の絞り込み（36体）が巻き戻らず意図通り維持されていること',
    p65_counters.abilityImmuneCount === 36,
    `実測: ${p65_counters.abilityImmuneCount}体 (期待36体)`
  );

  // -------------------------------------------------------------------------
  // P65-04: 射程内スコープ等の対象限定短縮の注記表示
  // -------------------------------------------------------------------------
  const p65_04 = await page.evaluate(() => {
    const party = [
      { id: '小早川城', strategyOn: true, giantStep: 5 },
      { id: '［お月見］鹿野城', strategyOn: true, giantStep: 5 }
    ];
    window.renderStrategyLoopChecker(party);
    const evalRes = window.evaluatePartyStrategyLoops(party);
    const koba = evalRes.items.find(it => it.castle.name === '小早川城');

    const domListText = document.getElementById('strategyLoopList')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const domNotesText = document.getElementById('strategyLoopNotesBox')?.textContent.replace(/\s+/g, ' ').trim() || '';

    const warningText = '対象が限定される効果を含むため、実際の稼働率は編成・配置により下がる場合';

    return {
      hasScopedReduction: evalRes.hasScopedReduction,
      kobaHasScoped: koba?.hasScopedReduction,
      scopedNote: koba?.scopedReductionNote,
      domListHasWarning: domListText.includes(warningText),
      domNotesHasWarning: domNotesText.includes(warningText)
    };
  });

  assert(
    'P65-04: 射程内等の対象限定短縮効果を含む場合に、全体数値とは別に「対象が限定される効果を含むため、実際の稼働率は編成・配置により下がる場合がある」旨の注記が表示されること',
    p65_04.hasScopedReduction === true &&
      p65_04.kobaHasScoped === true &&
      p65_04.domListHasWarning &&
      p65_04.domNotesHasWarning,
    `hasScopedReduction=${p65_04.hasScopedReduction}, DOMリスト注記=${p65_04.domListHasWarning}, 全体注記ボックス=${p65_04.domNotesHasWarning}`
  );

  // -------------------------------------------------------------------------
  // P65-05: ペテルゴフ宮殿の実データ確認（消費気5）
  // -------------------------------------------------------------------------
  const p65_05 = await page.evaluate(() => {
    const peterhof = window.SCRE_DATA.find(c => c.name === 'ペテルゴフ宮殿');
    const stratCost = peterhof?.strategy?.cost;
    const evalRes = window.evaluateCastleStrategyDuration(peterhof);
    return {
      peterhofFound: Boolean(peterhof),
      stratCost,
      evalKiCost: evalRes.kiCost
    };
  });

  assert(
    'P65-05: ペテルゴフ宮殿の実データ消費気が5であり、テストコメント・評価結果と整合していること',
    p65_05.peterhofFound && p65_05.stratCost === 5 && p65_05.evalKiCost === 5,
    `実データ消費気=${p65_05.stratCost}, 計略評価消費気=${p65_05.evalKiCost}`
  );

  await browser.close();

  console.log(`\n=== Prompt 65 Test Summary: ${passed} / ${total} PASSED ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
})();
