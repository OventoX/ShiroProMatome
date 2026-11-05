"""Convert cached PukiWiki sources into NotebookLM-friendly Markdown bundles."""
import json
import re
from pathlib import Path

from common import ROOT, safe_name

RAW = ROOT / "tools" / "cache" / "raw"
OUT = ROOT / "notebooklm"
MAX_CHARS = 350_000  # per output file (well under NotebookLM's per-source limit)

DROP_HEADINGS = ("キャラクターボイス", "ボイス", "コメント", "台詞", "現実の城", "元ネタ",
                 "議論板", "画像", "イラスト", "SD", "ドット")
SKIP_DIRECTIVES = re.compile(
    r"^#(include|br|BR|contents|tablesort|table_edit2|pcomment|comment|counter|ref|clear|"
    r"style|region|endregion|lsx|ls2|ls|norelated|freeze|nofollow|hr|setlinebreak|"
    r"article|vote|navi|topicpath|aname|attachref|related|calendar|tag)\b")
FMT_PREFIX = re.compile(
    r"^(?:(?:BGCOLOR|COLOR|SIZE)\([^)]*\)|CENTER|LEFT|RIGHT|BOTTOM|TOP|MIDDLE|~)\s*:\s*")


def inline(s: str) -> str:
    s = re.sub(r"^(?:RIGHT|LEFT|CENTER):", "", s)
    s = re.sub(r"&edit\([^)]*\)(\{[^}]*\})?;?", "", s)
    s = re.sub(r"&uploader\([^)]*\);?", "", s)
    s = re.sub(r"&(?:attachref|ref)\(([^)]*)\);?", _ref, s)
    s = re.sub(r"&br;?", " / ", s)
    for _ in range(3):  # nested
        s = re.sub(r"(?:BG)?COLOR\([^)]*\)\{([^{}]*)\}", r"\1", s)
        s = re.sub(r"&(?:color|size|font|ruby|sup|sub)\([^)]*\)\{([^{}]*)\};?", r"\1", s)
        s = re.sub(r"&(?:color|size)\{([^{}]*)\};?", r"\1", s)
    s = re.sub(r"&new\{[^}]*\};?", "", s)
    s = re.sub(r"&(?:emsp|ensp|nbsp|thinsp);", " ", s)
    s = re.sub(r"&aname\([^)]*\)(\{[^}]*\})?;?", "", s)
    s = re.sub(r"&tag\([^)]*\);?", "", s)
    s = re.sub(r"\[\[([^\]>]+?)>[^\]]+?\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]+?)\]\]", lambda m: m.group(1).split("#")[0], s)
    s = re.sub(r"\(\((.+?)\)\)", r"（注: \1）", s)
    s = s.replace("'''", "").replace("''", "").replace("%%", "")
    s = re.sub(r"\[#[0-9a-zA-Z_\-]+\]", "", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()


def _ref(m: re.Match) -> str:
    arg = m.group(1).split(",")[0]
    stem = re.sub(r"\.(png|jpg|jpeg|gif|webp)$", "", arg.split("/")[-1], flags=re.I)
    # keep tiny icon names such as 山 / 水 / 刀 / 平山 (attribute & weapon icons)
    return f" {stem} " if 0 < len(stem) <= 4 and not re.search(r"[A-Za-z0-9]", stem) else ""


def table_row(line: str) -> str | None:
    body = line.rstrip()
    if re.search(r"\|[chf]$", body):
        if body.endswith("|c"):
            return None  # format row
        body = body[:-1]
    cells = body.strip("|").split("|")
    out = []
    for c in cells:
        c = c.strip()
        while True:
            n = FMT_PREFIX.sub("", c)
            if n == c:
                break
            c = n
        if len(c) > 1 and c.startswith("~"):
            c = c[1:]
        if c in (">", "~", ""):
            continue
        c = inline(c)
        if c:
            out.append(c)
    return " | ".join(out) if out else None


def convert(src: str, title: str) -> str:
    lines_out = [f"# {title}", ""]
    dropping = False
    in_block = 0
    for raw in src.splitlines():
        line = raw.rstrip()
        if line.startswith("//"):
            continue
        if line.strip() in ("}}}", "}}"):
            continue
        if re.match(r"^#\w+.*\{\{\{?$", line):  # block directive opener
            continue
        m = re.match(r"^(\*{1,3})\s*(.*)", line)
        if m:
            h = inline(m.group(2))
            dropping = any(k in h for k in DROP_HEADINGS)
            if not dropping and h:
                lines_out += ["", "#" * (len(m.group(1)) + 1) + " " + h]
            continue
        if dropping:
            continue
        if SKIP_DIRECTIVES.match(line) or line.startswith("#"):
            continue
        if line.startswith("|"):
            r = table_row(line)
            if r:
                lines_out.append("- " + r)
            continue
        if line.startswith(("-", "+")):
            depth = len(re.match(r"^[-+]+", line).group(0))
            t = inline(line[depth:])
            if t:
                lines_out.append("  " * (depth - 1) + "- " + t)
            continue
        t = inline(line.rstrip("~"))
        if t:
            lines_out.append(t)
    text = "\n".join(lines_out)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def load(page: str) -> str | None:
    p = RAW / (safe_name(page) + ".txt")
    return p.read_text(encoding="utf-8") if p.exists() else None


def write_bundles(prefix: str, docs: list[str], header: str) -> list[str]:
    files, buf, n = [], [], 1
    size = 0

    def flush():
        nonlocal buf, size, n
        if not buf:
            return
        name = f"{prefix}_{n:02d}.md"
        (OUT / name).write_text(header + "\n\n" + "\n\n---\n\n".join(buf), encoding="utf-8")
        files.append(name)
        buf, size, n = [], 0, n + 1

    for d in docs:
        if size + len(d) > MAX_CHARS:
            flush()
        buf.append(d)
        size += len(d)
    flush()
    return files


def main():
    from fetch_all import SYSTEM_PAGES
    OUT.mkdir(exist_ok=True)
    for f in OUT.glob("*.md"):
        f.unlink()
    idx = json.loads((ROOT / "tools" / "cache" / "castles_index.json").read_text(encoding="utf-8"))
    note = ("出典: 御城プロジェクト:RE 攻略 wiki (https://scre.swiki.jp/) の公開情報を個人利用目的で"
            "テキスト化したもの。")

    sys_docs = [convert(s, p) for p in SYSTEM_PAGES if (s := load(p))]
    made = write_bundles("00_システム", sys_docs, f"# 城プロRE システム・用語・一覧\n{note}")

    groups = {7: "★7", 6: "★6", 5: "★5"}
    by: dict[str, list[str]] = {}
    missing = []
    for c in sorted(idx, key=lambda c: c["no"]):
        s = load(c["page"])
        if not s:
            missing.append(c["page"])
            continue
        key = groups.get(c["rarity"], "★1-4")
        doc = convert(s, f"{c['page']}（城娘 / ★{c['rarity']} / No.{c['no']}）")
        by.setdefault(key, []).append(doc)
    for key in ["★7", "★6", "★5", "★1-4"]:
        if key in by:
            made += write_bundles(f"城娘{key}", by[key], f"# 城プロRE 城娘データ {key}\n{note}")
    total = sum((OUT / f).stat().st_size for f in made)
    print(f"files={len(made)} total={total/1e6:.1f}MB missing={len(missing)}")
    for f in made:
        print(f, f"{(OUT / f).stat().st_size/1e3:.0f}KB")
    if missing:
        print("missing:", missing[:20])


if __name__ == "__main__":
    main()
