import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append('tools')
from common import fetch_source

hades_stages = [
    "ハデスの死闘場/閻魔大王/1",
    "ハデスの死闘場/イザナギ/1",
    "ハデスの死闘場/覇・前田利家/1",
    "ハデスの死闘場/クロノス/1",
    "ハデスの死闘場/ヘル/1",
    "ハデスの死闘場/オーディン/1",
    "ハデスの死闘場/幻・佐竹義重/1",
    "ハデスの死闘場/ヴィシュヌ/1",
    "ハデスの死闘場/オシリス/1",
    "ハデスの死闘場/インドラ/1",
    "ハデスの死闘場/アヌ/1"
]

print(f"Starting fetch for {len(hades_stages)} Hades stages...")
for stage in hades_stages:
    print(f"Fetching: {stage} ...")
    src = fetch_source(stage)
    if src:
        print(f"  OK ({len(src)} chars)")
    else:
        print(f"  FAILED: {stage}")

print("Done fetching Hades stages!")
