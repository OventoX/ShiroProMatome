/**
 * tools/test_prompt61.js
 * Automated Verification Suite for Prompt 61:
 * 1. P61-01: 支援専用（歌舞・陣貝・茶器）の城娘の単撃表示が数値でないこと（3箇所検証）
 *    - 部隊カード subInfo: 「単撃目安(防0)支援専用」
 *    - バフ詳細グリッド: 「単撃(防0) 支援専用」
 *    - 画像エクスポートモーダル: 「単撃(防0): 支援専用」
 * 2. P61-02: 攻撃武器種の城娘の単撃表示が従来どおり数値であること（3箇所検証）
 * 3. P61-03: resetZoomTransform の整理と動作不変検証（フィット／100%リセット）
 * 4. P61-04: ボス狙撃・TTK等における支援専用スキップの整合性検証
 */

const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HTML_PATH = 'file:///' + path.resolve(__dirname, '../app/index.html').replace(/\\/g, '/');

let passCount = 0;
let failCount = 0;

function assert(id, desc, condition, details = '') {
  if (condition) {
    passCount++;
    console.log(`[PASS] ${id}: ${desc}${details ? '  ' + details : ''}`);
  } else {
    failCount++;
    console.error(`[FAIL] ${id}: ${desc}${details ? '  ' + details : ''}`);
  }
}

async function runPrompt61Tests() {
  console.log('=== Running Prompt 61 Automated Test Suite ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(HTML_PATH, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app-container');

    // -------------------------------------------------------------
    // Set up party with:
    // Slot 0: 小早川城 (陣貝, buff)
    // Slot 1: 大坂城 (歌舞, buff)
    // Slot 2: 江戸城 (刀, physical)
    // Slot 3: ［無疆］江戸城 (大砲, physical)
    // -------------------------------------------------------------
    await page.evaluate(() => {
      const kobayakawa = window.SCRE_DATA.find(x => x.name === '小早川城'); // 陣貝 (buff)
      const osaka = window.SCRE_DATA.find(x => x.name === '大坂城');       // 歌舞 (buff)
      const edo = window.SCRE_DATA.find(x => x.name === '江戸城');           // 刀 (physical)
      const mujikyo = window.SCRE_DATA.find(x => x.name.includes('無疆')); // 大砲 (physical)

      const testParty = [
        { id: kobayakawa.id, strategyOn: true, specialOn: false, giantStep: 5 },
        { id: osaka.id, strategyOn: true, specialOn: false, giantStep: 5 },
        { id: edo.id, strategyOn: true, specialOn: false, giantStep: 5 },
        { id: mujikyo.id, strategyOn: true, specialOn: false, giantStep: 5 }
      ];

      window.setParty(testParty);
    });

    // =============================================================
    // P61-01: 支援専用（歌舞・陣貝）の城娘の単撃表示検証
    // =============================================================
    console.log('\n[P61-01: 支援専用城娘の単撃表示が非数値（支援専用）であること]...');

    const buffCastleDisplayRes = await page.evaluate(() => {
      // 1. 部隊カード subInfo (Location 1: renderPartyTab in #partySlotList)
      const partyCards = Array.from(document.querySelectorAll('#partySlotList .party-card'));
      const card0Text = partyCards[0] ? partyCards[0].textContent : '';
      const card1Text = partyCards[1] ? partyCards[1].textContent : '';

      const m0 = card0Text.match(/単撃目安\(防0\)([^\s・]+)/);
      const m1 = card1Text.match(/単撃目安\(防0\)([^\s・]+)/);

      // 2. バフグリッド (Location 2: renderBuffGrid in #buffCalculatedList)
      const buffCards = Array.from(document.querySelectorAll('#buffCalculatedList .buff-card'));
      const buff0Text = buffCards[0] ? buffCards[0].textContent : '';
      const buff1Text = buffCards[1] ? buffCards[1].textContent : '';

      const mb0 = buff0Text.match(/単撃\(防0\)\s*([^\s・]+)/);
      const mb1 = buff1Text.match(/単撃\(防0\)\s*([^\s・]+)/);

      // 3. 画像エクスポートモーダル (Location 3: exportPartyImage in #partyExportArea)
      if (!window.html2canvas) {
        window.html2canvas = async () => ({ toDataURL: () => '' });
      }
      window.exportPartyImage();
      const exportArea = document.getElementById('partyExportArea');
      const exportText = exportArea ? exportArea.textContent : '';

      const me0 = exportText.includes('小早川城') ? exportText.match(/小早川城[\s\S]*?単撃\(防0\):\s*([^\s・]+)/) : null;
      const me1 = exportText.includes('大坂城') ? exportText.match(/大坂城[\s\S]*?単撃\(防0\):\s*([^\s・]+)/) : null;

      const closeBtn = document.getElementById('modalExportImageCloseBtn');
      if (closeBtn) closeBtn.click();

      return {
        cardKobayakawa: m0 ? m0[1] : null,
        cardOsaka: m1 ? m1[1] : null,
        buffKobayakawa: mb0 ? mb0[1] : null,
        buffOsaka: mb1 ? mb1[1] : null,
        exportKobayakawa: me0 ? me0[1] : null,
        exportOsaka: me1 ? me1[1] : null
      };
    });

    assert(
      'P61-01a',
      '部隊カード subInfo で陣貝(小早川城)および歌舞(大坂城)の単撃目安が「支援専用」であること',
      buffCastleDisplayRes.cardKobayakawa === '支援専用' &&
      buffCastleDisplayRes.cardOsaka === '支援専用',
      JSON.stringify({ cardKobayakawa: buffCastleDisplayRes.cardKobayakawa, cardOsaka: buffCastleDisplayRes.cardOsaka })
    );

    assert(
      'P61-01b',
      'バフ詳細グリッドで陣貝(小早川城)および歌舞(大坂城)の単撃(防0)が「支援専用」であること',
      buffCastleDisplayRes.buffKobayakawa === '支援専用' &&
      buffCastleDisplayRes.buffOsaka === '支援専用',
      JSON.stringify({ buffKobayakawa: buffCastleDisplayRes.buffKobayakawa, buffOsaka: buffCastleDisplayRes.buffOsaka })
    );

    assert(
      'P61-01c',
      '画像エクスポートモーダルで陣貝(小早川城)および歌舞(大坂城)の単撃(防0): が「支援専用」であること',
      buffCastleDisplayRes.exportKobayakawa === '支援専用' &&
      buffCastleDisplayRes.exportOsaka === '支援専用',
      JSON.stringify({ exportKobayakawa: buffCastleDisplayRes.exportKobayakawa, exportOsaka: buffCastleDisplayRes.exportOsaka })
    );

    // =============================================================
    // P61-02: 攻撃武器種の城娘の単撃表示検証（数値維持）
    // =============================================================
    console.log('\n[P61-02: 攻撃武器種城娘の単撃表示が数値であること]...');

    const attackCastleDisplayRes = await page.evaluate(() => {
      // 1. 部隊カード subInfo (Slots 2 & 3: 江戸城, ［無疆］江戸城)
      const partyCards = Array.from(document.querySelectorAll('#partySlotList .party-card'));
      const card2Text = partyCards[2] ? partyCards[2].textContent : '';
      const card3Text = partyCards[3] ? partyCards[3].textContent : '';

      const m2 = card2Text.match(/単撃目安\(防0\)([^\s・]+)/);
      const m3 = card3Text.match(/単撃目安\(防0\)([^\s・]+)/);

      // 2. バフグリッド
      const buffCards = Array.from(document.querySelectorAll('#buffCalculatedList .buff-card'));
      const buff2Text = buffCards[2] ? buffCards[2].textContent : '';
      const buff3Text = buffCards[3] ? buffCards[3].textContent : '';

      const mb2 = buff2Text.match(/単撃\(防0\)\s*([^\s・]+)/);
      const mb3 = buff3Text.match(/単撃\(防0\)\s*([^\s・]+)/);

      // 3. 画像エクスポートモーダル
      if (!window.html2canvas) {
        window.html2canvas = async () => ({ toDataURL: () => '' });
      }
      window.exportPartyImage();
      const exportArea = document.getElementById('partyExportArea');
      const exportText = exportArea ? exportArea.textContent : '';

      const me2 = exportText.includes('江戸城') ? exportText.match(/江戸城[\s\S]*?単撃\(防0\):\s*([^\s・]+)/) : null;
      const me3 = exportText.includes('無疆') ? exportText.match(/［無疆］江戸城[\s\S]*?単撃\(防0\):\s*([^\s・]+)/) : null;

      const closeBtn = document.getElementById('modalExportImageCloseBtn');
      if (closeBtn) closeBtn.click();

      return {
        cardEdo: m2 ? m2[1] : null,
        cardMujikyo: m3 ? m3[1] : null,
        buffEdo: mb2 ? mb2[1] : null,
        buffMujikyo: mb3 ? mb3[1] : null,
        exportEdo: me2 ? me2[1] : null,
        exportMujikyo: me3 ? me3[1] : null
      };
    });

    assert(
      'P61-02a',
      '部隊カード subInfo で攻撃武器種(刀・大砲)の単撃目安が数値であること',
      /^\d+$/.test(attackCastleDisplayRes.cardEdo) &&
      /^\d+$/.test(attackCastleDisplayRes.cardMujikyo),
      JSON.stringify({ cardEdo: attackCastleDisplayRes.cardEdo, cardMujikyo: attackCastleDisplayRes.cardMujikyo })
    );

    assert(
      'P61-02b',
      'バフ詳細グリッドで攻撃武器種(刀・大砲)の単撃(防0)が数値であること',
      /^\d+$/.test(attackCastleDisplayRes.buffEdo) &&
      /^\d+$/.test(attackCastleDisplayRes.buffMujikyo),
      JSON.stringify({ buffEdo: attackCastleDisplayRes.buffEdo, buffMujikyo: attackCastleDisplayRes.buffMujikyo })
    );

    assert(
      'P61-02c',
      '画像エクスポートモーダルで攻撃武器種(刀・大砲)の単撃(防0): が数値であること',
      /^\d+$/.test(attackCastleDisplayRes.exportEdo) &&
      /^\d+$/.test(attackCastleDisplayRes.exportMujikyo),
      JSON.stringify({ exportEdo: attackCastleDisplayRes.exportEdo, exportMujikyo: attackCastleDisplayRes.exportMujikyo })
    );

    // =============================================================
    // P61-03: resetZoomTransform の整理と動作不変検証
    // =============================================================
    console.log('\n[P61-03: resetZoomTransform 動作検証]...');

    const zoomResetRes = await page.evaluate(() => {
      const c = window.SCRE_DATA.find(x => x.name.includes('江戸城'));
      window.openImageZoom(c, 'battle');

      // Manipulate zoom to non-default state
      document.getElementById('btnZoomIn').click(); // 1.25
      document.getElementById('btnZoomIn').click(); // 1.50
      document.getElementById('btnZoomIn').click(); // 1.75
      document.getElementById('btnZoomIn').click(); // 2.00

      const beforeState = window.getZoomState();

      // Call resetZoomTransform
      window.resetZoomTransform();
      const afterState = window.getZoomState();
      const indicatorText = document.getElementById('zoomLevelIndicator').textContent;

      // Close zoom modal
      window.closeImageZoom();

      return {
        beforeScale: beforeState.zoomScale,
        afterScale: afterState.zoomScale,
        afterPanX: afterState.zoomPanX,
        afterPanY: afterState.zoomPanY,
        indicatorText
      };
    });

    assert(
      'P61-03',
      'resetZoomTransform 呼出で zoomScale が 1.0、pan が (0,0)、表示が 100% に正確にリセットされること',
      zoomResetRes.beforeScale === 2.0 &&
      zoomResetRes.afterScale === 1.0 &&
      zoomResetRes.afterPanX === 0 &&
      zoomResetRes.afterPanY === 0 &&
      zoomResetRes.indicatorText === '100%',
      JSON.stringify(zoomResetRes)
    );

    // =============================================================
    // P61-04: ボス狙撃・TTK等における支援専用スキップの整合性検証
    // =============================================================
    console.log('\n[P61-04: ボス狙撃における支援専用除外の検証]...');

    const bossSnipeRes = await page.evaluate(() => {
      const osaka = window.SCRE_DATA.find(x => x.name === '大坂城'); // 歌舞
      const kobayakawa = window.SCRE_DATA.find(x => x.name === '小早川城'); // 陣貝
      const mujikyo = window.SCRE_DATA.find(x => x.name.includes('無疆')); // 大砲
      const stage = window.SCRE_GUIDES[0].stages[0];

      // 1. Party of only support units
      window.setParty([
        { id: osaka.id, strategyOn: true, specialOn: false, giantStep: 5 },
        { id: kobayakawa.id, strategyOn: true, specialOn: false, giantStep: 5 }
      ]);
      window.openStageDiagnostic(stage.title);
      const detailSupportOnly = document.getElementById('diagTtkDetailText')?.textContent || '';

      // 2. Party with high DPS attacker added
      window.setParty([
        { id: osaka.id, strategyOn: true, specialOn: false, giantStep: 5 },
        { id: kobayakawa.id, strategyOn: true, specialOn: false, giantStep: 5 },
        { id: mujikyo.id, strategyOn: true, specialOn: false, giantStep: 5 }
      ]);
      window.openStageDiagnostic(stage.title);
      const detailWithAttacker = document.getElementById('diagTtkDetailText')?.textContent || '';

      const mSupp = detailSupportOnly.match(/総有効DPS:\s*約\s*([\d,]+)\s*\/秒/);
      const mAtt = detailWithAttacker.match(/総有効DPS:\s*約\s*([\d,]+)\s*\/秒/);

      return {
        supportDps: mSupp ? parseInt(mSupp[1].replace(/,/g, ''), 10) : null,
        attackerDps: mAtt ? parseInt(mAtt[1].replace(/,/g, ''), 10) : null
      };
    });

    assert(
      'P61-04',
      'ボスTTKレース判定で支援専用のみの場合は総有効DPSが0であり、攻撃城娘追加でDPSが正常に加算されること',
      bossSnipeRes.supportDps === 0 && bossSnipeRes.attackerDps > 0,
      JSON.stringify(bossSnipeRes)
    );

  } finally {
    await browser.close();
  }

  console.log('\n==============================================');
  console.log('PROMPT 61 AUTOMATED TESTS SUMMARY');
  console.log(`PASSED: ${passCount} / ${passCount + failCount}`);
  console.log('==============================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPrompt61Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
