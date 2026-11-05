import os, sys, re, time
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append('tools')
from common import fetch_source, ROOT, CACHE

def safe_name(page: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "_", page)

# Build list of stages to fetch
# Priority 1: High difficulty layers (5, 6, 7)
priority_stages = []
# Priority 2: Lower layers (1, 2, 3, 4)
other_stages = []

# Enma
for area in ["無間地獄", "等活地獄", "針山地獄", "極寒地獄", "焦熱地獄", "賽の河原"]:
    for layer in ["七層", "六層", "五層"]:
        sp = f"閻魔の闘技場/{area}/{layer}"
        p = CACHE / f"{safe_name(sp)}.txt"
        if not p.exists():
            priority_stages.append(sp)
    for layer in ["四層", "三層", "二層", "一層"]:
        sp = f"閻魔の闘技場/{area}/{layer}"
        p = CACHE / f"{safe_name(sp)}.txt"
        if not p.exists():
            other_stages.append(sp)

# Hel
for area in ["ヘルヘイム", "ニヴルヘイム", "ニザヴェッリル", "アスガルド", "ムスペルヘイム", "ヨトゥンヘイム"]:
    for num in [7, 6, 5]:
        sp = f"ヘルの遊戯場/{area}/{num}"
        p = CACHE / f"{safe_name(sp)}.txt"
        if not p.exists():
            priority_stages.append(sp)
    for num in [4, 3, 2, 1]:
        sp = f"ヘルの遊戯場/{area}/{num}"
        p = CACHE / f"{safe_name(sp)}.txt"
        if not p.exists():
            other_stages.append(sp)

# Osiris
for area in ["マアト", "アケト", "オンボス", "ヘリオポリス", "アアル", "ヌン"]:
    for num in [7, 6, 5]:
        sp = f"オシリスの審判場/{area}/{num}"
        p = CACHE / f"{safe_name(sp)}.txt"
        if not p.exists():
            priority_stages.append(sp)
    for num in [4, 3, 2, 1]:
        sp = f"オシリスの審判場/{area}/{num}"
        p = CACHE / f"{safe_name(sp)}.txt"
        if not p.exists():
            other_stages.append(sp)

all_to_fetch = priority_stages + other_stages
print(f"Total Hell stages to fetch: {len(all_to_fetch)} (Priority: {len(priority_stages)}, Other: {len(other_stages)})")

success = 0
for i, sp in enumerate(all_to_fetch, 1):
    try:
        s = fetch_source(sp)
        if s:
            success += 1
            if i % 5 == 0 or i <= len(priority_stages):
                print(f"[{i}/{len(all_to_fetch)}] Fetched: {sp} ({len(s)} chars)")
        else:
            print(f"[{i}/{len(all_to_fetch)}] FAILED: {sp}")
    except Exception as e:
        print(f"[{i}/{len(all_to_fetch)}] ERROR {sp}: {e}")

print(f"Done fetching Hell stages! Success: {success}/{len(all_to_fetch)}")
