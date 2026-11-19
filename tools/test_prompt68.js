/**
 * Prompt 68 Automated Test Suite
 * 第68弾: 効果パース・条件付き与ダメ計算・グループ限定・敵デバフtarget修正の検証
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
  console.log('=== Running Prompt 68 Automated Test Suite ===\n');

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

    // P68-01: 延岡城の計略 effects (無印・改壱)
    const nobeoka = find('［崩舞］延岡城');
    const nobeStrats = nobeoka?.allStrategies || [];
    const nobeBaseStrat = nobeStrats.find(s => s.stage === '無印');
    const nobeKai1Strat = nobeStrats.find(s => s.stage === '改壱');
    const nobeBaseOk = (nobeBaseStrat?.effects || []).length >= 2 &&
      nobeBaseStrat.effects.some(e => e.stat === 'atkPercent' && e.value === 100 && !e.condition) &&
      nobeBaseStrat.effects.some(e => e.stat === 'atkPercent' && e.value === 100 && e.condition === '飛行敵に対して');
    const nobeKai1Ok = (nobeKai1Strat?.effects || []).length >= 2 &&
      nobeKai1Strat.effects.some(e => e.stat === 'atkPercent' && e.value === 120) &&
      nobeKai1Strat.effects.some(e => e.stat === 'atkPercent' && e.value === 100 && e.condition === '飛行敵に対して');

    // P68-02: 佐和山城の特技・特殊能力・計略 effects
    const sawayama = find('［忠刃］佐和山城');
    const sawaSkillEff = sawayama?.skill?.effects || [];
    const sawaSpecEff = sawayama?.special?.effects || [];
    const sawaStratEff = sawayama?.strategy?.effects || [];
    const sawaNoStop = ![...sawaSkillEff, ...sawaSpecEff, ...sawaStratEff].some(e => String(e.stat).toLowerCase().includes('stop'));
    const sawaHasDef90 = sawaStratEff.some(e => e.stat === 'enemyDefDown' && e.value === 90);
    const sawaHasSlow50 = sawaSpecEff.some(e => e.stat === 'enemySlow' && e.value === 50);

    // P68-03: 条件付き与ダメが無条件バフとして集計されていないこと
    const buffNobe = window.calculateBuffs([{ id: '［崩舞］延岡城', giantStep: 5, strategyOn: true, specialOn: true }]);
    const nobeSelf = buffNobe.perCastle['［崩舞］延岡城']?.buffs;
    const nobeCondSrc = nobeSelf?.dmgDealtTarget?.sources?.find(s => s.condition && s.condition.includes('移動速度100以下'));
    const nobeCondNotApplied = Boolean(nobeCondSrc) && nobeCondSrc.applied === false && nobeSelf.dmgDealtTarget.multProduct === 1.0;

    const buffKago = window.calculateBuffs([{ id: '［雲耀］鹿児島城', giantStep: 5, strategyOn: true, specialOn: true }]);
    const kagoSelf = buffKago.perCastle['［雲耀］鹿児島城']?.buffs;
    const kagoCondSrc = kagoSelf?.dmgDealtTarget?.sources?.find(s => s.condition && s.condition.includes('攻撃が5000以上'));
    const kagoCondNotApplied = Boolean(kagoCondSrc) && kagoCondSrc.applied === false && kagoSelf.dmgDealtTarget.multProduct === 1.0;

    // P68-04: 大宰府の特技3種とグループ限定 target
    const dazaifu = find('［霊衛］大宰府');
    const dazaSkillEff = dazaifu?.skill?.effects || [];
    const hasHp30 = dazaSkillEff.some(e => e.stat === 'hpPercent' && e.value === 30);
    const hasAtk30 = dazaSkillEff.some(e => e.stat === 'atkPercent' && e.value === 30);
    const hasSpd30 = dazaSkillEff.some(e => e.stat === 'atkSpeed' && e.value === 30);
    const dazaGroupEff = dazaSkillEff.find(e => e.stat === 'dmgDealtTarget' && e.value === 60);
    const dazaGroupLimited = dazaGroupEff && dazaGroupEff.target === 'self' && dazaGroupEff.targetGroup === '太宰府と古代山城';

    const buffPartyDaza = window.calculateBuffs([
      { id: '［霊衛］大宰府', giantStep: 5, strategyOn: false, specialOn: false },
      { id: '彦根城', giantStep: 5, strategyOn: false, specialOn: false }
    ]);
    const hikoneDmgTarget = buffPartyDaza.perCastle['彦根城']?.buffs?.dmgDealtTarget?.multProduct;

    // P68-05: 安平城の enemyDefDown と全城娘 enemy* target=self 0件
    const anping = find('安平城');
    const anpingDefEff = (anping?.skill?.effects || []).find(e => e.stat === 'enemyDefDown');
    let enemySelfCount = 0;
    for (const c of window.SCRE_DATA) {
      for (const src of [c.skill, c.strategy, c.special, ...(c.allSkills || []), ...(c.allStrategies || []), ...(c.allSpecials || [])]) {
        if (!src || !src.effects) continue;
        for (const e of src.effects) {
          if (e.stat.startsWith('enemy') && e.target === 'self') enemySelfCount++;
        }
      }
    }

    return {
      nobeBaseCount: (nobeBaseStrat?.effects || []).length,
      nobeKai1Count: (nobeKai1Strat?.effects || []).length,
      nobeBaseOk,
      nobeKai1Ok,
      sawaSkillCount: sawaSkillEff.length,
      sawaSpecCount: sawaSpecEff.length,
      sawaStratCount: sawaStratEff.length,
      sawaNoStop,
      sawaHasDef90,
      sawaHasSlow50,
      nobeCondNotApplied,
      kagoCondNotApplied,
      hasHp30,
      hasAtk30,
      hasSpd30,
      dazaGroupLimited,
      hikoneDmgTarget,
      anpingTarget: anpingDefEff?.target,
      enemySelfCount
    };
  });

  assert(
    'P68-01: ［崩舞］延岡城の計略 effects が無印・改壱とも2件（攻撃倍率＋飛行敵条件付き攻撃倍率）抽出されること',
    res.nobeBaseOk && res.nobeKai1Ok,
    `無印=${res.nobeBaseCount}件 (${res.nobeBaseOk}), 改壱=${res.nobeKai1Count}件 (${res.nobeKai1Ok})`
  );

  assert(
    'P68-02: ［忠刃］佐和山城の特技・特殊能力・計略に effects が抽出され、足止め誤effectsが無いこと',
    res.sawaSkillCount >= 2 && res.sawaSpecCount >= 3 && res.sawaStratCount >= 3 && res.sawaNoStop && res.sawaHasDef90 && res.sawaHasSlow50,
    `特技=${res.sawaSkillCount}件, 特殊能力=${res.sawaSpecCount}件, 計略=${res.sawaStratCount}件, 防御90%減=${res.sawaHasDef90}, 移速50%減=${res.sawaHasSlow50}, 足止め誤付与なし=${res.sawaNoStop}`
  );

  assert(
    'P68-03: 条件付き与ダメ（延岡城の移動速度100以下、鹿児島城の攻撃5000以上）が条件として記録され、無条件バフ(multProduct)へ誤適用されていないこと',
    res.nobeCondNotApplied && res.kagoCondNotApplied,
    `延岡条件非適用=${res.nobeCondNotApplied}, 鹿児島条件非適用=${res.kagoCondNotApplied}`
  );

  assert(
    'P68-04: ［霊衛］大宰府の特技3種（耐久・攻撃・攻撃速度30%）が抽出され、グループ限定効果(太宰府と古代山城)が target=self に限定され彦根城へ誤適用されないこと',
    res.hasHp30 && res.hasAtk30 && res.hasSpd30 && res.dazaGroupLimited && res.hikoneDmgTarget === 1.0,
    `耐久30=${res.hasHp30}, 攻撃30=${res.hasAtk30}, 攻速30=${res.hasSpd30}, target限定=${res.dazaGroupLimited}, 彦根城dmgDealtTarget=${res.hikoneDmgTarget}`
  );

  assert(
    'P68-05: 安平城の enemyDefDown が target=inRange となり、全城娘の enemy* デバフで target=self が 0件であること',
    res.anpingTarget === 'inRange' && res.enemySelfCount === 0,
    `安平城target=${res.anpingTarget}, 全城娘enemy* target=self残存=${res.enemySelfCount}件`
  );

  await browser.close();

  console.log(`\n=== Prompt 68 Test Summary: ${passed} / ${total} PASSED ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
})();
