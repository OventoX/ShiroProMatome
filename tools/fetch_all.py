"""Fetch castle pages + system pages from scre.swiki.jp into cache/raw (rate limited)."""
import json
import re
import sys
from pathlib import Path

from common import ROOT, fetch_source, wiki_links

SYSTEM_PAGES = [
    "FrontPage", "初心者ガイド", "よくある質問", "用語集", "検証", "小技・小ネタ", "愛称",
    "出陣", "巨大化・属性", "城娘", "部隊編成", "城娘合成", "城娘改築", "名城目録",
    "特技", "特技/防御系", "特技/弱体化", "所持特技", "編成特技", "大破特技",
    "特殊攻撃", "特殊能力", "武器切替", "計略", "計略/伏兵",
    "限定城娘", "特定カテゴリ", "全城娘一覧", "全城娘一覧/★1～6", "城娘一覧/改弐", "ステータス一覧/能力値",
    "兜娘", "増築用施設", "設備", "消耗品",
]


def castle_list() -> list[dict]:
    src = fetch_source("全城娘一覧") + "\n" + (fetch_source("全城娘一覧/★1～6") or "")
    seen: dict[str, dict] = {}
    for line in src.splitlines():
        m = re.match(r"\|(\d{3,5})\|(.*)", line)
        if not m:
            continue
        cells = line.strip().strip("|").split("|")
        links = wiki_links(cells[1]) if len(cells) > 1 else []
        if not links:
            continue
        name = links[0]
        try:
            rarity = int(re.sub(r"\D", "", cells[3]) or 0)
        except (IndexError, ValueError):
            rarity = 0
        if name not in seen:
            seen[name] = {"page": name, "no": m.group(1), "rarity": rarity}
        else:
            seen[name]["rarity"] = max(seen[name]["rarity"], rarity)
    return list(seen.values())


def main():
    castles = castle_list()
    (ROOT / "tools" / "cache" / "castles_index.json").write_text(
        json.dumps(castles, ensure_ascii=False, indent=1), encoding="utf-8")
    pages = SYSTEM_PAGES + [c["page"] for c in castles]
    print(f"castles={len(castles)} total={len(pages)}", flush=True)
    failed = []
    for i, p in enumerate(pages, 1):
        src = fetch_source(p)
        if not src:
            failed.append(p)
        if i % 20 == 0 or i == len(pages):
            print(f"{i}/{len(pages)} failed={len(failed)}", flush=True)
    (ROOT / "tools" / "cache" / "failed.json").write_text(
        json.dumps(failed, ensure_ascii=False, indent=1), encoding="utf-8")
    print("DONE failed:", failed, flush=True)


if __name__ == "__main__":
    sys.exit(main())

