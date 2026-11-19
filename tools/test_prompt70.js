/**
 * Prompt 70 Automated Test Suite
 * 第70弾: 条件ラベルの断片化修正の検証
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

console.log('=== Running Prompt 70 Automated Test Suite ===\n');

const dataRaw = fs.readFileSync(path.resolve(__dirname, '../app/data.js'), 'utf8');
const window = {};
eval(dataRaw);
const castles = window.SCRE_DATA;
const find = name => castles.find(c => c.name === name);

// P70-01: 実例6体の条件ラベルが断片化せず完全な条件句になっていること
const aobaCond = find('［お月見］青葉城')?.strategy?.effects?.find(e => e.condition)?.condition || '';
const komakiCond = find('［お月見］小牧山城')?.skill?.effects?.find(e => e.stat === 'dmgDealtTarget')?.condition || '';
const mikaCond = find('ミカ')?.strategy?.effects?.find(e => e.condition)?.condition || '';
const ryuoCond = find('［肝試し］龍王山城')?.strategy?.effects?.find(e => e.condition)?.condition || '';
const koroaCond = find('コーロア城')?.strategy?.effects?.find(e => e.condition)?.condition || '';
const babaCond = find('［花嫁衣装］馬場城')?.skill?.effects?.find(e => e.condition)?.condition || '';

const p70_01_ok =
  aobaCond === '攻撃が3000以上' &&
  komakiCond === '射程内城娘が耐久25%以下の敵' &&
  mikaCond === '計略対象の耐久が50%以上' &&
  ryuoCond === '耐久が最大の敵' &&
  koroaCond === '移動速度300以下の敵' &&
  babaCond === '耐久が90%以上';

assert(
  'P70-01: 実例6体（青葉城・小牧山城・ミカ・龍王山城・コーロア城・馬場城）の条件ラベルが断片化せず完全な条件句として抽出されていること',
  p70_01_ok,
  `青葉="${aobaCond}", 小牧="${komakiCond}", ミカ="${mikaCond}", 龍王="${ryuoCond}", コーロア="${koroaCond}", 馬場="${babaCond}"`
);

// P70-02: 全城娘・全効果を走査し、断片化条件ラベル・長条件(>25文字)・U+FFFD文字化けが0件であること
let fragCount = 0;
let longCount = 0;
let fffdCount = 0;
let totalEffects = 0;

for (const c of castles) {
  for (const k of ['skill', 'strategy', 'special', 'allSkills', 'allStrategies', 'allSpecials']) {
    const items = Array.isArray(c[k]) ? c[k] : (c[k] ? [c[k]] : []);
    for (const src of items) {
      for (const e of (src.effects || [])) {
        totalEffects++;
        const cond = e.condition;
        if (!cond) continue;
        if (cond.includes('\uFFFD')) fffdCount++;
        if (cond.length > 25) longCount++;
        if (/^(\d+|以下の敵|以上の敵|最大の敵|敵|に対して|の敵|状態|未満)$/.test(cond) || /^\d+%?(以上|以下|未満)/.test(cond)) {
          fragCount++;
        }
      }
    }
  }
}

assert(
  'P70-02: 全城娘・全効果で断片化条件ラベル・長条件(>25文字)・U+FFFD文字化けがいずれも 0件であること',
  fragCount === 0 && longCount === 0 && fffdCount === 0,
  `断片化=${fragCount}件, 長条件=${longCount}件, 文字化け=${fffdCount}件`
);

// P70-03: 総effects >= 6,575件
assert(
  'P70-03: 総 effects 件数が 6,575件を下回っていないこと',
  totalEffects >= 6575,
  `総effects=${totalEffects}件`
);

// P70-04: 第69弾で復旧した主要効果が引き続き存在すること
const ieyasuOk = (find('徳川家康')?.strategy?.effects || []).some(e => e.stat === 'dmgTakenDown' && e.value === 70);
const unmuOk = (find('雲霧城')?.allStrategies || []).filter(s => (s.name || '').includes('攻勢の')).every(s => (s.effects || []).some(e => e.stat === 'gapShorten' && e.value === 50));
const syEdoOk = (find('［正月］江戸城')?.strategy?.effects || []).some(e => e.stat === 'dmgDealtTarget' && e.value === 300);

assert(
  'P70-04: 第69弾で復旧・是正した効果（徳川家康 dmgTakenDown 70、雲霧城 gapShorten 50、［正月］江戸城 dmgDealtTarget 300）が維持されていること',
  ieyasuOk && unmuOk && syEdoOk,
  `徳川家康=${ieyasuOk}, 雲霧城=${unmuOk}, ［正月］江戸城=${syEdoOk}`
);

console.log(`\n=== Prompt 70 Test Summary: ${passed} / ${total} PASSED ===\n`);
if (passed !== total) {
  process.exit(1);
}
