/* Obsidian-style graph view: canvas + small force simulation, no dependencies.
   Pure helpers (match, tick) are exported for node tests. */
(function () {
  "use strict";
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var href = function (id) { return "/" + id.split("/").map(encodeURIComponent).join("/"); };
  var short = function (s) { s = s.replace(/\s*[(`].*$/, ""); return s.length > 30 ? s.slice(0, 29) + "\u2026" : s; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); };

  /* Obsidian default colours (dark / light) */
  var PAL = {
    dark:  { bg: "#1e1e1e", node: "#a3a3a3", ghost: "#5e5e5e", line: "#404040", accent: "#8b6cef", text: "#dadada", tag: "#44cf6e" },
    light: { bg: "#ffffff", node: "#707070", ghost: "#b8b8b8", line: "#d2d2d2", accent: "#7a5af5", text: "#2e3338", tag: "#08b94e" }
  };
  var GROUP_COLORS = ["#e06c75", "#e5c07b", "#98c379", "#56b6c2", "#61afef", "#c678dd"];
  var DEFAULTS = {
    search: "", tags: false, existing: false, orphans: true, depth: 1, incoming: true, outgoing: true,
    groups: [], arrows: false, fade: 0.6, size: 1, thick: 1,
    center: 0.3, repel: 10, linkForce: 1, linkDist: 250,
    open: { filters: true, groups: false, display: false, forces: false }
  };
  var ICON = {
    gear: '<svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    play: '<svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
    reset: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  /* "path:x file:y tag:z -word word": AND of tokens, as in Obsidian's search */
  function match(n, q) {
    if (!q) return true;
    return q.toLowerCase().split(/\s+/).every(function (t) {
      var neg = t.charAt(0) === "-"; if (neg) t = t.slice(1);
      if (!t) return true;
      var m, hit, id = n.id.toLowerCase();
      if ((m = /^tag:#?(.+)/.exec(t))) hit = n.tags.some(function (x) { return x.toLowerCase().indexOf(m[1]) >= 0; });
      else if ((m = /^path:(.+)/.exec(t))) hit = id.indexOf(m[1]) >= 0;
      else if ((m = /^file:(.+)/.exec(t))) hit = n.label.toLowerCase().indexOf(m[1]) >= 0;
      else hit = id.indexOf(t) >= 0;
      return neg ? !hit : hit;
    });
  }

  /* One simulation step (d3-force style: forces * alpha, velocity damping).
     ponytail: O(n^2) repulsion with a distance cutoff; fine to ~2k nodes,
     swap in a quadtree (Barnes-Hut) beyond that. */
  function tick(nodes, links, o, alpha, pinned) {
    var rep = o.repel * 60, L = o.linkDist * 0.11, g = o.center * 0.2, kL = o.linkForce * 0.8;
    var i, j, a, b, dx, dy, d2, d, f, n = nodes.length;
    for (i = 0; i < n; i++) {
      a = nodes[i];
      for (j = i + 1; j < n; j++) {
        b = nodes[j]; dx = a.x - b.x; dy = a.y - b.y; d2 = dx * dx + dy * dy;
        if (d2 > 250000) continue;
        if (d2 < 25) { d2 = 25; dx = Math.random() - .5; dy = Math.random() - .5; }
        f = rep * alpha / d2; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      a.vx -= a.x * g * alpha; a.vy -= a.y * g * alpha;
    }
    for (i = 0; i < links.length; i++) {
      a = links[i].a; b = links[i].b;
      dx = b.x - a.x; dy = b.y - a.y; d = Math.sqrt(dx * dx + dy * dy) || 1;
      f = (d - L) / d * kL * alpha / Math.min(a.deg || 1, b.deg || 1);
      dx *= f; dy *= f;
      var w = (a.deg || 1) / ((a.deg || 1) + (b.deg || 1));
      b.vx -= dx * w; b.vy -= dy * w; a.vx += dx * (1 - w); a.vy += dy * (1 - w);
    }
    for (i = 0; i < n; i++) {
      a = nodes[i];
      if (a === pinned) { a.vx = a.vy = 0; continue; }
      a.vx *= .6; a.vy *= .6; a.x += a.vx; a.y += a.vy;
    }
  }

  if (typeof module !== "undefined") module.exports = { match: match, tick: tick, DEFAULTS: DEFAULTS };
  if (typeof document === "undefined") return;

  if (document.body.classList.contains("oo-page") && /halfmoon_preferredMode=dark-mode/.test(document.cookie))
    document.documentElement.classList.add("dark-mode");
  var isDark = function () { return !!document.querySelector(".dark-mode"); };

  function start(el) {
    var full = el.dataset.mode === "full", focus = el.dataset.focus || "";
    var KEY = "oo-graph-v1";
    var S = JSON.parse(JSON.stringify(DEFAULTS));
    if (full) { try { Object.assign(S, JSON.parse(localStorage.getItem(KEY))); } catch (e) {} }
    else { S.depth = 1; S.fade = 1.5; S.center = 0.5; S.linkDist = 200; S.size = 0.9; }
    var save = function () { if (full) try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

    var cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    el.appendChild(cv);
    fetch(el.dataset.src, { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(run)
      .catch(function () { if (!full && el.parentNode) el.parentNode.style.display = "none"; });

    function run(data) {
      var lowerIds = {}; data.nodes.forEach(function (n) { lowerIds[n.id.toLowerCase()] = n.id; });
      focus = lowerIds[focus.toLowerCase()] || "";
      if (!full && !focus) { el.parentNode.style.display = "none"; return; }
      if (!full) { /* backlinks list under the small graph */
        var back = el.parentNode.querySelector(".oo-back"), names = {};
        data.nodes.forEach(function (n) { names[n.id] = n.label; });
        var ins = data.links.filter(function (l) { return l[1] === focus; }).map(function (l) { return l[0]; });
        if (back && ins.length)
          back.innerHTML = "<div class='oo-back-h'>Backlinks (" + ins.length + ")</div>" +
            ins.map(function (id) { return "<a href='" + href(id) + "'>" + esc(names[id]) + "</a>"; }).join("");
      }
      var view = focus ? "local" : "global";
      var nodes = [], links = [], byId = {}, order = {}, animLimit = null, animTimer = 0;
      var W, H, dpr = 1, T = { x: 0, y: 0, k: 1 }, hover = null, drag = null, alpha = 1, raf = 0, pending = true;

      /* page order for Animate: breadth-first from the biggest hub */
      (function () {
        var adj = {}; data.nodes.forEach(function (n) { adj[n.id] = []; });
        data.links.forEach(function (l) { adj[l[0]].push(l[1]); adj[l[1]].push(l[0]); });
        var ids = data.nodes.map(function (n) { return n.id; }).sort(function (a, b) { return adj[b].length - adj[a].length; });
        var q = [], c = 0;
        ids.forEach(function (s) {
          if (s in order) return; order[s] = c++; q.push(s);
          while (q.length) adj[q.shift()].forEach(function (t) { if (!(t in order)) { order[t] = c++; q.push(t); } });
        });
      })();

      function rebuild() {
        var pos = {}; nodes.forEach(function (n) { pos[n.id] = n; });
        var cand = data.nodes.map(function (n) { return { id: n.id, label: n.label, tags: n.tags, exists: n.exists }; });
        var ls = data.links.slice();
        if (S.tags) {
          var seen = {};
          data.nodes.forEach(function (n) {
            n.tags.forEach(function (t) {
              var id = "#" + t;
              if (!seen[id]) { seen[id] = 1; cand.push({ id: id, label: "#" + t, tags: [t], exists: true, tag: true }); }
              ls.push([n.id, id]);
            });
          });
        }
        var ok = {}; cand.forEach(function (n) { ok[n.id] = n; });
        if (view === "local" && focus) { /* BFS to depth, honouring incoming/outgoing */
          var seenL = {}; seenL[focus] = 0; var q = [focus];
          while (q.length) {
            var cur = q.shift(); if (seenL[cur] >= S.depth) continue;
            ls.forEach(function (l) {
              if (S.outgoing && l[0] === cur && !(l[1] in seenL)) { seenL[l[1]] = seenL[cur] + 1; q.push(l[1]); }
              if (S.incoming && l[1] === cur && !(l[0] in seenL)) { seenL[l[0]] = seenL[cur] + 1; q.push(l[0]); }
            });
          }
          Object.keys(ok).forEach(function (id) { if (!(id in seenL)) delete ok[id]; });
        }
        Object.keys(ok).forEach(function (id) {
          var n = ok[id];
          if (id === focus && view === "local") return;
          if ((S.existing && !n.exists) || !match(n, S.search) || (animLimit !== null && (order[id] === undefined ? 1e9 : order[id]) >= animLimit)) delete ok[id];
        });
        ls = ls.filter(function (l) { return ok[l[0]] && ok[l[1]]; });
        var deg = {}; ls.forEach(function (l) { deg[l[0]] = (deg[l[0]] || 0) + 1; deg[l[1]] = (deg[l[1]] || 0) + 1; });
        if (!S.orphans) Object.keys(ok).forEach(function (id) { if (!deg[id] && id !== focus) delete ok[id]; });

        var list = Object.keys(ok), spread = 25 * Math.sqrt(list.length + 1);
        var nbPos = {};
        ls.forEach(function (l) { if (pos[l[0]]) nbPos[l[1]] = pos[l[0]]; if (pos[l[1]]) nbPos[l[0]] = pos[l[1]]; });
        nodes = list.map(function (id) {
          var o = pos[id];
          if (!o) {
            var nb = nbPos[id];
            o = nb ? { x: nb.x + (Math.random() - .5) * 20, y: nb.y + (Math.random() - .5) * 20, vx: 0, vy: 0 }
                   : { x: (Math.random() - .5) * spread * 2, y: (Math.random() - .5) * spread * 2, vx: 0, vy: 0 };
          }
          o.id = id; o.n = ok[id]; o.deg = deg[id] || 0; return o;
        });
        byId = {}; nodes.forEach(function (n) { byId[n.id] = n; });
        links = ls.map(function (l) { return { a: byId[l[0]], b: byId[l[1]] }; });
        nodes.forEach(function (n) { n.nb = {}; });
        links.forEach(function (l) { l.a.nb[l.b.id] = 1; l.b.nb[l.a.id] = 1; });
        if (hover && !byId[hover.id]) hover = null;
        wake(1);
      }

      function radius(n) { return clamp(3.2 + Math.sqrt(n.deg) * 1.8, 3.2, 16) * S.size; }
      function groupColor(n) {
        for (var i = 0; i < S.groups.length; i++) if (S.groups[i].q && match(n.n, S.groups[i].q)) return S.groups[i].c;
        return null;
      }

      function fit() {
        if (!nodes.length) return;
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        nodes.forEach(function (n) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); });
        var k = Math.min(W / (x1 - x0 + 160), H / (y1 - y0 + 160));
        T.k = clamp(k, .1, full ? 1.6 : 1.4);
        T.x = W / 2 - (x0 + x1) / 2 * T.k; T.y = H / 2 - (y0 + y1) / 2 * T.k;
      }

      function resize() {
        dpr = window.devicePixelRatio || 1; W = el.clientWidth; H = el.clientHeight;
        cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
        draw();
      }

      function draw() {
        var p = PAL[isDark() ? "dark" : "light"];
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        if (full) { ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H); }
        ctx.setTransform(dpr * T.k, 0, 0, dpr * T.k, dpr * T.x, dpr * T.y);
        ctx.lineWidth = S.thick / T.k;
        links.forEach(function (l) {
          var on = !hover || l.a === hover || l.b === hover;
          ctx.globalAlpha = on ? 1 : .1;
          ctx.strokeStyle = hover && on ? p.accent : p.line; ctx.fillStyle = ctx.strokeStyle;
          ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
          if (S.arrows) {
            var dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.hypot(dx, dy) || 1, r = radius(l.b);
            var ux = dx / d, uy = dy / d, tx = l.b.x - ux * (r + 1), ty = l.b.y - uy * (r + 1), s = 6 / T.k;
            ctx.beginPath(); ctx.moveTo(tx, ty);
            ctx.lineTo(tx - ux * s - uy * s * .5, ty - uy * s + ux * s * .5);
            ctx.lineTo(tx - ux * s + uy * s * .5, ty - uy * s - ux * s * .5); ctx.fill();
          }
        });
        nodes.forEach(function (n) {
          ctx.globalAlpha = !hover || n === hover || hover.nb[n.id] ? 1 : .15;
          ctx.fillStyle = n === hover || (view === "local" && n.id === focus) ? p.accent
            : (n.n.tag ? p.tag : groupColor(n) || (n.n.exists ? p.node : p.ghost));
          ctx.beginPath(); ctx.arc(n.x, n.y, radius(n), 0, 6.2832); ctx.fill();
        });
        var thr = S.fade * 1.2;
        ctx.textAlign = "center"; ctx.fillStyle = p.text;
        ctx.font = (12 / T.k) + "px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
        nodes.forEach(function (n) {
          var near = hover && (n === hover || hover.nb[n.id]);
          var a = near ? 1 : (hover ? 0 : clamp((T.k * (1 + .12 * Math.sqrt(n.deg)) - thr) / .35, 0, 1));
          if (a < .03) return;
          ctx.globalAlpha = a; ctx.fillText(short(n.n.label), n.x, n.y + radius(n) + 13 / T.k);
        });
        ctx.globalAlpha = 1;
      }

      function frame() {
        raf = 0;
        if (alpha > .003) { tick(nodes, links, S, alpha, drag); alpha *= .985; draw(); raf = requestAnimationFrame(frame); }
        else draw();
      }
      function wake(a) {
        alpha = Math.max(alpha, a);
        if (pending && W) { /* first layout: settle off-screen so the view opens already readable */
          pending = false;
          for (var i = 0; i < 250; i++) { tick(nodes, links, S, alpha, null); alpha *= .985; }
          alpha = .08; fit();
        }
        if (!raf) raf = requestAnimationFrame(frame);
      }

      function toWorld(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - T.x) / T.k, y: (e.clientY - r.top - T.y) / T.k }; }
      function pick(e) {
        var w = toWorld(e), best = null, bd = 1e9;
        nodes.forEach(function (n) { var d = Math.hypot(n.x - w.x, n.y - w.y); if (d < radius(n) + 4 / T.k && d < bd) { best = n; bd = d; } });
        return best;
      }
      var panning = null, moved = false;
      cv.addEventListener("pointerdown", function (e) {
        cv.setPointerCapture(e.pointerId); moved = false;
        var n = pick(e); if (n) drag = n; else panning = { x: e.clientX - T.x, y: e.clientY - T.y };
      });
      cv.addEventListener("pointermove", function (e) {
        if (drag) { var w = toWorld(e); drag.x = w.x; drag.y = w.y; moved = true; wake(.3); return; }
        if (panning) { T.x = e.clientX - panning.x; T.y = e.clientY - panning.y; moved = true; draw(); return; }
        var h = pick(e); if (h !== hover) { hover = h; cv.style.cursor = h ? "pointer" : "grab"; draw(); }
      });
      cv.addEventListener("pointerup", function (e) {
        if (drag && !moved) { var u = href(drag.id); if (e.ctrlKey || e.metaKey) window.open(u); else location.href = u; }
        drag = null; panning = null;
      });
      if (full) cv.addEventListener("wheel", function (e) {
        e.preventDefault();
        var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        var k = clamp(T.k * Math.exp(-e.deltaY * .0015), .05, 8);
        T.x = mx - (mx - T.x) * k / T.k; T.y = my - (my - T.y) * k / T.k; T.k = k; draw();
      }, { passive: false });
      window.addEventListener("resize", resize);
      new MutationObserver(draw).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ["class"] });

      function animate() {
        clearInterval(animTimer);
        nodes.forEach(function (n) { n.x = n.y = n.vx = n.vy = 0; }); nodes = [];
        var total = data.nodes.length, step = Math.max(1, Math.ceil(total / 90));
        animLimit = 1; T.k = .8; T.x = W / 2; T.y = H / 2; pending = false; rebuild();
        animTimer = setInterval(function () {
          animLimit += step; if (animLimit > total + (S.tags ? 1e6 : 0)) { animLimit = null; clearInterval(animTimer); }
          rebuild();
        }, 45);
      }

      /* ---- settings panel (full view only) ---- */
      if (full) {
        var ctl = document.createElement("div"); ctl.className = "oo-ctl";
        el.appendChild(ctl);
        var panelOpen = false;
        var row = function (label, ctrl) { return "<div class='oo-row2'><span>" + label + "</span>" + ctrl + "</div>"; };
        var tog = function (k) { return "<label class='oo-sw'><input type='checkbox' data-k='" + k + "'" + (S[k] ? " checked" : "") + "><i></i></label>"; };
        var rng = function (k, a, b, s) { return "<input type='range' data-k='" + k + "' min='" + a + "' max='" + b + "' step='" + s + "' value='" + S[k] + "'>"; };
        var sec = function (id, title, body) {
          return "<div class='oo-sec" + (S.open[id] ? " open" : "") + "'><div class='oo-sec-h' data-sec='" + id + "'>" + ICON.chev + title + "</div><div class='oo-sec-b'>" + body + "</div></div>";
        };
        var render = function () {
          var ph = "<div class='oo-ph'><button data-act='reset' title='Restore default settings'>" + ICON.reset + "</button><button data-act='close' title='Close'>" + ICON.x + "</button></div>";
          var filters = "<input type='search' data-k='search' placeholder='Search files...' value='" + esc(S.search) + "'>" +
            (focus ? row("Local graph", "<select data-k='view'><option value='global'" + (view === "global" ? " selected" : "") + ">Global</option><option value='local'" + (view === "local" ? " selected" : "") + ">Local</option></select>") : "") +
            (focus && view === "local" ? row("Depth", rng("depth", 1, 5, 1)) + row("Incoming links", tog("incoming")) + row("Outgoing links", tog("outgoing")) : "") +
            row("Tags", tog("tags")) + row("Existing files only", tog("existing")) + row("Orphans", tog("orphans"));
          var groups = S.groups.map(function (g, i) {
            return "<div class='oo-grp'><input type='color' data-g='" + i + "' data-f='c' value='" + g.c + "'><input type='text' data-g='" + i + "' data-f='q' placeholder='Enter query...' value='" + esc(g.q) + "'><button data-act='delg' data-i='" + i + "'>" + ICON.x + "</button></div>";
          }).join("") + "<button class='oo-btn' data-act='newg'>New group</button>";
          var display = row("Arrows", tog("arrows")) + row("Text fade threshold", rng("fade", 0, 1, .01)) +
            row("Node size", rng("size", .2, 3, .05)) + row("Link thickness", rng("thick", .3, 4, .1)) +
            row("Animate", "<button class='oo-btn' data-act='anim'>Start</button>");
          var forces = row("Center force", rng("center", 0, 1, .01)) + row("Repel force", rng("repel", 0, 20, .1)) +
            row("Link force", rng("linkForce", 0, 1, .01)) + row("Link distance", rng("linkDist", 30, 500, 1));
          ctl.innerHTML = "<button class='oo-fab' data-act='gear' title='Graph settings'>" + ICON.gear + "</button>" +
            "<button class='oo-fab' data-act='anim' title='Animate'>" + ICON.play + "</button>" +
            "<a class='oo-home' href='/'>&larr; Back to wiki</a>" +
            "<div class='oo-stat'>" + nodes.length + " nodes &middot; " + links.length + " links</div>" +
            (panelOpen ? "<div class='oo-panel2'>" + ph + sec("filters", "Filters", filters) + sec("groups", "Groups", groups) + sec("display", "Display", display) + sec("forces", "Forces", forces) + "</div>" : "");
        };
        var rebuildKeys = { search: 1, tags: 1, existing: 1, orphans: 1, depth: 1, incoming: 1, outgoing: 1 };
        var forceKeys = { center: 1, repel: 1, linkForce: 1, linkDist: 1 };
        ctl.addEventListener("input", function (e) {
          var t = e.target, k = t.dataset.k;
          if (t.dataset.g !== undefined) { S.groups[+t.dataset.g][t.dataset.f] = t.value; save(); draw(); return; }
          if (!k) return;
          if (k === "view") { view = t.value; save(); rebuild(); render(); return; }
          S[k] = t.type === "checkbox" ? t.checked : (t.type === "search" || t.type === "text" ? t.value : parseFloat(t.value));
          save();
          if (rebuildKeys[k]) { rebuild(); ctl.querySelector(".oo-stat").innerHTML = nodes.length + " nodes &middot; " + links.length + " links"; }
          else if (forceKeys[k]) wake(.7); else draw();
        });
        ctl.addEventListener("click", function (e) {
          var b = e.target.closest("[data-act],[data-sec]"); if (!b) return;
          if (b.dataset.sec) { S.open[b.dataset.sec] = !S.open[b.dataset.sec]; save(); render(); return; }
          var a = b.dataset.act;
          if (a === "gear") panelOpen = !panelOpen;
          else if (a === "close") panelOpen = false;
          else if (a === "reset") { S = JSON.parse(JSON.stringify(DEFAULTS)); save(); rebuild(); }
          else if (a === "newg") S.groups.push({ q: "", c: GROUP_COLORS[S.groups.length % GROUP_COLORS.length] });
          else if (a === "delg") S.groups.splice(+b.dataset.i, 1);
          else if (a === "anim") { animate(); return; }
          save(); render(); draw();
        });
      }

      resize(); rebuild(); if (full) render(); cv.style.cursor = "grab";
    }
  }

  function boot() { document.querySelectorAll(".oo-graph").forEach(start); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
