/**
 * Prompt 64 Automated Test Suite
 * 対抗策ファインダーの誤検出修正と審議仕様の出典確認
 * - P64-01: ［漆磊］広島城が高防御・物理軽減の対策一覧に出ないこと
 * - P64-02: 術ダメージ語句のみが根拠だった63体のうち、実際に攻撃側である城娘だけが残ること（件数と一覧を報告）
 * - P64-03: 武器種 法術・杖・祓串・鈴 の城娘は引き続き抽出されること
 * - P64-04: 能力低下無効審議の対策一覧に、一次情報で裏付けられた手段のみが残ること（件数を報告）
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
  console.log('=== Running Prompt 64 Automated Test Suite ===\n');

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
  // P64-01: ［漆磊］広島城が高防御・物理軽減の対策一覧に出ないこと
  // -------------------------------------------------------------------------
  const p64_01 = await page.evaluate(() => {
    const highDef = window.findCounterCastles(new Set(['高防御']));
    const physResist = window.findCounterCastles(new Set(['物理軽減']));
    const hiroshimaInHighDef = highDef.some(x => x.castle.name === '［漆磊］広島城');
    const hiroshimaInPhysResist = physResist.some(x => x.castle.name === '［漆磊］広島城');
    const yodoInHighDef = highDef.some(x => x.castle.name === '淀城');
    const yodoInPhysResist = physResist.some(x => x.castle.name === '淀城');

    const hiroshimaCastle = window.SCRE_DATA.find(c => c.name === '［漆磊］広島城');
    const hiroshimaTags = hiroshimaCastle ? window.extractCastleEffectTags(hiroshimaCastle) : [];

    return {
      highDefCount: highDef.length,
      physResistCount: physResist.length,
      hiroshimaInHighDef,
      hiroshimaInPhysResist,
      yodoInHighDef,
      yodoInPhysResist,
      hiroshimaHasDefIgnoreTag: hiroshimaTags.includes('防御無視')
    };
  });

  assert(
    'P64-01: ［漆磊］広島城（および被ダメ軽減のみの淀城）が高防御・物理軽減の対策一覧に出ないこと',
    !p64_01.hiroshimaInHighDef && !p64_01.hiroshimaInPhysResist && !p64_01.yodoInHighDef && !p64_01.yodoInPhysResist && !p64_01.hiroshimaHasDefIgnoreTag,
    `高防御=${p64_01.highDefCount}体 (広島城=${p64_01.hiroshimaInHighDef}, 淀城=${p64_01.yodoInHighDef}), 物理軽減=${p64_01.physResistCount}体 (広島城=${p64_01.hiroshimaInPhysResist}, 淀城=${p64_01.yodoInPhysResist})`
  );

  // -------------------------------------------------------------------------
  // P64-02: 術ダメージ語句のみが根拠だった63体のうち、実際に攻撃側である城娘だけが残ること
  // -------------------------------------------------------------------------
  const p64_02 = await page.evaluate(() => {
    const highDefSet = new Set(window.findCounterCastles(new Set(['高防御'])).map(x => x.castle.id));
    const physResistSet = new Set(window.findCounterCastles(new Set(['物理軽減'])).map(x => x.castle.id));
    const defIgnoreRe = /(?:敵の)?防御(?:力)?を?(?:\d+%?)?(?:無視|0として計算|減算な)/;

    // 集計A: 全ソース（skill/strategy/special/all*）で「術ダメージ」を含み、全ソースに防御無視文言がない63体
    const setA63 = window.SCRE_DATA.filter(c => {
      const texts = [
        c.skill && c.skill.text, ...(c.allSkills || []).map(s => s.text),
        c.strategy && c.strategy.text, ...(c.allStrategies || []).map(s => s.text),
        c.special && c.special.text, ...(c.allSpecials || []).map(s => s.text)
      ].filter(Boolean).join('\n');
      return /術ダメージ/.test(texts) && !defIgnoreRe.test(texts);
    });
    const setARemaining = setA63.filter(c => highDefSet.has(c.id));
    const setAExcluded = setA63.filter(c => !highDefSet.has(c.id));

    // 集計B: [skill, strategy, special]で「術ダメージ」を含み、特技・計略[skill, strategy]に防御無視文言がない63体（［漆磊］広島城を含む63体）
    const setB63 = window.SCRE_DATA.filter(c => {
      const sss = [c.skill && c.skill.text, c.strategy && c.strategy.text, c.special && c.special.text].filter(Boolean).join('\n');
      const ss = [c.skill && c.skill.text, c.strategy && c.strategy.text].filter(Boolean).join('\n');
      return /術ダメージ/.test(sss) && !defIgnoreRe.test(ss);
    });
    const setBRemaining = setB63.filter(c => highDefSet.has(c.id) && physResistSet.has(c.id));
    const setBExcluded = setB63.filter(c => !highDefSet.has(c.id));

    return {
      setACount: setA63.length,
      setARemainingCount: setARemaining.length,
      setARemainingNames: setARemaining.map(c => `${c.name}(${c.weapon})`),
      setAExcludedNames: setAExcluded.map(c => `${c.name}(${c.weapon})`),
      setBCount: setB63.length,
      setBRemainingCount: setBRemaining.length,
      setBRemainingNames: setBRemaining.map(c => `${c.name}(${c.weapon})`),
      setBExcludedNames: setBExcluded.map(c => `${c.name}(${c.weapon})`)
    };
  });

  assert(
    'P64-02: 術ダメージ語句のみが根拠だった63体のうち、被ダメ軽減（防御側）を除外し実際に攻撃側である城娘だけが残ること',
    p64_02.setBCount === 63 && p64_02.setBRemainingCount === 61 &&
      p64_02.setACount === 63 && p64_02.setARemainingCount === 62,
    `［漆磊］広島城を含む63体ベース: ${p64_02.setBCount}体 → ${p64_02.setBRemainingCount}体 (除外: ${p64_02.setBExcludedNames.join('、')}) ／ 全ソース63体ベース: ${p64_02.setACount}体 → ${p64_02.setARemainingCount}体 (除外: ${p64_02.setAExcludedNames.join('、')})`
  );

  // -------------------------------------------------------------------------
  // P64-03: 武器種 法術・杖・祓串・鈴 の城娘は引き続き抽出されること
  // -------------------------------------------------------------------------
  const p64_03 = await page.evaluate(() => {
    const jutsuWeapons = ['法術', '杖', '祓串', '鈴'];
    const targetCastles = window.SCRE_DATA.filter(c => jutsuWeapons.includes(c.weapon));
    const highDefSet = new Set(window.findCounterCastles(new Set(['高防御'])).map(x => x.castle.id));
    const physResistSet = new Set(window.findCounterCastles(new Set(['物理軽減'])).map(x => x.castle.id));

    const missingInHighDef = targetCastles.filter(c => !highDefSet.has(c.id)).map(c => c.name);
    const missingInPhysResist = targetCastles.filter(c => !physResistSet.has(c.id)).map(c => c.name);

    const byWeapon = {};
    jutsuWeapons.forEach(w => {
      byWeapon[w] = targetCastles.filter(c => c.weapon === w).length;
    });

    return {
      totalJutsuWeaponCastles: targetCastles.length,
      byWeapon,
      missingInHighDef,
      missingInPhysResist
    };
  });

  assert(
    'P64-03: 武器種 法術・杖・祓串・鈴 の全城娘（167体）が引き続き高防御・物理軽減で漏れなく抽出されること',
    p64_03.totalJutsuWeaponCastles === 167 &&
      p64_03.missingInHighDef.length === 0 &&
      p64_03.missingInPhysResist.length === 0,
    `計${p64_03.totalJutsuWeaponCastles}体 (法術=${p64_03.byWeapon['法術']}, 杖=${p64_03.byWeapon['杖']}, 祓串=${p64_03.byWeapon['祓串']}, 鈴=${p64_03.byWeapon['鈴']}), 抽出漏れ=0件`
  );

  // -------------------------------------------------------------------------
  // P64-04: 能力低下無効審議の対策一覧に、一次情報で裏付けられた手段のみが残ること
  // -------------------------------------------------------------------------
  const p64_04 = await page.evaluate(() => {
    const list = window.findCounterCastles(new Set(['能力低下無効審議']));
    const tagRule = (window.SCRE_EFFECT_TAG_RULES || []).find(r => r.tag === '敵被ダメ上昇');
    const tagDescHasUnverified = tagRule ? tagRule.desc.includes('能力低下無効') : true;

    const byKind = { ownedDebuff: [], zeroDebuff: [], other: [] };
    for (const item of list) {
      const r = item.matchedReasons[0];
      if (r.reason.includes('所持特技')) {
        byKind.ownedDebuff.push(item.castle.name);
      } else if (r.detail.includes('0にするデバフ(変更効果)')) {
        byKind.zeroDebuff.push(item.castle.name);
      } else {
        byKind.other.push({ name: item.castle.name, reason: r.reason });
      }
    }

    return {
      totalCount: list.length,
      ownedDebuffCount: byKind.ownedDebuff.length,
      zeroDebuffCount: byKind.zeroDebuff.length,
      otherCount: byKind.other.length,
      ownedDebuffNames: byKind.ownedDebuff,
      zeroDebuffNames: byKind.zeroDebuff,
      tagDesc: tagRule ? tagRule.desc : '',
      tagDescHasUnverified
    };
  });

  assert(
    'P64-04: 能力低下無効審議の対策一覧に一次情報で裏付けられた手段（所持特技デバフ8体＋敵の防御・移動速度を0にする変更効果28体＝計36体）のみが残り、「敵被ダメ上昇」タグ説明から未確認の断定が削除されていること',
    p64_04.totalCount === 36 &&
      p64_04.ownedDebuffCount === 8 &&
      p64_04.zeroDebuffCount === 28 &&
      p64_04.otherCount === 0 &&
      !p64_04.tagDescHasUnverified,
    `合計=${p64_04.totalCount}体 (所持特技デバフ=${p64_04.ownedDebuffCount}体, 0にするデバフ[変更効果]=${p64_04.zeroDebuffCount}体, 未確認手段=${p64_04.otherCount}体), 敵被ダメ上昇desc="${p64_04.tagDesc}"`
  );

  await browser.close();

  console.log(`\n=== Prompt 64 Test Summary: ${passed} / ${total} PASSED ===`);
  if (passed !== total) {
    process.exit(1);
  }
})();
