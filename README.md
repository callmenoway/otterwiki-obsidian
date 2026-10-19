# otterwiki-obsidian

Obsidian-style navigation for [An Otter Wiki](https://otterwiki.com), as a standalone plugin:

- **File tree** in the left sidebar: collapsible folders, active page highlighted, filter box, collapse-all, state remembered.
- **Graph view** (`/-/plugin/obsidian/graph`): force-directed canvas graph with Obsidian's look and settings panel
  (Filters, Groups, Display, Forces), local graph with depth, animate, light/dark.
- **Local graph + backlinks** for the current page in the right sidebar.

No dependencies, no JS libraries, read-only (never writes pages or the database).
Respects the wiki's read permission. Needs Otterwiki >= 2.20 (pluggy plugin API).

## Install

```
pip install .
```

Otterwiki discovers it through the `otterwiki` entry point. Docker: see `scripts/install.sh`.

## Disable / uninstall

- Disable without uninstalling: set env `OTTERWIKI_OBSIDIAN_DISABLE=1` and restart.
- Uninstall: `pip uninstall otterwiki_obsidian` (Docker: `scripts/uninstall.sh`).

## Develop

```
python3 tests/test_index.py     # backend logic
node --check otterwiki_obsidian/assets/graph.js
```

MIT licensed.
