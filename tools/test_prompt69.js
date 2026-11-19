/**
 * Prompt 69 Automated Test Suite
 * 第69弾: 第68弾の回帰（同一文節内複数効果の取りこぼし・文字化け6件）と残件（targetGroup参照等）の修正検証
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
    console.log(`[PASS] ${title}${detail ? ' — ' + detail : ''}`);
  } else {
    console.error(`[FAIL] ${title}${detail ? ' — ' + detail : ''}`);
  }
}

(async () => {
  console.log('=== Running Prompt 69 Automated Test Suite ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', d => d.dismiss());

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  const res = await page.evaluate(() => {
    const find = name => window.SCRE_DATA.find(c => c.name === name);
    const hasEff = (src, stat, val) => (src?.effects || []).some(e => e.stat === stat && (val === undefined || e.value === val));

    // P69-01: 徳川家康・雲霧城・［正月］江戸城
    const ieyasuOk = hasEff(find('徳川家康')?.strategy, 'dmgTakenDown', 70);
    const unmuStrats = (find('雲霧城')?.allStrategies || []).filter(s => (s.name || '').includes('攻勢の'));
    const unmuOk = unmuStrats.length >= 2 && unmuStrats.every(s => hasEff(s, 'gapShorten', 50));
    const syEdoStrat = find('［正月］江戸城')?.strategy;
    const syEdoOk = hasEff(syEdoStrat, 'dmgDealtTarget', 300) && !hasEff(syEdoStrat, 'atkPercent', 300);

    // P69-02: 消失10城の復旧・是正確認
    const restored10 = [
      { name: '徳川家康', ok: ieyasuOk, label: 'strategy:dmgTakenDown=70' },
      { name: '［月狼］月山富田城', ok: hasEff(find('［月狼］月山富田城')?.special, 'dmgTakenDown', 50), label: 'special:dmgTakenDown=50' },
      { name: '黄金郷エル・ドラード', ok: hasEff(find('黄金郷エル・ドラード')?.strategy, 'dmgDealtTarget', 100), label: 'strategy:dmgDealtTarget=100' },
      { name: '虎牢関', ok: hasEff(find('虎牢関')?.strategy, 'dmgTakenDown', 80), label: 'strategy:dmgTakenDown=80' },
      { name: '城塞都市ヴァレッタ', ok: hasEff(find('城塞都市ヴァレッタ')?.strategy, 'dmgTakenDown', 70), label: 'strategy:dmgTakenDown=70' },
      { name: '［魔犬の冥衣］タルタロス', ok: hasEff(find('［魔犬の冥衣］タルタロス')?.strategy, 'gapShorten', 50), label: 'strategy:gapShorten=50' },
      { name: '長門指月城', ok: hasEff(find('長門指月城')?.skill, 'dmgTakenDown', 20), label: 'skill:dmgTakenDown=20' },
      { name: '［正月］江戸城', ok: syEdoOk, label: 'strategy:dmgDealtTarget=300(非atkPercent)' },
      { name: '［肝試し］姫路城', ok: hasEff(find('［肝試し］姫路城')?.strategy, 'dmgDealtTarget', 500) && !hasEff(find('［肝試し］姫路城')?.strategy, 'atkPercent', 500), label: 'strategy:dmgDealtTarget=500(非atkPercent)' },
      { name: 'アニ・レオンハート', ok: hasEff(find('アニ・レオンハート')?.special, 'dmgDealtTarget', 200) && !hasEff(find('アニ・レオンハート')?.special, 'atkPercent', 200), label: 'special:dmgDealtTarget=200(非atkPercent)' }
    ];
    const all10Ok = restored10.every(x => x.ok);

    // P69-03: 条件文字列の文字化け(25文字超) 0件
    const longConds = [];
    for (const c of window.SCRE_DATA) {
      for (const k of ['skill', 'strategy', 'special']) {
        for (const e of (c[k]?.effects || [])) {
          if (e.condition && e.condition.length > 25) {
            longConds.push(`${c.name}:${k}:${e.condition}`);
          }
        }
      }
    }

    // P69-04: targetGroup の app.js での参照と注記
    const buffDaza = window.calculateBuffs([{ id: '［霊衛］大宰府', giantStep: 5, strategyOn: false, specialOn: false }]);
    const dazaTargetSrc = buffDaza.perCastle['［霊衛］大宰府']?.buffs?.dmgDealtTarget?.sources?.find(s => s.targetGroup === '太宰府と古代山城');
    const targetGroupHandled = Boolean(dazaTargetSrc && dazaTargetSrc.groupNote && dazaTargetSrc.groupNote.includes('本人のみ適用'));

    // P69-05: 総effects件数 >= 5550
    let totalEffects = 0;
    for (const c of window.SCRE_DATA) {
      for (const k of ['skill', 'strategy', 'special']) {
        totalEffects += (c[k]?.effects || []).length;
      }
      for (const k of ['allSkills', 'allStrategies', 'allSpecials']) {
        for (const item of (c[k] || [])) {
          totalEffects += (item.effects || []).length;
        }
      }
    }

    return {
      ieyasuOk,
      unmuOk,
      syEdoOk,
      restored10,
      all10Ok,
      longCondsCount: longConds.length,
      longConds,
      targetGroupHandled,
      totalEffects
    };
  });

  assert(
    'P69-01: 徳川家康(dmgTakenDown 70)・雲霧城(gapShorten 50)・［正月］江戸城(dmgDealtTarget 300、非atkPercent)が全て正しく抽出されていること',
    res.ieyasuOk && res.unmuOk && res.syEdoOk,
    `徳川家康=${res.ieyasuOk}, 雲霧城=${res.unmuOk}, ［正月］江戸城=${res.syEdoOk}`
  );

  assert(
    'P69-02: 第68弾で消失/誤分類していた10城すべての効果が復旧・是正されていること',
    res.all10Ok,
    res.restored10.map(x => `${x.name}(${x.label}:${x.ok})`).join(', ')
  );

  assert(
    'P69-03: 条件文字列の文字化け（25文字超の文連結）が 0件であること',
    res.longCondsCount === 0,
    `長条件件数=${res.longCondsCount}件`
  );

  const appJsSrc = fs.readFileSync(path.resolve(__dirname, '../app/app.js'), 'utf8');
  assert(
    'P69-04: app/app.js で targetGroup が参照され、大宰府のグループ限定効果に本人のみ適用制限の注記が付与されること',
    appJsSrc.includes('targetGroup') && res.targetGroupHandled,
    `app.js参照=${appJsSrc.includes('targetGroup')}, 注記付与=${res.targetGroupHandled}`
  );

  assert(
    'P69-05: 総 effects 件数が 5,550件を下回らないこと',
    res.totalEffects >= 5550,
    `総effects=${res.totalEffects}件`
  );

  await browser.close();

  console.log(`\n=== Prompt 69 Test Summary: ${passed} / ${total} PASSED ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
})();
