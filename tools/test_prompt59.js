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

async function runPrompt59Tests() {
  console.log('=== Running Prompt 59 Automated Test Suite: Modal Tablet/Wide Responsive ===\n');

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

    // -------------------------------------------------------------
    // P59-01: 3画面幅での詳細モーダル幅・カラムレイアウト検証
    // -------------------------------------------------------------
    console.log('\n[P59-01: 3画面幅レイアウト検証 (1280px, 834px, 375px)]...');

    // 1280px (デスクトップ / タブレット横持ち)
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(HTML_PATH, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app-container');

    await page.evaluate(() => {
      const c = window.SCRE_DATA.find(x => x.name === '江戸城');
      window.openCastleDetail(c.id);
    });
    await new Promise(r => setTimeout(r, 200));

    const w1280 = await page.evaluate(() => {
      const modal = document.querySelector('#modalCastleDetail .modal-content');
      const body = document.querySelector('#modalCastleDetail .modal-detail-body');
      const left = document.querySelector('#modalCastleDetail .detail-col-left');
      const right = document.querySelector('#modalCastleDetail .detail-col-right');
      const mRect = modal.getBoundingClientRect();
      const lRect = left.getBoundingClientRect();
      const rRect = right.getBoundingClientRect();
      const mStyle = window.getComputedStyle(modal);
      const bStyle = window.getComputedStyle(body);
      return {
        width: mRect.width,
        computedMaxWidth: mStyle.maxWidth,
        flexDir: bStyle.flexDirection,
        leftWidth: lRect.width,
        rightWidth: rRect.width
      };
    });

    assert(
      'P59-01a',
      '1280px幅でモーダル幅1080px、2カラム(row)、左カラム420px、右カラム約608pxとなること',
      Math.abs(w1280.width - 1080) <= 2 &&
      w1280.flexDir === 'row' &&
      Math.abs(w1280.leftWidth - 420) <= 2 &&
      w1280.rightWidth >= 550,
      JSON.stringify(w1280)
    );

    // 834px (タブレット縦持ち / Xiaomi Pad Mini 相当)
    await page.setViewport({ width: 834, height: 1100 });
    await new Promise(r => setTimeout(r, 200));

    const w834 = await page.evaluate(() => {
      const modal = document.querySelector('#modalCastleDetail .modal-content');
      const body = document.querySelector('#modalCastleDetail .modal-detail-body');
      const left = document.querySelector('#modalCastleDetail .detail-col-left');
      const right = document.querySelector('#modalCastleDetail .detail-col-right');
      const mRect = modal.getBoundingClientRect();
      const lRect = left.getBoundingClientRect();
      const rRect = right.getBoundingClientRect();
      const mStyle = window.getComputedStyle(modal);
      const bStyle = window.getComputedStyle(body);
      return {
        width: mRect.width,
        computedMaxWidth: mStyle.maxWidth,
        flexDir: bStyle.flexDirection,
        leftWidth: lRect.width,
        rightWidth: rRect.width
      };
    });

    // 834 * 0.94 = 783.96px
    assert(
      'P59-01b',
      '834px幅でモーダル幅約784px(94vw)、2カラム(row)、左カラム330px、右カラム約414pxで窮屈でないこと',
      Math.abs(w834.width - 784) <= 3 &&
      w834.flexDir === 'row' &&
      Math.abs(w834.leftWidth - 330) <= 2 &&
      w834.rightWidth >= 380,
      JSON.stringify(w834)
    );

    // 375px (スマホ)
    await page.setViewport({ width: 375, height: 667 });
    await new Promise(r => setTimeout(r, 200));

    const w375 = await page.evaluate(() => {
      const modal = document.querySelector('#modalCastleDetail .modal-content');
      const body = document.querySelector('#modalCastleDetail .modal-detail-body');
      const left = document.querySelector('#modalCastleDetail .detail-col-left');
      const right = document.querySelector('#modalCastleDetail .detail-col-right');
      const mRect = modal.getBoundingClientRect();
      const lRect = left.getBoundingClientRect();
      const rRect = right.getBoundingClientRect();
      const bStyle = window.getComputedStyle(body);
      return {
        width: mRect.width,
        flexDir: bStyle.flexDirection,
        leftWidth: lRect.width,
        rightWidth: rRect.width
      };
    });

    assert(
      'P59-01c',
      '375px幅で1カラム(column)維持、左カラムと右カラムが全幅となること',
      w375.flexDir === 'column' &&
      Math.abs(w375.leftWidth - w375.rightWidth) <= 5,
      JSON.stringify(w375)
    );

    // -------------------------------------------------------------
    // P59-02: 他モーダルの幅・表示不変検証
    // -------------------------------------------------------------
    console.log('\n[P59-02: 他モーダルの幅・表示不変検証 (1280px)]...');
    await page.setViewport({ width: 1280, height: 900 });

    const otherModals = await page.evaluate(() => {
      const modals = {
        modalSelector: document.querySelector('#modalSelector .modal-content'),
        modalStageDiagnostic: document.querySelector('#modalStageDiagnostic .modal-content'),
        modalPresetCompare: document.querySelector('#modalPresetCompare .modal-content'),
        modalCompareCastles: document.querySelector('#modalCompareCastles .modal-content'),
        modalEquipmentConfig: document.querySelector('#modalEquipmentConfig .modal-content'),
        modalCastleDetail: document.querySelector('#modalCastleDetail .modal-content')
      };
      const res = {};
      for (const [key, el] of Object.entries(modals)) {
        if (!el) continue;
        const style = window.getComputedStyle(el);
        res[key] = {
          maxWidth: style.maxWidth,
          classes: el.className
        };
      }
      return res;
    });

    assert(
      'P59-02a',
      '共用セレクタモーダル (#modalSelector) の max-width が 600px のままであること',
      otherModals.modalSelector && otherModals.modalSelector.maxWidth === '600px',
      JSON.stringify(otherModals.modalSelector)
    );
    assert(
      'P59-02b',
      '診断モーダル (750px), 比較モーダル (820px, 900px), 装備モーダル (560px) の幅が変わらないこと',
      otherModals.modalStageDiagnostic.maxWidth === '750px' &&
      otherModals.modalPresetCompare.maxWidth === '820px' &&
      otherModals.modalCompareCastles.maxWidth === '900px' &&
      otherModals.modalEquipmentConfig.maxWidth === '560px',
      JSON.stringify(otherModals)
    );
    assert(
      'P59-02c',
      '城娘詳細モーダルのみ修飾クラス modal-content--detail を持ち 1080px に拡張されていること',
      otherModals.modalCastleDetail.classes.includes('modal-content--detail') &&
      otherModals.modalCastleDetail.maxWidth === '1080px',
      JSON.stringify(otherModals.modalCastleDetail)
    );

    // -------------------------------------------------------------
    // P59-03: 詳細モーダル内全既存機能の動作検証
    // -------------------------------------------------------------
    console.log('\n[P59-03: 詳細モーダル内全既存機能の動作検証]...');

    // 1. 改築段階切替 (無印 -> 改壱 -> 改弐)
    const remodelRes = await page.evaluate(() => {
      const btnMuin = document.querySelector('#remodelBtnGroup .remodel-tab-btn[data-stage="無印"]');
      const btnKai2 = document.querySelector('#remodelBtnGroup .remodel-tab-btn[data-stage="改弐"]');

      btnMuin.click();
      const txtMuin = document.getElementById('detailPortraitCaption').textContent;
      btnKai2.click();
      const txtKai2 = document.getElementById('detailPortraitCaption').textContent;

      return { txtMuin, txtKai2 };
    });
    assert('P59-03a', '改築段階切替（無印／改壱／改弐）が正常に動作すること', remodelRes.txtMuin.includes('無印') && remodelRes.txtKai2.includes('改弐'), JSON.stringify(remodelRes));

    // 2. 前へ / 次へ
    const navRes = await page.evaluate(() => {
      const origName = document.getElementById('detailCastleName').textContent;
      const btnNext = document.querySelector('.modal-detail-header .btn-nav-next, #modalCastleDetail .next');
      if (btnNext) btnNext.click();
      const nextName = document.getElementById('detailCastleName').textContent;
      const btnPrev = document.querySelector('.modal-detail-header .btn-nav-prev, #modalCastleDetail .prev');
      if (btnPrev) btnPrev.click();
      const backName = document.getElementById('detailCastleName').textContent;
      return { origName, nextName, backName };
    });
    assert('P59-03b', '前へ／次へナビゲーションが正常に動作すること', navRes.origName !== navRes.nextName && navRes.origName === navRes.backName, JSON.stringify(navRes));

    // 3. 並べて表示 (side-by-side-mode)
    const sideBySideRes = await page.evaluate(() => {
      const btnSide = document.getElementById('btnFormSideBySide');
      btnSide.click();
      const modal = document.querySelector('#modalCastleDetail .modal-content');
      const isSide = modal.classList.contains('side-by-side-mode');
      const container = document.getElementById('detailSideBySideContainer');
      const isVisible = window.getComputedStyle(container).display !== 'none';
      const computedWidth = window.getComputedStyle(modal).width;

      document.getElementById('btnFormBattle').click();
      const isBack = !modal.classList.contains('side-by-side-mode');

      return { isSide, isVisible, computedWidth, isBack };
    });
    assert('P59-03c', '並べて表示が正常に展開・復帰すること', sideBySideRes.isSide && sideBySideRes.isVisible && sideBySideRes.isBack, JSON.stringify(sideBySideRes));

    // 4. 拡大表示
    const zoomRes = await page.evaluate(() => {
      const btnZoom = document.getElementById('btnPortraitZoom');
      btnZoom.click();
      const zoomModal = document.getElementById('modalImageZoom');
      const isOpen = window.getComputedStyle(zoomModal).display !== 'none';
      const closeBtn = zoomModal.querySelector('#btnZoomClose, .image-zoom-close-btn');
      if (closeBtn) closeBtn.click();
      const isClosed = window.getComputedStyle(zoomModal).display === 'none';
      return { isOpen, isClosed };
    });
    assert('P59-03d', '拡大表示モーダルが開閉できること', zoomRes.isOpen && zoomRes.isClosed, JSON.stringify(zoomRes));

    // 5. 所持切替
    const ownRes = await page.evaluate(() => {
      const btnOwn = document.getElementById('modalDetailOwnedBtn');
      const origTxt = btnOwn.textContent.trim();
      btnOwn.click();
      const newTxt = btnOwn.textContent.trim();
      btnOwn.click(); // revert
      return { origTxt, newTxt };
    });
    assert('P59-03e', '所持切替ボタンが動作すること', ownRes.origTxt !== ownRes.newTxt, JSON.stringify(ownRes));

    // 6. 編成追加切替
    const partyRes = await page.evaluate(() => {
      const currentParty = window.getParty();
      window.setParty(currentParty.slice(0, 4));

      const c = window.SCRE_DATA.find(x => x.name === '江戸城');
      window.openCastleDetail(c.id);

      const btnParty = document.getElementById('btnDetailToggleParty');
      const origTxt = btnParty.textContent.trim();
      btnParty.click();
      const newTxt = btnParty.textContent.trim();
      btnParty.click(); // revert
      return { origTxt, newTxt };
    });
    assert('P59-03f', '編成追加ボタンが動作すること', partyRes.origTxt !== partyRes.newTxt, JSON.stringify(partyRes));

    // -------------------------------------------------------------
    // P59-04: UIフォントサイズ（>= 12px）検証
    // -------------------------------------------------------------
    console.log('\n[P59-04: UIフォントサイズ検証 (>= 12px)]...');
    const fontRes = await page.evaluate(() => {
      const modal = document.getElementById('modalCastleDetail');
      // 第59弾で新設されたクラス・要素に12px未満のフォントサイズが指定されていないこと
      const modalContent = modal.querySelector('.modal-content--detail');
      const leftCol = modal.querySelector('.detail-col-left');
      const body = modal.querySelector('.modal-detail-body');
      
      const violations = [];
      const targets = [
        { name: '.modal-content--detail', el: modalContent },
        { name: '.detail-col-left', el: leftCol },
        { name: '.modal-detail-body', el: body },
        { name: '.detail-section-title', el: modal.querySelector('.detail-section-title') },
        { name: '#detailCastleName', el: document.getElementById('detailCastleName') }
      ];

      for (const t of targets) {
        if (!t.el) continue;
        const fs = parseFloat(window.getComputedStyle(t.el).fontSize);
        if (fs < 12) {
          violations.push({ name: t.name, fontSize: fs });
        }
      }
      return violations;
    });
    assert('P59-04', '第59弾で更新されたUIクラスおよび主要タイトルのフォントサイズが12px以上であること', fontRes.length === 0, `violations: ${JSON.stringify(fontRes)}`);

  } finally {
    await browser.close();
  }

  console.log('\n==============================================');
  console.log(`PROMPT 59 AUTOMATED TESTS SUMMARY`);
  console.log(`PASSED: ${passCount} / ${passCount + failCount}`);
  console.log('==============================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPrompt59Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
