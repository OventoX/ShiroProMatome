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
  const showToast = (msg, isWarning = false) => showNotification(msg, isWarning);
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

  
  // ==========================================
  // Stage Progress & Saved Parties (プロンプト2)
  // ==========================================
  const STAGE_PROGRESS_STORAGE_KEY = "scre-helper:stage-progress:v1";

  function getStageProgressData() {
    try {
      const raw = localStorage.getItem(STAGE_PROGRESS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn("Stage progress load error:", e);
      return {};
    }
  }

  function saveStageProgressData(data) {
    try {
      localStorage.setItem(STAGE_PROGRESS_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Stage progress save error:", e);
    }
  }

  function toggleStageCleared(stageTitle, forceStatus = null) {
    const data = getStageProgressData();
    const existing = data[stageTitle] || {};
    const newStatus = (forceStatus !== null) ? forceStatus : !existing.cleared;
    data[stageTitle] = {
      cleared: newStatus,
      party: existing.party || (newStatus ? party.map(s => s.id).filter(Boolean) : []),
      savedAt: new Date().toISOString()
    };
    saveStageProgressData(data);
    renderGuidesTab();
  }

  function savePartyForStage(stageTitle) {
    const data = getStageProgressData();
    const partyIds = party.map(s => s.id).filter(Boolean);
    data[stageTitle] = {
      cleared: true,
      party: partyIds,
      savedAt: new Date().toISOString()
    };
    saveStageProgressData(data);
    showToast(`✅ 【${stageTitle}】のクリア編成（${partyIds.length}体）を保存しました`);
    renderGuidesTab();
  }

  function restorePartyFromStage(stageTitle) {
    const data = getStageProgressData();
    const record = data[stageTitle];
    if (!record || !record.party || record.party.length === 0) {
      showToast("⚠️ 保存されたクリア編成がありません");
      return;
    }

    // Validate IDs
    const validCastles = [];
    const missingIds = [];
    record.party.forEach(id => {
      const c = getCastleById(id);
      if (c) validCastles.push(c);
      else missingIds.push(id);
    });

    if (validCastles.length === 0) {
      showToast("⚠️ クリア編成内の城娘データが見つかりませんでした");
      return;
    }

    const confirmMsg = `【${stageTitle}】のクリア編成を復元しますか？\n\n【読み込む城娘 (${validCastles.length}体)】\n${validCastles.map(c => c.name).join("、")}\n\n※現在の編成は上書きされます。`;
    if (!window.confirm(confirmMsg)) return;

    if (missingIds.length > 0) {
      showToast(`⚠️ 一部未存在の城娘を除外して復元しました: ${missingIds.join('、')}`);
    }

    party = validCastles.slice(0, 8).map(c => ({
      id: c.id,
      strategyOn: true,
      specialOn: !!c.special
    }));
    saveParty();
    renderDashboard();
    showToast(`✅ 【${stageTitle}】のクリア編成を復元しました`);
  }

  // ==========================================
  // Kana Normalization & Search Matcher (プロンプト1)
  // ==========================================
  function toHiragana(str) {
    return (str || "").replace(/[\u30a1-\u30f6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));
  }

  function matchCastleNameOrRuby(castle, query) {
    if (!query) return true;
    const qLower = query.toLowerCase();
    const qHira = toHiragana(qLower);

    // 1. Direct name match
    if (castle.name && castle.name.toLowerCase().includes(qLower)) return true;

    // 2. Ruby match (hiragana <=> katakana)
    if (castle.ruby) {
      const rLower = castle.ruby.toLowerCase();
      const rHira = toHiragana(rLower);
      if (rLower.includes(qLower) || rHira.includes(qHira) || rHira.includes(qLower)) return true;
    }

    // 3. Name kana match
    if (castle.name) {
      const nameHira = toHiragana(castle.name.toLowerCase());
      if (nameHira.includes(qHira)) return true;
    }

    return false;
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

    
    // Evaluate buff conflict / applied status (プロンプト4: 憶測で仕様を変えず、既存の最大値/加算ルールに従ってフラグ付け)
    const percentKeys = ["atkPercent", "defPercent", "rangePercent", "hpPercent", "dmgDealt", "dmgDealtTarget", "dmgTakenDown", "atkSpeed", "gapShorten"];
    for (const cid in perCastle) {
      const b = perCastle[cid].buffs;
      percentKeys.forEach(key => {
        const bucket = b[key];
        if (!bucket || !bucket.sources) return;
        let maxApplied = false;
        bucket.sources.forEach(s => {
          if (s.stackable) {
            s.applied = true;
          } else if (bucket.max > 0 && s.val === bucket.max && !maxApplied) {
            s.applied = true;
            maxApplied = true;
          } else {
            s.applied = false;
            s.conflictReason = "同種バフと重なりのため未適用 (最大値優先)";
          }
        });
      });
      // Flat buffs and shares always stack
      ["atkFlat", "defFlat", "rangeFlat", "hpFlat", "recoveryFlat"].forEach(k => {
        if (b[k] && b[k].items) {
          b[k].items.forEach(it => { it.applied = true; });
        }
      });
      if (b.shares) {
        b.shares.forEach(sh => { sh.applied = true; });
      }
    }

    // Evaluate enemy debuff conflicts
    for (const debKey in enemyDebuffs) {
      const deb = enemyDebuffs[debKey];
      let maxApplied = false;
      deb.sources.forEach(s => {
        if (deb.max > 0 && s.val === deb.max && !maxApplied) {
          s.applied = true;
          maxApplied = true;
        } else {
          s.applied = false;
          s.conflictReason = "同種バフと重なりのため未適用 (最大値優先)";
        }
      });
    }

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
    renderCoveragePanel(calcResult);
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
    renderKiCostBreakdown(calcResult);
  }

  
  // ==========================================
  // Ki Cost Breakdown Table & Support Note (プロンプト5)
  // ==========================================
  function renderKiCostBreakdown(calcResult) {
    const container = document.getElementById("partyKiCostBreakdown");
    if (!container) return;

    const { activePartyMembers, totalDeployCost, totalGiantCost, matchCount } = calcResult || calculateBuffs();
    if (!activePartyMembers || activePartyMembers.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted); font-size:11px; padding:4px 0;">編成に城娘を追加すると、配置・巨大化気の内訳と気支援効果が表示されます。</div>`;
      return;
    }

    const rowsHtml = activePartyMembers.map(({ slot, castle }) => {
      const calc = calcResult.perCastle[castle.id]?.calculatedStats;
      const deployCost = calc ? calc.deployCost : (castle.cost || 10);
      const totalCost = calc ? calc.actualGiantCost : (deployCost * 8);
      const giantOnlyCost = Math.max(0, totalCost - deployCost);
      const isMatch = calc ? calc.isTerrainMatch : false;
      const attrStr = castle.subType || castle.castleType || "-";

      const matchBadge = isMatch 
        ? `<span class="badge" style="background:#2c6f4f; color:#fff; font-size:9.5px; padding:1px 4px;" title="出撃地形一致: 巨大化消費気35%減">✓35%減</span>` 
        : `<span style="color:#999; font-size:10px;">-</span>`;

      return `
        <tr>
          <td style="text-align:left; font-weight:bold; white-space:nowrap;">
            <div style="display:flex; align-items:center; gap:4px;">
              ${getIconHtml(castle, 20)}
              <span style="font-size:11px;">${castle.name}</span>
            </div>
          </td>
          <td><span class="badge" style="font-size:9.5px;">${attrStr}</span></td>
          <td style="font-weight:bold;">${deployCost}</td>
          <td>${giantOnlyCost}</td>
          <td style="font-weight:bold; color:var(--primary-color);">${totalCost}</td>
          <td>${matchBadge}</td>
        </tr>
      `;
    }).join("");

    const giantTotalOnly = Math.max(0, totalGiantCost - totalDeployCost);
    const matchSummaryText = currentTerrain ? `${matchCount}/${activePartyMembers.length}体一致` : "-";

    // Detect Ki supporters
    const kiSupporters = [];
    activePartyMembers.forEach(({ slot, castle }) => {
      const notes = [];
      if (castle.skill) {
        const text = castle.skill.text || "";
        const name = castle.skill.name || "";
        if (text.includes("気") || name.includes("気")) {
          notes.push(`特技: ${name}`);
        }
      }
      if (slot.strategyOn && castle.strategy) {
        const text = castle.strategy.text || "";
        const name = castle.strategy.name || "";
        if (text.includes("気") || name.includes("気")) {
          notes.push(`計略: ${name}`);
        }
      }
      if (slot.specialOn && castle.special) {
        const text = castle.special.text || "";
        const name = castle.special.name || "";
        if (text.includes("気") || name.includes("気")) {
          notes.push(`特殊: ${name}`);
        }
      }
      if (notes.length > 0) {
        kiSupporters.push({ name: castle.name, note: notes.join(" / ") });
      }
    });

    let kiSupportHtml = "";
    if (kiSupporters.length > 0) {
      kiSupportHtml = `
        <div class="ki-support-box">
          <div class="ki-support-title">⚡ 編成内の気関連・気支援能力 (${kiSupporters.length}体)</div>
          ${kiSupporters.map(k => `<div>• <strong>${k.name}</strong>: <span style="color:#2c3e50;">${k.note}</span></div>`).join("")}
        </div>
      `;
    }

    container.innerHTML = `
      <table class="cost-breakdown-table">
        <thead>
          <tr>
            <th style="text-align:left;">城娘</th>
            <th>地形</th>
            <th>配置気</th>
            <th>巨大化気</th>
            <th>合計気</th>
            <th>地形一致</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr style="background:#f9f6f0; font-weight:bold; border-top:2px solid #dfd5c7;">
            <td style="text-align:left;">部隊合計</td>
            <td>-</td>
            <td style="color:var(--primary-color);">${totalDeployCost}</td>
            <td>${giantTotalOnly}</td>
            <td style="color:var(--primary-color); font-size:12px;">${totalGiantCost}</td>
            <td style="font-size:10px;">${matchSummaryText}</td>
          </tr>
        </tbody>
      </table>
      ${kiSupportHtml}
      <div style="font-size:10px; color:#888; margin-top:5px; line-height:1.3;">
        ※ 巨大化気は地形一致時0.65倍の近似計算です（巨大化シミュレータと連動）。
      </div>
    `;
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

      const itemsHtml = (bucket.sources || []).map(s => {
        let tag = "";
        let style = "";
        let nameHtml = "";
        if (s.stackable) {
          tag = `<span class="buff-tag">[加算]</span>`;
          style = "color:var(--buff-color); font-weight:bold;";
          nameHtml = `<strong>${s.from}</strong>`;
        } else if (s.applied !== false) {
          tag = `<span class="buff-tag">[最大値適用]</span>`;
          style = "color:var(--buff-color); font-weight:bold;";
          nameHtml = `<strong>${s.from}</strong>`;
        } else {
          tag = `<span class="buff-tag-unapplied" title="同種バフと重なりのため未適用 (最大値優先)">[未適用]</span>`;
          style = "color:var(--text-muted);";
          const tooltip = s.conflictReason || "同種バフと重なりのため未適用 (最大値優先)";
          nameHtml = `<span class="buff-source-unapplied" title="${tooltip}"><s>${s.from}</s></span>`;
        }
        return `<div style="margin-bottom:2px;"><span style="${style}">${tag} +${s.val}%</span>: ${nameHtml} [${s.type}] <span style="color:#666;">(${s.raw})</span></div>`;
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

      const itemsHtml = (bucket.sources || []).map(s => {
        let tag = "";
        let style = "";
        let nameHtml = "";
        if (s.applied !== false) {
          tag = `<span class="buff-tag">[最大値適用]</span>`;
          style = "color:var(--debuff-color); font-weight:bold;";
          nameHtml = `<strong>${s.from}</strong>`;
        } else {
          tag = `<span class="buff-tag-unapplied" title="同種バフと重なりのため未適用 (最大値優先)">[未適用]</span>`;
          style = "color:var(--text-muted);";
          const tooltip = s.conflictReason || "同種バフと重なりのため未適用 (最大値優先)";
          nameHtml = `<span class="buff-source-unapplied" title="${tooltip}"><s>${s.from}</s></span>`;
        }
        return `<div style="margin-bottom:2px;"><span style="${style}">${tag} ${sign}${s.val}%</span>: ${nameHtml} [${s.type}] <span style="color:#666;">(${s.raw})</span></div>`;
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

// ==========================================
  // Attribute & Weapon Coverage Diagnostic (プロンプト3)
  // ==========================================
  function renderCoveragePanel(calcResult) {
    const container = document.getElementById("partyCoveragePanel");
    if (!container) return;

    const { activePartyMembers } = calcResult || calculateBuffs();
    if (!activePartyMembers || activePartyMembers.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted); font-size:11px;">編成に城娘を追加すると、属性・武器種・配置距離の網羅状況を診断します。</div>`;
      return;
    }

    const attrCounts = {};
    const weaponCounts = {};
    let nearCount = 0;
    let farCount = 0;
    let bothCount = 0;

    activePartyMembers.forEach(({ castle }) => {
      // Attributes
      const attrs = (castle.attributes && castle.attributes.length > 0) ? castle.attributes : [castle.castleType || "無"];
      attrs.forEach(a => {
        attrCounts[a] = (attrCounts[a] || 0) + 1;
      });

      // Weapons
      const w = castle.weapon || "その他";
      weaponCounts[w] = (weaponCounts[w] || 0) + 1;

      // Range kind
      const rk = castle.rangeKind || "近";
      if (rk === "近" || rk === "近接") nearCount++;
      else if (rk === "遠" || rk === "遠隔") farCount++;
      else if (rk === "遠近") bothCount++;
    });

    // Major attributes list
    const mainAttrs = ["平", "平山", "山", "水", "地獄", "無"];
    const attrChipsHtml = mainAttrs.map(attr => {
      const count = attrCounts[attr] || 0;
      const activeClass = count > 0 ? "active" : "";
      return `<span class="coverage-chip ${activeClass}">${attr} <span class="chip-count">${count}</span></span>`;
    }).join("");

    // Weapons chips sorted by count descending
    const sortedWeapons = Object.entries(weaponCounts).sort((a, b) => b[1] - a[1]);
    const weaponChipsHtml = sortedWeapons.map(([w, count]) => {
      return `<span class="coverage-chip active">${w} <span class="chip-count">${count}</span></span>`;
    }).join("");

    // Range chips
    const rangeChipsHtml = `
      <span class="coverage-chip ${nearCount > 0 ? 'active' : ''}">近接 <span class="chip-count">${nearCount}</span></span>
      <span class="coverage-chip ${farCount > 0 ? 'active' : ''}">遠隔 <span class="chip-count">${farCount}</span></span>
      ${bothCount > 0 ? `<span class="coverage-chip active">遠近両用 <span class="chip-count">${bothCount}</span></span>` : ''}
    `;

    // Warnings list
    const warnings = [];
    if (nearCount === 0) {
      warnings.push("近接配置（近）の城娘がいません（前線維持・足止めにご注意ください）");
    }
    if (farCount === 0) {
      warnings.push("遠隔配置（遠）の城娘がいません（対空・遠距離支援にご注意ください）");
    }
    if (currentTerrain && (!attrCounts[currentTerrain] || attrCounts[currentTerrain] === 0)) {
      warnings.push(`出撃地形【${currentTerrain}】に一致する属性の城娘がいません`);
    }
    const zeroMajor = ["平", "平山", "山", "水"].filter(a => !attrCounts[a]);
    if (zeroMajor.length > 0 && zeroMajor.length < 4) {
      warnings.push(`主要4属性のうち【${zeroMajor.join('・')}】の城娘がいません`);
    }

    let warningsHtml = "";
    if (warnings.length > 0) {
      warningsHtml = `
        <div class="coverage-warnings-box">
          <div style="font-weight:bold; margin-bottom:3px;">⚠️ カバレッジ確認（事実表示）:</div>
          ${warnings.map(w => `<div class="coverage-warning-item">• <span>${w}</span></div>`).join("")}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="coverage-group">
        <div class="coverage-group-title"><span>地形属性 (${activePartyMembers.length}体)</span></div>
        <div class="coverage-chips-wrap">${attrChipsHtml}</div>
      </div>
      <div class="coverage-group" style="margin-top:6px;">
        <div class="coverage-group-title"><span>配置距離 (近接 / 遠隔)</span></div>
        <div class="coverage-chips-wrap">${rangeChipsHtml}</div>
      </div>
      <div class="coverage-group" style="margin-top:6px;">
        <div class="coverage-group-title"><span>武器種内訳 (${Object.keys(weaponCounts).length}種)</span></div>
        <div class="coverage-chips-wrap">${weaponChipsHtml}</div>
      </div>
      ${warningsHtml}
    `;
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
      openCastleDetail(id, party.map(s => getCastleById(s.id)).filter(Boolean));
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
  let currentFilteredCastles = [];

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
      if (searchVal && !matchCastleNameOrRuby(c, searchVal)) return false;
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

    currentFilteredCastles = filtered;
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
      openCastleDetail(detailId, currentFilteredCastles);
      return;
    }

    // 3. Click anywhere on card (except inside actions)
    const item = e.target.closest(".castle-list-item");
    if (item) {
      const id = item.getAttribute("data-id");
      if (id) {
        openCastleDetail(id, currentFilteredCastles);
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
    const clearFilter = document.getElementById("guideClearFilter") ? document.getElementById("guideClearFilter").value : "";

    // Toggle subcategory select visibility
    if (subcatSelect) {
      subcatSelect.style.display = (cat === "地獄") ? "inline-block" : "none";
    }

    const progressData = getStageProgressData();

    // Render Category Clear Progress Banner (プロンプト2)
    const bannerEl = document.getElementById("guidesProgressBanner");
    if (bannerEl && window.SCRE_GUIDES) {
      const chipsHtml = window.SCRE_GUIDES.map(g => {
        const total = g.stages.length;
        const cleared = g.stages.filter(s => progressData[s.title] && progressData[s.title].cleared).length;
        const pct = total > 0 ? Math.round((cleared / total) * 100) : 0;
        return `
          <div class="guide-progress-chip">
            <strong>${g.category}:</strong> <span style="color:var(--primary-color); font-weight:bold;">${cleared}</span> / ${total} (${pct}%)
          </div>
        `;
      }).join("");

      bannerEl.innerHTML = `
        <div class="guide-progress-box">
          <div class="guide-progress-header">
            <span>🏆 ステージクリア進捗状況</span>
          </div>
          <div class="guide-progress-items">
            ${chipsHtml}
          </div>
        </div>
      `;
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
      const isStCleared = Boolean(progressData[st.title] && progressData[st.title].cleared);
      if (clearFilter === "cleared" && !isStCleared) return false;
      if (clearFilter === "uncleared" && isStCleared) return false;

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
      const isStCleared = Boolean(progressData[st.title] && progressData[st.title].cleared);
      const hasSavedParty = Boolean(progressData[st.title] && progressData[st.title].party && progressData[st.title].party.length > 0);
      let badgeHtml = "";
      if (isStCleared) {
        badgeHtml += `<span class="stage-cleared-badge">✓ クリア済</span> `;
      }
      if (hasSavedParty) {
        badgeHtml += `<span class="badge" style="background:#34495e; color:#fff; font-size:10px;">編成保存済 (${progressData[st.title].party.length}体)</span> `;
      }
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
        <div style="display:flex; gap:8px; margin-top:10px; padding-top:8px; border-top:1px dashed #d8cfc4; flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary" data-action="diag-stage" data-title="${st.title}" data-id="${st.id}" style="font-size:11px; font-weight:bold; flex:2; min-width:110px;">部隊の適合判定 ⚔</button>
          <button class="btn btn-sm" data-action="filter-stage" data-title="${st.title}" data-terrain="${st.terrain}" style="font-size:11px; flex:2; min-width:110px; background:#f5f0e6; border-color:#d5cbbd;">対策城娘を探す 🔍</button>
          <button class="btn btn-sm btn-toggle-clear ${isStCleared ? 'cleared' : ''}" data-action="toggle-clear" data-title="${st.title}" style="flex:1; min-width:80px;">${isStCleared ? '✓ クリア済' : '未クリア'}</button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  document.getElementById("guideCategorySelect").addEventListener("change", renderGuidesTab);
  const subcatEl = document.getElementById("guideSubCategorySelect");
  if (subcatEl) subcatEl.addEventListener("change", renderGuidesTab);
  document.getElementById("guideSearchInput").addEventListener("input", renderGuidesTab);
  const guideClearFilterEl = document.getElementById("guideClearFilter");
  if (guideClearFilterEl) guideClearFilterEl.addEventListener("change", renderGuidesTab);

  // Guide stage action listeners
  document.getElementById("guidesListContainer").addEventListener("click", e => {
    const action = e.target.getAttribute("data-action");
    const title = e.target.getAttribute("data-title");
    const id = e.target.getAttribute("data-id") || title;
    if (!action || !title) return;

    if (action === "toggle-clear") {
      toggleStageCleared(title);
    } else if (action === "diag-stage") {
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
        if (q && !matchCastleNameOrRuby(c, q)) return false;
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
  let activeDetailList = [];
  let activeDetailIndex = -1;

  function updateDetailNavUI() {
    const prevBtn = document.getElementById("btnDetailPrevCastle");
    const nextBtn = document.getElementById("btnDetailNextCastle");
    const sidePrevBtn = document.getElementById("btnSideDetailPrev");
    const sideNextBtn = document.getElementById("btnSideDetailNext");
    const counterEl = document.getElementById("detailNavCounter");

    const total = activeDetailList ? activeDetailList.length : 0;
    const current = activeDetailIndex >= 0 ? activeDetailIndex + 1 : 1;

    if (counterEl) {
      counterEl.textContent = total > 0 ? `${current} / ${total}` : "---";
    }

    const hasPrev = activeDetailIndex > 0;
    const hasNext = activeDetailIndex >= 0 && activeDetailIndex < total - 1;

    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (sidePrevBtn) sidePrevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;
    if (sideNextBtn) sideNextBtn.disabled = !hasNext;
  }

  function navigateDetailCastle(direction) {
    if (!activeDetailList || activeDetailList.length === 0) return;
    const nextIdx = activeDetailIndex + direction;
    if (nextIdx >= 0 && nextIdx < activeDetailList.length) {
      const nextCastle = activeDetailList[nextIdx];
      if (nextCastle) {
        openCastleDetail(nextCastle.id || nextCastle.name, activeDetailList, true);
        const modalBody = document.querySelector(".modal-detail-body");
        if (modalBody) modalBody.scrollTop = 0;
      }
    }
  }

  let currentDetailForm = "battle"; // 'battle' | 'ojou' | 'taiha' | 'side_by_side'
  let currentSideCompareMode = "ojou_battle"; // 'ojou_battle' | 'battle_taiha' | 'ojou_taiha' | 'all_three'
  let currentDetailRemodelStage = "無印"; // '無印' | '改壱' | '改弐'

  function getCastleStageImages(castle, stage) {
    if (!castle) return { illustUrl: "", ojouUrl: "", taihaUrl: "" };
    const st = stage || currentDetailRemodelStage || "無印";
    const forms = castle.remodelForms || {};
    const stageData = forms[st] || {};
    const baseData = forms["無印"] || {};
    return {
      illustUrl: stageData.illustUrl || baseData.illustUrl || castle.illustUrl || "",
      ojouUrl: stageData.ojouUrl || baseData.ojouUrl || castle.ojouUrl || "",
      taihaUrl: stageData.taihaUrl || baseData.taihaUrl || castle.taihaUrl || ""
    };
  }

  function renderDetailSkills(c, currentStage) {
    const skillContainer = document.getElementById("detailSkillContainer");
    if (!skillContainer) return;
    const skills = (c.allSkills && c.allSkills.length > 0) ? c.allSkills : (c.skill ? [c.skill] : []);
    if (skills.length > 0) {
      let activeIdx = skills.findIndex(s => (s.stage || "無印") === currentStage);
      if (activeIdx === -1) {
        if (currentStage === "改弐") activeIdx = skills.findIndex(s => (s.stage || "無印") === "改壱");
        if (activeIdx === -1) activeIdx = skills.length - 1;
      }
      skillContainer.innerHTML = `
        <div class="ability-stage-list">
          ${skills.map((sk, idx) => {
            const isActive = idx === activeIdx;
            const badgeClass = sk.stage === "改弐" ? "stage-badge kai-2" : (sk.stage === "改壱" ? "stage-badge kai-1" : "stage-badge");
            return `
              <div class="ability-stage-card ${isActive ? 'is-latest' : ''}" data-stage="${sk.stage || '無印'}" title="クリックでこの改築段階に切り替え">
                <div class="ability-stage-header">
                  <span class="${badgeClass}">[${sk.stage || '無印'}]</span>
                  <span class="ability-stage-name">${sk.name}</span>
                  ${isActive ? '<span style="font-size:10px;color:var(--primary-color);margin-left:auto;font-weight:bold;">★適用中</span>' : ''}
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
  }

  function renderDetailStrategies(c, currentStage) {
    const stratBox = document.getElementById("detailStrategyBox");
    const stratContainer = document.getElementById("detailStrategyContainer");
    if (!stratContainer) return;
    const strats = (c.allStrategies && c.allStrategies.length > 0) ? c.allStrategies : (c.strategy ? [c.strategy] : []);
    if (strats.length > 0) {
      if (stratBox) stratBox.style.display = "block";
      let activeIdx = strats.findIndex(s => (s.stage || "無印") === currentStage);
      if (activeIdx === -1) {
        if (currentStage === "改弐") activeIdx = strats.findIndex(s => (s.stage || "無印") === "改壱");
        if (activeIdx === -1) activeIdx = strats.length - 1;
      }
      stratContainer.innerHTML = `
        <div class="ability-stage-list">
          ${strats.map((st, idx) => {
            const isActive = idx === activeIdx;
            const badgeClass = st.stage === "改弐" ? "stage-badge kai-2" : (st.stage === "改壱" ? "stage-badge kai-1" : "stage-badge");
            return `
              <div class="ability-stage-card ${isActive ? 'is-latest' : ''}" data-stage="${st.stage || '無印'}" title="クリックでこの改築段階に切り替え">
                <div class="ability-stage-header">
                  <span class="${badgeClass}">[${st.stage || '無印'}]</span>
                  <span class="ability-stage-name">${st.name}</span>
                  ${isActive ? '<span style="font-size:10px;color:var(--primary-color);margin-left:auto;font-weight:bold;">★適用中</span>' : ''}
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
  }

  function setDetailRemodelStage(stage) {
    const c = getCastleById(activeDetailCastleId);
    if (!c) return;
    currentDetailRemodelStage = stage;
    document.querySelectorAll("#remodelBtnGroup .remodel-tab-btn").forEach(b => {
      b.classList.toggle("active", b.getAttribute("data-stage") === stage);
    });
    document.querySelectorAll("#zoomRemodelGroup .zoom-remodel-btn").forEach(b => {
      b.classList.toggle("active", b.getAttribute("data-stage") === stage);
    });
    setDetailPortraitForm(currentDetailForm, c, stage);
    renderDetailSkills(c, stage);
    renderDetailStrategies(c, stage);
    if (zoomCastle && zoomCastle.id === c.id) {
      updateZoomImage();
    }
  }

  function setDetailPortraitForm(form, castle, remodelStage) {
    const c = castle || getCastleById(activeDetailCastleId);
    if (!c) return;
    currentDetailForm = form;
    if (remodelStage) {
      currentDetailRemodelStage = remodelStage;
    }
    const st = currentDetailRemodelStage || "無印";
    const imgSet = getCastleStageImages(c, st);

    const modalContent = document.querySelector(".modal-detail-content");
    const imgEl = document.getElementById("detailPortraitImg");
    const sideContainer = document.getElementById("detailSideBySideContainer");
    const sideImgOjou = document.getElementById("detailSideImgOjou");
    const sideImgBattle = document.getElementById("detailSideImgBattle");
    const sideImgTaiha = document.getElementById("detailSideImgTaiha");
    const colOjou = document.getElementById("detailSideColOjou");
    const colBattle = document.getElementById("detailSideColBattle");
    const colTaiha = document.getElementById("detailSideColTaiha");
    const captionEl = document.getElementById("detailPortraitCaption");
    const fallbackSrc = `icons/${encodeURIComponent(c.name)}.png`;

    // Update active tab buttons
    document.querySelectorAll("#portraitFormTabs .form-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-form") === form);
    });

    // Update remodel tab buttons
    document.querySelectorAll("#remodelBtnGroup .remodel-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-stage") === st);
    });

    const hasOjou = Boolean(imgSet.ojouUrl);
    const hasTaiha = Boolean(imgSet.taihaUrl);

    // Disable / enable form tabs based on available images for this stage
    const btnOjou = document.getElementById("btnFormOjou");
    const btnTaiha = document.getElementById("btnFormTaiha");
    const btnSideBySide = document.getElementById("btnFormSideBySide");
    if (btnOjou) btnOjou.disabled = !hasOjou;
    if (btnTaiha) btnTaiha.disabled = !hasTaiha;
    if (btnSideBySide) btnSideBySide.disabled = !hasOjou && !hasTaiha;

    if (form === "side_by_side") {
      if (modalContent) modalContent.classList.add("side-by-side-mode");
      if (imgEl) imgEl.style.display = "none";
      if (sideContainer) {
        sideContainer.style.display = "flex";

        const btnCmpOjouBattle = document.getElementById("btnCmpOjouBattle");
        const btnCmpBattleTaiha = document.getElementById("btnCmpBattleTaiha");
        const btnCmpOjouTaiha = document.getElementById("btnCmpOjouTaiha");
        const btnCmpAllThree = document.getElementById("btnCmpAllThree");

        if (btnCmpOjouBattle) btnCmpOjouBattle.disabled = !hasOjou;
        if (btnCmpBattleTaiha) btnCmpBattleTaiha.disabled = !hasTaiha;
        if (btnCmpOjouTaiha) btnCmpOjouTaiha.disabled = !hasOjou || !hasTaiha;
        if (btnCmpAllThree) btnCmpAllThree.disabled = !hasOjou || !hasTaiha;

        // Auto fallback if current mode is unavailable
        if (currentSideCompareMode === "all_three" && (!hasOjou || !hasTaiha)) {
          currentSideCompareMode = hasOjou ? "ojou_battle" : (hasTaiha ? "battle_taiha" : "ojou_battle");
        } else if (currentSideCompareMode === "ojou_taiha" && (!hasOjou || !hasTaiha)) {
          currentSideCompareMode = hasOjou ? "ojou_battle" : "battle_taiha";
        } else if (currentSideCompareMode === "battle_taiha" && !hasTaiha) {
          currentSideCompareMode = "ojou_battle";
        } else if (currentSideCompareMode === "ojou_battle" && !hasOjou) {
          currentSideCompareMode = hasTaiha ? "battle_taiha" : "ojou_battle";
        }

        // Highlight active sub compare button
        document.querySelectorAll("#sideCompareSelector .compare-sub-btn").forEach(b => {
          b.classList.toggle("active", b.getAttribute("data-compare") === currentSideCompareMode);
        });

        // Set images
        if (sideImgOjou) {
          sideImgOjou.onerror = function() { this.src = fallbackSrc; };
          sideImgOjou.src = imgSet.ojouUrl || fallbackSrc;
        }
        if (sideImgBattle) {
          sideImgBattle.onerror = function() { this.src = fallbackSrc; };
          sideImgBattle.src = imgSet.illustUrl || fallbackSrc;
        }
        if (sideImgTaiha) {
          sideImgTaiha.onerror = function() { this.src = fallbackSrc; };
          sideImgTaiha.src = imgSet.taihaUrl || fallbackSrc;
        }

        const stageLabel = st ? ` [${st}]` : '';

        // Layout display based on currentSideCompareMode
        if (currentSideCompareMode === "all_three") {
          if (modalContent) modalContent.classList.add("triple-mode");
          if (colOjou) colOjou.style.display = "block";
          if (colBattle) colBattle.style.display = "block";
          if (colTaiha) colTaiha.style.display = "block";
          if (captionEl) captionEl.innerHTML = `<span style="color:#e84393;">🌸 御嬢${stageLabel}</span> ＆ <span style="color:var(--primary-color);">⚔️ 城娘${stageLabel}</span> ＆ <span style="color:#d63031;">💥 大破${stageLabel}</span>`;
        } else if (currentSideCompareMode === "battle_taiha") {
          if (modalContent) modalContent.classList.remove("triple-mode");
          if (colOjou) colOjou.style.display = "none";
          if (colBattle) colBattle.style.display = "block";
          if (colTaiha) colTaiha.style.display = "block";
          if (captionEl) captionEl.innerHTML = `<span style="color:var(--primary-color);">⚔️ 城娘姿${stageLabel} (通常)</span> ＆ <span style="color:#d63031;">💥 大破姿${stageLabel} (被弾)</span>`;
        } else if (currentSideCompareMode === "ojou_taiha") {
          if (modalContent) modalContent.classList.remove("triple-mode");
          if (colOjou) colOjou.style.display = "block";
          if (colBattle) colBattle.style.display = "none";
          if (colTaiha) colTaiha.style.display = "block";
          if (captionEl) captionEl.innerHTML = `<span style="color:#e84393;">🌸 御嬢姿${stageLabel} (私服)</span> ＆ <span style="color:#d63031;">💥 大破姿${stageLabel} (被弾)</span>`;
        } else { // ojou_battle
          if (modalContent) modalContent.classList.remove("triple-mode");
          if (colOjou) colOjou.style.display = "block";
          if (colBattle) colBattle.style.display = "block";
          if (colTaiha) colTaiha.style.display = "none";
          if (captionEl) captionEl.innerHTML = `<span style="color:#e84393;">🌸 御嬢姿${stageLabel} (私服)</span> ＆ <span style="color:var(--primary-color);">⚔️ 城娘姿${stageLabel} (戦闘)</span>`;
        }
      }
    } else {
      if (modalContent) {
        modalContent.classList.remove("side-by-side-mode");
        modalContent.classList.remove("triple-mode");
      }
      if (sideContainer) sideContainer.style.display = "none";
      if (imgEl) {
        imgEl.style.display = "block";
        imgEl.onerror = function() { this.src = fallbackSrc; };
        const stageLabel = st ? ` [${st}]` : '';
        if (form === "ojou") {
          imgEl.src = imgSet.ojouUrl || fallbackSrc;
          if (captionEl) captionEl.innerHTML = `<span style="color:#e84393; font-weight:bold;">🌸 御嬢姿${stageLabel} (私服・日常)</span>`;
        } else if (form === "taiha") {
          imgEl.src = imgSet.taihaUrl || fallbackSrc;
          if (captionEl) captionEl.innerHTML = `<span style="color:#d63031; font-weight:bold;">💥 大破姿${stageLabel} (戦闘不能)</span>`;
        } else {
          imgEl.src = imgSet.illustUrl || fallbackSrc;
          if (captionEl) captionEl.innerHTML = `<span style="color:var(--primary-color); font-weight:bold;">⚔️ 城娘姿${stageLabel} (通常・戦闘)</span>`;
        }
      }
    }
  }

  // ==========================================
  // Image Zoom Lightbox (城娘立ち絵・大破絵 特大拡大ビューア)
  // ==========================================
  let zoomCastle = null;
  let zoomForm = "battle"; // 'battle' | 'ojou' | 'taiha'
  let zoomScale = 1.0;
  let zoomPanX = 0;
  let zoomPanY = 0;
  let isZoomDragging = false;
  let zoomDragStartX = 0;
  let zoomDragStartY = 0;
  let zoomStartPanX = 0;
  let zoomStartPanY = 0;

  function updateZoomTransform() {
    const stage = document.getElementById("imageZoomStage");
    const indicator = document.getElementById("zoomLevelIndicator");
    if (stage) {
      stage.style.transform = `translate(${zoomPanX}px, ${zoomPanY}px) scale(${zoomScale})`;
    }
    if (indicator) {
      indicator.textContent = `${Math.round(zoomScale * 100)}%`;
    }
  }

  function resetZoomTransform(fitMode) {
    zoomScale = fitMode ? 1.0 : 1.0;
    zoomPanX = 0;
    zoomPanY = 0;
    updateZoomTransform();
  }

  function updateZoomImage() {
    if (!zoomCastle) return;
    const targetImg = document.getElementById("imageZoomTarget");
    const badgeEl = document.getElementById("zoomFormBadge");
    const nameEl = document.getElementById("zoomCastleName");
    const typeEl = document.getElementById("zoomCastleType");
    const fallbackSrc = `icons/${encodeURIComponent(zoomCastle.name)}.png`;

    if (nameEl) nameEl.textContent = zoomCastle.name;
    if (typeEl) {
      typeEl.textContent = zoomCastle.castleType || "無";
      typeEl.className = `type-tag ${zoomCastle.castleType || "無"}`;
    }

    const st = currentDetailRemodelStage || "無印";
    const imgSet = getCastleStageImages(zoomCastle, st);
    const stageLabel = st ? ` [${st}]` : '';

    let src = imgSet.illustUrl || fallbackSrc;
    let badgeText = `⚔️ 城娘姿${stageLabel} (通常)`;
    let badgeColor = "var(--primary-color)";

    if (zoomForm === "ojou") {
      src = imgSet.ojouUrl || fallbackSrc;
      badgeText = `🌸 御嬢姿${stageLabel} (私服)`;
      badgeColor = "#e84393";
    } else if (zoomForm === "taiha") {
      src = imgSet.taihaUrl || fallbackSrc;
      badgeText = `💥 大破姿${stageLabel} (戦闘不能)`;
      badgeColor = "#d63031";
    }

    if (targetImg) {
      targetImg.onerror = function() { this.src = fallbackSrc; };
      targetImg.src = src;
    }
    if (badgeEl) {
      badgeEl.textContent = badgeText;
      badgeEl.style.color = badgeColor;
    }

    // Update form buttons disabled/active
    document.querySelectorAll("#zoomFormTabs .zoom-tab-btn").forEach(btn => {
      const f = btn.getAttribute("data-form");
      btn.classList.toggle("active", f === zoomForm);
      if (f === "ojou") btn.disabled = !imgSet.ojouUrl;
      if (f === "taiha") btn.disabled = !imgSet.taihaUrl;
    });

    // Update zoom remodel buttons
    document.querySelectorAll("#zoomRemodelGroup .zoom-remodel-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-stage") === st);
    });
  }

  function openImageZoom(castle, form) {
    const c = castle || getCastleById(activeDetailCastleId);
    if (!c) return;
    zoomCastle = c;
    zoomForm = form || currentDetailForm || "battle";
    if (zoomForm === "side_by_side") {
      zoomForm = (currentSideCompareMode === "battle_taiha") ? "taiha" : "battle";
    }

    const stages = (c.remodelStages && c.remodelStages.length > 0) ? c.remodelStages : ["無印"];
    if (!currentDetailRemodelStage || !stages.includes(currentDetailRemodelStage)) {
      currentDetailRemodelStage = stages[stages.length - 1];
    }

    const zoomRemodelGroup = document.getElementById("zoomRemodelGroup");
    if (zoomRemodelGroup) {
      zoomRemodelGroup.innerHTML = stages.map(st => `
        <button type="button" class="zoom-remodel-btn ${st === currentDetailRemodelStage ? 'active' : ''}" data-stage="${st}">${st}</button>
      `).join("");
    }

    const imgSet = getCastleStageImages(c, currentDetailRemodelStage);
    if (zoomForm === "ojou" && !imgSet.ojouUrl) zoomForm = "battle";
    if (zoomForm === "taiha" && !imgSet.taihaUrl) zoomForm = "battle";

    updateZoomImage();
    resetZoomTransform(true);

    const modal = document.getElementById("modalImageZoom");
    if (modal) modal.style.display = "flex";
  }

  function closeImageZoom() {
    const modal = document.getElementById("modalImageZoom");
    if (modal) modal.style.display = "none";
  }

  function openCastleDetail(castleId, customList, keepForm) {
    const c = getCastleById(castleId);
    if (!c) return;
    activeDetailCastleId = c.id;

    if (!keepForm) {
      currentDetailForm = "battle";
    }

    if (customList && Array.isArray(customList) && customList.length > 0) {
      activeDetailList = customList;
    } else {
      if (currentFilteredCastles && currentFilteredCastles.some(item => item && (item.id === c.id || item.name === c.name))) {
        activeDetailList = currentFilteredCastles;
      } else if (party && party.some(p => p.id === c.id)) {
        activeDetailList = party.map(p => getCastleById(p.id)).filter(Boolean);
      } else {
        activeDetailList = window.SCRE_DATA || [];
      }
    }

    activeDetailIndex = activeDetailList.findIndex(item => item && (item.id === c.id || item.name === c.name));
    updateDetailNavUI();

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

    // Remodel Stage Switcher (無印 / 改壱 / 改弐)
    const stages = (c.remodelStages && c.remodelStages.length > 0) ? c.remodelStages : ["無印"];
    currentDetailRemodelStage = stages[stages.length - 1];

    const remodelGroup = document.getElementById("remodelBtnGroup");
    if (remodelGroup) {
      remodelGroup.innerHTML = stages.map(st => `
        <button type="button" class="remodel-tab-btn ${st === currentDetailRemodelStage ? 'active' : ''}" data-stage="${st}">${st}</button>
      `).join("");
    }
    const zoomRemodelGroup = document.getElementById("zoomRemodelGroup");
    if (zoomRemodelGroup) {
      zoomRemodelGroup.innerHTML = stages.map(st => `
        <button type="button" class="zoom-remodel-btn ${st === currentDetailRemodelStage ? 'active' : ''}" data-stage="${st}">${st}</button>
      `).join("");
    }

    const imgSet = getCastleStageImages(c, currentDetailRemodelStage);

    // Left Column: Fullbody Illustration & Form Switcher (城娘 / 御嬢 / 大破)
    const btnBattle = document.getElementById("btnFormBattle");
    const btnOjou = document.getElementById("btnFormOjou");
    const btnTaiha = document.getElementById("btnFormTaiha");
    const btnSideBySide = document.getElementById("btnFormSideBySide");

    if (btnOjou) btnOjou.disabled = !imgSet.ojouUrl;
    if (btnTaiha) btnTaiha.disabled = !imgSet.taihaUrl;
    if (btnSideBySide) btnSideBySide.disabled = !imgSet.ojouUrl && !imgSet.taihaUrl;

    // Reset to battle form if current mode is unavailable
    if ((currentDetailForm === "ojou" && !imgSet.ojouUrl) ||
        (currentDetailForm === "taiha" && !imgSet.taihaUrl) ||
        (currentDetailForm === "side_by_side" && !imgSet.ojouUrl && !imgSet.taihaUrl)) {
      currentDetailForm = "battle";
    }

    setDetailPortraitForm(currentDetailForm, c, currentDetailRemodelStage);

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
    renderDetailSkills(c, currentDetailRemodelStage);

    // Strategies (計略一覧)
    renderDetailStrategies(c, currentDetailRemodelStage);

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

  // Remodel Stage Switcher Tabs (無印 / 改壱 / 改弐)
  const remodelBtnGroup = document.getElementById("remodelBtnGroup");
  if (remodelBtnGroup) {
    remodelBtnGroup.addEventListener("click", e => {
      const btn = e.target.closest(".remodel-tab-btn");
      if (!btn || btn.disabled) return;
      const st = btn.getAttribute("data-stage");
      if (st) setDetailRemodelStage(st);
    });
  }

  // Remodel Stage Switcher in Fullscreen Zoom Viewer
  const zoomRemodelGroup = document.getElementById("zoomRemodelGroup");
  if (zoomRemodelGroup) {
    zoomRemodelGroup.addEventListener("click", e => {
      const btn = e.target.closest(".zoom-remodel-btn");
      if (!btn || btn.disabled) return;
      const st = btn.getAttribute("data-stage");
      if (st) setDetailRemodelStage(st);
    });
  }

  // Click on ability stage card in detail modal to switch remodel stage
  const detailSkillContainer = document.getElementById("detailSkillContainer");
  if (detailSkillContainer) {
    detailSkillContainer.addEventListener("click", e => {
      const card = e.target.closest(".ability-stage-card");
      if (!card) return;
      const st = card.getAttribute("data-stage");
      if (st) setDetailRemodelStage(st);
    });
  }
  const detailStrategyContainer = document.getElementById("detailStrategyContainer");
  if (detailStrategyContainer) {
    detailStrategyContainer.addEventListener("click", e => {
      const card = e.target.closest(".ability-stage-card");
      if (!card) return;
      const st = card.getAttribute("data-stage");
      if (st) setDetailRemodelStage(st);
    });
  }

  // Portrait Form Switcher Tabs (城娘 / 御嬢 / 大破 / 並べて表示)
  const portraitFormTabs = document.getElementById("portraitFormTabs");
  if (portraitFormTabs) {
    portraitFormTabs.addEventListener("click", e => {
      const btn = e.target.closest(".form-tab-btn");
      if (!btn || btn.disabled) return;
      const form = btn.getAttribute("data-form");
      if (form) setDetailPortraitForm(form);
    });
  }

  // Side-by-side comparison mode sub-selector (御嬢×城娘 / 城娘×大破 / 御嬢×大破 / 3姿すべて)
  const sideCompareSelector = document.getElementById("sideCompareSelector");
  if (sideCompareSelector) {
    sideCompareSelector.addEventListener("click", e => {
      const btn = e.target.closest(".compare-sub-btn");
      if (!btn || btn.disabled) return;
      const mode = btn.getAttribute("data-compare");
      if (mode) {
        currentSideCompareMode = mode;
        setDetailPortraitForm("side_by_side");
      }
    });
  }

  // Castle Detail Prev / Next Navigation buttons
  const btnDetailPrevCastle = document.getElementById("btnDetailPrevCastle");
  if (btnDetailPrevCastle) {
    btnDetailPrevCastle.addEventListener("click", () => navigateDetailCastle(-1));
  }
  const btnDetailNextCastle = document.getElementById("btnDetailNextCastle");
  if (btnDetailNextCastle) {
    btnDetailNextCastle.addEventListener("click", () => navigateDetailCastle(1));
  }
  const btnSideDetailPrev = document.getElementById("btnSideDetailPrev");
  if (btnSideDetailPrev) {
    btnSideDetailPrev.addEventListener("click", () => navigateDetailCastle(-1));
  }
  const btnSideDetailNext = document.getElementById("btnSideDetailNext");
  if (btnSideDetailNext) {
    btnSideDetailNext.addEventListener("click", () => navigateDetailCastle(1));
  }

  document.getElementById("modalDetailCloseBtn").addEventListener("click", () => {
    document.getElementById("modalCastleDetail").classList.remove("open");
  });

  document.getElementById("modalCastleDetail").addEventListener("click", e => {
    if (e.target.id === "modalCastleDetail") {
      document.getElementById("modalCastleDetail").classList.remove("open");
    }
  });

  // Image Zoom Triggers from Detail Modal
  const btnPortraitZoom = document.getElementById("btnPortraitZoom");
  if (btnPortraitZoom) {
    btnPortraitZoom.addEventListener("click", () => openImageZoom(null, currentDetailForm));
  }
  const detailPortraitImg = document.getElementById("detailPortraitImg");
  if (detailPortraitImg) {
    detailPortraitImg.addEventListener("click", () => openImageZoom(null, currentDetailForm));
  }
  const sideImgOjou = document.getElementById("detailSideImgOjou");
  if (sideImgOjou) {
    sideImgOjou.addEventListener("click", () => openImageZoom(null, "ojou"));
  }
  const sideImgBattle = document.getElementById("detailSideImgBattle");
  if (sideImgBattle) {
    sideImgBattle.addEventListener("click", () => openImageZoom(null, "battle"));
  }
  const sideImgTaiha = document.getElementById("detailSideImgTaiha");
  if (sideImgTaiha) {
    sideImgTaiha.addEventListener("click", () => openImageZoom(null, "taiha"));
  }

  // Image Zoom Controls & Interactions
  const btnZoomClose = document.getElementById("btnZoomClose");
  if (btnZoomClose) {
    btnZoomClose.addEventListener("click", closeImageZoom);
  }
  const modalImageZoom = document.getElementById("modalImageZoom");
  if (modalImageZoom) {
    modalImageZoom.addEventListener("click", e => {
      if (e.target.id === "modalImageZoom") closeImageZoom();
    });
  }
  const zoomFormTabs = document.getElementById("zoomFormTabs");
  if (zoomFormTabs) {
    zoomFormTabs.addEventListener("click", e => {
      const btn = e.target.closest(".zoom-tab-btn");
      if (!btn || btn.disabled) return;
      const f = btn.getAttribute("data-form");
      if (f) {
        zoomForm = f;
        updateZoomImage();
      }
    });
  }
  const btnZoomIn = document.getElementById("btnZoomIn");
  if (btnZoomIn) {
    btnZoomIn.addEventListener("click", () => {
      zoomScale = Math.min(4.0, zoomScale + 0.25);
      updateZoomTransform();
    });
  }
  const btnZoomOut = document.getElementById("btnZoomOut");
  if (btnZoomOut) {
    btnZoomOut.addEventListener("click", () => {
      zoomScale = Math.max(0.5, zoomScale - 0.25);
      updateZoomTransform();
    });
  }
  const btnZoomReset = document.getElementById("btnZoomReset");
  if (btnZoomReset) {
    btnZoomReset.addEventListener("click", () => {
      if (zoomScale > 1.2) {
        resetZoomTransform(true);
      } else {
        zoomScale = 2.0;
        zoomPanX = 0;
        zoomPanY = 0;
        updateZoomTransform();
      }
    });
  }

  // Wheel zoom on viewport
  const zoomViewport = document.getElementById("imageZoomViewport");
  if (zoomViewport) {
    zoomViewport.addEventListener("wheel", e => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      zoomScale = Math.min(Math.max(0.5, zoomScale + delta), 4.0);
      updateZoomTransform();
    }, { passive: false });

    // Drag / Pan on viewport
    zoomViewport.addEventListener("mousedown", e => {
      if (e.target.closest(".zoom-controls") || e.target.closest(".zoom-form-tabs")) return;
      isZoomDragging = true;
      zoomDragStartX = e.clientX;
      zoomDragStartY = e.clientY;
      zoomStartPanX = zoomPanX;
      zoomStartPanY = zoomPanY;
    });

    window.addEventListener("mousemove", e => {
      if (!isZoomDragging) return;
      zoomPanX = zoomStartPanX + (e.clientX - zoomDragStartX);
      zoomPanY = zoomStartPanY + (e.clientY - zoomDragStartY);
      updateZoomTransform();
    });

    window.addEventListener("mouseup", () => {
      isZoomDragging = false;
    });

    zoomViewport.addEventListener("dblclick", () => {
      if (zoomScale > 1.2) {
        resetZoomTransform(true);
      } else {
        zoomScale = 2.0;
        zoomPanX = 0;
        zoomPanY = 0;
        updateZoomTransform();
      }
    });
  }

  // Keyboard navigation (Esc to close, ArrowLeft / ArrowRight to navigate)
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      const zoomModal = document.getElementById("modalImageZoom");
      if (zoomModal && zoomModal.style.display !== "none") {
        closeImageZoom();
        return;
      }
      document.getElementById("modalCastleDetail").classList.remove("open");
      document.getElementById("modalSelector").classList.remove("open");
      const diagModal = document.getElementById("modalStageDiagnostic");
      if (diagModal) diagModal.classList.remove("open");
      const compModal = document.getElementById("modalPresetCompare");
      if (compModal) compModal.classList.remove("open");
      return;
    }

    const detailModal = document.getElementById("modalCastleDetail");
    if (detailModal && detailModal.classList.contains("open")) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateDetailCastle(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateDetailCastle(1);
      }
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

    
    // Render Stage Clear & Saved Party Section (プロンプト2)
    const progressBox = document.getElementById("diagStageProgressBox");
    if (progressBox) {
      const data = getStageProgressData();
      const stageRecord = data[foundStage.title] || {};
      const isCleared = !!stageRecord.cleared;
      const savedParty = stageRecord.party || [];
      const savedAtStr = stageRecord.savedAt ? new Date(stageRecord.savedAt).toLocaleString("ja-JP") : "";

      let savedPartyHtml = "";
      if (savedParty.length > 0) {
        const memberCastles = savedParty.map(id => getCastleById(id)).filter(Boolean);
        savedPartyHtml = `
          <div style="margin-top:6px; font-size:11px; color:#444; background:#fbf9f6; padding:6px 8px; border-radius:4px; border:1px solid #ebdccb;">
            <strong>保存済みクリア編成 (${memberCastles.length}体):</strong> ${memberCastles.map(c => c.name).join("、")}
            ${stageRecord.savedAt ? `<span style="font-size:10px; color:#888; margin-left:6px;">(${savedAtStr}保存)</span>` : ''}
          </div>
        `;
      }

      progressBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <label style="display:flex; align-items:center; gap:6px; font-weight:bold; cursor:pointer;">
            <input type="checkbox" id="diagStageClearedCheckbox" ${isCleared ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
            <span>このステージをクリア済みにする</span>
          </label>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-sm btn-primary" id="btnSaveStageParty" style="font-size:11px;">現在の編成を保存 💾</button>
            ${savedParty.length > 0 ? `<button class="btn btn-sm" id="btnRestoreStageParty" style="font-size:11px; background:#eef5ee; border-color:#95c99e; color:#1e6b2c; font-weight:bold;">クリア編成を復元 ↺</button>` : ''}
          </div>
        </div>
        ${savedPartyHtml}
      `;

      document.getElementById("diagStageClearedCheckbox").addEventListener("change", (e) => {
        toggleStageCleared(foundStage.title, e.target.checked);
      });

      document.getElementById("btnSaveStageParty").addEventListener("click", () => {
        savePartyForStage(foundStage.title);
        openStageDiagnostic(foundStage.title);
      });

      const btnRestore = document.getElementById("btnRestoreStageParty");
      if (btnRestore) {
        btnRestore.addEventListener("click", () => {
          restorePartyFromStage(foundStage.title);
          openStageDiagnostic(foundStage.title);
        });
      }
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

  // Dedicated html2canvas party exporter (プロンプト6)
  function exportPartyImage() {
    if (typeof window.html2canvas !== "function") {
      showToast("⚠️ html2canvas ライブラリが読み込まれていません（オフライン環境等）。画像エクスポートを利用できません。");
      return;
    }

    const calcResult = calculateBuffs();
    if (!calcResult.activePartyMembers || calcResult.activePartyMembers.length === 0) {
      showToast("⚠️ 編成に城娘がいません。城娘を編成してからエクスポートしてください。");
      return;
    }

    const exportArea = document.getElementById("partyExportArea");
    if (!exportArea) return;

    const presetName = partyPresets[currentPresetIdx]?.name || "部隊";
    const terrainLabel = currentTerrain ? `${currentTerrain}属性` : "指定なし";
    const dateStr = new Date().toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

    // Build slots HTML (4 cols x 2 rows)
    const slotsHtml = [];
    for (let i = 0; i < 8; i++) {
      const slot = party[i];
      const castle = slot ? getCastleById(slot.id) : null;
      if (castle) {
        const calc = calcResult.perCastle[castle.id]?.calculatedStats;
        const attrStr = castle.subType || castle.castleType;
        const isMatch = calc?.isTerrainMatch;
        const matchBadge = isMatch ? `<span style="background:#2c6f4f; color:#fff; font-size:10px; font-weight:bold; padding:1px 5px; border-radius:3px;">✓一致(-35%)</span>` : '';

        slotsHtml.push(`
          <div style="background:#fff; border:1px solid #d5cbbd; border-radius:6px; padding:10px 12px; display:flex; gap:10px; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <div style="width:48px; height:48px; border-radius:6px; overflow:hidden; background:#eee; flex-shrink:0; display:flex; align-items:center; justify-content:center; border:1px solid #ccc;">
              <img src="${castle.iconUrl}" onerror="this.onerror=null; this.src='icons/${castle.id}.png'; this.onerror=function(){this.style.display='none';};" style="width:100%; height:100%; object-fit:cover;" crossorigin="anonymous">
            </div>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                <strong style="font-size:13px; color:#222; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${castle.name}</strong>
                <span style="font-size:10.5px; color:#b5781a; font-weight:bold;">★${castle.rarity}</span>
              </div>
              <div style="font-size:10.5px; color:#666; margin-bottom:4px; display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                <span style="background:#f0e9df; padding:1px 4px; border-radius:3px;">[${attrStr}]</span>
                <span>${castle.weapon} (${castle.rangeKind || '近'})</span>
                ${matchBadge}
              </div>
              <div style="font-size:11px; background:#f9f7f2; padding:3px 6px; border-radius:4px; border:1px solid #eee; display:flex; justify-content:space-between;">
                <span>攻: <strong style="color:#27ae60;">${calc ? calc.atk : '-'}</strong></span>
                <span>射: <strong style="color:#2980b9;">${calc ? calc.range : '-'}</strong></span>
                <span>防: <strong>${calc ? calc.def : '-'}</strong></span>
                <span>単撃: <strong style="color:#e67e22;">${calc ? calc.singleHit : '-'}</strong></span>
              </div>
            </div>
          </div>
        `);
      } else {
        slotsHtml.push(`
          <div style="background:#faf8f5; border:1px dashed #d5cbbd; border-radius:6px; padding:10px 12px; display:flex; align-items:center; justify-content:center; color:#999; font-size:12px; min-height:80px;">
            未編成 (スロット ${i + 1})
          </div>
        `);
      }
    }

    exportArea.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #8e2a2a; padding-bottom:10px; margin-bottom:14px;">
        <div>
          <div style="font-size:11px; color:#8e2a2a; font-weight:bold; letter-spacing:1px; margin-bottom:2px;">城プロRE 編成・バフ/デバフ統合ダッシュボード</div>
          <div style="font-size:22px; font-weight:bold; color:#2c1b18;">${presetName} 編成サマリー</div>
        </div>
        <div style="text-align:right; font-size:11.5px; color:#555;">
          <div>出撃地形: <strong>${terrainLabel}</strong> ｜ 総消費気: <strong style="color:#8e2a2a; font-size:13px;">${calcResult.totalGiantCost}気</strong> (配置: ${calcResult.totalDeployCost}気)</div>
          <div style="font-size:10px; color:#888; margin-top:2px;">出力日時: ${dateStr}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; margin-bottom:14px;">
        ${slotsHtml.join("")}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; font-size:10.5px; color:#888; border-top:1px solid #e0d5c1; padding-top:8px;">
        <div>城プロRE 部隊編成＆ステータス画像出力 ｜ 全${window.SCRE_DATA?.length || 1161}体データベース対応</div>
        <div>※ 巨大化気は地形一致時0.65倍の近似値です</div>
      </div>
    `;

    showToast("📸 画像を生成中...");

    window.html2canvas(exportArea, {
      useCORS: true,
      scale: 2,
      backgroundColor: "#fffcf7",
      logging: false
    }).then(canvas => {
      canvas.toBlob(blob => {
        if (!blob) {
          showToast("⚠️ 画像の生成に失敗しました");
          return;
        }
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const yyyymmdd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
        const hhmm = `${pad(now.getHours())}${pad(now.getMinutes())}`;
        const filename = `shiropro-party-${yyyymmdd}-${hhmm}.png`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`📸 編成画像を保存しました: ${filename}`);
      }, "image/png");
    }).catch(err => {
      console.error("html2canvas export error:", err);
      showToast("⚠️ 画像の書き出し中にエラーが発生しました: " + (err.message || err));
    });
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
