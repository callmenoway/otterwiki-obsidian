"""Obsidian-style file tree + graph view for An Otter Wiki.

Pure plugin: it only registers pluggy hooks. It never writes to the
repository or the database. Set OTTERWIKI_OBSIDIAN_DISABLE=1 to turn it off
without uninstalling.
"""

import json
import os
from functools import wraps
from pathlib import Path
from urllib.parse import quote

from flask import Response, request, url_for

from otterwiki.plugins import hookimpl, plugin_manager

from . import index

__version__ = "0.1.0"
NAME = "obsidian"
ASSETS = Path(__file__).parent / "assets"
MIME = {
    ".js": "text/javascript",
    ".css": "text/css",
}


def safe(default=None):
    """A bug here must never break a wiki page: log and return `default`."""

    def deco(fn):
        @wraps(fn)
        def wrapper(self, *a, **kw):
            try:
                return fn(self, *a, **kw)
            except Exception:
                self.app.logger.exception("otterwiki_obsidian: %s failed", fn.__name__)
                return default

        return wrapper

    return deco


def href(path):
    return "/" + "/".join(quote(p) for p in path.split("/"))


class ObsidianPlugin:
    @hookimpl
    def setup(self, app, db, storage):
        self.app, self.storage = app, storage

    def _url(self, extra):
        return url_for("plugin_url_request", name=NAME, extra=extra, v=__version__)

    def _data(self):
        return index.get(self.storage, self.app.config.get("WIKILINK_STYLE", ""))

    @hookimpl
    def info(self):
        return (NAME, "Obsidian-style file tree and graph view", "Navigation")

    @hookimpl
    @safe()
    def template_html_head_inject(self, page):
        return f'<link rel="stylesheet" href="{self._url("tree.css")}">'

    @hookimpl
    @safe()
    def template_html_sidebar_left_inject(self, page):
        from otterwiki.auth import has_permission

        if not has_permission("READ"):
            return None
        paths = {n["id"]: n["label"] for n in self._data()["nodes"] if n["exists"]}
        graph = url_for("plugin_url_request", name=NAME, extra="graph")
        return (
            '<details class="collapse-panel oo-panel" open>'
            '<summary class="collapse-header">Files</summary>'
            '<div class="collapse-content oo-tree">'
            '<div class="oo-tools">'
            '<input type="search" class="oo-filter" placeholder="Filter files…" aria-label="Filter files">'
            '<button type="button" class="oo-collapse" title="Collapse all">⊟</button>'
            f'<a class="oo-graph-btn" href="{graph}" title="Open graph view">Graph</a>'
            "</div>"
            f'<div class="oo-root">{index.tree_html(paths, page, href)}</div>'
            "</div></details>"
            f'<script src="{self._url("tree.js")}" defer></script>'
        )

    @hookimpl
    @safe()
    def template_html_sidebar_right_inject(self, page):
        from otterwiki.auth import has_permission

        if not (page and has_permission("READ")):
            return None
        return (
            '<div class="oo-local">'
            '<div class="oo-local-head">Graph view'
            f'<a href="{url_for("plugin_url_request", name=NAME, extra="graph")}?focus={quote(page)}" title="Open full graph">⤢</a></div>'
            f'<div class="oo-graph" data-mode="embed" data-src="{self._url("data.json")}" '
            f'data-focus="{page}" style="height:220px"></div>'
            '<div class="oo-back"></div></div>'
            f'<link rel="stylesheet" href="{self._url("graph.css")}">'
            f'<script src="{self._url("graph.js")}" defer></script>'
        )

    @hookimpl
    @safe()
    def url_request(self, plugin, extra, method="GET", values=None):
        if plugin != NAME:
            return None
        from otterwiki.auth import has_permission

        if not has_permission("READ"):
            return None  # -> 404, same as an unreadable page
        if extra == "data.json":
            return Response(json.dumps(self._data()), mimetype="application/json")
        if extra == "graph":
            focus = (values or request.values).get("focus", "")
            return Response(self._graph_page(focus), mimetype="text/html")
        f = ASSETS / extra
        if extra in ("tree.js", "tree.css", "graph.js", "graph.css"):
            return Response(
                f.read_text(encoding="utf-8"),
                mimetype=MIME[f.suffix],
                headers={"Cache-Control": "public, max-age=300"},
            )
        return None

    def _graph_page(self, focus):
        from html import escape

        return (
            '<!doctype html><html><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f"<title>Graph view</title>"
            f'<link rel="stylesheet" href="{self._url("graph.css")}"></head>'
            '<body class="oo-page">'
            f'<div class="oo-graph" data-mode="full" data-src="{self._url("data.json")}" '
            f'data-focus="{escape(focus, quote=True)}"></div>'
            f'<script src="{self._url("graph.js")}"></script></body></html>'
        )


if not os.environ.get("OTTERWIKI_OBSIDIAN_DISABLE"):
    plugin_manager.register(ObsidianPlugin())
