"""Enhanced Effect parser for Castle skills/strategies with multiplier and combo patterns."""
import re

STAT_PATTERNS = [
    # 倍率バフ (「攻撃が1.5倍」→ 攻撃+50%として換算、または独自mult扱い)
    (r"(?:対象の|自身の|味方の|全城娘の|).*?攻撃と防御が(\d+(?:\.\d+)?)倍", "atk_def_mult"),
    (r"(?:対象の|自身の|味方の|全城娘の|).*?攻撃が(\d+(?:\.\d+)?)倍", "atk_mult"),
    (r"(?:対象の|自身の|味方の|全城娘の|).*?防御が(\d+(?:\.\d+)?)倍", "def_mult"),
    (r"(?:対象の|自身の|味方の|全城娘の|).*?射程が(\d+(?:\.\d+)?)倍", "range_mult"),

    # 連動固定値 (「攻撃と射程が80上昇」など)
    (r"(?:対象の|自身の|味方の|全城娘の|).*?攻撃と射程が(\d+)上昇", "atk_range_flat"),
    (r"(?:対象の|自身の|味方の|全城娘の|).*?攻撃と防御が(\d+)上昇", "atk_def_flat"),

    # 割合バフ
    (r"(?:自身|味方|全城娘|射程内の城娘|部隊の城娘|全ての城娘|対象).*?の?攻撃(?:が)?(\d+)%上昇", "atkPercent", "percent", False),
    (r"攻撃が(\d+)%上昇\(同種効果(?:と|)重複\)", "atkPercent", "percent", True),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?防御が(\d+)%上昇", "defPercent", "percent", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?射程が(\d+)%上昇", "rangePercent", "percent", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?耐久(?:が)?(\d+)%上昇", "hpPercent", "percent", False),
    (r"^耐久(\d+)%上昇", "hpPercent", "percent", False),
    (r"(?:与ダメージ|与ダメ)が(\d+)%上昇", "dmgDealt", "percent", False),
    (r"被ダメージを?(\d+)%軽減", "dmgTakenDown", "percent", False),
    (r"攻撃速度が(\d+)%上昇", "atkSpeed", "percent", False),
    (r"(?:攻撃後の|)隙(?:が|)(\d+)%短縮", "gapShorten", "percent", False),

    # 固定値バフ
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?攻撃が(\d+)上昇", "atkFlat", "flat", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?防御が(\d+)上昇", "defFlat", "flat", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?射程(?:が)?(\d+)上昇", "rangeFlat", "flat", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?耐久が(\d+)上昇", "hpFlat", "flat", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?回復が(\d+)上昇", "recoveryFlat", "flat", False),

    # 敵へのデバフ
    (r"(?:敵|射程内の敵).*?の?攻撃が(\d+)%低下", "enemyAtkDown", "percent", False),
    (r"(?:敵|射程内の敵).*?の?防御(?:が)?\s*(\d+)%低下", "enemyDefDown", "percent", False),
    (r"(?:敵|射程内の敵).*?の?防御と射程が(\d+)%低下", "enemyDefDown", "percent", False),
    (r"(?:敵|射程内の敵).*?の?移動速度(?:が)?(\d+)%低下", "enemySlow", "percent", False),
    (r"(?:敵|射程内の敵).*?の?移動速度を少しの間(\d+)%低下", "enemySlow", "percent", False),
    (r"(?:敵|射程内の敵).*?の?移動速度/与ダメージ(\d+)%低下", "enemySlow", "percent", False),
    (r"(?:敵|射程内の敵).*?の?被ダメージが(\d+)%上昇", "enemyDmgTakenUp", "percent", False),

    # 防御無視
    (r"敵の防御を無視", "defIgnore", "flag", False),
]

def parse_dmg_target_clause(c: str, castle_name: str, source_type: str, prev_clause: str = "") -> tuple[dict | None, str]:
    """Accurately capture '与えるダメージ' and '攻撃がX倍のダメージ' multiplier/percent patterns (Prompt 13/69)."""
    m_atk_dmg = re.search(r'攻撃が\s*(\d+(?:\.\d+)?)倍の?\s*ダメージ', c)
    m_pos = re.search(r'与える\s*ダメージ', c)

    if not m_pos and not m_atk_dmg:
        return None, c

    if m_pos:
        # Condition extraction from phrase immediately preceding 与えるダメージ (handling Wiki line-break spaces without truncating multi-word conditions)
        pre = c[:m_pos.start()].strip()
        if not pre and prev_clause:
            pre = prev_clause.strip()
        pre_clean = re.sub(r'\s+', '', pre)
        # 同一文節内の先行効果文（〜上昇/軽減/低下/短縮/X回復/無効/無視する/配置/倍 等）の末尾で区切り、直前の条件句全体を残す
        # ただし直後に「が/の/を/と」が続く名詞形や条件句先頭の「回復が...」は切り落とさない
        ends = list(re.finditer(r'(?:上昇|軽減|低下|短縮|\d+%?回復|を回復|無効|無視する|無視|行う|増加|狙われない|防ぐ|受ける|与える|得る|配置|\d+(?:\.\d+)?倍)(?:\([^)]*\))?(?![がのをと])', pre_clean))
        if ends:
            pre_clean = pre_clean[ends[-1].end():]

        cond = None
        if pre_clean:
            cand = re.sub(r'(?:に対して|に対し|に|で|の時|の場合|場合)$', '', pre_clean).strip()
            cand = re.sub(r'の場合敵$', '', cand).strip()
            cand = re.sub(r'(?:[のをが]|(?<!ご)と)$', '', cand).strip()
            cand = re.sub(r'^\d+秒間(?:対象が|対象の|自身の|自身)?', '', cand).strip()
            if cand and any(k in cand for k in ['敵', '妖怪', '飛行', '海洋', '兜', '耐久', '防御', '攻撃', '回復', '移動速度', '以上', '以下', '未満', '最大', '最小', '状態', '属性', '対象', '回数', '毎']):
                # もし単なる無条件主語（「対象」「自身」「味方」「〜の攻撃」等）のみなら条件として扱わない
                if cand not in ('攻撃', '自身の攻撃', '対象の攻撃', '攻撃速度', '特殊攻撃', '範囲攻撃', '対象', '自身', '味方'):
                    cond = cand

        c_after = re.sub(r'\s+', '', c[m_pos.start():])
        m_mult = re.search(r'与えるダメージ(?:が)?(?:約)?(\d+(?:\.\d+)?)倍', c_after)
        m_perc = re.search(r'与えるダメージ(?:が)?(\d+)%上昇', c_after)
        if not m_mult and not m_perc:
            m_perc2 = re.search(r'与えるダメージ(?:が)?(\d+)%', c_after)
            if m_perc2:
                m_perc = m_perc2

        if not m_mult and not m_perc:
            return None, c

        if m_mult:
            mult_val = float(m_mult.group(1))
            perc_val = int(round((mult_val - 1.0) * 100))
            label_val = f"+{perc_val}%({mult_val}倍)"
        else:
            perc_val = int(m_perc.group(1))
            mult_val = round(1.0 + perc_val / 100.0, 2)
            label_val = f"+{perc_val}%"

        m_group = re.search(r'(?:全|全ての)\[([^\]]+)\]', pre)
        is_self = "自分のみ" in c or "自身のみ" in c or "自身が" in c or "自身の" in c or "自身" in c
        if m_group:
            target = "self"
            grp_name = m_group.group(1)
            if not cond:
                cond = f"対象限定: [{grp_name}]"
        elif "全" in pre or "全城娘" in c or "味方" in pre:
            target = "all"
        elif "射程内" in pre or "射程内" in c:
            target = "inRange"
        elif is_self:
            target = "self"
        else:
            target = "self"

        raw_label = f"{label_val} {castle_name}・{source_type}"
        if cond:
            raw_label = f"{label_val} [{cond}] {castle_name}・{source_type}"

        res = {
            "source": source_type,
            "stat": "dmgDealtTarget",
            "mode": "percent",
            "value": perc_val,
            "multiplier": mult_val,
            "target": target,
            "stackable": True,
            "raw": raw_label
        }
        if m_group:
            res["targetGroup"] = m_group.group(1)
        if cond:
            res["condition"] = cond
        c_rest = re.sub(r'与える\s*ダメージ(?:が)?(?:約)?\d+(?:\.\d+)?倍|与える\s*ダメージ(?:が)?\d+%(?:上昇)?', ' ', c, count=1)
        return res, c_rest

    # 「攻撃がX倍のダメージ」パターン (［正月］江戸城、［肝試し］姫路城、アニ・レオンハート等)
    mult_val = float(m_atk_dmg.group(1))
    perc_val = int(round((mult_val - 1.0) * 100))
    res = {
        "source": source_type,
        "stat": "dmgDealtTarget",
        "mode": "percent",
        "value": perc_val,
        "multiplier": mult_val,
        "target": "self",
        "stackable": True,
        "raw": f"+{perc_val}%({mult_val}倍) {castle_name}・{source_type}"
    }
    c_rest = c[:m_atk_dmg.start()] + ' ' + c[m_atk_dmg.end():]
    return res, c_rest

def parse_ability_effects(text: str, source_type: str, castle_name: str) -> list[dict]:
    effects = []
    if not text:
        return effects

    # ステータス加算/共有 (鼓舞・陣貝)
    share_match = re.search(r"自身の(攻撃|防御|射程)の(\d+(?:\.\d+)?)%の値を.*?(?:加算|共有)", text)
    if share_match:
        stat_name = share_match.group(1)
        val = float(share_match.group(2))
        stat_key = "shareAtk" if stat_name == "攻撃" else "shareDef" if stat_name == "防御" else "shareRange"
        effects.append({
            "source": source_type,
            "stat": stat_key,
            "mode": "share",
            "value": val,
            "shareSource": castle_name,
            "raw": f"+ ({castle_name}の{stat_name}の{val}%) {castle_name}・{source_type}"
        })

    # 文で分割（半角読点 ､ も含む）
    clauses = re.split(r"[、､。&br;]+|\s{2,}", text)
    prev_clause = ""
    for c in clauses:
        c = c.strip()
        if not c:
            continue
        saved_prev = prev_clause
        prev_clause = c
        is_on_hit = ("被攻撃時" in c) or ("被攻撃時" in saved_prev)
        c_work = c
        clause_added = set()

        def add_eff(eff):
            key = (eff["stat"], eff["value"], eff.get("condition", ""))
            if key not in clause_added:
                clause_added.add(key)
                effects.append(eff)

        # 特殊複合パターンの処理
        m_comb = re.search(r"攻撃と射程が(\d+)上昇", c_work)
        if m_comb:
            val = int(m_comb.group(1))
            is_self = "自分のみ" in c or "自身のみ" in c
            target = "self" if is_self else "inRange"
            add_eff({"source": source_type, "stat": "atkFlat", "mode": "flat", "value": val, "target": target, "stackable": False, "raw": f"+{val} {castle_name}・{source_type}"})
            add_eff({"source": source_type, "stat": "rangeFlat", "mode": "flat", "value": val, "target": target, "stackable": False, "raw": f"+{val} {castle_name}・{source_type}"})
            c_work = c_work[:m_comb.start()] + " " + c_work[m_comb.end():]

        m_comb2 = re.search(r"攻撃と防御が(\d+)上昇", c_work)
        if m_comb2:
            val = int(m_comb2.group(1))
            is_self = "自分のみ" in c or "自身のみ" in c
            target = "self" if is_self else "inRange"
            add_eff({"source": source_type, "stat": "atkFlat", "mode": "flat", "value": val, "target": target, "stackable": False, "raw": f"+{val} {castle_name}・{source_type}"})
            add_eff({"source": source_type, "stat": "defFlat", "mode": "flat", "value": val, "target": target, "stackable": False, "raw": f"+{val} {castle_name}・{source_type}"})
            c_work = c_work[:m_comb2.start()] + " " + c_work[m_comb2.end():]

        # 大宰府特技等: 耐久/攻撃/攻撃速度X%上昇、耐久と攻撃をX%上昇
        m_hp_atk_spd = re.search(r"自身の耐久/攻撃/攻撃速度(\d+)%上昇", c_work)
        if m_hp_atk_spd:
            val = int(m_hp_atk_spd.group(1))
            stk = "効果重複" in c
            for sk in ("hpPercent", "atkPercent", "atkSpeed"):
                add_eff({"source": source_type, "stat": sk, "mode": "percent", "value": val, "target": "self", "stackable": stk, "raw": f"+{val}% {castle_name}・{source_type}" + ("（重複）" if stk else "")})
            c_work = c_work[:m_hp_atk_spd.start()] + " " + c_work[m_hp_atk_spd.end():]

        m_hp_atk = re.search(r"自身の耐久と攻撃を(\d+)%上昇", c_work)
        if m_hp_atk:
            val = int(m_hp_atk.group(1))
            stk = "効果重複" in c
            for sk in ("hpPercent", "atkPercent"):
                add_eff({"source": source_type, "stat": sk, "mode": "percent", "value": val, "target": "self", "stackable": stk, "raw": f"+{val}% {castle_name}・{source_type}" + ("（重複）" if stk else "")})
            c_work = c_work[:m_hp_atk.start()] + " " + c_work[m_hp_atk.end():]

        # 佐和山城特殊能力等: 射程/回復X倍
        m_range_rec = re.search(r"射程/回復(?:が)?\s*(\d+(?:\.\d+)?)倍", c_work)
        if m_range_rec:
            mult_val = float(m_range_rec.group(1))
            perc = int(round((mult_val - 1.0) * 100))
            is_self = "自分のみ" in c or "自身のみ" in c or "自身の" in c
            target = "self" if is_self else "inRange"
            add_eff({"source": source_type, "stat": "rangePercent", "mode": "percent", "value": perc, "target": target, "stackable": "効果重複" in c, "raw": f"+{perc}%({mult_val}倍) {castle_name}・{source_type}"})
            c_work = c_work[:m_range_rec.start()] + " " + c_work[m_range_rec.end():]

        # 与えるダメージ（倍率・%・条件付き）および「攻撃がX倍のダメージ」の捕捉 (Prompt 13/69)
        dmg_target_eff, c_work = parse_dmg_target_clause(c_work, castle_name, source_type, saved_prev)
        if dmg_target_eff:
            add_eff(dmg_target_eff)

        # 攻撃と防御がX倍
        m_mult_both = re.search(r"攻撃と防御が(\d+(?:\.\d+)?)倍", c_work)
        if m_mult_both:
            mult_val = float(m_mult_both.group(1))
            perc = int(round((mult_val - 1.0) * 100))
            is_self = "自分のみ" in c or "自身のみ" in c
            target = "self" if is_self else "inRange"
            add_eff({"source": source_type, "stat": "atkPercent", "mode": "percent", "value": perc, "target": target, "stackable": False, "raw": f"+{perc}%({mult_val}倍) {castle_name}・{source_type}"})
            add_eff({"source": source_type, "stat": "defPercent", "mode": "percent", "value": perc, "target": target, "stackable": False, "raw": f"+{perc}%({mult_val}倍) {castle_name}・{source_type}"})
            c_work = c_work[:m_mult_both.start()] + " " + c_work[m_mult_both.end():]

        # 倍率パターンの換算 (1.5倍 -> 攻撃+50%) ※同一文節内に複数ある場合も全て抽出
        while True:
            m_mult = re.search(r"(攻撃|防御|射程)(?:が)?\s*(\d+(?:\.\d+)?)倍(?!の?(?:ダメージ|攻撃))", c_work)
            if not m_mult:
                break
            stat_name = m_mult.group(1)
            mult_val = float(m_mult.group(2))
            perc = int(round((mult_val - 1.0) * 100))
            stat_key = "atkPercent" if stat_name == "攻撃" else "defPercent" if stat_name == "防御" else "rangePercent"
            is_self = "自分のみ" in c or "自身のみ" in c or "自分のみ)" in text or "自分のみ）" in text
            target = "self" if is_self else "inRange"
            eff = {"source": source_type, "stat": stat_key, "mode": "percent", "value": perc, "target": target, "stackable": False, "raw": f"+{perc}%({mult_val}倍) {castle_name}・{source_type}"}
            if "飛行敵に対して" in c:
                eff["condition"] = "飛行敵に対して"
                eff["raw"] = f"+{perc}%({mult_val}倍) [対空] {castle_name}・{source_type}"
            add_eff(eff)
            c_work = c_work[:m_mult.start()] + " " + c_work[m_mult.end():]

        # 佐和山城特技等: 与ダメX% (単独)
        if re.search(r"与ダメ\d+%", c_work) and "上昇" not in c_work and "軽減" not in c_work and "低下" not in c_work:
            m_yd = re.search(r"与ダメ(\d+)%", c_work)
            if m_yd:
                val = int(m_yd.group(1))
                add_eff({"source": source_type, "stat": "dmgDealt", "mode": "percent", "value": val, "target": "self", "stackable": False, "raw": f"+{val}% {castle_name}・{source_type}"})
                c_work = c_work[:m_yd.start()] + " " + c_work[m_yd.end():]

        # STAT_PATTERNS（同一文節内の複数効果も全て抽出）
        for item in STAT_PATTERNS:
            if len(item) != 4:
                continue
            pat, stat_key, mode, stackable = item
            m = re.search(pat, c_work)
            if m:
                val = 1 if mode == "flag" else float(m.group(1)) if "." in m.group(1) else int(m.group(1))
                if stat_key.startswith("enemy"):
                    target = "all" if ("全" in c or "全て" in c) else "inRange"
                else:
                    is_self = "自分のみ" in c or "自身のみ" in c or "自身が" in c or "自身の" in c
                    target = "self" if is_self else "all" if "全" in c else "inRange"
                raw_label = f"+{val}{'%' if mode == 'percent' else ''} {castle_name}・{source_type}"
                if stackable:
                    raw_label += "（重複）"
                eff = {
                    "source": source_type,
                    "stat": stat_key,
                    "mode": mode,
                    "value": val,
                    "target": target,
                    "stackable": stackable,
                    "raw": raw_label
                }
                if is_on_hit and stat_key == "atkPercent":
                    eff["condition"] = "被攻撃時"
                    eff["raw"] = f"+{val}% [被攻撃時] {castle_name}・{source_type}"
                add_eff(eff)
                c_work = c_work[:m.start()] + " " + c_work[m.end():]

        m_slow_temp = re.search(r"(?:敵|射程内の敵).*?の?移動速度を少しの間(\d+)%低下", c)
        if m_slow_temp:
            val = int(m_slow_temp.group(1))
            add_eff({"source": source_type, "stat": "enemySlow", "mode": "percent", "value": val, "target": "inRange", "stackable": False, "raw": f"+{val}% {castle_name}・{source_type}"})
    return effects
