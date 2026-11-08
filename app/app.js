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

  function normalizeParty(rawParty) {
    if (!Array.isArray(rawParty)) return [];
    const valid = [];
    const seenIds = new Set();
    for (const item of rawParty) {
      if (!item || typeof item !== "object") continue;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      valid.push({
        id,
        strategyOn: item.strategyOn !== undefined ? Boolean(item.strategyOn) : true,
        specialOn: item.specialOn !== undefined ? Boolean(item.specialOn) : false
      });
      if (valid.length >= 8) break;
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
        const party = normalizeParty(p.party);
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
    party = normalizeParty(party);
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
      party: existing.party || (newStatus ? party.map(s => s.id).filter(Boolean) : []),
      savedAt: new Date().toISOString()
    };
    saveStageProgressData(data);
    renderGuidesTab();
  }

  function savePartyForStage(stageTitle) {
    const canonical = canonicalStageTitle(stageTitle);
    const data = getStageProgressData();
    const partyIds = party.map(s => s.id).filter(Boolean);
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
    if (typeof renderChallengeUI === "function") renderChallengeUI();
    if (typeof renderDamageChecker === "function") renderDamageChecker(calcResult);
    if (typeof renderRomanSimulator === "function") renderRomanSimulator();
  }

  // 1. Render Party Slots (Showing dynamic live stats & Terrain Matching)
  function renderPartyTab(calcResult) {
    if (!calcResult) calcResult = calculateBuffs();
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
      pushUndoSnapshot();
      party.push({ id, strategyOn: true, specialOn: false });
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

  // Slot selection & castle placement logic (Prompt 26 指摘1: 要素消失バグ解消・安全なスロット移動)
  function selectCastleForSlot(c, targetSlotIndex = null) {
    pushUndoSnapshot();
    const existingIdx = party.findIndex(p => p && p.id === c.id);
    const newMember = { id: c.id, strategyOn: true, specialOn: !!c.special };

    if (existingIdx !== -1) {
      // Already in party: move/reorder to target slot without losing any other member
      const [itemMember] = party.splice(existingIdx, 1);
      const memberToPlace = itemMember || newMember;
      const targetIdx = (targetSlotIndex !== null) ? Math.min(targetSlotIndex, party.length) : party.length;
      party.splice(targetIdx, 0, memberToPlace);
    } else {
      // New castle
      if (targetSlotIndex !== null && targetSlotIndex < party.length) {
        party[targetSlotIndex] = newMember;
      } else if (party.length < 8) {
        party.push(newMember);
      }
    }
    party = normalizeParty(party);
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
    pushUndoSnapshot();
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
      p: party.map(s => ({
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
      // 鎌武器種は大破特技（全段階で特技テーブル内に存在）が特技と並行して実働するため、activeStageの全スキルを連結
      const activeSkills = (c.weapon === "鎌" && c.allSkills && c.allSkills.length > 0)
        ? c.allSkills.filter(s => s.stage === activeStage)
        : (sk ? [sk] : []);
      const sk_text = activeSkills.map(s => (s.name || "") + " " + (s.text || "")).join(" ");
      const st_text = activeStrats.map(s => (s.name || "") + " " + (s.text || "")).join(" ");
      const sp_text = sp ? ((sp.name || "") + " " + (sp.text || "")) : "";
      const all_text = [sk_text, st_text, sp_text].filter(Boolean).join(" ");

      activeSkills.forEach(s => addEffects(s.effects, (s.name || "") + " " + (s.text || "")));
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
        if (c.weapon === "陣貝") {
          atkMultScore += parseFloat(multMatch[1]) * 6.0; // 陣貝の自己攻撃倍率は鼓舞加算値を直結倍化する最重要要素
        }
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
        if (/効果時間無限|永続/.test(all_text)) stratRaw += 3.0; // 永続・効果時間無限計略の常時稼働加点
        if (/複数の計略を切り替え/.test(all_text) || (c.allStrategies && c.allStrategies.length >= 3)) stratRaw += 2.0; // 複数計略切替の高い戦術汎用性
        if (hasSpecial) stratRaw += 3.0;
        if (hasToken) stratRaw += 3.0;
      }
      if (c.weapon === "陣貝") {
        // 陣貝は常時鼓舞オーラを持つため、計略所持時でも陣貝ベースライン効力（8.0*kobuRatio）を下回らない
        const kobuRatio = Math.min(1.0, Math.max(0.5, (kobuPct || 50) / 60.0));
        stratRaw = Math.max(stratRaw, 8.0 * kobuRatio);
      }
      if (!activeAbility && !hasSpecial && c.weapon !== "陣貝") {
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
      const override = tierOverrides[item.id] || tierOverrides[item.name];
      let effectiveTier = override;
      if (!effectiveTier) {
        if (autoTierScope === "role") effectiveTier = item.roleTier;
        else if (autoTierScope === "weapon") effectiveTier = item.weaponTier;
        else effectiveTier = item.overallTier;
      }
      if (tierGroups[effectiveTier]) {
        tierGroups[effectiveTier].push({ ...item, isOverridden: Boolean(override), effectiveTier });
      } else {
        tierGroups["D"].push({ ...item, isOverridden: Boolean(override), effectiveTier: "D" });
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

  function renderTierTab() {
    loadSavedCustomTiers();
    loadTierWeights();
    loadTierOverrides();

    const btnAuto = document.getElementById("btnTierModeAuto");
    const btnCurated = document.getElementById("btnTierModeCurated");
    const btnCustom = document.getElementById("btnTierModeCustom");
    const viewAuto = document.getElementById("tierViewAuto");
    const viewCurated = document.getElementById("tierViewCurated");
    const viewCustom = document.getElementById("tierViewCustom");

    if (btnAuto) btnAuto.classList.toggle("active", currentTierMode === "auto");
    if (btnCurated) btnCurated.classList.toggle("active", currentTierMode === "curated");
    if (btnCustom) btnCustom.classList.toggle("active", currentTierMode === "custom");

    if (currentTierMode === "auto") {
      if (viewAuto) viewAuto.style.display = "block";
      if (viewCurated) viewCurated.style.display = "none";
      if (viewCustom) viewCustom.style.display = "none";
      renderTierAuto();
    } else if (currentTierMode === "curated") {
      if (viewAuto) viewAuto.style.display = "none";
      if (viewCurated) viewCurated.style.display = "block";
      if (viewCustom) viewCustom.style.display = "none";
      renderTierCurated();
    } else {
      if (viewAuto) viewAuto.style.display = "none";
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

        const inParty = party.some(p => p.id === c.id);
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
              <button class="btn btn-sm ${inParty ? 'btn-secondary' : 'btn-primary'} tier-btn-xs" data-action="add-party" data-id="${c.id}" ${inParty ? 'disabled' : (party.length >= 8 ? 'disabled' : '')} style="font-size:10px; padding:2px 7px;">
                ${inParty ? '✓ 編成中' : (party.length >= 8 ? '満員' : '+ 編成')}
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
            if (party.length >= 8) {
              showToast("部隊が満員です（最大8体）");
              return;
            }
            if (!party.some(p => p.id === c.id)) {
              party.push({ id: c.id, strategyOn: true, specialOn: !!c.special });
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
  const btnTierCurated = document.getElementById("btnTierModeCurated");
  const btnTierCustom = document.getElementById("btnTierModeCustom");

  if (btnTierAuto) {
    btnTierAuto.addEventListener("click", () => {
      currentTierMode = "auto";
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

  // Enemy Effective DEF
  const isMagicOrIgnore = (mainCastle.weapon === "杖" || mainCastle.weapon === "鈴" || mainCastle.weapon === "投剣");
  const hasDefIgnoreSkill = calcData && calcData.buffs && calcData.buffs.defIgnore && calcData.buffs.defIgnore.length > 0;
  const defDownPerc = calcResult.enemyDebuffs?.enemyDefDown?.max || 0;
  let effDef = Math.max(0, Math.floor(enemyDef * (1.0 - defDownPerc / 100)));
  const effectiveIgnore = isMagicOrIgnore || hasDefIgnoreSkill;
  if (effectiveIgnore) {
    effDef = 0;
  }

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

    // Check defense ignore: 杖, 投剣, 鈴, or skills
    const isMagicOrIgnore = (c.weapon === "杖" || c.weapon === "鈴" || c.weapon === "投剣");
    const hasDefIgnoreSkill = !!(calcData && calcData.buffs && calcData.buffs.defIgnore && calcData.buffs.defIgnore.length > 0);
    const effectiveIgnore = !immuneDefIgnore && (isMagicOrIgnore || hasDefIgnoreSkill);

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
  const inParty = party.some(p => p.id === c.id);

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
    if (party.length >= 8) {
      alert("編成枠がいっぱいです (最大8体)。空き枠を作ってください。");
      return;
    }
    party.push({ id: castleId, strategyOn: true, specialOn: true });
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
  window.getParty = () => party;
  window.setParty = (p) => {
    party = p;
    if (partyPresets && partyPresets[currentPresetIdx]) {
      partyPresets[currentPresetIdx].party = party;
    }
    renderDashboard();
  };
})();
