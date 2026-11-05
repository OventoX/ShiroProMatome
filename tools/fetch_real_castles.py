import json
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

# Force UTF-8 stdout
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

TOOLS_DIR = Path(__file__).resolve().parent
OVERRIDES_FILE = TOOLS_DIR / "real_castle_overrides.json"
CACHE_FILE = TOOLS_DIR / "cache" / "real_castles_cache.json"

HEADERS = {
    "User-Agent": "ShiroProMatomeBot/1.0 (https://github.com/OventoX/ShiroProMatome; educational tool; contact: ar265)"
}

def clean_html(text):
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def load_overrides():
    if OVERRIDES_FILE.exists():
        with open(OVERRIDES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"overrides": {}, "denylist": []}

def load_cache():
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_cache(cache):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

def make_request(url, max_retries=3):
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_time = 3 * (attempt + 1)
                print(f"HTTP 429 Too Many Requests. Waiting {wait_time}s before retry...")
                time.sleep(wait_time)
            else:
                print(f"HTTP error {e.code}: {e}")
                time.sleep(2)
        except Exception as e:
            print(f"Network error: {e}. Retrying...")
            time.sleep(2)
    return None

def fetch_wikipedia_batch(titles):
    """Fetch pageimages for a batch of titles (up to 40). Returns (success, dict title -> page_data)."""
    params = {
        "action": "query",
        "titles": "|".join(titles),
        "prop": "pageimages",
        "pithumbsize": 600,
        "redirects": 1,
        "format": "json"
    }
    url = "https://ja.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    data = make_request(url)
    if not data:
        return False, {}

    query = data.get("query", {})
    redirects_map = {}
    for r in query.get("redirects", []):
        redirects_map[r["to"]] = r["from"]

    pages = query.get("pages", {})
    results = {}
    for pid, p in pages.items():
        if "missing" in p:
            continue
        title = p.get("title")
        orig_title = redirects_map.get(title, title)
        if "thumbnail" in p:
            results[orig_title] = {
                "resolvedTitle": title,
                "photoUrl": p["thumbnail"]["source"],
                "pageimage": p.get("pageimage")
            }
        else:
            # Page exists but no thumbnail
            results[orig_title] = {
                "resolvedTitle": title,
                "photoUrl": None,
                "pageimage": None
            }
    return True, results

def fetch_image_metadata_batch(file_names):
    """Fetch image metadata for a batch of file names."""
    if not file_names:
        return {}
    titles = [f if f.startswith("File:") else f"File:{f}" for f in file_names]
    params = {
        "action": "query",
        "titles": "|".join(titles),
        "prop": "imageinfo",
        "iiprop": "extmetadata",
        "format": "json"
    }
    url = "https://ja.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    data = make_request(url)
    if not data:
        return {}

    pages = data.get("query", {}).get("pages", {})
    results = {}
    for pid, p in pages.items():
        title = p.get("title", "")
        raw_name = title.replace("ファイル:", "").replace("File:", "")
        imageinfo = p.get("imageinfo", [{}])[0]
        extmeta = imageinfo.get("extmetadata", {})
        
        author = clean_html(extmeta.get("Artist", {}).get("value", ""))
        if not author:
            author = clean_html(extmeta.get("Credit", {}).get("value", ""))
        license_name = clean_html(extmeta.get("LicenseShortName", {}).get("value", ""))
        if not license_name:
            license_name = clean_html(extmeta.get("License", {}).get("value", ""))
        
        results[raw_name] = {
            "author": author or "Wikimedia Commons",
            "license": license_name or "CC BY-SA"
        }
        results[title] = results[raw_name]
    return results

def run_fetch_real_castles(unique_base_names=None):
    overrides_data = load_overrides()
    overrides = overrides_data.get("overrides", {})
    denylist = set(overrides_data.get("denylist", []))
    cache = load_cache()

    if not unique_base_names:
        base_names_file = TOOLS_DIR / "unique_base_names.json"
        if base_names_file.exists():
            with open(base_names_file, "r", encoding="utf-8") as f:
                unique_base_names = list(json.load(f).keys())
        else:
            print("unique_base_names.json not found")
            return cache

    candidates = [b for b in unique_base_names if b not in denylist]
    to_query = [b for b in candidates if b not in cache or (cache.get(b) is None and b in overrides)]

    print(f"Total unique base names: {len(unique_base_names)}, Cached: {len(cache)}, To query: {len(to_query)}")

    batch_size = 30
    total_batches = (len(to_query) + batch_size - 1) // batch_size

    for i in range(0, len(to_query), batch_size):
        batch = to_query[i:i+batch_size]
        query_map = {} # query_title -> orig_base_name
        for b in batch:
            q_title = overrides.get(b, b)
            query_map[q_title] = b

        b_num = i // batch_size + 1
        print(f"Querying batch {b_num}/{total_batches} ({len(batch)} titles)...")
        success, page_results = fetch_wikipedia_batch(list(query_map.keys()))

        if not success:
            print(f"Skipping saving for batch {b_num} due to API failure")
            time.sleep(3)
            continue

        # Collect pageimages for metadata
        pageimages_to_fetch = []
        for q_title, res in page_results.items():
            if res.get("pageimage"):
                pageimages_to_fetch.append(res["pageimage"])

        meta_results = {}
        if pageimages_to_fetch:
            time.sleep(0.8)
            meta_results = fetch_image_metadata_batch(pageimages_to_fetch)

        # Assemble into cache
        for q_title, orig_base in query_map.items():
            if q_title in page_results:
                pres = page_results[q_title]
                if pres["photoUrl"]:
                    pimg = pres.get("pageimage")
                    meta = meta_results.get(pimg, {})
                    resolved_title = pres["resolvedTitle"]
                    cache[orig_base] = {
                        "name": resolved_title,
                        "photoUrl": pres["photoUrl"],
                        "articleUrl": f"https://ja.wikipedia.org/wiki/{urllib.parse.quote(resolved_title)}",
                        "license": meta.get("license", "CC BY-SA"),
                        "author": meta.get("author", "Wikimedia Commons")
                    }
                else:
                    # Page exists but no photo
                    cache[orig_base] = None
            else:
                # Page does not exist on Wikipedia
                cache[orig_base] = None

        save_cache(cache)
        time.sleep(1.0)

    found_count = sum(1 for b in unique_base_names if cache.get(b))
    not_found = [b for b in unique_base_names if not cache.get(b) and b not in denylist]

    print("\n==========================================")
    print("実在の城（realCastle）取得結果レポート:")
    print(f"・基本名の種類数: {len(unique_base_names)}")
    print(f"・写真・記事が取得できた基本名数: {found_count} / {len(unique_base_names)} ({(found_count/len(unique_base_names)*100):.1f}%)")
    print(f"・取得できなかった基本名数: {len(not_found)}")
    print(f"・未取得の主な基本名（先頭20件）: {not_found[:20]}")
    print("==========================================")

    return cache

if __name__ == "__main__":
    run_fetch_real_castles()
