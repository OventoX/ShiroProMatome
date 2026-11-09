const fs = require('fs');

global.window = global;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
require('../app/data.js');
require('../app/guides.js');
require('../app/tier_data.js');
require('../app/weapons_data.js');

const mockLocalStorageData = {};
global.localStorage = {
  getItem: (k) => mockLocalStorageData[k] !== undefined ? mockLocalStorageData[k] : null,
  setItem: (k, v) => { mockLocalStorageData[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorageData[k]; },
  clear: () => {}
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

const OHIGE_WEIGHTS = {
  giantKiReduction: 18.0,
  stratCooldownAlly: 18.0,
  stratCooldownSelf: 7.0,
  kiBoost: 15.0,
  kiBoostPassive: 18.0,
  ailment: 12.0,
  ailmentImmune: 10.0,
  movementSlow: 10.0,
  multiHit: 14.0,
  targetInc: 10.0,
  atkSpeed: 10.0,
  gapShort: 8.0,
  defIgnore: 15.0,
  hpPercentCut: 14.0,
  dmgDealtTarget: 12.0,
  debuffAtk: 8.0,
  debuffDef: 8.0,
  debuffDmgTaken: 8.0,
  debuffDmgDealt: 6.0,
  bothRange: 8.0,
  multiAttr: 6.0,
  tileFlexibility: 12.0,
  usefulToken: 12.0,
  passiveTeamBuff: 10.0,
  chargeCap: 12.0,
  conditionalDiscount: 0.85
};

function analyzeCastle(c) {
  const sk = (c.allSkills && c.allSkills.length > 0)
    ? (c.allSkills.find(s => s.stage === "改弐") || c.allSkills.find(s => s.stage === "改壱") || c.allSkills[0])
    : c.skill;
  const st = (c.allStrategies && c.allStrategies.length > 0)
    ? (c.allStrategies.find(s => s.stage === "改弐") || c.allStrategies.find(s => s.stage === "改壱") || c.allStrategies[0])
    : c.strategy;
  const sp = c.special;

  const skText = sk ? ((sk.name || "") + " " + (sk.text || "")) : "";
  const stText = st ? ((st.name || "") + " " + (st.text || "")) : "";
  const spText = sp ? ((sp.name || "") + " " + (sp.text || "")) : "";
  const allText = [skText, stText, spText].filter(Boolean).join(" ");

  const breakdown = [];
  let rawScore = 0.0;

  // 1. 編成インフラ・巨大化気軽減
  const giantKiMatch = allText.match(/([^。]*?(?:巨大化(?:に必要な)?気を?(?:約)?(\d+)%?軽減|巨大化消費気(?:が|を)?(\d+)%?軽減)[^。]*)/);
  if (giantKiMatch) {
    const val = parseInt(giantKiMatch[2] || giantKiMatch[3] || 25, 10);
    const isTeam = /(?:全て|全城娘|射程内の?城娘|味方)/.test(giantKiMatch[1]) && !/自身のみ|自身(?:の(?:巨大化)?|は)/.test(giantKiMatch[1]);
    const pts = (isTeam ? OHIGE_WEIGHTS.giantKiReduction : (OHIGE_WEIGHTS.giantKiReduction * 0.55)) * Math.min(1.2, val / 30.0);
    rawScore += pts;
    breakdown.push({ category: '巨大化気軽減', points: pts, detail: `val=${val}, isTeam=${isTeam}` });
  }

  // 2. 計略短縮・気ブースト
  const cdMatch = allText.match(/([^。]*?(?:計略再使用\s*(?:時間)?|使用までの時間)[^。]*?(?:が|を|は)?(?:約)?(\d+)%[^。]*?短縮[^。]*)/);
  if (cdMatch) {
    const val = parseInt(cdMatch[2], 10);
    const isTeam = /(?:全て|全城娘|射程内の?城娘|味方)/.test(cdMatch[1]) && !/自身のみ|自身(?:の(?:計略)?|は)/.test(cdMatch[1]);
    const isPassive = skText.includes(cdMatch[0]);
    const pts = (isTeam ? (isPassive ? OHIGE_WEIGHTS.stratCooldownAlly : (OHIGE_WEIGHTS.stratCooldownAlly * 0.8)) : OHIGE_WEIGHTS.stratCooldownSelf) * Math.min(1.2, val / 35.0);
    rawScore += pts;
    breakdown.push({ category: '計略短縮', points: pts, detail: `val=${val}, isTeam=${isTeam}, isPassive=${isPassive}` });
  }

  if (/(?:気の自然増加量|時間経過で気|気)(?:が)?(?:徐々に)?増加|撃破時に気が(?:約)?(\d+)増加|気を(?:約)?(\d+)回復|気(?:が|を)(?:約)?(\d+)増加/.test(allText)) {
    const isPassive = /気の自然増加量|時間経過で気|撃破時/.test(skText);
    const pts = isPassive ? OHIGE_WEIGHTS.kiBoostPassive : OHIGE_WEIGHTS.kiBoost;
    rawScore += pts;
    breakdown.push({ category: '気ブースト', points: pts, detail: `isPassive=${isPassive}` });
  }

  // 3. 状態異常
  if (/猛毒|火傷|氷結|暗闇|混乱|行動不能|状態異常/.test(allText)) {
    rawScore += OHIGE_WEIGHTS.ailment;
    breakdown.push({ category: '状態異常付与', points: OHIGE_WEIGHTS.ailment });
  }
  if (/状態異常を(?:全て)?(?:回復し)?無効化/.test(allText)) {
    rawScore += OHIGE_WEIGHTS.ailmentImmune;
    breakdown.push({ category: '状態異常無効化', points: OHIGE_WEIGHTS.ailmentImmune });
  }
  const slowMatch = allText.match(/移動速度(?:が|を)?.*?(\d+)%低下/);
  if (slowMatch) {
    const val = parseInt(slowMatch[1], 10);
    const isPerGiant = /巨大化する度に/.test(allText);
    const mult = isPerGiant ? 5 : 1;
    const pts = OHIGE_WEIGHTS.movementSlow * Math.min(1.0, (val * mult) / 50.0);
    rawScore += pts;
    breakdown.push({ category: '移動速度低下', points: pts, detail: `val=${val*mult}%` });
  }

  // 敵デバフ
  const enemyClauses = allText.match(/[^。]*?(?:敵の|敵に|射程内の(?:全)?敵|攻撃した敵|全ての敵|全敵)[^。]*/g) || [];
  let hasAtk = false, hasDef = false, hasDmgTaken = false, hasDmgDealt = false;
  enemyClauses.forEach(cl => {
    if (/攻撃(?:力)?(?:[と、][^低下]*?)?(?:が|を)?(?:\d+%|\d+)?(?:と\d+)?低下/.test(cl)) hasAtk = true;
    if (/防御(?:力)?(?:[と、][^低下]*?)?(?:が|を)?(?:\d+%|\d+)?(?:と\d+)?低下|防御(?:が|を)0/.test(cl)) hasDef = true;
    if (/被ダメージ(?:が)?(?:\d+%|(?:\d+(?:\.\d+)?倍))?上昇/.test(cl)) hasDmgTaken = true;
    if (/与ダメージ(?:が|を)?(?:\d+%|(?:\d+(?:\.\d+)?倍))?低下/.test(cl)) hasDmgDealt = true;
  });
  if (hasAtk) { rawScore += OHIGE_WEIGHTS.debuffAtk; breakdown.push({ category: '敵攻撃低下', points: OHIGE_WEIGHTS.debuffAtk }); }
  if (hasDef) { rawScore += OHIGE_WEIGHTS.debuffDef; breakdown.push({ category: '敵防御低下', points: OHIGE_WEIGHTS.debuffDef }); }
  if (hasDmgTaken) { rawScore += OHIGE_WEIGHTS.debuffDmgTaken; breakdown.push({ category: '敵被ダメ上昇', points: OHIGE_WEIGHTS.debuffDmgTaken }); }
  if (hasDmgDealt) { rawScore += OHIGE_WEIGHTS.debuffDmgDealt; breakdown.push({ category: '敵与ダメ低下', points: OHIGE_WEIGHTS.debuffDmgDealt }); }

  // 4. 手数
  const multiHitMatch = allText.match(/(\d+)連続\s*(?:で)?(?:[^。]*?)?攻撃|(\d+)回\s*連続\s*(?:で)?(?:[^。]*?)?攻撃|(\d+)回\s*攻撃を行う|攻撃回数(?:が|を)?(?:約)?(\d+(?:\.\d+)?)倍/);
  if (multiHitMatch) {
    const hits = parseFloat(multiHitMatch[1] || multiHitMatch[2] || multiHitMatch[3] || multiHitMatch[4]);
    const pts = Math.min(OHIGE_WEIGHTS.multiHit, hits * 3.5);
    rawScore += pts;
    breakdown.push({ category: '連撃/攻撃回数', points: pts, detail: `hits=${hits}` });
  } else if (/連続で攻撃|連撃/.test(allText)) {
    const pts = OHIGE_WEIGHTS.multiHit * 0.6;
    rawScore += pts;
    breakdown.push({ category: '連撃(言及)', points: pts });
  }

  const targetIncMatch = allText.match(/攻撃対象(?:が)?(\d+)増加/);
  if (targetIncMatch) {
    const pts = Math.min(OHIGE_WEIGHTS.targetInc, parseInt(targetIncMatch[1], 10) * 5.0);
    rawScore += pts;
    breakdown.push({ category: '攻撃対象増加', points: pts, detail: `+${targetIncMatch[1]}` });
  }
  if (/射程内の(?:全敵|全ての敵|すべての敵)(?:に|へ)?(?:対して)?(?:[^。]*?)?(?:攻撃|ダメージ)|全敵に(?:攻撃|ダメージ)|全敵を攻撃/.test(allText)) {
    rawScore += OHIGE_WEIGHTS.targetInc;
    breakdown.push({ category: '全敵同時攻撃', points: OHIGE_WEIGHTS.targetInc });
  }

  const atkSpeedMultMatch = allText.match(/(?:攻撃と)?攻撃速度(?:が|を)?(?:約)?(\d+(?:\.\d+)?)倍/);
  if (atkSpeedMultMatch) {
    rawScore += OHIGE_WEIGHTS.atkSpeed;
    breakdown.push({ category: '攻撃速度倍率', points: OHIGE_WEIGHTS.atkSpeed });
  } else if (/(?:攻撃と)?攻撃速度(?:が|を)?(?:約)?[^。低下]*?(?:\d+%)?(?:ずつ)?上昇|攻撃速度(?:が)?([\d\.]+)倍/.test(allText)) {
    rawScore += OHIGE_WEIGHTS.atkSpeed;
    breakdown.push({ category: '攻撃速度上昇', points: OHIGE_WEIGHTS.atkSpeed });
  }

  if (/攻撃後の隙(?:が)?(?:約)?(\d+)%短縮/.test(allText)) {
    rawScore += OHIGE_WEIGHTS.gapShort;
    breakdown.push({ category: '隙短縮', points: OHIGE_WEIGHTS.gapShort });
  }

  // 5. 防御無視・耐久割合削り
  if (/防御を?無視/.test(allText)) {
    rawScore += OHIGE_WEIGHTS.defIgnore;
    breakdown.push({ category: '防御無視', points: OHIGE_WEIGHTS.defIgnore });
  }
  if (!/(?:自身|対象)が(?:最大|現在)?耐久の(?:\d+)%の値のダメージを受ける/.test(allText) &&
      /現在耐久の(?:\d+)%|耐久が低い程.*?与えるダメージ|最大耐久の(?:\d+)%|割合(?:ダメージ|削り)/.test(allText)) {
    rawScore += OHIGE_WEIGHTS.hpPercentCut;
    breakdown.push({ category: '割合削り', points: OHIGE_WEIGHTS.hpPercentCut });
  }

  const scalingDmgMatch = allText.match(/[^。]*?程(?:与える)?ダメージ(?:が)?上昇(?:\(最大(?:約)?(\d+(?:\.\d+)?倍|\d+%)\))?[^。]*/);
  if (scalingDmgMatch) {
    const multMatch = scalingDmgMatch[0].match(/最大(?:約)?(\d+(?:\.\d+)?倍|\d+%)/);
    let multVal = 1.5;
    if (multMatch) {
      if (multMatch[1].endsWith("倍")) multVal = parseFloat(multMatch[1]);
      else if (multMatch[1].endsWith("%")) multVal = 1.0 + parseInt(multMatch[1], 10) / 100.0;
    }
    const pts = Math.min(OHIGE_WEIGHTS.dmgDealtTarget, (multVal - 1.0) * 12.0);
    rawScore += pts;
    breakdown.push({ category: '漸増与ダメ', points: pts, detail: `mult=${multVal}` });
  }

  const multMatches = allText.matchAll(/(?:(?:自身|自分|標的|対象|敵|特殊能力中|計略(?:中|使用時(?:に)?))[^。]*?与えるダメージ|特殊攻撃(?:で|の|時|時の範囲攻撃で)?(?:与える)?ダメージ|与ダメージ)(?:が|は)?(?:約)?([\d\.]+)倍/g);
  for (const mm of multMatches) {
    const m = parseFloat(mm[1]);
    if (m > 1.0) {
      const pts = Math.min(OHIGE_WEIGHTS.dmgDealtTarget, (m - 1.0) * 10.0);
      rawScore += pts;
      breakdown.push({ category: '与ダメ倍率', points: pts, detail: `${m}倍` });
    }
  }

  // 6. 配置自由度
  if (c.rangeKind === "遠近") {
    rawScore += OHIGE_WEIGHTS.bothRange;
    breakdown.push({ category: '遠近両用', points: OHIGE_WEIGHTS.bothRange });
  }
  if (c.attributes && c.attributes.length >= 2) {
    rawScore += OHIGE_WEIGHTS.multiAttr;
    breakdown.push({ category: '複合属性', points: OHIGE_WEIGHTS.multiAttr, detail: c.attributes.join('/') });
  }
  if (/全マス移動可能|配置(?:場所|マス)(?:を|の)?.*?に変更|全マス(?:に)?配置可能/.test(allText)) {
    rawScore += OHIGE_WEIGHTS.tileFlexibility;
    breakdown.push({ category: 'マス変更/全マス配置', points: OHIGE_WEIGHTS.tileFlexibility });
  }

  // 7. トークン
  const hasToken = /伏兵/.test(allText);
  if (hasToken) {
    if (/気|自然増加|再使用|巨大化|足止め|軽減|回復|無効化/.test(allText)) {
      rawScore += OHIGE_WEIGHTS.usefulToken;
      breakdown.push({ category: '実用伏兵', points: OHIGE_WEIGHTS.usefulToken });
    }
  }

  // 置くだけ味方支援
  const passiveTeamClause = skText.replace(/特殊能力中[^。]*?(?:。|$)/g, "");
  if (/(?:射程内の?城娘|全ての?城娘|全味方|味方).*?(?:攻撃|防御|与ダメージ).*?上昇/.test(passiveTeamClause)) {
    rawScore += OHIGE_WEIGHTS.passiveTeamBuff;
    breakdown.push({ category: '置くだけ味方支援', points: OHIGE_WEIGHTS.passiveTeamBuff });
  }

  // 攻撃倍率
  const isCharge = /溜め|チャージ|一撃|単発/.test(allText);
  const rawMultMatch = allText.match(/(?:攻撃(?:の|が)?|攻撃と(?:攻撃速度|与ダメージ)が)([\d\.]+)倍/);
  if (rawMultMatch) {
    const m = parseFloat(rawMultMatch[1]);
    const pts = (m - 1.0) * 5.0;
    const finalPts = isCharge ? Math.min(OHIGE_WEIGHTS.chargeCap * 0.5, pts) : Math.min(OHIGE_WEIGHTS.chargeCap, pts);
    rawScore += finalPts;
    breakdown.push({ category: '攻撃倍率', points: finalPts, detail: `${m}倍, isCharge=${isCharge}` });
  }

  if (/妖怪に対して|飛行敵に対して|水上|水マス/.test(allText)) {
    const discount = rawScore * (1 - OHIGE_WEIGHTS.conditionalDiscount);
    rawScore *= OHIGE_WEIGHTS.conditionalDiscount;
    breakdown.push({ category: '限定条件割引', points: -discount });
  }

  const rarePts = (c.rarity || 5) * 2.0;
  rawScore += rarePts;
  breakdown.push({ category: 'レアリティ', points: rarePts, detail: `★${c.rarity}` });

  return {
    rawScore,
    finalScore: Math.round(rawScore * 10) / 10,
    breakdown,
    skText,
    stText,
    spText
  };
}

const unmatchedPairs = [
  { weapon: '法術', actual1: '［毒禍］石山城', target1: '［学園］若桜鬼ヶ城', status: 'xfail (未一致・要件通り理由報告)' },
  { weapon: '本', actual1: '軍港 舞鶴', target1: '［活命］富山城', status: 'xfail (未一致・要件通り理由報告)' }
];

console.log('======================================================================');
console.log('未一致2件（法術・本）の内訳比較（スクリプト出力）');
console.log('======================================================================');

unmatchedPairs.forEach(p => {
  const c1 = window.SCRE_DATA.find(x => x.name === p.actual1);
  const c2 = window.SCRE_DATA.find(x => x.name === p.target1);
  console.log(`\n【${p.weapon}】 実測1位: ${p.actual1} vs 目標1位: ${p.target1} [${p.status}]`);
  const a1 = analyzeCastle(c1);
  const a2 = analyzeCastle(c2);

  console.log(`--- [実測1位] ${p.actual1} (合計: ${a1.finalScore}pt) ---`);
  a1.breakdown.forEach(b => console.log(`  +${b.points.toFixed(1)}pt : ${b.category}${b.detail ? ' (' + b.detail + ')' : ''}`));
  console.log(`--- [目標1位] ${p.target1} (合計: ${a2.finalScore}pt) ---`);
  a2.breakdown.forEach(b => console.log(`  +${b.points.toFixed(1)}pt : ${b.category}${b.detail ? ' (' + b.detail + ')' : ''}`));
});
