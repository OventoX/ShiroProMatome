// Main Application Logic (Wide PC Optimized with Presets, Reverse Filter, Terrain Sim, & Canvas Export)
(function () {
  const STORAGE_KEY_V1 = "scre-helper:party:v1";
  const PRESETS_STORAGE_KEY = "scre-helper:presets:v2";
  const TERRAIN_STORAGE_KEY = "scre-helper:terrain:v1";

  // Defaults & Constants
  const DEFAULT_PRESET_NAMES = [
    "部隊1 (汎用)",
    "部隊2 (平属性)",
    "部隊3 (山属性)",
    "部隊4 (水属性)",
    "部隊5 (地獄用)"
  ];

  const DEFAULT_PARTY_PRESET_1 = [
    { id: "崑崙", strategyOn: true, specialOn: false },
    { id: "小早川城", strategyOn: true, specialOn: false },
    { id: "［漆磊］広島城", strategyOn: true, specialOn: true },
    { id: "［無疆］江戸城", strategyOn: true, specialOn: true },
    { id: "［球陽］首里城", strategyOn: true, specialOn: true },
    { id: "［お月見］鹿野城", strategyOn: true, specialOn: false },
    { id: "［裏］松代城", strategyOn: true, specialOn: false },
    { id: "逸見エリカ", strategyOn: true, specialOn: true }
  ];

  const ALLOWED_TERRAINS = ["", "平", "平山", "山", "水", "地獄"];

  function normalizeTerrain(t) {
    return (typeof t === "string" && ALLOWED_TERRAINS.includes(t)) ? t : "";
  }

  function normalizeParty(rawParty, allowSparse = false) {
    if (!Array.isArray(rawParty)) return [];
    const valid = [];
    const seenIds = new Set();
    const len = Math.min(rawParty.length, 8);
    for (let i = 0; i < len; i++) {
      const item = rawParty[i];
      if (!item || typeof item !== "object") {
        if (allowSparse) valid.push(null);
        continue;
      }
      const id = typeof item.id === "string" ? item.id.trim() : "";
      if (!id || seenIds.has(id)) {
        if (allowSparse) valid.push(null);
        continue;
      }
      seenIds.add(id);
      const giantStep = (typeof item.giantStep === "number" && item.giantStep >= 0 && item.giantStep <= 5) ? item.giantStep : 5;
      valid.push({
        id,
        strategyOn: item.strategyOn !== undefined ? Boolean(item.strategyOn) : true,
        specialOn: item.specialOn !== undefined ? Boolean(item.specialOn) : false,
        giantStep
      });
    }
    if (allowSparse) {
      while (valid.length > 0 && valid[valid.length - 1] === null) {
        valid.pop();
      }
    }
    return valid;
  }

  function normalizePresets(rawPresets) {
    const list = Array.isArray(rawPresets) ? rawPresets : [];
    const normalized = [];
    for (let i = 0; i < 5; i++) {
      const p = list[i];
      const defaultName = DEFAULT_PRESET_NAMES[i] || `部隊${i + 1}`;
      if (p && typeof p === "object") {
        const name = (typeof p.name === "string" && p.name.trim()) ? p.name.trim() : defaultName;
        const party = normalizeParty(p.party, true);
        normalized.push({ name, party });
      } else {
        const defaultParty = (i === 0) ? JSON.parse(JSON.stringify(DEFAULT_PARTY_PRESET_1)) : [];
        normalized.push({ name: defaultName, party: defaultParty });
      }
    }
    return normalized;
  }

  function normalizeActivePresetIdx(idx, maxLen = 5) {
    const n = parseInt(idx, 10);
    if (isNaN(n) || n < 0) return 0;
    if (n >= maxLen) return Math.max(0, maxLen - 1);
    return n;
  }

  // State: Presets 1 to 5
  let partyPresets = normalizePresets([]);
  partyPresets[0].party = JSON.parse(JSON.stringify(DEFAULT_PARTY_PRESET_1));

  let currentPresetIdx = 0;
  let currentTerrain = "";
  let selectingSlotIndex = null;

  // Load Presets & Terrain (BUG-02: Safe load & normalization)
  try {
    const savedPresets = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (savedPresets) {
      const parsed = JSON.parse(savedPresets);
      if (Array.isArray(parsed) && parsed.length >= 1) {
        partyPresets = normalizePresets(parsed);
      }
    } else {
      // Migrate from v1
      const oldV1 = localStorage.getItem(STORAGE_KEY_V1);
      if (oldV1) {
        partyPresets[0].party = normalizeParty(JSON.parse(oldV1));
      }
    }
    const savedIdx = localStorage.getItem("scre-helper:activePresetIdx");
    if (savedIdx !== null) {
      currentPresetIdx = normalizeActivePresetIdx(savedIdx, partyPresets.length);
    }
    const savedTerrain = localStorage.getItem(TERRAIN_STORAGE_KEY);
    if (savedTerrain !== null) {
      currentTerrain = normalizeTerrain(savedTerrain);
    }
  } catch (e) {
    console.warn("Storage load error:", e);
    partyPresets = normalizePresets([]);
    currentPresetIdx = 0;
    currentTerrain = "";
  }

  // Active party pointer (guaranteed non-null array)
  let party = partyPresets[currentPresetIdx].party;

  function saveParty() {
    party = normalizeParty(party, true);
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
  // B3: 編成 Undo 履歴スタック (最大50件)
  // ==========================================
  const undoStack = [];
  const MAX_UNDO = 50;
  let isUndoing = false;
  window.__getUndoStack = () => undoStack;
  window.__getIsUndoing = () => isUndoing;

  function pushUndoSnapshot() {
    if (isUndoing) return;
    try {
      const snapshot = {
        presets: JSON.parse(JSON.stringify(partyPresets)),
        currentPresetIdx: currentPresetIdx,
        currentTerrain: currentTerrain
      };
      undoStack.push(snapshot);
      if (undoStack.length > MAX_UNDO) {
        undoStack.shift();
      }
      updateUndoButtonUI();
    } catch (e) {
      console.warn("pushUndoSnapshot failed:", e);
    }
  }

  function performUndo() {
    if (undoStack.length === 0) {
      showNotification("これ以上元に戻せません");
      return;
    }
    const snapshot = undoStack.pop();
    isUndoing = true;
    try {
      partyPresets = normalizePresets(snapshot.presets);
      currentPresetIdx = normalizeActivePresetIdx(snapshot.currentPresetIdx, partyPresets.length);
      currentTerrain = normalizeTerrain(snapshot.currentTerrain);
      party = partyPresets[currentPresetIdx].party;
      savePresets();
      renderPresetBar();
      renderDashboard();
      if (typeof updateCoveragePanel === "function") updateCoveragePanel();
      updateUndoButtonUI();
      showNotification("直前の編成変更を取り消しました ↺");
    } finally {
      isUndoing = false;
    }
  }

  function updateUndoButtonUI() {
    const btn = document.getElementById("btnUndoParty");
    if (btn) {
      btn.disabled = (undoStack.length === 0);
      btn.title = undoStack.length > 0 ? `編成変更を取り消す (Ctrl+Z) [履歴${undoStack.length}件]` : "取り消せる履歴がありません (Ctrl+Z)";
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
    if (typeof clearStageSuggestedPartyCache === "function") {
      clearStageSuggestedPartyCache();
    }
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

  // Toast Notification Helper (BUG-03: textContent prevents HTML injection)
  const showToast = (msg, isWarning = false) => showNotification(msg, isWarning);
  function showNotification(msg, isWarning = false) {
    let toast = document.querySelector(".toast-notification");
    if (toast) toast.remove();
    toast = document.createElement("div");
    toast.className = "toast-notification" + (isWarning ? " toast-warning" : "");
    const iconSpan = document.createElement("span");
    iconSpan.textContent = isWarning ? '⚠️' : '✓';
    const msgSpan = document.createElement("span");
    msgSpan.textContent = String(msg ?? "");
    toast.appendChild(iconSpan);
    toast.appendChild(msgSpan);
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, isWarning ? 4200 : 2800);
  }

  function switchPreset(idx) {
    const validIdx = normalizeActivePresetIdx(idx, partyPresets.length);
    if (validIdx === currentPresetIdx && partyPresets[currentPresetIdx] && Array.isArray(partyPresets[currentPresetIdx].party)) return;
    pushUndoSnapshot();
    currentPresetIdx = validIdx;
    if (!partyPresets[currentPresetIdx] || !Array.isArray(partyPresets[currentPresetIdx].party)) {
      partyPresets[currentPresetIdx] = {
        name: DEFAULT_PRESET_NAMES[currentPresetIdx] || `部隊${currentPresetIdx + 1}`,
        party: []
      };
    }
    party = partyPresets[currentPresetIdx].party;
    console.log("switchPreset to:", currentPresetIdx, "party length:", party.length);
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
  // Stage Progress & Saved Parties (プロンプト2 & プロンプト26 指摘2: 改名エイリアス移行)
  // ==========================================
  const STAGE_PROGRESS_STORAGE_KEY = "scre-helper:stage-progress:v1";

  const STAGE_TITLE_ALIASES = {
    "春の回廊 2間": "春の回廊 第2間"
  };

  function canonicalStageTitle(title) {
    if (!title || typeof title !== "string") return "";
    return STAGE_TITLE_ALIASES[title] || title;
  }

  function getStageProgressData() {
    try {
      const raw = localStorage.getItem(STAGE_PROGRESS_STORAGE_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return {};

      // Migrate legacy stage titles to canonical titles
      let migrated = false;
      for (const [oldTitle, newTitle] of Object.entries(STAGE_TITLE_ALIASES)) {
        if (data[oldTitle]) {
          if (!data[newTitle]) {
            data[newTitle] = data[oldTitle];
          }
          delete data[oldTitle];
          migrated = true;
        }
      }
      if (migrated) {
        saveStageProgressData(data);
      }
      return data;
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
    const canonical = canonicalStageTitle(stageTitle);
    const data = getStageProgressData();
    const existing = data[canonical] || {};
    const newStatus = (forceStatus !== null) ? forceStatus : !existing.cleared;
    data[canonical] = {
      cleared: newStatus,
      party: existing.party || (newStatus ? party.filter(Boolean).map(s => s.id) : []),
      savedAt: new Date().toISOString()
    };
    saveStageProgressData(data);
    renderGuidesTab();
  }

  function savePartyForStage(stageTitle) {
    const canonical = canonicalStageTitle(stageTitle);
    const data = getStageProgressData();
    const partyIds = party.filter(Boolean).map(s => s.id);
    data[canonical] = {
      cleared: true,
      party: partyIds,
      savedAt: new Date().toISOString()
    };
    saveStageProgressData(data);
    showToast(`✅ 【${canonical}】のクリア編成（${partyIds.length}体）を保存しました`);
    renderGuidesTab();
  }

  function restorePartyFromStage(stageTitle) {
    const canonical = canonicalStageTitle(stageTitle);
    const data = getStageProgressData();
    const record = data[canonical];
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

    pushUndoSnapshot();
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
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&(?!(?:amp|lt|gt|quot|#39|#x27|#\d+);)/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

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

  function getCastleFullText(c) {
    if (!c) return "";
    const parts = [
      c.skill ? (c.skill.name + " " + c.skill.text) : "",
      c.strategy ? (c.strategy.name + " " + c.strategy.text) : "",
      c.special ? (c.special.name + " " + c.special.text) : ""
    ];
    if (c.allSkills) c.allSkills.forEach(s => parts.push(s.name + " " + s.text));
    if (c.allStrategies) c.allStrategies.forEach(s => parts.push(s.name + " " + s.text));
    if (c.allSpecials) c.allSpecials.forEach(s => parts.push(s.name + " " + s.text));
    return parts.filter(Boolean).join(" ");
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
    const rawParty = Array.isArray(targetParty) ? targetParty : [];
    const seenIds = new Set();
    const activePartyMembers = [];
    rawParty.forEach((slot, index) => {
      if (!slot || !slot.id || seenIds.has(slot.id)) return;
      const castle = getCastleById(slot.id);
      if (castle) {
        seenIds.add(slot.id);
        activePartyMembers.push({ slot, castle, slotIndex: index });
      }
    });

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
            // 鼓舞効果は自身以外の味方に適用（供与者自身への二重適用防止）
            if (isSelf) return;
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
      const base = (castle.stats && castle.stats.giant5) || { atk: 100, def: 100, hp: 1000, range: 100, recovery: 10 };

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

      // Terrain matching check (通常地形は1.25倍、地獄地形は1.3倍)
      const isTerrainMatch = Boolean(targetTerrain && castle.attributes && castle.attributes.includes(targetTerrain));
      const terrainMult = isTerrainMatch ? (targetTerrain === "地獄" ? 1.3 : 1.25) : 1.0;

      const effectiveAtk = Math.floor((base.atk * terrainMult) * (1 + atkPerc) + b.atkFlat.sum + shareAtk);
      const effectiveDef = Math.floor((base.def * terrainMult) * (1 + defPerc) + b.defFlat.sum + shareDef);
      const effectiveRange = Math.floor(base.range * (1 + rangePerc) + b.rangeFlat.sum + shareRange);
      const effectiveHp = Math.floor((base.hp * terrainMult) * (1 + hpPerc) + b.hpFlat.sum);

      // Single hit damage estimation: Atk * (与えるダメージ倍率の積) * (1 + 与ダメージ%) (Prompt 13)
      const dmgDealtPerc = (b.dmgDealt.max + b.dmgDealt.stackSum) / 100;
      const activeTargetSources = b.dmgDealtTarget.sources.filter(s => s.applied !== false);
      const dmgTargetMult = activeTargetSources.reduce((acc, s) => acc * (1 + s.val / 100), 1.0);
      b.dmgDealtTarget.multProduct = dmgTargetMult;
      const singleHitEstimate = Math.floor(effectiveAtk * dmgTargetMult * (1 + dmgDealtPerc));

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
      tabContents.forEach(el => el.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");

      if (targetId === "tab-dashboard") renderDashboard();
      if (targetId === "tab-tier") renderTierTab();
      if (targetId === "tab-guides") renderGuidesTab();
      if (targetId === "tab-map") renderMapTab();
      if (targetId === "tab-quiz") renderQuizTab();
      if (targetId === "tab-special") renderSpecialTab();
      if (targetId === "tab-list") renderAllCastles();
      if (targetId === "tab-firing-range" && typeof renderFiringRangeTab === "function") renderFiringRangeTab();
      if (targetId !== "tab-firing-range" && typeof pauseFiringSimulation === "function") pauseFiringSimulation();
    });
  });

  function renderDashboard() {
    const calcResult = calculateBuffs();
    renderPartyTab(calcResult);
    renderBuffGrid(calcResult);
    if (typeof renderBuffEquivalence === "function") renderBuffEquivalence(calcResult);
    renderMissingSidebar(calcResult);
    renderCoveragePanel(calcResult);
    const simBody = document.getElementById("giantizeSimBody");
    if (simBody && simBody.style.display !== "none") {
      calculateGiantizeSimulation();
    }
    if (typeof renderChallengeUI === "function") renderChallengeUI();
    if (typeof renderDamageChecker === "function") renderDamageChecker(calcResult);
    if (typeof renderRomanSimulator === "function") renderRomanSimulator();
    if (typeof renderKiLedger === "function") renderKiLedger();
    if (typeof renderCycleSyncSection === "function") renderCycleSyncSection();
    if (typeof renderTokenReportCardSection === "function") renderTokenReportCardSection();
    if (document.getElementById("tab-firing-range")?.classList.contains("active") && typeof renderFiringRangeTab === "function") {
      renderFiringRangeTab();
    }
  }

  // 1. Render Party Slots (Showing dynamic live stats & Terrain Matching)
  function renderPartyTab(calcResult) {
    if (!calcResult) calcResult = calculateBuffs();
    const listEl = document.getElementById("partySlotList");
    listEl.innerHTML = "";
    document.getElementById("partyCounter").textContent = `編成 ${party.filter(Boolean).length}/8`;

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
          const isViolated = (typeof activeChallenge !== "undefined" && activeChallenge && !activeChallenge.checkFn(castle));
          if (isViolated) {
            card.classList.add("challenge-violation");
          }
          const calc = calcResult && calcResult.perCastle[castle.id] ? calcResult.perCastle[castle.id].calculatedStats : null;
          const attrStr = castle.subType || castle.castleType;
          const matchBadge = (calc && calc.isTerrainMatch) ? `<span class="badge" style="background:#2c6f4f;color:#fff;font-size:9.5px;padding:1px 4px;margin-left:3px;" title="出撃地形一致: 巨大化消費気35%減＆合戦ステータス1.25倍">✓一致</span>` : '';
          if (calc) {
            subInfo = `★${castle.rarity} [${attrStr}]${matchBadge}・攻<strong style="color:var(--buff-color);">${calc.atk}</strong>・1撃<strong style="color:var(--buff-color);">${calc.singleHit}</strong>`;
          } else {
            subInfo = `★${castle.rarity} [${attrStr}]・攻${castle.stats.giant5.atk}・1撃${castle.stats.giant5.singleHit || '-'}`;
          }
          if (isViolated) {
            subInfo += ` <span class="challenge-violation-tag" style="background:#dc3545;color:#fff;font-size:9.5px;padding:1px 5px;border-radius:3px;margin-left:4px;" title="縛り条件不適合">⚠️ 縛り不適合</span>`;
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
      const isTargetDmg = label.includes("与えるダメ") || bucket.multProduct !== undefined;
      const total = isTargetDmg && bucket.multProduct
        ? Math.round((bucket.multProduct - 1.0) * 100)
        : (bucket.max + bucket.stackSum);
      if (total <= 0 && (!bucket.sources || bucket.sources.length === 0)) return "";
      const count = (bucket.sources || []).length;
      const isMixed = bucket.max > 0 && bucket.stackSum > 0;
      const modeText = isTargetDmg
        ? `乗算適用 (${count}件)`
        : (isMixed ? `最大値+加算 (${count}件)` : (bucket.stackSum > 0 ? `加算合計 (${count}件)` : `最大値採用 (${count}件)`));
      const bdId = `bd-${uid}-${++breakdownCounter}`;

      const itemsHtml = (bucket.sources || []).map(s => {
        let tag = "";
        let style = "";
        let nameHtml = "";
        const condBadge = s.condition ? `<span class="badge" style="background:#8e44ad; color:#fff; font-size:10px; padding:1px 4px; border-radius:3px; margin-right:3px;">${escapeHtml(s.condition)}</span>` : "";
        if (isTargetDmg) {
          tag = `<span class="buff-tag" style="background:#27ae60; color:#fff;">[乗算]</span>`;
          style = "color:var(--buff-color); font-weight:bold;";
          nameHtml = `<strong>${s.from}</strong>`;
        } else if (s.stackable) {
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
        return `<div style="margin-bottom:2px;"><span style="${style}">${tag} +${s.val}%</span>: ${condBadge}${nameHtml} [${s.type}] <span style="color:#666;">(${s.raw})</span></div>`;
      }).join("");

      const multStr = isTargetDmg && bucket.multProduct && bucket.multProduct > 1.0 ? ` (${bucket.multProduct.toFixed(2)}倍)` : "";

      return `
        <div class="buff-row">
          <span class="buff-label">${label}</span>
          <span class="buff-val-pos">+${total}%${multStr}</span>
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
      const base = (castle.stats && castle.stats.giant5) || { atk: 100, def: 100, hp: 1000, range: 100, recovery: 10 };
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
    const currentPartyIds = new Set(party.filter(Boolean).map(p => p.id));

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

      // Range kind (遠近は近接・遠隔の両方に加算)
      const rk = castle.rangeKind || "近";
      if (rk === "近" || rk === "近接") {
        nearCount++;
      } else if (rk === "遠" || rk === "遠隔") {
        farCount++;
      } else if (rk === "遠近") {
        nearCount++;
        farCount++;
        bothCount++;
      }
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
    const actionEl = e.target.closest("[data-action]");
    const action = actionEl ? actionEl.getAttribute("data-action") : e.target.getAttribute("data-action");
    const index = actionEl ? parseInt(actionEl.getAttribute("data-index"), 10) : parseInt(e.target.getAttribute("data-index"), 10);

    if (action === "toggle-strat") {
      if (party[index]) {
        pushUndoSnapshot();
        party[index].strategyOn = !party[index].strategyOn;
        saveParty();
        renderDashboard();
      }
    } else if (action === "toggle-special") {
      if (party[index]) {
        pushUndoSnapshot();
        party[index].specialOn = !party[index].specialOn;
        saveParty();
        renderDashboard();
      }
    } else if (action === "remove") {
      if (party[index]) {
        pushUndoSnapshot();
        party.splice(index, 1);
        saveParty();
        renderDashboard();
      }
    } else if (e.target.classList.contains("castle-name")) {
      const id = e.target.getAttribute("data-id");
      openCastleDetail(id, party.filter(Boolean).map(s => getCastleById(s.id)).filter(Boolean));
    }
  });

  document.getElementById("missingChecklist").addEventListener("click", e => {
    if (e.target.classList.contains("candidate-chip")) {
      const id = e.target.getAttribute("data-id");
      if (party.filter(Boolean).length >= 8) {
        alert("編成枠がいっぱいです(最大8体)。");
        return;
      }
      pushUndoSnapshot();
      const c = getCastleById(id);
      const newMember = { id, strategyOn: true, specialOn: !!(c && c.special), giantStep: 5 };
      const emptyIdx = party.findIndex(p => !p);
      if (emptyIdx !== -1) {
        party[emptyIdx] = newMember;
      } else {
        party.push(newMember);
      }
      saveParty();
      renderDashboard();
    }
  });

  // Empty party
  document.getElementById("btnEmptyParty").addEventListener("click", () => {
    if (confirm("現在の部隊を空にしますか？")) {
      pushUndoSnapshot();
      party = [];
      saveParty();
      renderDashboard();
      renderAllCastles();
    }
  });

  // Terrain select change
  document.getElementById("mapTerrainSelect").addEventListener("change", e => {
    pushUndoSnapshot();
    currentTerrain = e.target.value;
    savePresets();
    renderDashboard();
    renderAllCastles();
  });

  // Populate Dashboard Stage Select from guides (BUG-11: exclude /E and natural numeric sort)
  function populateDashboardStageSelect() {
    const sel = document.getElementById("dashboardStageSelect");
    if (!sel || !window.SCRE_GUIDES || !Array.isArray(window.SCRE_GUIDES)) return;
    sel.innerHTML = '<option value="">-- ステージ選択 --</option>';
    window.SCRE_GUIDES.forEach(cat => {
      if (!cat.stages || cat.stages.length === 0) return;
      const validStages = cat.stages.filter(st => !st.title.endsWith("/E") && !st.id.endsWith("/E"));
      if (validStages.length === 0) return;

      const sortedStages = validStages.slice().sort((a, b) => {
        return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
      });

      const grp = document.createElement("optgroup");
      grp.label = cat.category;
      sortedStages.forEach(st => {
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
      const names = party.filter(Boolean).map(slot => {
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
      if (typeof activeTagFilter !== "undefined" && activeTagFilter) {
        const cTags = (typeof extractCastleEffectTags === "function") ? extractCastleEffectTags(c) : [];
        if (!cTags.includes(activeTagFilter)) return false;
      }
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

      // A3: Extended filters (Illustrator, Voice Actor, Country)
      const fIll = document.getElementById("filterIllustrator")?.value;
      if (fIll && cleanIllustratorName(c.illustrator) !== fIll) return false;

      const fVa = document.getElementById("filterVoiceActor")?.value;
      if (fVa && cleanVoiceActorName(c.voiceActor) !== fVa) return false;

      const fCountry = document.getElementById("filterCountry")?.value;
      if (fCountry && cleanCountryName(c.country) !== fCountry) return false;

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

    // B5: 並び替え (Sort)
    const sortKeyEl = document.getElementById("listSortKey");
    const sortOrderBtn = document.getElementById("btnListSortOrder");
    const sortKey = (sortKeyEl && sortKeyEl.value) || "id";
    const sortOrder = (sortOrderBtn && sortOrderBtn.getAttribute("data-order")) || "desc";

    filtered.sort((a, b) => {
      let diff = 0;
      if (sortKey === "id") {
        const noA = parseInt(a.bookNo, 10) || 0;
        const noB = parseInt(b.bookNo, 10) || 0;
        diff = noB - noA;
      } else if (sortKey === "tierScore") {
        const scoreA = getCastleTierScore(a);
        const scoreB = getCastleTierScore(b);
        diff = scoreB - scoreA;
      } else if (sortKey === "cost") {
        const costA = a.cost || a.statsDetail?.initial?.cost || 999;
        const costB = b.cost || b.statsDetail?.initial?.cost || 999;
        diff = costB - costA;
      } else if (sortKey === "giantAtk") {
        const atkA = a.statsDetail?.giant5?.atk || 0;
        const atkB = b.statsDetail?.giant5?.atk || 0;
        diff = atkB - atkA;
      } else if (sortKey === "giantHp") {
        const hpA = a.statsDetail?.giant5?.hp || 0;
        const hpB = b.statsDetail?.giant5?.hp || 0;
        diff = hpB - hpA;
      } else if (sortKey === "giantDef") {
        const defA = a.statsDetail?.giant5?.def || 0;
        const defB = b.statsDetail?.giant5?.def || 0;
        diff = defB - defA;
      } else if (sortKey === "nameRuby") {
        const rA = a.ruby || a.name || "";
        const rB = b.ruby || b.name || "";
        diff = rB.localeCompare(rA, "ja");
      }
      return sortOrder === "asc" ? -diff : diff;
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

    const galleryEl = document.getElementById("allCastleGallery");
    if (galleryEl) {
      galleryEl.innerHTML = "";
      if (listActiveViewMode === "gallery") {
        pageItems.forEach(c => {
          galleryEl.appendChild(renderGalleryTile(c));
        });
      }
    }

    pageItems.forEach(c => {
      const inParty = party.some(p => p && p.id === c.id);
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
            <div class="castle-item-title">${c.name}${c.realCastle ? '<span class="real-castle-badge" title="実在の城の写真・情報あり">🏯</span>' : ''}</div>
            <div class="castle-item-badges">
              <button class="btn-fav ${isFav ? 'active' : ''}" data-action="toggle-fav" data-id="${c.id}" title="お気に入り切替">${isFav ? '★' : '☆'}</button>
              <button class="btn-owned ${isOwned ? 'active' : ''}" data-action="toggle-owned" data-id="${c.id}" title="所持切替">${isOwned ? '所持' : '未所持'}</button>
              <!-- C2: Official color token badges -->
              <span class="badge badge-rarity badge-rarity-${c.rarity}">★${c.rarity}</span>
              ${getAttrBadgeHtml(c)}
              <span class="badge badge-weapon" style="background:#555;color:#fff;">${c.weapon}</span>
              <span class="badge badge-range badge-range-${c.rangeKind === '遠近' ? 'both' : (c.rangeKind === '遠' ? 'far' : 'near')}">${c.rangeKind || '近'}</span>
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
              <button class="btn btn-sm btn-compare ${compareCastles.some(x => x.id === c.id) ? 'active' : ''}" data-compare-id="${c.id}" style="padding:4px 7px;font-size:11px;${compareCastles.some(x => x.id === c.id) ? 'background:#2980b9;color:#fff;border-color:#20638f;' : ''}" title="城娘比較に追加">
                ${compareCastles.some(x => x.id === c.id) ? '✓ 比較中' : '⚖️ 比較'}
              </button>
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

    // 0.5 Toggle Compare (B4)
    const compareBtn = e.target.closest('[data-compare-id]');
    if (compareBtn) {
      e.stopPropagation();
      toggleCompareCastle(compareBtn.getAttribute('data-compare-id'));
      renderAllCastles();
      return;
    }

    // 1. Toggle party button
    const togglePartyId = e.target.getAttribute("data-toggle-party");
    if (togglePartyId) {
      pushUndoSnapshot();
      const existingIdx = party.findIndex(p => p && p.id === togglePartyId);
      if (existingIdx !== -1) {
        party.splice(existingIdx, 1);
      } else {
        if (party.filter(Boolean).length >= 8) {
          alert("編成枠がいっぱいです(最大8体)。");
          return;
        }
        const c = getCastleById(togglePartyId);
        const newMember = { id: togglePartyId, strategyOn: true, specialOn: !!(c && c.special), giantStep: 5 };
        const emptyIdx = party.findIndex(p => !p);
        if (emptyIdx !== -1) {
          party[emptyIdx] = newMember;
        } else {
          party.push(newMember);
        }
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
    if (typeof renderDelibPlanner === "function") renderDelibPlanner();
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
              <strong style="font-size:var(--fs-title, 15px); color:#e0b0ff;">🔥 ハデスの死闘場（超難・全11深層マップ完全攻略ガイド）</strong>
              <span style="font-size:var(--fs-sub, 12px); color:#d1c2ea; margin-left:6px;">地獄最深コンテンツ・★7 エレボス交換所対応</span>
            </div>
            <div style="display:flex; gap:6px;">
              <span class="badge" style="background:#8e44ad; color:#fff;">合戦難度: 超難固定</span>
              <span class="badge" style="background:#27ae60; color:#fff;">土日ドロップ 1.2倍</span>
            </div>
          </div>
          <div style="font-size:var(--fs-body, 13px); line-height:1.6; color:#f0e6ff;">
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
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px; font-size:var(--fs-sub, 12px); background:rgba(0,0,0,0.35); padding:8px 10px; border-radius:4px; border:1px solid rgba(255,255,255,0.1);">
              <div><strong style="color:#ff7675;">● 赤霊魂:</strong> 閻魔大王 / イザナギ / 覇・前田利家 (深層1) / クロノス (深層2)</div>
              <div><strong style="color:#74b9ff;">● 青霊魂:</strong> ヘル / オーディン / 幻・佐竹義重 (深層1) / ヴィシュヌ (深層2)</div>
              <div><strong style="color:#ffeaa7;">● 黄霊魂:</strong> オシリス / インドラ / アヌ (深層1)</div>
            </div>
            <div style="font-size:var(--fs-sub, 12px); color:#c8b6e2; margin-top:6px;">
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
        badgeHtml += `<span class="badge" style="background:#34495e; color:#fff; font-size:var(--fs-sub, 12px); padding:2px 6px;">編成保存済 (${progressData[st.title].party.length}体)</span> `;
      }
      if (st.subCategory) {
        badgeHtml += `<span class="badge" style="background:#4b3869; color:#fff; font-size:var(--fs-sub, 12px); padding:2px 6px;">${st.subCategory}</span> `;
      }
      if (st.hadesMeta) {
        const soulColors = { "赤": "#c0392b", "青": "#2980b9", "黄": "#d4ac0d" };
        const sColor = soulColors[st.hadesMeta.soulColor] || "#8e44ad";
        badgeHtml += `<span class="badge" style="background:${sColor}; color:#fff; font-weight:bold; font-size:var(--fs-sub, 12px); padding:2px 6px;">${st.hadesMeta.soulColor}霊魂 (${st.hadesMeta.depth})</span> `;
        badgeHtml += `<span class="badge" style="background:#555; color:#fff; font-size:var(--fs-sub, 12px); padding:2px 6px;">超難</span> `;
      }
      if (st.totalDelibPoints) {
        badgeHtml += `<span class="badge" style="background:#6c5ce7; color:#fff; font-size:var(--fs-sub, 12px); padding:2px 6px;">${st.totalDelibPoints}審議 (${st.deliberations.length}件)</span> `;
      }

      let rulesHtml = "";
      if (st.rules && st.rules.length > 0) {
        rulesHtml += `
          <div style="margin-top:6px;">
            <strong style="color:var(--primary-color);font-size:var(--fs-body, 13px);">特別ルール・戦場効果:</strong>
            <ul style="padding-left:18px;font-size:var(--fs-body, 13px);color:#444;margin-top:2px;line-height:1.45;">
              ${st.rules.map(r => `<li style="margin-bottom:3px;line-height:1.35;">${r.replace(/\n/g, '<br>')}</li>`).join("")}
            </ul>
          </div>
        `;
      }

      let bossHtml = "";
      if (st.bossInfo && st.bossInfo.length > 0) {
        bossHtml += `
          <div style="margin-top:6px;">
            <strong style="color:var(--debuff-color);font-size:var(--fs-body, 13px);">☠️ ボス・強敵の特性:</strong>
            <ul style="padding-left:18px;font-size:var(--fs-body, 13px);color:#555;margin-top:2px;line-height:1.45;">
              ${st.bossInfo.map(b => `<li style="margin-bottom:3px;line-height:1.35;">${b.replace(/\n/g, '<br>')}</li>`).join("")}
            </ul>
          </div>
        `;
      }

      let delibHtml = "";
      if (st.deliberations && st.deliberations.length > 0) {
        delibHtml += `
          <div style="margin-top:6px;">
            <strong style="color:#2a6496;font-size:var(--fs-body, 13px);">審議項目 (${st.deliberations.length}件 / 計${st.totalDelibPoints || '-'}審):</strong>
            <div style="font-size:var(--fs-body, 13px);background:#f9f9f9;padding:8px 10px;border-radius:4px;border:1px solid #e5e0d8;margin-top:3px;max-height:140px;overflow-y:auto;line-height:1.45;">
              ${st.deliberations.map(d => `
                <div style="margin-bottom:4px;border-bottom:1px dashed #eee;padding-bottom:3px;line-height:1.35;">
                  <span class="badge" style="background:#2d3436; color:#fff; font-size:var(--fs-sub, 12px); padding:2px 6px; margin-right:4px;">${d.point}審</span>
                  <strong>${d.name}:</strong> <span style="color:#555;">${d.effect.replace(/\n/g, '<br>')}</span>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }

      const isHellStage = (cat === "地獄" || st.category === "地獄" || st.subCategory === "ハデスの死闘場");
      const safeStageId = (st.id || st.title).replace(/[^a-zA-Z0-9_　-鿿-]/g, "_");

      let suggestSectionHtml = "";
      if (isHellStage) {
        suggestSectionHtml = `
          <div class="stage-suggest-section" id="suggest-sec-${safeStageId}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <button class="btn btn-sm btn-toggle-suggest" data-action="toggle-suggest" data-id="${st.id || st.title}" data-title="${st.title}" data-target="suggest-body-${safeStageId}">
                📋 おすすめ編成 (8体) を見る <span class="suggest-toggle-arrow">▼</span>
              </button>
            </div>
            <div class="suggest-card-body" id="suggest-body-${safeStageId}" style="display:none;"></div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="buff-header" style="flex-wrap:wrap; gap:4px; align-items:flex-start;">
          <div style="flex:1; min-width:200px;">
            <div style="margin-bottom:3px;">${badgeHtml}</div>
            <strong style="font-size:var(--fs-emphasis, 14.5px);">${st.title}</strong>
          </div>
          ${st.terrain !== "無" ? `<span class="type-tag ${st.terrain}" style="position:static;padding:2px 6px;">${st.terrain}</span>` : ''}
        </div>
        <div style="font-size:var(--fs-body, 13px);line-height:1.5;">
          ${rulesHtml}
          ${bossHtml}
          ${delibHtml}
        </div>
        ${suggestSectionHtml}
        <div style="display:flex; gap:8px; margin-top:10px; padding-top:8px; border-top:1px dashed #d8cfc4; flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary" data-action="diag-stage" data-title="${st.title}" data-id="${st.id}" style="font-size:var(--fs-sub, 12px); font-weight:bold; flex:2; min-width:110px; padding:5px 8px;">部隊の適合判定 ⚔</button>
          <button class="btn btn-sm" data-action="filter-stage" data-title="${st.title}" data-terrain="${st.terrain}" style="font-size:var(--fs-sub, 12px); flex:2; min-width:110px; background:#f5f0e6; border-color:#d5cbbd; padding:5px 8px;">対策城娘を探す 🔍</button>
          <button class="btn btn-sm btn-toggle-clear ${isStCleared ? 'cleared' : ''}" data-action="toggle-clear" data-title="${st.title}" style="flex:1; min-width:80px; font-size:var(--fs-sub, 12px); padding:5px 8px;">${isStCleared ? '✓ クリア済' : '未クリア'}</button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function renderSuggestedPartyHtml(st, result, stageRecord) {
    const matchCount = result.filter(r => r.isMatch).length;
    const cardsHtml = result.map(({ castle: c, role, reason, isMatch, isOwned }) => `
      <div class="suggest-castle-card">
        <div class="castle-info-row">
          ${getIconHtml(c, 32)}
          <div style="overflow:hidden; flex:1;">
            <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
              <span style="font-size:var(--fs-sub, 12px); font-weight:bold; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;" title="${c.name}">${c.name}</span>
              ${!isOwned ? `<span class="badge" style="background:#e74c3c; color:#fff; font-size:var(--fs-sub, 12px); padding:1px 5px;">未所持</span>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:3px; margin-top:2px;">
              <span class="suggest-role-tag">${role}</span>
              ${isMatch ? `<span class="badge" style="background:#2c6f4f; color:#fff; font-size:var(--fs-sub, 12px); padding:1px 5px;">一致</span>` : ''}
            </div>
          </div>
        </div>
        <div class="suggest-reason-box" title="${reason}">
          ${reason}
        </div>
      </div>
    `).join("");

    let clearPartyHtml = "";
    if (stageRecord && stageRecord.party && stageRecord.party.length > 0) {
      const userCastles = stageRecord.party.map(id => getCastleById(id)).filter(Boolean);
      const savedAtStr = stageRecord.savedAt ? new Date(stageRecord.savedAt).toLocaleDateString("ja-JP") : "";
      if (userCastles.length > 0) {
        clearPartyHtml = `
          <div class="user-clear-party-box">
            <div style="font-size:var(--fs-emphasis, 14px); font-weight:bold; color:#844a08; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
              <span>🏆 あなたのクリア編成 (${userCastles.length}体)</span>
              ${savedAtStr ? `<span style="font-size:var(--fs-sub, 12px); color:#888; font-weight:normal;">${savedAtStr}保存</span>` : ''}
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:6px;">
              ${userCastles.map(c => `
                <div style="display:flex; align-items:center; gap:6px; background:#fff; border:1px solid #ebdccb; padding:4px 6px; border-radius:4px;">
                  ${getIconHtml(c, 26)}
                  <div style="overflow:hidden;">
                    <div style="font-size:var(--fs-sub, 12px); font-weight:bold; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${c.name}</div>
                    <div style="font-size:var(--fs-sub, 12px); color:#777;">★${c.rarity} ${c.weapon}</div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }
    }

    return `
      <div class="stage-suggest-container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
          <div>
            <strong style="color:#185a9d; font-size:var(--fs-emphasis, 14px);">📋 おすすめ編成（8体・自動選出）</strong>
            <span class="badge" style="background:#2c6f4f; color:#fff; font-size:var(--fs-sub, 12px); padding:2px 6px; margin-left:6px;">地形一致: ${matchCount}/8体</span>
          </div>
          <button class="btn btn-sm btn-primary" data-action="load-suggested-party" data-title="${st.title}" data-id="${st.id || st.title}" style="font-size:var(--fs-sub, 12px); font-weight:bold; background:#2c6f4f; border-color:#20523a; padding:5px 10px;">この編成を読み込む ⚔</button>
        </div>
        <div class="suggest-disclaimer">
          ※ おすすめ編成はデータからの自動生成による目安です。実際の攻略編成とは異なる場合があります
        </div>
        <div class="suggest-party-grid">
          ${cardsHtml}
        </div>
        ${clearPartyHtml}
      </div>
    `;
  }

  document.getElementById("guideCategorySelect").addEventListener("change", renderGuidesTab);
  const subcatEl = document.getElementById("guideSubCategorySelect");
  if (subcatEl) subcatEl.addEventListener("change", renderGuidesTab);
  document.getElementById("guideSearchInput").addEventListener("input", renderGuidesTab);
  const guideClearFilterEl = document.getElementById("guideClearFilter");
  if (guideClearFilterEl) guideClearFilterEl.addEventListener("change", renderGuidesTab);
  const guideOwnedOnlyEl = document.getElementById("guideOwnedOnly");
  if (guideOwnedOnlyEl) {
    guideOwnedOnlyEl.addEventListener("change", () => {
      clearStageSuggestedPartyCache();
      renderGuidesTab();
    });
  }

  // Guide stage action listeners
  document.getElementById("guidesListContainer").addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const title = btn.getAttribute("data-title");
    const id = btn.getAttribute("data-id") || title;
    if (!action || !title) return;

    if (action === "toggle-clear") {
      toggleStageCleared(title);
    } else if (action === "diag-stage") {
      openStageDiagnostic(id);
    } else if (action === "filter-stage") {
      const terrain = btn.getAttribute("data-terrain");
      filterCastlesForStage(title, terrain);
    } else if (action === "toggle-suggest") {
      const targetId = btn.getAttribute("data-target");
      const bodyEl = document.getElementById(targetId);
      if (!bodyEl) return;
      const isHidden = (bodyEl.style.display === "none");
      if (isHidden) {
        const st = findStage(id) || findStage(title);
        if (!st) return;
        const ownedOnly = document.getElementById("guideOwnedOnly")?.checked || false;
        const result = generateAutoSuggestedParty(st, ownedOnly);
        const progressData = getStageProgressData();
        const stageRecord = progressData[st.title] || {};
        bodyEl.innerHTML = renderSuggestedPartyHtml(st, result, stageRecord);
        bodyEl.style.display = "block";
        const arrow = btn.querySelector(".suggest-toggle-arrow");
        if (arrow) arrow.textContent = "▲";
      } else {
        bodyEl.style.display = "none";
        const arrow = btn.querySelector(".suggest-toggle-arrow");
        if (arrow) arrow.textContent = "▼";
      }
    } else if (action === "load-suggested-party") {
      loadSuggestedPartyToCurrent(id || title);
    }
  });

  // Special Tab
  function renderSpecialTab() {
    const container = document.getElementById("specialAbilitiesList");
    container.innerHTML = "";
    const activeMembers = party.filter(Boolean).map(s => getCastleById(s.id)).filter(Boolean);
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

  // Slot selection & castle placement logic (Prompt 26 指摘1: 要素消失バグ解消・安全なスロット移動)
  function selectCastleForSlot(c, targetSlotIndex = null) {
    pushUndoSnapshot();
    const existingIdx = party.findIndex(p => p && p.id === c.id);
    const newMember = { id: c.id, strategyOn: true, specialOn: !!c.special, giantStep: 5 };

    if (existingIdx !== -1) {
      if (targetSlotIndex !== null && targetSlotIndex >= 0 && targetSlotIndex < 8) {
        while (party.length <= targetSlotIndex) party.push(null);
        const temp = party[targetSlotIndex];
        party[targetSlotIndex] = party[existingIdx];
        party[existingIdx] = temp;
      }
    } else {
      if (targetSlotIndex !== null && targetSlotIndex >= 0 && targetSlotIndex < 8) {
        while (party.length <= targetSlotIndex) party.push(null);
        party[targetSlotIndex] = newMember;
      } else {
        const emptyIdx = party.findIndex(p => !p);
        if (emptyIdx !== -1) {
          party[emptyIdx] = newMember;
        } else if (party.filter(Boolean).length < 8) {
          party.push(newMember);
        }
      }
    }
    while (party.length > 0 && party[party.length - 1] === null) {
      party.pop();
    }
    saveParty();
    renderDashboard();
    return party;
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
          selectCastleForSlot(c, selectingSlotIndex);
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
      if (data && typeof data === "object") {
        pushUndoSnapshot();
        if (Array.isArray(data.presets) && data.presets.length > 0) {
          partyPresets = normalizePresets(data.presets);
        } else if (Array.isArray(data.party)) {
          partyPresets = normalizePresets([]);
          partyPresets[0].party = normalizeParty(data.party);
        }
        if (data.activePresetIdx !== undefined) {
          currentPresetIdx = normalizeActivePresetIdx(data.activePresetIdx, partyPresets.length);
        } else {
          currentPresetIdx = 0;
        }
        // Deep copy binding (BUG-07)
        party = partyPresets[currentPresetIdx].party;
        if (data.terrain !== undefined) {
          currentTerrain = normalizeTerrain(data.terrain);
          const sel = document.getElementById("mapTerrainSelect");
          if (sel) sel.value = currentTerrain;
        }
        if (data.ownership && typeof data.ownership === "object") {
          if (Array.isArray(data.ownership.owned)) ownership.owned = new Set(data.ownership.owned.filter(id => typeof id === "string"));
          if (Array.isArray(data.ownership.favorites)) ownership.favorites = new Set(data.ownership.favorites.filter(id => typeof id === "string"));
          saveOwnership();
        }
        savePresets();
        renderPresetBar();
        renderDashboard();
        renderAllCastles();
        showNotification("設定と所持データを復元しました！");
      } else {
        alert("JSONの形式が不正です（オブジェクト形式で入力してください）。");
      }
    } catch (e) {
      alert("JSON読み込み失敗: " + e.message);
    }
  });

  // ==========================================
  // B2: 一括バックアップ（全データの書き出し/読み込み）
  // ==========================================
  document.getElementById("btnFullBackupExport")?.addEventListener("click", () => {
    const backupData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("scre-helper:") || key.startsWith("scre_"))) {
        backupData[key] = localStorage.getItem(key);
      }
    }
    const payload = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      app: "城プロRE 編成・バフ/デバフ統合ダッシュボード",
      data: backupData
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
    a.href = url;
    a.download = `scre_helper_full_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const statusEl = document.getElementById("fullBackupStatus");
    if (statusEl) statusEl.textContent = `✅ 一括バックアップ（${Object.keys(backupData).length}項目）をダウンロードしました (${new Date().toLocaleTimeString()})`;
    showNotification(`全データ（${Object.keys(backupData).length}項目）を一括書き出しました！💾`);
  });

  // Allowed Backup Keys Whitelist (BUG-18)
  const ALLOWED_BACKUP_KEYS = [
    "scre-helper:presets:v2",
    "scre-helper:activePresetIdx",
    "scre-helper:terrain:v1",
    "scre-helper:ownership:v1",
    "scre-helper:stage-progress:v1",
    "scre-helper:theme:v1",
    "scre-helper:density:v1",
    "scre-helper:font-size:v1",
    "scre-helper:filter-presets:v1",
    "scre-helper:tier-weights:v1",
    "scre-helper:tier-overrides:v1",
    "scre-helper:quiz:v1",
    "scre_custom_tiers"
  ];

  // Helper to validate and serialize backup item values (B2 堅牢化 & BUG-02 / BUG-18)
  function validateBackupValue(key, val) {
    if (val === null || val === undefined) return { valid: false };
    if (!ALLOWED_BACKUP_KEYS.includes(key)) return { valid: false };

    let strVal = val;
    if (typeof val === "object") {
      try {
        strVal = JSON.stringify(val);
      } catch (e) {
        return { valid: false };
      }
    } else {
      strVal = String(val);
    }
    const trimmed = strVal.trim();

    if (key === "scre-helper:activePresetIdx") {
      const n = parseInt(trimmed, 10);
      if (isNaN(n) || n < 0 || n > 4) return { valid: false };
      return { valid: true, serialized: String(n) };
    }

    if (key === "scre-helper:terrain:v1") {
      if (!ALLOWED_TERRAINS.includes(trimmed)) return { valid: false };
      return { valid: true, serialized: trimmed };
    }

    if (key === "scre-helper:density:v1") {
      if (!["compact", "normal", "comfortable"].includes(trimmed)) return { valid: false };
      return { valid: true, serialized: trimmed };
    }

    if (key === "scre-helper:font-size:v1") {
      if (!["small", "normal", "large"].includes(trimmed)) return { valid: false };
      return { valid: true, serialized: trimmed };
    }

    if (key === "scre-helper:presets:v2") {
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed) || parsed.length === 0) return { valid: false };
        return { valid: true, serialized: JSON.stringify(normalizePresets(parsed)) };
      } catch (e) {
        return { valid: false };
      }
    }

    const jsonKeys = [
      "scre-helper:ownership:v1",
      "scre-helper:stage-progress:v1",
      "scre-helper:theme:v1",
      "scre-helper:filter-presets:v1",
      "scre-helper:tier-weights:v1",
      "scre-helper:tier-overrides:v1",
      "scre_custom_tiers"
    ];

    if (jsonKeys.includes(key)) {
      try {
        const parsedJson = JSON.parse(trimmed);
        if (typeof parsedJson !== "object" || parsedJson === null) {
          return { valid: false };
        }
        return { valid: true, serialized: trimmed };
      } catch (e) {
        return { valid: false };
      }
    }

    if (key === "scre-helper:quiz:v1") {
      const n = parseInt(trimmed, 10);
      if (isNaN(n) || n < 0) return { valid: false };
      return { valid: true, serialized: String(n) };
    }

    return { valid: false };
  }
  window.validateBackupValue = validateBackupValue;

  const fullBackupTrigger = document.getElementById("btnFullBackupImportTrigger");
  const fullBackupFileInput = document.getElementById("fullBackupFileInput");
  if (fullBackupTrigger && fullBackupFileInput) {
    fullBackupTrigger.addEventListener("click", () => {
      fullBackupFileInput.value = "";
      fullBackupFileInput.click();
    });
    fullBackupFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (!parsed || typeof parsed !== "object" || !parsed.data) {
            alert("バックアップファイルの形式が無効です（dataプロパティが見つかりません）。");
            return;
          }
          const dataKeys = Object.keys(parsed.data);
          const validItems = [];
          const excludedKeys = [];

          dataKeys.forEach(k => {
            const rawVal = parsed.data[k];
            const check = validateBackupValue(k, rawVal);
            if (check.valid) {
              validItems.push({ key: k, value: check.serialized });
            } else {
              excludedKeys.push(k);
            }
          });

          if (validItems.length === 0) {
            let msg = "有効な復元データが存在しませんでした（すべての項目が不正または破損しています）。";
            if (excludedKeys.length > 0) {
              msg += `\n\n【除外された項目 (${excludedKeys.length}件)】:\n` + excludedKeys.join("\n");
            }
            alert(msg);
            return;
          }

          let confirmMsg = `【一括バックアップ復元の確認】\n対象データ項目数: ${validItems.length}件`;
          if (excludedKeys.length > 0) {
            confirmMsg += ` (除外: ${excludedKeys.length}件)`;
          }
          confirmMsg += `\n作成日時: ${parsed.exportedAt || '不明'}\n\n現在のすべての編成・所持情報・設定がこのバックアップで上書きされます。\nよろしいですか？`;
          if (!window.confirm(confirmMsg)) {
            return;
          }

          // Full overwrite: clear existing allowed keys before storing restored items
          ALLOWED_BACKUP_KEYS.forEach(k => {
            try { localStorage.removeItem(k); } catch (e) {}
          });

          validItems.forEach(item => {
            localStorage.setItem(item.key, item.value);
          });

          let alertMsg = `一括バックアップの復元が完了しました（${validItems.length}項目）。`;
          if (excludedKeys.length > 0) {
            alertMsg += `\n\n【除外された不正な項目 (${excludedKeys.length}件)】:\n` + excludedKeys.join("\n");
          }
          alertMsg += "\n\nページを再読み込みします。";
          alert(alertMsg);
          if (typeof window.__mockReload === "function") {
            window.__mockReload();
          } else {
            window.location.reload();
          }
        } catch (err) {
          alert("JSONファイルの解析に失敗しました: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // ==========================================
  // C1, C3, C5: テーマ・アクセント・表示密度・文字サイズ管理
  // ==========================================
  const THEME_STORAGE_KEY = "scre-helper:theme:v1";
  const DENSITY_STORAGE_KEY = "scre-helper:density:v1";
  const FONT_SIZE_STORAGE_KEY = "scre-helper:font-size:v1";

  // C1: テーマ・アクセントカラー切替
  function loadThemeSettings() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) {
        if (saved.startsWith("{")) {
          return JSON.parse(saved);
        }
        return { mode: saved, accent: "default" };
      }
    } catch (e) {}
    return { mode: "dark", accent: "default" };
  }

  function applyThemeSettings(mode, accent) {
    const validMode = (mode === "light") ? "light" : "dark";
    const validAccent = ["plain", "mountain", "water", "hell"].includes(accent) ? accent : "default";

    document.body.setAttribute("data-theme", validMode);
    if (validAccent !== "default") {
      document.body.setAttribute("data-accent", validAccent);
    } else {
      document.body.removeAttribute("data-accent");
    }

    const modeSel = document.getElementById("settingThemeMode");
    if (modeSel && modeSel.value !== validMode) modeSel.value = validMode;
    const accentSel = document.getElementById("settingThemeAccent");
    if (accentSel && accentSel.value !== validAccent) accentSel.value = validAccent;
  }

  function saveThemeSettings(mode, accent) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ mode, accent }));
    } catch (e) {}
    applyThemeSettings(mode, accent);
  }

  // C3: 表示密度切替 (コンパクト / 標準 / ゆったり)
  function loadDensitySetting() {
    try {
      const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
      if (saved && ["compact", "normal", "comfortable"].includes(saved)) {
        return saved;
      }
    } catch (e) {}
    return "normal";
  }

  function applyDensitySetting(density) {
    const valid = ["compact", "normal", "comfortable"].includes(density) ? density : "normal";
    const container = document.querySelector(".app-container");
    if (container) {
      container.classList.remove("density-compact", "density-normal", "density-comfortable");
      container.classList.add(`density-${valid}`);
    }

    // Sync select in settings tab
    const sel = document.getElementById("settingDensitySelect");
    if (sel && sel.value !== valid) sel.value = valid;

    // Sync button groups in list and tier tabs
    document.querySelectorAll(".density-button-group .btn-density").forEach(btn => {
      if (btn.getAttribute("data-density") === valid) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  function saveDensitySetting(density) {
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, density);
    } catch (e) {}
    applyDensitySetting(density);
  }

  // C5: 文字サイズ切替 (小 / 標準 / 大)
  function loadFontSizeSetting() {
    try {
      const saved = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
      if (saved && ["small", "normal", "large"].includes(saved)) {
        return saved;
      }
    } catch (e) {}
    return "normal";
  }

  function applyFontSizeSetting(size) {
    const valid = ["small", "normal", "large"].includes(size) ? size : "normal";
    document.documentElement.setAttribute("data-font-size", valid);

    const sel = document.getElementById("settingFontSizeSelect");
    if (sel && sel.value !== valid) sel.value = valid;
  }

  function saveFontSizeSetting(size) {
    try {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, size);
    } catch (e) {}
    applyFontSizeSetting(size);
  }

  // Event Listeners for C1, C3, C5
  document.getElementById("settingThemeMode")?.addEventListener("change", (e) => {
    const current = loadThemeSettings();
    saveThemeSettings(e.target.value, current.accent);
  });

  document.getElementById("settingThemeAccent")?.addEventListener("change", (e) => {
    const current = loadThemeSettings();
    saveThemeSettings(current.mode, e.target.value);
  });

  document.getElementById("settingDensitySelect")?.addEventListener("change", (e) => {
    saveDensitySetting(e.target.value);
  });

  document.querySelectorAll(".density-button-group .btn-density").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = btn.getAttribute("data-density");
      if (d) saveDensitySetting(d);
    });
  });

  document.getElementById("settingFontSizeSelect")?.addEventListener("change", (e) => {
    saveFontSizeSetting(e.target.value);
  });

  // Expose helpers globally for testing and external hooks
  window.applyThemeSettings = applyThemeSettings;
  window.saveThemeSettings = saveThemeSettings;
  window.applyDensitySetting = applyDensitySetting;
  window.saveDensitySetting = saveDensitySetting;
  window.applyFontSizeSetting = applyFontSizeSetting;
  window.saveFontSizeSetting = saveFontSizeSetting;

  // ==========================================
  // B4: 城娘2体比較ビュー
  // ==========================================
  let compareCastles = [];

  function getCastleTierScore(c) {
    if (!c) return 0;
    if (!cachedComputedScores && typeof computeCastleScores === "function") {
      cachedComputedScores = computeCastleScores(roleTierWeights);
    }
    if (cachedComputedScores) {
      const found = cachedComputedScores.find(s => s.id === c.id || s.name === c.name);
      if (found) return found.overallScore !== undefined ? found.overallScore : found.total;
    }
    return 0;
  }

  function toggleCompareCastle(castleId) {
    const c = getCastleById(castleId);
    if (!c) return;

    const existingIdx = compareCastles.findIndex(x => x.id === c.id);
    if (existingIdx !== -1) {
      compareCastles.splice(existingIdx, 1);
      showNotification(`「${c.name}」を比較から外しました`);
    } else {
      if (compareCastles.length >= 2) {
        compareCastles.shift();
      }
      compareCastles.push(c);
      showNotification(`「${c.name}」を比較に追加しました (${compareCastles.length}/2)`);
    }
    updateCompareTrayUI();
    updateDetailCompareButton();
  }

  function updateCompareTrayUI() {
    const tray = document.getElementById("compareFloatingTray");
    const slotsEl = document.getElementById("compareTraySlots");
    const countEl = document.getElementById("compareTrayCount");
    if (!tray || !slotsEl) return;

    if (countEl) countEl.textContent = String(compareCastles.length);

    if (compareCastles.length === 0) {
      tray.style.display = "none";
      slotsEl.innerHTML = "";
      return;
    }

    tray.style.display = "block";
    slotsEl.innerHTML = compareCastles.map(c => `
      <div class="compare-tray-chip">
        ${getIconHtml(c, 24)}
        <strong>${escapeHtml(c.name)}</strong>
        <span class="compare-tray-remove" data-remove-compare="${escapeHtml(c.id)}" title="解除">&times;</span>
      </div>
    `).join("");
  }

  function updateDetailCompareButton() {
    const btn = document.getElementById("btnDetailToggleCompare");
    if (!btn || !activeDetailCastleId) return;
    const inCompare = compareCastles.some(c => c.id === activeDetailCastleId);
    btn.textContent = inCompare ? "✓ 比較中" : "⚖️ 比較";
    btn.style.background = inCompare ? "#2980b9" : "";
    btn.style.color = inCompare ? "#fff" : "";
  }

  function openCompareModal() {
    if (compareCastles.length < 2) {
      alert("城娘を2体選択すると詳細な比較表を表示できます。\n一覧または詳細画面の「⚖️ 比較」ボタンから2体選んでください。");
      return;
    }
    const c1 = compareCastles[0];
    const c2 = compareCastles[1];
    const modal = document.getElementById("modalCompareCastles");
    const body = document.getElementById("modalCompareBody");
    if (!modal || !body) return;

    const s1 = c1.statsDetail?.giant5 || {};
    const s2 = c2.statsDetail?.giant5 || {};
    const cost1 = c1.cost || c1.statsDetail?.initial?.cost || 0;
    const cost2 = c2.cost || c2.statsDetail?.initial?.cost || 0;
    const score1 = getCastleTierScore(c1);
    const score2 = getCastleTierScore(c2);

    function compareNum(v1, v2, lowerIsBetter = false) {
      const n1 = parseFloat(v1) || 0;
      const n2 = parseFloat(v2) || 0;
      if (n1 === n2) return ["", ""];
      if (lowerIsBetter) {
        return n1 < n2 ? ["compare-stat-better", ""] : ["", "compare-stat-better"];
      }
      return n1 > n2 ? ["compare-stat-better", ""] : ["", "compare-stat-better"];
    }

    const [clsCost1, clsCost2] = compareNum(cost1, cost2, true);
    const [clsHp1, clsHp2] = compareNum(s1.hp, s2.hp);
    const [clsAtk1, clsAtk2] = compareNum(s1.atk, s2.atk);
    const [clsDef1, clsDef2] = compareNum(s1.def, s2.def);
    const [clsRange1, clsRange2] = compareNum(s1.range, s2.range);
    const [clsRec1, clsRec2] = compareNum(s1.recovery, s2.recovery);
    const [clsScore1, clsScore2] = compareNum(score1, score2);

    const sk1 = c1.allSkills ? c1.allSkills[c1.allSkills.length - 1] : c1.skill;
    const sk2 = c2.allSkills ? c2.allSkills[c2.allSkills.length - 1] : c2.skill;
    const st1 = c1.allStrategies ? c1.allStrategies[c1.allStrategies.length - 1] : c1.strategy;
    const st2 = c2.allStrategies ? c2.allStrategies[c2.allStrategies.length - 1] : c2.strategy;

    body.innerHTML = `
      <table class="compare-table">
        <thead>
          <tr>
            <th>比較項目</th>
            <th class="compare-castle-col">
              <div style="display:flex; align-items:center; gap:8px;">
                ${getIconHtml(c1, 40)}
                <div>
                  <div style="font-weight:bold; font-size:14px;">${escapeHtml(c1.name)}</div>
                  <div style="font-size:11px; color:var(--text-sub);">★${c1.rarity} [${c1.castleType}] ${c1.weapon} (${c1.rangeKind || '近'})</div>
                </div>
                <button class="btn btn-sm" data-open-detail="${escapeHtml(c1.id)}" style="margin-left:auto; font-size:11px; padding:2px 7px;">詳細 ↗</button>
              </div>
            </th>
            <th class="compare-castle-col">
              <div style="display:flex; align-items:center; gap:8px;">
                ${getIconHtml(c2, 40)}
                <div>
                  <div style="font-weight:bold; font-size:14px;">${escapeHtml(c2.name)}</div>
                  <div style="font-size:11px; color:var(--text-sub);">★${c2.rarity} [${c2.castleType}] ${c2.weapon} (${c2.rangeKind || '近'})</div>
                </div>
                <button class="btn btn-sm" data-open-detail="${escapeHtml(c2.id)}" style="margin-left:auto; font-size:11px; padding:2px 7px;">詳細 ↗</button>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>配置気コスト</th>
            <td class="${clsCost1}">${cost1}気 ${clsCost1 ? '★低コスト優位' : ''}</td>
            <td class="${clsCost2}">${cost2}気 ${clsCost2 ? '★低コスト優位' : ''}</td>
          </tr>
          <tr>
            <th>巨大化5回 攻撃</th>
            <td class="${clsAtk1}">${s1.atk || '-'} ${clsAtk1 ? '▲優位' : ''}</td>
            <td class="${clsAtk2}">${s2.atk || '-'} ${clsAtk2 ? '▲優位' : ''}</td>
          </tr>
          <tr>
            <th>巨大化5回 防御</th>
            <td class="${clsDef1}">${s1.def || '-'} ${clsDef1 ? '▲優位' : ''}</td>
            <td class="${clsDef2}">${s2.def || '-'} ${clsDef2 ? '▲優位' : ''}</td>
          </tr>
          <tr>
            <th>巨大化5回 耐久</th>
            <td class="${clsHp1}">${s1.hp || '-'} ${clsHp1 ? '▲優位' : ''}</td>
            <td class="${clsHp2}">${s2.hp || '-'} ${clsHp2 ? '▲優位' : ''}</td>
          </tr>
          <tr>
            <th>巨大化5回 射程</th>
            <td class="${clsRange1}">${s1.range || '-'} ${clsRange1 ? '▲優位' : ''}</td>
            <td class="${clsRange2}">${s2.range || '-'} ${clsRange2 ? '▲優位' : ''}</td>
          </tr>
          <tr>
            <th>巨大化5回 回復</th>
            <td class="${clsRec1}">${s1.recovery || '-'} ${clsRec1 ? '▲優位' : ''}</td>
            <td class="${clsRec2}">${s2.recovery || '-'} ${clsRec2 ? '▲優位' : ''}</td>
          </tr>
          <tr>
            <th>自動スコア (100pt)</th>
            <td class="${clsScore1}"><strong>${score1} pt</strong></td>
            <td class="${clsScore2}"><strong>${score2} pt</strong></td>
          </tr>
          <tr>
            <th>特技 (改築最新)</th>
            <td style="font-size:11.5px; line-height:1.4;">
              ${sk1 ? `<strong style="color:var(--primary-color);">${escapeHtml(sk1.name)}:</strong><br>${escapeHtml(sk1.text)}` : '特技なし'}
            </td>
            <td style="font-size:11.5px; line-height:1.4;">
              ${sk2 ? `<strong style="color:var(--primary-color);">${escapeHtml(sk2.name)}:</strong><br>${escapeHtml(sk2.text)}` : '特技なし'}
            </td>
          </tr>
          <tr>
            <th>計略 (改築最新)</th>
            <td style="font-size:11.5px; line-height:1.4;">
              ${st1 ? `<strong style="color:#2980b9;">${escapeHtml(st1.name)}:</strong><br>${escapeHtml(st1.text)}` : '計略なし'}
            </td>
            <td style="font-size:11.5px; line-height:1.4;">
              ${st2 ? `<strong style="color:#2980b9;">${escapeHtml(st2.name)}:</strong><br>${escapeHtml(st2.text)}` : '計略なし'}
            </td>
          </tr>
          <tr>
            <th>特殊能力</th>
            <td style="font-size:11.5px; line-height:1.4;">
              ${c1.special ? `<strong style="color:#8e44ad;">${escapeHtml(c1.special.name)}:</strong><br>${escapeHtml(c1.special.text)}` : '特殊能力なし'}
            </td>
            <td style="font-size:11.5px; line-height:1.4;">
              ${c2.special ? `<strong style="color:#8e44ad;">${escapeHtml(c2.special.name)}:</strong><br>${escapeHtml(c2.special.text)}` : '特殊能力なし'}
            </td>
          </tr>
          <tr>
            <th>絵師 / 声優</th>
            <td style="font-size:11px;">
              <div>絵師: ${escapeHtml(c1.illustrator || '未登録')}</div>
              <div>CV: ${escapeHtml(c1.voiceActor || '未登録')}</div>
            </td>
            <td style="font-size:11px;">
              <div>絵師: ${escapeHtml(c2.illustrator || '未登録')}</div>
              <div>CV: ${escapeHtml(c2.voiceActor || '未登録')}</div>
            </td>
          </tr>
        </tbody>
      </table>
    `;


    modal.classList.add("open");
  }

  // Wire Compare tray and modal events
  document.getElementById("btnOpenCompareModal")?.addEventListener("click", openCompareModal);
  document.getElementById("btnClearCompareTray")?.addEventListener("click", () => {
    compareCastles = [];
    updateCompareTrayUI();
    updateDetailCompareButton();
    renderAllCastles();
    showNotification("比較リストをクリアしました");
  });
  document.getElementById("modalCompareCloseBtn")?.addEventListener("click", () => {
    document.getElementById("modalCompareCastles")?.classList.remove("open");
  });
  document.getElementById("compareTraySlots")?.addEventListener("click", (e) => {
    const removeId = e.target.getAttribute("data-remove-compare");
    if (removeId) {
      toggleCompareCastle(removeId);
      renderAllCastles();
    }
  });
  document.getElementById("modalCompareBody")?.addEventListener("click", (e) => {
    const detailId = e.target.getAttribute("data-open-detail");
    if (detailId) {
      document.getElementById("modalCompareCastles")?.classList.remove("open");
      openCastleDetail(detailId);
    }
  });
  document.getElementById("btnDetailToggleCompare")?.addEventListener("click", () => {
    if (activeDetailCastleId) {
      toggleCompareCastle(activeDetailCastleId);
      renderAllCastles();
    }
  });

  // ==========================================
  // B5: 並び替え拡張とフィルタ保存
  // ==========================================
  const FILTER_PRESETS_STORAGE_KEY = "scre-helper:filter-presets:v1";

  function loadFilterPresets() {
    try {
      const saved = localStorage.getItem(FILTER_PRESETS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  function saveFilterPresets(presets) {
    try {
      localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(presets.slice(0, 10)));
    } catch (e) {
      console.warn("saveFilterPresets error:", e);
    }
  }

  function renderFilterPresetsUI() {
    const container = document.getElementById("filterPresetPills");
    if (!container) return;
    const presets = loadFilterPresets();
    container.innerHTML = presets.map((p, idx) => `
      <span class="filter-preset-chip" data-idx="${idx}" title="クリックしてこの条件を適用">
        <span class="filter-preset-name">${escapeHtml(p.name)}</span>
        <span class="filter-preset-del" data-del-idx="${idx}" title="削除">&times;</span>
      </span>
    `).join("");
  }
  window.renderFilterPresetsUI = renderFilterPresetsUI;

  document.getElementById("listSortKey")?.addEventListener("change", () => {
    listCurrentPage = 1;
    renderAllCastles();
  });

  document.getElementById("btnListSortOrder")?.addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const cur = btn.getAttribute("data-order") || "desc";
    const next = cur === "desc" ? "asc" : "desc";
    btn.setAttribute("data-order", next);
    btn.textContent = next === "asc" ? "▲ 昇順" : "▼ 降順";
    listCurrentPage = 1;
    renderAllCastles();
  });

  document.getElementById("btnSaveFilterPreset")?.addEventListener("click", () => {
    const name = prompt("保存する絞り込み条件の名前を入力してください (例: ★7平近接):");
    if (!name || !name.trim()) return;

    const preset = {
      name: name.trim(),
      search: document.getElementById("searchCastleInput")?.value || "",
      rarity: document.getElementById("filterRarity")?.value || "",
      type: document.getElementById("filterType")?.value || "",
      weapon: document.getElementById("filterWeapon")?.value || "",
      buff: document.getElementById("filterBuffCategory")?.value || "",
      ownership: document.getElementById("filterOwnership")?.value || "",
      sortKey: document.getElementById("listSortKey")?.value || "id",
      sortOrder: document.getElementById("btnListSortOrder")?.getAttribute("data-order") || "desc"
    };

    const presets = loadFilterPresets();
    presets.push(preset);
    saveFilterPresets(presets);
    renderFilterPresetsUI();
    showNotification(`絞り込み条件「${preset.name}」を保存しました！💾`);
  });

  document.getElementById("filterPresetPills")?.addEventListener("click", (e) => {
    const delIdx = e.target.getAttribute("data-del-idx");
    if (delIdx !== null) {
      e.stopPropagation();
      const presets = loadFilterPresets();
      const removed = presets.splice(parseInt(delIdx, 10), 1);
      saveFilterPresets(presets);
      renderFilterPresetsUI();
      if (removed.length > 0) showNotification(`条件「${removed[0].name}」を削除しました`);
      return;
    }
    const chip = e.target.closest(".filter-preset-chip");
    if (chip) {
      const idx = parseInt(chip.getAttribute("data-idx"), 10);
      const presets = loadFilterPresets();
      const p = presets[idx];
      if (p) {
        if (document.getElementById("searchCastleInput")) document.getElementById("searchCastleInput").value = p.search || "";
        if (document.getElementById("filterRarity")) document.getElementById("filterRarity").value = p.rarity || "";
        if (document.getElementById("filterType")) document.getElementById("filterType").value = p.type || "";
        if (document.getElementById("filterWeapon")) document.getElementById("filterWeapon").value = p.weapon || "";
        if (document.getElementById("filterBuffCategory")) document.getElementById("filterBuffCategory").value = p.buff || "";
        if (document.getElementById("filterOwnership")) document.getElementById("filterOwnership").value = p.ownership || "";
        if (document.getElementById("listSortKey")) document.getElementById("listSortKey").value = p.sortKey || "id";
        if (document.getElementById("btnListSortOrder")) {
          const ord = p.sortOrder || "desc";
          document.getElementById("btnListSortOrder").setAttribute("data-order", ord);
          document.getElementById("btnListSortOrder").textContent = ord === "asc" ? "▲ 昇順" : "▼ 降順";
        }
        listCurrentPage = 1;
        renderAllCastles();
        showNotification(`保存条件「${p.name}」を適用しました 🎯`);
      }
    }
  });

  // Undo button click
  document.getElementById("btnUndoParty")?.addEventListener("click", performUndo);

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

  function getCastleRemodelStages(c) {
    if (!c) return ["無印"];
    const stages = Array.isArray(c.remodelStages) && c.remodelStages.length > 0
      ? [...c.remodelStages]
      : ["無印"];
    const allAbilities = [...(c.allSkills || []), ...(c.allStrategies || []), ...(c.allSpecials || [])];
    const hasKai1 = allAbilities.some(s => s && s.stage === "改壱");
    const hasKai2 = allAbilities.some(s => s && s.stage === "改弐");
    if (hasKai1 && !stages.includes("改壱")) {
      stages.push("改壱");
    }
    if (hasKai2 && !stages.includes("改弐")) {
      if (!stages.includes("改壱")) stages.push("改壱");
      stages.push("改弐");
    }
    return stages;
  }

  function getCastleStageImages(castle, stage) {
    if (!castle) return { illustUrl: "", ojouUrl: "", taihaUrl: "", tokugiUrl: "" };
    const st = stage || currentDetailRemodelStage || "無印";
    const forms = castle.remodelForms || {};
    const stageData = forms[st] || {};
    const kai1Data = forms["改壱"] || {};
    const baseData = forms["無印"] || {};
    if (st === "改弐") {
      return {
        illustUrl: stageData.illustUrl || kai1Data.illustUrl || baseData.illustUrl || castle.illustUrl || "",
        ojouUrl: stageData.ojouUrl || kai1Data.ojouUrl || baseData.ojouUrl || castle.ojouUrl || "",
        taihaUrl: stageData.taihaUrl || kai1Data.taihaUrl || baseData.taihaUrl || castle.taihaUrl || "",
        tokugiUrl: stageData.tokugiUrl || kai1Data.tokugiUrl || baseData.tokugiUrl || castle.tokugiUrl || ""
      };
    }
    return {
      illustUrl: stageData.illustUrl || baseData.illustUrl || castle.illustUrl || "",
      ojouUrl: stageData.ojouUrl || baseData.ojouUrl || castle.ojouUrl || "",
      taihaUrl: stageData.taihaUrl || baseData.taihaUrl || castle.taihaUrl || "",
      tokugiUrl: stageData.tokugiUrl || baseData.tokugiUrl || castle.tokugiUrl || ""
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
    const noImgPlaceholder = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400' viewBox='0 0 300 400'><rect width='100%' height='100%' fill='%232d3748'/><text x='50%' y='50%' fill='%23a0aec0' font-size='16' font-family='sans-serif' text-anchor='middle' dominant-baseline='middle'>画像なし</text></svg>";

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
    const hasTokugi = Boolean(imgSet.tokugiUrl);

    // Disable / enable form tabs based on available images for this stage
    const btnOjou = document.getElementById("btnFormOjou");
    const btnTaiha = document.getElementById("btnFormTaiha");
    const btnTokugi = document.getElementById("btnFormTokugi");
    const btnSideBySide = document.getElementById("btnFormSideBySide");
    if (btnOjou) btnOjou.disabled = !hasOjou;
    if (btnTaiha) btnTaiha.disabled = !hasTaiha;
    if (btnTokugi) btnTokugi.disabled = !hasTokugi;
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
          sideImgOjou.onerror = function() { this.src = (this.src !== fallbackSrc && !this.src.startsWith("data:image/svg+xml")) ? fallbackSrc : noImgPlaceholder; };
          sideImgOjou.src = imgSet.ojouUrl || fallbackSrc;
        }
        if (sideImgBattle) {
          sideImgBattle.onerror = function() { this.src = (this.src !== fallbackSrc && !this.src.startsWith("data:image/svg+xml")) ? fallbackSrc : noImgPlaceholder; };
          sideImgBattle.src = imgSet.illustUrl || fallbackSrc;
        }
        if (sideImgTaiha) {
          sideImgTaiha.onerror = function() { this.src = (this.src !== fallbackSrc && !this.src.startsWith("data:image/svg+xml")) ? fallbackSrc : noImgPlaceholder; };
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
        imgEl.onerror = function() {
          if (this.src !== fallbackSrc && !this.src.startsWith("data:image/svg+xml")) {
            this.src = fallbackSrc;
          } else {
            this.src = noImgPlaceholder;
          }
        };
        const stageLabel = st ? ` [${st}]` : '';
        if (form === "ojou") {
          imgEl.src = imgSet.ojouUrl || fallbackSrc;
          if (captionEl) captionEl.innerHTML = `<span style="color:#e84393; font-weight:bold;">🌸 御嬢姿${stageLabel} (私服・日常)</span>`;
        } else if (form === "taiha") {
          imgEl.src = imgSet.taihaUrl || fallbackSrc;
          if (captionEl) captionEl.innerHTML = `<span style="color:#d63031; font-weight:bold;">💥 大破姿${stageLabel} (戦闘不能)</span>`;
        } else if (form === "tokugi") {
          imgEl.src = imgSet.tokugiUrl || fallbackSrc;
          if (captionEl) captionEl.innerHTML = `<span style="color:#d97706; font-weight:bold;">⚡ 特技姿${stageLabel} (カットイン)</span>`;
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
    } else if (zoomForm === "tokugi") {
      src = imgSet.tokugiUrl || fallbackSrc;
      badgeText = `⚡ 特技姿${stageLabel} (カットイン)`;
      badgeColor = "#d97706";
    } else if (zoomForm === "photo") {
      src = (zoomCastle.realCastle && zoomCastle.realCastle.photoUrl) || fallbackSrc;
      badgeText = `🏯 実在の城: ${zoomCastle.realCastle ? zoomCastle.realCastle.name : zoomCastle.name}`;
      badgeColor = "#2980b9";
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
      if (f === "tokugi") btn.disabled = !imgSet.tokugiUrl;
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

    const stages = getCastleRemodelStages(c);
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
    if (zoomForm === "tokugi" && !imgSet.tokugiUrl) zoomForm = "battle";

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
      } else if (party && party.some(p => p && p.id === c.id)) {
        activeDetailList = party.filter(Boolean).map(p => getCastleById(p.id)).filter(Boolean);
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
      <!-- C2: Official color token badges -->
      <span class="badge badge-rarity badge-rarity-${c.rarity}">★${c.rarity}</span>
      ${getAttrBadgeHtml(c)}
      <span class="badge badge-weapon" style="background:#555;color:#fff;">${c.weapon}</span>
      <span class="badge badge-range badge-range-${c.rangeKind === '遠近' ? 'both' : (c.rangeKind === '遠' ? 'far' : 'near')}">${c.rangeKind || '近'}</span>
      ${c.country ? `<span class="badge" style="background:#706b64;color:#fff;">${c.country}</span>` : ''}
    `;

    // Action button state (+ 編成に追加 / ✓ 編成中)
    updateDetailPartyButton();
    updateModalDetailOwnershipUI(c);

    // Wiki external link
    const wikiBtn = document.getElementById("btnDetailWikiLink");
    wikiBtn.href = `https://scre.swiki.jp/index.php?${encodeURIComponent(c.name)}`;

    // Remodel Stage Switcher (無印 / 改壱 / 改弐)
    const stages = getCastleRemodelStages(c);
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

    // Left Column: Fullbody Illustration & Form Switcher (城娘 / 御嬢 / 大破 / 特技)
    const btnBattle = document.getElementById("btnFormBattle");
    const btnOjou = document.getElementById("btnFormOjou");
    const btnTaiha = document.getElementById("btnFormTaiha");
    const btnTokugi = document.getElementById("btnFormTokugi");
    const btnSideBySide = document.getElementById("btnFormSideBySide");

    if (btnOjou) btnOjou.disabled = !imgSet.ojouUrl;
    if (btnTaiha) btnTaiha.disabled = !imgSet.taihaUrl;
    if (btnTokugi) btnTokugi.disabled = !imgSet.tokugiUrl;
    if (btnSideBySide) btnSideBySide.disabled = !imgSet.ojouUrl && !imgSet.taihaUrl;

    // Reset to battle form if current mode is unavailable
    if ((currentDetailForm === "ojou" && !imgSet.ojouUrl) ||
        (currentDetailForm === "taiha" && !imgSet.taihaUrl) ||
        (currentDetailForm === "tokugi" && !imgSet.tokugiUrl) ||
        (currentDetailForm === "side_by_side" && !imgSet.ojouUrl && !imgSet.taihaUrl)) {
      currentDetailForm = "battle";
    }

    setDetailPortraitForm(currentDetailForm, c, currentDetailRemodelStage);

    // Meta Info (イラストレーター / 声優 / 令制国)
    const metaEl = document.getElementById("detailMetaInfo");
    let metaHtml = "";
    if (c.illustrator) metaHtml += `<div><strong>絵師:</strong> ${c.illustrator}</div>`;
    if (c.voiceActor) metaHtml += `<div><strong>声優(CV):</strong> ${escapeHtml(cleanVoiceActorName(c.voiceActor))}</div>`;
    if (c.country) metaHtml += `<div><strong>令制国/地域:</strong> ${c.country}</div>`;
    metaEl.innerHTML = metaHtml || '<div style="color:var(--text-muted);">追加情報なし</div>';

    // Lore (図鑑文章 / 自己紹介)
    const loreEl = document.getElementById("detailLoreText");
    loreEl.textContent = c.lore || "図鑑文章はありません。";

    // Real Castle (実在の城 モチーフ)
    const realBox = document.getElementById("detailRealCastleBox");
    const realContent = document.getElementById("detailRealCastleContent");
    if (realBox && realContent) {
      if (c.realCastle && c.realCastle.photoUrl) {
        realBox.style.display = "block";
        const rc = c.realCastle;
        const authorStr = escapeHtml(rc.author || "Wikimedia Commons");
        const licenseStr = escapeHtml(rc.license || "CC BY-SA");
        const articleUrl = rc.articleUrl || `https://ja.wikipedia.org/wiki/${encodeURIComponent(rc.name || c.name)}`;
        realContent.innerHTML = `
          <div class="real-castle-card">
            <div class="real-castle-photo-wrap">
              <a href="${escapeHtml(rc.photoUrl)}" data-action="zoom-real-castle" title="クリックで写真の拡大ビューアを開く">
                <img src="${escapeHtml(rc.photoUrl)}" alt="${escapeHtml(rc.name)}" class="real-castle-photo" loading="lazy" onerror="const box = document.getElementById('detailRealCastleBox'); if(box) box.style.display='none';" />
              </a>
            </div>
            <div class="real-castle-info">
              <div class="real-castle-title-row">
                <strong class="real-castle-title">${escapeHtml(rc.name)}</strong>
                <a href="${escapeHtml(articleUrl)}" target="_blank" rel="noopener noreferrer" class="real-castle-wiki-link">Wikipedia ↗</a>
              </div>
              <div class="real-castle-meta">
                <div class="real-castle-credit" title="作者">📸 ${authorStr}</div>
                <div class="real-castle-license" title="ライセンス">⚖️ ${licenseStr}</div>
              </div>
            </div>
          </div>
        `;
      } else {
        realBox.style.display = "none";
        realContent.innerHTML = "";
      }
    }

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

    if (typeof renderCastleSynergy === "function") renderCastleSynergy(c);
    if (typeof renderCastleRecommendedWeapons === "function") renderCastleRecommendedWeapons(c);
    if (typeof renderDetailEffectTags === "function") renderDetailEffectTags(c);
    if (typeof renderCastleWeaknessSynergyUI === "function") renderCastleWeaknessSynergyUI(c);
    if (typeof renderDetailDpsPrecisionUI === "function") renderDetailDpsPrecisionUI(c);
    modal.classList.add("open");
  }

  function formatStatVal(val) {
    if (!val) return "-";
    return val.replace(/\//g, " / ");
  }

  function updateDetailPartyButton() {
    const btn = document.getElementById("btnDetailToggleParty");
    if (!btn || !activeDetailCastleId) return;
    const inParty = party.some(p => p && p.id === activeDetailCastleId);
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
    pushUndoSnapshot();
    const idx = party.findIndex(p => p && p.id === activeDetailCastleId);
    if (idx !== -1) {
      party.splice(idx, 1);
    } else {
      if (party.filter(Boolean).length >= 8) {
        alert("編成枠がいっぱいです(最大8体)。");
        return;
      }
      const c = getCastleById(activeDetailCastleId);
      const newMember = { id: activeDetailCastleId, strategyOn: true, specialOn: !!(c && c.special), giantStep: 5 };
      const emptyIdx = party.findIndex(p => !p);
      if (emptyIdx !== -1) {
        party[emptyIdx] = newMember;
      } else {
        party.push(newMember);
      }
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
  const detailRealCastleBox = document.getElementById("detailRealCastleBox");
  if (detailRealCastleBox) {
    detailRealCastleBox.addEventListener("click", e => {
      const a = e.target.closest('[data-action="zoom-real-castle"]');
      if (a) {
        e.preventDefault();
        openImageZoom(null, "photo");
      }
    });
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

  // Keyboard navigation (Esc to close, ArrowLeft / ArrowRight to navigate, Ctrl+Z to Undo)
  window.addEventListener("keydown", e => {
    // Ctrl+Z / Cmd+Z for Party Undo
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable)) {
        return;
      }
      e.preventDefault();
      performUndo();
      return;
    }

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
      const compareCastlesModal = document.getElementById("modalCompareCastles");
      if (compareCastlesModal) compareCastlesModal.classList.remove("open");
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

  function findStage(stageTitleOrId) {
    if (!window.SCRE_GUIDES || !stageTitleOrId) return null;
    for (const g of window.SCRE_GUIDES) {
      const st = g.stages.find(s => s.id === stageTitleOrId || s.title === stageTitleOrId);
      if (st) return st;
    }
    return null;
  }

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
        if (!slot) return;
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

      const hellCastles = party.filter(Boolean).map(s => getCastleById(s.id)).filter(c => c && c.attributes && c.attributes.includes("地獄"));
      const hellCount = hellCastles.length;

      hadesAnalysisHtml = `
        <div style="background:#241635; color:#f0e0ff; border:1px solid #7d4999; border-radius:6px; padding:10px 12px; margin-top:8px; font-size:var(--fs-body, 13px); line-height:1.55;">
          <div style="font-weight:bold; color:#ff9ff3; margin-bottom:4px; font-size:var(--fs-emphasis, 14px);">🔥 ハデス死闘場 攻略診断 (超難):</div>
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
      partyEl.innerHTML = `<div style="font-size:var(--fs-body, 13px); color:var(--text-muted); padding:8px;">部隊に城娘が編成されていません。</div>`;
    } else {
      const stTerrain = foundStage.terrain;
      const combinedRules = rulesList.join(" ");

      // Pre-calculate attribute counts in party for placement limits
      const attrCounts = { "平": 0, "水": 0, "山": 0, "平山": 0, "地獄": 0, "無": 0 };
      party.forEach(slot => {
        if (!slot) return;
        const c = getCastleById(slot.id);
        if (!c) return;
        (c.attributes || []).forEach(a => {
          if (attrCounts[a] !== undefined) attrCounts[a]++;
        });
      });

      party.forEach((slot, idx) => {
        if (!slot) return;
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
              <span style="font-size:var(--fs-sub, 12px); color:var(--text-sub); margin-left:6px;">★${c.rarity} [${c.subType || c.castleType}]・${c.weapon}</span>
            </div>
            ${statusBadge}
          </div>
          <div style="font-size:var(--fs-body, 13px); color:#555; margin-top:3px; line-height:1.45;">${comment}</div>
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
          <div style="margin-top:6px; font-size:var(--fs-sub, 12px); color:#444; background:#fbf9f6; padding:8px 10px; border-radius:4px; border:1px solid #ebdccb; line-height:1.45;">
            <strong>保存済みクリア編成 (${memberCastles.length}体):</strong> ${memberCastles.map(c => c.name).join("、")}
            ${stageRecord.savedAt ? `<span style="font-size:var(--fs-sub, 12px); color:#888; margin-left:6px;">(${savedAtStr}保存)</span>` : ''}
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
            <button class="btn btn-sm btn-primary" id="btnSaveStageParty" style="font-size:var(--fs-sub, 12px); padding:4px 8px;">現在の編成を保存 💾</button>
            ${savedParty.length > 0 ? `<button class="btn btn-sm" id="btnRestoreStageParty" style="font-size:var(--fs-sub, 12px); background:#eef5ee; border-color:#95c99e; color:#1e6b2c; font-weight:bold; padding:4px 8px;">クリア編成を復元 ↺</button>` : ''}
          </div>
        </div>
        ${savedPartyHtml}
        <div id="diagLossCausesContainer"></div>
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

      if (typeof renderLossCauseSection === "function") {
        renderLossCauseSection(foundStage.title);
      }
    }

    // 第32弾: 実戦プレイ動画解析に基づく新戦術シミュレーション群
    if (typeof renderTransformationBadges === "function") renderTransformationBadges(foundStage);
    if (typeof renderDeliberationMatrix === "function") renderDeliberationMatrix(foundStage);
    if (typeof renderBossSnipeAndCountdown === "function") renderBossSnipeAndCountdown(foundStage);
    if (typeof renderTtkRace === "function") renderTtkRace(foundStage);
    if (typeof renderDebuffStackChecker === "function") renderDebuffStackChecker(foundStage);
    if (typeof renderWaveCheatCards === "function") renderWaveCheatCards(foundStage);
    if (typeof renderTileCongestionSection === "function") renderTileCongestionSection(foundStage);
    if (typeof renderCounterConciergeForStage === "function") renderCounterConciergeForStage(foundStage);

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
  // Auto-Suggest Party for Stage (Feature 2 & Prompt 6)
  // ==========================================
  const stageSuggestedPartyCache = new Map();
  let cachedScoreMap = null;
  let currentAutoSuggestedParty = [];

  function clearStageSuggestedPartyCache() {
    stageSuggestedPartyCache.clear();
  }

  function getCastleBaseScore(c) {
    if (!cachedComputedScores && typeof computeCastleScores === "function") {
      computeCastleScores(roleTierWeights);
    }
    if (!cachedScoreMap && cachedComputedScores) {
      cachedScoreMap = new Map();
      cachedComputedScores.forEach(item => {
        const score = (item.overallScore !== undefined) ? item.overallScore : item.total;
        cachedScoreMap.set(String(item.id), score);
        if (item.name) cachedScoreMap.set(item.name, score);
      });
    }
    const val = cachedScoreMap ? cachedScoreMap.get(String(c.id)) : undefined;
    if (typeof val === "number") return val;
    return (c.rarity || 1) * 10;
  }

  function generateAutoSuggestedParty(stage, ownedOnly) {
    if (!stage) return [];
    const cacheKey = (stage.id || stage.title) + "_" + (ownedOnly ? "owned" : "all");
    if (stageSuggestedPartyCache.has(cacheKey)) {
      return stageSuggestedPartyCache.get(cacheKey);
    }

    const stTerrain = stage.terrain || "";
    const rulesList = (stage.rules || []).concat((stage.deliberations || []).map(d => `[${d.point}審] ${d.name}: ${d.effect}`));
    const combinedRules = rulesList.join(" ");
    const combinedBoss = (stage.bossInfo || []).join(" ");
    const allText = combinedRules + " " + combinedBoss;

    const isHades = Boolean(stage.hadesMeta || stage.subCategory === "ハデスの死闘場");
    const isHell = (stage.category === "地獄" || isHades);

    let pool = window.SCRE_DATA ? window.SCRE_DATA.slice() : [];
    if (ownedOnly && ownership.owned && ownership.owned.size >= 8) {
      const ownedPool = pool.filter(c => ownership.owned.has(c.id));
      if (ownedPool.length >= 8) {
        pool = ownedPool;
      }
    }

    // Fatal deliberation filter
    const hasMeleePenalty = /近接.*(?:与ダメージ99%低下|99%低下)/.test(combinedRules) || combinedRules.includes("近接限定城娘の与ダメージ99%低下");
    const hasRangedPenalty = /遠隔.*(?:与ダメージ99%低下|99%低下)/.test(combinedRules) || combinedRules.includes("遠隔限定城娘の与ダメージ99%低下");

    pool = pool.filter(c => {
      const isMeleeOnly = (c.rangeKind === "近" || c.rangeKind === "近接");
      const isRangedOnly = (c.rangeKind === "遠" || c.rangeKind === "遠隔");
      if (hasMeleePenalty && isMeleeOnly) return false;
      if (hasRangedPenalty && isRangedOnly) return false;
      return true;
    });

    // Mass restrictions
    const hasMeleeMassPenalty = /近接配置マス制限|近接マス.*(?:消失|使用不可)|赤マス.*(?:消失|使用不可)/.test(combinedRules);
    const hasRangedMassPenalty = /遠隔配置マス制限|遠隔マス.*(?:消失|使用不可)|青マス.*(?:消失|使用不可)/.test(combinedRules);

    // Gimmick conditions
    const hasKiRestriction = combinedRules.includes("気獲得制限") || /気の自然回復量が.*低下|敵撃破時の獲得気が0|気の自然増加.*停止/.test(combinedRules);
    const needsMagic = /術攻撃以外|術属性以外|術ダメージ以外/.test(allText);
    const needsPhysical = /物理攻撃以外|物理属性以外|物理ダメージ以外/.test(allText);
    const hasFlying = /飛行|飛翔|空を飛ぶ|空中|(?:大鷹|怪鳥|鳥形|羽虫|蝙蝠)形?兜/.test(allText);
    const hasAbnormal = isHades || /暗闇|状態異常|猛毒|毒|火傷|氷結|混乱|麻痺/.test(allText);
    const hasBossRamp = /時間経過|徐々に攻撃|徐々に.*強化|ゲージが無くなる|大幅に強化/.test(allText);

    function scoreCastle(c) {
      let score = getCastleBaseScore(c);
      const full = getCastleFullText(c);

      // Terrain bonus
      const isMatch = Boolean(stTerrain && stTerrain !== "無" && c.attributes && c.attributes.includes(stTerrain));
      const isHellAttr = Boolean(c.attributes && c.attributes.includes("地獄"));

      if (isMatch) {
        if (stTerrain === "地獄" || isHades) {
          score += 150; // Hades/Hell terrain bonus 1.3x
        } else {
          score += 100;
        }
      } else if (isHell && isHellAttr) {
        score += isHades ? 140 : 100;
      }

      // Ki ability
      const hasKi = /気が|気増加|巨大化に必要な気|消費気/.test(full) || c.weapon === "陣貝";
      if (hasKi) {
        score += hasKiRestriction ? 80 : 45;
      }

      // Status counter
      if (hasAbnormal) {
        if (full.includes("暗闇") || full.includes("状態異常") || (full.includes("無効") && full.includes("状態")) || (full.includes("回復") && full.includes("状態"))) {
          score += 85;
        }
      }

      // Magic damage
      if (needsMagic) {
        if (["法術", "杖", "祓串", "鈴", "本"].includes(c.weapon) || /術ダメージ|防御無視/.test(full)) {
          score += 90;
        }
      }

      // Physical damage
      if (needsPhysical) {
        if (!["法術", "杖", "祓串", "鈴"].includes(c.weapon) || full.includes("物理")) {
          score += 60;
        }
      }

      // Anti-Air
      if (hasFlying) {
        if (["弓", "鉄砲", "石弓", "投剣"].includes(c.weapon) || /飛行|対空/.test(full)) {
          score += 60;
        }
      }

      // Boss ramp
      if (hasBossRamp) {
        if (score >= 60) score += 30;
        if (/与ダメージ|攻撃後の隙|攻撃速度/.test(full)) score += 25;
      }

      // Mass restrictions
      if (hasMeleeMassPenalty) {
        if (c.rangeKind === "近" || c.rangeKind === "近接") score -= 30;
        if (c.rangeKind === "遠近") score += 30;
      }
      if (hasRangedMassPenalty) {
        if (c.rangeKind === "遠" || c.rangeKind === "遠隔") score -= 30;
        if (c.rangeKind === "遠近") score += 30;
      }

      score += (c.rarity || 1) * 2;
      return score;
    }

    pool.sort((a, b) => scoreCastle(b) - scoreCastle(a));

    const selected = [];
    const selectedIds = new Set();

    function tryAdd(filterFn, roleLabel, reasonFn) {
      const match = pool.find(c => !selectedIds.has(c.id) && filterFn(c, getCastleFullText(c)));
      if (match) {
        const full = getCastleFullText(match);
        const reason = typeof reasonFn === "function" ? reasonFn(match, full) : reasonFn;
        selected.push({
          castle: match,
          role: roleLabel,
          reason: reason,
          isMatch: Boolean(stTerrain && stTerrain !== "無" && match.attributes && match.attributes.includes(stTerrain)),
          isOwned: Boolean(ownership.owned && ownership.owned.has(match.id))
        });
        selectedIds.add(match.id);
        return true;
      }
      return false;
    }

    // 1. Mandatory Ki Specialist
    tryAdd((c, full) => {
      return /気が|気増加|巨大化に必要な気|消費気/.test(full) || c.weapon === "陣貝";
    }, "気役", (c, full) => {
      if (c.weapon === "陣貝") return "陣貝・気軽減・全域支援";
      if (full.includes("撃破")) return "撃破気増加・巨大化支援";
      return "気生成・消費気軽減";
    });

    // 2. Status counter if abnormal/Hades
    if (hasAbnormal) {
      tryAdd((c, full) => {
        return full.includes("暗闇") || full.includes("状態異常") || (full.includes("無効") && full.includes("状態")) || (full.includes("回復") && full.includes("状態"));
      }, "状態異常対策", (c, full) => {
        if (full.includes("暗闇")) return "暗闇無効・状態異常解除";
        return "状態異常無効化・回復";
      });
    }

    // 3. Magic DPS if needsMagic
    if (needsMagic) {
      tryAdd((c, full) => {
        return ["法術", "杖", "祓串", "鈴", "本"].includes(c.weapon) || /術ダメージ|防御無視/.test(full);
      }, "術火力", (c, full) => "術ダメージ特効・防御無視");
    }

    // 4. Anti-Air if hasFlying
    if (hasFlying) {
      tryAdd((c, full) => {
        return ["弓", "鉄砲", "石弓", "投剣"].includes(c.weapon) || /飛行|対空/.test(full);
      }, "対空・遠隔", (c, full) => "飛行兜特効・長射程");
    }

    // 5. Melee DPS (at least 1, unless melee penalty)
    if (!hasMeleePenalty) {
      const hasMelee = selected.some(x => x.castle.rangeKind === "近" || x.castle.rangeKind === "近接" || x.castle.rangeKind === "遠近");
      if (!hasMelee) {
        tryAdd(c => (c.rangeKind === "近" || c.rangeKind === "近接" || c.rangeKind === "遠近") && (c.rarity || 1) >= 6,
          "主力前衛",
          (c) => (stTerrain && c.attributes?.includes(stTerrain)) ? `${stTerrain}属性一致・前衛火力` : "高火力・前衛主力"
        );
      }
    }

    // 6. Ranged DPS (at least 1, unless ranged penalty)
    if (!hasRangedPenalty) {
      const hasRanged = selected.some(x => x.castle.rangeKind === "遠" || x.castle.rangeKind === "遠隔" || x.castle.rangeKind === "遠近");
      if (!hasRanged) {
        tryAdd(c => (c.rangeKind === "遠" || c.rangeKind === "遠隔" || c.rangeKind === "遠近") && (c.rarity || 1) >= 6,
          "主力遠隔",
          (c) => (stTerrain && c.attributes?.includes(stTerrain)) ? `${stTerrain}属性一致・遠隔火力` : "長射程・遠隔主力"
        );
      }
    }

    // 7. Support / Buffer (at least 1)
    const hasBuffer = selected.some(x => x.role === "支援・バフ" || x.role === "支援・回復" || x.role === "気役");
    if (!hasBuffer) {
      tryAdd((c, full) => c.weapon === "歌舞" || /与ダメージ|被ダメージ|射程|回復/.test(full),
        "支援・バフ",
        (c) => c.weapon === "歌舞" ? "歌舞・全体継続回復バフ" : "与ダメ被ダメ強化・支援"
      );
    }

    // 8. Fill remaining up to 8 from sorted pool
    for (const c of pool) {
      if (selected.length >= 8) break;
      if (selectedIds.has(c.id)) continue;

      // Check mass limits
      const meleeCount = selected.filter(x => x.castle.rangeKind === "近" || x.castle.rangeKind === "近接").length;
      const rangedCount = selected.filter(x => x.castle.rangeKind === "遠" || x.castle.rangeKind === "遠隔").length;

      if (hasMeleeMassPenalty && (c.rangeKind === "近" || c.rangeKind === "近接") && meleeCount >= 3) {
        continue;
      }
      if (hasRangedMassPenalty && (c.rangeKind === "遠" || c.rangeKind === "遠隔") && rangedCount >= 3) {
        continue;
      }

      const full = getCastleFullText(c);
      const isMatch = Boolean(stTerrain && stTerrain !== "無" && c.attributes && c.attributes.includes(stTerrain));
      const isHellAttr = Boolean(c.attributes && c.attributes.includes("地獄"));

      let role = "主力火力";
      let reason = "高戦力・総合火力";

      if (isMatch) {
        role = `${stTerrain}主力`;
        reason = isHades ? `${stTerrain}ボーナス1.3倍・高打点` : `${stTerrain}属性一致・戦力強化`;
      } else if (isHell && isHellAttr) {
        role = "地獄主力";
        reason = isHades ? "地獄ボーナス1.3倍・高打点" : "地獄属性・戦力強化";
      } else if (c.weapon === "歌舞" || /与ダメージ|射程/.test(full)) {
        role = "支援・バフ";
        reason = "射程バフ・部隊支援";
      }

      selected.push({
        castle: c,
        role: role,
        reason: reason,
        isMatch: isMatch,
        isOwned: Boolean(ownership.owned && ownership.owned.has(c.id))
      });
      selectedIds.add(c.id);
    }

    // Safety fill if any left
    for (const c of pool) {
      if (selected.length >= 8) break;
      if (!selectedIds.has(c.id)) {
        selected.push({
          castle: c,
          role: "汎用主力",
          reason: "高スコア枠",
          isMatch: Boolean(stTerrain && stTerrain !== "無" && c.attributes && c.attributes.includes(stTerrain)),
          isOwned: Boolean(ownership.owned && ownership.owned.has(c.id))
        });
        selectedIds.add(c.id);
      }
    }

    stageSuggestedPartyCache.set(cacheKey, selected);
    return selected;
  }

  function loadSuggestedPartyToCurrent(stageTitleOrId) {
    const st = findStage(stageTitleOrId);
    if (!st) return;
    const ownedOnly = document.getElementById("guideOwnedOnly")?.checked || false;
    const suggested = generateAutoSuggestedParty(st, ownedOnly);
    if (!suggested || suggested.length === 0) {
      alert("おすすめ編成が見つかりませんでした。");
      return;
    }

    if (!window.confirm(`「${st.title}」のおすすめ編成を現在の部隊に読み込みます。\n現在の編成が上書きされますが、よろしいですか？`)) {
      return;
    }

    const validMembers = [];
    suggested.forEach(({ castle: c }) => {
      const verified = getCastleById(c.id);
      if (verified) {
        validMembers.push({
          id: verified.id,
          strategyOn: true,
          specialOn: Boolean(verified.special)
        });
      } else {
        console.warn("推奨編成の城娘IDが見つかりません:", c.id);
      }
    });

    if (validMembers.length === 0) {
      alert("有効な城娘が見つかりませんでした。");
      return;
    }

    pushUndoSnapshot();
    party = validMembers;
    partyPresets[currentPresetIdx].party = party;
    if (st.terrain && st.terrain !== "無") {
      currentTerrain = st.terrain;
      const sel = document.getElementById("mapTerrainSelect");
      if (sel) sel.value = currentTerrain;
    }
    savePresets();
    renderDashboard();
    renderAllCastles();
    showNotification(`「${st.title}」のおすすめ編成（${validMembers.length}体）を部隊に反映しました！`);
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
        listEl.innerHTML = result.map(({ castle: c, role, reason, isMatch, isOwned }) => `
          <div class="suggest-castle-card" style="background:#fff; border:1px solid #bed8f0;">
            <div class="castle-info-row">
              ${getIconHtml(c, 28)}
              <div style="overflow:hidden; flex:1;">
                <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                  <span style="font-size:var(--fs-sub, 12px); font-weight:bold; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;" title="${c.name}">${c.name}</span>
                  ${!isOwned ? `<span class="badge" style="background:#e74c3c; color:#fff; font-size:var(--fs-sub, 12px); padding:1px 5px;">未所持</span>` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:3px; margin-top:1px;">
                  <span class="suggest-role-tag">${role}</span>
                  ${isMatch ? `<span class="badge" style="background:#2c6f4f; color:#fff; font-size:var(--fs-sub, 12px); padding:1px 5px;">一致</span>` : ''}
                </div>
              </div>
            </div>
            <div class="suggest-reason-box" style="font-size:var(--fs-sub, 12px);" title="${reason}">${reason}</div>
          </div>
        `).join("");

        const matchCount = result.filter(r => r.isMatch).length;
        if (badgeEl) {
          badgeEl.innerHTML = `<span class="badge" style="background:#2c6f4f; color:#fff;">地形一致: ${matchCount}/8体</span>`;
        }

        summaryText.innerHTML = `
          <div class="suggest-disclaimer" style="margin-bottom:6px;">※ おすすめ編成はデータからの自動生成による目安です。実際の攻略編成とは異なる場合があります</div>
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
      if (!currentAutoSuggestedParty || currentAutoSuggestedParty.length === 0) return;

      const validMembers = [];
      currentAutoSuggestedParty.forEach(({ castle: c }) => {
        const verified = getCastleById(c.id);
        if (verified) {
          validMembers.push({
            id: verified.id,
            strategyOn: true,
            specialOn: Boolean(verified.special)
          });
        } else {
          console.warn("城娘IDが見つかりません:", c.id);
        }
      });

      if (validMembers.length === 0) {
        alert("有効な城娘が見つかりませんでした。");
        return;
      }

      party = validMembers;
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
  // Party Share Link (Feature 3 & BUG-04, BUG-05, BUG-09)
  // ==========================================
  function getShareUrl() {
    const data = {
      v: 2,
      t: normalizeTerrain(currentTerrain),
      p: party.filter(Boolean).map(s => ({
        id: s.id,
        s: s.strategyOn ? 1 : 0,
        sp: s.specialOn ? 1 : 0
      }))
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
        // (1) Validate existence of IDs, deduplicate (BUG-05, BUG-06), cap to 8
        const validParty = [];
        const seenIds = new Set();
        const invalidIds = [];
        data.p.forEach(item => {
          if (item && item.id) {
            const cleanId = String(item.id).trim();
            if (seenIds.has(cleanId)) return; // Deduplicate
            const castle = getCastleById(cleanId);
            if (castle) {
              seenIds.add(cleanId);
              if (validParty.length < 8) {
                const specialOn = item.sp !== undefined ? Boolean(item.sp) : Boolean(castle.special);
                validParty.push({
                  id: cleanId,
                  strategyOn: Boolean(item.s),
                  specialOn: specialOn
                });
              }
            } else {
              invalidIds.push(cleanId);
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

        pushUndoSnapshot();
        party = validParty;
        partyPresets[currentPresetIdx].party = party;
        if (data.t !== undefined) {
          currentTerrain = normalizeTerrain(data.t);
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
      if (!s) return null;
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
      showToast("編成に城娘がいません。城娘を編成してからエクスポートしてください。", true);
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
            <div style="flex-shrink:0;">
              ${getIconHtml(castle, 48)}
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

  // ==========================================
  // Feature: 性能ティア表 ＆ ティアメーカー (Tier Browser & Tier Maker)
  // ==========================================
  let currentTierMode = "auto"; // 'auto' | 'curated' | 'custom'
  let currentCuratedCat = "overall";
  const DEFAULT_ROW_COLORS = [
    "#b33939", "#d35400", "#e67e22", "#2980b9", "#27ae60", "#6c5ce7", "#e84393", "#7f8c8d"
  ];
  let customTierRows = [
    { id: "row_ex", letter: "EX", sub: "人権・最優先", color: "#b33939", castles: ["四代目江戸城", "［裏］大宰府", "［絢爛］小谷城", "プレッドヤマ城", "［裏］坂本城", "［絢爛］アラゴネーゼ城", "［正月］江戸城", "［お月見］鹿野城"] },
    { id: "row_sp", letter: "S+", sub: "超主力", color: "#d35400", castles: ["江戸城", "肥前名護屋城", "カルルシュテイン城", "彦根城", "［絢爛］彦根城", "白鷺城", "枉死城", "チャンドラ・マハル", "モン・サン＝ミッシェル", "竜宮城"] },
    { id: "row_s", letter: "S", sub: "主力級", color: "#2980b9", castles: ["大坂城", "都於郡城", "平井城", "千早城", "紫禁城", "姫路城", "ノイシュヴァンシュタイン城", "城塞都市ディーテ", "城塞都市ウルク", "［聖夜］冬宮殿"] },
    { id: "row_ap", letter: "A+", sub: "準主力", color: "#27ae60", castles: ["名古屋城", "金亀城", "聚楽第", "プラハ城", "ヴァイジャヤンタ", "安平城", "［裏］小牧山城", "［裏］真田丸", "［裏］佐和山城"] },
    { id: "row_a", letter: "A", sub: "優秀", color: "#6c5ce7", castles: ["安土城", "指月伏見城", "万里の長城", "ウィンザー城", "シェーンブルン宮殿", "［正月］熊本城", "シャンボール城", "烏城"] }
  ];
  let customTiersStorage = {};
  let draggedCastleName = null;
  let draggedSourceRowId = null;

  // ------------------------------------------
  // Auto Scoring Tier Engine (100-Point System)
  // ------------------------------------------
  const TIER_THRESHOLDS = {
    SS: 0.03, // Top 3%
    S:  0.10, // Top 10%
    A:  0.25, // Top 25%
    B:  0.50, // Top 50%
    C:  0.75, // Top 75%
    D:  1.00  // Remainder
  };

  const TIER_ROW_METAS = [
    { tier: "SS", label: "SS", sub: "上位3%・人権/最優先", color: "#b33939" },
    { tier: "S",  label: "S",  sub: "上位10%・主力級", color: "#d35400" },
    { tier: "A",  label: "A",  sub: "上位25%・優秀",   color: "#2980b9" },
    { tier: "B",  label: "B",  sub: "上位50%・実用",   color: "#27ae60" },
    { tier: "C",  label: "C",  sub: "上位75%・普通",   color: "#6c5ce7" },
    { tier: "D",  label: "D",  sub: "上位75%超・基本", color: "#7f8c8d" }
  ];

  const TIER_STORAGE_WEIGHTS_KEY = "scre-helper:tier-weights:v1";
  const TIER_STORAGE_OVERRIDES_KEY = "scre-helper:tier-overrides:v1";

  const DEFAULT_ROLE_TIER_WEIGHTS = {
    overall:  { base: 25, self: 15, ally: 25, debuff: 15, strat: 10, spec: 10 },
    attacker: { base: 30, self: 25, strat: 15, debuff: 10, ally: 10, spec: 10 },
    buffer:   { ally: 45, strat: 15, spec: 15, base: 10, self: 10, debuff: 5 },
    debuffer: { debuff: 45, strat: 15, base: 15, ally: 10, spec: 10, self: 5 },
    ki:       { spec: 40, ally: 25, strat: 15, base: 10, self: 5, debuff: 5 },
    tank:     { base: 35, debuff: 20, ally: 15, spec: 15, self: 10, strat: 5 }
  };

  const ROLE_METAS = {
    attacker: { id: "attacker", label: "アタッカー", icon: "⚔️" },
    buffer:   { id: "buffer",   label: "バッファー",   icon: "✨" },
    debuffer: { id: "debuffer", label: "デバッファー", icon: "💀" },
    ki:       { id: "ki",       label: "気役",         icon: "⚡" },
    tank:     { id: "tank",     label: "タンク・妨害", icon: "🛡️" }
  };

  let roleTierWeights = JSON.parse(JSON.stringify(DEFAULT_ROLE_TIER_WEIGHTS));
  let tierOverrides = {};
  let autoTierScope = "role"; // 'role' | 'overall' | 'weapon' (default: 'role')
  let autoTierActiveRole = "attacker"; // 'attacker' | 'buffer' | 'debuffer' | 'ki' | 'tank'
  let cachedRawNormScores = null;
  let cachedComputedScores = null;

  function parseStatNumber(v) {
    if (v == null) return 0;
    let s = String(v).trim();
    if (!s) return 0;
    // Convert full-width digits and commas to half-width
    s = s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    s = s.replace(/[，]/g, ',');
    const parts = s.split('/');
    if (parts.length > 1) {
      const cleanLast = parts[1].replace(/[,\s%]/g, '').trim();
      const m = cleanLast.match(/^-?\d+/);
      if (m) return parseInt(m[0], 10);
    }
    const clean0 = parts[0].replace(/[,\s%]/g, '').trim();
    const m0 = clean0.match(/^-?\d+/);
    return m0 ? parseInt(m0[0], 10) : 0;
  }

  function getLatestAbilities(c) {
    let skill = c.skill || null;
    if (c.allSkills && c.allSkills.length > 0) {
      const k2 = c.allSkills.find(s => s.stage === '改弐');
      const k1 = c.allSkills.find(s => s.stage === '改壱');
      skill = k2 || k1 || c.allSkills[c.allSkills.length - 1];
    }
    let strategy = c.strategy || null;
    if (c.allStrategies && c.allStrategies.length > 0) {
      const k2 = c.allStrategies.find(s => s.stage === '改弐');
      const k1 = c.allStrategies.find(s => s.stage === '改壱');
      strategy = k2 || k1 || c.allStrategies[c.allStrategies.length - 1];
    }
    let special = c.special || null;
    if (c.allSpecials && c.allSpecials.length > 0) {
      const k2 = c.allSpecials.find(s => s.stage === '改弐');
      const k1 = c.allSpecials.find(s => s.stage === '改壱');
      special = k2 || k1 || c.allSpecials[c.allSpecials.length - 1];
    }
    return { skill, strategy, special };
  }

  function calcPercentile(val, sortedArr) {
    if (!sortedArr || sortedArr.length === 0) return 0.5;
    let count = 0;
    for (let i = 0; i < sortedArr.length; i++) {
      if (sortedArr[i] <= val) count++;
    }
    return count / sortedArr.length;
  }

  function precomputeRawNormScores() {
    if (!window.SCRE_DATA) return;
    const groups = {};
    window.SCRE_DATA.forEach(c => {
      const rk = c.rangeKind || "近";
      const g = (c.statsDetail && c.statsDetail.giant5) || {};
      const st = {
        atk: parseStatNumber(g.atk) || (c.stats && c.stats.atk) || 0,
        hp: parseStatNumber(g.hp) || (c.stats && c.stats.hp) || 0,
        def: parseStatNumber(g.def) || (c.stats && c.stats.def) || 0,
        range: parseStatNumber(g.range) || (c.stats && c.stats.range) || 0,
        recovery: parseStatNumber(g.recovery) || (c.stats && c.stats.recovery) || 0,
        cost: c.cost || 10
      };
      if (!groups[rk]) groups[rk] = [];
      groups[rk].push(st);
    });

    const sortedStats = {};
    Object.keys(groups).forEach(rk => {
      sortedStats[rk] = {
        atk: groups[rk].map(x => x.atk).sort((a,b) => a - b),
        hp: groups[rk].map(x => x.hp).sort((a,b) => a - b),
        def: groups[rk].map(x => x.def).sort((a,b) => a - b),
        range: groups[rk].map(x => x.range).sort((a,b) => a - b),
        recovery: groups[rk].map(x => x.recovery).sort((a,b) => a - b),
        cost: groups[rk].map(x => x.cost).sort((a,b) => a - b)
      };
    });

    const rawMap = {};
    window.SCRE_DATA.forEach(c => {
      const rk = c.rangeKind || "近";
      const g = (c.statsDetail && c.statsDetail.giant5) || {};
      const c_atk = parseStatNumber(g.atk) || (c.stats && c.stats.atk) || 0;
      const c_hp = parseStatNumber(g.hp) || (c.stats && c.stats.hp) || 0;
      const c_def = parseStatNumber(g.def) || (c.stats && c.stats.def) || 0;
      const c_range = parseStatNumber(g.range) || (c.stats && c.stats.range) || 0;
      const c_rec = parseStatNumber(g.recovery) || (c.stats && c.stats.recovery) || 0;
      const c_cost = c.cost || 10;

      const p_atk = calcPercentile(c_atk, sortedStats[rk].atk);
      const p_hp = calcPercentile(c_hp, sortedStats[rk].hp);
      const p_def = calcPercentile(c_def, sortedStats[rk].def);
      const p_range = calcPercentile(c_range, sortedStats[rk].range);
      const p_rec = calcPercentile(c_rec, sortedStats[rk].recovery);
      const p_cost = 1.0 - calcPercentile(c_cost, sortedStats[rk].cost);

      const { skill: sk, strategy: st, special: sp } = getLatestAbilities(c);

      // Collect and fix effects
      const all_effects = [];
      function addEffects(effList, sourceText) {
        if (!effList) return;
        effList.forEach(e => {
          let target = e.target;
          if (!target || target === "") {
            if (/自身のみ|自分の|自身に/.test(sourceText)) target = "self";
            else if (/敵の|敵に|標的|敵/.test(sourceText)) target = "enemy";
            else if (/全城娘|全味方|味方/.test(sourceText)) target = "all";
            else if (/射程内/.test(sourceText)) target = "inRange";
            else target = "";
          }
          all_effects.push({ ...e, target });
        });
      }

      const activeStage = (st && st.stage) || (sk && sk.stage) || "無印";
      const activeStrats = (c.allStrategies && c.allStrategies.length > 0)
        ? c.allStrategies.filter(s => s.stage === activeStage)
        : (st ? [st] : []);
      const sk_text = sk ? ((sk.name || "") + " " + (sk.text || "")) : "";
      const st_text = activeStrats.map(s => (s.name || "") + " " + (s.text || "")).join(" ");
      const sp_text = sp ? ((sp.name || "") + " " + (sp.text || "")) : "";
      const all_text = [sk_text, st_text, sp_text].filter(Boolean).join(" ");

      if (sk) addEffects(sk.effects, sk_text);
      activeStrats.forEach(s => addEffects(s.effects, (s.name || "") + " " + (s.text || "")));
      if (sp) addEffects(sp.effects, sp_text);

      // Token analysis
      const hasToken = /伏兵|トークン/.test(all_text) || (c.name && c.name.includes("プレッドヤマ城"));
      let tokenScore = 0.0;
      let tokenAtk = 0.0;
      let tokenBuffer = 0.0;
      let tokenKi = 0.0;
      let tokenTank = 0.0;

      if (hasToken) {
        tokenScore = 25.0;
        if (/攻撃を行う伏兵|反撃|攻撃の[\d\.]+倍|爆風ダメージ/.test(all_text)) {
          tokenAtk += 25.0;
          tokenScore += 20.0;
        }
        if (/伏兵.*?(?:射程内|配置中).*?(?:城娘|味方).*?(?:攻撃|防御|耐久|与ダメ|与えるダメージ|射程)/.test(all_text) || /伏兵の攻撃を味方に加算|城娘と伏兵に加算|伏兵にも届く/.test(all_text)) {
          tokenBuffer += 30.0;
          tokenScore += 25.0;
        }
        if (/伏兵.*?(?:射程内|配置中).*?(?:気の自然増加|気の自然回復|撃破|巨大化気)/.test(all_text) || (/気の自然増加|気の自然回復/.test(st_text) && hasToken) || (c.name && c.name.includes("プレッドヤマ城"))) {
          tokenKi += 40.0;
          tokenScore += 35.0;
        }
        if (/足止めする伏兵|狙われない|デコイ|被ダメ.*?軽減/.test(all_text)) {
          tokenTank += 20.0;
          tokenScore += 15.0;
        }
        tokenScore = Math.min(100.0, tokenScore);
      }

      // 1. Text Parsing & Enhancement
      // Kobu (鼓舞)
      let kobuScore = 0.0;
      let kobuPct = 0;
      const kobuMatch = all_text.match(/【鼓舞】.*?自身の(?:攻撃(?:と防御)?)の(\d+)%/);
      if (kobuMatch) {
        kobuPct = parseInt(kobuMatch[1], 10);
        kobuScore += kobuPct * 1.5;
      } else if (/自身の(?:攻撃(?:と防御)?)の(\d+)%.*?加算/.test(all_text)) {
        const m = all_text.match(/自身の(?:攻撃(?:と防御)?)の(\d+)%.*?加算/);
        if (m) {
          kobuPct = parseInt(m[1], 10);
          kobuScore += kobuPct * 1.2;
        }
      }
      if (/(?:最大化時は)?加算値([\d\.]+)倍/.test(all_text)) {
        const m = all_text.match(/(?:最大化時は)?加算値([\d\.]+)倍/);
        if (m) {
          kobuScore *= parseFloat(m[1]);
          kobuPct = Math.round(kobuPct * parseFloat(m[1]));
        }
      }
      if (c.weapon === "陣貝") {
        kobuScore = Math.max(kobuScore, 60.0);
        kobuPct = Math.max(kobuPct, 50);
      }

      // Giantize Ki Reduction (巨大化気)
      let giantKiScore = 0.0;
      const giantKiMatch = all_text.match(/(?:巨大化気|巨大化に必要な気|巨大化消費気)(?:を)?(\d+)%軽減/);
      if (giantKiMatch) {
        giantKiScore = parseInt(giantKiMatch[1], 10) * 1.5;
      } else if (/巨大化気.*?軽減|巨大化に必要な気.*?軽減/.test(all_text)) {
        giantKiScore = 30.0;
      }

      // Multi-stat team buffs parsing (全城娘)
      let allBuffScore = 0.0;
      const allTeamBlocks = all_text.match(/全城娘の[^。]+?(?:が)?(\d+)%上昇/g) || [];
      allTeamBlocks.forEach(blk => {
        const m = blk.match(/全城娘の(.+?)(?:が)?(\d+)%上昇/);
        if (m) {
          const statPart = m[1];
          const val = parseInt(m[2], 10);
          let statCount = 0;
          ['攻撃', '与ダメージ', '与えるダメージ', '攻撃速度', '防御', '射程', '耐久'].forEach(s => {
            if (statPart.includes(s)) statCount++;
          });
          statCount = Math.max(1, statCount);
          allBuffScore += val * statCount * 0.8;
        }
      });
      if (/全城娘の攻撃後の隙\s*(\d+)%短縮/.test(all_text)) {
        const m = all_text.match(/全城娘の攻撃後の隙\s*(\d+)%短縮/);
        if (m) allBuffScore += parseInt(m[1], 10) * 0.8;
      }
      if (/効果が(\d+)%に上昇/.test(all_text) && allBuffScore > 0) {
        const m = all_text.match(/効果が(\d+)%に上昇/);
        if (m) allBuffScore *= (parseInt(m[1], 10) / 40.0);
      }

      // In-range team buffs parsing (射程内)
      let rangeBuffScore = 0.0;
      const rangeTeamBlocks = all_text.match(/射程内(?:の)?(?:城娘|味方)の[^。]+/g) || [];
      rangeTeamBlocks.forEach(blk => {
        const subMatches = blk.matchAll(/([^\d、。\s]+?)(?:が|は)?(?:さらに)?(\d+)%/g);
        for (const sm of subMatches) {
          const statPart = sm[1];
          const val = parseInt(sm[2], 10);
          let statCount = 0;
          ['攻撃', '与ダメージ', '与えるダメージ', '攻撃速度', '防御', '射程', '耐久'].forEach(s => {
            if (statPart.includes(s)) statCount++;
          });
          statCount = Math.max(1, statCount);
          rangeBuffScore += val * statCount * 0.7;
        }
      });

      // Multiplier / Def Ignore / Target Count / Self Range (倍率・防御無視・対象数・自己射程)
      let atkMultScore = 0.0;
      const multMatch = all_text.match(/攻撃(?:の|が)?([\d\.]+)倍/);
      if (multMatch) {
        atkMultScore += parseFloat(multMatch[1]) * 8.0;
      }
      if (/防御を?無視/.test(all_text)) atkMultScore += 25.0;
      if (/連続で?攻撃/.test(all_text)) atkMultScore += 15.0;
      // "与えるダメージ" general multiplier parsing (Prompt 13: 高防御でも実ダメが伸びる・重複可能・審議素通りのため高評価)
      // Only count self/target multipliers towards personal attacker score, excluding ally team buffs (全城娘, 射程内, 味方)
      // Includes "特殊攻撃で与えるダメージが○倍" (Prompt 25: 14体の特殊攻撃ダメージ倍率を加点対象に含める)
      const dmgTargetMatches = all_text.matchAll(/(?:(?:自身|自分|標的|対象|敵|特殊能力中)[^。]*?与えるダメージ|特殊攻撃(?:で|の|時|時の範囲攻撃で)?(?:与える)?ダメージ(?:と[^\s、。0-9]+)?)(?:が|は)?(?:約)?([\d\.]+)倍/g);
      for (const dtm of dmgTargetMatches) {
        const mult = parseFloat(dtm[1]);
        if (mult > 1.0) {
          atkMultScore += (mult - 1.0) * 100 * 0.4;
        }
      }
      if (/特殊能力中.*?与えるダメージ([\d\.]+)倍/.test(all_text)) {
        const m = all_text.match(/特殊能力中.*?与えるダメージ([\d\.]+)倍/);
        if (m) atkMultScore += parseFloat(m[1]) * 15.0;
      }
      if (/標的に攻撃の(\d+)倍/.test(sp_text)) {
        const m = sp_text.match(/標的に攻撃の(\d+)倍/);
        if (m) atkMultScore += parseInt(m[1], 10) * 8.0;
      }
      const targetIncMatch = all_text.match(/攻撃対象が?(\d+)増加/);
      if (targetIncMatch) {
        atkMultScore += parseInt(targetIncMatch[1], 10) * 15.0;
      }
      if (/射程(?:が)?(?:約)?([\d\.]+)倍/.test(all_text)) {
        const m = all_text.match(/射程(?:が)?(?:約)?([\d\.]+)倍/);
        if (m) atkMultScore += parseFloat(m[1]) * 12.0;
      }

      // Ki Generation (気役)
      let kiScore = 0.0;
      if (/気の自然増加|気の自然回復|気が徐々に増加|時間経過で気が/.test(all_text)) kiScore += 45.0;
      if (/撃破.*?気.*?増加|撃破獲得気/.test(all_text)) kiScore += 40.0;
      if (/10秒毎に気が追加で(\d+)増加/.test(all_text)) kiScore += 35.0;
      if (/撤退大破時の回復気が?(\d+)%上昇|撤退大破.*?気/.test(all_text)) {
        const m = all_text.match(/撤退大破時の回復気が?(\d+)%上昇/);
        kiScore += m ? parseInt(m[1], 10) * 1.2 : 45.0;
      }
      if (/再配置の時間が?(\d+)%短縮/.test(all_text)) {
        const m = all_text.match(/再配置の時間が?(\d+)%短縮/);
        kiScore += m ? parseInt(m[1], 10) * 0.8 : 45.0;
      }
      if (c.weapon === "鎌") {
        kiScore += 25.0;
      }
      if (/計略再使用.*?短縮|計略短縮/.test(all_text)) kiScore += 25.0;
      if (giantKiScore > 0) kiScore += giantKiScore * 0.8;
      kiScore += tokenKi;

      // Debuff Score
      let debuffScore = 0.0;
      if (/敵の防御が?(\d+)%低下/.test(all_text)) debuffScore += 20.0;
      if (/敵の被ダメージが?(\d+)%上昇/.test(all_text)) debuffScore += 20.0;
      if (/移動速度(?:が|を)?.*?(\d+)%低下/.test(all_text)) debuffScore += 15.0;
      if (/敵の攻撃が?(\d+)%低下/.test(all_text)) debuffScore += 15.0;
      if (/後退させる|ノックバック/.test(all_text)) debuffScore += 10.0;
      if (/猛毒|火傷|氷結|暗闇|混乱|行動不能/.test(all_text)) debuffScore += 10.0;

      // Tank & Disruption Score
      let tankScore = 0.0;
      if (/足止め/.test(all_text)) tankScore += 25.0;
      if (/被ダメージを?(\d+)%軽減/.test(all_text)) tankScore += 20.0;
      if (/耐久が0になっても|不屈/.test(all_text)) tankScore += 25.0;
      if (/狙われない|対象にならない|隠密/.test(all_text)) tankScore += 15.0;
      if (/回復が与ダメの(\d+)%回復|被回復量/.test(all_text)) tankScore += 15.0;
      tankScore += tokenTank;

      // Effects contributions
      let eff_self = 0.0;
      let eff_ally = 0.0;
      let eff_debuff = 0.0;

      all_effects.forEach(e => {
        const stat = e.stat || "";
        const val = Math.abs(e.value || 20);
        const target = e.target;

        if (target === "self") {
          if (stat === 'dmgDealtTarget') eff_self += val * 0.5; // Prompt 13: Higher than dmgDealt (0.3)
          else if (['atkPercent', 'dmgDealt', 'atkSpeed', 'defIgnore'].includes(stat)) eff_self += val * 0.3;
          else eff_self += val * 0.15;
        } else if (target === "enemy" || stat.startsWith("enemy")) {
          if (['enemyDefDown', 'enemyDmgTakenUp', 'enemySlow'].includes(stat)) eff_debuff += val * 0.3;
          else eff_debuff += val * 0.15;
        } else if (['all', 'inRange', 'allAllies'].includes(target)) {
          if (stat === 'dmgDealtTarget') eff_ally += val * 0.65; // Prompt 13: Higher than dmgDealt (0.3)
          else if (['dmgDealt', 'atkSpeed', 'shareAtk', 'shareDef'].includes(stat)) eff_ally += val * 0.3;
          else eff_ally += val * 0.15;
        }
      });

      // Role Affinities
      const aff_attacker = (p_atk * 35.0) + eff_self + (atkMultScore * 0.8) + tokenAtk;
      const aff_buffer = eff_ally + (kobuScore * 1.5) + (allBuffScore * 1.2) + rangeBuffScore + (giantKiScore * 0.6) + tokenBuffer;
      const aff_debuffer = eff_debuff + debuffScore;
      const aff_ki = kiScore;
      const aff_tank = (p_hp * 20.0) + (p_def * 20.0) + tankScore;

      const affinities = [
        { role: "attacker", label: "アタッカー", icon: "⚔️", score: aff_attacker },
        { role: "buffer",   label: "バッファー",   icon: "✨", score: aff_buffer },
        { role: "debuffer", label: "デバッファー", icon: "💀", score: aff_debuffer },
        { role: "ki",       label: "気役",         icon: "⚡", score: aff_ki },
        { role: "tank",     label: "タンク・妨害", icon: "🛡️", score: aff_tank }
      ];

      affinities.sort((a, b) => b.score - a.score);
      const primaryRole = affinities[0].role;
      const primaryRoleMeta = affinities[0];
      let subRole = null;
      let subRoleMeta = null;
      if (affinities[1].score >= affinities[0].score * 0.70 && affinities[1].score >= 18.0) {
        subRole = affinities[1].role;
        subRoleMeta = affinities[1];
      }

      // Normalized category scores
      const normSelf = Math.min(1.0, (eff_self + atkMultScore * 0.8 + (allBuffScore * 0.5)) / 80.0);
      const kiTeamContribution = (primaryRole === "ki") ? Math.max(0, kiScore - 15) * 1.5 : 0.0;
      const normAlly = Math.min(1.0, (eff_ally + kobuScore * 1.5 + allBuffScore * 1.2 + rangeBuffScore + giantKiScore * 0.8 + tokenBuffer + kiTeamContribution) / 140.0);
      const normDebuff = Math.min(1.0, (eff_debuff + debuffScore) / 50.0);
      const normSpec = Math.min(1.0, (kiScore + (giantKiScore * 0.8) + ((c.attributes && c.attributes.length >= 2) ? 12.0 : 0.0) + (tankScore * 0.5) + (allBuffScore * 0.4) + (tokenScore * 0.4)) / 70.0);

      let stratRaw = 0.0;
      // Prompt 25: 拳武器の特例を廃止し、ゲーム内の真の計略・特殊能力データに基づいて判定
      const hasSpecial = Boolean(sp) || Boolean(c.special) || /特殊能力/.test(all_text);
      const activeAbility = st || sp;
      if (activeAbility || hasSpecial) {
        let cd = null;
        let cost = null;
        if (activeAbility) {
          cd = activeAbility.cooldown || (c.strategy && c.strategy.cooldown);
          cost = activeAbility.cost || (c.strategy && c.strategy.cost);
          if (!cd) {
            const m = (activeAbility.name || "").match(/(?:再使用|使用まで)(\d+)秒/);
            if (m) cd = parseInt(m[1], 10);
          }
          if (!cost) {
            const m = (activeAbility.name || "").match(/消費気(\d+)/);
            if (m) cost = parseInt(m[1], 10);
          }
        }
        cd = cd != null ? cd : 50;
        cost = cost != null ? cost : 7;
        stratRaw += Math.max(0, 1.0 - (cd / 80.0)) * 5.0 + Math.max(0, 1.0 - (cost / 15.0)) * 3.0;
        if (hasSpecial) stratRaw += 3.0;
        if (hasToken) stratRaw += 3.0;
      } else if (c.weapon === "陣貝") {
        const kobuRatio = Math.min(1.0, Math.max(0.5, (kobuPct || 50) / 60.0));
        stratRaw = 8.0 * kobuRatio;
      } else {
        stratRaw = 0.0;
      }
      const normStrat = Math.min(1.0, stratRaw / 8.0);

      // Base norm depends on role!
      let baseNorm = 0.5;
      if (primaryRole === "attacker") {
        baseNorm = p_atk * 0.55 + p_range * 0.25 + p_cost * 0.10 + p_def * 0.05 + p_hp * 0.05;
      } else if (primaryRole === "buffer") {
        baseNorm = p_range * 0.35 + p_rec * 0.25 + p_cost * 0.20 + p_atk * 0.10 + p_def * 0.05 + p_hp * 0.05;
      } else if (primaryRole === "tank") {
        baseNorm = p_hp * 0.40 + p_def * 0.40 + p_rec * 0.10 + p_cost * 0.10;
      } else if (primaryRole === "ki") {
        baseNorm = p_cost * 0.55 + p_rec * 0.25 + p_range * 0.10 + p_hp * 0.10;
      } else {
        baseNorm = p_range * 0.35 + p_atk * 0.25 + p_cost * 0.20 + p_def * 0.10 + p_hp * 0.10;
      }

      rawMap[c.id] = {
        baseNorm,
        normSelf,
        normAlly,
        normDebuff,
        normStrat,
        normSpec,
        primaryRole,
        primaryRoleMeta,
        subRole,
        subRoleMeta,
        tokenScore: Math.round(tokenScore),
        affinities
      };
    });

    cachedRawNormScores = rawMap;
  }

  function computeCastleScores(weightsMap = roleTierWeights) {
    if (!cachedRawNormScores) precomputeRawNormScores();
    if (!window.SCRE_DATA) return [];

    const effectiveWeightsMap = (weightsMap && weightsMap.attacker) ? weightsMap : roleTierWeights;

    const result = window.SCRE_DATA.map(c => {
      const raw = (cachedRawNormScores && cachedRawNormScores[c.id]) || {
        baseNorm: 0.5, normSelf: 0, normAlly: 0, normDebuff: 0, normStrat: 0, normSpec: 0,
        primaryRole: "attacker", primaryRoleMeta: ROLE_METAS.attacker, subRole: null, subRoleMeta: null,
        tokenScore: 0, affinities: []
      };

      const pRole = raw.primaryRole || "attacker";
      const w = effectiveWeightsMap[pRole] || DEFAULT_ROLE_TIER_WEIGHTS[pRole] || DEFAULT_ROLE_TIER_WEIGHTS.overall;
      const totalW = Object.values(w).reduce((a, b) => a + b, 0);
      const scale = totalW > 0 ? (100.0 / totalW) : 1.0;

      const sBase = Math.round(raw.baseNorm * w.base * scale * 10) / 10;
      const sSelf = Math.round(raw.normSelf * w.self * scale * 10) / 10;
      const sAlly = Math.round(raw.normAlly * w.ally * scale * 10) / 10;
      const sDebuff = Math.round(raw.normDebuff * w.debuff * scale * 10) / 10;
      const sStrat = Math.round(raw.normStrat * w.strat * scale * 10) / 10;
      const sSpec = Math.round(raw.normSpec * w.spec * scale * 10) / 10;
      const roleScore = Math.round((sBase + sSelf + sAlly + sDebuff + sStrat + sSpec) * 10) / 10;

      // Overall Score
      const ow = effectiveWeightsMap.overall || DEFAULT_ROLE_TIER_WEIGHTS.overall;
      const oTotalW = Object.values(ow).reduce((a, b) => a + b, 0);
      const oScale = oTotalW > 0 ? (100.0 / oTotalW) : 1.0;
      const oScore = Math.round((
        raw.baseNorm * ow.base * oScale +
        raw.normSelf * ow.self * oScale +
        raw.normAlly * ow.ally * oScale +
        raw.normDebuff * ow.debuff * oScale +
        raw.normStrat * ow.strat * oScale +
        raw.normSpec * ow.spec * oScale
      ) * 10) / 10;

      return {
        id: c.id,
        name: c.name,
        rarity: c.rarity,
        weapon: c.weapon,
        castleType: c.castleType,
        rangeKind: c.rangeKind,
        total: roleScore,
        roleScore: roleScore,
        overallScore: oScore,
        primaryRole: raw.primaryRole,
        primaryRoleMeta: raw.primaryRoleMeta,
        subRole: raw.subRole,
        subRoleMeta: raw.subRoleMeta,
        tokenScore: raw.tokenScore,
        affinities: raw.affinities,
        breakdown: {
          base: sBase,
          self: sSelf,
          ally: sAlly,
          debuff: sDebuff,
          strat: sStrat,
          spec: sSpec
        },
        castle: c
      };
    });

    // 1. Group by primaryRole and compute Role Ranks and Tiers
    const roleGroups = {};
    result.forEach(item => {
      const r = item.primaryRole || "attacker";
      if (!roleGroups[r]) roleGroups[r] = [];
      roleGroups[r].push(item);
    });

    Object.keys(roleGroups).forEach(r => {
      const list = roleGroups[r];
      list.sort((a, b) => b.roleScore - a.roleScore);
      const count = list.length;
      const idxSS = Math.max(1, Math.floor(count * TIER_THRESHOLDS.SS));
      const idxS  = Math.max(idxSS + 1, Math.floor(count * TIER_THRESHOLDS.S));
      const idxA  = Math.max(idxS + 1, Math.floor(count * TIER_THRESHOLDS.A));
      const idxB  = Math.max(idxA + 1, Math.floor(count * TIER_THRESHOLDS.B));
      const idxC  = Math.max(idxB + 1, Math.floor(count * TIER_THRESHOLDS.C));

      list.forEach((item, idx) => {
        item.roleRank = idx + 1;
        item.roleTotal = count;
        let t = "D";
        if (idx < idxSS) t = "SS";
        else if (idx < idxS) t = "S";
        else if (idx < idxA) t = "A";
        else if (idx < idxB) t = "B";
        else if (idx < idxC) t = "C";
        item.roleTier = t;
      });
    });

    // 2. Weapon Ranks and Tiers
    const weaponGroups = {};
    result.forEach(item => {
      const w = item.weapon || "その他";
      if (!weaponGroups[w]) weaponGroups[w] = [];
      weaponGroups[w].push(item);
    });

    Object.keys(weaponGroups).forEach(w => {
      const list = weaponGroups[w];
      list.sort((a, b) => b.total - a.total);
      const wCount = list.length;
      list.forEach((item, wIdx) => {
        item.weaponRank = wIdx + 1;
        item.weaponTotal = wCount;

        const idxSS = Math.max(1, Math.floor(wCount * TIER_THRESHOLDS.SS));
        const idxS  = Math.max(idxSS + 1, Math.floor(wCount * TIER_THRESHOLDS.S));
        const idxA  = Math.max(idxS + 1, Math.floor(wCount * TIER_THRESHOLDS.A));
        const idxB  = Math.max(idxA + 1, Math.floor(wCount * TIER_THRESHOLDS.B));
        const idxC  = Math.max(idxB + 1, Math.floor(wCount * TIER_THRESHOLDS.C));

        let wTier = "D";
        if (wIdx < idxSS) wTier = "SS";
        else if (wIdx < idxS) wTier = "S";
        else if (wIdx < idxA) wTier = "A";
        else if (wIdx < idxB) wTier = "B";
        else if (wIdx < idxC) wTier = "C";
        item.weaponTier = wTier;
      });
    });

    // 3. Overall Ranks and Tiers
    result.sort((a, b) => b.overallScore - a.overallScore);
    const totalCount = result.length;
    const idxSS = Math.max(1, Math.floor(totalCount * TIER_THRESHOLDS.SS));
    const idxS  = Math.max(idxSS + 1, Math.floor(totalCount * TIER_THRESHOLDS.S));
    const idxA  = Math.max(idxS + 1, Math.floor(totalCount * TIER_THRESHOLDS.A));
    const idxB  = Math.max(idxA + 1, Math.floor(totalCount * TIER_THRESHOLDS.B));
    const idxC  = Math.max(idxB + 1, Math.floor(totalCount * TIER_THRESHOLDS.C));

    result.forEach((item, idx) => {
      item.overallRank = idx + 1;
      item.overallTotal = totalCount;
      let oTier = "D";
      if (idx < idxSS) oTier = "SS";
      else if (idx < idxS) oTier = "S";
      else if (idx < idxA) oTier = "A";
      else if (idx < idxB) oTier = "B";
      else if (idx < idxC) oTier = "C";
      item.overallTier = oTier;
      item.tier = oTier;
    });

    cachedComputedScores = result;
    cachedScoreMap = null;
    if (typeof clearStageSuggestedPartyCache === "function") {
      clearStageSuggestedPartyCache();
    }
    return result;
  }

  function loadTierWeights() {
    try {
      const saved = localStorage.getItem(TIER_STORAGE_WEIGHTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.attacker || parsed.buffer || parsed.overall) {
          // New role-based structure
          roleTierWeights = {
            overall:  { ...DEFAULT_ROLE_TIER_WEIGHTS.overall,  ...(parsed.overall || {}) },
            attacker: { ...DEFAULT_ROLE_TIER_WEIGHTS.attacker, ...(parsed.attacker || {}) },
            buffer:   { ...DEFAULT_ROLE_TIER_WEIGHTS.buffer,   ...(parsed.buffer || {}) },
            debuffer: { ...DEFAULT_ROLE_TIER_WEIGHTS.debuffer, ...(parsed.debuffer || {}) },
            ki:       { ...DEFAULT_ROLE_TIER_WEIGHTS.ki,       ...(parsed.ki || {}) },
            tank:     { ...DEFAULT_ROLE_TIER_WEIGHTS.tank,     ...(parsed.tank || {}) }
          };
        } else {
          // Migrate legacy flat structure to overall weights
          roleTierWeights = JSON.parse(JSON.stringify(DEFAULT_ROLE_TIER_WEIGHTS));
          roleTierWeights.overall = { ...DEFAULT_ROLE_TIER_WEIGHTS.overall, ...parsed };
        }
      }
    } catch (e) {
      console.warn("Failed to load tier weights:", e);
    }
  }

  function saveTierWeights() {
    try {
      localStorage.setItem(TIER_STORAGE_WEIGHTS_KEY, JSON.stringify(roleTierWeights));
    } catch (e) {
      console.warn("Failed to save tier weights:", e);
    }
  }

  function loadTierOverrides() {
    try {
      const saved = localStorage.getItem(TIER_STORAGE_OVERRIDES_KEY);
      if (saved) {
        tierOverrides = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load tier overrides:", e);
    }
  }

  function saveTierOverrides() {
    try {
      localStorage.setItem(TIER_STORAGE_OVERRIDES_KEY, JSON.stringify(tierOverrides));
    } catch (e) {
      console.warn("Failed to save tier overrides:", e);
    }
  }

  let autoTierTooltipEl = null;

  function initAutoTierTooltip() {
    if (document.getElementById("tierAutoTooltip")) return;
    autoTierTooltipEl = document.createElement("div");
    autoTierTooltipEl.id = "tierAutoTooltip";
    autoTierTooltipEl.className = "tier-auto-tooltip";
    document.body.appendChild(autoTierTooltipEl);
  }

  function showAutoTierTooltip(e, item) {
    initAutoTierTooltip();
    const bd = item.breakdown;
    const c = item.castle;
    const currentRole = (autoTierScope === "role") ? autoTierActiveRole : "overall";
    const activeWeights = roleTierWeights[currentRole] || DEFAULT_ROLE_TIER_WEIGHTS[currentRole];
    const totalWeight = Object.values(activeWeights).reduce((a, b) => a + b, 0);
    const scale = totalWeight > 0 ? (100.0 / totalWeight) : 1.0;

    const maxBase = (activeWeights.base * scale).toFixed(1);
    const maxSelf = (activeWeights.self * scale).toFixed(1);
    const maxAlly = (activeWeights.ally * scale).toFixed(1);
    const maxDebuff = (activeWeights.debuff * scale).toFixed(1);
    const maxStrat = (activeWeights.strat * scale).toFixed(1);
    const maxSpec = (activeWeights.spec * scale).toFixed(1);

    const subText = item.subRoleMeta ? ` (兼任: ${item.subRoleMeta.icon} ${item.subRoleMeta.label})` : "";
    const tokenInfo = item.tokenScore > 0 ? `伏兵(トークン)適性: ${item.tokenScore} pt` : `本体性能主軸`;

    const affListHtml = (item.affinities || []).map(a => {
      const isTop = a.role === item.primaryRole;
      return `<span class="${isTop ? 'top-aff' : ''}">${a.icon} ${a.label}: ${Math.round(a.score)}</span>`;
    }).join("");

    autoTierTooltipEl.innerHTML = `
      <div class="tier-tooltip-title">
        <span>★${c.rarity || 7} ${c.name}</span>
        <span style="color:#ff7675; font-size:13px; font-weight:800;">${item.total} pt</span>
      </div>
      <div style="font-size:11px; color:#ffeaa7; margin-bottom:6px; font-weight:bold;">
        主役割: ${item.primaryRoleMeta ? item.primaryRoleMeta.icon + ' ' + item.primaryRoleMeta.label : '未分類'}${subText}
      </div>
      <div class="tier-tooltip-ranks">
        <span>役割内: #${item.roleRank} / ${item.roleTotal} (${item.roleTier})</span>
        <span>全体: #${item.overallRank} / ${item.overallTotal} (${item.overallTier})</span>
        <span>${item.weapon}: #${item.weaponRank} / ${item.weaponTotal}</span>
      </div>
      <div class="tier-tooltip-section-title">適性値内訳 (${tokenInfo})</div>
      <div class="tier-tooltip-affinities">
        ${affListHtml}
      </div>
      <div class="tier-tooltip-section-title">評価カテゴリ配点 (${item.primaryRoleMeta ? item.primaryRoleMeta.label : '全体'})</div>
      <div class="tier-tooltip-breakdown">
        <div class="tier-tooltip-row">
          <span class="label">1. 基礎性能 (巨5ステ)</span>
          <span class="val">${bd.base} / ${maxBase} pt</span>
        </div>
        <div class="tier-tooltip-row">
          <span class="label">2. 自己強化バフ</span>
          <span class="val">${bd.self} / ${maxSelf} pt</span>
        </div>
        <div class="tier-tooltip-row">
          <span class="label">3. 味方支援・鼓舞・気</span>
          <span class="val">${bd.ally} / ${maxAlly} pt</span>
        </div>
        <div class="tier-tooltip-row">
          <span class="label">4. 敵妨害・デバフ</span>
          <span class="val">${bd.debuff} / ${maxDebuff} pt</span>
        </div>
        <div class="tier-tooltip-row">
          <span class="label">5. 計略効率・追加効果</span>
          <span class="val">${bd.strat} / ${maxStrat} pt</span>
        </div>
        <div class="tier-tooltip-row">
          <span class="label">6. 汎用・複合・特殊</span>
          <span class="val">${bd.spec} / ${maxSpec} pt</span>
        </div>
      </div>
      ${item.isOverridden ? `<div style="margin-top:6px; color:#ffeaa7; font-size:10px; border-top:1px dashed rgba(255,255,255,0.2); padding-top:4px;">✏️ 手動上書き中 (${item.effectiveTier})</div>` : ""}
    `;
    autoTierTooltipEl.style.display = "block";
    positionAutoTierTooltip(e);
  }

  function positionAutoTierTooltip(e) {
    if (!autoTierTooltipEl || autoTierTooltipEl.style.display === "none") return;
    const x = e.clientX + 14;
    const y = e.clientY + 14;
    const w = 290;
    const h = 260;
    const maxX = window.innerWidth - w - 10;
    const maxY = window.innerHeight - h - 10;
    autoTierTooltipEl.style.left = `${Math.min(x, maxX)}px`;
    autoTierTooltipEl.style.top = `${Math.min(y, maxY)}px`;
  }

  function hideAutoTierTooltip() {
    if (autoTierTooltipEl) {
      autoTierTooltipEl.style.display = "none";
    }
  }

  function promptTierOverride(item) {
    const current = item.effectiveTier || "D";
    const answer = prompt(`「${item.name}」のティアを手動設定してください (SS, S, A, B, C, D、または空白で手動設定を解除):`, current);
    if (answer === null) return;
    const val = answer.trim().toUpperCase();
    if (!val) {
      delete tierOverrides[item.id];
      delete tierOverrides[item.name];
      saveTierOverrides();
      renderTierAutoBoard();
      showToast(`「${item.name}」の手動上書きを解除しました`);
    } else if (['SS', 'S', 'A', 'B', 'C', 'D'].includes(val)) {
      tierOverrides[item.id] = val;
      saveTierOverrides();
      renderTierAutoBoard();
      showToast(`「${item.name}」のティアを ${val} に手動設定しました`);
    } else {
      alert("ティアは SS, S, A, B, C, D のいずれかで入力してください。");
    }
  }

  function syncWeightSlidersUI() {
    const currentRole = (autoTierScope === "role") ? autoTierActiveRole : "overall";
    const activeWeights = roleTierWeights[currentRole] || DEFAULT_ROLE_TIER_WEIGHTS[currentRole] || DEFAULT_ROLE_TIER_WEIGHTS.overall;
    const total = Object.values(activeWeights).reduce((a, b) => a + b, 0);
    const scale = total > 0 ? (100.0 / total) : 1.0;

    const sliderDefs = [
      { id: "sliderWeightBase", lbl: "lblWeightBase", key: "base" },
      { id: "sliderWeightSelf", lbl: "lblWeightSelf", key: "self" },
      { id: "sliderWeightAlly", lbl: "lblWeightAlly", key: "ally" },
      { id: "sliderWeightDebuff", lbl: "lblWeightDebuff", key: "debuff" },
      { id: "sliderWeightStrat", lbl: "lblWeightStrat", key: "strat" },
      { id: "sliderWeightSpec", lbl: "lblWeightSpec", key: "spec" }
    ];
    sliderDefs.forEach(def => {
      const slider = document.getElementById(def.id);
      const lbl = document.getElementById(def.lbl);
      const w = activeWeights[def.key] !== undefined ? activeWeights[def.key] : 10;
      const scaled = (w * scale).toFixed(1);
      if (slider) slider.value = w;
      if (lbl) {
        lbl.textContent = total === 100 ? `${w}点` : `${w}点 (${scaled}%)`;
      }
    });

    const roleLabelEl = document.getElementById("tierWeightActiveRoleLabel");
    if (roleLabelEl) {
      const roleName = ROLE_METAS[currentRole] ? ROLE_METAS[currentRole].label : "全体";
      roleLabelEl.textContent = `(${roleName})`;
    }

    const badge = document.getElementById("tierTotalWeightBadge");
    if (badge) {
      if (total === 100) {
        badge.textContent = `合計: 100点 (100点満点)`;
      } else {
        badge.textContent = `合計重み: ${total} (100点満点に自動正規化)`;
      }
    }
  }

  function renderTierAuto() {
    loadTierWeights();
    loadTierOverrides();
    syncWeightSlidersUI();
    computeCastleScores(roleTierWeights);
    renderTierAutoBoard();
  }

  function renderTierAutoBoard() {
    const board = document.getElementById("tierAutoBoard");
    if (!board) return;

    if (!cachedComputedScores) {
      computeCastleScores(roleTierWeights);
    }

    // Role tabs visibility & counts
    const isRoleScope = (autoTierScope === "role");
    const roleTabsEl = document.getElementById("tierRoleTabs");
    if (roleTabsEl) {
      roleTabsEl.style.display = isRoleScope ? "flex" : "none";
    }

    if (isRoleScope && cachedComputedScores) {
      const counts = { attacker: 0, buffer: 0, debuffer: 0, ki: 0, tank: 0 };
      cachedComputedScores.forEach(it => {
        if (counts[it.primaryRole] !== undefined) counts[it.primaryRole]++;
      });
      const setRoleCount = (id, count) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `(${count})`;
      };
      setRoleCount("countRoleAttacker", counts.attacker);
      setRoleCount("countRoleBuffer", counts.buffer);
      setRoleCount("countRoleDebuffer", counts.debuffer);
      setRoleCount("countRoleKi", counts.ki);
      setRoleCount("countRoleTank", counts.tank);

      document.querySelectorAll(".tier-role-tab").forEach(tab => {
        tab.classList.toggle("active", tab.getAttribute("data-role") === autoTierActiveRole);
      });
    }

    const filterWeapon = (document.getElementById("tierAutoFilterWeapon")?.value || "").trim();
    const filterType = (document.getElementById("tierAutoFilterType")?.value || "").trim();
    const filterRangeKind = (document.getElementById("tierAutoFilterRangeKind")?.value || "").trim();
    const filterOwnership = (document.getElementById("tierAutoFilterOwnership")?.value || "").trim();
    const filterSearch = (document.getElementById("tierAutoSearchInput")?.value || "").trim().toLowerCase();

    // Filter list
    let list = cachedComputedScores.filter(item => {
      if (isRoleScope && item.primaryRole !== autoTierActiveRole) return false;

      const c = item.castle;
      if (filterWeapon && c.weapon !== filterWeapon) return false;
      if (filterType) {
        const attrs = c.attributes || [c.castleType || ""];
        if (!attrs.includes(filterType) && c.castleType !== filterType) return false;
      }
      if (filterRangeKind && c.rangeKind !== filterRangeKind) return false;
      if (filterOwnership === "owned" && (!ownership.owned || !ownership.owned[c.id])) return false;
      if (filterOwnership === "unowned" && (ownership.owned && ownership.owned[c.id])) return false;
      if (filterOwnership === "favorites" && (!ownership.favorites || !ownership.favorites[c.id])) return false;
      if (filterSearch) {
        if (!matchCastleNameOrRuby(c, filterSearch)) return false;
      }
      return true;
    });

    // Group into tiers: SS, S, A, B, C, D
    const tierGroups = { SS: [], S: [], A: [], B: [], C: [], D: [] };

    list.forEach(item => {
      const rawOverride = tierOverrides[item.id] || tierOverrides[item.name];
      let effectiveTier = rawOverride;
      if (effectiveTier) {
        if (effectiveTier === "Tier0") effectiveTier = "SS";
        else if (effectiveTier === "Tier1") effectiveTier = "S";
        else if (effectiveTier === "Tier2") effectiveTier = "A";
        else if (effectiveTier === "Tier3") effectiveTier = "B";
      }
      if (!effectiveTier) {
        if (autoTierScope === "role") effectiveTier = item.roleTier;
        else if (autoTierScope === "weapon") effectiveTier = item.weaponTier;
        else effectiveTier = item.overallTier;
      }
      if (tierGroups[effectiveTier]) {
        tierGroups[effectiveTier].push({ ...item, isOverridden: Boolean(rawOverride), effectiveTier });
      } else {
        tierGroups["D"].push({ ...item, isOverridden: Boolean(rawOverride), effectiveTier: "D" });
      }
    });

    // Update override count badge in toolbar
    const overrideCount = Object.keys(tierOverrides).length;
    const countBadge = document.getElementById("tierOverrideCount");
    if (countBadge) countBadge.textContent = `(${overrideCount})`;

    // Render Rows
    board.innerHTML = "";
    TIER_ROW_METAS.forEach(rowMeta => {
      const tierKey = rowMeta.tier;
      const castlesInTier = tierGroups[tierKey] || [];

      const rowEl = document.createElement("div");
      rowEl.className = "tier-row";
      rowEl.setAttribute("data-tier", tierKey);

      rowEl.innerHTML = `
        <div class="tier-row-header" style="background-color: ${rowMeta.color};">
          <span class="tier-row-letter">${rowMeta.label}</span>
          <span class="tier-row-sub">${rowMeta.sub} (${castlesInTier.length}体)</span>
        </div>
        <div class="tier-row-content">
          ${castlesInTier.length === 0 ? `<div style="font-size:11px; color:#999; padding:12px;">該当する城娘はいません</div>` : ""}
        </div>
      `;

      const contentEl = rowEl.querySelector(".tier-row-content");
      castlesInTier.forEach(item => {
        const c = item.castle;
        const chip = document.createElement("div");
        chip.className = "tier-auto-chip";
        chip.setAttribute("data-id", c.id);
        chip.setAttribute("data-name", c.name);

        const isHigh = item.total >= 60.0;
        const overrideHtml = item.isOverridden ? `<span class="tier-override-badge" title="手動設定済み: ${item.effectiveTier}">✏️</span>` : "";
        const roleIcon = item.primaryRoleMeta ? `<span class="tier-role-badge" title="${item.primaryRoleMeta.label}">${item.primaryRoleMeta.icon}</span>` : "";
        const subRoleHtml = item.subRoleMeta ? `<span class="tier-subrole-tag" title="兼任: ${item.subRoleMeta.label}">兼 ${item.subRoleMeta.label}</span>` : "";

        chip.innerHTML = `
          <div class="tier-auto-chip-icon">
            ${getIconHtml(c, 44)}
          </div>
          <div class="tier-auto-chip-info">
            <div class="tier-auto-chip-name" title="${c.name}">
              ${roleIcon}${c.name}${subRoleHtml}
            </div>
            <div class="tier-auto-chip-meta">
              <span class="tier-auto-score-pill ${isHigh ? 'high' : ''}">${item.total}pt</span>
              ${overrideHtml}
              <button type="button" class="tier-override-select-btn" title="手動上書き設定">⚙️</button>
            </div>
          </div>
        `;

        // Tooltip hover
        chip.addEventListener("mouseenter", (e) => showAutoTierTooltip(e, item));
        chip.addEventListener("mousemove", (e) => positionAutoTierTooltip(e));
        chip.addEventListener("mouseleave", hideAutoTierTooltip);

        // Click on chip: open detail modal or override prompt
        chip.addEventListener("click", (e) => {
          if (e.target.closest(".tier-override-select-btn")) {
            e.stopPropagation();
            promptTierOverride(item);
            return;
          }
          openCastleDetail(c.id);
        });

        contentEl.appendChild(chip);
      });

      board.appendChild(rowEl);
    });
  }

  function getCastleByName(name) {
    if (!name || !window.SCRE_DATA) return null;
    return window.SCRE_DATA.find(c => c.name === name || c.id === name) || null;
  }

  function loadSavedCustomTiers() {
    try {
      const saved = localStorage.getItem("scre_custom_tiers");
      if (saved) {
        customTiersStorage = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load scre_custom_tiers:", e);
    }
  }

  function saveCustomTiersToStorage() {
    try {
      localStorage.setItem("scre_custom_tiers", JSON.stringify(customTiersStorage));
    } catch (e) {
      console.warn("Failed to save scre_custom_tiers:", e);
    }
  }

  // ==========================================
  // D1: おひげ式ティア (Ohige-style Tier View)
  // ==========================================
  const OHIGE_WEIGHTS = {
    // 1. 編成インフラ・巨大化気軽減
    giantKiReduction: 18.0,
    // 2. 計略短縮・気ブースト (置くだけ効果は高め)
    stratCooldownAlly: 18.0,
    stratCooldownSelf: 7.0,
    kiBoost: 15.0,
    kiBoostPassive: 18.0,
    // 3. 状態異常・高難度CC (麻痺は0件。猛毒/火傷/氷結/暗闇/混乱/行動不能/状態異常)
    ailment: 12.0,
    ailmentImmune: 10.0,
    movementSlow: 10.0,
    // 4. 手数: 連撃・複数対象・攻撃速度系の効果
    multiHit: 14.0,
    targetInc: 10.0,
    atkSpeed: 10.0,
    gapShort: 8.0,
    // 5. 防御無視・耐久割合削りなど高難度で効く特性
    defIgnore: 15.0,
    hpPercentCut: 14.0,
    dmgDealtTarget: 12.0,
    // 敵デバフ (攻撃・防御・被ダメ・与ダメ)
    debuffAtk: 8.0,
    debuffDef: 8.0,
    debuffDmgTaken: 8.0,
    debuffDmgDealt: 6.0,
    // 6. 配置自由度: 遠近両対応・複合属性・全マス移動/配置マス変更
    bothRange: 8.0,
    multiAttr: 6.0,
    tileFlexibility: 12.0,
    // 7. トークンの質（気軽減など実用的なものは加点、攻撃のみの軽減トークンは加点しない）
    usefulToken: 12.0,
    // 置くだけ味方支援 (特技で味方/全城娘の攻防上昇等)
    passiveTeamBuff: 10.0,
    // 減点・抑制要素: チャージ・一撃型の単発倍率上限
    chargeCap: 12.0,
    conditionalDiscount: 0.85
  };

  let cachedOhigeScores = null;
  let ohigeTierScope = "weapon"; // "weapon" | "terrain"
  let ohigeTerrainTopCount = 7; // 7 | 10

  function mapToOhigeTier(rawTier) {
    if (!rawTier) return null;
    const t = String(rawTier).trim();
    if (t === "Tier0" || t === "SS") return "Tier0";
    if (t === "Tier1" || t === "S") return "Tier1";
    if (t === "Tier2" || t === "A") return "Tier2";
    if (t === "Tier3" || t === "B" || t === "C" || t === "D") return "Tier3";
    return null;
  }

  function computeOhigeScores(forceRecalculate = false) {
    if (cachedOhigeScores && !forceRecalculate) return cachedOhigeScores;
    if (!window.SCRE_DATA) return [];

    const list = window.SCRE_DATA.map(c => {
      // 兜城娘は評価対象外
      if (c.name.includes("兜") || c.castleType === "兜") {
        return {
          id: c.id,
          name: c.name,
          weapon: c.weapon || "その他",
          castleType: c.castleType || "無",
          attributes: c.attributes || [c.castleType || "無"],
          rangeKind: c.rangeKind || "近",
          rarity: c.rarity,
          ohigeScore: 0,
          isKabuto: true,
          castle: c
        };
      }

      // Latest active abilities (通常特技・計略・特殊能力のみで評価。大破特技は除外)
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

      let rawScore = 0.0;

      // 1. 編成インフラ・巨大化気軽減
      const giantKiMatch = allText.match(/([^。]*?(?:巨大化(?:に必要な)?気を?(?:約)?(\d+)%?軽減|巨大化消費気(?:が|を)?(\d+)%?軽減)[^。]*)/);
      if (giantKiMatch) {
        const val = parseInt(giantKiMatch[2] || giantKiMatch[3] || 25, 10);
        const isTeam = /(?:全て|全城娘|射程内の?城娘|味方)/.test(giantKiMatch[1]) && !/自身のみ|自身(?:の(?:巨大化)?|は)/.test(giantKiMatch[1]);
        rawScore += (isTeam ? OHIGE_WEIGHTS.giantKiReduction : (OHIGE_WEIGHTS.giantKiReduction * 0.55)) * Math.min(1.2, val / 30.0);
      }

      // 2. 計略短縮・気ブーストを他者に与える（マッチ箇所のみの判定に統一）
      const cdMatch = allText.match(/([^。]*?(?:計略再使用\s*(?:時間)?|使用までの時間)[^。]*?(?:が|を|は)?(?:約)?(\d+)%[^。]*?短縮[^。]*)/);
      if (cdMatch) {
        const val = parseInt(cdMatch[2], 10);
        const isTeam = /(?:全て|全城娘|射程内の?城娘|味方)/.test(cdMatch[1]) && !/自身のみ|自身(?:の(?:計略)?|は)/.test(cdMatch[1]);
        const isPassive = skText.includes(cdMatch[0]);
        rawScore += (isTeam ? (isPassive ? OHIGE_WEIGHTS.stratCooldownAlly : (OHIGE_WEIGHTS.stratCooldownAlly * 0.8)) : OHIGE_WEIGHTS.stratCooldownSelf) * Math.min(1.2, val / 35.0);
      }

      if (/(?:気の自然増加量|時間経過で気|気)(?:が)?(?:徐々に)?増加|撃破時に気が(?:約)?(\d+)増加|気を(?:約)?(\d+)回復|気(?:が|を)(?:約)?(\d+)増加/.test(allText)) {
        const isPassive = /気の自然増加量|時間経過で気|撃破時/.test(skText);
        rawScore += isPassive ? OHIGE_WEIGHTS.kiBoostPassive : OHIGE_WEIGHTS.kiBoost;
      }

      // 3. 状態異常の付与 (猛毒|火傷|氷結|暗闇|混乱|行動不能|状態異常)
      if (/猛毒|火傷|氷結|暗闇|混乱|行動不能|状態異常/.test(allText)) {
        rawScore += OHIGE_WEIGHTS.ailment;
      }
      if (/状態異常を(?:全て)?(?:回復し)?無効化/.test(allText)) {
        rawScore += OHIGE_WEIGHTS.ailmentImmune;
      }
      const slowMatch = allText.match(/移動速度(?:が|を)?.*?(\d+)%低下/);
      if (slowMatch) {
        const val = parseInt(slowMatch[1], 10);
        const isPerGiant = /巨大化する度に/.test(allText);
        const mult = isPerGiant ? 5 : 1;
        rawScore += OHIGE_WEIGHTS.movementSlow * Math.min(1.0, (val * mult) / 50.0);
      }

      // 敵デバフ (攻撃・防御・被ダメ・与ダメ)
      const enemyClauses = allText.match(/[^。]*?(?:敵の|敵に|射程内の(?:全)?敵|攻撃した敵|全ての敵|全敵)[^。]*/g) || [];
      let hasAtk = false, hasDef = false, hasDmgTaken = false, hasDmgDealt = false;
      enemyClauses.forEach(cl => {
        if (/攻撃(?:力)?(?:[と、][^低下]*?)?(?:が|を)?(?:\d+%|\d+)?(?:と\d+)?低下/.test(cl)) hasAtk = true;
        if (/防御(?:力)?(?:[と、][^低下]*?)?(?:が|を)?(?:\d+%|\d+)?(?:と\d+)?低下|防御(?:が|を)0/.test(cl)) hasDef = true;
        if (/被ダメージ(?:が)?(?:\d+%|(?:\d+(?:\.\d+)?倍))?上昇/.test(cl)) hasDmgTaken = true;
        if (/与ダメージ(?:が|を)?(?:\d+%|(?:\d+(?:\.\d+)?倍))?低下/.test(cl)) hasDmgDealt = true;
      });
      if (hasAtk) rawScore += OHIGE_WEIGHTS.debuffAtk;
      if (hasDef) rawScore += OHIGE_WEIGHTS.debuffDef;
      if (hasDmgTaken) rawScore += OHIGE_WEIGHTS.debuffDmgTaken;
      if (hasDmgDealt) rawScore += OHIGE_WEIGHTS.debuffDmgDealt;

      // 4. 手数: 連撃・複数対象・攻撃速度系の効果
      const multiHitMatch = allText.match(/(\d+)連続\s*(?:で)?(?:[^。]*?)?攻撃|(\d+)回\s*連続\s*(?:で)?(?:[^。]*?)?攻撃|(\d+)回\s*攻撃を行う|攻撃回数(?:が|を)?(?:約)?(\d+(?:\.\d+)?)倍/);
      if (multiHitMatch) {
        const hits = parseFloat(multiHitMatch[1] || multiHitMatch[2] || multiHitMatch[3] || multiHitMatch[4]);
        rawScore += Math.min(OHIGE_WEIGHTS.multiHit, hits * 3.5);
      } else if (/連続で攻撃|連撃/.test(allText)) {
        rawScore += OHIGE_WEIGHTS.multiHit * 0.6;
      }

      const targetIncMatch = allText.match(/攻撃対象(?:が)?(\d+)増加/);
      if (targetIncMatch) {
        rawScore += Math.min(OHIGE_WEIGHTS.targetInc, parseInt(targetIncMatch[1], 10) * 5.0);
      }
      if (/射程内の(?:全敵|全ての敵|すべての敵)(?:に|へ)?(?:対して)?(?:[^。]*?)?(?:攻撃|ダメージ)|全敵に(?:攻撃|ダメージ)|全敵を攻撃/.test(allText)) {
        rawScore += OHIGE_WEIGHTS.targetInc;
      }

      const atkSpeedMultMatch = allText.match(/(?:攻撃と)?攻撃速度(?:が|を)?(?:約)?(\d+(?:\.\d+)?)倍/);
      if (atkSpeedMultMatch) {
        rawScore += OHIGE_WEIGHTS.atkSpeed;
      } else if (/(?:攻撃と)?攻撃速度(?:が|を)?(?:約)?[^。低下]*?(?:\d+%)?(?:ずつ)?上昇|攻撃速度(?:が)?([\d\.]+)倍/.test(allText)) {
        rawScore += OHIGE_WEIGHTS.atkSpeed;
      }

      if (/攻撃後の隙(?:が)?(?:約)?(\d+)%短縮/.test(allText)) {
        rawScore += OHIGE_WEIGHTS.gapShort;
      }

      // 5. 防御無視・耐久割合削りなど高難度で効く特性
      if (/防御を?無視/.test(allText)) rawScore += OHIGE_WEIGHTS.defIgnore;
      if (!/(?:自身|対象)が(?:最大|現在)?耐久の(?:\d+)%の値のダメージを受ける/.test(allText) &&
          /現在耐久の(?:\d+)%|耐久が低い程.*?与えるダメージ|最大耐久の(?:\d+)%|割合(?:ダメージ|削り)/.test(allText)) {
        rawScore += OHIGE_WEIGHTS.hpPercentCut;
      }

      // 〜程与えるダメージ上昇（最大N倍）
      const scalingDmgMatch = allText.match(/[^。]*?程(?:与える)?ダメージ(?:が)?上昇(?:\(最大(?:約)?(\d+(?:\.\d+)?倍|\d+%)\))?[^。]*/);
      if (scalingDmgMatch) {
        const multMatch = scalingDmgMatch[0].match(/最大(?:約)?(\d+(?:\.\d+)?倍|\d+%)/);
        let multVal = 1.5;
        if (multMatch) {
          if (multMatch[1].endsWith("倍")) multVal = parseFloat(multMatch[1]);
          else if (multMatch[1].endsWith("%")) multVal = 1.0 + parseInt(multMatch[1], 10) / 100.0;
        }
        rawScore += Math.min(OHIGE_WEIGHTS.dmgDealtTarget, (multVal - 1.0) * 12.0);
      }

      // 与ダメ・与えるダメージ倍率
      const multMatches = allText.matchAll(/(?:(?:自身|自分|標的|対象|敵|特殊能力中|計略(?:中|使用時(?:に)?))[^。]*?与えるダメージ|特殊攻撃(?:で|の|時|時の範囲攻撃で)?(?:与える)?ダメージ|与ダメージ)(?:が|は)?(?:約)?([\d\.]+)倍/g);
      for (const mm of multMatches) {
        const m = parseFloat(mm[1]);
        if (m > 1.0) rawScore += Math.min(OHIGE_WEIGHTS.dmgDealtTarget, (m - 1.0) * 10.0);
      }

      // 6. 配置自由度: 遠近両対応・複合属性・全マス移動/配置マス変更
      if (c.rangeKind === "遠近") rawScore += OHIGE_WEIGHTS.bothRange;
      if (c.attributes && c.attributes.length >= 2) rawScore += OHIGE_WEIGHTS.multiAttr;
      if (/全マス移動可能|配置(?:場所|マス)(?:を|の)?.*?に変更|全マス(?:に)?配置可能/.test(allText)) {
        rawScore += OHIGE_WEIGHTS.tileFlexibility;
      }

      // 7. トークンの質（気軽減など実用的なものは加点、攻撃のみの軽減トークンは加点しない）
      const hasToken = /伏兵/.test(allText);
      if (hasToken) {
        if (/気|自然増加|再使用|巨大化|足止め|軽減|回復|無効化/.test(allText)) {
          rawScore += OHIGE_WEIGHTS.usefulToken;
        }
      }

      // 置くだけ味方支援 (特技で味方/全城娘の攻防上昇等。特殊能力中などの限定発動は除く)
      const passiveTeamClause = skText.replace(/特殊能力中[^。]*?(?:。|$)/g, "");
      if (/(?:射程内の?城娘|全ての?城娘|全味方|味方).*?(?:攻撃|防御|与ダメージ).*?上昇/.test(passiveTeamClause)) {
        rawScore += OHIGE_WEIGHTS.passiveTeamBuff;
      }

      // 減点・抑制要素: チャージ・一撃型の単発倍率上限
      const isCharge = /溜め|チャージ|一撃|単発/.test(allText);
      const rawMultMatch = allText.match(/(?:攻撃(?:の|が)?|攻撃と(?:攻撃速度|与ダメージ)が)([\d\.]+)倍/);
      if (rawMultMatch) {
        const m = parseFloat(rawMultMatch[1]);
        const pts = (m - 1.0) * 5.0;
        rawScore += isCharge ? Math.min(OHIGE_WEIGHTS.chargeCap * 0.5, pts) : Math.min(OHIGE_WEIGHTS.chargeCap, pts);
      }

      // 条件が極端に限定的な効果（特定の敵種・特定マップ前提）は割引
      if (/妖怪に対して|飛行敵に対して|水上|水マス/.test(allText)) {
        rawScore *= OHIGE_WEIGHTS.conditionalDiscount;
      }

      // レアリティ加味
      rawScore += (c.rarity || 5) * 2.0;

      const finalScore = Math.round(rawScore * 10) / 10;
      return {
        id: c.id,
        name: c.name,
        weapon: c.weapon || "その他",
        castleType: c.castleType || "無",
        attributes: c.attributes || [c.castleType || "無"],
        rangeKind: c.rangeKind || "近",
        rarity: c.rarity,
        ohigeScore: finalScore,
        isKabuto: false,
        castle: c
      };
    });

    // 武器種内相対評価 & 順位
    const weaponGroups = {};
    list.forEach(item => {
      if (item.isKabuto) return;
      const w = item.weapon;
      if (!weaponGroups[w]) weaponGroups[w] = [];
      weaponGroups[w].push(item);
    });

    Object.keys(weaponGroups).forEach(w => {
      const g = weaponGroups[w];
      g.sort((a, b) => b.ohigeScore - a.ohigeScore);
      const n = g.length;
      g.forEach((item, idx) => {
        item.weaponRank = idx + 1;
        item.weaponTotal = n;

        // Tier0〜Tier3 thresholds
        let t = "選外";
        if (idx === 0 && item.ohigeScore >= 55) {
          t = "Tier0";
        } else if (idx < Math.max(1, Math.floor(n * 0.04)) && item.ohigeScore >= 55) {
          t = "Tier0";
        } else if (idx < Math.max(2, Math.floor(n * 0.14)) && item.ohigeScore >= 46) {
          t = "Tier1";
        } else if (idx < Math.max(4, Math.floor(n * 0.30)) && item.ohigeScore >= 36) {
          t = "Tier2";
        } else if (idx < Math.max(6, Math.floor(n * 0.52)) && item.ohigeScore >= 26) {
          t = "Tier3";
        }
        item.ohigeWeaponTier = t;
      });
    });

    // 属性内相対評価 & 順位
    const TERRAINS = ["平", "山", "平山", "水", "地獄", "無"];
    const terrainGroups = {};
    TERRAINS.forEach(t => terrainGroups[t] = []);

    list.forEach(item => {
      if (item.isKabuto) return;
      TERRAINS.forEach(t => {
        const attrs = item.attributes || [item.castleType || ""];
        if (attrs.includes(t)) {
          terrainGroups[t].push(item);
        }
      });
    });

    TERRAINS.forEach(t => {
      const g = terrainGroups[t];
      g.sort((a, b) => b.ohigeScore - a.ohigeScore);
      g.forEach((item, idx) => {
        if (!item.terrainRanks) item.terrainRanks = {};
        item.terrainRanks[t] = { rank: idx + 1, total: g.length };
      });
    });

    cachedOhigeScores = list;
    return cachedOhigeScores;
  }

  function promptOhigeTierOverride(item) {
    loadTierOverrides();
    const current = tierOverrides[item.id] || tierOverrides[item.name] || item.effectiveTier || item.ohigeWeaponTier;
    const val = prompt(`【${item.name}】のおひげ式ティア手動上書き\n(Tier0〜Tier3 または SS/S/A/B/C/D を入力。解除は空欄または「解除」)`, current || "Tier1");
    if (val === null) return;
    const trimmed = val.trim();
    if (trimmed === "" || trimmed === "解除") {
      delete tierOverrides[item.id];
      delete tierOverrides[item.name];
      saveTierOverrides();
      renderTierOhige();
      showToast(`「${item.name}」の手動上書きを解除しました`);
    } else if (["Tier0", "Tier1", "Tier2", "Tier3", "SS", "S", "A", "B", "C", "D"].includes(trimmed)) {
      let normalized = trimmed;
      if (trimmed === "SS") normalized = "Tier0";
      else if (trimmed === "S") normalized = "Tier1";
      else if (trimmed === "A") normalized = "Tier2";
      else if (trimmed === "B" || trimmed === "C" || trimmed === "D") normalized = "Tier3";
      tierOverrides[item.id] = normalized;
      saveTierOverrides();
      renderTierOhige();
      showToast(`「${item.name}」のティアを ${normalized} に手動設定しました`);
    } else {
      alert("ティアは Tier0〜Tier3 または SS/S/A/B/C/D のいずれかで入力してください。");
    }
  }

  function createOhigeChip(item, rankBadgeText) {
    const c = item.castle;
    const chip = document.createElement("div");
    chip.className = "tier-auto-chip tier-ohige-chip" + (item.isOverridden ? " is-overridden" : "");
    chip.setAttribute("data-castle-id", c.id);
    chip.setAttribute("data-castle-name", c.name);

    const avatar = document.createElement("img");
    avatar.className = "tier-ohige-chip-avatar";
    avatar.alt = c.name;
    avatar.loading = "lazy";
    avatar.src = c.illustUrl || c.ojouUrl || "";
    avatar.onerror = () => {
      avatar.style.display = "none";
    };

    const body = document.createElement("div");
    body.className = "tier-ohige-chip-body";

    const top = document.createElement("div");
    top.className = "tier-ohige-chip-top";

    if (rankBadgeText) {
      const rankTag = document.createElement("span");
      rankTag.className = "tier-ohige-rank-tag";
      rankTag.textContent = rankBadgeText;
      top.appendChild(rankTag);
    }

    const nameEl = document.createElement("span");
    nameEl.className = "tier-ohige-chip-name";
    nameEl.textContent = (item.isOverridden ? "✏️ " : "") + c.name;
    nameEl.title = c.name + (item.isOverridden ? ` (手動上書き: ${item.effectiveTier})` : "");
    top.appendChild(nameEl);

    const sub = document.createElement("div");
    sub.className = "tier-ohige-chip-sub";

    const raritySpan = document.createElement("span");
    raritySpan.className = `tier-ohige-badge badge-rarity-${c.rarity || 5}`;
    raritySpan.textContent = `★${c.rarity || 5}`;
    sub.appendChild(raritySpan);

    const typeSpan = document.createElement("span");
    typeSpan.className = `tier-ohige-badge badge-attr-${c.castleType || "plain"}`;
    typeSpan.textContent = (c.attributes && c.attributes.length > 1) ? c.attributes.join("/") : (c.castleType || "無");
    sub.appendChild(typeSpan);

    const weaponSpan = document.createElement("span");
    weaponSpan.className = "tier-ohige-badge badge-weapon";
    weaponSpan.textContent = c.weapon || "その他";
    sub.appendChild(weaponSpan);

    const scoreSpan = document.createElement("span");
    scoreSpan.className = "tier-ohige-score-tag";
    scoreSpan.textContent = `${item.ohigeScore}pt`;
    sub.appendChild(scoreSpan);

    body.appendChild(top);
    body.appendChild(sub);

    chip.appendChild(avatar);
    chip.appendChild(body);

    chip.addEventListener("click", (e) => {
      if (e.shiftKey) {
        promptOhigeTierOverride(item);
      } else {
        openCastleDetail(c.id);
      }
    });

    chip.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      promptOhigeTierOverride(item);
    });

    return chip;
  }

  function renderTierOhige() {
    const board = document.getElementById("tierOhigeBoard");
    if (!board) return;

    loadTierOverrides();
    const allScores = computeOhigeScores();

    const overrideCount = Object.keys(tierOverrides).length;
    const countBadge = document.getElementById("tierOhigeOverrideCount");
    if (countBadge) countBadge.textContent = `(${overrideCount})`;

    const filterWeapon = (document.getElementById("tierOhigeFilterWeapon")?.value || "").trim();
    const filterTerrain = (document.getElementById("tierOhigeFilterTerrain")?.value || "").trim();
    const filterRangeKind = (document.getElementById("tierOhigeFilterRangeKind")?.value || "").trim();
    const filterOwnership = (document.getElementById("tierOhigeFilterOwnership")?.value || "").trim();
    const filterSearch = (document.getElementById("tierOhigeSearchInput")?.value || "").trim().toLowerCase();

    const isMatchFilter = (item) => {
      if (item.isKabuto) return false;
      const c = item.castle;
      if (filterWeapon && c.weapon !== filterWeapon) return false;
      if (filterTerrain) {
        const attrs = c.attributes || [c.castleType || ""];
        if (!attrs.includes(filterTerrain) && c.castleType !== filterTerrain) return false;
      }
      if (filterRangeKind && c.rangeKind !== filterRangeKind) return false;
      if (filterOwnership === "owned" && (!ownership.owned || !ownership.owned[c.id])) return false;
      if (filterOwnership === "unowned" && (ownership.owned && ownership.owned[c.id])) return false;
      if (filterOwnership === "favorites" && (!ownership.favorites || !ownership.favorites[c.id])) return false;
      if (filterSearch && !matchCastleNameOrRuby(c, filterSearch)) return false;
      return true;
    };

    board.innerHTML = "";

    if (ohigeTierScope === "weapon") {
      const WEAPON_TYPES = [
        "刀", "双剣", "槍", "槌", "戦棍", "大砲", "弓", "石弓", "鉄砲", "法術",
        "杖", "歌舞", "鈴", "本", "祓串", "投剣", "鞭", "茶器", "盾", "拳",
        "ランス", "鎌", "軍船", "陣貝", "その他"
      ];

      const targetWeapons = filterWeapon ? [filterWeapon] : WEAPON_TYPES;

      const TIER_DEFS = [
        { key: "Tier0", label: "Tier0", sub: "殿堂入り", cls: "tier-ohige-t0" },
        { key: "Tier1", label: "Tier1", sub: "ぶっ壊れ", cls: "tier-ohige-t1" },
        { key: "Tier2", label: "Tier2", sub: "壊れ", cls: "tier-ohige-t2" },
        { key: "Tier3", label: "Tier3", sub: "ワンポイント", cls: "tier-ohige-t3" }
      ];

      targetWeapons.forEach(w => {
        const weaponCastles = allScores.filter(it => it.weapon === w && isMatchFilter(it));
        if (weaponCastles.length === 0 && filterWeapon) {
          board.innerHTML = `<div style="padding:20px; text-align:center; color:#888; font-size:12px;">該当する城娘がいません</div>`;
          return;
        }
        if (weaponCastles.length === 0) return;

        const groups = { Tier0: [], Tier1: [], Tier2: [], Tier3: [], 選外: [] };
        weaponCastles.forEach(item => {
          const rawOverride = tierOverrides[item.id] || tierOverrides[item.name];
          const mappedOverride = mapToOhigeTier(rawOverride);
          const effTier = mappedOverride || item.ohigeWeaponTier || "選外";
          if (groups[effTier]) {
            groups[effTier].push({ ...item, isOverridden: Boolean(mappedOverride), effectiveTier: effTier });
          } else {
            groups["選外"].push({ ...item, isOverridden: Boolean(mappedOverride), effectiveTier: "選外" });
          }
        });

        if (!filterWeapon) {
          const secHeader = document.createElement("div");
          secHeader.className = "tier-ohige-section-header";
          secHeader.innerHTML = `<span>⚔️ 【${escapeHtml(w)}】 (全${weaponCastles.length}体)</span>`;
          board.appendChild(secHeader);
        }

        TIER_DEFS.forEach(tDef => {
          const row = document.createElement("div");
          row.className = "tier-row tier-ohige-row";
          row.setAttribute("data-tier", tDef.key);

          const rowHeader = document.createElement("div");
          rowHeader.className = `tier-row-label-col tier-ohige-row-header ${tDef.cls}`;
          const count = groups[tDef.key] ? groups[tDef.key].length : 0;
          rowHeader.innerHTML = `
            <div class="tier-row-letter tier-ohige-letter">${tDef.label}</div>
            <div class="tier-row-sub tier-ohige-sub">${tDef.sub}</div>
            <div class="tier-ohige-count">(${count}体)</div>
          `;
          row.appendChild(rowHeader);

          const content = document.createElement("div");
          content.className = "tier-row-content tier-ohige-content";
          const items = groups[tDef.key] || [];
          if (items.length === 0) {
            content.classList.add("empty");
            content.textContent = "該当者なし";
          } else {
            items.forEach(item => {
              const chip = createOhigeChip(item, item.weaponRank ? `#${item.weaponRank}` : null);
              content.appendChild(chip);
            });
          }
          row.appendChild(content);
          board.appendChild(row);
        });
      });
    } else {
      const TERRAINS = ["平", "山", "平山", "水", "地獄", "無"];
      const targetTerrains = filterTerrain ? [filterTerrain] : TERRAINS;
      const topLimit = ohigeTerrainTopCount || 7;
      const limitLabel = (topLimit === 7) ? "神セブン" : "TOP10";

      const TERRAIN_ICONS = {
        "平": "🌾", "山": "⛰️", "平山": "🏯", "水": "🌊", "地獄": "🌋", "無": "⚪"
      };

      targetTerrains.forEach(t => {
        const terrainCastles = allScores.filter(it => {
          const attrs = it.attributes || [it.castleType || ""];
          return attrs.includes(t) && isMatchFilter(it);
        });

        if (terrainCastles.length === 0 && filterTerrain) {
          board.innerHTML = `<div style="padding:20px; text-align:center; color:#888; font-size:12px;">該当する城娘がいません</div>`;
          return;
        }
        if (terrainCastles.length === 0) return;

        terrainCastles.sort((a, b) => b.ohigeScore - a.ohigeScore);
        const topCastles = terrainCastles.slice(0, topLimit);

        const secHeader = document.createElement("div");
        secHeader.className = "tier-ohige-section-header";
        const icon = TERRAIN_ICONS[t] || "🏯";
        secHeader.innerHTML = `
          <span>${icon} 【${escapeHtml(t)}属性】 ${limitLabel} (全${terrainCastles.length}体中 上位${topCastles.length}体)</span>
          <span style="font-size:12px; color:var(--text-sub); font-weight:normal;">基準: おひげ式スコア順</span>
        `;
        board.appendChild(secHeader);

        const row = document.createElement("div");
        row.className = "tier-row tier-ohige-row";
        row.setAttribute("data-terrain", t);

        const rowHeader = document.createElement("div");
        rowHeader.className = "tier-row-label-col tier-ohige-row-header tier-ohige-t0";
        rowHeader.innerHTML = `
          <div class="tier-row-letter tier-ohige-letter">${icon} ${escapeHtml(t)}</div>
          <div class="tier-row-sub tier-ohige-sub">${limitLabel}</div>
          <div class="tier-ohige-count">(${topCastles.length}体)</div>
        `;
        row.appendChild(rowHeader);

        const content = document.createElement("div");
        content.className = "tier-row-content tier-ohige-content";
        topCastles.forEach((item, idx) => {
          const rawOverride = tierOverrides[item.id] || tierOverrides[item.name];
          const mappedOverride = mapToOhigeTier(rawOverride);
          const itemWithOverride = { ...item, isOverridden: Boolean(mappedOverride), effectiveTier: mappedOverride || item.ohigeWeaponTier };
          const rankLabel = `${idx + 1}位`;
          const chip = createOhigeChip(itemWithOverride, rankLabel);
          content.appendChild(chip);
        });
        row.appendChild(content);
        board.appendChild(row);
      });
    }
  }

  function renderTierTab() {
    loadSavedCustomTiers();
    loadTierWeights();
    loadTierOverrides();

    const btnAuto = document.getElementById("btnTierModeAuto");
    const btnOhige = document.getElementById("btnTierModeOhige");
    const btnCurated = document.getElementById("btnTierModeCurated");
    const btnCustom = document.getElementById("btnTierModeCustom");
    const btnSplit = document.getElementById("btnTierModeSplit");
    const viewAuto = document.getElementById("tierViewAuto");
    const viewOhige = document.getElementById("tierViewOhige");
    const viewCurated = document.getElementById("tierViewCurated");
    const viewCustom = document.getElementById("tierViewCustom");
    const viewSplit = document.getElementById("tierViewSplit");

    if (btnAuto) btnAuto.classList.toggle("active", currentTierMode === "auto");
    if (btnOhige) btnOhige.classList.toggle("active", currentTierMode === "ohige");
    if (btnCurated) btnCurated.classList.toggle("active", currentTierMode === "curated");
    if (btnCustom) btnCustom.classList.toggle("active", currentTierMode === "custom");
    if (btnSplit) btnSplit.classList.toggle("active", currentTierMode === "split");

    if (currentTierMode === "split") {
      if (viewSplit) viewSplit.style.display = "block";
      if (typeof renderTierViewSplit === "function") renderTierViewSplit();
    } else if (currentTierMode === "auto") {
      if (viewAuto) viewAuto.style.display = "block";
      if (viewOhige) viewOhige.style.display = "none";
      if (viewCurated) viewCurated.style.display = "none";
      if (viewCustom) viewCustom.style.display = "none";
      renderTierAuto();
    } else if (currentTierMode === "ohige") {
      if (viewAuto) viewAuto.style.display = "none";
      if (viewOhige) viewOhige.style.display = "block";
      if (viewCurated) viewCurated.style.display = "none";
      if (viewCustom) viewCustom.style.display = "none";
      renderTierOhige();
    } else if (currentTierMode === "curated") {
      if (viewAuto) viewAuto.style.display = "none";
      if (viewOhige) viewOhige.style.display = "none";
      if (viewCurated) viewCurated.style.display = "block";
      if (viewCustom) viewCustom.style.display = "none";
      renderTierCurated();
    } else {
      if (viewAuto) viewAuto.style.display = "none";
      if (viewOhige) viewOhige.style.display = "none";
      if (viewCurated) viewCurated.style.display = "none";
      if (viewCustom) viewCustom.style.display = "block";
      renderTierCustomMaker(true);
    }
  }

  function renderTierCurated() {
    if (!window.SCRE_TIERS) return;
    const catData = window.SCRE_TIERS[currentCuratedCat] || window.SCRE_TIERS["overall"];
    if (!catData) return;

    // Update info header
    const infoEl = document.getElementById("tierCuratedInfo");
    if (infoEl) {
      infoEl.innerHTML = `<strong>${catData.title}</strong> ｜ ${catData.description}`;
    }

    // Update active category pill
    document.querySelectorAll("#tierCatPills .tier-pill-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-cat") === currentCuratedCat);
    });

    const board = document.getElementById("tierCuratedBoard");
    if (!board) return;
    board.innerHTML = "";

    catData.rows.forEach(r => {
      const rowEl = document.createElement("div");
      rowEl.className = "tier-row";

      // Label column
      const labelCol = document.createElement("div");
      labelCol.className = "tier-row-label-col";
      labelCol.style.background = r.color || "#b33939";
      labelCol.innerHTML = `
        <div class="tier-row-letter">${r.tier}</div>
        <div class="tier-row-sub">${r.label}</div>
      `;

      // Content column
      const contentCol = document.createElement("div");
      contentCol.className = "tier-row-content";

      r.castles.forEach(item => {
        const c = getCastleByName(item.name);
        if (!c) return;

        const inParty = party.some(p => p && p.id === c.id);
        const cardEl = document.createElement("div");
        cardEl.className = "tier-castle-card";

        const fallbackSrc = `icons/${encodeURIComponent(c.name)}.png`;
    const noImgPlaceholder = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400' viewBox='0 0 300 400'><rect width='100%' height='100%' fill='%232d3748'/><text x='50%' y='50%' fill='%23a0aec0' font-size='16' font-family='sans-serif' text-anchor='middle' dominant-baseline='middle'>画像なし</text></svg>";
        const iconSrc = c.illustUrl ? c.illustUrl : fallbackSrc;

        cardEl.innerHTML = `
          <div class="tier-card-icon-col" data-action="detail" data-id="${c.id}" title="クリックで詳細・立ち絵を表示">
            <img src="${iconSrc}" onerror="this.src='${fallbackSrc}'" style="width:100%; height:100%; object-fit:cover; border-radius:4px; border:1px solid #dcd5cb;" alt="${c.name}">
          </div>
          <div class="tier-card-info-col">
            <div class="tier-card-header">
              <span class="tier-card-title" data-action="detail" data-id="${c.id}" title="クリックで詳細表示">${c.name}</span>
              <span class="badge badge-rarity badge-rarity-${c.rarity}" style="font-size:10px;">★${c.rarity}</span>
              ${getAttrBadgeHtml(c)}
              <span class="badge badge-weapon" style="background:#555;color:#fff;font-size:10px;">${c.weapon}</span>
            </div>
            ${item.tag ? `<div class="tier-card-tag">${item.tag}</div>` : ''}
            <div class="tier-card-actions">
              <button class="btn btn-sm tier-btn-xs" data-action="detail" data-id="${c.id}" style="font-size:10px; padding:2px 7px;">詳細 ↗</button>
              <button class="btn btn-sm ${inParty ? 'btn-secondary' : 'btn-primary'} tier-btn-xs" data-action="add-party" data-id="${c.id}" ${inParty ? 'disabled' : (party.filter(Boolean).length >= 8 ? 'disabled' : '')} style="font-size:10px; padding:2px 7px;">
                ${inParty ? '✓ 編成中' : (party.filter(Boolean).length >= 8 ? '満員' : '+ 編成')}
              </button>
            </div>
          </div>
        `;

        cardEl.addEventListener("click", e => {
          const detailBtn = e.target.closest('[data-action="detail"]');
          if (detailBtn) {
            openCastleDetail(c.id);
            return;
          }
          const addBtn = e.target.closest('[data-action="add-party"]');
          if (addBtn) {
            if (party.filter(Boolean).length >= 8) {
              showToast("部隊が満員です（最大8体）");
              return;
            }
            if (!party.some(p => p && p.id === c.id)) {
              const newMember = { id: c.id, strategyOn: true, specialOn: !!c.special, giantStep: 5 };
              const emptyIdx = party.findIndex(p => !p);
              if (emptyIdx !== -1) {
                party[emptyIdx] = newMember;
              } else {
                party.push(newMember);
              }
              saveParty();
              renderDashboard();
              renderTierCurated();
              showToast(`「${c.name}」を編成に追加しました！`);
            }
          }
        });

        contentCol.appendChild(cardEl);
      });

      rowEl.appendChild(labelCol);
      rowEl.appendChild(contentCol);
      board.appendChild(rowEl);
    });
  }

  let tierPoolBatchSize = 160;
  let tierPoolVisibleCount = 160;
  let cachedFilteredTierPool = [];

  function updateTierPoolPlacedStates() {
    const grid = document.getElementById("tierPoolGrid");
    if (!grid) return;
    const placedSet = new Set(customTierRows.flatMap(r => r.castles));
    grid.querySelectorAll(".tier-pool-item").forEach(itemEl => {
      const name = itemEl.getAttribute("data-name");
      itemEl.classList.toggle("is-placed", placedSet.has(name));
    });
  }

  function renderCustomTierRows() {
    const board = document.getElementById("tierCustomBoard");
    if (!board) return;
    board.innerHTML = "";

    customTierRows.forEach((row, rowIdx) => {
      const rowEl = document.createElement("div");
      rowEl.className = "tier-row";

      // Label column
      const labelCol = document.createElement("div");
      labelCol.className = "tier-row-label-col";
      labelCol.style.background = row.color || "#b33939";

      labelCol.innerHTML = `
        <div class="tier-row-letter" title="クリックして行の名前を変更"></div>
        <div class="tier-row-sub" title="クリックしてサブテキストを変更"></div>
        <div class="tier-row-controls">
          <button type="button" class="tier-row-ctrl-btn" data-action="up" title="上へ移動">▲</button>
          <button type="button" class="tier-row-ctrl-btn" data-action="down" title="下へ移動">▼</button>
          <button type="button" class="tier-row-ctrl-btn" data-action="color" title="色を変更">🎨</button>
          <button type="button" class="tier-row-ctrl-btn" data-action="clear" title="この行のキャラをクリア">🗑️</button>
          <button type="button" class="tier-row-ctrl-btn" data-action="del" title="行を削除">✖</button>
        </div>
      `;
      const letterNode = labelCol.querySelector(".tier-row-letter");
      const subNode = labelCol.querySelector(".tier-row-sub");
      if (letterNode) letterNode.textContent = row.letter;
      if (subNode) subNode.textContent = row.sub || "";

      // Label events
      labelCol.querySelector(".tier-row-letter").addEventListener("click", () => {
        const newLetter = prompt("ティア名を入力してください（例: EX, S+, 神）", row.letter);
        if (newLetter && newLetter.trim()) {
          row.letter = newLetter.trim();
          renderCustomTierRows();
        }
      });

      labelCol.querySelector(".tier-row-sub").addEventListener("click", () => {
        const newSub = prompt("サブテキストを入力してください（例: 最優先, 気役, 推し）", row.sub || "");
        if (newSub !== null) {
          row.sub = newSub.trim();
          renderCustomTierRows();
        }
      });

      labelCol.querySelector('[data-action="up"]').addEventListener("click", () => {
        if (rowIdx > 0) {
          const temp = customTierRows[rowIdx];
          customTierRows[rowIdx] = customTierRows[rowIdx - 1];
          customTierRows[rowIdx - 1] = temp;
          renderCustomTierRows();
        }
      });

      labelCol.querySelector('[data-action="down"]').addEventListener("click", () => {
        if (rowIdx < customTierRows.length - 1) {
          const temp = customTierRows[rowIdx];
          customTierRows[rowIdx] = customTierRows[rowIdx + 1];
          customTierRows[rowIdx + 1] = temp;
          renderCustomTierRows();
        }
      });

      labelCol.querySelector('[data-action="color"]').addEventListener("click", () => {
        const curIdx = DEFAULT_ROW_COLORS.indexOf(row.color);
        const nextColor = DEFAULT_ROW_COLORS[(curIdx + 1) % DEFAULT_ROW_COLORS.length];
        row.color = nextColor;
        renderCustomTierRows();
      });

      labelCol.querySelector('[data-action="clear"]').addEventListener("click", () => {
        if (confirm(`「${row.letter}」の全城娘（${row.castles.length}体）をクリアしますか？`)) {
          row.castles = [];
          renderCustomTierRows();
          updateTierPoolPlacedStates();
        }
      });

      labelCol.querySelector('[data-action="del"]').addEventListener("click", () => {
        if (customTierRows.length <= 1) {
          showToast("⚠️ 最低1つの行が必要です");
          return;
        }
        if (confirm(`行「${row.letter}」を削除しますか？`)) {
          customTierRows.splice(rowIdx, 1);
          renderCustomTierRows();
          updateTierPoolPlacedStates();
        }
      });

      // Content column (placed castles)
      const contentCol = document.createElement("div");
      contentCol.className = `tier-row-content ${row.castles.length === 0 ? 'empty' : ''}`;
      contentCol.setAttribute("data-row-id", row.id);

      if (row.castles.length === 0) {
        contentCol.textContent = "城娘をドラッグ＆ドロップ、または下のプールからクリックで追加";
      } else {
        row.castles.forEach((cName, cIdx) => {
          const c = getCastleByName(cName);
          if (!c) return;

          const chip = document.createElement("div");
          chip.className = "tier-castle-card";
          chip.setAttribute("draggable", "true");
          chip.setAttribute("data-name", c.name);
          chip.setAttribute("data-row-id", row.id);
          chip.title = `${c.name} (★${c.rarity} ${c.castleType || ''} ${c.weapon})
ドラッグで移動、×で削除、クリックで詳細`;

          chip.innerHTML = `
            ${getIconHtml(c, 36)}
            <div class="tier-chip-info">
              <div class="tier-chip-name">${escapeHtml(c.name)}</div>
              <div class="tier-chip-sub">★${c.rarity} ${escapeHtml(c.weapon)}</div>
            </div>
            <button type="button" class="tier-chip-del" title="削除">×</button>
          `;

          // Drag events on chip
          chip.addEventListener("dragstart", e => {
            draggedCastleName = c.name;
            draggedSourceRowId = row.id;
            chip.classList.add("dragging");
            e.dataTransfer.setData("text/plain", c.name);
          });

          chip.addEventListener("dragend", () => {
            chip.classList.remove("dragging");
            draggedCastleName = null;
            draggedSourceRowId = null;
          });

          // Delete chip
          chip.querySelector(".tier-chip-del").addEventListener("click", e => {
            e.stopPropagation();
            row.castles.splice(cIdx, 1);
            renderCustomTierRows();
            updateTierPoolPlacedStates();
          });

          // Click chip to view detail
          chip.addEventListener("click", e => {
            if (e.target.classList.contains("tier-chip-del")) return;
            openCastleDetail(c.id);
          });

          contentCol.appendChild(chip);
        });
      }

      // Drag & drop listeners on row content
      contentCol.addEventListener("dragover", e => {
        e.preventDefault();
        contentCol.classList.add("drag-over");
      });

      contentCol.addEventListener("dragleave", () => {
        contentCol.classList.remove("drag-over");
      });

      contentCol.addEventListener("drop", e => {
        e.preventDefault();
        contentCol.classList.remove("drag-over");
        const name = e.dataTransfer.getData("text/plain") || draggedCastleName;
        if (!name) return;

        // If from another row, remove it first
        if (draggedSourceRowId) {
          const srcRow = customTierRows.find(r => r.id === draggedSourceRowId);
          if (srcRow) {
            const idx = srcRow.castles.indexOf(name);
            if (idx !== -1) srcRow.castles.splice(idx, 1);
          }
        }

        // Add to this row if not already in it
        if (!row.castles.includes(name)) {
          row.castles.push(name);
        }

        draggedCastleName = null;
        draggedSourceRowId = null;
        renderCustomTierRows();
        updateTierPoolPlacedStates();
      });

      rowEl.appendChild(labelCol);
      rowEl.appendChild(contentCol);
      board.appendChild(rowEl);
    });

    // Update target select dropdown (escaped)
    const targetSel = document.getElementById("tierPoolTargetSelect");
    if (targetSel) {
      targetSel.innerHTML = customTierRows.map(r => `
        <option value="${escapeHtml(r.id)}">${escapeHtml(r.letter)} (${escapeHtml(r.sub || '行')})</option>
      `).join("");
    }

    // Update saved tiers dropdown (escaped)
    const savedSel = document.getElementById("savedTiersSelect");
    if (savedSel) {
      const savedKeys = Object.keys(customTiersStorage);
      savedSel.innerHTML = `<option value="">-- 保存済みティア (${savedKeys.length}件) --</option>` +
        savedKeys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("");
    }
  }

  function renderTierCustomMaker(rebuildPool = false) {
    renderCustomTierRows();
    if (rebuildPool) {
      renderTierPool(true);
    } else {
      updateTierPoolPlacedStates();
    }
  }

  function renderTierPool(resetCount = true) {
    const grid = document.getElementById("tierPoolGrid");
    if (!grid || !window.SCRE_DATA) return;

    if (resetCount) {
      tierPoolVisibleCount = tierPoolBatchSize;
    }

    const searchVal = document.getElementById("tierPoolSearch")?.value?.trim() || "";
    const filterRarity = document.getElementById("tierPoolRarity")?.value || "";
    const filterType = document.getElementById("tierPoolType")?.value || "";
    const filterWeapon = document.getElementById("tierPoolWeapon")?.value || "";
    const filterOwnership = document.getElementById("tierPoolOwnership")?.value || "";

    const placedSet = new Set(customTierRows.flatMap(r => r.castles));

    const filtered = window.SCRE_DATA.filter(c => {
      if (searchVal && !matchCastleNameOrRuby(c, searchVal)) return false;
      if (filterRarity) {
        if (filterRarity === "7" && c.rarity !== 7) return false;
        if (filterRarity === "6" && c.rarity < 6) return false;
        if (filterRarity === "5" && c.rarity < 5) return false;
      }
      if (filterType && !(c.castleType || "").includes(filterType) && !(c.subType || "").includes(filterType)) return false;
      if (filterWeapon && c.weapon !== filterWeapon) return false;
      if (filterOwnership === "owned" && !ownership.owned.has(c.id)) return false;
      if (filterOwnership === "fav" && !ownership.favorites.has(c.id)) return false;
      return true;
    });
    cachedFilteredTierPool = filtered;

    const currentVisible = Math.min(filtered.length, tierPoolVisibleCount);
    const countEl = document.getElementById("tierPoolCount");
    if (countEl) countEl.textContent = `(全${filtered.length}体中 ${currentVisible}体を表示中)`;

    grid.innerHTML = "";
    if (filtered.length === 0) {
      grid.innerHTML = `<div style="font-size:11.5px;color:var(--text-sub);padding:12px;grid-column:1/-1;">条件に一致する城娘がいません</div>`;
      return;
    }

    const displayItems = filtered.slice(0, tierPoolVisibleCount);
    const noImgPlaceholder = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><rect width='100%' height='100%' fill='%232d3748'/><text x='50%' y='50%' fill='%23a0aec0' font-size='20' font-family='sans-serif' text-anchor='middle' dominant-baseline='middle'>🏯</text></svg>";

    displayItems.forEach(c => {
      const isPlaced = placedSet.has(c.name);
      const itemEl = document.createElement("div");
      itemEl.className = `tier-pool-item ${isPlaced ? 'is-placed' : ''}`;
      itemEl.setAttribute("draggable", "true");
      itemEl.setAttribute("data-name", c.name);
      itemEl.title = `${c.name} (★${c.rarity} ${c.castleType || ''} ${c.weapon})
クリックで選択中ティアへ追加、またはドラッグ`;

      const iconSrc = `icons/${encodeURIComponent(c.name)}.png`;
      const fallbackSrc = c.illustUrl || noImgPlaceholder;

      itemEl.innerHTML = `
        <div class="tier-pool-item-icon">
          <img src="${iconSrc}" loading="lazy" onerror="this.onerror=null; this.src='${escapeHtml(fallbackSrc)}';" style="width:100%;height:100%;object-fit:cover;" alt="${escapeHtml(c.name)}">
        </div>
        <div class="tier-pool-item-name">${escapeHtml(c.name)}</div>
      `;

      itemEl.addEventListener("dragstart", e => {
        draggedCastleName = c.name;
        draggedSourceRowId = null;
        e.dataTransfer.setData("text/plain", c.name);
      });

      itemEl.addEventListener("dragend", () => {
        draggedCastleName = null;
        draggedSourceRowId = null;
      });

      itemEl.addEventListener("click", () => {
        const targetSel = document.getElementById("tierPoolTargetSelect");
        const targetRowId = targetSel?.value;
        if (!targetRowId) return;

        const row = customTierRows.find(r => r.id === targetRowId);
        if (row) {
          if (row.castles.includes(c.name)) {
            showToast(`「${c.name}」は既に「${row.letter}」に配置されています`);
            return;
          }
          row.castles.push(c.name);
          renderCustomTierRows();
          updateTierPoolPlacedStates();
          showToast(`「${c.name}」を「${row.letter}」に追加しました！`);
        }
      });

      grid.appendChild(itemEl);
    });

    if (tierPoolVisibleCount < filtered.length) {
      const remaining = filtered.length - tierPoolVisibleCount;
      const nextBatch = Math.min(tierPoolBatchSize, remaining);
      const moreWrap = document.createElement("div");
      moreWrap.id = "tierPoolLoadMoreWrap";
      moreWrap.style.cssText = "grid-column: 1 / -1; text-align: center; padding: 12px;";
      moreWrap.innerHTML = `
        <button type="button" class="btn btn-outline" id="btnTierPoolLoadMore" style="padding: 6px 20px; font-weight: bold; font-size: 12px; cursor: pointer;">
          さらに表示 (+${nextBatch}体 / 残り${remaining}体) ▾
        </button>
      `;
      moreWrap.querySelector("#btnTierPoolLoadMore").addEventListener("click", () => {
        tierPoolVisibleCount += tierPoolBatchSize;
        renderTierPool(false);
      });
      grid.appendChild(moreWrap);
    }
  }

  function exportTierToImage(mode) {
    if (typeof window.html2canvas !== "function") {
      showToast("⚠️ html2canvas ライブラリが読み込まれていません");
      return;
    }

    const exportArea = document.getElementById("tierExportArea");
    if (!exportArea) return;

    let title = "城娘性能ティア表";
    let rowsToExport = [];

    if (mode === "curated") {
      const catData = window.SCRE_TIERS[currentCuratedCat] || window.SCRE_TIERS["overall"];
      title = catData.title;
      rowsToExport = catData.rows.map(r => ({
        letter: r.tier,
        sub: r.label,
        color: r.color,
        castles: r.castles.map(item => item.name)
      }));
    } else {
      const customName = document.getElementById("tierSaveNameInput")?.value?.trim();
      title = customName ? `カスタムティア表 - ${customName}` : "マイ城娘ティア表";
      rowsToExport = customTierRows.map(r => ({
        letter: r.letter,
        sub: r.sub,
        color: r.color,
        castles: [...r.castles]
      }));
    }

    const dateStr = new Date().toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

    const rowsHtml = rowsToExport.map(r => {
      const chipsHtml = r.castles.map(name => {
        const c = getCastleByName(name);
        const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
        const localIconByName = `icons/${encodeURIComponent(safeName)}.png`;
        const localIconById = c ? `icons/${c.id}.png` : localIconByName;
        const initial = (c && c.weapon ? c.weapon[0] : (name[0] || "城"));
        return `
          <div style="display:flex; flex-direction:column; align-items:center; width:54px; margin:2px;">
            <div style="width:48px; height:48px; border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.2); box-shadow:0 1px 3px rgba(0,0,0,0.5); background:#2c3e50; position:relative;">
              <img src="${localIconByName}"
                   onerror="this.onerror=null; this.src='${localIconById}'; this.onerror=() => { this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex'; };"
                   style="width:100%; height:100%; object-fit:cover; display:block;"
                   crossOrigin="anonymous"
                   alt="${escapeHtml(name)}">
              <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; background:#4a5568; color:#fff; font-size:13px; font-weight:bold;">${escapeHtml(initial)}</div>
            </div>
            <div style="font-size:9px; color:#ddd; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; margin-top:2px;">${escapeHtml(name)}</div>
          </div>
        `;
      }).join("");

      return `
        <div style="display:flex; min-height:80px; margin-bottom:6px; background:#222; border:1px solid #3a3a3a; border-radius:6px; overflow:hidden;">
          <div style="width:130px; min-width:110px; background:${r.color || '#555'}; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; padding:6px; text-align:center;">
            <div style="font-size:22px; font-weight:900; letter-spacing:1px; text-shadow:0 1px 3px rgba(0,0,0,0.5);">${escapeHtml(r.letter)}</div>
            ${r.sub ? `<div style="font-size:10px; font-weight:bold; opacity:0.95; margin-top:2px;">${escapeHtml(r.sub)}</div>` : ''}
          </div>
          <div style="flex:1; display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:8px 12px; background:#1e1e1e;">
            ${chipsHtml || '<div style="color:#666; font-size:11px; font-style:italic;">(城娘なし)</div>'}
          </div>
        </div>
      `;
    }).join("");

    exportArea.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #b85d19; padding-bottom:10px; margin-bottom:14px;">
        <div>
          <h2 style="font-size:22px; font-weight:bold; color:#f1c40f; margin:0 0 4px 0;">👑 ${escapeHtml(title)}</h2>
          <div style="font-size:11.5px; color:#aaa;">城プロRE 編成・バフ/デバフ統合ダッシュボード ｜ 性能ティア出力</div>
        </div>
        <div style="text-align:right; font-size:11px; color:#888;">
          <div>出力日時: ${dateStr}</div>
          <div>収録城娘: 全${window.SCRE_DATA?.length || 1161}体対応</div>
        </div>
      </div>
      <div>
        ${rowsHtml}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#777; border-top:1px solid #333; padding-top:8px; margin-top:10px;">
        <div>城プロRE 攻略・編成支援ツール (GitHub: OventoX/ShiroProMatome)</div>
        <div>※ 個別合戦の審議や施設によって最適な城娘は変動します</div>
      </div>
    `;

    showToast("📸 ティア画像を生成中...");

    window.html2canvas(exportArea, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#161616",
      logging: false,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll("img").forEach(img => {
          if (!img.complete || img.naturalWidth === 0) {
            const fallbackDiv = img.nextElementSibling;
            if (fallbackDiv) {
              img.style.display = "none";
              fallbackDiv.style.display = "flex";
            }
          }
        });
      }
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
        const filename = `shiropro-tier-${yyyymmdd}-${hhmm}.png`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`📸 ティア画像を保存しました: ${filename}`);
      }, "image/png");
    }).catch(err => {
      console.error("html2canvas export error:", err);
      showToast("⚠️ 画像の書き出し中にエラーが発生しました: " + (err.message || err));
    });
  }

  // Tier Event Listeners Initialization
  const btnTierAuto = document.getElementById("btnTierModeAuto");
  const btnTierOhige = document.getElementById("btnTierModeOhige");
  const btnTierCurated = document.getElementById("btnTierModeCurated");
  const btnTierCustom = document.getElementById("btnTierModeCustom");
  const btnTierSplit = document.getElementById("btnTierModeSplit");

  if (btnTierSplit) {
    btnTierSplit.addEventListener("click", () => {
      currentTierMode = "split";
      renderTierTab();
    });
  }

  if (btnTierAuto) {
    btnTierAuto.addEventListener("click", () => {
      currentTierMode = "auto";
      renderTierTab();
    });
  }
  if (btnTierOhige) {
    btnTierOhige.addEventListener("click", () => {
      currentTierMode = "ohige";
      renderTierTab();
    });
  }
  if (btnTierCurated) {
    btnTierCurated.addEventListener("click", () => {
      currentTierMode = "curated";
      renderTierTab();
    });
  }
  if (btnTierCustom) {
    btnTierCustom.addEventListener("click", () => {
      currentTierMode = "custom";
      renderTierTab();
    });
  }

  // Ohige Tier Controls
  const btnOhigeScopeW = document.getElementById("btnOhigeScopeWeapon");
  const btnOhigeScopeT = document.getElementById("btnOhigeScopeTerrain");
  const toggleOhigeTerrainTop = document.getElementById("ohigeTerrainTopToggle");
  const btnOhigeT7 = document.getElementById("btnOhigeTop7");
  const btnOhigeT10 = document.getElementById("btnOhigeTop10");

  function setOhigeTierScope(scope) {
    ohigeTierScope = scope;
    if (btnOhigeScopeW) btnOhigeScopeW.classList.toggle("active", scope === "weapon");
    if (btnOhigeScopeT) btnOhigeScopeT.classList.toggle("active", scope === "terrain");
    if (toggleOhigeTerrainTop) {
      toggleOhigeTerrainTop.style.display = (scope === "terrain") ? "flex" : "none";
    }
    renderTierOhige();
  }

  if (btnOhigeScopeW) btnOhigeScopeW.addEventListener("click", () => setOhigeTierScope("weapon"));
  if (btnOhigeScopeT) btnOhigeScopeT.addEventListener("click", () => setOhigeTierScope("terrain"));

  if (btnOhigeT7) {
    btnOhigeT7.addEventListener("click", () => {
      ohigeTerrainTopCount = 7;
      btnOhigeT7.classList.add("active");
      if (btnOhigeT10) btnOhigeT10.classList.remove("active");
      renderTierOhige();
    });
  }
  if (btnOhigeT10) {
    btnOhigeT10.addEventListener("click", () => {
      ohigeTerrainTopCount = 10;
      btnOhigeT10.classList.add("active");
      if (btnOhigeT7) btnOhigeT7.classList.remove("active");
      renderTierOhige();
    });
  }

  ["tierOhigeFilterWeapon", "tierOhigeFilterTerrain", "tierOhigeFilterRangeKind", "tierOhigeFilterOwnership"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderTierOhige);
  });
  const searchInputOhige = document.getElementById("tierOhigeSearchInput");
  if (searchInputOhige) {
    searchInputOhige.addEventListener("input", renderTierOhige);
  }

  const btnClearOhigeOverrides = document.getElementById("btnClearOhigeOverrides");
  if (btnClearOhigeOverrides) {
    btnClearOhigeOverrides.addEventListener("click", () => {
      const count = Object.keys(tierOverrides).length;
      if (count === 0) {
        showToast("手動上書きされた城娘はありません");
        return;
      }
      if (confirm(`設定されている手動上書き(${count}体)をすべて解除しておひげ式スコアに戻しますか？`)) {
        tierOverrides = {};
        saveTierOverrides();
        renderTierOhige();
        showToast("すべての手動上書きを解除しました");
      }
    });
  }

  const btnExportOhige = document.getElementById("btnExportOhigeImage");
  if (btnExportOhige) {
    btnExportOhige.addEventListener("click", () => {
      const board = document.getElementById("tierOhigeBoard");
      if (!board) return;
      showToast("📷 おひげ式ティア表の画像を生成中...");
      if (typeof html2canvas === "undefined") {
        showToast("⚠️ html2canvas が読み込まれていません");
        return;
      }
      html2canvas(board, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#f5f3f0"
      }).then(canvas => {
        const a = document.createElement("a");
        a.download = `shiropro_ohige_tier_${ohigeTierScope}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
        showToast("✅ おひげ式ティア表画像を保存しました");
      }).catch(err => {
        console.error("Export error:", err);
        showToast("⚠️ 画像の保存に失敗しました: " + (err.message || err));
      });
    });
  }

  // Auto Tier Controls
  const btnScopeRole = document.getElementById("btnTierScopeRole");
  const btnScopeOverall = document.getElementById("btnTierScopeOverall");
  const btnScopeWeapon = document.getElementById("btnTierScopeWeapon");

  function setAutoTierScope(scope) {
    autoTierScope = scope;
    if (btnScopeRole) btnScopeRole.classList.toggle("active", scope === "role");
    if (btnScopeOverall) btnScopeOverall.classList.toggle("active", scope === "overall");
    if (btnScopeWeapon) btnScopeWeapon.classList.toggle("active", scope === "weapon");
    syncWeightSlidersUI();
    renderTierAutoBoard();
  }

  if (btnScopeRole) btnScopeRole.addEventListener("click", () => setAutoTierScope("role"));
  if (btnScopeOverall) btnScopeOverall.addEventListener("click", () => setAutoTierScope("overall"));
  if (btnScopeWeapon) btnScopeWeapon.addEventListener("click", () => setAutoTierScope("weapon"));

  // Role Tab Listeners
  const roleTabsEl = document.getElementById("tierRoleTabs");
  if (roleTabsEl) {
    roleTabsEl.addEventListener("click", (e) => {
      const tab = e.target.closest(".tier-role-tab");
      if (!tab) return;
      const roleKey = tab.getAttribute("data-role");
      if (roleKey && ROLE_METAS[roleKey]) {
        autoTierActiveRole = roleKey;
        roleTabsEl.querySelectorAll(".tier-role-tab").forEach(t => {
          t.classList.toggle("active", t.getAttribute("data-role") === roleKey);
        });
        syncWeightSlidersUI();
        renderTierAutoBoard();
      }
    });
  }

  const btnToggleWeights = document.getElementById("btnToggleTierWeights");
  const drawerWeights = document.getElementById("tierWeightDrawer");
  if (btnToggleWeights && drawerWeights) {
    btnToggleWeights.addEventListener("click", () => {
      const isHidden = drawerWeights.style.display === "none";
      drawerWeights.style.display = isHidden ? "block" : "none";
      btnToggleWeights.classList.toggle("active", isHidden);
    });
  }

  // Weight Sliders
  const sliderDefs = [
    { id: "sliderWeightBase", lbl: "lblWeightBase", key: "base" },
    { id: "sliderWeightSelf", lbl: "lblWeightSelf", key: "self" },
    { id: "sliderWeightAlly", lbl: "lblWeightAlly", key: "ally" },
    { id: "sliderWeightDebuff", lbl: "lblWeightDebuff", key: "debuff" },
    { id: "sliderWeightStrat", lbl: "lblWeightStrat", key: "strat" },
    { id: "sliderWeightSpec", lbl: "lblWeightSpec", key: "spec" }
  ];
  sliderDefs.forEach(def => {
    const slider = document.getElementById(def.id);
    const lbl = document.getElementById(def.lbl);
    if (slider && lbl) {
      slider.addEventListener("input", () => {
        const val = parseInt(slider.value, 10);
        const currentRole = (autoTierScope === "role") ? autoTierActiveRole : "overall";
        if (!roleTierWeights[currentRole]) {
          roleTierWeights[currentRole] = { ...(DEFAULT_ROLE_TIER_WEIGHTS[currentRole] || DEFAULT_ROLE_TIER_WEIGHTS.overall) };
        }
        roleTierWeights[currentRole][def.key] = val;
        syncWeightSlidersUI();
        saveTierWeights();
        computeCastleScores(roleTierWeights);
        renderTierAutoBoard();
      });
    }
  });

  const btnResetWeights = document.getElementById("btnResetTierWeights");
  if (btnResetWeights) {
    btnResetWeights.addEventListener("click", () => {
      const currentRole = (autoTierScope === "role") ? autoTierActiveRole : "overall";
      roleTierWeights[currentRole] = { ...(DEFAULT_ROLE_TIER_WEIGHTS[currentRole] || DEFAULT_ROLE_TIER_WEIGHTS.overall) };
      saveTierWeights();
      syncWeightSlidersUI();
      computeCastleScores(roleTierWeights);
      renderTierAutoBoard();
      const roleName = ROLE_METAS[currentRole] ? ROLE_METAS[currentRole].label : "全体";
      showToast(roleName + "の評価重みをデフォルト値にリセットしました");
    });
  }

  const btnClearOverrides = document.getElementById("btnClearTierOverrides");
  if (btnClearOverrides) {
    btnClearOverrides.addEventListener("click", () => {
      const count = Object.keys(tierOverrides).length;
      if (count === 0) {
        showToast("手動上書きされた城娘はありません");
        return;
      }
      if (confirm(`設定されている手動上書き(${count}体)をすべて解除して自動スコアに戻しますか？`)) {
        tierOverrides = {};
        saveTierOverrides();
        renderTierAutoBoard();
        showToast("すべての手動上書きを解除しました");
      }
    });
  }

  // Filter Listeners
  ["tierAutoFilterWeapon", "tierAutoFilterType", "tierAutoFilterRangeKind", "tierAutoFilterOwnership"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderTierAutoBoard);
  });
  const searchInput = document.getElementById("tierAutoSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", renderTierAutoBoard);
  }

  // Image Export for Auto Tier
  const btnExportAutoImg = document.getElementById("btnExportAutoTierImage");
  if (btnExportAutoImg) {
    btnExportAutoImg.addEventListener("click", () => {
      const board = document.getElementById("tierAutoBoard");
      if (!board) return;
      showToast("📷 自動スコアティア表の画像を生成中...");
      if (typeof html2canvas === "undefined") {
        showToast("⚠️ html2canvas が読み込まれていません");
        return;
      }
      html2canvas(board, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#f5f3f0",
        onclone: (clonedDoc) => {
          clonedDoc.querySelectorAll(".tier-auto-chip-icon img, img").forEach(img => {
            if (!img.complete || img.naturalWidth === 0) {
              const castleName = img.alt || "";
              const parent = img.parentElement;
              if (parent) {
                const initial = castleName.slice(0, 2) || "城";
                parent.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#718096;color:#fff;font-size:11px;font-weight:bold;border-radius:4px;">${escapeHtml(initial)}</div>`;
              }
            }
          });
        }
      }).then(canvas => {
        const a = document.createElement("a");
        a.download = `shiropro_auto_tier_${autoTierScope}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
        showToast("✅ ティア表画像を保存しました");
      }).catch(err => {
        console.error("Export error:", err);
        showToast("⚠️ 画像の保存に失敗しました: " + (err.message || err));
      });
    });
  }

  const tierCatPills = document.getElementById("tierCatPills");
  if (tierCatPills) {
    tierCatPills.addEventListener("click", e => {
      const btn = e.target.closest(".tier-pill-btn");
      if (!btn) return;
      const cat = btn.getAttribute("data-cat");
      if (cat) {
        currentCuratedCat = cat;
        renderTierCurated();
      }
    });
  }

  // Copy curated to maker
  const btnCopyCurated = document.getElementById("btnCopyCuratedToMaker");
  if (btnCopyCurated) {
    btnCopyCurated.addEventListener("click", () => {
      if (!window.SCRE_TIERS) return;
      const catData = window.SCRE_TIERS[currentCuratedCat] || window.SCRE_TIERS["overall"];
      if (catData) {
        customTierRows = catData.rows.map((r, idx) => ({
          id: `row_${idx}_${Date.now()}`,
          letter: r.tier,
          sub: r.label,
          color: r.color || DEFAULT_ROW_COLORS[idx % DEFAULT_ROW_COLORS.length],
          castles: r.castles.map(item => item.name)
        }));
        currentTierMode = "custom";
        renderTierTab();
        showToast(`「${catData.title}」をティアメーカーにコピーしました！自由に編集できます`);
      }
    });
  }

  // Export curated image
  const btnExpCurated = document.getElementById("btnExportCuratedImage");
  if (btnExpCurated) {
    btnExpCurated.addEventListener("click", () => exportTierToImage("curated"));
  }

  // Maker: Apply template
  const btnApplyTmpl = document.getElementById("btnApplyTierTemplate");
  if (btnApplyTmpl) {
    btnApplyTmpl.addEventListener("click", () => {
      const val = document.getElementById("tierTemplateSelect")?.value;
      if (val === "blank") {
        customTierRows = [
          { id: "row_1", letter: "EX", sub: "人権", color: "#b33939", castles: [] },
          { id: "row_2", letter: "S+", sub: "超主力", color: "#d35400", castles: [] },
          { id: "row_3", letter: "S", sub: "主力", color: "#2980b9", castles: [] },
          { id: "row_4", letter: "A", sub: "優秀", color: "#27ae60", castles: [] }
        ];
        renderTierCustomMaker();
        showToast("新規の空白ティア表を作成しました");
        return;
      }
      if (window.SCRE_TIERS && window.SCRE_TIERS[val]) {
        const catData = window.SCRE_TIERS[val];
        customTierRows = catData.rows.map((r, idx) => ({
          id: `row_${idx}_${Date.now()}`,
          letter: r.tier,
          sub: r.label,
          color: r.color || DEFAULT_ROW_COLORS[idx % DEFAULT_ROW_COLORS.length],
          castles: r.castles.map(item => item.name)
        }));
        renderTierCustomMaker();
        showToast(`テンプレート「${catData.title}」を適用しました`);
      }
    });
  }

  // Maker: Add row
  const btnAddRow = document.getElementById("btnAddTierRow");
  if (btnAddRow) {
    btnAddRow.addEventListener("click", () => {
      const letter = prompt("新しい行のティア名を入力してください（例: SS, B, 推し）", "B");
      if (letter && letter.trim()) {
        const nextColor = DEFAULT_ROW_COLORS[customTierRows.length % DEFAULT_ROW_COLORS.length];
        customTierRows.push({
          id: `row_${Date.now()}`,
          letter: letter.trim(),
          sub: "",
          color: nextColor,
          castles: []
        });
        renderTierCustomMaker();
        showToast(`行「${letter.trim()}」を追加しました`);
      }
    });
  }

  // Maker: Clear all rows
  const btnClearAllRows = document.getElementById("btnClearAllTierRows");
  if (btnClearAllRows) {
    btnClearAllRows.addEventListener("click", () => {
      if (confirm("ティア表の全行から城娘をクリアしますか？")) {
        customTierRows.forEach(r => r.castles = []);
        renderTierCustomMaker();
        showToast("全行の城娘をクリアしました");
      }
    });
  }

  // Maker: Save tier
  const btnSaveTier = document.getElementById("btnSaveCustomTier");
  if (btnSaveTier) {
    btnSaveTier.addEventListener("click", () => {
      const nameInput = document.getElementById("tierSaveNameInput");
      const name = nameInput?.value?.trim();
      if (!name) {
        showToast("⚠️ 保存するティア表名を入力してください");
        nameInput?.focus();
        return;
      }
      customTiersStorage[name] = JSON.parse(JSON.stringify(customTierRows));
      saveCustomTiersToStorage();
      renderTierCustomMaker();
      showToast(`💾 ティア表「${name}」を保存しました！`);
    });
  }

  // Maker: Load tier
  const btnLoadTier = document.getElementById("btnLoadCustomTier");
  if (btnLoadTier) {
    btnLoadTier.addEventListener("click", () => {
      const sel = document.getElementById("savedTiersSelect");
      const name = sel?.value;
      if (!name || !customTiersStorage[name]) {
        showToast("⚠️ 読み込む保存済みティアを選択してください");
        return;
      }
      customTierRows = JSON.parse(JSON.stringify(customTiersStorage[name]));
      const nameInput = document.getElementById("tierSaveNameInput");
      if (nameInput) nameInput.value = name;
      renderTierCustomMaker();
      showToast(`📂 ティア表「${name}」を読み込みました！`);
    });
  }

  // Maker: Delete tier
  const btnDeleteTier = document.getElementById("btnDeleteCustomTier");
  if (btnDeleteTier) {
    btnDeleteTier.addEventListener("click", () => {
      const sel = document.getElementById("savedTiersSelect");
      const name = sel?.value;
      if (!name || !customTiersStorage[name]) {
        showToast("⚠️ 削除する保存済みティアを選択してください");
        return;
      }
      if (confirm(`保存済みティア表「${name}」を削除しますか？`)) {
        delete customTiersStorage[name];
        saveCustomTiersToStorage();
        renderTierCustomMaker();
        showToast(`❌ ティア表「${name}」を削除しました`);
      }
    });
  }

// =========================================================================
// Category A Features: A1-A6 Implementation for ShiroPro RE Helper
// =========================================================================

// --- A2: 縛り編成チャレンジ (Challenge Mode) ---
const CHALLENGE_PRESETS = [
  {
    id: "attr_plain",
    title: "平属性縛り",
    desc: "平属性を持つ城娘のみで編成せよ",
    checkFn: c => (c.attributes || [c.castleType]).includes("平")
  },
  {
    id: "attr_mountain",
    title: "山属性縛り",
    desc: "山属性を持つ城娘のみで編成せよ",
    checkFn: c => (c.attributes || [c.castleType]).includes("山")
  },
  {
    id: "attr_water",
    title: "水属性縛り",
    desc: "水属性を持つ城娘のみで編成せよ",
    checkFn: c => (c.attributes || [c.castleType]).includes("水")
  },
  {
    id: "attr_plain_mountain",
    title: "平山属性縛り",
    desc: "平山属性を持つ城娘のみで編成せよ",
    checkFn: c => (c.attributes || [c.castleType]).includes("平山")
  },
  {
    id: "attr_hell",
    title: "地獄属性縛り",
    desc: "地獄属性を持つ城娘のみで編成せよ",
    checkFn: c => (c.attributes || [c.castleType]).includes("地獄")
  },
  {
    id: "rarity_max5",
    title: "★5以下限定縛り",
    desc: "レアリティ★5以下の城娘のみで編成せよ",
    checkFn: c => (c.rarity || 1) <= 5
  },
  {
    id: "rarity_max6",
    title: "★6以下限定縛り",
    desc: "レアリティ★6以下の城娘のみで編成せよ",
    checkFn: c => (c.rarity || 1) <= 6
  },
  {
    id: "weapon_melee",
    title: "近接武器限定縛り",
    desc: "刀・槍・槌・盾・拳・投剣・鎌・戦棍・陣貝・鞭など近接城娘のみで編成せよ",
    checkFn: c => c.rangeKind === "近" || c.rangeKind === "遠近"
  },
  {
    id: "weapon_ranged",
    title: "遠隔武器限定縛り",
    desc: "弓・石弓・鉄砲・大砲・歌舞・法術・鈴・杖・祓串・本など遠隔城娘のみで編成せよ",
    checkFn: c => c.rangeKind === "遠" || c.rangeKind === "遠近"
  },
  {
    id: "cost_max12",
    title: "低消費気縛り (コスト12以下)",
    desc: "初期配置消費気が12以下の城娘のみで編成せよ",
    checkFn: c => (c.cost || 10) <= 12
  },
  {
    id: "no_strategy",
    title: "計略なし城娘縛り",
    desc: "計略を持たない城娘のみで編成せよ",
    checkFn: c => !c.strategy || !c.strategy.name || c.strategy.name === "計略なし"
  }
];

let activeChallenge = null;

function rollNewChallenge() {
  const randIdx = Math.floor(Math.random() * CHALLENGE_PRESETS.length);
  activeChallenge = CHALLENGE_PRESETS[randIdx];
  renderChallengeUI();
  renderDashboard();
}

function clearChallenge() {
  activeChallenge = null;
  renderChallengeUI();
  renderDashboard();
}

function evaluatePartyChallenge() {
  if (!activeChallenge) return { active: false, passed: true, count: 0, total: 0, violations: [] };
  const violations = [];
  let matchingCount = 0;
  let activeTotal = 0;

  for (let i = 0; i < 8; i++) {
    const slot = party[i];
    if (slot) {
      activeTotal++;
      const c = getCastleById(slot.id);
      if (c && activeChallenge.checkFn(c)) {
        matchingCount++;
      } else {
        violations.push(i);
      }
    }
  }

  const passed = activeTotal > 0 && violations.length === 0;
  return {
    active: true,
    passed,
    matchingCount,
    activeTotal,
    violations
  };
}

function autoFillChallenge() {
  if (!activeChallenge) {
    rollNewChallenge();
  }
  if (!activeChallenge) return;

  pushUndoSnapshot();

  // Filter candidates matching condition
  const candidates = SCRE_DATA.filter(c => activeChallenge.checkFn(c));
  if (candidates.length === 0) {
    alert("該当する城娘が見つかりませんでした。");
    return;
  }

  // Prefer owned, then sort by rarity desc, then level
  candidates.sort((a, b) => {
    const aOwned = ownership.owned.has(a.id) ? 1 : 0;
    const bOwned = ownership.owned.has(b.id) ? 1 : 0;
    if (bOwned !== aOwned) return bOwned - aOwned;
    if (b.rarity !== a.rarity) return b.rarity - a.rarity;
    return (parseInt(b.bookNo, 10) || 0) - (parseInt(a.bookNo, 10) || 0);
  });

  // Pick up to 8 diverse candidates
  const picked = [];
  const usedWeapons = new Set();
  
  // First pass: try diverse weapons
  for (const c of candidates) {
    if (picked.length >= 8) break;
    if (!usedWeapons.has(c.weapon)) {
      picked.push(c);
      usedWeapons.add(c.weapon);
    }
  }

  // Second pass: fill remaining
  for (const c of candidates) {
    if (picked.length >= 8) break;
    if (!picked.some(p => p.id === c.id)) {
      picked.push(c);
    }
  }

  party = picked.map(c => ({
    id: c.id,
    strategyOn: true,
    specialOn: true
  }));

  if (partyPresets && partyPresets[currentPresetIdx]) {
    partyPresets[currentPresetIdx].party = party;
  }
  saveParty();
  updateUndoButtonUI();
  renderChallengeUI();
  renderDashboard();
}

function renderChallengeUI() {
  const box = document.getElementById("dashboardChallengeBox");
  const displayEl = document.getElementById("challengeRulesDisplay");
  const badgeEl = document.getElementById("challengeStatusBadge");
  if (!box || !displayEl || !badgeEl) return;

  if (!activeChallenge) {
    displayEl.innerHTML = `<span class="challenge-rule-chip" style="background:#f0ece1; color:var(--text-sub);">🎲 お題未設定（「お題を引く」を押してください）</span>`;
    badgeEl.textContent = "未設定";
    badgeEl.className = "challenge-status-badge badge-neutral";
    return;
  }

  displayEl.innerHTML = `
    <span class="challenge-rule-chip" style="background:#fff3cd; color:#856404; font-weight:bold; border-color:#ffeeba;">
      🏷️ ${escapeHtml(activeChallenge.title)}
    </span>
    <span style="font-size:11.5px; color:var(--text-sub); display:inline-flex; align-items:center;">
      ${escapeHtml(activeChallenge.desc)}
    </span>
  `;

  const evalRes = evaluatePartyChallenge();
  if (evalRes.activeTotal === 0) {
    badgeEl.textContent = "編成なし";
    badgeEl.className = "challenge-status-badge badge-neutral";
  } else if (evalRes.passed) {
    badgeEl.textContent = `達成中！ (${evalRes.matchingCount}/${evalRes.activeTotal})`;
    badgeEl.className = "challenge-status-badge badge-pass";
  } else {
    badgeEl.textContent = `未達成 (${evalRes.matchingCount}/${evalRes.activeTotal} 適合)`;
    badgeEl.className = "challenge-status-badge badge-violation";
  }
}

  // --- 武器フレーム表 (Wiki / PileBunker 30fps 標準フレーム準拠) ---
  // 刀〜陣貝の19種: 標準フレーム準拠
  // 盾・双剣・軍船・ランス・茶器・その他: 標準フレーム未検証のため推定値（攻撃25f/隙25f）として設定（捏造防止ルール）
  const SCRE_WEAPON_FRAMES = {
    "刀": { atk: 20, gap: 23, hits: 1, type: "physical", aoe: false },
    "槍": { atk: 17, gap: 19, hits: 1, type: "physical", aoe: false },
    "槌": { atk: 31, gap: 37, hits: 1, type: "physical", aoe: true },
    "拳": { atk: 11, gap: 13, hits: 2, hitsMax: 5, type: "physical", aoe: false },
    "弓": { atk: 18, gap: 18, hits: 1, type: "physical", aoe: false },
    "石弓": { atk: 22, gap: 23, hits: 1, type: "physical", aoe: false },
    "鉄砲": { atk: 26, gap: 34, hits: 1, type: "physical", aoe: false },
    "大砲": { atk: 41, gap: 49, hits: 1, type: "physical", aoe: true },
    "歌舞": { atk: 43, gap: 27, hits: 1, type: "buff", aoe: true },
    "法術": { atk: 25, gap: 35, hits: 1, type: "magic", aoe: false },
    "鈴": { atk: 45, gap: 25, hits: 1, type: "magic", aoe: true },
    "杖": { atk: 28, gap: 32, hits: 1, type: "magic", aoe: false },
    "祓串": { atk: 22, gap: 24, hits: 2, type: "magic", aoe: false },
    "本": { atk: 25, gap: 25, hits: 1, type: "special", aoe: false },
    "投剣": { atk: 18, gap: 18, hits: 2, type: "physical", aoe: false },
    "鞭": { atk: 20, gap: 22, hits: 1, type: "physical", aoe: false },
    "戦棍": { atk: 22, gap: 24, hits: 1, type: "physical", aoe: false },
    "鎌": { atk: 19, gap: 21, hits: 1, type: "physical", aoe: false },
    "陣貝": { atk: 40, gap: 30, hits: 1, type: "buff", aoe: true },
    // 推定値（未検証武器種・フォールバック準拠）
    "盾": { atk: 25, gap: 25, hits: 1, type: "physical", aoe: false, isEstimate: true },
    "双剣": { atk: 25, gap: 25, hits: 2, type: "physical", aoe: false, isEstimate: true },
    "軍船": { atk: 25, gap: 25, hits: 1, type: "physical", aoe: true, isEstimate: true },
    "ランス": { atk: 25, gap: 25, hits: 1, type: "physical", aoe: false, isEstimate: true },
    "茶器": { atk: 25, gap: 25, hits: 1, type: "buff", aoe: true, isEstimate: true },
    "その他": { atk: 25, gap: 25, hits: 1, type: "physical", aoe: false, isEstimate: true }
  };
  window.SCRE_WEAPON_FRAMES = SCRE_WEAPON_FRAMES;

// --- Prompt 38: 防御無視・術属性判定共通関数 (統一チェッカー) ---
function checkDefenseIgnore(castle, buffs = {}, options = {}) {
  if (!castle) return { isMagic: false, hasDefIgnoreSkill: false, effectiveIgnore: false };
  const weapon = castle.weapon || "";
  const wf = (typeof SCRE_WEAPON_FRAMES !== "undefined" && SCRE_WEAPON_FRAMES[weapon]) || {};

  // 1. 術属性武器（法術・杖・祓串・鈴）: 城プロREのゲーム仕様として常に敵防御力を無視して術ダメージを与える
  const isMagic = Boolean(wf.type === "magic" || ["法術", "杖", "祓串", "鈴"].includes(weapon));

  // 2. 防御無視スキル/特技/計略（defIgnore）: 特技・計略効果により敵の防御力を無視
  const hasDefIgnoreSkill = Boolean(
    buffs &&
    buffs.defIgnore &&
    buffs.defIgnore.length > 0 &&
    !(options && options.disabledDefIgnore)
  );

  // 3. 防御無視耐性（immuneDefIgnore）時の処理:
  //    - 術属性武器（法術・杖・祓串・鈴）は本来の術ダメージ属性のため、防御無視耐性下でも無視を維持
  //    - スキル等による防御無視効果は無効化（通常の物理防御減算が適用される）
  let effectiveIgnore = false;
  if (options && options.immuneDefIgnore) {
    effectiveIgnore = isMagic;
  } else {
    effectiveIgnore = isMagic || hasDefIgnoreSkill;
  }

  return {
    isMagic,
    hasDefIgnoreSkill,
    effectiveIgnore
  };
}
window.checkDefenseIgnore = checkDefenseIgnore;

// --- Prompt 9: ロマン砲シミュレータ (Roman Cannon Simulator) ---
let romanCannonSlotIdx = 0;
let romanExcludedSupporterSlots = new Set();
let romanStratMode = true;
const romanAssistCache = new Map();

function toggleRomanSimulator() {
  const body = document.getElementById("romanSimulatorBody");
  const btn = document.getElementById("btnToggleRomanSimulator");
  if (!body) return;
  const isHidden = body.style.display === "none";
  body.style.display = isHidden ? "block" : "none";
  if (btn) btn.textContent = isHidden ? "閉じる ▴" : "展開 ▾";
  if (isHidden) {
    renderRomanSimulator();
  }
}

function extractDamageMultiplier(text) {
  if (!text) return null;
  const p1 = text.match(/攻撃の\s*(\d+(?:\.\d+)?)\s*倍/);
  if (p1) return { mult: parseFloat(p1[1]), raw: p1[0] };
  const p2 = text.match(/(\d+(?:\.\d+)?)\s*倍のダメージ/);
  if (p2) return { mult: parseFloat(p2[1]), raw: p2[0] };
  const p3 = text.match(/(?:与える)?ダメージ(?:が|を|\s)?\s*(\d+(?:\.\d+)?)\s*倍/);
  if (p3) return { mult: parseFloat(p3[1]), raw: p3[0] };
  return null;
}

function setRomanCannonSlot(slotIdx) {
  romanCannonSlotIdx = parseInt(slotIdx, 10) || 0;
  romanExcludedSupporterSlots.delete(romanCannonSlotIdx);
  renderRomanSimulator();
}

function toggleRomanSupporter(slotIdx) {
  const idx = parseInt(slotIdx, 10);
  if (romanExcludedSupporterSlots.has(idx)) {
    romanExcludedSupporterSlots.delete(idx);
  } else {
    romanExcludedSupporterSlots.add(idx);
  }
  renderRomanSimulator();
}

function renderRomanSimulator() {
  const section = document.getElementById("sectionRomanSimulator");
  if (!section) return;

  const cannonSelect = document.getElementById("romanCannonSelect");
  const supportersWrap = document.getElementById("romanSupportersWrap");
  const stratToggle = document.getElementById("romanStrategyToggle");
  const headlineEl = document.getElementById("romanHeadlineBanner");
  const waterfallEl = document.getElementById("romanWaterfallList");
  const assistEl = document.getElementById("romanAssistList");

  if (!cannonSelect || !supportersWrap || !headlineEl || !waterfallEl) return;

  // Sync strategy toggle state
  if (stratToggle) {
    romanStratMode = stratToggle.checked;
  }

  // Get active party members
  const validPartyEntries = [];
  party.forEach((slot, idx) => {
    if (!slot) return;
    const c = getCastleById(slot.id);
    if (c) validPartyEntries.push({ slot, castle: c, idx });
  });

  if (validPartyEntries.length === 0) {
    cannonSelect.innerHTML = `<option value="">編成に城娘がいません</option>`;
    supportersWrap.innerHTML = `<span style="font-size:11.5px; color:var(--text-sub);">編成に城娘がいません。</span>`;
    headlineEl.innerHTML = `
      <div class="roman-headline-primary">
        <div class="roman-headline-title">最大の一撃 (ロマン砲)</div>
        <div class="roman-headline-dmg" style="font-size:18px; color:#a4b0be;">編成に城娘がいません</div>
      </div>
    `;
    waterfallEl.innerHTML = `<div style="font-size:11.5px; color:var(--text-sub); padding:10px;">部隊に城娘を編成してください。</div>`;
    if (assistEl) assistEl.innerHTML = `<div style="font-size:11.5px; color:var(--text-sub);">部隊に城娘を編成してください。</div>`;
    return;
  }

  // Ensure romanCannonSlotIdx points to a valid member
  const currentCannonExists = validPartyEntries.some(e => e.idx === romanCannonSlotIdx);
  if (!currentCannonExists) {
    romanCannonSlotIdx = validPartyEntries[0].idx;
  }

  // 1. Populate Cannon Select
  cannonSelect.innerHTML = validPartyEntries.map(({ castle: c, idx }) => {
    return `<option value="${idx}" ${idx === romanCannonSlotIdx ? "selected" : ""}>枠${idx + 1}: ${escapeHtml(c.name)} (★${c.rarity} ${escapeHtml(c.weapon)})</option>`;
  }).join("");

  // 2. Populate Supporters Wrap
  const supporterEntries = validPartyEntries.filter(e => e.idx !== romanCannonSlotIdx);
  if (supporterEntries.length === 0) {
    supportersWrap.innerHTML = `<span style="font-size:11.5px; color:var(--text-sub);">支援役の城娘がいません（1人のみ編成中）。</span>`;
  } else {
    supportersWrap.innerHTML = supporterEntries.map(({ castle: c, idx }) => {
      const isExcluded = romanExcludedSupporterSlots.has(idx);
      return `
        <label class="roman-supporter-chip ${isExcluded ? 'excluded' : ''}" title="${isExcluded ? 'バフ除外中（クリックで有効化）' : 'バフ適用中（クリックで除外）'}">
          <input type="checkbox" class="roman-supporter-check" data-slot-idx="${idx}" ${isExcluded ? '' : 'checked'} style="cursor:pointer;">
          ${getIconHtml(c, 18)}
          <span>${escapeHtml(c.name)}</span>
        </label>
      `;
    }).join("");
  }

  // 3. Build custom party for calculateBuffs
  const customParty = party.map((slot, idx) => {
    if (!slot) return null;
    if (idx !== romanCannonSlotIdx && romanExcludedSupporterSlots.has(idx)) {
      return null; // Excluded supporter
    }
    return {
      ...slot,
      strategyOn: romanStratMode,
      specialOn: true
    };
  }).filter(Boolean);

  // Run existing engine calculateBuffs
  const calcResult = calculateBuffs(customParty, currentTerrain);

  const mainEntry = validPartyEntries.find(e => e.idx === romanCannonSlotIdx);
  const mainCastle = mainEntry ? mainEntry.castle : null;
  if (!mainCastle) return;

  const calcData = calcResult.perCastle[mainCastle.id];
  const calcStats = calcData ? calcData.calculatedStats : (mainCastle.stats ? mainCastle.stats.giant5 : { atk: 100 });
  const finalAtk = Math.round(calcStats.atk || 100);

  const isTerrainMatch = Boolean(currentTerrain && mainCastle.attributes && mainCastle.attributes.includes(currentTerrain));
  const terrainMult = isTerrainMatch ? (currentTerrain === "地獄" ? 1.3 : 1.25) : 1.0;
  const baseAtk = Math.floor((mainCastle.stats?.giant5?.atk || 100) * terrainMult);

  // Read enemy parameters
  const enemyDef = Math.max(0, parseInt(document.getElementById("romanEnemyDef")?.value, 10) || 0);
  const enemyHp = Math.max(1, parseInt(document.getElementById("romanEnemyHp")?.value, 10) || 50000);
  const enemyRed = Math.max(0, Math.min(90, parseFloat(document.getElementById("romanEnemyRed")?.value) || 0));

  // Enemy Effective DEF (Prompt 38: checkDefenseIgnore 共通判定)
  const defIgnoreInfo = checkDefenseIgnore(mainCastle, calcData?.buffs);
  const effectiveIgnore = defIgnoreInfo.effectiveIgnore;
  const isMagicOrIgnore = defIgnoreInfo.isMagic;
  const defDownPerc = calcResult.enemyDebuffs?.enemyDefDown?.max || 0;
  let effDef = effectiveIgnore ? 0 : Math.max(0, Math.floor(enemyDef * (1.0 - defDownPerc / 100)));

  // dmgDealtTarget (与えるダメージ) multiplies ATK BEFORE subtracting enemy defense! (Prompt 13)
  const activeTargetSources = calcData && calcData.buffs ? calcData.buffs.dmgDealtTarget.sources.filter(s => s.applied !== false) : [];
  const dmgTargetMult = activeTargetSources.reduce((acc, s) => acc * (1 + s.val / 100), 1.0);
  const atkWithTarget = Math.floor(finalAtk * dmgTargetMult);

  // Damage Calculation: max(atk * 0.1, atk - effDef)
  const isFloorGuaranteed = (atkWithTarget - effDef) < Math.floor(atkWithTarget * 0.1);
  const baseDamage = Math.max(Math.floor(atkWithTarget * 0.1), atkWithTarget - effDef);

  // Damage Multipliers (与ダメ%, 敵被ダメ上昇%) applied AFTER defense subtraction!
  const dmgDealtPerc = calcData && calcData.buffs ? (calcData.buffs.dmgDealt.max + calcData.buffs.dmgDealt.stackSum) / 100 : 0;
  const enemyDmgTakenPerc = (calcResult.enemyDebuffs?.enemyDmgTakenUp?.max || 0) / 100;
  const postDmgMult = (1 + dmgDealtPerc) * (1 + enemyDmgTakenPerc);

  // Final 1-Hit Damage
  const finalHitDamage = Math.max(1, Math.floor(baseDamage * postDmgMult * (1.0 - enemyRed / 100)));
  const hitsToKill = Math.ceil(enemyHp / finalHitDamage);

  // Multiplier from Strategy / Special
  const stratMultObj = romanStratMode ? extractDamageMultiplier(mainCastle.strategy?.text) : null;
  const stratDamage = stratMultObj ? Math.floor(finalHitDamage * stratMultObj.mult) : null;

  const specialMultObj = extractDamageMultiplier(mainCastle.special?.text);
  const specialDamage = specialMultObj ? Math.floor(finalHitDamage * specialMultObj.mult) : null;

  // 4. Render Headline Banner
  let pillsHtml = `
    <div class="roman-headline-pill">⚔️ 最終攻撃: <strong>${finalAtk.toLocaleString()}</strong></div>
    <div class="roman-headline-pill">🎯 撃破必要: <strong>${hitsToKill.toLocaleString()} hit</strong></div>
  `;
  if (stratDamage) {
    pillsHtml += `<div class="roman-headline-pill" style="border-color:#e67e22; color:#ffbe76;">🔥 計略一撃: <strong>${stratDamage.toLocaleString()}</strong> (${stratMultObj.mult}倍)</div>`;
  }
  if (specialDamage) {
    pillsHtml += `<div class="roman-headline-pill" style="border-color:#9b59b6; color:#e056fd;">✨ 特殊一撃: <strong>${specialDamage.toLocaleString()}</strong> (${specialMultObj.mult}倍)</div>`;
  }

  headlineEl.innerHTML = `
    <div class="roman-headline-primary">
      <div class="roman-headline-title">最大の一撃 (ロマン砲 / 1hit通常攻撃)</div>
      <div class="roman-headline-dmg">
        <span>💥 ${finalHitDamage.toLocaleString()}</span>
        <span style="font-size:14px; font-weight:normal; color:#dfe4ea;">ダメージ / hit</span>
      </div>
    </div>
    <div class="roman-headline-sub">
      ${pillsHtml}
    </div>
  `;

  // 5. Render Waterfall Steps
  let stepIdx = 1;
  const steps = [];

  // Step 1: Base Atk
  steps.push(`
    <div class="roman-waterfall-step">
      <div class="roman-step-label">
        <span class="roman-step-num">${stepIdx++}</span>
        <strong>素の巨大化後攻撃力</strong>
        <span style="font-size:11px; color:var(--text-sub);">${isTerrainMatch ? `（巨大化5回・地形一致×${terrainMult}）` : '（巨大化5回）'}</span>
      </div>
      <div class="roman-step-val plus">+${baseAtk.toLocaleString()}</div>
    </div>
  `);

  // Step 2: Buffs breakdown
  if (calcData && calcData.buffs) {
    const b = calcData.buffs;

    // atkPercent sources
    if (b.atkPercent && b.atkPercent.sources) {
      b.atkPercent.sources.forEach(s => {
        if (s.applied) {
          const inc = Math.floor(baseAtk * (s.val / 100));
          steps.push(`
            <div class="roman-waterfall-step">
              <div class="roman-step-label">
                <span class="roman-step-num">${stepIdx++}</span>
                <span>攻撃割合バフ: <strong>${escapeHtml(s.from)}</strong> [${escapeHtml(s.type)}]</span>
                <span style="font-size:11px; color:var(--text-sub);">(${escapeHtml(s.raw || `${s.val}%`)})</span>
              </div>
              <div class="roman-step-val plus">+${inc.toLocaleString()} <span style="font-size:11px; font-weight:normal;">(${s.val}%)</span></div>
            </div>
          `);
        } else {
          steps.push(`
            <div class="roman-waterfall-step" style="opacity:0.6; background:#fafafa;">
              <div class="roman-step-label">
                <span class="roman-step-num" style="background:#ddd;">-</span>
                <span style="text-decoration:line-through;">攻撃割合バフ: ${escapeHtml(s.from)} [${escapeHtml(s.type)}] ${s.val}%</span>
                <span style="font-size:10.5px; color:#e74c3c;">(同種バフ重複のため未適用・最大値優先)</span>
              </div>
              <div class="roman-step-val" style="color:#95a5a6; font-size:11px;">未適用 (0)</div>
            </div>
          `);
        }
      });
    }

    // atkFlat items
    if (b.atkFlat && b.atkFlat.items) {
      b.atkFlat.items.forEach(it => {
        steps.push(`
          <div class="roman-waterfall-step">
            <div class="roman-step-label">
              <span class="roman-step-num">${stepIdx++}</span>
              <span>攻撃固定値バフ: <strong>${escapeHtml(it.from)}</strong> [${escapeHtml(it.type)}]</span>
              <span style="font-size:11px; color:var(--text-sub);">(${escapeHtml(it.raw || `+${it.val}`)})</span>
            </div>
            <div class="roman-step-val plus">+${it.val.toLocaleString()}</div>
          </div>
        `);
      });
    }

    // shares (鼓舞/共有)
    if (b.shares) {
      b.shares.forEach(sh => {
        if (sh.stat === "shareAtk") {
          const prov = getCastleById(sh.shareSource);
          const provBase = prov && prov.stats && prov.stats.giant5 ? prov.stats.giant5.atk : 0;
          const shareVal = Math.floor(provBase * (sh.value / 100));
          steps.push(`
            <div class="roman-waterfall-step">
              <div class="roman-step-label">
                <span class="roman-step-num">${stepIdx++}</span>
                <span>攻撃共有・鼓舞: <strong>${escapeHtml(sh.shareSource)}</strong></span>
                <span style="font-size:11px; color:var(--text-sub);">(${escapeHtml(sh.raw || `${sh.value}%`)})</span>
              </div>
              <div class="roman-step-val plus">+${shareVal.toLocaleString()}</div>
            </div>
          `);
        }
      });
    }
  }

  // Step 3: Final Attack
  steps.push(`
    <div class="roman-waterfall-step highlight-final">
      <div class="roman-step-label">
        <span class="roman-step-num">${stepIdx++}</span>
        <strong>⚔️ 最終攻撃力</strong>
        <span style="font-size:11px; color:var(--text-sub);">(素の攻撃 ＋ 全バフ合算)</span>
      </div>
      <div class="roman-step-val" style="color:var(--buff-color); font-size:14px;">${finalAtk.toLocaleString()}</div>
    </div>
  `);

  // Step 3b (if dmgTargetMult > 1.0): 与えるダメージ補正 (防御減算前に乗算)
  if (dmgTargetMult > 1.0) {
    const targetSourcesText = activeTargetSources.map(s => `${s.from}(${s.val >= 0 ? '+' : ''}${s.val}%)`).join(", ");
    steps.push(`
      <div class="roman-waterfall-step">
        <div class="roman-step-label">
          <span class="roman-step-num">${stepIdx++}</span>
          <span>🎯 与えるダメージ補正 (防御前乗算)</span>
          <span style="font-size:11px; color:var(--text-sub);">×${dmgTargetMult.toFixed(2)} (${escapeHtml(targetSourcesText)})</span>
        </div>
        <div class="roman-step-val" style="color:var(--buff-color); font-size:14px;">${atkWithTarget.toLocaleString()}</div>
      </div>
    `);
  }

  // Step 4: Enemy Defense & Effective Defense
  let defDetailText = `敵初期防御: ${enemyDef.toLocaleString()}`;
  if (defDownPerc > 0) {
    const debSources = calcResult.enemyDebuffs.enemyDefDown.sources.map(s => s.from).join(", ");
    defDetailText += ` → デバフ -${defDownPerc}% (${escapeHtml(debSources)})`;
  }
  if (effectiveIgnore) {
    defDetailText += ` → ${isMagicOrIgnore ? `${mainCastle.weapon}特性` : '防御無視特技'}により防御全無視 (0)`;
  }
  steps.push(`
    <div class="roman-waterfall-step">
      <div class="roman-step-label">
        <span class="roman-step-num">${stepIdx++}</span>
        <span>🛡️ 敵の実効防御力</span>
        <span style="font-size:11px; color:var(--text-sub);">${defDetailText}</span>
      </div>
      <div class="roman-step-val minus">−${effDef.toLocaleString()}</div>
    </div>
  `);

  // Step 5: Base Damage
  steps.push(`
    <div class="roman-waterfall-step">
      <div class="roman-step-label">
        <span class="roman-step-num">${stepIdx++}</span>
        <span>基礎ダメージ（${dmgTargetMult > 1.0 ? '補正攻撃' : '最終攻撃'} − 実効防御）</span>
        ${isFloorGuaranteed ? '<span style="font-size:10.5px; color:#e67e22;">(※防御超過のため最低保証10%適用)</span>' : ''}
      </div>
      <div class="roman-step-val">${baseDamage.toLocaleString()}</div>
    </div>
  `);

  // Step 6: Damage Multipliers
  let multBreakdown = [];
  if (dmgDealtPerc > 0) multBreakdown.push(`与ダメ+${Math.round(dmgDealtPerc * 100)}%`);
  if (enemyDmgTakenPerc > 0) multBreakdown.push(`敵被ダメ+${Math.round(enemyDmgTakenPerc * 100)}%`);
  if (enemyRed > 0) multBreakdown.push(`敵被ダメ軽減-${enemyRed}%`);

  const multText = multBreakdown.length > 0 ? multBreakdown.join(" / ") : "倍率補正なし (等倍)";
  const finalMultFactor = postDmgMult * (1.0 - enemyRed / 100);

  steps.push(`
    <div class="roman-waterfall-step">
      <div class="roman-step-label">
        <span class="roman-step-num">${stepIdx++}</span>
        <span>与ダメ補正・被ダメ軽減</span>
        <span style="font-size:11px; color:var(--text-sub);">${multText}</span>
      </div>
      <div class="roman-step-val" style="color:#2980b9;">×${finalMultFactor.toFixed(2)}</div>
    </div>
  `);

  // Step 7: Final 1-Hit Damage
  steps.push(`
    <div class="roman-waterfall-step highlight-final">
      <div class="roman-step-label">
        <span class="roman-step-num">${stepIdx++}</span>
        <strong>💥 通常攻撃 1ヒット実ダメージ</strong>
        <span style="font-size:11px; color:var(--text-sub);">(基礎ダメージ × 補正倍率)</span>
      </div>
      <div class="roman-step-val" style="color:#e67e22; font-size:15px;">${finalHitDamage.toLocaleString()} ダメージ</div>
    </div>
  `);

  // Step 8: Strategy Blast Multiplied Damage
  if (stratDamage) {
    steps.push(`
      <div class="roman-waterfall-step highlight-strat">
        <div class="roman-step-label">
          <span class="roman-step-num">${stepIdx++}</span>
          <strong>🔥 計略倍率 一撃ダメージ</strong>
          <span style="font-size:11px; color:var(--text-sub);">${escapeHtml(mainCastle.strategy.name)}: ${escapeHtml(stratMultObj.raw)} (${stratMultObj.mult}倍)</span>
        </div>
        <div class="roman-step-val" style="color:#d35400; font-size:15px;">${stratDamage.toLocaleString()} ダメージ</div>
      </div>
    `);
  }

  // Step 9: Special Ability Multiplied Damage
  if (specialDamage) {
    steps.push(`
      <div class="roman-waterfall-step highlight-strat" style="background:#f5eef8; border-color:#9b59b6;">
        <div class="roman-step-label">
          <span class="roman-step-num">${stepIdx++}</span>
          <strong>✨ 特殊能力 一撃ダメージ</strong>
          <span style="font-size:11px; color:var(--text-sub);">${escapeHtml(mainCastle.special.name)}: ${escapeHtml(specialMultObj.raw)} (${specialMultObj.mult}倍)</span>
        </div>
        <div class="roman-step-val" style="color:#8e44ad; font-size:15px;">${specialDamage.toLocaleString()} ダメージ</div>
      </div>
    `);
  }

  waterfallEl.innerHTML = steps.join("");

  // 6. Maximization Assist (入れ替えるともっと伸びる支援役 TOP 5)
  renderRomanAssist(mainCastle, finalHitDamage, finalAtk);
}

function renderRomanAssist(mainCastle, currentHitDamage, currentAtk) {
  const assistContainer = document.getElementById("romanAssistList");
  if (!assistContainer) return;

  const cacheKey = `${mainCastle.id}_${romanStratMode}_${currentTerrain || 'none'}`;
  if (romanAssistCache.has(cacheKey)) {
    const cached = romanAssistCache.get(cacheKey);
    renderRomanAssistCards(cached, assistContainer);
    return;
  }

  // Pre-filter candidates with ally buffs
  const relevantStats = new Set([
    'atkPercent', 'attackPercent', 'atkFlat', 'attackFlat',
    'dmgDealt', 'dmgDealtTarget', 'damagePercent',
    'shareAtk', 'enemyDefDown', 'enemyDmgTakenUp'
  ]);

  const candidates = SCRE_DATA.filter(p => {
    if (p.id === mainCastle.id) return false;
    const effects = [];
    if (p.skill && p.skill.effects) effects.push(...p.skill.effects);
    if (p.strategy && p.strategy.effects) effects.push(...p.strategy.effects);
    return effects.some(e => e.target !== 'self' && relevantStats.has(e.stat));
  });

  // Base solo simulation for comparison
  const soloCalc = calculateBuffs([{ id: mainCastle.id, strategyOn: romanStratMode, specialOn: true }], currentTerrain);
  const soloStats = soloCalc.perCastle[mainCastle.id]?.calculatedStats || { atk: 100 };
  const soloBaseAtk = soloStats.atk;

  const results = [];
  candidates.forEach(p => {
    // 2-member party simulation: [mainCastle, p]
    const testParty = [
      { id: mainCastle.id, strategyOn: romanStratMode, specialOn: true },
      { id: p.id, strategyOn: true, specialOn: true }
    ];
    const res = calculateBuffs(testParty, currentTerrain);
    const postData = res.perCastle[mainCastle.id];
    if (!postData) return;

    const postAtk = postData.calculatedStats.atk;
    const diffAtk = postAtk - soloBaseAtk;

    // Check damage difference against baseline enemy
    const isMagic = (mainCastle.weapon === "杖" || mainCastle.weapon === "鈴" || mainCastle.weapon === "投剣");
    const effIgnore = isMagic || (postData.buffs.defIgnore && postData.buffs.defIgnore.length > 0);
    const defDown = res.enemyDebuffs?.enemyDefDown?.max || 0;
    const simDef = effIgnore ? 0 : Math.max(0, Math.floor(500 * (1 - defDown / 100)));
    const activeTargetSources = postData.buffs.dmgDealtTarget.sources.filter(s => s.applied !== false);
    const dmgTargetMult = activeTargetSources.reduce((acc, s) => acc * (1 + s.val / 100), 1.0);
    const postAtkWithTarget = Math.floor(postAtk * dmgTargetMult);
    const baseDmg = Math.max(Math.floor(postAtkWithTarget * 0.1), postAtkWithTarget - simDef);

    const dmgDealt = (postData.buffs.dmgDealt.max + postData.buffs.dmgDealt.stackSum) / 100;
    const dmgTaken = (res.enemyDebuffs?.enemyDmgTakenUp?.max || 0) / 100;
    const mult = (1 + dmgDealt) * (1 + dmgTaken);
    const postDmg = Math.floor(baseDmg * mult);

    const soloDmg = Math.max(Math.floor(soloBaseAtk * 0.1), soloBaseAtk - (isMagic ? 0 : 500));
    const diffDmg = postDmg - soloDmg;

    if (diffAtk > 0 || diffDmg > 0) {
      const isOwned = ownership.owned.has(p.id);
      results.push({
        castle: p,
        diffAtk,
        diffDmg,
        isOwned,
        score: diffDmg * 1.5 + diffAtk
      });
    }
  });

  results.sort((a, b) => b.score - a.score);
  const top5 = results.slice(0, 5);
  romanAssistCache.set(cacheKey, top5);

  renderRomanAssistCards(top5, assistContainer);
}

function renderRomanAssistCards(topList, container) {
  if (!topList || topList.length === 0) {
    container.innerHTML = `<div style="font-size:11.5px; color:var(--text-sub); padding:6px;">候補となる支援役が見つかりませんでした。</div>`;
    return;
  }

  container.innerHTML = topList.map(({ castle: p, diffAtk, diffDmg, isOwned }, rankIdx) => {
    const inParty = party.some(slot => slot && slot.id === p.id);
    return `
      <div class="roman-assist-card" onclick="openCastleDetail('${escapeHtml(p.id)}')" title="クリックで詳細モーダルを表示">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:10px; font-weight:bold; color:#e67e22; background:#fdf2e9; padding:1px 6px; border-radius:10px;">TOP ${rankIdx + 1}</span>
          ${isOwned ? '<span style="font-size:9.5px; color:#27ae60; font-weight:bold;">✓所持</span>' : ''}
          ${inParty ? '<span style="font-size:9.5px; color:#2980b9;">(編成中)</span>' : ''}
        </div>
        <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
          ${getIconHtml(p, 28)}
          <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <strong style="font-size:11.5px; color:var(--text-main);">${escapeHtml(p.name)}</strong>
            <div style="font-size:10px; color:var(--text-sub);">★${p.rarity} ${escapeHtml(p.weapon)}</div>
          </div>
        </div>
        <div style="margin-top:4px; font-size:10.5px; display:flex; flex-direction:column; gap:2px;">
          <div style="color:#27ae60; font-weight:bold;">⚔️ 攻撃 +${diffAtk.toLocaleString()}</div>
          <div style="color:#e67e22; font-weight:bold;">💥 ダメージ +${diffDmg.toLocaleString()}</div>
        </div>
      </div>
    `;
  }).join("");
}

// --- A5: ダメージチェッカー (Damage Simulator) ---
function toggleDamageChecker() {
  const body = document.getElementById("dmgCheckerBody");
  const btn = document.getElementById("btnToggleDamageChecker");
  if (!body) return;
  const isHidden = body.style.display === "none";
  body.style.display = isHidden ? "block" : "none";
  if (btn) btn.textContent = isHidden ? "閉じる ▴" : "展開 ▾";
  if (isHidden) {
    renderDamageChecker();
  }
}

function renderDamageChecker(providedCalcResult) {
  const tbody = document.getElementById("dmgCheckerTbody");
  if (!tbody) return;

  const enemyDef = parseInt(document.getElementById("dmgEnemyDef")?.value, 10) || 500;
  const enemyHp = parseInt(document.getElementById("dmgEnemyHp")?.value, 10) || 20000;
  const enemyRedVal = Math.max(0, Math.min(90, parseFloat(document.getElementById("dmgEnemyRed")?.value) || 0));
  const enemyRed = enemyRedVal / 100;
  const immuneDefIgnore = document.getElementById("dmgEnemyImmuneDefIgnore")?.checked || false;

  const calcResult = providedCalcResult || calculateBuffs();
  tbody.innerHTML = "";

  if (!calcResult || calcResult.activePartyMembers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-sub); padding:16px;">編成に城娘がいません。</td></tr>`;
    return;
  }

  party.forEach((slot, idx) => {
    if (!slot) return;
    const c = getCastleById(slot.id);
    if (!c) return;

    const calcData = calcResult.perCastle[c.id];
    const calcStats = calcData ? calcData.calculatedStats : (c.stats ? c.stats.giant5 : { atk: 100 });
    const finalAtk = Math.round(calcStats.atk || 100);

    // Check defense ignore (Prompt 38: checkDefenseIgnore 共通判定)
    const defIgnoreInfo = checkDefenseIgnore(c, calcData?.buffs, { immuneDefIgnore });
    const effectiveIgnore = defIgnoreInfo.effectiveIgnore;

    const defDownPerc = calcResult.enemyDebuffs?.enemyDefDown?.max || 0;
    const effDef = effectiveIgnore ? 0 : Math.max(0, Math.floor(enemyDef * (1.0 - defDownPerc / 100)));

    // 与えるダメージ (dmgDealtTarget) multiplies attack BEFORE defense! (Prompt 13 / 22)
    const activeTargetSources = calcData && calcData.buffs ? calcData.buffs.dmgDealtTarget.sources.filter(s => s.applied !== false) : [];
    const dmgTargetMult = activeTargetSources.reduce((acc, s) => acc * (1 + s.val / 100), 1.0);
    const atkWithTarget = Math.floor(finalAtk * dmgTargetMult);

    // Damage Formula: max(atk * 0.1, atk - effDef)
    const baseDamage = Math.max(Math.floor(atkWithTarget * 0.1), atkWithTarget - effDef);

    // Apply damage multiplier buffs (与ダメ%) and enemy damage taken up (被ダメ上昇%) AFTER defense
    const dmgDealtPerc = calcData && calcData.buffs ? (calcData.buffs.dmgDealt.max + calcData.buffs.dmgDealt.stackSum) / 100 : 0;
    const enemyDmgTakenPerc = (calcResult.enemyDebuffs?.enemyDmgTakenUp?.max || 0) / 100;
    const postDmgMult = (1 + dmgDealtPerc) * (1 + enemyDmgTakenPerc);

    // Apply enemy damage reduction
    const finalHitDamage = Math.max(1, Math.floor(baseDamage * postDmgMult * (1.0 - enemyRed)));
    const hitsToKill = Math.ceil(enemyHp / finalHitDamage);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align:center; font-weight:bold; color:var(--text-sub);">${idx + 1}</td>
      <td>
        <div style="display:flex; align-items:center; gap:6px;">
          ${getIconHtml(c, 24)}
          <div>
            <strong style="font-size:12px; cursor:pointer;" onclick="openCastleDetail('${escapeHtml(c.id)}')">${escapeHtml(c.name)}</strong>
            <span style="font-size:10.5px; color:var(--text-sub); margin-left:4px;">★${c.rarity} ${escapeHtml(c.weapon)}</span>
          </div>
        </div>
      </td>
      <td style="text-align:right; font-weight:bold; color:var(--buff-color); font-size:12.5px;">${finalAtk.toLocaleString()}</td>
      <td style="text-align:right;">
        <span style="font-weight:bold; color:#e67e22; font-size:13px;">${finalHitDamage.toLocaleString()}</span>
        <div style="font-size:10px; color:var(--text-sub);">${effectiveIgnore ? '<span style="color:#27ae60;">防御無視</span>' : `実質防御: ${effDef}`}</div>
      </td>
      <td style="text-align:center;">
        <span class="badge" style="background:${hitsToKill <= 5 ? '#27ae60' : hitsToKill <= 15 ? '#f39c12' : '#e74c3c'}; color:#fff; font-weight:bold; padding:2px 8px; border-radius:10px; font-size:11px;">
          ${hitsToKill} hit
        </span>
      </td>
      <td style="font-size:11px; color:var(--text-sub);">
        ${dmgTargetMult > 1.0 ? `<span style="color:#e67e22; font-weight:bold;">与えるダメx${dmgTargetMult.toFixed(2)}</span> ` : ''}
        ${dmgDealtPerc > 0 ? `<span style="color:#2980b9;">与ダメ+${Math.round(dmgDealtPerc * 100)}%</span> ` : ''}
        ${enemyDmgTakenPerc > 0 ? `<span style="color:#8e44ad;">被ダメ上昇+${Math.round(enemyDmgTakenPerc * 100)}%</span> ` : ''}
        ${effectiveIgnore ? `<span style="color:#27ae60;">[術/防御無視]</span> ` : ''}
        ${(c.strategy && slot.strategyOn) ? `<span style="color:#8e44ad;">[計略中]</span>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- A3: 図鑑ギャラリー表示 & 拡張フィルタ (Gallery Mode & Extended Filters) ---
let listActiveViewMode = localStorage.getItem("scre-helper:view-mode:v1") || "card";

function setListViewMode(mode) {
  listActiveViewMode = mode;
  localStorage.setItem("scre-helper:view-mode:v1", mode);

  const btnCard = document.getElementById("btnViewCard");
  const btnGallery = document.getElementById("btnViewGallery");
  const cardList = document.getElementById("allCastleList");
  const galleryList = document.getElementById("allCastleGallery");

  if (btnCard) btnCard.classList.toggle("active", mode === "card");
  if (btnGallery) btnGallery.classList.toggle("active", mode === "gallery");

  if (cardList && galleryList) {
    if (mode === "gallery") {
      cardList.style.display = "none";
      galleryList.style.display = "grid";
    } else {
      cardList.style.display = "block";
      galleryList.style.display = "none";
    }
  }
  renderAllCastles();
}

const ALLOWED_ONE_CHAR_ILLUSTRATORS = new Set(["芝", "裕"]);

function cleanIllustratorName(s) {
  if (!s || typeof s !== "string") return "";
  if (/&attachref|&uploader|&ref|\.jpg|\.png|scre_|https?:\/\/|\/\//i.test(s)) return "";
  let clean = s.replace(/\[\[.*?\]\]/g, "")
               .replace(/\[\[.*/g, "")
               .replace(/[（）()]/g, "")
               .trim();
  if (clean.length > 30) clean = clean.slice(0, 30);
  if (ALLOWED_ONE_CHAR_ILLUSTRATORS.has(clean)) return clean;
  if (/^[\p{P}\p{S}\s]+$/u.test(clean)) return "";
  return clean.length >= 2 ? clean : "";
}

function cleanVoiceActorName(s) {
  if (!s || typeof s !== "string") return "";
  let clean = s.replace(/\[\[.*?\]\]/g, "")
               .replace(/\[\[.*/g, "")
               .replace(/[（）()]/g, "")
               .trim();
  if (clean.length > 30) clean = clean.slice(0, 30);
  if (/^[\p{P}\p{S}\s]+$/u.test(clean)) return "";
  return clean.length >= 1 ? clean : "";
}

function cleanCountryName(s) {
  if (!s) return "";
  return s.replace(/[（）()]/g, "").replace(/架空城.*/, "").replace(/その他.*/, "").trim();
}

function populateGalleryFilterDropdowns() {
  const illSel = document.getElementById("filterIllustrator");
  const vaSel = document.getElementById("filterVoiceActor");
  const couSel = document.getElementById("filterCountry");

  if (!illSel || !vaSel || !couSel || !window.SCRE_DATA) return;

  const illustrators = new Set();
  const voiceActors = new Set();
  const countries = new Set();

  SCRE_DATA.forEach(c => {
    const ill = cleanIllustratorName(c.illustrator);
    if (ill) illustrators.add(ill);
    const va = cleanVoiceActorName(c.voiceActor);
    if (va) voiceActors.add(va);
    const cou = cleanCountryName(c.country);
    if (cou && cou.length > 1) countries.add(cou);
  });

  Array.from(illustrators).sort().forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    illSel.appendChild(opt);
  });

  Array.from(voiceActors).sort().forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    vaSel.appendChild(opt);
  });

  Array.from(countries).sort().forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    couSel.appendChild(opt);
  });
}

function renderGalleryTile(c) {
  const tile = document.createElement("div");
  tile.className = "gallery-castle-tile";
  tile.setAttribute("data-id", c.id);

  const fallbackSrc = `icons/${encodeURIComponent(c.name)}.png`;
  const imgSrc = c.illustUrl || fallbackSrc;
  const isOwned = ownership.owned.has(c.id);
  const inParty = party.some(p => p && p.id === c.id);

  const stages = getCastleRemodelStages(c);
  const stagesHtml = stages.map(st => `
    <button type="button" class="gallery-stage-btn ${st === '改壱' ? 'active' : ''}" data-castle-id="${escapeHtml(c.id)}" data-stage="${st}">
      ${st}
    </button>
  `).join("");

  tile.innerHTML = `
    <div class="gallery-tile-art-wrap">
      <img src="${imgSrc}" onerror="this.src='${fallbackSrc}'" alt="${escapeHtml(c.name)}" class="gallery-tile-img" loading="lazy">
      <div class="gallery-tile-badges">
        <span class="badge badge-rarity badge-rarity-${c.rarity}">★${c.rarity}</span>
        <span class="badge badge-attr badge-attr-${c.subType || c.castleType}">${c.subType || c.castleType}</span>
        <span class="badge" style="background:#4a5568; color:#fff; font-size:10px;">${c.weapon}</span>
      </div>
      <div class="gallery-tile-stages">
        ${stagesHtml}
      </div>
    </div>
    <div class="gallery-tile-info">
      <div class="gallery-tile-title-row">
        <strong class="gallery-tile-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</strong>
        ${c.realCastle ? '<span title="実在の城写真あり" style="cursor:help;">🏯</span>' : ''}
      </div>
      <div class="gallery-tile-ruby">${escapeHtml(c.ruby || '')}</div>
      <div class="gallery-tile-credits">
        ${c.illustrator ? `<span>🎨 ${escapeHtml(cleanIllustratorName(c.illustrator))}</span>` : ''}
        ${c.voiceActor ? `<span>🎙️ ${escapeHtml(cleanVoiceActorName(c.voiceActor))}</span>` : ''}
      </div>
      <div class="gallery-tile-actions">
        <button type="button" class="btn btn-xs ${isOwned ? 'btn-success' : 'btn-outline'}" data-action="toggle-owned" data-id="${escapeHtml(c.id)}">
          ${isOwned ? '✓ 所持' : '未所持'}
        </button>
        <button type="button" class="btn btn-xs btn-primary" data-action="detail" data-id="${escapeHtml(c.id)}">
          詳細 ↗
        </button>
        <button type="button" class="btn btn-xs ${inParty ? 'btn-remove' : 'btn-outline'}" data-action="toggle-party" data-id="${escapeHtml(c.id)}">
          ${inParty ? '✕ 編成外' : '+ 編成'}
        </button>
      </div>
    </div>
  `;

  // Remodel stage click
  tile.querySelectorAll(".gallery-stage-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const st = btn.getAttribute("data-stage");
      tile.querySelectorAll(".gallery-stage-btn").forEach(b => b.classList.toggle("active", b === btn));
      const imgEl = tile.querySelector(".gallery-tile-img");
      const imgSet = getCastleStageImages(c, st);
      if (imgEl) imgEl.src = imgSet.illustUrl || fallbackSrc;
    });
  });

  return tile;
}

// --- A4: 相性の良い城娘 (シナジー検索・相方探し) ---
const synergyCache = new Map();

function calculateCastleSynergy(targetCastle) {
  if (!targetCastle) return [];
  if (synergyCache.has(targetCastle.id)) {
    return synergyCache.get(targetCastle.id);
  }

  const partners = [];
  const targetAttr = targetCastle.subType || targetCastle.castleType;
  const targetRange = targetCastle.rangeKind || "近";

  // Pre-filter candidate partners that provide buffs
  SCRE_DATA.forEach(p => {
    if (p.id === targetCastle.id) return;

    let score = 0;
    const reasons = [];

    const pAttr = p.subType || p.castleType;
    if (pAttr === targetAttr) {
      score += 15;
      reasons.push("🌿 地形一致");
    }

    // Complementary range kinds
    if ((targetRange === "近" && p.rangeKind === "遠") || (targetRange === "遠" && p.rangeKind === "近")) {
      score += 10;
      reasons.push("⚖️ 前衛・後衛調和");
    }

    // Inspect buffs provided by p
    const allPEffects = [];
    if (p.skill && p.skill.effects) allPEffects.push(...p.skill.effects);
    if (p.strategy && p.strategy.effects) allPEffects.push(...p.strategy.effects);

    allPEffects.forEach(ef => {
      if (ef.target === "self") return; // skip self-only buffs
      if (ef.stat === "atkPercent" || ef.stat === "atkFlat") {
        score += 25;
        if (!reasons.includes("⚔️ 攻撃力強化")) reasons.push("⚔️ 攻撃力強化");
      } else if (ef.stat === "rangePercent" || ef.stat === "rangeFlat") {
        score += 20;
        if (!reasons.includes("🎯 射程拡大")) reasons.push("🎯 射程拡大");
      } else if (ef.stat === "atkSpeed" || ef.stat === "gapShorten") {
        score += 20;
        if (!reasons.includes("⚡ 速度・隙短縮")) reasons.push("⚡ 速度・隙短縮");
      } else if (ef.stat === "dmgDealt") {
        score += 25;
        if (!reasons.includes("💥 与ダメ上昇")) reasons.push("💥 与ダメ上昇");
      } else if (ef.stat === "dmgDealtTarget") {
        score += 25;
        if (!reasons.includes("🎯 与えるダメージ上昇")) reasons.push("🎯 与えるダメージ上昇");
      }
    });

    // Check ki support from skills/strategy text (data.js effects lack direct ki stat key)
    const pFullText = (p.skill?.text || "") + " " + (p.strategy?.text || "");
    if (/(?:気の自然増加|消費気を?\d+[%％]?軽減|気を?\d+増|巨大化気を?\d+[%％]?軽減|気力|撃破時に気)/.test(pFullText)) {
      score += 15;
      if (!reasons.includes("✨ 気軽減・増")) reasons.push("✨ 気軽減・増");
    }

    // Check if targetCastle provides 鼓舞 or ally buffs that p benefits from
    const targetEffects = [];
    if (targetCastle.skill && targetCastle.skill.effects) targetEffects.push(...targetCastle.skill.effects);
    if (targetCastle.strategy && targetCastle.strategy.effects) targetEffects.push(...targetCastle.strategy.effects);

    targetEffects.forEach(ef => {
      if (ef.target !== "self") {
        score += 10;
        if (!reasons.includes("🤝 相互鼓舞・支援")) reasons.push("🤝 相互鼓舞・支援");
      }
    });

    if (score >= 25) {
      // Bonus if user owns this partner
      const isOwned = ownership.owned.has(p.id);
      partners.push({
        castle: p,
        score: score + (isOwned ? 5 : 0),
        reasons: reasons.slice(0, 3),
        isOwned
      });
    }
  });

  partners.sort((a, b) => b.score - a.score);
  const top10 = partners.slice(0, 10);
  synergyCache.set(targetCastle.id, top10);
  return top10;
}

function renderCastleSynergy(targetCastle) {
  const container = document.getElementById("detailSynergyList");
  if (!container) return;

  const topPartners = calculateCastleSynergy(targetCastle);
  if (topPartners.length === 0) {
    container.innerHTML = `<div style="font-size:11.5px; color:var(--text-sub); padding:10px;">相乗効果の高い相方候補が見つかりませんでした。</div>`;
    return;
  }

  container.innerHTML = topPartners.map(({ castle: p, score, reasons, isOwned }) => {
    const inParty = party.some(slot => slot && slot.id === p.id);
    const badgesHtml = reasons.map(r => `<span class="synergy-chip">${escapeHtml(r)}</span>`).join("");

    return `
      <div class="synergy-card">
        <div class="synergy-card-left" onclick="openCastleDetail('${escapeHtml(p.id)}')" style="cursor:pointer;" title="詳細を見る">
          ${getIconHtml(p, 36)}
          <div class="synergy-card-info">
            <div class="synergy-card-name">
              <strong>${escapeHtml(p.name)}</strong>
              <span style="font-size:10.5px; color:var(--text-sub); margin-left:3px;">★${p.rarity} [${p.subType || p.castleType}] ${p.weapon}</span>
              ${isOwned ? '<span style="font-size:9.5px; color:#27ae60; margin-left:3px;">✓所持</span>' : ''}
            </div>
            <div class="synergy-badges-row">
              ${badgesHtml}
            </div>
          </div>
        </div>
        <div class="synergy-card-right">
          <button type="button" class="btn btn-xs ${inParty ? 'btn-remove' : 'btn-primary'}" onclick="quickToggleParty('${escapeHtml(p.id)}')">
            ${inParty ? '✕ 編成外' : '+ 編成'}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function quickToggleParty(castleId) {
  pushUndoSnapshot();
  const inPartyIdx = party.findIndex(p => p && p.id === castleId);
  if (inPartyIdx >= 0) {
    party.splice(inPartyIdx, 1);
  } else {
    if (party.filter(Boolean).length >= 8) {
      alert("編成枠がいっぱいです (最大8体)。空き枠を作ってください。");
      return;
    }
    const newMember = { id: castleId, strategyOn: true, specialOn: true, giantStep: 5 };
    const emptyIdx = party.findIndex(p => !p);
    if (emptyIdx !== -1) {
      party[emptyIdx] = newMember;
    } else {
      party.push(newMember);
    }
  }
  if (partyPresets && partyPresets[currentPresetIdx]) {
    partyPresets[currentPresetIdx].party = party;
  }
  saveParty();
  updateUndoButtonUI();
  renderDashboard();
  if (activeDetailCastleId) {
    const c = getCastleById(activeDetailCastleId);
    if (c) renderCastleSynergy(c);
  }
}

// --- Prompt 14: Recommended Weapons for Castles ---
function getRecommendedWeapons(castle, limit = 3) {
  if (!castle || !castle.weapon || !window.SCRE_WEAPONS) return [];
  const candidates = window.SCRE_WEAPONS.filter(w => w.type === castle.weapon);
  if (candidates.length === 0) return [];

  const allText = [
    castle.skill?.text || '',
    castle.strategy?.text || '',
    castle.special?.text || '',
    ...(castle.allSkills || []).map(s => s.text || ''),
    ...(castle.allStrategies || []).map(s => s.text || '')
  ].join(' ');

  const hasBlast = castle.weapon === '大砲' || /爆風|直撃ボーナス/.test(allText);
  const isBlocker = /足止め/.test(allText) || castle.weapon === '盾';
  const isRanged = castle.rangeKind === '遠' || castle.rangeKind === '遠近';
  const isMelee = castle.rangeKind === '近';

  const scored = candidates.map(w => {
    let score = (w.atk || 0) * 0.5 + (w.rarity || 1) * 6;
    const reasons = [];
    const eff = w.effectText || '';

    // 1. 高攻撃力
    if ((w.atk || 0) >= 80) {
      score += 30;
      reasons.push('同武器種で最高峰の高火力');
    } else if ((w.atk || 0) >= 60) {
      score += 15;
      reasons.push('高水準の攻撃力');
    }

    // 2. 爆風・直撃ボーナス
    if (/爆風|直撃ボーナス/.test(eff)) {
      if (hasBlast) {
        score += 40;
        reasons.push('爆風範囲・直撃ダメージと相乗');
      } else {
        // 爆風を持たない城娘への爆風武器は大幅減点
        score -= 60;
      }
    }

    // 3. 射程上昇
    if (/射程\+\d+|射程が.*?(?:上昇|倍)/.test(eff)) {
      if (isRanged) {
        score += 30;
        reasons.push('遠隔の攻撃・支援射程を拡大');
      } else {
        score += 15;
        reasons.push('近接の巻き込み範囲を拡張');
      }
    }

    // 4. 与えるダメージ・与ダメ
    if (/与えるダメージ.*?倍|与ダメージ.*?上昇/.test(eff)) {
      score += 35;
      reasons.push('高防御の敵に有効なダメージ倍率を付与');
    }

    // 5. 防御無視・術ダメージ
    if (/防御を?.*?(?:無視|0)|術ダメージ/.test(eff)) {
      score += 30;
      reasons.push('高防御兜を貫通する術・防御無視効果');
    }

    // 6. 攻撃速度・隙短縮
    if (/攻撃速度\+\d+|攻撃後の隙.*?短縮/.test(eff)) {
      score += 25;
      reasons.push('手数を増やしてDPS底上げ');
    }

    // 7. 足止め
    if (/足止め/.test(eff)) {
      if (isBlocker || isMelee) {
        score += 25;
        reasons.push('前線での敵侵攻を食い止める足止め');
      } else {
        score += 5;
      }
    }

    // 8. 気軽減・気回復
    if (/計略消費気.*?軽減|巨大化気.*?軽減|気.*?回復/.test(eff)) {
      score += 25;
      reasons.push('消費気を軽減し展開を迅速化');
    }

    // 9. 計略短縮
    if (/計略再使用.*?短縮/.test(eff) && castle.strategy) {
      score += 25;
      reasons.push('強力な計略の回転率を大幅向上');
    }

    // 10. モチーフ城名一致
    const baseName = (castle.name || "").replace(/^［.*?］/, "");
    if (eff.includes(castle.name) || (baseName && eff.includes(baseName))) {
      score += 30;
      reasons.push('専用モチーフ・特効シナジー');
    }

    const reasonText = reasons.length > 0 ? reasons.slice(0, 2).join('・') : 'バランスの良いステータスと汎用性能';
    return { weapon: w, score, reason: reasonText };
  });

  scored.sort((a, b) => b.score - a.score || (b.weapon.atk || 0) - (a.weapon.atk || 0));
  return scored.slice(0, limit);
}

function renderCastleRecommendedWeapons(targetCastle) {
  const container = document.getElementById("detailRecommendedWeaponsList");
  if (!container) return;

  const recList = getRecommendedWeapons(targetCastle, 3);
  if (recList.length === 0) {
    container.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:8px 12px; background:var(--nav-bg); border-radius:6px;">データなし (この武器種の装備データ、または固定武器のためおすすめ武器はありません)</div>`;
    return;
  }

  container.innerHTML = recList.map(({ weapon: w, reason }, idx) => {
    const rankClass = idx === 0 ? "rank-1" : idx === 1 ? "rank-2" : "rank-3";
    const stars = w.rarity ? '★'.repeat(Math.min(5, w.rarity)) : '-';
    const atkLabel = w.atk !== null && w.atk !== undefined ? `攻 +${w.atk}` : '攻 -';
    const defLabel = w.def !== null && w.def !== undefined ? ` 防 +${w.def}` : '';

    return `
      <div class="weapon-rec-card">
        <div class="weapon-rec-header">
          <div class="weapon-rec-title-wrap">
            <span class="weapon-rec-rank ${rankClass}">おすすめ #${idx + 1}</span>
            <span class="weapon-rec-rarity">${stars}</span>
            <strong class="weapon-rec-name">${escapeHtml(w.name)}</strong>
          </div>
          <span class="weapon-rec-atk">${atkLabel}${defLabel}</span>
        </div>
        ${w.effectText ? `<div class="weapon-rec-effect">${escapeHtml(w.effectText)}</div>` : ''}
        <div class="weapon-rec-reason">💡 <strong>おすすめ理由:</strong> ${escapeHtml(reason)}</div>
      </div>
    `;
  }).join("");
}

// --- A6: 城巡りマップ (Prefecture Cartogram & Real Castle Photos) ---
const JAPAN_PREFECTURES = [
  { id: "hokkaido", name: "北海道", x: 10, y: 0, region: "北海道" },
  { id: "aomori", name: "青森県", x: 10, y: 1, region: "東北" },
  { id: "iwate", name: "岩手県", x: 10, y: 2, region: "東北" },
  { id: "akita", name: "秋田県", x: 9, y: 2, region: "東北" },
  { id: "miyagi", name: "宮城県", x: 10, y: 3, region: "東北" },
  { id: "yamagata", name: "山形県", x: 9, y: 3, region: "東北" },
  { id: "fukushima", name: "福島県", x: 10, y: 4, region: "東北" },
  { id: "ibaraki", name: "茨城県", x: 10, y: 5, region: "関東" },
  { id: "tochigi", name: "栃木県", x: 9, y: 5, region: "関東" },
  { id: "gunma", name: "群馬県", x: 8, y: 5, region: "関東" },
  { id: "chiba", name: "千葉県", x: 10, y: 6, region: "関東" },
  { id: "saitama", name: "埼玉県", x: 9, y: 6, region: "関東" },
  { id: "tokyo", name: "東京都", x: 9, y: 7, region: "関東" },
  { id: "kanagawa", name: "神奈川県", x: 9, y: 8, region: "関東" },
  { id: "niigata", name: "新潟県", x: 8, y: 4, region: "中部" },
  { id: "toyama", name: "富山県", x: 7, y: 4, region: "中部" },
  { id: "ishikawa", name: "石川県", x: 6, y: 4, region: "中部" },
  { id: "fukui", name: "福井県", x: 6, y: 5, region: "中部" },
  { id: "nagano", name: "長野県", x: 8, y: 6, region: "中部" },
  { id: "yamanashi", name: "山梨県", x: 8, y: 7, region: "中部" },
  { id: "gifu", name: "岐阜県", x: 7, y: 6, region: "中部" },
  { id: "shizuoka", name: "静岡県", x: 8, y: 8, region: "中部" },
  { id: "aichi", name: "愛知県", x: 7, y: 7, region: "中部" },
  { id: "mie", name: "三重県", x: 6, y: 7, region: "近畿" },
  { id: "shiga", name: "滋賀県", x: 6, y: 6, region: "近畿" },
  { id: "kyoto", name: "京都府", x: 5, y: 5, region: "近畿" },
  { id: "osaka", name: "大阪府", x: 5, y: 6, region: "近畿" },
  { id: "hyogo", name: "兵庫県", x: 4, y: 5, region: "近畿" },
  { id: "nara", name: "奈良県", x: 5, y: 7, region: "近畿" },
  { id: "wakayama", name: "和歌山県", x: 5, y: 8, region: "近畿" },
  { id: "tottori", name: "鳥取県", x: 3, y: 5, region: "中国" },
  { id: "shimane", name: "島根県", x: 2, y: 5, region: "中国" },
  { id: "okayama", name: "岡山県", x: 3, y: 6, region: "中国" },
  { id: "hiroshima", name: "広島県", x: 2, y: 6, region: "中国" },
  { id: "yamaguchi", name: "山口県", x: 1, y: 6, region: "中国" },
  { id: "kagawa", name: "香川県", x: 3, y: 7, region: "四国" },
  { id: "tokushima", name: "徳島県", x: 3, y: 8, region: "四国" },
  { id: "ehime", name: "愛媛県", x: 2, y: 7, region: "四国" },
  { id: "kochi", name: "高知県", x: 2, y: 8, region: "四国" },
  { id: "fukuoka", name: "福岡県", x: 1, y: 7, region: "九州" },
  { id: "saga", name: "佐賀県", x: 0, y: 7, region: "九州" },
  { id: "nagasaki", name: "長崎県", x: 0, y: 8, region: "九州" },
  { id: "oita", name: "大分県", x: 1, y: 8, region: "九州" },
  { id: "kumamoto", name: "熊本県", x: 0, y: 9, region: "九州" },
  { id: "miyazaki", name: "宮崎県", x: 1, y: 9, region: "九州" },
  { id: "kagoshima", name: "鹿児島県", x: 0, y: 10, region: "九州" },
  { id: "okinawa", name: "沖縄県", x: 3, y: 10, region: "沖縄" }
];

let selectedMapPref = "兵庫県";

function renderMapTab() {
  const container = document.getElementById("japanMapSvgContainer");
  const prefCountEl = document.getElementById("mapVisitedPrefCount");
  const realCountEl = document.getElementById("mapVisitedRealCount");
  const totalRealEl = document.getElementById("mapTotalRealCount");

  if (!container || !window.SCRE_DATA) return;

  // Compute counts per prefecture
  const prefCastles = new Map();
  let totalReal = 0;
  let ownedReal = 0;

  SCRE_DATA.forEach(c => {
    if (c.realCastle) {
      totalReal++;
      if (ownership.owned.has(c.id)) ownedReal++;
    }
    if (c.prefecture) {
      if (!prefCastles.has(c.prefecture)) {
        prefCastles.set(c.prefecture, []);
      }
      prefCastles.get(c.prefecture).push(c);
    }
  });

  let visitedPrefCount = 0;
  JAPAN_PREFECTURES.forEach(p => {
    const list = prefCastles.get(p.name) || [];
    const ownedInPref = list.filter(c => ownership.owned.has(c.id)).length;
    if (ownedInPref > 0) visitedPrefCount++;
  });

  if (prefCountEl) prefCountEl.textContent = `${visitedPrefCount} / 47`;
  if (realCountEl) realCountEl.textContent = `${ownedReal}`;
  if (totalRealEl) totalRealEl.textContent = `${totalReal}`;

  // Build SVG Cartogram: 11 x 11 grid, cellSize 52px, viewBox 0 0 620 620
  const cellSize = 50;
  const gap = 4;
  const offsetX = 10;
  const offsetY = 10;

  const tilesSvg = JAPAN_PREFECTURES.map(p => {
    const list = prefCastles.get(p.name) || [];
    const total = list.length;
    const owned = list.filter(c => ownership.owned.has(c.id)).length;
    const isSelected = p.name === selectedMapPref;
    const ratio = total > 0 ? (owned / total) : 0;

    const px = offsetX + p.x * (cellSize + gap);
    const py = offsetY + p.y * (cellSize + gap);

    // Color based on region and ownership
    let fillColor = "#e2e8f0";
    let textColor = "#4a5568";
    if (owned > 0) {
      if (ratio === 1) {
        fillColor = "#27ae60"; // 100% completed!
        textColor = "#ffffff";
      } else if (ratio >= 0.5) {
        fillColor = "#2980b9";
        textColor = "#ffffff";
      } else {
        fillColor = "#d4e6f1";
        textColor = "#1b4f72";
      }
    }

    const shortName = p.name.replace(/[都府県]/, "");
    const strokeAttr = isSelected ? 'stroke="#e74c3c" stroke-width="3"' : 'stroke="#cbd5e0" stroke-width="1"';

    return `
      <g class="map-pref-tile" data-pref="${escapeHtml(p.name)}" style="cursor:pointer;" transform="translate(${px}, ${py})">
        <rect width="${cellSize}" height="${cellSize}" rx="6" fill="${fillColor}" ${strokeAttr} />
        <text x="${cellSize / 2}" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="${textColor}">${shortName}</text>
        <text x="${cellSize / 2}" y="36" text-anchor="middle" font-size="12" fill="${textColor}">${owned}/${total}</text>
      </g>
    `;
  }).join("");

  container.innerHTML = `
    <svg viewBox="0 0 620 620" class="japan-cartogram-svg" style="width:100%; height:auto; max-height:560px;">
      ${tilesSvg}
    </svg>
  `;

  // Attach click listeners to tiles
  container.querySelectorAll(".map-pref-tile").forEach(tile => {
    tile.addEventListener("click", () => {
      const pref = tile.getAttribute("data-pref");
      if (pref) selectMapPrefecture(pref);
    });
  });

  selectMapPrefecture(selectedMapPref);
}

function selectMapPrefecture(prefName) {
  selectedMapPref = prefName;

  // Re-highlight SVG tiles
  document.querySelectorAll("#japanMapSvgContainer .map-pref-tile").forEach(tile => {
    const isSel = tile.getAttribute("data-pref") === prefName;
    const rect = tile.querySelector("rect");
    if (rect) {
      rect.setAttribute("stroke", isSel ? "#e74c3c" : "#cbd5e0");
      rect.setAttribute("stroke-width", isSel ? "3" : "1");
    }
  });

  const placeholder = document.getElementById("mapPrefPlaceholder");
  const content = document.getElementById("mapPrefContent");
  if (!content) return;

  if (placeholder) placeholder.style.display = "none";
  content.style.display = "block";

  const list = SCRE_DATA.filter(c => c.prefecture === prefName);
  const ownedCount = list.filter(c => ownership.owned.has(c.id)).length;
  const pct = list.length > 0 ? Math.round((ownedCount / list.length) * 100) : 0;

  // Sort: owned first, then rarity desc
  list.sort((a, b) => {
    const aOwned = ownership.owned.has(a.id) ? 1 : 0;
    const bOwned = ownership.owned.has(b.id) ? 1 : 0;
    if (bOwned !== aOwned) return bOwned - aOwned;
    return (b.rarity || 1) - (a.rarity || 1);
  });

  const castlesHtml = list.map(c => {
    const isOwned = ownership.owned.has(c.id);
    const rc = c.realCastle;

    return `
      <div class="map-castle-card" style="display:flex; gap:10px; padding:8px; border-bottom:1px solid var(--border-color); align-items:center;">
        <div onclick="openCastleDetail('${escapeHtml(c.id)}')" style="cursor:pointer;" title="詳細を見る">
          ${getIconHtml(c, 40)}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
            <strong style="font-size:var(--fs-emphasis, 14px); cursor:pointer;" onclick="openCastleDetail('${escapeHtml(c.id)}')">${escapeHtml(c.name)}</strong>
            <span class="badge badge-rarity badge-rarity-${c.rarity}">★${c.rarity}</span>
            <span class="badge badge-attr badge-attr-${c.subType || c.castleType}">${c.subType || c.castleType}</span>
            <span style="font-size:var(--fs-sub, 12px); color:var(--text-sub);">${c.weapon}</span>
          </div>
          ${rc ? `
            <div style="font-size:var(--fs-body, 13px); color:var(--text-sub); margin-top:3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span>🏯 実城: ${escapeHtml(rc.name)}</span>
              ${rc.photoUrl ? `<a href="${escapeHtml(rc.photoUrl)}" target="_blank" rel="noopener noreferrer" style="color:#2980b9; font-size:var(--fs-sub, 12px); font-weight:bold;">[写真 ↗]</a>` : ''}
              ${rc.articleUrl ? `<a href="${escapeHtml(rc.articleUrl)}" target="_blank" rel="noopener noreferrer" style="color:#2980b9; font-size:var(--fs-sub, 12px); font-weight:bold;">[Wiki ↗]</a>` : ''}
            </div>
          ` : ''}
        </div>
        <div>
          <button type="button" class="btn btn-xs ${isOwned ? 'btn-success' : 'btn-outline'}" data-action="toggle-owned" data-id="${escapeHtml(c.id)}">
            ${isOwned ? '✓ 所持' : '未所持'}
          </button>
        </div>
      </div>
    `;
  }).join("");

  content.innerHTML = `
    <div style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--border-color);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0; font-size:var(--fs-heading, 17px);">📍 ${escapeHtml(prefName)}</h3>
        <span style="font-weight:bold; font-size:var(--fs-emphasis, 14px); color:#27ae60;">制覇率: ${ownedCount} / ${list.length} 城 (${pct}%)</span>
      </div>
      <div style="background:#e2e8f0; border-radius:6px; height:8px; width:100%; margin-top:6px; overflow:hidden;">
        <div style="background:#27ae60; height:100%; width:${pct}%;"></div>
      </div>
    </div>
    <div class="map-pref-castles-list" style="max-height:460px; overflow-y:auto;">
      ${list.length > 0 ? castlesHtml : '<div style="color:var(--text-sub); padding:12px;">この都道府県に紐付く城娘は登録されていません。</div>'}
    </div>
  `;
}

// --- A1: 城娘クイズ (tab-quiz) ---
let quizActiveFormat = "ruby"; // 'ruby' | 'icon' | 'photo'
let quizQuestions = [];
let quizCurrentIndex = 0;
let quizScore = 0;
let hasInitQuizListeners = false;

function renderQuizTab() {
  const bestScoreEl = document.getElementById("quizBestScore");
  if (bestScoreEl) {
    const saved = localStorage.getItem("scre-helper:quiz:v1");
    bestScoreEl.textContent = saved ? `自己ベスト: ${saved}点` : "自己ベスト: 未挑戦";
  }

  if (!hasInitQuizListeners) {
    hasInitQuizListeners = true;
    const formatBtns = document.querySelectorAll("#quizFormatBtns .btn-quiz-format");
    formatBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        formatBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        quizActiveFormat = btn.getAttribute("data-format") || "ruby";
        const card = document.getElementById("quizCard");
        if (card && card.style.display !== "none") {
          startQuiz(quizActiveFormat);
        }
      });
    });

    const btnStart = document.getElementById("btnStartQuiz");
    if (btnStart) {
      btnStart.onclick = () => startQuiz(quizActiveFormat);
    }

    const btnRestart = document.getElementById("btnRestartQuiz");
    if (btnRestart) {
      btnRestart.onclick = () => {
        document.getElementById("quizResultCard").style.display = "none";
        startQuiz(quizActiveFormat);
      };
    }

    const btnNext = document.getElementById("btnNextQuizQuestion");
    if (btnNext) {
      btnNext.onclick = nextQuizQuestion;
    }
  }
}

function startQuiz(format) {
  quizActiveFormat = format || "ruby";
  quizCurrentIndex = 0;
  quizScore = 0;

  // Filter pool based on format
  let pool = SCRE_DATA;
  if (quizActiveFormat === "photo") {
    pool = SCRE_DATA.filter(c => c.realCastle && c.realCastle.photoUrl);
  } else if (quizActiveFormat === "ruby") {
    pool = SCRE_DATA.filter(c => c.ruby && c.ruby.trim().length > 0);
  }

  if (pool.length < 4) {
    alert("クイズ対象の城娘データが不足しています。");
    return;
  }

  // Shuffle and pick 10 target castles
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  const targets = shuffled.slice(0, 10);

  quizQuestions = targets.map(target => {
    // Pick 3 wrong choices
    let wrong = [];
    if (quizActiveFormat === "photo") {
      const targetRcName = target.realCastle ? target.realCastle.name : null;
      const seenRcNames = new Set(targetRcName ? [targetRcName] : []);
      const candidates = pool
        .filter(c => c.id !== target.id && (!targetRcName || !c.realCastle || c.realCastle.name !== targetRcName))
        .sort(() => Math.random() - 0.5);

      for (const cand of candidates) {
        const rcName = cand.realCastle ? cand.realCastle.name : cand.name;
        if (!seenRcNames.has(rcName)) {
          seenRcNames.add(rcName);
          wrong.push(cand);
          if (wrong.length === 3) break;
        }
      }
    } else {
      wrong = pool.filter(c => c.id !== target.id).sort(() => Math.random() - 0.5).slice(0, 3);
    }
    const choices = [target, ...wrong].sort(() => Math.random() - 0.5);
    return {
      target,
      choices,
      answered: false,
      selectedId: null,
      isCorrect: false
    };
  });

  document.getElementById("quizCard").style.display = "block";
  document.getElementById("quizResultCard").style.display = "none";
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const q = quizQuestions[quizCurrentIndex];
  if (!q) return;

  const numEl = document.getElementById("quizQuestionNum");
  const trackerEl = document.getElementById("quizScoreTracker");
  const clueEl = document.getElementById("quizClueArea");
  const choicesEl = document.getElementById("quizChoicesGrid");
  const feedbackEl = document.getElementById("quizFeedbackBox");

  if (numEl) numEl.textContent = `第 ${quizCurrentIndex + 1} 問 / 全 10 問`;
  if (trackerEl) trackerEl.textContent = `正解数: ${quizScore}`;
  if (feedbackEl) feedbackEl.style.display = "none";

  // Clue display based on format
  if (clueEl) {
    if (quizActiveFormat === "ruby") {
      clueEl.innerHTML = `
        <div style="font-size:12px; color:var(--text-sub); margin-bottom:6px;">このふりがなの城娘はだれ？</div>
        <div class="quiz-ruby-clue" style="font-size:24px; font-weight:bold; color:var(--primary-color); letter-spacing:2px;">
          「${escapeHtml(q.target.ruby)}」
        </div>
      `;
    } else if (quizActiveFormat === "icon") {
      const primarySrc = `icons/${encodeURIComponent(q.target.name)}.png`;
      const fallbackUrl = q.target.illustUrl || "";
      clueEl.innerHTML = `
        <div style="font-size:12px; color:var(--text-sub); margin-bottom:8px;">この顔の城娘はだれ？ (アイコン拡大)</div>
        <div class="quiz-face-zoom-box" style="width:110px; height:110px; border-radius:50%; overflow:hidden; margin:0 auto; box-shadow:0 4px 10px rgba(0,0,0,0.15); border:3px solid var(--border-color); background:#eee; display:flex; align-items:center; justify-content:center;">
          <img src="${primarySrc}" onerror="this.onerror=null; if('${escapeHtml(fallbackUrl)}') { this.src='${escapeHtml(fallbackUrl)}'; } else { this.style.display='none'; this.parentElement.innerText='🏯'; }" style="width:100%; height:100%; object-fit:cover; transform:scale(2.2); transform-origin:center;" alt="クイズ手がかり" />
        </div>
      `;
    } else if (quizActiveFormat === "photo") {
      const rc = q.target.realCastle;
      const photoUrl = (rc && rc.photoUrl) ? rc.photoUrl : (q.target.illustUrl || "");
      const author = (rc && rc.author) ? rc.author : "Wikimedia Commons";
      const license = (rc && rc.license) ? rc.license : "CC BY-SA";
      clueEl.innerHTML = `
        <div style="font-size:12px; color:var(--text-sub); margin-bottom:8px;">この実在する城をモチーフにした城娘はだれ？</div>
        <div style="max-width:340px; margin:0 auto; border-radius:8px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.12); border:1px solid var(--border-color);">
          <img src="${escapeHtml(photoUrl)}" style="width:100%; max-height:220px; object-fit:cover; display:block;" alt="実城写真" />
          <div style="font-size:10.5px; color:var(--text-sub); padding:4px 8px; background:#fafafa; text-align:center;">
            出典: ${escapeHtml(author)} (${escapeHtml(license)})
          </div>
        </div>
      `;
    }
  }

  // Choices grid
  if (choicesEl) {
    choicesEl.innerHTML = q.choices.map((c, idx) => `
      <button type="button" class="btn btn-outline quiz-choice-btn" data-choice-id="${escapeHtml(c.id)}" style="display:flex; align-items:center; gap:8px; padding:10px; text-align:left;">
        <span style="font-weight:bold; font-size:13px; color:var(--text-sub); width:20px;">${idx + 1}.</span>
        <div style="flex:1;">
          <strong style="font-size:13px;">${escapeHtml(c.name)}</strong>
          <div style="font-size:11px; color:var(--text-sub);">★${c.rarity} [${c.subType || c.castleType}] ${c.weapon}</div>
        </div>
      </button>
    `).join("");

    choicesEl.querySelectorAll(".quiz-choice-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const chosenId = btn.getAttribute("data-choice-id");
        if (chosenId) handleQuizChoice(chosenId);
      });
    });
  }
}

function handleQuizChoice(chosenId) {
  const q = quizQuestions[quizCurrentIndex];
  if (!q || q.answered) return;

  q.answered = true;
  q.selectedId = chosenId;
  q.isCorrect = (chosenId === q.target.id);
  if (q.isCorrect) quizScore++;

  // Highlight choices
  const choicesEl = document.getElementById("quizChoicesGrid");
  if (choicesEl) {
    choicesEl.querySelectorAll(".quiz-choice-btn").forEach(btn => {
      btn.disabled = true;
      const cid = btn.getAttribute("data-choice-id");
      if (cid === q.target.id) {
        btn.classList.remove("btn-outline");
        btn.classList.add("quiz-choice-correct");
        btn.style.background = "#d4edda";
        btn.style.borderColor = "#28a745";
        btn.style.color = "#155724";
      } else if (cid === chosenId && !q.isCorrect) {
        btn.classList.remove("btn-outline");
        btn.classList.add("quiz-choice-wrong");
        btn.style.background = "#f8d7da";
        btn.style.borderColor = "#dc3545";
        btn.style.color = "#721c24";
      }
    });
  }

  // Feedback box
  const feedbackEl = document.getElementById("quizFeedbackBox");
  const msgEl = document.getElementById("quizFeedbackMessage");
  const detailActionEl = document.getElementById("quizFeedbackDetailAction");
  const nextBtn = document.getElementById("btnNextQuizQuestion");

  if (feedbackEl && msgEl) {
    feedbackEl.style.display = "block";
    if (q.isCorrect) {
      msgEl.innerHTML = `<span style="color:#27ae60; font-weight:bold; font-size:15px;">🎉 正解！</span> 見事です！`;
    } else {
      msgEl.innerHTML = `<span style="color:#e74c3c; font-weight:bold; font-size:15px;">❌ 不正解...</span> 正解は <strong>「${escapeHtml(q.target.name)}」</strong> でした。`;
    }

    if (detailActionEl) {
      detailActionEl.innerHTML = `
        <button type="button" class="btn btn-xs btn-outline" onclick="openCastleDetail('${escapeHtml(q.target.id)}')">
          城娘詳細を見る ↗
        </button>
      `;
    }

    if (nextBtn) {
      nextBtn.textContent = (quizCurrentIndex + 1 < quizQuestions.length) ? "次の問題へ ➔" : "結果発表 🏆";
    }
  }

  const trackerEl = document.getElementById("quizScoreTracker");
  if (trackerEl) trackerEl.textContent = `正解数: ${quizScore}`;
}

function nextQuizQuestion() {
  quizCurrentIndex++;
  if (quizCurrentIndex < quizQuestions.length) {
    renderQuizQuestion();
  } else {
    showQuizResult();
  }
}

function showQuizResult() {
  document.getElementById("quizCard").style.display = "none";
  const resultCard = document.getElementById("quizResultCard");
  const titleEl = document.getElementById("quizResultTitle");
  const scoreEl = document.getElementById("quizResultScore");
  const commentEl = document.getElementById("quizResultComment");

  if (!resultCard) return;
  resultCard.style.display = "block";

  const total = quizQuestions.length;
  const pct = Math.round((quizScore / total) * 100);

  if (scoreEl) scoreEl.textContent = `${quizScore} / ${total} 問正解 (${pct}点)`;

  let rankTitle = "見習い殿";
  let rankComment = "日々修練中！もっと城娘たちと触れ合いましょう♪";

  if (pct === 100) {
    rankTitle = "👑 天下無双の城郭博士！城プロREマスター殿！";
    rankComment = "全問正解！素晴らしい知識です！全国の城娘たちも大喜びしています！";
  } else if (pct >= 80) {
    rankTitle = "🏯 一国一城の主！上級殿！";
    rankComment = "素晴らしい正解率です！ほぼ完璧に城娘たちを把握しています！";
  } else if (pct >= 50) {
    rankTitle = "⚔️ 一騎当千の将！中堅殿！";
    rankComment = "半分以上正解！あと少しで上級殿の仲間入りです！";
  }

  if (titleEl) titleEl.textContent = rankTitle;
  if (commentEl) commentEl.textContent = rankComment;

  // Save best score
  const saved = parseInt(localStorage.getItem("scre-helper:quiz:v1"), 10) || 0;
  if (pct > saved) {
    localStorage.setItem("scre-helper:quiz:v1", pct.toString());
  }

  const bestScoreEl = document.getElementById("quizBestScore");
  if (bestScoreEl) {
    const curBest = Math.max(saved, pct);
    bestScoreEl.textContent = `自己ベスト: ${curBest}点`;
  }
}


  // A2: Challenge buttons
  const btnRollChal = document.getElementById("btnRollChallenge");
  if (btnRollChal) btnRollChal.addEventListener("click", rollNewChallenge);
  const btnAutoChal = document.getElementById("btnAutoFillChallenge");
  if (btnAutoChal) btnAutoChal.addEventListener("click", autoFillChallenge);
  const btnClearChal = document.getElementById("btnClearChallenge");
  if (btnClearChal) btnClearChal.addEventListener("click", clearChallenge);

  
  // Prompt 9 & 17: Roman Cannon Simulator
  const btnTogRoman = document.getElementById("btnToggleRomanSimulator");
  if (btnTogRoman) {
    btnTogRoman.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleRomanSimulator();
    });
  }
  const hdrRoman = document.getElementById("romanSimulatorHeader");
  if (hdrRoman) hdrRoman.addEventListener("click", toggleRomanSimulator);

  const selRomanCannon = document.getElementById("romanCannonSelect");
  if (selRomanCannon) {
    selRomanCannon.addEventListener("change", function() {
      setRomanCannonSlot(this.value);
    });
  }

  const togRomanStrat = document.getElementById("romanStrategyToggle");
  if (togRomanStrat) {
    togRomanStrat.addEventListener("change", function() {
      romanStratMode = this.checked;
      renderRomanSimulator();
    });
  }

  ["romanEnemyDef", "romanEnemyHp", "romanEnemyRed"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => renderRomanSimulator());
  });

  document.querySelectorAll(".roman-preset-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      const defVal = this.dataset.def;
      const defInput = document.getElementById("romanEnemyDef");
      if (defInput) {
        defInput.value = defVal;
        renderRomanSimulator();
      }
    });
  });

  const supWrap = document.getElementById("romanSupportersWrap");
  if (supWrap) {
    supWrap.addEventListener("change", function(e) {
      if (e.target && e.target.classList.contains("roman-supporter-check")) {
        const slotIdx = parseInt(e.target.dataset.slotIdx, 10);
        toggleRomanSupporter(slotIdx);
      }
    });
  }

  // A5 & Prompt 17: Damage Checker buttons & inputs
  const btnTogDmg = document.getElementById("btnToggleDamageChecker");
  if (btnTogDmg) {
    btnTogDmg.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDamageChecker();
    });
  }
  const hdrDmg = document.getElementById("dmgCheckerHeader");
  if (hdrDmg) hdrDmg.addEventListener("click", toggleDamageChecker);
  const btnRecalcDmg = document.getElementById("btnRecalcDamage");
  if (btnRecalcDmg) btnRecalcDmg.addEventListener("click", () => renderDamageChecker());
  ["dmgEnemyDef", "dmgEnemyHp", "dmgEnemyRed", "dmgEnemyImmuneDefIgnore"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => renderDamageChecker());
  });

  // A3: View mode buttons & extended filters
  const btnVCard = document.getElementById("btnViewCard");
  if (btnVCard) btnVCard.addEventListener("click", () => setListViewMode("card"));
  const btnVGallery = document.getElementById("btnViewGallery");
  if (btnVGallery) btnVGallery.addEventListener("click", () => setListViewMode("gallery"));
  ["filterIllustrator", "filterVoiceActor", "filterCountry"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => { listCurrentPage = 1; renderAllCastles(); });
  });

  // Maker: Export custom image
  const btnExpCustom = document.getElementById("btnExportCustomTierImage");
  if (btnExpCustom) {
    btnExpCustom.addEventListener("click", () => exportTierToImage("custom"));
  }

  // Pool Filters oninput / onchange
  ["tierPoolSearch", "tierPoolRarity", "tierPoolType", "tierPoolWeapon", "tierPoolOwnership"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => renderTierPool(true));
    }
  });

  // =========================================================================
  // 第32弾: 実戦プレイ動画解析に基づく新戦術シミュレーション群 (1〜11)
  // =========================================================================

  const SCRE_BOSS_CATALOG = [
    {
      id: "odin",
      name: "オーディン",
      stageKeyword: "オーディン",
      hp: 1200000,
      atk: 18000,
      def: 2500,
      range: 480,
      moveSpeed: "低速 (0.8)",
      moveSpeedVal: 0.8,
      isFlying: true,
      appearanceWave: 3,
      attackInterval: 3.2,
      snipeThreat: "高 (射程480・蔵および殿直撃ゾーン)",
      hasTransform: true,
      transformDesc: "合戦後半に形態変化。攻撃対象が全敵同時攻撃に変化し、飛行状態を維持。",
      transformKeywords: ["飛行化", "全体同時攻撃"],
      gimmick: "長射程全対象攻撃。正面のデコイまたは足止め役がいないと殿が即死。"
    },
    {
      id: "toshiie",
      name: "覇・前田利家",
      stageKeyword: "前田利家",
      hp: 1450000,
      atk: 19500,
      def: 3200,
      range: 360,
      moveSpeed: "中速 (1.0)",
      moveSpeedVal: 1.0,
      isFlying: false,
      appearanceWave: 4,
      attackInterval: 2.8,
      snipeThreat: "高 (高耐久・直線突進型・殿侵入危険)",
      hasTransform: true,
      transformDesc: "耐久50%以下で猛進・攻撃力1.5倍・足止め無効化。",
      transformKeywords: ["猛進", "火力倍増", "足止め無効"],
      gimmick: "高防御かつ近接多段攻撃。足止め役の即死回避と防御低下デバフが必須。"
    },
    {
      id: "chronos",
      name: "クロノス",
      stageKeyword: "クロノス",
      hp: 1350000,
      atk: 17500,
      def: 2800,
      range: 520,
      moveSpeed: "低速 (0.7)",
      moveSpeedVal: 0.7,
      isFlying: true,
      appearanceWave: 4,
      attackInterval: 3.5,
      snipeThreat: "極高 (超長射程520・殿スナイプ警戒)",
      hasTransform: true,
      transformDesc: "第2形態で時間停止と全域スナイプを発動。",
      transformKeywords: ["飛行化", "全体同時攻撃"],
      gimmick: "超射程による殿スナイプ。避雷針トークンを常に殿の射線上に置くことが必須。"
    },
    {
      id: "enma",
      name: "閻魔大王",
      stageKeyword: "閻魔大王",
      hp: 1500000,
      atk: 16000,
      def: 3500,
      range: 420,
      moveSpeed: "低速 (0.8)",
      moveSpeedVal: 0.8,
      isFlying: false,
      appearanceWave: 4,
      attackInterval: 3.0,
      snipeThreat: "中 (前衛防衛可能・範囲術攻撃)",
      hasTransform: true,
      transformDesc: "裁判ギミック発動時、攻撃対象が3体同時攻撃に増加。",
      transformKeywords: ["巨大化", "全体同時攻撃"],
      gimmick: "審判による防御無視術攻撃。術耐性バフと回復歌舞がキー。"
    },
    {
      id: "izanagi",
      name: "イザナギ",
      stageKeyword: "イザナギ",
      hp: 1400000,
      atk: 18500,
      def: 3000,
      range: 450,
      moveSpeed: "中速 (1.0)",
      moveSpeedVal: 1.0,
      isFlying: false,
      appearanceWave: 4,
      attackInterval: 2.6,
      snipeThreat: "高 (高回転多段連撃・殿被弾注意)",
      hasTransform: true,
      transformDesc: "黄泉津大神招来により広域持続ダメージフィールド展開。",
      transformKeywords: ["影解除", "全体同時攻撃"],
      gimmick: "連続斬撃。盾役の不屈計略または射程外からの移動速度低下ハメが有効。"
    },
    {
      id: "hel",
      name: "ヘル",
      stageKeyword: "ヘル",
      hp: 1300000,
      atk: 17000,
      def: 2600,
      range: 460,
      moveSpeed: "中速 (0.9)",
      moveSpeedVal: 0.9,
      isFlying: false,
      appearanceWave: 4,
      attackInterval: 3.1,
      snipeThreat: "高 (死者召喚・射程内即死級術攻撃)",
      hasTransform: true,
      transformDesc: "半死半生の姿。耐久減少時に被ダメージ50%カットと攻撃速度2倍。",
      transformKeywords: ["影解除", "火力倍増"],
      gimmick: "死霊召喚によるタゲ逸らし。爆風武器または貫通攻撃で本体を狙い撃つ。"
    },
    {
      id: "vishnu",
      name: "ヴィシュヌ",
      stageKeyword: "ヴィシュヌ",
      hp: 1600000,
      atk: 21000,
      def: 3800,
      range: 550,
      moveSpeed: "低速 (0.7)",
      moveSpeedVal: 0.7,
      isFlying: true,
      appearanceWave: 4,
      attackInterval: 3.6,
      snipeThreat: "極高 (最長射程550・殿即死ゾーン)",
      hasTransform: true,
      transformDesc: "変身後、全体光弾スナイプ。影解除とともに全画面攻撃。",
      transformKeywords: ["飛行化", "巨大化", "全体同時攻撃"],
      gimmick: "超高火力・超射程。避雷針伏兵なしでは殿が2発で沈む。"
    },
    {
      id: "osiris",
      name: "オシリス",
      stageKeyword: "オシリス",
      hp: 1550000,
      atk: 16500,
      def: 4000,
      range: 400,
      moveSpeed: "極低速 (0.5)",
      moveSpeedVal: 0.5,
      isFlying: false,
      appearanceWave: 4,
      attackInterval: 3.4,
      snipeThreat: "中 (低速接近・高防御壁)",
      hasTransform: true,
      transformDesc: "冥界の審問官形態。撃破後に1度だけ耐久100%で蘇生・影解除。",
      transformKeywords: ["巨大化", "影解除"],
      gimmick: "復活ギミック。撃破後第2形態への移行に備えて計略温存が必要。"
    },
    {
      id: "satake",
      name: "幻・佐竹義重",
      stageKeyword: "佐竹義重",
      hp: 1100000,
      atk: 15500,
      def: 2200,
      range: 350,
      moveSpeed: "高速 (1.4)",
      moveSpeedVal: 1.4,
      isFlying: true,
      appearanceWave: 3,
      attackInterval: 2.2,
      snipeThreat: "極高 (飛行突進・高速で殿肉薄)",
      hasTransform: false,
      transformDesc: "高速飛行強襲形態。",
      transformKeywords: ["飛行化", "猛進"],
      gimmick: "高速飛行による殿突進。法術・鈴による多段移動低下または弓・鉄砲の対空撃墜が急務。"
    },
    {
      id: "todo",
      name: "真・武神 藤堂高虎",
      stageKeyword: "藤堂高虎",
      hp: 1380000,
      atk: 19000,
      def: 3100,
      range: 390,
      moveSpeed: "中速 (1.0)",
      moveSpeedVal: 1.0,
      isFlying: false,
      appearanceWave: 4,
      attackInterval: 2.7,
      snipeThreat: "高 (高攻撃力・近接2体同時攻撃)",
      hasTransform: true,
      transformDesc: "武神化により攻撃対象増加と被ダメ軽減。",
      transformKeywords: ["火力倍増", "巨大化"],
      gimmick: "近接同時なぎ払い。単体盾受けだけでなくデバフ多段掛けによる火力封殺が必須。"
    }
  ];

  function getBossForStage(stageObj) {
    if (!stageObj) return SCRE_BOSS_CATALOG[0];
    const targetTitle = (stageObj.title || "") + " " + (stageObj.hadesMeta ? stageObj.hadesMeta.bossName : "");
    const found = SCRE_BOSS_CATALOG.find(b => targetTitle.includes(b.stageKeyword) || (stageObj.bossInfo && stageObj.bossInfo.some(txt => txt.includes(b.stageKeyword))));
    if (found) return found;

    const points = stageObj.totalDelibPoints || (stageObj.deliberations ? stageObj.deliberations.length : 10);
    const isFly = /飛行|鳥|虫|天|天狗/.test(JSON.stringify(stageObj.bossInfo || "")) || /飛行/.test(stageObj.title || "");
    const hasTrans = /変身|形態|巨大化|解除|復活|第二/.test(JSON.stringify(stageObj.bossInfo || ""));

    return {
      id: "generic_" + (stageObj.id || "boss"),
      name: stageObj.hadesMeta ? stageObj.hadesMeta.bossName : (stageObj.title.split("-")[1] || "大将兜 / 総大将"),
      stageKeyword: stageObj.title,
      hp: Math.min(1600000, 600000 + points * 30000),
      atk: Math.min(22000, 10000 + points * 350),
      def: Math.min(4000, 1500 + points * 70),
      range: 380,
      moveSpeed: "中速 (1.0)",
      moveSpeedVal: 1.0,
      isFlying: isFly,
      appearanceWave: 4,
      attackInterval: 3.0,
      snipeThreat: points >= 20 ? "高 (高審議ステータス強化・直撃危険)" : "中 (前衛防衛可能)",
      hasTransform: hasTrans,
      transformDesc: hasTrans ? "合戦後半に強化または形態変化する可能性あり。" : "通常形態を維持。",
      transformKeywords: isFly ? ["飛行化"] : (hasTrans ? ["巨大化", "火力倍増"] : []),
      gimmick: "ステージ審議に応じたステータス強化が施された総大将兜。"
    };
  }

  // 1. 審議相性マトリクス（詰み審議警告）
  let currentDelibFilterMode = "all";

  function isWeaponDeliberationMatch(text, wName) {
    const escapedW = wName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|[、，,・/／:：\\s「」【】()（）\\[\\]\\n\\r]|武器種|対象|限定|と)${escapedW}(?:[、，,・/／:：\\s「」【】()（）\\[\\]\\n\\r]|の城娘|城娘|限定|の与ダメ|の攻撃|の防御|の射程|の武器種特性|低下|無効|半減|軽減|制限|と|$)`);
    return pattern.test(text);
  }

  function renderDeliberationMatrix(stageObj) {
    const container = document.getElementById("diagDelibMatrixList");
    const summaryEl = document.getElementById("diagDelibMatrixSummaryBadge");
    if (!container) return;
    container.innerHTML = "";

    if (!stageObj) {
      if (summaryEl) summaryEl.textContent = "";
      return;
    }

    const deliberations = stageObj.deliberations || [];
    if (deliberations.length === 0) {
      if (summaryEl) summaryEl.innerHTML = `<span style="color:#27ae60;">✓ 審議設定なし（安全）</span>`;
      container.innerHTML = `<div style="font-size:12px; color:#666; padding:8px;">このステージには審議が設定されていません。</div>`;
      return;
    }

    const partyCastles = party.filter(Boolean).map(s => getCastleById(s.id)).filter(Boolean);
    const attrCounts = { "平": 0, "水": 0, "山": 0, "平山": 0, "地獄": 0, "無": 0 };
    const weaponCounts = {};
    partyCastles.forEach(c => {
      (c.attributes || []).forEach(a => { if (attrCounts[a] !== undefined) attrCounts[a]++; });
      weaponCounts[c.weapon] = (weaponCounts[c.weapon] || 0) + 1;
    });

    const hasKiProducer = partyCastles.some(c => {
      const fullText = getCastleFullText(c);
      return /気の自然増加|気生成|計略消費気/.test(fullText);
    });

    const hasAilmentImmunity = partyCastles.some(c => {
      const fullText = getCastleFullText(c);
      return /状態異常|暗闇|火傷|麻痺|氷結/.test(fullText) && /無効|回復|軽減/.test(fullText);
    });

    let fatalCount = 0;
    let warningCount = 0;
    let safeCount = 0;

    const evaluatedList = deliberations.map(d => {
      const text = (d.name || "") + " " + (d.effect || "");
      let level = "safe";
      let reason = "現在の編成で影響なし、または対策済みです。";

      if (text.includes("近接限定城娘の与ダメージ99%低下")) {
        const affected = partyCastles.filter(c => c.rangeKind === "近" || c.rangeKind === "近接");
        if (affected.length > 0) {
          level = "fatal";
          reason = `近接限定城娘（${affected.map(c => c.name).join("、")}）の与ダメージが99%カットされます。遠近両用または遠隔城娘への交代が必須です。`;
        }
      } else if (text.includes("遠隔限定城娘の与ダメージ99%低下")) {
        const affected = partyCastles.filter(c => c.rangeKind === "遠" || c.rangeKind === "遠隔");
        if (affected.length > 0) {
          level = "fatal";
          reason = `遠隔限定城娘（${affected.map(c => c.name).join("、")}）の与ダメージが99%カットされます。近接または遠近両用城娘への交代が必須です。`;
        }
      } else {
        let limitHit = false;
        for (const attr of ["平", "水", "山", "平山", "地獄", "無"]) {
          const m = text.match(new RegExp(`${attr}配置制限[（(](\\d+)[）)]`));
          if (m) {
            const limit = parseInt(m[1], 10);
            if (attrCounts[attr] > limit) {
              level = "fatal";
              reason = `${attr}属性の配置制限（${limit}体）を超過して編成中（現在${attrCounts[attr]}体）。制限超過ペナルティ（攻撃・防御激減または巨大化気倍増）を受けます。`;
              limitHit = true;
              break;
            }
          }
        }

        if (!limitHit) {
          if (text.includes("巨大化気") && (text.includes("以外") || text.includes("異なる")) && stageObj.terrain && stageObj.terrain !== "無") {
            const mismatch = partyCastles.filter(c => !(c.attributes || []).includes(stageObj.terrain));
            if (mismatch.length > 0) {
              level = mismatch.length >= 4 ? "fatal" : "warning";
              reason = `地形不一致城娘（${mismatch.map(c => c.name).join("、")}）の巨大化消費気が激増します。${stageObj.terrain}属性への統一または気役の大量投入が必要です。`;
            }
          } else {
            let weaponHit = false;
            for (const [wName, count] of Object.entries(weaponCounts)) {
              if (isWeaponDeliberationMatch(text, wName) && (text.includes("与ダメージ99%低下") || text.includes("無効化") || text.includes("無効"))) {
                level = "fatal";
                reason = `編成内の武器種【${wName}】(${count}体)が大幅低下または無効化されます。他武器種へ変更してください。`;
                weaponHit = true;
                break;
              } else if (isWeaponDeliberationMatch(text, wName) && (text.includes("低下") || text.includes("半減") || text.includes("軽減"))) {
                level = "warning";
                reason = `武器種【${wName}】へのステータス低下審議。火力減少に注意。`;
                weaponHit = true;
                break;
              }
            }

            if (!weaponHit) {
              if (text.includes("能力低下無効") || text.includes("ステータス低下無効")) {
                level = "warning";
                reason = "敵の攻撃力・防御力低下デバフが無効化されます。被ダメージ上昇・与ダメージ低下・隙延長等の「通るデバフ」で対抗してください。";
              } else if (text.includes("気増加") && (text.includes("低下") || text.includes("半減") || text.includes("無効"))) {
                if (!hasKiProducer) {
                  level = "fatal";
                  reason = "気の自然増加が制限されているにもかかわらず、編成に気生成役がいません。初手で展開不能になる恐れがあります。";
                } else {
                  level = "warning";
                  reason = "気増加量低下審議。気役トークン（ノビシャド等）や撃破気計略を積極的に使用してください。";
                }
              } else if (/暗闇|火傷|麻痺|氷結/.test(text) && (text.includes("発生") || text.includes("付与") || text.includes("霊魂"))) {
                if (!hasAilmentImmunity) {
                  level = "warning";
                  reason = "状態異常（暗闇等）が発生します。解除・無効化持ち、または歌舞等の継続回復役の配置を推奨します。";
                } else {
                  level = "safe";
                  reason = "編成に対策城娘が配備されており、状態異常を無力化または軽減可能です。";
                }
              }
            }
          }
        }
      }

      if (level === "fatal") fatalCount++;
      else if (level === "warning") warningCount++;
      else safeCount++;

      return { deliberation: d, level, reason };
    });

    if (summaryEl) {
      summaryEl.innerHTML = `
        <span style="color:#c0392b; font-weight:bold;">🚨 詰み: ${fatalCount}件</span> ｜ 
        <span style="color:#d35400; font-weight:bold;">⚠️ 要対策: ${warningCount}件</span> ｜ 
        <span style="color:#27ae60; font-weight:bold;">✓ 安全: ${safeCount}件</span>
      `;
    }

    const itemsToRender = currentDelibFilterMode === "warnings"
      ? evaluatedList.filter(item => item.level !== "safe")
      : evaluatedList;

    if (itemsToRender.length === 0) {
      container.innerHTML = `<div style="font-size:12px; color:#27ae60; padding:10px; text-align:center; background:#f7faf8; border-radius:4px;">🎉 詰み・要対策の審議はありません。すべての審議に対応できています！</div>`;
      return;
    }

    itemsToRender.forEach(item => {
      const d = item.deliberation;
      const card = document.createElement("div");
      card.className = `delib-matrix-card is-${item.level}`;

      let badgeHtml = "";
      if (item.level === "fatal") {
        badgeHtml = `<span class="badge" style="background:#c0392b; color:#fff; font-size:12px;">🚨 詰み審議 (致命的)</span>`;
      } else if (item.level === "warning") {
        badgeHtml = `<span class="badge" style="background:#d35400; color:#fff; font-size:12px;">⚠️ 要対策</span>`;
      } else {
        badgeHtml = `<span class="badge" style="background:#27ae60; color:#fff; font-size:12px;">✓ 対策済み/安全</span>`;
      }

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <strong style="font-size:13px; color:#2c3e50;">[${d.point}審] ${escapeHtml(d.name)}</strong>
          ${badgeHtml}
        </div>
        <div style="color:#555; margin-bottom:4px;">${escapeHtml(d.effect)}</div>
        <div style="font-size:12px; font-weight:bold; color:${item.level === 'fatal' ? '#c0392b' : (item.level === 'warning' ? '#b05500' : '#27ae60')};">
          👉 ${escapeHtml(item.reason)}
        </div>
      `;
      container.appendChild(card);
    });
  }

  // 2. デバフ重ね掛けチェッカー
  function renderDebuffStackChecker(stageObj) {
    const container = document.getElementById("diagDebuffCategoryList");
    const synergyBadge = document.getElementById("diagDebuffSynergyBadge");
    const penetrationNotice = document.getElementById("diagDebuffPenetrationNotice");
    if (!container) return;
    container.innerHTML = "";

    const partyCastles = party.filter(Boolean).map(s => getCastleById(s.id)).filter(Boolean);

    const debuffCategories = [
      { key: "atkDown", name: "敵攻撃力低下", unit: "%", regex: /敵の攻撃(?:力)?(?:が|を)?(\d+)%?(?:低下|半減)/g, isStat: true },
      { key: "dmgDealtDown", name: "敵与ダメ低下", unit: "%", regex: /(?:敵の)?与(?:える)?ダメージ(?:が|を)?(\d+)%?(?:低下|減)/g, isStat: false },
      { key: "gapExtend", name: "敵攻撃隙延長", unit: "%", regex: /隙が(\d+)%?(?:延長|増加)/g, isStat: false },
      { key: "atkSpeedDown", name: "敵攻撃速度低下", unit: "%", regex: /攻撃速度が(\d+)%?(?:低下|減)/g, isStat: false },
      { key: "defDown", name: "敵防御力低下", unit: "%", regex: /敵の防御(?:力)?(?:が|を)?(\d+)%?(?:低下|半減)/g, isStat: true },
      { key: "dmgTakenUp", name: "敵被ダメ上昇", unit: "%", regex: /被ダメージが(\d+)%?(?:上昇|増加)/g, isStat: false },
      { key: "speedDown", name: "敵移動速度低下", unit: "%", regex: /移動速度が(\d+)%?(?:低下|減)/g, isStat: false },
      { key: "rangeDown", name: "敵射程低下", unit: "%", regex: /射程が(\d+)%?(?:低下|減)/g, isStat: true },
      { key: "ailment", name: "状態異常付与", unit: "", regex: /足止め|混乱|氷結|火傷|麻痺|暗闇/g, isStat: false }
    ];

    const results = {};
    debuffCategories.forEach(cat => {
      results[cat.key] = {
        name: cat.name,
        isStat: cat.isStat,
        providers: [],
        maxVal: 0
      };
    });

    partyCastles.forEach(c => {
      const fullText = getCastleFullText(c);

      debuffCategories.forEach(cat => {
        if (cat.key === "ailment") {
          const matches = fullText.match(cat.regex);
          if (matches) {
            const unique = Array.from(new Set(matches));
            results[cat.key].providers.push({
              castleName: c.name,
              value: unique.join("・"),
              isApplied: true
            });
          }
        } else {
          const matches = [...fullText.matchAll(cat.regex)];
          matches.forEach(m => {
            const val = parseInt(m[1], 10);
            if (val > 0) {
              results[cat.key].providers.push({
                castleName: c.name,
                value: val,
                raw: m[0]
              });
            }
          });
        }
      });
    });

    debuffCategories.forEach(cat => {
      if (cat.key !== "ailment") {
        const list = results[cat.key].providers;
        if (list.length > 0) {
          list.sort((a, b) => b.value - a.value);
          results[cat.key].maxVal = list[0].value;
          list.forEach((p, idx) => {
            p.isApplied = (idx === 0);
          });
        }
      }
    });

    const atkDownRate = (results.atkDown.maxVal || 0) / 100;
    const dmgDealtDownRate = (results.dmgDealtDown.maxVal || 0) / 100;
    const gapExtendRate = (results.gapExtend.maxVal || 0) / 100;
    const atkSpeedDownRate = (results.atkSpeedDown.maxVal || 0) / 100;

    const dmgMultiplier = (1 - atkDownRate) * (1 - dmgDealtDownRate) * (1 / (1 + gapExtendRate)) * (1 - atkSpeedDownRate);
    const cutRate = Math.max(0, Math.min(99.9, (1 - dmgMultiplier) * 100));
    const effectiveHpMult = dmgMultiplier > 0 ? (1 / dmgMultiplier) : 1;

    if (synergyBadge) {
      synergyBadge.textContent = `脱法耐久シナジー: 被ダメ ${cutRate.toFixed(1)}% カット (実質耐久 ${effectiveHpMult.toFixed(2)}倍)`;
    }

    const stageRulesText = stageObj ? ((stageObj.rules || []).concat((stageObj.deliberations || []).map(d => d.effect)).join(" ")) : "";
    const isStatImmune = stageRulesText.includes("能力低下無効") || stageRulesText.includes("ステータス低下無効");

    if (penetrationNotice) {
      if (isStatImmune) {
        penetrationNotice.innerHTML = `
          <div style="color:#c0392b; font-weight:bold; margin-bottom:2px;">⚠️ ステージ審議「能力低下無効」が発動中:</div>
          <div>❌ <strong>無効化:</strong> 敵攻撃力低下、敵防御力低下、射程低下（ステータス低下）</div>
          <div>⭕ <strong>貫通して有効:</strong> 敵与ダメ低下、敵被ダメ上昇、攻撃隙延長、移動低下、状態異常（脱法重複可能！）</div>
        `;
      } else {
        penetrationNotice.innerHTML = `
          <span style="color:#27ae60; font-weight:bold;">✓ 審議によるデバフ無効化はありません。</span> 全カテゴリのデバフが有効に機能します。
        `;
      }
    }

    debuffCategories.forEach(cat => {
      const data = results[cat.key];
      const card = document.createElement("div");
      card.className = "debuff-stack-card";

      const penetBadge = isStatImmune
        ? (data.isStat
            ? `<span class="badge" style="background:#c0392b; color:#fff; font-size:12px;">審議無効</span>`
            : `<span class="badge" style="background:#27ae60; color:#fff; font-size:12px;">審議貫通 ✓</span>`)
        : "";

      let providersHtml = "";
      if (data.providers.length === 0) {
        providersHtml = `<div style="color:#999; font-style:italic;">付与者なし (0%)</div>`;
      } else if (cat.key === "ailment") {
        providersHtml = data.providers.map(p => `<div>• <strong>${escapeHtml(p.castleName)}</strong>: <span style="color:#6c5ce7; font-weight:bold;">${escapeHtml(p.value)}</span></div>`).join("");
      } else {
        providersHtml = data.providers.map(p => `
          <div class="${p.isApplied ? 'debuff-provider-applied' : 'debuff-provider-overwritten'}">
            • ${escapeHtml(p.castleName)}: -${p.value}% ${p.isApplied ? '★適用中' : '(上書き無効化)'}
          </div>
        `).join("");
      }

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; border-bottom:1px solid #eee; padding-bottom:3px;">
          <strong style="color:#2c3e50; font-size:12.5px;">${cat.name}</strong>
          <div>
            ${penetBadge}
            ${cat.key !== 'ailment' && data.maxVal > 0 ? `<span class="badge" style="background:#27ae60; color:#fff; font-size:12px; margin-left:4px;">最大 -${data.maxVal}%</span>` : ''}
          </div>
        </div>
        <div style="line-height:1.45; font-size:12px;">${providersHtml}</div>
      `;
      container.appendChild(card);
    });
  }

  // 3. 気の家計簿 (ウェーブ別収支タイムライン)
  function renderKiLedger() {
    const verdictEl = document.getElementById("kiLedgerVerdictBanner");
    const waveCardsEl = document.getElementById("kiLedgerWaveCards");
    const giantSeqEl = document.getElementById("kiLedgerGiantizeSequence");
    if (!waveCardsEl) return;

    const startKiInput = document.getElementById("kiLedgerStartKi");
    const startKi = startKiInput ? (parseInt(startKiInput.value, 10) || 30) : 30;

    const waveSecSelect = document.getElementById("kiLedgerWaveSec");
    const waveSec = waveSecSelect ? (parseInt(waveSecSelect.value, 10) || 60) : 60;

    const calcResult = calculateBuffs();
    const partyCastles = party.filter(Boolean).map(s => getCastleById(s.id)).filter(Boolean);

    if (partyCastles.length === 0) {
      if (verdictEl) verdictEl.innerHTML = `<div style="color:#777; font-size:12px;">城娘が編成されていません。部隊に城娘を追加してください。</div>`;
      waveCardsEl.innerHTML = "";
      if (giantSeqEl) giantSeqEl.innerHTML = "";
      return;
    }

    let extraKiPerSec = 0;
    partyCastles.forEach(c => {
      const fullText = getCastleFullText(c);
      if (/気の自然増加が?.*?秒/.test(fullText) || /気の自然増加量を?.*?増/.test(fullText)) {
        extraKiPerSec = Math.max(extraKiPerSec, 0.4);
      }
      if (/ノビシャド|気トークン|シーサー|白兎/.test(fullText)) {
        extraKiPerSec += 0.3;
      }
    });
    const kiRate = 1.0 + extraKiPerSec;

    const totalDeploy = calcResult.totalDeployCost || 80;
    const totalGiant = calcResult.totalGiantCost || 500;

    const waveKillKi = [22, 35, 45, 30];
    const waveDeployKi = [Math.round(totalDeploy * 0.55), Math.round(totalDeploy * 0.45), 0, 0];
    const waveGiantKi = [
      Math.round(totalGiant * 0.15),
      Math.round(totalGiant * 0.35),
      Math.round(totalGiant * 0.35),
      Math.round(totalGiant * 0.15)
    ];
    const waveStratKi = [10, 20, 30, 30];

    let currentKi = startKi;
    let deficitWave = null;
    const waveReports = [];

    for (let w = 0; w < 4; w++) {
      const naturalIncome = Math.round(waveSec * kiRate);
      const killIncome = waveKillKi[w];
      const totalIncome = naturalIncome + killIncome;
      const totalExpense = waveDeployKi[w] + waveGiantKi[w] + waveStratKi[w];

      const projectedKi = currentKi + totalIncome - totalExpense;
      if (projectedKi < 0 && deficitWave === null) {
        deficitWave = w + 1;
      }

      waveReports.push({
        waveNum: w + 1,
        startKi: currentKi,
        naturalIncome,
        killIncome,
        totalIncome,
        deployExp: waveDeployKi[w],
        giantExp: waveGiantKi[w],
        stratExp: waveStratKi[w],
        totalExpense,
        endKi: projectedKi,
        isDeficit: projectedKi < 0
      });

      currentKi = Math.max(0, projectedKi);
    }

    if (verdictEl) {
      if (deficitWave !== null) {
        verdictEl.innerHTML = `
          <div style="background:#fdf2f2; border:1px solid #e8b4b4; color:#c0392b; padding:8px 12px; border-radius:6px; font-size:12px; font-weight:bold;">
            ⚠️ 第${deficitWave}波で気破綻のリスクを検知！計画支出が自然収入を超過しています。気生成役（［夏］枉死城・彦根城・臼杵城など）の採用、または序盤の巨大化抑制を推奨します。
          </div>
        `;
      } else {
        verdictEl.innerHTML = `
          <div style="background:#f2faf4; border:1px solid #b7e4c7; color:#1e6b37; padding:8px 12px; border-radius:6px; font-size:12px; font-weight:bold;">
            ✅ 気の収支は安定（全ウェーブ黒字維持）。予定通りの巨大化進行が可能です。（気生成速度: 約${kiRate.toFixed(2)}気/秒）
          </div>
        `;
      }
    }

    waveCardsEl.innerHTML = "";
    waveReports.forEach(r => {
      const card = document.createElement("div");
      card.className = "ki-ledger-card";
      if (r.isDeficit) {
        card.style.borderColor = "#e74c3c";
        card.style.background = "#fff8f8";
      }

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e1e8ed; padding-bottom:4px; margin-bottom:4px;">
          <strong style="color:#1e6b37; font-size:13px;">第${r.waveNum}波 (${waveSec}秒)</strong>
          <span class="badge" style="background:${r.isDeficit ? '#c0392b' : '#27ae60'}; color:#fff; font-size:12px;">
            ${r.isDeficit ? '⚠️ 赤字警戒' : '✓ 安定'}
          </span>
        </div>
        <div style="font-size:12px; line-height:1.5;">
          <div>📥 <strong>収入:</strong> +${r.totalIncome}気 <small style="color:#666;">(自然:${r.naturalIncome} / 撃破:${r.killIncome})</small></div>
          <div>📤 <strong>支出:</strong> -${r.totalExpense}気 <small style="color:#666;">(配置:${r.deployExp} / 巨大:${r.giantExp} / 計略:${r.stratExp})</small></div>
          <div style="margin-top:2px; font-weight:bold; color:${r.isDeficit ? '#c0392b' : '#2c3e50'};">
            💰 終了時残気: 約 ${r.endKi} 気
          </div>
        </div>
      `;
      waveCardsEl.appendChild(card);
    });

    if (giantSeqEl) {
      const sortedCastles = [...partyCastles].sort((a, b) => {
        const getPrio = (c) => {
          const fullText = getCastleFullText(c);
          if (/気の自然増加|気生成|計略消費気/.test(fullText)) return 1;
          if (["歌舞", "陣貝", "本"].includes(c.weapon)) return 2;
          if (["盾", "戦棍", "槌"].includes(c.weapon)) return 3;
          return 4;
        };
        return getPrio(a) - getPrio(b);
      });

      const prioLabels = { 1: "⚡ 気稼ぎ最優先", 2: "🎶 範囲バフ・回復支援", 3: "🛡️ 前線封鎖・耐久", 4: "💥 決戦火力完成" };

      giantSeqEl.innerHTML = `
        <strong style="font-size:13px; color:#1e6b37; display:block; margin-bottom:6px;">📈 実戦巨大化の最適進行順序（実戦動画解析）:</strong>
        <div style="display:flex; flex-direction:column; gap:4px; font-size:12px;">
          ${sortedCastles.map((c, i) => {
            const fullText = getCastleFullText(c);
            let prio = 4;
            if (/気の自然増加|気生成|計略消費気/.test(fullText)) prio = 1;
            else if (["歌舞", "陣貝", "本"].includes(c.weapon)) prio = 2;
            else if (["盾", "戦棍", "槌"].includes(c.weapon)) prio = 3;
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; background:#f7faf8; padding:3px 8px; border-radius:4px; border:1px solid #e1ece1;">
                <div>
                  <strong>${i + 1}位. ${escapeHtml(c.name)}</strong>
                  <span style="color:#777; margin-left:4px;">★${c.rarity} ${c.weapon}</span>
                </div>
                <span class="badge" style="background:#2c6f4f; color:#fff; font-size:12px;">${prioLabels[prio]}</span>
              </div>
            `;
          }).join("")}
        </div>
        <div style="font-size:12px; color:#777; margin-top:8px;">※撃破気・ウェーブ時間・計略使用頻度は標準的な合戦展開に基づく推計・シミュレーション上の近似値です。ステージや敵の出現数によって変動します。</div>
      `;
    }
  }

  // 4. 殿スナイプ予報と大破までカウントダウン
  function renderBossSnipeAndCountdown(stageObj) {
    const riskBadge = document.getElementById("diagSnipeRiskBadge");
    const warnText = document.getElementById("diagSnipeWarningText");
    const tbody = document.getElementById("diagBossHitCountdownTbody");
    if (!warnText || !tbody) return;

    const boss = getBossForStage(stageObj);
    const calcResult = calculateBuffs();
    const partyCastles = party.filter(Boolean).map(s => getCastleById(s.id)).filter(Boolean);

    if (partyCastles.length === 0) {
      if (riskBadge) riskBadge.textContent = "部隊未編成";
      warnText.textContent = "城娘が編成されていません。";
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:10px; color:#888;">部隊に城娘を編成してください。</td></tr>`;
      return;
    }

    let threatLevel = "中";
    let threatColor = "#f39c12";
    if (boss.range >= 480 || /極高/.test(boss.snipeThreat)) {
      threatLevel = "極高 (殿直撃ゾーン)";
      threatColor = "#c0392b";
    } else if (boss.range >= 400 || /高/.test(boss.snipeThreat)) {
      threatLevel = "高 (長射程警戒)";
      threatColor = "#d35400";
    }

    if (riskBadge) {
      riskBadge.style.background = threatColor;
      riskBadge.style.color = "#fff";
      riskBadge.textContent = `🎯 殿スナイプ危険度: ${threatLevel}`;
    }

    warnText.innerHTML = `
      <strong>【総大将・ボス想定: ${escapeHtml(boss.name)}】</strong> 攻撃力: <span style="color:#c0392b; font-weight:bold;">${boss.atk.toLocaleString()}</span> ｜ 射程: <span style="color:#185a9d; font-weight:bold;">${boss.range}</span> ｜ 攻撃間隔: ${boss.attackInterval}秒 ｜ 移動: ${boss.moveSpeed}<br>
      💡 <strong>スナイプ脅威評価:</strong> ${escapeHtml(boss.snipeThreat)}。${escapeHtml(boss.gimmick)}<br>
      🛡️ <strong>避雷針戦術:</strong> 殿の射線手前に高耐久デコイ（避雷針伏兵や盾城娘）を優先配置してターゲットを誘導してください。
      <div style="font-size:12px; color:#777; margin-top:4px;">※総大将・ボスの耐久・攻撃力・射程等は代表的な敵データに基づくシミュレーション推計値です。合戦審議・難易度・ギミックにより変動します。</div>
    `;

    tbody.innerHTML = "";

    party.forEach((slot, idx) => {
      if (!slot) return;
      const c = getCastleById(slot.id);
      if (!c) return;

      const castleEntry = calcResult.perCastle ? (calcResult.perCastle[c.id] || calcResult.perCastle[c.name]) : null;
      const calc = castleEntry ? castleEntry.calculatedStats : { hp: (c.stats ? c.stats.hp : 3000), def: (c.stats ? c.stats.def : 200) };

      const dmgTakenDownRate = castleEntry && castleEntry.buffs && castleEntry.buffs.dmgTakenDown
        ? ((castleEntry.buffs.dmgTakenDown.max || 0) + (castleEntry.buffs.dmgTakenDown.stackSum || 0)) / 100
        : 0;
      const enemyAtkDownRate = calcResult.enemyDebuffs && calcResult.enemyDebuffs.enemyAtkDown
        ? ((calcResult.enemyDebuffs.enemyAtkDown.max || 0) / 100)
        : 0;

      const effectiveBossAtk = Math.max(1, Math.round(boss.atk * (1 - enemyAtkDownRate)));
      const rawDmg = Math.max(1, effectiveBossAtk - calc.def);
      const finalDmgPerHit = Math.max(1, Math.round(rawDmg * (1 - dmgTakenDownRate)));

      const hitsToWipeout = Math.ceil(calc.hp / finalDmgPerHit);

      let roleTag = "";
      if (hitsToWipeout >= 5) {
        roleTag = `<span class="badge" style="background:#27ae60; color:#fff; font-size:12px;">🛡️ 盾受け適格 (${hitsToWipeout}発耐え)</span>`;
      } else if (hitsToWipeout >= 3) {
        roleTag = `<span class="badge" style="background:#f39c12; color:#fff; font-size:12px;">⚠️ 緊急受け可 (${hitsToWipeout}発耐え)</span>`;
      } else {
        roleTag = `<span class="badge" style="background:#c0392b; color:#fff; font-size:12px;">💥 即死・危険 (${hitsToWipeout}発耐え)</span>`;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
        <td><strong>${escapeHtml(c.name)}</strong> <small style="color:#777;">★${c.rarity} ${c.weapon}</small></td>
        <td style="text-align:right;">${calc.hp.toLocaleString()} / ${calc.def}</td>
        <td style="text-align:right; font-weight:bold; color:#c0392b;">${finalDmgPerHit.toLocaleString()}</td>
        <td style="text-align:center; font-weight:bold; font-size:13px;">${hitsToWipeout} 発</td>
        <td>${roleTag}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // 5. 40秒問題タイマー (周期シンクロ支援)
  let cycleTimerInterval = null;

  function renderCycleSyncSection() {
    const container = document.getElementById("cycleSyncPairsContainer");
    if (!container) return;

    const partyCastles = party.filter(Boolean).map(s => getCastleById(s.id)).filter(Boolean);

    const cyclicalAbilities = [];
    partyCastles.forEach(c => {
      if (c.strategy) {
        let ct = (typeof c.strategy.cooldown === "number" && !isNaN(c.strategy.cooldown)) ? c.strategy.cooldown : null;
        if (ct === null) {
          const ctMatch = (c.strategy.text || "").match(/(?:再使用|使用可能まで)(\d+)秒/);
          ct = ctMatch ? parseInt(ctMatch[1], 10) : 40;
        }
        cyclicalAbilities.push({
          castleName: c.name,
          type: "計略",
          name: c.strategy.name,
          seconds: ct
        });
      }
      if (c.special) {
        const ctMatch = c.special.text.match(/(\d+)秒(?:毎|ごと)/);
        const ct = ctMatch ? parseInt(ctMatch[1], 10) : 25;
        cyclicalAbilities.push({
          castleName: c.name,
          type: "特殊能力",
          name: c.special.name,
          seconds: ct
        });
      }
    });

    container.innerHTML = `
      <div style="margin-bottom:6px;">
        💡 <strong>代理時計（周期シンクロ）解説:</strong> 計略や特殊能力はクールダウン（25秒・40秒・50秒等）が異なるため、実戦中に同時に点火すると徐々に周期ズレを起こします。<br>
        例: <strong>［活命］富山城の特殊（25秒）</strong>は2周（50秒）で<strong>50秒系計略</strong>と完全にシンクロし、<strong>40秒計略（久能山城等）</strong>とは10秒ズレが発生します。
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">
        ${cyclicalAbilities.slice(0, 8).map(ab => `
          <span class="badge" style="background:#f1f2f6; color:#2f3542; border:1px solid #dcdde1; font-size:12px; padding:3px 8px;">
            ⏱️ ${escapeHtml(ab.castleName)} [${ab.type}]: <strong>約${ab.seconds}秒周期</strong>
          </span>
        `).join("")}
      </div>
    `;
  }

  function startCycleTimer40() {
    const display = document.getElementById("cycleTimerDisplay");
    if (!display) return;
    if (cycleTimerInterval) clearInterval(cycleTimerInterval);

    display.style.color = "#27ae60";

    const startTime = Date.now();
    cycleTimerInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const rem = Math.max(0, 40000 - elapsed);
      display.textContent = (rem / 1000).toFixed(1) + "s";

      if (rem <= 5000) {
        display.style.color = "#d63031";
      }
      if (rem === 0) {
        clearInterval(cycleTimerInterval);
        cycleTimerInterval = null;
        display.textContent = "⏱️ 点火！";
      }
    }, 100);
  }

  function resetCycleTimer() {
    const display = document.getElementById("cycleTimerDisplay");
    if (cycleTimerInterval) {
      clearInterval(cycleTimerInterval);
      cycleTimerInterval = null;
    }
    if (display) {
      display.style.color = "#d63031";
      display.textContent = "40.0s";
    }
  }

  // 6. 次の波カード (ウェーブ別カンペ & メモ)
  function renderWaveCheatCards(stageObj) {
    const container = document.getElementById("diagWaveCardsGrid");
    if (!container) return;
    container.innerHTML = "";

    const stageTitle = stageObj ? stageObj.title : "stage";
    const boss = getBossForStage(stageObj);

    let savedNotes = {};
    try {
      const raw = localStorage.getItem("scre-helper:wave-notes:v1");
      if (raw) savedNotes = JSON.parse(raw);
    } catch (e) {
      savedNotes = {};
    }

    const waveTemplates = [
      {
        num: 1,
        title: "第1波 (W1): 序盤展開・気稼ぎ",
        hints: [
          "気スペシャリストを最優先で配置・巨大化",
          "低コスト遠隔で初期雑魚を素早く処理",
          "初手計略は温存し、気自然増加を待つ"
        ]
      },
      {
        num: 2,
        title: "第2波 (W2): 中型ラッシュ・陣形整備",
        hints: [
          "歌舞・陣貝の巨大化で前衛回復ライン確立",
          "物理／術属性の使い分けで硬い敵を突破",
          "飛行敵の出現ルートに対空射程を確保"
        ]
      },
      {
        num: 3,
        title: "第3波 (W3): 強敵・妖怪分隊",
        hints: [
          "妖怪敵への術攻撃・歌舞祓串サポート",
          "デバフ計略を点火し被ダメを抑制",
          "蔵防衛ラインの再点検・裏抜け警戒"
        ]
      },
      {
        num: 4,
        title: `第4波 (W4): 総大将・決戦 (${boss.name})`,
        hints: [
          `${boss.name}出現。40秒バフ・全計略点火`,
          "殿の射線手前に避雷針デコイを投下",
          "形態変化の瞬間に集中火力・足止め発動"
        ]
      }
    ];

    waveTemplates.forEach(w => {
      const card = document.createElement("div");
      card.className = "wave-cheat-card";
      const noteKey = `${stageTitle}_w${w.num}`;
      const curNote = savedNotes[noteKey] || "";

      card.innerHTML = `
        <div class="wave-cheat-header">
          <span>${escapeHtml(w.title)}</span>
        </div>
        <div style="font-size:12px; color:#444; line-height:1.4;">
          ${w.hints.map(h => `• ${escapeHtml(h)}`).join("<br>")}
        </div>
        <div style="margin-top:auto;">
          <label style="font-size:12px; font-weight:bold; color:#23632f; display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
            <span>📝 手順カンペメモ:</span>
            <span id="waveNoteSavedBadge_${w.num}" style="font-size:12px; color:#27ae60; font-weight:normal;"></span>
          </label>
          <textarea class="wave-cheat-memo-input" id="waveNoteInput_${w.num}" placeholder="例: 0:45で彦根計略、1:10でデコイ配置...">${escapeHtml(curNote)}</textarea>
        </div>
      `;
      container.appendChild(card);

      const txtArea = card.querySelector(`#waveNoteInput_${w.num}`);
      const badge = card.querySelector(`#waveNoteSavedBadge_${w.num}`);
      if (txtArea) {
        txtArea.addEventListener("input", () => {
          try {
            const raw = localStorage.getItem("scre-helper:wave-notes:v1");
            const allNotes = raw ? JSON.parse(raw) : {};
            allNotes[noteKey] = txtArea.value;
            localStorage.setItem("scre-helper:wave-notes:v1", JSON.stringify(allNotes));
            if (badge) {
              badge.textContent = "✓ 保存済";
              setTimeout(() => { badge.textContent = ""; }, 1500);
            }
          } catch (e) {}
        });
      }
    });
  }

  // 7. 置くとこない探知機
  function renderTileCongestionSection(stageObj) {
    const badge = document.getElementById("diagTileCongestionBadge");
    const content = document.getElementById("diagTileCongestionContent");
    if (!content) return;

    const partyCastles = party.filter(Boolean).map(s => getCastleById(s.id)).filter(Boolean);
    if (partyCastles.length === 0) {
      if (badge) badge.textContent = "未編成";
      content.textContent = "部隊に城娘を編成してください。";
      return;
    }

    let meleeCount = 0;
    let rangedCount = 0;
    let bothCount = 0;

    partyCastles.forEach(c => {
      if (c.rangeKind === "遠近") bothCount++;
      else if (c.rangeKind === "近" || c.rangeKind === "近接") meleeCount++;
      else if (c.rangeKind === "遠" || c.rangeKind === "遠隔") rangedCount++;
    });

    let statusText = "";
    let badgeText = "✅ バランス良好";
    let badgeColor = "#27ae60";

    if (meleeCount >= 6) {
      badgeText = "⚠️ 近接偏重 (前線マス過密)";
      badgeColor = "#d35400";
      statusText = `近接城娘が多め（${meleeCount}体）です。前線の近接マスや蔵周辺マスの奪い合いが発生しやすくなります。遠近両用や射程延長持ちを採用して前線密集を緩和してください。`;
    } else if (rangedCount >= 6) {
      badgeText = "⚠️ 遠隔偏重 (高台マス枯渇)";
      badgeColor = "#d35400";
      statusText = `遠隔城娘が多め（${rangedCount}体）です。安全な高台マスが埋まり、前線を抑えきれずに敵がすり抜ける危険があります。足止め盾や前衛の採用を推奨します。`;
    } else {
      statusText = `近接（${meleeCount}体）と遠隔（${rangedCount}体）${bothCount > 0 ? `・遠近両用（${bothCount}体）` : ''}の配置マス比率がバランス良く整っています。`;
    }

    if (badge) {
      badge.style.background = badgeColor;
      badge.style.color = "#fff";
      badge.textContent = badgeText;
    }

    content.innerHTML = `
      <div>${escapeHtml(statusText)}</div>
      <div style="margin-top:6px; font-size:12px; color:#666; background:#fff; padding:6px 10px; border-radius:4px; border:1px dashed #dcd2c4;">
        📐 <strong>マップ配置マスデータ設計案（拡張仕様）:</strong> 将来データ構造として各ステージに <code>{ meleeTiles: 12, rangedTiles: 7, vanishTiles: [3] }</code> を持たせることで、配置マスの過密・消滅を100%自動検証可能です。
      </div>
    `;
  }

  // 8. 伏兵の成績表
  function renderTokenReportCardSection() {
    const container = document.getElementById("tokenReportCardContainer");
    if (!container) return;
    container.innerHTML = "";

    const partyCastles = party.filter(Boolean).map(s => getCastleById(s.id)).filter(Boolean);

    const tokensFound = [];
    partyCastles.forEach(c => {
      const fullText = getCastleFullText(c);
      if (/伏兵|トークン/.test(fullText)) {
        let role = "支援";
        let roleBadge = `<span class="badge" style="background:#6c5ce7; color:#fff; font-size:12px;">🌟 オーラ支援型</span>`;
        let decoyGrade = "B (通常)";
        if (/気/.test(fullText) && /自然増加|増加|生成/.test(fullText)) {
          role = "気生成";
          roleBadge = `<span class="badge" style="background:#27ae60; color:#fff; font-size:12px;">⚡ 気生成型</span>`;
          decoyGrade = "A (後方配置推奨・緊急避雷針可)";
        } else if (/足止め|耐久|防御|ダメージを代わりに/.test(fullText)) {
          role = "避雷針";
          roleBadge = `<span class="badge" style="background:#2980b9; color:#fff; font-size:12px;">🛡️ 避雷針・デコイ型</span>`;
          decoyGrade = "S (優秀な身代わり・タゲ逸らし)";
        } else if (/自爆|爆発|撃破時/.test(fullText)) {
          role = "特攻";
          roleBadge = `<span class="badge" style="background:#c0392b; color:#fff; font-size:12px;">💥 特攻・時限爆弾型</span>`;
          decoyGrade = "B (使い捨て・敵密集地投下)";
        }

        tokensFound.push({
          castleName: c.name,
          roleBadge,
          decoyGrade,
          summary: c.strategy ? c.strategy.text : (c.special ? c.special.text : "伏兵を配置")
        });
      }
    });

    if (tokensFound.length === 0) {
      container.innerHTML = `
        <div style="font-size:12px; color:#555; background:#fbfbff; padding:10px 12px; border-radius:6px; border:1px dashed #cfcfee; grid-column:1/-1; line-height:1.5;">
          現在編成に伏兵（トークン）持ち城娘がいません。<br>
          💡 <strong>避雷針戦術のワンポイント:</strong> ハデス・武神超難などの高難度マップでは、ボスの長射程即死スナイプから殿や主力城娘を守るために、<strong>臼杵城（ノビシャド）、平安京、［ハロウィン］カルルシュテイン城</strong>などの伏兵持ちを採用すると勝率が劇的に上がります。
        </div>
      `;
      return;
    }

    tokensFound.forEach(tok => {
      const card = document.createElement("div");
      card.className = "token-report-card";
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; border-bottom:1px solid #e5e5f5; padding-bottom:3px;">
          <strong style="color:#2c3e50; font-size:13px;">${escapeHtml(tok.castleName)} の伏兵</strong>
          ${tok.roleBadge}
        </div>
        <div style="font-size:12px; color:#444; margin-bottom:4px;">
          🎯 <strong>避雷針適性:</strong> <span style="font-weight:bold; color:#185a9d;">${escapeHtml(tok.decoyGrade)}</span>
        </div>
        <div style="font-size:12px; color:#666; line-height:1.4;">
          ${escapeHtml(tok.summary.slice(0, 90))}${tok.summary.length > 90 ? '...' : ''}
        </div>
      `;
      container.appendChild(card);
    });
  }

  // 9. 変身後バッジ
  function renderTransformationBadges(stageObj) {
    const container = document.getElementById("diagTransformationBadgesSection");
    if (!container) return;

    const boss = getBossForStage(stageObj);
    if (!boss || (!boss.hasTransform && (!boss.transformKeywords || boss.transformKeywords.length === 0))) {
      container.style.display = "none";
      container.innerHTML = "";
      return;
    }

    container.style.display = "block";

    const badgeMap = {
      "飛行化": { icon: "🦅", bg: "#2980b9", desc: "飛行化（近接無力化・対空特効/遠隔必須）" },
      "巨大化": { icon: "👹", bg: "#c0392b", desc: "巨大化（超火力倍増・単発即死警戒）" },
      "火力倍増": { icon: "🔥", bg: "#d35400", desc: "火力倍増（足止め即死・多段デバフ必須）" },
      "全体同時攻撃": { icon: "⚡", bg: "#8e44ad", desc: "全体同時攻撃（殿・蔵直撃・デコイ必須）" },
      "影解除": { icon: "👁️", bg: "#27ae60", desc: "影解除（ステルス解除・集中砲火）" },
      "猛進": { icon: "💨", bg: "#e67e22", desc: "猛進（高速直進・足止め無効化）" },
      "足止め無効": { icon: "🚫", bg: "#7f8c8d", desc: "足止め無効（遅延不可・射程外撃破推奨）" }
    };

    const badgesHtml = (boss.transformKeywords || []).map(kw => {
      const meta = badgeMap[kw] || { icon: "⚠️", bg: "#8e44ad", desc: kw };
      return `<span class="transform-badge-pill" style="background:${meta.bg};">${meta.icon} 形態変化: ${meta.desc}</span>`;
    }).join("");

    container.innerHTML = `
      <div style="background:#fffcf7; border:1px solid #ebd2b9; border-radius:6px; padding:8px 10px;">
        <div style="font-weight:bold; font-size:13px; color:#a03a08; margin-bottom:4px;">
          👹 ボス形態変化・変身後特性予告 (${escapeHtml(boss.name)}):
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;">
          ${badgesHtml}
        </div>
        <div style="font-size:12px; color:#555; line-height:1.45;">
          ${escapeHtml(boss.transformDesc)} 💡 変身前の対策が変身後に通用しなくなるケースに注意し、移行タイミングでの計略リロードを徹底してください。
        </div>
      </div>
    `;
  }

  // 10. 倒し切りレース (TTK表示)
  function renderTtkRace(stageObj) {
    const statusBadge = document.getElementById("diagTtkStatusBadge");
    const dpsBar = document.getElementById("diagTtkDpsBar");
    const detailText = document.getElementById("diagTtkDetailText");
    if (!detailText) return;

    const boss = getBossForStage(stageObj);
    const calcResult = calculateBuffs();
    const partyCastles = party.filter(Boolean).map(s => getCastleById(s.id)).filter(Boolean);

    if (partyCastles.length === 0) {
      if (statusBadge) statusBadge.textContent = "未編成";
      detailText.textContent = "部隊に城娘を編成してください。";
      if (dpsBar) dpsBar.style.width = "0%";
      return;
    }

    let totalDps = 0;
    partyCastles.forEach(c => {
      const wf = (typeof SCRE_WEAPON_FRAMES !== "undefined" && SCRE_WEAPON_FRAMES[c.weapon]);
      if (wf && wf.type === "buff") {
        return; // 歌舞・陣貝・茶器等の支援専用武器種(type: "buff")は通常攻撃DPSに寄与しない
      }
      const calc = calcResult.perCastle[c.id] ? calcResult.perCastle[c.id].calculatedStats : { atk: (c.stats ? c.stats.atk : 500), singleHit: 500 };
      const rawHit = Math.max(1, (calc.singleHit || calc.atk) - boss.def);
      const dps = rawHit / 1.5;
      totalDps += dps;
    });

    const ttkSeconds = Math.max(1, boss.hp / Math.max(1, totalDps));
    const travelSeconds = Math.max(20, Math.round(50 / (boss.moveSpeedVal || 1.0)));

    const ratio = (travelSeconds / ttkSeconds);
    const barPercent = Math.min(100, Math.max(5, Math.round(ratio * 50)));

    if (dpsBar) {
      dpsBar.style.width = barPercent + "%";
    }

    if (statusBadge) {
      if (ttkSeconds < travelSeconds * 0.75) {
        statusBadge.style.background = "#27ae60";
        statusBadge.style.color = "#fff";
        statusBadge.textContent = `🏁 撃破余裕 (${ttkSeconds.toFixed(1)}秒で撃破想定)`;
      } else if (ttkSeconds <= travelSeconds) {
        statusBadge.style.background = "#f39c12";
        statusBadge.style.color = "#fff";
        statusBadge.textContent = `⚠️ 接戦・殿直前撃破 (${ttkSeconds.toFixed(1)}秒)`;
      } else {
        statusBadge.style.background = "#c0392b";
        statusBadge.style.color = "#fff";
        statusBadge.textContent = `🚨 殿到達注意（火力不足の恐れ・推定） (所要 ${ttkSeconds.toFixed(1)}秒 > 猶予 ${travelSeconds}秒)`;
      }
    }

    detailText.innerHTML = `
      <span>総有効DPS: <strong>約 ${Math.round(totalDps).toLocaleString()}</strong> /秒</span>
      <span>ボス耐久: <strong>${boss.hp.toLocaleString()}</strong></span>
      <span>想定TTK: <strong>${ttkSeconds.toFixed(1)} 秒</strong></span>
      <span>殿到達猶予: <strong>約 ${travelSeconds} 秒</strong></span>
      <div style="font-size:12px; color:#777; width:100%; margin-top:4px;">※総有効DPS・想定TTK・到達猶予は直線進行を仮定したシミュレーション推計値です。足止めや移動ルート、撃破順により実戦とは異なります。</div>
    `;
  }

  // 11. 敗因タグと次の一手
  function renderLossCauseSection(stageTitle) {
    const container = document.getElementById("diagLossCausesContainer");
    if (!container) return;

    const lossCauses = [
      { key: "ki", label: "⚡ 気が足りない", advice: "［夏］枉死城・彦根城・四代目江戸城・臼杵城（気生成・気軽減特化）" },
      { key: "snipe", label: "🎯 殿・蔵スナイプ", advice: "平安京・臼杵城・［ハロウィン］カルルシュテイン城（避雷針伏兵）" },
      { key: "youkai", label: "👻 妖怪・術火力不足", advice: "［絢爛］久能山城・［活命］富山城・［学園］若桜鬼ヶ城（歌舞・祓串）" },
      { key: "antiAir", label: "🦅 対空・飛行敵抜け", advice: "［無疆］江戸城・小早川城・［絢爛］彦根城（弓・鉄砲・大砲）" },
      { key: "tank", label: "🛡️ 前線耐久崩壊", advice: "サン・フェリペ城・アンボワーズ城・盾／戦棍城娘（不屈・高防御）" },
      { key: "bossDps", label: "⏱️ ボス削りきれない", advice: "［夏］ルーヴル宮殿・［燦華］聚楽第・重複デバフ城娘（高倍率アタッカー）" }
    ];

    let savedCauses = {};
    try {
      const raw = localStorage.getItem("scre-helper:loss-causes:v1");
      if (raw) savedCauses = JSON.parse(raw);
    } catch (e) {
      savedCauses = {};
    }
    const stageTags = new Set(savedCauses[stageTitle] || []);

    container.innerHTML = `
      <div style="margin-top:10px; border-top:1px dashed #dcd2c4; padding-top:8px;">
        <div style="font-weight:bold; font-size:12.5px; color:#a03a08; margin-bottom:4px;">
          💀 敗因タグ記録 & 次の一手（入れ替え候補）:
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;" id="diagLossTagsRow">
          ${lossCauses.map(lc => `
            <button type="button" class="btn btn-sm diag-loss-tag-btn ${stageTags.has(lc.key) ? 'active' : ''}" data-key="${lc.key}" style="font-size:12px; padding:3px 8px; border-radius:12px; ${stageTags.has(lc.key) ? 'background:#c0392b; color:#fff; border-color:#962d22;' : 'background:#fff;'}">
              ${lc.label}
            </button>
          `).join("")}
        </div>
        <div id="diagNextStepsBox" style="font-size:12px; color:#444; background:#fff; padding:6px 10px; border-radius:4px; border:1px solid #ebdccb; line-height:1.45;"></div>
      </div>
    `;

    function updateNextSteps() {
      const nextBox = document.getElementById("diagNextStepsBox");
      if (!nextBox) return;
      const activeKeys = Array.from(stageTags);
      if (activeKeys.length === 0) {
        nextBox.innerHTML = `💡 敗因タグを選択すると、実戦プレイ動画解析に基づいた<strong>「次の一手 (入れ替え推奨城娘)」</strong>が自動提示されます。`;
        return;
      }

      const recs = activeKeys.map(k => {
        const item = lossCauses.find(x => x.key === k);
        return `• <strong>${item.label}:</strong> おすすめ入れ替え ➡️ <span style="color:#185a9d; font-weight:bold;">${item.advice}</span>`;
      });
      nextBox.innerHTML = recs.join("<br>");
    }

    updateNextSteps();

    container.querySelectorAll(".diag-loss-tag-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.key;
        if (stageTags.has(k)) {
          stageTags.delete(k);
          btn.classList.remove("active");
          btn.style.background = "#fff";
          btn.style.color = "";
          btn.style.borderColor = "";
        } else {
          stageTags.add(k);
          btn.classList.add("active");
          btn.style.background = "#c0392b";
          btn.style.color = "#fff";
          btn.style.borderColor = "#962d22";
        }
        try {
          const raw = localStorage.getItem("scre-helper:loss-causes:v1");
          const allCauses = raw ? JSON.parse(raw) : {};
          allCauses[stageTitle] = Array.from(stageTags);
          localStorage.setItem("scre-helper:loss-causes:v1", JSON.stringify(allCauses));
        } catch (e) {}
        updateNextSteps();
      });
    });
  }

  // Event Listeners for Prompt 32
  const btnFilterDelibAll = document.getElementById("btnFilterDelibAll");
  const btnFilterDelibWarnings = document.getElementById("btnFilterDelibWarnings");
  if (btnFilterDelibAll && btnFilterDelibWarnings) {
    btnFilterDelibAll.addEventListener("click", () => {
      currentDelibFilterMode = "all";
      btnFilterDelibAll.classList.add("active");
      btnFilterDelibWarnings.classList.remove("active");
      if (activeDiagStage) renderDeliberationMatrix(activeDiagStage);
    });
    btnFilterDelibWarnings.addEventListener("click", () => {
      currentDelibFilterMode = "warnings";
      btnFilterDelibWarnings.classList.add("active");
      btnFilterDelibAll.classList.remove("active");
      if (activeDiagStage) renderDeliberationMatrix(activeDiagStage);
    });
  }

  const btnToggleKi = document.getElementById("btnToggleKiLedger");
  const hdrKi = document.getElementById("kiLedgerHeader");
  const bodyKi = document.getElementById("kiLedgerBody");
  function toggleKiLedger() {
    if (!bodyKi) return;
    const isHidden = bodyKi.style.display === "none";
    bodyKi.style.display = isHidden ? "block" : "none";
    if (btnToggleKi) btnToggleKi.textContent = isHidden ? "閉じる ▴" : "開く ▾";
    if (isHidden) renderKiLedger();
  }
  if (btnToggleKi) btnToggleKi.addEventListener("click", (e) => { e.stopPropagation(); toggleKiLedger(); });
  if (hdrKi) hdrKi.addEventListener("click", toggleKiLedger);

  const btnRecalcKi = document.getElementById("btnRecalcKiLedger");
  if (btnRecalcKi) btnRecalcKi.addEventListener("click", renderKiLedger);
  const inputStartKi = document.getElementById("kiLedgerStartKi");
  if (inputStartKi) inputStartKi.addEventListener("change", renderKiLedger);
  const selectWaveSec = document.getElementById("kiLedgerWaveSec");
  if (selectWaveSec) selectWaveSec.addEventListener("change", renderKiLedger);

  const btnToggleCombat = document.getElementById("btnToggleCombatTactics");
  const hdrCombat = document.getElementById("combatTacticsHeader");
  const bodyCombat = document.getElementById("combatTacticsBody");
  function toggleCombatTactics() {
    if (!bodyCombat) return;
    const isHidden = bodyCombat.style.display === "none";
    bodyCombat.style.display = isHidden ? "block" : "none";
    if (btnToggleCombat) btnToggleCombat.textContent = isHidden ? "閉じる ▴" : "開く ▾";
    if (isHidden) {
      renderCycleSyncSection();
      renderTokenReportCardSection();
    }
  }
  if (btnToggleCombat) btnToggleCombat.addEventListener("click", (e) => { e.stopPropagation(); toggleCombatTactics(); });
  if (hdrCombat) hdrCombat.addEventListener("click", toggleCombatTactics);

  const btnTimer40 = document.getElementById("btnTimerStart40");
  if (btnTimer40) btnTimer40.addEventListener("click", startCycleTimer40);
  const btnTimerRst = document.getElementById("btnTimerReset");
  if (btnTimerRst) btnTimerRst.addEventListener("click", resetCycleTimer);


  // Initial render
  loadOwnership();
  populateDashboardStageSelect();
  checkShareUrlOnLoad();
  renderFilterPresetsUI();
  updateUndoButtonUI();
  updateCompareTrayUI();
  const appInfoCountEl = document.getElementById("appInfoCastleCount");
  if (appInfoCountEl && window.SCRE_DATA) {
    appInfoCountEl.textContent = window.SCRE_DATA.length.toLocaleString();
  }
  // Initialize Theme, Density, and Font Size (C1, C3, C5)
  const initTheme = loadThemeSettings();
  applyThemeSettings(initTheme.mode, initTheme.accent);

  const initDensity = loadDensitySetting();
  applyDensitySetting(initDensity);

  const initFontSize = loadFontSizeSetting();
  applyFontSizeSetting(initFontSize);

  populateGalleryFilterDropdowns();
  setListViewMode(listActiveViewMode);
  renderChallengeUI();

  renderPresetBar();
  renderDashboard();


  // =========================================================================
  // PROMPT 34: 計算の精密化と逆引き（機能1〜7 実装コア）
  // =========================================================================

  function getCastleCombinedEffects(cTarget) {
    if (!cTarget) return [];
    const efList = [];
    if (cTarget.skill && cTarget.skill.effects) efList.push(...cTarget.skill.effects);
    if (cTarget.strategy && cTarget.strategy.effects) efList.push(...cTarget.strategy.effects);
    if (cTarget.special && cTarget.special.effects) efList.push(...cTarget.special.effects);
    return efList;
  }

  function getCastleCuratedTier(cTarget) {
    if (!window.SCRE_TIERS || !window.SCRE_TIERS.overall) return { letter: "未評価", score: null, tag: "" };
    for (const row of window.SCRE_TIERS.overall.rows) {
      const found = row.castles.find(item => item.name === cTarget.name);
      if (found) {
        const letter = row.tier;
        let score = 0;
        if (letter === "EX" || letter === "SS") score = 5;
        else if (letter === "S") score = 4;
        else if (letter === "A") score = 3;
        else if (letter === "B") score = 2;
        else if (letter === "C") score = 1;
        return { letter, score, tag: found.tag || "" };
      }
    }
    return { letter: "未選出", score: null, tag: "" };
  }

  // --- 機能1: バフ等価換算（実質火力倍率） ---
  var currentBuffEquivDef = 500;
  var BUFF_EQUIV_BASE_ATK = 1200;

  function calculateBuffEquivalence(calcResult, enemyDef, baseAtk) {
    const targetDef = (typeof enemyDef === "number" && !isNaN(enemyDef)) ? enemyDef : (currentBuffEquivDef || 500);
    const targetBaseAtk = (typeof baseAtk === "number" && !isNaN(baseAtk)) ? baseAtk : (BUFF_EQUIV_BASE_ATK || 1200);
    const baseDmg = Math.max(1, targetBaseAtk - targetDef);

    let maxAtkPercent = 0;
    let maxAtkFlat = 0;
    let maxDmgDealt = 0;
    let maxDmgTargetMult = 1.0;

    if (calcResult && calcResult.perCastle) {
      for (const cid in calcResult.perCastle) {
        const b = calcResult.perCastle[cid].buffs;
        if (!b) continue;
        const atkP = (b.atkPercent?.max || 0) + (b.atkPercent?.stackSum || 0);
        if (atkP > maxAtkPercent) maxAtkPercent = atkP;
        const atkF = b.atkFlat?.sum || 0;
        if (atkF > maxAtkFlat) maxAtkFlat = atkF;
        const dmgD = (b.dmgDealt?.max || 0) + (b.dmgDealt?.stackSum || 0);
        if (dmgD > maxDmgDealt) maxDmgDealt = dmgD;

        let multProd = b.dmgDealtTarget?.multProduct;
        if (typeof multProd !== "number" || multProd <= 0) {
          const activeTargetSources = b.dmgDealtTarget?.sources ? b.dmgDealtTarget.sources.filter(s => s.applied !== false) : [];
          multProd = activeTargetSources.reduce((acc, s) => acc * (1 + s.val / 100), 1.0);
        }
        if (multProd > maxDmgTargetMult) maxDmgTargetMult = multProd;
      }
    }

    const defDownRatio = (calcResult?.enemyDebuffs?.enemyDefDown?.max) || 0;
    const enemyDmgTakenRatio = (calcResult?.enemyDebuffs?.enemyDmgTakenUp?.max) || 0;

    const atkRatio = maxAtkPercent;
    const atkFlat = maxAtkFlat;
    const defDownFlat = 0;
    const dmgDealtRatio = maxDmgDealt;
    const targetMultiplier = maxDmgTargetMult;

    const buffedAtk = Math.round(targetBaseAtk * (1 + atkRatio / 100) + atkFlat);
    const effectiveDef = Math.max(0, Math.round(targetDef * (1 - defDownRatio / 100) - defDownFlat));
    const rawBuffedDmg = Math.max(1, buffedAtk - effectiveDef);

    const multDealt = 1 + dmgDealtRatio / 100;
    const multTarget = targetMultiplier;
    const multTaken = 1 + enemyDmgTakenRatio / 100;
    const multSpecial = multDealt * multTarget * multTaken;

    const buffedDmg = Math.round(rawBuffedDmg * multSpecial);
    const totalMultiplier = buffedDmg / baseDmg;

    const dmgAtkOnly = Math.max(1, buffedAtk - targetDef);
    const multAtk = dmgAtkOnly / baseDmg;

    const dmgDefOnly = Math.max(1, targetBaseAtk - effectiveDef);
    const multDef = dmgDefOnly / baseDmg;

    return {
      enemyDef: targetDef,
      baseAtk: targetBaseAtk,
      baseDmg,
      buffedAtk,
      effectiveDef,
      buffedDmg,
      totalMultiplier,
      factors: {
        atk: { ratio: atkRatio, flat: atkFlat, mult: multAtk },
        def: { ratio: defDownRatio, flat: defDownFlat, mult: multDef },
        dmgDealt: { ratio: dmgDealtRatio, mult: multDealt },
        dmgDealtTarget: { value: targetMultiplier, mult: multTarget },
        enemyDmgTakenUp: { ratio: enemyDmgTakenRatio, mult: multTaken },
        damageDealt: { ratio: dmgDealtRatio, mult: multDealt },
        targetMultiplier: { value: targetMultiplier, mult: multTarget },
        damageTaken: { ratio: enemyDmgTakenRatio, mult: multTaken }
      }
    };
  }

  function renderBuffEquivalence(calcResult) {
    const headlineEl = document.getElementById("buffEquivHeadline");
    const totalBadgeEl = document.getElementById("buffEquivTotalBadge");
    const tableEl = document.getElementById("buffEquivBreakdownTable");
    if (!headlineEl || !totalBadgeEl || !tableEl) return;

    const res = calculateBuffEquivalence(calcResult, currentBuffEquivDef, BUFF_EQUIV_BASE_ATK);

    headlineEl.textContent = `この編成は対防御 ${res.enemyDef.toLocaleString()} で実質 ×${res.totalMultiplier.toFixed(2)} 倍 編成`;
    totalBadgeEl.textContent = `×${res.totalMultiplier.toFixed(2)}`;

    tableEl.innerHTML = `
      <table style="width:100%; font-size:12px; border-collapse:collapse; text-align:left;">
        <thead>
          <tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1;">
            <th style="padding:6px 8px;">バフ/デバフ系統</th>
            <th style="padding:6px 8px;">編成最大値</th>
            <th style="padding:6px 8px;">単体寄与倍率</th>
            <th style="padding:6px 8px;">効果概要</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px; font-weight:bold; color:#2c3e50;">⚔️ 攻撃力バフ</td>
            <td style="padding:6px 8px;">${res.factors.atk.ratio ? '+' + res.factors.atk.ratio + '%' : ''} ${res.factors.atk.flat ? '+' + res.factors.atk.flat : '' || '0%'}</td>
            <td style="padding:6px 8px; font-weight:bold; color:#1b4965;">×${res.factors.atk.mult.toFixed(2)}</td>
            <td style="padding:6px 8px; color:#555;">基礎攻撃力を引き上げ防御減算後の数値を底上げ</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px; font-weight:bold; color:#2c3e50;">🛡️ 敵防御デバフ</td>
            <td style="padding:6px 8px;">${res.factors.def.ratio ? '-' + res.factors.def.ratio + '%' : ''} ${res.factors.def.flat ? '-' + res.factors.def.flat : '' || '0%'}</td>
            <td style="padding:6px 8px; font-weight:bold; color:#1b4965;">×${res.factors.def.mult.toFixed(2)}</td>
            <td style="padding:6px 8px; color:#555;">有効防御を減少させ攻撃力の通る割合を改善</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px; font-weight:bold; color:#2c3e50;">💥 与ダメージ上昇</td>
            <td style="padding:6px 8px;">${res.factors.dmgDealt.ratio ? '+' + res.factors.dmgDealt.ratio + '%' : '0%'}</td>
            <td style="padding:6px 8px; font-weight:bold; color:#1b4965;">×${res.factors.dmgDealt.mult.toFixed(2)}</td>
            <td style="padding:6px 8px; color:#555;">減算後のダメージ全体を独立枠で直接乗算</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px; font-weight:bold; color:#2c3e50;">⚡ 与ダメ倍率（特殊）</td>
            <td style="padding:6px 8px;">×${res.factors.dmgDealtTarget.value.toFixed(2)}</td>
            <td style="padding:6px 8px; font-weight:bold; color:#1b4965;">×${res.factors.dmgDealtTarget.mult.toFixed(2)}</td>
            <td style="padding:6px 8px; color:#555;">「攻撃が○倍」などの特殊乗算枠</td>
          </tr>
          <tr style="border-bottom:1px solid #cbd5e1;">
            <td style="padding:6px 8px; font-weight:bold; color:#2c3e50;">🎯 敵被ダメージ上昇</td>
            <td style="padding:6px 8px;">${res.factors.enemyDmgTakenUp.ratio ? '+' + res.factors.enemyDmgTakenUp.ratio + '%' : '0%'}</td>
            <td style="padding:6px 8px; font-weight:bold; color:#1b4965;">×${res.factors.enemyDmgTakenUp.mult.toFixed(2)}</td>
            <td style="padding:6px 8px; color:#555;">敵デバフ枠として与ダメ上昇とさらに別枠で乗算</td>
          </tr>
          <tr style="background:#f8fafc; font-weight:bold;">
            <td style="padding:8px 8px; color:#1f4068;" colspan="2">🌟 相乗実効総合倍率（対防御 ${res.enemyDef.toLocaleString()}）</td>
            <td style="padding:8px 8px; font-size:14px; color:#d35400;">×${res.totalMultiplier.toFixed(2)}</td>
            <td style="padding:8px 8px; color:#333;">未バフ時一撃 ${res.baseDmg.toLocaleString()} ➔ バフ後一撃 ${res.buffedDmg.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function initBuffEquivalenceListeners() {
    const defBtns = document.querySelectorAll(".buff-equiv-def-btn");
    const customDefInput = document.getElementById("buffEquivCustomDef");

    defBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        defBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentBuffEquivDef = parseInt(btn.dataset.def, 10) || 0;
        if (customDefInput) customDefInput.value = currentBuffEquivDef;
        renderBuffEquivalence(calculateBuffs());
      });
    });

    if (customDefInput) {
      customDefInput.addEventListener("input", () => {
        const val = parseInt(customDefInput.value, 10);
        if (!isNaN(val) && val >= 0) {
          currentBuffEquivDef = val;
          defBtns.forEach(b => b.classList.remove("active"));
          renderBuffEquivalence(calculateBuffs());
        }
      });
    }
  }

  // --- 機能2: 対策コンシェルジュ（敵特性からの逆引き） ---
  const SCRE_COUNTER_TRAIT_DEFS = {
    "飛行": {
      name: "飛行",
      matcher: (c, fullText) => {
        if (c.weapon === "弓") return "［弓］対空飛行敵へ攻撃1.5倍特攻";
        const m = fullText.match(/飛行.*(?:特効|上昇|倍|解除|対象|無効化|撃破)|飛行敵/);
        if (m) return "［特技・計略］" + m[0];
        return null;
      }
    },
    "足止め無効": {
      name: "足止め無効",
      matcher: (c, fullText) => {
        const m = fullText.match(/移動速度.*(?:低下|半減|%低下|減)|後退|ノックバック|敵の移動速度/);
        if (m) return "［鈍足/後退］" + m[0];
        if (getCastleCombinedEffects(c).some(e => e.stat === "enemySlow")) return "［敵移動低下］鈍足デバフで進軍を遅延・速攻";
        return null;
      }
    },
    "術反射": {
      name: "術反射",
      matcher: (c, fullText) => {
        // 物理直接攻撃武器: 歌舞・陣貝・茶器（支援回復）、本（特殊計略）、法術・杖・祓串・鈴（術属性）を除外した物理攻撃武器種
        if (["刀", "槍", "槌", "拳", "弓", "石弓", "鉄砲", "大砲", "投剣", "鞭", "鎌", "戦棍", "盾", "双剣", "ランス", "軍船", "その他"].includes(c.weapon)) {
          return "［物理アタッカー］術反射に影響されない物理直接火力";
        }
        const m = fullText.match(/物理ダメージ|術ダメージを物理|術無効/);
        if (m) return "［物理変換/術無効］" + m[0];
        return null;
      }
    },
    "物理軽減": {
      name: "物理軽減",
      matcher: (c, fullText) => {
        if (["法術", "杖", "祓串", "鈴"].includes(c.weapon)) return "［術攻撃］物理軽減・高防御を無視する術ダメージ";
        const m = fullText.match(/(?:敵の)?防御(?:力)?を?(?:無視|0として計算|減算な)|術ダメージ/);
        if (m) return "［防御無視/術］" + m[0];
        if (getCastleCombinedEffects(c).some(e => e.stat === "enemyDefDown" && e.value >= 30)) return "［敵防御大幅低下］物理軽減敵の有効防御を削減";
        return null;
      }
    },
    "状態異常無効": {
      name: "状態異常無効",
      matcher: (c, fullText) => {
        if (getCastleCombinedEffects(c).some(e => (e.stat === "dmgDealt" || e.stat === "dmgDealtTarget" || e.stat === "enemyDmgTakenUp") && e.value >= 20)) {
          return "［直接火力増幅］状態異常に頼らず純粋な与ダメ・被ダメ増幅で突破";
        }
        return null;
      }
    },
    "割合ダメージ": {
      name: "割合ダメージ",
      matcher: (c, fullText) => {
        const m = fullText.match(/不死|不屈|大破.*(?:防ぐ|しない)|攻撃対象にならない|隠密|バリア|被ダメージ.*(?:軽減|半減)/);
        if (m) return "［不死/隠密/軽減］" + m[0];
        if (getCastleCombinedEffects(c).some(e => e.stat === "dmgTakenDown")) return "［被ダメ軽減］大ダメージ・割合削りを防護";
        return null;
      }
    },
    "高防御": {
      name: "高防御",
      matcher: (c, fullText) => {
        if (["法術", "杖", "祓串", "鈴"].includes(c.weapon)) return "［防御無視］敵防御に関わらずダメージを通す";
        const m = fullText.match(/(?:敵の)?防御(?:力)?を?(?:無視|0として計算|減算な)|術ダメージ/);
        if (m) return "［防御無視］" + m[0];
        if (getCastleCombinedEffects(c).some(e => e.stat === "enemyDefDown" && e.value >= 40)) return "［敵防御40%以上低下］高防御を解体";
        return null;
      }
    }
  };

  var currentCounterSelectedTraits = new Set(["飛行", "足止め無効"]);

  function findCounterCastles(traits) {
    const traitList = Array.from(traits);
    if (traitList.length === 0) return [];

    const results = [];
    SCRE_DATA.forEach(c => {
      const fullText = getCastleFullText(c);
      const matchedReasons = [];

      traitList.forEach(tr => {
        const def = SCRE_COUNTER_TRAIT_DEFS[tr];
        if (def) {
          const reason = def.matcher(c, fullText);
          if (reason) {
            matchedReasons.push({ trait: tr, reason });
          }
        }
      });

      if (matchedReasons.length > 0) {
        results.push({
          castle: c,
          matchCount: matchedReasons.length,
          matchedReasons
        });
      }
    });

    results.sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return (b.castle.rarity || 0) - (a.castle.rarity || 0);
    });

    return results;
  }

  function renderCounterConcierge() {
    const container = document.getElementById("counterConciergeResults");
    const countEl = document.getElementById("counterConciergeCount");
    const activeLabel = document.getElementById("counterActiveTraitsLabel");
    const activeBox = document.getElementById("counterActiveTraits");
    if (!container || !countEl) return;

    const traits = Array.from(currentCounterSelectedTraits);
    if (activeLabel && activeBox) {
      if (traits.length > 0) {
        activeBox.style.display = "block";
        activeLabel.textContent = traits.join("、");
      } else {
        activeBox.style.display = "none";
      }
    }

    const matches = findCounterCastles(currentCounterSelectedTraits);
    countEl.textContent = `${matches.length} 件`;

    if (matches.length === 0) {
      container.innerHTML = `<div style="padding:10px; text-align:center; color:#888; font-size:12px;">選択した特性に有効な城娘が見つかりませんでした。特性の組み合わせを変更してください。</div>`;
      return;
    }

    container.innerHTML = matches.slice(0, 30).map(m => {
      const c = m.castle;
      const inParty = party.some(p => p && p.id === c.id);
      const reasonPills = m.matchedReasons.map(r => `
        <span class="badge" style="background:#edf2f7; color:#2d3748; border:1px solid #cbd5e0; font-size:12px; margin-right:4px;">
          <strong>[${escapeHtml(r.trait)}]</strong> ${escapeHtml(r.reason)}
        </span>
      `).join("");

      return `
        <div class="counter-concierge-card">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
            <div onclick="openCastleDetail('${escapeHtml(c.id)}')" style="cursor:pointer; flex-shrink:0;">
              ${getIconHtml(c, 36)}
            </div>
            <div style="min-width:0; flex:1;">
              <div style="font-size:12px; font-weight:bold; color:#2c3e50; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                <span onclick="openCastleDetail('${escapeHtml(c.id)}')" style="cursor:pointer;">${escapeHtml(c.name)}</span>
                <span style="font-size:12px; color:#666; font-weight:normal; margin-left:4px;">★${c.rarity} ${c.weapon}</span>
              </div>
              <div style="margin-top:2px; display:flex; flex-wrap:wrap; gap:3px;">
                ${reasonPills}
              </div>
            </div>
          </div>
          <div style="flex-shrink:0;">
            <button type="button" class="btn btn-xs ${inParty ? 'btn-remove' : 'btn-primary'}" onclick="quickToggleParty('${escapeHtml(c.id)}')">
              ${inParty ? '✓ 編成中' : '+ 編成'}
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderCounterConciergeForStage(stageObj) {
    if (!stageObj) return;
    const b = (typeof getBossForStage === "function") ? getBossForStage(stageObj) : null;
    if (b) {
      currentCounterSelectedTraits.clear();
      if (b.traits && Array.isArray(b.traits)) {
        b.traits.forEach(t => currentCounterSelectedTraits.add(t));
      } else {
        if (b.isFlying) currentCounterSelectedTraits.add("飛行");
        currentCounterSelectedTraits.add("足止め無効");
        if (b.hasTransform) currentCounterSelectedTraits.add("割合ダメージ");
      }
      const traitBtns = document.querySelectorAll(".counter-trait-btn");
      traitBtns.forEach(btn => {
        if (currentCounterSelectedTraits.has(btn.dataset.trait)) btn.classList.add("active");
        else btn.classList.remove("active");
      });
      renderCounterConcierge();
    }
  }

  function initCounterConciergeListeners() {
    const traitBtns = document.querySelectorAll(".counter-trait-btn");
    traitBtns.forEach(btn => {
      const tr = btn.dataset.trait;
      if (currentCounterSelectedTraits.has(tr)) btn.classList.add("active");
      btn.addEventListener("click", () => {
        if (currentCounterSelectedTraits.has(tr)) {
          currentCounterSelectedTraits.delete(tr);
          btn.classList.remove("active");
        } else {
          currentCounterSelectedTraits.add(tr);
          btn.classList.add("active");
        }
        renderCounterConcierge();
      });
    });

    const bossSelect = document.getElementById("counterConciergeBossSelect");
    if (bossSelect && SCRE_BOSS_CATALOG) {
      bossSelect.innerHTML = `<option value="">ボスカタログから選択</option>` +
        SCRE_BOSS_CATALOG.map((b, idx) => `<option value="${idx}">${escapeHtml(b.name)}</option>`).join("");

      bossSelect.addEventListener("change", () => {
        const idx = parseInt(bossSelect.value, 10);
        if (isNaN(idx) || !SCRE_BOSS_CATALOG[idx]) return;
        const b = SCRE_BOSS_CATALOG[idx];
        currentCounterSelectedTraits.clear();
        if (b.traits && Array.isArray(b.traits)) {
          b.traits.forEach(t => currentCounterSelectedTraits.add(t));
        } else {
          if (b.isFlying) currentCounterSelectedTraits.add("飛行");
          currentCounterSelectedTraits.add("足止め無効");
        }
        traitBtns.forEach(btn => {
          if (currentCounterSelectedTraits.has(btn.dataset.trait)) btn.classList.add("active");
          else btn.classList.remove("active");
        });
        renderCounterConcierge();
      });
    }
  }

  // --- 機能3: 効果タグ逆引き辞典 ---
  const SCRE_EFFECT_TAG_RULES = [
    { tag: "気増加", label: "気増加", pattern: /気の自然増加|撃破時に.*気|気を.*増|気.*軽減|気.*消費/, effectStat: [], desc: "気の自然増加・撃破時気獲得・気軽減など気全般" },
    { tag: "計略短縮", label: "計略短縮", pattern: /計略.*(?:短縮|再使用)/, effectStat: [], desc: "計略の再使用時間（CT）短縮" },
    { tag: "攻撃速度上昇", label: "攻撃速度上昇", pattern: /攻撃速度.*(?:上昇|%|倍)/, effectStat: ["atkSpeed"], desc: "攻撃モーション速度の上昇" },
    { tag: "隙短縮", label: "隙短縮", pattern: /攻撃後の隙.*(?:短縮|%)/, effectStat: ["gapShorten"], desc: "攻撃後の待機時間（隙）短縮" },
    { tag: "射程上昇", label: "射程上昇", pattern: /射程.*(?:上昇|伸びる|\+\d+|%)/, effectStat: ["rangePercent", "rangeFlat"], desc: "自身・味方の射程拡大" },
    { tag: "攻撃力上昇", label: "攻撃力上昇", pattern: /攻撃が?\d+%?上昇|攻撃が?\+\d+/, effectStat: ["atkPercent", "atkFlat"], desc: "攻撃力の割合・固定値強化" },
    { tag: "与ダメ上昇", label: "与ダメ上昇", pattern: /与えるダメージ.*(?:上昇|%)/, effectStat: ["dmgDealt"], desc: "与えるダメージの割合上昇" },
    { tag: "被ダメ軽減", label: "被ダメ軽減", pattern: /被ダメージ.*(?:軽減|%|半減)/, effectStat: ["dmgTakenDown"], desc: "受けるダメージの割合軽減" },
    { tag: "バリア", label: "バリア", pattern: /バリア|耐久の\d+%の耐久/, effectStat: [], desc: "耐久を肩代わりするバリア付与" },
    { tag: "ノックバック", label: "ノックバック", pattern: /敵を後退|後退させる|ノックバック/, effectStat: [], desc: "敵を押し戻すノックバック" },
    { tag: "足止め", label: "足止め", pattern: /足止め|足を止める/, effectStat: [], desc: "敵の移動を停止する足止め能力" },
    { tag: "防御無視", label: "防御無視", pattern: /(?:敵の)?防御(?:力)?を?(?:無視|0として計算|減算な)|術ダメージ/, effectStat: [], weapon: ["法術", "杖", "祓串", "鈴"], desc: "防御力を無視する術攻撃・直撃貫通" },
    { tag: "敵攻撃低下", label: "敵攻撃低下", pattern: /敵の攻撃.*(?:低下|%|半減)/, effectStat: ["enemyAtkDown"], desc: "敵の攻撃力を割合・固定値で弱体化" },
    { tag: "敵防御低下", label: "敵防御低下", pattern: /敵の防御.*(?:低下|%|半減)/, effectStat: ["enemyDefDown"], desc: "敵の防御力を割合・固定値で弱体化" },
    { tag: "敵移動低下", label: "敵移動低下", pattern: /移動速度.*(?:低下|%|半減)/, effectStat: ["enemySlow"], desc: "敵の移動速度を低下（鈍足）" },
    { tag: "状態異常付与", label: "状態異常付与", pattern: /(?:火傷|氷結|猛毒|混乱|暗闇|絶望|移動不能|行動不能).*(?:付与|にする|状態)/, effectStat: [], desc: "火傷/氷結/猛毒/暗闇等の状態異常を付与" },
    { tag: "状態異常回復・無効", label: "状態異常回復・無効", pattern: /状態異常.*(?:回復|防ぐ|無効)/, effectStat: [], desc: "状態異常の解除または無効化" },
    { tag: "不死・不屈", label: "不死・不屈", pattern: /不死|不屈|大破.*(?:防ぐ|しない|耐える)/, effectStat: [], desc: "耐久0になっても大破しない不死・不屈" },
    { tag: "隠密", label: "隠密", pattern: /攻撃対象にならない|隠密/, effectStat: [], desc: "敵の攻撃対象から外れる隠密状態" },
    { tag: "反射", label: "反射", pattern: /ダメージ.*反射|反射する/, effectStat: [], desc: "受けたダメージを敵に跳ね返す反射" },
    { tag: "伏兵・トークン", label: "伏兵・トークン", pattern: /伏兵|トークン/, effectStat: [], desc: "伏兵・トークンを配置して支援やデコイに活用" }
  ];

  var activeTagFilter = null;

  function extractCastleEffectTags(c) {
    const fullText = getCastleFullText(c);
    const matchedTags = [];
    const cEffects = getCastleCombinedEffects(c);

    SCRE_EFFECT_TAG_RULES.forEach(rule => {
      let matched = false;
      if (rule.weapon && rule.weapon.includes(c.weapon)) {
        matched = true;
      }
      if (!matched && rule.effectStat && rule.effectStat.length > 0) {
        if (cEffects.some(ef => rule.effectStat.includes(ef.stat))) {
          matched = true;
        }
      }
      if (!matched && rule.pattern && rule.pattern.test(fullText)) {
        matched = true;
      }
      if (matched) {
        matchedTags.push(rule.tag);
      }
    });

    return matchedTags;
  }

  function initTagDictionary() {
    const cloudContainer = document.getElementById("tagDictCloudContainer");
    const clearBtn = document.getElementById("btnTagDictClear");
    const toggleBtn = document.getElementById("btnTagDictToggle");
    const badgeEl = document.getElementById("tagDictActiveFilterBadge");
    const ruleInfoEl = document.getElementById("tagDictRuleInfo");
    if (!cloudContainer) return;

    const tagCounts = {};
    SCRE_EFFECT_TAG_RULES.forEach(r => tagCounts[r.tag] = 0);

    SCRE_DATA.forEach(c => {
      const tags = extractCastleEffectTags(c);
      tags.forEach(t => {
        if (tagCounts[t] !== undefined) tagCounts[t]++;
      });
    });

    cloudContainer.innerHTML = SCRE_EFFECT_TAG_RULES.map(rule => `
      <span class="tag-dict-chip ${activeTagFilter === rule.tag ? 'active' : ''}" data-tag="${escapeHtml(rule.tag)}" title="${escapeHtml(rule.desc)}">
        ${escapeHtml(rule.label)} <span class="tag-dict-count">(${tagCounts[rule.tag] || 0})</span>
      </span>
    `).join("");

    cloudContainer.querySelectorAll(".tag-dict-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const t = chip.dataset.tag;
        if (activeTagFilter === t) {
          activeTagFilter = null;
        } else {
          activeTagFilter = t;
        }
        updateTagDictUI();
        if (typeof resetPageAndRenderAll === "function") resetPageAndRenderAll();
      });
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        activeTagFilter = null;
        updateTagDictUI();
        if (typeof resetPageAndRenderAll === "function") resetPageAndRenderAll();
      });
    }

    if (toggleBtn) {
      let expanded = false;
      toggleBtn.addEventListener("click", () => {
        expanded = !expanded;
        cloudContainer.style.maxHeight = expanded ? "none" : "140px";
        toggleBtn.textContent = expanded ? "折りたたむ ▲" : "タグ一覧を展開 ▼";
      });
    }

    function updateTagDictUI() {
      cloudContainer.querySelectorAll(".tag-dict-chip").forEach(chip => {
        if (chip.dataset.tag === activeTagFilter) chip.classList.add("active");
        else chip.classList.remove("active");
      });
      if (activeTagFilter) {
        if (clearBtn) clearBtn.style.display = "inline-block";
        if (badgeEl) {
          badgeEl.style.display = "inline-block";
          badgeEl.textContent = `選択中: ${activeTagFilter}`;
        }
        if (ruleInfoEl) {
          const r = SCRE_EFFECT_TAG_RULES.find(x => x.tag === activeTagFilter);
          ruleInfoEl.style.display = "block";
          ruleInfoEl.innerHTML = `<strong>抽出ルール:</strong> ${escapeHtml(r ? r.desc : '')} (正規表現: <code>${r && r.pattern ? r.pattern.toString() : '効果stat/武器種'}</code>)`;
        }
      } else {
        if (clearBtn) clearBtn.style.display = "none";
        if (badgeEl) badgeEl.style.display = "none";
        if (ruleInfoEl) ruleInfoEl.style.display = "none";
      }
    }
  }

  function renderDetailEffectTags(c) {
    const container = document.getElementById("detailEffectTagsList");
    if (!container) return;
    const tags = extractCastleEffectTags(c);
    if (tags.length === 0) {
      container.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">該当する効果タグなし</span>`;
      return;
    }
    container.innerHTML = tags.map(t => `
      <span class="badge" style="background:#e8f4fd; color:#1b4965; border:1px solid #b8daff; font-size:12px; padding:3px 7px;">
        🏷️ ${escapeHtml(t)}
      </span>
    `).join("");
  }

  // --- 機能4: 評価分裂ビュー ---
  var tierSplitFilterOnlySplit = false;
  var tierSplitFilterWeapon = "";

  function computeCastleEvaluationSplit(c) {
    const curatedData = getCastleCuratedTier(c);
    const curatedLetter = curatedData.letter;
    const curatedScore = curatedData.score;

    if (!cachedComputedScores && typeof computeCastleScores === "function") {
      cachedComputedScores = computeCastleScores(roleTierWeights);
    }
    const autoItem = cachedComputedScores ? cachedComputedScores.find(s => s.id === c.id || s.name === c.name) : null;
    const autoLetter = autoItem ? (autoItem.overallTier || autoItem.roleTier || "未算出") : "未算出";
    const autoScoreNum = autoItem ? (autoItem.overallScore !== undefined ? autoItem.overallScore : autoItem.total || 0) : null;
    const autoScore = autoItem ? (autoLetter === "SS" ? 5 : autoLetter === "S" ? 4 : autoLetter === "A" ? 3 : autoLetter === "B" ? 2 : autoLetter === "C" ? 1 : 0) : null;

    let ohigeLetter = "圏外";
    let ohigeScore = 0;
    let hasOhigeEntry = false;
    if (typeof computeOhigeScores === "function") {
      const ohigeList = computeOhigeScores();
      const entry = ohigeList.find(e => e.id === c.id || e.name === c.name);
      if (entry) {
        hasOhigeEntry = true;
        ohigeLetter = entry.ohigeWeaponTier || entry.ohigeTier || "圏外";
        if (ohigeLetter === "Tier0" || ohigeLetter === "Tier 0") ohigeScore = 5;
        else if (ohigeLetter === "Tier1" || ohigeLetter === "Tier 1") ohigeScore = 4;
        else if (ohigeLetter === "Tier2" || ohigeLetter === "Tier 2") ohigeScore = 3;
        else if (ohigeLetter === "Tier3" || ohigeLetter === "Tier 3") ohigeScore = 2;
        else ohigeScore = 0;
      }
    }

    const validScores = [];
    if (autoScore !== null) validScores.push(autoScore);
    if (curatedScore !== null) validScores.push(curatedScore);
    if (hasOhigeEntry && ohigeLetter !== "圏外" && ohigeLetter !== "未選出") validScores.push(ohigeScore);

    const divergence = validScores.length >= 2 ? (Math.max(...validScores) - Math.min(...validScores)) : 0;
    const isSplit = validScores.length >= 2 && divergence >= 2;

    return {
      castle: c,
      curated: { letter: curatedLetter, score: curatedScore },
      auto: { letter: autoLetter, score: autoScore, scoreVal: autoScoreNum, role: autoItem ? autoItem.role : "汎用" },
      ohige: { letter: ohigeLetter, score: ohigeScore },
      divergence,
      isSplit
    };
  }

  function renderTierViewSplit() {
    const grid = document.getElementById("tierSplitGrid");
    const statsBadge = document.getElementById("tierSplitStatsBadge");
    const weaponSelect = document.getElementById("selectTierSplitWeapon");
    if (!grid || !statsBadge) return;

    if (weaponSelect && weaponSelect.options.length <= 1) {
      const weapons = Array.from(new Set(SCRE_DATA.map(c => c.weapon).filter(Boolean))).sort();
      weapons.forEach(w => {
        const opt = document.createElement("option");
        opt.value = w;
        opt.textContent = w;
        weaponSelect.appendChild(opt);
      });
      weaponSelect.addEventListener("change", () => {
        tierSplitFilterWeapon = weaponSelect.value;
        renderTierViewSplit();
      });
    }

    const evaluations = SCRE_DATA.map(c => computeCastleEvaluationSplit(c));
    const splitCount = evaluations.filter(e => e.isSplit).length;
    const totalCount = evaluations.length;
    const splitPct = ((splitCount / totalCount) * 100).toFixed(1);

    statsBadge.textContent = `比較対象: ${totalCount}体 / ⚡ 評価分裂: ${splitCount}体 (${splitPct}%)`;

    let filtered = evaluations;
    if (tierSplitFilterOnlySplit) {
      filtered = filtered.filter(e => e.isSplit);
    }
    if (tierSplitFilterWeapon) {
      filtered = filtered.filter(e => e.castle.weapon === tierSplitFilterWeapon);
    }

    filtered.sort((a, b) => {
      if (b.divergence !== a.divergence) return b.divergence - a.divergence;
      return (b.castle.rarity || 0) - (a.castle.rarity || 0);
    });

    grid.innerHTML = filtered.slice(0, 50).map(item => {
      const c = item.castle;
      const splitBadgeHtml = item.isSplit
        ? `<span class="badge" style="background:#d97706; color:#fff; font-size:12px; font-weight:bold; padding:3px 8px;">⚡ 評価分裂: 差分 ${item.divergence}段階</span>`
        : `<span class="badge" style="background:#e2e8f0; color:#475569; font-size:12px; padding:3px 8px;">評価近似 (差分${item.divergence})</span>`;

      return `
        <div class="tier-split-card ${item.isSplit ? 'is-split' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div onclick="openCastleDetail('${escapeHtml(c.id)}')" style="cursor:pointer;">
                ${getIconHtml(c, 40)}
              </div>
              <div>
                <div style="font-size:14px; font-weight:bold; color:#1e293b; cursor:pointer;" onclick="openCastleDetail('${escapeHtml(c.id)}')">
                  ${escapeHtml(c.name)}
                  <span style="font-size:12px; color:#64748b; font-weight:normal; margin-left:4px;">★${c.rarity} ${c.weapon}</span>
                </div>
                <div style="font-size:12px; color:#64748b;">${c.country || ''} [${c.subType || c.castleType || ''}]</div>
              </div>
            </div>
            <div>${splitBadgeHtml}</div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:8px; margin-top:4px;">
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px;">
              <div style="font-weight:bold; font-size:12px; color:#0f766e; margin-bottom:2px;">🌟 キュレーションTier</div>
              <div style="font-size:16px; font-weight:bold; color:#0f766e;">${escapeHtml(item.curated.letter)}</div>
              <div style="font-size:12px; color:#64748b;">定性評価・環境推薦枠</div>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px;">
              <div style="font-weight:bold; font-size:12px; color:#1e40af; margin-bottom:2px;">🤖 役割別自動スコア</div>
              <div style="font-size:16px; font-weight:bold; color:#1e40af;">${escapeHtml(item.auto.letter)} <span style="font-size:12px; font-weight:normal;">(${item.auto.scoreVal !== null ? item.auto.scoreVal.toFixed(1) + '点' : '-'})</span></div>
              <div style="font-size:12px; color:#64748b;">役割: ${escapeHtml(item.auto.role || '汎用')}</div>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px;">
              <div style="font-weight:bold; font-size:12px; color:#9a3412; margin-bottom:2px;">🧔 おひげ式Tier</div>
              <div style="font-size:16px; font-weight:bold; color:#9a3412;">${escapeHtml(item.ohige.letter)}</div>
              <div style="font-size:12px; color:#64748b;">高難度・武器種相対評価</div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function initTierSplitListeners() {
    const btnAll = document.getElementById("btnTierSplitFilterAll");
    const btnOnlySplit = document.getElementById("btnTierSplitFilterOnlySplit");
    if (btnAll && btnOnlySplit) {
      btnAll.addEventListener("click", () => {
        tierSplitFilterOnlySplit = false;
        btnAll.classList.add("active");
        btnOnlySplit.classList.remove("active");
        renderTierViewSplit();
      });
      btnOnlySplit.addEventListener("click", () => {
        tierSplitFilterOnlySplit = true;
        btnOnlySplit.classList.add("active");
        btnAll.classList.remove("active");
        renderTierViewSplit();
      });
    }
  }

  // --- 機能5: シナジー・レコメンド（弱点補強） ---
  function detectCastleWeaknesses(c) {
    const weaknesses = [];
    const fullText = getCastleFullText(c);

    // 巨大化最大時 (c.stats.giant5) のステータスを基準に判定
    const giantRange = (c.stats && c.stats.giant5 && c.stats.giant5.range) || 0;
    const isMelee = ["刀", "槍", "槌", "拳", "鎌"].includes(c.weapon);
    if ((giantRange > 0 && giantRange <= 220) || (isMelee && !/射程.*(?:上昇|\+\d+|%)/.test(fullText))) {
      weaknesses.push({
        key: "range",
        label: "短射程",
        desc: `最大射程(${giantRange || '近接'})が短く、迎撃・巻き込み範囲が限定的`,
        partnerFilter: (p, pText) => /射程.*(?:上昇|\+\d+|%)/.test(pText),
        reasonTmpl: "［射程上昇］短射程をカバーし巻き込み範囲を拡大"
      });
    }

    const cd = (c.strategy && c.strategy.cooldown) || 0;
    if (cd >= 50) {
      weaknesses.push({
        key: "cooldown",
        label: "計略CT長",
        desc: `計略CT(${cd}秒)が重く、回転率・常時維持に課題`,
        partnerFilter: (p, pText) => /計略.*(?:短縮|再使用)/.test(pText),
        reasonTmpl: "［計略短縮］CTの重さを緩和し計略回転を安定化"
      });
    }

    const cost = c.cost || 0;
    const isHeavyWeapon = ["大砲", "槌", "法術", "陣貝"].includes(c.weapon);
    if (cost >= 12 || (isHeavyWeapon && !/気の自然増加|撃破時に.*気|気.*軽減/.test(fullText))) {
      weaknesses.push({
        key: "ki",
        label: "気消費大",
        desc: `配置気(${cost})および巨大化総コストが重く初動が遅れがち`,
        partnerFilter: (p, pText) => /気の自然増加|撃破時に.*気|気.*軽減/.test(pText),
        reasonTmpl: "［気増加・軽減］巨大化コストを補助し立ち上がりを加速"
      });
    }

    const giantDef = (c.stats && c.stats.giant5 && c.stats.giant5.def) || 0;
    const giantHp = (c.stats && c.stats.giant5 && c.stats.giant5.hp) || 0;
    if ((giantDef > 0 && giantDef <= 100) || (giantHp > 0 && giantHp <= 2600)) {
      weaknesses.push({
        key: "durability",
        label: "耐久・防御不安",
        desc: `巨大化後耐久(${giantHp})/防御(${giantDef})が低く被弾に脆弱`,
        partnerFilter: (p, pText) => /被ダメージ.*(?:軽減|%|半減)|バリア/.test(pText) || ["歌舞", "祓串"].includes(p.weapon),
        reasonTmpl: "［被ダメ軽減・バリア］脆弱な耐久面を肩代わり防護"
      });
    }

    if (["槌", "大砲", "鉄砲"].includes(c.weapon) && !/攻撃速度.*上昇|攻撃後の隙.*短縮/.test(fullText)) {
      weaknesses.push({
        key: "speed",
        label: "攻撃隙大",
        desc: `武器特性による攻撃モーション・隙が重くDPSが伸びにくい`,
        partnerFilter: (p, pText) => /攻撃速度.*上昇|攻撃後の隙.*短縮/.test(pText),
        reasonTmpl: "［速度・隙短縮］重い攻撃サイクルを高速化しDPSを改善"
      });
    }

    if (isMelee && !["法術", "杖", "祓串", "鈴"].includes(c.weapon) && !/防御.*無視|術ダメージ/.test(fullText)) {
      weaknesses.push({
        key: "defPierce",
        label: "対高防御減衰",
        desc: `純物理攻撃のため高防御敵に対してダメージが大きく減衰`,
        partnerFilter: (p, pText) => /敵の防御.*(?:低下|%|半減)/.test(pText) || ["法術", "杖"].includes(p.weapon),
        reasonTmpl: "［防御低下/術］高防御敵の装甲を削り物理ダメージを通す"
      });
    }

    return weaknesses;
  }

  function calculateCastleWeaknessSynergy(targetCastle) {
    const weaknesses = detectCastleWeaknesses(targetCastle);
    if (weaknesses.length === 0) return { weaknesses: [], partners: [] };

    const partners = [];
    SCRE_DATA.forEach(p => {
      if (p.id === targetCastle.id) return;
      const pText = getCastleFullText(p);
      const solvedReasons = [];
      let score = 0;

      weaknesses.forEach(w => {
        if (w.partnerFilter(p, pText)) {
          score += 20;
          solvedReasons.push(w.reasonTmpl);
        }
      });

      if (score > 0) {
        if (p.rarity >= 7) score += 5;
        partners.push({
          castle: p,
          score,
          reasons: Array.from(new Set(solvedReasons)).slice(0, 2)
        });
      }
    });

    partners.sort((a, b) => b.score - a.score);
    return {
      weaknesses,
      partners: partners.slice(0, 5)
    };
  }

  function renderCastleWeaknessSynergyUI(targetCastle) {
    const weaknessListEl = document.getElementById("detailWeaknessList");
    const synergyListEl = document.getElementById("detailSynergyList");
    if (!weaknessListEl || !synergyListEl) return;

    const res = calculateCastleWeaknessSynergy(targetCastle);

    if (res.weaknesses.length > 0) {
      weaknessListEl.innerHTML = res.weaknesses.map(w => `
        <span class="synergy-weakness-badge" title="${escapeHtml(w.desc)}">
          ⚠️ 弱点: ${escapeHtml(w.label)}
        </span>
      `).join("");
    } else {
      weaknessListEl.innerHTML = `<span class="badge" style="background:#e8f5e9; color:#2e7d32; font-size:12px;">✅ データ上の顕著な弱点なし（自己完結型）</span>`;
    }

    if (res.partners.length === 0) {
      synergyListEl.innerHTML = `<div style="font-size:12px; color:var(--text-sub); padding:10px;">弱点を補う相方候補が見つかりませんでした。</div>`;
      return;
    }

    synergyListEl.innerHTML = res.partners.map(entry => {
      const p = entry.castle;
      const inParty = party.some(slot => slot && slot.id === p.id);
      const badgesHtml = entry.reasons.map(r => `
        <span class="badge synergy-chip" style="background:#e8f4fd; color:#1b4965; border:1px solid #b8daff; font-size:12px; margin-right:4px;">
          ${escapeHtml(r)}
        </span>
      `).join("");

      return `
        <div class="synergy-card">
          <div class="synergy-card-left" onclick="openCastleDetail('${escapeHtml(p.id)}')" style="cursor:pointer;" title="詳細を見る">
            ${getIconHtml(p, 36)}
            <div class="synergy-card-info">
              <div class="synergy-card-name">
                <strong>${escapeHtml(p.name)}</strong>
                <span style="font-size:12px; color:var(--text-sub); margin-left:3px;">★${p.rarity} ${p.weapon}</span>
              </div>
              <div class="synergy-badges-row">
                ${badgesHtml}
              </div>
            </div>
          </div>
          <div class="synergy-card-right">
            <button type="button" class="btn btn-xs ${inParty ? 'btn-remove' : 'btn-primary'}" onclick="quickToggleParty('${escapeHtml(p.id)}')">
              ${inParty ? '✓ 編成中' : '+ 編成'}
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  // --- 機能6: 審議プランナー（霊魂収入予測つき） ---
  var currentDelibTarget = 180;

  function renderDelibPlanner() {
    const bannerEl = document.getElementById("delibPlannerProgressBanner");
    const roadmapEl = document.getElementById("delibPlannerRoadmapList");
    const targetInput = document.getElementById("delibPlannerTargetInput");
    if (!bannerEl || !roadmapEl) return;

    const progressData = getStageProgressData();
    let stages = [];
    if (window.SCRE_GUIDES && Array.isArray(window.SCRE_GUIDES)) {
      const hellCat = window.SCRE_GUIDES.find(g => g.category === "地獄");
      if (hellCat && Array.isArray(hellCat.stages)) {
        stages = hellCat.stages;
      }
    }

    const totalStages = stages.length;
    let clearedCount = 0;
    const unclearedStages = [];

    stages.forEach(st => {
      const canonical = typeof canonicalStageTitle === "function" ? canonicalStageTitle(st.title) : st.title;
      const isCleared = !!(progressData[canonical] && progressData[canonical].cleared);
      if (isCleared) {
        clearedCount++;
      } else {
        unclearedStages.push(st);
      }
    });

    if (targetInput) targetInput.value = currentDelibTarget;
    const progressPct = totalStages > 0 ? ((clearedCount / totalStages) * 100).toFixed(1) : "0.0";

    const targetBtns = document.querySelectorAll(".delib-target-btn");
    targetBtns.forEach(btn => {
      const tVal = parseInt(btn.dataset.target, 10);
      if (tVal === currentDelibTarget) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    bannerEl.innerHTML = `
      <div>
        <div style="font-size:12px; opacity:0.85;">地獄ステージ進捗状況（全${totalStages}ステージ ｜ 個人目標: <strong style="color:#f1c40f;">${currentDelibTarget} 審議</strong>）</div>
        <div style="font-size:18px; font-weight:bold; margin-top:2px;">
          クリア済み: <span style="color:#f1c40f;">${clearedCount}</span> / <span>${totalStages}</span> ステージ
          <span style="font-size:12px; font-weight:normal; margin-left:8px; color:#e2e8f0;">（未クリア: <strong style="color:#e74c3c;">${totalStages - clearedCount}</strong>）</span>
        </div>
        <div style="font-size:12px; color:#cbd5e1; margin-top:3px;">※ 各ステージの審議達成数・攻略詳細は攻略タブのステージ詳細を参照してください。</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px; opacity:0.85;">目標審議数: <strong style="color:#f1c40f; font-size:14px;">${currentDelibTarget}</strong></div>
        <div style="font-size:12px; opacity:0.85; margin-top:2px;">ステージ達成率</div>
        <div style="font-size:20px; font-weight:bold; color:#68d391;">${progressPct}%</div>
      </div>
    `;

    if (unclearedStages.length === 0) {
      roadmapEl.innerHTML = `<div style="color:#e2e8f0; font-size:12px;">全地獄マップ（全${totalStages}ステージ）クリア達成済みです！</div>`;
    } else {
      roadmapEl.innerHTML = unclearedStages.slice(0, 5).map(st => `
        <div style="background:rgba(255,255,255,0.08); border-radius:4px; padding:6px 10px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:#fff; font-size:12px;">${escapeHtml(st.title)}</strong>
            <span style="font-size:12px; color:#cfd9df; margin-left:6px;">[${escapeHtml(st.subCategory || '地獄')}] 地形: ${escapeHtml(st.terrain || '地獄')}</span>
          </div>
          <div>
            <span class="badge" style="background:#d97706; color:#fff; font-size:12px; font-weight:bold;">未クリア 挑戦推奨</span>
          </div>
        </div>
      `).join("");
    }
  }

  function initDelibPlannerListeners() {
    const targetBtns = document.querySelectorAll(".delib-target-btn");
    const targetInput = document.getElementById("delibPlannerTargetInput");

    targetBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        targetBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentDelibTarget = parseInt(btn.dataset.target, 10) || 180;
        if (targetInput) targetInput.value = currentDelibTarget;
        renderDelibPlanner();
      });
    });

    if (targetInput) {
      targetInput.addEventListener("input", () => {
        const val = parseInt(targetInput.value, 10);
        if (!isNaN(val) && val >= 1) {
          currentDelibTarget = val;
          targetBtns.forEach(b => b.classList.remove("active"));
          renderDelibPlanner();
        }
      });
    }
  }

  // --- 機能7: フレーム精密DPS＋敵防御スライダー ---
  // (SCRE_WEAPON_FRAMES は上部で定義済み)

  var currentDetailDpsEnemyDef = 500;

  function computeFramePreciseDps(c, enemyDef) {
    const targetDef = (typeof enemyDef === "number" && !isNaN(enemyDef)) ? enemyDef : (currentDetailDpsEnemyDef || 500);
    const wf = SCRE_WEAPON_FRAMES[c.weapon] || { atk: 25, gap: 25, hits: 1, type: "physical", isEstimate: true };
    const isBuff = Boolean(wf.type === "buff");
    const baseAtk = parseStatNumber((c.statsDetail && c.statsDetail.giant5 && c.statsDetail.giant5.atk) || (c.stats && c.stats.giant5 && c.stats.giant5.atk) || (c.stats && c.stats.atk) || 1200);

    let selfAtkSpeed = 0;
    let selfGapShorten = 0;
    let selfAtkRatio = 0;
    let selfAtkFlat = 0;
    let selfDmgDealt = 0;
    let selfTargetMult = 1.0;
    let enemyDefDown = 0;

    const cEffects = getCastleCombinedEffects(c);

    cEffects.forEach(ef => {
      if (ef.stat === "atkSpeed") selfAtkSpeed = Math.max(selfAtkSpeed, ef.value);
      else if (ef.stat === "gapShorten") selfGapShorten = Math.max(selfGapShorten, ef.value);
      else if (ef.stat === "atkPercent") selfAtkRatio = Math.max(selfAtkRatio, ef.value);
      else if (ef.stat === "atkFlat") selfAtkFlat = Math.max(selfAtkFlat, ef.value);
      else if (ef.stat === "dmgDealt") selfDmgDealt = Math.max(selfDmgDealt, ef.value);
      else if (ef.stat === "dmgDealtTarget" && ef.value > 0) selfTargetMult *= (1 + ef.value / 100);
      else if (ef.stat === "enemyDefDown") enemyDefDown = Math.max(enemyDefDown, ef.value);
    });

    const effAtkFrames = Math.max(1, Math.round(wf.atk / (1 + selfAtkSpeed / 100)));
    const effGapFrames = Math.max(0, Math.round(wf.gap * (1 - selfGapShorten / 100)));
    const cycleFrames = effAtkFrames + effGapFrames;
    const attacksPerSec = cycleFrames > 0 ? (30 / cycleFrames) : 1;

    const isMagic = wf.type === "magic" || ["法術", "杖", "祓串", "鈴"].includes(c.weapon);
    const buffedAtk = Math.round(baseAtk * (1 + selfAtkRatio / 100) + selfAtkFlat);
    const effDef = isMagic ? 0 : Math.max(0, Math.round(targetDef * (1 - enemyDefDown / 100)));
    const rawHitDmg = Math.max(1, buffedAtk - effDef);
    const finalHitDmg = Math.round(rawHitDmg * (1 + selfDmgDealt / 100) * selfTargetMult);

    const baseHits = wf.hits || 1;
    const maxHits = wf.hitsMax || baseHits;
    const effDps = isBuff ? 0 : Math.round(finalHitDmg * baseHits * attacksPerSec);
    const maxEffDps = isBuff ? 0 : Math.round(finalHitDmg * maxHits * attacksPerSec);
    const ttk100k = isBuff ? "対象外 (∞)" : (effDps > 0 ? (100000 / effDps).toFixed(1) : "∞");

    return {
      isBuff,
      baseAtk,
      buffedAtk,
      enemyDef: targetDef,
      effDef,
      isMagic,
      finalHitDmg: isBuff ? 0 : finalHitDmg,
      hits: baseHits,
      hitsMax: maxHits,
      effDps,
      maxEffDps,
      baseAtkFrames: wf.atk,
      baseGapFrames: wf.gap,
      effAtkFrames,
      effGapFrames,
      cycleFrames,
      attacksPerSec,
      ttk100k,
      selfAtkSpeed,
      selfGapShorten,
      isEstimate: !!wf.isEstimate
    };
  }

  function renderDetailDpsPrecisionUI(c) {
    const metricsEl = document.getElementById("detailDpsPrecisionMetrics");
    const framesEl = document.getElementById("detailDpsFrameBreakdown");
    const sliderEl = document.getElementById("dpsEnemyDefSlider");
    const inputEl = document.getElementById("dpsEnemyDefInput");
    if (!metricsEl || !framesEl) return;

    if (sliderEl) sliderEl.value = currentDetailDpsEnemyDef;
    if (inputEl) inputEl.value = currentDetailDpsEnemyDef;

    const res = computeFramePreciseDps(c, currentDetailDpsEnemyDef);

    if (res.isBuff) {
      metricsEl.innerHTML = `
        <div class="dps-metric-card" style="grid-column: 1 / -1; text-align: center; padding: 12px; background: var(--nav-bg); border: 1px solid var(--border-color); border-radius: 6px;">
          <div style="font-size: 13px; font-weight: bold; color: var(--primary-color);">この武器種は攻撃しません（支援専用）</div>
          <div style="font-size: 12px; color: var(--text-sub); margin-top: 4px;">攻撃ステータス（基礎: ${res.baseAtk.toLocaleString()} / 自己バフ後: ${res.buffedAtk.toLocaleString()}）は範囲内味方へのバフ量や回復量の基礎値として機能します。</div>
          <div style="font-size: 12px; color: var(--text-sub); margin-top: 4px;">単発ダメージ: なし ｜ 実効DPS: なし ｜ 10万HP撃破時間 (想定TTK): <strong>対象外 (∞)</strong></div>
        </div>
      `;

      framesEl.innerHTML = `
        <div><strong>フレーム詳細 (30fps換算・支援行動):</strong> 攻撃動作 ${res.baseAtkFrames}f ➔ <strong style="color:#1b4965;">${res.effAtkFrames}f</strong> ${res.selfAtkSpeed ? `(+約${res.selfAtkSpeed}%速度)` : ''} / 隙 ${res.baseGapFrames}f ➔ <strong style="color:#1b4965;">${res.effGapFrames}f</strong> ${res.selfGapShorten ? `(-約${res.selfGapShorten}%隙)` : ''} / 支援周期計 <strong style="color:#2c3e50;">${res.cycleFrames}f</strong> (${res.attacksPerSec.toFixed(2)}回/秒)${res.isEstimate ? ' <span class="badge" style="background:#fff3cd; color:#856404; font-size:12px; margin-left:6px;">⚠️ フレーム値は推定値</span>' : ''}</div>
      `;
    } else {
      metricsEl.innerHTML = `
        <div class="dps-metric-card">
          <span class="dps-metric-label">単発ダメージ</span>
          <span class="dps-metric-val">${res.finalHitDmg.toLocaleString()}${res.hits > 1 ? ` × ${res.hits}連撃` : ''}${res.hitsMax > res.hits ? ` (スキル最大: ${res.hitsMax}連撃)` : ''}</span>
          <span style="font-size:12px; color:#888;">${res.isMagic ? '防御無視(術)' : `実効防御 ${res.effDef}`}</span>
        </div>
        <div class="dps-metric-card">
          <span class="dps-metric-label">実効DPS</span>
          <span class="dps-metric-val" style="color:#d35400;">${res.effDps.toLocaleString()} /秒${res.hitsMax > res.hits ? ` (最大: ${res.maxEffDps.toLocaleString()}/秒)` : ''}</span>
          <span style="font-size:12px; color:#888;">${res.attacksPerSec.toFixed(2)} 攻撃/秒</span>
        </div>
        <div class="dps-metric-card">
          <span class="dps-metric-label">10万HP撃破時間</span>
          <span class="dps-metric-val" style="color:#27ae60;">${res.ttk100k} 秒</span>
          <span style="font-size:12px; color:#888;">標準ボス想定TTK</span>
        </div>
      `;

      framesEl.innerHTML = `
        <div><strong>フレーム詳細 (30fps換算):</strong> 攻撃 ${res.baseAtkFrames}f ➔ <strong style="color:#1b4965;">${res.effAtkFrames}f</strong> ${res.selfAtkSpeed ? `(+約${res.selfAtkSpeed}%速度)` : ''} / 隙 ${res.baseGapFrames}f ➔ <strong style="color:#1b4965;">${res.effGapFrames}f</strong> ${res.selfGapShorten ? `(-約${res.selfGapShorten}%隙)` : ''} / 周期計 <strong style="color:#2c3e50;">${res.cycleFrames}f</strong> (${res.attacksPerSec.toFixed(2)}回/秒)${res.isEstimate ? ' <span class="badge" style="background:#fff3cd; color:#856404; font-size:12px; margin-left:6px;">⚠️ フレーム値は推定値</span>' : ''}</div>
      `;
    }
  }

  function initDetailDpsListeners() {
    const slider = document.getElementById("dpsEnemyDefSlider");
    const input = document.getElementById("dpsEnemyDefInput");
    const presetBtns = document.querySelectorAll(".dps-def-preset-btn");

    const update = (val) => {
      currentDetailDpsEnemyDef = Math.max(0, val);
      if (slider) slider.value = currentDetailDpsEnemyDef;
      if (input) input.value = currentDetailDpsEnemyDef;
      presetBtns.forEach(b => {
        if (parseInt(b.dataset.def, 10) === currentDetailDpsEnemyDef) b.classList.add("active");
        else b.classList.remove("active");
      });
      if (activeDetailCastleId) {
        const c = getCastleById(activeDetailCastleId);
        if (c) renderDetailDpsPrecisionUI(c);
      }
    };

    if (slider) slider.addEventListener("input", () => update(parseInt(slider.value, 10) || 0));
    if (input) input.addEventListener("input", () => update(parseInt(input.value, 10) || 0));
    presetBtns.forEach(b => b.addEventListener("click", () => update(parseInt(b.dataset.def, 10) || 0)));
  }


  // =========================================================================
  // 第36弾: 射撃訓練場（ダメージバフ検証レンジ）
  // =========================================================================

  var firingRangeState = {
    isRunning: false,
    speed: 1.0,
    elapsedTime: 0,
    totalDamage: 0,
    targetDef: 500,
    targetHp: 200000,
    isInfiniteHp: false,
    targetRed: 0,
    targetCount: 1,
    durationLimit: 0,
    dummyName: "標準的な兜",
    disabledBuffs: new Set(),
    castleSlots: [],
    timelinePoints: [],
    projectiles: [],
    damagePopups: [],
    lastTimestamp: 0,
    animFrameId: null
  };

  const FIRING_PRESETS = [
    { id: "custom", name: "カスタム設定", def: 500, hp: 200000, isInfinite: false, red: 0 },
    { id: "def0", name: "藁人形 (防御 0 / HP 無限)", def: 0, hp: 0, isInfinite: true, red: 0 },
    { id: "def500", name: "標準的な兜 (防御 500 / HP 20万)", def: 500, hp: 200000, isInfinite: false, red: 0 },
    { id: "def1500", name: "重装兜 (防御 1,500 / HP 50万)", def: 1500, hp: 500000, isInfinite: false, red: 0 },
    { id: "def3000", name: "超高防御ゴーレム (防御 3,000 / HP 100万)", def: 3000, hp: 1000000, isInfinite: false, red: 0 }
  ];

  // --- Prompt 41: 巨大化段階別ステータス (0:未巨大化, 5:最大, 1〜4:線形補間推定値) ---
  // 出典・仕様注記: data.js には base (未巨大化) と giant5 (最大) のみ存在。
  // 中間段階 (1〜4) はゲーム実測値が存在しないため、base から giant5 への線形補間 (step / 5) による推定値（UIに「推定値」明記）。
  function getCastleBaseStatsForGiant(castle, giantStep = 5) {
    if (!castle || !castle.stats) {
      return { atk: 100, def: 100, hp: 1000, range: 100, isIntermediate: false, giantStep: 5 };
    }
    const base = castle.stats.base || { atk: 100, def: 100, hp: 1000, range: 100 };
    const g5 = castle.stats.giant5 || { atk: 100, def: 100, hp: 1000, range: 100 };
    const step = (typeof giantStep === "number" && giantStep >= 0 && giantStep <= 5) ? giantStep : 5;

    if (step === 0) {
      return { atk: base.atk, def: base.def, hp: base.hp, range: base.range, isIntermediate: false, giantStep: 0 };
    }
    if (step === 5) {
      return { atk: g5.atk, def: g5.def, hp: g5.hp, range: g5.range, isIntermediate: false, giantStep: 5 };
    }
    const ratio = step / 5;
    return {
      atk: Math.round(base.atk + (g5.atk - base.atk) * ratio),
      def: Math.round(base.def + (g5.def - base.def) * ratio),
      hp: Math.round(base.hp + (g5.hp - base.hp) * ratio),
      range: Math.round(base.range + (g5.range - base.range) * ratio),
      isIntermediate: true,
      giantStep: step
    };
  }
  window.getCastleBaseStatsForGiant = getCastleBaseStatsForGiant;

  // --- Prompt 41 & 42: 計略ダメージ機械パース (即時直接ダメージ計略) ---
  // 「攻撃の○倍のダメージを与える」等の直接ダメージ計略（実測76体）を機械パース
  // バフ持続型（X秒間...）やトークン（伏兵）は対象外とし null を返却
  function parseCastleDamageStrategy(strategy) {
    if (!strategy || !strategy.text || !strategy.cooldown) return null;
    const text = strategy.text;
    if (/^[0-9]+秒間/.test(text.trim())) return null; // 持続バフ型は常時反映のまま対象外
    if (text.includes("伏兵") || text.includes("トークン")) return null; // 伏兵計略は対象外

    // 1. 連撃判定:
    //  - 攻撃のX倍のダメージをY回
    //  - 攻撃のX倍の術ダメをY回 (月の都)
    //  - 攻撃のX倍のY連続攻撃 (［絢爛］ダノター城)
    let mHit = text.match(/攻撃の([0-9]+(?:\.[0-9]+)?)倍の\s*(?:術|火属性|水属性|風属性|雷属性)?(?:ダメージ|ダメ)を([0-9]+)回/);
    if (!mHit) {
      mHit = text.match(/攻撃の([0-9]+(?:\.[0-9]+)?)倍の\s*([0-9]+)連続\s*攻撃/);
    }

    // 2. 特殊パターン1: 攻撃のX倍 飛行にはY倍のダメージ (ストラホフ修道院)
    const mFly = text.match(/攻撃の([0-9]+(?:\.[0-9]+)?)倍\s*飛行には([0-9]+(?:\.[0-9]+)?)倍の\s*ダメージ/);

    // 3. 特殊パターン2: 標的に攻撃のX倍 その周囲にY倍のダメージ (［夏］七飯台場)
    const mSplash = text.match(/(?:標的に)?攻撃の([0-9]+(?:\.[0-9]+)?)倍\s*その周囲に([0-9]+(?:\.[0-9]+)?)倍の\s*ダメージ/);

    // 4. 単発/通常判定: 攻撃のX倍の[属性/防御無視]*ダメージ or 攻撃のX倍ダメージ (［ハロウィン］ブラン城)
    const mSingle = text.match(/攻撃の([0-9]+(?:\.[0-9]+)?)倍(?:の)?\s*(?:術|火属性|水属性|風属性|雷属性|防御無視)?\s*ダメージ/);

    // 5. 「攻撃の」省略パターン: 範囲内の敵にX倍のダメージ (［バレンタイン］岩櫃城, ［ハロウィン］ペレシュ城)
    const mOmitAtk = text.match(/(?:範囲内の敵に|敵に)\s*([0-9]+(?:\.[0-9]+)?)倍の\s*ダメージ/);

    if (!mHit && !mFly && !mSplash && !mSingle && !mOmitAtk) return null;

    let mult = 1;
    let hits = 1;
    let splashMult = null;

    if (mHit) {
      mult = parseFloat(mHit[1]);
      hits = parseInt(mHit[2], 10);
    } else if (mFly) {
      mult = parseFloat(mFly[1]);
      hits = 1;
    } else if (mSplash) {
      mult = parseFloat(mSplash[1]);
      splashMult = parseFloat(mSplash[2]);
      hits = 1;
    } else if (mSingle) {
      mult = parseFloat(mSingle[1]);
      hits = 1;
    } else if (mOmitAtk) {
      mult = parseFloat(mOmitAtk[1]);
      hits = 1;
    }

    if (hits === 1) {
      const mFollowUpHit = text.match(/([0-9]+)連続\s*攻撃/);
      if (mFollowUpHit) {
        hits = parseInt(mFollowUpHit[1], 10);
      }
    }

    const isAoe = /範囲内の敵|標的とその周囲|その周囲に|射程内全敵|画面上の全ての敵|全ての敵|横方向の敵/.test(text);
    const isDefIgnore = /防御(?:力)?を?無視|防御(?:力)?を?0として計算|防御減算な/.test(text);
    // ゲーム内仕様: 「術ダメージ」「術ダメ」と明記されたもののみ術攻撃（防御無視）扱い
    const isMagic = /術ダメージ|術ダメ/.test(text);

    return {
      name: strategy.name || "",
      text: text,
      cooldown: strategy.cooldown,
      cost: strategy.cost || 0,
      mult: mult,
      hits: hits,
      splashMult: splashMult,
      isAoe: isAoe,
      isDefIgnore: isDefIgnore,
      isMagic: isMagic
    };
  }
  window.parseCastleDamageStrategy = parseCastleDamageStrategy;

  // --- Prompt 41 & 42: 射撃訓練場 D&D / タップ編成 操作 ---
  let firingSelectedPaletteCastle = null;

  function movePartySlot(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx < 0 || fromIdx >= 8 || toIdx < 0 || toIdx >= 8) return;
    if (!party[fromIdx]) return;
    pushUndoSnapshot();

    while (party.length <= Math.max(fromIdx, toIdx)) {
      party.push(null);
    }

    const moved = party[fromIdx];
    const target = party[toIdx] || null;

    if (target) {
      // スロット同士の入れ替え
      party[fromIdx] = target;
      party[toIdx] = moved;
    } else {
      // 空き枠への移動: 指定枠に配置し、元の枠を空にする
      party[toIdx] = moved;
      party[fromIdx] = null;
    }

    while (party.length > 0 && party[party.length - 1] === null) {
      party.pop();
    }

    saveParty();
    renderDashboard();
    renderFiringRangeTab();
  }

  function removePartySlot(idx) {
    if (idx < 0 || idx >= 8) return;
    pushUndoSnapshot();
    if (party[idx]) {
      party[idx] = null;
    }
    while (party.length > 0 && party[party.length - 1] === null) {
      party.pop();
    }
    saveParty();
    renderDashboard();
    renderFiringRangeTab();
  }

  function setPartySlot(castle, targetIdx) {
    if (!castle || targetIdx < 0 || targetIdx >= 8) return;
    pushUndoSnapshot();
    while (party.length <= targetIdx) {
      party.push(null);
    }
    // 同一城娘が他スロットにある場合はそこを空にする
    for (let j = 0; j < party.length; j++) {
      if (party[j] && party[j].id === castle.id && j !== targetIdx) {
        party[j] = null;
      }
    }
    party[targetIdx] = {
      id: castle.id,
      strategyOn: true,
      specialOn: !!castle.special,
      giantStep: 5
    };
    while (party.length > 0 && party[party.length - 1] === null) {
      party.pop();
    }
    saveParty();
    renderDashboard();
    renderFiringRangeTab();
  }
  window.movePartySlot = movePartySlot;
  window.setPartySlot = setPartySlot;
  window.removePartySlot = removePartySlot;

  function updateTapNotice() {
    const notice = document.getElementById("firingTapSelectNotice");
    if (!notice) return;
    if (firingSelectedPaletteCastle) {
      notice.style.display = "block";
      notice.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>🎯 選択中: <strong>「${escapeHtml(firingSelectedPaletteCastle.name)}」</strong>（★${firingSelectedPaletteCastle.rarity} ${escapeHtml(firingSelectedPaletteCastle.weapon)}）―― 配置先スロット枠 (1〜8) をタップしてください。</span>
          <button type="button" class="btn btn-xs" id="btnCancelTapSelect" style="font-size:12px;">キャンセル</button>
        </div>
      `;
      const cancelBtn = document.getElementById("btnCancelTapSelect");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          firingSelectedPaletteCastle = null;
          updateTapNotice();
          renderFiringPaletteTray();
        });
      }
    } else {
      notice.style.display = "none";
    }
  }

  function renderFiringPartyDock() {
    const container = document.getElementById("firingPartySlotsGrid");
    if (!container) return;
    container.innerHTML = "";

    for (let i = 0; i < 8; i++) {
      const slot = party[i];
      const castle = slot ? getCastleById(slot.id) : null;
      const slotEl = document.createElement("div");
      slotEl.className = "firing-slot-card" + (castle ? " filled" : " empty");
      slotEl.dataset.slotIdx = String(i);

      if (castle) {
        const gStep = (slot && typeof slot.giantStep === "number") ? slot.giantStep : 5;
        slotEl.draggable = true;
        slotEl.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:12px; font-weight:bold; color:var(--text-sub);">枠 ${i + 1}</span>
            <button type="button" class="btn btn-xs firing-slot-remove-btn" data-slot-idx="${i}" title="部隊から外す" style="padding:0 5px; line-height:16px;">&times;</button>
          </div>
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
            ${getIconHtml(castle, 32)}
            <div style="overflow:hidden; flex:1;">
              <div style="font-size:12px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(castle.name)}">${escapeHtml(castle.name)}</div>
              <div style="font-size:12px; color:var(--text-sub);">★${castle.rarity} [${escapeHtml(castle.weapon)}]</div>
            </div>
          </div>
          <div style="margin-top:4px;">
            <label style="font-size:12px; color:var(--text-sub); display:block; margin-bottom:2px;">巨大化段階:</label>
            <select class="firing-giant-select form-control" data-slot-idx="${i}" style="width:100%; font-size:12px; padding:2px 4px; border:1px solid var(--border-color); border-radius:3px; background:var(--card-bg); color:var(--text-main);">
              <option value="0" ${gStep === 0 ? "selected" : ""}>未巨大化 (base)</option>
              <option value="1" ${gStep === 1 ? "selected" : ""}>1段階 (推定値)</option>
              <option value="2" ${gStep === 2 ? "selected" : ""}>2段階 (推定値)</option>
              <option value="3" ${gStep === 3 ? "selected" : ""}>3段階 (推定値)</option>
              <option value="4" ${gStep === 4 ? "selected" : ""}>4段階 (推定値)</option>
              <option value="5" ${gStep === 5 ? "selected" : ""}>最大 (giant5)</option>
            </select>
          </div>
        `;

        slotEl.addEventListener("dragstart", (e) => {
          slotEl.classList.add("dragging");
          e.dataTransfer.setData("text/plain", JSON.stringify({ type: "move-slot", fromIdx: i, castleId: castle.id }));
          const trash = document.getElementById("firingSlotTrashDropZone");
          if (trash) trash.style.display = "block";
        });

        slotEl.addEventListener("dragend", () => {
          slotEl.classList.remove("dragging");
          const trash = document.getElementById("firingSlotTrashDropZone");
          if (trash) trash.style.display = "none";
          document.querySelectorAll(".firing-slot-card").forEach(el => el.classList.remove("drag-over"));
        });
      } else {
        slotEl.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:12px; font-weight:bold; color:var(--text-sub);">枠 ${i + 1}</span>
          </div>
          <div style="text-align:center; padding:18px 4px; color:var(--text-sub);">
            <div style="font-size:18px; margin-bottom:2px;">＋</div>
            <div style="font-size:12px;">空き枠</div>
            <div style="font-size:12px; color:#a0aec0; margin-top:2px;">(D&Dまたはタップ)</div>
          </div>
        `;
      }

      slotEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        slotEl.classList.add("drag-over");
      });
      slotEl.addEventListener("dragleave", () => {
        slotEl.classList.remove("drag-over");
      });
      slotEl.addEventListener("drop", (e) => {
        e.preventDefault();
        slotEl.classList.remove("drag-over");
        const rawData = e.dataTransfer.getData("text/plain");
        if (!rawData) return;
        try {
          const payload = JSON.parse(rawData);
          if (payload.type === "new-castle") {
            const c = getCastleById(payload.castleId);
            if (c) setPartySlot(c, i);
          } else if (payload.type === "move-slot") {
            movePartySlot(payload.fromIdx, i);
          }
        } catch (err) {
          console.warn("Drop parse error:", err);
        }
      });

      slotEl.addEventListener("click", (e) => {
        if (e.target.closest(".firing-slot-remove-btn")) {
          removePartySlot(i);
          return;
        }
        if (e.target.closest(".firing-giant-select")) {
          return;
        }
        if (firingSelectedPaletteCastle) {
          const c = firingSelectedPaletteCastle;
          firingSelectedPaletteCastle = null;
          updateTapNotice();
          setPartySlot(c, i);
          return;
        }
        if (!party[i]) {
          openCastleSelector(i);
        }
      });

      container.appendChild(slotEl);
    }

    container.querySelectorAll(".firing-giant-select").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.slotIdx, 10);
        const val = parseInt(e.target.value, 10);
        if (party[idx]) {
          party[idx].giantStep = val;
          saveParty();
          renderFiringRangeTab();
        }
      });
    });
  }

  function renderFiringPaletteTray() {
    const tray = document.getElementById("firingPickerChipsTray");
    if (!tray) return;

    const searchInput = document.getElementById("firingPickerSearchInput");
    const weaponFilter = document.getElementById("firingPickerWeaponFilter");
    const rarityFilter = document.getElementById("firingPickerRarityFilter");
    const countBadge = document.getElementById("firingPickerCountBadge");

    const q = (searchInput?.value || "").trim().toLowerCase();
    const w = weaponFilter?.value || "";
    const r = rarityFilter?.value || "";

    const filtered = window.SCRE_DATA.filter(c => {
      if (q && !matchCastleNameOrRuby(c, q)) return false;
      if (w && c.weapon !== w) return false;
      if (r && String(c.rarity) !== r) return false;
      return true;
    });

    if (countBadge) {
      countBadge.textContent = `${filtered.length.toLocaleString()} 件`;
    }

    const displayCastles = filtered.slice(0, 80);
    tray.innerHTML = displayCastles.map(c => {
      const isSelected = firingSelectedPaletteCastle && firingSelectedPaletteCastle.id === c.id;
      return `
        <div class="firing-palette-chip ${isSelected ? 'selected' : ''}" draggable="true" data-castle-id="${escapeHtml(c.id)}" style="display:inline-flex; align-items:center; gap:4px; padding:3px 6px; border:1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}; border-radius:4px; background:${isSelected ? '#ebf8ff' : 'var(--card-bg)'}; cursor:grab; font-size:12px; user-select:none;">
          ${getIconHtml(c, 22)}
          <span style="font-weight:bold; font-size:12px;">${escapeHtml(c.name)}</span>
          <span style="font-size:12px; color:var(--text-sub);">★${c.rarity} ${escapeHtml(c.weapon)}</span>
        </div>
      `;
    }).join("");

    tray.querySelectorAll(".firing-palette-chip").forEach(chip => {
      const cId = chip.dataset.castleId;
      const c = getCastleById(cId);
      if (!c) return;

      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ type: "new-castle", castleId: c.id }));
      });

      chip.addEventListener("click", () => {
        if (firingSelectedPaletteCastle && firingSelectedPaletteCastle.id === c.id) {
          firingSelectedPaletteCastle = null;
        } else {
          firingSelectedPaletteCastle = c;
        }
        updateTapNotice();
        renderFiringPaletteTray();
      });
    });
  }

  function calculateFiringCastleStats(c, slot, targetDef, targetRed, targetCount, disabledBuffs, immuneDefIgnore, customCalcResult) {
    if (!c) return null;
    const calcResult = customCalcResult || calculateBuffs();
    const calcData = calcResult.perCastle[c.id];
    const b = calcData?.buffs || {};

    const giantStep = (slot && typeof slot.giantStep === "number") ? slot.giantStep : 5;
    const baseStats = getCastleBaseStatsForGiant(c, giantStep);
    const baseAtk = baseStats.atk;
    const isIntermediateGiant = baseStats.isIntermediate;

    const isTerrainMatch = calcData?.calculatedStats?.isTerrainMatch || false;
    const terrain = calcResult?.currentTerrain || (typeof currentTerrain !== "undefined" ? currentTerrain : "");
    const terrainMult = isTerrainMatch ? (terrain === "地獄" ? 1.3 : 1.25) : 1.0;

    const atkPerc = (disabledBuffs && disabledBuffs.has("atk_percent")) ? 0 : (((b.atkPercent?.max || 0) + (b.atkPercent?.stackSum || 0)) / 100);
    const atkFlat = (disabledBuffs && disabledBuffs.has("atk_flat")) ? 0 : (b.atkFlat?.sum || 0);
    let shareAtk = 0;
    if (!(disabledBuffs && disabledBuffs.has("share_atk")) && b.shares) {
      b.shares.forEach(sh => {
        if (sh.stat === "shareAtk") {
          const prov = getCastleById(sh.shareSource);
          if (prov && prov.stats && prov.stats.giant5) {
            shareAtk += Math.floor(prov.stats.giant5.atk * (sh.value / 100));
          }
        }
      });
    }

    const finalAtk = Math.floor((baseAtk * terrainMult) * (1 + atkPerc) + atkFlat + shareAtk);

    const wf = SCRE_WEAPON_FRAMES[c.weapon] || { atk: 25, gap: 25, hits: 1, type: "physical", isEstimate: true };
    const isBuffWeapon = Boolean(wf.type === "buff");
    const defIgnoreInfo = checkDefenseIgnore(c, b, {
      immuneDefIgnore: Boolean(immuneDefIgnore),
      disabledDefIgnore: Boolean(disabledBuffs && disabledBuffs.has("def_ignore"))
    });
    const effectiveIgnore = defIgnoreInfo.effectiveIgnore;

    const defDownPerc = (disabledBuffs && disabledBuffs.has("enemy_def_down")) ? 0 : (calcResult.enemyDebuffs?.enemyDefDown?.max || 0);
    const effDef = effectiveIgnore ? 0 : Math.max(0, Math.floor(targetDef * (1.0 - defDownPerc / 100)));

    let dmgTargetMult = 1.0;
    if (!(disabledBuffs && disabledBuffs.has("dmg_dealt_target")) && b.dmgDealtTarget) {
      const activeSources = b.dmgDealtTarget.sources ? b.dmgDealtTarget.sources.filter(s => s.applied !== false) : [];
      dmgTargetMult = activeSources.reduce((acc, s) => acc * (1 + s.val / 100), 1.0);
    }
    const atkWithTarget = Math.floor(finalAtk * dmgTargetMult);
    const baseDamage = Math.max(Math.floor(atkWithTarget * 0.1), atkWithTarget - effDef);

    let dmgDealtPerc = 0;
    if (!(disabledBuffs && disabledBuffs.has("dmg_dealt")) && b.dmgDealt) {
      dmgDealtPerc = ((b.dmgDealt.max || 0) + (b.dmgDealt.stackSum || 0)) / 100;
    }
    let enemyDmgTakenPerc = 0;
    if (!(disabledBuffs && disabledBuffs.has("enemy_dmg_taken"))) {
      enemyDmgTakenPerc = (calcResult.enemyDebuffs?.enemyDmgTakenUp?.max || 0) / 100;
    }
    const postDmgMult = (1 + dmgDealtPerc) * (1 + enemyDmgTakenPerc);

    const finalHitDamage = isBuffWeapon ? 0 : Math.max(1, Math.floor(baseDamage * postDmgMult * (1.0 - (targetRed / 100))));

    let atkSpeed = 0;
    if (!(disabledBuffs && disabledBuffs.has("atk_speed")) && b.atkSpeed) {
      atkSpeed = (b.atkSpeed.max || 0) + (b.atkSpeed.stackSum || 0);
    }
    let gapShorten = 0;
    if (!(disabledBuffs && disabledBuffs.has("gap_shorten")) && b.gapShorten) {
      gapShorten = (b.gapShorten.max || 0) + (b.gapShorten.stackSum || 0);
    }

    const effAtkFrames = Math.max(1, Math.round(wf.atk / (1 + atkSpeed / 100)));
    const effGapFrames = Math.max(0, Math.round(wf.gap * (1 - gapShorten / 100)));
    const cycleFrames = effAtkFrames + effGapFrames;
    const cycleTime = cycleFrames > 0 ? (cycleFrames / 30) : 1;
    const attacksPerSec = cycleFrames > 0 ? (30 / cycleFrames) : 1;

    const hits = wf.hits || 1;
    let effectiveTargets = 1;
    if (targetCount > 1) {
      if (wf.aoe === true) {
        effectiveTargets = targetCount;
      } else if (["投剣", "祓串"].includes(c.weapon)) {
        effectiveTargets = Math.min(targetCount, 2);
      }
    }

    const cycleDamage = isBuffWeapon ? 0 : (finalHitDamage * hits * effectiveTargets);
    const normalDps = isBuffWeapon ? 0 : Math.round(cycleDamage * attacksPerSec);

    // --- Prompt 41: 計略ダメージ計算 ---
    let strategyDamage = null;
    const stratParsed = (c.strategy && slot?.strategyOn !== false) ? parseCastleDamageStrategy(c.strategy) : null;
    if (stratParsed) {
      const stratBaseAtk = Math.floor(finalAtk * stratParsed.mult);
      const stratAtkWithTarget = Math.floor(stratBaseAtk * dmgTargetMult);

      const stratDefIgnore = Boolean(effectiveIgnore || stratParsed.isDefIgnore || stratParsed.isMagic || defIgnoreInfo.isMagic);
      const stratEffDef = stratDefIgnore ? 0 : effDef;
      const stratBaseDmg = Math.max(Math.floor(stratAtkWithTarget * 0.1), stratAtkWithTarget - stratEffDef);

      const stratHitDamage = Math.max(1, Math.floor(stratBaseDmg * postDmgMult * (1.0 - (targetRed / 100))));
      const stratTargets = stratParsed.isAoe ? targetCount : 1;
      let stratTotalDamagePerCast = 0;
      if (stratParsed.splashMult && targetCount > 1) {
        const splashBaseAtk = Math.floor(finalAtk * stratParsed.splashMult);
        const splashAtkWithTarget = Math.floor(splashBaseAtk * dmgTargetMult);
        const splashBaseDmg = Math.max(Math.floor(splashAtkWithTarget * 0.1), splashAtkWithTarget - stratEffDef);
        const splashHitDmg = Math.max(1, Math.floor(splashBaseDmg * postDmgMult * (1.0 - (targetRed / 100))));
        stratTotalDamagePerCast = (stratHitDamage * stratParsed.hits * 1) + (splashHitDmg * stratParsed.hits * (targetCount - 1));
      } else {
        stratTotalDamagePerCast = stratHitDamage * stratParsed.hits * stratTargets;
      }

      const stratCooldown = Math.max(1, stratParsed.cooldown);
      const stratDps = Math.round(stratTotalDamagePerCast / stratCooldown);

      strategyDamage = {
        parsed: stratParsed,
        baseAtk: stratBaseAtk,
        effDef: stratEffDef,
        isDefIgnore: stratDefIgnore,
        hitDamage: stratHitDamage,
        hits: stratParsed.hits,
        targets: stratTargets,
        totalDamagePerCast: stratTotalDamagePerCast,
        cooldown: stratCooldown,
        dps: stratDps
      };
    }

    const stratDps = strategyDamage ? strategyDamage.dps : 0;
    const theoreticalDps = normalDps + stratDps;

    const rangePerc = ((b.rangePercent?.max || 0) + (b.rangePercent?.stackSum || 0)) / 100;
    const rangeFlat = (b.rangeFlat?.sum || 0);
    const effectiveRange = Math.floor(baseStats.range * (1 + rangePerc) + rangeFlat);

    let breakdownText = "";
    if (isBuffWeapon) {
      breakdownText = `[通常] 攻撃なし（支援専用：攻撃値${finalAtk}はバフ・回復の基礎値で敵ダメージではありません）`;
      if (strategyDamage) {
        breakdownText += ` ｜ [計略] 攻${finalAtk}×${strategyDamage.parsed.mult}倍 → 1撃${strategyDamage.totalDamagePerCast.toLocaleString()} (CT${strategyDamage.cooldown}s, ${strategyDamage.dps.toLocaleString()}/s)`;
      }
    } else {
      breakdownText = `[通常] 攻${finalAtk} → 引後${baseDamage} → 1撃${finalHitDamage} (${normalDps.toLocaleString()}/s)`;
      if (strategyDamage) {
        breakdownText += ` ｜ [計略] 攻${finalAtk}×${strategyDamage.parsed.mult}倍 → 1撃${strategyDamage.totalDamagePerCast.toLocaleString()} (CT${strategyDamage.cooldown}s, ${strategyDamage.dps.toLocaleString()}/s)`;
      }
    }

    return {
      castle: c,
      slot: slot,
      giantStep: giantStep,
      isIntermediateGiant: isIntermediateGiant,
      finalAtk: finalAtk,
      effDef: effDef,
      effectiveIgnore: effectiveIgnore,
      isMagic: defIgnoreInfo.isMagic,
      hasDefIgnoreSkill: defIgnoreInfo.hasDefIgnoreSkill,
      dmgTargetMult: dmgTargetMult,
      baseDamage: baseDamage,
      dmgDealtPerc: dmgDealtPerc,
      enemyDmgTakenPerc: enemyDmgTakenPerc,
      finalHitDamage: finalHitDamage,
      hits: hits,
      effectiveTargets: effectiveTargets,
      effectiveRange: effectiveRange,
      baseAtkFrames: wf.atk,
      baseGapFrames: wf.gap,
      effAtkFrames: effAtkFrames,
      effGapFrames: effGapFrames,
      cycleFrames: cycleFrames,
      cycleTime: cycleTime,
      attacksPerSec: attacksPerSec,
      normalDps: normalDps,
      strategyDamage: strategyDamage,
      stratDps: stratDps,
      theoreticalDps: theoreticalDps,
      isBuffWeapon: isBuffWeapon,
      weaponType: wf.type,
      isEstimateFrame: !!wf.isEstimate,
      breakdownText: breakdownText
    };
  }

  function renderFiringRangeTab() {
    renderFiringPartyDock();

    const partyCastles = party.map((slot, idx) => ({
      slot,
      castle: slot ? getCastleById(slot.id) : null,
      idx
    })).filter(item => item.castle);

    const statusBadge = document.getElementById("firingRangePartyStatus");
    if (statusBadge) {
      statusBadge.textContent = `部隊: ${partyCastles.length}/8 体`;
    }

    const tbody = document.getElementById("firingCastleResultsTbody");
    if (!tbody) return;

    if (partyCastles.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:16px; color:var(--text-sub);">部隊に城娘が編成されていません。上部の部隊編成スロットから城娘を編成してください。</td></tr>`;
      const dpsHeadline = document.getElementById("firingRangeDpsHeadline");
      if (dpsHeadline) dpsHeadline.textContent = "部隊総DPS: 0 /秒";
      drawFiringStageCanvas();
      renderFiringBuffContributions();
      renderFiringSnapshotList();
      return;
    }

    const currentIds = partyCastles.map(p => `${p.castle.id}_${p.slot.giantStep ?? 5}_${p.slot.strategyOn !== false}`).join(",");
    const stateIds = firingRangeState.castleSlots.map(s => `${s.castle ? s.castle.id : ''}_${s.slot?.giantStep ?? 5}_${s.slot?.strategyOn !== false}`).join(",");
    if (currentIds !== stateIds || firingRangeState.castleSlots.length !== partyCastles.length) {
      firingRangeState.castleSlots = partyCastles.map(({ slot, castle, idx }) => {
        const stat = calculateFiringCastleStats(castle, slot, firingRangeState.targetDef, firingRangeState.targetRed, firingRangeState.targetCount, firingRangeState.disabledBuffs);
        return {
          castle,
          slot,
          idx,
          timer: 0,
          hits: 0,
          totalDmg: 0,
          normalDmg: 0,
          stratDmg: 0,
          stratCount: 0,
          stratTimer: 0,
          stat
        };
      });
    } else {
      firingRangeState.castleSlots.forEach((s, i) => {
        s.slot = partyCastles[i].slot;
        s.stat = calculateFiringCastleStats(s.castle, s.slot, firingRangeState.targetDef, firingRangeState.targetRed, firingRangeState.targetCount, firingRangeState.disabledBuffs);
      });
    }

    let totalNormalDps = 0;
    let totalStratDps = 0;
    let totalPartyDps = 0;
    firingRangeState.castleSlots.forEach(s => {
      totalNormalDps += (s.stat.normalDps || 0);
      totalStratDps += (s.stat.stratDps || 0);
      totalPartyDps += s.stat.theoreticalDps;
    });

    const dpsHeadline = document.getElementById("firingRangeDpsHeadline");
    if (dpsHeadline) {
      dpsHeadline.textContent = `部隊総DPS: ${totalPartyDps.toLocaleString()} /秒 (通常: ${totalNormalDps.toLocaleString()} + 計略: ${totalStratDps.toLocaleString()})`;
    }

    tbody.innerHTML = firingRangeState.castleSlots.map((s, i) => {
      const c = s.castle;
      const stat = s.stat;
      const sharePerc = totalPartyDps > 0 ? (stat.theoreticalDps / totalPartyDps * 100).toFixed(1) : "0.0";
      const estimateBadge = stat.isEstimateFrame ? `<span class="badge" style="background:#fff3cd; color:#856404; font-size:12px; margin-left:4px;" title="実測値未検証のため標準デフォルト値を適用中">推定値</span>` : "";
      const gStep = (stat.giantStep !== undefined) ? stat.giantStep : 5;

      return `
        <tr style="border-bottom:1px solid var(--border-color);">
          <td style="text-align:center; font-weight:bold; color:var(--text-sub);">${i + 1}</td>
          <td>
            <div style="display:flex; align-items:center; gap:6px;">
              ${getIconHtml(c, 28)}
              <div>
                <strong style="cursor:pointer;" onclick="openCastleDetail('${escapeHtml(c.id)}')">${escapeHtml(c.name)}</strong>
                <div style="color:var(--text-sub); font-size:12px;">★${c.rarity} [${escapeHtml(c.weapon)}]${estimateBadge}</div>
              </div>
            </div>
          </td>
          <td style="text-align:center;">
            <select class="firing-giant-select form-control" data-slot-idx="${s.idx}" style="font-size:12px; padding:2px 4px; border:1px solid var(--border-color); border-radius:3px; background:var(--card-bg); color:var(--text-main);">
              <option value="0" ${gStep === 0 ? "selected" : ""}>未巨大化 (base)</option>
              <option value="1" ${gStep === 1 ? "selected" : ""}>1段階 (推定値)</option>
              <option value="2" ${gStep === 2 ? "selected" : ""}>2段階 (推定値)</option>
              <option value="3" ${gStep === 3 ? "selected" : ""}>3段階 (推定値)</option>
              <option value="4" ${gStep === 4 ? "selected" : ""}>4段階 (推定値)</option>
              <option value="5" ${gStep === 5 ? "selected" : ""}>最大 (giant5)</option>
            </select>
            ${stat.isIntermediateGiant ? '<div style="margin-top:2px;"><span class="badge" style="background:#fff3cd; color:#856404; font-size:12px;" title="base→giant5の線形補間推定値">推定値</span></div>' : ''}
          </td>
          <td style="text-align:right; font-weight:bold; color:var(--buff-color); font-size:12px;">
            ${stat.finalAtk.toLocaleString()}
            ${stat.isIntermediateGiant ? '<div style="font-size:12px; color:#856404; font-weight:normal;">(推定)</div>' : ''}
          </td>
          <td style="text-align:right; font-size:12px;">
            <div>通常: ${stat.isBuffWeapon ? '<span style="color:var(--text-sub); font-size:12px;">攻撃なし（支援）</span>' : `<strong style="color:#e67e22;">${stat.finalHitDamage.toLocaleString()}</strong>${stat.hits > 1 ? ` × ${stat.hits}連` : ''}`}</div>
            <div>計略: ${stat.strategyDamage ? `<strong style="color:#9f7aea;">${stat.strategyDamage.totalDamagePerCast.toLocaleString()}</strong>` : '<span style="color:var(--text-sub); font-size:12px;">-</span>'}</div>
            <div style="font-size:12px; color:var(--text-sub);">${stat.isBuffWeapon ? '<span style="color:var(--text-sub); font-size:12px;">支援専用</span>' : (stat.effectiveIgnore ? '<span style="color:#27ae60;">[防御無視]</span>' : `実効防 ${stat.effDef}`)}</div>
          </td>
          <td style="text-align:center; font-size:12px;">
            <div>${stat.isBuffWeapon ? '支援周期' : '通常'}: <strong>${stat.cycleFrames}f</strong> (${stat.attacksPerSec.toFixed(2)}/s)</div>
            <div>計略: ${stat.strategyDamage ? `<strong style="color:#9f7aea;">CT ${stat.strategyDamage.cooldown}s</strong>` : '<span style="color:var(--text-sub); font-size:12px;">-</span>'}</div>
          </td>
          <td style="text-align:right; font-size:12px;">
            <div>通常: ${stat.isBuffWeapon ? '<span style="color:var(--text-sub); font-size:12px;">攻撃なし (0/s)</span>' : `${stat.normalDps.toLocaleString()} /s`}</div>
            <div>計略: ${stat.strategyDamage ? `${stat.strategyDamage.dps.toLocaleString()} /s` : '<span class="badge" style="background:#f1f5f9; color:#64748b; font-size:12px;">未対応(バフのみ)</span>'}</div>
            <div style="font-weight:bold; color:#d35400; font-size:13px; margin-top:2px;">計: ${stat.theoreticalDps.toLocaleString()} /s</div>
          </td>
          <td style="text-align:right; font-family:monospace; font-size:12px;" id="firingRowDmg_${i}">
            <strong>${s.totalDmg.toLocaleString()}</strong>
            <div style="font-size:12px; color:var(--text-sub);">${stat.isBuffWeapon ? '通常:なし(支援)' : `通常:${(s.normalDmg || 0).toLocaleString()} (${s.hits || 0}h)`}${stat.strategyDamage ? ` / 計略:${(s.stratDmg || 0).toLocaleString()} (${s.stratCount || 0}回)` : ''}</div>
          </td>
          <td style="text-align:center;">
            <div style="display:flex; align-items:center; gap:4px; justify-content:center;">
              <div style="width:50px; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                <div style="width:${sharePerc}%; height:100%; background:var(--primary-color);"></div>
              </div>
              <span style="font-size:12px; font-weight:bold;">${sharePerc}%</span>
            </div>
          </td>
          <td style="font-size:12px; color:var(--text-sub); max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(stat.breakdownText)}">
            ${escapeHtml(stat.breakdownText)}
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll(".firing-giant-select").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const slotIdx = parseInt(e.target.dataset.slotIdx, 10);
        const val = parseInt(e.target.value, 10);
        if (party[slotIdx]) {
          party[slotIdx].giantStep = val;
          saveParty();
          renderFiringRangeTab();
        }
      });
    });

    renderFiringBuffContributions();
    renderFiringSnapshotList();
    drawFiringStageCanvas();
    updateTimelineSvg();
  }

  function renderFiringBuffContributions() {
    const listEl = document.getElementById("firingBuffContributionList");
    if (!listEl) return;

    const calcResult = calculateBuffs();
    if (!calcResult || calcResult.activePartyMembers.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px; color:var(--text-sub); padding:8px;">編成に城娘がいません。</div>`;
      return;
    }

    let hasAtkPerc = false;
    let hasAtkFlat = false;
    let hasShareAtk = false;
    let hasDmgDealt = false;
    let hasDmgTarget = false;
    let hasAtkSpeed = false;
    let hasGapShorten = false;
    let hasDefIgnore = false;
    let hasEnemyDefDown = (calcResult.enemyDebuffs?.enemyDefDown?.max || 0) > 0;
    let hasEnemyDmgTaken = (calcResult.enemyDebuffs?.enemyDmgTakenUp?.max || 0) > 0;

    for (const cid in calcResult.perCastle) {
      const b = calcResult.perCastle[cid].buffs;
      if (b) {
        if ((b.atkPercent?.max || 0) + (b.atkPercent?.stackSum || 0) > 0) hasAtkPerc = true;
        if ((b.atkFlat?.sum || 0) > 0) hasAtkFlat = true;
        if (b.shares && b.shares.some(sh => sh.stat === "shareAtk")) hasShareAtk = true;
        if ((b.dmgDealt?.max || 0) + (b.dmgDealt?.stackSum || 0) > 0) hasDmgDealt = true;
        if (b.dmgDealtTarget?.sources?.length > 0) hasDmgTarget = true;
        if ((b.atkSpeed?.max || 0) + (b.atkSpeed?.stackSum || 0) > 0) hasAtkSpeed = true;
        if ((b.gapShorten?.max || 0) + (b.gapShorten?.stackSum || 0) > 0) hasGapShorten = true;
        if (b.defIgnore?.length > 0) hasDefIgnore = true;
      }
    }

    const availableBuffs = [
      { key: "atk_percent", label: "攻撃割合上昇 (atk%)", active: hasAtkPerc },
      { key: "atk_flat", label: "攻撃固定値上昇 (atkFlat)", active: hasAtkFlat },
      { key: "share_atk", label: "鼓舞・攻撃共有 (shareAtk)", active: hasShareAtk },
      { key: "dmg_dealt", label: "与ダメージ上昇 (dmgDealt%)", active: hasDmgDealt },
      { key: "dmg_dealt_target", label: "与えるダメージ倍率 (dmgTarget)", active: hasDmgTarget },
      { key: "atk_speed", label: "攻撃速度上昇 (atkSpeed%)", active: hasAtkSpeed },
      { key: "gap_shorten", label: "攻撃後の隙短縮 (gapShorten%)", active: hasGapShorten },
      { key: "def_ignore", label: "防御無視スキル (defIgnore)", active: hasDefIgnore },
      { key: "enemy_def_down", label: "敵防御低下 (enemyDefDown%)", active: hasEnemyDefDown },
      { key: "enemy_dmg_taken", label: "敵被ダメージ上昇 (enemyDmgTaken%)", active: hasEnemyDmgTaken }
    ].filter(b => b.active);

    if (availableBuffs.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px; color:var(--text-sub); padding:8px;">現在編成に検証対象となるバフ効果がありません。</div>`;
      return;
    }

    let baselineDps = 0;
    party.forEach(slot => {
      if (!slot) return;
      const c = getCastleById(slot.id);
      if (!c) return;
      const st = calculateFiringCastleStats(c, slot, firingRangeState.targetDef, firingRangeState.targetRed, firingRangeState.targetCount, new Set());
      baselineDps += st.theoreticalDps;
    });

    listEl.innerHTML = availableBuffs.map(buff => {
      const isCurrentlyDisabled = firingRangeState.disabledBuffs.has(buff.key);
      let disabledDps = 0;
      party.forEach(slot => {
        if (!slot) return;
        const c = getCastleById(slot.id);
        if (!c) return;
        const st = calculateFiringCastleStats(c, slot, firingRangeState.targetDef, firingRangeState.targetRed, firingRangeState.targetCount, new Set([buff.key]));
        disabledDps += st.theoreticalDps;
      });

      const delta = baselineDps - disabledDps;
      const contribPerc = baselineDps > 0 ? (delta / baselineDps * 100).toFixed(1) : "0.0";
      const isPos = delta >= 0;

      return `
        <div class="firing-buff-card ${isCurrentlyDisabled ? 'disabled' : ''}">
          <div style="flex:1;">
            <div style="font-weight:bold; font-size:12px; color:var(--text-main);">${escapeHtml(buff.label)}</div>
            <div style="font-size:12px; color:${isPos ? '#27ae60' : '#e74c3c'}; font-weight:bold; margin-top:2px;">
              寄与度: +${contribPerc}% (${isPos ? `DPS: ${baselineDps.toLocaleString()} ➔ ${disabledDps.toLocaleString()} /秒` : '影響なし'})
            </div>
          </div>
          <button type="button" class="btn btn-xs ${isCurrentlyDisabled ? 'btn-outline' : 'btn-primary'}" onclick="toggleFiringBuffDisabled('${escapeHtml(buff.key)}')" style="font-size:12px; padding:3px 10px; white-space:nowrap;">
            ${isCurrentlyDisabled ? 'OFF中 (無効)' : 'ON (有効)'}
          </button>
        </div>
      `;
    }).join("");
  }

  function toggleFiringBuffDisabled(buffKey) {
    if (firingRangeState.disabledBuffs.has(buffKey)) {
      firingRangeState.disabledBuffs.delete(buffKey);
    } else {
      firingRangeState.disabledBuffs.add(buffKey);
    }
    renderFiringRangeTab();
  }

  function startFiringSimulation() {
    if (firingRangeState.isRunning) return;
    firingRangeState.isRunning = true;
    firingRangeState.lastTimestamp = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    const btn = document.getElementById("btnFiringPlayPause");
    if (btn) {
      btn.textContent = "⏸ 一時停止";
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-warning");
    }

    if (firingRangeState.animFrameId && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(firingRangeState.animFrameId);
    }
    if (typeof requestAnimationFrame !== "undefined") {
      firingRangeState.animFrameId = requestAnimationFrame(firingAnimLoop);
    }
  }

  function pauseFiringSimulation() {
    firingRangeState.isRunning = false;
    if (firingRangeState.animFrameId && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(firingRangeState.animFrameId);
    }
    firingRangeState.animFrameId = null;

    const btn = document.getElementById("btnFiringPlayPause");
    if (btn) {
      btn.textContent = "▶ 試射再開";
      btn.classList.add("btn-primary");
      btn.classList.remove("btn-warning");
    }
  }

  function resetFiringSimulation() {
    pauseFiringSimulation();
    firingRangeState.elapsedTime = 0;
    firingRangeState.totalDamage = 0;
    firingRangeState.timelinePoints = [{ time: 0, totalDmg: 0, dps: 0 }];
    firingRangeState.projectiles = [];
    firingRangeState.damagePopups = [];

    firingRangeState.castleSlots.forEach(s => {
      s.timer = 0;
      s.hits = 0;
      s.totalDmg = 0;
      s.normalDmg = 0;
      s.stratDmg = 0;
      s.stratCount = 0;
      s.stratTimer = 0;
    });

    const btn = document.getElementById("btnFiringPlayPause");
    if (btn) btn.textContent = "▶ 試射開始";

    const timerDisp = document.getElementById("firingTimerDisplay");
    if (timerDisp) timerDisp.textContent = "00:00.0";
    const totalDmgDisp = document.getElementById("firingTotalDmgDisplay");
    if (totalDmgDisp) totalDmgDisp.textContent = "0";
    const currentDpsDisp = document.getElementById("firingCurrentDpsDisplay");
    if (currentDpsDisp) currentDpsDisp.textContent = "0";

    const hpBar = document.getElementById("firingDummyHpBarFill");
    if (hpBar) hpBar.style.width = "100%";
    const hpText = document.getElementById("firingDummyHpText");
    if (hpText) hpText.textContent = `${firingRangeState.targetHp.toLocaleString()} / ${firingRangeState.targetHp.toLocaleString()} (100%)`;

    firingRangeState.castleSlots.forEach((s, i) => {
      const row = document.getElementById(`firingRowDmg_${i}`);
      if (row) {
        row.innerHTML = `<strong>0</strong><div style="font-size:12px; color:var(--text-sub);">通常:0 (0h)</div>`;
      }
    });

    drawFiringStageCanvas();
    updateTimelineSvg();
  }

  function firingAnimLoop(currentTimestamp) {
    if (!firingRangeState.isRunning) return;
    const tabEl = document.getElementById("tab-firing-range");
    if (!tabEl || !tabEl.classList.contains("active")) {
      pauseFiringSimulation();
      return;
    }

    const now = (typeof performance !== "undefined" && performance.now) ? currentTimestamp : Date.now();
    const dt = Math.min(0.1, (now - firingRangeState.lastTimestamp) / 1000);
    firingRangeState.lastTimestamp = now;
    const speed = firingRangeState.speed || 1.0;

    firingRangeState.elapsedTime += dt * speed;

    firingRangeState.castleSlots.forEach((s, idx) => {
      // 1. 通常攻撃サイクル
      if (!s.stat.isBuffWeapon) {
        s.timer += dt * speed;
        const cycleTime = s.stat.cycleTime || 1.0;
        while (s.timer >= cycleTime) {
          s.timer -= cycleTime;
          s.hits += s.stat.hits;
          const dmg = s.stat.finalHitDamage * s.stat.hits * s.stat.effectiveTargets;
          s.normalDmg = (s.normalDmg || 0) + dmg;
          s.totalDmg += dmg;
          firingRangeState.totalDamage += dmg;

          firingRangeState.projectiles.push({
            slotIdx: idx,
            progress: 0,
            speed: 4.0,
            isMagic: s.stat.effectiveIgnore
          });

          spawnDamagePopup(dmg, s.stat.effectiveIgnore, false);
        }
      } else {
        // buff種（歌舞・陣貝・茶器）は通常攻撃を行わない（ダメージ加算・弾道・ポップアップなし）
        s.timer += dt * speed;
        const cycleTime = s.stat.cycleTime || 1.0;
        while (s.timer >= cycleTime) {
          s.timer -= cycleTime;
        }
      }

      // 2. 計略ダメージ発動サイクル (Prompt 41)
      if (s.stat.strategyDamage && (s.slot?.strategyOn !== false)) {
        if (s.stratCount === 0) {
          // 試射開始直後に1回発動
          s.stratCount = 1;
          s.stratTimer = 0;
          const sDmg = s.stat.strategyDamage.totalDamagePerCast;
          s.stratDmg = (s.stratDmg || 0) + sDmg;
          s.totalDmg += sDmg;
          firingRangeState.totalDamage += sDmg;

          firingRangeState.projectiles.push({
            slotIdx: idx,
            progress: 0,
            speed: 5.0,
            isMagic: true,
            isStrategy: true
          });

          spawnDamagePopup(sDmg, true, true);
        } else {
          s.stratTimer = (s.stratTimer || 0) + dt * speed;
          while (s.stratTimer >= s.stat.strategyDamage.cooldown) {
            s.stratTimer -= s.stat.strategyDamage.cooldown;
            s.stratCount++;
            const sDmg = s.stat.strategyDamage.totalDamagePerCast;
            s.stratDmg = (s.stratDmg || 0) + sDmg;
            s.totalDmg += sDmg;
            firingRangeState.totalDamage += sDmg;

            firingRangeState.projectiles.push({
              slotIdx: idx,
              progress: 0,
              speed: 5.0,
              isMagic: true,
              isStrategy: true
            });

            spawnDamagePopup(sDmg, true, true);
          }
        }
      }
    });

    for (let i = firingRangeState.projectiles.length - 1; i >= 0; i--) {
      firingRangeState.projectiles[i].progress += dt * speed * firingRangeState.projectiles[i].speed;
      if (firingRangeState.projectiles[i].progress >= 1.0) {
        firingRangeState.projectiles.splice(i, 1);
      }
    }

    for (let i = firingRangeState.damagePopups.length - 1; i >= 0; i--) {
      firingRangeState.damagePopups[i].y -= dt * speed * 30;
      firingRangeState.damagePopups[i].alpha -= dt * speed * 1.2;
      if (firingRangeState.damagePopups[i].alpha <= 0) {
        firingRangeState.damagePopups.splice(i, 1);
      }
    }

    let shouldStop = false;
    if (!firingRangeState.isInfiniteHp && firingRangeState.totalDamage >= firingRangeState.targetHp) {
      firingRangeState.totalDamage = firingRangeState.targetHp;
      shouldStop = true;
    }
    if (firingRangeState.isInfiniteHp && firingRangeState.durationLimit > 0 && firingRangeState.elapsedTime >= firingRangeState.durationLimit) {
      firingRangeState.elapsedTime = firingRangeState.durationLimit;
      shouldStop = true;
    }

    const sec = Math.floor(firingRangeState.elapsedTime);
    if (!firingRangeState.timelinePoints.some(p => p.time === sec)) {
      const currentDps = Math.round(firingRangeState.totalDamage / Math.max(0.1, firingRangeState.elapsedTime));
      firingRangeState.timelinePoints.push({ time: sec, totalDmg: firingRangeState.totalDamage, dps: currentDps });
      if (firingRangeState.timelinePoints.length > 120) firingRangeState.timelinePoints.shift();
      updateTimelineSvg();
    }

    updateFiringUiCounters();
    drawFiringStageCanvas();

    if (shouldStop) {
      pauseFiringSimulation();
      showToast(`🎯 試射完了！ タイム: ${formatTime(firingRangeState.elapsedTime)} / 総ダメージ: ${firingRangeState.totalDamage.toLocaleString()}`);
      return;
    }

    if (typeof requestAnimationFrame !== "undefined") {
      firingRangeState.animFrameId = requestAnimationFrame(firingAnimLoop);
    }
  }

  function drawFiringStageCanvas() {
    const canvas = document.getElementById("firingStageCanvas");
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width || 800;
    const h = canvas.height || 260;

    ctx.clearRect(0, 0, w, h);

    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, "#1a202c");
    bgGrad.addColorStop(1, "#2d3748");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    for (let x = 40; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 30; y < h; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const targetX = w - 120;
    const targetY = h / 2;

    const col1X = 70;
    const col2X = 180;
    const rowY = [40, 100, 160, 220];

    const slotCoords = [];
    for (let i = 0; i < 8; i++) {
      const cx = (i < 4) ? col1X : col2X;
      const cy = rowY[i % 4];
      slotCoords.push({ x: cx, y: cy });

      const s = firingRangeState.castleSlots[i];
      if (!s || !s.castle) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.stroke();
        continue;
      }

      const c = s.castle;

      // 射程円 (Range Circle: calculatedStats.range に基づく相対円)
      const rangeVal = s.stat?.effectiveRange || (c.stats && c.stats.giant5 && c.stats.giant5.range) || 300;
      const rangeRadius = Math.max(30, Math.min(180, Math.round(rangeVal * 0.22)));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rangeRadius, 0, Math.PI * 2);
      ctx.fillStyle = s.stat?.effectiveIgnore ? "rgba(159, 122, 234, 0.05)" : "rgba(66, 153, 225, 0.05)";
      ctx.fill();
      ctx.strokeStyle = s.stat?.effectiveIgnore ? "rgba(159, 122, 234, 0.35)" : "rgba(66, 153, 225, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "#2b6cb0";
      ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#4299e1";
      ctx.lineWidth = 2;
      ctx.stroke();

      const cycleTime = s.stat.cycleTime || 1;
      const chargeRatio = Math.min(1.0, s.timer / cycleTime);
      ctx.strokeStyle = "#ecc94b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 24, -Math.PI / 2, -Math.PI / 2 + chargeRatio * Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(c.name.slice(0, 4), cx, cy + 4);

      ctx.fillStyle = "#cbd5e0";
      ctx.font = "12px sans-serif";
      ctx.fillText(c.weapon, cx, cy - 28);
    }

    firingRangeState.projectiles.forEach(p => {
      const from = slotCoords[p.slotIdx] || { x: col1X, y: 130 };
      const curX = from.x + (targetX - from.x) * p.progress;
      const curY = from.y + (targetY - from.y) * p.progress;

      ctx.fillStyle = p.isMagic ? "#9f7aea" : "#ed8936";
      ctx.beginPath();
      ctx.arc(curX, curY, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = p.isMagic ? "rgba(159, 122, 234, 0.4)" : "rgba(237, 137, 54, 0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(curX, curY);
      ctx.stroke();
    });

    ctx.fillStyle = "#9b2c2c";
    ctx.beginPath(); ctx.arc(targetX, targetY, 36, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#f56565";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🎯", targetX, targetY + 7);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(firingRangeState.dummyName || "的", targetX, targetY - 44);

    ctx.fillStyle = "#fbd38d";
    ctx.font = "12px sans-serif";
    ctx.fillText(`防: ${firingRangeState.targetDef} ${firingRangeState.targetRed > 0 ? `(-${firingRangeState.targetRed}%)` : ''}`, targetX, targetY + 54);

    firingRangeState.damagePopups.forEach(pop => {
      let color;
      if (pop.isStrategy) {
        color = `rgba(246, 224, 94, ${pop.alpha})`;
      } else if (pop.isMagic) {
        color = `rgba(159, 122, 234, ${pop.alpha})`;
      } else {
        color = `rgba(237, 137, 54, ${pop.alpha})`;
      }
      ctx.fillStyle = color;
      ctx.font = pop.isStrategy ? "bold 15px sans-serif" : "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(pop.text, pop.x, pop.y);
    });
  }

  function spawnDamagePopup(amount, isMagic, isStrategy) {
    const canvas = document.getElementById("firingStageCanvas");
    const targetX = canvas ? (canvas.width - 120) : 680;
    const targetY = canvas ? (canvas.height / 2) : 130;

    const jitterX = targetX + (Math.random() * 40 - 20);
    const jitterY = targetY + (Math.random() * 30 - 15);

    const text = isStrategy ? `計略 +${amount.toLocaleString()}` : `+${amount.toLocaleString()}`;

    firingRangeState.damagePopups.push({
      text: text,
      x: jitterX,
      y: jitterY,
      alpha: 1.0,
      isMagic: isMagic,
      isStrategy: Boolean(isStrategy)
    });

    if (firingRangeState.damagePopups.length > 25) {
      firingRangeState.damagePopups.shift();
    }
  }

  function updateFiringUiCounters() {
    const timerDisp = document.getElementById("firingTimerDisplay");
    if (timerDisp) timerDisp.textContent = formatTime(firingRangeState.elapsedTime);

    const totalDmgDisp = document.getElementById("firingTotalDmgDisplay");
    if (totalDmgDisp) totalDmgDisp.textContent = firingRangeState.totalDamage.toLocaleString();

    const dps = Math.round(firingRangeState.totalDamage / Math.max(0.1, firingRangeState.elapsedTime));
    const currentDpsDisp = document.getElementById("firingCurrentDpsDisplay");
    if (currentDpsDisp) currentDpsDisp.textContent = `${dps.toLocaleString()} /秒`;

    if (!firingRangeState.isInfiniteHp) {
      const rem = Math.max(0, firingRangeState.targetHp - firingRangeState.totalDamage);
      const perc = Math.min(100, Math.max(0, (rem / firingRangeState.targetHp * 100)));
      const hpBar = document.getElementById("firingDummyHpBarFill");
      if (hpBar) hpBar.style.width = `${perc}%`;
      const hpText = document.getElementById("firingDummyHpText");
      if (hpText) hpText.textContent = `${rem.toLocaleString()} / ${firingRangeState.targetHp.toLocaleString()} (${perc.toFixed(1)}%)`;
    }

    firingRangeState.castleSlots.forEach((s, i) => {
      const row = document.getElementById(`firingRowDmg_${i}`);
      if (row) {
        const normDmg = s.normalDmg || 0;
        const sDmg = s.stratDmg || 0;
        const sCount = s.stratCount || 0;
        row.innerHTML = `
          <strong>${s.totalDmg.toLocaleString()}</strong>
          <div style="font-size:12px; color:var(--text-sub);">
            通常:${normDmg.toLocaleString()} (${s.hits}h)${s.stat?.strategyDamage ? ` / 計略:${sDmg.toLocaleString()} (${sCount}回)` : ''}
          </div>
        `;
      }
    });
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
  }

  function updateTimelineSvg() {
    const svg = document.getElementById("firingTimelineSvg");
    if (!svg) return;
    const pts = firingRangeState.timelinePoints;
    if (!pts || pts.length < 2) {
      svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#718096" font-size="12px">試射を開始すると時間軸ダメージ推移グラフが描画されます</text>`;
      return;
    }

    const maxTime = Math.max(10, pts[pts.length - 1].time);
    const maxDmg = Math.max(1000, pts[pts.length - 1].totalDmg);

    const w = 700;
    const h = 160;
    const padL = 60;
    const padR = 20;
    const padT = 16;
    const padB = 26;

    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const polyPoints = pts.map(p => {
      const x = padL + (p.time / maxTime) * plotW;
      const y = h - padB - (p.totalDmg / maxDmg) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.innerHTML = `
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="#4a5568" stroke-width="1" />
      <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="#4a5568" stroke-width="1" />
      <text x="${padL - 6}" y="${padT + 8}" text-anchor="end" fill="#a0aec0" font-size="12px">${Math.round(maxDmg / 1000)}k</text>
      <text x="${padL - 6}" y="${h - padB}" text-anchor="end" fill="#a0aec0" font-size="12px">0</text>
      <text x="${padL}" y="${h - 6}" text-anchor="middle" fill="#a0aec0" font-size="12px">0s</text>
      <text x="${w - padR}" y="${h - 6}" text-anchor="end" fill="#a0aec0" font-size="12px">${maxTime}s</text>
      <polyline fill="none" stroke="#e67e22" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polyPoints}" />
    `;
  }

  const FIRING_SNAPSHOT_STORAGE_KEY = "scre-helper:firing-snapshots:v1";

  function getFiringSnapshots() {
    try {
      const raw = localStorage.getItem(FIRING_SNAPSHOT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveFiringSnapshot() {
    const input = document.getElementById("firingSnapshotNameInput");
    const name = (input?.value || "").trim() || `試射スナップ (${new Date().toLocaleTimeString()})`;

    const partyCastles = party.map(s => s ? { castle: getCastleById(s.id), slot: s } : null).filter(Boolean);
    let totalDps = 0;
    const castleStats = partyCastles.map(({ castle: c, slot: s }) => {
      const st = calculateFiringCastleStats(c, s, firingRangeState.targetDef, firingRangeState.targetRed, firingRangeState.targetCount, firingRangeState.disabledBuffs);
      totalDps += st.theoreticalDps;
      return {
        id: c.id,
        name: c.name,
        weapon: c.weapon,
        giantStep: (s && typeof s.giantStep === "number") ? s.giantStep : 5,
        finalAtk: st.finalAtk,
        finalHitDamage: st.finalHitDamage,
        cycleFrames: st.cycleFrames,
        attacksPerSec: st.attacksPerSec,
        normalDps: st.normalDps,
        stratDps: st.stratDps,
        dps: st.theoreticalDps
      };
    });

    const snap = {
      id: "snap_" + Date.now(),
      name: name,
      timestamp: Date.now(),
      targetDef: firingRangeState.targetDef,
      targetHp: firingRangeState.targetHp,
      isInfiniteHp: firingRangeState.isInfiniteHp,
      targetRed: firingRangeState.targetRed,
      targetCount: firingRangeState.targetCount,
      dummyName: firingRangeState.dummyName,
      totalDps: totalDps,
      elapsedTime: firingRangeState.elapsedTime,
      totalDamage: firingRangeState.totalDamage,
      castleStats: castleStats
    };

    const list = getFiringSnapshots();
    list.unshift(snap);
    if (list.length > 20) list.pop();
    try {
      localStorage.setItem(FIRING_SNAPSHOT_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}

    if (input) input.value = "";
    showToast(`📸 スナップショット「${escapeHtml(name)}」を保存しました`);
    renderFiringSnapshotList();
  }

  function deleteFiringSnapshot(id) {
    let list = getFiringSnapshots();
    list = list.filter(s => s.id !== id);
    try {
      localStorage.setItem(FIRING_SNAPSHOT_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
    renderFiringSnapshotList();
  }

  function renderFiringSnapshotList() {
    const container = document.getElementById("firingSnapshotListContainer");
    if (!container) return;

    const list = getFiringSnapshots();
    if (list.length === 0) {
      container.innerHTML = `<div style="font-size:12px; color:var(--text-sub); padding:4px;">保存済みスナップショットはありません。</div>`;
      return;
    }

    container.innerHTML = `
      <div style="font-size:12px; font-weight:bold; margin-bottom:6px;">保存済みスナップ (${list.length}件):</div>
      <div style="max-height:160px; overflow-y:auto; margin-bottom:10px;">
        ${list.map(s => `
          <div class="firing-snapshot-item">
            <div>
              <strong style="font-size:12px;">${escapeHtml(s.name)}</strong>
              <div style="color:var(--text-sub); font-size:12px;">
                総DPS: <strong style="color:#d35400;">${s.totalDps.toLocaleString()}</strong> /秒 (防${s.targetDef})
              </div>
            </div>
            <div style="display:flex; gap:4px;">
              <button type="button" class="btn btn-xs" onclick="deleteFiringSnapshot('${s.id}')" title="削除">✕</button>
            </div>
          </div>
        `).join("")}
      </div>
      ${list.length >= 2 ? `
        <div style="display:flex; gap:6px; align-items:center;">
          <select id="firingSnapSelectA" class="form-control" style="flex:1; font-size:12px; padding:4px;">
            ${list.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${s.totalDps.toLocaleString()}/s)</option>`).join("")}
          </select>
          <span style="font-size:12px; font-weight:bold;">vs</span>
          <select id="firingSnapSelectB" class="form-control" style="flex:1; font-size:12px; padding:4px;">
            ${list.map((s, idx) => `<option value="${s.id}" ${idx === 1 ? 'selected' : ''}>${escapeHtml(s.name)} (${s.totalDps.toLocaleString()}/s)</option>`).join("")}
          </select>
          <button type="button" id="btnCompareSnapshots" class="btn btn-xs btn-primary" onclick="triggerSnapshotComparison()" style="font-size:12px; white-space:nowrap;">比較</button>
        </div>
      ` : ''}
    `;
  }

  function triggerSnapshotComparison() {
    const selA = document.getElementById("firingSnapSelectA");
    const selB = document.getElementById("firingSnapSelectB");
    if (!selA || !selB) return;
    compareFiringSnapshots(selA.value, selB.value);
  }

  function compareFiringSnapshots(idA, idB) {
    const list = getFiringSnapshots();
    const snapA = list.find(s => s.id === idA);
    const snapB = list.find(s => s.id === idB);
    if (!snapA || !snapB) return;

    const box = document.getElementById("firingSnapshotComparisonBox");
    const content = document.getElementById("firingSnapshotComparisonContent");
    if (!box || !content) return;

    const diffDps = snapB.totalDps - snapA.totalDps;
    const diffPerc = snapA.totalDps > 0 ? (diffDps / snapA.totalDps * 100).toFixed(1) : "0.0";
    const isUp = diffDps >= 0;

    content.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div style="background:var(--nav-bg); padding:10px; border-radius:6px; border:1px solid var(--border-color);">
          <div style="font-size:12px; color:var(--text-sub);">基準 (Snapshot A)</div>
          <strong style="font-size:14px;">${escapeHtml(snapA.name)}</strong>
          <div style="font-size:13px; font-weight:bold; color:#1a365d; margin-top:4px;">総DPS: ${snapA.totalDps.toLocaleString()} /秒</div>
          <div style="font-size:12px; color:var(--text-sub);">的: 防${snapA.targetDef} / 軽減${snapA.targetRed}%</div>
        </div>
        <div style="background:var(--nav-bg); padding:10px; border-radius:6px; border:1px solid var(--border-color);">
          <div style="font-size:12px; color:var(--text-sub);">比較対象 (Snapshot B)</div>
          <strong style="font-size:14px;">${escapeHtml(snapB.name)}</strong>
          <div style="font-size:13px; font-weight:bold; color:#1a365d; margin-top:4px;">総DPS: ${snapB.totalDps.toLocaleString()} /秒</div>
          <div style="font-size:12px; color:var(--text-sub);">的: 防${snapB.targetDef} / 軽減${snapB.targetRed}%</div>
        </div>
      </div>

      <div style="background:${isUp ? '#e6fffa' : '#fff5f5'}; border:1px solid ${isUp ? '#38b2ac' : '#e53e3e'}; border-radius:6px; padding:10px; text-align:center; margin-bottom:12px;">
        <span style="font-size:12px; color:var(--text-sub);">火力変化:</span>
        <strong style="font-size:16px; color:${isUp ? '#234e52' : '#742a2a'}; margin-left:8px;">
          ${isUp ? '▲' : '▼'} ${diffDps >= 0 ? '+' : ''}${diffDps.toLocaleString()} /秒 (${diffDps >= 0 ? '+' : ''}${diffPerc}%)
        </strong>
      </div>

      <table class="table firing-comparison-table" style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background:var(--nav-bg); border-bottom:1px solid var(--border-color); text-align:left;">
            <th>城娘</th>
            <th style="text-align:right;">Snapshot A DPS</th>
            <th style="text-align:right;">Snapshot B DPS</th>
            <th style="text-align:right;">差分 (Δ)</th>
          </tr>
        </thead>
        <tbody>
          ${snapA.castleStats.map(ca => {
            const cb = snapB.castleStats.find(x => x.id === ca.id) || { dps: 0 };
            const cDiff = cb.dps - ca.dps;
            const cDiffPerc = ca.dps > 0 ? (cDiff / ca.dps * 100).toFixed(1) : "0.0";
            return `
              <tr style="border-bottom:1px solid var(--border-color);">
                <td>
                  <strong>${escapeHtml(ca.name)}</strong>
                  <span style="color:var(--text-sub); font-size:12px;">${ca.weapon}</span>
                  <span style="font-size:12px; color:#2b6cb0; margin-left:4px;">
                    ${ca.giantStep !== undefined ? (ca.giantStep === 0 ? '[未巨大化]' : (ca.giantStep === 5 ? '[最大]' : `[${ca.giantStep}段(推)]`)) : ''}
                  </span>
                </td>
                <td style="text-align:right;">${ca.dps.toLocaleString()}</td>
                <td style="text-align:right;">${cb.dps.toLocaleString()}</td>
                <td style="text-align:right; font-weight:bold; color:${cDiff >= 0 ? '#27ae60' : '#e74c3c'};">
                  ${cDiff >= 0 ? '+' : ''}${cDiff.toLocaleString()} (${cDiff >= 0 ? '+' : ''}${cDiffPerc}%)
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    box.style.display = "block";
  }

  function initFiringRange() {
    const presetSelect = document.getElementById("firingRangePresetSelect");
    if (presetSelect && SCRE_BOSS_CATALOG) {
      let bossOptionsHtml = `<optgroup label="地獄・高難易度ボス (ボスカタログ)">`;
      SCRE_BOSS_CATALOG.forEach((b, idx) => {
        bossOptionsHtml += `<option value="boss_${idx}">${escapeHtml(b.name)} (HP ${b.hp.toLocaleString()} / 防 ${b.def})</option>`;
      });
      bossOptionsHtml += `</optgroup>`;
      presetSelect.innerHTML += bossOptionsHtml;

      presetSelect.addEventListener("change", () => {
        const val = presetSelect.value;
        if (val.startsWith("boss_")) {
          const idx = parseInt(val.split("_")[1], 10);
          const b = SCRE_BOSS_CATALOG[idx];
          if (b) {
            firingRangeState.dummyName = b.name;
            firingRangeState.targetDef = b.def;
            firingRangeState.targetHp = b.hp;
            firingRangeState.isInfiniteHp = false;
            firingRangeState.targetRed = 0;
            syncFiringSettingsUI();
            renderFiringRangeTab();
          }
        } else {
          const p = FIRING_PRESETS.find(x => x.id === val);
          if (p) {
            firingRangeState.dummyName = p.name.split(" ")[0];
            firingRangeState.targetDef = p.def;
            firingRangeState.targetHp = p.hp;
            firingRangeState.isInfiniteHp = p.isInfinite;
            firingRangeState.targetRed = p.red;
            syncFiringSettingsUI();
            renderFiringRangeTab();
          }
        }
      });
    }

    const defSlider = document.getElementById("firingRangeDefSlider");
    const defInput = document.getElementById("firingRangeDefInput");
    if (defSlider && defInput) {
      defSlider.addEventListener("input", () => {
        const val = parseInt(defSlider.value, 10) || 0;
        defInput.value = val;
        firingRangeState.targetDef = val;
        syncDefText(val);
        renderFiringRangeTab();
      });
      defInput.addEventListener("change", () => {
        const val = Math.max(0, parseInt(defInput.value, 10) || 0);
        defSlider.value = Math.min(5000, val);
        firingRangeState.targetDef = val;
        syncDefText(val);
        renderFiringRangeTab();
      });
    }

    const defQuickBtns = document.querySelectorAll(".firing-def-quick-btn");
    defQuickBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const val = parseInt(btn.dataset.def, 10) || 0;
        firingRangeState.targetDef = val;
        if (defSlider) defSlider.value = Math.min(5000, val);
        if (defInput) defInput.value = val;
        syncDefText(val);
        defQuickBtns.forEach(b => b.classList.toggle("active", b === btn));
        renderFiringRangeTab();
      });
    });

    const btnInfinite = document.getElementById("btnHpModeInfinite");
    const btnFinite = document.getElementById("btnHpModeFinite");
    const hpRow = document.getElementById("firingRangeHpInputRow");
    const durBox = document.getElementById("firingRangeDurationModeBox");
    const dummyHpBox = document.getElementById("firingDummyHpBarBox");

    if (btnInfinite && btnFinite) {
      btnInfinite.addEventListener("click", () => {
        firingRangeState.isInfiniteHp = true;
        btnInfinite.classList.add("active");
        btnFinite.classList.remove("active");
        if (hpRow) hpRow.style.display = "none";
        if (durBox) durBox.style.display = "block";
        if (dummyHpBox) dummyHpBox.style.display = "none";
        renderFiringRangeTab();
      });
      btnFinite.addEventListener("click", () => {
        firingRangeState.isInfiniteHp = false;
        btnFinite.classList.add("active");
        btnInfinite.classList.remove("active");
        if (hpRow) hpRow.style.display = "flex";
        if (durBox) durBox.style.display = "none";
        if (dummyHpBox) dummyHpBox.style.display = "block";
        renderFiringRangeTab();
      });
    }

    const hpInput = document.getElementById("firingRangeHpInput");
    if (hpInput) {
      hpInput.addEventListener("change", () => {
        firingRangeState.targetHp = Math.max(1000, parseInt(hpInput.value, 10) || 200000);
        renderFiringRangeTab();
      });
    }

    const redSlider = document.getElementById("firingRangeRedSlider");
    const redInput = document.getElementById("firingRangeRedInput");
    const redText = document.getElementById("firingRangeRedValText");
    if (redSlider && redInput) {
      redSlider.addEventListener("input", () => {
        const val = parseInt(redSlider.value, 10) || 0;
        redInput.value = val;
        firingRangeState.targetRed = val;
        if (redText) redText.textContent = `${val}%`;
        renderFiringRangeTab();
      });
      redInput.addEventListener("change", () => {
        const val = Math.max(0, Math.min(90, parseInt(redInput.value, 10) || 0));
        redSlider.value = val;
        firingRangeState.targetRed = val;
        if (redText) redText.textContent = `${val}%`;
        renderFiringRangeTab();
      });
    }

    const targetCountBtns = document.querySelectorAll(".firing-target-count-btn");
    targetCountBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        targetCountBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        firingRangeState.targetCount = parseInt(btn.dataset.count, 10) || 1;
        renderFiringRangeTab();
      });
    });

    const durationBtns = document.querySelectorAll(".firing-duration-btn");
    durationBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        durationBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        firingRangeState.durationLimit = parseInt(btn.dataset.duration, 10) || 0;
      });
    });

    const speedBtns = document.querySelectorAll(".firing-speed-btn");
    speedBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        speedBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        firingRangeState.speed = parseFloat(btn.dataset.speed) || 1.0;
      });
    });

    const btnPlayPause = document.getElementById("btnFiringPlayPause");
    if (btnPlayPause) {
      btnPlayPause.addEventListener("click", () => {
        if (firingRangeState.isRunning) pauseFiringSimulation();
        else startFiringSimulation();
      });
    }

    const btnReset = document.getElementById("btnFiringReset");
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        resetFiringSimulation();
      });
    }

    const btnResetDummy = document.getElementById("btnResetDummySettings");
    if (btnResetDummy) {
      btnResetDummy.addEventListener("click", () => {
        firingRangeState.targetDef = 500;
        firingRangeState.targetHp = 200000;
        firingRangeState.isInfiniteHp = false;
        firingRangeState.targetRed = 0;
        firingRangeState.targetCount = 1;
        firingRangeState.dummyName = "標準的な兜";
        firingRangeState.disabledBuffs.clear();
        syncFiringSettingsUI();
        renderFiringRangeTab();
      });
    }

    const btnSaveSnap = document.getElementById("btnSaveFiringSnapshot");
    if (btnSaveSnap) {
      btnSaveSnap.addEventListener("click", saveFiringSnapshot);
    }

    const btnCloseSnapComp = document.getElementById("btnCloseSnapshotComparison");
    if (btnCloseSnapComp) {
      btnCloseSnapComp.addEventListener("click", () => {
        const box = document.getElementById("firingSnapshotComparisonBox");
        if (box) box.style.display = "none";
      });
    }

    // Prompt 41: Palette Toggle & Search/Filters
    const btnTogglePicker = document.getElementById("btnToggleFiringCastlePicker");
    const pickerBox = document.getElementById("firingCastlePickerContainer");
    if (btnTogglePicker && pickerBox) {
      btnTogglePicker.addEventListener("click", () => {
        const isHidden = pickerBox.style.display === "none";
        pickerBox.style.display = isHidden ? "block" : "none";
        btnTogglePicker.textContent = isHidden ? "✕ パレットを閉じる" : "🔍 城娘パレットを表示";
        if (isHidden) renderFiringPaletteTray();
      });
    }

    const pickerSearch = document.getElementById("firingPickerSearchInput");
    if (pickerSearch) {
      pickerSearch.addEventListener("input", renderFiringPaletteTray);
    }
    const pickerWeapon = document.getElementById("firingPickerWeaponFilter");
    if (pickerWeapon) {
      pickerWeapon.addEventListener("change", renderFiringPaletteTray);
    }
    const pickerRarity = document.getElementById("firingPickerRarityFilter");
    if (pickerRarity) {
      pickerRarity.addEventListener("change", renderFiringPaletteTray);
    }

    // Prompt 41: Trash Drop Zone for Drag-out Remove
    const trashZone = document.getElementById("firingSlotTrashDropZone");
    if (trashZone) {
      trashZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        trashZone.classList.add("drag-over");
      });
      trashZone.addEventListener("dragleave", () => {
        trashZone.classList.remove("drag-over");
      });
      trashZone.addEventListener("drop", (e) => {
        e.preventDefault();
        trashZone.classList.remove("drag-over");
        trashZone.style.display = "none";
        const rawData = e.dataTransfer.getData("text/plain");
        if (!rawData) return;
        try {
          const payload = JSON.parse(rawData);
          if (payload.type === "move-slot") {
            removePartySlot(payload.fromIdx);
          }
        } catch (err) {}
      });
    }
  }

  function syncDefText(val) {
    const txt = document.getElementById("firingRangeDefValText");
    if (txt) txt.textContent = val.toLocaleString();
  }

  function syncFiringSettingsUI() {
    const defSlider = document.getElementById("firingRangeDefSlider");
    const defInput = document.getElementById("firingRangeDefInput");
    if (defSlider) defSlider.value = Math.min(5000, firingRangeState.targetDef);
    if (defInput) defInput.value = firingRangeState.targetDef;
    syncDefText(firingRangeState.targetDef);

    const redSlider = document.getElementById("firingRangeRedSlider");
    const redInput = document.getElementById("firingRangeRedInput");
    const redText = document.getElementById("firingRangeRedValText");
    if (redSlider) redSlider.value = firingRangeState.targetRed;
    if (redInput) redInput.value = firingRangeState.targetRed;
    if (redText) redText.textContent = `${firingRangeState.targetRed}%`;

    const hpInput = document.getElementById("firingRangeHpInput");
    if (hpInput) hpInput.value = firingRangeState.targetHp;

    const btnInfinite = document.getElementById("btnHpModeInfinite");
    const btnFinite = document.getElementById("btnHpModeFinite");
    const hpRow = document.getElementById("firingRangeHpInputRow");
    const durBox = document.getElementById("firingRangeDurationModeBox");
    const dummyHpBox = document.getElementById("firingDummyHpBarBox");

    if (firingRangeState.isInfiniteHp) {
      if (btnInfinite) btnInfinite.classList.add("active");
      if (btnFinite) btnFinite.classList.remove("active");
      if (hpRow) hpRow.style.display = "none";
      if (durBox) durBox.style.display = "block";
      if (dummyHpBox) dummyHpBox.style.display = "none";
    } else {
      if (btnInfinite) btnInfinite.classList.remove("active");
      if (btnFinite) btnFinite.classList.add("active");
      if (hpRow) hpRow.style.display = "flex";
      if (durBox) durBox.style.display = "none";
      if (dummyHpBox) dummyHpBox.style.display = "block";
    }
  }

  // Initialize Prompt 34 listeners
  function initPrompt34Features() {
    initBuffEquivalenceListeners();
    initCounterConciergeListeners();
    initTagDictionary();
    initTierSplitListeners();
    initDelibPlannerListeners();
    initDetailDpsListeners();
    initFiringRange();
  }

  // Call on load
  if (typeof window !== "undefined") {
    setTimeout(initPrompt34Features, 50);
  }

  // Window exports for testing and external triggers
  window.rollNewChallenge = rollNewChallenge;
  window.clearChallenge = clearChallenge;
  window.autoFillChallenge = autoFillChallenge;
  window.getActiveChallenge = () => activeChallenge;
    window.renderRomanSimulator = renderRomanSimulator;
  window.toggleRomanSimulator = toggleRomanSimulator;
  window.setRomanCannonSlot = setRomanCannonSlot;
  window.toggleRomanSupporter = toggleRomanSupporter;
  window.extractDamageMultiplier = extractDamageMultiplier;
  window.renderDamageChecker = renderDamageChecker;
  window.toggleDamageChecker = toggleDamageChecker;
  window.selectMapPrefecture = selectMapPrefecture;
  window.renderMapTab = renderMapTab;
  window.startQuiz = startQuiz;
  window.handleQuizChoice = handleQuizChoice;
  window.renderQuizTab = renderQuizTab;
  window.quickToggleParty = quickToggleParty;
  window.setListViewMode = setListViewMode;
  window.openCastleDetail = openCastleDetail;
  window.calculateCastleSynergy = calculateCastleSynergy;
  window.calculateBuffs = calculateBuffs;
  window.getRecommendedWeapons = getRecommendedWeapons;

  // White-box test exports (test-spec)
  window.parseStatNumber = parseStatNumber;
  window.getCastleById = getCastleById;
  window.getCastleByName = getCastleByName;
  window.getLatestAbilities = getLatestAbilities;
  window.matchCastleNameOrRuby = matchCastleNameOrRuby;
  window.escapeHtml = escapeHtml;
  window.getCastleFullText = getCastleFullText;
  window.calcPercentile = calcPercentile;
  window.precomputeRawNormScores = precomputeRawNormScores;
  window.computeCastleScores = computeCastleScores;
  window.filterCastlesForStage = filterCastlesForStage;
  window.generateAutoSuggestedParty = generateAutoSuggestedParty;
  window.clearStageSuggestedPartyCache = clearStageSuggestedPartyCache;
  window.loadSuggestedPartyToCurrent = loadSuggestedPartyToCurrent;
  window.getShareUrl = getShareUrl;
  window.checkShareUrlOnLoad = checkShareUrlOnLoad;
  window.loadOwnership = loadOwnership;
  window.getStageProgressData = getStageProgressData;
  window.savePartyForStage = savePartyForStage;
  window.restorePartyFromStage = restorePartyFromStage;
  window.loadSavedCustomTiers = loadSavedCustomTiers;
  window.calculateGiantizeSimulation = calculateGiantizeSimulation;
  window.navigateDetailCastle = navigateDetailCastle;
  window.openImageZoom = openImageZoom;
  window.closeImageZoom = closeImageZoom;
  window.resetZoomTransform = resetZoomTransform;
  window.exportPartyImage = exportPartyImage;
  window.exportTierToImage = exportTierToImage;
  window.renderCoveragePanel = renderCoveragePanel;
  window.openPresetCompareModal = openPresetCompareModal;
  window.openStageDiagnostic = openStageDiagnostic;
  window.normalizeParty = normalizeParty;
  window.normalizePresets = normalizePresets;
  window.normalizeTerrain = normalizeTerrain;
  window.cleanIllustratorName = cleanIllustratorName;
  window.cleanVoiceActorName = cleanVoiceActorName;
  window.selectCastleForSlot = selectCastleForSlot;
  window.showNotification = showNotification;
  window.computeOhigeScores = computeOhigeScores;
  window.renderTierOhige = renderTierOhige;
  window.promptOhigeTierOverride = promptOhigeTierOverride;
  window.mapToOhigeTier = mapToOhigeTier;
  window.OHIGE_WEIGHTS = OHIGE_WEIGHTS;
  window.setOhigeTierScope = setOhigeTierScope;
  window.SCRE_BOSS_CATALOG = SCRE_BOSS_CATALOG;
  window.getBossForStage = getBossForStage;
  window.renderDeliberationMatrix = renderDeliberationMatrix;
  window.renderDebuffStackChecker = renderDebuffStackChecker;
  window.renderBossSnipeAndCountdown = renderBossSnipeAndCountdown;
  window.renderTtkRace = renderTtkRace;
  window.renderTransformationBadges = renderTransformationBadges;
  window.renderWaveCheatCards = renderWaveCheatCards;
  window.renderTileCongestionSection = renderTileCongestionSection;
  window.renderLossCauseSection = renderLossCauseSection;
  window.renderKiLedger = renderKiLedger;
  window.renderCycleSyncSection = renderCycleSyncSection;
  window.renderTokenReportCardSection = renderTokenReportCardSection;
  window.startCycleTimer40 = startCycleTimer40;
  window.resetCycleTimer = resetCycleTimer;
  window.calculateBuffEquivalence = calculateBuffEquivalence;
  window.renderBuffEquivalence = renderBuffEquivalence;
  window.SCRE_COUNTER_TRAIT_DEFS = SCRE_COUNTER_TRAIT_DEFS;
  window.findCounterCastles = findCounterCastles;
  window.renderCounterConcierge = renderCounterConcierge;
  window.renderCounterConciergeForStage = renderCounterConciergeForStage;
  window.SCRE_EFFECT_TAG_RULES = SCRE_EFFECT_TAG_RULES;
  window.extractCastleEffectTags = extractCastleEffectTags;
  window.initTagDictionary = initTagDictionary;
  window.computeCastleEvaluationSplit = computeCastleEvaluationSplit;
  window.renderTierViewSplit = renderTierViewSplit;
  window.detectCastleWeaknesses = detectCastleWeaknesses;
  window.calculateCastleWeaknessSynergy = calculateCastleWeaknessSynergy;
  window.renderCastleWeaknessSynergyUI = renderCastleWeaknessSynergyUI;
  window.renderDelibPlanner = renderDelibPlanner;
  window.SCRE_WEAPON_FRAMES = SCRE_WEAPON_FRAMES;
  window.computeFramePreciseDps = computeFramePreciseDps;
  window.renderDetailDpsPrecisionUI = renderDetailDpsPrecisionUI;
  window.initPrompt34Features = initPrompt34Features;

  function getWeaponFrameData(w) {
    const f = SCRE_WEAPON_FRAMES[w];
    if (f) return { ...f, total: f.atk + f.gap };
    return { atk: 25, gap: 25, hits: 1, type: "physical", isEstimate: true, total: 50 };
  }

  function computeWeaponEffectiveFrames(weapon, atkSpeed = 0, gapShorten = 0) {
    const wf = getWeaponFrameData(weapon);
    const effAtk = Math.max(1, Math.round(wf.atk / (1 + atkSpeed / 100)));
    const effGap = Math.max(0, Math.round(wf.gap * (1 - gapShorten / 100)));
    const cycleFrames = effAtk + effGap;
    const cycleTime = cycleFrames > 0 ? (cycleFrames / 30) : 1;
    const attacksPerSec = cycleFrames > 0 ? (30 / cycleFrames) : 1;
    return {
      baseAtk: wf.atk,
      baseGap: wf.gap,
      effAtk,
      effGap,
      cycleFrames,
      cycleTime,
      attacksPerSec,
      isEstimate: !!wf.isEstimate
    };
  }

  function calculateSingleHitDamage({ atk = 1000, targetMult = 1.0, postDmgMult = 1.0, defIgnore = false, targetDef = 0, damageReduction = 0, immuneDefIgnore = false }) {
    const effDef = (defIgnore && !immuneDefIgnore) ? 0 : targetDef;
    const atkWithTarget = Math.floor(atk * targetMult);
    const baseDamage = Math.max(Math.floor(atkWithTarget * 0.1), atkWithTarget - effDef);
    const finalDamage = Math.max(1, Math.floor(baseDamage * postDmgMult * (1.0 - (damageReduction / 100))));
    return {
      baseDamage,
      damage: finalDamage,
      breakdown: `攻${atk} × 倍率${targetMult} - 防${effDef} = ${baseDamage} × 補正${postDmgMult} × 軽減${(1 - damageReduction/100)} = ${finalDamage.toLocaleString()}`
    };
  }

  function computePartyFiringDps(optionsOrParty = {}, argDef, argRed, argCount, argDisabled, argImmune) {
    let targetDef, targetRed, targetCount, disabledBuffs, immuneDefIgnore, targetParty;
    if (Array.isArray(optionsOrParty)) {
      targetParty = optionsOrParty;
      targetDef = typeof argDef === "number" ? argDef : (firingRangeState.targetDef || 500);
      targetRed = typeof argRed === "number" ? argRed : (firingRangeState.targetRed || 0);
      targetCount = typeof argCount === "number" ? argCount : (firingRangeState.targetCount || 1);
      disabledBuffs = argDisabled instanceof Set ? argDisabled : (firingRangeState.disabledBuffs || new Set());
      immuneDefIgnore = Boolean(argImmune);
    } else {
      const opts = optionsOrParty || {};
      targetParty = opts.party || party;
      targetDef = typeof opts.targetDef === "number" ? opts.targetDef : (firingRangeState.targetDef || 500);
      targetRed = typeof opts.damageReduction === "number" ? opts.damageReduction : (firingRangeState.targetRed || 0);
      targetCount = typeof opts.targetCount === "number" ? opts.targetCount : (firingRangeState.targetCount || 1);
      disabledBuffs = opts.disabledBuffs instanceof Set ? opts.disabledBuffs : (firingRangeState.disabledBuffs || new Set());
      immuneDefIgnore = Boolean(opts.immuneDefIgnore);
    }

    const partyCastles = targetParty.map((slot, idx) => ({
      slot,
      castle: slot ? getCastleById(slot.id) : null,
      idx
    })).filter(item => item.castle);

    const customCalcResult = calculateBuffs(targetParty, currentTerrain);

    let totalDps = 0;
    const slotStats = partyCastles.map(item => {
      const st = calculateFiringCastleStats(item.castle, item.slot, targetDef, targetRed, targetCount, disabledBuffs, immuneDefIgnore, customCalcResult);
      totalDps += st.theoreticalDps;
      return {
        castle: item.castle,
        dps: st.theoreticalDps,
        stat: st
      };
    });

    return {
      totalDps,
      slotStats
    };
  }

  window.renderFiringRangeTab = renderFiringRangeTab;
  window.startFiringSimulation = startFiringSimulation;
  window.pauseFiringSimulation = pauseFiringSimulation;
  window.resetFiringSimulation = resetFiringSimulation;
  window.calculateFiringCastleStats = calculateFiringCastleStats;
  window.toggleFiringBuffDisabled = toggleFiringBuffDisabled;
  window.saveFiringSnapshot = saveFiringSnapshot;
  window.deleteFiringSnapshot = deleteFiringSnapshot;
  window.triggerSnapshotComparison = triggerSnapshotComparison;
  window.compareFiringSnapshots = compareFiringSnapshots;
  window.getFiringRangeState = () => firingRangeState;
  window.getWeaponFrameData = getWeaponFrameData;
  window.computeWeaponEffectiveFrames = computeWeaponEffectiveFrames;
  window.calculateSingleHitDamage = calculateSingleHitDamage;
  window.computePartyFiringDps = computePartyFiringDps;

  window.getParty = () => party;
  window.setParty = (p) => {
    party = p;
    if (partyPresets && partyPresets[currentPresetIdx]) {
      partyPresets[currentPresetIdx].party = party;
    }
    renderDashboard();
  };
})();
