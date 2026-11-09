const fs = require('fs');
const path = require('path');

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

function measure() {
  const scores = window.computeOhigeScores(true);
  const targets = [
    { weapon: '大砲', target: ['［無疆］江戸城'] },
    { weapon: '槌', target: ['［夏］ガンジル宮殿'] },
    { weapon: '法術', target: ['［学園］若桜鬼ヶ城'] },
    { weapon: '祓串', target: ['［絢爛］久能山城'] },
    { weapon: '本', target: ['［活命］富山城'] },
    { weapon: '鞭', target: ['［夏］ルーヴル宮殿', '［ハロウィン］チャフティツェ城'] },
    { weapon: '投剣', target: ['［肝試し］千鳥城'] },
    { weapon: 'ランス', target: ['［暁星］大坂城'] },
    { weapon: '鈴', target: ['［燦華］聚楽第'] }
  ];

  let matchCount = 0;
  console.log('=== Q3武器種トップ9件 一致率測定 ===');
  targets.forEach(({ weapon, target }) => {
    const byWeapon = scores.filter(s => s.castle.weapon === weapon).sort((a, b) => b.ohigeScore - a.ohigeScore || b.castle.rare - a.castle.rare);
    const top1 = byWeapon[0];
    const targetItem = byWeapon.find(s => target.includes(s.castle.name));
    const targetRank = byWeapon.indexOf(targetItem) + 1;
    const isMatch = target.includes(top1.castle.name);
    if (isMatch) matchCount++;
    const mark = isMatch ? '○ 一致' : '× 不一致';
    console.log(`[${weapon}] ${mark}: 実測1位=${top1.castle.name} (${top1.ohigeScore.toFixed(1)}pt) | 目標=${target.join(' / ')} (実測${targetRank}位, ${targetItem ? targetItem.ohigeScore.toFixed(1) : 'N/A'}pt)`);
  });
  console.log(`\n合計一致数: ${matchCount} / ${targets.length} (${(matchCount / targets.length * 100).toFixed(1)}%)`);
}

measure();
