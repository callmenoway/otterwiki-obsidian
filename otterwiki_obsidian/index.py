"""Link index of the wiki: pages, wikilinks, tags. Pure functions, no Flask.

`build(read, files, style)` is testable on its own; `get(storage, style)` adds
a cache keyed on the git HEAD sha (valid across uwsgi workers, no invalidation
hooks needed).
"""

import re
import urllib.parse
from collections import defaultdict
from html import escape

try:
    import yaml
except ImportError:  # tags are optional
    yaml = None

FENCE = re.compile(r"```.*?```|~~~.*?~~~", re.S)
INLINE_CODE = re.compile(r"`[^`\n]*`")
FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.S)
WIKILINK = re.compile(r"\[\[([^|\]]+)(?:\|([^\]]+))?\]\]")
MDLINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")


def parse(content, style=""):
    """-> (tags, raw link targets, title) of one page; title is the first H1."""
    tags = []
    m = FRONTMATTER.match(content or "")
    if m:
        content = content[m.end():]
        if yaml:
            try:
                fm = yaml.safe_load(m.group(1))
                t = fm.get("tags") if isinstance(fm, dict) else None
                if isinstance(t, str):
                    t = re.split(r"[,\s]+", t)
                tags = [str(x).lstrip("#") for x in (t or []) if x]
            except yaml.YAMLError:
                pass
    content = FENCE.sub("", content or "")
    h1 = re.search(r"^#\s+(.+?)\s*#*\s*$", content, re.M)
    content = INLINE_CODE.sub("", content)
    links = []
    title_first = style.upper().replace("_", "").strip() not in (
        "LINKTITLE",
        "PAGENAMETITLE",
    )
    for a, b in WIKILINK.findall(content):
        # default style is [[title|page]], LINK_TITLE is [[page|title]]
        links.append(((b or a) if title_first else a, True))
    for target in MDLINK.findall(content):
        if not re.match(r"^([a-z][a-z0-9+.-]*:|#|//)", target, re.I):
            links.append((target, False))
    return tags, links, h1.group(1) if h1 else ""


def _clean(raw):
    t = urllib.parse.unquote(raw).split("#")[0].split("?")[0].strip().strip("/")
    return t[:-3] if t.lower().endswith(".md") else t


def build(read, files, style=""):
    """read(filename) -> text; files: filenames in the repo.

    -> {"nodes": [{id,label,folder,tags,exists}], "links": [[src,tgt]]}
    """
    paths = sorted(
        f[:-3] for f in files if f.endswith(".md") and not f.startswith(".")
    )
    by_lower = {p.lower(): p for p in paths}
    by_base = defaultdict(list)
    for p in paths:
        by_base[p.rsplit("/", 1)[-1].lower()].append(p)

    ghosts = {}  # lower -> id of links to pages that do not exist (yet)

    def resolve(raw, wiki):
        t = _clean(raw)
        if not t:
            return None
        hit = by_lower.get(t.lower())
        if hit is None and "/" not in t and len(by_base.get(t.lower(), [])) == 1:
            hit = by_base[t.lower()][0]  # Obsidian-style shortest path match
        if hit or not wiki:  # plain markdown links never create ghost nodes
            return hit
        return ghosts.setdefault(t.lower(), t)

    nodes, links = {}, set()
    for p in paths:
        tags, raw, title = parse(read(p + ".md"), style)
        nodes[p] = dict(id=p, tags=tags, exists=True, title=title)
        for r, wiki in raw:
            t = resolve(r, wiki)
            if t and t != p:
                links.add((p, t))
    for g in ghosts.values():
        nodes.setdefault(g, dict(id=g, tags=[], exists=False))
    for n in nodes.values():
        n["label"] = n.pop("title", "") or n["id"].rsplit("/", 1)[-1]
        n["folder"] = n["id"].rsplit("/", 1)[0] if "/" in n["id"] else ""
    return dict(nodes=list(nodes.values()), links=sorted(map(list, links)))


def tree_html(paths, current, href):
    """Nested file tree (folders first, A-Z), the active page's folders open.
    paths: {path: label}."""
    root, labels = {}, {}
    for p in paths:
        d = root
        *dirs, leaf = p.split("/")
        for part in dirs:
            d = d.setdefault(part + "/", {})
        d[leaf] = p
        labels[p] = paths[p]
    cur = (current or "").lower()

    def render(d, prefix):
        out = []
        for k in sorted(d, key=lambda k: (not k.endswith("/"), k.lower())):
            v = d[k]
            if isinstance(v, dict):
                fp = prefix + k[:-1]
                op = " is-open" if cur.startswith(fp.lower() + "/") else ""
                out.append(
                    f'<div class="oo-folder{op}" data-p="{escape(fp)}">'
                    f'<div class="oo-row oo-title"><svg class="oo-chev" viewBox="0 0 24 24">'
                    f'<path d="M9 6l6 6-6 6"/></svg><span>{escape(k[:-1])}</span></div>'
                    f'<div class="oo-children">{render(v, fp + "/")}</div></div>'
                )
            else:
                act = " is-active" if v.lower() == cur else ""
                out.append(
                    f'<div class="oo-row oo-file{act}"><a href="{escape(href(v))}">'
                    f"{escape(k)}</a></div>"
                )
        return "".join(out)

    return render(root, "")


_cache = {}


def get(storage, style=""):
    try:
        key = (storage.repo.head.commit.hexsha, style)
    except Exception:  # empty repo
        key = None
    if key is None or _cache.get("key") != key:
        files, _ = storage.list()
        data = build(lambda f: storage.load(f), files, style)
        if key is None:
            return data
        _cache.update(key=key, data=data)
    return _cache["data"]
