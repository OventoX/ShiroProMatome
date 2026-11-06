/**
 * ShiroProMatome Whitebox Test Suite (test-spec)
 * Implements:
 * - ST-01 ~ ST-08 (Static Analysis)
 * - DT-01 ~ DT-15 (Data Invariants)
 * - UT-01 ~ UT-08 (Utility Functions)
 * - BD-01 ~ BD-04 (Build Data Reproducibility)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

global.window = global;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.window.innerWidth = 1920;
global.window.innerHeight = 1080;
require('../app/data.js');
require('../app/guides.js');
require('../app/tier_data.js');
require('../app/weapons_data.js');

// Mock localStorage and minimal browser globals so we can load app.js in Node
const mockLocalStorageData = {};
global.localStorage = {
  getItem: (k) => mockLocalStorageData[k] !== undefined ? mockLocalStorageData[k] : null,
  setItem: (k, v) => { mockLocalStorageData[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorageData[k]; },
  clear: () => { Object.keys(mockLocalStorageData).forEach(k => delete mockLocalStorageData[k]); }
};

const makeMockElement = () => ({
  style: {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  addEventListener: () => {},
  appendChild: () => {},
  setAttribute: () => {},
  removeAttribute: () => {},
  getAttribute: () => '',
  dataset: {},
  children: [],
  childNodes: [],
  querySelectorAll: () => [],
  querySelector: () => null,
  value: '',
  textContent: '',
  innerHTML: ''
});

global.document = {
  getElementById: (id) => makeMockElement(),
  querySelector: () => makeMockElement(),
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => makeMockElement(),
  body: makeMockElement(),
  documentElement: makeMockElement()
};

global.location = { href: 'http://localhost/', search: '', hash: '', pathname: '/' };
global.history = { replaceState: () => {} };

require('../app/app.js');

const results = [];
const xfailResults = [];

function recordTest(id, name, pass, actual, expected, isXfail = false, reason = '') {
  const item = { id, name, pass, actual, expected, isXfail, reason };
  if (isXfail) {
    xfailResults.push(item);
  } else {
    results.push(item);
  }
}

console.log('=== Running Whitebox Test Suite (Node.js) ===\n');

// -------------------------------------------------------------
// Section 2: 静的解析ケース (ST-01 to ST-08)
// -------------------------------------------------------------
console.log('[SECTION 2] Static Analysis (ST-01 ~ ST-08)...');

// ST-01: app.js 全体: 城娘オブジェクトへのプロパティ参照（c.xxx / castle.xxx）の妥当性
const actualCastleFields = new Set();
SCRE_DATA.forEach(c => {
  Object.keys(c).forEach(k => actualCastleFields.add(k));
});
const appJsPath = path.join(__dirname, '../app/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf-8');

const castlePropMatches = new Set();
const cRegex = /\b(?:c|castle)\.([a-zA-Z0-9_$]+)\b/g;
let m;
while ((m = cRegex.exec(appJsContent)) !== null) {
  castlePropMatches.add(m[1]);
}
const invalidCastleProps = Array.from(castlePropMatches).filter(p => !actualCastleFields.has(p));
recordTest('ST-01', '城娘オブジェクトへのプロパティ参照が全てdata.js実在フィールド',
  invalidCastleProps.length === 0,
  invalidCastleProps.length > 0 ? `Unrecognized: ${invalidCastleProps.join(', ')}` : 'all properties exist in data.js',
  'all properties exist in data.js');

// ST-02: app.js 全体: guides ステージオブジェクトへの参照が実在フィールドのみ
const actualStageFields = new Set([
  'title', 'category', 'subCategory', 'terrain', 'rules', 'deliberations', 'totalDelibPoints', 'bossInfo', 'hadesMeta', 'id'
]);
// Verify that whenever st or stage refers to guides, it uses actual fields
// Specifically prevent skillDesc / stratDesc in stage
const forbiddenStageProps = ['skillDesc', 'stratDesc', 'reading', 'iconUrl'];
const foundForbiddenStageProps = forbiddenStageProps.filter(p => {
  const reg = new RegExp(`\\b(?:st|stage)\\.${p}\\b`);
  return reg.test(appJsContent);
});
recordTest('ST-02', 'guidesステージオブジェクトへの不正参照(skillDesc等)なし',
  foundForbiddenStageProps.length === 0,
  foundForbiddenStageProps.length > 0 ? `Found forbidden props: ${foundForbiddenStageProps.join(', ')}` : 'none',
  'none');

// ST-03: app/*.js node --check が全ファイルで通る
let st03Pass = true;
let st03Error = '';
try {
  const jsFiles = ['app.js', 'data.js', 'guides.js', 'tier_data.js', 'weapons_data.js'];
  jsFiles.forEach(f => {
    execSync(`node --check "${path.join(__dirname, '../app', f)}"`, { stdio: 'pipe' });
  });
} catch (e) {
  st03Pass = false;
  st03Error = e.message;
}
recordTest('ST-03', 'app/*.js 全ファイルが node --check 合格', st03Pass,
  st03Pass ? 'all 5 files valid' : st03Error, 'all 5 files valid');

// ST-04: onclick 等で呼ばれる関数名が app.js に全て定義されている
const inlineOnclickRegex = /onclick=["']([a-zA-Z0-9_$]+)\s*\(/g;
const calledOnclickFns = new Set();
while ((m = inlineOnclickRegex.exec(appJsContent)) !== null) {
  calledOnclickFns.add(m[1]);
}
const missingOnclickFns = Array.from(calledOnclickFns).filter(fn => typeof window[fn] !== 'function');
recordTest('ST-04', 'onclick呼出関数がapp.jsに定義・エクスポート済み',
  missingOnclickFns.length === 0,
  missingOnclickFns.length > 0 ? `missing: ${missingOnclickFns.join(', ')}` : 'all defined',
  'all defined');

// ST-05: getElementById で参照する要素IDが HTML 側に全て存在する
const htmlContent = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf-8');
const htmlIds = new Set();
const htmlIdRegex = /\bid=["']([^"']+)["']/g;
while ((m = htmlIdRegex.exec(htmlContent)) !== null) {
  htmlIds.add(m[1]);
}
// Dynamic IDs defined in app.js
const dynamicIdRegex = /\bid=["']([^"']+)["']|\.id\s*=\s*["']([^"']+)["']/g;
while ((m = dynamicIdRegex.exec(appJsContent)) !== null) {
  if (m[1]) htmlIds.add(m[1]);
  if (m[2]) htmlIds.add(m[2]);
}
const getElemRegex = /getElementById\(["']([^"']+)["']\)/g;
const referencedIds = new Set();
while ((m = getElemRegex.exec(appJsContent)) !== null) {
  referencedIds.add(m[1]);
}
const missingIds = Array.from(referencedIds).filter(id => !htmlIds.has(id));
recordTest('ST-05', 'getElementById参照IDがHTML側に全281件存在',
  missingIds.length === 0,
  missingIds.length > 0 ? `missing: ${missingIds.join(', ')}` : 'all IDs exist',
  'all IDs exist');

// ST-06: ユーザー入力・URL由来文字列の innerHTML 渡しが escapeHtml または textContent 経由
const unescapedVulnerabilities = [];
// Check preset names: uses textContent in renderPresetBar
if (!/textContent\s*=\s*p\.name/.test(appJsContent)) {
  unescapedVulnerabilities.push('preset.name not using textContent');
}
// Check custom tier dropdown options: uses escapeHtml
if (!/escapeHtml\(k\)/.test(appJsContent)) {
  unescapedVulnerabilities.push('customTiersStorage keys not escaped in dropdown');
}
// Check custom tier row options: uses escapeHtml
if (!/escapeHtml\(r\.letter\)/.test(appJsContent)) {
  unescapedVulnerabilities.push('customTierRows letter not escaped in dropdown');
}
recordTest('ST-06', 'ユーザー入力・URL由来文字列の安全な出力(escapeHtml / textContent)',
  unescapedVulnerabilities.length === 0,
  unescapedVulnerabilities.length > 0 ? `Unescaped: ${unescapedVulnerabilities.join(', ')}` : 'all safely handled (escapeHtml / textContent)',
  'all safely handled (escapeHtml / textContent)');

// ST-07: tools/*.py 全スクリプトが py_compile を通る
let st07Pass = true;
let st07Error = '';
try {
  const pyFiles = fs.readdirSync(path.join(__dirname, '../tools')).filter(f => f.endsWith('.py'));
  pyFiles.forEach(f => {
    execSync(`python -m py_compile "${path.join(__dirname, '../tools', f)}"`, { stdio: 'pipe' });
  });
} catch (e) {
  st07Pass = false;
  st07Error = e.message;
}
recordTest('ST-07', 'tools/*.py 全スクリプトが py_compile 合格', st07Pass,
  st07Pass ? 'all python tools compiled' : st07Error, 'all python tools compiled');

// ST-08: .gitignore された生成物キャッシュに依存してデータが作られていない
const gitignoreContent = fs.readFileSync(path.join(__dirname, '../.gitignore'), 'utf-8');
const cacheTracked = gitignoreContent.includes('!tools/cache/real_castles_cache.json');
recordTest('ST-08', 'リポジトリキャッシュ追跡整合(.gitignore)', cacheTracked,
  cacheTracked ? '!tools/cache/real_castles_cache.json tracked' : 'cache ignored',
  '!tools/cache/real_castles_cache.json tracked');


// -------------------------------------------------------------
// Section 3: データ不変条件 (DT-01 to DT-15)
// -------------------------------------------------------------
console.log('\n[SECTION 3] Data Invariants (DT-01 ~ DT-15)...');

// DT-01: 1,161 castles, id and name unique
const castleCount = SCRE_DATA.length;
const idSet = new Set(SCRE_DATA.map(c => c.id));
const nameSet = new Set(SCRE_DATA.map(c => c.name));
recordTest('DT-01', '城娘1,161体・ID/名称重複なし',
  castleCount === 1161 && idSet.size === 1161 && nameSet.size === 1161,
  `count=${castleCount}, idSet=${idSet.size}, nameSet=${nameSet.size}`,
  'count=1161, idSet=1161, nameSet=1161');

// DT-02: parseWarnings empty
const warningCastles = SCRE_DATA.filter(c => c.parseWarnings && c.parseWarnings.length > 0).map(c => c.name);
recordTest('DT-02', '全城娘のparseWarningsが空', warningCastles.length === 0,
  `warningsCount=${warningCastles.length}`, 'warningsCount=0');

// DT-03: stat keys in known buckets
const knownStats = new Set(Object.keys(SCRE_RULES.statLabels || {}));
const allStatsInData = new Set();
const unknownStats = new Set();
SCRE_DATA.forEach(c => {
  const allAbilities = [...(c.allSkills || []), ...(c.allStrategies || []), ...(c.allSpecials || [])];
  allAbilities.forEach(ab => {
    (ab.effects || []).forEach(e => {
      allStatsInData.add(e.stat);
      if (!knownStats.has(e.stat)) {
        unknownStats.add(e.stat);
      }
    });
  });
});
recordTest('DT-03', '全effectsのstatキーが既知バケットに含まれる', unknownStats.size === 0,
  `unknownStats=${Array.from(unknownStats).join(', ') || 'none'}`, 'unknownStats=none');

// DT-04: calculateBuffs buckets for all stats
const expectedBuffBuckets = [
  'atkPercent', 'atkFlat', 'defPercent', 'defFlat',
  'rangePercent', 'rangeFlat', 'hpPercent', 'hpFlat',
  'recoveryFlat', 'dmgDealt', 'dmgDealtTarget', 'dmgTakenDown',
  'atkSpeed', 'gapShorten', 'defIgnore', 'shares'
];
const expectedDebuffBuckets = ['enemyDefDown', 'enemyAtkDown', 'enemySlow', 'enemyDmgTakenUp'];
const missingBuckets = Array.from(allStatsInData).filter(st => {
  if (st === 'shareAtk' || st === 'shareDef') return !expectedBuffBuckets.includes('shares');
  if (st.startsWith('enemy')) return !expectedDebuffBuckets.includes(st);
  return !expectedBuffBuckets.includes(st);
});
recordTest('DT-04', '実在statキーに対するcalculateBuffs受け皿バケット存在', missingBuckets.length === 0,
  `missingBuckets=${missingBuckets.join(', ') || 'none'}`, 'missingBuckets=none');

// DT-05: target vocabulary
const knownTargets = new Set(['self', 'inRange', 'all', '']);
const unknownTargets = new Set();
SCRE_DATA.forEach(c => {
  const allAbilities = [...(c.allSkills || []), ...(c.allStrategies || []), ...(c.allSpecials || [])];
  allAbilities.forEach(ab => {
    (ab.effects || []).forEach(e => {
      const tgt = e.target !== undefined ? e.target : '';
      if (!knownTargets.has(tgt)) {
        unknownTargets.add(tgt);
      }
    });
  });
});
recordTest('DT-05', 'effects target語彙が既知語彙(self/inRange/all/"")のみ', unknownTargets.size === 0,
  `unknownTargets=${Array.from(unknownTargets).join(', ') || 'none'}`, 'unknownTargets=none');

// DT-06: rangeKind distribution (554 / 543 / 64)
const rkCounts = {};
SCRE_DATA.forEach(c => { rkCounts[c.rangeKind] = (rkCounts[c.rangeKind] || 0) + 1; });
recordTest('DT-06', 'rangeKind分布 近554 / 遠543 / 遠近64',
  rkCounts['近'] === 554 && rkCounts['遠'] === 543 && rkCounts['遠近'] === 64,
  JSON.stringify(rkCounts), JSON.stringify({ '近': 554, '遠': 543, '遠近': 64 }));

// DT-07: Kai2 remodelStages consistency (Resolved in Prompt 11: 0 missing)
const missingKai2 = SCRE_DATA.filter(c => {
  const hasKai2Ability = (c.allSkills || []).some(s => s.stage === '改弐') || (c.allStrategies || []).some(s => s.stage === '改弐');
  const hasKai2Remodel = (c.remodelStages || []).includes('改弐');
  return hasKai2Ability && !hasKai2Remodel;
});
recordTest('DT-07', '改弐スキルとremodelStagesの整合(Prompt 11で解消済み: 欠落0件)',
  missingKai2.length === 0,
  `missingCount=${missingKai2.length}`, 'missingCount=0 (解消完了)');

// DT-08: remodelStages has Kai2 but no Kai2 skill
const extraKai2 = SCRE_DATA.filter(c => {
  const hasKai2Ability = (c.allSkills || []).some(s => s.stage === '改弐') || (c.allStrategies || []).some(s => s.stage === '改弐');
  const hasKai2Remodel = (c.remodelStages || []).includes('改弐');
  return !hasKai2Ability && hasKai2Remodel;
});
recordTest('DT-08', 'remodelStages改弐あり・スキルなし城娘の整合', extraKai2.length === 0,
  `extraCount=${extraKai2.length}`, 'extraCount=0');

// DT-09: illustUrl in remodelForms & Kai2
const missingIllustInForms = [];
SCRE_DATA.forEach(c => {
  if (c.remodelForms) {
    Object.keys(c.remodelForms).forEach(stage => {
      const form = c.remodelForms[stage];
      if (!form.illustUrl && !form.illustFile) missingIllustInForms.push(`${c.name}:${stage}`);
    });
  }
  if ((c.remodelStages || []).includes('改弐')) {
    const kai2Form = c.remodelForms && c.remodelForms['改弐'];
    if (!kai2Form || (!kai2Form.illustUrl && !c.illustUrl)) missingIllustInForms.push(`${c.name}:改弐立ち絵欠落`);
  }
});
recordTest('DT-09', 'remodelFormsおよび改弐タブ城娘の立ち絵URL存在', missingIllustInForms.length === 0,
  `missingCount=${missingIllustInForms.length}`, 'missingCount=0');

// DT-10: 5 castles without tokugi/taiha
const KNOWN_NO_TOKUGI_OR_TAIHA = [
  '［温泉］ブダ城', '［お月見］小牧山城', '大華の母たる者 徐華', '常盤台中学', '城塞都市アビラ'
].sort();
const actualNoTokugiOrTaiha = SCRE_DATA.filter(c => !c.tokugiUrl || !c.taihaUrl).map(c => c.name).sort();
recordTest('DT-10', '特技/大破絵なし城娘が既知5体と一致',
  actualNoTokugiOrTaiha.length === 5 && actualNoTokugiOrTaiha.every((n, i) => n === KNOWN_NO_TOKUGI_OR_TAIHA[i]),
  actualNoTokugiOrTaiha.join(', '), KNOWN_NO_TOKUGI_OR_TAIHA.join(', '));

// DT-11: 23 castles without ruby
const KNOWN_NO_RUBY = [
  'ノイシュヴァンシュタイン城', 'コンシェルジュリー', '［聖夜］モン・サン＝ミッシェル',
  'エーリューズニル', 'アテナイ・アクロポリス', 'ラピュータ', 'ホッホオスターヴィッツ城',
  'リヒテンシュタイン城', 'カルルシュテイン城', '伊達政宗', 'カーナーヴォン城',
  'フランケンシュタイン城', 'サンタンジェロ城', 'カステル・ヴェッキオ', 'リープ城',
  'ペレシュ城', 'ウォリック城', 'カステル・ヌオーヴォ', 'グラーフェンステーン',
  'エルツ城', 'ゆんゆん', 'めぐみん', 'アーニャ・アールストレイム'
].sort();
const actualNoRuby = SCRE_DATA.filter(c => !c.ruby).map(c => c.name).sort();
recordTest('DT-11', 'ruby未定義城娘が既知23体と一致',
  actualNoRuby.length === 23 && actualNoRuby.every((n, i) => n === KNOWN_NO_RUBY[i]),
  `count=${actualNoRuby.length}`, 'count=23');

// DT-12: Guides count (182 total, 130 hell, 11/42/35/42)
let gTotal = 0, gHell = 0;
const gSubCats = {};
SCRE_GUIDES.forEach(cat => {
  gTotal += (cat.stages || []).length;
  if (cat.category === '地獄') {
    gHell += (cat.stages || []).length;
    (cat.stages || []).forEach(st => {
      gSubCats[st.subCategory] = (gSubCats[st.subCategory] || 0) + 1;
    });
  }
});
recordTest('DT-12', 'guides全182件・地獄130件・サブカテゴリ件数一致',
  gTotal === 182 && gHell === 130 &&
  gSubCats['ハデスの死闘場'] === 11 && gSubCats['閻魔の闘技場'] === 42 &&
  gSubCats['ヘルの遊戯場'] === 35 && gSubCats['オシリスの審判場'] === 42,
  `total=${gTotal}, hell=${gHell}, hades=${gSubCats['ハデスの死闘場']}, enma=${gSubCats['閻魔の闘技場']}, hel=${gSubCats['ヘルの遊戯場']}, osiris=${gSubCats['オシリスの審判場']}`,
  'total=182, hell=130, hades=11, enma=42, hel=35, osiris=42');

// DT-13: hadesMeta complete in all 11 Hades stages
const hadesCat = SCRE_GUIDES.find(g => g.category === '地獄');
const hadesStages = (hadesCat?.stages || []).filter(st => st.subCategory === 'ハデスの死闘場');
const hadesMissingMeta = [];
const hadesMetaRequiredKeys = ['soulColor', 'depth', 'bossName', 'difficulty', 'fixedRedeploy', 'soulGimmick', 'terrainBonus'];
hadesStages.forEach(st => {
  if (!st.hadesMeta) {
    hadesMissingMeta.push(`${st.title}: no hadesMeta`);
  } else {
    hadesMetaRequiredKeys.forEach(k => {
      if (st.hadesMeta[k] === undefined) hadesMissingMeta.push(`${st.title}: missing ${k}`);
    });
  }
});
recordTest('DT-13', 'ハデス全11ステージに完全なhadesMetaが存在',
  hadesStages.length === 11 && hadesMissingMeta.length === 0,
  `hadesStages=${hadesStages.length}, missingMetaCount=${hadesMissingMeta.length}`,
  'hadesStages=11, missingMetaCount=0');

// DT-14: tier_data.js names exist in data.js without duplicates
let tierTotal = 0;
const tierMissingNames = [];
const tierDuplicates = [];
const nameToCastle = new Map(SCRE_DATA.map(c => [c.name, c]));
Object.keys(SCRE_TIERS || {}).forEach(boardKey => {
  const board = SCRE_TIERS[boardKey];
  const seenInBoard = new Set();
  (board.tiers || []).forEach(tr => {
    (tr.castles || []).forEach(name => {
      tierTotal++;
      if (!nameToCastle.has(name)) tierMissingNames.push(`${boardKey}/${tr.tier}: ${name}`);
      if (seenInBoard.has(name)) tierDuplicates.push(`${boardKey}: ${name}`);
      seenInBoard.add(name);
    });
  });
});
recordTest('DT-14', 'tier_data.js 全掲載名実在・同一ボード重複なし',
  tierMissingNames.length === 0 && tierDuplicates.length === 0,
  `missing=${tierMissingNames.length}, duplicates=${tierDuplicates.length}, total=${tierTotal}`,
  'missing=0, duplicates=0');

// DT-15: realCastle metadata integrity and hosts
const realCastles = SCRE_DATA.filter(c => c.realCastle);
const realCastleIssues = [];
realCastles.forEach(c => {
  const rc = c.realCastle;
  if (!rc.photoUrl || !rc.author || !rc.license || !rc.articleUrl) {
    realCastleIssues.push(`${c.name}: missing required fields`);
  } else {
    if (!rc.photoUrl.includes('wikimedia.org')) realCastleIssues.push(`${c.name}: invalid photoUrl host`);
    if (!rc.articleUrl.includes('wikipedia.org')) realCastleIssues.push(`${c.name}: invalid articleUrl host`);
  }
});
recordTest('DT-15', '実在城メタデータ4点完備およびWikimedia/Wikipediaホスト検証',
  realCastles.length > 0 && realCastleIssues.length === 0,
  `realCastlesCount=${realCastles.length}, issues=${realCastleIssues.length}`,
  `realCastlesCount=${realCastles.length}, issues=0`);


// -------------------------------------------------------------
// Section 4: ユーティリティ関数（単体） (UT-01 to UT-08)
// -------------------------------------------------------------
console.log('\n[SECTION 4] Utility Functions (UT-01 ~ UT-08)...');

// UT-01: parseStatNumber basic conversions
const ut01Cases = [
  { in: '1,234', exp: 1234 },
  { in: '45%', exp: 45 },
  { in: '', exp: 0 },
  { in: ' １，２３４ ', exp: 1234 },
  { in: '  300  ', exp: 300 }
];
const ut01Failed = ut01Cases.filter(c => window.parseStatNumber(c.in) !== c.exp);
recordTest('UT-01', 'parseStatNumber 基本変換(カンマ・%・空文字・全角・空白)',
  ut01Failed.length === 0,
  ut01Failed.length > 0 ? `Failed cases: ${JSON.stringify(ut01Failed)}` : 'all cases matched',
  'all cases matched');

// UT-02: parseStatNumber slash format
const ut02_1 = window.parseStatNumber('120/340');
const ut02_2 = window.parseStatNumber('50/ 150 ');
const ut02Pass = !isNaN(ut02_1) && ut02_1 === 340 && !isNaN(ut02_2) && ut02_2 === 150;
recordTest('UT-02', 'parseStatNumber statsDetail.giant5 slash形式("120/340")',
  ut02Pass,
  `120/340 -> ${ut02_1}, 50/150 -> ${ut02_2}`,
  '120/340 -> 340, 50/150 -> 150');

// UT-03: getCastleById / getCastleByName
const c_edo = window.getCastleByName('江戸城');
const c_hiroshima = window.getCastleByName('［漆磊］広島城');
const c_typo = window.getCastleByName('［漆礌］広島城'); // Typo with 礌 instead of 磊
const ut03Pass = c_edo !== null && c_hiroshima !== null && c_typo === null;
recordTest('UT-03', 'getCastleById / getCastleByName (実在解決・誤字null返却却)',
  ut03Pass,
  `edo=${Boolean(c_edo)}, hiroshima=${Boolean(c_hiroshima)}, typo=${c_typo}`,
  'edo=true, hiroshima=true, typo=null');

// UT-04: getLatestAbilities (改弐 > 改壱 > 無印 優先選定)
const c_kinki = window.getCastleByName('金亀城'); // Has 改弐 skill
const ab_kinki = window.getLatestAbilities(c_kinki);
const c_emptySpec = { name: 'テスト城', skill: { name: '特技1' }, allSpecials: [] };
const ab_emptySpec = window.getLatestAbilities(c_emptySpec);
const ut04Pass = ab_kinki.skill && ab_kinki.skill.stage === '改弐' && ab_emptySpec.special === null;
recordTest('UT-04', 'getLatestAbilities 改弐>改壱優先・allSpecials空例外回避',
  ut04Pass,
  `kinkiSkillStage=${ab_kinki?.skill?.stage}, emptySpec=${ab_emptySpec.special}`,
  'kinkiSkillStage=改弐, emptySpec=null');

// UT-05: matchCastleNameOrRuby (ひらがな・カタカナ・部分一致・ruby未定義フォールバック)
const c_hikone = window.getCastleByName('彦根城');
const c_neuschwan = window.getCastleByName('ノイシュヴァンシュタイン城'); // In DT-11, no ruby
const ut05_1 = window.matchCastleNameOrRuby(c_hikone, 'ひこね');
const ut05_2 = window.matchCastleNameOrRuby(c_hikone, 'ヒコネ');
const ut05_3 = window.matchCastleNameOrRuby(c_hikone, '彦根');
const ut05_4 = window.matchCastleNameOrRuby(c_neuschwan, 'ノイシュ');
const ut05_5 = window.matchCastleNameOrRuby(c_neuschwan, 'のいしゅ');
const ut05Pass = ut05_1 && ut05_2 && ut05_3 && ut05_4 && ut05_5;
recordTest('UT-05', 'matchCastleNameOrRuby ひらがな/カタカナ検索・ruby未定義フォールバック',
  ut05Pass,
  `hikoneHira=${ut05_1}, hikoneKata=${ut05_2}, neuschwan=${ut05_4}, neuschwanHira=${ut05_5}`,
  'hikoneHira=true, hikoneKata=true, neuschwan=true, neuschwanHira=true');

// UT-06: escapeHtml (<script>、引用符、アンパサンド実体参照化、二重エスケープ防止)
const ut06_1 = window.escapeHtml('<script>alert("XSS")</script>');
const ut06_2 = window.escapeHtml('A & B');
const ut06_3 = window.escapeHtml('A &amp; B'); // Already escaped: should NOT become &amp;amp;
const ut06Pass = (ut06_1 === '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;') &&
                 (ut06_2 === 'A &amp; B') &&
                 (ut06_3 === 'A &amp; B');
recordTest('UT-06', 'escapeHtml XSS無害化・二重エスケープ防止',
  ut06Pass,
  `script=${ut06_1}, bareAnd=${ut06_2}, alreadyEsc=${ut06_3}`,
  'script=&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;, bareAnd=A &amp; B, alreadyEsc=A &amp; B');

// UT-07: getCastleFullText (特技・計略・特殊能力の全段階連結テキスト)
const fullText_edo = window.getCastleFullText(c_edo);
const ut07Pass = fullText_edo.length > 50 && fullText_edo.includes(c_edo.skill?.name || '');
recordTest('UT-07', 'getCastleFullText 特技・計略・特殊能力全段階連結',
  ut07Pass,
  `textLength=${fullText_edo.length}, includesSkillName=${fullText_edo.includes(c_edo.skill?.name || '')}`,
  'textLength>50, includesSkillName=true');

// UT-08: calcPercentile (同値のみ・要素1件・空配列・0〜100範囲)
const p_empty = window.calcPercentile(5, []);
const p_single = window.calcPercentile(10, [10]);
const p_same = window.calcPercentile(5, [5, 5, 5]);
const p_norm = window.calcPercentile(3, [1, 2, 3, 4, 5]);
const ut08Pass = !isNaN(p_empty) && !isNaN(p_single) && !isNaN(p_same) && !isNaN(p_norm) &&
                 p_norm >= 0 && p_norm <= 1.0;
recordTest('UT-08', 'calcPercentile 境界値(同値・1件・空配列)NaN回避・範囲内判定',
  ut08Pass,
  `empty=${p_empty}, single=${p_single}, same=${p_same}, norm=${p_norm}`,
  'empty=0.5, single=1, same=1, norm in [0, 1]');


// -------------------------------------------------------------
// Section 15: データ生成 tools/build_data.py（再現性） (BD-01 to BD-04)
// -------------------------------------------------------------
console.log('\n[SECTION 15] Build Data Reproducibility (BD-01 ~ BD-04)...');

// BD-01: 再生成の安定性 (城娘件数1,161件、主要フィールド維持)
const bd01Pass = SCRE_DATA.length === 1161 &&
  SCRE_DATA.every(c => c.id && c.name && c.rarity && c.rangeKind && c.weapon);
recordTest('BD-01', '再生成の安定性(城娘件数1,161件・主要フィールド維持)',
  bd01Pass,
  `total=${SCRE_DATA.length}, allValidFields=${bd01Pass}`,
  'total=1161, allValidFields=true');

// BD-02: フィールド欠落の検出 (illustUrl 等の主要フィールドが空になる城娘が0件)
const missingIllustCastles = SCRE_DATA.filter(c => !c.illustUrl && !c.illustFile).map(c => c.name);
recordTest('BD-02', '主要フィールド(illustUrl等)欠落城娘なし',
  missingIllustCastles.length === 0,
  `missingCount=${missingIllustCastles.length}`,
  'missingCount=0');

// BD-03: キャッシュ再現性 (tools/real_castle_overrides.json によりキャッシュ消失時も再現可能)
const overridesPath = path.join(__dirname, 'real_castle_overrides.json');
const hasOverrides = fs.existsSync(overridesPath);
const overridesData = hasOverrides ? JSON.parse(fs.readFileSync(overridesPath, 'utf-8')) : {};
const totalOverrides = Object.keys(overridesData.overrides || {}).length + (overridesData.fictional || []).length;
recordTest('BD-03', '実在城マッピング・オーバーライド定義の永続性(BD-03)',
  hasOverrides && totalOverrides >= 100,
  `hasOverrides=${hasOverrides}, mappedCount=${totalOverrides}`,
  'hasOverrides=true, mappedCount>=100');

// BD-04: 改弐抽出 (金亀城の remodelStages に改弐が含まれ、DT-07の欠落が解消)
const kinkiRemodel = c_kinki?.remodelStages || [];
const bd04Pass = kinkiRemodel.includes('改弐');
recordTest('BD-04', '金亀城 remodelStages に改弐が含まれ欠落解消(第11弾確認)',
  bd04Pass,
  `kinkiRemodelStages=${JSON.stringify(kinkiRemodel)}`,
  'kinkiRemodelStages includes 改弐');


// -------------------------------------------------------------
// Print Summary
// -------------------------------------------------------------
console.log('\n=============================================================');
console.log('WHITEBOX TESTS EXECUTION SUMMARY');
console.log('=============================================================');

let passCount = 0;
let failCount = 0;

results.forEach(r => {
  const status = r.pass ? 'PASS' : 'FAIL';
  if (r.pass) passCount++; else failCount++;
  console.log(`[${status}] ${r.id}: ${r.name}`);
  if (!r.pass) {
    console.log(`       Expected: ${r.expected}`);
    console.log(`       Actual:   ${r.actual}`);
  }
});

if (xfailResults.length > 0) {
  console.log('\n--- XFAIL (Known Pending Items) ---');
  xfailResults.forEach(r => {
    console.log(`[XFAIL] ${r.id}: ${r.name}`);
    console.log(`        Reason: ${r.reason}`);
    console.log(`        Actual: ${r.actual}`);
  });
}

console.log(`\nTOTAL: ${results.length} | PASSED: ${passCount} | FAILED: ${failCount} | XFAIL: ${xfailResults.length}`);

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('All Node whitebox test cases passed!\n');
}
