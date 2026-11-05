// Main Application Logic (Wide PC Optimized with Presets, Reverse Filter, Terrain Sim, & Canvas Export)
(function () {
  const STORAGE_KEY_V1 = "scre-helper:party:v1";
  const PRESETS_STORAGE_KEY = "scre-helper:presets:v2";
  const TERRAIN_STORAGE_KEY = "scre-helper:terrain:v1";

  // State: Presets 1 to 5
  let partyPresets = [
    {
      name: "部隊1 (汎用)",
      party: [
        { id: "崑崙", strategyOn: true, specialOn: false },
        { id: "小早川城", strategyOn: true, specialOn: false },
        { id: "［漆磊］広島城", strategyOn: true, specialOn: true },
        { id: "［無疆］江戸城", strategyOn: true, specialOn: true },
        { id: "［球陽］首里城", strategyOn: true, specialOn: true },
        { id: "［お月見］鹿野城", strategyOn: true, specialOn: false },
        { id: "［裏］松代城", strategyOn: true, specialOn: false },
        { id: "逸見エリカ", strategyOn: true, specialOn: true }
      ]
    },
    { name: "部隊2 (平属性)", party: [] },
    { name: "部隊3 (山属性)", party: [] },
    { name: "部隊4 (水属性)", party: [] },
    { name: "部隊5 (地獄用)", party: [] }
  ];

  let currentPresetIdx = 0;
  let currentTerrain = "";
  let selectingSlotIndex = null;

  // Load Presets & Terrain
  try {
    const savedPresets = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (savedPresets) {
      const parsed = JSON.parse(savedPresets);
      if (Array.isArray(parsed) && parsed.length >= 5) {
        partyPresets = parsed;
      }
    } else {
      // Migrate from v1
      const oldV1 = localStorage.getItem(STORAGE_KEY_V1);
      if (oldV1) {
        partyPresets[0].party = JSON.parse(oldV1);
      }
    }
    const savedIdx = localStorage.getItem("scre-helper:activePresetIdx");
    if (savedIdx !== null) {
      currentPresetIdx = parseInt(savedIdx, 10) || 0;
    }
    const savedTerrain = localStorage.getItem(TERRAIN_STORAGE_KEY);
    if (savedTerrain !== null) {
      currentTerrain = savedTerrain;
    }
  } catch (e) {
    console.warn("Storage load error:", e);
  }

  // Active party pointer
  let party = partyPresets[currentPresetIdx].party;

  function saveParty() {
    partyPresets[currentPresetIdx].party = party;
    savePresets();
  }

  function savePresets() {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(partyPresets));
      localStorage.setItem("scre-helper:activePresetIdx", String(currentPresetIdx));
      localStorage.setItem(TERRAIN_STORAGE_KEY, currentTerrain);
    } catch (e) {
      console.warn("Presets save error:", e);
    }
  }

  // ==========================================
  // Ownership & Favorites Management (Feature 1)
  // ==========================================
  const OWNERSHIP_STORAGE_KEY = "scre-helper:ownership:v1";
  let ownership = {
    owned: new Set(),
    favorites: new Set()
  };

  function loadOwnership() {
    try {
      const saved = localStorage.getItem(OWNERSHIP_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.owned)) ownership.owned = new Set(parsed.owned);
        if (Array.isArray(parsed.favorites)) ownership.favorites = new Set(parsed.favorites);
      }
    } catch (e) {
      console.warn("Ownership load error:", e);
    }
    updateOwnershipUI();
  }

  function saveOwnership() {
    try {
      const data = {
        owned: Array.from(ownership.owned),
        favorites: Array.from(ownership.favorites)
      };
      localStorage.setItem(OWNERSHIP_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Ownership save error:", e);
    }
    updateOwnershipUI();
  }

  function updateOwnershipUI() {
    const countEl = document.getElementById("ownershipCount");
    if (countEl) countEl.textContent = ownership.owned.size.toLocaleString();
    const favEl = document.getElementById("favoritesCount");
    if (favEl) favEl.textContent = ownership.favorites.size.toLocaleString();
    const totalEl = document.getElementById("ownershipTotal");
    if (totalEl && window.SCRE_DATA) totalEl.textContent = window.SCRE_DATA.length.toLocaleString();
  }

  function toggleOwned(castleId) {
    if (ownership.owned.has(castleId)) {
      ownership.owned.delete(castleId);
    } else {
      ownership.owned.add(castleId);
    }
    saveOwnership();
    renderAllCastles();
    if (activeDetailCastleId === castleId) {
      const c = getCastleById(castleId);
      if (c) updateModalDetailOwnershipUI(c);
    }
  }

  function toggleFavorite(castleId) {
    if (ownership.favorites.has(castleId)) {
      ownership.favorites.delete(castleId);
    } else {
      ownership.favorites.add(castleId);
    }
    saveOwnership();
    renderAllCastles();
    if (activeDetailCastleId === castleId) {
      const c = getCastleById(castleId);
      if (c) updateModalDetailOwnershipUI(c);
    }
  }

  // Toast Notification Helper
  function showNotification(msg, isWarning = false) {
    let toast = document.querySelector(".toast-notification");
    if (toast) toast.remove();
    toast = document.createElement("div");
    toast.className = "toast-notification" + (isWarning ? " toast-warning" : "");
    toast.innerHTML = `<span>${isWarning ? '⚠️' : '✓'}</span><span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, isWarning ? 4200 : 2800);
  }

  function switchPreset(idx) {
    if (idx < 0 || idx >= partyPresets.length) return;
    currentPresetIdx = idx;
    if (!Array.isArray(partyPresets[currentPresetIdx].party)) {
      partyPresets[currentPresetIdx].party = [];
    }
    party = partyPresets[currentPresetIdx].party;
    console.log("switchPreset to:", idx, "party length:", party.length);
    savePresets();
    renderPresetBar();
    renderDashboard();
    renderAllCastles();
  }

  function renameCurrentPreset() {
    const currentName = partyPresets[currentPresetIdx].name;
    const newName = prompt("部隊プリセットの名前を変更してください:", currentName);
    if (newName && newName.trim()) {
      partyPresets[currentPresetIdx].name = newName.trim();
      savePresets();
      renderPresetBar();
    }
  }

  function renderPresetBar() {
    const container = document.getElementById("presetButtonsList");
    if (!container) return;
    container.innerHTML = "";
    partyPresets.forEach((p, idx) => {
      const btn = document.createElement("button");
      btn.className = `preset-tab-btn ${idx === currentPresetIdx ? 'active' : ''}`;
      btn.setAttribute("data-preset-idx", String(idx));
      btn.textContent = p.name;
      btn.title = `部隊 ${idx + 1} (${p.party.length}/8 体)`;
      container.appendChild(btn);
    });
  }

  const presetContainer = document.getElementById("presetButtonsList");
  if (presetContainer) {
    presetContainer.addEventListener("click", e => {
      const btn = e.target.closest(".preset-tab-btn");
      if (btn) {
        const idx = parseInt(btn.getAttribute("data-preset-idx"), 10);
        if (!isNaN(idx)) {
          switchPreset(idx);
        }
      }
    });
  }

  function getCastleById(id) {
    return window.SCRE_DATA.find(c => c.id === id || c.name === id) || null;
  }

  function getAttrBadgeHtml(castle) {
    if (!castle) return '';
    const sub = castle.subType || castle.castleType || '無';
    let badgeClass = `badge-${castle.castleType || '無'}`;
    
    if (sub === '平/水') badgeClass = 'badge-attr-plain-water';
    else if (sub === '山/水') badgeClass = 'badge-attr-mtn-water';
    else if (sub === '平山/水') badgeClass = 'badge-attr-plainmtn-water';
    else if (sub === '平/山') badgeClass = 'badge-attr-plain-mtn';
    else if (sub === '平山/山') badgeClass = 'badge-attr-plainmtn-mtn';
    else if (sub === '地獄/平') badgeClass = 'badge-attr-hell-plain';
    else if (sub === '地獄/平山') badgeClass = 'badge-attr-hell-plainmtn';
    else if (sub === '地獄/山') badgeClass = 'badge-attr-hell-mtn';
    else if (sub === '地獄/水') badgeClass = 'badge-attr-hell-water';
    else if (sub === '地獄/無') badgeClass = 'badge-attr-hell-none';

    return `<span class="badge ${badgeClass}" style="text-shadow:0 1px 2px rgba(0,0,0,0.7);font-weight:bold;">${sub}</span>`;
  }

  function getIconHtml(castle, size = 36) {
    if (!castle) return `<div class="weapon-icon-badge" style="width:${size}px;height:${size}px;">城</div>`;
    const safeName = castle.name.replace(/[\\/:*?"<>|]/g, "_");
    const iconSrc = `icons/${encodeURIComponent(safeName)}.png`;
    const typeClass = castle.castleType || "無";
    const initial = castle.weapon ? castle.weapon[0] : (castle.name[0] || "城");
    const sub = castle.subType || typeClass;
    let badgeClass = `type-tag ${typeClass}`;
    if (sub === '平/水') badgeClass = 'type-tag badge-attr-plain-water';
    else if (sub === '山/水') badgeClass = 'type-tag badge-attr-mtn-water';
    else if (sub === '平山/水') badgeClass = 'type-tag badge-attr-plainmtn-water';
    else if (sub === '平/山') badgeClass = 'type-tag badge-attr-plain-mtn';
    else if (sub === '地獄/平') badgeClass = 'type-tag badge-attr-hell-plain';

    return `
      <div class="weapon-icon-badge" style="width:${size}px;height:${size}px;">
        <img class="castle-icon-img" src="${iconSrc}" alt="${castle.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <span style="display:none; font-size:${Math.round(size * 0.45)}px;">${initial}</span>
        <span class="${badgeClass}">${typeClass}</span>
      </div>
    `;
  }

  // ==========================================
  // Calculation Engine
  // ==========================================
  function calculateBuffs(targetParty = party, targetTerrain = currentTerrain) {
    const activePartyMembers = targetParty.map(slot => {
      const castle = getCastleById(slot.id);
      return { slot, castle };
    }).filter(x => x.castle !== null);

    const perCastle = {};
    const enemyDebuffs = {
      enemyDefDown: { max: 0, sources: [] },
      enemyAtkDown: { max: 0, sources: [] },
      enemySlow: { max: 0, sources: [] },
      enemyDmgTakenUp: { max: 0, sources: [] }
    };

    activePartyMembers.forEach(({ slot, castle }) => {
      perCastle[castle.id] = {
        castle,
        slot,
        buffs: {
          atkPercent: { max: 0, stackSum: 0, sources: [] },
          atkFlat: { sum: 0, items: [] },
          defPercent: { max: 0, stackSum: 0, sources: [] },
          defFlat: { sum: 0, items: [] },
          rangePercent: { max: 0, stackSum: 0, sources: [] },
          rangeFlat: { sum: 0, items: [] },
          hpPercent: { max: 0, stackSum: 0, sources: [] },
          hpFlat: { sum: 0, items: [] },
          recoveryFlat: { sum: 0, items: [] },
          dmgDealt: { max: 0, stackSum: 0, sources: [] },
          dmgDealtTarget: { max: 0, stackSum: 0, sources: [] },
          dmgTakenDown: { max: 0, stackSum: 0, sources: [] },
          atkSpeed: { max: 0, stackSum: 0, sources: [] },
          gapShorten: { max: 0, stackSum: 0, sources: [] },
          defIgnore: [],
          shares: [] // array of { stat, shareSource, value, raw, shareVal }
        },
        calculatedStats: {} // Will hold live dynamic stats
      };
    });

    // 1st Pass: Gather all basic buffs/debuffs
    activePartyMembers.forEach(({ slot, castle: provider }) => {
      const effectSources = [];
      if (provider.skill) {
        effectSources.push(...provider.skill.effects.map(e => ({ ...e, from: provider.name, type: "特技" })));
      }
      if (slot.strategyOn && provider.strategy) {
        effectSources.push(...provider.strategy.effects.map(e => ({ ...e, from: provider.name, type: "計略" })));
      }
      if (slot.specialOn && provider.special) {
        effectSources.push(...provider.special.effects.map(e => ({ ...e, from: provider.name, type: "特殊能力" })));
      }

      effectSources.forEach(effect => {
        if (effect.stat.startsWith("enemy")) {
          const deb = enemyDebuffs[effect.stat];
          if (deb) {
            deb.sources.push({ from: effect.from, type: effect.type, val: effect.value, raw: effect.raw });
            if (effect.value > deb.max) deb.max = effect.value;
          }
          return;
        }

        activePartyMembers.forEach(({ castle: receiver }) => {
          const targetCastle = perCastle[receiver.id];
          const isSelf = receiver.id === provider.id;

          if (effect.target === "self" && !isSelf) return;

          const b = targetCastle.buffs;

          if (effect.mode === "share") {
            b.shares.push({
              stat: effect.stat,
              shareSource: effect.shareSource || effect.from,
              value: effect.value,
              raw: effect.raw
            });
          } else if (effect.mode === "flat") {
            const bucket = b[effect.stat];
            if (bucket && typeof bucket.sum === "number") {
              bucket.sum += effect.value;
              bucket.items.push({ from: effect.from, type: effect.type, val: effect.value, raw: effect.raw });
            }
          } else if (effect.mode === "percent") {
            const bucket = b[effect.stat];
            if (bucket && typeof bucket.max === "number") {
              bucket.sources.push({ from: effect.from, type: effect.type, val: effect.value, stackable: effect.stackable, isSelf, raw: effect.raw });
              if (effect.stackable) {
                bucket.stackSum += effect.value;
              } else if (effect.value > bucket.max) {
                bucket.max = effect.value;
              }
            }
          } else if (effect.stat === "defIgnore") {
            b.defIgnore.push(effect.raw);
          }
        });
      });
    });

    // 2nd Pass: Calculate dynamic effective values (Real Stat = Base * (1 + Perc/100) + Flat + Shares)
    activePartyMembers.forEach(({ castle }) => {
      const data = perCastle[castle.id];
      const b = data.buffs;
      const base = castle.stats.giant5;

      const atkPerc = (b.atkPercent.max + b.atkPercent.stackSum) / 100;
      const defPerc = (b.defPercent.max + b.defPercent.stackSum) / 100;
      const rangePerc = (b.rangePercent.max + b.rangePercent.stackSum) / 100;
      const hpPerc = (b.hpPercent.max + b.hpPercent.stackSum) / 100;

      // Share bonuses (from鼓舞 etc.)
      let shareAtk = 0;
      let shareDef = 0;
      let shareRange = 0;
      b.shares.forEach(sh => {
        const prov = getCastleById(sh.shareSource);
        if (prov && prov.stats && prov.stats.giant5) {
          const provBase = prov.stats.giant5;
          if (sh.stat === "shareAtk") shareAtk += Math.floor(provBase.atk * (sh.value / 100));
          if (sh.stat === "shareDef") shareDef += Math.floor(provBase.def * (sh.value / 100));
          if (sh.stat === "shareRange") shareRange += Math.floor(provBase.range * (sh.value / 100));
        }
      });

      // Terrain matching check
      const isTerrainMatch = Boolean(targetTerrain && castle.attributes && castle.attributes.includes(targetTerrain));
      const terrainMult = isTerrainMatch ? 1.25 : 1.0;

      const effectiveAtk = Math.floor((base.atk * terrainMult) * (1 + atkPerc) + b.atkFlat.sum + shareAtk);
      const effectiveDef = Math.floor((base.def * terrainMult) * (1 + defPerc) + b.defFlat.sum + shareDef);
      const effectiveRange = Math.floor(base.range * (1 + rangePerc) + b.rangeFlat.sum + shareRange);
      const effectiveHp = Math.floor((base.hp * terrainMult) * (1 + hpPerc) + b.hpFlat.sum);

      // Single hit damage estimation: Atk * (1 + dmgDealt) * (1 + dmgTarget)
      const dmgDealtPerc = (b.dmgDealt.max + b.dmgDealt.stackSum) / 100;
      const dmgTargetPerc = (b.dmgDealtTarget.max + b.dmgDealtTarget.stackSum) / 100;
      const singleHitEstimate = Math.floor(effectiveAtk * (1 + dmgDealtPerc) * (1 + dmgTargetPerc));

      // Cost calculation
      const deployCost = castle.cost || 10;
      let giantCost = 100;
      if (castle.statsDetail && castle.statsDetail.giant5 && castle.statsDetail.giant5.cost) {
        giantCost = parseInt(castle.statsDetail.giant5.cost, 10) || (deployCost * 8);
      } else {
        giantCost = deployCost * 8;
      }
      const actualGiantCost = isTerrainMatch ? Math.round(deployCost + (giantCost - deployCost) * 0.65) : giantCost;

      data.calculatedStats = {
        atk: effectiveAtk,
        def: effectiveDef,
        range: effectiveRange,
        hp: effectiveHp,
        singleHit: singleHitEstimate,
        diffAtk: effectiveAtk - base.atk,
        diffDef: effectiveDef - base.def,
        diffRange: effectiveRange - base.range,
        diffHp: effectiveHp - base.hp,
        isTerrainMatch,
        deployCost,
        actualGiantCost
      };
    });

    let totalDeployCost = 0;
    let totalGiantCost = 0;
    let matchCount = 0;
    for (const cid in perCastle) {
      const cs = perCastle[cid].calculatedStats;
      if (cs) {
        totalDeployCost += cs.deployCost;
        totalGiantCost += cs.actualGiantCost;
        if (cs.isTerrainMatch) matchCount++;
      }
    }

    return { perCastle, enemyDebuffs, activePartyMembers, totalDeployCost, totalGiantCost, matchCount, terrainMatchCount: matchCount, currentTerrain: targetTerrain };
  }

  // ==========================================
  // UI Renderers
  // ==========================================

  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");

      if (targetId === "tab-dashboard") renderDashboard();
      if (targetId === "tab-guides") renderGuidesTab();
      if (targetId === "tab-special") renderSpecialTab();
      if (targetId === "tab-list") renderAllCastles();
    });
  });

  function renderDashboard() {
    const calcResult = calculateBuffs();
    renderPartyTab(calcResult);
    renderBuffGrid(calcResult);
    renderMissingSidebar(calcResult);
    const simBody = document.getElementById("giantizeSimBody");
    if (simBody && simBody.style.display !== "none") {
      calculateGiantizeSimulation();
    }
  }

  // 1. Render Party Slots (Showing dynamic live stats & Terrain Matching)
  function renderPartyTab(calcResult) {
    const listEl = document.getElementById("partySlotList");
    listEl.innerHTML = "";
    document.getElementById("partyCounter").textContent = `編成 ${party.length}/8`;

    // Render Total Cost Summary
    const costSummaryEl = document.getElementById("totalCostSummary");
    if (costSummaryEl) {
      if (calcResult.activePartyMembers.length === 0) {
        costSummaryEl.innerHTML = `総消費気: <strong>0</strong> 気`;
      } else {
        const terrainText = currentTerrain ? ` (${currentTerrain}一致: ${calcResult.matchCount}/${calcResult.activePartyMembers.length}体)` : '';
        costSummaryEl.innerHTML = `総消費気: <strong>${calcResult.totalGiantCost}</strong> 気 <small style="color:var(--text-sub);">(配置: ${calcResult.totalDeployCost}気${terrainText})</small>`;
      }
    }

    // Update Terrain Select UI
    const terrainSel = document.getElementById("mapTerrainSelect");
    if (terrainSel && terrainSel.value !== currentTerrain) {
      terrainSel.value = currentTerrain;
    }

    for (let i = 0; i < 8; i++) {
      const slot = party[i];
      const card = document.createElement("div");

      if (slot) {
        const castle = getCastleById(slot.id);
        card.className = "party-card";
        const typeClass = castle ? castle.castleType : "無";
        const weaponInitial = castle && castle.weapon ? castle.weapon[0] : "城";

        let subInfo = "";
        if (castle) {
          const calc = calcResult && calcResult.perCastle[castle.id] ? calcResult.perCastle[castle.id].calculatedStats : null;
          const attrStr = castle.subType || castle.castleType;
          const matchBadge = (calc && calc.isTerrainMatch) ? `<span class="badge" style="background:#2c6f4f;color:#fff;font-size:9.5px;padding:1px 4px;margin-left:3px;" title="出撃地形一致: 巨大化消費気35%減＆合戦ステータス1.25倍">✓一致</span>` : '';
          if (calc) {
            subInfo = `★${castle.rarity} [${attrStr}]${matchBadge}・攻<strong style="color:var(--buff-color);">${calc.atk}</strong>・1撃<strong style="color:var(--buff-color);">${calc.singleHit}</strong>`;
          } else {
            subInfo = `★${castle.rarity} [${attrStr}]・攻${castle.stats.giant5.atk}・1撃${castle.stats.giant5.singleHit || '-'}`;
          }
        }

        card.innerHTML = `
          ${getIconHtml(castle, 38)}
          <div class="party-info">
            <div class="castle-name" data-id="${slot.id}">${slot.id}</div>
            <div class="castle-subinfo">
              ${subInfo}
            </div>
          </div>
          <div class="party-actions">
            ${castle && castle.strategy ? `
              <button class="btn-toggle ${slot.strategyOn ? 'active' : ''}" data-action="toggle-strat" data-index="${i}">
                計略 ${slot.strategyOn ? 'ON' : 'OFF'}
              </button>
            ` : ''}
            ${castle && castle.special ? `
              <button class="btn-toggle ${slot.specialOn ? 'active' : ''}" data-action="toggle-special" data-index="${i}">
                特殊 ${slot.specialOn ? 'ON' : 'OFF'}
              </button>
            ` : ''}
            <button class="btn-remove" data-action="remove" data-index="${i}">&times;</button>
          </div>
        `;
      } else {
        card.className = "party-card empty";
        card.innerHTML = `+ 空き枠 (クリックして城娘を選択)`;
        card.addEventListener("click", () => openCastleSelector(i));
      }
      listEl.appendChild(card);
    }
  }

  // 2. Render Buff Calculation Grid (Showing Base -> Live Dynamic Stats)
  let breakdownCounter = 0;

  function renderBuffGrid(calcResult) {
    const container = document.getElementById("buffCalculatedList");
    container.innerHTML = "";

    const debuffContainer = document.getElementById("enemyDebuffContainer");
    debuffContainer.innerHTML = "";

    const { perCastle, enemyDebuffs, activePartyMembers } = calcResult || calculateBuffs();

    if (activePartyMembers.length === 0) {
      container.innerHTML = `<div class="banner-notice" style="grid-column: 1 / -1;">編成に城娘を追加してください。</div>`;
      return;
    }

    // Unified row rendering helpers
    function renderPercentRow(label, bucket, uid) {
      if (!bucket) return "";
      const total = bucket.max + bucket.stackSum;
      if (total <= 0 && (!bucket.sources || bucket.sources.length === 0)) return "";
      const count = (bucket.sources || []).length;
      const isMixed = bucket.max > 0 && bucket.stackSum > 0;
      const modeText = isMixed ? `最大値+加算 (${count}件)` : (bucket.stackSum > 0 ? `加算合計 (${count}件)` : `最大値採用 (${count}件)`);
      const bdId = `bd-${uid}-${++breakdownCounter}`;

      let maxFound = false;
      const itemsHtml = (bucket.sources || []).map(s => {
        let tag = "";
        let style = "";
        if (s.stackable) {
          tag = "[加算]";
          style = "color:var(--buff-color); font-weight:bold;";
        } else if (s.val === bucket.max && !maxFound) {
          tag = "[最大値適用]";
          style = "color:var(--buff-color); font-weight:bold;";
          maxFound = true;
        } else {
          tag = "[未適用]";
          style = "color:var(--text-muted);";
        }
        return `<div style="margin-bottom:2px;"><span style="${style}">${tag} +${s.val}%</span>: <strong>${s.from}</strong> [${s.type}] <span style="color:#666;">(${s.raw})</span></div>`;
      }).join("");

      return `
        <div class="buff-row">
          <span class="buff-label">${label}</span>
          <span class="buff-val-pos">+${total}%</span>
          <span class="buff-desc">${modeText}</span>
          <span class="breakdown-toggle" onclick="document.getElementById('${bdId}').classList.toggle('open')">内訳▾</span>
        </div>
        <div class="breakdown-list" id="${bdId}">
          ${itemsHtml}
        </div>
      `;
    }

    function renderFlatRow(label, bucket, uid, unit = "") {
      if (!bucket) return "";
      if (bucket.sum <= 0 && (!bucket.items || bucket.items.length === 0)) return "";
      const count = (bucket.items || []).length;
      const bdId = `bd-${uid}-${++breakdownCounter}`;

      const itemsHtml = (bucket.items || []).map(it => {
        return `<div style="margin-bottom:2px;"><span style="color:var(--buff-color); font-weight:bold;">[加算] +${it.val}${unit}</span>: <strong>${it.from}</strong> [${it.type}] <span style="color:#666;">(${it.raw})</span></div>`;
      }).join("");

      return `
        <div class="buff-row">
          <span class="buff-label">${label}</span>
          <span class="buff-val-pos">+${bucket.sum}${unit}</span>
          <span class="buff-desc">加算合計 (${count}件)</span>
          <span class="breakdown-toggle" onclick="document.getElementById('${bdId}').classList.toggle('open')">内訳▾</span>
        </div>
        <div class="breakdown-list" id="${bdId}">
          ${itemsHtml}
        </div>
      `;
    }

    function renderShareRow(shares, uid) {
      if (!shares || shares.length === 0) return "";
      const bdId = `bd-${uid}-${++breakdownCounter}`;
      const itemsHtml = shares.map(sh => {
        const statName = sh.stat === 'shareAtk' ? '攻撃' : sh.stat === 'shareDef' ? '防御' : '射程';
        return `<div style="margin-bottom:2px;"><span style="color:var(--share-color); font-weight:bold;">[共有加算]</span>: <strong>${sh.shareSource}</strong>の${statName}の${sh.value}% <span style="color:#666;">(${sh.raw})</span></div>`;
      }).join("");

      return `
        <div class="buff-row">
          <span class="buff-label">共有</span>
          <span class="buff-val-share">${shares.length}件</span>
          <span class="buff-desc">鼓舞・共有効果</span>
          <span class="breakdown-toggle" onclick="document.getElementById('${bdId}').classList.toggle('open')">内訳▾</span>
        </div>
        <div class="breakdown-list" id="${bdId}">
          ${itemsHtml}
        </div>
      `;
    }

    function renderDefIgnoreRow(defIgnore, uid) {
      if (!defIgnore || defIgnore.length === 0) return "";
      const bdId = `bd-${uid}-${++breakdownCounter}`;
      const itemsHtml = defIgnore.map(raw => {
        return `<div style="margin-bottom:2px;"><span style="color:var(--buff-color); font-weight:bold;">[防御無視]</span> <span style="color:#666;">${raw}</span></div>`;
      }).join("");

      return `
        <div class="buff-row">
          <span class="buff-label">防御無視</span>
          <span class="buff-val-pos">発動中</span>
          <span class="buff-desc">効果適用中 (${defIgnore.length}件)</span>
          <span class="breakdown-toggle" onclick="document.getElementById('${bdId}').classList.toggle('open')">内訳▾</span>
        </div>
        <div class="breakdown-list" id="${bdId}">
          ${itemsHtml}
        </div>
      `;
    }

    function renderDebuffRow(label, bucket, uid, sign = "-") {
      if (!bucket) return "";
      if (bucket.max <= 0 && (!bucket.sources || bucket.sources.length === 0)) return "";
      const count = (bucket.sources || []).length;
      const bdId = `bd-${uid}-${++breakdownCounter}`;

      let maxFound = false;
      const itemsHtml = (bucket.sources || []).map(s => {
        let tag = "";
        let style = "";
        if (s.val === bucket.max && !maxFound) {
          tag = "[最大値適用]";
          style = "color:var(--debuff-color); font-weight:bold;";
          maxFound = true;
        } else {
          tag = "[未適用]";
          style = "color:var(--text-muted);";
        }
        return `<div style="margin-bottom:2px;"><span style="${style}">${tag} ${sign}${s.val}%</span>: <strong>${s.from}</strong> [${s.type}] <span style="color:#666;">(${s.raw})</span></div>`;
      }).join("");

      return `
        <div class="buff-row">
          <span class="buff-label">${label}</span>
          <span class="buff-val-neg">${sign}${bucket.max}%</span>
          <span class="buff-desc">最大値採用 (${count}件)</span>
          <span class="breakdown-toggle" onclick="document.getElementById('${bdId}').classList.toggle('open')">内訳▾</span>
        </div>
        <div class="breakdown-list" id="${bdId}">
          ${itemsHtml}
        </div>
      `;
    }

    activePartyMembers.forEach(({ castle }) => {
      const data = perCastle[castle.id];
      const b = data.buffs;
      const base = castle.stats.giant5;
      const calc = data.calculatedStats;

      const card = document.createElement("div");
      card.className = "buff-card";

      let rowsHtml = "";
      const uid = castle.id.replace(/[^a-zA-Z0-9]/g, '') || `c${Math.random().toString(36).substr(2, 4)}`;

      // 1. 攻撃(%) & 攻撃(固定値) & ステータス共有
      rowsHtml += renderPercentRow("攻撃(%)", b.atkPercent, uid);
      rowsHtml += renderFlatRow("攻撃固定", b.atkFlat, uid);
      rowsHtml += renderShareRow(b.shares, uid);

      // 2. 防御(%) & 防御(固定値)
      rowsHtml += renderPercentRow("防御(%)", b.defPercent, uid);
      rowsHtml += renderFlatRow("防御固定", b.defFlat, uid);

      // 3. 耐久(%) & 耐久(固定値)
      rowsHtml += renderPercentRow("耐久(%)", b.hpPercent, uid);
      rowsHtml += renderFlatRow("耐久固定", b.hpFlat, uid);

      // 4. 回復(固定値)
      rowsHtml += renderFlatRow("回復固定", b.recoveryFlat, uid);

      // 5. 射程(%) & 射程(固定値)
      rowsHtml += renderPercentRow("射程(%)", b.rangePercent, uid);
      rowsHtml += renderFlatRow("射程固定", b.rangeFlat, uid);

      // 6. 与ダメージ & 与えるダメージ
      rowsHtml += renderPercentRow("与ダメ", b.dmgDealt, uid);
      rowsHtml += renderPercentRow("与えるダメ", b.dmgDealtTarget, uid);

      // 7. 速度 & 隙短縮
      rowsHtml += renderPercentRow("攻撃速度", b.atkSpeed, uid);
      rowsHtml += renderPercentRow("隙短縮", b.gapShorten, uid);

      // 8. 被ダメ軽減 & 防御無視
      rowsHtml += renderPercentRow("被ダメ軽減", b.dmgTakenDown, uid);
      rowsHtml += renderDefIgnoreRow(b.defIgnore, uid);

      card.innerHTML = `
        <div class="buff-header">
          <strong style="font-size: 14px;">${castle.name}</strong>
          <span style="font-size: 11px; color: var(--text-sub);">[${castle.subType || castle.castleType}] ★${castle.rarity}・${castle.weapon}</span>
        </div>
        <div class="buff-stats-summary">
          <span>攻 <strong>${calc.atk}</strong> <small style="color:var(--text-muted);font-weight:normal;">(${base.atk})</small></span>
          <span>防 <strong>${calc.def}</strong> <small style="color:var(--text-muted);font-weight:normal;">(${base.def})</small></span>
          <span>耐 <strong>${calc.hp}</strong> <small style="color:var(--text-muted);font-weight:normal;">(${base.hp})</small></span>
          <span>射 <strong>${calc.range}</strong> <small style="color:var(--text-muted);font-weight:normal;">(${base.range})</small></span>
          <span>1撃 <strong style="color:var(--buff-color);">${calc.singleHit}</strong></span>
        </div>
        <div class="buff-details">
          ${rowsHtml || '<div style="color:var(--text-muted);font-size:11px;">受けているバフはありません</div>'}
        </div>
      `;
      container.appendChild(card);
    });

    // Enemy Debuff Summary
    const debCard = document.createElement("div");
    debCard.className = "section-box";
    debCard.style.borderLeft = "4px solid var(--debuff-color)";
    debCard.style.marginTop = "10px";

    let debRows = "";
    debRows += renderDebuffRow("敵防御", enemyDebuffs.enemyDefDown, "deb-def", "-");
    debRows += renderDebuffRow("敵攻撃", enemyDebuffs.enemyAtkDown, "deb-atk", "-");
    debRows += renderDebuffRow("敵移動", enemyDebuffs.enemySlow, "deb-slow", "-");
    debRows += renderDebuffRow("敵被ダメ", enemyDebuffs.enemyDmgTakenUp, "deb-dmg", "+");

    debCard.innerHTML = `
      <div class="section-title" style="color: var(--debuff-color); margin-bottom: 6px;">敵へのデバフ一覧</div>
      <div class="buff-details">
        ${debRows || '<div style="color:var(--text-muted);font-size:11px;">敵へのデバフはありません</div>'}
      </div>
    `;
    debuffContainer.appendChild(debCard);
  }

  // 3. Render Missing and Candidates (Sidebar)
  function renderMissingSidebar(calcResult) {
    const container = document.getElementById("missingChecklist");
    container.innerHTML = "";

    const { perCastle, enemyDebuffs } = calcResult || calculateBuffs();
    const checklist = window.SCRE_RULES.checklist;
    const currentPartyIds = new Set(party.map(p => p.id));

    checklist.forEach(item => {
      let isCovered = false;

      if (item.key.startsWith("enemy")) {
        isCovered = enemyDebuffs[item.key] && enemyDebuffs[item.key].max > 0;
      } else {
        for (const cid in perCastle) {
          const b = perCastle[cid].buffs;
          if (item.key === "atkFlat" && b.atkFlat.sum > 0) isCovered = true;
          else if (item.key === "rangeFlat" && b.rangeFlat.sum > 0) isCovered = true;
          else if (item.key === "defIgnore" && b.defIgnore.length > 0) isCovered = true;
          else if (b[item.key] && (b[item.key].max > 0 || b[item.key].stackSum > 0)) isCovered = true;
        }
      }

      const candidates = window.SCRE_DATA.filter(c => {
        if (currentPartyIds.has(c.id)) return false;
        const allEffects = [];
        if (c.skill) allEffects.push(...c.skill.effects);
        if (c.strategy) allEffects.push(...c.strategy.effects);
        if (c.special) allEffects.push(...c.special.effects);
        return allEffects.some(e => e.stat === item.key);
      }).slice(0, 8);

      const checkEl = document.createElement("div");
      checkEl.className = "checklist-card";
      checkEl.innerHTML = `
        <div class="check-item">
          <strong>${item.label}</strong>
          <span class="badge-status ${isCovered ? 'badge-ok' : 'badge-missing'}">
            ${isCovered ? '○ カバー中' : '✕ 未編成'}
          </span>
        </div>
        ${!isCovered && candidates.length > 0 ? `
          <div class="candidate-list">
            候補城娘:
            <div>
              ${candidates.map(cand => `<span class="candidate-chip" data-id="${cand.id}">+ ${cand.name}</span>`).join("")}
            </div>
          </div>
        ` : ''}
      `;
      container.appendChild(checkEl);
    });
  }

  // Handle party slots click
  document.getElementById("partySlotList").addEventListener("click", e => {
    const action = e.target.getAttribute("data-action");
    const index = parseInt(e.target.getAttribute("data-index"), 10);

    if (action === "toggle-strat") {
      party[index].strategyOn = !party[index].strategyOn;
      saveParty();
      renderDashboard();
    } else if (action === "toggle-special") {
      party[index].specialOn = !party[index].specialOn;
      saveParty();
      renderDashboard();
    } else if (action === "remove") {
      party.splice(index, 1);
      saveParty();
      renderDashboard();
    } else if (e.target.classList.contains("castle-name")) {
      const id = e.target.getAttribute("data-id");
      openCastleDetail(id);
    }
  });

  document.getElementById("missingChecklist").addEventListener("click", e => {
    if (e.target.classList.contains("candidate-chip")) {
      const id = e.target.getAttribute("data-id");
      if (party.length >= 8) {
        alert("編成枠がいっぱいです(最大8体)。");
        return;
      }
      party.push({ id, strategyOn: true, specialOn: false });
      saveParty();
      renderDashboard();
    }
  });

  // Empty party
  document.getElementById("btnEmptyParty").addEventListener("click", () => {
    if (confirm("現在の部隊を空にしますか？")) {
      party = [];
      saveParty();
      renderDashboard();
      renderAllCastles();
    }
  });

  // Terrain select change
  document.getElementById("mapTerrainSelect").addEventListener("change", e => {
    currentTerrain = e.target.value;
    savePresets();
    renderDashboard();
    renderAllCastles();
  });

  // Populate Dashboard Stage Select from guides
  function populateDashboardStageSelect() {
    const sel = document.getElementById("dashboardStageSelect");
    if (!sel || !window.SCRE_GUIDES || !Array.isArray(window.SCRE_GUIDES)) return;
    sel.innerHTML = '<option value="">-- ステージ選択 --</option>';
    window.SCRE_GUIDES.forEach(cat => {
      if (!cat.stages || cat.stages.length === 0) return;
      const grp = document.createElement("optgroup");
      grp.label = cat.category;
      cat.stages.forEach(st => {
        const opt = document.createElement("option");
        opt.value = st.title;
        opt.textContent = st.title + (st.terrain && st.terrain !== "無" ? ` [${st.terrain}]` : "");
        grp.appendChild(opt);
      });
      sel.appendChild(grp);
    });
  }

  // Dashboard Stage select change (auto-sets terrain if not "無")
  const dashStageSelect = document.getElementById("dashboardStageSelect");
  if (dashStageSelect) {
    dashStageSelect.addEventListener("change", e => {
      const selectedTitle = e.target.value;
      if (!selectedTitle || !window.SCRE_GUIDES) return;

      let found = null;
      for (const g of window.SCRE_GUIDES) {
        const s = g.stages.find(st => st.title === selectedTitle || st.id === selectedTitle);
        if (s) { found = s; break; }
      }

      if (found && found.terrain && found.terrain !== "無") {
        if (found.terrain !== currentTerrain) {
          currentTerrain = found.terrain;
          const mapTerSelect = document.getElementById("mapTerrainSelect");
          if (mapTerSelect) mapTerSelect.value = currentTerrain;
          savePresets();
          renderDashboard();
          renderAllCastles();
        }
      }
    });
  }

  // Dashboard Stage Diag button click
  const btnDashDiag = document.getElementById("btnDashboardDiag");
  if (btnDashDiag) {
    btnDashDiag.addEventListener("click", () => {
      const sel = document.getElementById("dashboardStageSelect");
      const stageTitle = sel ? sel.value : "";
      if (!stageTitle) {
        alert("診断するステージを選択してください。");
        return;
      }
      openStageDiagnostic(stageTitle);
    });
  }

  // Rename preset button
  document.getElementById("btnRenamePreset").addEventListener("click", renameCurrentPreset);

  // Bulk Load
  document.getElementById("btnBulkLoad").addEventListener("click", () => {
    const text = document.getElementById("bulkInputText").value.trim();
    if (!text) return;
    const names = text.split(/[\n,、・\s]+/).filter(x => x.length > 0);
    party = [];
    names.slice(0, 8).forEach(name => {
      const c = window.SCRE_DATA.find(item => item.name.includes(name) || item.id.includes(name));
      if (c) {
        party.push({ id: c.id, strategyOn: true, specialOn: !!c.special });
      }
    });
    saveParty();
    renderDashboard();
    renderAllCastles();
    document.getElementById("bulkInputText").value = "";
  });

  // Bulk Export Names
  const btnExportNames = document.getElementById("btnExportPartyNames");
  if (btnExportNames) {
    btnExportNames.addEventListener("click", () => {
      const names = party.map(slot => {
        const c = getCastleById(slot.id);
        return c ? c.name : slot.id;
      }).filter(Boolean);

      const input = document.getElementById("bulkInputText");
      if (names.length === 0) {
        if (input) input.value = "";
        const orig = btnExportNames.textContent;
        btnExportNames.textContent = "編成が空です";
        btnExportNames.style.color = "#c0392b";
        setTimeout(() => {
          btnExportNames.textContent = orig;
          btnExportNames.style.color = "";
        }, 2000);
        return;
      }

      const text = names.join(", ");
      if (input) input.value = text;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          const orig = btnExportNames.textContent;
          btnExportNames.textContent = "✓ コピーしました";
          btnExportNames.style.color = "#27ae60";
          setTimeout(() => {
            btnExportNames.textContent = orig;
            btnExportNames.style.color = "";
          }, 2000);
        }).catch(() => {
          // Fallback: input field already holds text
        });
      }
    });
  }

  // State for Castle List Pagination
  let listCurrentPage = 1;
  let listPageSize = 36;

  // Render All Castles (Large Card View with Full Pagination & Reverse Filter)
  function renderAllCastles() {
    const listEl = document.getElementById("allCastleList");
    const topPagination = document.getElementById("listPaginationTop");
    const bottomPagination = document.getElementById("listPaginationBottom");
    const searchVal = document.getElementById("searchCastleInput").value.trim().toLowerCase();
    const filterRarity = document.getElementById("filterRarity").value;
    const filterType = document.getElementById("filterType").value;
    const filterWeapon = document.getElementById("filterWeapon").value;
    const filterBuff = document.getElementById("filterBuffCategory") ? document.getElementById("filterBuffCategory").value : "";
    const filterOwnership = document.getElementById("filterOwnership") ? document.getElementById("filterOwnership").value : "";

    listEl.innerHTML = "";

    const filtered = window.SCRE_DATA.filter(c => {
      if (searchVal && !c.name.toLowerCase().includes(searchVal)) return false;
      if (filterRarity && String(c.rarity) !== filterRarity) return false;
      if (filterType) {
        if (filterType === "複合") {
          if (!c.attributes || c.attributes.length <= 1) return false;
        } else {
          const attrs = c.attributes || [c.castleType];
          if (!attrs.includes(filterType) && c.castleType !== filterType && c.subType !== filterType) {
            return false;
          }
        }
      }
      if (filterWeapon && c.weapon !== filterWeapon) return false;

      // Ownership & Favorites Filter
      if (filterOwnership) {
        if (filterOwnership === "owned" && !ownership.owned.has(c.id)) return false;
        if (filterOwnership === "not_owned" && ownership.owned.has(c.id)) return false;
        if (filterOwnership === "fav" && !ownership.favorites.has(c.id)) return false;
      }

      // Reverse Buff / Effect Filter
      if (filterBuff) {
        const allEffects = [];
        if (c.skill) allEffects.push(...(c.skill.effects || []));
        if (c.strategy) allEffects.push(...(c.strategy.effects || []));
        if (c.special) allEffects.push(...(c.special.effects || []));

        const fullText = [
          c.skill ? (c.skill.name + ' ' + c.skill.text) : '',
          c.strategy ? (c.strategy.name + ' ' + c.strategy.text) : '',
          c.special ? (c.special.name + ' ' + c.special.text) : ''
        ].join(' ');

        if (filterBuff === "special_stop") {
          if (!fullText.includes("足止め") && !allEffects.some(e => e.raw && e.raw.includes("足止め"))) return false;
        } else if (filterBuff === "special_ct") {
          if (!fullText.includes("再使用") && !fullText.includes("短縮") && !allEffects.some(e => e.raw && e.raw.includes("短縮"))) return false;
        } else if (filterBuff === "special_ki") {
          if (!fullText.includes("気") && !allEffects.some(e => e.raw && e.raw.includes("気"))) return false;
        } else if (filterBuff === "defIgnore") {
          if (!allEffects.some(e => e.stat === "defIgnore") && !fullText.includes("防御無視") && !fullText.includes("防御を無視") && !fullText.includes("防御を0")) return false;
        } else {
          if (!allEffects.some(e => e.stat === filterBuff)) return false;
        }
      }

      return true;
    });

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / listPageSize));
    if (listCurrentPage > totalPages) listCurrentPage = totalPages;
    if (listCurrentPage < 1) listCurrentPage = 1;

    // Render Pagination Bar Helper
    function renderPaginationBar(containerEl) {
      if (!containerEl) return;
      if (totalCount === 0) {
        containerEl.innerHTML = `<div class="pagination-info">0 件</div>`;
        return;
      }

      const startIdx = (listCurrentPage - 1) * listPageSize + 1;
      const endIdx = Math.min(totalCount, listCurrentPage * listPageSize);

      let pageButtonsHtml = "";
      pageButtonsHtml += `<button class="page-btn" data-page="1" ${listCurrentPage === 1 ? 'disabled' : ''} title="最初のページ">«</button>`;
      pageButtonsHtml += `<button class="page-btn" data-page="${listCurrentPage - 1}" ${listCurrentPage === 1 ? 'disabled' : ''} title="前のページ">‹</button>`;

      // Determine page range (show up to 7 buttons)
      let startP = Math.max(1, listCurrentPage - 2);
      let endP = Math.min(totalPages, listCurrentPage + 2);
      if (startP > 1) {
        pageButtonsHtml += `<button class="page-btn" data-page="1">1</button>`;
        if (startP > 2) pageButtonsHtml += `<span style="color:#999;padding:0 2px;">…</span>`;
      }
      for (let p = startP; p <= endP; p++) {
        pageButtonsHtml += `<button class="page-btn ${p === listCurrentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
      }
      if (endP < totalPages) {
        if (endP < totalPages - 1) pageButtonsHtml += `<span style="color:#999;padding:0 2px;">…</span>`;
        pageButtonsHtml += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
      }

      pageButtonsHtml += `<button class="page-btn" data-page="${listCurrentPage + 1}" ${listCurrentPage === totalPages ? 'disabled' : ''} title="次のページ">›</button>`;
      pageButtonsHtml += `<button class="page-btn" data-page="${totalPages}" ${listCurrentPage === totalPages ? 'disabled' : ''} title="最後のページ">»</button>`;

      containerEl.innerHTML = `
        <div class="pagination-info">
          <span>全 <strong>${totalCount}</strong> 件中 <strong>${startIdx}〜${endIdx}</strong> 件 (${listCurrentPage} / ${totalPages} ページ)</span>
          <select class="page-size-select" data-action="change-page-size">
            <option value="36" ${listPageSize === 36 ? 'selected' : ''}>36件 / 頁</option>
            <option value="72" ${listPageSize === 72 ? 'selected' : ''}>72件 / 頁</option>
            <option value="144" ${listPageSize === 144 ? 'selected' : ''}>144件 / 頁</option>
            <option value="9999" ${listPageSize === 9999 ? 'selected' : ''}>全件表示</option>
          </select>
        </div>
        <div class="pagination-controls">
          ${pageButtonsHtml}
        </div>
      `;
    }

    renderPaginationBar(topPagination);
    renderPaginationBar(bottomPagination);

    if (totalCount === 0) {
      listEl.innerHTML = `<div class="banner-notice" style="grid-column: 1 / -1; margin-top: 10px;">検索条件に一致する城娘が見つかりませんでした。</div>`;
      return;
    }

    const pageItems = filtered.slice((listCurrentPage - 1) * listPageSize, listCurrentPage * listPageSize);

    pageItems.forEach(c => {
      const inParty = party.some(p => p.id === c.id);
      const isFav = ownership.favorites.has(c.id);
      const isOwned = ownership.owned.has(c.id);

      const row = document.createElement("div");
      row.className = "castle-list-item";
      row.setAttribute("data-id", c.id);
      row.title = "クリックで詳細・全身画像を表示";

      let stratSnippet = "計略なし";
      if (c.strategy) {
        stratSnippet = `<span style="font-weight:bold;color:#2a6496;">計略:</span> ${c.strategy.name.replace(/\(.*?\)/g, '')}`;
      }

      let skillSnippet = "特技なし";
      if (c.skill) {
        skillSnippet = `<strong style="color:var(--primary-color);">${c.skill.name.split('/').pop().trim()}:</strong> ${c.skill.text}`;
      }

      row.innerHTML = `
        <div class="castle-item-icon-col">
          ${getIconHtml(c, 52)}
        </div>
        <div class="castle-item-body">
          <div class="castle-item-header">
            <div class="castle-item-title">${c.name}</div>
            <div class="castle-item-badges">
              <button class="btn-fav ${isFav ? 'active' : ''}" data-action="toggle-fav" data-id="${c.id}" title="お気に入り切替">${isFav ? '★' : '☆'}</button>
              <button class="btn-owned ${isOwned ? 'active' : ''}" data-action="toggle-owned" data-id="${c.id}" title="所持切替">${isOwned ? '所持' : '未所持'}</button>
              <span class="badge" style="background:#b85d19;color:#fff;">★${c.rarity}</span>
              ${getAttrBadgeHtml(c)}
              <span class="badge" style="background:#555;color:#fff;">${c.weapon}</span>
              <span class="badge" style="background:#3a6073;color:#fff;">${c.rangeKind || '近'}</span>
            </div>
          </div>
          <div class="castle-item-skill" title="${c.skill ? c.skill.text : ''}">
            ${skillSnippet}
          </div>
          <div class="castle-item-footer">
            <div class="castle-item-strat-pill" title="${c.strategy ? c.strategy.text : ''}">
              ${stratSnippet}
            </div>
            <div class="castle-item-actions">
              <button class="btn" data-detail="${c.id}" style="padding:4px 8px;font-size:11px;background:#f5f2eb;border:1px solid #d8cfc4;color:#444;">詳細 ↗</button>
              <button class="btn ${inParty ? '' : 'btn-primary'}" data-toggle-party="${c.id}" style="padding:4px 10px;font-size:11px;font-weight:bold;${inParty ? 'background:#c93434;color:#fff;border-color:#c93434;' : ''}">
                ${inParty ? '✓ 編成中' : '+ 編成'}
              </button>
            </div>
          </div>
        </div>
      `;
      listEl.appendChild(row);
    });
  }

  // Handle pagination bar clicks (Top and Bottom)
  function handlePaginationClick(e) {
    const btn = e.target.closest(".page-btn");
    if (btn && !btn.disabled) {
      const page = parseInt(btn.getAttribute("data-page"), 10);
      if (!isNaN(page) && page !== listCurrentPage) {
        listCurrentPage = page;
        renderAllCastles();
        document.getElementById("tab-list").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    if (e.target.classList.contains("page-size-select")) {
      const size = parseInt(e.target.value, 10);
      if (!isNaN(size) && size !== listPageSize) {
        listPageSize = size;
        listCurrentPage = 1;
        renderAllCastles();
      }
    }
  }

  document.getElementById("listPaginationTop").addEventListener("click", handlePaginationClick);
  document.getElementById("listPaginationTop").addEventListener("change", handlePaginationClick);
  document.getElementById("listPaginationBottom").addEventListener("click", handlePaginationClick);
  document.getElementById("listPaginationBottom").addEventListener("change", handlePaginationClick);

  function resetPageAndRenderAll() {
    listCurrentPage = 1;
    renderAllCastles();
  }

  document.getElementById("searchCastleInput").addEventListener("input", resetPageAndRenderAll);
  document.getElementById("filterRarity").addEventListener("change", resetPageAndRenderAll);
  document.getElementById("filterType").addEventListener("change", resetPageAndRenderAll);
  document.getElementById("filterWeapon").addEventListener("change", resetPageAndRenderAll);
  const filterOwnershipEl = document.getElementById("filterOwnership");
  if (filterOwnershipEl) filterOwnershipEl.addEventListener("change", resetPageAndRenderAll);

  document.getElementById("allCastleList").addEventListener("click", e => {
    // 0. Toggle Favorite
    const favBtn = e.target.closest('[data-action="toggle-fav"]');
    if (favBtn) {
      e.stopPropagation();
      toggleFavorite(favBtn.getAttribute('data-id'));
      return;
    }

    // 0. Toggle Owned
    const ownedBtn = e.target.closest('[data-action="toggle-owned"]');
    if (ownedBtn) {
      e.stopPropagation();
      toggleOwned(ownedBtn.getAttribute('data-id'));
      return;
    }

    // 1. Toggle party button
    const togglePartyId = e.target.getAttribute("data-toggle-party");
    if (togglePartyId) {
      const existingIdx = party.findIndex(p => p.id === togglePartyId);
      if (existingIdx !== -1) {
        party.splice(existingIdx, 1);
      } else {
        if (party.length >= 8) {
          alert("編成枠がいっぱいです(最大8体)。");
          return;
        }
        const c = getCastleById(togglePartyId);
        party.push({ id: togglePartyId, strategyOn: true, specialOn: !!(c && c.special) });
      }
      saveParty();
      renderDashboard();
      renderAllCastles(); // Re-render to update "+ 編成 / ✓ 編成中"
      return;
    }

    // 2. Detail button
    const detailId = e.target.getAttribute("data-detail");
    if (detailId) {
      openCastleDetail(detailId);
      return;
    }

    // 3. Click anywhere on card (except inside actions)
    const item = e.target.closest(".castle-list-item");
    if (item) {
      const id = item.getAttribute("data-id");
      if (id) {
        openCastleDetail(id);
      }
    }
  });

  // Guides Tab
  function renderGuidesTab() {
    const container = document.getElementById("guidesListContainer");
    if (!container) return;
    const cat = document.getElementById("guideCategorySelect").value;
    const subcatSelect = document.getElementById("guideSubCategorySelect");
    const subcat = (cat === "地獄" && subcatSelect) ? subcatSelect.value : "";
    const q = document.getElementById("guideSearchInput").value.trim().toLowerCase();

    // Toggle subcategory select visibility
    if (subcatSelect) {
      subcatSelect.style.display = (cat === "地獄") ? "inline-block" : "none";
    }

    container.innerHTML = "";

    if (!window.SCRE_GUIDES) {
      container.innerHTML = `<div class="banner-notice" style="grid-column:1/-1;">攻略データが読み込まれていません。</div>`;
      return;
    }

    const categoryData = window.SCRE_GUIDES.find(g => g.category === cat);
    if (!categoryData || !categoryData.stages.length) {
      container.innerHTML = `<div class="banner-notice" style="grid-column:1/-1;">該当するステージ情報がありません。</div>`;
      return;
    }

    // If viewing Hell and (no subcat selected or Hades selected), show the Hades Overview Banner
    if (cat === "地獄" && (!subcat || subcat === "ハデスの死闘場")) {
      const banner = document.createElement("div");
      banner.style.gridColumn = "1 / -1";
      banner.innerHTML = `
        <div class="section-box" style="margin-top:0; margin-bottom:8px; background:linear-gradient(135deg, #2b1f3d 0%, #171426 100%); color:#fff; border:1px solid #7d4999; border-radius:6px; padding:12px 14px; box-shadow:0 3px 8px rgba(0,0,0,0.25);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:6px; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
            <div>
              <strong style="font-size:15px; color:#e0b0ff;">🔥 ハデスの死闘場（超難・全11深層マップ完全攻略ガイド）</strong>
              <span style="font-size:11.5px; color:#d1c2ea; margin-left:6px;">地獄最深コンテンツ・★7 エレボス交換所対応</span>
            </div>
            <div style="display:flex; gap:6px;">
              <span class="badge" style="background:#8e44ad; color:#fff;">合戦難度: 超難固定</span>
              <span class="badge" style="background:#27ae60; color:#fff;">土日ドロップ 1.2倍</span>
            </div>
          </div>
          <div style="font-size:12px; line-height:1.6; color:#f0e6ff;">
            <div style="margin-bottom:6px;">
              <strong style="color:#ff9ff3;">◆ 敵特殊ギミック「ハデスの霊魂」:</strong> 紫色の敵は撃破時に「ハデスの霊魂」に変化・自爆し、味方に<span style="color:#ff7675; font-weight:bold;">「暗闇」付与＋計略消費気+2</span>を課します。<br>
              <span style="color:#d8c3ff;">💡 対策: 状態異常回復・無効化持ち（［裏］小牧山城、不夜城、肝試し前橋城など）や、計略消費気軽減・気生成城娘の編成が極めて有効です。</span>
            </div>
            <div style="margin-bottom:6px;">
              <strong style="color:#ff9ff3;">◆ 戦場ルール「再配置時間50秒・気30固定」:</strong> 撤退・再配置による転戦が制限されます。場持ちの良い高耐久・回復・不屈特技や伏兵によるデコイが攻略の鍵です。
            </div>
            <div style="margin-bottom:6px;">
              <strong style="color:#ff9ff3;">◆ 地形ボーナス「地獄」:</strong> 耐久・攻撃・防御が1.3倍、巨大化消費気軽減。（※戦場効果による武器種ボーナスとは競合）
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px; font-size:11.5px; background:rgba(0,0,0,0.35); padding:8px 10px; border-radius:4px; border:1px solid rgba(255,255,255,0.1);">
              <div><strong style="color:#ff7675;">● 赤霊魂:</strong> 閻魔大王 / イザナギ / 覇・前田利家 (深層1) / クロノス (深層2)</div>
              <div><strong style="color:#74b9ff;">● 青霊魂:</strong> ヘル / オーディン / 幻・佐竹義重 (深層1) / ヴィシュヌ (深層2)</div>
              <div><strong style="color:#ffeaa7;">● 黄霊魂:</strong> オシリス / インドラ / アヌ (深層1)</div>
            </div>
            <div style="font-size:11px; color:#c8b6e2; margin-top:6px;">
              ※限定交換所にて赤・青・黄の霊魂で ★7 エレボス、武器「★4 冥槍バイデント」、施設「アケロン河」「エーリュシオン」などと交換可能です。
            </div>
          </div>
        </div>
      `;
      container.appendChild(banner);
    }

    const filtered = categoryData.stages.filter(st => {
      if (subcat && st.subCategory !== subcat && !st.id.startsWith(subcat)) {
        return false;
      }
      if (q) {
        const titleMatch = st.title.toLowerCase().includes(q);
        const idMatch = (st.id || "").toLowerCase().includes(q);
        const subcatMatch = (st.subCategory || "").toLowerCase().includes(q);
        const rulesMatch = (st.rules || []).some(r => r.toLowerCase().includes(q));
        const bossMatch = (st.bossInfo || []).some(b => b.toLowerCase().includes(q));
        const delibMatch = (st.deliberations || []).some(d => (d.name + " " + d.effect).toLowerCase().includes(q));
        const metaMatch = st.hadesMeta ? ((st.hadesMeta.soulColor || "") + "霊魂 " + (st.hadesMeta.bossName || "") + " " + (st.hadesMeta.depth || "")).toLowerCase().includes(q) : false;
        if (!titleMatch && !idMatch && !subcatMatch && !rulesMatch && !bossMatch && !delibMatch && !metaMatch) {
          return false;
        }
      }
      return true;
    });

    if (filtered.length === 0) {
      const emptyNotice = document.createElement("div");
      emptyNotice.className = "banner-notice";
      emptyNotice.style.gridColumn = "1/-1";
      emptyNotice.textContent = "検索条件に一致するステージがありません。";
      container.appendChild(emptyNotice);
      return;
    }

    filtered.forEach(st => {
      const card = document.createElement("div");
      card.className = "buff-card";
      const isHades = Boolean(st.hadesMeta || st.subCategory === "ハデスの死闘場");
      card.style.borderTop = isHades ? "3px solid #8e44ad" : "3px solid var(--primary-color)";

      // Badges
      let badgeHtml = "";
      if (st.subCategory) {
        badgeHtml += `<span class="badge" style="background:#4b3869; color:#fff; font-size:10px;">${st.subCategory}</span> `;
      }
      if (st.hadesMeta) {
        const soulColors = { "赤": "#c0392b", "青": "#2980b9", "黄": "#d4ac0d" };
        const sColor = soulColors[st.hadesMeta.soulColor] || "#8e44ad";
        badgeHtml += `<span class="badge" style="background:${sColor}; color:#fff; font-weight:bold; font-size:10px;">${st.hadesMeta.soulColor}霊魂 (${st.hadesMeta.depth})</span> `;
        badgeHtml += `<span class="badge" style="background:#555; color:#fff; font-size:10px;">超難</span> `;
      }
      if (st.totalDelibPoints) {
        badgeHtml += `<span class="badge" style="background:#6c5ce7; color:#fff; font-size:10px;">${st.totalDelibPoints}審議 (${st.deliberations.length}件)</span> `;
      }

      let rulesHtml = "";
      if (st.rules && st.rules.length > 0) {
        rulesHtml += `
          <div style="margin-top:6px;">
            <strong style="color:var(--primary-color);font-size:11.5px;">特別ルール・戦場効果:</strong>
            <ul style="padding-left:16px;font-size:11px;color:#444;margin-top:2px;">
              ${st.rules.map(r => `<li style="margin-bottom:3px;line-height:1.35;">${r.replace(/\n/g, '<br>')}</li>`).join("")}
            </ul>
          </div>
        `;
      }

      let bossHtml = "";
      if (st.bossInfo && st.bossInfo.length > 0) {
        bossHtml += `
          <div style="margin-top:6px;">
            <strong style="color:var(--debuff-color);font-size:11.5px;">☠️ ボス・強敵の特性:</strong>
            <ul style="padding-left:16px;font-size:11px;color:#555;margin-top:2px;">
              ${st.bossInfo.map(b => `<li style="margin-bottom:3px;line-height:1.35;">${b.replace(/\n/g, '<br>')}</li>`).join("")}
            </ul>
          </div>
        `;
      }

      let delibHtml = "";
      if (st.deliberations && st.deliberations.length > 0) {
        delibHtml += `
          <div style="margin-top:6px;">
            <strong style="color:#2a6496;font-size:11.5px;">審議項目 (${st.deliberations.length}件 / 計${st.totalDelibPoints || '-'}審):</strong>
            <div style="font-size:11px;background:#f9f9f9;padding:6px 8px;border-radius:4px;border:1px solid #e5e0d8;margin-top:3px;max-height:130px;overflow-y:auto;">
              ${st.deliberations.map(d => `
                <div style="margin-bottom:4px;border-bottom:1px dashed #eee;padding-bottom:3px;line-height:1.35;">
                  <span class="badge" style="background:#2d3436; color:#fff; font-size:10px; padding:1px 5px; margin-right:4px;">${d.point}審</span>
                  <strong>${d.name}:</strong> <span style="color:#555;">${d.effect.replace(/\n/g, '<br>')}</span>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="buff-header" style="flex-wrap:wrap; gap:4px; align-items:flex-start;">
          <div style="flex:1; min-width:200px;">
            <div style="margin-bottom:3px;">${badgeHtml}</div>
            <strong style="font-size:14.5px;">${st.title}</strong>
          </div>
          ${st.terrain !== "無" ? `<span class="type-tag ${st.terrain}" style="position:static;padding:2px 6px;">${st.terrain}</span>` : ''}
        </div>
        <div style="font-size:11.5px;line-height:1.4;">
          ${rulesHtml}
          ${bossHtml}
          ${delibHtml}
        </div>
        <div style="display:flex; gap:8px; margin-top:10px; padding-top:8px; border-top:1px dashed #d8cfc4;">
          <button class="btn btn-sm btn-primary" data-action="diag-stage" data-title="${st.title}" data-id="${st.id}" style="font-size:11px; font-weight:bold; flex:1;">部隊の適合判定 ⚔</button>
          <button class="btn btn-sm" data-action="filter-stage" data-title="${st.title}" data-terrain="${st.terrain}" style="font-size:11px; flex:1; background:#f5f0e6; border-color:#d5cbbd;">対策城娘を探す 🔍</button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  document.getElementById("guideCategorySelect").addEventListener("change", renderGuidesTab);
  const subcatEl = document.getElementById("guideSubCategorySelect");
  if (subcatEl) subcatEl.addEventListener("change", renderGuidesTab);
  document.getElementById("guideSearchInput").addEventListener("input", renderGuidesTab);

  // Guide stage action listeners
  document.getElementById("guidesListContainer").addEventListener("click", e => {
    const action = e.target.getAttribute("data-action");
    const title = e.target.getAttribute("data-title");
    const id = e.target.getAttribute("data-id") || title;
    if (!action || !title) return;

    if (action === "diag-stage") {
      openStageDiagnostic(id);
    } else if (action === "filter-stage") {
      const terrain = e.target.getAttribute("data-terrain");
      filterCastlesForStage(title, terrain);
    }
  });

  // Special Tab
  function renderSpecialTab() {
    const container = document.getElementById("specialAbilitiesList");
    container.innerHTML = "";
    const activeMembers = party.map(s => getCastleById(s.id)).filter(Boolean);
    if (activeMembers.length === 0) {
      container.innerHTML = `<div class="banner-notice" style="grid-column:1/-1;">編成中の城娘がいません。</div>`;
      return;
    }

    activeMembers.forEach(c => {
      const item = document.createElement("div");
      item.className = "section-box";
      item.innerHTML = `
        <div class="section-title">${c.name} [${c.castleType}・${c.weapon}]</div>
        <div style="font-size: 11.5px; line-height: 1.5;">
          ${c.skill ? `<div><strong>特技:</strong> ${c.skill.text}</div>` : ''}
          ${c.strategy ? `<div style="margin-top:4px;"><strong>計略:</strong> ${c.strategy.text}</div>` : ''}
          ${c.special ? `<div style="margin-top:4px;"><strong>特殊能力:</strong> ${c.special.text}</div>` : ''}
        </div>
      `;
      container.appendChild(item);
    });
  }

  // Modal selector for slot
  function openCastleSelector(slotIndex) {
    selectingSlotIndex = slotIndex;
    const modal = document.getElementById("modalSelector");
    const listEl = document.getElementById("modalCastleList");
    const input = document.getElementById("modalSearchInput");
    const raritySelect = document.getElementById("modalFilterRarity");
    const typeSelect = document.getElementById("modalFilterType");
    input.value = "";
    if (raritySelect) raritySelect.value = "";
    if (typeSelect) typeSelect.value = "";
    modal.classList.add("open");

    function renderModalList() {
      const q = input.value.trim().toLowerCase();
      const r = raritySelect ? raritySelect.value : "";
      const t = typeSelect ? typeSelect.value : "";
      listEl.innerHTML = "";
      window.SCRE_DATA.filter(c => {
        if (q && !c.name.toLowerCase().includes(q)) return false;
        if (r && String(c.rarity) !== r) return false;
        if (t) {
          if (t === "複合") {
            if (!c.attributes || c.attributes.length <= 1) return false;
          } else {
            const attrs = c.attributes || [c.castleType];
            if (!attrs.includes(t) && c.castleType !== t && c.subType !== t) return false;
          }
        }
        return true;
      }).slice(0, 100).forEach(c => {
        const item = document.createElement("div");
        item.className = "castle-list-item";
        item.style.marginBottom = "4px";
        item.innerHTML = `
          ${getIconHtml(c, 28)}
          <strong style="margin-left: 6px;">${c.name}</strong>
          <span style="margin-left:auto;font-size:11px;color:var(--text-sub);">[${c.subType || c.castleType}] ★${c.rarity}・${c.weapon}</span>
        `;
        item.addEventListener("click", () => {
          if (selectingSlotIndex !== null) {
            party[selectingSlotIndex] = { id: c.id, strategyOn: true, specialOn: !!c.special };
          } else if (party.length < 8) {
            party.push({ id: c.id, strategyOn: true, specialOn: !!c.special });
          }
          saveParty();
          renderDashboard();
          modal.classList.remove("open");
        });
        listEl.appendChild(item);
      });
    }

    input.oninput = renderModalList;
    if (raritySelect) raritySelect.onchange = renderModalList;
    if (typeSelect) typeSelect.onchange = renderModalList;
    renderModalList();
  }

  document.getElementById("modalCloseBtn").addEventListener("click", () => {
    document.getElementById("modalSelector").classList.remove("open");
  });

  // Settings export/import
  document.getElementById("btnExportData").addEventListener("click", () => {
    const exportData = {
      version: 2,
      presets: partyPresets,
      activePresetIdx: currentPresetIdx,
      terrain: currentTerrain,
      ownership: {
        owned: Array.from(ownership.owned),
        favorites: Array.from(ownership.favorites)
      }
    };
    document.getElementById("settingsJsonArea").value = JSON.stringify(exportData, null, 2);
    showNotification("設定と所持データを書き出しました！");
  });

  document.getElementById("btnImportData").addEventListener("click", () => {
    try {
      const data = JSON.parse(document.getElementById("settingsJsonArea").value);
      if (data) {
        if (Array.isArray(data.presets)) {
          partyPresets = data.presets;
          party = partyPresets[currentPresetIdx].party;
        } else if (Array.isArray(data.party)) {
          party = data.party;
          partyPresets[currentPresetIdx].party = party;
        }
        if (typeof data.activePresetIdx === "number") currentPresetIdx = data.activePresetIdx;
        if (data.terrain !== undefined) currentTerrain = data.terrain;
        if (data.ownership) {
          if (Array.isArray(data.ownership.owned)) ownership.owned = new Set(data.ownership.owned);
          if (Array.isArray(data.ownership.favorites)) ownership.favorites = new Set(data.ownership.favorites);
          saveOwnership();
        }
        savePresets();
        renderPresetBar();
        renderDashboard();
        renderAllCastles();
        showNotification("設定と所持データを復元しました！");
      }
    } catch (e) {
      alert("JSON読み込み失敗: " + e.message);
    }
  });

  // Bulk Ownership Buttons
  const btnBulkOwnR7 = document.getElementById("btnBulkOwnR7");
  if (btnBulkOwnR7) {
    btnBulkOwnR7.addEventListener("click", () => {
      window.SCRE_DATA.forEach(c => {
        if (c.rarity === 7) ownership.owned.add(c.id);
      });
      saveOwnership();
      renderAllCastles();
      showNotification(`★7城娘を一括所持に設定しました (所持: ${ownership.owned.size}体)`);
    });
  }

  const btnBulkOwnR6R7 = document.getElementById("btnBulkOwnR6R7");
  if (btnBulkOwnR6R7) {
    btnBulkOwnR6R7.addEventListener("click", () => {
      window.SCRE_DATA.forEach(c => {
        if (c.rarity >= 6) ownership.owned.add(c.id);
      });
      saveOwnership();
      renderAllCastles();
      showNotification(`★6〜★7城娘を一括所持に設定しました (所持: ${ownership.owned.size}体)`);
    });
  }

  const btnBulkOwnAll = document.getElementById("btnBulkOwnAll");
  if (btnBulkOwnAll) {
    btnBulkOwnAll.addEventListener("click", () => {
      window.SCRE_DATA.forEach(c => ownership.owned.add(c.id));
      saveOwnership();
      renderAllCastles();
      showNotification(`全城娘を所持に設定しました (所持: ${ownership.owned.size}体)`);
    });
  }

  const btnBulkClearOwned = document.getElementById("btnBulkClearOwned");
  if (btnBulkClearOwned) {
    btnBulkClearOwned.addEventListener("click", () => {
      if (confirm("所持設定をすべて解除しますか？")) {
        ownership.owned.clear();
        saveOwnership();
        renderAllCastles();
        showNotification("所持設定を全解除しました。");
      }
    });
  }

  // Castle Detail Modal (詳細説明・全身画像ポップアップ)
  let activeDetailCastleId = null;

  function openCastleDetail(castleId) {
    const c = getCastleById(castleId);
    if (!c) return;
    activeDetailCastleId = castleId;

    const modal = document.getElementById("modalCastleDetail");

    // Header
    document.getElementById("detailCastleName").textContent = c.name;
    document.getElementById("detailCastleRuby").textContent = c.ruby ? `(${c.ruby})` : "";
    document.getElementById("detailCastleNo").textContent = c.bookNo ? `No.${c.bookNo}` : "No.---";

    // Badges
    const badgesEl = document.getElementById("detailBadges");
    badgesEl.innerHTML = `
      <span class="badge" style="background:#b85d19;color:#fff;">★${c.rarity}</span>
      ${getAttrBadgeHtml(c)}
      <span class="badge" style="background:#555;color:#fff;">${c.weapon}</span>
      <span class="badge" style="background:#3a6073;color:#fff;">${c.rangeKind || '近'}</span>
      ${c.country ? `<span class="badge" style="background:#706b64;color:#fff;">${c.country}</span>` : ''}
    `;

    // Action button state (+ 編成に追加 / ✓ 編成中)
    updateDetailPartyButton();
    updateModalDetailOwnershipUI(c);

    // Wiki external link
    const wikiBtn = document.getElementById("btnDetailWikiLink");
    wikiBtn.href = `https://scre.swiki.jp/index.php?${encodeURIComponent(c.name)}`;

    // Left Column: Fullbody Illustration (全身立ち絵)
    const imgEl = document.getElementById("detailPortraitImg");
    const fallbackSrc = `icons/${encodeURIComponent(c.name)}.png`;

    imgEl.onerror = function() {
      if (this.src !== fallbackSrc) {
        this.src = fallbackSrc;
      }
    };

    if (c.illustUrl) {
      imgEl.src = c.illustUrl;
    } else {
      imgEl.src = fallbackSrc;
    }

    // Meta Info (イラストレーター / 声優 / 令制国)
    const metaEl = document.getElementById("detailMetaInfo");
    let metaHtml = "";
    if (c.illustrator) metaHtml += `<div><strong>絵師:</strong> ${c.illustrator}</div>`;
    if (c.voiceActor) metaHtml += `<div><strong>声優(CV):</strong> ${c.voiceActor}</div>`;
    if (c.country) metaHtml += `<div><strong>令制国/地域:</strong> ${c.country}</div>`;
    metaEl.innerHTML = metaHtml || '<div style="color:var(--text-muted);">追加情報なし</div>';

    // Lore (図鑑文章 / 自己紹介)
    const loreEl = document.getElementById("detailLoreText");
    loreEl.textContent = c.lore || "図鑑文章はありません。";

    // Right Column: Stats Table
    const tbody = document.getElementById("detailStatsTbody");
    const initS = (c.statsDetail && c.statsDetail.initial) || {};
    const giantS = (c.statsDetail && c.statsDetail.giant5) || {};

    tbody.innerHTML = `
      <tr>
        <td style="font-weight:bold;background:#fdfaf5;">初期配置</td>
        <td>${initS.cost || c.cost || '-'}</td>
        <td>${formatStatVal(initS.hp)}</td>
        <td>${formatStatVal(initS.atk)}</td>
        <td>${formatStatVal(initS.def)}</td>
        <td>${formatStatVal(initS.range)}</td>
        <td>${formatStatVal(initS.recovery)}</td>
      </tr>
      <tr>
        <td style="font-weight:bold;background:#fff8f0;color:var(--primary-color);">巨大化5回</td>
        <td style="font-weight:bold;">${giantS.cost || '-'}</td>
        <td class="stat-highlight">${formatStatVal(giantS.hp)}</td>
        <td class="stat-highlight">${formatStatVal(giantS.atk)}</td>
        <td class="stat-highlight">${formatStatVal(giantS.def)}</td>
        <td class="stat-highlight">${formatStatVal(giantS.range)}</td>
        <td>${formatStatVal(giantS.recovery)}</td>
      </tr>
    `;

    // Skills (特技一覧: [無印], [改壱], [改弐])
    const skillContainer = document.getElementById("detailSkillContainer");
    const skills = (c.allSkills && c.allSkills.length > 0) ? c.allSkills : (c.skill ? [c.skill] : []);
    if (skills.length > 0) {
      skillContainer.innerHTML = `
        <div class="ability-stage-list">
          ${skills.map((sk, idx) => {
            const isLatest = idx === skills.length - 1;
            const badgeClass = sk.stage === "改弐" ? "stage-badge kai-2" : (sk.stage === "改壱" ? "stage-badge kai-1" : "stage-badge");
            return `
              <div class="ability-stage-card ${isLatest ? 'is-latest' : ''}">
                <div class="ability-stage-header">
                  <span class="${badgeClass}">[${sk.stage || '無印'}]</span>
                  <span class="ability-stage-name">${sk.name}</span>
                  ${isLatest ? '<span style="font-size:10px;color:var(--primary-color);margin-left:auto;font-weight:bold;">★適用中</span>' : ''}
                </div>
                <div class="ability-stage-text">${sk.text}</div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    } else {
      skillContainer.innerHTML = `<div style="font-size:11.5px;color:var(--text-muted);">特技なし</div>`;
    }

    // Strategies (計略一覧)
    const stratBox = document.getElementById("detailStrategyBox");
    const stratContainer = document.getElementById("detailStrategyContainer");
    const strats = (c.allStrategies && c.allStrategies.length > 0) ? c.allStrategies : (c.strategy ? [c.strategy] : []);
    if (strats.length > 0) {
      stratBox.style.display = "block";
      stratContainer.innerHTML = `
        <div class="ability-stage-list">
          ${strats.map((st, idx) => {
            const isLatest = idx === strats.length - 1;
            const badgeClass = st.stage === "改弐" ? "stage-badge kai-2" : (st.stage === "改壱" ? "stage-badge kai-1" : "stage-badge");
            return `
              <div class="ability-stage-card ${isLatest ? 'is-latest' : ''}">
                <div class="ability-stage-header">
                  <span class="${badgeClass}">[${st.stage || '無印'}]</span>
                  <span class="ability-stage-name">${st.name}</span>
                  ${isLatest ? '<span style="font-size:10px;color:var(--primary-color);margin-left:auto;font-weight:bold;">★適用中</span>' : ''}
                </div>
                <div class="ability-stage-text">${st.text}</div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    } else {
      stratContainer.innerHTML = `<div style="font-size:11.5px;color:var(--text-muted);">計略なし</div>`;
    }

    // Specials (特殊能力)
    const specBox = document.getElementById("detailSpecialBox");
    const specContainer = document.getElementById("detailSpecialContainer");
    const specs = (c.allSpecials && c.allSpecials.length > 0) ? c.allSpecials : (c.special ? [c.special] : []);
    if (specs.length > 0) {
      specBox.style.display = "block";
      specContainer.innerHTML = `
        <div class="ability-stage-list">
          ${specs.map(sp => `
            <div class="ability-stage-card is-latest">
              <div class="ability-stage-header">
                <span class="stage-badge" style="background:#5a3f85;">[特殊]</span>
                <span class="ability-stage-name">${sp.name}</span>
              </div>
              <div class="ability-stage-text">${sp.text}</div>
            </div>
          `).join("")}
        </div>
      `;
    } else {
      specBox.style.display = "none";
    }

    // Buff / Debuff Category Analysis
    const buffContainer = document.getElementById("detailBuffAnalysis");
    const allEffects = [];
    if (c.skill) allEffects.push(...(c.skill.effects || []));
    if (c.strategy) allEffects.push(...(c.strategy.effects || []));
    if (c.special) allEffects.push(...(c.special.effects || []));

    const statLabels = (window.SCRE_RULES && window.SCRE_RULES.statLabels) || {};
    const seenStats = new Set();
    const tagElements = [];

    allEffects.forEach(ef => {
      if (!seenStats.has(ef.stat)) {
        seenStats.add(ef.stat);
        const label = statLabels[ef.stat] || ef.stat;
        const isDebuff = ef.stat.startsWith("enemy");
        tagElements.push(`
          <span class="${isDebuff ? 'debuff-chip-tag' : 'buff-chip-tag'}">
            ${isDebuff ? '▼' : '▲'} ${label}
          </span>
        `);
      }
    });

    if (tagElements.length > 0) {
      buffContainer.innerHTML = tagElements.join("");
    } else {
      buffContainer.innerHTML = `<span style="font-size:11px;color:var(--text-muted);">特効・バフ/デバフなし</span>`;
    }

    modal.classList.add("open");
  }

  function formatStatVal(val) {
    if (!val) return "-";
    return val.replace(/\//g, " / ");
  }

  function updateDetailPartyButton() {
    const btn = document.getElementById("btnDetailToggleParty");
    if (!btn || !activeDetailCastleId) return;
    const inParty = party.some(p => p.id === activeDetailCastleId);
    if (inParty) {
      btn.textContent = "✓ 編成中 (外す)";
      btn.style.background = "#c93434";
    } else {
      btn.textContent = "+ 編成に追加";
      btn.style.background = "var(--primary-color)";
    }
  }

  document.getElementById("btnDetailToggleParty").addEventListener("click", () => {
    if (!activeDetailCastleId) return;
    const idx = party.findIndex(p => p.id === activeDetailCastleId);
    if (idx !== -1) {
      party.splice(idx, 1);
    } else {
      if (party.length >= 8) {
        alert("編成枠がいっぱいです(最大8体)。");
        return;
      }
      const c = getCastleById(activeDetailCastleId);
      party.push({ id: activeDetailCastleId, strategyOn: true, specialOn: !!(c && c.special) });
    }
    saveParty();
    renderDashboard();
    updateDetailPartyButton();
  });

  function updateModalDetailOwnershipUI(c) {
    if (!c) return;
    const favBtn = document.getElementById("modalDetailFavBtn");
    const ownedBtn = document.getElementById("modalDetailOwnedBtn");
    const isFav = ownership.favorites.has(c.id);
    const isOwned = ownership.owned.has(c.id);

    if (favBtn) {
      favBtn.className = `btn btn-fav ${isFav ? 'active' : ''}`;
      favBtn.textContent = isFav ? '★' : '☆';
      favBtn.title = isFav ? 'お気に入り登録中' : 'お気に入りに追加';
    }
    if (ownedBtn) {
      ownedBtn.className = `btn btn-owned ${isOwned ? 'active' : ''}`;
      ownedBtn.textContent = isOwned ? '✓ 所持中' : '+ 所持にする';
      ownedBtn.title = isOwned ? '未所持にする' : '所持済みにする';
    }
  }

  const modalDetailFavBtn = document.getElementById("modalDetailFavBtn");
  if (modalDetailFavBtn) {
    modalDetailFavBtn.addEventListener("click", () => {
      if (activeDetailCastleId) toggleFavorite(activeDetailCastleId);
    });
  }
  const modalDetailOwnedBtn = document.getElementById("modalDetailOwnedBtn");
  if (modalDetailOwnedBtn) {
    modalDetailOwnedBtn.addEventListener("click", () => {
      if (activeDetailCastleId) toggleOwned(activeDetailCastleId);
    });
  }

  document.getElementById("modalDetailCloseBtn").addEventListener("click", () => {
    document.getElementById("modalCastleDetail").classList.remove("open");
  });

  document.getElementById("modalCastleDetail").addEventListener("click", e => {
    if (e.target.id === "modalCastleDetail") {
      document.getElementById("modalCastleDetail").classList.remove("open");
    }
  });

  // Esc key closes modals
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      document.getElementById("modalCastleDetail").classList.remove("open");
      document.getElementById("modalSelector").classList.remove("open");
      const diagModal = document.getElementById("modalStageDiagnostic");
      if (diagModal) diagModal.classList.remove("open");
    }
  });

  // Stage Diagnostic Modal & Filter Action
  let activeDiagStage = null;

  function openStageDiagnostic(stageTitle) {
    if (!window.SCRE_GUIDES) return;
    let foundStage = null;
    let foundCat = "地獄";

    for (const g of window.SCRE_GUIDES) {
      const st = g.stages.find(s => s.title === stageTitle || s.id === stageTitle);
      if (st) {
        foundStage = st;
        foundCat = g.category;
        break;
      }
    }
    if (!foundStage) return;
    activeDiagStage = foundStage;

    document.getElementById("diagStageTitle").textContent = foundStage.title;
    document.getElementById("diagStageCat").textContent = foundCat + (foundStage.subCategory ? ` (${foundStage.subCategory})` : "");

    const rulesEl = document.getElementById("diagStageRules");
    const rulesList = (foundStage.rules || []).concat((foundStage.deliberations || []).map(d => `[${d.point}審] ${d.name}: ${d.effect}`));
    
    // Hades tactical summary box
    let hadesAnalysisHtml = "";
    const isHades = Boolean(foundStage.hadesMeta || foundStage.subCategory === "ハデスの死闘場");
    if (isHades) {
      const statusCounters = [];
      party.forEach(slot => {
        const c = getCastleById(slot.id);
        if (!c) return;
        const descParts = [
          c.skill ? (c.skill.name + " " + c.skill.text) : "",
          c.strategy ? (c.strategy.name + " " + c.strategy.text) : "",
          c.special ? (c.special.name + " " + c.special.text) : ""
        ];
        if (c.allSkills) c.allSkills.forEach(s => descParts.push(s.name + " " + s.text));
        if (c.allStrategies) c.allStrategies.forEach(s => descParts.push(s.name + " " + s.text));
        const fullDesc = descParts.join(" ");
        if (fullDesc.includes("暗闇") || fullDesc.includes("状態異常") || (fullDesc.includes("無効") && (fullDesc.includes("状態") || fullDesc.includes("異常") || fullDesc.includes("デバフ")))) {
          statusCounters.push(c.name);
        }
      });

      const hellCastles = party.map(s => getCastleById(s.id)).filter(c => c && c.attributes && c.attributes.includes("地獄"));
      const hellCount = hellCastles.length;

      hadesAnalysisHtml = `
        <div style="background:#241635; color:#f0e0ff; border:1px solid #7d4999; border-radius:6px; padding:10px 12px; margin-top:8px; font-size:11.5px; line-height:1.5;">
          <div style="font-weight:bold; color:#ff9ff3; margin-bottom:4px; font-size:12px;">🔥 ハデス死闘場 攻略診断 (超難):</div>
          <div>• <strong>地獄地形ボーナス:</strong> 部隊内 <span style="color:#55efc4; font-weight:bold;">${hellCount}/8体</span> に適用（耐久・攻撃・防御1.3倍 & 巨大化消費気軽減）。</div>
          <div>• <strong>暗闇・自爆対策:</strong> ${statusCounters.length > 0 ? `<span style="color:#55efc4; font-weight:bold;">◯ 状態異常対策持ち城娘: ${statusCounters.join(', ')}</span>` : `<span style="color:#ff7675; font-weight:bold;">⚠️ 状態異常対策なし: 霊魂自爆による暗闇・計略気+2に注意！暗闇無効・回復や気生成役の採用を推奨。</span>`}</div>
          <div>• <strong>戦場ルール:</strong> 再配置時間50秒・気30固定。撤退転戦は不可。継続耐久・回復・不屈持ちが必須です。</div>
        </div>
      `;
    }

    rulesEl.innerHTML = `
      <strong>地形属性:</strong> <span class="badge ${foundStage.terrain !== '無' ? 'badge-' + foundStage.terrain : ''}">${foundStage.terrain}</span>
      ${isHades && foundStage.hadesMeta ? `<span class="badge" style="background:#8e44ad; color:#fff; margin-left:6px;">${foundStage.hadesMeta.soulColor}霊魂 (${foundStage.hadesMeta.depth})</span> <span class="badge" style="background:#27ae60; color:#fff;">超難</span>` : ''}
      ${foundStage.totalDelibPoints ? `<span class="badge" style="background:#6c5ce7; color:#fff; margin-left:4px;">${foundStage.totalDelibPoints}審議 (${foundStage.deliberations.length}件)</span>` : ''}
      ${rulesList.length > 0 ? `<div style="margin-top:6px; max-height:90px; overflow-y:auto; color:#444; background:#fbf9f6; padding:6px; border-radius:4px; border:1px solid #eee;">${rulesList.slice(0, 6).map(r => `• ${r}`).join('<br>')}</div>` : ''}
      ${hadesAnalysisHtml}
    `;

    // Evaluate current party members
    const partyEl = document.getElementById("diagPartyEvaluation");
    partyEl.innerHTML = "";

    if (party.length === 0) {
      partyEl.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:6px;">部隊に城娘が編成されていません。</div>`;
    } else {
      const stTerrain = foundStage.terrain;
      const combinedRules = rulesList.join(" ");

      // Pre-calculate attribute counts in party for placement limits
      const attrCounts = { "平": 0, "水": 0, "山": 0, "平山": 0, "地獄": 0, "無": 0 };
      party.forEach(slot => {
        const c = getCastleById(slot.id);
        if (!c) return;
        (c.attributes || []).forEach(a => {
          if (attrCounts[a] !== undefined) attrCounts[a]++;
        });
      });

      party.forEach((slot, idx) => {
        const c = getCastleById(slot.id);
        if (!c) return;

        let statusBadge = "";
        let comment = "";
        let hasPenalty = false;

        // Check terrain match
        const isTerrainMatch = Boolean(stTerrain && stTerrain !== "無" && c.attributes && c.attributes.includes(stTerrain));
        
        // Check penalties (e.g. 地形不一致ペナルティ, 武器種制限)
        if (combinedRules.includes("巨大化気") && (combinedRules.includes("以外") || combinedRules.includes("異なる")) && !isTerrainMatch && stTerrain !== "無") {
          hasPenalty = true;
          comment += "【ペナルティ】地形不一致により巨大化気倍増などの審議対象。 ";
        }

        // Weapon rangeKind damage 99% down check
        const isMeleeOnly = (c.rangeKind === "近" || c.rangeKind === "近接");
        const isRangedOnly = (c.rangeKind === "遠" || c.rangeKind === "遠隔");

        if (combinedRules.includes("近接限定城娘の与ダメージ99%低下") && isMeleeOnly) {
          hasPenalty = true;
          comment += "【致命的審議】近接限定城娘の与ダメ99%低下に抵触（遠近両用または遠隔城娘を推奨）。 ";
        }
        if (combinedRules.includes("遠隔限定城娘の与ダメージ99%低下") && isRangedOnly) {
          hasPenalty = true;
          comment += "【致命的審議】遠隔限定城娘の与ダメ99%低下に抵触（遠近両用または近接城娘を推奨）。 ";
        }

        // Check weapon reduction
        if (combinedRules.includes(c.weapon) && (combinedRules.includes("低下") || combinedRules.includes("半減") || combinedRules.includes("無効"))) {
          hasPenalty = true;
          comment += `【注意】武器種(${c.weapon})に対する低下審議の可能性あり。 `;
        }

        // Check attribute placement limit deliberation (e.g. 平配置制限（2）)
        (c.attributes || []).forEach(a => {
          const limitRegex = new RegExp(`${a}配置制限[（(](\\d+)[）)]`);
          const m = combinedRules.match(limitRegex);
          if (m) {
            const limit = parseInt(m[1], 10);
            if (attrCounts[a] > limit) {
              hasPenalty = true;
              comment += `【配置制限超過】${a}城娘が現在${attrCounts[a]}体編成されており、制限（${limit}体以降懲罰）を超過。 `;
            }
          }
        });

        if (hasPenalty) {
          statusBadge = `<span class="badge" style="background:#c93434; color:#fff;">✕ 審議抵触の恐れ</span>`;
        } else if (isTerrainMatch) {
          statusBadge = `<span class="badge" style="background:#2c6f4f; color:#fff;">◯ 地形一致・適格</span>`;
          comment += `${stTerrain}属性一致ボーナス（消費気減・ステータス強化）を得られます。`;
        } else {
          statusBadge = `<span class="badge" style="background:#777; color:#fff;">▲ 補正なし</span>`;
          comment += `ペナルティは確認されませんが、地形一致ボーナスはありません。`;
        }

        const itemEl = document.createElement("div");
        itemEl.className = "section-box";
        itemEl.style.padding = "6px 10px";
        itemEl.style.marginTop = "0";
        itemEl.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong>${c.name}</strong>
              <span style="font-size:11px; color:var(--text-sub); margin-left:4px;">★${c.rarity} [${c.subType || c.castleType}]・${c.weapon}</span>
            </div>
            ${statusBadge}
          </div>
          <div style="font-size:11px; color:#555; margin-top:2px;">${comment}</div>
        `;
        partyEl.appendChild(itemEl);
      });
    }

    document.getElementById("modalStageDiagnostic").classList.add("open");
  }

  function filterCastlesForStage(stageTitle, terrain) {
    let t = terrain;
    if (!t || t === "無") {
      if (stageTitle.includes("平山")) t = "平山";
      else if (stageTitle.includes("平")) t = "平";
      else if (stageTitle.includes("山")) t = "山";
      else if (stageTitle.includes("水")) t = "水";
      else if (stageTitle.includes("地獄")) t = "地獄";
      else t = "";
    }

    // Switch to tab-list
    document.querySelector('[data-tab="tab-list"]').click();

    // Set filter
    const typeSel = document.getElementById("filterType");
    if (typeSel && t) {
      typeSel.value = t;
    }
    const searchInput = document.getElementById("searchCastleInput");
    if (searchInput) searchInput.value = "";
    const buffSel = document.getElementById("filterBuffCategory");
    if (buffSel) buffSel.value = "";

    resetPageAndRenderAll();
  }

  const modalDiagCloseBtn = document.getElementById("modalDiagCloseBtn");
  if (modalDiagCloseBtn) {
    modalDiagCloseBtn.addEventListener("click", () => {
      document.getElementById("modalStageDiagnostic").classList.remove("open");
    });
  }

  const btnFilterForStage = document.getElementById("btnFilterForStage");
  if (btnFilterForStage) {
    btnFilterForStage.addEventListener("click", () => {
      document.getElementById("modalStageDiagnostic").classList.remove("open");
      if (activeDiagStage) {
        filterCastlesForStage(activeDiagStage.title, activeDiagStage.terrain);
      }
    });
  }

  // ==========================================
  // Auto-Suggest Party for Stage (Feature 2)
  // ==========================================
  let currentAutoSuggestedParty = [];

  function generateAutoSuggestedParty(stage, ownedOnly) {
    if (!stage) return [];
    const stTerrain = stage.terrain;
    const rulesList = (stage.rules || []).concat((stage.deliberations || []).map(d => `[${d.point}審] ${d.name}: ${d.effect}`));
    const combinedRules = rulesList.join(" ");
    const isHades = Boolean(stage.hadesMeta || stage.subCategory === "ハデスの死闘場");

    let pool = window.SCRE_DATA.slice();
    if (ownedOnly && ownership.owned.size > 0) {
      const ownedPool = pool.filter(c => ownership.owned.has(c.id));
      if (ownedPool.length >= 8) {
        pool = ownedPool;
      }
    }

    // Filter out fatal deliberation violations
    pool = pool.filter(c => {
      const isMeleeOnly = (c.rangeKind === "近" || c.rangeKind === "近接");
      const isRangedOnly = (c.rangeKind === "遠" || c.rangeKind === "遠隔");
      if (combinedRules.includes("近接限定城娘の与ダメージ99%低下") && isMeleeOnly) return false;
      if (combinedRules.includes("遠隔限定城娘の与ダメージ99%低下") && isRangedOnly) return false;
      return true;
    });

    function scoreCastle(c) {
      let score = (c.rarity || 1) * 10;
      const isMatch = Boolean(stTerrain && stTerrain !== "無" && c.attributes && c.attributes.includes(stTerrain));
      if (isMatch) score += 100;

      const descParts = [
        c.skill ? (c.skill.name + " " + c.skill.text) : "",
        c.strategy ? (c.strategy.name + " " + c.strategy.text) : "",
        c.special ? (c.special.name + " " + c.special.text) : ""
      ];
      if (c.allSkills) c.allSkills.forEach(s => descParts.push(s.name + " " + s.text));
      if (c.allStrategies) c.allStrategies.forEach(s => descParts.push(s.name + " " + s.text));
      const full = descParts.join(" ");

      if (isHades && (full.includes("暗闇") || full.includes("状態異常") || (full.includes("無効") && full.includes("状態")))) {
        score += 85;
      }

      if (full.includes("気が") || full.includes("気増加") || full.includes("巨大化に必要な気")) {
        score += 55;
      }
      if (full.includes("与ダメージ") || full.includes("被ダメージ")) {
        score += 30;
      }
      return score;
    }

    pool.sort((a, b) => scoreCastle(b) - scoreCastle(a));

    const selected = [];
    const selectedIds = new Set();

    function tryAdd(filterFn, roleLabel) {
      const match = pool.find(c => !selectedIds.has(c.id) && filterFn(c));
      if (match) {
        selected.push({ castle: match, role: roleLabel });
        selectedIds.add(match.id);
        return true;
      }
      return false;
    }

    // Role 1: Ki generator / reducer
    tryAdd(c => {
      const t = (c.skill ? c.skill.text : '') + ' ' + (c.strategy ? c.strategy.text : '');
      return t.includes("気") || c.weapon === "陣貝";
    }, "気生成・消費軽減");

    // Role 2: Status counter (if Hades or abnormal status)
    if (isHades || combinedRules.includes("状態異常") || combinedRules.includes("暗闇")) {
      tryAdd(c => {
        const descParts = [
          c.skill ? (c.skill.name + " " + c.skill.text) : "",
          c.strategy ? (c.strategy.name + " " + c.strategy.text) : "",
          c.special ? (c.special.name + " " + c.special.text) : ""
        ];
        if (c.allSkills) c.allSkills.forEach(s => descParts.push(s.name + " " + s.text));
        if (c.allStrategies) c.allStrategies.forEach(s => descParts.push(s.name + " " + s.text));
        const full = descParts.join(" ");
        return full.includes("暗闇") || full.includes("状態異常") || (full.includes("無効") && full.includes("状態"));
      }, "暗闇・状態異常対策");
    }

    // Role 3: Strong Melee / Dual Range
    tryAdd(c => (c.rangeKind === "近" || c.rangeKind === "遠近") && c.rarity >= 6, "主力前衛・火力");

    // Role 4: Strong Ranged
    tryAdd(c => (c.rangeKind === "遠" || c.rangeKind === "遠隔") && c.rarity >= 6, "主力遠隔・対空");

    // Role 5: Buffer / Healer / Support
    tryAdd(c => {
      const t = (c.skill ? c.skill.text : '') + ' ' + (c.strategy ? c.strategy.text : '');
      return t.includes("与ダメージ") || t.includes("被ダメージ") || t.includes("射程") || c.weapon === "歌舞";
    }, "支援・バフ・回復");

    // Fill remaining up to 8
    for (const c of pool) {
      if (selected.length >= 8) break;
      if (!selectedIds.has(c.id)) {
        const isMatch = Boolean(stTerrain && stTerrain !== "無" && c.attributes && c.attributes.includes(stTerrain));
        selected.push({ castle: c, role: isMatch ? `${stTerrain}一致・主力` : "汎用主力" });
        selectedIds.add(c.id);
      }
    }

    return selected;
  }

  const btnAutoSuggestParty = document.getElementById("btnAutoSuggestParty");
  if (btnAutoSuggestParty) {
    btnAutoSuggestParty.addEventListener("click", () => {
      if (!activeDiagStage) return;
      const ownedOnly = document.getElementById("chkAutoSuggestOwnedOnly")?.checked;
      const result = generateAutoSuggestedParty(activeDiagStage, ownedOnly);
      currentAutoSuggestedParty = result;

      const container = document.getElementById("autoSuggestResultContainer");
      const listEl = document.getElementById("autoSuggestPartyList");
      const summaryText = document.getElementById("autoSuggestSummaryText");
      const badgeEl = document.getElementById("autoSuggestStatsBadge");

      if (container && listEl && summaryText) {
        listEl.innerHTML = result.map(({ castle: c, role }) => `
          <div style="background:#f4f7fb; border:1px solid #d5e0ee; border-radius:4px; padding:4px 6px; display:flex; align-items:center; gap:6px;">
            ${getIconHtml(c, 28)}
            <div style="overflow:hidden;">
              <div style="font-size:11.5px; font-weight:bold; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${c.name}</div>
              <div style="font-size:9.5px; color:#185a9d; font-weight:bold;">${role}</div>
            </div>
          </div>
        `).join("");

        const matchCount = result.filter(({ castle: c }) => activeDiagStage.terrain && activeDiagStage.terrain !== "無" && c.attributes && c.attributes.includes(activeDiagStage.terrain)).length;
        if (badgeEl) {
          badgeEl.innerHTML = `<span class="badge" style="background:#2c6f4f; color:#fff;">地形一致: ${matchCount}/8体</span>`;
        }

        summaryText.innerHTML = `
          <strong>編成方針:</strong> ${activeDiagStage.title}の審議ギミック・地形条件（${activeDiagStage.terrain}）に合わせて、気生成役・状態異常対策・前衛火力・遠隔支援の役割バランスを最適配分しました。
        `;

        container.style.display = "block";
      }
    });
  }

  const btnCancelAutoSuggest = document.getElementById("btnCancelAutoSuggest");
  if (btnCancelAutoSuggest) {
    btnCancelAutoSuggest.addEventListener("click", () => {
      const container = document.getElementById("autoSuggestResultContainer");
      if (container) container.style.display = "none";
    });
  }

  const btnApplyAutoSuggest = document.getElementById("btnApplyAutoSuggest");
  if (btnApplyAutoSuggest) {
    btnApplyAutoSuggest.addEventListener("click", () => {
      if (currentAutoSuggestedParty.length === 0) return;
      party = currentAutoSuggestedParty.map(({ castle: c }) => ({
        id: c.id,
        strategyOn: true,
        specialOn: Boolean(c.special)
      }));
      partyPresets[currentPresetIdx].party = party;
      if (activeDiagStage && activeDiagStage.terrain && activeDiagStage.terrain !== "無") {
        currentTerrain = activeDiagStage.terrain;
        const sel = document.getElementById("mapTerrainSelect");
        if (sel) sel.value = currentTerrain;
      }
      savePresets();
      renderDashboard();
      renderAllCastles();
      document.getElementById("modalStageDiagnostic").classList.remove("open");
      showNotification("おすすめ編成を現在の部隊に適用しました！");
    });
  }

  // ==========================================
  // Party Share Link (Feature 3)
  // ==========================================
  function getShareUrl() {
    const data = {
      v: 1,
      t: currentTerrain || "",
      p: party.map(s => ({ id: s.id, s: s.strategyOn ? 1 : 0 }))
    };
    const jsonStr = JSON.stringify(data);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    return window.location.href.split("#")[0] + "#share=" + b64;
  }

  function copyShareUrl() {
    const url = getShareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showNotification("共有リンクをクリップボードにコピーしました！");
      }).catch(() => {
        prompt("共有リンクです（コピーして共有してください）:", url);
      });
    } else {
      prompt("共有リンクです（コピーして共有してください）:", url);
    }
  }

  function checkShareUrlOnLoad() {
    if (!window.location.hash || !window.location.hash.startsWith("#share=")) return;
    try {
      const b64 = window.location.hash.replace("#share=", "");
      const jsonStr = decodeURIComponent(escape(atob(b64)));
      const data = JSON.parse(jsonStr);
      if (data && Array.isArray(data.p)) {
        // (1) Validate existence of IDs via getCastleById
        const validParty = [];
        const invalidIds = [];
        data.p.forEach(item => {
          if (item && item.id) {
            const castle = getCastleById(item.id);
            if (castle) {
              validParty.push({ id: item.id, strategyOn: Boolean(item.s) });
            } else {
              invalidIds.push(item.id);
            }
          }
        });

        if (validParty.length === 0) {
          showNotification("共有リンク内に有効な城娘データが見つかりませんでした。", true);
          history.replaceState(null, "", window.location.pathname + window.location.search);
          return;
        }

        // (2) Confirm dialog before overwriting current preset
        const currentPresetName = partyPresets[currentPresetIdx]?.name || `部隊${currentPresetIdx + 1}`;
        const validNames = validParty.map(p => {
          const c = getCastleById(p.id);
          return c ? c.name : p.id;
        }).join("、");

        let confirmMsg = `共有リンクから部隊編成を復元しますか？\n\n【読み込む城娘 (${validParty.length}体)】\n${validNames}`;
        if (invalidIds.length > 0) {
          confirmMsg += `\n\n※以下の未収録・存在しない城娘は除外されます:\n${invalidIds.join("、")}`;
        }
        confirmMsg += `\n\n※現在の編成「${currentPresetName}」は上書きされます。`;

        if (!confirm(confirmMsg)) {
          // Cancelled: do not modify party or saved presets
          history.replaceState(null, "", window.location.pathname + window.location.search);
          return;
        }

        party = validParty;
        partyPresets[currentPresetIdx].party = party;
        if (data.t !== undefined) {
          currentTerrain = data.t;
          const sel = document.getElementById("mapTerrainSelect");
          if (sel) sel.value = currentTerrain;
        }
        savePresets();
        renderDashboard();
        renderAllCastles();
        history.replaceState(null, "", window.location.pathname + window.location.search);

        if (invalidIds.length > 0) {
          showNotification(`共有リンクを復元しました（未存在の城娘を除外: ${invalidIds.join("、")}）`, true);
        } else {
          showNotification("共有リンクから部隊編成を復元しました！");
        }
      }
    } catch (err) {
      console.warn("Error parsing share hash:", err);
      showNotification("共有リンクの解析に失敗しました。", true);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  window.addEventListener("hashchange", checkShareUrlOnLoad);

  const btnShareLink = document.getElementById("btnShareLink");
  if (btnShareLink) {
    btnShareLink.addEventListener("click", copyShareUrl);
  }

  // ==========================================
  // Preset Comparison View (Feature 4)
  // ==========================================
  function openPresetCompareModal() {
    const modal = document.getElementById("modalPresetCompare");
    if (!modal) return;
    const selA = document.getElementById("comparePresetA");
    const selB = document.getElementById("comparePresetB");
    if (selA && selB) {
      selA.innerHTML = partyPresets.map((p, idx) => `<option value="${idx}" ${idx === currentPresetIdx ? 'selected' : ''}>${p.name} (${p.party.length}体)</option>`).join("");
      const defaultB = currentPresetIdx === 0 ? 1 : 0;
      selB.innerHTML = partyPresets.map((p, idx) => `<option value="${idx}" ${idx === defaultB ? 'selected' : ''}>${p.name} (${p.party.length}体)</option>`).join("");
    }
    updatePresetComparison();
    modal.classList.add("open");
  }

  function updatePresetComparison() {
    const selA = document.getElementById("comparePresetA");
    const selB = document.getElementById("comparePresetB");
    if (!selA || !selB) return;
    const idxA = parseInt(selA.value, 10) || 0;
    const idxB = parseInt(selB.value, 10) || 0;
    renderPresetComparison(idxA, idxB);
  }

  function renderPresetComparison(idxA, idxB) {
    const container = document.getElementById("compareContentContainer");
    if (!container) return;

    const pA = partyPresets[idxA];
    const pB = partyPresets[idxB];

    const calcA = calculateBuffs(pA.party, currentTerrain);
    const calcB = calculateBuffs(pB.party, currentTerrain);

    const kiDiff = calcB.totalGiantCost - calcA.totalGiantCost;
    const deployDiff = calcB.totalDeployCost - calcA.totalDeployCost;

    const statsList = [
      { key: "atkPercent", label: "攻撃(%) 上昇", unit: "%" },
      { key: "atkFlat", label: "攻撃(固定値) 上昇", unit: "" },
      { key: "defPercent", label: "防御(%) 上昇", unit: "%" },
      { key: "defFlat", label: "防御(固定値) 上昇", unit: "" },
      { key: "hpPercent", label: "耐久(%) 上昇", unit: "%" },
      { key: "rangeFlat", label: "射程(固定値) 上昇", unit: "" },
      { key: "rangePercent", label: "射程(%) 上昇", unit: "%" },
      { key: "dmgDealt", label: "与ダメージ 上昇", unit: "%" },
      { key: "dmgTakenDown", label: "被ダメージ 軽減", unit: "%" },
      { key: "atkSpeed", label: "攻撃速度 上昇", unit: "%" },
      { key: "gapShorten", label: "隙短縮", unit: "%" },
      { key: "recoveryFlat", label: "回復(固定値) 上昇", unit: "" }
    ];

    function getBuffAvg(calc, statKey) {
      let sum = 0;
      let count = 0;
      Object.values(calc.perCastle).forEach(pc => {
        const b = pc.buffs[statKey];
        if (b) {
          sum += (b.sum !== undefined ? b.sum : (b.max + (b.stackSum || 0)));
          count++;
        }
      });
      return count > 0 ? Math.round(sum / count) : 0;
    }

    function renderSlotsMini(partyList) {
      if (!partyList || partyList.length === 0) return '<div style="color:#999;font-size:11px;padding:6px;">メンバーなし</div>';
      return partyList.map(s => {
        const c = getCastleById(s.id);
        if (!c) return '';
        return `<div style="display:inline-flex; align-items:center; gap:4px; background:#fff; border:1px solid #ddd; border-radius:4px; padding:2px 6px; font-size:11px; margin:2px;">
          ${getIconHtml(c, 20)}
          <span>${c.name}</span>
        </div>`;
      }).join("");
    }

    const tableRows = statsList.map(st => {
      const valA = getBuffAvg(calcA, st.key);
      const valB = getBuffAvg(calcB, st.key);
      const diff = valB - valA;
      let diffClass = "diff-zero";
      let diffText = "±0";
      if (diff > 0) {
        diffClass = "diff-plus";
        diffText = `+${diff}${st.unit}`;
      } else if (diff < 0) {
        diffClass = "diff-minus";
        diffText = `${diff}${st.unit}`;
      }
      return `
        <tr>
          <td style="font-weight:bold; text-align:left;">${st.label}</td>
          <td>+${valA}${st.unit}</td>
          <td>+${valB}${st.unit}</td>
          <td class="${diffClass}">${diffText}</td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div class="compare-container">
        <div class="compare-summary-cards">
          <div class="compare-card">
            <div class="compare-card-title">総消費気 (配置+最大巨大化)</div>
            <div class="compare-card-value">
              <span style="color:#2980b9;">${calcA.totalGiantCost}気</span> vs <span style="color:#e67e22;">${calcB.totalGiantCost}気</span>
              <div style="font-size:11px; margin-top:2px;" class="${kiDiff < 0 ? 'diff-plus' : (kiDiff > 0 ? 'diff-minus' : 'diff-zero')}">
                差分: ${kiDiff > 0 ? '+' + kiDiff : kiDiff}気
              </div>
            </div>
          </div>
          <div class="compare-card">
            <div class="compare-card-title">初期配置気</div>
            <div class="compare-card-value">
              <span style="color:#2980b9;">${calcA.totalDeployCost}気</span> vs <span style="color:#e67e22;">${calcB.totalDeployCost}気</span>
              <div style="font-size:11px; margin-top:2px;" class="${deployDiff < 0 ? 'diff-plus' : (deployDiff > 0 ? 'diff-minus' : 'diff-zero')}">
                差分: ${deployDiff > 0 ? '+' + deployDiff : deployDiff}気
              </div>
            </div>
          </div>
          <div class="compare-card">
            <div class="compare-card-title">出撃地形一致 (${currentTerrain || '指定なし'})</div>
            <div class="compare-card-value">
              <span style="color:#2980b9;">${calcA.terrainMatchCount}/8体</span> vs <span style="color:#e67e22;">${calcB.terrainMatchCount}/8体</span>
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:#f7f9fa; border:1px solid #e1e8ed; border-radius:6px; padding:8px;">
          <div>
            <strong style="font-size:11.5px; color:#2980b9;">[A] ${pA.name} メンバー:</strong>
            <div style="margin-top:4px;">${renderSlotsMini(pA.party)}</div>
          </div>
          <div>
            <strong style="font-size:11.5px; color:#e67e22;">[B] ${pB.name} メンバー:</strong>
            <div style="margin-top:4px;">${renderSlotsMini(pB.party)}</div>
          </div>
        </div>

        <table class="compare-table">
          <thead>
            <tr>
              <th style="text-align:left;">バフ効果 (部隊平均値)</th>
              <th style="color:#2980b9;">[A] ${pA.name}</th>
              <th style="color:#e67e22;">[B] ${pB.name}</th>
              <th>差分 (B - A)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
  }

  const btnOpenPresetCompare = document.getElementById("btnOpenPresetCompare");
  if (btnOpenPresetCompare) {
    btnOpenPresetCompare.addEventListener("click", openPresetCompareModal);
  }
  const modalCompareCloseBtn = document.getElementById("modalCompareCloseBtn");
  if (modalCompareCloseBtn) {
    modalCompareCloseBtn.addEventListener("click", () => {
      document.getElementById("modalPresetCompare").classList.remove("open");
    });
  }
  const selCompareA = document.getElementById("comparePresetA");
  const selCompareB = document.getElementById("comparePresetB");
  if (selCompareA) selCompareA.addEventListener("change", updatePresetComparison);
  if (selCompareB) selCompareB.addEventListener("change", updatePresetComparison);

  // ==========================================
  // Placement Order & Giantize Simulation (Feature 5)
  // ==========================================
  function calculateGiantizeSimulation() {
    const tbody = document.getElementById("giantizeSimTbody");
    const summaryEl = document.getElementById("giantizeSimSummary");
    if (!tbody || !summaryEl) return;

    const initialKi = Math.max(0, parseInt(document.getElementById("simInitialKi")?.value, 10) || 30);
    const kiRate = parseFloat(document.getElementById("simKiRate")?.value) || 1.0;
    const priorityMode = document.getElementById("simPriorityMode")?.value || "ki_first";

    if (party.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:12px;color:#999;">部隊に城娘が編成されていません。</td></tr>`;
      summaryEl.textContent = "";
      return;
    }

    const partyCastles = party.map((s, idx) => {
      const c = getCastleById(s.id);
      if (!c) return null;
      const isTerrainMatch = Boolean(currentTerrain && c.attributes && c.attributes.includes(currentTerrain));
      const deployCost = c.cost || 10;
      const rawGiantCost = (c.statsDetail && c.statsDetail.giant5 && c.statsDetail.giant5.cost) ? parseInt(c.statsDetail.giant5.cost, 10) : 60;
      const giantTotal = isTerrainMatch ? Math.round(deployCost + (rawGiantCost - deployCost) * 0.65) : rawGiantCost;
      const giantPerStep = Math.max(1, Math.round((giantTotal - deployCost) / 5));

      const allText = (c.skill ? c.skill.text : '') + ' ' + (c.strategy ? c.strategy.text : '');
      const isKiProducer = allText.includes("気が") || allText.includes("気増加") || allText.includes("巨大化に必要な気");

      return {
        slotIdx: idx,
        castle: c,
        deployCost,
        giantTotal,
        giantPerStep,
        isTerrainMatch,
        isKiProducer
      };
    }).filter(Boolean);

    if (partyCastles.length === 0) return;

    let deployOrder = partyCastles.slice();
    if (priorityMode === "ki_first") {
      deployOrder.sort((a, b) => {
        if (a.isKiProducer && !b.isKiProducer) return -1;
        if (!a.isKiProducer && b.isKiProducer) return 1;
        return a.deployCost - b.deployCost;
      });
    }

    let currentSec = 0;
    let currentKi = initialKi;
    const timeline = [];

    function waitForKi(neededKi) {
      if (currentKi < neededKi) {
        const deficit = neededKi - currentKi;
        const waitSec = Math.ceil(deficit / kiRate);
        currentSec += waitSec;
        currentKi += waitSec * kiRate;
      }
    }

    deployOrder.forEach(item => {
      waitForKi(item.deployCost);
      currentKi -= item.deployCost;
      timeline.push({
        sec: currentSec,
        typeBadge: '<span class="timeline-badge-deploy">配置</span>',
        castleName: item.castle.name,
        costSpent: item.deployCost,
        kiRemaining: Math.floor(currentKi),
        note: item.isKiProducer ? "★気生成役を優先配置" : (item.isTerrainMatch ? `${currentTerrain}一致配置` : "通常配置")
      });
    });

    const deployFinishSec = currentSec;

    let giantizeOrder = deployOrder.slice();
    if (priorityMode === "ki_first") {
      giantizeOrder.sort((a, b) => {
        if (a.isKiProducer && !b.isKiProducer) return -1;
        if (!a.isKiProducer && b.isKiProducer) return 1;
        return a.giantPerStep - b.giantPerStep;
      });
    }

    giantizeOrder.forEach(item => {
      for (let step = 1; step <= 5; step++) {
        waitForKi(item.giantPerStep);
        currentKi -= item.giantPerStep;
        timeline.push({
          sec: currentSec,
          typeBadge: `<span class="timeline-badge-giant">巨大化 ${step}/5</span>`,
          castleName: item.castle.name,
          costSpent: item.giantPerStep,
          kiRemaining: Math.floor(currentKi),
          note: step === 5 ? (item.isKiProducer ? "★特技全開・気加速完了" : "最大巨大化完了") : `巨大化段階 ${step}`
        });
      }
    });

    const totalFinishSec = currentSec;

    function formatSec(sec) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    summaryEl.innerHTML = `
      🏁 全${partyCastles.length}体 配置完了: <strong>${formatSec(deployFinishSec)}</strong> ｜ 
      ✨ 全員最大巨大化完了: <strong>${formatSec(totalFinishSec)}</strong> (所要時間: 約${Math.ceil(totalFinishSec / 60)}分)
    `;

    tbody.innerHTML = timeline.map(row => `
      <tr>
        <td style="font-weight:bold; color:#555;">${formatSec(row.sec)}</td>
        <td>${row.typeBadge}</td>
        <td><strong>${row.castleName}</strong></td>
        <td style="color:#c93434; font-weight:bold;">-${row.costSpent}</td>
        <td style="color:#27ae60; font-weight:bold;">${row.kiRemaining}</td>
        <td style="color:#666; font-size:11px;">${row.note}</td>
      </tr>
    `).join("");
  }

  const giantizeSimHeader = document.getElementById("giantizeSimHeader");
  const btnToggleGiantizeSim = document.getElementById("btnToggleGiantizeSim");
  function toggleGiantizeSim() {
    const body = document.getElementById("giantizeSimBody");
    const btn = document.getElementById("btnToggleGiantizeSim");
    if (!body) return;
    const isHidden = (body.style.display === "none" || getComputedStyle(body).display === "none");
    body.style.display = isHidden ? "block" : "none";
    if (btn) btn.textContent = isHidden ? "閉じる ▴" : "展開 ▾";
    if (isHidden) calculateGiantizeSimulation();
  }
  if (giantizeSimHeader) {
    giantizeSimHeader.addEventListener("click", () => {
      toggleGiantizeSim();
    });
  }
  if (btnToggleGiantizeSim) {
    btnToggleGiantizeSim.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleGiantizeSim();
    });
  }
  const btnRunGiantizeSim = document.getElementById("btnRunGiantizeSim");
  if (btnRunGiantizeSim) btnRunGiantizeSim.addEventListener("click", calculateGiantizeSimulation);

  // Export Party Summary Image (Canvas 1200x675)
  function exportPartyImage() {
    const canvas = document.getElementById("partyCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = 1200;
    const height = 675;
    canvas.width = width;
    canvas.height = height;

    const calcResult = calculateBuffs();
    const presetName = partyPresets[currentPresetIdx].name;
    const terrainLabel = currentTerrain ? `${currentTerrain}属性` : "指定なし";

    // 1. Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "#231818");
    bgGrad.addColorStop(0.5, "#181212");
    bgGrad.addColorStop(1, "#100c0c");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative inner border
    ctx.strokeStyle = "rgba(191, 161, 95, 0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(15, 15, width - 30, height - 30);
    ctx.strokeStyle = "rgba(191, 161, 95, 0.15)";
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // 2. Header
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("城プロRE 部隊編成＆バフ・デバフ総合サマリー", 36, 52);

    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#dfc8a5";
    ctx.fillText(`${presetName}  |  出撃地形: ${terrainLabel}  |  総消費気: ${calcResult.totalGiantCost}気 (配置: ${calcResult.totalDeployCost}気)`, 36, 78);

    // Date
    const dateStr = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
    ctx.fillStyle = "#888888";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`出力日時: ${dateStr}  |  城プロRE 編成支援ツール`, width - 36, 52);
    ctx.textAlign = "left";

    // 3. Left Section: 8 Party Slots (Grid: 2 cols x 4 rows)
    const slotW = 310;
    const slotH = 110;
    const startX = 36;
    const startY = 100;

    for (let i = 0; i < 8; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = startX + col * (slotW + 16);
      const y = startY + row * (slotH + 12);

      const slot = party[i];
      const castle = slot ? getCastleById(slot.id) : null;
      const calc = (castle && calcResult.perCastle[castle.id]) ? calcResult.perCastle[castle.id].calculatedStats : null;

      // Slot Box Background
      ctx.fillStyle = castle ? "rgba(45, 35, 35, 0.85)" : "rgba(30, 25, 25, 0.4)";
      ctx.strokeStyle = castle ? "rgba(191, 161, 95, 0.3)" : "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, slotW, slotH, 6);
      ctx.fill();
      ctx.stroke();

      if (castle) {
        // Icon Box
        ctx.fillStyle = "#333333";
        ctx.beginPath();
        ctx.roundRect(x + 10, y + 10, 50, 50, 4);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(castle.weapon ? castle.weapon[0] : "城", x + 35, y + 42);
        ctx.textAlign = "left";

        // Castle Name & Rarity
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 15px sans-serif";
        const nameText = castle.name.length > 10 ? castle.name.slice(0, 9) + "…" : castle.name;
        ctx.fillText(nameText, x + 68, y + 28);

        // Sub badges
        ctx.fillStyle = "#e0a13c";
        ctx.font = "12px sans-serif";
        ctx.fillText(`★${castle.rarity}`, x + 68, y + 48);

        ctx.fillStyle = "#78b878";
        ctx.fillText(`[${castle.subType || castle.castleType}]`, x + 100, y + 48);

        ctx.fillStyle = "#cccccc";
        ctx.fillText(`${castle.weapon} (${castle.rangeKind || '近'})`, x + 165, y + 48);

        // Stats Row
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x + 10, y + 68, slotW - 20, 32);

        if (calc) {
          ctx.font = "12px sans-serif";
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`攻: `, x + 16, y + 89);
          ctx.fillStyle = "#55d677";
          ctx.font = "bold 13px sans-serif";
          ctx.fillText(`${calc.atk}`, x + 38, y + 89);

          ctx.font = "12px sans-serif";
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`射: `, x + 90, y + 89);
          ctx.fillStyle = "#55d677";
          ctx.font = "bold 13px sans-serif";
          ctx.fillText(`${calc.range}`, x + 110, y + 89);

          ctx.font = "12px sans-serif";
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`1撃: `, x + 160, y + 89);
          ctx.fillStyle = "#ffb055";
          ctx.font = "bold 13px sans-serif";
          ctx.fillText(`${calc.singleHit}`, x + 188, y + 89);

          if (calc.isTerrainMatch) {
            ctx.fillStyle = "#2c8f5f";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText("✓一致", x + 258, y + 89);
          }
        }
      } else {
        ctx.fillStyle = "#666666";
        ctx.font = "13px sans-serif";
        ctx.fillText(`[枠 ${i + 1}] 未編成`, x + 18, y + 60);
      }
    }

    // 4. Right Section: Buff Coverage & Debuffs (Width 440px)
    const rightX = 724;
    const rightY = 100;
    const rightW = 440;
    const rightH = 476;

    ctx.fillStyle = "rgba(35, 28, 28, 0.85)";
    ctx.strokeStyle = "rgba(191, 161, 95, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rightX, rightY, rightW, rightH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#dfc8a5";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("バフ・デバフ網羅度チェック", rightX + 16, rightY + 30);

    const checklist = window.SCRE_RULES.checklist;
    const { perCastle, enemyDebuffs } = calcResult;

    checklist.forEach((item, idx) => {
      let isCovered = false;
      let sumText = "";

      if (item.key.startsWith("enemy")) {
        isCovered = enemyDebuffs[item.key] && enemyDebuffs[item.key].max > 0;
        if (isCovered) sumText = `-${enemyDebuffs[item.key].max}%`;
      } else {
        for (const cid in perCastle) {
          const b = perCastle[cid].buffs;
          if (item.key === "atkFlat" && b.atkFlat.sum > 0) { isCovered = true; sumText = `+${b.atkFlat.sum}`; }
          else if (item.key === "rangeFlat" && b.rangeFlat.sum > 0) { isCovered = true; sumText = `+${b.rangeFlat.sum}`; }
          else if (item.key === "defIgnore" && b.defIgnore.length > 0) { isCovered = true; sumText = "発動中"; }
          else if (b[item.key] && (b[item.key].max > 0 || b[item.key].stackSum > 0)) {
            isCovered = true;
            sumText = `+${b[item.key].max + b[item.key].stackSum}%`;
          }
        }
      }

      const itemY = rightY + 62 + idx * 34;

      ctx.fillStyle = isCovered ? "#55d677" : "#888888";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(isCovered ? "✓" : "×", rightX + 20, itemY);

      ctx.fillStyle = isCovered ? "#ffffff" : "#999999";
      ctx.font = "13px sans-serif";
      ctx.fillText(item.label, rightX + 42, itemY);

      if (isCovered && sumText) {
        ctx.fillStyle = item.key.startsWith("enemy") ? "#ff7777" : "#55d677";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(sumText, rightX + rightW - 20, itemY);
        ctx.textAlign = "left";
      } else {
        ctx.fillStyle = "#666666";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("未編成", rightX + rightW - 20, itemY);
        ctx.textAlign = "left";
      }

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(rightX + 16, itemY + 8);
      ctx.lineTo(rightX + rightW - 16, itemY + 8);
      ctx.stroke();
    });

    // 5. Download PNG
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `城プロRE_${presetName.replace(/\s+/g, '_')}_編成.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  const btnExportImg = document.getElementById("btnExportImage");
  if (btnExportImg) {
    btnExportImg.addEventListener("click", exportPartyImage);
  }

  // Initial render
  loadOwnership();
  populateDashboardStageSelect();
  checkShareUrlOnLoad();
  const appInfoCountEl = document.getElementById("appInfoCastleCount");
  if (appInfoCountEl && window.SCRE_DATA) {
    appInfoCountEl.textContent = window.SCRE_DATA.length.toLocaleString();
  }
  renderPresetBar();
  renderDashboard();
})();
