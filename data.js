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
      progress: {}, claimedChallenges: {}, swaps: {}, unit: "kg", customLifts: [],
      xpLog: {}, exerciseHistory: {}, autoRest: true, dayMods: {}, tutorialSeen: false,
      customPrograms: {}, customExercises: []
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
    if (!s.swaps || typeof s.swaps !== "object") s.swaps = {};
    if (s.unit !== "kg" && s.unit !== "lb") s.unit = "kg";
    if (!Array.isArray(s.customLifts)) s.customLifts = [];
    if (!s.xpLog || typeof s.xpLog !== "object") s.xpLog = {};
    if (!s.exerciseHistory || typeof s.exerciseHistory !== "object") s.exerciseHistory = {};
    if (typeof s.autoRest !== "boolean") s.autoRest = true;
    if (!s.dayMods || typeof s.dayMods !== "object") s.dayMods = {};
    if (typeof s.tutorialSeen !== "boolean") s.tutorialSeen = false;
    if (!s.customPrograms || typeof s.customPrograms !== "object") s.customPrograms = {};
    if (!Array.isArray(s.customExercises)) s.customExercises = [];
    // migrate positional slot keys -> stable "b"+index ids (entries + swaps)
    if (!s._sidMigrated) {
      try {
        Object.keys(s.progress || {}).forEach(function (pid) {
          var weeks = s.progress[pid] && s.progress[pid].weeks; if (!weeks) return;
          Object.keys(weeks).forEach(function (wk) {
            var bucket = weeks[wk]; if (!bucket) return;
            Object.keys(bucket).forEach(function (dayIdx) {
              var ds = bucket[dayIdx]; if (!ds || !ds.entries) return;
              var ne = {};
              Object.keys(ds.entries).forEach(function (key) {
                ne[/^\d+$/.test(key) ? "b" + key : key] = ds.entries[key];
              });
              ds.entries = ne;
            });
          });
        });
        Object.keys(s.swaps || {}).forEach(function (pid) {
          var m = s.swaps[pid]; if (!m) return;
          var nm = {};
          Object.keys(m).forEach(function (key) {
            var mt = /^(\d+):(\d+)$/.exec(key);
            nm[mt ? (mt[1] + ":b" + mt[2]) : key] = m[key];
          });
          s.swaps[pid] = nm;
        });
      } catch (e) {}
      s._sidMigrated = true;
    }
    if (!s.stepGoal) s.stepGoal = 8000;
    return s;
  }
  function unitLabel() { return S.unit === "lb" ? "lb" : "kg"; }
  function allPrLifts() {
    var base = D.PR_LIFTS.map(function (l) { return { id: l.id, name: l.name, custom: false }; });
    var cust = (S.customLifts || []).map(function (l) { return { id: l.id, name: l.name, custom: true }; });
    return base.concat(cust);
  }
  var S;
  function load() {
    try { S = migrate(JSON.parse(localStorage.getItem(KEY))); }
    catch (e) { S = defaultState(); }
    save();
  }
  var saveTimer = null;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }

  /* ============================================================
     program + periodization derivation
     ============================================================ */
  function programId(p) { if (!p) return null; return p.custom ? "custom-" + p.id : p.goal + "-" + p.days; }
  function isCustomProg() { return !!(S.activeProgram && S.activeProgram.custom); }
  function goalName() {
    if (!S.activeProgram) return "";
    if (S.activeProgram.custom) { var cp = S.customPrograms[S.activeProgram.id]; return cp ? cp.name : "Custom program"; }
    return D.GOALS[S.activeProgram.goal].name;
  }
  function splitLabel() {
    var days = activeDays();
    if (isCustomProg()) return days + "-day custom split";
    return D.PROGRAMS[S.activeProgram.goal].splitName[days];
  }
  function activeDays() { return S.activeProgram ? S.activeProgram.days : null; }
  // Custom training weekdays (sorted dow numbers), falling back to the default map.
  function activeWeekdays() {
    var p = S.activeProgram;
    if (p && Array.isArray(p.weekdays) && p.weekdays.length) return p.weekdays;
    return (D.WEEKDAYS[activeDays()] || []).slice();
  }
  function activeProgramObj() {
    if (!S.activeProgram) return null;
    if (S.activeProgram.custom) { var cp = S.customPrograms[S.activeProgram.id]; return cp ? cp.dayList : null; }
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

  /* persistent per-program exercise swaps (remembered across weeks) */
  function progSwaps() {
    var id = programId(S.activeProgram); if (!id) return null;
    if (!S.swaps) S.swaps = {};
    if (!S.swaps[id]) S.swaps[id] = {};
    return S.swaps[id];
  }
  function swapKey(dayIdx, sid) { return dayIdx + ":" + sid; }
  function getSwap(dayIdx, sid) {
    var m = progSwaps(); if (!m) return null;
    var v = m[swapKey(dayIdx, sid)];
    return (typeof v === "number") ? v : null;
  }
  function setSwap(dayIdx, sid, idx) { var m = progSwaps(); if (m) m[swapKey(dayIdx, sid)] = idx; }
  // Full option list (primary first) for a swappable slot.
  function slotOptions(slot) {
    if (slot.t === "main") {
      var alts = (D.ALTERNATIVES && D.ALTERNATIVES[slot.name]) || [];
      return [{ name: slot.name, muscle: slot.muscle, pr: slot.pr }].concat(
        alts.map(function (a) { return { name: a.name, muscle: a.muscle, pr: null }; })
      );
    }
    if (slot.t === "ex") {
      var ea = (D.ALTERNATIVES && D.ALTERNATIVES[slot.name]) || [];
      return [{ name: slot.name, muscle: slot.muscle, pr: slot.pr }].concat(
        ea.map(function (a) { return { name: a.name, muscle: a.muscle, pr: null }; })
      );
    }
    if (slot.t === "pool") return slot.options;
    return [];
  }

  /* ---- per-program day modifications: custom exercises + ordering ---- */
  function dayMods(dayIdx) {
    var id = programId(S.activeProgram); if (!id) return { order: [], added: [] };
    if (!S.dayMods) S.dayMods = {};
    if (!S.dayMods[id]) S.dayMods[id] = {};
    var m = S.dayMods[id][dayIdx];
    if (!m) { m = { order: [], added: [] }; S.dayMods[id][dayIdx] = m; }
    if (!Array.isArray(m.order)) m.order = [];
    if (!Array.isArray(m.added)) m.added = [];
    return m;
  }
  function customSlot(a) { return { t: "custom", name: a.name, muscle: a.muscle, reps: a.reps, sets: a.sets, id: a.id }; }
  // Ordered list of {sid, slot} for a day, honoring custom adds + manual order.
  function daySlots(dayIdx) {
    var prog = activeProgramObj(), day = prog[dayIdx];
    var map = {}, natural = [];
    day.slots.forEach(function (s, idx) { var sid = "b" + idx; map[sid] = s; natural.push(sid); });
    var m = dayMods(dayIdx);
    m.added.forEach(function (a) { var sid = "c" + a.id; map[sid] = customSlot(a); natural.push(sid); });
    var ordered = [];
    (m.order || []).forEach(function (sid) { if (map[sid] && ordered.indexOf(sid) < 0) ordered.push(sid); });
    natural.forEach(function (sid) { if (ordered.indexOf(sid) < 0) ordered.push(sid); });
    return ordered.map(function (sid) { return { sid: sid, slot: map[sid] }; });
  }

  /* resolve a slot to a concrete prescription for the current block / entry */
  function resolveSlot(slot, dayIdx, sid) {
    if (slot.t === "warmup") {
      return { type: "warmup", name: slot.name, muscle: slot.muscle, rx: slot.prescription };
    }
    if (slot.t === "cardio") {
      var ci = (blockNum() - 1) % slot.options.length;
      return { type: "cardio", name: slot.name, muscle: slot.muscle, rx: slot.options[ci] };
    }
    if (slot.t === "custom") {
      return {
        type: "main", name: slot.name, muscle: slot.muscle, pr: null,
        sets: workSets(slot.sets), reps: slot.reps, pct: null,
        swapped: false, optIdx: 0, optionCount: 1, custom: true
      };
    }
    if (slot.t === "ex") {
      // custom-program exercise: measured, swappable to alternatives, optional PR lift
      var exOpts = slotOptions(slot);
      var exSw = getSwap(dayIdx, sid);
      var exIdx = (exSw != null && exSw < exOpts.length) ? exSw : 0;
      var exOpt = exOpts[exIdx] || exOpts[0] || { name: slot.name, muscle: slot.muscle };
      return {
        type: "main", name: exOpt.name, muscle: exOpt.muscle,
        pr: (exIdx === 0 && slot.pr) ? slot.pr : null,
        sets: workSets(slot.sets), reps: slot.reps, pct: null,
        swapped: exIdx !== 0, optIdx: exIdx, optionCount: exOpts.length
      };
    }
    // main / pool — both swappable
    var options = slotOptions(slot);
    var def = slot.t === "main" ? 0 : (blockNum() - 1) % options.length;
    var sw = getSwap(dayIdx, sid);
    var idx = (sw != null && sw < options.length) ? sw : def;
    var opt = options[idx] || options[0];
    var swapped = slot.t === "main" ? (idx !== 0) : (sw != null);
    return {
      type: slot.t, name: opt.name, muscle: opt.muscle,
      pr: (slot.t === "main" && idx === 0) ? slot.pr : null,
      sets: workSets(slot.sets), reps: slot.reps,
      pct: slot.t === "main" ? slot.pct : null,
      swapped: swapped, optIdx: idx, optionCount: options.length
    };
  }
  function countWork(dayIdx) {
    return daySlots(dayIdx).filter(function (o) { return o.slot.t !== "warmup"; }).length;
  }

  /* ============================================================
     muscle avatar — symbolic line-art figure w/ highlighted region
     ============================================================ */
  var BASE_FIG =
    '<circle class="bf" cx="32" cy="10.5" r="6.2"/>' +
    '<path class="bf" d="M23.5 17.8 Q32 14.8 40.5 17.8 L37 39 Q32 41 27 39 Z"/>' +
    '<circle class="bf" cx="23" cy="19.4" r="4.3"/><circle class="bf" cx="41" cy="19.4" r="4.3"/>' +
    '<path class="bf" d="M27.6 37.5 L36.4 37.5 L35 45 L29 45 Z"/>' +
    '<path class="bs" d="M22 20.5 L16.5 31 L13.5 42"/>' +
    '<path class="bs" d="M42 20.5 L47.5 31 L50.5 42"/>' +
    '<path class="bs" d="M29.2 44 L27 52 L26 61"/>' +
    '<path class="bs" d="M34.8 44 L37 52 L38 61"/>';
  var WHOLE_FIG =
    '<circle class="hf" cx="32" cy="10.5" r="6.2"/>' +
    '<path class="hf" d="M23.5 17.8 Q32 14.8 40.5 17.8 L37 39 Q32 41 27 39 Z"/>' +
    '<circle class="hf" cx="23" cy="19.4" r="4.3"/><circle class="hf" cx="41" cy="19.4" r="4.3"/>' +
    '<path class="hf" d="M27.6 37.5 L36.4 37.5 L35 45 L29 45 Z"/>' +
    '<path class="hs" d="M22 20.5 L16.5 31 L13.5 42"/>' +
    '<path class="hs" d="M42 20.5 L47.5 31 L50.5 42"/>' +
    '<path class="hs" d="M29.2 44 L27 52 L26 61"/>' +
    '<path class="hs" d="M34.8 44 L37 52 L38 61"/>';
  var HOT = {
    chest: '<path class="hf" d="M27 20 Q32 18.2 37 20 L36 27 Q32 29 28 27 Z"/>',
    back: '<path class="hf" d="M23.5 17.8 Q32 14.8 40.5 17.8 L37 39 Q32 41 27 39 Z"/><path class="hs thin" d="M32 19.5 L32 38"/>',
    core: '<path class="hf" d="M28.6 28.5 L35.4 28.5 L34.4 37.5 L29.6 37.5 Z"/>',
    shoulders: '<circle class="hf" cx="23" cy="19.4" r="4.3"/><circle class="hf" cx="41" cy="19.4" r="4.3"/>',
    traps: '<path class="hf" d="M26.5 16.8 Q32 13.8 37.5 16.8 L36.5 20.2 Q32 18.4 27.5 20.2 Z"/>',
    biceps: '<path class="hs" d="M22 20.5 L16.5 31"/><path class="hs" d="M42 20.5 L47.5 31"/>',
    triceps: '<path class="hs" d="M22 20.5 L16.5 31"/><path class="hs" d="M42 20.5 L47.5 31"/>',
    forearms: '<path class="hs" d="M16.5 31 L13.5 42"/><path class="hs" d="M47.5 31 L50.5 42"/>',
    quads: '<path class="hs" d="M29.2 44 L27 52"/><path class="hs" d="M34.8 44 L37 52"/>',
    hamstrings: '<path class="hs" d="M29.2 44 L27 52"/><path class="hs" d="M34.8 44 L37 52"/>',
    glutes: '<path class="hf" d="M27.6 37.5 L36.4 37.5 L35 45 L29 45 Z"/>',
    calves: '<path class="hs" d="M27 52 L26 61"/><path class="hs" d="M37 52 L38 61"/>',
    fullbody: WHOLE_FIG
  };
  function avatarSVG(muscle) {
    if (muscle === "cardio") {
      return '<svg viewBox="0 0 64 64" aria-hidden="true">' +
        '<path class="hf" d="M32 50 C 14 38 12 24 20 19 C 26 15 31 19 32 23 C 33 19 38 15 44 19 C 52 24 50 38 32 50 Z"/>' +
        '<path class="bs" d="M11 33 H22 L26 25 L31 41 L36 30 L39 33 H54"/>' +
        '</svg>';
    }
    if (muscle === "fullbody") {
      return '<svg viewBox="0 0 64 64" aria-hidden="true">' + WHOLE_FIG + '</svg>';
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
      sub.textContent = goalName() + " · " + S.activeProgram.days + " days/week";
    } else {
      sub.textContent = "Attack the Bar. Own the Path.";
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
      if (!S.activeProgram && view !== "guide" && view !== "programs" && view !== "builder") view = "programs";
      if (!S.activeProgram && view === "programs") {
        if (onbMode === "guided") { host.innerHTML = renderWizard(); bindWizard(); }
        else if (onbMode === "quick") { host.innerHTML = renderOnboarding(); bindOnboarding(); }
        else { host.innerHTML = renderOnboardChoice(); bindOnboardChoice(); }
        window.scrollTo(0, 0); return;
      }
      if (view === "home") { host.innerHTML = renderHome(); bindHome(); }
      else if (view === "train") { host.innerHTML = renderTrain(); bindTrain(); }
      else if (view === "programs") { host.innerHTML = renderPrograms(); bindPrograms(); }
      else if (view === "builder") { host.innerHTML = renderBuilder(); bindBuilder(); }
      else if (view === "workout") { host.innerHTML = renderWorkout(); bindWorkout(); if (fab) fab.classList.toggle("hidden", !isStarted(dayState(workoutDayIdx))); }
      else if (view === "guide") { host.innerHTML = renderGuide(); bindGuide(); }
      else if (view === "stats") { host.innerHTML = renderStats(); bindStats(); }
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
  var draft = { goal: "powerbuilding", days: 4, exp: "intermediate", weekdays: defaultWeekdaysFor(4), unit: "kg", prs: {} };
  /* ---- onboarding mode chooser + guided wizard ---- */
  var onbMode = null; // null = chooser, "quick", "guided"
  var wiz = null;
  var WIZ_GOALS = [
    { label: "Build muscle & look better", hint: "Hypertrophy training", val: "hypertrophy" },
    { label: "Get stronger, lift heavier", hint: "Powerlifting focus", val: "powerlifting" },
    { label: "Muscle and strength together", hint: "Powerbuilding — a balanced mix", val: "powerbuilding" },
    { label: "Get fitter, build stamina", hint: "Conditioning & endurance", val: "endurance" }
  ];
  function renderOnboardChoice() {
    return '<section class="view onb">' +
      '<div class="onb-badge">' + avatarSVG("fullbody") + '</div>' +
      '<h1 class="h1" style="margin-top:14px">Welcome to Barpath</h1>' +
      '<p class="muted" style="margin:4px 0 2px">Attack the Bar. Own the Path.</p>' +
      '<p style="margin:18px 0 14px">How would you like to set up your training?</p>' +
      '<button class="bigopt" id="onbGuided"><span class="bo-emoji">🧭</span><span class="bo-txt"><b>Guided setup</b><span class="sub">A few simple questions — best if you\u2019re new to the gym</span></span></button>' +
      '<button class="bigopt" id="onbQuick"><span class="bo-emoji">⚡</span><span class="bo-txt"><b>Quick setup</b><span class="sub">Choose your goal, days and program yourself</span></span></button>' +
      '</section>';
  }
  function bindOnboardChoice() {
    $("#onbGuided").onclick = function () { onbMode = "guided"; wiz = { step: 0, goal: null, days: null, exp: null, unit: null }; render(); };
    $("#onbQuick").onclick = function () { onbMode = "quick"; render(); };
  }
  var WIZ_TOTAL = 4;
  function renderWizard() {
    var s = wiz.step;
    var dots = "";
    for (var i = 0; i < WIZ_TOTAL; i++) dots += '<span class="wiz-dot' + (i <= Math.min(s, WIZ_TOTAL - 1) ? " on" : "") + '"></span>';
    var body;
    if (s === 0) body = wizQuestion("What's your main goal?", "We'll pick a training style that fits.", WIZ_GOALS.map(function (g) { return { label: g.label, hint: g.hint, pick: "goal:" + g.val }; }));
    else if (s === 1) body = wizQuestion("How many days a week can you train?", "You can change this anytime.", [
      { label: "3 days", hint: "Great for getting started", pick: "days:3" },
      { label: "4 days", hint: "A solid step up", pick: "days:4" },
      { label: "5 days", hint: "For when you're ready to push", pick: "days:5" }
    ]);
    else if (s === 2) body = wizQuestion("Have you worked out before?", "This sets your starting intensity.", [
      { label: "I'm new to this", hint: "We'll start gentle", pick: "exp:beginner" },
      { label: "I've trained on and off", hint: "A moderate start", pick: "exp:intermediate" },
      { label: "I train regularly", hint: "Jump right in", pick: "exp:expert" }
    ]);
    else if (s === 3) body = wizQuestion("Pounds or kilograms?", "How you'd like to log your weights.", [
      { label: "Pounds (lb)", pick: "unit:lb" },
      { label: "Kilograms (kg)", pick: "unit:kg" }
    ]);
    else body = wizSummary();
    return '<section class="view onb">' +
      '<button class="btn ghost sm" id="wizBack" style="width:auto;margin-bottom:14px">‹ Back</button>' +
      (s < WIZ_TOTAL ? '<div class="wiz-dots">' + dots + '</div>' : "") +
      body + '</section>';
  }
  function wizQuestion(title, sub, opts) {
    return '<h1 class="h1" style="margin-top:6px">' + esc(title) + '</h1>' +
      '<p class="muted" style="margin:6px 0 18px">' + esc(sub) + '</p>' +
      opts.map(function (o) {
        return '<button class="bigopt" data-wizpick="' + o.pick + '"><span class="bo-txt"><b>' + esc(o.label) + '</b>' + (o.hint ? '<span class="sub">' + esc(o.hint) + '</span>' : "") + '</span><span class="bo-go">' + ICON("arrow") + '</span></button>';
      }).join("");
  }
  function wizSummary() {
    var g = D.GOALS[wiz.goal], wd = defaultWeekdaysFor(wiz.days);
    var split = D.PROGRAMS[wiz.goal].splitName[wiz.days];
    var dayList = wd.map(function (d) { return DOW[d]; }).join(", ");
    return '<div class="onb-badge">' + avatarSVG("fullbody") + '</div>' +
      '<h1 class="h1" style="margin-top:12px">You\u2019re all set</h1>' +
      '<p class="muted" style="margin:6px 0 16px">Here\u2019s your starter plan — you can tweak everything later.</p>' +
      '<div class="card"><div class="sumrow"><span class="muted">Goal</span><b>' + esc(g.name) + '</b></div>' +
      '<div class="sumrow"><span class="muted">Schedule</span><b>' + wiz.days + ' days · ' + esc(split) + '</b></div>' +
      '<div class="sumrow"><span class="muted">Training days</span><b>' + esc(dayList) + '</b></div>' +
      '<div class="sumrow"><span class="muted">Units</span><b>' + (wiz.unit === "lb" ? "Pounds" : "Kilograms") + '</b></div></div>' +
      '<p class="muted" style="font-size:var(--f-small);margin:14px 0">A quick tour comes next, then you\u2019re ready to train.</p>' +
      '<button class="btn primary" id="wizStart">Start training</button>';
  }
  function bindWizard() {
    $("#wizBack").onclick = function () {
      if (wiz.step === 0) { onbMode = null; render(); }
      else { wiz.step--; render(); }
    };
    $$("[data-wizpick]").forEach(function (b) {
      b.onclick = function () {
        var p = b.dataset.wizpick.split(":"), key = p[0], val = p[1];
        wiz[key] = (key === "days") ? +val : val;
        wiz.step++; render();
      };
    });
    var ws = $("#wizStart"); if (ws) ws.onclick = function () {
      draft.unit = wiz.unit; draft.prs = {};
      onbMode = null;
      startProgram(wiz.goal, wiz.days, wiz.exp, defaultWeekdaysFor(wiz.days));
      wiz = null;
    };
  }
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
      '<button class="btn ghost sm" id="onbBackChoice" style="width:auto;margin-bottom:12px">‹ Back</button>' +
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
      '<div class="steplabel"><span class="n">5</span><h2>Units</h2></div>' +
      '<div class="segment" id="unitSeg">' +
      '<button class="' + (draft.unit === "kg" ? "on" : "") + '" data-unit="kg">Kilograms (kg)</button>' +
      '<button class="' + (draft.unit === "lb" ? "on" : "") + '" data-unit="lb">Pounds (lb)</button>' +
      '</div>' +
      '<div class="steplabel"><span class="n">6</span><h2>Your current PRs <span class="muted" style="font-weight:600;font-size:var(--f-small)">— optional</span></h2></div>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 10px">Know your best lifts? Add them so Barpath can celebrate when you beat them. You can skip this and set them later.</p>' +
      '<div class="card" id="prCard">' + prInputsHtml() + '</div>' +
      '<div class="steplabel"><span class="n">\u2713</span><h2>Your split</h2></div>' +
      '<div class="card" id="previewCard">' + previewHtml(draft.goal, draft.days, draft.weekdays) + '</div>' +
      '<button class="btn primary" id="startBtn" style="margin-top:20px"' + (draft.weekdays.length === draft.days ? "" : " disabled") + '>Start This Program</button>' +
      '<button class="btn ghost" id="buildOwnBtn" style="margin-top:10px">Or build your own from scratch</button>' +
      '</section>';
  }
  function prInputsHtml() {
    return D.PR_LIFTS.map(function (l) {
      return '<div class="pr-input"><span class="prname">' + esc(l.name) + '</span>' +
        '<input class="fld" inputmode="decimal" data-pr="' + l.id + '" value="' + esc(draft.prs[l.id] || "") + '" placeholder="' + draft.unit + '" /></div>';
    }).join("");
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
    $$("[data-unit]").forEach(function (b) {
      b.onclick = function () { draft.unit = b.dataset.unit; refreshOnboarding(); };
    });
    bindPrInputs();
    var obc = $("#onbBackChoice"); if (obc) obc.onclick = function () { onbMode = null; render(); };
    var bo = $("#buildOwnBtn"); if (bo) bo.onclick = function () { openBuilder(null); };
    $("#startBtn").onclick = function () {
      if (draft.weekdays.length !== draft.days) { toast("📅", "Pick exactly " + draft.days + " training days first."); return; }
      startProgram(draft.goal, draft.days, draft.exp, draft.weekdays);
    };
  }
  function bindPrInputs() {
    $$("[data-pr]").forEach(function (inp) {
      inp.oninput = function () {
        var v = inp.value.trim();
        if (v) draft.prs[inp.dataset.pr] = v; else delete draft.prs[inp.dataset.pr];
      };
    });
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
    $$("[data-unit]").forEach(function (b) { b.classList.toggle("on", b.dataset.unit === draft.unit); });
    var prc = $("#prCard"); if (prc) { prc.innerHTML = prInputsHtml(); bindPrInputs(); }
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
    if (first && draft.unit) S.unit = draft.unit;
    // seed baseline PRs the user entered during onboarding (no XP, marked as a starting point)
    if (first && draft.prs) {
      D.PR_LIFTS.forEach(function (l) {
        var v = parseFloat(draft.prs[l.id]);
        if (v > 0 && !S.prs[l.id]) S.prs[l.id] = { value: v, date: todayYmd(), reps: "", seeded: true };
      });
    }
    S.programsTried[programId(S.activeProgram)] = true;
    if (Object.keys(S.programsTried).length >= 2) earn("explorer");
    save();
    toast("🚀", "Program started — let's go!");
    setTab("home");
    if (first && !S.tutorialSeen) openTutorial(0, false);
  }

  /* ============================================================
     HOME / dashboard
     ============================================================ */
  function todayDayIdx() {
    var wd = activeWeekdays(), dow = new Date().getDay();
    var k = wd.indexOf(dow);
    if (k < 0) return -1; // rest day
    return splitOrder()[k];
  }
  // Permutation mapping weekday-slot k (the k-th training day of the week) -> program day index.
  function splitOrder() {
    var n = activeDays() || 0;
    var raw = (S.activeProgram && Array.isArray(S.activeProgram.dayOrder)) ? S.activeProgram.dayOrder.slice() : null;
    var ok = raw && raw.length === n;
    if (ok) { var seen = {}; for (var j = 0; j < n; j++) { var v = raw[j]; if (typeof v !== "number" || v < 0 || v >= n || seen[v]) { ok = false; break; } seen[v] = true; } }
    if (!ok) { raw = []; for (var i = 0; i < n; i++) raw.push(i); }
    return raw;
  }
  function doneThisWeek() {
    var sow = startOfWeek(new Date()), eow = new Date(sow.getTime() + 7 * DAY_MS);
    var id = programId(S.activeProgram), seen = {};
    S.history.forEach(function (h) {
      if (h.programId !== id) return;
      var d = parseYmd(h.date);
      if (d >= sow && d < eow) seen[h.date] = true;
    });
    return Object.keys(seen).length;
  }
  function renderHome() {
    var prog = activeProgramObj(), days = activeDays(), g = { name: goalName() };
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

    // banner
    var blockchips = "";
    for (var w = 1; w <= 4; w++) {
      blockchips += '<span class="bdot' + (w <= cycleWeek() ? " on" : "") + (w === cycleWeek() ? " cur" : "") + '"></span>';
    }
    var banner = '<div class="card banner glow">' +
      '<div class="row-between"><div><div class="goalname">' + esc(g.name) + '</div>' +
      '<div class="meta">' + esc(prog.length) + '-day · ' + esc(splitLabel()) + '</div></div>' +
      '<span class="chip accent">Lv ' + li.lv + ' · ' + esc(li.title) + '</span></div>' +
      '<div class="blockchips">' + blockchips + '</div>' +
      '<div class="phase-line"><div class="ptitle">Block ' + blockNum() + ' · Week ' + cycleWeek() + ' — ' + esc(ph.name) + ' <span class="muted" style="font-weight:600">(RPE ' + ph.rpe + ')</span></div>' +
      '<div class="pnote">' + esc(ph.note) + '</div></div>' +
      '<div class="row" style="gap:8px;margin-top:14px"><button class="btn ghost sm" data-editsplit>🧩 Edit split</button>' +
      '<button class="btn ghost sm" data-editdays>📅 Edit days</button></div></div>';

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

    // merged status: level + key stats in one card
    var statusCard = '<div class="card status-card mt3">' +
      '<div class="row-between" style="align-items:flex-end"><div><div class="eyebrow">Level ' + li.lv + '</div>' +
      '<div class="h2">' + esc(li.title) + '</div></div>' +
      '<div class="muted" style="font-size:var(--f-small)">' + (li.lv < 10 ? li.into + " / " + li.span + " XP" : "Max level") + '</div></div>' +
      '<div class="xpbar" style="height:8px;margin:10px 0 14px"><i style="width:' + li.pct + '%"></i></div>' +
      '<div class="status-stats">' +
      miniStat(S.streak, "Streak") + miniStat(doneThisWeek() + "/" + days, "This week") +
      miniStat(S.history.length, "Workouts") + miniStat(S.freezes, "Freezes") + '</div></div>';

    // slim achievements row
    var earnedN = D.BADGES.filter(function (b) { return S.badges[b.id]; }).length;
    var prCount = Object.keys(S.prs).filter(function (k) { return S.prs[k] && S.prs[k].value; }).length;
    var achLine = '<div class="card ach-line mt3">' +
      '<button class="ach-glance" data-tab-link="stats">🏅 ' + earnedN + ' / ' + D.BADGES.length + ' badges · ' + prCount + ' PRs ›</button>' +
      '<button class="btn primary sm" id="hlLogPr" style="width:auto">🥇 Log a PR</button></div>';

    return '<section class="view">' +
      '<div class="section-head"><h2 class="h1">Today</h2><span class="muted" style="font-size:var(--f-small)">' + new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) + '</span></div>' +
      todayCard +
      statusCard +
      achLine +
      '<div class="section-head"><h2>Your program</h2><span><button class="link" data-editdays>Edit days</button><span class="muted" style="margin:0 7px">·</span><button class="link" data-tab-link="programs">Switch</button></span></div>' +
      banner +
      '<div class="section-head"><h2>This week</h2></div>' +
      weekRow +
      '<div class="section-head"><h2>Weekly challenge</h2></div>' +
      challenge +
      '<div class="section-head"><h2>Movement</h2></div>' +
      stepsCard +
      quote +
      '</section>';
  }
  function miniStat(n, l) { return '<div class="mstat"><div class="mnum">' + n + '</div><div class="mlbl">' + esc(l) + '</div></div>'; }
  function stat(n, l) { return '<div class="stat"><div class="num">' + n + '</div><div class="lbl">' + l + '</div></div>'; }
  function achievementsHighlightHtml() {
    var prCount = Object.keys(S.prs).filter(function (k) { return S.prs[k] && S.prs[k].value; }).length;
    var earned = D.BADGES.filter(function (b) { return S.badges[b.id]; });
    var strip = earned.length
      ? earned.slice(-7).map(function (b) { return '<span class="hl-badge" title="' + esc(b.name) + '">' + b.icon + '</span>'; }).join("")
      : '<span class="muted" style="font-size:var(--f-small)">Your first workout earns your first badge.</span>';
    return '<div class="card glow progress-hl mt3">' +
      '<div class="row-between"><div><div class="eyebrow">Achievements</div>' +
      '<div class="h2">' + earned.length + ' / ' + D.BADGES.length + ' badges · ' + prCount + ' PRs</div></div>' +
      '<button class="btn primary sm" id="hlLogPr" style="width:auto">🥇 Log a PR</button></div>' +
      '<div class="hl-badges">' + strip + '</div></div>';
  }
  function dayTile(day, idx, isToday) {
    var ds = dayState(idx), done = ds && ds.done;
    var first = day.slots.filter(function (s) { return s.t !== "warmup"; })[0];
    var mus = first ? (first.t === "pool" ? first.options[0].muscle : first.muscle) : "fullbody";
    return '<button class="daytile' + (done ? " done" : "") + ' glow" data-day="' + idx + '">' +
      '<span class="av lg">' + avatarSVG(mus) + '</span>' +
      '<span class="info"><span class="dname">' + esc(day.name) + (done ? ' <span class="chip good" style="padding:2px 7px">Done</span>' : "") + '</span>' +
      '<span class="dfocus">' + esc(day.focus) + '</span>' +
      '<span class="dmeta">' + (isToday ? "Today · " : "") + countWork(idx) + ' exercises · Week ' + cycleWeek() + ' ' + esc(phase().name) + '</span></span>' +
      '<span class="go">' + ICON("arrow") + '</span></button>';
  }
  function weekScheduleHtml() {
    var sow = startOfWeek(new Date()), wd = activeWeekdays(), id = programId(S.activeProgram);
    var doneDates = {};
    S.history.forEach(function (h) { if (h.programId === id) doneDates[h.date] = true; });
    var todayStr = todayYmd(), cells = "", hasMakeup = false, order = splitOrder();
    for (var i = 0; i < 7; i++) {
      var d = new Date(sow.getTime() + i * DAY_MS), dstr = ymd(d);
      var k = wd.indexOf(d.getDay());
      var dayIdx = k >= 0 ? order[k] : -1;
      var train = k >= 0;
      var done = doneDates[dstr];
      var cls = "daycell" + (train ? " train" : " rest") + (done ? " done" : "") + (dstr === todayStr ? " today" : "");
      var inner = '<div class="dow">' + DOW[d.getDay()][0] + '</div><div class="dotwrap"><span class="dot"></span></div>';
      cells += train
        ? '<button class="' + cls + '" data-day="' + dayIdx + '">' + inner + '</button>'
        : '<div class="' + cls + '">' + inner + '</div>';
    }
    return '<div class="weekrow">' + cells + '</div>' +
      '<div class="muted center" style="font-size:var(--f-tiny);margin-top:6px">Tap a training day to preview its session.</div>' +
      '<div class="row" style="gap:8px;margin-top:12px"><button class="btn ghost" data-editdays>📅 Edit days</button>' +
      '<button class="btn ghost" id="makeupBtn">+ Log a workout</button></div>';
  }
  function badgesGridHtml() {
    return '<div class="badges">' + D.BADGES.map(function (b) {
      var earned = !!S.badges[b.id];
      return '<button class="badge' + (earned ? " earned" : "") + '" data-badge="' + b.id + '">' +
        '<div class="bemoji">' + b.icon + '</div><div class="bname">' + esc(b.name) + '</div></button>';
    }).join("") + '</div>';
  }
  function openBadgeInfo(id) {
    var b = D.BADGES.filter(function (x) { return x.id === id; })[0]; if (!b) return;
    var at = S.badges[id];
    var status = at
      ? '<span class="chip good">Earned ' + esc(shortDate(("" + at).slice(0, 10))) + '</span>'
      : '<span class="chip">Locked</span>';
    openSheet('<div class="grip"></div><div style="text-align:center;padding:6px 0 4px">' +
      '<div style="font-size:56px;line-height:1;' + (at ? "" : "filter:grayscale(1);opacity:.5") + '">' + b.icon + '</div>' +
      '<h3 style="margin:10px 0 6px">' + esc(b.name) + '</h3>' +
      '<p class="muted" style="font-size:var(--f-base);margin:0 0 14px">' + esc(b.desc) + '</p>' +
      status + '</div>');
  }
  function bindHome() {
    $$("[data-day]").forEach(function (b) { b.onclick = function () { go("workout", +b.dataset.day); }; });
    $$("[data-tab-link]").forEach(function (b) { b.onclick = function () { setTab(b.dataset.tabLink); }; });
    var sa = $("#stepAdd"); if (sa) sa.onclick = addSteps;
    var si = $("#stepInput"); if (si) si.onkeydown = function (e) { if (e.key === "Enter") addSteps(); };
    var mb = $("#makeupBtn"); if (mb) mb.onclick = openMakeupSheet;
    var la = $("#logAnyBtn"); if (la) la.onclick = openMakeupSheet;
    var cc = $("#claimCh"); if (cc) cc.onclick = claimChallenge;
    var hp = $("#hlLogPr"); if (hp) hp.onclick = function () { openPrLogger(); };
    $$("[data-chartlift]").forEach(function (b) { b.onclick = function () { chartLift = b.dataset.chartlift; render(); }; });
    $$("[data-exhist]").forEach(function (b) { b.onclick = function () { openExerciseHistory(b.dataset.exhist); }; });
    $$("[data-badge]").forEach(function (b) { b.onclick = function () { openBadgeInfo(b.dataset.badge); }; });
    $$("[data-editdays]").forEach(function (b) { b.onclick = openEditDays; });
    $$("[data-editsplit]").forEach(function (b) { b.onclick = openSplitEditor; });
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
    var prog = activeProgramObj(), wd = activeWeekdays(), order = splitOrder();
    var ph = phase();
    var tiles = order.map(function (di, k) {
      var day = prog[di];
      var ds = dayState(di), done = ds && ds.done;
      var first = day.slots.filter(function (s) { return s.t !== "warmup"; })[0];
      var mus = first ? (first.t === "pool" ? first.options[0].muscle : first.muscle) : "fullbody";
      return '<button class="daytile' + (done ? " done" : "") + '" data-day="' + di + '" style="margin-bottom:12px">' +
        '<span class="av lg">' + avatarSVG(mus) + '</span>' +
        '<span class="info"><span class="dname">' + esc(day.name) + (done ? ' <span class="chip good" style="padding:2px 7px">Done</span>' : "") + '</span>' +
        '<span class="dfocus">' + esc(day.focus) + '</span>' +
        '<span class="dmeta">' + DOW[wd[k]] + ' · ' + countWork(di) + ' exercises</span></span>' +
        '<span class="go">' + ICON("arrow") + '</span></button>';
    }).join("");
    return '<section class="view">' +
      '<div class="eyebrow">' + esc(goalName()) + '</div>' +
      '<h1 class="h1">Train</h1>' +
      '<div class="card mt3" style="padding:12px 16px"><div class="row-between"><div class="muted" style="font-size:var(--f-small)">Block ' + blockNum() + ' · Week ' + cycleWeek() + '</div><span class="chip accent">' + esc(ph.name) + ' · RPE ' + ph.rpe + '</span></div></div>' +
      '<button class="btn ghost mt3" data-editsplit style="width:auto">🧩 Edit split</button>' +
      '<div class="mt4">' + tiles + '</div></section>';
  }
  function bindTrain() {
    $$("[data-day]").forEach(function (b) { b.onclick = function () { go("workout", +b.dataset.day); }; });
    $$("[data-editsplit]").forEach(function (b) { b.onclick = openSplitEditor; });
  }

  /* ============================================================
     WORKOUT screen
     ============================================================ */
  function renderWorkout() {
    var prog = activeProgramObj(), day = prog[workoutDayIdx], ds = dayState(workoutDayIdx);
    var slots = daySlots(workoutDayIdx);
    var work = slots.filter(function (o) { return o.slot.t !== "warmup"; });
    var effective = work.filter(function (o) { return !(ds.entries[o.sid] && ds.entries[o.sid].skipped); });
    var doneCount = effective.filter(function (o) { return ds.entries[o.sid] && ds.entries[o.sid].done; }).length;
    var pct = effective.length ? Math.round(doneCount / effective.length * 100) : 0;
    var started = isStarted(ds);

    var cards = slots.map(function (o) { return exerciseCard(o.sid, o.slot, !started); }).join("");

    var head = '<div class="wk-head"><div class="eyebrow">Week ' + cycleWeek() + ' · ' + esc(phase().name) + '</div>' +
      '<h1 class="h1">' + esc(day.name) + '</h1>' +
      '<div class="muted" style="font-size:var(--f-small)">' + esc(day.focus) + ' · ' + work.length + ' exercises</div>';

    var editBtn = '<button class="btn ghost sm" id="editDayBtn" style="width:auto;margin-top:12px">✎ Edit exercises</button>';
    var body, actions = "";
    if (!started) {
      var isToday = (workoutDayIdx === todayDayIdx());
      if (isToday) {
        head += '<button class="btn primary" id="startWorkoutBtn" style="margin-top:16px">▶ Start Workout</button>' +
          '<div class="wk-note muted" style="margin-top:8px">Warm up first, then start to log each set.</div>' + editBtn + '</div>';
        body = '<div class="wk-preview-label muted">Today\u2019s plan</div>' + cards;
      } else {
        var wd = activeWeekdays();
        var dowName = (wd[workoutDayIdx] != null) ? DOW[wd[workoutDayIdx]] : null;
        head += '<div class="preview-banner">' + (dowName ? "Scheduled for " + dowName : "Not today\u2019s session") + ' · preview</div>' +
          '<button class="btn ghost" id="startWorkoutBtn" style="margin-top:12px">Train this now</button>' + editBtn + '</div>';
        body = '<div class="wk-preview-label muted">The plan</div>' + cards;
      }
    } else {
      head += '<div class="wk-progress"><i id="wkFill" style="width:' + pct + '%"></i></div>' +
        '<div class="wk-note muted" id="wkNote">' + doneCount + ' of ' + effective.length + ' done</div>' + editBtn + '</div>';
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
  function exerciseCard(sid, slot, locked) {
    var r = resolveSlot(slot, workoutDayIdx, sid);
    var ds = dayState(workoutDayIdx), entry = ds.entries[sid] || {};
    var done = !!entry.done;

    if (r.type === "warmup") {
      return '<div class="ex warmup-card"><div class="ex-top" style="cursor:default">' +
        '<span class="av">' + avatarSVG("cardio") + '</span>' +
        '<span class="exinfo"><span class="exname">' + esc(r.name) + '</span>' +
        '<span class="exrx">' + esc(r.rx) + '</span></span></div></div>';
    }

    if (!locked && entry.skipped) {
      return '<div class="ex skipped" data-ex="' + sid + '"><div class="ex-top" style="cursor:default">' +
        '<span class="cbox ghostbox" aria-hidden="true">' + ICON("check") + '</span>' +
        '<span class="exinfo"><span class="exname">' + esc(r.name) + ' <span class="swapped">skipped</span></span>' +
        '<span class="exrx muted">Skipped for today</span></span>' +
        '<button class="btn ghost sm" data-unskip="' + sid + '" style="width:auto">Undo</button></div></div>';
    }

    var rxText = (r.sets + " × " + r.reps + (r.pct ? "  ·  " + r.pct : ""));
    var avatar = (r.type === "cardio")
      ? '<span class="av">' + avatarSVG(r.muscle) + '</span>'
      : '<span class="av" style="width:34px;height:34px;float:left;margin-right:10px">' + avatarSVG(r.muscle) + '</span>';
    var customTag = r.custom ? '<span class="extag" style="color:var(--accent-2)">custom</span>' : '';
    var nameLine = '<span class="exname">' + esc(r.name) + (r.swapped ? '<span class="swapped">swapped</span>' : "") + '</span>' +
      (r.type === "cardio"
        ? '<span class="extag">' + esc(r.muscle) + '</span><div class="cardio-rx">' + esc(r.rx) + '</div>'
        : '<span class="exrx">' + esc(rxText) + ' · <span class="extag">' + esc(r.muscle) + '</span> ' + customTag + '</span>');

    if (locked) {
      return '<div class="ex locked">' +
        '<div class="ex-top"><span class="cbox ghostbox" aria-hidden="true">' + ICON("check") + '</span>' +
        (r.type === "cardio" ? '<span class="exinfo">' + nameLine + '</span>'
          : '<span class="exinfo">' + avatar + nameLine + '</span>') +
        '</div></div>';
    }

    var top = '<div class="ex-top"><button class="cbox" data-check="' + sid + '" aria-label="Complete">' + ICON("check") + '</button>' +
      (r.type === "cardio" ? '<span class="exinfo">' + nameLine + '</span>'
        : '<span class="exinfo">' + avatar + nameLine + '</span>') +
      '<button class="chev" data-toggle="' + sid + '">' + ICON("chevron") + '</button></div>';

    if (r.type === "cardio") {
      return '<div class="ex' + (done ? " done" : "") + (entry.open ? " open" : "") + '" data-ex="' + sid + '">' + top +
        '<div class="ex-body"><div class="ex-body-inner">' +
        '<label class="fldlbl">Notes</label><textarea class="fld" rows="2" data-notes="' + sid + '" placeholder="How did it feel? Distance, pace…">' + esc(entry.notes || "") + '</textarea>' +
        '</div></div></div>';
    }

    // main / pool / custom — per-set weight & reps logging
    var sets = setsFor(entry);
    var setRows = "";
    for (var k = 0; k < r.sets; k++) {
      var sv = sets[k] || { w: "", r: "" };
      setRows += '<div class="setrow">' +
        '<span class="setn">' + (k + 1) + '</span>' +
        '<input class="fld setfld" inputmode="decimal" data-setw="' + sid + '" data-k="' + k + '" value="' + esc(sv.w) + '" placeholder="' + unitLabel() + '" />' +
        '<input class="fld setfld" inputmode="numeric" data-setr="' + sid + '" data-k="' + k + '" value="' + esc(sv.r) + '" placeholder="' + esc(r.reps) + '" />' +
        '</div>';
    }
    var setlog = '<div class="setlog"><div class="setrow head"><span class="setn">Set</span><span>Weight</span><span>Reps</span></div>' + setRows + '</div>';
    var lp = lastExercisePerf(r.name);
    var lastLine = lp ? '<div class="ex-last">Last · ' + esc(shortDate(lp.date)) + ': <b>' + esc(lastTopStr(lp)) + '</b></div>' : '';

    var tools = '<div class="ex-tools">';
    if (r.optionCount > 1) tools += '<button class="btn ghost sm" data-swap="' + sid + '">' + ICON("swap") + ' Swap</button>';
    if (r.type === "main" && r.pr) tools += '<button class="btn ghost sm" data-savepr="' + sid + '">🥇 Save PR</button>';
    tools += '<button class="btn ghost sm" data-rest="' + sid + '">' + ICON("timer") + ' Rest</button>';
    tools += '<button class="btn ghost sm" data-skip="' + sid + '">🚫 Skip</button></div>';

    return '<div class="ex' + (done ? " done" : "") + (entry.open ? " open" : "") + '" data-ex="' + sid + '">' + top +
      '<div class="ex-body"><div class="ex-body-inner">' +
      lastLine +
      setlog +
      '<label class="fldlbl" style="margin-top:12px">Notes</label><textarea class="fld" rows="2" data-notes="' + sid + '" placeholder="RPE, tempo, cues…">' + esc(entry.notes || "") + '</textarea>' +
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
  /* ---- per-exercise history (powers "last time" + trends) ---- */
  function recordExercisePerf(date) {
    var ds = dayState(workoutDayIdx);
    daySlots(workoutDayIdx).forEach(function (o) {
      var slot = o.slot;
      if (slot.t === "warmup" || slot.t === "cardio") return;
      var entry = ds.entries[o.sid]; if (!entry || entry.skipped) return;
      var clean = setsFor(entry).filter(function (s) { return parseFloat(s.w) > 0; }).map(function (s) { return { w: s.w, r: s.r || "" }; });
      if (!clean.length) return;
      var r = resolveSlot(slot, workoutDayIdx, o.sid), top = bestSet(entry);
      if (!S.exerciseHistory[r.name]) S.exerciseHistory[r.name] = [];
      S.exerciseHistory[r.name].push({ date: date, sets: clean, top: top ? top.w : null, reps: top ? top.r : "" });
      if (S.exerciseHistory[r.name].length > 40) S.exerciseHistory[r.name] = S.exerciseHistory[r.name].slice(-40);
    });
  }
  function lastExercisePerf(name) {
    var h = S.exerciseHistory && S.exerciseHistory[name];
    return (h && h.length) ? h[h.length - 1] : null;
  }
  function lastTopStr(lp) {
    var w = (lp.top != null && lp.top !== "") ? lp.top : (lp.sets[0] ? lp.sets[0].w : "");
    var r = lp.reps || (lp.sets[0] ? lp.sets[0].r : "");
    return w + (r ? " × " + r : "") + " " + unitLabel();
  }
  function shortDate(ymdStr) {
    try { return parseYmd(ymdStr).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
    catch (e) { return ymdStr; }
  }
  function sparkline(vals) {
    if (!vals || vals.length < 2) return "";
    var w = 64, h = 22, max = Math.max.apply(null, vals), min = Math.min.apply(null, vals), range = (max - min) || 1;
    var pts = vals.map(function (v, i) {
      var x = (i / (vals.length - 1)) * (w - 2) + 1;
      var y = h - 2 - ((v - min) / range) * (h - 4);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<polyline points="' + pts + '" fill="none" stroke="var(--accent-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function featuredLift() {
    var best = null, bestN = 1;
    Object.keys(S.exerciseHistory || {}).forEach(function (name) {
      var n = (S.exerciseHistory[name] || []).filter(function (e) { return parseFloat(e.top) > 0; }).length;
      if (n > bestN) { bestN = n; best = name; }
    });
    return best;
  }
  function lineChartSVG(vals) {
    var W = 300, H = 110, pad = 12;
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals), range = (max - min) || 1;
    var n = vals.length;
    var xs = function (i) { return pad + (n === 1 ? 0 : (i / (n - 1)) * (W - 2 * pad)); };
    var ys = function (v) { return pad + (1 - (v - min) / range) * (H - 2 * pad); };
    var line = vals.map(function (v, i) { return (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(v).toFixed(1); }).join(" ");
    var area = line + " L" + xs(n - 1).toFixed(1) + " " + (H - pad) + " L" + xs(0).toFixed(1) + " " + (H - pad) + " Z";
    var dots = vals.map(function (v, i) { return '<circle cx="' + xs(i).toFixed(1) + '" cy="' + ys(v).toFixed(1) + '" r="3" fill="var(--accent-2)"/>'; }).join("");
    return '<svg class="linechart" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="120" role="img" aria-label="Strength progress chart">' +
      '<defs><linearGradient id="lcfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity="0.30"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#lcfill)"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--accent-2)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' + dots + '</svg>';
  }
  var chartLift = null;
  function trackedLifts() {
    return Object.keys(S.exerciseHistory || {}).filter(function (n) {
      return (S.exerciseHistory[n] || []).filter(function (e) { return parseFloat(e.top) > 0; }).length >= 2;
    });
  }
  function progressChartHtml() {
    var tracked = trackedLifts();
    var name = (chartLift && tracked.indexOf(chartLift) >= 0) ? chartLift
      : (featuredLift() && tracked.indexOf(featuredLift()) >= 0 ? featuredLift() : tracked[0]);
    if (!name) {
      var anyOne = featuredLift() || Object.keys(S.exerciseHistory || {})[0];
      return '<div class="card"><div class="eyebrow">Strength progress</div>' +
        '<div class="chart-empty muted">' + (anyOne
          ? "Log your main lifts again to start a trend line here."
          : "Log your main lifts across a few sessions to see your strength trend here.") + '</div></div>';
    }
    var series = S.exerciseHistory[name].filter(function (e) { return parseFloat(e.top) > 0; }).map(function (e) { return { d: e.date, v: parseFloat(e.top) }; }).slice(-12);
    var latest = series[series.length - 1].v, first = series[0].v, delta = Math.round((latest - first) * 10) / 10;
    var chips = tracked.length > 1
      ? '<div class="chart-lifts">' + tracked.map(function (n) { return '<button class="chip' + (n === name ? " on" : "") + '" data-chartlift="' + esc(n) + '">' + esc(n) + '</button>'; }).join("") + '</div>'
      : "";
    return '<div class="card progress-chart">' +
      '<div class="row-between" style="align-items:flex-start"><div><div class="eyebrow">Strength progress</div><div class="h2">' + esc(name) + '</div></div>' +
      '<div style="text-align:right"><div class="h2">' + latest + ' ' + unitLabel() + '</div>' +
      '<div class="muted" style="font-size:var(--f-small)">' + (delta >= 0 ? "+" : "") + delta + " " + unitLabel() + ' since start</div></div></div>' +
      chips +
      '<button class="chart-tap" data-exhist="' + esc(name) + '" aria-label="View full history for ' + esc(name) + '">' + lineChartSVG(series.map(function (s) { return s.v; })) +
      '<div class="row-between muted" style="font-size:var(--f-tiny);margin-top:2px"><span>' + esc(shortDate(series[0].d)) + '</span><span>tap for full history</span><span>' + esc(shortDate(series[series.length - 1].d)) + '</span></div></button>' +
      '</div>';
  }
  function openExerciseHistory(name) {
    var h = (S.exerciseHistory[name] || []).filter(function (e) { return parseFloat(e.top) > 0; });
    if (!h.length) { toast("📊", "No history yet for " + name + "."); return; }
    var tops = h.map(function (e) { return parseFloat(e.top); });
    var best = Math.max.apply(null, tops);
    var chart = h.length >= 2 ? '<div class="card" style="margin-bottom:12px">' + lineChartSVG(tops.slice(-14)) + '</div>' : "";
    var rows = h.slice().reverse().map(function (e) {
      var setStr = (e.sets && e.sets.length) ? e.sets.map(function (s) { return s.w + (s.r ? "×" + s.r : ""); }).join(", ") : (e.top + (e.reps ? "×" + e.reps : ""));
      return '<div class="hist-row"><span class="hist-day">' + esc(shortDate(e.date)) + '</span><span class="muted" style="font-size:var(--f-small)">' + esc(setStr) + ' ' + unitLabel() + '</span></div>';
    }).join("");
    openSheet('<div class="grip"></div><h3>' + esc(name) + '</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 14px">Best ' + best + ' ' + unitLabel() + ' · ' + h.length + ' session' + (h.length > 1 ? "s" : "") + ' logged</p>' +
      chart + '<div class="card" style="max-height:46vh;overflow:auto">' + rows + '</div>');
  }
  function slotBySid(dayIdx, sid) {
    var f = daySlots(dayIdx).filter(function (o) { return o.sid === sid; })[0];
    return f ? f.slot : null;
  }
  function bindWorkout() {
    $("#backBtn").onclick = function () { setTab("train"); };
    var sw = $("#startWorkoutBtn"); if (sw) sw.onclick = startWorkout;
    var ed = $("#editDayBtn"); if (ed) ed.onclick = function () { openDayEditor(workoutDayIdx); };
    // Tapping anywhere on an exercise header expands it — any exercise, any order.
    $$('.ex[data-ex]').forEach(function (card) {
      var sid = card.dataset.ex;
      var top = card.querySelector('.ex-top');
      if (top) top.onclick = function () { toggleOpen(sid); };
    });
    $$("[data-check]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); toggleDone(b.dataset.check); }; });
    $$("[data-setw]").forEach(function (inp) { inp.oninput = function () { setSetVal(inp.dataset.setw, +inp.dataset.k, "w", inp.value); }; });
    $$("[data-setr]").forEach(function (inp) { inp.oninput = function () { setSetVal(inp.dataset.setr, +inp.dataset.k, "r", inp.value); }; });
    $$("[data-notes]").forEach(function (inp) { inp.oninput = function () { setEntry(inp.dataset.notes, "notes", inp.value); }; });
    $$("[data-swap]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); openSwapSheet(b.dataset.swap); }; });
    $$("[data-savepr]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); savePR(b.dataset.savepr); }; });
    $$("[data-rest]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); openTimer(); }; });
    $$("[data-unskip]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); unskipExercise(b.dataset.unskip); }; });
    $$("[data-skip]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); skipExercise(b.dataset.skip); }; });
    $$('.ex-body input, .ex-body textarea, .ex-body select, .ex-tools').forEach(function (el) {
      el.addEventListener('click', function (e) { e.stopPropagation(); });
    });
    var fb = $("#finishBtn"); if (fb) fb.onclick = finishWorkout;
    var pb = $("#printBtn"); if (pb) pb.onclick = function () { window.print(); };
    var rb = $("#resetBtn"); if (rb) rb.onclick = resetDay;
  }
  function skipExercise(sid) {
    var e = ensureEntry(sid); e.skipped = true; e.done = false; e.open = false;
    save(); render(); toast("🚫", "Exercise skipped for today");
  }
  function unskipExercise(sid) {
    var e = ensureEntry(sid); e.skipped = false; save(); render();
  }
  function startWorkout() {
    var ds = dayState(workoutDayIdx);
    ds.started = true; ds.startedAt = new Date().toISOString();
    var firstWork = daySlots(workoutDayIdx).filter(function (o) { return o.slot.t !== "warmup"; })[0];
    if (firstWork) ensureEntry(firstWork.sid).open = true;
    save();
    toast("💪", "Workout started — let's go!");
    render();
  }
  function setSetVal(sid, k, field, v) {
    var e = ensureEntry(sid);
    if (!Array.isArray(e.sets)) e.sets = setsFor(e).slice();
    while (e.sets.length <= k) e.sets.push({ w: "", r: "" });
    e.sets[k][field] = v;
    save();
  }
  function ensureEntry(sid) {
    var ds = dayState(workoutDayIdx);
    if (!ds.entries[sid]) ds.entries[sid] = {};
    return ds.entries[sid];
  }
  function setEntry(sid, k, v) { ensureEntry(sid)[k] = v; save(); }
  function toggleOpen(sid) {
    var e = ensureEntry(sid); e.open = !e.open; save();
    var card = $('.ex[data-ex="' + sid + '"]'); if (card) card.classList.toggle("open", e.open);
  }
  function toggleDone(sid) {
    var e = ensureEntry(sid);
    e.done = !e.done;
    if (e.done) { awardXp(D.XP.set, false); maybeRestPrompt(); }
    save();
    var card = $('.ex[data-ex="' + sid + '"]'); if (card) card.classList.toggle("done", e.done);
    updateWkProgress();
    renderChrome();
  }
  function maybeRestPrompt() {
    if (!S.autoRest) return;
    var ds = dayState(workoutDayIdx);
    var work = daySlots(workoutDayIdx).filter(function (o) { return o.slot.t !== "warmup"; });
    var remaining = work.filter(function (o) { return !(ds.entries[o.sid] && (ds.entries[o.sid].done || ds.entries[o.sid].skipped)); }).length;
    if (remaining <= 0) return;
    stopTick();
    timer.left = timer.total; timer.running = false;
    openTimer();
    startTick();
  }
  function updateWkProgress() {
    var ds = dayState(workoutDayIdx);
    var work = daySlots(workoutDayIdx).filter(function (o) { return o.slot.t !== "warmup"; });
    var effective = work.filter(function (o) { return !(ds.entries[o.sid] && ds.entries[o.sid].skipped); });
    var dc = effective.filter(function (o) { return ds.entries[o.sid] && ds.entries[o.sid].done; }).length;
    var pct = effective.length ? Math.round(dc / effective.length * 100) : 0;
    var f = $("#wkFill"); if (f) f.style.width = pct + "%";
    var n = $("#wkNote"); if (n) n.textContent = dc + " of " + effective.length + " done";
  }

  function openSwapSheet(sid) {
    var slot = slotBySid(workoutDayIdx, sid); if (!slot) return;
    var options = slotOptions(slot);
    if (options.length < 2) return;
    var cur = resolveSlot(slot, workoutDayIdx, sid).optIdx;
    var opts = options.map(function (o, idx) {
      var tag = idx === cur ? '<span class="chip accent">Current</span>'
        : (idx === 0 && slot.t === "main" ? '<span class="chip">Default</span>' : "");
      return '<button class="swap-opt' + (idx === cur ? " cur" : "") + '" data-pick="' + idx + '">' +
        '<span class="av">' + avatarSVG(o.muscle) + '</span>' +
        '<span class="grow"><span style="font-weight:700">' + esc(o.name) + '</span><br><span class="muted" style="font-size:var(--f-small);text-transform:capitalize">' + esc(o.muscle) + (o.pr ? " · tracks PR" : "") + '</span></span>' +
        tag + '</button>';
    }).join("");
    openSheet('<div class="grip"></div><h3>Swap exercise</h3><p class="muted" style="font-size:var(--f-small);margin:0 0 14px">Same prescribed sets &amp; reps. Your choice is remembered for this day going forward.</p>' + opts);
    $$("[data-pick]", $("#sheet")).forEach(function (b) {
      b.onclick = function () {
        setSwap(workoutDayIdx, sid, +b.dataset.pick);
        save(); closeSheet(); render();
        toast("🔁", "Exercise swapped — saved for next time");
      };
    });
  }
  function savePR(sid) {
    var slot = slotBySid(workoutDayIdx, sid); if (!slot) return;
    var r = resolveSlot(slot, workoutDayIdx, sid);
    var e = ensureEntry(sid);
    var best = bestSet(e);
    if (!best) { toast("⚖️", "Log a set with weight first to save a PR."); toggleOpen(sid); return; }
    var val = best.w;
    var prev = S.prs[r.pr];
    if (prev && val <= prev.value) { toast("💪", "Logged. Your PR is still " + prev.value + " " + unitLabel() + "."); return; }
    var firstEver = !D.PR_LIFTS.some(function (l) { return S.prs[l.id] && !S.prs[l.id].seeded; });
    S.prs[r.pr] = { value: val, date: todayYmd(), reps: best.r || "", seeded: false };
    e.prSaved = true;
    awardXp(D.XP.pr, false);
    if (firstEver) earn("first-pr");
    checkBadges();
    save(); burst();
    toast("🥇", "New PR: " + r.name + " " + val + " " + unitLabel() + "!");
    renderChrome();
  }
  var EDIT_MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core", "cardio", "fullbody"];
  function openDayEditor(dayIdx) {
    var slots = daySlots(dayIdx);
    var rows = slots.map(function (o, pos) {
      var r = resolveSlot(o.slot, dayIdx, o.sid);
      var isCustom = o.slot.t === "custom";
      var label = o.slot.t === "warmup" ? "Warm-up" : r.name;
      var sub = o.slot.t === "warmup" ? "warm-up" : (r.muscle || "");
      return '<div class="edit-row">' +
        '<span class="grow"><span style="font-weight:600">' + esc(label) + '</span>' + (isCustom ? ' <span class="extag" style="color:var(--accent-2)">custom</span>' : "") +
        '<br><span class="muted" style="font-size:var(--f-tiny);text-transform:capitalize">' + esc(sub) + '</span></span>' +
        '<button class="iconbtn xs" data-mvup="' + pos + '"' + (pos === 0 ? " disabled" : "") + ' aria-label="Move up">▲</button>' +
        '<button class="iconbtn xs" data-mvdn="' + pos + '"' + (pos === slots.length - 1 ? " disabled" : "") + ' aria-label="Move down">▼</button>' +
        (isCustom ? '<button class="iconbtn xs danger" data-rmcustom="' + esc(o.slot.id) + '" aria-label="Remove">✕</button>' : '<span style="width:34px;flex:0 0 auto"></span>') +
        '</div>';
    }).join("");
    var muscleOpts = EDIT_MUSCLES.map(function (m) { return '<option value="' + m + '">' + m.charAt(0).toUpperCase() + m.slice(1) + '</option>'; }).join("");
    var addForm = '<div class="eyebrow" style="margin:4px 0 8px">Add an exercise</div>' +
      '<input class="fld" id="addExName" placeholder="Exercise name (e.g. Face Pull)" />' +
      '<div class="io-grid" style="margin-top:8px"><div><label class="fldlbl">Muscle</label><select class="fld" id="addExMuscle">' + muscleOpts + '</select></div>' +
      '<div><label class="fldlbl">Sets</label><input class="fld" id="addExSets" inputmode="numeric" value="3" /></div></div>' +
      '<div style="margin-top:8px"><label class="fldlbl">Reps</label><input class="fld" id="addExReps" value="8–12" /></div>' +
      '<button class="btn primary mt4" id="addExSave">Add to day</button>';
    openSheet('<div class="grip"></div><h3>Edit exercises</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 12px">Reorder with the arrows, add your own movements, or remove ones you added. Saved for this day.</p>' +
      '<div class="card" style="margin-bottom:14px">' + rows + '</div>' + addForm);
    $$("[data-mvup]").forEach(function (b) { if (!b.disabled) b.onclick = function () { moveSlot(dayIdx, +b.dataset.mvup, -1); }; });
    $$("[data-mvdn]").forEach(function (b) { if (!b.disabled) b.onclick = function () { moveSlot(dayIdx, +b.dataset.mvdn, 1); }; });
    $$("[data-rmcustom]").forEach(function (b) { b.onclick = function () { removeCustom(dayIdx, b.dataset.rmcustom); }; });
    var sv = $("#addExSave"); if (sv) sv.onclick = function () { addCustomExercise(dayIdx); };
  }
  function moveSlot(dayIdx, pos, dir) {
    var order = daySlots(dayIdx).map(function (o) { return o.sid; });
    var ni = pos + dir; if (ni < 0 || ni >= order.length) return;
    var t = order[pos]; order[pos] = order[ni]; order[ni] = t;
    dayMods(dayIdx).order = order;
    save(); openDayEditor(dayIdx); render();
  }
  function removeCustom(dayIdx, id) {
    var m = dayMods(dayIdx);
    m.added = m.added.filter(function (a) { return String(a.id) !== String(id); });
    m.order = (m.order || []).filter(function (sid) { return sid !== "c" + id; });
    var ds = dayState(dayIdx); if (ds && ds.entries) delete ds.entries["c" + id];
    save(); openDayEditor(dayIdx); render(); toast("🗑️", "Exercise removed");
  }
  function addCustomExercise(dayIdx) {
    var nm = ($("#addExName").value || "").trim();
    if (!nm) { toast("✏️", "Name your exercise first."); return; }
    var sets = clamp(parseInt($("#addExSets").value, 10) || 3, 1, 12);
    var reps = ($("#addExReps").value || "").trim() || "8–12";
    var muscle = $("#addExMuscle").value || "fullbody";
    var id = Date.now().toString(36);
    var m = dayMods(dayIdx);
    m.added.push({ id: id, name: nm, muscle: muscle, reps: reps, sets: sets });
    m.order = daySlots(dayIdx).map(function (o) { return o.sid; });
    earn("architect");
    save(); openDayEditor(dayIdx); render(); toast("➕", "Added " + nm);
  }
  function finishWorkout() {
    var ds = dayState(workoutDayIdx);
    if (ds.done) return;
    var work = daySlots(workoutDayIdx).filter(function (o) { return o.slot.t !== "warmup"; });
    var dc = work.filter(function (o) { return ds.entries[o.sid] && ds.entries[o.sid].done; }).length;
    if (dc === 0) {
      openConfirm("Nothing checked off", "Mark at least one exercise complete, or finish anyway?", "Finish anyway", function () { commitWorkout(); });
      return;
    }
    commitWorkout();
  }
  function commitWorkout() {
    var prog = activeProgramObj(), day = prog[workoutDayIdx], ds = dayState(workoutDayIdx);
    var date = todayYmd();
    // comeback: returning after a 7+ day layoff (check before streak update)
    var gap = S.lastWorkoutDate ? daysBetween(S.lastWorkoutDate, date) : 0;
    ds.done = true; ds.finishedAt = new Date().toISOString();
    recordExercisePerf(date);
    S.history.push({ date: date, programId: programId(S.activeProgram), dayName: day.name, dayIdx: workoutDayIdx, makeup: false });
    awardXp(D.XP.workout, true);
    updateStreak();
    var hr = new Date().getHours();
    if (hr < 7) earn("early-bird");
    if (hr >= 21) earn("night-owl");
    if (gap >= 7) earn("comeback");
    checkBadges();
    save(); burst();
    toast("✅", "Workout logged. +" + D.XP.workout + " XP");
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
  // Recompute the current streak from all logged workout dates.
  // exact=false keeps the streak from dropping (used when backfilling a past day);
  // exact=true sets it precisely (used when deleting an entry).
  function recomputeStreak(exact) {
    var dates = {};
    S.history.forEach(function (h) { dates[h.date] = true; });
    var list = Object.keys(dates).sort();
    if (!list.length) { if (exact) { S.streak = 0; S.lastWorkoutDate = null; } return; }
    var last = list[list.length - 1];
    var streak = 1;
    for (var i = list.length - 1; i > 0; i--) {
      if (daysBetween(list[i - 1], list[i]) === 1) streak += 1; else break;
    }
    S.streak = exact ? streak : Math.max(S.streak, streak);
    if (exact) S.lastWorkoutDate = last;
    else if (!S.lastWorkoutDate || S.lastWorkoutDate < last) S.lastWorkoutDate = last;
    if (S.streak >= 3) earn("streak-3");
    if (S.streak >= 7) earn("streak-7");
    if (S.streak >= 30) earn("streak-30");
  }
  function backfillStreak() { recomputeStreak(false); }
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
    var today = todayYmd();
    var dayOpts = prog.map(function (day, i) {
      return '<button class="swap-opt" data-makeup="' + i + '">' +
        '<span class="av">' + avatarSVG(day.slots.filter(function (s) { return s.t !== "warmup"; })[0] ? (function () { var f = day.slots.filter(function (s) { return s.t !== "warmup"; })[0]; return f.t === "pool" ? f.options[0].muscle : f.muscle; })() : "fullbody") + '</span>' +
        '<span class="grow"><span style="font-weight:700">' + esc(day.name) + '</span><br><span class="muted" style="font-size:var(--f-small)">' + esc(day.focus) + '</span></span>' +
        ICON("arrow") + '</button>';
    }).join("");
    openSheet('<div class="grip"></div><h3>Log a workout</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 12px">Record a session you trained \u2014 today or on a past day you forgot to log. It counts toward your streak, totals and challenges.</p>' +
      '<label class="fldlbl">Date</label><input class="fld" type="date" id="makeupDate" value="' + today + '" max="' + today + '" style="margin-bottom:14px" />' +
      '<label class="fldlbl">Which session did you do?</label><div style="margin-top:8px">' + dayOpts + '</div>');
    $$("[data-makeup]", $("#sheet")).forEach(function (b) {
      b.onclick = function () {
        var di = $("#makeupDate"), date = di && di.value ? di.value : today;
        if (date > today) date = today;
        logSessionOn(+b.dataset.makeup, date);
      };
    });
  }
  // Record a completed session for a given date (today or past) without the full set-logger.
  function logSessionOn(dayIdx, date) {
    var prog = activeProgramObj(), day = prog[dayIdx];
    var today = todayYmd(), isPast = date !== today;
    S.history.push({ date: date, programId: programId(S.activeProgram), dayName: day.name, dayIdx: dayIdx, makeup: isPast });
    if (!isPast) {
      // a session logged for today behaves like a normal completed day
      var ds = dayState(dayIdx);
      if (ds) { ds.done = true; ds.started = true; ds.finishedAt = new Date().toISOString(); }
    }
    awardXp(D.XP.workout, true);
    earn("makeup-day");
    if (isPast) backfillStreak(); else updateStreak();
    checkBadges();
    save(); closeSheet(); burst();
    toast("✅", (isPast ? "Past workout added" : "Workout logged") + ". +" + D.XP.workout + " XP");
    setTab("home");
  }

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
    var cids = Object.keys(S.customPrograms || {});
    var customRows = cids.map(function (id) {
      var cp = S.customPrograms[id], active = ("custom-" + id) === curId;
      return '<button class="progrow' + (active ? " active" : "") + '" data-customprog="' + id + '">' +
        '<span class="swatch" style="background:linear-gradient(180deg,#2f7bff,#19c3ff)"></span>' +
        '<span class="grow"><span style="font-weight:700">' + esc(cp.name) + '</span><br>' +
        '<span class="muted" style="font-size:var(--f-small)">' + cp.days + '-day custom · ' + cp.dayList.length + ' sessions</span></span>' +
        (active ? '<span class="chip accent">Active</span>' : ICON("arrow")) + '</button>';
    }).join("");
    var customSection = '<div class="section-head"><h2>Your programs</h2></div>' +
      '<button class="btn primary" id="buildProgram" style="margin-bottom:12px">+ Build a custom program</button>' +
      (customRows ? '<div class="proglist" style="margin-bottom:8px">' + customRows + '</div>'
        : '<p class="muted" style="font-size:var(--f-small);margin:-4px 0 8px">Build your own split from scratch — name it, choose your days, and add exercises from the library or your own.</p>');
    return '<section class="view"><div class="eyebrow">Library</div><h1 class="h1">Programs</h1>' +
      '<p class="muted" style="margin:6px 0 16px;font-size:var(--f-small)">Build your own, or pick a periodized template. Switching keeps your level, streak, badges &amp; PRs.</p>' +
      customSection + sections + '</section>';
  }
  function bindPrograms() {
    var bp = $("#buildProgram"); if (bp) bp.onclick = function () { openBuilder(null); };
    $$("[data-customprog]").forEach(function (b) { b.onclick = function () { openCustomProgMenu(b.dataset.customprog); }; });
    $$("[data-prog]").forEach(function (b) {
      b.onclick = function () {
        var p = b.dataset.prog.split(":"), goal = p[0], days = +p[1];
        if (programId(S.activeProgram) === goal + "-" + days) { setTab("home"); return; }
        attemptSwitch(goal, days);
      };
    });
  }
  /* ---- custom program builder + exercise library ---- */
  var builderDraft = null;
  function fullExerciseLibrary() {
    return D.EXERCISE_LIBRARY.concat((S.customExercises || []).map(function (e) { return { name: e.name, muscle: e.muscle, custom: true }; }));
  }
  function openBuilder(editId) {
    if (editId && S.customPrograms[editId]) {
      var cp = S.customPrograms[editId];
      builderDraft = {
        id: editId, name: cp.name, days: cp.days,
        weekdays: (cp.weekdays || defaultWeekdaysFor(cp.days)).slice(),
        dayList: cp.dayList.map(function (d) { return { name: d.name, slots: d.slots.map(function (s) { return Object.assign({}, s); }) }; })
      };
    } else {
      builderDraft = { id: null, name: "", days: 3, weekdays: defaultWeekdaysFor(3), dayList: [] };
      builderEnsureDays();
    }
    view = "builder"; render();
  }
  function builderEnsureDays() {
    var n = builderDraft.days;
    while (builderDraft.dayList.length < n) builderDraft.dayList.push({ name: "Day " + (builderDraft.dayList.length + 1), slots: [] });
    builderDraft.dayList = builderDraft.dayList.slice(0, n);
    if (builderDraft.weekdays.length !== n) builderDraft.weekdays = defaultWeekdaysFor(n);
  }
  function renderBuilder() {
    var b = builderDraft;
    var freqChips = [1, 2, 3, 4, 5, 6].map(function (n) { return '<button class="chip filt' + (n === b.days ? " on" : "") + '" data-bfreq="' + n + '">' + n + '</button>'; }).join("");
    var dayCards = b.dayList.map(function (day, i) {
      var exRows = day.slots.length ? day.slots.map(function (s, j) {
        return '<div class="edit-row"><span class="av" style="width:28px;height:28px;flex:0 0 auto">' + avatarSVG(s.muscle) + '</span>' +
          '<span class="grow"><span style="font-weight:600">' + esc(s.name) + '</span><br><span class="muted" style="font-size:var(--f-tiny)">' + s.sets + ' \u00d7 ' + esc(s.reps) + ' \u00b7 ' + esc(s.muscle) + '</span></span>' +
          '<button class="iconbtn xs" data-bxup="' + i + ":" + j + '"' + (j === 0 ? " disabled" : "") + '>\u25b2</button>' +
          '<button class="iconbtn xs" data-bxdn="' + i + ":" + j + '"' + (j === day.slots.length - 1 ? " disabled" : "") + '>\u25bc</button>' +
          '<button class="iconbtn xs danger" data-bxrm="' + i + ":" + j + '">\u2715</button></div>';
      }).join("") : '<p class="muted" style="font-size:var(--f-small);margin:4px 0">No exercises yet.</p>';
      return '<div class="card mt3"><input class="fld" data-bdayname="' + i + '" value="' + esc(day.name) + '" placeholder="Session name (e.g. Push)" />' +
        '<div class="mt2">' + exRows + '</div>' +
        '<button class="btn ghost sm mt2" data-baddex="' + i + '">+ Add exercise</button></div>';
    }).join("");
    return '<section class="view">' +
      '<button class="btn ghost sm" data-bcancel style="width:auto;margin-bottom:12px">\u2039 Cancel</button>' +
      '<h1 class="h1">' + (b.id ? "Edit program" : "Build a program") + '</h1>' +
      '<label class="fldlbl mt3">Program name</label><input class="fld" id="bldName" value="' + esc(b.name) + '" placeholder="My split" />' +
      '<label class="fldlbl mt3">Sessions per week</label><div class="chips-row">' + freqChips + '</div>' +
      '<label class="fldlbl mt3">Training days</label><div class="daypick" id="bldDays">' + dayPickHtml(b.weekdays) + '</div>' +
      '<div class="muted center" id="bldDayCount" style="font-size:var(--f-small);margin-top:8px">' + b.weekdays.length + ' / ' + b.days + ' selected</div>' +
      '<div class="section-head mt4"><h2>Sessions</h2></div>' + dayCards +
      '<button class="btn primary mt4" data-bsave>' + (b.id ? "Save changes" : "Create program") + '</button>' +
      '<div style="height:24px"></div></section>';
  }
  function bindBuilder() {
    var nm = $("#bldName"); if (nm) nm.oninput = function () { builderDraft.name = nm.value; };
    $$("[data-bdayname]").forEach(function (inp) { inp.oninput = function () { builderDraft.dayList[+inp.dataset.bdayname].name = inp.value; }; });
    $$("[data-bfreq]").forEach(function (b) { b.onclick = function () { builderDraft.days = +b.dataset.bfreq; builderEnsureDays(); render(); }; });
    $$("[data-dow]", $("#bldDays")).forEach(function (b) {
      b.onclick = function () {
        var dw = +b.dataset.dow, sel = builderDraft.weekdays, idx = sel.indexOf(dw);
        if (idx >= 0) sel.splice(idx, 1);
        else { if (sel.length >= builderDraft.days) { toast("\uD83D\uDCC5", "That's " + builderDraft.days + " already \u2014 deselect one first."); return; } sel.push(dw); }
        builderDraft.weekdays = sortDows(sel); render();
      };
    });
    $$("[data-baddex]").forEach(function (b) {
      b.onclick = function () {
        var di = +b.dataset.baddex;
        openExercisePicker(function (ex) {
          builderDraft.dayList[di].slots.push({ t: "ex", name: ex.name, muscle: ex.muscle, sets: 3, reps: "8\u201312", pr: ex.pr || null });
          render();
        });
      };
    });
    $$("[data-bxrm]").forEach(function (b) { b.onclick = function () { var p = b.dataset.bxrm.split(":"); builderDraft.dayList[+p[0]].slots.splice(+p[1], 1); render(); }; });
    $$("[data-bxup]").forEach(function (b) { if (!b.disabled) b.onclick = function () { var p = b.dataset.bxup.split(":"); builderMoveEx(+p[0], +p[1], -1); }; });
    $$("[data-bxdn]").forEach(function (b) { if (!b.disabled) b.onclick = function () { var p = b.dataset.bxdn.split(":"); builderMoveEx(+p[0], +p[1], 1); }; });
    var bc = $("[data-bcancel]"); if (bc) bc.onclick = function () { builderDraft = null; setTab("programs"); };
    var bs = $("[data-bsave]"); if (bs) bs.onclick = saveBuilder;
  }
  function builderMoveEx(di, j, dir) {
    var arr = builderDraft.dayList[di].slots, nj = j + dir;
    if (nj < 0 || nj >= arr.length) return;
    var t = arr[j]; arr[j] = arr[nj]; arr[nj] = t; render();
  }
  function saveBuilder() {
    var b = builderDraft;
    var name = (b.name || "").trim();
    if (!name) { toast("\u270f\ufe0f", "Name your program first."); return; }
    if (b.weekdays.length !== b.days) { toast("\uD83D\uDCC5", "Pick exactly " + b.days + " training days."); return; }
    var empty = b.dayList.filter(function (d) { return d.slots.length === 0; });
    if (empty.length) { toast("\uD83C\uDFCB\ufe0f", "Add at least one exercise to every session."); return; }
    var id = b.id || ("cp" + Date.now().toString(36));
    S.customPrograms[id] = {
      id: id, name: name, days: b.days, weekdays: sortDows(b.weekdays).slice(),
      dayList: b.dayList.map(function (d, i) {
        return { name: (d.name || "Day " + (i + 1)).trim(), focus: d.slots.slice(0, 3).map(function (s) { return s.muscle; }).filter(function (v, k, a) { return a.indexOf(v) === k; }).join(", "), slots: d.slots.map(function (s) { return Object.assign({}, s); }) };
      })
    };
    save();
    var wasEditingActive = b.id && S.activeProgram && S.activeProgram.custom && S.activeProgram.id === b.id;
    builderDraft = null;
    if (wasEditingActive) { setTab("home"); toast("\u2705", "Program updated"); return; }
    activateCustom(id);
  }
  function activateCustom(id) {
    var cp = S.customPrograms[id]; if (!cp) return;
    S.activeProgram = { custom: true, id: id, days: cp.days, exp: (S.activeProgram ? S.activeProgram.exp : "intermediate"), weekdays: (cp.weekdays || defaultWeekdaysFor(cp.days)).slice() };
    S.startedAt = new Date().toISOString(); S.weekOffset = 0;
    S.programsTried[programId(S.activeProgram)] = true;
    checkBadges();
    save(); applyAccent();
    toast("\uD83D\uDE80", cp.name + " activated");
    setTab("home");
  }
  function openCustomProgMenu(id) {
    var cp = S.customPrograms[id]; if (!cp) return;
    var active = programId(S.activeProgram) === "custom-" + id;
    openSheet('<div class="grip"></div><h3>' + esc(cp.name) + '</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 14px">' + cp.days + '-day custom \u00b7 ' + cp.dayList.length + ' sessions</p>' +
      '<button class="btn primary" data-cpuse>' + (active ? "Go to program" : "Use this program") + '</button>' +
      '<button class="btn ghost mt2" data-cpedit>Edit program</button>' +
      '<button class="btn danger mt2" data-cpdel>Delete program</button>');
    $("[data-cpuse]").onclick = function () { closeSheet(); if (active) { setTab("home"); } else { activateCustom(id); } };
    $("[data-cpedit]").onclick = function () { closeSheet(); openBuilder(id); };
    $("[data-cpdel]").onclick = function () {
      if (active) { toast("\u26a0\ufe0f", "This is your active program \u2014 switch to another first."); return; }
      openConfirm("Delete this program?", "Removes \"" + cp.name + "\" and its saved sessions. Your workout history stays.", "Delete", function () {
        delete S.customPrograms[id]; save(); render(); toast("\uD83D\uDDD1\ufe0f", "Program deleted");
      });
    };
  }
  function openExercisePicker(onPick) {
    var lib = fullExerciseLibrary();
    var muscle = "all";
    var muscleOpts = D.EXERCISE_MUSCLES.map(function (m) { return '<option value="' + m + '">' + m.charAt(0).toUpperCase() + m.slice(1) + '</option>'; }).join("");
    openSheet('<div class="grip"></div><h3>Add exercise</h3>' +
      '<input class="fld" id="exSearch" placeholder="Search the library" />' +
      '<div class="chips-row" id="exChips" style="margin:10px 0 6px"></div>' +
      '<div id="exPickList" style="max-height:38vh;overflow:auto"></div>' +
      '<div class="card mt3"><div class="eyebrow">Not in the library?</div>' +
      '<input class="fld" id="exNewName" placeholder="Custom exercise name" style="margin-top:8px" />' +
      '<select class="fld" id="exNewMuscle" style="margin-top:8px">' + muscleOpts + '</select>' +
      '<button class="btn primary mt2" id="exNewAdd">Add custom &amp; use</button></div>');
    function draw() {
      var q = ($("#exSearch").value || "").toLowerCase().trim();
      var chips = ["all"].concat(D.EXERCISE_MUSCLES).map(function (m) { return '<button class="chip filt' + (m === muscle ? " on" : "") + '" data-mfilt="' + m + '">' + (m === "all" ? "All" : m.charAt(0).toUpperCase() + m.slice(1)) + '</button>'; }).join("");
      $("#exChips").innerHTML = chips;
      $$("[data-mfilt]", $("#exChips")).forEach(function (c) { c.onclick = function () { muscle = c.dataset.mfilt; draw(); }; });
      var filt = lib.filter(function (e) { return (muscle === "all" || e.muscle === muscle) && (!q || e.name.toLowerCase().indexOf(q) >= 0); });
      $("#exPickList").innerHTML = filt.length ? filt.map(function (e) {
        var gi = lib.indexOf(e);
        return '<button class="swap-opt" data-pick="' + gi + '"><span class="av">' + avatarSVG(e.muscle) + '</span>' +
          '<span class="grow"><span style="font-weight:700">' + esc(e.name) + '</span><br><span class="muted" style="font-size:var(--f-small);text-transform:capitalize">' + esc(e.muscle) + (e.custom ? " \u00b7 custom" : "") + (e.pr ? " \u00b7 tracks PR" : "") + '</span></span></button>';
      }).join("") : '<p class="muted" style="font-size:var(--f-small);padding:8px 2px">No matches \u2014 add it as a custom exercise below.</p>';
      $$("[data-pick]", $("#exPickList")).forEach(function (b) { b.onclick = function () { var e = lib[+b.dataset.pick]; closeSheet(); onPick({ name: e.name, muscle: e.muscle, pr: e.pr || null }); }; });
    }
    $("#exSearch").oninput = draw;
    $("#exNewAdd").onclick = function () {
      var nm = ($("#exNewName").value || "").trim(); if (!nm) { toast("\u270f\ufe0f", "Name the exercise first."); return; }
      var mus = $("#exNewMuscle").value || "fullbody";
      S.customExercises.push({ id: "ce" + Date.now().toString(36), name: nm, muscle: mus });
      save(); closeSheet(); onPick({ name: nm, muscle: mus, pr: null });
    };
    draw();
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
      b.onclick = function () { openSwitchDayPicker(goal, days, b.dataset.pickexp); };
    });
  }
  function openSplitEditor() {
    if (!S.activeProgram) return;
    var prog = activeProgramObj(), wd = activeWeekdays(), order = splitOrder();
    var rows = order.map(function (di, k) {
      var day = prog[di];
      var first = day.slots.filter(function (s) { return s.t !== "warmup"; })[0];
      var mus = first ? (first.t === "pool" ? first.options[0].muscle : first.muscle) : "fullbody";
      return '<div class="edit-row">' +
        '<span class="split-day">' + DOW[wd[k]] + '</span>' +
        '<span class="av" style="width:30px;height:30px;flex:0 0 auto">' + avatarSVG(mus) + '</span>' +
        '<span class="grow"><span style="font-weight:600">' + esc(day.name) + '</span><br><span class="muted" style="font-size:var(--f-tiny)">' + esc(day.focus) + '</span></span>' +
        '<button class="iconbtn xs" data-splitup="' + k + '"' + (k === 0 ? " disabled" : "") + ' aria-label="Move earlier">▲</button>' +
        '<button class="iconbtn xs" data-splitdn="' + k + '"' + (k === order.length - 1 ? " disabled" : "") + ' aria-label="Move later">▼</button>' +
        '<button class="iconbtn xs" data-splitedit="' + di + '" aria-label="Edit exercises">✎</button>' +
        '</div>';
    }).join("");
    openSheet('<div class="grip"></div><h3>Edit your split</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 12px">Arrange which session lands on each training day — move sessions with the arrows. Tap ✎ to tune the exercises and muscle groups inside a session. Your logged history stays with each session.</p>' +
      '<div class="card">' + rows + '</div>');
    $$("[data-splitup]").forEach(function (b) { if (!b.disabled) b.onclick = function () { moveSplit(+b.dataset.splitup, -1); }; });
    $$("[data-splitdn]").forEach(function (b) { if (!b.disabled) b.onclick = function () { moveSplit(+b.dataset.splitdn, 1); }; });
    $$("[data-splitedit]").forEach(function (b) { b.onclick = function () { openDayEditor(+b.dataset.splitedit); }; });
  }
  function moveSplit(k, dir) {
    var o = splitOrder(), nk = k + dir;
    if (nk < 0 || nk >= o.length) return;
    var t = o[k]; o[k] = o[nk]; o[nk] = t;
    S.activeProgram.dayOrder = o;
    save(); openSplitEditor(); render();
  }
  function openEditDays() {
    if (!S.activeProgram) return;
    var days = activeDays();
    var sel = sortDows(activeWeekdays()).slice();
    openSheet('<div class="grip"></div><h3>Training days</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 10px">Move your ' + days + ' weekly sessions to whichever days suit you. Your program, level, streak and history all stay exactly as they are.</p>' +
      '<div class="daypick" id="edDayPick">' + dayPickHtml(sel) + '</div>' +
      '<div class="muted center" id="edDayCount" style="font-size:var(--f-small);margin:12px 0">' + sel.length + ' / ' + days + ' selected</div>' +
      '<button class="btn primary" id="edDaySave"' + (sel.length === days ? "" : " disabled") + '>Save training days</button>');
    function refresh() {
      $$("[data-dow]", $("#sheet")).forEach(function (x) { x.classList.toggle("on", sel.indexOf(+x.dataset.dow) >= 0); });
      var c = $("#edDayCount"); if (c) c.textContent = sel.length + " / " + days + " selected";
      var st = $("#edDaySave"); if (st) st.disabled = sel.length !== days;
    }
    $$("[data-dow]", $("#sheet")).forEach(function (b) {
      b.onclick = function () {
        var dw = +b.dataset.dow, idx = sel.indexOf(dw);
        if (idx >= 0) sel.splice(idx, 1);
        else { if (sel.length >= days) { toast("\uD83D\uDCC5", "That's " + days + " already \u2014 deselect one to move it."); return; } sel.push(dw); }
        refresh();
      };
    });
    $("#edDaySave").onclick = function () {
      if (sel.length !== days) return;
      S.activeProgram.weekdays = sortDows(sel);
      save(); closeSheet(); render();
      toast("\uD83D\uDCC5", "Training days updated");
    };
  }
  function openSwitchDayPicker(goal, days, exp) {
    var cur = activeWeekdays();
    var sel = (S.activeProgram && cur.length === days) ? sortDows(cur) : defaultWeekdaysFor(days);
    var g = D.GOALS[goal];
    openSheet('<div class="grip"></div><h3>' + days + '-Day ' + esc(g.name) + ' · training days</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 10px">Pick the ' + days + ' weekdays you\u2019ll train. Each session lands on its own day so you get a 24-hour recovery buffer.</p>' +
      '<div class="daypick" id="swDayPick">' + dayPickHtml(sel) + '</div>' +
      '<div class="muted center" id="swDayCount" style="font-size:var(--f-small);margin:12px 0">' + sel.length + ' / ' + days + ' selected</div>' +
      '<button class="btn primary" id="swStart"' + (sel.length === days ? "" : " disabled") + '>Start program</button>');
    function refresh() {
      $$("[data-dow]", $("#sheet")).forEach(function (x) { x.classList.toggle("on", sel.indexOf(+x.dataset.dow) >= 0); });
      var c = $("#swDayCount"); if (c) c.textContent = sel.length + " / " + days + " selected";
      var st = $("#swStart"); if (st) st.disabled = sel.length !== days;
    }
    $$("[data-dow]", $("#sheet")).forEach(function (b) {
      b.onclick = function () {
        var dw = +b.dataset.dow, idx = sel.indexOf(dw);
        if (idx >= 0) sel.splice(idx, 1);
        else { if (sel.length >= days) { toast("📅", "That\u2019s " + days + " already — deselect one to change it."); return; } sel.push(dw); }
        refresh();
      };
    });
    $("#swStart").onclick = function () {
      if (sel.length !== days) return;
      closeSheet();
      startProgram(goal, days, exp, sortDows(sel));
    };
  }

  /* ============================================================
     STATS — fitness dashboard
     ============================================================ */
  function fmtNum(n) { try { return Math.round(n).toLocaleString(); } catch (e) { return "" + Math.round(n); } }
  function weekBuckets(n) {
    var sow = startOfWeek(new Date()), arr = [];
    for (var i = n - 1; i >= 0; i--) {
      var s = new Date(sow.getTime() - i * 7 * DAY_MS);
      arr.push({ start: s, end: new Date(s.getTime() + 7 * DAY_MS), label: (s.getMonth() + 1) + "/" + s.getDate() });
    }
    return arr;
  }
  function volumeByDate() {
    var m = {};
    Object.keys(S.exerciseHistory || {}).forEach(function (nm) {
      (S.exerciseHistory[nm] || []).forEach(function (e) {
        var v = 0; (e.sets || []).forEach(function (s) { v += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); });
        m[e.date] = (m[e.date] || 0) + v;
      });
    });
    return m;
  }
  function gauge(pct, label, val, color) {
    pct = clamp(pct, 0, 1);
    var r = 42, cx = 55, cy = 55, circ = Math.PI * r;
    var path = "M " + (cx - r) + " " + cy + " A " + r + " " + r + " 0 0 1 " + (cx + r) + " " + cy;
    return '<div class="gauge"><svg viewBox="0 0 110 64" width="100%" height="72" aria-hidden="true">' +
      '<path d="' + path + '" fill="none" stroke="var(--line)" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="' + path + '" fill="none" stroke="' + (color || "var(--accent-2)") + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + (circ * (1 - pct)).toFixed(1) + '"/>' +
      '</svg><div class="gauge-val">' + val + '</div><div class="gauge-lbl">' + esc(label) + '</div></div>';
  }
  function miniBars(vals, labels, color) {
    var W = 300, H = 124, pad = 20, n = vals.length || 1;
    var max = Math.max.apply(null, vals.concat([1]));
    var gap = (W - 2 * pad) / n, bw = gap * 0.58;
    var bars = vals.map(function (v, i) {
      var h = (v / max) * (H - 2 * pad - 6);
      var x = pad + i * gap + (gap - bw) / 2, y = H - pad - h;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" rx="3" fill="' + (color || "var(--accent-2)") + '"/>' +
        (v > 0 ? '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle" font-size="9" fill="var(--muted)">' + fmtNum(v) + '</text>' : "") +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="8" fill="var(--faint)">' + esc(labels[i]) + '</text>';
    }).join("");
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="132" role="img" aria-label="Weekly chart">' + bars + '</svg>';
  }
  function renderStats() {
    var li = levelInfo();
    var workouts = S.history.length;
    var vol = lifetimeVolume();
    var prCount = Object.keys(S.prs).filter(function (k) { return S.prs[k] && S.prs[k].value; }).length;
    var tiles = '<div class="stat-tiles">' +
      statTile("🏋️", fmtNum(workouts), "Workouts") +
      statTile("🔥", fmtNum(S.streak), "Day streak") +
      statTile("🏗️", fmtNum(vol), "Volume (" + unitLabel() + ")") +
      statTile("🥇", fmtNum(prCount), "PRs set") + '</div>';

    var today = todayYmd();
    var dtw = doneThisWeek(), target = activeDays();
    var steps = S.steps[today] || 0, sgoal = S.stepGoal || 8000;
    var wxp = weeklyXp(), xpGoal = 400;
    var gauges = '<div class="card"><div class="eyebrow" style="margin-bottom:10px">This week</div><div class="gauges">' +
      gauge(target ? dtw / target : 0, "Sessions", dtw + "/" + target) +
      gauge(sgoal ? steps / sgoal : 0, "Steps today", fmtNum(steps), "#19c3ff") +
      gauge(xpGoal ? wxp / xpGoal : 0, "XP this week", fmtNum(wxp), "#7c5cff") +
      '</div></div>';

    var lvl = '<div class="card"><div class="row-between"><div class="eyebrow">Level ' + li.lv + ' · ' + esc(li.title) + '</div>' +
      '<div class="muted" style="font-size:var(--f-small)">' + fmtNum(li.into) + ' / ' + fmtNum(li.span) + ' XP</div></div>' +
      '<div class="xpbar" style="margin-top:10px"><i style="width:' + Math.round(li.pct) + '%"></i></div></div>';

    var bk = weekBuckets(8), labels = bk.map(function (b) { return b.label; });
    var wkCounts = bk.map(function (b) {
      var c = 0; var dd = {};
      S.history.forEach(function (h) { var d = parseYmd(h.date); if (d >= b.start && d < b.end) dd[h.date] = true; });
      return Object.keys(dd).length;
    });
    var vbd = volumeByDate();
    var wkVol = bk.map(function (b) {
      var v = 0; Object.keys(vbd).forEach(function (dt) { var d = parseYmd(dt); if (d >= b.start && d < b.end) v += vbd[dt]; });
      return Math.round(v);
    });
    var workoutsChart = '<div class="card"><div class="eyebrow" style="margin-bottom:6px">Workouts per week</div>' + miniBars(wkCounts, labels) + '</div>';
    var hasVol = wkVol.some(function (v) { return v > 0; });
    var volChart = '<div class="card"><div class="eyebrow" style="margin-bottom:6px">Volume per week (' + unitLabel() + ')</div>' +
      (hasVol ? miniBars(wkVol, labels, "#19c3ff") : '<div class="chart-empty muted">Log sets in your workouts to see weekly volume.</div>') + '</div>';

    var strength = progressChartHtml();

    return '<section class="view">' +
      '<div class="eyebrow">' + esc(goalName()) + '</div><h1 class="h1">Your stats</h1>' +
      tiles + gauges + lvl +
      '<div class="section-head"><h2>Trends</h2></div>' +
      workoutsChart + volChart + strength +
      '</section>';
  }
  function statTile(icon, num, label) {
    return '<div class="stat-tile"><div class="st-ic">' + icon + '</div><div class="st-num">' + num + '</div><div class="st-lbl">' + esc(label) + '</div></div>';
  }
  function bindStats() {
    $$("[data-chartlift]").forEach(function (b) { b.onclick = function () { chartLift = b.dataset.chartlift; render(); }; });
    $$("[data-exhist]").forEach(function (b) { b.onclick = function () { openExerciseHistory(b.dataset.exhist); }; });
  }


  function renderGuide() {
    var prs = allPrLifts().map(function (l) {
      var pr = S.prs[l.id];
      var val = pr
        ? '<span class="prval">' + pr.value + ' ' + unitLabel() + (pr.seeded ? ' <span class="chip" style="padding:1px 7px;vertical-align:middle">start</span>' : "") + '</span>'
        : '<span class="prval empty-v">Not set</span>';
      var hist = (S.exerciseHistory[l.name] || []).map(function (e) { return parseFloat(e.top); }).filter(function (v) { return v > 0; });
      var spark = sparkline(hist.slice(-8));
      return '<button class="pr-row" data-prlift="' + l.id + '"><span class="prname">' + esc(l.name) + (l.custom ? ' <span class="muted" style="font-size:var(--f-tiny);text-transform:uppercase;letter-spacing:.05em">custom</span>' : "") + '</span>' +
        (spark ? '<span class="pr-spark">' + spark + '</span>' : "") + val + '</button>';
    }).join("");
    var prCard = '<div class="card">' + prs +
      '<div class="row" style="gap:8px;margin-top:14px"><button class="btn primary sm" id="logPrBtn">🥇 Log a PR</button>' +
      '<button class="btn ghost sm" id="addLiftBtn">+ Add a lift</button></div></div>';
    var recent = S.history.map(function (h, i) { return { h: h, i: i }; }).slice(-14).reverse();
    var histHtml = recent.length
      ? recent.map(function (o) {
        return '<button class="hist-row" data-histidx="' + o.i + '"><span class="hist-day">' + esc(o.h.dayName) + (o.h.makeup ? ' <span class="hist-tag">added</span>' : "") + '</span>' +
          '<span class="muted" style="font-size:var(--f-small)">' + esc(shortDate(o.h.date)) + ' ›</span></button>';
      }).join("")
      : '<p class="muted" style="font-size:var(--f-small);margin:0">No workouts logged yet — finish a session to see it here.</p>';
    var historyCard = '<div class="card">' + histHtml + '</div>';
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
      prCard +
      '<div class="section-head"><h2>Recent workouts</h2></div>' +
      historyCard +
      '<div class="section-head"><h2>Achievements</h2></div>' + badges +
      '<div class="section-head"><h2>How it works</h2></div>' + acc +
      '<button class="btn ghost sm" id="replayTutorial" style="margin-top:10px">▶ Replay the tutorial</button>' +
      '<div class="section-head"><h2>Settings</h2></div>' +
      '<div class="card"><label class="fldlbl">Weight units</label>' +
      '<div class="segment" id="unitSegGuide"><button class="' + (S.unit === "kg" ? "on" : "") + '" data-gunit="kg">Kilograms (kg)</button>' +
      '<button class="' + (S.unit === "lb" ? "on" : "") + '" data-gunit="lb">Pounds (lb)</button></div>' +
      '<div class="setting-row" style="margin-top:16px"><div><div style="font-weight:600">Auto rest timer</div>' +
      '<div class="muted" style="font-size:var(--f-small)">Start a rest countdown when you complete an exercise.</div></div>' +
      '<button class="toggle' + (S.autoRest ? " on" : "") + '" id="autoRestToggle" role="switch" aria-checked="' + (S.autoRest ? "true" : "false") + '"><span class="knob"></span></button></div></div>' +
      '<div class="section-head"><h2>Your data</h2></div>' +
      '<div class="card"><p class="muted" style="font-size:var(--f-small);margin:0 0 14px">Everything is stored only on this device. Back it up so you don\u2019t lose your history.</p>' +
      '<div class="row" style="gap:8px"><button class="btn ghost sm" id="exportData">⬇ Export backup</button>' +
      '<button class="btn ghost sm" id="importData">⬆ Import backup</button></div>' +
      '<button class="btn danger" id="resetAll" style="margin-top:10px">Reset all data</button></div>' +
      '<div class="center muted" style="margin:28px 0 6px;font-weight:700">Attack the Bar. Own the Path.</div>' +
      '</section>';
  }
  function bindGuide() {
    $$("[data-acc]").forEach(function (a) {
      $(".acc-head", a).onclick = function () { a.classList.toggle("open"); };
    });
    var lp = $("#logPrBtn"); if (lp) lp.onclick = function () { openPrLogger(); };
    var al = $("#addLiftBtn"); if (al) al.onclick = openAddLift;
    $$("[data-prlift]").forEach(function (b) { b.onclick = function () { openPrManage(b.dataset.prlift); }; });
    $$("[data-histidx]").forEach(function (b) { b.onclick = function () { openWorkoutEntry(+b.dataset.histidx); }; });
    $$("[data-gunit]").forEach(function (b) { b.onclick = function () { S.unit = b.dataset.gunit; save(); render(); toast("⚖️", "Units set to " + unitLabel()); }; });
    var art = $("#autoRestToggle"); if (art) art.onclick = function () { S.autoRest = !S.autoRest; save(); render(); toast(S.autoRest ? "⏱️" : "⏱️", "Auto rest timer " + (S.autoRest ? "on" : "off")); };
    var rt = $("#replayTutorial"); if (rt) rt.onclick = function () { openTutorial(0, true); };
    $$("[data-badge]").forEach(function (b) { b.onclick = function () { openBadgeInfo(b.dataset.badge); }; });
    var ex = $("#exportData"); if (ex) ex.onclick = exportData;
    var im = $("#importData"); if (im) im.onclick = openImport;
    $("#resetAll").onclick = function () {
      openConfirm("Reset all data?", "This permanently clears your programs, progress, PRs, XP and badges on this device. This cannot be undone.", "Erase everything", function () {
        try { localStorage.removeItem(KEY); } catch (e) {}
        S = defaultState(); save();
        draft = { goal: "powerbuilding", days: 4, exp: "intermediate", weekdays: defaultWeekdaysFor(4), unit: "kg", prs: {} };
        view = "programs"; render(); toast("🧹", "All data cleared");
      });
    };
  }
  /* standalone PR logging (no workout needed) + custom lifts */
  function openPrLogger(preId) {
    var lifts = allPrLifts();
    var sel = (preId && lifts.some(function (l) { return l.id === preId; })) ? preId : lifts[0].id;
    var today = todayYmd();
    var optsHtml = lifts.map(function (l) { return '<option value="' + l.id + '"' + (l.id === sel ? " selected" : "") + '>' + esc(l.name) + '</option>'; }).join("");
    openSheet('<div class="grip"></div><h3>Log a PR</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 12px">Record a new best — no workout required. You\u2019ll be celebrated if you beat your previous best.</p>' +
      '<label class="fldlbl">Lift</label><select class="fld" id="prLift" style="margin-bottom:12px">' + optsHtml + '</select>' +
      '<div class="io-grid"><div><label class="fldlbl">Weight (' + unitLabel() + ')</label><input class="fld" id="prWeight" inputmode="decimal" placeholder="' + unitLabel() + '" /></div>' +
      '<div><label class="fldlbl">Reps <span class="muted">· optional</span></label><input class="fld" id="prReps" inputmode="numeric" placeholder="e.g. 1" /></div></div>' +
      '<label class="fldlbl" style="margin-top:12px">Date</label><input class="fld" type="date" id="prDate" value="' + today + '" max="' + today + '" />' +
      '<button class="btn primary mt4" id="prSave">Save PR</button>');
    $("#prSave").onclick = function () {
      var id = $("#prLift").value, w = parseFloat($("#prWeight").value);
      if (!w || w <= 0) { toast("⚖️", "Enter a weight first."); return; }
      var date = $("#prDate").value || today; if (date > today) date = today;
      recordPr(id, w, $("#prReps").value.trim(), date);
      closeSheet();
    };
  }
  function recordPr(id, val, reps, date) {
    var prev = S.prs[id];
    var lift = allPrLifts().filter(function (l) { return l.id === id; })[0];
    var nm = lift ? lift.name : "Lift";
    if (prev && val <= prev.value) { toast("💪", "Your " + nm + " PR is still " + prev.value + " " + unitLabel() + "."); return; }
    S.prs[id] = { value: val, date: date || todayYmd(), reps: reps || "", seeded: false };
    if (!S.exerciseHistory[nm]) S.exerciseHistory[nm] = [];
    S.exerciseHistory[nm].push({ date: date || todayYmd(), sets: [{ w: "" + val, r: reps || "" }], top: val, reps: reps || "" });
    if (S.exerciseHistory[nm].length > 40) S.exerciseHistory[nm] = S.exerciseHistory[nm].slice(-40);
    awardXp(D.XP.pr, false);
    earn("first-pr");
    checkBadges();
    save(); burst();
    toast("🥇", "New PR: " + nm + " " + val + " " + unitLabel() + "!");
    render();
  }
  function openAddLift() {
    openSheet('<div class="grip"></div><h3>Add a lift to track</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 12px">Track any lift that matters to you — it\u2019ll appear in your PRs.</p>' +
      '<label class="fldlbl">Lift name</label><input class="fld" id="newLiftName" placeholder="e.g. Hip Thrust" />' +
      '<button class="btn primary mt4" id="addLiftSave">Add lift</button>');
    $("#addLiftSave").onclick = function () {
      var nm = $("#newLiftName").value.trim();
      if (!nm) { toast("✏️", "Enter a name first."); return; }
      var id = "custom-" + Date.now().toString(36);
      S.customLifts.push({ id: id, name: nm });
      save(); closeSheet(); toast("➕", "Added " + nm);
      openPrLogger(id);
    };
  }
  function openPrManage(id) {
    var lift = allPrLifts().filter(function (l) { return l.id === id; })[0]; if (!lift) return;
    var pr = S.prs[id];
    if (!pr) { openPrLogger(id); return; }
    var today = todayYmd();
    openSheet('<div class="grip"></div><h3>' + esc(lift.name) + '</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 14px">Current best: <b style="color:var(--text)">' + pr.value + ' ' + unitLabel() + '</b>' + (pr.seeded ? " (starting point)" : "") + (pr.date ? " · " + esc(shortDate(pr.date)) : "") + '</p>' +
      '<div class="io-grid"><div><label class="fldlbl">Correct value (' + unitLabel() + ')</label><input class="fld" id="prEditVal" inputmode="decimal" value="' + esc(pr.value) + '" /></div>' +
      '<div><label class="fldlbl">Date</label><input class="fld" type="date" id="prEditDate" value="' + esc(pr.date || today) + '" max="' + today + '" /></div></div>' +
      '<button class="btn primary mt4" id="prEditSave">Save correction</button>' +
      ((S.exerciseHistory[lift.name] && S.exerciseHistory[lift.name].length) ? '<button class="btn ghost mt2" id="prHistory">📊 View full history</button>' : "") +
      '<button class="btn danger mt2" id="prRemove">Remove this PR</button>');
    var ph = $("#prHistory"); if (ph) ph.onclick = function () { openExerciseHistory(lift.name); };
    $("#prEditSave").onclick = function () {
      var v = parseFloat($("#prEditVal").value);
      if (!v || v <= 0) { toast("⚖️", "Enter a valid weight."); return; }
      var dt = $("#prEditDate").value || today; if (dt > today) dt = today;
      S.prs[id] = { value: v, date: dt, reps: pr.reps || "", seeded: false };
      save(); closeSheet(); render(); toast("✏️", lift.name + " PR updated to " + v + " " + unitLabel());
    };
    $("#prRemove").onclick = function () {
      openConfirm("Remove this PR?", "Clears your recorded best for " + lift.name + ". This doesn't affect your logged workouts.", "Remove", function () {
        delete S.prs[id];
        save(); render(); toast("🗑️", lift.name + " PR removed");
      });
    };
  }
  function openWorkoutEntry(idx) {
    var h = S.history[idx]; if (!h) return;
    openSheet('<div class="grip"></div><h3>' + esc(h.dayName) + '</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 16px">' + esc(shortDate(h.date)) + (h.makeup ? " · added manually" : "") + '</p>' +
      '<button class="btn danger" id="histDelete">Delete this entry</button>' +
      '<button class="btn ghost mt2" id="histCancel">Cancel</button>');
    $("#histDelete").onclick = function () {
      openConfirm("Delete this workout?", "Removes it from your history and recalculates your streak. Badges you already earned stay.", "Delete", function () { deleteHistory(idx); });
    };
    $("#histCancel").onclick = closeSheet;
  }
  function deleteHistory(idx) {
    var h = S.history[idx]; if (!h) return;
    S.history.splice(idx, 1);
    // if it was today's normal completion for the active program, clear that day's checkmarks
    if (!h.makeup && h.date === todayYmd() && h.programId === programId(S.activeProgram)) {
      var b = progBucket(); if (b && b[h.dayIdx]) { b[h.dayIdx] = { done: false, finishedAt: null, started: false, startedAt: null, entries: {} }; }
    }
    recomputeStreak(true);
    save(); render(); toast("🗑️", "Workout entry removed");
  }
  function exportData() {
    try {
      var data = JSON.stringify(S);
      var blob = new Blob([data], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "barpath-backup-" + todayYmd() + ".json";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 200);
      toast("💾", "Backup downloaded");
    } catch (e) { toast("⚠️", "Couldn't export on this browser."); }
  }
  function openImport() {
    openSheet('<div class="grip"></div><h3>Import backup</h3>' +
      '<p class="muted" style="font-size:var(--f-small);margin:0 0 12px">Restore from a Barpath backup file. This <b>replaces</b> all current data on this device.</p>' +
      '<label class="fldlbl">Backup file</label><input class="fld" type="file" id="importFile" accept="application/json,.json" style="margin-bottom:12px" />' +
      '<label class="fldlbl">Or paste backup text</label><textarea class="fld" id="importText" rows="5" placeholder="Paste the contents of your backup file here"></textarea>' +
      '<button class="btn primary mt4" id="importDo">Import &amp; replace</button>');
    var fi = $("#importFile");
    if (fi) fi.onchange = function () {
      var f = fi.files && fi.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { var t = $("#importText"); if (t) t.value = rd.result; };
      rd.readAsText(f);
    };
    $("#importDo").onclick = function () {
      var t = $("#importText"), raw = t ? t.value.trim() : "";
      if (!raw) { toast("📋", "Choose a file or paste your backup first."); return; }
      var obj; try { obj = JSON.parse(raw); } catch (e) { toast("⚠️", "That doesn't look like valid backup data."); return; }
      openConfirm("Replace all data?", "This will overwrite everything currently on this device with the backup.", "Import & replace", function () {
        S = migrate(obj); save();
        closeSheet();
        view = S.activeProgram ? "home" : "programs";
        render(); toast("✅", "Backup imported");
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
      Object.keys(S.prs).forEach(function (k) { if (!S.prs[k].seeded && inWeek(S.prs[k].date)) cur++; });
    } else if (ch.metric === "xp") {
      cur = weeklyXp();
    }
    return { cur: cur, target: target, done: cur >= target };
  }
  function weeklyXp() {
    return S.xpLog[isoWeekKey(new Date())] || 0;
  }
  function claimChallenge() {
    var ch = currentChallenge(), key = isoWeekKey(new Date()) + ":" + ch.id;
    if (S.claimedChallenges[key]) return;
    var cp = challengeProgress(ch); if (!cp.done) return;
    S.claimedChallenges[key] = true;
    S.freezes += 1;
    awardXp(D.XP.challenge, true);
    earn("challenger"); checkBadges();
    save(); burst(); toast("🏆", "Challenge complete! +" + D.XP.challenge + " XP, +1 freeze");
    render();
  }

  /* ============================================================
     gamification core: xp / levels / badges
     ============================================================ */
  function awardXp(amt, rerender) {
    var before = levelFromXp(S.xp);
    S.xp += amt;
    var wk = isoWeekKey(new Date());
    S.xpLog[wk] = (S.xpLog[wk] || 0) + amt;
    var after = levelFromXp(S.xp);
    save();
    if (after > before) {
      if (after >= 5) earn("level-5");
      if (after >= 10) earn("level-10");
      showLevelUp(after);
    }
    if (rerender) renderChrome();
  }
  function lifetimeVolume() {
    var v = 0;
    Object.keys(S.exerciseHistory || {}).forEach(function (n) {
      (S.exerciseHistory[n] || []).forEach(function (e) {
        (e.sets || []).forEach(function (s) { var w = parseFloat(s.w) || 0, r = parseInt(s.r, 10) || 0; v += w * r; });
      });
    });
    return Math.round(v);
  }
  function trainedWeekendSameWeek() {
    var byWeek = {};
    S.history.forEach(function (h) {
      var d = parseYmd(h.date), k = isoWeekKey(d);
      (byWeek[k] = byWeek[k] || {})[d.getDay()] = true;
    });
    return Object.keys(byWeek).some(function (k) { return byWeek[k][0] && byWeek[k][6]; });
  }
  // Central milestone evaluation — safe to call after any progress event.
  function checkBadges() {
    var n = S.history.length;
    if (n >= 1) earn("first-workout");
    if (n >= 10) earn("workouts-10");
    if (n >= 50) earn("workouts-50");
    if (n >= 100) earn("century");
    if (S.streak >= 3) earn("streak-3");
    if (S.streak >= 7) earn("streak-7");
    if (S.streak >= 14) earn("streak-14");
    if (S.streak >= 30) earn("streak-30");
    var lv = levelInfo().lv;
    if (lv >= 5) earn("level-5");
    if (lv >= 10) earn("level-10");
    var vol = lifetimeVolume();
    if (vol >= 10000) earn("volume-10k");
    if (vol >= 50000) earn("volume-50k");
    if (trainedWeekendSameWeek()) earn("weekend-warrior");
    var tried = Object.keys(S.programsTried || {}).length;
    if (tried >= 2) earn("explorer");
    if (tried >= 4) earn("globetrotter");
    if (D.PR_LIFTS.every(function (l) { return S.prs[l.id] && !S.prs[l.id].seeded; })) earn("all-prs");
    if (Object.keys(S.claimedChallenges || {}).length >= 1) earn("challenger");
    if (allScheduledDoneThisWeek()) earn("full-week");
  }
  function earn(id) {
    if (S.badges[id]) return;
    var b = D.BADGES.filter(function (x) { return x.id === id; })[0]; if (!b) return;
    S.badges[id] = new Date().toISOString();
    save();
    queueBadgeToast(b);
  }
  var _badgeQueue = [], _badgeTimer = null;
  function queueBadgeToast(b) {
    _badgeQueue.push(b);
    if (_badgeTimer) return;
    var run = function () {
      if (!_badgeQueue.length) { _badgeTimer = null; return; }
      var nb = _badgeQueue.shift();
      toast(nb.icon, "Badge unlocked: " + nb.name);
      _badgeTimer = setTimeout(run, 950);
    };
    _badgeTimer = setTimeout(run, 450);
  }
  var _luKey = null;
  function showLevelUp(lv) {
    var title = D.LEVEL_TITLES[lv - 1];
    $("#levelup").innerHTML = '<div class="lu-card"><div class="lu-badge">' + lv + '</div>' +
      '<div class="lulvl">Level ' + lv + '</div><div class="lutitle">' + esc(title) + '</div>' +
      '<p class="muted">You leveled up. Keep the bar moving.</p>' +
      '<button class="btn primary mt4" id="luClose">Continue</button></div>';
    $("#levelup").classList.add("show");
    $("#luClose").onclick = closeLevelUp;
    setTimeout(function () { var c = $("#luClose"); if (c) c.focus(); }, 50);
    _luKey = function (e) { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); closeLevelUp(); } };
    document.addEventListener("keydown", _luKey, true);
    burst();
  }
  function closeLevelUp() {
    $("#levelup").classList.remove("show");
    if (_luKey) { document.removeEventListener("keydown", _luKey, true); _luKey = null; }
  }
  /* ---- first-run tutorial ---- */
  var TUTORIAL_SLIDES = [
    { icon: "👋", title: "Welcome to Barpath", body: "This is your home base. Today's session, your level, streak, and progress all live here — check in before every workout." },
    { icon: "🏋️", title: "Log every set", body: "Open <b>Train</b>, hit Start, then tap any exercise to log weight and reps. Work through them in any order and check each one off." },
    { icon: "🔁", title: "Make it your own", body: "Swap an exercise for an alternative, skip one around an injury, or tap <b>✎ Edit exercises</b> to reorder and add your own movements." },
    { icon: "🗓️", title: "Shape your week", body: "Use <b>Edit days</b> to move your sessions onto the weekdays that suit you, and <b>Edit split</b> to choose which session lands on each day — without losing any history." },
    { icon: "🧱", title: "Build your own", body: "Want full control? In <b>Programs</b>, tap <b>Build a custom program</b> — name it, pick your days, and add exercises from the library or create your own." },
    { icon: "📈", title: "Track your progress", body: "Save PRs as you train, then open the <b>Stats</b> tab for fuel gauges, weekly charts, and your strength trends. Tap any lift for its full history." },
    { icon: "💾", title: "Keep your progress safe", body: "Everything is stored on this device. Now and then, use <b>Guide → Export backup</b> so you never lose your history." }
  ];
  var _tutIdx = 0, _tutReplay = false, _tutKey = null;
  function openTutorial(start, replay) {
    _tutIdx = start || 0; _tutReplay = !!replay;
    renderTutorial();
    var t = $("#tutorial"); t.classList.add("show");
    setTimeout(function () { var b = $("#tutNext"); if (b) b.focus(); }, 50);
    _tutKey = function (e) {
      if (e.key === "Escape") { e.preventDefault(); closeTutorial(true); }
      else if (e.key === "ArrowRight") { e.preventDefault(); tutGo(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); tutGo(-1); }
    };
    document.addEventListener("keydown", _tutKey, true);
  }
  function renderTutorial() {
    var s = TUTORIAL_SLIDES[_tutIdx], last = _tutIdx === TUTORIAL_SLIDES.length - 1;
    var dots = TUTORIAL_SLIDES.map(function (_, i) { return '<span class="tut-dot' + (i === _tutIdx ? " on" : "") + '"></span>'; }).join("");
    $("#tutorial").innerHTML = '<div class="tut-card">' +
      '<button class="tut-skip" id="tutSkip">' + (last ? "" : "Skip") + '</button>' +
      '<div class="tut-icon">' + s.icon + '</div>' +
      '<h2 class="tut-title">' + esc(s.title) + '</h2>' +
      '<p class="tut-body">' + s.body + '</p>' +
      '<div class="tut-dots">' + dots + '</div>' +
      '<div class="tut-nav">' +
      (_tutIdx > 0 ? '<button class="btn ghost" id="tutBack">Back</button>' : '') +
      '<button class="btn primary" id="tutNext">' + (last ? (_tutReplay ? "Done" : "Start training →") : "Next") + '</button>' +
      '</div></div>';
    var sk = $("#tutSkip"); if (sk) sk.onclick = function () { closeTutorial(true); };
    var bk = $("#tutBack"); if (bk) bk.onclick = function () { tutGo(-1); };
    $("#tutNext").onclick = function () { if (last) closeTutorial(true); else tutGo(1); };
  }
  function tutGo(dir) {
    var ni = _tutIdx + dir;
    if (ni < 0 || ni >= TUTORIAL_SLIDES.length) return;
    _tutIdx = ni; renderTutorial();
    var b = $("#tutNext"); if (b) b.focus();
  }
  function closeTutorial(markSeen) {
    $("#tutorial").classList.remove("show");
    if (_tutKey) { document.removeEventListener("keydown", _tutKey, true); _tutKey = null; }
    if (markSeen && !S.tutorialSeen) { S.tutorialSeen = true; save(); }
  }

  /* ============================================================
     sheets / confirm / toast
     ============================================================ */
  var _sheetKeyHandler = null, _sheetPrevFocus = null;
  function focusablesIn(root) {
    return $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', root)
      .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }
  function openSheet(html) {
    var sheet = $("#sheet"), wasUp = sheet.classList.contains("up");
    if (!wasUp) _sheetPrevFocus = document.activeElement;
    sheet.innerHTML = html;
    sheet.setAttribute("tabindex", "-1");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    $("#scrim").classList.add("show");
    sheet.classList.add("up");
    $("#scrim").onclick = closeSheet;
    setTimeout(function () { var f = focusablesIn(sheet); (f[0] || sheet).focus(); }, 50);
    if (!wasUp) {
      _sheetKeyHandler = function (e) {
        if (e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
        if (e.key !== "Tab") return;
        var f = focusablesIn(sheet); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      };
      document.addEventListener("keydown", _sheetKeyHandler, true);
    }
  }
  function closeSheet() {
    $("#scrim").classList.remove("show");
    $("#sheet").classList.remove("up");
    if (_sheetKeyHandler) { document.removeEventListener("keydown", _sheetKeyHandler, true); _sheetKeyHandler = null; }
    if (_sheetPrevFocus && _sheetPrevFocus.focus) { try { _sheetPrevFocus.focus(); } catch (e) {} }
    _sheetPrevFocus = null;
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
    var txt = "I'm on Barpath 💪 Level " + li.lv + " " + li.title + ", " + S.history.length + " workouts, " + S.streak + "-day streak. Attack the Bar. Own the Path.";
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
    var cols = ["#2f7bff", "#19c3ff", "#a855f7", "#2ec28a", "#ffb020"];
    for (var i = 0; i < 48; i++) {
      parts.push({ x: innerWidth / 2, y: innerHeight * 0.40, vx: (Math.random() - 0.5) * 9, vy: Math.random() * -10 - 2,
        g: 0.30 + Math.random() * 0.18, s: 5 + Math.random() * 5, c: cols[i % cols.length], rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, life: 60 + Math.random() * 26 });
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
  var _timerKey = null;
  function openTimer() {
    timer.open = true; $("#timerPanel").classList.add("up"); paintTimer();
    setTimeout(function () { var s = $("#tStart"); if (s) s.focus(); }, 50);
    if (!_timerKey) { _timerKey = function (e) { if (e.key === "Escape") { e.preventDefault(); closeTimer(); } }; document.addEventListener("keydown", _timerKey, true); }
  }
  function closeTimer() {
    timer.open = false; $("#timerPanel").classList.remove("up"); pauseTick();
    if (_timerKey) { document.removeEventListener("keydown", _timerKey, true); _timerKey = null; }
  }
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
