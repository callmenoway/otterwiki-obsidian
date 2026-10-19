"""Run: python -m pytest tests  (or: python tests/test_index.py)"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "otterwiki_obsidian"))
import index

FILES = {
    "Home.md": "---\ntags: [a, b]\n---\n# Welcome\nsee [[Intro]] and [[the intro|A/Deep]] `[[nope]]`\n```\n[[fenced]]\n```",
    "A/Deep.md": "back to [Home](/Home) and [x](https://ex.com) and [[Missing Page]]",
    "Intro.md": "[[Home#sec]] [[Deep]]",
    "logo.png": "",
}


def test_build():
    g = index.build(lambda f: FILES[f], FILES)
    ids = {n["id"]: n for n in g["nodes"]}
    assert ids["Home"]["label"] == "Welcome"
    assert set(ids) == {"Home", "A/Deep", "Intro", "Missing Page"}
    assert ids["Home"]["tags"] == ["a", "b"] and not ids["Missing Page"]["exists"]
    assert ["Home", "Intro"] in g["links"] and ["Home", "A/Deep"] in g["links"]
    assert ["Intro", "A/Deep"] in g["links"]  # [[Deep]] -> shortest-path match
    assert ["A/Deep", "Home"] in g["links"] and ["A/Deep", "Missing Page"] in g["links"]
    assert not any("nope" in l[1] or "fenced" in l[1] or "ex.com" in l[1] for l in g["links"])


def test_link_title_style():
    _, links, _ = index.parse("[[A/Deep|label]]", "LINK_TITLE")
    assert links == [("A/Deep", True)]


def test_md_links_make_no_ghosts():
    f = {"Home.md": "[reg](/-/register) [e](/Home/edit)"}
    assert index.build(lambda x: f[x], f)["links"] == []


def test_tree():
    h = index.tree_html({"A/B/c": "c", "A/d": "d", "e": "e"}, "A/B/c", lambda p: "/" + p)
    assert h.count("is-active") == 1 and h.count("is-open") == 2 and h.index("A") < h.index(">e<")


def test_tree_display_names():
    h = index.tree_html({"projects/aurora": "Projects/Aurora Engine", "zeta": "Alpha"}, "", lambda p: "/" + p)
    assert ">Projects<" in h and ">Aurora Engine<" in h and 'data-p="projects"' in h
    assert 'href="/projects/aurora"' in h and h.index(">Alpha<") > h.index(">Projects<")
    assert "&lt;b&gt;" in index.tree_html({"x": "<b>"}, "", lambda p: "/" + p)


if __name__ == "__main__":
    test_build(); test_link_title_style(); test_md_links_make_no_ghosts(); test_tree(); test_tree_display_names(); print("ok")
