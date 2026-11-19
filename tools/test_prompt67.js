/**
 * Prompt 67 Automated Test Suite
 * 第67弾: 最新異伝城娘4体（2026/11/17実装）のデータ追加＋キュレーションTier暫定評価反映
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

console.log('=== Running Prompt 67 Automated Test Suite ===\n');

const window = {};
eval(fs.readFileSync(path.resolve(__dirname, '../app/data.js'), 'utf8'));
eval(fs.readFileSync(path.resolve(__dirname, '../app/tier_data.js'), 'utf8'));

const castles = window.SCRE_DATA;
const tiers = window.SCRE_TIERS;

// P67-01: 総数1,165体・ID重複なし・図鑑No 1045〜1048の4体存在・基本属性検証
const idSet = new Set(castles.map(c => c.id));
const expected4 = [
  { name: '［霊衛］大宰府', bookNo: '1045', rarity: 7, weapon: '槌', attrs: ['平'] },
  { name: '［崩舞］延岡城', bookNo: '1046', rarity: 7, weapon: '石弓', attrs: ['平山'] },
  { name: '［忠刃］佐和山城', bookNo: '1047', rarity: 7, weapon: '刀', attrs: ['山'] },
  { name: '［雲耀］鹿児島城', bookNo: '1048', rarity: 6, weapon: '刀', attrs: ['平山', '水'] }
];

const foundMap = {};
let all4Valid = true;
for (const exp of expected4) {
  const c = castles.find(x => x.name === exp.name);
  foundMap[exp.name] = c;
  if (!c) { all4Valid = false; continue; }
  const stageOk = Array.isArray(c.remodelStages) &&
    c.remodelStages.length === 2 &&
    c.remodelStages[0] === '無印' &&
    c.remodelStages[1] === '改壱' &&
    !c.remodelStages.includes('改弐');
  const attrOk = exp.attrs.every(a => (c.attributes || []).includes(a));
  if (c.bookNo !== exp.bookNo || c.rarity !== exp.rarity || c.weapon !== exp.weapon || !stageOk || !attrOk) {
    all4Valid = false;
  }
}

assert(
  'P67-01: data.js 総数1,165体・ID重複なし・図鑑No 1045〜1048の4体が仕様通り（無印/改壱のみ・武器・レア・属性一致）で収録されていること',
  castles.length === 1165 && idSet.size === 1165 && all4Valid,
  `総数=${castles.length}, 重複なし=${idSet.size === 1165}, 4体検証=${all4Valid}`
);

// P67-02: ［霊衛］大宰府の効果検証（2種計略・defIgnoreなし・enemySlowあり）
const dazaifu = foundMap['［霊衛］大宰府'];
const dazaifuStrats = dazaifu?.allStrategies || [];
const hasKago = dazaifuStrats.some(s => (s.name || '').includes('加護'));
const hasKenno = dazaifuStrats.some(s => (s.name || '').includes('権能'));
const dazaifuAllEff = [
  ...(dazaifu?.skill?.effects || []),
  ...(dazaifu?.strategy?.effects || []),
  ...(dazaifu?.special?.effects || [])
];
const dazaifuHasDefIgnore = dazaifuAllEff.some(e => e.stat === 'defIgnore');
const dazaifuHasEnemySlow = (dazaifu?.skill?.effects || []).some(e => e.stat === 'enemySlow' && e.value === 100);
const dazaifuStratNoTargetConfusion = !(dazaifu?.strategy?.effects || []).some(e => e.stat === 'dmgDealtTarget');

assert(
  'P67-02: ［霊衛］大宰府のallStrategiesに2種（加護/権能）が登録され、defIgnore誤付与なし・特技enemySlow=100抽出・「与ダメージ」の「与えるダメージ」誤混同なし',
  dazaifuStrats.length >= 2 && hasKago && hasKenno && !dazaifuHasDefIgnore && dazaifuHasEnemySlow && dazaifuStratNoTargetConfusion,
  `allStrategies=${dazaifuStrats.length}件 (加護=${hasKago}, 権能=${hasKenno}), defIgnore=${dazaifuHasDefIgnore}, enemySlow=${dazaifuHasEnemySlow}`
);

// P67-03: ［崩舞］延岡城の効果検証（特殊能力「防御を0にする」保持・割合低下誤抽出なし・人数依存自己バフ非固定化）
const nobeoka = foundMap['［崩舞］延岡城'];
const nobeokaSpecText = nobeoka?.special?.text || '';
const nobeokaHasZeroText = nobeokaSpecText.includes('防御を0にする');
const nobeokaSpecNoPercentDebuff = !(nobeoka?.special?.effects || []).some(e => e.stat === 'enemyDefDown' || e.stat === 'enemySlow');
const nobeokaSkillNoSelfFixedAtk = !(nobeoka?.skill?.effects || []).some(e => e.stat === 'atkPercent' && e.target === 'self');
const nobeokaStratNoAccumAtk = !(nobeoka?.strategy?.effects || []).some(e => e.stat === 'atkFlat');

assert(
  'P67-03: ［崩舞］延岡城の特殊能力に「防御を0にする」が保持され、割合低下への誤抽出や人数依存/蓄積の初期固定集計がないこと',
  nobeokaHasZeroText && nobeokaSpecNoPercentDebuff && nobeokaSkillNoSelfFixedAtk && nobeokaStratNoAccumAtk,
  `防御を0にする=${nobeokaHasZeroText}, 割合低下誤抽出なし=${nobeokaSpecNoPercentDebuff}, 自己固定誤集計なし=${nobeokaSkillNoSelfFixedAtk}`
);

// P67-04: ［忠刃］佐和山城の効果検証（足止め誤effectsなし・shareAtk誤分類なし・被攻撃蓄積非固定化）
const sawayama = foundMap['［忠刃］佐和山城'];
const sawayamaAllEff = [
  ...(sawayama?.skill?.effects || []),
  ...(sawayama?.strategy?.effects || []),
  ...(sawayama?.special?.effects || [])
];
const sawayamaNoShare = !sawayamaAllEff.some(e => e.stat === 'shareAtk' || e.stat === 'shareDef');
const sawayamaNoAccumAtk = !(sawayama?.skill?.effects || []).some(e => e.stat === 'atkFlat' || e.stat === 'recoveryFlat');
const sawayamaNoStopEffect = !sawayamaAllEff.some(e => String(e.stat).toLowerCase().includes('stop'));

assert(
  'P67-04: ［忠刃］佐和山城に足止め系の誤effects・shareAtk誤分類・被攻撃蓄積の無条件バフ誤集計がないこと',
  sawayamaNoShare && sawayamaNoAccumAtk && sawayamaNoStopEffect,
  `share誤分類なし=${sawayamaNoShare}, 蓄積誤集計なし=${sawayamaNoAccumAtk}, 足止め誤effectsなし=${sawayamaNoStopEffect}`
);

// P67-05: ［雲耀］鹿児島城の効果検証（「攻撃が250低下」の正バフ誤抽出なし・enemyDefDown抽出）
const kagoshima = foundMap['［雲耀］鹿児島城'];
const kagoshimaSpecNoFlatAtk = !(kagoshima?.special?.effects || []).some(e => e.stat === 'atkFlat');
const kagoshimaSkillHasDefDown = (kagoshima?.skill?.effects || []).some(e => e.stat === 'enemyDefDown' && e.value === 40);

assert(
  'P67-05: ［雲耀］鹿児島城の特殊能力「攻撃が250低下」が正のバフ(atkFlat)として誤抽出されず、特技の防御低下40%が抽出されていること',
  kagoshimaSpecNoFlatAtk && kagoshimaSkillHasDefDown,
  `atkFlat誤抽出なし=${kagoshimaSpecNoFlatAtk}, enemyDefDown40=${kagoshimaSkillHasDefDown}`
);

// P67-06: tier_data.js の overall および役割別表に4体が暫定評価で存在すること
const overall = tiers.overall;
const findInTier = (board, tierName, castleName) => {
  const row = (board?.rows || []).find(r => r.tier === tierName);
  return row ? (row.castles || []).find(c => c.name === castleName) : null;
};

const tDazaifu = findInTier(overall, 'S+', '［霊衛］大宰府');
const tNobeoka = findInTier(overall, 'S', '［崩舞］延岡城');
const tSawayama = findInTier(overall, 'A+', '［忠刃］佐和山城');
const tKagoshima = findInTier(overall, 'A', '［雲耀］鹿児島城');

const overallHasNote = (overall?.description || '').includes('2026年11月19日時点の暫定評価');
const allTagsProvisional = [tDazaifu, tNobeoka, tSawayama, tKagoshima].every(x => x && (x.tag || '').includes('暫定'));

const roleDpsDazaifu = findInTier(tiers.role_dps, 'S+', '［霊衛］大宰府');
const roleDpsNobeoka = findInTier(tiers.role_dps, 'S', '［崩舞］延岡城');
const roleBufNobeoka = findInTier(tiers.role_buffer, 'S', '［崩舞］延岡城');
const roleTankNobeoka = findInTier(tiers.role_tank_cc, 'S', '［崩舞］延岡城');

assert(
  'P67-06: tier_data.js の overall（S+/S/A+/A）および役割別表に4体が暫定評価（暫定タグ＋2026/11/19注記）で追加されていること',
  overallHasNote && allTagsProvisional && Boolean(roleDpsDazaifu) && Boolean(roleDpsNobeoka) && Boolean(roleBufNobeoka) && Boolean(roleTankNobeoka),
  `overall注記=${overallHasNote}, 全タグ暫定表記=${allTagsProvisional}, role_dps=${Boolean(roleDpsDazaifu && roleDpsNobeoka)}, role_buffer=${Boolean(roleBufNobeoka)}, role_tank_cc=${Boolean(roleTankNobeoka)}`
);

console.log(`\n=== Prompt 67 Test Summary: ${passed} / ${total} PASSED ===\n`);
if (passed !== total) {
  process.exit(1);
}
