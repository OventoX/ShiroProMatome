import html
import re
import time
import urllib.parse
from pathlib import Path

import requests

BASE = "https://scre.swiki.jp/index.php"
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / "cache" / "raw"
CACHE.mkdir(parents=True, exist_ok=True)
SLEEP = 2.5

_session = requests.Session()
_session.headers["User-Agent"] = "Mozilla/5.0 (personal-use scre-helper; low-rate)"
_last = [0.0]


def enc(page: str) -> str:
    return urllib.parse.quote(page.encode("utf-8"))


def safe_name(page: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "_", page)


def fetch_source(page: str, refresh: bool = False) -> str | None:
    path = CACHE / (safe_name(page) + ".txt")
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8")
    wait = SLEEP - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    url = f"{BASE}?cmd=source&page={enc(page)}"
    for attempt in range(3):
        try:
            r = _session.get(url, timeout=30)
            _last[0] = time.time()
            break
        except requests.RequestException:
            time.sleep(5 * (attempt + 1))
    else:
        return None
    text = r.content.decode("utf-8", errors="replace")
    m = re.search(r'<pre id="source">(.*?)</pre>', text, re.S)
    if not m:
        return None
    src = html.unescape(m.group(1))
    path.write_text(src, encoding="utf-8")
    return src


def wiki_links(src: str) -> list[str]:
    """Extract [[page]] / [[alias>page]] targets."""
    out = []
    for m in re.finditer(r"\[\[([^\]]+?)\]\]", src):
        t = m.group(1)
        if ">" in t:
            t = t.split(">", 1)[1]
        t = t.split("#", 1)[0].strip()
        if t and not t.startswith("http"):
            out.append(t)
    return out

