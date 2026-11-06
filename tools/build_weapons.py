"""Parser for Castle weapons across all 25 weapon types from scre.swiki.jp cache."""
import html
import json
import re
import sys
from pathlib import Path

# Force UTF-8 stdout
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

TOOLS_DIR = Path(__file__).resolve().parent
ROOT = TOOLS_DIR.parent
CACHE_RAW = TOOLS_DIR / "cache" / "raw"
OUTPUT_JS = ROOT / "app" / "weapons_data.js"

sys.path.insert(0, str(TOOLS_DIR))
from common import fetch_source

WEAPON_TYPES = [
    '刀', '槍', '槌', '盾', '拳', '投剣', '鞭', '弓', '石弓', '鉄砲', '大砲', 
    '歌舞', '法術', '鈴', '杖', '祓串', '本', '陣貝', '鎌', '戦棍', '双剣', 
    '軍船', 'ランス', '茶器', 'その他'
]

def clean_wiki_text(text: str) -> str:
    if not text:
        return ""
    text = text.replace("&br;", " ")
    text = re.sub(r'\[\[([^\]]+?)\]\]', lambda m: m.group(1).split('>')[-1], text)
    text = re.sub(r'&color\([^)]*\)\{([^}]*)\}', r'\1', text)
    text = re.sub(r'BGCOLOR\([^)]*\):', '', text)
    text = re.sub(r'CENTER:', '', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\'\'', '', text)
    text = re.sub(r'\s+', ' ', text)
    return html.unescape(text).strip()

def parse_int_safe(val_str: str) -> int | None:
    if not val_str:
        return None
    cleaned = clean_wiki_text(val_str).replace('+', '').strip()
    m = re.search(r'^-?\d+', cleaned)
    if m:
        try:
            return int(m.group(0))
        except ValueError:
            return None
    return None

def parse_weapons_for_type(wt: str) -> list[dict]:
    fpath = CACHE_RAW / f"{wt}.txt"
    if not fpath.exists():
        src = fetch_source(wt)
    else:
        src = fpath.read_text(encoding="utf-8")

    if not src:
        return []

    lines = src.splitlines()
    weapons = []
    
    col_map = {}
    in_table = False

    for line in lines:
        line_s = line.strip()
        if not line_s.startswith('|'):
            if line_s.startswith('}}') or line_s.startswith('*'):
                col_map = {}
                in_table = False
            continue

        parts = [p.strip() for p in line_s.split('|')]
        # Drop leading and trailing empty elements from split('|')
        if len(parts) >= 2 and parts[0] == "":
            parts = parts[1:]
        if len(parts) >= 1 and parts[-1] == "":
            parts = parts[:-1]

        # Check for header row
        if any('名称' in p for p in parts) and any('攻撃' in p for p in parts):
            col_map = {}
            for idx, p in enumerate(parts):
                cp = clean_wiki_text(p).replace('~', '')
                if '★' in cp or 'レア' in cp:
                    col_map['rarity'] = idx
                elif cp == '名称':
                    col_map['name'] = idx
                elif cp == '攻撃':
                    col_map['atk'] = idx
                elif cp == '防御':
                    col_map['def'] = idx
                elif '特殊効果' in cp or '効果' in cp:
                    if 'kai_effect' not in col_map and 'effect' in col_map:
                        col_map['kai_effect'] = idx
                    else:
                        col_map['effect'] = idx
                elif '[改]攻撃' in cp or '改攻撃' in cp:
                    col_map['kai_atk'] = idx
                elif '[改]防御' in cp or '改防御' in cp:
                    col_map['kai_def'] = idx
                elif '[改]特殊効果' in cp or '改特殊効果' in cp:
                    col_map['kai_effect'] = idx
            in_table = True
            continue

        # Ignore formatting rows like |CENTER:10|120|...|c or |h or |f
        if any(p.endswith('c') or p.endswith('h') or p.endswith('f') for p in parts[-1:]):
            continue
        if any('CENTER:' in p or 'BGCOLOR(' in p and len(p) < 15 for p in parts[:3]):
            if not any(c.isdigit() for p in parts[:2] for c in p):
                continue

        if not col_map or 'name' not in col_map:
            continue

        name_idx = col_map.get('name')
        if name_idx >= len(parts):
            continue
        raw_name = clean_wiki_text(parts[name_idx])
        if not raw_name or raw_name == '名称' or raw_name.startswith('---'):
            continue

        # Extract rarity
        rarity = None
        if 'rarity' in col_map and col_map['rarity'] < len(parts):
            r_str = clean_wiki_text(parts[col_map['rarity']])
            m_r = re.search(r'\d+', r_str)
            if m_r:
                rarity = int(m_r.group(0))

        # Base ATK
        atk = None
        if 'atk' in col_map and col_map['atk'] < len(parts):
            atk = parse_int_safe(parts[col_map['atk']])

        # Base DEF (for shields / lances)
        defense = None
        if 'def' in col_map and col_map['def'] < len(parts):
            defense = parse_int_safe(parts[col_map['def']])

        # Base effectText
        effect_text = ""
        if 'effect' in col_map and col_map['effect'] < len(parts):
            effect_text = clean_wiki_text(parts[col_map['effect']])

        # Add base weapon
        base_item = {
            "name": raw_name,
            "type": wt,
            "rarity": rarity,
            "atk": atk,
            "effectText": effect_text,
            "source": wt
        }
        if defense is not None:
            base_item["def"] = defense
        weapons.append(base_item)

        # Kai (Upgraded) weapon
        has_kai_atk = 'kai_atk' in col_map and col_map['kai_atk'] < len(parts) and parts[col_map['kai_atk']].strip()
        has_kai_eff = 'kai_effect' in col_map and col_map['kai_effect'] < len(parts) and parts[col_map['kai_effect']].strip()
        if has_kai_atk or has_kai_eff:
            kai_atk = parse_int_safe(parts[col_map['kai_atk']]) if has_kai_atk else atk
            kai_eff = clean_wiki_text(parts[col_map['kai_effect']]) if has_kai_eff else effect_text
            kai_name = raw_name if raw_name.endswith('[改]') else f"{raw_name}[改]"
            kai_item = {
                "name": kai_name,
                "type": wt,
                "rarity": (rarity + 1) if (rarity and rarity < 5) else rarity,
                "atk": kai_atk,
                "effectText": kai_eff,
                "source": wt
            }
            if 'kai_def' in col_map and col_map['kai_def'] < len(parts):
                kdef = parse_int_safe(parts[col_map['kai_def']])
                if kdef is not None:
                    kai_item["def"] = kdef
            weapons.append(kai_item)

    return weapons

def main():
    all_weapons = []
    stats_by_type = {}
    missing_atk_count = 0

    print("Building weapons data for all 25 weapon types...")
    for wt in WEAPON_TYPES:
        w_list = parse_weapons_for_type(wt)
        # Deduplicate by name + type
        seen = set()
        deduped = []
        for w in w_list:
            key = (w["name"], w["type"])
            if key not in seen:
                seen.add(key)
                deduped.append(w)
                if w["atk"] is None:
                    missing_atk_count += 1
        all_weapons.extend(deduped)
        stats_by_type[wt] = len(deduped)

    # Sort by type then by atk descending, then name
    all_weapons.sort(key=lambda w: (w["type"], -(w["atk"] or 0), w["name"]))

    print(f"Total weapons extracted: {len(all_weapons)}")
    print(f"Weapons with missing/unspecified ATK: {missing_atk_count}")
    print("Weapon count by type:")
    for wt, count in stats_by_type.items():
        print(f"  {wt}: {count}")

    # Output to app/weapons_data.js
    js_content = "// Generated weapons data for scre-helper\n"
    js_content += "window.SCRE_WEAPONS = " + json.dumps(all_weapons, ensure_ascii=False, indent=2) + ";\n"
    OUTPUT_JS.write_text(js_content, encoding="utf-8")
    print(f"Successfully generated {OUTPUT_JS} with {len(all_weapons)} weapons!")

if __name__ == "__main__":
    main()
