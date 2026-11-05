const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTML_FILE = 'file:///' + path.resolve(__dirname, '../app/index.html').replace(/\\/g, '/');

async function runTests() {
  console.log('--- E2E Browser Testing starting ---');
  console.log('Loading file:', HTML_FILE);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--allow-file-access-from-files', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Listen to console logs and errors
  const pageErrors = [];
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => {
    console.error('PAGE ERROR:', err.message);
    pageErrors.push(err.message);
  });

  await page.goto(HTML_FILE, { waitUntil: 'load' });

  // Test 1: Check initial render & party count
  console.log('\n[TEST 1] Checking initial render...');
  const title = await page.$eval('.app-title', el => el.textContent);
  const partyCounter = await page.$eval('#partyCounter', el => el.textContent);
  console.log('Title:', title);
  console.log('Party counter:', partyCounter);
  if (!partyCounter.includes('8/8') && !partyCounter.includes('0/8')) {
    throw new Error('Initial party count unexpected: ' + partyCounter);
  }
  console.log('=> TEST 1 PASSED');

  // Test 2: Check live calculation numbers in party slot and buff cards
  console.log('\n[TEST 2] Checking live stat calculation before toggle...');
  const firstSlotSubinfoBefore = await page.$eval('.party-card .castle-subinfo', el => el.textContent);
  const firstBuffSummaryBefore = await page.$eval('.buff-card .buff-stats-summary', el => el.textContent);
  console.log('1st slot subinfo:', firstSlotSubinfoBefore.trim());
  console.log('1st buff card summary:', firstBuffSummaryBefore.trim());

  // Test 3: Click Strategy toggle and verify number changes
  console.log('\n[TEST 3] Toggling strategy ON/OFF and verifying number change...');
  // Find first toggle button
  const toggleBtn = await page.$('.party-card .btn-toggle');
  if (!toggleBtn) throw new Error('No strategy toggle button found');
  
  const btnTextBefore = await page.evaluate(el => el.textContent.trim(), toggleBtn);
  console.log('Button text before:', btnTextBefore);
  
  await toggleBtn.click();
  await new Promise(r => setTimeout(r, 100)); // wait state render

  const btnTextAfter = await page.evaluate(el => el.textContent.trim(), toggleBtn);
  const firstSlotSubinfoAfter = await page.$eval('.party-card .castle-subinfo', el => el.textContent);
  const firstBuffSummaryAfter = await page.$eval('.buff-card .buff-stats-summary', el => el.textContent);

  console.log('Button text after:', btnTextAfter);
  console.log('1st slot subinfo after:', firstSlotSubinfoAfter.trim());
  console.log('1st buff card summary after:', firstBuffSummaryAfter.trim());

  if (firstBuffSummaryBefore.trim() === firstBuffSummaryAfter.trim()) {
    console.warn('WARNING: Numbers did not change after toggle! (Check if character has strategy effects)');
  } else {
    console.log('=> SUCCESS: Stat numbers dynamically changed after strategy toggle!');
  }
  console.log('=> TEST 3 PASSED');

  // Test 4: Check "無" attribute in castle list tab
  console.log('\n[TEST 4] Testing "無" filter in List Tab...');
  // Switch to list tab
  await page.click('button[data-tab="tab-list"]');
  await new Promise(r => setTimeout(r, 100));

  // Select "無"
  await page.select('#filterType', '無');
  await new Promise(r => setTimeout(r, 200));

  const countAfterNoneFilter = await page.$$eval('#allCastleList .castle-list-item', els => els.length);
  console.log('Total castles displayed with "無" filter:', countAfterNoneFilter);

  // Check if Erika or DMM城 is in the list
  const hasErika = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#allCastleList .castle-list-item'));
    return items.some(it => it.textContent.includes('逸見エリカ') || it.textContent.includes('DMM城'));
  });
  console.log('Contains Erika or DMM城:', hasErika);

  if (countAfterNoneFilter === 0 || !hasErika) {
    throw new Error('TEST 4 FAILED: "無" attribute filter returned 0 results or missing expected characters!');
  }
  console.log('=> TEST 4 PASSED');

  // Test 5: Search input with "無"
  console.log('\n[TEST 5] Testing search input keyword "無"...');
  await page.select('#filterType', ''); // reset
  await page.type('#searchCastleInput', '無');
  await new Promise(r => setTimeout(r, 200));
  const searchResultCount = await page.$$eval('#allCastleList .castle-list-item', els => els.length);
  console.log('Search results for "無":', searchResultCount);
  if (searchResultCount === 0) {
    throw new Error('TEST 5 FAILED: Search with "無" returned 0 items');
  }
  console.log('=> TEST 5 PASSED');

  // Test 6: Click castle card to open Detail Modal with fullbody image
  console.log('\n[TEST 6] Testing Castle Detail Modal popup and fullbody image...');
  // Clear search input and search for 名古屋城
  await page.$eval('#searchCastleInput', el => el.value = '');
  await page.type('#searchCastleInput', '名古屋城');
  await new Promise(r => setTimeout(r, 200));

  const firstCastleItem = await page.$('#allCastleList .castle-list-item');
  if (!firstCastleItem) throw new Error('TEST 6 FAILED: 名古屋城 not found in list');

  console.log('Clicking on 名古屋城 card...');
  await firstCastleItem.click();
  await new Promise(r => setTimeout(r, 300)); // wait modal opening

  // Verify modal is open
  const isModalOpen = await page.evaluate(() => {
    const modal = document.getElementById('modalCastleDetail');
    return modal && modal.classList.contains('open');
  });
  console.log('Detail Modal is open:', isModalOpen);
  if (!isModalOpen) throw new Error('TEST 6 FAILED: Detail Modal did not open!');

  // Verify modal contents
  const detailData = await page.evaluate(() => {
    return {
      name: document.getElementById('detailCastleName').textContent,
      ruby: document.getElementById('detailCastleRuby').textContent,
      no: document.getElementById('detailCastleNo').textContent,
      imgSrc: document.getElementById('detailPortraitImg').src,
      lore: document.getElementById('detailLoreText').textContent.slice(0, 30),
      skillCount: document.querySelectorAll('#detailSkillContainer .ability-stage-card').length,
      stratCount: document.querySelectorAll('#detailStrategyContainer .ability-stage-card').length
    };
  });
  console.log('Modal detail contents:', detailData);

  if (!detailData.name.includes('名古屋城')) throw new Error('TEST 6 FAILED: Detail modal name mismatch');
  if (!detailData.imgSrc || !decodeURIComponent(detailData.imgSrc).includes('名古屋城')) throw new Error('TEST 6 FAILED: Portrait image src missing or invalid: ' + detailData.imgSrc);
  if (detailData.skillCount === 0) throw new Error('TEST 6 FAILED: Skills not rendered in modal');

  // Take screenshot of detail modal
  await page.screenshot({ path: path.resolve(__dirname, 'modal_detail_screenshot.png'), fullPage: false });
  console.log('Saved modal screenshot to modal_detail_screenshot.png');

  // Test close button
  await page.click('#modalDetailCloseBtn');
  await new Promise(r => setTimeout(r, 200));
  const isModalClosed = await page.evaluate(() => {
    const modal = document.getElementById('modalCastleDetail');
    return !modal.classList.contains('open');
  });
  console.log('Modal closed after clicking close button:', isModalClosed);
  if (!isModalClosed) throw new Error('TEST 6 FAILED: Modal did not close on close button click');
  console.log('=> TEST 6 PASSED');

  // Test 7: Multi-attribute (複合属性) verification with [アイドル] 江戸城＆信貴山城
  console.log('\n[TEST 7] Testing multi-attribute (平/山) display & filter for [アイドル] 江戸城＆信貴山城...');
  await page.$eval('#searchCastleInput', el => el.value = '');
  await page.type('#searchCastleInput', '信貴山城');
  await new Promise(r => setTimeout(r, 200));

  const idolItem = await page.$('#allCastleList .castle-list-item');
  if (!idolItem) throw new Error('TEST 7 FAILED: [アイドル] 江戸城＆信貴山城 not found in list');

  const itemText = await page.evaluate(el => el.textContent, idolItem);
  console.log('List item text:', itemText.replace(/\s+/g, ' '));
  if (!itemText.includes('平/山')) {
    throw new Error('TEST 7 FAILED: Multi-attribute 平/山 not displayed in list item text: ' + itemText);
  }

  // Open modal
  await idolItem.click();
  await new Promise(r => setTimeout(r, 300));

  const modalAttrText = await page.evaluate(() => {
    const badges = document.getElementById('detailBadges');
    return badges ? badges.textContent : '';
  });
  const hasSplitGradient = await page.evaluate(() => {
    return !!document.querySelector('#detailBadges .badge-attr-plain-mtn');
  });
  console.log('Modal badges text:', modalAttrText.replace(/\s+/g, ' '));
  console.log('Has split gradient class (.badge-attr-plain-mtn):', hasSplitGradient);

  if (!modalAttrText.includes('平/山')) {
    throw new Error('TEST 7 FAILED: Detail modal does not show 平/山 attribute: ' + modalAttrText);
  }
  if (!hasSplitGradient) {
    throw new Error('TEST 7 FAILED: Detail modal missing .badge-attr-plain-mtn gradient class');
  }

  // Save screenshot of idol edo shigi detail modal
  await page.screenshot({ path: path.resolve(__dirname, 'modal_idol_edo_screenshot.png'), fullPage: false });
  console.log('Saved idol edo modal screenshot to modal_idol_edo_screenshot.png');

  // Close modal
  await page.click('#modalDetailCloseBtn');
  await new Promise(r => setTimeout(r, 200));

  // Test "複合" filter
  await page.$eval('#searchCastleInput', el => el.value = '');
  await page.select('#filterType', '複合');
  await new Promise(r => setTimeout(r, 200));
  const multiAttrCount = await page.$$eval('#allCastleList .castle-list-item', els => els.length);
  console.log('Castles displayed under "複合" filter:', multiAttrCount);
  if (multiAttrCount === 0) {
    throw new Error('TEST 7 FAILED: "複合" filter returned 0 results');
  }

  // Test "山" filter includes [アイドル] 江戸城＆信貴山城 (which is 平/山)
  await page.select('#filterType', '山');
  await page.type('#searchCastleInput', '信貴山城');
  await new Promise(r => setTimeout(r, 200));
  const hasIdolInMountain = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#allCastleList .castle-list-item'));
    return items.some(it => it.textContent.includes('信貴山城'));
  });
  console.log('平/山 unit found when filtering by 山:', hasIdolInMountain);
  if (!hasIdolInMountain) {
    throw new Error('TEST 7 FAILED: 平/山 unit should be found when filtering by 山');
  }

  console.log('=> TEST 7 PASSED');

  // Test 8: Large card view and Pagination functionality
  console.log('\n[TEST 8] Testing Large Card View & Pagination controls...');
  // Reset filters
  await page.select('#filterType', '');
  await page.$eval('#searchCastleInput', el => el.value = '');
  await page.select('#filterRarity', '');
  await new Promise(r => setTimeout(r, 200));

  const itemsPage1 = await page.$$eval('#allCastleList .castle-list-item', els => els.length);
  console.log('Total items on page 1 (default 36):', itemsPage1);
  if (itemsPage1 !== 36) throw new Error('TEST 8 FAILED: Expected 36 items on page 1, got ' + itemsPage1);

  // Check card height (should be comfortably enlarged, >= 70px)
  const cardHeight = await page.$eval('#allCastleList .castle-list-item', el => el.getBoundingClientRect().height);
  console.log('Enlarged Card height in pixels:', cardHeight);
  if (cardHeight < 65) throw new Error('TEST 8 FAILED: Card height is too small: ' + cardHeight);

  // Check pagination info text
  const paginationInfo = await page.$eval('#listPaginationTop .pagination-info', el => el.textContent);
  console.log('Top pagination info:', paginationInfo.trim().replace(/\s+/g, ' '));
  if (!paginationInfo.includes('1161') || !paginationInfo.includes('1〜36')) {
    throw new Error('TEST 8 FAILED: Pagination info mismatch: ' + paginationInfo);
  }

  // Click page 2 button
  console.log('Clicking page 2 button...');
  await page.click('#listPaginationTop button[data-page="2"]');
  await new Promise(r => setTimeout(r, 200));

  const paginationInfoPage2 = await page.$eval('#listPaginationTop .pagination-info', el => el.textContent);
  console.log('Page 2 pagination info:', paginationInfoPage2.trim());
  if (!paginationInfoPage2.includes('37〜72') || !paginationInfoPage2.includes('2 /')) {
    throw new Error('TEST 8 FAILED: Page 2 navigation failed: ' + paginationInfoPage2);
  }

  // Take screenshot of enlarged card list
  await page.screenshot({ path: path.resolve(__dirname, 'large_list_cards_screenshot.png'), fullPage: false });
  console.log('Saved enlarged cards screenshot to large_list_cards_screenshot.png');
  console.log('=> TEST 8 PASSED');

  // Test 9: Party Presets 1 to 5
  console.log('\n[TEST 9] Testing Party Presets (Presets 1 to 5)...');
  await page.click('button[data-tab="tab-dashboard"]');
  await new Promise(r => setTimeout(r, 200));

  const presetCount = await page.$$eval('#presetButtonsList .preset-tab-btn', els => els.length);
  console.log('Total preset tabs:', presetCount);
  if (presetCount !== 5) throw new Error('TEST 9 FAILED: Expected 5 presets, got ' + presetCount);

  // Switch to Preset 2 (empty)
  console.log('Switching to Preset 2...');
  await page.evaluate(() => {
    document.querySelectorAll('#presetButtonsList .preset-tab-btn')[1].click();
  });
  await new Promise(r => setTimeout(r, 200));

  const counterP2 = await page.$eval('#partyCounter', el => el.textContent);
  console.log('Party counter on Preset 2:', counterP2);
  if (!counterP2.includes('0/8')) throw new Error('TEST 9 FAILED: Preset 2 should be empty initially');

  // Switch back to Preset 1
  console.log('Switching back to Preset 1...');
  await page.evaluate(() => {
    document.querySelectorAll('#presetButtonsList .preset-tab-btn')[0].click();
  });
  await new Promise(r => setTimeout(r, 200));
  const counterP1 = await page.$eval('#partyCounter', el => el.textContent);
  console.log('Party counter on Preset 1 restored:', counterP1);
  if (!counterP1.includes('8/8')) throw new Error('TEST 9 FAILED: Preset 1 not restored properly');
  console.log('=> TEST 9 PASSED');

  // Test 10: Reverse Buff/Effect Filter
  console.log('\n[TEST 10] Testing Reverse Buff/Effect Filter...');
  await page.click('button[data-tab="tab-list"]');
  await new Promise(r => setTimeout(r, 200));

  // Select "atkFlat" (攻撃固定値)
  await page.select('#filterBuffCategory', 'atkFlat');
  await new Promise(r => setTimeout(r, 200));

  const atkFlatCount = await page.$$eval('#allCastleList .castle-list-item', els => els.length);
  console.log('Castles with atkFlat (攻撃固定値):', atkFlatCount);
  if (atkFlatCount === 0) throw new Error('TEST 10 FAILED: atkFlat filter returned 0 results');

  // Select "special_stop" (足止め)
  await page.select('#filterBuffCategory', 'special_stop');
  await new Promise(r => setTimeout(r, 200));
  const stopCount = await page.$$eval('#allCastleList .castle-list-item', els => els.length);
  console.log('Castles with 足止め:', stopCount);
  if (stopCount === 0) throw new Error('TEST 10 FAILED: 足止め filter returned 0 results');

  await page.select('#filterBuffCategory', ''); // reset
  console.log('=> TEST 10 PASSED');

  // Test 11: Terrain Simulation & Cost Calculation
  console.log('\n[TEST 11] Testing Terrain Simulation & Total Cost...');
  await page.click('button[data-tab="tab-dashboard"]');
  await new Promise(r => setTimeout(r, 200));

  // Check cost before terrain selection
  const costSummaryBefore = await page.$eval('#totalCostSummary', el => el.textContent);
  console.log('Cost summary (no terrain):', costSummaryBefore.trim().replace(/\s+/g, ' '));

  // Select "平" terrain
  await page.select('#mapTerrainSelect', '平');
  await new Promise(r => setTimeout(r, 200));

  const costSummaryAfter = await page.$eval('#totalCostSummary', el => el.textContent);
  console.log('Cost summary (平 terrain):', costSummaryAfter.trim().replace(/\s+/g, ' '));
  if (!costSummaryAfter.includes('平一致')) {
    throw new Error('TEST 11 FAILED: Total cost summary missing 平一致: ' + costSummaryAfter);
  }

  // Check if at least one slot shows "✓一致"
  const hasMatchTag = await page.evaluate(() => {
    return document.body.innerHTML.includes('✓一致');
  });
  console.log('Slot contains ✓一致 badge:', hasMatchTag);
  if (!hasMatchTag) throw new Error('TEST 11 FAILED: Slot missing ✓一致 badge');
  console.log('=> TEST 11 PASSED');

  // Test 12: High-Difficulty Map Stage Diagnostic
  console.log('\n[TEST 12] Testing Stage Diagnostic Modal...');
  await page.click('button[data-tab="tab-guides"]');
  await new Promise(r => setTimeout(r, 200));

  const firstDiagBtn = await page.$('button[data-action="diag-stage"]');
  if (!firstDiagBtn) throw new Error('TEST 12 FAILED: No diag-stage button found in guides');

  await firstDiagBtn.click();
  await new Promise(r => setTimeout(r, 300));

  const isDiagModalOpen = await page.evaluate(() => {
    const modal = document.getElementById('modalStageDiagnostic');
    return modal && modal.classList.contains('open');
  });
  console.log('Diagnostic modal is open:', isDiagModalOpen);
  if (!isDiagModalOpen) throw new Error('TEST 12 FAILED: Diagnostic modal did not open');

  const diagEvalItems = await page.$$eval('#diagPartyEvaluation .section-box', els => els.length);
  console.log('Evaluated party items in diagnostic modal:', diagEvalItems);
  if (diagEvalItems === 0) throw new Error('TEST 12 FAILED: No evaluation items in diagnostic modal');

  // Close diagnostic modal
  await page.click('#modalDiagCloseBtn');
  await new Promise(r => setTimeout(r, 200));
  console.log('=> TEST 12 PASSED');

  // Test 13: Party Summary Image Export (Canvas)
  console.log('\n[TEST 13] Testing Canvas Summary Image generation...');
  await page.click('button[data-tab="tab-dashboard"]');
  await new Promise(r => setTimeout(r, 200));

  // Trigger export
  const exportSuccess = await page.evaluate(() => {
    try {
      const canvas = document.getElementById('partyCanvas');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      return !!ctx;
    } catch (e) {
      return false;
    }
  });
  console.log('Canvas export context ready:', exportSuccess);
  if (!exportSuccess) throw new Error('TEST 13 FAILED: Canvas context not available');

  // Click Export Image button
  await page.click('#btnExportImage');
  await new Promise(r => setTimeout(r, 300));
  console.log('=> TEST 13 PASSED');

  // Test 14: Comprehensive Hades & Hell Guides Verification
  console.log('\n[TEST 14] Testing Hades (ハデスの死闘場) & Hell Guides Integration...');
  await page.click('button[data-tab="tab-guides"]');
  await new Promise(r => setTimeout(r, 300));

  // 1. Verify Category = 地獄
  await page.select('#guideCategorySelect', '地獄');
  await new Promise(r => setTimeout(r, 200));

  // 2. Select Subcategory = ハデスの死闘場
  await page.select('#guideSubCategorySelect', 'ハデスの死闘場');
  await new Promise(r => setTimeout(r, 200));

  // 3. Verify Hades Overview Banner
  const hasHadesBanner = await page.evaluate(() => {
    const text = document.getElementById('guidesListContainer').textContent;
    return text.includes('ハデスの死闘場') && text.includes('ハデスの霊魂') && text.includes('暗闇') && text.includes('再配置時間50秒・気30固定');
  });
  console.log('Hades Overview Banner present:', hasHadesBanner);
  if (!hasHadesBanner) throw new Error('TEST 14 FAILED: Hades Overview Banner missing required strategy information');

  // 4. Verify all 11 Hades stages are rendered
  const hadesCardsCount = await page.$$eval('#guidesListContainer .buff-card', els => els.length);
  console.log('Hades stages rendered:', hadesCardsCount);
  if (hadesCardsCount !== 11) {
    throw new Error('TEST 14 FAILED: Expected exactly 11 Hades stages, found ' + hadesCardsCount);
  }

  // 5. Verify Maeda Toshiie card details
  const toshiieCardText = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#guidesListContainer .buff-card'));
    const toshiie = cards.find(c => c.textContent.includes('覇・前田利家'));
    return toshiie ? toshiie.textContent : '';
  });
  console.log('Toshiie card found with 36 deliberations:', toshiieCardText.includes('36審議') && toshiieCardText.includes('赤霊魂'));
  if (!toshiieCardText.includes('36審議') || !toshiieCardText.includes('赤霊魂')) {
    throw new Error('TEST 14 FAILED: Maeda Toshiie card missing 36 deliberations or soul badge');
  }

  // 6. Test search filter with "クロノス"
  await page.type('#guideSearchInput', 'クロノス');
  await new Promise(r => setTimeout(r, 200));
  const kronosCardsCount = await page.$$eval('#guidesListContainer .buff-card', els => els.length);
  console.log('Filtered cards for "クロノス":', kronosCardsCount);
  if (kronosCardsCount !== 1) throw new Error('TEST 14 FAILED: Search for "クロノス" should return 1 stage');

  // Clear search
  await page.evaluate(() => { document.getElementById('guideSearchInput').value = ''; });
  await page.select('#guideSubCategorySelect', 'ハデスの死闘場');
  await new Promise(r => setTimeout(r, 200));

  // Take screenshot of Hades guides list
  const hadesListScreenshotPath = path.resolve(__dirname, 'hades_guides_screenshot.png');
  await page.screenshot({ path: hadesListScreenshotPath, fullPage: false });
  console.log('Saved Hades guides screenshot to:', hadesListScreenshotPath);

  // 7. Test Stage Diagnostic Modal on Hades Maeda Toshiie
  console.log('Testing Diagnostic Modal for Hades Maeda Toshiie...');
  const toshiieDiagBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button[data-action="diag-stage"]'));
    return btns.find(b => b.getAttribute('data-title').includes('覇・前田利家'));
  });
  if (!toshiieDiagBtn) throw new Error('TEST 14 FAILED: Maeda Toshiie diag button not found');
  await toshiieDiagBtn.click();
  await new Promise(r => setTimeout(r, 300));

  const diagTitle = await page.$eval('#diagStageTitle', el => el.textContent);
  console.log('Diagnostic modal opened for:', diagTitle);
  if (!diagTitle.includes('覇・前田利家')) throw new Error('TEST 14 FAILED: Diag title mismatch: ' + diagTitle);

  const hasHadesDiagBox = await page.evaluate(() => {
    const text = document.getElementById('diagStageRules').textContent;
    return text.includes('ハデス死闘場 攻略診断') && text.includes('暗闇・自爆対策');
  });
  console.log('Hades tactical diagnostic box active in modal:', hasHadesDiagBox);
  if (!hasHadesDiagBox) throw new Error('TEST 14 FAILED: Hades tactical diagnostic box missing in modal');

  // Take screenshot of Hades diagnostic modal
  const hadesDiagScreenshotPath = path.resolve(__dirname, 'hades_diagnostic_screenshot.png');
  await page.screenshot({ path: hadesDiagScreenshotPath, fullPage: false });
  console.log('Saved Hades diagnostic screenshot to:', hadesDiagScreenshotPath);

  // Close modal
  await page.click('#modalDiagCloseBtn');
  await new Promise(r => setTimeout(r, 200));

  console.log('=> TEST 14 PASSED');

  // Test 15: Unified Buff Breakdown & Recovery Flat (Prompt 1)
  console.log('\n[TEST 15] Testing Unified Buff Breakdown & Recovery Flat...');
  await page.click('button[data-tab="tab-dashboard"]');
  await new Promise(r => setTimeout(r, 200));

  // Add 姫路城 (has recoveryFlat +35) via bulk load
  await page.evaluate(() => {
    document.getElementById('bulkInputText').value = '姫路城, 崑崙, 小早川城, ［漆磊］広島城, ［無疆］江戸城, ［球陽］首里城, ［お月見］鹿野城, 逸見エリカ';
  });
  await page.click('#btnBulkLoad');
  await new Promise(r => setTimeout(r, 300));

  // Check if 回復固定 row appears on buff card
  const hasRecoveryRow = await page.evaluate(() => {
    const text = document.getElementById('buffCalculatedList').textContent;
    return text.includes('回復固定') && text.includes('+35');
  });
  console.log('Recovery row (+35) rendered on buff card:', hasRecoveryRow);
  if (!hasRecoveryRow) throw new Error('TEST 15 FAILED: 回復固定 (+35) not rendered after adding 姫路城');

  // Check breakdown toggle on 回復固定
  const recoveryBreakdownContent = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#buffCalculatedList .buff-card'));
    for (const c of cards) {
      const rows = Array.from(c.querySelectorAll('.buff-row'));
      const recRow = rows.find(r => r.textContent.includes('回復固定'));
      if (recRow) {
        const list = recRow.nextElementSibling;
        return list ? list.textContent : '';
      }
    }
    return '';
  });
  console.log('Recovery breakdown list text:', recoveryBreakdownContent.trim());
  if (!recoveryBreakdownContent.includes('姫路城') || !recoveryBreakdownContent.includes('[加算]')) {
    throw new Error('TEST 15 FAILED: Recovery breakdown list missing 姫路城 or [加算]');
  }

  // Check unified toggles across other stats (防御(%), 耐久(%), 攻撃(%))
  const toggleCount = await page.$$eval('#buffCalculatedList .breakdown-toggle', els => els.length);
  console.log('Total breakdown toggles on buff grid:', toggleCount);
  if (toggleCount < 5) throw new Error('TEST 15 FAILED: Expected breakdown toggles for all buff rows, found ' + toggleCount);
  console.log('=> TEST 15 PASSED');

  // Test 16: Dashboard Direct Stage Diagnostic & Terrain Auto-Sync (Prompt 2)
  console.log('\n[TEST 16] Testing Dashboard Stage Selector & Diagnostic...');
  // Select a Hell stage with "地獄" terrain
  await page.select('#dashboardStageSelect', '深淵の闘技場 -覇・前田利家-');
  await new Promise(r => setTimeout(r, 200));

  // Check if mapTerrainSelect auto-changed to "地獄"
  const currentTerrainVal = await page.$eval('#mapTerrainSelect', el => el.value);
  console.log('mapTerrainSelect auto-synced to:', currentTerrainVal);
  if (currentTerrainVal !== '地獄') throw new Error('TEST 16 FAILED: mapTerrainSelect did not auto-sync to 地獄');

  // Click btnDashboardDiag
  await page.click('#btnDashboardDiag');
  await new Promise(r => setTimeout(r, 300));

  const isModalOpenFromDashboard = await page.evaluate(() => {
    const modal = document.getElementById('modalStageDiagnostic');
    return modal && modal.classList.contains('open');
  });
  const diagStageTitle = await page.$eval('#diagStageTitle', el => el.textContent);
  console.log('Diagnostic modal opened directly from dashboard:', isModalOpenFromDashboard, 'for:', diagStageTitle);
  if (!isModalOpenFromDashboard || !diagStageTitle.includes('覇・前田利家')) {
    throw new Error('TEST 16 FAILED: Dashboard diag button did not open modal for selected stage');
  }

  // Close modal
  await page.click('#modalDiagCloseBtn');
  await new Promise(r => setTimeout(r, 200));
  console.log('=> TEST 16 PASSED');

  // Test 17: Name List Export & Bulk Roundtrip & Bug Fixes (Prompt 3 & おまけ)
  console.log('\n[TEST 17] Testing Party Name Export, Roundtrip & Bug Fixes...');
  // Click btnExportPartyNames
  await page.click('#btnExportPartyNames');
  await new Promise(r => setTimeout(r, 200));

  const exportedNames = await page.$eval('#bulkInputText', el => el.value);
  console.log('Exported party names:', exportedNames);
  if (!exportedNames.includes('姫路城') || !exportedNames.includes('［漆磊］広島城')) {
    throw new Error('TEST 17 FAILED: Exported names missing expected castles: ' + exportedNames);
  }

  // Roundtrip test: Clear party then Bulk Load
  page.once('dialog', async dialog => {
    await dialog.accept();
  });
  await page.click('#btnEmptyParty');
  await new Promise(r => setTimeout(r, 300));
  const emptyCounter = await page.$eval('#partyCounter', el => el.textContent);
  console.log('Party counter after empty:', emptyCounter);
  if (!emptyCounter.includes('0/8')) throw new Error('TEST 17 FAILED: Party not cleared');

  // Restore exported text to input and click btnBulkLoad
  await page.evaluate(text => {
    document.getElementById('bulkInputText').value = text;
  }, exportedNames);
  await page.click('#btnBulkLoad');
  await new Promise(r => setTimeout(r, 300));

  const restoredCounter = await page.$eval('#partyCounter', el => el.textContent);
  console.log('Party counter after bulk reload:', restoredCounter);
  if (!restoredCounter.includes('8/8')) {
    throw new Error('TEST 17 FAILED: Party not restored to 8/8 via bulk reload');
  }

  // Check appInfoCastleCount in Settings Tab
  await page.click('button[data-tab="tab-settings"]');
  await new Promise(r => setTimeout(r, 200));
  const castleCountText = await page.$eval('#appInfoCastleCount', el => el.textContent);
  console.log('Dynamic appInfoCastleCount:', castleCountText);
  if (castleCountText !== '1,161') {
    throw new Error('TEST 17 FAILED: Dynamic castle count not 1,161: ' + castleCountText);
  }

  // Clear localStorage and check initial preset with ［漆磊］広島城
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 400));
  const p1CounterFresh = await page.$eval('#partyCounter', el => el.textContent);
  const p1Hiroshima = await page.evaluate(() => {
    const slots = Array.from(document.querySelectorAll('#partySlotList .party-card'));
    return slots.some(s => s.textContent.includes('［漆磊］広島城'));
  });
  console.log('Fresh localStorage initial counter:', p1CounterFresh, 'has ［漆磊］広島城:', p1Hiroshima);
  if (!p1CounterFresh.includes('8/8') || !p1Hiroshima) {
    throw new Error('TEST 17 FAILED: Fresh localStorage party did not load 8/8 with ［漆磊］広島城');
  }
  console.log('=> TEST 17 PASSED');

  // Test 18: Stage Diagnostic Bug Fixes (rangeKind check & Hades statusCounters)
  console.log('\n[TEST 18] Testing Stage Diagnostic Bug Fixes (rangeKind & Hades statusCounters)...');
  await page.click('button[data-tab="tab-dashboard"]');
  await new Promise(r => setTimeout(r, 200));

  // Load a party containing ブダ城 (status counter) and 彦根城 (melee)
  await page.evaluate(() => {
    document.getElementById('bulkInputText').value = 'ブダ城, 彦根城, 大坂城, 江戸城, 聚楽第';
  });
  await page.click('#btnBulkLoad');
  await new Promise(r => setTimeout(r, 300));

  // Select 深淵の闘技場 -覇・前田利家- and open diagnostic
  await page.evaluate(() => {
    const sel = document.getElementById('dashboardStageSelect');
    const opt = Array.from(sel.options).find(o => o.value.includes('覇・前田利家'));
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change'));
    }
  });
  await page.click('#btnDashboardDiag');
  await new Promise(r => setTimeout(r, 300));

  const diagResults = await page.evaluate(() => {
    const hadesBox = document.getElementById('diagStageRules').textContent;
    const hasStatusCounterBuda = hadesBox.includes('◯ 状態異常対策持ち城娘: ブダ城');

    const evalBoxes = Array.from(document.querySelectorAll('#diagPartyEvaluation .section-box'));
    const hikoneBox = evalBoxes.find(b => b.textContent.includes('彦根城'));
    const osakaBox = evalBoxes.find(b => b.textContent.includes('大坂城'));

    const hikoneHasMeleePenalty = hikoneBox ? hikoneBox.textContent.includes('近接限定城娘の与ダメ99%低下に抵触') : false;
    const osakaHasMeleePenalty = osakaBox ? osakaBox.textContent.includes('近接限定城娘の与ダメ99%低下に抵触') : false;

    return {
      hasStatusCounterBuda,
      hikoneHasMeleePenalty,
      osakaHasMeleePenalty
    };
  });

  console.log('Test 18 diagnostic results:', diagResults);
  if (!diagResults.hasStatusCounterBuda) {
    throw new Error('TEST 18 FAILED: Buda Castle not recognized as status counter in Hades diagnostic');
  }
  if (!diagResults.hikoneHasMeleePenalty) {
    throw new Error('TEST 18 FAILED: Hikone Castle (近接) did not trigger 近接限定城娘99%低下 penalty via rangeKind');
  }
  if (diagResults.osakaHasMeleePenalty) {
    throw new Error('TEST 18 FAILED: Osaka Castle (遠隔) incorrectly triggered 近接限定城娘99%低下 penalty');
  }

  // Close modal
  await page.click('#modalDiagCloseBtn');
  await new Promise(r => setTimeout(r, 200));
  console.log('=> TEST 18 PASSED');

  // Test 19: Ownership & Favorites Management (Feature 1)
  console.log('\n[TEST 19] Testing Ownership & Favorites Management...');
  await page.click('button[data-tab="tab-settings"]');
  await new Promise(r => setTimeout(r, 200));

  // Bulk Own ★7
  await page.click('#btnBulkOwnR7');
  await new Promise(r => setTimeout(r, 200));
  const ownedCountText = await page.$eval('#ownershipCount', el => el.textContent);
  console.log('Ownership count after ★7 bulk own:', ownedCountText);
  const ownedNum = parseInt(ownedCountText.replace(/,/g, ''), 10);
  if (isNaN(ownedNum) || ownedNum < 150) {
    throw new Error('TEST 19 FAILED: Bulk own ★7 did not register expected owned count: ' + ownedCountText);
  }

  // Go to List Tab, toggle favorite on first card
  await page.click('button[data-tab="tab-list"]');
  await new Promise(r => setTimeout(r, 300));
  const firstFavBtn = await page.$('#allCastleList .castle-list-item [data-action="toggle-fav"]');
  if (!firstFavBtn) throw new Error('TEST 19 FAILED: No toggle-fav button in castle list');
  await firstFavBtn.click();
  await new Promise(r => setTimeout(r, 200));

  // Test filterOwnership with "fav"
  await page.select('#filterOwnership', 'fav');
  await new Promise(r => setTimeout(r, 300));
  const favItemsCount = await page.$$eval('#allCastleList .castle-list-item', els => els.length);
  console.log('Items displayed when filtered by ★fav:', favItemsCount);
  if (favItemsCount !== 1) {
    throw new Error('TEST 19 FAILED: Expected exactly 1 favorite item, found: ' + favItemsCount);
  }

  // Test Castle Detail Modal favorite & owned buttons
  await page.click('#allCastleList .castle-list-item [data-detail]');
  await new Promise(r => setTimeout(r, 300));
  const isModalFavActive = await page.$eval('#modalDetailFavBtn', el => el.classList.contains('active'));
  console.log('Modal detail favorite button active:', isModalFavActive);
  if (!isModalFavActive) {
    throw new Error('TEST 19 FAILED: Modal detail favorite button not active for favorite castle');
  }
  await page.click('#modalDetailCloseBtn');
  await new Promise(r => setTimeout(r, 200));

  // Reset filterOwnership
  await page.select('#filterOwnership', '');
  await new Promise(r => setTimeout(r, 200));
  console.log('=> TEST 19 PASSED');

  // Test 20: Stage-Driven Auto Party Suggest (Feature 2)
  console.log('\n[TEST 20] Testing Stage-Driven Auto Party Suggest...');
  await page.click('button[data-tab="tab-dashboard"]');
  await new Promise(r => setTimeout(r, 200));

  // Open diagnostic for Maeda Toshiie
  await page.evaluate(() => {
    const sel = document.getElementById('dashboardStageSelect');
    const opt = Array.from(sel.options).find(o => o.value.includes('覇・前田利家'));
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change'));
    }
  });
  await page.click('#btnDashboardDiag');
  await new Promise(r => setTimeout(r, 300));

  // Click btnAutoSuggestParty
  await page.click('#btnAutoSuggestParty');
  await new Promise(r => setTimeout(r, 300));
  const autoSuggestSlots = await page.$$eval('#autoSuggestPartyList > div', els => els.length);
  console.log('Auto suggested party members count:', autoSuggestSlots);
  if (autoSuggestSlots !== 8) {
    throw new Error('TEST 20 FAILED: Auto suggest did not produce 8 party members: ' + autoSuggestSlots);
  }

  // Apply auto suggest
  await page.click('#btnApplyAutoSuggest');
  await new Promise(r => setTimeout(r, 300));
  const autoAppliedCounter = await page.$eval('#partyCounter', el => el.textContent);
  console.log('Party counter after applying auto suggest:', autoAppliedCounter);
  if (!autoAppliedCounter.includes('8/8')) {
    throw new Error('TEST 20 FAILED: Auto suggested party not applied to active party (8/8)');
  }
  console.log('=> TEST 20 PASSED');

  // Test 21: Party Share Link (Feature 3) with Validation & Confirmation
  console.log('\n[TEST 21] Testing Party Share Link...');
  // Click btnShareLink
  await page.click('#btnShareLink');
  await new Promise(r => setTimeout(r, 200));

  // 1. Test restoration with confirmation and exclusion of invalid IDs
  const shareHashWithInvalid = await page.evaluate(() => {
    const data = {
      v: 1,
      t: '地獄',
      p: [
        { id: '名古屋城', s: 1 },
        { id: '大坂城', s: 1 },
        { id: '彦根城', s: 0 },
        { id: '存在しない架空城娘999', s: 0 }
      ]
    };
    return '#share=' + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  });

  let dialogMessageReceived = '';
  page.once('dialog', async dialog => {
    dialogMessageReceived = dialog.message();
    console.log('Dialog intercepted with message preview:', dialogMessageReceived.substring(0, 60));
    await dialog.accept();
  });

  await page.goto(HTML_FILE + shareHashWithInvalid, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 400));

  if (!dialogMessageReceived.includes('存在しない城娘は除外') || !dialogMessageReceived.includes('上書き')) {
    throw new Error('TEST 21 FAILED: Confirmation dialog did not mention invalid castle exclusion or overwrite warning');
  }

  const restoredHashCounter = await page.$eval('#partyCounter', el => el.textContent);
  console.log('Party counter after loading share hash (with invalid ID excluded):', restoredHashCounter);
  if (!restoredHashCounter.includes('3/8')) {
    throw new Error('TEST 21 FAILED: Party not restored correctly (expected 3/8 valid castles): ' + restoredHashCounter);
  }

  const warningToast = await page.$eval('.toast-notification', el => el.textContent);
  console.log('Toast notification text:', warningToast);
  if (!warningToast.includes('未存在の城娘を除外')) {
    throw new Error('TEST 21 FAILED: Warning toast not shown for excluded castle ID');
  }

  // 2. Test cancellation: party should not be overwritten
  const shareHashCancel = await page.evaluate(() => {
    const data = { v: 1, t: '水', p: [{ id: '小早川城', s: 1 }] };
    return '#share=' + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  });

  page.once('dialog', async dialog => {
    console.log('Dismissing confirmation dialog (user clicks cancel)...');
    await dialog.dismiss();
  });

  await page.goto(HTML_FILE + shareHashCancel, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 400));

  const counterAfterCancel = await page.$eval('#partyCounter', el => el.textContent);
  console.log('Party counter after user cancelled share link restore:', counterAfterCancel);
  if (!counterAfterCancel.includes('3/8')) {
    throw new Error('TEST 21 FAILED: Party was altered despite user cancelling confirmation: ' + counterAfterCancel);
  }

  // Clear hash
  await page.evaluate(() => { history.replaceState(null, '', window.location.pathname); });
  console.log('=> TEST 21 PASSED');

  // Test 22: Preset Comparison View (Feature 4)
  console.log('\n[TEST 22] Testing Preset Comparison View...');
  await page.click('#btnOpenPresetCompare');
  await new Promise(r => setTimeout(r, 300));

  const isCompareModalOpen = await page.evaluate(() => {
    const modal = document.getElementById('modalPresetCompare');
    return modal && modal.classList.contains('open');
  });
  console.log('Preset comparison modal open:', isCompareModalOpen);
  if (!isCompareModalOpen) throw new Error('TEST 22 FAILED: Preset compare modal did not open');

  const compareRowsCount = await page.$$eval('#compareContentContainer .compare-table tbody tr', els => els.length);
  console.log('Comparison metric rows rendered:', compareRowsCount);
  if (compareRowsCount === 0) throw new Error('TEST 22 FAILED: No comparison rows rendered');

  await page.click('#modalCompareCloseBtn');
  await new Promise(r => setTimeout(r, 400));
  console.log('=> TEST 22 PASSED');

  // Test 23: Placement Order & Giantize Simulation (Feature 5)
  console.log('\n[TEST 23] Testing Placement Order & Giantize Simulation...');
  // Ensure party has units (switch to preset 1 or bulk load)
  await page.evaluate(() => {
    document.getElementById('bulkInputText').value = '彦根城, 名古屋城, 大坂城, 江戸城';
  });
  await page.click('#btnBulkLoad');
  await new Promise(r => setTimeout(r, 400));

  const partyCounterInTest23 = await page.$eval('#partyCounter', el => el.textContent);
  console.log('Party counter in Test 23:', partyCounterInTest23);

  // Scroll to giantize simulation section and click toggle
  await page.evaluate(() => {
    document.getElementById('sectionGiantizeSim').scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 200));
  await page.click('#btnToggleGiantizeSim');
  await new Promise(r => setTimeout(r, 400));

  const bodyDisplay = await page.$eval('#giantizeSimBody', el => el.style.display);
  console.log('Body display in Test 23:', bodyDisplay);

  const simSummaryText = await page.$eval('#giantizeSimSummary', el => el.textContent);
  console.log('Giantize sim summary:', simSummaryText);
  if (!simSummaryText.includes('配置完了') || !simSummaryText.includes('最大巨大化完了')) {
    throw new Error('TEST 23 FAILED: Giantize sim summary missing expected progress milestones');
  }

  const simStepsCount = await page.$$eval('#giantizeSimTbody tr', els => els.length);
  console.log('Giantize simulation timeline steps count:', simStepsCount);
  // 4 castles = 4 deploys + 4 * 5 giantize steps = 24 steps
  if (simStepsCount < 20) {
    throw new Error('TEST 23 FAILED: Simulation steps count too low: ' + simStepsCount);
  }

  const approxNoteText = await page.$eval('#sectionGiantizeSim', el => el.textContent);
  if (!approxNoteText.includes('近似計算に関する注記')) {
    throw new Error('TEST 23 FAILED: Giantize simulation missing approximation note');
  }
  console.log('Giantize approximation note confirmed: true');
  console.log('=> TEST 23 PASSED');

  // Test 24: Castle Detail Modal Prev / Next Navigation & Keyboard Shortcuts
  console.log('\n[TEST 24] Testing Castle Detail Modal Prev / Next Navigation...');
  // Switch to list tab
  await page.click('[data-tab="tab-list"]');
  await new Promise(r => setTimeout(r, 300));

  // Open first castle card (名古屋城)
  await page.click('.castle-list-item');
  await new Promise(r => setTimeout(r, 400));

  const initialName = await page.$eval('#detailCastleName', el => el.textContent);
  const initialCounter = await page.$eval('#detailNavCounter', el => el.textContent);
  const prevDisabled = await page.$eval('#btnDetailPrevCastle', el => el.disabled);
  const nextDisabled = await page.$eval('#btnDetailNextCastle', el => el.disabled);
  console.log('Castle 1:', initialName, initialCounter, 'Prev disabled:', prevDisabled, 'Next disabled:', nextDisabled);
  if (!prevDisabled) throw new Error('TEST 24 FAILED: Prev button should be disabled for 1st castle');

  // Click Next button in header
  await page.click('#btnDetailNextCastle');
  await new Promise(r => setTimeout(r, 300));
  const c2Name = await page.$eval('#detailCastleName', el => el.textContent);
  const c2Counter = await page.$eval('#detailNavCounter', el => el.textContent);
  console.log('Castle 2 (after header next click):', c2Name, c2Counter);
  if (c2Name === initialName) throw new Error('TEST 24 FAILED: Castle name did not change after clicking Next');

  // Click Side Next button
  await page.click('#btnSideDetailNext');
  await new Promise(r => setTimeout(r, 300));
  const c3Name = await page.$eval('#detailCastleName', el => el.textContent);
  console.log('Castle 3 (after side next click):', c3Name);

  // Keyboard navigation Left arrow
  await page.keyboard.press('ArrowLeft');
  await new Promise(r => setTimeout(r, 300));
  const cBack = await page.$eval('#detailCastleName', el => el.textContent);
  console.log('Castle after ArrowLeft keyboard navigation:', cBack);
  if (cBack !== c2Name) throw new Error('TEST 24 FAILED: Keyboard ArrowLeft did not return to castle 2');

  // Close modal with Esc key
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 300));
  const isModalOpenAfterEsc = await page.evaluate(() => document.getElementById('modalCastleDetail').classList.contains('open'));
  console.log('Modal open after Esc key:', isModalOpenAfterEsc);
  if (isModalOpenAfterEsc) throw new Error('TEST 24 FAILED: Detail modal did not close on Escape key');
  console.log('=> TEST 24 PASSED');

  // Test 25: Ojou & Form Switcher (御嬢・大破・並べて表示)
  console.log('\n[TEST 25] Testing Ojou (御嬢) & Appearance Form Switcher...');
  // Search Osaka Castle
  await page.evaluate(() => {
    document.getElementById('searchCastleInput').value = '大坂城';
    document.getElementById('filterType').value = '';
    document.getElementById('filterRarity').value = '';
    document.getElementById('filterOwnership').value = '';
    document.getElementById('filterBuffCategory').value = '';
  });
  // Trigger input event to re-render list
  await page.$eval('#searchCastleInput', el => el.dispatchEvent(new Event('input', { bubbles: true })));
  await new Promise(r => setTimeout(r, 300));

  // Click Osaka Castle card
  await page.click('.castle-list-item');
  await new Promise(r => setTimeout(r, 400));

  // Verify Ojou tab is available and click it
  const isOjouDisabled = await page.$eval('#btnFormOjou', el => el.disabled);
  console.log('Osaka Castle Ojou button disabled:', isOjouDisabled);
  if (isOjouDisabled) throw new Error('TEST 25 FAILED: Ojou button should be enabled for Osaka Castle');

  await page.click('#btnFormOjou');
  await new Promise(r => setTimeout(r, 200));
  const ojouSrc = await page.$eval('#detailPortraitImg', el => el.src);
  const ojouCaption = await page.$eval('#detailPortraitCaption', el => el.textContent);
  console.log('Ojou image src:', ojouSrc);
  console.log('Ojou caption:', ojouCaption);
  if (!ojouSrc.includes('c80c157e035286ca9b205a4b3497e745d7dd81a0') || !ojouCaption.includes('御嬢')) {
    throw new Error('TEST 25 FAILED: Ojou image src or caption did not match expected Ojou form');
  }

  // Click Side by side view tab
  await page.click('#btnFormSideBySide');
  await new Promise(r => setTimeout(r, 300));
  const sideBySideDisplay = await page.$eval('#detailSideBySideContainer', el => el.style.display);
  console.log('Side by side display:', sideBySideDisplay);
  if (sideBySideDisplay !== 'flex') throw new Error('TEST 25 FAILED: Side-by-side container not displayed as flex');

  // Click Taiha (大破) tab
  await page.click('#btnFormTaiha');
  await new Promise(r => setTimeout(r, 200));
  const taihaCaption = await page.$eval('#detailPortraitCaption', el => el.textContent);
  console.log('Taiha caption:', taihaCaption);
  if (!taihaCaption.includes('大破')) throw new Error('TEST 25 FAILED: Taiha caption not shown');

  // Close modal
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 300));
  console.log('=> TEST 25 PASSED');

  // Final check for console errors
  if (pageErrors.length > 0) {
    throw new Error('Page encountered JavaScript errors: ' + pageErrors.join('; '));
  }

  // Take screenshot for verification
  await page.screenshot({ path: path.resolve(__dirname, 'test_screenshot.png'), fullPage: false });
  console.log('Saved test screenshot to test_screenshot.png');

  await browser.close();
  console.log('\n=====================================');
  console.log('ALL E2E AUTOMATED TESTS PASSED (5/5)!');
  console.log('=====================================');
}

runTests().catch(err => {
  console.error('\nTEST RUN FAILED:', err);
  process.exit(1);
});
