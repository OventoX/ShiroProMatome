/**
 * Prompt 72 Automated Test Suite
 * 第72弾: ［肝試し］白河小峰城の無意味な「対象」条件ラベル除去の検証
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

console.log('=== Running Prompt 72 Automated Test Suite ===\n');

const dataRaw = fs.readFileSync(path.resolve(__dirname, '../app/data.js'), 'utf8');
const window = {};
eval(dataRaw);
const castles = window.SCRE_DATA;
const find = name => castles.find(c => c.name === name);

// P72-01: ［肝試し］白河小峰城の計略3か所が無条件（conditionなし）であること
const shirakawa = find('［肝試し］白河小峰城');
const shiraMainNoCond = (shirakawa?.strategy?.effects || []).length >= 2 &&
  (shirakawa?.strategy?.effects || []).every(e => !e.condition);
const shiraAllNoCond = (shirakawa?.allStrategies || []).length === 2 &&
  (shirakawa?.allStrategies || []).every(s => (s.effects || []).length >= 2 && s.effects.every(e => !e.condition));

assert(
  'P72-01: ［肝試し］白河小峰城の計略3か所（strategy・allStrategies×2）が無条件（conditionなし）に戻っていること',
  shiraMainNoCond && shiraAllNoCond,
  `strategy無条件=${shiraMainNoCond}, allStrategies(2件)無条件=${shiraAllNoCond}`
);

// P72-02: 「対象」単体 0件、助詞始まり 0件、断片化 0件、かつ「計略対象の耐久が50%以上」等は維持
let onlyTargetCount = 0;
let badStartCount = 0;
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
        if (cond === '対象') onlyTargetCount++;
        if (/^[がのをにとはで]/.test(cond)) badStartCount++;
        if (/^(\d+|以下の敵|以上の敵|最大の敵|敵|に対して|の敵|状態|未満)$/.test(cond) || /^\d+%?(以上|以下|未満)/.test(cond)) {
          fragCount++;
        }
      }
    }
  }
}

const mikaHasMeaningfulTargetCond = (find('ミカ')?.strategy?.effects || []).some(e => e.condition === '計略対象の耐久が50%以上');

assert(
  'P72-02: 全城娘・全効果で「対象」単体 0件・助詞始まり 0件・断片化 0件であり、ミカの「計略対象の耐久が50%以上」等の意味ある条件は維持されていること',
  onlyTargetCount === 0 && badStartCount === 0 && fragCount === 0 && mikaHasMeaningfulTargetCond,
  `対象単体=${onlyTargetCount}件, 助詞始まり=${badStartCount}件, 断片化=${fragCount}件, ミカ条件維持=${mikaHasMeaningfulTargetCond}`
);

// P72-03: 第71弾復旧分の維持（佐和山城「回復が1500以上」2か所、首里城「耐久が80%以上の射程内味方」）
const sawa = find('［忠刃］佐和山城');
const sawaOk = sawa?.special?.effects?.some(e => e.condition === '回復が1500以上') &&
  sawa?.allSpecials?.[0]?.effects?.some(e => e.condition === '回復が1500以上');
const shuriOk = find('［球陽］首里城')?.strategy?.effects?.some(e => e.condition === '耐久が80%以上の射程内味方');

assert(
  'P72-03: 第71弾で是正した［忠刃］佐和山城「回復が1500以上」（2か所）および［球陽］首里城「耐久が80%以上の射程内味方」が維持されていること',
  Boolean(sawaOk && shuriOk),
  `佐和山城=${Boolean(sawaOk)}, 首里城=${Boolean(shuriOk)}`
);

// P72-04: 総effects >= 6,575件、第69弾・第70弾の維持
const aobaOk = find('［お月見］青葉城')?.strategy?.effects?.some(e => e.condition === '攻撃が3000以上');
const ieyasuOk = (find('徳川家康')?.strategy?.effects || []).some(e => e.stat === 'dmgTakenDown' && e.value === 70);
const unmuOk = (find('雲霧城')?.allStrategies || []).filter(s => (s.name || '').includes('攻勢の')).every(s => (s.effects || []).some(e => e.stat === 'gapShorten' && e.value === 50));

assert(
  'P72-04: 総 effects が 6,575件を下回らず、第69弾・第70弾の復旧・解消分（徳川家康・雲霧城・青葉城等）が維持されていること',
  totalEffects >= 6575 && Boolean(aobaOk && ieyasuOk && unmuOk),
  `総effects=${totalEffects}件, 徳川家康=${ieyasuOk}, 雲霧城=${unmuOk}, 青葉城=${Boolean(aobaOk)}`
);

console.log(`\n=== Prompt 72 Test Summary: ${passed} / ${total} PASSED ===\n`);
if (passed !== total) {
  process.exit(1);
}
