/**
 * Prompt 71 Automated Test Suite
 * 第71弾: 条件ラベル先頭の「回復」誤切断回帰と末尾不要助詞の是正検証
 */

const fs = require('fs');
const path = require('path');

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

console.log('=== Running Prompt 71 Automated Test Suite ===\n');

const dataRaw = fs.readFileSync(path.resolve(__dirname, '../app/data.js'), 'utf8');
const window = {};
eval(dataRaw);
const castles = window.SCRE_DATA;
const find = name => castles.find(c => c.name === name);

// P71-01: 全城娘・全効果で「が」等の助詞始まり＆不要な助詞終わりの条件ラベルが 0件であること
let badStarts = [];
let badEnds = [];
let fragCount = 0;
let totalEffects = 0;

for (const c of castles) {
  for (const k of ['skill', 'strategy', 'special', 'allSkills', 'allStrategies', 'allSpecials']) {
    const items = Array.isArray(c[k]) ? c[k] : (c[k] ? [c[k]] : []);
    for (const src of items) {
      for (const e of (src.effects || [])) {
        totalEffects++;
        const cond = e.condition;
        if (!cond) continue;
        if (/^[がのをにとはで]/.test(cond)) badStarts.push(`${c.name}:${k}:${cond}`);
        if (/(?:[のをが]|(?<!ご)と)$/.test(cond)) badEnds.push(`${c.name}:${k}:${cond}`);
        if (/^(\d+|以下の敵|以上の敵|最大の敵|敵|に対して|の敵|状態|未満)$/.test(cond) || /^\d+%?(以上|以下|未満)/.test(cond)) {
          fragCount++;
        }
      }
    }
  }
}

assert(
  'P71-01: 全城娘・全効果で条件ラベルが助詞（「が」等）で始まるものが 0件、かつ末尾に不要な助詞（「の」「を」「が」「と」※「ごと」除く）が残るものが 0件であること',
  badStarts.length === 0 && badEnds.length === 0,
  `助詞始まり=${badStarts.length}件, 末尾助詞残り=${badEnds.length}件`
);

// P71-02: ［忠刃］佐和山城の特殊能力条件（special と allSpecials の2か所とも「回復が1500以上」）
const sawa = find('［忠刃］佐和山城');
const sawaSpecCond = sawa?.special?.effects?.find(e => e.stat === 'dmgDealtTarget')?.condition || '';
const sawaAllSpecCond = sawa?.allSpecials?.[0]?.effects?.find(e => e.stat === 'dmgDealtTarget')?.condition || '';
assert(
  'P71-02: ［忠刃］佐和山城の特殊能力（special・allSpecials の2か所とも）の条件が「回復が1500以上」に戻っていること',
  sawaSpecCond === '回復が1500以上' && sawaAllSpecCond === '回復が1500以上',
  `special="${sawaSpecCond}", allSpecials[0]="${sawaAllSpecCond}"`
);

// P71-03: ［球陽］首里城の計略条件（末尾「の」なし、文中「と」保持・末尾「と」除去）
const shuri = find('［球陽］首里城');
const shuriMainCond = shuri?.strategy?.effects?.find(e => e.stat === 'dmgDealtTarget')?.condition || '';
const shuriFukuConds = (shuri?.allStrategies || []).flatMap(s => (s.effects || []).map(e => e.condition).filter(Boolean));
const shuriHasTargetFuku = shuriFukuConds.includes('対象と自身の伏兵の攻撃');
assert(
  'P71-03: ［球陽］首里城の計略条件が「耐久が80%以上の射程内味方」（末尾「の」なし）かつ「対象と自身の伏兵の攻撃」（文中「と」保持）であること',
  shuriMainCond === '耐久が80%以上の射程内味方' && shuriHasTargetFuku,
  `strategy="${shuriMainCond}", 伏兵側="${shuriHasTargetFuku}"`
);

// P71-04: 第70弾解消分の維持（青葉城・小牧山城・ミカ・虎牢関・柳川城等）と断片化 0件
const aobaOk = find('［お月見］青葉城')?.strategy?.effects?.some(e => e.condition === '攻撃が3000以上');
const korokanCond = find('虎牢関')?.skill?.effects?.find(e => e.condition)?.condition || '';
const yanagawaCond = find('柳川城')?.skill?.effects?.find(e => e.condition)?.condition || '';
assert(
  'P71-04: 第70弾で解消した条件断片（［お月見］青葉城・虎牢関・柳川城等）が維持され、全効果の断片化が 0件であること',
  fragCount === 0 && aobaOk && korokanCond === '自身の現在耐久が10000以上' && yanagawaCond === '現在耐久が10000以上の射程内城娘',
  `断片化=${fragCount}件, 青葉="${aobaOk}", 虎牢関="${korokanCond}", 柳川城="${yanagawaCond}"`
);

// P71-05: 総effects >= 6,575件 ＆ 第69弾復旧効果（徳川家康・雲霧城）の維持
const ieyasuOk = (find('徳川家康')?.strategy?.effects || []).some(e => e.stat === 'dmgTakenDown' && e.value === 70);
const unmuOk = (find('雲霧城')?.allStrategies || []).filter(s => (s.name || '').includes('攻勢の')).every(s => (s.effects || []).some(e => e.stat === 'gapShorten' && e.value === 50));
assert(
  'P71-05: 総 effects が 6,575件を下回らず、第69弾の復旧効果（徳川家康 dmgTakenDown 70・雲霧城 gapShorten 50）が維持されていること',
  totalEffects >= 6575 && ieyasuOk && unmuOk,
  `総effects=${totalEffects}件, 徳川家康=${ieyasuOk}, 雲霧城=${unmuOk}`
);

console.log(`\n=== Prompt 71 Test Summary: ${passed} / ${total} PASSED ===\n`);
if (passed !== total) {
  process.exit(1);
}
