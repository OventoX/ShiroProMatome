"""Fetch RecentChanges, detect modified castle/strategy pages, update cache, and rebuild data."""
import json
import re
import time
import urllib.parse
from pathlib import Path
import requests

from common import ROOT, fetch_source, safe_name
from build_data import main as rebuild_data
from convert import main as rebuild_notebooklm

RAW = ROOT / "tools" / "cache" / "raw"
ICONS_DIR = ROOT / "app" / "icons"

def get_recent_changes() -> list[str]:
    print("Checking RecentChanges from scre.swiki.jp...")
    src = fetch_source("RecentChanges", refresh=True)
    if not src:
        print("Failed to fetch RecentChanges!")
        return []

    updated_pages = []
    for line in src.splitlines():
        m = re.search(r"\[\[([^\]>]+?)(?:>[^\]]+)?\]\]", line)
        if m:
            page = m.group(1).split("#")[0].strip()
            # Ignore comment trees
            if page.startswith("Comments/"):
                continue
            if page not in updated_pages:
                updated_pages.append(page)
    return updated_pages

def check_and_update():
    recent = get_recent_changes()
    print(f"Discovered {len(recent)} recently modified pages.")

    idx_file = ROOT / "tools" / "cache" / "castles_index.json"
    castles_idx = json.loads(idx_file.read_text(encoding="utf-8")) if idx_file.exists() else []
    known_castles = {c["page"] for c in castles_idx}

    updated_castles = []
    for p in recent:
        # Check if page is a known castle, or ends with "城", or is a high-difficulty page
        if p in known_castles or p.endswith("城") or any(h in p for h in ["地獄", "武神", "四季御殿", "群雄割拠"]):
            updated_castles.append(p)

    if not updated_castles:
        print("No castle or high-difficulty guide page modifications found. Everything is up to date!")
        return

    print(f"Target pages to update ({len(updated_castles)}): {updated_castles}")

    session = requests.Session()
    session.headers["User-Agent"] = "Mozilla/5.0 scre-helper-updater"

    for p in updated_castles:
        print(f"Updating: {p}...")
        fetch_source(p, refresh=True)
        # Check if icon exists, if not attempt to fetch
        icon_path = ICONS_DIR / (safe_name(p) + ".png")
        if not icon_path.exists():
            encoded = urllib.parse.quote(f"{p}.png".encode("utf-8"))
            url = f"https://scre.swiki.jp/index.php?plugin=ref&host=scre&page=%E7%94%BB%E5%83%8F%E3%81%A7%E4%B8%80%E8%A6%A7RE&src={encoded}"
            try:
                r = session.get(url, timeout=10)
                if r.status_code == 200 and len(r.content) > 1000:
                    icon_path.write_bytes(r.content)
                    print(f"  Downloaded new icon for {p}")
            except Exception:
                pass
        time.sleep(1.0)

    print("\nRebuilding app/data.js...")
    rebuild_data()

    print("\nRebuilding notebooklm bundles...")
    rebuild_notebooklm()

    print("\n=== All updates applied successfully! ===")

if __name__ == "__main__":
    check_and_update()
