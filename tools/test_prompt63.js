/**
 * Prompt 63 Automated Test Suite
 * 計略ループ・稼働率チェッカー
 * - P63-01: 持続・CTが抽出できる実在の城娘で、稼働率と隙間秒数が手計算と一致する
 * - P63-02: 短縮を適用した場合に実効CTが短縮され、出所内訳がDOMおよびデータに表示される
 * - P63-03: 持続のない計略持ち（および計略なし）が「判定不可（理由つき）」になり、無言で除外されない
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
  console.log('=== Running Prompt 63 Automated Test Suite ===\n');

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
  // P63-01: 持続・CTが抽出できる実在の城娘で、稼働率と隙間秒数が手計算と一致する
  // -------------------------------------------------------------------------
  const p63_01 = await page.evaluate(() => {
    // 1) 小早川城 単騎: 持続30秒, CT50秒, 消費気10 -> 短縮0%, 実効CT=50秒, 稼働率=30/50=60.0%, 隙間=20秒, ループ不可(赤), 秒あたり消費気=10/50=0.20
    const soloKobayakawa = window.evaluatePartyStrategyLoops([{ id: '小早川城', strategyOn: true, giantStep: 5 }]).items[0];

    // 2) ［無疆］江戸城 単騎: 持続60秒, CT60秒, 消費気5 -> 短縮0%, 実効CT=60秒, 稼働率=60/60=100.0%, 隙間=0秒, 永続(緑), 秒あたり消費気=5/60=0.08
    const soloMukyouEdo = window.evaluatePartyStrategyLoops([{ id: '［無疆］江戸城', strategyOn: true, giantStep: 5 }]).items[0];

    // 3) ペテルゴフ宮殿 単騎: 持続40秒, CT50秒, 消費気7 -> 短縮0%, 実効CT=50秒, 稼働率=40/50=80.0%, 隙間=10秒, 僅かな隙間(黄), 秒あたり消費気=7/50=0.14
    const soloPeterhof = window.evaluatePartyStrategyLoops([{ id: 'ペテルゴフ宮殿', strategyOn: true, giantStep: 5 }]).items[0];

    // 全1,161城娘の分類集計
    const breakdown = {
      evaluable: 0,
      noStrategy: 0,
      noCooldown: 0,
      infiniteDuration: 0,
      tokenNoDuration: 0,
      instantOrNoDuration: 0
    };
    window.SCRE_DATA.forEach(c => {
      const r = window.evaluateCastleStrategyDuration(c);
      if (r.evaluable) breakdown.evaluable++;
      else if (r.reason === '計略なし') breakdown.noStrategy++;
      else if (r.reason === 'CTなし') breakdown.noCooldown++;
      else if (r.reason.includes('効果時間無限')) breakdown.infiniteDuration++;
      else if (r.reason.includes('伏兵・トークン')) breakdown.tokenNoDuration++;
      else breakdown.instantOrNoDuration++;
    });

    return { soloKobayakawa, soloMukyouEdo, soloPeterhof, breakdown };
  });

  assert(
    'P63-01: 実在城娘（小早川城・［無疆］江戸城・ペテルゴフ宮殿）の持続・CT・稼働率・隙間秒数・バッジ・秒あたり消費気が手計算と完全一致する',
    p63_01.soloKobayakawa.evaluable === true &&
      p63_01.soloKobayakawa.duration === 30 &&
      p63_01.soloKobayakawa.baseCt === 50 &&
      p63_01.soloKobayakawa.effectiveCt === 50 &&
      p63_01.soloKobayakawa.uptimePct === 60.0 &&
      p63_01.soloKobayakawa.gapSeconds === 20 &&
      p63_01.soloKobayakawa.badgeText === 'ループ不可' &&
      p63_01.soloKobayakawa.badgeColor === 'red' &&
      p63_01.soloKobayakawa.kiPerSec === 0.20 &&
      p63_01.soloMukyouEdo.duration === 60 &&
      p63_01.soloMukyouEdo.effectiveCt === 60 &&
      p63_01.soloMukyouEdo.uptimePct === 100.0 &&
      p63_01.soloMukyouEdo.gapSeconds === 0 &&
      p63_01.soloMukyouEdo.badgeText === '永続' &&
      p63_01.soloMukyouEdo.badgeColor === 'green' &&
      p63_01.soloPeterhof.duration === 40 &&
      p63_01.soloPeterhof.effectiveCt === 50 &&
      p63_01.soloPeterhof.uptimePct === 80.0 &&
      p63_01.soloPeterhof.gapSeconds === 10 &&
      p63_01.soloPeterhof.badgeText === '僅かな隙間' &&
      p63_01.soloPeterhof.badgeColor === 'yellow' &&
      p63_01.breakdown.evaluable === 792,
    `小早川城(30s/50s)=${p63_01.soloKobayakawa.uptimePct}%・隙間${p63_01.soloKobayakawa.gapSeconds}s[${p63_01.soloKobayakawa.badgeText}], ［無疆］江戸城(60s/60s)=${p63_01.soloMukyouEdo.uptimePct}%[${p63_01.soloMukyouEdo.badgeText}], ペテルゴフ宮殿(40s/50s)=${p63_01.soloPeterhof.uptimePct}%[${p63_01.soloPeterhof.badgeText}], 全1,161体中判定可能=${p63_01.breakdown.evaluable}体`
  );

  // -------------------------------------------------------------------------
  // P63-02: 短縮を適用した場合に実効CTが短縮され、出所内訳が表示される
  // -------------------------------------------------------------------------
  const p63_02 = await page.evaluate(() => {
    // A) 小早川城(30s/50s) + ［お月見］鹿野城(射程内35%短縮)
    // 実効CT = 50 * (1 - 0.35) = 32.5s, 稼働率 = 30 / 32.5 = 92.3%, 隙間 = 2.5s, 僅かな隙間(黄)
    const party35 = [
      { id: '小早川城', strategyOn: true, giantStep: 5 },
      { id: '［お月見］鹿野城', strategyOn: true, giantStep: 5 }
    ];
    const res35 = window.evaluatePartyStrategyLoops(party35);
    const koba35 = res35.items.find(it => it.castle.name === '小早川城');

    // B) 小早川城(30s/50s) + ［お月見］鹿野城(35%) + 彦根城(全城娘40%短縮) + 万里の長城(10秒短縮・注記対象)
    // 最大値優先で彦根城40%が適用: 実効CT = 50 * (1 - 0.40) = 30.0s, 稼働率 = 100.0%, 隙間 = 0s, 永続(緑)
    const party40 = [
      { id: '小早川城', strategyOn: true, giantStep: 5 },
      { id: '［お月見］鹿野城', strategyOn: true, giantStep: 5 },
      { id: '彦根城', strategyOn: true, giantStep: 5 },
      { id: '万里の長城', strategyOn: true, giantStep: 5 }
    ];
    window.renderStrategyLoopChecker(party40);
    const res40 = window.evaluatePartyStrategyLoops(party40);
    const koba40 = res40.items.find(it => it.castle.name === '小早川城');

    const domListText = document.getElementById('strategyLoopList')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const domNotesText = document.getElementById('strategyLoopNotesBox')?.textContent.replace(/\s+/g, ' ').trim() || '';

    return {
      koba35,
      koba40,
      notesCount: res40.notes.length,
      domListText,
      domNotesText
    };
  });

  assert(
    'P63-02: 計略短縮バフ適用時に実効CTが短縮され、出所内訳（誰の・何%）および対象外短縮の注記が正確に表示される',
    p63_02.koba35.shortenPct === 35 &&
      p63_02.koba35.effectiveCt === 32.5 &&
      p63_02.koba35.uptimePct === 92.3 &&
      p63_02.koba35.gapSeconds === 2.5 &&
      p63_02.koba35.badgeText === '僅かな隙間' &&
      p63_02.koba35.appliedSources[0]?.from === '［お月見］鹿野城' &&
      p63_02.koba40.shortenPct === 40 &&
      p63_02.koba40.effectiveCt === 30 &&
      p63_02.koba40.uptimePct === 100.0 &&
      p63_02.koba40.gapSeconds === 0 &&
      p63_02.koba40.badgeText === '永続' &&
      p63_02.koba40.appliedSources[0]?.from === '彦根城' &&
      p63_02.domListText.includes('短縮出所: 彦根城（特技・味方全体） -40%') &&
      p63_02.domNotesText.includes('万里の長城') &&
      p63_02.domNotesText.includes('10秒'),
    `35%短縮時: 実効CT=${p63_02.koba35.effectiveCt}s(稼働率${p63_02.koba35.uptimePct}%/隙間${p63_02.koba35.gapSeconds}s) ➔ 40%短縮時: 実効CT=${p63_02.koba40.effectiveCt}s(稼働率${p63_02.koba40.uptimePct}%/隙間${p63_02.koba40.gapSeconds}s, 出所=${p63_02.koba40.appliedSources[0]?.from})`
  );

  // -------------------------------------------------------------------------
  // P63-03: 持続のない計略持ちが「判定不可（理由つき）」になる
  // -------------------------------------------------------------------------
  const p63_03 = await page.evaluate(() => {
    const testParty = [
      { id: '［球陽］首里城', strategyOn: true, giantStep: 5 }, // 伏兵計略（持続時間なし）
      { id: '清洲城', strategyOn: true, giantStep: 5 },         // 単発効果計略（持続時間なし）
      { id: '崑崙', strategyOn: true, giantStep: 5 },           // 効果時間無限（持続時間なし）
      { id: '五稜郭', strategyOn: true, giantStep: 5 }          // 計略なし
    ];
    window.renderStrategyLoopChecker(testParty);
    const res = window.evaluatePartyStrategyLoops(testParty);
    const cards = Array.from(document.querySelectorAll('#strategyLoopList .strategy-loop-card'));

    return {
      itemCount: res.items.length,
      cardCount: cards.length,
      items: res.items.map(it => ({
        name: it.castle.name,
        evaluable: it.evaluable,
        reason: it.reason,
        statusLabel: it.statusLabel
      })),
      domText: document.getElementById('strategyLoopList')?.textContent.replace(/\s+/g, ' ').trim() || ''
    };
  });

  assert(
    'P63-03: 持続時間のない計略持ち（伏兵・単発・効果時間無限）および計略なし城娘が無言で除外されず「判定不可（理由つき）」として全件表示される',
    p63_03.itemCount === 4 &&
      p63_03.cardCount === 4 &&
      p63_03.items.every(it => it.evaluable === false && it.statusLabel.startsWith('判定不可（理由：')) &&
      p63_03.domText.includes('判定不可（理由：持続時間なし［伏兵・トークン計略］）') &&
      p63_03.domText.includes('判定不可（理由：持続時間なし［単発・即時効果等］）') &&
      p63_03.domText.includes('判定不可（理由：持続時間なし［効果時間無限・永続変化型］）') &&
      p63_03.domText.includes('判定不可（理由：計略なし）'),
    `表示カード数=${p63_03.cardCount}/4, 内訳=${p63_03.items.map(i => `${i.name}:${i.statusLabel}`).join(' | ')}`
  );

  await browser.close();

  console.log('\n==============================================');
  console.log(`PROMPT 63 AUTOMATED TESTS SUMMARY: ${passed} / ${total} PASSED`);
  console.log('==============================================\n');

  if (passed !== total) {
    process.exit(1);
  }
})();
