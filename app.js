/* Barpath — app.js
   All app logic: persistence, periodization, routing, views,
   gamification, rest timer, muscle avatars. Vanilla JS, no deps. */
(function () {
  "use strict";

  var D = window.BARPATH_DATA;
  var KEY = "barpath:v1";
  var DAY_MS = 86400000;
  var rm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ============================================================
     tiny helpers
     ============================================================ */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function ymd(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  }
  function todayYmd() { return ymd(new Date()); }
  function parseYmd(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / DAY_MS); }
  function startOfWeek(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; } // Sunday
  function isoWeekKey(d) {
    var t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    var wk1 = new Date(t.getFullYear(), 0, 4);
    var n = 1 + Math.round(((t - wk1) / DAY_MS - 3 + ((wk1.getDay() + 6) % 7)) / 7);
    return t.getFullYear() + "-W" + n;
  }
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /* ============================================================
     store: load / migrate / save  (never crash on missing fields)
     ============================================================ */
  function defaultState() {
    return {
      v: 1, createdAt: new Date().toISOString(),
      activeProgram: null, startedAt: null, weekOffset: 0,
      xp: 0, badges: {}, streak: 0, lastWorkoutDate: null, freezes: 0,
      history: [], programsTried: {}, prs: {}, steps: {}, stepGoal: 8000,
      progress: {}, claimedChallenges: {}
    };
  }
  function migrate(s) {
    var d = defaultState();
    if (!s || typeof s !== "object") return d;
    for (var k in d) if (!(k in s) || s[k] == null) s[k] = d[k];
    // type guards
    if (typeof s.xp !== "number" || isNaN(s.xp)) s.xp = 0;
    if (typeof s.streak !== "number") s.streak = 0;
    if (typeof s.freezes !== "number") s.freezes = 0;
    if (typeof s.weekOffset !== "number") s.weekOffset = 0;
    if (!s.badges || typeof s.badges !== "object") s.badges = {};
    if (!Array.isArray(s.history)) s.history = [];
    if (!s.prs || typeof s.prs !== "object") s.prs = {};
    if (!s.steps || typeof s.steps !== "object") s.steps = {};
    if (!s.progress || typeof s.progress !== "object") s.progress = {};
    if (!s.programsTried || typeof s.programsTried !== "object") s.programsTried = {};
    if (!s.claimedChallenges || typeof s.claimedChallenges !== "object") s.claimedChallenges = {};
    if (!s.stepGoal) s.stepGoal = 8000;
    return s;
  }
  var S;
  function load() {
    try { S = migrate(JSON.parse(localStorage.getItem(KEY))); }
    catch (e) { S = defaultState(); }
  }
  var saveTimer = null;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }

  /* ============================================================
     program + periodization derivation
     ============================================================ */
  function programId(p) { return p ? p.goal + "-" + p.days : null; }
  function activeDays() { return S.activeProgram ? S.activeProgram.days : null; }
  // Custom training weekdays (sorted dow numbers), falling back to the default map.
  function activeWeekdays() {
    var p = S.activeProgram;
    if (p && Array.isArray(p.weekdays) && p.weekdays.length) return p.weekdays;
    return (D.WEEKDAYS[activeDays()] || []).slice();
  }
  function activeProgramObj() {
    if (!S.activeProgram) return null;
    var g = D.PROGRAMS[S.activeProgram.goal];
    return g ? g[S.activeProgram.days] : null;
  }
  function weeksElapsed() {
    if (!S.startedAt) return 0;
    var base = Math.floor(daysBetween(ymd(new Date(S.startedAt)), todayYmd()) / 7);
    return Math.max(0, base + (S.weekOffset || 0));
  }
  function cycleWeek() { return (weeksElapsed() % 4) + 1; }      // 1..4
  function blockNum() { return Math.floor(weeksElapsed() / 4) + 1; }
  function phase() { return D.PHASES[cycleWeek() - 1]; }

  function expDelta() {
    var lv = S.activeProgram && S.activeProgram.exp;
    var e = D.EXP_LEVELS.filter(function (x) { return x.id === lv; })[0];
    return e ? e.setDelta : 0;
  }
  function workSets(baseSets) {
    var s = baseSets + expDelta();
    if (cycleWeek() === 4) s -= 1;       // deload — fewer sets
    return Math.max(2, s);
  }

  /* ============================================================
     level / xp helpers
     ============================================================ */
  function levelFromXp(xp) {
    var lv = 1;
    while (lv < 10 && xp >= D.xpToReach(lv + 1)) lv++;
    return lv;
  }
  function levelInfo() {
    var xp = S.xp, lv = levelFromXp(xp);
    var cur = D.xpToReach(lv), next = lv < 10 ? D.xpToReach(lv + 1) : cur;
    var pct = lv >= 10 ? 100 : Math.round(((xp - cur) / (next - cur)) * 100);
    return { lv: lv, title: D.LEVEL_TITLES[lv - 1], pct: clamp(pct, 0, 100), into: xp - cur, span: next - cur, next: next };
  }

  /* ============================================================
     per-program day progress storage  (keyed by absolute week)
     ============================================================ */
  function progBucket() {
    var id = programId(S.activeProgram);
    if (!id) return null;
    if (!S.progress[id]) S.progress[id] = { weeks: {} };
    if (!S.progress[id].weeks) S.progress[id].weeks = {};
    var wk = weeksElapsed();
    if (!S.progress[id].weeks[wk]) S.progress[id].weeks[wk] = {};
    return S.progress[id].weeks[wk];
  }
  function dayState(dayIdx) {
    var b = progBucket(); if (!b) return null;
    if (!b[dayIdx]) b[dayIdx] = { done: false, finishedAt: null, started: false, startedAt: null, entries: {} };
    if (!b[dayIdx].entries) b[dayIdx].entries = {};
    return b[dayIdx];
  }
  // A session counts as "in progress" once started, finished, or already logged into.
  function isStarted(ds) {
    return !!(ds && (ds.started || ds.done || (ds.entries && Object.keys(ds.entries).length)));
  }

  /* resolve a slot to a concrete prescription for the current block / entry */
  function resolveSlot(slot, dayIdx, slotIdx) {
    var ds = dayState(dayIdx);
    var entry = ds && ds.entries[slotIdx];
    var swap = entry && typeof entry.swapIdx === "number" ? entry.swapIdx : null;
    if (slot.t === "warmup") {
      return { type: "warmup", name: slot.name, muscle: slot.muscle, rx: slot.prescription };
    }
    if (slot.t === "main") {
      return {
        type: "main", name: slot.name, muscle: slot.muscle, pr: slot.pr,
        sets: workSets(slot.sets), reps: slot.reps, pct: slot.pct
      };
    }
    if (slot.t === "cardio") {
      var ci = (blockNum() - 1) % slot.options.length;
      return { type: "cardio", name: slot.name, muscle: slot.muscle, rx: slot.options[ci] };
    }
    // pool
    var idx = swap != null ? swap : (blockNum() - 1) % slot.options.length;
    var opt = slot.options[idx] || slot.options[0];
    return {
      type: "pool", name: opt.name, muscle: opt.muscle,
      sets: workSets(slot.sets), reps: slot.reps,
      swapped: swap != null, optIdx: idx
    };
  }
  function countWork(day) {
    return day.slots.filter(function (s) { return s.t !== "warmup"; }).length;
  }

  /* ============================================================
     muscle avatar — symbolic line-art figure w/ highlighted region
     ============================================================ */
  var BASE_FIG =
    '<circle class="base" cx="32" cy="10" r="6"/>' +
    '<path class="base" d="M24 18 Q32 15.5 40 18 L38 41 Q32 43 26 41 Z"/>' +
    '<path class="base" d="M24.5 19 L17 23 L14.5 34"/>' +
    '<path class="base" d="M39.5 19 L47 23 L49.5 34"/>' +
    '<path class="base" d="M28 41 L26 54 L25 61"/>' +
    '<path class="base" d="M36 41 L38 54 L39 61"/>';
  var HOT = {
    chest: '<ellipse class="hot" cx="28.5" cy="24" rx="4" ry="3.2"/><ellipse class="hot" cx="35.5" cy="24" rx="4" ry="3.2"/>',
    back: '<path class="hotline" d="M27 21 L37 21 M26 27 L38 27 M28 33 L36 33"/>',
    shoulders: '<circle class="hot" cx="23.5" cy="19.5" r="3.4"/><circle class="hot" cx="40.5" cy="19.5" r="3.4"/>',
    biceps: '<circle class="hot" cx="19" cy="25.5" r="3"/><circle class="hot" cx="45" cy="25.5" r="3"/>',
    triceps: '<circle class="hot" cx="17.5" cy="29.5" r="3"/><circle class="hot" cx="46.5" cy="29.5" r="3"/>',
    forearms: '<circle class="hot" cx="15" cy="33.5" r="2.7"/><circle class="hot" cx="49" cy="33.5" r="2.7"/>',
    traps: '<path class="hot" d="M25 18 Q32 13 39 18 Q36 19.5 32 19.5 Q28 19.5 25 18 Z"/>',
    core: '<ellipse class="hot" cx="32" cy="35" rx="5" ry="4"/>',
    quads: '<ellipse class="hot" cx="28.5" cy="47" rx="3" ry="5"/><ellipse class="hot" cx="35.5" cy="47" rx="3" ry="5"/>',
    hamstrings: '<ellipse class="hot" cx="28" cy="50" rx="2.8" ry="5"/><ellipse class="hot" cx="36" cy="50" rx="2.8" ry="5"/>',
    glutes: '<ellipse class="hot" cx="29" cy="42" rx="3.4" ry="3"/><ellipse class="hot" cx="35" cy="42" rx="3.4" ry="3"/>',
    calves: '<ellipse class="hot" cx="26" cy="56" rx="2.4" ry="4"/><ellipse class="hot" cx="38" cy="56" rx="2.4" ry="4"/>',
    fullbody: '<path class="hot" d="M24 18 Q32 15.5 40 18 L38 41 Q32 43 26 41 Z"/>'
  };
  function avatarSVG(muscle) {
    if (muscle === "cardio") {
      return '<svg viewBox="0 0 64 64" aria-hidden="true">' +
        '<path class="hot" d="M32 50 C 14 38 12 24 20 19 C 26 15 31 19 32 23 C 33 19 38 15 44 19 C 52 24 50 38 32 50 Z"/>' +
        '<path class="base" d="M10 33 H22 L26 25 L31 41 L36 30 L39 33 H54" />' +
        '</svg>';
    }
    var hot = HOT[muscle] || HOT.core;
    return '<svg viewBox="0 0 64 64" aria-hidden="true">' + BASE_FIG + hot + '</svg>';
  }

  /* ============================================================
     SVG progress ring helper
     ============================================================ */
  function ringSVG(size, stroke, pct) {
    var r = (size - stroke) / 2, c = size / 2, circ = 2 * Math.PI * r;
    var off = circ * (1 - clamp(pct, 0, 1));
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<circle class="track" cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke-width="' + stroke + '"/>' +
      '<circle class="fill" cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke-width="' + stroke +
      '" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>';
  }
  function ICON(name) {
    var p = {
      check: '<polyline points="20 6 9 17 4 12"></polyline>',
      chevron: '<polyline points="6 9 12 15 18 9"></polyline>',
      arrow: '<polyline points="9 18 15 12 9 6"></polyline>',
      swap: '<path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4"></path>',
      timer: '<circle cx="12" cy="13" r="8"></circle><path d="M12 13V9M12 5V3M9 3h6"></path>',
      plus: '<path d="M12 5v14M5 12h14"></path>',
      flame: '<path d="M12 3c2 4-1 5-1 8a3 3 0 0 0 6 0c0-2-1-3-1-3 3 2 4 5 4 7a7 7 0 0 1-14 0c0-4 3-6 6-9z"></path>',
      dumbbell: '<path d="M6.5 6.5l11 11M4 8l-1.5 1.5a1.4 1.4 0 0 0 0 2L6 15M20 16l1.5-1.5a1.4 1.4 0 0 0 0-2L18 9M8 4l1.5-1.5a1.4 1.4 0 0 1 2 0L15 6M16 20l-1.5 1.5a1.4 1.4 0 0 1-2 0L9 18"></path>'
    }[name] || "";
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  /* ============================================================
     chrome (topbar) refresh + goal accent
     ============================================================ */
  function applyAccent() {
    var root = document.documentElement;
    var g = S.activeProgram && D.GOALS[S.activeProgram.goal];
    if (g) {
      root.style.setProperty("--accent", g.color);
      root.style.setProperty("--accent-2", g.color2);
    } else {
      root.style.setProperty("--accent", "#2f7bff");
      root.style.setProperty("--accent-2", "#19c3ff");
    }
  }
  function renderChrome() {
    applyAccent();
    var li = levelInfo();
    $("#lvNum").textContent = li.lv;
    $("#lvTitle").textContent = li.title;
    $("#lvXpFill").style.width = li.pct + "%";
    var sub = $("#topSubtitle");
    if (S.activeProgram) {
      var g = D.GOALS[S.activeProgram.goal];
      sub.textContent = g.name + " · " + S.activeProgram.days + " days/week";
    } else {
      sub.textContent = "Train Hard. Recover Harder.";
    }
  }

  /* ============================================================
     router
     ============================================================ */
  var view = "home";
  var workoutDayIdx = null;
  function setTab(t) {
    view = t;
    $$(".tab").forEach(function (b) { b.classList.toggle("on", b.dataset.tab === t); });
    render();
  }
  function go(v, dayIdx) {
    view = v;
    if (v === "workout") workoutDayIdx = dayIdx;
    $$(".tab").forEach(function (b) {
      var map = v === "workout" ? "train" : v;
      b.classList.toggle("on", b.dataset.tab === map);
    });
    render();
  }
  function render() {
    try {
      renderChrome();
    } catch (e) { /* chrome is non-critical; keep going to render the view */ }
    var host = $("#view");
    if (!host) return;
    var fab = $("#fabTimer");
    if (fab) fab.classList.add("hidden");
    try {
      if (!S.activeProgram && view !== "guide" && view !== "programs") view = "programs";
      if (!S.activeProgram && view === "programs") { host.innerHTML = renderOnboarding(); bindOnboarding(); window.scrollTo(0, 0); return; }
      if (view === "home") { host.innerHTML = renderHome(); bindHome(); }
      else if (view === "train") { host.innerHTML = renderTrain(); bindTrain(); }
      else if (view === "programs") { host.innerHTML = renderPrograms(); bindPrograms(); }
      else if (view === "workout") { host.innerHTML = renderWorkout(); bindWorkout(); if (fab) fab.classList.toggle("hidden", !isStarted(dayState(workoutDayIdx))); }
      else if (view === "guide") { host.innerHTML = renderGuide(); bindGuide(); }
      window.scrollTo(0, 0);
    } catch (e) {
      showFatal(e, host);
    }
  }
  function showFatal(e, host) {
    host = host || $("#view");
    if (!host) return;
    var msg = (e && e.message) ? e.message : String(e);
    var stack = (e && e.stack) ? e.stack : "";
    host.innerHTML =
      '<div style="padding:24px;color:#fff;font:15px/1.55 system-ui,-apple-system,sans-serif">' +
      '<h2 style="margin:0 0 8px;font-size:20px">Something went wrong</h2>' +
      '<p style="color:#9aa3b2;margin:0 0 14px">Barpath hit an error while drawing this screen. Please share the text below so it can be fixed:</p>' +
      '<pre style="white-space:pre-wrap;word-break:break-word;background:#0e1116;border:1px solid #2a2f3a;border-radius:12px;padding:14px;color:#7fe0c8;font-size:12px;overflow:auto">' +
      esc(msg) + (stack ? "\n\n" + esc(stack) : "") + '</pre>' +
      '<button onclick="try{localStorage.removeItem(\'barpath:v1\')}catch(e){};location.reload()" style="margin-top:14px;background:#2f7bff;color:#fff;border:0;border-radius:10px;padding:12px 16px;font-weight:700;font-size:14px">Reset data &amp; reload</button>' +
      '</div>';
    if (window.console && console.error) console.error("[Barpath]", e);
  }

  /* ============================================================
     ONBOARDING (no active program)
     ============================================================ */
  var WD_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun for display
  function defaultWeekdaysFor(days) { return (D.WEEKDAYS[days] || []).slice(); }
  function sortDows(arr) { return arr.slice().sort(function (a, b) { return a - b; }); }
  function dayPickHtml(selected) {
    return WD_ORDER.map(function (dw) {
      var on = selected.indexOf(dw) >= 0 ? " on" : "";
      return '<button class="daybtn' + on + '" data-dow="' + dw + '">' + DOW[dw] + '</button>';
    }).join("");
  }
  var draft = { goal: "powerbuilding", days: 4, exp: "intermediate", weekdays: defaultWeekdaysFor(4) };
  function renderOnboarding() {
    var goalsHtml = D.GOAL_ORDER.map(function (id) {
      var g = D.GOALS[id], on = draft.goal === id ? " on" : "";
      return '<button class="selcard' + on + '" data-goal="' + id + '">' +
        '<span class="tag" style="background:linear-gradient(135deg,' + g.color + ',' + g.color2 + ')"></span>' +
        '<div class="sname">' + esc(g.name) + '</div>' +
        '<div class="sblurb">' + esc(g.blurb) + '</div></button>';
    }).join("");
    var seg = [3, 4, 5].map(function (d) {
      return '<button class="' + (draft.days === d ? "on" : "") + '" data-days="' + d + '">' + d + ' days</button>';
    }).join("");
    var expHtml = D.EXP_LEVELS.map(function (e) {
      var on = draft.exp === e.id ? " on" : "";
      return '<button class="selcard wide' + on + '" data-exp="' + e.id + '">' +
        '<div class="sname">' + esc(e.name) + '</div>' +
        '<div class="stime">' + esc(e.time) + '</div>' +
        '<div class="sblurb">' + esc(e.note) + '</div></button>';
    }).join("");
    return '<section class="view">' +
      '<div class="eyebrow">Welcome to Barpath</div>' +
      '<h1 class="h1">Choose your program</h1>' +
      '<p class="muted" style="margin:6px 0 0">Pick a goal, your weekly schedule and experience. You can switch anytime.</p>' +
      '<div class="steplabel"><span class="n">1</span><h2>Your goal</h2></div>' +
      '<div class="goalgrid">' + goalsHtml + '</div>' +
      '<div class="steplabel"><span class="n">2</span><h2>Days per week</h2></div>' +
      '<div class="segment">' + seg + '</div>' +
      '<div class="steplabel"><span class="n">3</span><h2>Training days</h2></div>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 10px">Pick the weekdays you\u2019ll train. Sessions need a 24-hour recovery buffer, so each one lands on its own day \u2014 back-to-back days are fine.</p>' +
      '<div class="daypick" id="dayPick">' + dayPickHtml(draft.weekdays) + '</div>' +
      '<div class="daypick-note muted" id="dayPickNote">' + dayPickNoteText() + '</div>' +
      '<div class="steplabel"><span class="n">4</span><h2>Experience</h2></div>' +
      '<div class="goalgrid">' + expHtml + '</div>' +
      '<div class="steplabel"><span class="n">\u2713</span><h2>Your split</h2></div>' +
      '<div class="card" id="previewCard">' + previewHtml(draft.goal, draft.days, draft.weekdays) + '</div>' +
      '<button class="btn primary" id="startBtn" style="margin-top:20px"' + (draft.weekdays.length === draft.days ? "" : " disabled") + '>Start This Program</button>' +
      '</section>';
  }
  function dayPickNoteText() {
    var n = draft.weekdays.length, need = draft.days;
    if (n === need) return "\u2713 " + need + " training days selected.";
    if (n < need) return "Select " + (need - n) + " more day" + (need - n === 1 ? "" : "s") + " (" + n + " of " + need + ").";
    return "Too many \u2014 deselect " + (n - need) + " day" + (n - need === 1 ? "" : "s") + " (" + n + " of " + need + ").";
  }
  function previewHtml(goal, days, weekdays) {
    var prog = D.PROGRAMS[goal][days];
    var wd = (weekdays && weekdays.length === days) ? sortDows(weekdays) : D.WEEKDAYS[days];
    var split = D.PROGRAMS[goal].splitName[days];
    var rows = prog.map(function (day, i) {
      return '<div class="preview-day"><span class="wd">' + DOW[wd[i]] + '</span>' +
        '<div><div class="pn">' + esc(day.name) + '</div><div class="pf">' + esc(day.focus) + '</div></div></div>';
    }).join("");
    return '<div class="muted" style="font-size:var(--f-small);margin-bottom:8px">' + esc(split) + '</div>' + rows;
  }
  function bindOnboarding() {
    $$("[data-goal]").forEach(function (b) {
      b.onclick = function () { draft.goal = b.dataset.goal; refreshOnboarding(); };
    });
    $$("[data-days]").forEach(function (b) {
      b.onclick = function () {
        draft.days = +b.dataset.days;
        draft.weekdays = defaultWeekdaysFor(draft.days); // reset schedule to a sensible default
        refreshOnboarding(true);
      };
    });
    $$("[data-exp]").forEach(function (b) {
      b.onclick = function () { draft.exp = b.dataset.exp; refreshOnboarding(); };
    });
    bindDayPick();
    $("#startBtn").onclick = function () {
      if (draft.weekdays.length !== draft.days) { toast("📅", "Pick exactly " + draft.days + " training days first."); return; }
      startProgram(draft.goal, draft.days, draft.exp, draft.weekdays);
    };
  }
  function bindDayPick() {
    $$("[data-dow]").forEach(function (b) {
      b.onclick = function () {
        var dw = +b.dataset.dow, idx = draft.weekdays.indexOf(dw);
        if (idx >= 0) draft.weekdays.splice(idx, 1);
        else {
          if (draft.weekdays.length >= draft.days) { toast("📅", "That\u2019s " + draft.days + " already \u2014 deselect one to change it."); return; }
          draft.weekdays.push(dw);
        }
        refreshOnboarding(true);
      };
    });
  }
  function refreshOnboarding(rebuildPick) {
    $$("[data-goal]").forEach(function (b) { b.classList.toggle("on", b.dataset.goal === draft.goal); });
    $$("[data-days]").forEach(function (b) { b.classList.toggle("on", +b.dataset.days === draft.days); });
    $$("[data-exp]").forEach(function (b) { b.classList.toggle("on", b.dataset.exp === draft.exp); });
    if (rebuildPick) {
      var dp = $("#dayPick"); if (dp) { dp.innerHTML = dayPickHtml(draft.weekdays); bindDayPick(); }
    } else {
      $$("[data-dow]").forEach(function (b) { b.classList.toggle("on", draft.weekdays.indexOf(+b.dataset.dow) >= 0); });
    }
    var note = $("#dayPickNote"); if (note) note.textContent = dayPickNoteText();
    var start = $("#startBtn"); if (start) start.disabled = draft.weekdays.length !== draft.days;
    var pc = $("#previewCard"); if (pc) pc.innerHTML = previewHtml(draft.goal, draft.days, draft.weekdays);
    applyAccentDraft();
  }
  function applyAccentDraft() {
    var g = D.GOALS[draft.goal], root = document.documentElement;
    root.style.setProperty("--accent", g.color);
    root.style.setProperty("--accent-2", g.color2);
  }
  function startProgram(goal, days, exp, weekdays) {
    var first = !S.activeProgram;
    var wd = (weekdays && weekdays.length === days) ? sortDows(weekdays) : defaultWeekdaysFor(days);
    S.activeProgram = { goal: goal, days: days, exp: exp, weekdays: wd };
    S.startedAt = new Date().toISOString();
    S.weekOffset = 0;
    S.programsTried[programId(S.activeProgram)] = true;
    if (Object.keys(S.programsTried).length >= 2) earn("explorer");
    save();
    toast("🚀", "Program started — let's go!");
    setTab("home");
  }

  /* ============================================================
     HOME / dashboard
     ============================================================ */
  function todayDayIdx() {
    var wd = activeWeekdays(), dow = new Date().getDay();
    var i = wd.indexOf(dow);
    return i; // -1 if rest day
  }
  function doneThisWeek() {
    var sow = startOfWeek(new Date()), eow = new Date(sow.getTime() + 7 * DAY_MS);
    var id = programId(S.activeProgram), seen = {};
    S.history.forEach(function (h) {
      if (h.programId !== id) return;
      var d = parseYmd(h.date);
      if (d >= sow && d < eow && !h.makeup) seen[h.date] = true;
    });
    return Object.keys(seen).length;
  }
  function renderHome() {
    var prog = activeProgramObj(), days = activeDays(), g = D.GOALS[S.activeProgram.goal];
    var li = levelInfo();
    var tIdx = todayDayIdx();
    var ph = phase();

    // today card
    var todayCard;
    if (tIdx >= 0) {
      todayCard = dayTile(prog[tIdx], tIdx, true);
    } else {
      todayCard = '<div class="card glow"><div class="row-between"><div>' +
        '<div class="eyebrow">Today</div><div class="h2" style="margin-top:2px">Rest &amp; Recover</div>' +
        '<div class="muted" style="font-size:var(--f-small);margin-top:4px">No session scheduled. Sleep, food, mobility.</div></div>' +
        '<div class="av lg">' + avatarSVG("cardio") + '</div></div>' +
        '<button class="btn ghost" id="logAnyBtn" style="margin-top:14px">Log a Workout</button></div>';
    }

    // stat row
    var stats = '<div class="stats">' +
      stat(S.streak, "Streak") +
      stat(doneThisWeek() + "/" + days, "This Week") +
      stat(S.history.length, "Workouts") +
      stat(S.freezes, "Freezes") + '</div>';

    // banner
    var blockchips = "";
    for (var w = 1; w <= 4; w++) {
      blockchips += '<span class="bdot' + (w <= cycleWeek() ? " on" : "") + (w === cycleWeek() ? " cur" : "") + '"></span>';
    }
    var banner = '<div class="card banner glow">' +
      '<div class="row-between"><div><div class="goalname">' + esc(g.name) + '</div>' +
      '<div class="meta">' + esc(prog.length) + '-day · ' + esc(D.PROGRAMS[S.activeProgram.goal].splitName[days]) + '</div></div>' +
      '<span class="chip accent">Lv ' + li.lv + ' · ' + esc(li.title) + '</span></div>' +
      '<div class="blockchips">' + blockchips + '</div>' +
      '<div class="phase-line"><div class="ptitle">Block ' + blockNum() + ' · Week ' + cycleWeek() + ' — ' + esc(ph.name) + ' <span class="muted" style="font-weight:600">(RPE ' + ph.rpe + ')</span></div>' +
      '<div class="pnote">' + esc(ph.note) + '</div></div></div>';

    // steps
    var stp = S.steps[todayYmd()] || 0;
    var stepsCard = '<div class="card steps-card">' +
      '<div class="steps-ring">' + ringSVG(92, 9, clamp(stp / S.stepGoal, 0, 1)) +
      '<div class="val"><b>' + stp.toLocaleString() + '</b><span>of ' + S.stepGoal.toLocaleString() + '</span></div></div>' +
      '<div class="grow"><div class="h2">Daily Steps</div>' +
      '<div class="muted" style="font-size:var(--f-small)">Log steps to earn XP toward your goal.</div>' +
      '<div class="step-input"><input class="fld" id="stepInput" type="number" inputmode="numeric" placeholder="Add steps" />' +
      '<button class="btn sm primary" id="stepAdd">Add</button></div></div></div>';

    // weekly challenge
    var ch = currentChallenge(), cp = challengeProgress(ch);
    var claimed = S.claimedChallenges[isoWeekKey(new Date()) + ":" + ch.id];
    var challenge = '<div class="card challenge">' +
      '<div class="row-between"><div class="ctitle">' + esc(ch.name) + '</div>' +
      '<span class="chip ' + (cp.done ? "good" : "accent") + '">' + (cp.done ? "Complete" : cp.cur + " / " + cp.target) + '</span></div>' +
      '<div class="cdesc">' + esc(ch.desc) + '</div>' +
      '<div class="bartrack"><i style="width:' + clamp(Math.round(cp.cur / cp.target * 100), 0, 100) + '%"></i></div>' +
      '<div class="reward">Reward: +' + D.XP.challenge + ' XP · +1 Streak Freeze' + (cp.done && !claimed ? ' — tap to claim' : "") + '</div>' +
      (cp.done && !claimed ? '<button class="btn sm primary mt3" id="claimCh">Claim reward</button>' : "") + '</div>';

    // quote
    var q = D.QUOTES[(weeksElapsed() + new Date().getDay()) % D.QUOTES.length];
    var quote = '<div class="card"><div class="quote">' + esc(q) + '</div></div>';

    // this week schedule
    var weekRow = weekScheduleHtml();

    // badges
    var badges = badgesGridHtml();

    return '<section class="view">' +
      '<div class="section-head"><h2 class="h1">Today</h2><span class="muted" style="font-size:var(--f-small)">' + new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) + '</span></div>' +
      todayCard +
      '<div class="card glow mt3"><div class="row-between" style="align-items:flex-end"><div><div class="eyebrow">Level ' + li.lv + '</div><div class="h2">' + esc(li.title) + '</div></div>' +
      '<div class="muted" style="font-size:var(--f-small)">' + (li.lv < 10 ? li.into + " / " + li.span + " XP" : "Max level") + '</div></div>' +
      '<div class="xpbar" style="height:8px;margin-top:10px"><i style="width:' + li.pct + '%"></i></div></div>' +
      stats +
      '<div class="section-head"><h2>Your program</h2><span class="link" data-tab-link="programs">Switch</span></div>' +
      banner +
      '<div class="section-head"><h2>Movement</h2></div>' +
      stepsCard +
      '<div class="section-head"><h2>Weekly challenge</h2></div>' +
      challenge +
      quote +
      '<div class="section-head"><h2>This week</h2></div>' +
      weekRow +
      '<div class="section-head"><h2>Achievements</h2><span class="link" data-tab-link="guide">All</span></div>' +
      badges +
      '</section>';
  }
  function stat(n, l) { return '<div class="stat"><div class="num">' + n + '</div><div class="lbl">' + l + '</div></div>'; }
  function dayTile(day, idx, isToday) {
    var ds = dayState(idx), done = ds && ds.done;
    var first = day.slots.filter(function (s) { return s.t !== "warmup"; })[0];
    var mus = first ? (first.t === "pool" ? first.options[0].muscle : first.muscle) : "fullbody";
    return '<button class="daytile' + (done ? " done" : "") + ' glow" data-day="' + idx + '">' +
      '<span class="av lg">' + avatarSVG(mus) + '</span>' +
      '<span class="info"><span class="dname">' + esc(day.name) + (done ? ' <span class="chip good" style="padding:2px 7px">Done</span>' : "") + '</span>' +
      '<span class="dfocus">' + esc(day.focus) + '</span>' +
      '<span class="dmeta">' + (isToday ? "Today · " : "") + countWork(day) + ' exercises · Week ' + cycleWeek() + ' ' + esc(phase().name) + '</span></span>' +
      '<span class="go">' + ICON("arrow") + '</span></button>';
  }
  function weekScheduleHtml() {
    var sow = startOfWeek(new Date()), wd = activeWeekdays(), id = programId(S.activeProgram);
    var doneDates = {};
    S.history.forEach(function (h) { if (h.programId === id) doneDates[h.date] = true; });
    var todayStr = todayYmd(), cells = "", hasMakeup = false;
    for (var i = 0; i < 7; i++) {
      var d = new Date(sow.getTime() + i * DAY_MS), ds = ymd(d);
      var train = wd.indexOf(d.getDay()) >= 0;
      var done = doneDates[ds];
      var cls = "daycell" + (train ? " train" : " rest") + (done ? " done" : "") + (ds === todayStr ? " today" : "");
      cells += '<div class="' + cls + '"><div class="dow">' + DOW[d.getDay()][0] + '</div><div class="dotwrap"><span class="dot"></span></div></div>';
    }
    return '<div class="weekrow">' + cells + '</div>' +
      '<button class="btn ghost mt3" id="makeupBtn">+ Add a makeup day</button>';
  }
  function badgesGridHtml() {
    return '<div class="badges">' + D.BADGES.map(function (b) {
      var earned = !!S.badges[b.id];
      return '<div class="badge' + (earned ? " earned" : "") + '" title="' + esc(b.desc) + '">' +
        '<div class="bemoji">' + b.icon + '</div><div class="bname">' + esc(b.name) + '</div></div>';
    }).join("") + '</div>';
  }
  function bindHome() {
    $$("[data-day]").forEach(function (b) { b.onclick = function () { makeupFlag = false; go("workout", +b.dataset.day); }; });
    $$("[data-tab-link]").forEach(function (b) { b.onclick = function () { setTab(b.dataset.tabLink); }; });
    var sa = $("#stepAdd"); if (sa) sa.onclick = addSteps;
    var si = $("#stepInput"); if (si) si.onkeydown = function (e) { if (e.key === "Enter") addSteps(); };
    var mb = $("#makeupBtn"); if (mb) mb.onclick = openMakeupSheet;
    var la = $("#logAnyBtn"); if (la) la.onclick = openMakeupSheet;
    var cc = $("#claimCh"); if (cc) cc.onclick = claimChallenge;
  }
  function addSteps() {
    var inp = $("#stepInput"); if (!inp) return;
    var n = parseInt(inp.value, 10);
    if (!n || n <= 0) { toast("👟", "Enter a step count first."); return; }
    var t = todayYmd(), prev = S.steps[t] || 0, was = prev >= S.stepGoal;
    S.steps[t] = prev + n;
    var now = S.steps[t] >= S.stepGoal;
    awardXp(Math.min(D.XP.steps, Math.round(n / S.stepGoal * D.XP.steps)) || 5, false);
    if (now && !was) { earn("step-goal"); toast("🎯", "Step goal hit! +bonus XP"); burst(); }
    else toast("👟", "+" + n.toLocaleString() + " steps");
    save(); render();
  }

  /* ============================================================
     TRAIN — list of the program's days
     ============================================================ */
  function renderTrain() {
    var prog = activeProgramObj(), wd = activeWeekdays();
    var ph = phase();
    var tiles = prog.map(function (day, i) {
      var ds = dayState(i), done = ds && ds.done;
      var first = day.slots.filter(function (s) { return s.t !== "warmup"; })[0];
      var mus = first ? (first.t === "pool" ? first.options[0].muscle : first.muscle) : "fullbody";
      return '<button class="daytile' + (done ? " done" : "") + '" data-day="' + i + '" style="margin-bottom:12px">' +
        '<span class="av lg">' + avatarSVG(mus) + '</span>' +
        '<span class="info"><span class="dname">' + esc(day.name) + (done ? ' <span class="chip good" style="padding:2px 7px">Done</span>' : "") + '</span>' +
        '<span class="dfocus">' + esc(day.focus) + '</span>' +
        '<span class="dmeta">' + DOW[wd[i]] + ' · ' + countWork(day) + ' exercises</span></span>' +
        '<span class="go">' + ICON("arrow") + '</span></button>';
    }).join("");
    return '<section class="view">' +
      '<div class="eyebrow">' + esc(D.GOALS[S.activeProgram.goal].name) + '</div>' +
      '<h1 class="h1">Train</h1>' +
      '<div class="card mt3" style="padding:12px 16px"><div class="row-between"><div class="muted" style="font-size:var(--f-small)">Block ' + blockNum() + ' · Week ' + cycleWeek() + '</div><span class="chip accent">' + esc(ph.name) + ' · RPE ' + ph.rpe + '</span></div></div>' +
      '<div class="mt4">' + tiles + '</div></section>';
  }
  function bindTrain() {
    $$("[data-day]").forEach(function (b) { b.onclick = function () { makeupFlag = false; go("workout", +b.dataset.day); }; });
  }

  /* ============================================================
     WORKOUT screen
     ============================================================ */
  function renderWorkout() {
    var prog = activeProgramObj(), day = prog[workoutDayIdx], ds = dayState(workoutDayIdx);
    var work = day.slots.map(function (s, i) { return i; }).filter(function (i) { return day.slots[i].t !== "warmup"; });
    var doneCount = work.filter(function (i) { return ds.entries[i] && ds.entries[i].done; }).length;
    var pct = work.length ? Math.round(doneCount / work.length * 100) : 0;
    var started = isStarted(ds);

    var cards = day.slots.map(function (slot, i) { return exerciseCard(slot, i, !started); }).join("");

    var head = '<div class="wk-head"><div class="eyebrow">Week ' + cycleWeek() + ' · ' + esc(phase().name) + '</div>' +
      '<h1 class="h1">' + esc(day.name) + '</h1>' +
      '<div class="muted" style="font-size:var(--f-small)">' + esc(day.focus) + ' · ' + work.length + ' exercises</div>';

    var body, actions = "";
    if (!started) {
      head += '<button class="btn primary" id="startWorkoutBtn" style="margin-top:16px">▶ Start Workout</button>' +
        '<div class="wk-note muted" style="margin-top:8px">Warm up first, then start to log each set.</div></div>';
      body = '<div class="wk-preview-label muted">Today\u2019s plan</div>' + cards;
    } else {
      head += '<div class="wk-progress"><i id="wkFill" style="width:' + pct + '%"></i></div>' +
        '<div class="wk-note muted" id="wkNote">' + doneCount + ' of ' + work.length + ' done</div></div>';
      body = cards;
      actions = '<div class="wk-actions">' +
        '<button class="btn primary" id="finishBtn"' + (ds.done ? " disabled" : "") + '>' + (ds.done ? "Workout Logged ✓" : "Finish &amp; Log Workout") + '</button>' +
        '<div class="row"><button class="btn ghost" id="printBtn">Print</button>' +
        '<button class="btn danger" id="resetBtn">Reset Day</button></div></div>';
    }

    return '<section class="view">' +
      '<button class="btn ghost sm" id="backBtn" style="width:auto;margin-bottom:14px">‹ Back</button>' +
      head + body + actions + '</section>';
  }
  function exerciseCard(slot, i, locked) {
    var r = resolveSlot(slot, workoutDayIdx, i);
    var ds = dayState(workoutDayIdx), entry = ds.entries[i] || {};
    var done = !!entry.done;

    if (r.type === "warmup") {
      return '<div class="ex warmup-card"><div class="ex-top" style="cursor:default">' +
        '<span class="av">' + avatarSVG("cardio") + '</span>' +
        '<span class="exinfo"><span class="exname">' + esc(r.name) + '</span>' +
        '<span class="exrx">' + esc(r.rx) + '</span></span></div></div>';
    }

    var isMeasured = (r.type === "main" || r.type === "pool");
    var rxText = isMeasured ? (r.sets + " × " + r.reps + (r.pct ? "  ·  " + r.pct : "")) : r.rx;

    // header row (name + prescription) — shared
    var avatar = (r.type === "cardio")
      ? '<span class="av">' + avatarSVG(r.muscle) + '</span>'
      : '<span class="av" style="width:34px;height:34px;float:left;margin-right:10px">' + avatarSVG(r.muscle) + '</span>';
    var nameLine = '<span class="exname">' + esc(r.name) + (r.swapped ? '<span class="swapped">swapped</span>' : "") + '</span>' +
      (r.type === "cardio"
        ? '<span class="extag">' + esc(r.muscle) + '</span><div class="cardio-rx">' + esc(r.rx) + '</div>'
        : '<span class="exrx">' + esc(rxText) + ' · <span class="extag">' + esc(r.muscle) + '</span></span>');

    if (locked) {
      return '<div class="ex locked">' +
        '<div class="ex-top"><span class="cbox ghostbox" aria-hidden="true">' + ICON("check") + '</span>' +
        (r.type === "cardio" ? '<span class="exinfo">' + nameLine + '</span>'
          : '<span class="exinfo">' + avatar + nameLine + '</span>') +
        '</div></div>';
    }

    var top = '<div class="ex-top"><button class="cbox" data-check="' + i + '" aria-label="Complete">' + ICON("check") + '</button>' +
      (r.type === "cardio" ? '<span class="exinfo">' + nameLine + '</span>'
        : '<span class="exinfo">' + avatar + nameLine + '</span>') +
      '<button class="chev" data-toggle="' + i + '">' + ICON("chevron") + '</button></div>';

    if (r.type === "cardio") {
      return '<div class="ex' + (done ? " done" : "") + (entry.open ? " open" : "") + '" data-ex="' + i + '">' + top +
        '<div class="ex-body"><div class="ex-body-inner">' +
        '<label class="fldlbl">Notes</label><textarea class="fld" rows="2" data-notes="' + i + '" placeholder="How did it feel? Distance, pace…">' + esc(entry.notes || "") + '</textarea>' +
        '</div></div></div>';
    }

    // main / pool — per-set weight & reps logging
    var sets = setsFor(entry);
    var setRows = "";
    for (var k = 0; k < r.sets; k++) {
      var sv = sets[k] || { w: "", r: "" };
      setRows += '<div class="setrow">' +
        '<span class="setn">' + (k + 1) + '</span>' +
        '<input class="fld setfld" inputmode="decimal" data-setw="' + i + '" data-k="' + k + '" value="' + esc(sv.w) + '" placeholder="kg / lb" />' +
        '<input class="fld setfld" inputmode="numeric" data-setr="' + i + '" data-k="' + k + '" value="' + esc(sv.r) + '" placeholder="' + esc(r.reps) + '" />' +
        '</div>';
    }
    var setlog = '<div class="setlog"><div class="setrow head"><span class="setn">Set</span><span>Weight</span><span>Reps</span></div>' + setRows + '</div>';

    var tools = '<div class="ex-tools">';
    if (r.type === "pool") tools += '<button class="btn ghost sm" data-swap="' + i + '">' + ICON("swap") + ' Swap</button>';
    if (r.type === "main" && r.pr) tools += '<button class="btn ghost sm" data-savepr="' + i + '">🥇 Save PR</button>';
    tools += '<button class="btn ghost sm" data-rest="' + i + '">' + ICON("timer") + ' Rest</button></div>';

    return '<div class="ex' + (done ? " done" : "") + (entry.open ? " open" : "") + '" data-ex="' + i + '">' + top +
      '<div class="ex-body"><div class="ex-body-inner">' +
      setlog +
      '<label class="fldlbl" style="margin-top:12px">Notes</label><textarea class="fld" rows="2" data-notes="' + i + '" placeholder="RPE, tempo, cues…">' + esc(entry.notes || "") + '</textarea>' +
      tools + '</div></div></div>';
  }
  // Read an entry's per-set log, migrating an older single weight/reps entry into set 1.
  function setsFor(entry) {
    if (Array.isArray(entry.sets)) return entry.sets;
    if (entry.weight || entry.reps) return [{ w: entry.weight || "", r: entry.reps || "" }];
    return [];
  }
  function bestSet(entry) {
    var best = null;
    setsFor(entry).forEach(function (s) {
      var w = parseFloat(s.w);
      if (w > 0 && (!best || w > best.w)) best = { w: w, r: s.r || "" };
    });
    return best;
  }
  function bindWorkout() {
    $("#backBtn").onclick = function () { setTab("train"); };
    var sw = $("#startWorkoutBtn"); if (sw) sw.onclick = startWorkout;
    $$("[data-check]").forEach(function (b) { b.onclick = function () { toggleDone(+b.dataset.check); }; });
    $$("[data-toggle]").forEach(function (b) { b.onclick = function () { toggleOpen(+b.dataset.toggle); }; });
    $$("[data-setw]").forEach(function (inp) { inp.oninput = function () { setSetVal(+inp.dataset.setw, +inp.dataset.k, "w", inp.value); }; });
    $$("[data-setr]").forEach(function (inp) { inp.oninput = function () { setSetVal(+inp.dataset.setr, +inp.dataset.k, "r", inp.value); }; });
    $$("[data-notes]").forEach(function (inp) { inp.oninput = function () { setEntry(+inp.dataset.notes, "notes", inp.value); }; });
    $$("[data-swap]").forEach(function (b) { b.onclick = function () { openSwapSheet(+b.dataset.swap); }; });
    $$("[data-savepr]").forEach(function (b) { b.onclick = function () { savePR(+b.dataset.savepr); }; });
    $$("[data-rest]").forEach(function (b) { b.onclick = function () { openTimer(); }; });
    var fb = $("#finishBtn"); if (fb) fb.onclick = finishWorkout;
    var pb = $("#printBtn"); if (pb) pb.onclick = function () { window.print(); };
    var rb = $("#resetBtn"); if (rb) rb.onclick = resetDay;
  }
  function startWorkout() {
    var ds = dayState(workoutDayIdx);
    ds.started = true; ds.startedAt = new Date().toISOString();
    // auto-expand the first working exercise so logging is one tap away
    var prog = activeProgramObj(), day = prog[workoutDayIdx];
    var firstWork = day.slots.map(function (s, i) { return i; }).filter(function (i) { return day.slots[i].t !== "warmup"; })[0];
    if (firstWork != null) ensureEntry(firstWork).open = true;
    save();
    toast("💪", "Workout started — let's go!");
    render();
  }
  function setSetVal(i, k, field, v) {
    var e = ensureEntry(i);
    if (!Array.isArray(e.sets)) e.sets = setsFor(e).slice();
    while (e.sets.length <= k) e.sets.push({ w: "", r: "" });
    e.sets[k][field] = v;
    save();
  }
  function ensureEntry(i) {
    var ds = dayState(workoutDayIdx);
    if (!ds.entries[i]) ds.entries[i] = {};
    return ds.entries[i];
  }
  function setEntry(i, k, v) { ensureEntry(i)[k] = v; save(); }
  function toggleOpen(i) {
    var e = ensureEntry(i); e.open = !e.open; save();
    var card = $('.ex[data-ex="' + i + '"]'); if (card) card.classList.toggle("open", e.open);
  }
  function toggleDone(i) {
    var e = ensureEntry(i), prog = activeProgramObj(), day = prog[workoutDayIdx];
    e.done = !e.done;
    if (e.done) { awardXp(D.XP.set, false); maybeRestPrompt(); }
    save();
    var card = $('.ex[data-ex="' + i + '"]'); if (card) card.classList.toggle("done", e.done);
    updateWkProgress();
    renderChrome();
  }
  function maybeRestPrompt() { /* subtle: surface timer fab pulse — keep simple */ }
  function updateWkProgress() {
    var prog = activeProgramObj(), day = prog[workoutDayIdx], ds = dayState(workoutDayIdx);
    var work = day.slots.map(function (s, i) { return i; }).filter(function (i) { return day.slots[i].t !== "warmup"; });
    var dc = work.filter(function (i) { return ds.entries[i] && ds.entries[i].done; }).length;
    var pct = work.length ? Math.round(dc / work.length * 100) : 0;
    var f = $("#wkFill"); if (f) f.style.width = pct + "%";
    var n = $("#wkNote"); if (n) n.textContent = dc + " of " + work.length + " done";
  }

  function openSwapSheet(i) {
    var prog = activeProgramObj(), slot = prog[workoutDayIdx].slots[i];
    if (slot.t !== "pool") return;
    var cur = resolveSlot(slot, workoutDayIdx, i).optIdx;
    var opts = slot.options.map(function (o, idx) {
      return '<button class="swap-opt' + (idx === cur ? " cur" : "") + '" data-pick="' + idx + '">' +
        '<span class="av">' + avatarSVG(o.muscle) + '</span>' +
        '<span class="grow"><span style="font-weight:700">' + esc(o.name) + '</span><br><span class="muted" style="font-size:var(--f-small);text-transform:capitalize">' + esc(o.muscle) + '</span></span>' +
        (idx === cur ? '<span class="chip accent">Current</span>' : "") + '</button>';
    }).join("");
    openSheet('<div class="grip"></div><h3>Swap exercise</h3><p class="muted" style="font-size:var(--f-small);margin:0 0 14px">Same prescribed sets &amp; reps. Marked as swapped.</p>' + opts);
    $$("[data-pick]", $("#sheet")).forEach(function (b) {
      b.onclick = function () {
        ensureEntry(i).swapIdx = +b.dataset.pick;
        save(); closeSheet(); render();
        toast("🔁", "Exercise swapped");
      };
    });
  }
  function savePR(i) {
    var prog = activeProgramObj(), slot = prog[workoutDayIdx].slots[i];
    var r = resolveSlot(slot, workoutDayIdx, i);
    var e = ensureEntry(i);
    var best = bestSet(e);
    if (!best) { toast("⚖️", "Log a set with weight first to save a PR."); toggleOpen(i); return; }
    var val = best.w;
    var prev = S.prs[r.pr];
    if (prev && val <= prev.value) { toast("💪", "Logged. Your PR is still " + prev.value + "."); return; }
    var firstEver = Object.keys(S.prs).length === 0;
    S.prs[r.pr] = { value: val, date: todayYmd(), reps: best.r || "" };
    e.prSaved = true;
    awardXp(D.XP.pr, false);
    if (firstEver) earn("first-pr");
    if (D.PR_LIFTS.every(function (l) { return S.prs[l.id]; })) earn("all-prs");
    save(); burst();
    toast("🥇", "New PR: " + r.name + " " + val + "!");
    renderChrome();
  }
  function finishWorkout() {
    var prog = activeProgramObj(), day = prog[workoutDayIdx], ds = dayState(workoutDayIdx);
    if (ds.done) return;
    var work = day.slots.map(function (s, i) { return i; }).filter(function (i) { return day.slots[i].t !== "warmup"; });
    var dc = work.filter(function (i) { return ds.entries[i] && ds.entries[i].done; }).length;
    if (dc === 0) {
      openConfirm("Nothing checked off", "Mark at least one exercise complete, or finish anyway?", "Finish anyway", function () { commitWorkout(makeupFlag); });
      return;
    }
    commitWorkout(makeupFlag);
  }
  function commitWorkout(makeup) {
    var prog = activeProgramObj(), day = prog[workoutDayIdx], ds = dayState(workoutDayIdx);
    ds.done = true; ds.finishedAt = new Date().toISOString();
    S.history.push({ date: todayYmd(), programId: programId(S.activeProgram), dayName: day.name, dayIdx: workoutDayIdx, makeup: !!makeup });
    awardXp(D.XP.workout, true);
    if (makeup) { earn("makeup-day"); awardXp(D.XP.makeup, true); }
    updateStreak();
    // badges
    if (S.history.length === 1) earn("first-workout");
    if (S.history.length >= 10) earn("workouts-10");
    if (S.history.length >= 50) earn("workouts-50");
    if (S.streak >= 3) earn("streak-3");
    if (S.streak >= 7) earn("streak-7");
    if (S.streak >= 30) earn("streak-30");
    if (allScheduledDoneThisWeek()) earn("full-week");
    save(); burst();
    toast("✅", "Workout logged. +" + D.XP.workout + " XP");
    makeupFlag = false;
    go("home");
  }
  function resetDay() {
    openConfirm("Reset this day?", "Clears the checkmarks and entries you logged for this session.", "Reset", function () {
      var b = progBucket(); if (b && b[workoutDayIdx]) { b[workoutDayIdx] = { done: false, finishedAt: null, started: false, startedAt: null, entries: {} }; }
      // remove a history record logged today for this day
      var id = programId(S.activeProgram), t = todayYmd();
      S.history = S.history.filter(function (h) { return !(h.programId === id && h.dayIdx === workoutDayIdx && h.date === t && !h.makeup); });
      save(); render(); toast("↺", "Day reset");
    });
  }
  function updateStreak() {
    var t = todayYmd();
    if (S.lastWorkoutDate === t) return;
    if (!S.lastWorkoutDate) { S.streak = 1; }
    else {
      var gap = daysBetween(S.lastWorkoutDate, t);
      if (gap === 1) S.streak += 1;
      else if (gap === 2 && S.freezes > 0) { S.freezes -= 1; S.streak += 1; toast("🧊", "Streak freeze used"); }
      else S.streak = 1;
    }
    S.lastWorkoutDate = t;
  }
  function allScheduledDoneThisWeek() {
    var sow = startOfWeek(new Date()), wd = activeWeekdays(), id = programId(S.activeProgram);
    var done = {};
    S.history.forEach(function (h) { if (h.programId === id) { var d = parseYmd(h.date); if (d >= sow && d < new Date(sow.getTime() + 7 * DAY_MS)) done[d.getDay()] = true; } });
    return wd.every(function (dow) { return done[dow]; });
  }

  /* ============================================================
     makeup / extra day sheet
     ============================================================ */
  function openMakeupSheet() {
    var prog = activeProgramObj();
    var opts = prog.map(function (day, i) {
      return '<button class="swap-opt" data-makeup="' + i + '">' +
        '<span class="av">' + avatarSVG(day.slots.filter(function (s) { return s.t !== "warmup"; })[0] ? (function () { var f = day.slots.filter(function (s) { return s.t !== "warmup"; })[0]; return f.t === "pool" ? f.options[0].muscle : f.muscle; })() : "fullbody") + '</span>' +
        '<span class="grow"><span style="font-weight:700">' + esc(day.name) + '</span><br><span class="muted" style="font-size:var(--f-small)">' + esc(day.focus) + '</span></span>' +
        ICON("arrow") + '</button>';
    }).join("");
    openSheet('<div class="grip"></div><h3>Log a makeup day</h3><p class="muted" style="font-size:var(--f-small);margin:0 0 14px">Train a session outside your schedule. It still counts toward your streak, totals and challenges.</p>' + opts);
    $$("[data-makeup]", $("#sheet")).forEach(function (b) {
      b.onclick = function () { closeSheet(); go("workout", +b.dataset.makeup); markMakeupContext(+b.dataset.makeup); };
    });
  }
  var makeupFlag = false;
  function markMakeupContext(i) { makeupFlag = true; }

  /* ============================================================
     PROGRAMS — library + switching
     ============================================================ */
  function renderPrograms() {
    var curId = programId(S.activeProgram);
    var sections = D.GOAL_ORDER.map(function (gid) {
      var g = D.GOALS[gid];
      var rows = [3, 4, 5].map(function (days) {
        var id = gid + "-" + days, active = id === curId;
        var split = D.PROGRAMS[gid].splitName[days];
        return '<button class="progrow' + (active ? " active" : "") + '" data-prog="' + gid + ":" + days + '">' +
          '<span class="swatch" style="background:linear-gradient(180deg,' + g.color + ',' + g.color2 + ')"></span>' +
          '<span class="grow"><span style="font-weight:700">' + days + '-Day ' + esc(g.name) + '</span><br>' +
          '<span class="muted" style="font-size:var(--f-small)">' + esc(split) + '</span></span>' +
          (active ? '<span class="chip accent">Active</span>' : ICON("arrow")) + '</button>';
      }).join("");
      return '<div class="section-head"><h2>' + esc(g.name) + '</h2></div>' +
        '<div class="muted" style="font-size:var(--f-small);margin:-6px 0 10px">' + esc(g.tagline) + '</div>' +
        '<div class="proglist">' + rows + '</div>';
    }).join("");
    return '<section class="view"><div class="eyebrow">Library</div><h1 class="h1">Programs</h1>' +
      '<p class="muted" style="margin:6px 0 0;font-size:var(--f-small)">12 periodized programs. Switching keeps your level, streak, badges &amp; PRs.</p>' +
      sections + '</section>';
  }
  function bindPrograms() {
    $$("[data-prog]").forEach(function (b) {
      b.onclick = function () {
        var p = b.dataset.prog.split(":"), goal = p[0], days = +p[1];
        if (programId(S.activeProgram) === goal + "-" + days) { setTab("home"); return; }
        attemptSwitch(goal, days);
      };
    });
  }
  function attemptSwitch(goal, days) {
    var we = weeksElapsed();
    var openExp = function () { openExpPicker(goal, days); };
    if (S.activeProgram && we < 4) {
      var remain = 4 - we;
      openConfirm("Switch before 4 weeks?",
        "A mesocycle is 4 weeks — that's the minimum to see real progress. You're " + we + " week" + (we === 1 ? "" : "s") + " in, with " + remain + " to go. You can switch anyway; your level, streak, badges and PRs carry over.",
        "Switch anyway", openExp);
    } else { openExp(); }
  }
  function openExpPicker(goal, days) {
    var keepExp = S.activeProgram ? S.activeProgram.exp : "intermediate";
    var opts = D.EXP_LEVELS.map(function (e) {
      return '<button class="swap-opt' + (e.id === keepExp ? " cur" : "") + '" data-pickexp="' + e.id + '">' +
        '<span class="grow"><span style="font-weight:700">' + esc(e.name) + '</span><br><span class="muted" style="font-size:var(--f-small)">' + esc(e.time) + '</span></span>' +
        (e.id === keepExp ? '<span class="chip accent">Current</span>' : "") + '</button>';
    }).join("");
    var g = D.GOALS[goal];
    openSheet('<div class="grip"></div><h3>Start ' + days + '-Day ' + esc(g.name) + '</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 14px">Confirm your experience level — it sets your starting volume.</p>' + opts);
    $$("[data-pickexp]", $("#sheet")).forEach(function (b) {
      b.onclick = function () { closeSheet(); startProgram(goal, days, b.dataset.pickexp); };
    });
  }

  /* ============================================================
     GUIDE
     ============================================================ */
  function renderGuide() {
    var prs = D.PR_LIFTS.map(function (l) {
      var pr = S.prs[l.id];
      return '<div class="pr-row"><span class="prname">' + esc(l.name) + '</span>' +
        (pr ? '<span class="prval">' + pr.value + '</span>' : '<span class="prval empty-v">Not set</span>') + '</div>';
    }).join("");
    var badges = badgesGridHtml();
    var acc = [
      ["How progression works",
        '<p>Barpath periodizes training so you push hard <b>and</b> recover.</p><ul>' +
        '<li><b>Microcycle (1 week)</b> — a single rotation of your training days.</li>' +
        '<li><b>Mesocycle (4 weeks)</b> — Week 1 <b>Volume</b> (RPE 7), Week 2 <b>Build</b> (RPE 8), Week 3 <b>Peak</b> (RPE 9), Week 4 <b>Deload</b> (RPE 6, fewer sets).</li>' +
        '<li><b>Macrocycle</b> — each new 4-week block restarts at a higher baseline and rotates your accessory &amp; variation exercises. Main lifts stay constant so your PRs stay comparable.</li></ul>' +
        '<p>Your block and week advance automatically by the calendar from the day you started.</p>'],
      ["Experience levels",
        '<ul>' + D.EXP_LEVELS.map(function (e) { return '<li><b>' + esc(e.name) + '</b> (' + esc(e.time) + ') — ' + esc(e.note) + '</li>'; }).join("") + '</ul>'],
      ["XP, levels &amp; streaks",
        '<p>Earn XP for completing sets, finishing workouts, setting PRs and hitting your step goal. Levels run <b>Rookie → Mythic</b>.</p>' +
        '<p>Your <b>streak</b> grows each day you train. <b>Streak freezes</b> (earned from weekly challenges) automatically cover one missed day so your streak survives.</p>'],
      ["Switching programs",
        '<p>Switch anytime from the Programs tab. A mesocycle is 4 weeks, so if you switch sooner Barpath reminds you. Your level, XP, streak, badges and PRs always carry over — only the per-program checkmarks reset.</p>'],
      ["Install Barpath",
        '<p><b>iPhone / iPad (Safari):</b> tap the Share button, then <b>Add to Home Screen</b>.</p>' +
        '<p><b>Android (Chrome):</b> tap the ⋮ menu, then <b>Install app</b> / <b>Add to Home screen</b>.</p>' +
        '<p>Once installed it runs full-screen and works offline.</p>']
    ].map(function (a, i) {
      return '<div class="accordion" data-acc="' + i + '"><button class="acc-head">' + a[0] + '<span class="chev">' + ICON("chevron") + '</span></button>' +
        '<div class="acc-body"><div class="acc-inner">' + a[1] + '</div></div></div>';
    }).join("");

    return '<section class="view"><div class="eyebrow">Reference</div><h1 class="h1">Guide</h1>' +
      '<div class="section-head"><h2>Your PRs</h2></div>' +
      '<div class="card">' + prs + '</div>' +
      '<div class="section-head"><h2>Achievements</h2></div>' + badges +
      '<div class="section-head"><h2>How it works</h2></div>' + acc +
      '<div class="section-head"><h2>Your data</h2></div>' +
      '<div class="card"><p class="muted" style="font-size:var(--f-small);margin:0 0 14px">Everything is stored only on this device. You can clear it to start fresh.</p>' +
      '<button class="btn danger" id="resetAll">Reset all data</button></div>' +
      '<div class="center muted" style="margin:28px 0 6px;font-weight:700">Train Hard. Recover Harder.</div>' +
      '</section>';
  }
  function bindGuide() {
    $$("[data-acc]").forEach(function (a) {
      $(".acc-head", a).onclick = function () { a.classList.toggle("open"); };
    });
    $("#resetAll").onclick = function () {
      openConfirm("Reset all data?", "This permanently clears your programs, progress, PRs, XP and badges on this device. This cannot be undone.", "Erase everything", function () {
        try { localStorage.removeItem(KEY); } catch (e) {}
        S = defaultState(); save(); draft = { goal: "powerbuilding", days: 4, exp: "intermediate" };
        view = "programs"; render(); toast("🧹", "All data cleared");
      });
    };
  }

  /* ============================================================
     challenges
     ============================================================ */
  function currentChallenge() {
    var wk = isoWeekKey(new Date());
    var n = parseInt(wk.split("-W")[1], 10) || 1;
    var ch = D.CHALLENGES[n % D.CHALLENGES.length];
    if (ch.metric === "scheduled") ch = Object.assign({}, ch, { target: activeDays() || 3 });
    return ch;
  }
  function challengeProgress(ch) {
    var sow = startOfWeek(new Date()), eow = new Date(sow.getTime() + 7 * DAY_MS), id = programId(S.activeProgram);
    var inWeek = function (ds) { var d = parseYmd(ds); return d >= sow && d < eow; };
    var cur = 0, target = ch.target || 1;
    if (ch.metric === "workouts" || ch.metric === "scheduled") {
      var days = {};
      S.history.forEach(function (h) { if (inWeek(h.date)) days[h.date + ":" + h.dayIdx] = true; });
      cur = Object.keys(days).length;
    } else if (ch.metric === "steps") {
      Object.keys(S.steps).forEach(function (k) { if (inWeek(k)) cur += S.steps[k]; });
    } else if (ch.metric === "stepDays") {
      Object.keys(S.steps).forEach(function (k) { if (inWeek(k) && S.steps[k] >= S.stepGoal) cur++; });
    } else if (ch.metric === "prs") {
      Object.keys(S.prs).forEach(function (k) { if (inWeek(S.prs[k].date)) cur++; });
    } else if (ch.metric === "xp") {
      cur = weeklyXp();
    }
    return { cur: cur, target: target, done: cur >= target };
  }
  function weeklyXp() {
    // approximate weekly XP from history + steps this week
    var sow = startOfWeek(new Date()), eow = new Date(sow.getTime() + 7 * DAY_MS);
    var inWeek = function (ds) { var d = parseYmd(ds); return d >= sow && d < eow; };
    var x = 0;
    S.history.forEach(function (h) { if (inWeek(h.date)) x += D.XP.workout; });
    Object.keys(S.prs).forEach(function (k) { if (inWeek(S.prs[k].date)) x += D.XP.pr; });
    Object.keys(S.steps).forEach(function (k) { if (inWeek(k)) x += Math.min(D.XP.steps, Math.round(S.steps[k] / S.stepGoal * D.XP.steps)); });
    return x;
  }
  function claimChallenge() {
    var ch = currentChallenge(), key = isoWeekKey(new Date()) + ":" + ch.id;
    if (S.claimedChallenges[key]) return;
    var cp = challengeProgress(ch); if (!cp.done) return;
    S.claimedChallenges[key] = true;
    S.freezes += 1;
    awardXp(D.XP.challenge, true);
    save(); burst(); toast("🏆", "Challenge complete! +" + D.XP.challenge + " XP, +1 freeze");
    render();
  }

  /* ============================================================
     gamification core: xp / levels / badges
     ============================================================ */
  function awardXp(amt, rerender) {
    var before = levelFromXp(S.xp);
    S.xp += amt;
    var after = levelFromXp(S.xp);
    save();
    if (after > before) {
      if (after >= 5) earn("level-5");
      if (after >= 10) earn("level-10");
      showLevelUp(after);
    }
    if (rerender) renderChrome();
  }
  function earn(id) {
    if (S.badges[id]) return;
    var b = D.BADGES.filter(function (x) { return x.id === id; })[0]; if (!b) return;
    S.badges[id] = new Date().toISOString();
    save();
    setTimeout(function () { toast(b.icon, "Badge unlocked: " + b.name); }, 400);
  }
  function showLevelUp(lv) {
    var title = D.LEVEL_TITLES[lv - 1];
    $("#levelup").innerHTML = '<div class="lu-card"><div class="lu-badge">' + lv + '</div>' +
      '<div class="lulvl">Level ' + lv + '</div><div class="lutitle">' + esc(title) + '</div>' +
      '<p class="muted">You leveled up. Keep the bar moving.</p>' +
      '<button class="btn primary mt4" id="luClose">Continue</button></div>';
    $("#levelup").classList.add("show");
    $("#luClose").onclick = function () { $("#levelup").classList.remove("show"); };
    burst();
  }

  /* ============================================================
     sheets / confirm / toast
     ============================================================ */
  function openSheet(html) {
    $("#sheet").innerHTML = html;
    $("#scrim").classList.add("show");
    $("#sheet").classList.add("up");
    $("#scrim").onclick = closeSheet;
  }
  function closeSheet() {
    $("#scrim").classList.remove("show");
    $("#sheet").classList.remove("up");
  }
  function openConfirm(title, body, confirmLabel, onYes) {
    openSheet('<div class="grip"></div><h3>' + esc(title) + '</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 18px">' + esc(body) + '</p>' +
      '<button class="btn primary" id="cfYes">' + esc(confirmLabel) + '</button>' +
      '<button class="btn ghost mt2" id="cfNo">Cancel</button>');
    $("#cfYes").onclick = function () { closeSheet(); onYes(); };
    $("#cfNo").onclick = closeSheet;
  }
  function toast(em, msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = '<span class="em">' + em + '</span><span>' + esc(msg) + '</span>';
    $("#toasts").appendChild(t);
    setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 320); }, 2400);
  }

  /* ============================================================
     share
     ============================================================ */
  function share() {
    var li = levelInfo();
    var txt = "I'm on Barpath 💪 Level " + li.lv + " " + li.title + ", " + S.history.length + " workouts, " + S.streak + "-day streak. Train Hard. Recover Harder.";
    if (navigator.share) { navigator.share({ title: "Barpath", text: txt }).catch(function () {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(function () { toast("📋", "Progress copied to clipboard"); }, function () { toast("📋", txt); }); }
    else toast("💪", txt);
  }

  /* ============================================================
     confetti
     ============================================================ */
  var cv = $("#confetti"), ctx = cv.getContext("2d"), parts = [], raf = null;
  function sizeCanvas() { cv.width = innerWidth; cv.height = innerHeight; }
  window.addEventListener("resize", sizeCanvas); sizeCanvas();
  function burst() {
    if (rm) return;
    var cols = ["#2f7bff", "#19c3ff", "#a855f7", "#2ec28a", "#ffb020", "#ff4d57"];
    for (var i = 0; i < 90; i++) {
      parts.push({ x: innerWidth / 2, y: innerHeight * 0.42, vx: (Math.random() - 0.5) * 11, vy: Math.random() * -11 - 3,
        g: 0.32 + Math.random() * 0.2, s: 5 + Math.random() * 6, c: cols[i % cols.length], rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, life: 70 + Math.random() * 30 });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(function (p) { return p.life > 0 && p.y < cv.height + 30; });
    parts.forEach(function (p) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, p.life / 90);
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
    });
    if (parts.length) raf = requestAnimationFrame(tick);
    else { raf = null; ctx.clearRect(0, 0, cv.width, cv.height); }
  }

  /* ============================================================
     rest timer
     ============================================================ */
  var timer = { total: 90, left: 90, running: false, int: null, open: false };
  function timerPanelHtml() {
    var pct = timer.total ? timer.left / timer.total : 0;
    var m = Math.floor(timer.left / 60), s = timer.left % 60;
    var presets = [60, 90, 120].map(function (p) {
      return '<span class="chip' + (timer.total === p && !timer._custom ? " on" : "") + '" data-preset="' + p + '">' + p + 's</span>';
    }).join("");
    return '<div class="timer-ring">' + ringSVG(150, 11, pct) +
      '<div class="t">' + m + ":" + String(s).padStart(2, "0") + '</div></div>' +
      '<div class="timer-presets">' + presets + '<span class="chip" data-add30>+30s</span></div>' +
      '<div class="timer-ctrls"><button class="btn primary" id="tStart">' + (timer.running ? "Pause" : "Start") + '</button>' +
      '<button class="btn ghost" id="tReset">Reset</button>' +
      '<button class="btn ghost" id="tClose">Close</button></div>';
  }
  function paintTimer() { $("#timerPanel").innerHTML = timerPanelHtml(); bindTimer(); }
  function bindTimer() {
    var p = $("#timerPanel");
    $$("[data-preset]", p).forEach(function (b) {
      b.onclick = function () { stopTick(); timer.total = +b.dataset.preset; timer.left = timer.total; timer._custom = false; timer.running = false; paintTimer(); };
    });
    var a = $("[data-add30]", p); if (a) a.onclick = function () { timer.left += 30; timer.total = Math.max(timer.total, timer.left); paintTimer(); };
    $("#tStart", p).onclick = function () { timer.running ? pauseTick() : startTick(); };
    $("#tReset", p).onclick = function () { stopTick(); timer.left = timer.total; timer.running = false; paintTimer(); };
    $("#tClose", p).onclick = closeTimer;
  }
  function openTimer() { timer.open = true; $("#timerPanel").classList.add("up"); paintTimer(); }
  function closeTimer() { timer.open = false; $("#timerPanel").classList.remove("up"); pauseTick(); }
  function startTick() {
    timer.running = true; paintTimer();
    timer.int = setInterval(function () {
      timer.left--;
      if (timer.left <= 0) { timer.left = 0; stopTick(); timer.running = false; finishTimer(); }
      paintTimer();
    }, 1000);
  }
  function pauseTick() { timer.running = false; stopTick(); paintTimer(); }
  function stopTick() { if (timer.int) { clearInterval(timer.int); timer.int = null; } }
  function finishTimer() {
    beep(); if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    toast("⏱️", "Rest done — back to work.");
    timer.left = timer.total;
  }
  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var ac = new AC(), o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
      o.start(); o.stop(ac.currentTime + 0.5);
    } catch (e) {}
  }

  /* ============================================================
     boot
     ============================================================ */
  function boot() {
    load();
    // first-run defaults to onboarding
    if (!S.activeProgram) view = "programs"; else view = "home";
    var t = $("#shareBtn"); if (t) t.onclick = share;
    var lc = $("#levelChip"); if (lc) lc.onclick = function () { setTab("guide"); };
    var ft = $("#fabTimer"); if (ft) ft.onclick = function () { timer.open ? closeTimer() : openTimer(); };
    $$(".tab").forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
    render();
    window.__BARPATH_BOOTED__ = true;
  }
  try {
    boot();
  } catch (e) {
    if (window.console && console.error) console.error("[Barpath] boot failed", e);
    try { showFatal(e); } catch (e2) {}
  }
})();
