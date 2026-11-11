/**
 * tools/test_prompt60.js
 * Automated Verification Suite for Prompt 60:
 * 1. P60-01: ヘッダーの見切れ修正（1280px, 834px, 375pxでの無溢出・テキスト折り返し防止）
 * 2. P60-02: タッチ操作検証（ピンチズーム・ダブルタップ原寸切替・下スワイプクローズ・拡大中パン優先）
 * 3. P60-03: デスクトップマウス操作不変検証（ホイール・ドラッグ・ダブルクリック・Esc）
 * 4. P60-04: ヘルプ表示の出し分け検証（マウス用／タッチ用の文言切替・フォントサイズ>=12px）
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

async function runPrompt60Tests() {
  console.log('=== Running Prompt 60 Automated Test Suite: Zoom Viewer Tablet Header & Touch ===\n');

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

    // =============================================================
    // P60-01: ヘッダーの見切れ修正 (1280px, 834px, 375px)
    // =============================================================
    console.log('\n[P60-01: ヘッダーの見切れ修正 (1280px, 834px, 375px)]...');

    // 1280px: 1行表示で見切れなし
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(HTML_PATH, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app-container');

    await page.evaluate(() => {
      const c = window.SCRE_DATA.find(x => x.name.includes('無疆'));
      window.openImageZoom(c, 'battle');
    });
    await new Promise(r => setTimeout(r, 200));

    const w1280 = await page.evaluate(() => {
      const h = document.querySelector('.image-zoom-header');
      const badge = document.getElementById('zoomFormBadge');
      const title = document.getElementById('zoomCastleName');
      return {
        headerHeight: h.clientHeight,
        hasOverflow: h.scrollWidth > h.clientWidth + 1,
        titleHeight: title.clientHeight,
        badgeHeight: badge.clientHeight,
        badgeText: badge.textContent
      };
    });

    assert(
      'P60-01a',
      '1280px幅でヘッダーが1行(約51px)・水平溢出なし・バッジ内テキスト折り返しなしとなること',
      w1280.headerHeight <= 60 && !w1280.hasOverflow && w1280.badgeHeight <= 26,
      JSON.stringify(w1280)
    );

    // 834px: タブレット縦持ち相当 (2段構成、見切れなし)
    await page.setViewport({ width: 834, height: 1100 });
    await new Promise(r => setTimeout(r, 200));

    const w834 = await page.evaluate(() => {
      const h = document.querySelector('.image-zoom-header');
      const badge = document.getElementById('zoomFormBadge');
      const title = document.getElementById('zoomCastleName');
      const tabs = document.querySelector('.zoom-form-tabs');
      const ctrls = document.querySelector('.zoom-controls');
      return {
        headerHeight: h.clientHeight,
        hasOverflow: h.scrollWidth > h.clientWidth + 1,
        titleHeight: title.clientHeight,
        badgeHeight: badge.clientHeight,
        tabsWidth: tabs.clientWidth,
        ctrlsWidth: ctrls.clientWidth
      };
    });

    assert(
      'P60-01b',
      '834px幅(タブレット縦持ち)でヘッダーが2段構成・水平溢出なし・城娘名やバッジの見切れ・重なりがないこと',
      w834.headerHeight >= 70 && w834.headerHeight <= 120 && !w834.hasOverflow && w834.badgeHeight <= 26,
      JSON.stringify(w834)
    );

    // 375px: スマホ相当 (多段構成、溢れなし、タブ横スクロール可)
    await page.setViewport({ width: 375, height: 667 });
    await new Promise(r => setTimeout(r, 200));

    const w375 = await page.evaluate(() => {
      const h = document.querySelector('.image-zoom-header');
      const badge = document.getElementById('zoomFormBadge');
      const title = document.getElementById('zoomCastleName');
      const tabs = document.querySelector('.zoom-form-tabs');
      const ctrls = document.querySelector('.zoom-controls');
      return {
        headerHeight: h.clientHeight,
        hasOverflow: h.scrollWidth > h.clientWidth + 1,
        titleHeight: title.clientHeight,
        badgeHeight: badge.clientHeight,
        tabsScrollable: tabs.scrollWidth >= tabs.clientWidth,
        ctrlsVisible: ctrls.clientWidth > 0
      };
    });

    assert(
      'P60-01c',
      '375px幅(スマホ)でヘッダー全体が水平溢出なし・タブ群が横スクロール対応・全コントロールが収まること',
      !w375.hasOverflow && w375.tabsScrollable && w375.ctrlsVisible,
      JSON.stringify(w375)
    );

    // =============================================================
    // P60-02: タッチ操作検証（ピンチズーム・ダブルタップ・下スワイプ）
    // =============================================================
    console.log('\n[P60-02: タッチ操作検証]...');
    await page.setViewport({ width: 834, height: 1100 });

    // 2a. ピンチズーム
    const pinchRes = await page.evaluate(() => {
      const vp = document.getElementById('imageZoomViewport');
      const rect = vp.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Reset zoom to 1.0
      window.resetZoomTransform(true);
      const initScale = window.getZoomState().zoomScale;

      // Helper to dispatch TouchEvent
      function dispatchTouch(type, touchesList) {
        const touches = touchesList.map((t, idx) => {
          return new Touch({
            identifier: idx,
            target: vp,
            clientX: t.x,
            clientY: t.y
          });
        });
        const ev = new TouchEvent(type, {
          touches: touches,
          targetTouches: touches,
          changedTouches: touches,
          bubbles: true,
          cancelable: true
        });
        vp.dispatchEvent(ev);
      }

      // Touch start with 2 fingers dist = 100
      dispatchTouch('touchstart', [{ x: cx - 50, y: cy }, { x: cx + 50, y: cy }]);
      // Touch move with 2 fingers dist = 200 (2x zoom)
      dispatchTouch('touchmove', [{ x: cx - 100, y: cy }, { x: cx + 100, y: cy }]);
      // Touch end
      dispatchTouch('touchend', []);

      const afterScale = window.getZoomState().zoomScale;
      const indicatorText = document.getElementById('zoomLevelIndicator').textContent;

      return { initScale, afterScale, indicatorText };
    });

    assert(
      'P60-02a',
      'ピンチアウト操作で zoomScale が拡大し (1.0 -> 2.0)、インジケータ表示が連動すること',
      pinchRes.initScale === 1.0 && Math.abs(pinchRes.afterScale - 2.0) <= 0.05 && pinchRes.indicatorText === '200%',
      JSON.stringify(pinchRes)
    );

    // 2b. ダブルタップで原寸(200%)⇔全体表示(100%)切替
    const doubleTapRes = await page.evaluate(async () => {
      const vp = document.getElementById('imageZoomViewport');
      const rect = vp.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      window.resetZoomTransform(true);
      const startScale = window.getZoomState().zoomScale;

      function tap(x, y) {
        const touch = new Touch({ identifier: 0, target: vp, clientX: x, clientY: y });
        vp.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
        vp.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [touch], bubbles: true, cancelable: true }));
      }

      // First double tap: 1.0 -> 2.0
      tap(cx, cy);
      await new Promise(r => setTimeout(r, 60));
      tap(cx, cy);
      const scaleAfterDoubleTap1 = window.getZoomState().zoomScale;

      // Second double tap: 2.0 -> 1.0
      await new Promise(r => setTimeout(r, 400));
      tap(cx, cy);
      await new Promise(r => setTimeout(r, 60));
      tap(cx, cy);
      const scaleAfterDoubleTap2 = window.getZoomState().zoomScale;

      return { startScale, scaleAfterDoubleTap1, scaleAfterDoubleTap2 };
    });

    assert(
      'P60-02b',
      'ダブルタップで原寸(2.0)に拡大し、再度ダブルタップで全体表示(1.0)に復帰すること',
      doubleTapRes.startScale === 1.0 && doubleTapRes.scaleAfterDoubleTap1 === 2.0 && doubleTapRes.scaleAfterDoubleTap2 === 1.0,
      JSON.stringify(doubleTapRes)
    );

    // 2c. 拡大中（scale > 1.05）のスワイプはパン移動となり、閉じないこと
    const zoomedPanRes = await page.evaluate(() => {
      const vp = document.getElementById('imageZoomViewport');
      const rect = vp.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Set scale = 2.0
      window.resetZoomTransform(true);
      document.getElementById('btnZoomIn').click();
      document.getElementById('btnZoomIn').click();
      document.getElementById('btnZoomIn').click();
      document.getElementById('btnZoomIn').click(); // 2.0

      function dispatchTouch(type, x, y) {
        const touch = new Touch({ identifier: 0, target: vp, clientX: x, clientY: y });
        vp.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
      }

      dispatchTouch('touchstart', cx, cy);
      dispatchTouch('touchmove', cx, cy + 120);
      dispatchTouch('touchend', cx, cy + 120);

      const modal = document.getElementById('modalImageZoom');
      const isOpen = modal && window.getComputedStyle(modal).display !== 'none';
      const panY = window.getZoomState().zoomPanY;

      return { isOpen, panY };
    });

    assert(
      'P60-02c',
      '拡大中の下方向ドラッグではビューアが閉じず、パン移動 (zoomPanY > 0) となること',
      zoomedPanRes.isOpen && zoomedPanRes.panY >= 100,
      JSON.stringify(zoomedPanRes)
    );

    // 2d. 全体表示（scale <= 1.05）時の下スワイプで閉じること
    const swipeCloseRes = await page.evaluate(async () => {
      const vp = document.getElementById('imageZoomViewport');
      const modal = document.getElementById('modalImageZoom');
      const rect = vp.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      window.resetZoomTransform(true); // scale = 1.0

      function dispatchTouch(type, x, y) {
        const touch = new Touch({ identifier: 0, target: vp, clientX: x, clientY: y });
        vp.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
      }

      dispatchTouch('touchstart', cx, cy);
      dispatchTouch('touchmove', cx, cy + 100);
      dispatchTouch('touchend', cx, cy + 100);

      const isClosed = !modal || window.getComputedStyle(modal).display === 'none';
      return { isClosed };
    });

    assert(
      'P60-02d',
      '全体表示(100%)時の下スワイプで画像ビューアが閉じること',
      swipeCloseRes.isClosed,
      JSON.stringify(swipeCloseRes)
    );

    // =============================================================
    // P60-03: デスクトップマウス操作不変検証
    // =============================================================
    console.log('\n[P60-03: デスクトップマウス操作不変検証]...');
    // Reopen modal
    await page.evaluate(() => {
      const c = window.SCRE_DATA.find(x => x.name.includes('無疆'));
      window.openImageZoom(c, 'battle');
    });

    // 3a. マウスホイールズーム
    const mouseWheelRes = await page.evaluate(() => {
      const vp = document.getElementById('imageZoomViewport');
      window.resetZoomTransform(true);
      const initScale = window.getZoomState().zoomScale;

      vp.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
      const zoomedScale = window.getZoomState().zoomScale;
      return { initScale, zoomedScale };
    });
    assert(
      'P60-03a',
      'マウスホイール操作でズームできること (deltaY < 0 で拡大)',
      mouseWheelRes.initScale === 1.0 && mouseWheelRes.zoomedScale > 1.0,
      JSON.stringify(mouseWheelRes)
    );

    // 3b. マウスドラッグ移動
    const mouseDragRes = await page.evaluate(() => {
      const vp = document.getElementById('imageZoomViewport');
      window.resetZoomTransform(true);

      vp.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, clientY: 200, bubbles: true }));
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 280, bubbles: true }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      const pan = window.getZoomState();
      return { panX: pan.zoomPanX, panY: pan.zoomPanY };
    });
    assert(
      'P60-03b',
      'マウスドラッグで画像がパン移動できること (panX = 50, panY = 80)',
      mouseDragRes.panX === 50 && mouseDragRes.panY === 80,
      JSON.stringify(mouseDragRes)
    );

    // 3c. ダブルクリックで原寸切替
    const mouseDblClickRes = await page.evaluate(() => {
      const vp = document.getElementById('imageZoomViewport');
      window.resetZoomTransform(true);

      vp.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const scale1 = window.getZoomState().zoomScale;
      vp.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const scale2 = window.getZoomState().zoomScale;

      return { scale1, scale2 };
    });
    assert(
      'P60-03c',
      'マウスダブルクリックで原寸(2.0)⇔全体表示(1.0)がトグルすること',
      mouseDblClickRes.scale1 === 2.0 && mouseDblClickRes.scale2 === 1.0,
      JSON.stringify(mouseDblClickRes)
    );

    // 3d. Escキーで閉じる
    const escCloseRes = await page.evaluate(() => {
      const modal = document.getElementById('modalImageZoom');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const isClosed = window.getComputedStyle(modal).display === 'none';
      return { isClosed };
    });
    assert(
      'P60-03d',
      'Escキーで画像ビューアが閉じられること',
      escCloseRes.isClosed,
      JSON.stringify(escCloseRes)
    );

    // =============================================================
    // P60-04: ヘルプ表示の出し分け検証 (>= 12px)
    // =============================================================
    console.log('\n[P60-04: ヘルプ表示の出し分け・フォントサイズ検証]...');
    // Reopen modal
    await page.evaluate(() => {
      const c = window.SCRE_DATA.find(x => x.name.includes('無疆'));
      window.openImageZoom(c, 'battle');
    });

    const helpRes = await page.evaluate(() => {
      const mouseEl = document.getElementById('zoomHintMouse');
      const touchEl = document.getElementById('zoomHintTouch');
      const vp = document.getElementById('imageZoomViewport');

      const mouseText = mouseEl ? mouseEl.textContent : '';
      const touchText = touchEl ? touchEl.textContent : '';
      const mouseFs = mouseEl ? parseFloat(window.getComputedStyle(mouseEl).fontSize) : 0;
      const touchFs = touchEl ? parseFloat(window.getComputedStyle(touchEl).fontSize) : 0;

      // Trigger touchstart to test dynamic hint switch
      const touch = new Touch({ identifier: 0, target: vp, clientX: 100, clientY: 100 });
      vp.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true }));

      const touchDisplayAfterTouch = touchEl ? window.getComputedStyle(touchEl).display : '';
      const mouseDisplayAfterTouch = mouseEl ? window.getComputedStyle(mouseEl).display : '';

      return {
        mouseText,
        touchText,
        mouseFs,
        touchFs,
        touchDisplayAfterTouch,
        mouseDisplayAfterTouch
      };
    });

    assert(
      'P60-04a',
      'マウス用ヘルプとタッチ用ヘルプの文言が適切に用意され、フォントサイズが12px以上であること',
      helpRes.mouseText.includes('ドラッグ') &&
      helpRes.mouseText.includes('ホイール') &&
      helpRes.touchText.includes('ピンチ') &&
      helpRes.touchText.includes('スワイプ') &&
      helpRes.mouseFs >= 11.9 &&
      helpRes.touchFs >= 11.9,
      JSON.stringify(helpRes)
    );

    assert(
      'P60-04b',
      'タッチイベント発火時にタッチ用ヘルプ表示に自動切り替えされること',
      helpRes.touchDisplayAfterTouch === 'block' && helpRes.mouseDisplayAfterTouch === 'none',
      `touchDisplay: ${helpRes.touchDisplayAfterTouch}, mouseDisplay: ${helpRes.mouseDisplayAfterTouch}`
    );

  } finally {
    await browser.close();
  }

  console.log('\n==============================================');
  console.log('PROMPT 60 AUTOMATED TESTS SUMMARY');
  console.log(`PASSED: ${passCount} / ${passCount + failCount}`);
  console.log('==============================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPrompt60Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
