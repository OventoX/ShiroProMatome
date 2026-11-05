"""Build app/data.js from raw wiki sources with robust attribute, ability, and detail extraction."""
import json
import re
from pathlib import Path
from urllib.parse import quote
from common import ROOT, safe_name
from effect_parser import parse_ability_effects

RAW = ROOT / "tools" / "cache" / "raw"
DATA_JS = ROOT / "app" / "data.js"

ATTR_MAP = {
    "平": {"main": "平", "display": "平", "list": ["平"]},
    "平山": {"main": "平山", "display": "平山", "list": ["平山"]},
    "山": {"main": "山", "display": "山", "list": ["山"]},
    "水": {"main": "水", "display": "水", "list": ["水"]},
    "地獄": {"main": "地獄", "display": "地獄", "list": ["地獄"]},
    "無": {"main": "無", "display": "無", "list": ["無"]},
    # 複合属性
    "平水": {"main": "平", "display": "平/水", "list": ["平", "水"]},
    "山水": {"main": "山", "display": "山/水", "list": ["山", "水"]},
    "平山水": {"main": "平山", "display": "平山/水", "list": ["平山", "水"]},
    "平＆山": {"main": "平", "display": "平/山", "list": ["平", "山"]},
    "平山山": {"main": "平山", "display": "平山/山", "list": ["平山", "山"]},
    "地獄平": {"main": "地獄", "display": "地獄/平", "list": ["地獄", "平"]},
    "地獄平山": {"main": "地獄", "display": "地獄/平山", "list": ["地獄", "平山"]},
    "地獄山": {"main": "地獄", "display": "地獄/山", "list": ["地獄", "山"]},
    "地獄水": {"main": "地獄", "display": "地獄/水", "list": ["地獄", "水"]},
    "地獄無": {"main": "地獄", "display": "地獄/無", "list": ["地獄", "無"]},
}

def clean_wiki(s: str) -> str:
    if not s:
        return ""
    s = re.sub(r"&(?:color|size)\([^)]*\)\{([^}]*)\};?", r"\1", s, flags=re.I)
    s = re.sub(r"\[\[([^\]>]+?)>[^\]]+?\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]+?)\]\]", r"\1", s)
    s = s.replace("''", "").replace("&br;", " ")
    s = re.sub(r"COLOR\([^)]+\):", "", s, flags=re.I)
    s = s.strip("| \t\r\n")
    return s

def extract_all_section_abilities(src: str, section_name: str, page_name: str):
    pattern = r"\|>\|>\|>\|>\|BGCOLOR\(#[A-Fa-f0-9]+\):CENTER:\'\'(?:\[\[)?" + section_name + r"(?:\]\])?\'\'\|(.*?)(?=\|>\|>\|>\|>\|BGCOLOR|\Z)"
    m = re.search(pattern, src, re.S)
    if not m:
        return []
    chunk = m.group(1)
    lines = chunk.splitlines()
    results = []
    for line in lines:
        line_clean = line.strip()
        if line_clean.startswith("//") or "|>|>|>|" not in line_clean:
            continue
        parts = line_clean.split("|>|>|>|")
        if len(parts) >= 2:
            raw_name = re.sub(r"^\|(?:BGCOLOR\([^)]+\):)?", "", parts[0])
            raw_desc = parts[1]
            cleaned_name = clean_wiki(raw_name)
            cleaned_desc = clean_wiki(raw_desc)
            if cleaned_desc and cleaned_desc not in ("~", "||", "|~|"):
                # Detect stage [無印], [改壱], [改弐]
                stage = "無印"
                if "改弐" in cleaned_name:
                    stage = "改弐"
                elif "改壱" in cleaned_name:
                    stage = "改壱"
                effects = parse_ability_effects(cleaned_desc, section_name, page_name)
                results.append({
                    "stage": stage,
                    "name": cleaned_name,
                    "text": cleaned_desc,
                    "effects": effects
                })
    return results

def parse_castle_page(src: str, page_name: str, rarity: int, fallback_type: str = "平") -> dict:
    castle = {
        "id": page_name,
        "name": page_name,
        "ruby": "",
        "bookNo": "",
        "country": "",
        "rarity": rarity,
        "castleType": fallback_type or "平",
        "subType": "",
        "attributes": [],
        "weapon": "刀",
        "rangeKind": "近",
        "cost": 10,
        "illustFile": "",
        "illustUrl": "",
        "ojouUrl": "",
        "taihaUrl": "",
        "tokugiUrl": "",
        "remodelStages": ["無印"],
        "remodelForms": {},
        "illustrator": "",
        "voiceActor": "",
        "lore": "",
        "stats": {
            "base": { "hp": 2000, "atk": 200, "def": 150, "range": 150 },
            "giant5": { "hp": 4500, "atk": 500, "def": 300, "range": 300, "singleHit": 1500 }
        },
        "statsDetail": {
            "initial": { "cost": "", "hp": "", "atk": "", "def": "", "range": "", "recovery": "" },
            "giant5": { "cost": "", "hp": "", "atk": "", "def": "", "range": "", "recovery": "" }
        },
        "skill": None,
        "strategy": None,
        "special": None,
        "allSkills": [],
        "allStrategies": [],
        "allSpecials": [],
        "parseWarnings": []
    }

    # Ruby (ふりがな)
    m_ruby = re.search(r"BGCOLOR\(#[A-Fa-f0-9]+\):CENTER:\'\'[^\'\(]+（([^\'\)]+)）\'\'", src)
    if m_ruby:
        castle["ruby"] = m_ruby.group(1).strip()

    # Book No
    m_no = re.search(r"\|図鑑No\.\|\s*(\d+|---)", src)
    if m_no:
        castle["bookNo"] = m_no.group(1).strip()

    # Country
    m_country = re.search(r"\|令制国\|\s*([^\|\n]+)", src)
    if m_country:
        castle["country"] = clean_wiki(m_country.group(1))

    # Illust file
    m_img = re.search(r"&(?:attach)?ref\((?:\.\/)?(?:[^\/,\)]+\/)?([^\/,\)]+\.(?:png|jpg))", src, re.I)
    if m_img:
        castle["illustFile"] = m_img.group(1).strip()
        castle["illustUrl"] = f"https://scre.swiki.jp/index.php?plugin=ref&page={quote(page_name)}&src={quote(castle['illustFile'])}"

    # Extract standing art, Ojou, Taiha, and Tokugi per remodel stage (無印 / 改壱 / 改弐)
    def resolve_url(cell_text: str, p_name: str) -> str:
        cell_text = cell_text.strip()
        m_up = re.search(r'&uploader\(([a-f0-9]+)_scre[^\)]*\)', cell_text, re.I)
        if m_up:
            return f"https://uploader.swiki.jp/attachment/full/attachment_hash/{m_up.group(1)}"
        m_ref = re.search(r'&(?:attach)?ref\((?:([^/,\)]+)/)?([^/,\)]+\.(?:png|jpg|jpeg|gif|webp))[^\)]*\)', cell_text, re.I)
        if m_ref:
            p = m_ref.group(1)
            if not p or p == "." or p.strip() == ".":
                p = p_name
            f = m_ref.group(2)
            return f"https://scre.swiki.jp/index.php?plugin=ref&page={quote(p)}&src={quote(f)}"
        return ""

    def extract_images_from_block(text, p_name):
        imgs = {"illustUrl": "", "ojouUrl": "", "taihaUrl": "", "tokugiUrl": ""}

        # Two-cell tables with labels:
        # | img1 | img2 |
        # | label1 | label2 |
        table_pattern = r'\|([^\n|]+)\|([^\n|]+)\|\s*[\r\n]+\|([^\n|]+)\|([^\n|]+)\|'
        for m in re.finditer(table_pattern, text):
            c1, c2, l1, l2 = m.group(1), m.group(2), m.group(3), m.group(4)
            u1 = resolve_url(c1, p_name)
            u2 = resolve_url(c2, p_name)
            if "御嬢" in l1 and u1 and not imgs["ojouUrl"]:
                imgs["ojouUrl"] = u1
            if "城娘" in l2 and u2 and not imgs["illustUrl"]:
                imgs["illustUrl"] = u2
            if "大破" in l1 and u1 and not imgs["taihaUrl"]:
                imgs["taihaUrl"] = u1
            if "特技" in l2 and u2 and not imgs["tokugiUrl"]:
                imgs["tokugiUrl"] = u2

        # Reversed labels and images:
        # | label1 | label2 |
        # | img1 | img2 |
        for m in re.finditer(table_pattern, text):
            l1, l2, c1, c2 = m.group(1), m.group(2), m.group(3), m.group(4)
            u1 = resolve_url(c1, p_name)
            u2 = resolve_url(c2, p_name)
            if "御嬢" in l1 and u1 and not imgs["ojouUrl"]:
                imgs["ojouUrl"] = u1
            if "城娘" in l2 and u2 and not imgs["illustUrl"]:
                imgs["illustUrl"] = u2
            if "大破" in l1 and u1 and not imgs["taihaUrl"]:
                imgs["taihaUrl"] = u1
            if "特技" in l2 and u2 and not imgs["tokugiUrl"]:
                imgs["tokugiUrl"] = u2

        # Fallbacks for single cell or inline
        if not imgs["illustUrl"]:
            m_b = re.search(r'\|[^\n|]*&uploader\(([a-f0-9]+)_scre[^\)]*\)[^\n|]*\|[\r\n]+\|[^\n|]*城娘[^\n|]*\|', text, re.I)
            if m_b:
                imgs["illustUrl"] = f"https://uploader.swiki.jp/attachment/full/attachment_hash/{m_b.group(1)}"
            else:
                m_bat_ref = re.search(r'\|[^\n|]*&(?:attach)?ref\((?:([^/,\)]+)/)?([^/,\)]+\.(?:png|jpg))[^\)]*\)[^\n|]*\|[\r\n]+\|[^\n|]*城娘', text, re.I)
                if m_bat_ref:
                    p = resolve_url(f"&ref({m_bat_ref.group(1)}/{m_bat_ref.group(2)})", p_name)
                    if p: imgs["illustUrl"] = p

        if not imgs["ojouUrl"]:
            m_oj_ref2 = re.search(r'&(?:attach)?ref\((?:([^/,\)]+)/)?([^/,\)]*御嬢[^\./,\)]*\.(?:png|jpg))', text, re.I)
            if m_oj_ref2:
                p = m_oj_ref2.group(1)
                p = p_name if (not p or p == ".") else p
                f = m_oj_ref2.group(2)
                imgs["ojouUrl"] = f"https://scre.swiki.jp/index.php?plugin=ref&page={quote(p)}&src={quote(f)}"

        if not imgs["taihaUrl"]:
            m_th = re.search(r'\|[^\n|]*&uploader\(([a-f0-9]+)_scre[^\)]*\)[^\n|]*\|[\r\n]+\|[^\n|]*大破[^\n|]*\|', text, re.I)
            if m_th:
                imgs["taihaUrl"] = f"https://uploader.swiki.jp/attachment/full/attachment_hash/{m_th.group(1)}"
            else:
                m_th_ref2 = re.search(r'&(?:attach)?ref\((?:([^/,\)]+)/)?([^/,\)]*大破[^\./,\)]*\.(?:png|jpg))', text, re.I)
                if m_th_ref2:
                    p = m_th_ref2.group(1)
                    p = p_name if (not p or p == ".") else p
                    f = m_th_ref2.group(2)
                    imgs["taihaUrl"] = f"https://scre.swiki.jp/index.php?plugin=ref&page={quote(p)}&src={quote(f)}"

        if not imgs["tokugiUrl"]:
            m_tok_ref = re.search(r'&(?:attach)?ref\((?:([^/,\)]+)/)?([^/,\)]*特技[^\./,\)]*\.(?:png|jpg))', text, re.I)
            if m_tok_ref:
                p = m_tok_ref.group(1)
                p = p_name if (not p or p == ".") else p
                f = m_tok_ref.group(2)
                imgs["tokugiUrl"] = f"https://scre.swiki.jp/index.php?plugin=ref&page={quote(p)}&src={quote(f)}"

        return imgs

    # Split wiki into remodel stages under *画像 or **画像
    m_img = re.search(r'^\*{1,2}\s*画像', src, re.M)
    img_idx = m_img.start() if m_img else -1
    img_text = src[img_idx:] if img_idx != -1 else src

    parts = re.split(r'(\*{2,3}\s*改[壱弐][^\n]*)', img_text)
    stage_texts = {"無印": parts[0]}
    cur_stage_name = "無印"
    for i in range(1, len(parts), 2):
        hdr = parts[i]
        cnt = parts[i+1] if i+1 < len(parts) else ""
        if "改弐" in hdr:
            cur_stage_name = "改弐"
        elif "改壱" in hdr:
            cur_stage_name = "改壱"
        stage_texts[cur_stage_name] = cnt

    stage_forms = {}
    for st_name, st_txt in stage_texts.items():
        imgs = extract_images_from_block(st_txt, page_name)
        stage_forms[st_name] = imgs

    # Fallbacks: base inherits top header image if missing
    base_form = stage_forms.get("無印", {})
    if not base_form.get("illustUrl") and castle["illustUrl"]:
        base_form["illustUrl"] = castle["illustUrl"]

    # Kai stages inherit base form images if not specially redrawn
    for st_key in ["改壱", "改弐"]:
        if st_key in stage_forms:
            sf = stage_forms[st_key]
            if not sf.get("illustUrl"):
                sf["illustUrl"] = base_form.get("illustUrl", "")
            if not sf.get("ojouUrl"):
                sf["ojouUrl"] = base_form.get("ojouUrl", "")
            if not sf.get("taihaUrl"):
                sf["taihaUrl"] = base_form.get("taihaUrl", "")
            if not sf.get("tokugiUrl"):
                sf["tokugiUrl"] = base_form.get("tokugiUrl", "")

    # Check which stages are applicable (from image sections and text mentions)
    applicable_stages = ["無印"]
    if "改壱" in stage_forms and (any(stage_forms["改壱"].values()) or "[改壱]" in src or "改壱" in src):
        applicable_stages.append("改壱")
    if "改弐" in stage_forms and (any(stage_forms["改弐"].values()) or "[改弐]" in src or "改弐" in src):
        applicable_stages.append("改弐")

    castle["remodelStages"] = applicable_stages
    castle["remodelForms"] = stage_forms

    # Set default top-level images to latest stage's images (e.g. Kai2 or Kai1)
    latest_st = applicable_stages[-1]
    latest_form = stage_forms.get(latest_st, base_form)
    castle["illustUrl"] = latest_form.get("illustUrl") or base_form.get("illustUrl") or castle["illustUrl"]
    castle["ojouUrl"] = latest_form.get("ojouUrl") or base_form.get("ojouUrl") or ""
    castle["taihaUrl"] = latest_form.get("taihaUrl") or base_form.get("taihaUrl") or ""
    castle["tokugiUrl"] = latest_form.get("tokugiUrl") or base_form.get("tokugiUrl") or ""

    # Lore
    m_lore = re.search(r"BGCOLOR\(#[A-Fa-f0-9]+\):CENTER:\'\'図鑑文章\'\'\|[\r\n]+\|>\|>\|>\|>\|([^\n|]+(?:\n[^\n|]+)*)", src)
    if m_lore:
        castle["lore"] = clean_wiki(m_lore.group(1))

    # Illustrator / CV
    m_illust = re.search(r"(?:イラストレーター|絵師|原画)[：:]\s*(?:\[\[)?([^\],\n\r]+)", src, re.I)
    if m_illust:
        castle["illustrator"] = clean_wiki(m_illust.group(1).split(">")[0])
    m_cv = re.search(r"(?:CV|声優)[：:]\s*(?:\[\[)?([^\],\n\r]+)", src, re.I)
    if m_cv:
        castle["voiceActor"] = clean_wiki(m_cv.group(1).split(">")[0])

    # 1. Attribute Extraction (Robust multi-attribute mapping)
    m_attr_row = re.search(r"\|~\|>\|~\|(?:城|)属性\|(.*?)(?=\n|\|)", src)
    found_key = None
    if m_attr_row:
        m_img_key = re.search(r"画像(?:置場|ブ)/([^,\)]+)\.png", m_attr_row.group(1))
        if m_img_key:
            found_key = m_img_key.group(1).strip()

    if not found_key:
        m_img_any = re.search(r"画像(?:置場|ブ)/(平＆山|平山山|地獄平山|地獄平|地獄山|地獄水|地獄無|平山水|山水|平水|地獄|平山|平|山|水|無)\.png", src)
        if m_img_any:
            found_key = m_img_any.group(1).strip()

    if found_key and found_key in ATTR_MAP:
        info = ATTR_MAP[found_key]
        castle["castleType"] = info["main"]
        castle["subType"] = info["display"]
        castle["attributes"] = info["list"]
    else:
        m_type = re.search(r"\|~\|>\|~\|(?:城|)属性\|.*?([平山水地獄無]+)", src)
        raw_t = m_type.group(1).strip() if m_type else (fallback_type or "平")
        castle["castleType"] = raw_t
        castle["subType"] = raw_t
        castle["attributes"] = [raw_t]

    # 2. Weapon Extraction
    m_wep = re.search(r"\|~\|>\|~\|武器属性\|.*?\[\[([^\]]+)\]\]", src)
    if m_wep:
        castle["weapon"] = m_wep.group(1).strip()
    else:
        m_wep2 = re.search(r"画像(?:置場|ブ)/(刀|槍|槌|盾|拳|鎌|戦棍|双剣|ランス|弓|石弓|鉄砲|大砲|歌舞|法術|鈴|杖|祓串|本|投剣|鞭|陣貝|軍船|茶器|その他)\.png", src)
        if m_wep2:
            castle["weapon"] = m_wep2.group(1).strip()

    # Range Kind (近 / 遠 / 遠近)
    near_weapons = {"刀", "槍", "槌", "盾", "拳", "鎌", "戦棍", "双剣", "ランス", "陣貝"}
    far_weapons = {"弓", "石弓", "鉄砲", "大砲", "歌舞", "法術", "鈴", "杖", "祓串", "本", "軍船", "茶器"}
    if castle["weapon"] in near_weapons:
        castle["rangeKind"] = "近"
    elif castle["weapon"] in far_weapons:
        castle["rangeKind"] = "遠"
    elif castle["weapon"] in {"投剣", "鞭"}:
        castle["rangeKind"] = "遠近"

    # Detailed Stats Rows Extraction
    def clean_stat_val(val_str):
        if not val_str:
            return ""
        v = clean_wiki(val_str)
        return re.sub(r"\s+", "", v)

    m_cost = re.search(r"\|~\|消費気\|(\d+)\|.*?\|(\d+)\|", src)
    if m_cost:
        castle["statsDetail"]["initial"]["cost"] = m_cost.group(1)
        castle["statsDetail"]["giant5"]["cost"] = m_cost.group(2)
        try:
            castle["cost"] = int(m_cost.group(1))
        except:
            pass

    m_hp_row = re.search(r"\|~\|耐久\|([^|]+)\|耐久\|([^|]+)\|", src)
    if m_hp_row:
        castle["statsDetail"]["initial"]["hp"] = clean_stat_val(m_hp_row.group(1))
        castle["statsDetail"]["giant5"]["hp"] = clean_stat_val(m_hp_row.group(2))

    m_atk_row = re.search(r"\|~\|攻撃\|([^|]+)\|攻撃\|([^|]+)\|", src)
    if m_atk_row:
        castle["statsDetail"]["initial"]["atk"] = clean_stat_val(m_atk_row.group(1))
        castle["statsDetail"]["giant5"]["atk"] = clean_stat_val(m_atk_row.group(2))

    m_def_row = re.search(r"\|~\|防御\|([^|]+)\|防御\|([^|]+)\|", src)
    if m_def_row:
        castle["statsDetail"]["initial"]["def"] = clean_stat_val(m_def_row.group(1))
        castle["statsDetail"]["giant5"]["def"] = clean_stat_val(m_def_row.group(2))

    m_range_row = re.search(r"\|~\|射程\|([^|]+)\|射程\|([^|]+)\|", src)
    if m_range_row:
        castle["statsDetail"]["initial"]["range"] = clean_stat_val(m_range_row.group(1))
        castle["statsDetail"]["giant5"]["range"] = clean_stat_val(m_range_row.group(2))

    m_rec_row = re.search(r"\|~\|回復\|([^|]+)\|回復\|([^|]+)\|", src)
    if m_rec_row:
        castle["statsDetail"]["initial"]["recovery"] = clean_stat_val(m_rec_row.group(1))
        castle["statsDetail"]["giant5"]["recovery"] = clean_stat_val(m_rec_row.group(2))

    # 3. Numeric Stats for Engine Calculation
    m_atk = re.search(r"\|~\|攻撃\|\d+/.*?\|\s*攻撃\|\s*(\d+)/", src)
    if m_atk:
        try: castle["stats"]["giant5"]["atk"] = int(m_atk.group(1))
        except: pass
    else:
        m_atk_init = re.search(r"\|~\|攻撃\|(?:>\|>\|)?\s*(\d+)/", src)
        if m_atk_init:
            try:
                base_atk = int(m_atk_init.group(1))
                castle["stats"]["giant5"]["atk"] = base_atk * 2
                castle["stats"]["base"]["atk"] = base_atk
            except: pass

    m_def = re.search(r"\|~\|防御\|\d+/.*?\|\s*防御\|\s*(\d+)/", src)
    if m_def:
        try: castle["stats"]["giant5"]["def"] = int(m_def.group(1))
        except: pass
    else:
        m_def_init = re.search(r"\|~\|防御\|(?:>\|>\|)?\s*(\d+)/", src)
        if m_def_init:
            try:
                base_def = int(m_def_init.group(1))
                castle["stats"]["giant5"]["def"] = base_def * 2
                castle["stats"]["base"]["def"] = base_def
            except: pass

    m_hp = re.search(r"\|~\|耐久\|\d+/.*?\|\s*耐久\|\s*(\d+)/", src)
    if m_hp:
        try: castle["stats"]["giant5"]["hp"] = int(m_hp.group(1))
        except: pass
    else:
        m_hp_init = re.search(r"\|~\|耐久\|(?:>\|>\|)?\s*(\d+)/", src)
        if m_hp_init:
            try:
                base_hp = int(m_hp_init.group(1))
                castle["stats"]["giant5"]["hp"] = base_hp * 2
                castle["stats"]["base"]["hp"] = base_hp
            except: pass

    m_range = re.search(r"\|~\|射程\|\d+/.*?\|\s*射程\|\s*(\d+)/", src)
    if m_range:
        try: castle["stats"]["giant5"]["range"] = int(m_range.group(1))
        except: pass
    else:
        m_range_init = re.search(r"\|~\|射程\|(?:>\|>\|)?\s*(\d+)/", src)
        if m_range_init:
            try: castle["stats"]["giant5"]["range"] = int(m_range_init.group(1))
            except: pass

    castle["stats"]["giant5"]["singleHit"] = int(castle["stats"]["giant5"]["atk"] * 2.5)

    # 4. Abilities Extraction (All stages)
    all_skills = extract_all_section_abilities(src, "特技", page_name)
    if all_skills:
        castle["allSkills"] = all_skills
        # Latest stage becomes active skill for calculation
        castle["skill"] = all_skills[-1]

    all_strats = extract_all_section_abilities(src, "計略", page_name)
    if all_strats:
        castle["allStrategies"] = all_strats
        latest = all_strats[-1]
        cooldown = 40
        cost = 5
        m_cd = re.search(r"(\d+)秒", latest["name"])
        if m_cd:
            try: cooldown = int(m_cd.group(1))
            except: pass
        m_ct = re.search(r"消費気(\d+)", latest["name"])
        if m_ct:
            try: cost = int(m_ct.group(1))
            except: pass
        castle["strategy"] = {
            "name": latest["name"],
            "text": latest["text"],
            "effects": latest["effects"],
            "cooldown": cooldown,
            "cost": cost
        }

    all_specs = extract_all_section_abilities(src, "特殊能力", page_name) or extract_all_section_abilities(src, "特殊攻撃", page_name)
    if all_specs:
        castle["allSpecials"] = all_specs
        castle["special"] = all_specs[-1]

    return castle

def main():
    idx_path = ROOT / "tools" / "cache" / "castles_index.json"
    if not idx_path.exists():
        print("castles_index.json missing!")
        return

    castles_idx = json.loads(idx_path.read_text(encoding="utf-8"))
    results = []

    print(f"Parsing {len(castles_idx)} castles with full details...")
    for item in castles_idx:
        pname = item["page"]
        fpath = RAW / (safe_name(pname) + ".txt")
        if not fpath.exists():
            continue
        try:
            src = fpath.read_text(encoding="utf-8")
            data = parse_castle_page(src, pname, item.get("rarity", 7))
            results.append(data)
        except Exception as e:
            pass

    none_count = sum(1 for c in results if c["castleType"] == "無")
    illust_count = sum(1 for c in results if c["illustFile"])
    lore_count = sum(1 for c in results if c["lore"])
    ojou_count = sum(1 for c in results if c.get("ojouUrl"))
    taiha_count = sum(1 for c in results if c.get("taihaUrl"))
    tokugi_count = sum(1 for c in results if c.get("tokugiUrl"))
    # Attach real castle photos and Wikipedia info
    real_cache_file = ROOT / "tools" / "cache" / "real_castles_cache.json"
    real_cache = {}
    if real_cache_file.exists():
        try:
            with open(real_cache_file, "r", encoding="utf-8") as f:
                real_cache = json.load(f)
        except Exception as e:
            print("Failed to load real_castles_cache:", e)

    # Load prefecture mapping (令制国・城名 -> 47都道府県)
    pref_mapping_file = ROOT / "tools" / "prefecture_mapping.json"
    pref_mapping = {"countryToPrefecture": {}, "castleOverrides": {}}
    if pref_mapping_file.exists():
        try:
            with open(pref_mapping_file, "r", encoding="utf-8") as f:
                pref_mapping = json.load(f)
        except Exception as e:
            print("Failed to load prefecture_mapping:", e)

    country_to_pref = pref_mapping.get("countryToPrefecture", {})
    castle_pref_overrides = pref_mapping.get("castleOverrides", {})

    real_count = 0
    pref_count = 0
    for c in results:
        base_name = re.sub(r'^[［\[].*?[］\]]', '', c.get("name", "")).strip()
        rc = real_cache.get(base_name)
        if rc:
            c["realCastle"] = rc
            real_count += 1

        # Determine modern prefecture
        pref = castle_pref_overrides.get(base_name)
        if not pref:
            country = c.get("country", "")
            pref = country_to_pref.get(country)
        if pref:
            c["prefecture"] = pref
            pref_count += 1

    print(f"Total parsed: {len(results)}, '無' count: {none_count}, With illustration: {illust_count}, With Ojou: {ojou_count}, With Taiha: {taiha_count}, With Tokugi: {tokugi_count}, With lore: {lore_count}, With realCastle: {real_count}, With prefecture: {pref_count}")

    rules_js = """// Generated data for scre-helper
window.SCRE_RULES = {
  statLabels: {
    atkPercent: "攻撃(%)",
    atkFlat: "攻撃(固定値)",
    defPercent: "防御(%)",
    defFlat: "防御(固定値)",
    rangePercent: "射程(%)",
    rangeFlat: "射程(固定値)",
    hpPercent: "耐久(%)",
    hpFlat: "耐久(固定値)",
    recoveryFlat: "回復(固定値)",
    dmgDealt: "与ダメージ",
    dmgDealtTarget: "与えるダメージ",
    dmgTakenDown: "被ダメ軽減",
    atkSpeed: "攻撃速度",
    gapShorten: "隙短縮",
    defIgnore: "防御無視",
    shareAtk: "攻撃共有",
    shareDef: "防御共有",
    shareRange: "射程共有",
    enemyAtkDown: "敵攻撃低下",
    enemyDefDown: "敵防御低下",
    enemySlow: "敵移動低下",
    enemyDmgTakenUp: "敵被ダメ上昇"
  },
  checklist: [
    { key: "atkPercent", label: "攻撃(%)" },
    { key: "atkFlat", label: "攻撃(固定値)" },
    { key: "dmgDealt", label: "与ダメ上昇" },
    { key: "rangePercent", label: "射程(%)" },
    { key: "rangeFlat", label: "射程(固定値)" },
    { key: "atkSpeed", label: "攻撃速度" },
    { key: "gapShorten", label: "隙短縮" },
    { key: "dmgTakenDown", label: "被ダメ軽減" },
    { key: "enemyDefDown", label: "敵防御低下" },
    { key: "enemySlow", label: "敵移動低下" },
    { key: "defIgnore", label: "防御無視" }
  ]
};

window.SCRE_DATA = """ + json.dumps(results, ensure_ascii=False, indent=1) + ";\n"

    DATA_JS.write_text(rules_js, encoding="utf-8")
    print(f"Successfully updated {DATA_JS} with {len(results)} castles!")

if __name__ == "__main__":
    main()
