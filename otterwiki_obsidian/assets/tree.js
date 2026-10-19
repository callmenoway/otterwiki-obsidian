/* File tree: collapse state (localStorage), filter, collapse-all. */
(function () {
  var KEY = "oo-open";
  var root = document.querySelector(".oo-tree");
  if (!root) return;
  var load = function () { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  var save = function (s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  var state = load();
  var folders = root.querySelectorAll(".oo-folder");

  folders.forEach(function (f) { if (state[f.dataset.p]) f.classList.add("is-open"); });
  var active = root.querySelector(".oo-file.is-active");
  if (active) active.scrollIntoView({ block: "nearest" });

  root.addEventListener("click", function (e) {
    var t = e.target.closest(".oo-title");
    if (!t) return;
    var f = t.parentNode, open = f.classList.toggle("is-open");
    if (open) state[f.dataset.p] = 1; else delete state[f.dataset.p];
    save(state);
  });

  root.querySelector(".oo-collapse").addEventListener("click", function () {
    folders.forEach(function (f) { f.classList.remove("is-open"); });
    state = {}; save(state);
  });

  var input = root.querySelector(".oo-filter");
  input.addEventListener("input", function () {
    var q = input.value.trim().toLowerCase();
    root.classList.toggle("is-filtering", !!q);
    root.querySelectorAll(".oo-file, .oo-folder").forEach(function (n) { n.classList.remove("oo-hide", "oo-match"); });
    if (!q) return;
    root.querySelectorAll(".oo-file").forEach(function (n) {
      var hit = n.textContent.toLowerCase().indexOf(q) >= 0;
      n.classList.add(hit ? "oo-match" : "oo-hide");
    });
    // folders stay visible (and expanded, via CSS) only if a descendant matches
    folders.forEach(function (f) { if (!f.querySelector(".oo-match")) f.classList.add("oo-hide"); });
  });
})();
