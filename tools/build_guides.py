"""Comprehensive generator for high-difficulty maps and guides (地獄, 武神降臨, 四季御殿, 群雄割拠).
Outputs app/guides.js for offline search, display, and party diagnostics.
"""
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "cache" / "raw"
GUIDES_JS = ROOT / "app" / "guides.js"

def clean_guide_text(s: str) -> str:
    if not s:
        return ""
    s = re.sub(r"SIZE\(\d+\):?", "", s)
    s = re.sub(r"BGCOLOR\(#[a-zA-Z0-9]+\):?", "", s)
    s = re.sub(r"COLOR\(#[a-zA-Z0-9]+\):?", "", s)
    # remove color / size wrappers
    s = re.sub(r"&(?:color|size)\([^)]*\)\{([^{}]*)\};?", r"\1", s)
    s = re.sub(r"\[\[([^\]>]+?)>[^\]]+?\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]+?)\]\]", r"\1", s)
    s = re.sub(r"&attachref\([^)]+\);?", "", s)
    s = s.replace("''", "").replace("&br;", "\n").replace("―", "-")
    # clean extra semicolons left behind from wiki markup
    s = re.sub(r";\s*\n", "\n", s)
    s = re.sub(r";\s*$", "", s)
    return s.strip()

def parse_stage_file(category: str, subcat: str, page_name: str, src: str) -> dict:
    title = page_name
    m_name = re.search(r"\|戦場名\|([^|]+)\|", src)
    if m_name:
        title = clean_guide_text(m_name.group(1))

    # Terrain
    terrain = "無"
    if any(k in page_name for k in ["ハデス", "ヘル", "オシリス", "無間"]):
        terrain = "地獄"
    elif "焦熱" in page_name:
        terrain = "平"
    elif "極寒" in page_name:
        terrain = "水"
    elif "針山" in page_name:
        terrain = "山"
    elif "等活" in page_name:
        terrain = "平山"
    elif "賽の河原" in page_name:
        terrain = "無"
    else:
        m_ter = re.search(r"画像置場/(平山|山水|平水|地獄|平山|平|山|水|無)\.png", src)
        if m_ter:
            terrain = m_ter.group(1)

    # Special rules
    rules = []
    m_rules_sec = re.search(r"(?:このマップの特別ルール|特別ルール|戦場効果).*?\|h(.*?)(?=\n\|審議|\n\*|\n\|BGCOLOR\(#[0-9a-fA-F]+\):COLOR|\Z)", src, re.S)
    if m_rules_sec:
        for line in m_rules_sec.group(1).splitlines():
            line = line.strip().strip("|")
            if not line or line.startswith(("//", "#", "BGCOLOR(White)")):
                continue
            cleaned = clean_guide_text(line)
            if len(cleaned) > 5 and not cleaned.startswith("審議|") and cleaned not in rules:
                rules.append(cleaned)

    # Deliberations
    deliberations = []
    for line in src.splitlines():
        line = line.strip()
        m = re.match(r"^\|(\d{1,2})\|([^|]+)\|([^|]+)\|", line)
        if m:
            p_val = int(m.group(1))
            d_name = clean_guide_text(m.group(2))
            d_eff = clean_guide_text(m.group(3))
            if d_name and d_eff and d_name not in ("審議", "名称", "内容", "point", "名前", "難度"):
                deliberations.append({
                    "point": p_val,
                    "name": d_name,
                    "effect": d_eff
                })

    # Boss traits
    boss_info = []
    boss_matches = re.findall(r"\'\'([^\'\n]{10,}?(?:は|で|を|に)[^\'\n]{10,}?)\'\'", src)
    for bm in boss_matches:
        cl = clean_guide_text(bm)
        if len(cl) > 15 and cl not in boss_info and not cl.startswith("このマップの特別ルール"):
            boss_info.append(cl)

    # Hades special metadata
    hades_meta = None
    if "ハデス" in page_name:
        soul_color = "赤"
        boss_name = "閻魔大王"
        if any(b in page_name for b in ["ヘル", "オーディン", "佐竹義重", "ヴィシュヌ"]):
            soul_color = "青"
        elif any(b in page_name for b in ["オシリス", "インドラ", "アヌ"]):
            soul_color = "黄"

        for b in ["閻魔大王", "イザナギ", "覇・前田利家", "前田利家", "クロノス", "ヘル", "オーディン", "幻・佐竹義重", "佐竹義重", "ヴィシュヌ", "オシリス", "インドラ", "アヌ"]:
            if b in page_name:
                boss_name = b
                break

        is_deep2 = "クロノス" in page_name or "ヴィシュヌ" in page_name
        depth_name = "深層2" if is_deep2 else "深層1"

        hades_meta = {
            "soulColor": soul_color,
            "depth": depth_name,
            "bossName": boss_name,
            "difficulty": "超難",
            "fixedRedeploy": "再配置時間50秒・気30固定",
            "soulGimmick": "紫敵撃破時『ハデスの霊魂』に変化・自爆（暗闇付与・計略消費気+2）",
            "terrainBonus": "地獄（耐久・攻撃・防御1.3倍 / 巨大化消費気軽減）"
        }

    return {
        "id": page_name,
        "title": title,
        "category": category,
        "subCategory": subcat,
        "terrain": terrain,
        "rules": rules,
        "bossInfo": boss_info[:6],
        "deliberations": deliberations,
        "totalDelibPoints": sum(d["point"] for d in deliberations),
        "hadesMeta": hades_meta
    }

def collect_hell_stages():
    stages = []
    # 1. ハデスの死闘場 (11 stages)
    hades_pages = [
        # 赤霊魂
        ("ハデスの死闘場/閻魔大王/1", "赤霊魂・深層1"),
        ("ハデスの死闘場/イザナギ/1", "赤霊魂・深層1"),
        ("ハデスの死闘場/覇・前田利家/1", "赤霊魂・深層1"),
        ("ハデスの死闘場/クロノス/1", "赤霊魂・深層2"),
        # 青霊魂
        ("ハデスの死闘場/ヘル/1", "青霊魂・深層1"),
        ("ハデスの死闘場/オーディン/1", "青霊魂・深層1"),
        ("ハデスの死闘場/幻・佐竹義重/1", "青霊魂・深層1"),
        ("ハデスの死闘場/ヴィシュヌ/1", "青霊魂・深層2"),
        # 黄霊魂
        ("ハデスの死闘場/オシリス/1", "黄霊魂・深層1"),
        ("ハデスの死闘場/インドラ/1", "黄霊魂・深層1"),
        ("ハデスの死闘場/アヌ/1", "黄霊魂・深層1"),
    ]
    for sp, tag in hades_pages:
        fn = sp.replace("/", "_") + ".txt"
        p = RAW / fn
        if p.exists():
            data = parse_stage_file("地獄", "ハデスの死闘場", sp, p.read_text(encoding="utf-8"))
            stages.append(data)

    # 2. 閻魔の闘技場
    enma_areas = ["無間地獄", "等活地獄", "針山地獄", "極寒地獄", "焦熱地獄", "賽の河原"]
    layers_order = ["七層", "六層", "五層", "四層", "三層", "二層", "一層"]
    for area in enma_areas:
        for layer in layers_order:
            sp = f"閻魔の闘技場/{area}/{layer}"
            fn = sp.replace("/", "_") + ".txt"
            p = RAW / fn
            if p.exists():
                data = parse_stage_file("地獄", "閻魔の闘技場", sp, p.read_text(encoding="utf-8"))
                stages.append(data)

    # 3. ヘルの遊戯場
    hel_areas = ["ヘルヘイム", "ニヴルヘイム", "ニザヴェッリル", "アスガルド", "ムスペルヘイム", "ヨトゥンヘイム"]
    for area in hel_areas:
        for num in [7, 6, 5, 4, 3, 2, 1]:
            sp = f"ヘルの遊戯場/{area}/{num}"
            fn = sp.replace("/", "_") + ".txt"
            p = RAW / fn
            if p.exists():
                data = parse_stage_file("地獄", "ヘルの遊戯場", sp, p.read_text(encoding="utf-8"))
                stages.append(data)

    # 4. オシリスの審判場
    osiris_areas = ["マアト", "アケト", "オンボス", "ヘリオポリス", "アアル", "ヌン"]
    for area in osiris_areas:
        for num in [7, 6, 5, 4, 3, 2, 1]:
            sp = f"オシリスの審判場/{area}/{num}"
            fn = sp.replace("/", "_") + ".txt"
            p = RAW / fn
            if p.exists():
                data = parse_stage_file("地獄", "オシリスの審判場", sp, p.read_text(encoding="utf-8"))
                stages.append(data)

    return stages

def collect_bushin_stages():
    stages = []
    # Collect all cached files starting with 武神
    for f in sorted(RAW.glob("武神*.txt")):
        if f.stem in ("武神降臨", "武神降臨！上杉謙信_E-1"):
            continue
        src = f.read_text(encoding="utf-8")
        page_name = f.stem.replace("_", "/")
        data = parse_stage_file("武神降臨", "武神降臨", page_name, src)
        if not data["rules"] and not data["bossInfo"]:
            # extract any general strategy section
            m_k = re.search(r"\*攻略.*?(?=\n\*|\Z)", src, re.S)
            if m_k:
                k_text = clean_guide_text(m_k.group(0))
                for line in k_text.splitlines()[:6]:
                    if len(line) > 15:
                        data["rules"].append(line)
        stages.append(data)
    return stages

def collect_seasons_stages():
    stages = []
    for f in sorted(RAW.glob("四季御殿_*.txt")):
        src = f.read_text(encoding="utf-8")
        page_name = f.stem.replace("_", "/")
        data = parse_stage_file("四季御殿", "四季御殿", page_name, src)
        stages.append(data)
    return stages

def collect_heroes_stages():
    stages = []
    for f in sorted(RAW.glob("群雄割拠_*.txt")):
        src = f.read_text(encoding="utf-8")
        page_name = f.stem.replace("_", "/")
        data = parse_stage_file("群雄割拠", "群雄割拠", page_name, src)
        stages.append(data)
    return stages

def build_guides():
    hell_stages = collect_hell_stages()
    bushin_stages = collect_bushin_stages()
    seasons_stages = collect_seasons_stages()
    heroes_stages = collect_heroes_stages()

    all_guides = [
        {
            "category": "地獄",
            "description": "ハデスの死闘場・閻魔・ヘル・オシリスの審議・超難ルールと地形ボーナスを網羅",
            "subCategories": ["ハデスの死闘場", "閻魔の闘技場", "ヘルの遊戯場", "オシリスの審判場"],
            "stages": hell_stages
        },
        {
            "category": "武神降臨",
            "description": "歴代武将兜との死闘。気の自然回復半減や専用戦場効果・武神化への対策ガイド",
            "subCategories": ["武神降臨"],
            "stages": bushin_stages
        },
        {
            "category": "四季御殿",
            "description": "季節限定城娘が活躍する常設高難易度回廊（春・夏・秋・冬 各間）",
            "subCategories": ["四季御殿"],
            "stages": seasons_stages
        },
        {
            "category": "群雄割拠",
            "description": "合戦制限・挑戦要素のある絵巻型高難易度マップ",
            "subCategories": ["群雄割拠"],
            "stages": heroes_stages
        }
    ]

    total_stages = sum(len(c["stages"]) for c in all_guides)
    hades_count = sum(1 for s in hell_stages if s.get("subCategory") == "ハデスの死闘場")
    print(f"Total categories: {len(all_guides)}")
    print(f"Hell stages: {len(hell_stages)} (Hades: {hades_count})")
    print(f"Bushin stages: {len(bushin_stages)}")
    print(f"Seasons stages: {len(seasons_stages)}")
    print(f"Heroes stages: {len(heroes_stages)}")
    print(f"Total stages across all guides: {total_stages}")

    js_content = "// High Difficulty Maps and Strategies - Generated by build_guides.py\nwindow.SCRE_GUIDES = " + json.dumps(all_guides, ensure_ascii=False, indent=2) + ";\n"
    GUIDES_JS.write_text(js_content, encoding="utf-8")
    print(f"Successfully generated {GUIDES_JS}!")

if __name__ == "__main__":
    build_guides()
