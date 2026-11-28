"""Download all 1200+ castle icons from 画像で一覧RE into app/icons."""
import argparse
import re
import time
import urllib.parse
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "cache" / "raw"
ICONS_DIR = ROOT / "app" / "icons"
ICONS_DIR.mkdir(parents=True, exist_ok=True)
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

session = requests.Session()
session.headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) scre-helper-icons"

def safe_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "_", name)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Re-download existing icons too")
    args = parser.parse_args()

    list_file = RAW / "画像で一覧RE.txt"
    if not list_file.exists():
        print("画像で一覧RE.txt not found!")
        return

    text = list_file.read_text(encoding="utf-8")
    matches = re.findall(r"\[\[&ref\((?:\./|画像で一覧RE/)?([^,]+?\.png),nolink\);?>([^\]]+)\]\]", text)
    print(f"Discovered {len(matches)} total icon references!")

    base_url = "https://scre.swiki.jp/index.php?plugin=ref&host=scre&page=%E7%94%BB%E5%83%8F%E3%81%A7%E4%B8%80%E8%A6%A7RE&src="

    newly_downloaded = 0
    updated = 0
    unchanged = 0
    skipped = 0
    failed = 0
    failed_names = []

    seen_castles = set()
    valid_items = []
    for png, castle in matches:
        castle_clean = castle.split("#")[0].strip()
        if not castle_clean or castle_clean in ("damy", "damy.png") or castle_clean in seen_castles:
            continue
        seen_castles.add(castle_clean)
        valid_items.append((png, castle_clean))

    print(f"Unique castles to download: {len(valid_items)} (force={args.force})")

    for i, (png, castle) in enumerate(valid_items, 1):
        target_path = ICONS_DIR / (safe_filename(castle) + ".png")
        existed_valid_png = False
        if target_path.exists() and target_path.stat().st_size > 1000:
            existed_valid_png = target_path.read_bytes()[:8] == PNG_MAGIC
        if existed_valid_png and not args.force:
            skipped += 1
            continue

        encoded_src = urllib.parse.quote(png.encode("utf-8"))
        img_url = base_url + encoded_src

        try:
            r = session.get(img_url, timeout=12)
            if r.status_code == 200 and len(r.content) > 1000 and r.content.startswith(PNG_MAGIC):
                if not target_path.exists():
                    target_path.write_bytes(r.content)
                    newly_downloaded += 1
                else:
                    old_bytes = target_path.read_bytes()
                    if old_bytes != r.content:
                        target_path.write_bytes(r.content)
                        updated += 1
                    else:
                        unchanged += 1
            else:
                failed += 1
                failed_names.append(castle)
            time.sleep(0.3)
        except Exception:
            failed += 1
            failed_names.append(castle)
            time.sleep(1.0)

        if i % 100 == 0 or i == len(valid_items):
            print(
                f"[{i}/{len(valid_items)}] New: {newly_downloaded}, Updated: {updated}, Unchanged: {unchanged}, Skip: {skipped}, Fail: {failed}",
                flush=True,
            )

    print(f"Summary -> New: {newly_downloaded}, Updated: {updated}, Unchanged: {unchanged}, Skip: {skipped}, Fail: {failed}")
    if failed_names:
        print("Failed castles:", ", ".join(failed_names))
    print(f"Completed! Total icons in folder: {len(list(ICONS_DIR.glob('*.png')))}")

if __name__ == "__main__":
    main()
