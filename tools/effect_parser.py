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
    (r"(?:自身|味方|全城娘|射程内の城娘|部隊の城娘|全ての城娘|対象).*?の?攻撃が(\d+)%上昇", "atkPercent", "percent", False),
    (r"攻撃が(\d+)%上昇\(同種効果(?:と|)重複\)", "atkPercent", "percent", True),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?防御が(\d+)%上昇", "defPercent", "percent", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?射程が(\d+)%上昇", "rangePercent", "percent", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?耐久が(\d+)%上昇", "hpPercent", "percent", False),
    (r"(?:与ダメージ|与ダメ)が(\d+)%上昇", "dmgDealt", "percent", False),
    (r"与えるダメージが(\d+)%上昇", "dmgDealtTarget", "percent", False),
    (r"被ダメージを?(\d+)%軽減", "dmgTakenDown", "percent", False),
    (r"攻撃速度が(\d+)%上昇", "atkSpeed", "percent", False),
    (r"(?:攻撃後の|)隙(?:が|)(\d+)%短縮", "gapShorten", "percent", False),

    # 固定値バフ
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?攻撃が(\d+)上昇", "atkFlat", "flat", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?防御が(\d+)上昇", "defFlat", "flat", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?射程が(\d+)上昇", "rangeFlat", "flat", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?耐久が(\d+)上昇", "hpFlat", "flat", False),
    (r"(?:自身|味方|全城娘|射程内の城娘|対象).*?の?回復が(\d+)上昇", "recoveryFlat", "flat", False),

    # 敵へのデバフ
    (r"(?:敵|射程内の敵).*?の?攻撃が(\d+)%低下", "enemyAtkDown", "percent", False),
    (r"(?:敵|射程内の敵).*?の?防御が(\d+)%低下", "enemyDefDown", "percent", False),
    (r"(?:敵|射程内の敵).*?の?移動速度が(\d+)%低下", "enemySlow", "percent", False),
    (r"(?:敵|射程内の敵).*?の?被ダメージが(\d+)%上昇", "enemyDmgTakenUp", "percent", False),

    # 防御無視
    (r"敵の防御を無視", "defIgnore", "flag", False),
]

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

    # 文で分割
    clauses = re.split(r"[、。&br;]+|\s{2,}", text)
    for c in clauses:
        c = c.strip()
        if not c:
            continue

        # 特殊複合パターンの処理
        m_comb = re.search(r"(?:対象の|自身の|味方の|).*?攻撃と射程が(\d+)上昇", c)
        if m_comb:
            val = int(m_comb.group(1))
            is_self = "自分のみ" in c or "自身のみ" in c
            target = "self" if is_self else "inRange"
            effects.append({
                "source": source_type, "stat": "atkFlat", "mode": "flat", "value": val, "target": target, "stackable": False,
                "raw": f"+{val} {castle_name}・{source_type}"
            })
            effects.append({
                "source": source_type, "stat": "rangeFlat", "mode": "flat", "value": val, "target": target, "stackable": False,
                "raw": f"+{val} {castle_name}・{source_type}"
            })
            continue

        m_comb2 = re.search(r"(?:対象の|自身の|味方の|).*?攻撃と防御が(\d+)上昇", c)
        if m_comb2:
            val = int(m_comb2.group(1))
            is_self = "自分のみ" in c or "自身のみ" in c
            target = "self" if is_self else "inRange"
            effects.append({
                "source": source_type, "stat": "atkFlat", "mode": "flat", "value": val, "target": target, "stackable": False,
                "raw": f"+{val} {castle_name}・{source_type}"
            })
            effects.append({
                "source": source_type, "stat": "defFlat", "mode": "flat", "value": val, "target": target, "stackable": False,
                "raw": f"+{val} {castle_name}・{source_type}"
            })
            continue

        # 倍率パターンの換算 (1.5倍 -> 攻撃+50%)
        m_mult = re.search(r"(?:対象の|自身の|味方の|).*?(攻撃|防御|射程)が(\d+(?:\.\d+)?)倍", c)
        if m_mult:
            stat_name = m_mult.group(1)
            mult_val = float(m_mult.group(2))
            perc = int(round((mult_val - 1.0) * 100))
            stat_key = "atkPercent" if stat_name == "攻撃" else "defPercent" if stat_name == "防御" else "rangePercent"
            is_self = "自分のみ" in c or "自身のみ" in c
            target = "self" if is_self else "inRange"
            effects.append({
                "source": source_type, "stat": stat_key, "mode": "percent", "value": perc, "target": target, "stackable": False,
                "raw": f"+{perc}%({mult_val}倍) {castle_name}・{source_type}"
            })
            continue

        m_mult_both = re.search(r"(?:対象の|自身の|味方の|).*?攻撃と防御が(\d+(?:\.\d+)?)倍", c)
        if m_mult_both:
            mult_val = float(m_mult_both.group(1))
            perc = int(round((mult_val - 1.0) * 100))
            is_self = "自分のみ" in c or "自身のみ" in c
            target = "self" if is_self else "inRange"
            effects.append({
                "source": source_type, "stat": "atkPercent", "mode": "percent", "value": perc, "target": target, "stackable": False,
                "raw": f"+{perc}%({mult_val}倍) {castle_name}・{source_type}"
            })
            effects.append({
                "source": source_type, "stat": "defPercent", "mode": "percent", "value": perc, "target": target, "stackable": False,
                "raw": f"+{perc}%({mult_val}倍) {castle_name}・{source_type}"
            })
            continue

        for item in STAT_PATTERNS:
            if len(item) == 4:
                pat, stat_key, mode, stackable = item
            else:
                continue
            m = re.search(pat, c)
            if m:
                val = 1 if mode == "flag" else float(m.group(1)) if "." in m.group(1) else int(m.group(1))
                is_self = "自分のみ" in c or "自身のみ" in c or "自身が" in c or "自身の" in c
                target = "self" if is_self else "all" if "全" in c else "inRange"
                raw_label = f"+{val}{'%' if mode == 'percent' else ''} {castle_name}・{source_type}"
                if stackable:
                    raw_label += "（重複）"
                effects.append({
                    "source": source_type,
                    "stat": stat_key,
                    "mode": mode,
                    "value": val,
                    "target": target,
                    "stackable": stackable,
                    "raw": raw_label
                })
                break
    return effects
